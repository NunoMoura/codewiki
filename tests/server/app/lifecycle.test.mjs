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
} from "../../../src/server/app/installed-runtime.ts";
import {startCodewikiAppServer} from "../../../src/server/app/server.ts";
import { CLIENT_PAIRING_PROTOCOL } from "../../../src/protocol/client-pairing.ts";
import { verifyServerAuthentication } from "../../../src/server/authentication/proof.ts";
import {
	issueClientPairing,
	revokeClientPairing,
} from "../../../src/server/pairing/commands.ts";
import {
	SERVER_REGISTRY_PROTOCOL,
	normalizeServerRegistrySnapshot,
	readServerRegistrySnapshot,
	resolveServerConnection,
	writeServerRegistrySnapshot,
} from "../../../src/server/registry/state.ts";

function pin(commit, sha256) {
	return JSON.stringify({
		source: { commit },
		package: { sha256 },
	});
}

const digest = (character) => `sha256:${character.repeat(64)}`;

function registry(overrides = {}) {
	return {
		protocolId: SERVER_REGISTRY_PROTOCOL.id,
		protocolVersion: SERVER_REGISTRY_PROTOCOL.version,
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

describe("Server App lifecycle", () => {
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
					"server",
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
					"server",
					"app",
					"server.js",
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
			pathToFileURL("/tmp/codewiki/dist/server/app/server.js").href,
		);
		assert.equal(loaded, undefined);
		assert.deepEqual(installedCodewikiRuntimeHealth(loaded, "/tmp/codewiki"), {
			status: "unmanaged",
		});
	});
});

