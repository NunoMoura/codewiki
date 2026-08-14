import {canonicalJsonDigest} from "../../utils/canonical-json.ts";
import {CLIENT_KINDS, type ClientKind} from "../../protocol/client-server.ts";
import {markVerifiedServerAuthenticationAssertion,
	normalizeServerAuthenticationAssertion,
	type ServerAuthenticationAssertion,
	type ServerAuthenticationProof,
} from "./proof.ts";

const verifiedOidcAuthentications = new WeakSet<object>();
export const SERVER_OIDC_AUTHENTICATION_PROTOCOL = Object.freeze({
	id: "codewiki.server-oidc-authentication",
	version: "1.0.0",
} as const);

export interface ServerOidcIdentity {
	readonly kind: "oidc";
	readonly identityRef: string;
	readonly issuer: string;
	readonly subject: string;
}

export interface ServerOidcClaims {
	readonly clientKind: ClientKind;
	readonly clientInstanceId: string;
	readonly issuer: string;
	readonly subject: string;
	readonly audience: string;
	readonly nonce: string;
	readonly issuedAt: string;
	readonly expiresAt: string;
}

/** Trusted adapter owns authorization-code exchange, PKCE, discovery, and token cryptography. */
export interface ServerOidcAuthenticationAdapter {
	readonly adapterId: string;
	verify(input: {
		readonly protocolId: typeof SERVER_OIDC_AUTHENTICATION_PROTOCOL.id;
		readonly protocolVersion: typeof SERVER_OIDC_AUTHENTICATION_PROTOCOL.version;
		readonly proof: unknown;
		readonly expected: {
			readonly clientKind: ClientKind;
			readonly clientInstanceId: string;
			readonly issuer: string;
			readonly audience: string;
			readonly nonce: string;
		};
	}): Promise<unknown>;
}

export interface VerifiedServerOidcAuthentication {
	readonly assertion: ServerAuthenticationAssertion;
	readonly identity: ServerOidcIdentity;
	readonly adapterId: string;
}

export async function verifyServerOidcAuthentication(input: {
	readonly adapter: ServerOidcAuthenticationAdapter;
	readonly request: ServerAuthenticationProof;
	readonly expectedIssuer: string;
	readonly expectedAudience: string;
	readonly expectedNonce: string;
	readonly now?: Date;
	readonly maximumTokenAgeSeconds?: number;
}): Promise<VerifiedServerOidcAuthentication> {
	if (!input.adapter || typeof input.adapter.verify !== "function") {
		throw new Error("Server OIDC authentication adapter is invalid.");
	}
	const adapterId = boundedText(input.adapter.adapterId, "OIDC adapter id");
	const request = authenticationRequest(input.request);
	const expected = Object.freeze({
		clientKind: request.clientKind,
		clientInstanceId: request.clientInstanceId,
		issuer: httpsIssuer(input.expectedIssuer),
		audience: boundedText(input.expectedAudience, "OIDC audience"),
		nonce: nonce(input.expectedNonce),
	});
	let untrusted: unknown;
	try {
		untrusted = await input.adapter.verify(Object.freeze({
			protocolId: SERVER_OIDC_AUTHENTICATION_PROTOCOL.id,
			protocolVersion: SERVER_OIDC_AUTHENTICATION_PROTOCOL.version,
			proof: request.proof,
			expected,
		}));
	} catch {
		throw new Error("Server OIDC authentication adapter rejected proof.");
	}
	const claims = normalizeServerOidcClaims(untrusted);
	assertExpectedClaims(claims, expected);
	assertClaimTime(
		claims,
		input.now ?? new Date(),
		input.maximumTokenAgeSeconds ?? 600,
	);
	const identity = serverOidcIdentity(claims.issuer, claims.subject);
	const assertion = normalizeServerAuthenticationAssertion({
		clientKind: claims.clientKind,
		clientInstanceId: claims.clientInstanceId,
		authenticationRef: `auth:oidc:${canonicalJsonDigest({
			adapterId,
			identityRef: identity.identityRef,
			clientKind: claims.clientKind,
			clientInstanceId: claims.clientInstanceId,
			issuedAt: claims.issuedAt,
			expiresAt: claims.expiresAt,
		}).slice("sha256:".length)}`,
		authenticatedIdentityRef: identity.identityRef,
	});
	markVerifiedServerAuthenticationAssertion(assertion); const verified = Object.freeze({assertion, identity, adapterId});
	verifiedOidcAuthentications.add(verified);
	return verified;
}

export function assertVerifiedServerOidcAuthentication(
	value: VerifiedServerOidcAuthentication,
): void {
	if (
		typeof value !== "object" ||
		value === null ||
		!verifiedOidcAuthentications.has(value)
	) {
		throw new Error("Server OIDC authentication lacks verifier provenance.");
	}
}

export function serverOidcIdentity(
	issuerValue: string,
	subjectValue: string,
): ServerOidcIdentity {
	const issuer = httpsIssuer(issuerValue);
	const subject = boundedText(subjectValue, "OIDC subject", 1_024);
	const identityRef = `identity:oidc:${canonicalJsonDigest({issuer, subject}).slice("sha256:".length)}`;
	return Object.freeze({kind: "oidc", identityRef, issuer, subject});
}

