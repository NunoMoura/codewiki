import {
	normalizeClientPairingIssueCommand,
	normalizeClientPairingRevokeCommand,
	type ClientPairingIssueCommand,
	type ClientPairingRevokeCommand,
} from "../../protocol/client-pairing.ts";
import type {ClientServerTransportContext} from "../../protocol/client-server.ts";
import {
	assertVerifiedServerAuthenticationAssertion,
	normalizeServerAuthenticationAssertion,
	type ServerAuthenticationAssertion,
} from "../authentication/proof.ts";
import {
	normalizeServerRegistrySnapshot,
	type ServerActorRecord,
	type ServerRegistrySnapshot,
} from "../registry/state.ts";
import {
	authorizeServerEndpoint,
	normalizeServerSessionRecord,
} from "../sessions/state.ts";
import type {
	ServerEndpointAuthorization,
	ServerEndpointAuthorizationContext,
	ServerSessionRecord,
} from "../sessions/contracts.ts";
import {issueClientPairing, revokeClientPairing} from "./commands.ts";

export const SERVER_PAIRING_ENDPOINTS = Object.freeze({
	issue: Object.freeze({endpointId: "server.pairing.issue", method: "POST" as const}),
	revoke: Object.freeze({endpointId: "server.pairing.revoke", method: "DELETE" as const}),
});

export type ServerPairingAuthorizationCommand =
	| ClientPairingIssueCommand
	| ClientPairingRevokeCommand;

export interface ServerPairingAuthorizationContext
	extends ServerEndpointAuthorizationContext {
	readonly command: ServerPairingAuthorizationCommand;
	readonly targetClient: Pick<ClientServerTransportContext, "clientKind" | "clientInstanceId">;
}

export interface ServerPairingAuthorizationAdapter {
	readonly adapterId: string;
	readonly authorize: (
		input: ServerPairingAuthorizationContext,
	) => boolean | Promise<boolean>;
}

export interface AuthorizedClientPairingTransition {
	readonly registry: ServerRegistrySnapshot;
	readonly authorization: ServerEndpointAuthorization;
}

export async function issueAuthorizedClientPairing(input: {
	readonly registry: ServerRegistrySnapshot;
	readonly command: ClientPairingIssueCommand;
	readonly authentication: ServerAuthenticationAssertion;
	readonly session: ServerSessionRecord;
	readonly sessionCredential: string;
	readonly expectedSessionGeneration: number;
	readonly authorization: ServerPairingAuthorizationAdapter;
	readonly now?: Date;
}): Promise<AuthorizedClientPairingTransition> {
	exactInput(input);
	const registry = normalizeServerRegistrySnapshot(input.registry);
	const command = normalizeClientPairingIssueCommand(input.command);
	const authentication = normalizeServerAuthenticationAssertion(input.authentication);
	assertVerifiedServerAuthenticationAssertion(input.authentication);
	const now = new Date(input.now?.getTime() ?? Date.now());
	const transition = () => issueClientPairing({registry, command, authentication, now});
	const authorization = await authorizePairingEndpoint({
		registry,
		command,
		authentication,
		session: input.session,
		sessionCredential: input.sessionCredential,
		expectedSessionGeneration: input.expectedSessionGeneration,
		authorization: input.authorization,
		preflight: () => {
			transition();
			return Object.freeze({
				clientKind: command.clientKind,
				clientInstanceId: command.clientInstanceId,
			});
		},
		endpoint: SERVER_PAIRING_ENDPOINTS.issue,
		now,
	});
	return Object.freeze({registry: transition(), authorization});
}

export async function revokeAuthorizedClientPairing(input: {
	readonly registry: ServerRegistrySnapshot;
	readonly command: ClientPairingRevokeCommand;
	readonly authentication: ServerAuthenticationAssertion;
	readonly session: ServerSessionRecord;
	readonly sessionCredential: string;
	readonly expectedSessionGeneration: number;
	readonly authorization: ServerPairingAuthorizationAdapter;
	readonly now?: Date;
}): Promise<AuthorizedClientPairingTransition> {
	exactInput(input);
	const registry = normalizeServerRegistrySnapshot(input.registry);
	const command = normalizeClientPairingRevokeCommand(input.command);
	const authentication = normalizeServerAuthenticationAssertion(input.authentication);
	assertVerifiedServerAuthenticationAssertion(input.authentication);
	const now = new Date(input.now?.getTime() ?? Date.now());
	const transition = () => revokeClientPairing({registry, command, authentication, now});
	const authorization = await authorizePairingEndpoint({
		registry,
		command,
		authentication,
		session: input.session,
		sessionCredential: input.sessionCredential,
		expectedSessionGeneration: input.expectedSessionGeneration,
		authorization: input.authorization,
		preflight: () => {
			transition();
			const pairing = registry.pairings.find((record) => record.pairingId === command.pairingId);
			if (pairing === undefined) throw new Error("Client pairing is not active.");
			return Object.freeze({
				clientKind: pairing.clientKind,
				clientInstanceId: pairing.clientInstanceId,
			});
		},
		endpoint: SERVER_PAIRING_ENDPOINTS.revoke,
		now,
	});
	return Object.freeze({registry: transition(), authorization});
}

