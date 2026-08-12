import {
	HOST_CLIENT_KINDS,
	type HostClientKind,
} from "../../api/protocol.ts";
import {
	normalizeHostAuthenticationAssertion,
	normalizeHostRegistrySnapshot,
	type HostAuthenticationAssertion,
	type HostClientPairingRecord,
	type HostRegistrySnapshot,
} from "../registry/state.ts";

export const HOST_PAIRING_PROTOCOL = Object.freeze({
	id: "codewiki.host-pairing",
	version: "1.0.0",
} as const);

export interface HostAuthenticationProof {
	readonly clientKind: HostClientKind;
	readonly clientInstanceId: string;
	readonly proof: unknown;
}

export interface HostAuthenticationAdapter {
	readonly adapterId: string;
	verify(input: HostAuthenticationProof): Promise<HostAuthenticationAssertion>;
}

export interface HostPairingIssueCommand {
	readonly protocolId: typeof HOST_PAIRING_PROTOCOL.id;
	readonly protocolVersion: typeof HOST_PAIRING_PROTOCOL.version;
	readonly kind: "issue";
	readonly expectedRegistryGeneration: number;
	readonly pairingId: string;
	readonly clientKind: HostClientKind;
	readonly clientInstanceId: string;
	readonly expiresInSeconds?: number;
}

export interface HostPairingRevokeCommand {
	readonly protocolId: typeof HOST_PAIRING_PROTOCOL.id;
	readonly protocolVersion: typeof HOST_PAIRING_PROTOCOL.version;
	readonly kind: "revoke";
	readonly expectedRegistryGeneration: number;
	readonly pairingId: string;
	readonly expectedAuthenticationRef: string;
}

export async function verifyHostAuthentication(input: {
	readonly adapter: HostAuthenticationAdapter;
	readonly request: HostAuthenticationProof;
}): Promise<HostAuthenticationAssertion> {
	if (!input.adapter || typeof input.adapter.verify !== "function") {
		throw new Error("Host authentication adapter is invalid.");
	}
	boundedText(input.adapter.adapterId, "authentication adapter id");
	const request = normalizeProofRequest(input.request);
	let asserted: unknown;
	try {
		asserted = await input.adapter.verify(request);
	} catch {
		throw new Error("Host authentication adapter rejected proof.");
	}
	const assertion = normalizeHostAuthenticationAssertion(asserted);
	if (
		assertion.clientKind !== request.clientKind ||
		assertion.clientInstanceId !== request.clientInstanceId
	) {
		throw new Error("Host authentication assertion does not match proof request.");
	}
	return assertion;
}