function normalizeServerOidcClaims(value: unknown): ServerOidcClaims {
	const input = exactObject(value, [
		"clientKind",
		"clientInstanceId",
		"issuer",
		"subject",
		"audience",
		"nonce",
		"issuedAt",
		"expiresAt",
	]);
	return Object.freeze({
		clientKind: clientKind(input.clientKind),
		clientInstanceId: boundedText(input.clientInstanceId, "OIDC clientInstanceId"),
		issuer: httpsIssuer(input.issuer),
		subject: boundedText(input.subject, "OIDC subject", 1_024),
		audience: boundedText(input.audience, "OIDC audience"),
		nonce: nonce(input.nonce),
		issuedAt: timestamp(input.issuedAt, "OIDC issuedAt"),
		expiresAt: timestamp(input.expiresAt, "OIDC expiresAt"),
	});
}

function assertExpectedClaims(
	claims: ServerOidcClaims,
	expected: {
		readonly clientKind: ClientKind;
		readonly clientInstanceId: string;
		readonly issuer: string;
		readonly audience: string;
		readonly nonce: string;
	},
): void {
	if (
		claims.clientKind !== expected.clientKind ||
		claims.clientInstanceId !== expected.clientInstanceId
	) {
		throw new Error("Server OIDC claims do not match Client request.");
	}
	if (claims.issuer !== expected.issuer) {
		throw new Error("Server OIDC issuer does not match expected issuer.");
	}
	if (claims.audience !== expected.audience) {
		throw new Error("Server OIDC audience does not match expected audience.");
	}
	if (claims.nonce !== expected.nonce) {
		throw new Error("Server OIDC nonce does not match expected nonce.");
	}
}

function assertClaimTime(
	claims: ServerOidcClaims,
	now: Date,
	maximumTokenAgeSeconds: number,
): void {
	if (!Number.isFinite(now.getTime())) {
		throw new Error("Server OIDC verification time is invalid.");
	}
	if (!Number.isInteger(maximumTokenAgeSeconds) || maximumTokenAgeSeconds < 1 || maximumTokenAgeSeconds > 3_600) {
		throw new Error("Server OIDC maximum token age is invalid.");
	}
	const issuedAt = Date.parse(claims.issuedAt);
	const expiresAt = Date.parse(claims.expiresAt);
	if (issuedAt > now.getTime() || expiresAt <= now.getTime()) {
		throw new Error("Server OIDC claims are not currently valid.");
	}
	const maximumTokenAgeMs = maximumTokenAgeSeconds * 1_000;
	if (
		expiresAt <= issuedAt ||
		expiresAt - issuedAt > maximumTokenAgeMs ||
		now.getTime() - issuedAt > maximumTokenAgeMs
	) {
		throw new Error("Server OIDC claims exceed bounded token lifetime.");
	}
}

function exactObject(
	value: unknown,
	fields: readonly string[],
): Record<string, unknown> {
	if (
		typeof value !== "object" ||
		value === null ||
		Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Object.prototype
	) {
		throw new Error("Server OIDC claims must be a plain object.");
	}
	if (Object.getOwnPropertySymbols(value).length > 0) {
		throw new Error("Server OIDC claims cannot contain symbol fields.");
	}
	const input = value as Record<string, unknown>;
	for (const key of Object.getOwnPropertyNames(input)) {
		if (!fields.includes(key)) {
			throw new Error(`Server OIDC claims received unsupported field ${key}.`);
		}
		const descriptor = Object.getOwnPropertyDescriptor(input, key);
		if (!descriptor?.enumerable || !("value" in descriptor)) {
			throw new Error(`Server OIDC claims field ${key} must be enumerable data.`);
		}
	}
	return input;
}

function httpsIssuer(value: unknown): string {
	const text = boundedText(value, "OIDC issuer", 2_048);
	let issuer: URL;
	try {
		issuer = new URL(text);
	} catch {
		throw new Error("OIDC issuer must be an absolute HTTPS URL.");
	}
	if (
		issuer.protocol !== "https:" ||
		issuer.username ||
		issuer.password ||
		issuer.search ||
		issuer.hash
	) {
		throw new Error("OIDC issuer must be a canonical HTTPS URL.");
	}
	return text;
}

function authenticationRequest(
	value: unknown,
): ServerAuthenticationProof {
	const input = exactObject(value, ["clientKind", "clientInstanceId", "proof"]);
	if (!Object.hasOwn(input, "proof") || input.proof === undefined) {
		throw new Error("Server OIDC authorization proof is required.");
	}
	return Object.freeze({
		clientKind: clientKind(input.clientKind),
		clientInstanceId: boundedText(input.clientInstanceId, "OIDC clientInstanceId"),
		proof: input.proof,
	});
}

function nonce(value: unknown): string {
	const text = boundedText(value, "OIDC nonce", 4_096);
	if (text.length < 32) {
		throw new Error("OIDC nonce must contain at least 32 characters.");
	}
	return text;
}

function timestamp(value: unknown, field: string): string {
	const text = boundedText(value, field);
	const date = new Date(text);
	if (!Number.isFinite(date.getTime()) || date.toISOString() !== text) {
		throw new Error(`${field} must be a canonical timestamp.`);
	}
	return text;
}

function boundedText(value: unknown, field: string, maximum = 512): string {
	if (
		typeof value !== "string" ||
		value.trim() !== value ||
		value.length === 0 ||
		value.length > maximum ||
		[...value].some((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code < 32 || code === 127;
		})
	) {
		throw new Error(`${field} must be bounded non-empty text.`);
	}
	return value;
}

function clientKind(value: unknown): ClientKind {
	if (
		typeof value !== "string" ||
		!(CLIENT_KINDS as readonly string[]).includes(value)
	) {
		throw new Error("OIDC clientKind is unsupported.");
	}
	return value as ClientKind;
}
