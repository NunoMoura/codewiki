import {createHash, randomBytes, randomUUID, timingSafeEqual} from "node:crypto";
import {CLIENT_KINDS, type ClientKind} from "../../protocol/client-project-server.ts";
import {assertSha256Digest, type Sha256Digest} from "../../utils/canonical-json.ts";
import {
	PROJECT_SERVER_SESSION_PROTOCOL,
	type OpenedProjectServerSession,
	type ProjectServerEndpointAuthorization,
	type ProjectServerEndpointAuthorizationAdapter,
	type ProjectServerEndpointAuthorizationContext,
	type ProjectServerEndpointRequest,
	type ProjectServerSessionBinding,
	type ProjectServerSessionRecord,
} from "./contracts.ts";

export function openProjectServerSession(input: {
	readonly binding: ProjectServerSessionBinding;
	readonly lifetimeSeconds: number;
	readonly now?: Date;
}): OpenedProjectServerSession {
	exactObject(input, ["binding", "lifetimeSeconds", "now"], "Open Server session input");
	const binding = normalizeBinding(input.binding);
	const lifetimeSeconds = integer(
		input.lifetimeSeconds,
		"session lifetimeSeconds",
		60,
		86_400,
	);
	const now = sessionTime(input.now);
	const issuedAt = now.toISOString();
	const credential = `cws_${randomBytes(32).toString("base64url")}`;
	return Object.freeze({
		credential,
		session: normalizeProjectServerSessionRecord({
			protocolId: PROJECT_SERVER_SESSION_PROTOCOL.id,
			protocolVersion: PROJECT_SERVER_SESSION_PROTOCOL.version,
			sessionId: `session:${randomUUID()}`,
			generation: 1,
			credentialDigest: credentialDigest(credential),
			status: "active",
			issuedAt,
			updatedAt: issuedAt,
			expiresAt: new Date(now.getTime() + lifetimeSeconds * 1_000).toISOString(),
			...binding,
		}),
	});
}

export function rotateProjectServerSession(input: {
	readonly session: ProjectServerSessionRecord;
	readonly credential: string;
	readonly expectedSessionGeneration: number;
	readonly now?: Date;
}): OpenedProjectServerSession {
	exactObject(input, ["session", "credential", "expectedSessionGeneration", "now"], "Rotate Server session input");
	const session = authenticatedSession(input, true);
	const now = advancingTime(input.now, session.updatedAt, "rotation");
	const credential = `cws_${randomBytes(32).toString("base64url")}`;
	return Object.freeze({
		credential,
		session: normalizeProjectServerSessionRecord({
			...session,
			generation: session.generation + 1,
			credentialDigest: credentialDigest(credential),
			updatedAt: now.toISOString(),
		}),
	});
}

export function revokeProjectServerSession(input: {
	readonly session: ProjectServerSessionRecord;
	readonly credential: string;
	readonly expectedSessionGeneration: number;
	readonly now?: Date;
}): ProjectServerSessionRecord {
	exactObject(input, ["session", "credential", "expectedSessionGeneration", "now"], "Revoke Server session input");
	const session = authenticatedSession(input, false);
	const now = advancingTime(input.now, session.updatedAt, "revocation");
	return normalizeProjectServerSessionRecord({
		...session,
		generation: session.generation + 1,
		status: "revoked",
		updatedAt: now.toISOString(),
	});
}

