import {randomBytes, timingSafeEqual} from "node:crypto";
import {realpath} from "node:fs/promises";
import {homedir} from "node:os";
import {join} from "node:path";
import {CLIENT_PAIRING_PROTOCOL} from "../../protocol/client-pairing.ts";
import {canonicalJsonDigest} from "../../utils/canonical-json.ts";
import {
	verifyServerAuthentication,
	type ServerAuthenticationAssertion,
} from "../authentication/proof.ts";
import {issueClientPairing} from "../pairing/commands.ts";
import {
	SERVER_REGISTRY_PROTOCOL,
	normalizeServerRegistrySnapshot,
	readServerRegistrySnapshot,
	resolveServerConnection,
	writeServerRegistrySnapshot,
	type ResolvedServerConnection,
	type ServerRegistrySnapshot,
} from "./state.ts";

const SERVER_STATE_ROOT_ENV = "CODEWIKI_SERVER_STATE_ROOT";

export async function resolveLocalAppServerConnection(input: {
	readonly repoRoot: string;
	readonly serverStateRoot?: string;
}): Promise<ResolvedServerConnection> {
	const projectRoot = await realpath(input.repoRoot);
	const repositoryIdentity = canonicalJsonDigest({
		kind: "codewiki.local-project",
		repoRoot: projectRoot,
	});
	const identityKey = digestKey({
		kind: "codewiki.local-os-identity",
		home: homedir(),
		uid: process.getuid?.() ?? null,
	});
	const projectKey = digestKey(repositoryIdentity);
	const local = Object.freeze({
		actorId: `user:local:${identityKey}`,
		authenticatedIdentityRef: `identity:local-os:${identityKey}`,
		clientInstanceId: `app:loopback:${projectKey}`,
		authenticationRef: `auth:local-app:${identityKey}:${projectKey}`,
		pairingId: `pairing:local-app:${identityKey}:${projectKey}`,
		projectId: `project:${projectKey}`,
		runtimeRouteRef: `runtime:project:${projectKey}`,
	});
	const proof = randomBytes(32).toString("base64url");
	const authentication = await verifyServerAuthentication({
		request: {
			clientKind: "app",
			clientInstanceId: local.clientInstanceId,
			proof,
		},
		adapter: {
			adapterId: "codewiki.local-app-authentication@1.0.0",
			async verify(request) {
				if (!sameSecret(request.proof, proof)) {
					throw new Error("Local App authentication proof is invalid.");
				}
				return {
				clientKind: "app",
				clientInstanceId: local.clientInstanceId,
				authenticationRef: local.authenticationRef,
				authenticatedIdentityRef: local.authenticatedIdentityRef,
				};
			},
		},
	});
	const serverStateRoot = input.serverStateRoot || defaultServerStateRoot();
	let registry = await ensureLocalActorAndProject({
		serverStateRoot,
		projectRoot,
		repositoryIdentity,
		local,
	});
	registry = await ensureLocalPairing({
		serverStateRoot,
		registry,
		authentication,
		pairingId: local.pairingId,
	});
	return resolveServerConnection({
		registry,
		expectedRegistryGeneration: registry.generation,
		authentication,
		repositoryIdentity,
		now: new Date(),
	});
}

