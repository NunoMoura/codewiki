import {
	normalizeClientPairingIssueCommand,
	normalizeClientPairingRevokeCommand,
	type ClientPairingIssueCommand,
	type ClientPairingRevokeCommand,
} from "../../protocol/client-pairing.ts";
import {
	CLIENT_KINDS,
	type ClientKind,
} from "../../protocol/client-server.ts";
import {
	normalizeServerAuthenticationAssertion,
	normalizeServerRegistrySnapshot,
	type ServerAuthenticationAssertion,
	type ClientPairingRecord,
	type ServerRegistrySnapshot,
} from "../registry/state.ts";

export interface ServerAuthenticationProof {
	readonly clientKind: ClientKind;
	readonly clientInstanceId: string;
	readonly proof: unknown;
}

export interface ServerAuthenticationAdapter {
	readonly adapterId: string;
	verify(input: ServerAuthenticationProof): Promise<ServerAuthenticationAssertion>;
}

export async function verifyServerAuthentication(input: {
	readonly adapter: ServerAuthenticationAdapter;
	readonly request: ServerAuthenticationProof;
}): Promise<ServerAuthenticationAssertion> {
	if (!input.adapter || typeof input.adapter.verify !== "function") {
		throw new Error("Server authentication adapter is invalid.");
	}
	boundedText(input.adapter.adapterId, "authentication adapter id");
	const request = normalizeProofRequest(input.request);
	let asserted: unknown;
	try {
		asserted = await input.adapter.verify(request);
	} catch {
		throw new Error("Server authentication adapter rejected proof.");
	}
	const assertion = normalizeServerAuthenticationAssertion(asserted);
	if (
		assertion.clientKind !== request.clientKind ||
		assertion.clientInstanceId !== request.clientInstanceId
	) {
		throw new Error("Server authentication assertion does not match proof request.");
	}
	return assertion;
}

export function issueClientPairing(input: {
	readonly registry: ServerRegistrySnapshot;
	readonly command: ClientPairingIssueCommand;
	readonly authentication: ServerAuthenticationAssertion;
	readonly now?: Date;
}): ServerRegistrySnapshot {
	const registry = normalizeServerRegistrySnapshot(input.registry);
	const command = normalizeClientPairingIssueCommand(input.command);
	const occurredAt = serverTimestamp(input.now);
	assertExpectedGeneration(registry, command.expectedRegistryGeneration);
	assertOccurrenceAdvancesRegistry(registry, occurredAt);
	const authentication = normalizeServerAuthenticationAssertion(input.authentication);
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
	return normalizeServerRegistrySnapshot({
		...registry,
		generation: registry.generation + 1,
		generatedAt: occurredAt,
		pairings: [...registry.pairings, pairing],
	});
}

export function revokeClientPairing(input: {
	readonly registry: ServerRegistrySnapshot;
	readonly command: ClientPairingRevokeCommand;
	readonly authentication: ServerAuthenticationAssertion;
	readonly now?: Date;
}): ServerRegistrySnapshot {
	const registry = normalizeServerRegistrySnapshot(input.registry);
	const command = normalizeClientPairingRevokeCommand(input.command);
	const occurredAt = serverTimestamp(input.now);
	assertExpectedGeneration(registry, command.expectedRegistryGeneration);
	assertOccurrenceAdvancesRegistry(registry, occurredAt);
	const authentication = normalizeServerAuthenticationAssertion(input.authentication);
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
	return normalizeServerRegistrySnapshot({
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
	registry: ServerRegistrySnapshot,
	authentication: ServerAuthenticationAssertion,
): ServerRegistrySnapshot["actors"][number] {
	const actors = registry.actors.filter(
		(record) =>
			record.status === "active" &&
			record.authenticatedIdentityRefs.includes(
				authentication.authenticatedIdentityRef,
			),
	);
	if (actors.length !== 1) {
		throw new Error("Client pairing authenticated identity has no active actor mapping.");
	}
	return actors[0];
}

function normalizeProofRequest(value: unknown): ServerAuthenticationProof {
	const input = exactObject(
		value,
		["clientKind", "clientInstanceId", "proof"],
		"Server authentication proof request",
	);
	if (!Object.hasOwn(input, "proof") || input.proof === undefined) {
		throw new Error("Server authentication proof is required.");
	}
	return Object.freeze({
		clientKind: clientKind(input.clientKind, "proof clientKind"),
		clientInstanceId: boundedText(input.clientInstanceId, "proof clientInstanceId"),
		proof: input.proof,
	});
}

function assertExpectedGeneration(
	registry: ServerRegistrySnapshot,
	expected: number,
): void {
	if (registry.generation !== expected) {
		throw new Error("Client pairing registry generation conflict.");
	}
}

function assertOccurrenceAdvancesRegistry(
	registry: ServerRegistrySnapshot,
	occurredAt: string,
): void {
	if (Date.parse(occurredAt) <= Date.parse(registry.generatedAt)) {
		throw new Error("Client pairing command time must advance registry time.");
	}
}

function exactObject(
	value: unknown,
	fields: readonly string[],
	label: string,
): Record<string, unknown> {
	if (
		typeof value !== "object" ||
		value === null ||
		Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Object.prototype
	) {
		throw new Error(`${label} must be a plain object.`);
	}
	if (Object.getOwnPropertySymbols(value).length > 0) {
		throw new Error(`${label} cannot contain symbol fields.`);
	}
	const input = value as Record<string, unknown>;
	for (const key of Object.getOwnPropertyNames(input)) {
		if (!fields.includes(key)) {
			throw new Error(`${label} received unsupported field ${key}.`);
		}
		const descriptor = Object.getOwnPropertyDescriptor(input, key);
		if (!descriptor?.enumerable || !("value" in descriptor)) {
			throw new Error(`${label}.${key} must be an enumerable data field.`);
		}
	}
	return input;
}

function boundedText(value: unknown, field: string, maximum = 512): string {
	if (
		typeof value !== "string" ||
		value.trim() !== value ||
		value.length === 0 ||
		value.length > maximum
	) {
		throw new Error(`${field} must be bounded non-empty text.`);
	}
	return value;
}

function serverTimestamp(now = new Date()): string {
	if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
		throw new Error("Client pairing clock is invalid.");
	}
	return now.toISOString();
}

function clientKind(value: unknown, field: string): ClientKind {
	if (
		typeof value !== "string" ||
		!(CLIENT_KINDS as readonly string[]).includes(value)
	) {
		throw new Error(`${field} is unsupported.`);
	}
	return value as ClientKind;
}
