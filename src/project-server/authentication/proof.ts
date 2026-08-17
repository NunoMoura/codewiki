import {
	CLIENT_KINDS,
	type ClientKind,
} from "../../protocol/client-project-server.ts";

const verifiedProjectServerAuthentications = new WeakSet<object>();

export interface ProjectServerAuthenticationProof {
	readonly clientKind: ClientKind;
	readonly clientInstanceId: string;
	readonly proof: unknown;
}

/** Result supplied by a trusted Server authentication adapter after proof verification. */
export interface ProjectServerAuthenticationAssertion {
	readonly clientKind: ClientKind;
	readonly clientInstanceId: string;
	readonly authenticationRef: string;
	readonly authenticatedIdentityRef: string;
}

export interface ProjectServerAuthenticationAdapter {
	readonly adapterId: string;
	verify(input: ProjectServerAuthenticationProof): Promise<ProjectServerAuthenticationAssertion>;
}

export function normalizeProjectServerAuthenticationAssertion(
	value: unknown,
): ProjectServerAuthenticationAssertion {
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

export async function verifyProjectServerAuthentication(input: {
	readonly adapter: ProjectServerAuthenticationAdapter;
	readonly request: ProjectServerAuthenticationProof;
}): Promise<ProjectServerAuthenticationAssertion> {
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
	const assertion = normalizeProjectServerAuthenticationAssertion(asserted);
	if (
		assertion.clientKind !== request.clientKind ||
		assertion.clientInstanceId !== request.clientInstanceId
	) {
		throw new Error("Server authentication assertion does not match proof request.");
	}
	markVerifiedProjectServerAuthenticationAssertion(assertion);
	return assertion;
}

export function assertVerifiedProjectServerAuthenticationAssertion(
	value: ProjectServerAuthenticationAssertion,
): void {
	if (
		typeof value !== "object" ||
		value === null ||
		!verifiedProjectServerAuthentications.has(value)
	) {
		throw new Error("Server authentication assertion lacks verifier provenance.");
	}
}

export function markVerifiedProjectServerAuthenticationAssertion(
	value: ProjectServerAuthenticationAssertion,
): void {
	verifiedProjectServerAuthentications.add(value);
}

function normalizeProofRequest(value: unknown): ProjectServerAuthenticationProof {
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