async function authorizePairingEndpoint(input: {
	readonly registry: ServerRegistrySnapshot;
	readonly command: ServerPairingAuthorizationCommand;
	readonly authentication: ServerAuthenticationAssertion;
	readonly session: ServerSessionRecord;
	readonly sessionCredential: string;
	readonly expectedSessionGeneration: number;
	readonly authorization: ServerPairingAuthorizationAdapter;
	readonly preflight: () => ServerPairingAuthorizationContext["targetClient"];
	readonly endpoint: typeof SERVER_PAIRING_ENDPOINTS.issue | typeof SERVER_PAIRING_ENDPOINTS.revoke;
	readonly now?: Date;
}): Promise<ServerEndpointAuthorization> {
	const session = normalizeServerSessionRecord(input.session);
	if (!input.authorization || typeof input.authorization.authorize !== "function") {
		throw new Error("Server pairing authorization adapter is invalid.");
	}
	return authorizeServerEndpoint({
		session,
		credential: input.sessionCredential,
		expectedSessionGeneration: input.expectedSessionGeneration,
		endpoint: {
			...input.endpoint,
			repositoryIdentity: session.project.repositoryIdentity,
		},
		adapter: {
			adapterId: input.authorization.adapterId,
			authorize: (context) => {
				if (input.registry.generation !== input.command.expectedRegistryGeneration) {
					return false;
				}
				const project = input.registry.projects.find(
					(record) => record.projectId === context.project.projectId,
				);
				if (
					!project ||
					project.status !== "active" ||
					project.repositoryIdentity !== context.project.repositoryIdentity ||
					project.runtimeRouteRef !== context.project.runtimeRouteRef
				) {
					return false;
				}
				const sessionActor = activeIdentityActor(
					input.registry,
					context.actor.actorId,
					context.actor.authenticatedIdentityRef,
					"Session",
				);
				const transitionActor = activeIdentityActor(
					input.registry,
					undefined,
					input.authentication.authenticatedIdentityRef,
					"transition Authentication",
				);
				if (sessionActor.actorId !== transitionActor.actorId) return false;
				const targetClient = input.preflight();
				return input.authorization.authorize(Object.freeze({
					...context,
					command: input.command,
					targetClient,
				}));
			},
		},
		now: input.now,
	});
}

function activeIdentityActor(
	registry: ServerRegistrySnapshot,
	expectedActorId: string | undefined,
	identityRef: string,
	label: string,
): ServerActorRecord {
	const matches = registry.actors.filter((actor) =>
		actor.authenticatedIdentities.some((identity) => identity.identityRef === identityRef),
	);
	if (matches.length !== 1) {
		throw new Error(`Client pairing ${label} identity mapping is not unique.`);
	}
	const actor = matches[0];
	if (
		actor.status !== "active" ||
		(expectedActorId !== undefined && actor.actorId !== expectedActorId)
	) {
		throw new Error(`Client pairing ${label} actor is not active.`);
	}
	return actor;
}

function exactInput(value: unknown): void {
	const allowed = [
		"registry",
		"command",
		"authentication",
		"session",
		"sessionCredential",
		"expectedSessionGeneration",
		"authorization",
		"now",
	];
	if (
		typeof value !== "object" ||
		value === null ||
		Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Object.prototype
	) {
		throw new Error("Authorized Client pairing input must be a plain object.");
	}
	if (Object.getOwnPropertySymbols(value).length > 0) {
		throw new Error("Authorized Client pairing input cannot contain symbol fields.");
	}
	for (const key of Object.getOwnPropertyNames(value)) {
		if (!allowed.includes(key)) {
			throw new Error(`Authorized Client pairing input received unsupported field ${key}.`);
		}
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor?.enumerable || !("value" in descriptor)) {
			throw new Error(`Authorized Client pairing input field ${key} must be enumerable data.`);
		}
	}
}
