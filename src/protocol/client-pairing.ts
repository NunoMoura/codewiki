import {
	CLIENT_KINDS,
	type ClientKind,
} from "./client-server.ts";

export const CLIENT_PAIRING_PROTOCOL = Object.freeze({
	id: "codewiki.client-pairing",
	version: "1.0.0",
} as const);

export interface ClientPairingIssueCommand {
	readonly protocolId: typeof CLIENT_PAIRING_PROTOCOL.id;
	readonly protocolVersion: typeof CLIENT_PAIRING_PROTOCOL.version;
	readonly kind: "issue";
	readonly expectedRegistryGeneration: number;
	readonly pairingId: string;
	readonly clientKind: ClientKind;
	readonly clientInstanceId: string;
	readonly expiresInSeconds?: number;
}

export interface ClientPairingRevokeCommand {
	readonly protocolId: typeof CLIENT_PAIRING_PROTOCOL.id;
	readonly protocolVersion: typeof CLIENT_PAIRING_PROTOCOL.version;
	readonly kind: "revoke";
	readonly expectedRegistryGeneration: number;
	readonly pairingId: string;
	readonly expectedAuthenticationRef: string;
}

export function normalizeClientPairingIssueCommand(
	value: unknown,
): ClientPairingIssueCommand {
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
		clientInstanceId: boundedText(
			input.value.clientInstanceId,
			"clientInstanceId",
		),
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

export function normalizeClientPairingRevokeCommand(
	value: unknown,
): ClientPairingRevokeCommand {
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
		readonly protocolId: typeof CLIENT_PAIRING_PROTOCOL.id;
		readonly protocolVersion: typeof CLIENT_PAIRING_PROTOCOL.version;
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
		`Client pairing ${kind} command`,
	);
	if (
		input.protocolId !== CLIENT_PAIRING_PROTOCOL.id ||
		input.protocolVersion !== CLIENT_PAIRING_PROTOCOL.version ||
		input.kind !== kind
	) {
		throw new Error("Client pairing command protocol binding is invalid.");
	}
	return {
		value: input,
		base: {
			protocolId: CLIENT_PAIRING_PROTOCOL.id,
			protocolVersion: CLIENT_PAIRING_PROTOCOL.version,
			expectedRegistryGeneration: boundedPositiveInteger(
				input.expectedRegistryGeneration,
				"expectedRegistryGeneration",
			),
		},
	};
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

function clientKind(value: unknown, field: string): ClientKind {
	if (
		typeof value !== "string" ||
		!(CLIENT_KINDS as readonly string[]).includes(value)
	) {
		throw new Error(`${field} is unsupported.`);
	}
	return value as ClientKind;
}