describe("Server registry and Client pairing", () => {
	it("resolves stable actor, paired client, and project route from trusted authentication", () => {
		const normalized = normalizeServerRegistrySnapshot(registry());
		const resolved = resolveServerConnection({
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
		const root = await mkdtemp(join(tmpdir(), "codewiki-server-registry-"));
		try {
			assert.equal(await readServerRegistrySnapshot(root), undefined);
			const first = normalizeServerRegistrySnapshot(registry({generation: 1}));
			await writeServerRegistrySnapshot({
				serverStateRoot: root,
				expectedGeneration: 0,
				snapshot: first,
			});
			assert.deepEqual(await readServerRegistrySnapshot(root), first);
			if (process.platform !== "win32") {
				assert.equal((await stat(join(root, "registry.json"))).mode & 0o777, 0o600);
			}
			await assert.rejects(
				() =>
					writeServerRegistrySnapshot({
						serverStateRoot: root,
						expectedGeneration: 0,
						snapshot: first,
					}),
				/generation conflict|next generation/,
			);
			const lock = await open(join(root, "registry.lock"), "wx", 0o600);
			try {
				await assert.rejects(
					() =>
						writeServerRegistrySnapshot({
							serverStateRoot: root,
							expectedGeneration: 1,
							snapshot: normalizeServerRegistrySnapshot(
								registry({generation: 2}),
							),
						}),
					/Another Server registry write is in progress/,
				);
			} finally {
				await lock.close();
				await rm(join(root, "registry.lock"), {force: true});
			}

			await assert.rejects(
				() =>
					writeServerRegistrySnapshot({
						serverStateRoot: root,
						expectedGeneration: 1,
						snapshot: normalizeServerRegistrySnapshot(
							registry({
								generation: 2,
								generatedAt: "2026-08-14T10:00:00.000Z",
								actors: [{...registry().actors[0], actorKind: "service"}],
							}),
						),
					}),
			/cannot change actor kind/,
			);
			const disabled = normalizeServerRegistrySnapshot(
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
			await writeServerRegistrySnapshot({
				serverStateRoot: root,
				expectedGeneration: 1,
				snapshot: disabled,
			});
			await assert.rejects(
				() =>
					writeServerRegistrySnapshot({
						serverStateRoot: root,
						expectedGeneration: 2,
						snapshot: normalizeServerRegistrySnapshot(
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
			() =>
				normalizeServerRegistrySnapshot({
					...registry(),
					protocolId: "codewiki.host-registry",
				}),
			/protocol binding is invalid/,
		);
		assert.throws(
			() => normalizeServerRegistrySnapshot({...registry(), credential: "secret"}),
			/unsupported field credential/,
		);
		assert.throws(
			() =>
				normalizeServerRegistrySnapshot(
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
				normalizeServerRegistrySnapshot(
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

	it("verifies transient proof then issues and revokes one exact pairing", async () => {
		const request = {
			clientKind: "cli",
			clientInstanceId: "cli:desktop",
			proof: {transient: "not-persisted"},
		};
		const verified = await verifyServerAuthentication({
			adapter: {
				adapterId: "local-test",
				async verify(received) {
					assert.deepEqual(received, request);
					return {
						clientKind: "cli",
						clientInstanceId: "cli:desktop",
						authenticationRef: "auth:pairing:cli-desktop",
						authenticatedIdentityRef: "identity:local:nuno",
					};
				},
			},
			request,
		});
		const issued = issueClientPairing({
			registry: normalizeServerRegistrySnapshot(registry()),
			authentication: verified,
			command: {
				protocolId: CLIENT_PAIRING_PROTOCOL.id,
				protocolVersion: CLIENT_PAIRING_PROTOCOL.version,
				kind: "issue",
				expectedRegistryGeneration: 7,
				pairingId: "pairing:cli-desktop",
				clientKind: "cli",
				clientInstanceId: "cli:desktop",
				expiresInSeconds: 31_536_000,
			},
			now: new Date("2026-08-14T10:00:00.000Z"),
		});
		assert.equal(issued.generation, 8);
		assert.deepEqual(issued.pairings.at(-1), {
			pairingId: "pairing:cli-desktop",
			clientKind: "cli",
			clientInstanceId: "cli:desktop",
			authenticationRef: "auth:pairing:cli-desktop",
			authenticatedIdentityRef: "identity:local:nuno",
			actorId: "user:nuno",
			status: "active",
			pairedAt: "2026-08-14T10:00:00.000Z",
			updatedAt: "2026-08-14T10:00:00.000Z",
			expiresAt: "2027-08-14T10:00:00.000Z",
		});
		assert.equal(JSON.stringify(issued).includes("not-persisted"), false);

		const revoked = revokeClientPairing({
			registry: issued,
			authentication: verified,
			command: {
				protocolId: CLIENT_PAIRING_PROTOCOL.id,
				protocolVersion: CLIENT_PAIRING_PROTOCOL.version,
				kind: "revoke",
				expectedRegistryGeneration: 8,
				pairingId: "pairing:cli-desktop",
				expectedAuthenticationRef: "auth:pairing:cli-desktop",
			},
			now: new Date("2026-08-15T10:00:00.000Z"),
		});
		assert.equal(revoked.generation, 9);
		assert.equal(revoked.pairings.at(-1).status, "revoked");
		assert.equal(revoked.pairings.at(-1).updatedAt, "2026-08-15T10:00:00.000Z");
	});

	it("fails closed on proof and pairing command drift", async () => {
		await assert.rejects(
			() =>
				verifyServerAuthentication({
					adapter: {
						adapterId: "unused",
						async verify() {
							return authentication;
						},
					},
					request: {clientKind: "app", clientInstanceId: "app:new"},
				}),
			/proof is required/,
		);
		await assert.rejects(
			() =>
				verifyServerAuthentication({
					adapter: {
						adapterId: "rejecting",
						async verify() {
							throw new Error("invalid proof");
						},
					},
					request: {clientKind: "app", clientInstanceId: "app:new", proof: "x"},
				}),
			/^Error: Server authentication adapter rejected proof\.$/,
		);
		await assert.rejects(
			() =>
				verifyServerAuthentication({
					adapter: {
						adapterId: "forging",
						async verify() {
							return {...authentication, clientInstanceId: "app:other", actorId: "user:nuno"};
						},
					},
					request: {clientKind: "app", clientInstanceId: "app:new", proof: "x"},
				}),
			/unsupported field actorId/,
		);

		const issue = (overrides = {}, assertion = {
			...authentication,
			clientKind: "cli",
			clientInstanceId: "cli:new",
			authenticationRef: "auth:pairing:cli-new",
		}) => issueClientPairing({
			registry: normalizeServerRegistrySnapshot(registry()),
			authentication: assertion,
			command: {
				protocolId: CLIENT_PAIRING_PROTOCOL.id,
				protocolVersion: CLIENT_PAIRING_PROTOCOL.version,
				kind: "issue",
				expectedRegistryGeneration: 7,
				pairingId: "pairing:cli-new",
				clientKind: "cli",
				clientInstanceId: "cli:new",
				...overrides,
			},
			now: new Date("2026-08-14T10:00:00.000Z"),
		});
		assert.throws(
			() => issue({ protocolId: "codewiki.host-pairing" }),
			/protocol binding is invalid/,
		);
		assert.throws(() => issue({authority: "admin"}), /unsupported field authority/);
		assert.throws(() => issue({expectedRegistryGeneration: 6}), /generation conflict/);
		assert.throws(() => issue({actorId: "user:unknown"}), /unsupported field actorId/);
		assert.throws(
			() => issue({}, {...authentication, clientKind: "app", clientInstanceId: "app:new"}),
			/authentication does not match requested Client/,
		);
		assert.throws(
			() =>
				issue(
					{clientKind: "app", clientInstanceId: "app:laptop"},
					{...authentication, authenticationRef: "auth:pairing:app-laptop-new"},
				),
			/active pairing/,
		);
		assert.throws(
			() => issue({occurredAt: "2026-08-14T10:00:00.000Z"}),
			/unsupported field occurredAt/,
		);
		assert.throws(
			() => issue({expiresInSeconds: 31_536_001}),
			/expiresInSeconds must be a bounded positive safe integer/,
		);
		assert.throws(
			() => revokeClientPairing({
				registry: normalizeServerRegistrySnapshot(registry()),
				authentication,
				command: {
					protocolId: CLIENT_PAIRING_PROTOCOL.id,
					protocolVersion: CLIENT_PAIRING_PROTOCOL.version,
					kind: "revoke",
					expectedRegistryGeneration: 7,
					pairingId: "pairing:app-laptop",
					expectedAuthenticationRef: "auth:forged",
				},
				now: new Date("2026-08-14T10:00:00.000Z"),
			}),
			/authentication reference changed/,
		);
	});

	it("fails closed for revoked, expired, mismatched, disabled, and unknown records", () => {
		const now = new Date("2026-08-13T10:00:00.000Z");
		const resolve = (registryValue, assertion = authentication, identity = digest("1")) => {
			const normalized = normalizeServerRegistrySnapshot(registryValue);
			return resolveServerConnection({
				registry: normalized,
				expectedRegistryGeneration: normalized.generation,
				authentication: assertion,
				repositoryIdentity: identity,
				now,
			});
		};
		assert.throws(
			() =>
				resolveServerConnection({
					registry: normalizeServerRegistrySnapshot(registry()),
					expectedRegistryGeneration: 7,
					authentication,
					repositoryIdentity: digest("1"),
					now: new Date("2026-08-12T10:00:00.000Z"),
				}),
			/future-dated/,
		);
		assert.throws(
			() =>
				resolveServerConnection({
					registry: normalizeServerRegistrySnapshot(registry()),
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
