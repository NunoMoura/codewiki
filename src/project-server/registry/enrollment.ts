import {canonicalJsonDigest} from "../../utils/canonical-json.ts";
import {
	assertVerifiedProjectServerOidcAuthentication,
	projectServerOidcIdentity,
	type VerifiedProjectServerOidcAuthentication,
} from "../authentication/oidc.ts";
import {
	normalizeProjectServerRegistrySnapshot,
	type ProjectServerActorRecord,
	type ProjectServerRegistrySnapshot,
} from "./state.ts";

export interface ProjectServerOidcActorEnrollment {
	readonly registry: ProjectServerRegistrySnapshot;
	readonly actor: ProjectServerActorRecord;
	readonly created: boolean;
	readonly authenticationAdapterId: string;
}

export function enrollProjectServerOidcActor(input: {
	readonly registry: ProjectServerRegistrySnapshot;
	readonly expectedRegistryGeneration: number;
	readonly authentication: VerifiedProjectServerOidcAuthentication;
	readonly now?: Date;
}): ProjectServerOidcActorEnrollment {
	assertVerifiedProjectServerOidcAuthentication(input.authentication);
	const registry = normalizeProjectServerRegistrySnapshot(input.registry);
	if (
		!Number.isSafeInteger(input.expectedRegistryGeneration) ||
		registry.generation !== input.expectedRegistryGeneration
	) {
		throw new Error("Server OIDC actor enrollment registry generation conflict.");
	}
	const identity = input.authentication.identity;
	const expectedIdentity = projectServerOidcIdentity(identity.issuer, identity.subject);
	if (
		identity.kind !== "oidc" ||
		identity.identityRef !== expectedIdentity.identityRef ||
		input.authentication.assertion.authenticatedIdentityRef !== identity.identityRef ||
		!input.authentication.assertion.authenticationRef.startsWith("auth:oidc:") ||
		!input.authentication.adapterId.trim()
	) {
		throw new Error("Server OIDC actor enrollment identity binding is invalid.");
	}
	const matches = registry.actors.filter((actor) =>
		actor.authenticatedIdentities.some(
			(candidate) => candidate.identityRef === identity.identityRef,
		),
	);
	if (matches.length > 1) {
		throw new Error("Server OIDC identity maps to multiple actors.");
	}
	if (matches.length === 1) {
		if (matches[0].status !== "active" || matches[0].actorKind !== "user") {
			throw new Error("Server OIDC actor mapping is not active user enrollment.");
		}
		return Object.freeze({
			registry,
			actor: matches[0],
			created: false,
			authenticationAdapterId: input.authentication.adapterId,
		});
	}
	const occurredAt = projectServerTimestamp(input.now);
	if (Date.parse(occurredAt) <= Date.parse(registry.generatedAt)) {
		throw new Error("Server OIDC actor enrollment time must advance registry time.");
	}
	const actorId = `user:oidc:${canonicalJsonDigest({
		issuer: identity.issuer,
		subject: identity.subject,
	}).slice("sha256:".length, "sha256:".length + 32)}`;
	const actor = Object.freeze({
		actorId,
		actorKind: "user" as const,
		authenticatedIdentities: Object.freeze([identity]),
		status: "active" as const,
		createdAt: occurredAt,
		updatedAt: occurredAt,
	});
	const next = normalizeProjectServerRegistrySnapshot({
		...registry,
		generation: registry.generation + 1,
		generatedAt: occurredAt,
		actors: [...registry.actors, actor],
	});
	return Object.freeze({
		registry: next,
		actor,
		created: true,
		authenticationAdapterId: input.authentication.adapterId,
	});
}

function projectServerTimestamp(now = new Date()): string {
	if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
		throw new Error("Server OIDC actor enrollment clock is invalid.");
	}
	return now.toISOString();
}
