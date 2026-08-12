import assert from "node:assert/strict";
import {mkdir, mkdtemp, open, rm, stat, writeFile} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import {
	assertInstalledCodewikiRuntimeCurrent,
	captureInstalledCodewikiRuntimeIdentity,
	installedCodewikiRuntimeHealth,
} from "../../../src/host/app/installed-runtime.ts";
import {startCodewikiAppServer} from "../../../src/host/app/server.ts";
import {
	HOST_REGISTRY_PROTOCOL,
	normalizeHostRegistrySnapshot,
	readHostRegistrySnapshot,
	resolveHostConnection,
	writeHostRegistrySnapshot,
} from "../../../src/host/registry/state.ts";

function pin(commit, sha256) {
	return JSON.stringify({
		source: { commit },
		package: { sha256 },
	});
}

const digest = (character) => `sha256:${character.repeat(64)}`;

function registry(overrides = {}) {
	return {
		protocolId: HOST_REGISTRY_PROTOCOL.id,
		protocolVersion: HOST_REGISTRY_PROTOCOL.version,
		generation: 7,
		generatedAt: "2026-08-13T10:00:00.000Z",
		actors: [
			{
				actorId: "user:nuno",
				actorKind: "user",
				authenticatedIdentityRefs: ["identity:local:nuno"],
				status: "active",
				createdAt: "2026-08-01T10:00:00.000Z",
				updatedAt: "2026-08-01T10:00:00.000Z",
			},
		],
		pairings: [
			{
				pairingId: "pairing:app-laptop",
				clientKind: "app",
				clientInstanceId: "app:laptop",
				authenticationRef: "auth:pairing:app-laptop",
				authenticatedIdentityRef: "identity:local:nuno",
				actorId: "user:nuno",
				status: "active",
				pairedAt: "2026-08-01T10:00:00.000Z",
				updatedAt: "2026-08-01T10:00:00.000Z",
				expiresAt: "2027-08-01T10:00:00.000Z",
			},
		],
		projects: [
			{
				projectId: "project:codewiki",
				repositoryIdentity: digest("1"),
				projectRoot: "/projects/codewiki",
				runtimeRouteRef: "runtime:codewiki",
				status: "active",
				registeredAt: "2026-08-01T10:00:00.000Z",
				updatedAt: "2026-08-01T10:00:00.000Z",
			},
		],
		...overrides,
	};
}

const authentication = {
	clientKind: "app",
	clientInstanceId: "app:laptop",
	authenticationRef: "auth:pairing:app-laptop",
	authenticatedIdentityRef: "identity:local:nuno",
};

