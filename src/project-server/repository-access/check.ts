import {
	assertVerifiedProjectServerOidcAuthentication,
	projectServerOidcIdentity,
	type ProjectServerOidcIdentity,
	type VerifiedProjectServerOidcAuthentication,
} from "../authentication/oidc.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

const verifiedRepositoryAccess = new WeakSet<object>();

export const PROJECT_SERVER_REPOSITORY_ACCESS_PROTOCOL = Object.freeze({
	id: "codewiki.project-server-repository-access",
	version: "1.0.0",
	maximumEvidenceAgeSeconds: 900,
});

export type ProjectServerRepositoryAccess = "accessible" | "inaccessible";

export interface ProjectServerRepositoryAccessAdapterRequest {
	readonly protocolId: typeof PROJECT_SERVER_REPOSITORY_ACCESS_PROTOCOL.id;
	readonly protocolVersion: typeof PROJECT_SERVER_REPOSITORY_ACCESS_PROTOCOL.version;
	readonly identity: ProjectServerOidcIdentity;
	readonly repositoryIdentity: Sha256Digest;
	readonly providerRepositoryRef: string;
}

export interface ProjectServerRepositoryAccessAdapter {
	readonly adapterId: string;
	readonly providerId: string;
	readonly issuer: string;
	readonly check: (request: ProjectServerRepositoryAccessAdapterRequest) => Promise<unknown>;
}

export interface ProjectServerRepositoryAccessObservation {
	readonly authenticatedIdentityRef: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly providerRepositoryRef: string;
	readonly access: ProjectServerRepositoryAccess;
	readonly checkedAt: string;
	readonly expiresAt: string;
}

export interface VerifiedProjectServerRepositoryAccess {
	readonly protocolId: typeof PROJECT_SERVER_REPOSITORY_ACCESS_PROTOCOL.id;
	readonly protocolVersion: typeof PROJECT_SERVER_REPOSITORY_ACCESS_PROTOCOL.version;
	readonly evidenceRef: string;
	readonly providerId: string;
	readonly adapterId: string;
	readonly authenticatedIdentityRef: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly providerRepositoryRef: string;
	readonly access: ProjectServerRepositoryAccess;
	readonly checkedAt: string;
	readonly expiresAt: string;
}

export async function checkProjectServerProviderRepositoryAccess(input: {
	readonly adapter: ProjectServerRepositoryAccessAdapter;
	readonly authentication: VerifiedProjectServerOidcAuthentication;
	readonly repositoryIdentity: Sha256Digest;
	readonly providerRepositoryRef: string;
	readonly now?: Date;
	readonly maximumEvidenceAgeSeconds?: number;
}): Promise<VerifiedProjectServerRepositoryAccess> {
	assertVerifiedProjectServerOidcAuthentication(input.authentication);
	if (!input.adapter || typeof input.adapter.check !== "function") {
		throw new Error("Server repository-access adapter is invalid.");
	}
	const adapterId = text(input.adapter.adapterId, "Repository-access adapter id");
	const providerId = provider(input.adapter.providerId);
	const identity = input.authentication.identity;
	const expectedIdentity = projectServerOidcIdentity(identity.issuer, identity.subject);
	if (identity.identityRef !== expectedIdentity.identityRef) {
		throw new Error("Server repository-access OIDC identity binding is invalid.");
	}
	if (text(input.adapter.issuer, "Repository-access issuer", 2_048) !== identity.issuer) {
		throw new Error("Server repository-access adapter issuer does not match authentication.");
	}
	const repositoryIdentity = assertSha256Digest(
		input.repositoryIdentity,
		"Repository-access repositoryIdentity",
	);
	const providerRepositoryRef = repositoryRef(
		input.providerRepositoryRef,
		providerId,
	);
	const maximumAge = evidenceAge(input.maximumEvidenceAgeSeconds ?? 300);
	let untrusted: unknown;
	try {
		untrusted = await input.adapter.check(Object.freeze({
			protocolId: PROJECT_SERVER_REPOSITORY_ACCESS_PROTOCOL.id,
			protocolVersion: PROJECT_SERVER_REPOSITORY_ACCESS_PROTOCOL.version,
			identity,
			repositoryIdentity,
			providerRepositoryRef,
		}));
	} catch {
		throw new Error("Server repository-access adapter rejected check.");
	}
	const observation = normalizeObservation(untrusted);
	if (observation.authenticatedIdentityRef !== identity.identityRef) {
		throw new Error("Server repository-access identity does not match authentication.");
	}
	if (observation.repositoryIdentity !== repositoryIdentity) {
		throw new Error("Server repository-access repository identity does not match request.");
	}
	if (observation.providerRepositoryRef !== providerRepositoryRef) {
		throw new Error("Server repository-access repository does not match request.");
	}
	assertObservationTime(observation, input.now ?? new Date(), maximumAge);
	const evidence = Object.freeze({
		protocolId: PROJECT_SERVER_REPOSITORY_ACCESS_PROTOCOL.id,
		protocolVersion: PROJECT_SERVER_REPOSITORY_ACCESS_PROTOCOL.version,
		evidenceRef: `repository-access:${canonicalJsonDigest({
			providerId,
			adapterId,
			authenticatedIdentityRef: identity.identityRef,
			repositoryIdentity,
			providerRepositoryRef,
			access: observation.access,
			checkedAt: observation.checkedAt,
			expiresAt: observation.expiresAt,
		}).slice("sha256:".length)}`,
		providerId,
		adapterId,
		authenticatedIdentityRef: identity.identityRef,
		repositoryIdentity,
		providerRepositoryRef,
		access: observation.access,
		checkedAt: observation.checkedAt,
		expiresAt: observation.expiresAt,
	});
	verifiedRepositoryAccess.add(evidence);
	return evidence;
}

