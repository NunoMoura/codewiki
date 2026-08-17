import {
	normalizeClientPairingIssueCommand,
	normalizeClientPairingRevokeCommand,
	type ClientPairingIssueCommand,
	type ClientPairingRevokeCommand,
} from "../../protocol/client-pairing.ts";
import {
	normalizeProjectServerAuthenticationAssertion,
	type ProjectServerAuthenticationAssertion,
} from "../authentication/proof.ts";
import {
	normalizeProjectServerRegistrySnapshot,
	type ClientPairingRecord,
	type ProjectServerRegistrySnapshot,
} from "../registry/state.ts";

export function issueClientPairing(input: {
	readonly registry: ProjectServerRegistrySnapshot;
	readonly command: ClientPairingIssueCommand;
	readonly authentication: ProjectServerAuthenticationAssertion;
	readonly now?: Date;
}): ProjectServerRegistrySnapshot {
	const registry = normalizeProjectServerRegistrySnapshot(input.registry);
	const command = normalizeClientPairingIssueCommand(input.command);
	const occurredAt = projectServerTimestamp(input.now);
	assertExpectedGeneration(registry, command.expectedRegistryGeneration);
	assertOccurrenceAdvancesRegistry(registry, occurredAt);
	const authentication = normalizeProjectServerAuthenticationAssertion(input.authentication);
	if (
		authentication.clientKind !== command.clientKind ||
		authentication.clientInstanceId !== command.clientInstanceId
	) {
		throw new Error("Client pairing authentication does not match requested Client.");
	}
	const actor = activeMappedActor(registry, authentication);
	if (registry.pairings.some((record) => record.pairingId === command.pairingId)) {
		throw new Error("Client pairing id already exists.");
	}
	if (
		registry.pairings.some(
			(record) => record.authenticationRef === authentication.authenticationRef,
		)
	) {
		throw new Error("Client pairing authentication reference already exists.");
	}
	if (
		registry.pairings.some(
			(record) =>
				record.status === "active" &&
				record.clientKind === command.clientKind &&
				record.clientInstanceId === command.clientInstanceId,
		)
	) {
		throw new Error("Client instance already has an active pairing.");
	}
	const expiresAt = command.expiresInSeconds === undefined
		? undefined
		: new Date(Date.parse(occurredAt) + command.expiresInSeconds * 1_000).toISOString();
	const pairing: ClientPairingRecord = Object.freeze({
		pairingId: command.pairingId,
		clientKind: command.clientKind,
		clientInstanceId: command.clientInstanceId,
		authenticationRef: authentication.authenticationRef,
		authenticatedIdentityRef: authentication.authenticatedIdentityRef,
		actorId: actor.actorId,
		status: "active",
		pairedAt: occurredAt,
		updatedAt: occurredAt,
		...(expiresAt === undefined ? {} : {expiresAt}),
	});
	return normalizeProjectServerRegistrySnapshot({
		...registry,
		generation: registry.generation + 1,
		generatedAt: occurredAt,
		pairings: [...registry.pairings, pairing],
	});
}

export function revokeClientPairing(input: {
	readonly registry: ProjectServerRegistrySnapshot;
	readonly command: ClientPairingRevokeCommand;
	readonly authentication: ProjectServerAuthenticationAssertion;
	readonly now?: Date;
}): ProjectServerRegistrySnapshot {
	const registry = normalizeProjectServerRegistrySnapshot(input.registry);
	const command = normalizeClientPairingRevokeCommand(input.command);
	const occurredAt = projectServerTimestamp(input.now);
	assertExpectedGeneration(registry, command.expectedRegistryGeneration);
	assertOccurrenceAdvancesRegistry(registry, occurredAt);
	const authentication = normalizeProjectServerAuthenticationAssertion(input.authentication);
	const actor = activeMappedActor(registry, authentication);
	const pairing = registry.pairings.find(
		(record) => record.pairingId === command.pairingId,
	);
	if (!pairing || pairing.status !== "active") {
		throw new Error("Client pairing is not active.");
	}
	if (pairing.actorId !== actor.actorId) {
		throw new Error("Client pairing revocation actor does not own pairing.");
	}
	if (pairing.authenticationRef !== command.expectedAuthenticationRef) {
		throw new Error("Client pairing authentication reference changed.");
	}
	if (Date.parse(occurredAt) <= Date.parse(pairing.updatedAt)) {
		throw new Error("Client pairing revocation time must advance updatedAt.");
	}
	return normalizeProjectServerRegistrySnapshot({
		...registry,
		generation: registry.generation + 1,
		generatedAt: occurredAt,
		pairings: registry.pairings.map((record) =>
			record.pairingId === pairing.pairingId
				? {...record, status: "revoked", updatedAt: occurredAt}
				: record,
		),
	});
}

function activeMappedActor(
	registry: ProjectServerRegistrySnapshot,
	authentication: ProjectServerAuthenticationAssertion,
): ProjectServerRegistrySnapshot["actors"][number] {
	const actors = registry.actors.filter(
		(record) =>
			record.status === "active" &&
			record.authenticatedIdentities.some(
				(identity) =>
					identity.identityRef === authentication.authenticatedIdentityRef,
			),
	);
	if (actors.length !== 1) {
		throw new Error("Client pairing authenticated identity has no active actor mapping.");
	}
	return actors[0];
}

function assertExpectedGeneration(
	registry: ProjectServerRegistrySnapshot,
	expected: number,
): void {
	if (registry.generation !== expected) {
		throw new Error("Client pairing registry generation conflict.");
	}
}

function assertOccurrenceAdvancesRegistry(
	registry: ProjectServerRegistrySnapshot,
	occurredAt: string,
): void {
	if (Date.parse(occurredAt) <= Date.parse(registry.generatedAt)) {
		throw new Error("Client pairing command time must advance registry time.");
	}
}

function projectServerTimestamp(now = new Date()): string {
	if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
		throw new Error("Client pairing clock is invalid.");
	}
	return now.toISOString();
}