export async function authorizeProjectServerEndpoint(input: {
	readonly session: ProjectServerSessionRecord;
	readonly credential: string;
	readonly expectedSessionGeneration: number;
	readonly endpoint: ProjectServerEndpointRequest;
	readonly adapter: ProjectServerEndpointAuthorizationAdapter;
	readonly now?: Date;
}): Promise<ProjectServerEndpointAuthorization> {
	exactObject(input, ["session", "credential", "expectedSessionGeneration", "endpoint", "adapter", "now"], "Server endpoint authorization input");
	const session = authenticatedSession(input, true);
	const endpoint = normalizeEndpoint(input.endpoint);
	if (session.project.repositoryIdentity !== endpoint.repositoryIdentity) {
		throw new Error("Server session repository binding does not match endpoint.");
	}
	if (!input.adapter || typeof input.adapter.authorize !== "function") {
		throw new Error("Server endpoint authorization adapter is invalid.");
	}
	const adapterId = text(input.adapter.adapterId, "endpoint authorization adapter id");
	const context: ProjectServerEndpointAuthorizationContext = Object.freeze({
		sessionId: session.sessionId,
		sessionGeneration: session.generation,
		actor: session.actor,
		client: session.client,
		project: session.project,
		endpoint,
	});
	let authorized = false;
	try {
		authorized = (await input.adapter.authorize(context)) === true;
	} catch {
		throw new Error("Server endpoint authorization denied.");
	}
	if (!authorized) {
		throw new Error("Server endpoint authorization denied.");
	}
	return Object.freeze({
		...context,
		authorizationAdapterId: adapterId,
		requestContext: Object.freeze({
			actor: session.actor,
			client: session.client,
		}),
	});
}

export function normalizeProjectServerSessionRecord(value: unknown): ProjectServerSessionRecord {
	const input = exactObject(value, [
		"protocolId", "protocolVersion", "sessionId", "generation",
		"credentialDigest", "status", "issuedAt", "updatedAt", "expiresAt",
		"actor", "client", "project",
	], "Server session record");
	if (
		input.protocolId !== PROJECT_SERVER_SESSION_PROTOCOL.id ||
		input.protocolVersion !== PROJECT_SERVER_SESSION_PROTOCOL.version
	) {
		throw new Error("Server session protocol binding is invalid.");
	}
	const binding = normalizeBinding({
		actor: input.actor,
		client: input.client,
		project: input.project,
	});
	const issuedAt = timestamp(input.issuedAt, "session.issuedAt");
	const updatedAt = timestamp(input.updatedAt, "session.updatedAt");
	const expiresAt = timestamp(input.expiresAt, "session.expiresAt");
	const status = choice(input.status, "session.status", ["active", "revoked"] as const);
	if (Date.parse(updatedAt) < Date.parse(issuedAt)) {
		throw new Error("Server session updatedAt cannot predate issuedAt.");
	}
	if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
		throw new Error("Server session expiresAt must follow issuedAt.");
	}
	if (status === "active" && Date.parse(updatedAt) >= Date.parse(expiresAt)) {
		throw new Error("Active Server session update must predate expiry.");
	}
	return Object.freeze({
		protocolId: PROJECT_SERVER_SESSION_PROTOCOL.id,
		protocolVersion: PROJECT_SERVER_SESSION_PROTOCOL.version,
		sessionId: text(input.sessionId, "session.sessionId"),
		generation: integer(input.generation, "session.generation", 1),
		credentialDigest: assertSha256Digest(input.credentialDigest, "session.credentialDigest"),
		status,
		issuedAt,
		updatedAt,
		expiresAt,
		...binding,
	});
}

function authenticatedSession(
	input: {
		readonly session: ProjectServerSessionRecord;
		readonly credential: string;
		readonly expectedSessionGeneration: number;
		readonly now?: Date;
	},
	requireUnexpired: boolean,
): ProjectServerSessionRecord {
	const session = normalizeProjectServerSessionRecord(input.session);
	const expected = integer(
		input.expectedSessionGeneration,
		"expectedSessionGeneration",
		1,
	);
	if (session.generation !== expected) {
		throw new Error("Server session generation is stale.");
	}
	if (session.status !== "active") {
		throw new Error("Server session is not active.");
	}
	const now = sessionTime(input.now);
	if (now.getTime() < Date.parse(session.updatedAt)) {
		throw new Error("Server session time predates current state.");
	}
	if (requireUnexpired && now.getTime() >= Date.parse(session.expiresAt)) {
		throw new Error("Server session has expired.");
	}
	const supplied = credentialDigest(text(input.credential, "session credential", 256));
	if (!sameDigest(session.credentialDigest, supplied)) {
		throw new Error("Server session credential is invalid.");
	}
	return session;
}