export function assertVerifiedProjectServerRepositoryAccess(
	value: VerifiedProjectServerRepositoryAccess,
): void {
	if (
		typeof value !== "object" ||
		value === null ||
		!verifiedRepositoryAccess.has(value)
	) {
		throw new Error("Server repository-access evidence lacks verifier provenance.");
	}
}

function normalizeObservation(value: unknown): ProjectServerRepositoryAccessObservation {
	const input = exactObject(value, [
		"authenticatedIdentityRef",
		"repositoryIdentity",
		"providerRepositoryRef",
		"access",
		"checkedAt",
		"expiresAt",
	]);
	return Object.freeze({
		authenticatedIdentityRef: text(
			input.authenticatedIdentityRef,
			"Repository-access authenticatedIdentityRef",
		),
		repositoryIdentity: assertSha256Digest(
			input.repositoryIdentity,
			"Repository-access repositoryIdentity",
		),
		providerRepositoryRef: text(
			input.providerRepositoryRef,
			"Repository-access providerRepositoryRef",
			1_024,
		),
		access: access(input.access),
		checkedAt: timestamp(input.checkedAt, "Repository-access checkedAt"),
		expiresAt: timestamp(input.expiresAt, "Repository-access expiresAt"),
	});
}

function assertObservationTime(
	observation: ProjectServerRepositoryAccessObservation,
	now: Date,
	maximumAgeSeconds: number,
): void {
	if (!Number.isFinite(now.getTime())) {
		throw new Error("Server repository-access current time is invalid.");
	}
	const checkedAt = Date.parse(observation.checkedAt);
	const expiresAt = Date.parse(observation.expiresAt);
	if (checkedAt > now.getTime() || expiresAt <= now.getTime()) {
		throw new Error("Server repository-access evidence is not currently valid.");
	}
	if (
		expiresAt <= checkedAt ||
		expiresAt - checkedAt > maximumAgeSeconds * 1_000
	) {
		throw new Error("Server repository-access evidence exceeds bounded lifetime.");
	}
}

function exactObject(value: unknown, fields: readonly string[]): Record<string, unknown> {
	if (
		typeof value !== "object" ||
		value === null ||
		Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Object.prototype
	) {
		throw new Error("Server repository-access observation must be a plain object.");
	}
	if (Object.getOwnPropertySymbols(value).length > 0) {
		throw new Error("Server repository-access observation cannot contain symbol fields.");
	}
	const input = value as Record<string, unknown>;
	for (const key of Object.getOwnPropertyNames(input)) {
		if (!fields.includes(key)) {
			throw new Error(`Server repository-access observation received unsupported field ${key}.`);
		}
		const descriptor = Object.getOwnPropertyDescriptor(input, key);
		if (!descriptor?.enumerable || !("value" in descriptor)) {
			throw new Error(`Server repository-access field ${key} must be enumerable data.`);
		}
	}
	return input;
}

function text(value: unknown, field: string, maximum = 512): string {
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

function timestamp(value: unknown, field: string): string {
	const result = text(value, field, 64);
	const time = Date.parse(result);
	if (!Number.isFinite(time) || new Date(time).toISOString() !== result) {
		throw new Error(`${field} must be a canonical ISO timestamp.`);
	}
	return result;
}

function provider(value: unknown): string {
	const result = text(value, "Repository-access provider id", 64);
	if (!/^[a-z][a-z0-9._-]{1,63}$/u.test(result)) {
		throw new Error("Repository-access provider id must be a lowercase identifier.");
	}
	return result;
}

function repositoryRef(value: unknown, providerId: string): string {
	const result = text(value, "Repository-access providerRepositoryRef", 1_024);
	if (
		!result.startsWith(`${providerId}:`) ||
		!/^[a-z][a-z0-9._-]{1,63}:[A-Za-z0-9][A-Za-z0-9._~:/-]{0,959}$/u.test(result)
	) {
		throw new Error("Repository-access providerRepositoryRef must be an opaque provider-bound identifier.");
	}
	return result;
}

function access(value: unknown): ProjectServerRepositoryAccess {
	if (value !== "accessible" && value !== "inaccessible") {
		throw new Error("Repository-access access must be accessible or inaccessible.");
	}
	return value;
}

function evidenceAge(value: number): number {
	if (
		!Number.isInteger(value) ||
		value < 1 ||
		value > PROJECT_SERVER_REPOSITORY_ACCESS_PROTOCOL.maximumEvidenceAgeSeconds
	) {
		throw new Error("Server repository-access maximum evidence age is invalid.");
	}
	return value;
}