describe("Host App lifecycle", () => {
	it("detects when Pi still has a replaced pinned runtime loaded", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-dashboard-health-"));
		try {
			await mkdir(
				join(
					root,
					".pi",
					"npm",
					"node_modules",
					"@nunomoura",
					"codewiki",
					"dist",
					"host",
					"app",
				),
				{ recursive: true },
			);
			await writeFile(
				join(root, ".pi", "codewiki-controller.json"),
				pin("a".repeat(40), "1".repeat(64)),
			);
			const moduleUrl = pathToFileURL(
				join(
					root,
					".pi",
					"npm",
					"node_modules",
					"@nunomoura",
					"codewiki",
					"dist",
					"host",
					"app",
					"daemon.js",
				),
			).href;
			const loaded = captureInstalledCodewikiRuntimeIdentity(moduleUrl);
			assert.deepEqual(loaded, {
				commit: "a".repeat(40),
				packageSha256: "1".repeat(64),
			});
			assert.equal(
				installedCodewikiRuntimeHealth(loaded, root).status,
				"current",
			);

			await writeFile(
				join(root, ".pi", "codewiki-controller.json"),
				pin("b".repeat(40), "2".repeat(64)),
			);
			assert.equal(
				installedCodewikiRuntimeHealth(loaded, root).status,
				"mismatch",
			);
			assert.throws(
				() => assertInstalledCodewikiRuntimeCurrent(loaded, root),
				/Fully exit and restart Pi; \/reload is not sufficient/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects an endpoint that cannot serve pipeline state", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-dashboard-state-"));
		try {
			await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
			await writeFile(
				join(root, ".codewiki", "traces", "TRACE-invalid.jsonl"),
				`${JSON.stringify({
					type: "trace_event",
					id: "TRACE-invalid:decision:iteration:1",
					parentId: null,
					traceId: "TRACE-invalid",
					sequence: 1,
					loop: "decision",
					event: "change_approved",
					refs: [],
					createdAt: "2026-07-12T00:00:00.000Z",
					data: {},
				})}\n`,
			);
			await assert.rejects(
				() =>
					startCodewikiAppServer({
						repoRoot: root,
						open: false,
						keepAlive: false,
						inProcess: true,
						persistent: false,
					}),
				/did not serve pipeline state/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("leaves ordinary non-controller installs unmanaged", () => {
		const loaded = captureInstalledCodewikiRuntimeIdentity(
			pathToFileURL("/tmp/codewiki/dist/host/app/daemon.js").href,
		);
		assert.equal(loaded, undefined);
		assert.deepEqual(installedCodewikiRuntimeHealth(loaded, "/tmp/codewiki"), {
			status: "unmanaged",
		});
	});
});

describe("Host registry and pairing", () => {
	it("resolves stable actor, paired client, and project route from trusted authentication", () => {
		const normalized = normalizeHostRegistrySnapshot(registry());
		const resolved = resolveHostConnection({
			registry: normalized,
			expectedRegistryGeneration: normalized.generation,
			authentication,
			repositoryIdentity: digest("1"),
			now: new Date("2026-08-13T10:00:00.000Z"),
		});
		assert.deepEqual(resolved.actor, {
			actorId: "user:nuno",
			authenticatedIdentityRef: "identity:local:nuno",
		});
		assert.deepEqual(resolved.client, {
			clientKind: "app",
			clientInstanceId: "app:laptop",
			authenticationRef: "auth:pairing:app-laptop",
		});
		assert.equal(resolved.project.runtimeRouteRef, "runtime:codewiki");
		assert.equal(Object.isFrozen(resolved), true);
	});

	it("persists canonical snapshots under generation CAS and an exclusive writer lock", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-host-registry-"));
		try {
			assert.equal(await readHostRegistrySnapshot(root), undefined);
			const first = normalizeHostRegistrySnapshot(registry({generation: 1}));
			await writeHostRegistrySnapshot({
				hostStateRoot: root,
				expectedGeneration: 0,
				snapshot: first,
			});
			assert.deepEqual(await readHostRegistrySnapshot(root), first);
			if (process.platform !== "win32") {
				assert.equal((await stat(join(root, "registry.json"))).mode & 0o777, 0o600);
			}
			await assert.rejects(
				() =>
					writeHostRegistrySnapshot({
						hostStateRoot: root,
						expectedGeneration: 0,
						snapshot: first,
					}),
				/generation conflict|next generation/,
			);
			const lock = await open(join(root, "registry.lock"), "wx", 0o600);
			try {
				await assert.rejects(
					() =>
						writeHostRegistrySnapshot({
							hostStateRoot: root,
							expectedGeneration: 1,
							snapshot: normalizeHostRegistrySnapshot(
								registry({generation: 2}),
							),
						}),
					/Another Host registry write is in progress/,
				);
			} finally {
				await lock.close();
				await rm(join(root, "registry.lock"), {force: true});
			}

			await assert.rejects(
				() =>
					writeHostRegistrySnapshot({
						hostStateRoot: root,
						expectedGeneration: 1,
						snapshot: normalizeHostRegistrySnapshot(
							registry({
								generation: 2,
								generatedAt: "2026-08-14T10:00:00.000Z",
								actors: [{...registry().actors[0], actorKind: "service"}],
							}),
						),
					}),
			/cannot change actor kind/,
			);
			const disabled = normalizeHostRegistrySnapshot(
				registry({
					generation: 2,
					generatedAt: "2026-08-14T10:00:00.000Z",
					actors: [
						{
							...registry().actors[0],
							status: "disabled",
							updatedAt: "2026-08-14T10:00:00.000Z",
						},
					],
				}),
			);
			await writeHostRegistrySnapshot({
				hostStateRoot: root,
				expectedGeneration: 1,
				snapshot: disabled,
			});
			await assert.rejects(
				() =>
					writeHostRegistrySnapshot({
						hostStateRoot: root,
						expectedGeneration: 2,
						snapshot: normalizeHostRegistrySnapshot(
							registry({
								generation: 3,
								generatedAt: "2026-08-15T10:00:00.000Z",
								actors: [
									{
										...registry().actors[0],
										updatedAt: "2026-08-15T10:00:00.000Z",
									},
								],
							}),
						),
					}),
			/cannot reactivate actor record/,
			);
		} finally {
			await rm(root, {recursive: true, force: true});
		}
	});

	it("rejects unsupported records and ambiguous identity mappings", () => {
		assert.throws(
			() => normalizeHostRegistrySnapshot({...registry(), credential: "secret"}),
			/unsupported field credential/,
		);
		assert.throws(
			() =>
				normalizeHostRegistrySnapshot(
					registry({
						actors: [
							...registry().actors,
							{...registry().actors[0], actorId: "service:agent"},
						],
					}),
				),
			/maps to multiple actors/,
		);
		assert.throws(
			() =>
				normalizeHostRegistrySnapshot(
					registry({
						pairings: [
							...registry().pairings,
							{
								...registry().pairings[0],
								pairingId: "pairing:app-laptop-duplicate",
								authenticationRef: "auth:pairing:duplicate",
							},
						],
					}),
				),
			/multiple active pairings for one client instance/,
		);
	});

	it("fails closed for revoked, expired, mismatched, disabled, and unknown records", () => {
		const now = new Date("2026-08-13T10:00:00.000Z");
		const resolve = (registryValue, assertion = authentication, identity = digest("1")) => {
			const normalized = normalizeHostRegistrySnapshot(registryValue);
			return resolveHostConnection({
				registry: normalized,
				expectedRegistryGeneration: normalized.generation,
				authentication: assertion,
				repositoryIdentity: identity,
				now,
			});
		};
		assert.throws(
			() =>
				resolveHostConnection({
					registry: normalizeHostRegistrySnapshot(registry()),
					expectedRegistryGeneration: 7,
					authentication,
					repositoryIdentity: digest("1"),
					now: new Date("2026-08-12T10:00:00.000Z"),
				}),
			/future-dated/,
		);
		assert.throws(
			() =>
				resolveHostConnection({
					registry: normalizeHostRegistrySnapshot(registry()),
					expectedRegistryGeneration: 6,
					authentication,
					repositoryIdentity: digest("1"),
					now,
				}),
			/registry generation is stale/,
		);
		assert.throws(
			() => resolve(registry({pairings: [{...registry().pairings[0], status: "revoked"}]})),
			/pairing is not active/,
		);
		assert.throws(
			() =>
				resolve(
					registry({
						pairings: [
							{
								...registry().pairings[0],
								expiresAt: "2026-08-13T10:00:00.000Z",
							},
						],
					}),
				),
			/pairing has expired/,
		);
		assert.throws(
			() => resolve(registry(), {...authentication, clientInstanceId: "app:forged"}),
			/assertion does not match pairing/,
		);
		assert.throws(
			() => resolve(registry({actors: [{...registry().actors[0], status: "disabled"}]})),
			/actor mapping is not active/,
		);
		assert.throws(
			() => resolve(registry(), authentication, digest("9")),
			/project registration is not active/,
		);
	});
});