function normalizeBinding(value: unknown): ProjectServerSessionBinding {
	const input = exactObject(value, ["actor", "client", "project"], "Server session binding");
	const actor = exactObject(input.actor, ["actorId", "authenticatedIdentityRef"], "session actor");
	const client = exactObject(input.client, ["clientKind", "clientInstanceId", "authenticationRef"], "session client");
	const project = exactObject(input.project, ["projectId", "repositoryIdentity", "projectServerRouteRef"], "session project");
	return Object.freeze({
		actor: Object.freeze({
			actorId: text(actor.actorId, "session.actor.actorId"),
			authenticatedIdentityRef: text(actor.authenticatedIdentityRef, "session.actor.authenticatedIdentityRef", 4_096),
		}),
		client: Object.freeze({
			clientKind: clientKind(client.clientKind),
			clientInstanceId: text(client.clientInstanceId, "session.client.clientInstanceId"),
			authenticationRef: text(client.authenticationRef, "session.client.authenticationRef", 4_096),
		}),
		project: Object.freeze({
			projectId: text(project.projectId, "session.project.projectId"),
			repositoryIdentity: assertSha256Digest(project.repositoryIdentity, "session.project.repositoryIdentity"),
			projectServerRouteRef: text(project.projectServerRouteRef, "session.project.projectServerRouteRef", 4_096),
		}),
	});
}

function normalizeEndpoint(value: unknown): ProjectServerEndpointRequest {
	const input = exactObject(value, ["endpointId", "method", "repositoryIdentity"], "Server endpoint request");
	const endpointId = text(input.endpointId, "endpoint.endpointId", 128);
	if (!/^[a-z][a-z0-9_.:-]*$/.test(endpointId)) {
		throw new Error("endpoint.endpointId is invalid.");
	}
	return Object.freeze({
		endpointId,
		method: choice(input.method, "endpoint.method", ["GET", "POST", "PUT", "PATCH", "DELETE"] as const),
		repositoryIdentity: assertSha256Digest(input.repositoryIdentity, "endpoint.repositoryIdentity"),
	});
}

function credentialDigest(credential: string): Sha256Digest {
	return `sha256:${createHash("sha256").update(credential, "utf8").digest("hex")}`;
}
function sameDigest(left: Sha256Digest, right: Sha256Digest): boolean {
	return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function advancingTime(value: Date | undefined, previous: string, action: string): Date {
	const now = sessionTime(value);
	if (now.getTime() <= Date.parse(previous)) {
		throw new Error(`Server session ${action} time must advance updatedAt.`);
	}
	return now;
}

function sessionTime(value = new Date()): Date {
	if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
		throw new Error("Server session time is invalid.");
	}
	return value;
}

function exactObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
		throw new Error(`${label} must be a plain object.`);
	}
	if (Object.getOwnPropertySymbols(value).length > 0) {
		throw new Error(`${label} cannot contain symbol fields.`);
	}
	const input = value as Record<string, unknown>;
	for (const key of Object.getOwnPropertyNames(input)) {
		if (!fields.includes(key)) throw new Error(`${label} received unsupported field ${key}.`);
		const descriptor = Object.getOwnPropertyDescriptor(input, key);
		if (!descriptor?.enumerable || !("value" in descriptor)) {
			throw new Error(`${label}.${key} must be an enumerable data field.`);
		}
	}
	return input;
}

function text(value: unknown, field: string, maximum = 512): string {
	if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.length > maximum) {
		throw new Error(`${field} must be bounded non-empty text.`);
	}
	return value;
}

function timestamp(value: unknown, field: string): string {
	const normalized = text(value, field, 64);
	const date = new Date(normalized);
	if (!Number.isFinite(date.getTime()) || date.toISOString() !== normalized) {
		throw new Error(`${field} must be an exact ISO timestamp.`);
	}
	return normalized;
}

function integer(value: unknown, field: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
	if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
		throw new Error(`${field} must be a safe integer from ${minimum} through ${maximum}.`);
	}
	return value as number;
}

function choice<const T extends readonly string[]>(value: unknown, field: string, choices: T): T[number] {
	if (typeof value !== "string" || !choices.includes(value)) throw new Error(`${field} is unsupported.`);
	return value as T[number];
}
function clientKind(value: unknown): ClientKind {
	return choice(value, "session.client.clientKind", CLIENT_KINDS);
}
