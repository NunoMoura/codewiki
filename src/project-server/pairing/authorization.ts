import {
	normalizeClientPairingIssueCommand,
	normalizeClientPairingRevokeCommand,
	type ClientPairingIssueCommand,
	type ClientPairingRevokeCommand,
} from "../../protocol/client-pairing.ts";
import type {ClientProjectServerTransportContext} from "../../protocol/client-project-server.ts";
import {
	assertVerifiedProjectServerAuthenticationAssertion,
	normalizeProjectServerAuthenticationAssertion,
	type ProjectServerAuthenticationAssertion,
} from "../authentication/proof.ts";
import {
	normalizeProjectServerRegistrySnapshot,
	type ProjectServerActorRecord,
	type ProjectServerRegistrySnapshot,
} from "../registry/state.ts";
import {
	authorizeProjectServerEndpoint,
	normalizeProjectServerSessionRecord,
} from "../sessions/state.ts";
import type {
	ProjectServerEndpointAuthorization,
	ProjectServerEndpointAuthorizationContext,
	ProjectServerSessionRecord,
} from "../sessions/contracts.ts";
import {issueClientPairing, revokeClientPairing} from "./commands.ts";

export const PROJECT_SERVER_PAIRING_ENDPOINTS = Object.freeze({
	issue: Object.freeze({endpointId: "server.pairing.issue", method: "POST" as const}),
	revoke: Object.freeze({endpointId: "server.pairing.revoke", method: "DELETE" as const}),
});

export type ProjectServerPairingAuthorizationCommand =
	| ClientPairingIssueCommand
	| ClientPairingRevokeCommand;

export interface ProjectServerPairingAuthorizationContext
	extends ProjectServerEndpointAuthorizationContext {
	readonly command: ProjectServerPairingAuthorizationCommand;
	readonly targetClient: Pick<ClientProjectServerTransportContext, "clientKind" | "clientInstanceId">;
}

export interface ProjectServerPairingAuthorizationAdapter {
	readonly adapterId: string;
	readonly authorize: (
		input: ProjectServerPairingAuthorizationContext,
	) => boolean | Promise<boolean>;
}

export interface AuthorizedClientPairingTransition {
	readonly registry: ProjectServerRegistrySnapshot;
	readonly authorization: ProjectServerEndpointAuthorization;
}

export async function issueAuthorizedClientPairing(input: {
	readonly registry: ProjectServerRegistrySnapshot;
	readonly command: ClientPairingIssueCommand;
	readonly authentication: ProjectServerAuthenticationAssertion;
	readonly session: ProjectServerSessionRecord;
	readonly sessionCredential: string;
	readonly expectedSessionGeneration: number;
	readonly authorization: ProjectServerPairingAuthorizationAdapter;
	readonly now?: Date;
}): Promise<AuthorizedClientPairingTransition> {
	exactInput(input);
	const registry = normalizeProjectServerRegistrySnapshot(input.registry);
	const command = normalizeClientPairingIssueCommand(input.command);
	const authentication = normalizeProjectServerAuthenticationAssertion(input.authentication);
	assertVerifiedProjectServerAuthenticationAssertion(input.authentication);
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
		endpoint: PROJECT_SERVER_PAIRING_ENDPOINTS.issue,
		now,
	});
	return Object.freeze({registry: transition(), authorization});
}

export async function revokeAuthorizedClientPairing(input: {
	readonly registry: ProjectServerRegistrySnapshot;
	readonly command: ClientPairingRevokeCommand;
	readonly authentication: ProjectServerAuthenticationAssertion;
	readonly session: ProjectServerSessionRecord;
	readonly sessionCredential: string;
	readonly expectedSessionGeneration: number;
	readonly authorization: ProjectServerPairingAuthorizationAdapter;
	readonly now?: Date;
}): Promise<AuthorizedClientPairingTransition> {
	exactInput(input);
	const registry = normalizeProjectServerRegistrySnapshot(input.registry);
	const command = normalizeClientPairingRevokeCommand(input.command);
	const authentication = normalizeProjectServerAuthenticationAssertion(input.authentication);
	assertVerifiedProjectServerAuthenticationAssertion(input.authentication);
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
		endpoint: PROJECT_SERVER_PAIRING_ENDPOINTS.revoke,
		now,
	});
	return Object.freeze({registry: transition(), authorization});
}

async function authorizePairingEndpoint(input: {
	readonly registry: ProjectServerRegistrySnapshot;
	readonly command: ProjectServerPairingAuthorizationCommand;
	readonly authentication: ProjectServerAuthenticationAssertion;
	readonly session: ProjectServerSessionRecord;
	readonly sessionCredential: string;
	readonly expectedSessionGeneration: number;
	readonly authorization: ProjectServerPairingAuthorizationAdapter;
	readonly preflight: () => ProjectServerPairingAuthorizationContext["targetClient"];
	readonly endpoint: typeof PROJECT_SERVER_PAIRING_ENDPOINTS.issue | typeof PROJECT_SERVER_PAIRING_ENDPOINTS.revoke;
	readonly now?: Date;
}): Promise<ProjectServerEndpointAuthorization> {
	const session = normalizeProjectServerSessionRecord(input.session);
	if (!input.authorization || typeof input.authorization.authorize !== "function") {
		throw new Error("Server pairing authorization adapter is invalid.");
	}
	return authorizeProjectServerEndpoint({
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
					project.projectServerRouteRef !== context.project.projectServerRouteRef
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
	registry: ProjectServerRegistrySnapshot,
	expectedActorId: string | undefined,
	identityRef: string,
	label: string,
): ProjectServerActorRecord {
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
