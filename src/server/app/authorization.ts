import type {IncomingMessage, ServerResponse} from "node:http";
import {resolveLocalAppServerConnection} from "../registry/local.ts";
import type {
	ServerEndpointAuthorization,
	ServerEndpointAuthorizationAdapter,
	ServerEndpointAuthorizationContext,
	ServerEndpointRequest,
	ServerSessionBinding,
	ServerSessionRecord,
} from "../sessions/contracts.ts";
import {
	authorizeServerEndpoint,
	openServerSession,
	revokeServerSession,
} from "../sessions/state.ts";

const APP_SESSION_COOKIE = "codewiki_session";
const APP_SESSION_LIFETIME_SECONDS = 86_400;
const APP_ENDPOINTS = Object.freeze({
	"GET /api/state": "app.state.read",
	"GET /api/changes": "app.changes.read",
	"GET /api/configuration": "app.configuration.read",
	"GET /api/previews": "app.previews.read",
	"GET /api/meta": "app.meta.read",
	"GET /api/events": "app.events.subscribe",
	"POST /api/session": "app.session.establish",
	"POST /api/previews/commands": "app.previews.command",
	"POST /api/shutdown": "app.shutdown",
} as const);

export interface AppServerSessionAuthorization {
	session: ServerSessionRecord;
	readonly credential: string;
	readonly adapter: ServerEndpointAuthorizationAdapter;
}

export async function openAppServerSessionAuthorization(input: {
	readonly repoRoot: string;
	readonly binding?: ServerSessionBinding;
	readonly adapter?: ServerEndpointAuthorizationAdapter;
	readonly lifetimeSeconds?: number;
	readonly serverStateRoot?: string;
}): Promise<AppServerSessionAuthorization> {
	let binding = input.binding;
	if (!binding) {
		const connection = await resolveLocalAppServerConnection({
			repoRoot: input.repoRoot,
			serverStateRoot: input.serverStateRoot,
		});
		binding = Object.freeze({
			actor: connection.actor,
			client: connection.client,
			project: Object.freeze({
				projectId: connection.project.projectId,
				repositoryIdentity: connection.project.repositoryIdentity,
				runtimeRouteRef: connection.project.runtimeRouteRef,
			}),
		});
	}
	if (binding.client.clientKind !== "app") {
		throw new Error("CodeWiki App session requires an App Client binding.");
	}
	const opened = openServerSession({
		binding,
		lifetimeSeconds: input.lifetimeSeconds ?? APP_SESSION_LIFETIME_SECONDS,
	});
	return {
		session: opened.session,
		credential: opened.credential,
		adapter: input.adapter || appEndpointAuthorizationAdapter,
	};
}

export function appSessionLaunchUrl(
	origin: string,
	authorization: AppServerSessionAuthorization,
): string {
	return `${origin}/#session=${encodeURIComponent(appSessionBearer(authorization))}`;
}

export function appSessionBearer(
	authorization: AppServerSessionAuthorization,
): string {
	return `${authorization.session.generation}.${authorization.credential}`;
}

export function appEndpointRequest(
	method: string,
	pathname: string,
	repositoryIdentity: ServerSessionRecord["project"]["repositoryIdentity"],
): ServerEndpointRequest | undefined {
	const endpointId = APP_ENDPOINTS[`${method} ${pathname}` as keyof typeof APP_ENDPOINTS];
	if (!endpointId) return undefined;
	return Object.freeze({
		endpointId,
		method: method as ServerEndpointRequest["method"],
		repositoryIdentity,
	});
}

export async function authorizeAppServerRequest(input: {
	readonly authorization: AppServerSessionAuthorization;
	readonly endpoint: ServerEndpointRequest;
	readonly request: IncomingMessage;
}): Promise<ServerEndpointAuthorization> {
	const supplied = requestSessionBearer(input.request);
	return authorizeServerEndpoint({
		session: input.authorization.session,
		credential: supplied.credential,
		expectedSessionGeneration: supplied.generation,
		endpoint: input.endpoint,
		adapter: input.authorization.adapter,
	});
}

export function establishAppSessionCookie(
	response: ServerResponse,
	authorization: AppServerSessionAuthorization,
): void {
	response.setHeader(
		"Set-Cookie",
		`${APP_SESSION_COOKIE}=${appSessionBearer(authorization)}; HttpOnly; SameSite=Strict; Path=/; Expires=${new Date(authorization.session.expiresAt).toUTCString()}`,
	);
}

export function revokeAppServerSession(
	authorization: AppServerSessionAuthorization,
): void {
	if (authorization.session.status !== "active") return;
	authorization.session = revokeServerSession({
		session: authorization.session,
		credential: authorization.credential,
		expectedSessionGeneration: authorization.session.generation,
		now: new Date(Math.max(Date.now(), Date.parse(authorization.session.updatedAt) + 1)),
	});
}

function requestSessionBearer(
	request: IncomingMessage,
): {readonly generation: number; readonly credential: string} {
	const header = authorizationHeader(request.headers.authorization);
	const cookie = sessionCookie(request.headers.cookie);
	if (header && cookie && header !== cookie) {
		throw new Error("CodeWiki App request supplied conflicting Session credentials.");
	}
	return parseSessionBearer(header || cookie);
}

function authorizationHeader(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const match = /^Bearer ([^\s]+)$/.exec(value);
	if (!match) throw new Error("CodeWiki App bearer authorization is invalid.");
	return match[1];
}

function sessionCookie(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const matches = value
		.split(";")
		.map((entry) => entry.trim())
		.filter((entry) => entry.startsWith(`${APP_SESSION_COOKIE}=`));
	if (matches.length > 1) {
		throw new Error("CodeWiki App request supplied duplicate Session cookies.");
	}
	return matches[0]?.slice(APP_SESSION_COOKIE.length + 1);
}

function parseSessionBearer(
	value: string | undefined,
): {readonly generation: number; readonly credential: string} {
	const match = /^([1-9]\d*)\.(cws_[A-Za-z0-9_-]{43})$/.exec(value || "");
	const generation = Number(match?.[1]);
	if (!match || !Number.isSafeInteger(generation)) {
		throw new Error("CodeWiki App Session credential is invalid.");
	}
	return Object.freeze({generation, credential: match[2]});
}

const appEndpointAuthorizationAdapter: ServerEndpointAuthorizationAdapter = Object.freeze({
	adapterId: "codewiki.server-app-policy@1.0.0",
	authorize(input: ServerEndpointAuthorizationContext) {
		return (
			input.client.clientKind === "app" &&
			Object.values(APP_ENDPOINTS).includes(
				input.endpoint.endpointId as (typeof APP_ENDPOINTS)[keyof typeof APP_ENDPOINTS],
			)
		);
	},
});