export function issueHostPairing(input: {
	readonly registry: HostRegistrySnapshot;
	readonly command: HostPairingIssueCommand;
	readonly authentication: HostAuthenticationAssertion;
	readonly now?: Date;
}): HostRegistrySnapshot {
	const registry = normalizeHostRegistrySnapshot(input.registry);
	const command = normalizeIssueCommand(input.command);
	const occurredAt = hostTimestamp(input.now);
	assertExpectedGeneration(registry, command.expectedRegistryGeneration);
	assertOccurrenceAdvancesRegistry(registry, occurredAt);
	const authentication = normalizeHostAuthenticationAssertion(input.authentication);
	if (
		authentication.clientKind !== command.clientKind ||
		authentication.clientInstanceId !== command.clientInstanceId
	) {
		throw new Error("Host pairing authentication does not match requested Client.");
	}
	const actor = activeMappedActor(registry, authentication);
	if (registry.pairings.some((record) => record.pairingId === command.pairingId)) {
		throw new Error("Host pairing id already exists.");
	}
	if (
		registry.pairings.some(
			(record) => record.authenticationRef === authentication.authenticationRef,
		)
	) {
		throw new Error("Host pairing authentication reference already exists.");
	}
	if (
		registry.pairings.some(
			(record) =>
				record.status === "active" &&
				record.clientKind === command.clientKind &&
				record.clientInstanceId === command.clientInstanceId,
		)
	) {
		throw new Error("Host Client instance already has an active pairing.");
	}
	const expiresAt = command.expiresInSeconds === undefined
		? undefined
		: new Date(Date.parse(occurredAt) + command.expiresInSeconds * 1_000).toISOString();
	const pairing: HostClientPairingRecord = Object.freeze({
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
	return normalizeHostRegistrySnapshot({
		...registry,
		generation: registry.generation + 1,
		generatedAt: occurredAt,
		pairings: [...registry.pairings, pairing],
	});
}

export function revokeHostPairing(input: {
	readonly registry: HostRegistrySnapshot;
	readonly command: HostPairingRevokeCommand;
	readonly authentication: HostAuthenticationAssertion;
	readonly now?: Date;
}): HostRegistrySnapshot {
	const registry = normalizeHostRegistrySnapshot(input.registry);
	const command = normalizeRevokeCommand(input.command);
	const occurredAt = hostTimestamp(input.now);
	assertExpectedGeneration(registry, command.expectedRegistryGeneration);
	assertOccurrenceAdvancesRegistry(registry, occurredAt);
	const authentication = normalizeHostAuthenticationAssertion(input.authentication);
	const actor = activeMappedActor(registry, authentication);
	const pairing = registry.pairings.find(
		(record) => record.pairingId === command.pairingId,
	);
	if (!pairing || pairing.status !== "active") {
		throw new Error("Host pairing is not active.");
	}
	if (pairing.actorId !== actor.actorId) {
		throw new Error("Host pairing revocation actor does not own pairing.");
	}
	if (pairing.authenticationRef !== command.expectedAuthenticationRef) {
		throw new Error("Host pairing authentication reference changed.");
	}
	if (Date.parse(occurredAt) <= Date.parse(pairing.updatedAt)) {
		throw new Error("Host pairing revocation time must advance updatedAt.");
	}
	return normalizeHostRegistrySnapshot({
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
	registry: HostRegistrySnapshot,
	authentication: HostAuthenticationAssertion,
): HostRegistrySnapshot["actors"][number] {
	const actors = registry.actors.filter(
		(record) =>
			record.status === "active" &&
			record.authenticatedIdentityRefs.includes(
				authentication.authenticatedIdentityRef,
			),
	);
	if (actors.length !== 1) {
		throw new Error("Host pairing authenticated identity has no active actor mapping.");
	}
	return actors[0];
}

function normalizeProofRequest(value: unknown): HostAuthenticationProof {
	const input = exactObject(
		value,
		["clientKind", "clientInstanceId", "proof"],
		"Host authentication proof request",
	);
	if (!Object.hasOwn(input, "proof") || input.proof === undefined) {
		throw new Error("Host authentication proof is required.");
	}
	return Object.freeze({
		clientKind: clientKind(input.clientKind, "proof clientKind"),
		clientInstanceId: boundedText(input.clientInstanceId, "proof clientInstanceId"),
		proof: input.proof,
	});
}

function normalizeIssueCommand(value: unknown): HostPairingIssueCommand {
	const input = pairingCommand(value, "issue", [
		"pairingId",
		"clientKind",
		"clientInstanceId",
		"expiresInSeconds",
	]);
	return Object.freeze({
		...input.base,
		kind: "issue",
		pairingId: boundedText(input.value.pairingId, "pairingId"),
		clientKind: clientKind(input.value.clientKind, "clientKind"),
		clientInstanceId: boundedText(input.value.clientInstanceId, "clientInstanceId"),
		...(input.value.expiresInSeconds === undefined
			? {}
			: {
					expiresInSeconds: boundedPositiveInteger(
						input.value.expiresInSeconds,
						"expiresInSeconds",
						31_536_000,
					),
				}),
	});
}

function normalizeRevokeCommand(value: unknown): HostPairingRevokeCommand {
	const input = pairingCommand(value, "revoke", [
		"pairingId",
		"expectedAuthenticationRef",
	]);
	return Object.freeze({
		...input.base,
		kind: "revoke",
		pairingId: boundedText(input.value.pairingId, "pairingId"),
		expectedAuthenticationRef: boundedText(
			input.value.expectedAuthenticationRef,
			"expectedAuthenticationRef",
			4_096,
		),
	});
}

function pairingCommand(
	value: unknown,
	kind: "issue" | "revoke",
	fields: readonly string[],
): {
	readonly value: Record<string, unknown>;
	readonly base: {
		readonly protocolId: typeof HOST_PAIRING_PROTOCOL.id;
		readonly protocolVersion: typeof HOST_PAIRING_PROTOCOL.version;
		readonly expectedRegistryGeneration: number;
	};
} {
	const input = exactObject(
		value,
		[
			"protocolId",
			"protocolVersion",
			"kind",
			"expectedRegistryGeneration",
			...fields,
		],
		`Host pairing ${kind} command`,
	);
	if (
		input.protocolId !== HOST_PAIRING_PROTOCOL.id ||
		input.protocolVersion !== HOST_PAIRING_PROTOCOL.version ||
		input.kind !== kind
	) {
		throw new Error("Host pairing command protocol binding is invalid.");
	}
	return {
		value: input,
		base: {
			protocolId: HOST_PAIRING_PROTOCOL.id,
			protocolVersion: HOST_PAIRING_PROTOCOL.version,
			expectedRegistryGeneration: boundedPositiveInteger(
				input.expectedRegistryGeneration,
				"expectedRegistryGeneration",
			),
		},
	};
}

function assertExpectedGeneration(
	registry: HostRegistrySnapshot,
	expected: number,
): void {
	if (registry.generation !== expected) {
		throw new Error("Host pairing registry generation conflict.");
	}
}

function assertOccurrenceAdvancesRegistry(
	registry: HostRegistrySnapshot,
	occurredAt: string,
): void {
	if (Date.parse(occurredAt) <= Date.parse(registry.generatedAt)) {
		throw new Error("Host pairing command time must advance registry time.");
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

function hostTimestamp(now = new Date()): string {
	if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
		throw new Error("Host pairing clock is invalid.");
	}
	return now.toISOString();
}

function boundedPositiveInteger(
	value: unknown,
	field: string,
	maximum = Number.MAX_SAFE_INTEGER,
): number {
	if (
		!Number.isSafeInteger(value) ||
		(value as number) < 1 ||
		(value as number) > maximum
	) {
		throw new Error(`${field} must be a bounded positive safe integer.`);
	}
	return value as number;
}

function clientKind(value: unknown, field: string): HostClientKind {
	if (
		typeof value !== "string" ||
		!(HOST_CLIENT_KINDS as readonly string[]).includes(value)
	) {
		throw new Error(`${field} is unsupported.`);
	}
	return value as HostClientKind;
}
