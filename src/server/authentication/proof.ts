import {
	CLIENT_KINDS,
	type ClientKind,
} from "../../protocol/client-server.ts";

const verifiedServerAuthentications = new WeakSet<object>();

export interface ServerAuthenticationProof {
	readonly clientKind: ClientKind;
	readonly clientInstanceId: string;
	readonly proof: unknown;
}

/** Result supplied by a trusted Server authentication adapter after proof verification. */
export interface ServerAuthenticationAssertion {
	readonly clientKind: ClientKind;
	readonly clientInstanceId: string;
	readonly authenticationRef: string;
	readonly authenticatedIdentityRef: string;
}

export interface ServerAuthenticationAdapter {
	readonly adapterId: string;
	verify(input: ServerAuthenticationProof): Promise<ServerAuthenticationAssertion>;
}

export function normalizeServerAuthenticationAssertion(
	value: unknown,
): ServerAuthenticationAssertion {
	const input = assertionObject(
		value,
		[
			"clientKind",
			"clientInstanceId",
			"authenticationRef",
			"authenticatedIdentityRef",
		],
		"Server authentication assertion",
	);
	return Object.freeze({
		clientKind: clientKind(input.clientKind, "authentication.clientKind"),
		clientInstanceId: boundedText(
			input.clientInstanceId,
			"authentication.clientInstanceId",
		),
		authenticationRef: boundedText(
			input.authenticationRef,
			"authentication.authenticationRef",
			4_096,
		),
		authenticatedIdentityRef: boundedText(
			input.authenticatedIdentityRef,
			"authentication.authenticatedIdentityRef",
			4_096,
		),
	});
}

function assertionObject(
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
	markVerifiedServerAuthenticationAssertion(assertion);
	return assertion;
}

export function assertVerifiedServerAuthenticationAssertion(
	value: ServerAuthenticationAssertion,
): void {
	if (
		typeof value !== "object" ||
		value === null ||
		!verifiedServerAuthentications.has(value)
	) {
		throw new Error("Server authentication assertion lacks verifier provenance.");
	}
}

export function markVerifiedServerAuthenticationAssertion(
	value: ServerAuthenticationAssertion,
): void {
	verifiedServerAuthentications.add(value);
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

function clientKind(value: unknown, field: string): ClientKind {
	if (
		typeof value !== "string" ||
		!(CLIENT_KINDS as readonly string[]).includes(value)
	) {
		throw new Error(`${field} is unsupported.`);
	}
	return value as ClientKind;
}