async function ensureLocalActorAndProject(input: {
	readonly serverStateRoot: string;
	readonly projectRoot: string;
	readonly repositoryIdentity: `sha256:${string}`;
	readonly local: {
		readonly actorId: string;
		readonly authenticatedIdentityRef: string;
		readonly projectId: string;
		readonly runtimeRouteRef: string;
	};
}): Promise<ServerRegistrySnapshot> {
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const current = await readServerRegistrySnapshot(input.serverStateRoot);
		const actor = current?.actors.find((record) =>
			record.authenticatedIdentityRefs.includes(input.local.authenticatedIdentityRef),
		);
		const project = current?.projects.find(
			(record) => record.repositoryIdentity === input.repositoryIdentity,
		);
		if (project && project.projectRoot !== input.projectRoot) {
			throw new Error("Local App project registration does not match canonical repository root.");
		}
		if (current && actor && project) return current;
		const occurredAt = await advancingTime(current?.generatedAt);
		const next = normalizeServerRegistrySnapshot({
			protocolId: SERVER_REGISTRY_PROTOCOL.id,
			protocolVersion: SERVER_REGISTRY_PROTOCOL.version,
			generation: (current?.generation ?? 0) + 1,
			generatedAt: occurredAt,
			actors: actor
				? current?.actors
				: [
						...(current?.actors ?? []),
						{
							actorId: input.local.actorId,
							actorKind: "user",
							authenticatedIdentityRefs: [input.local.authenticatedIdentityRef],
							status: "active",
							createdAt: occurredAt,
							updatedAt: occurredAt,
						},
					],
			pairings: current?.pairings ?? [],
			projects: project
				? current?.projects
				: [
						...(current?.projects ?? []),
						{
							projectId: input.local.projectId,
							repositoryIdentity: input.repositoryIdentity,
							projectRoot: input.projectRoot,
							runtimeRouteRef: input.local.runtimeRouteRef,
							status: "active",
							registeredAt: occurredAt,
							updatedAt: occurredAt,
						},
					],
		});
		try {
			return await writeServerRegistrySnapshot({
				serverStateRoot: input.serverStateRoot,
				expectedGeneration: current?.generation ?? 0,
				snapshot: next,
			});
		} catch (error) {
			if (!isRegistryConflict(error) || attempt === 3) throw error;
		}
	}
	throw new Error("Local App Registry update did not converge.");
}

async function ensureLocalPairing(input: {
	readonly serverStateRoot: string;
	readonly registry: ServerRegistrySnapshot;
	readonly authentication: ServerAuthenticationAssertion;
	readonly pairingId: string;
}): Promise<ServerRegistrySnapshot> {
	let registry = input.registry;
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const existing = registry.pairings.find(
			(record) =>
				record.clientKind === input.authentication.clientKind &&
				record.clientInstanceId === input.authentication.clientInstanceId,
		);
		if (existing) return registry;
		const issued = issueClientPairing({
			registry,
			authentication: input.authentication,
			command: {
				protocolId: CLIENT_PAIRING_PROTOCOL.id,
				protocolVersion: CLIENT_PAIRING_PROTOCOL.version,
				kind: "issue",
				expectedRegistryGeneration: registry.generation,
				pairingId: input.pairingId,
				clientKind: "app",
				clientInstanceId: input.authentication.clientInstanceId,
			},
			now: await advancingDate(registry.generatedAt),
		});
		try {
			return await writeServerRegistrySnapshot({
				serverStateRoot: input.serverStateRoot,
				expectedGeneration: registry.generation,
				snapshot: issued,
			});
		} catch (error) {
			if (!isRegistryConflict(error) || attempt === 3) throw error;
			const current = await readServerRegistrySnapshot(input.serverStateRoot);
			if (!current) throw new Error("Local App Registry disappeared during Pairing.");
			registry = current;
		}
	}
	throw new Error("Local App Pairing did not converge.");
}

function defaultServerStateRoot(): string {
	const configured = process.env[SERVER_STATE_ROOT_ENV];
	if (configured) return configured;
	if (process.platform === "win32") {
		return join(
			process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
			"CodeWiki",
			"Server",
		);
	}
	return join(
		process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
		"codewiki",
		"server",
	);
}

function digestKey(value: unknown): string {
	return canonicalJsonDigest(value).slice("sha256:".length, "sha256:".length + 24);
}

async function advancingTime(previous: string | undefined): Promise<string> {
	if (previous) await waitUntilAfter(previous);
	return new Date().toISOString();
}

async function advancingDate(previous: string): Promise<Date> {
	await waitUntilAfter(previous);
	return new Date();
}

async function waitUntilAfter(previous: string): Promise<void> {
	const delay = Date.parse(previous) - Date.now() + 1;
	if (delay > 1_000) {
		throw new Error("Local App Registry timestamp is too far in the future.");
	}
	if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

function sameSecret(value: unknown, expected: string): boolean {
	if (typeof value !== "string") return false;
	const supplied = Buffer.from(value);
	const trusted = Buffer.from(expected);
	return supplied.length === trusted.length && timingSafeEqual(supplied, trusted);
}

function isRegistryConflict(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.message === "Server registry generation conflict."
	);
}
