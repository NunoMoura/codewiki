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
import {
	serverOidcIdentity,
	verifyServerOidcAuthentication,
} from "../../../src/server/authentication/oidc.ts";
import { verifyServerAuthentication } from "../../../src/server/authentication/proof.ts";
import {
	issueClientPairing,
	revokeClientPairing,
} from "../../../src/server/pairing/commands.ts";
import {enrollServerOidcActor} from "../../../src/server/registry/enrollment.ts";
import {resolveLocalAppServerConnection} from "../../../src/server/registry/local.ts";
import {
	SERVER_REGISTRY_PROTOCOL,
	normalizeServerRegistrySnapshot,
	readServerRegistrySnapshot,
	resolveServerConnection,
	writeServerRegistrySnapshot,
} from "../../../src/server/registry/state.ts";
import {
	authorizeServerEndpoint,
	normalizeServerSessionRecord,
	openServerSession,
	revokeServerSession,
	rotateServerSession,
} from "../../../src/server/sessions/state.ts";

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
				authenticatedIdentities: [
					{kind: "local", identityRef: "identity:local:nuno"},
				],
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
						serverStateRoot: join(root, ".server-state"),
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

describe("Server registry, Client pairing, and Sessions", () => {
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

	it("verifies exact OIDC claims and enrolls immutable issuer-subject identity without authority", async () => {
		const now = new Date("2026-08-13T10:00:00.000Z");
		const expectedNonce = "n".repeat(32);
		const claims = {
			clientKind: "app",
			clientInstanceId: "app:browser-1",
			issuer: "https://identity.example.test/tenant",
			subject: "provider-user-42",
			audience: "codewiki-team",
			nonce: expectedNonce,
			issuedAt: "2026-08-13T09:59:30.000Z",
			expiresAt: "2026-08-13T10:04:30.000Z",
		};
		const verified = await verifyServerOidcAuthentication({
			adapter: {
				adapterId: "test.oidc@1.0.0",
				async verify(request) {
					assert.equal(request.proof, "opaque-code-proof");
					assert.equal(request.expected.issuer, claims.issuer);
					return claims;
				},
			},
			request: {
				clientKind: "app",
				clientInstanceId: "app:browser-1",
				proof: "opaque-code-proof",
			},
			expectedIssuer: claims.issuer,
			expectedAudience: claims.audience,
			expectedNonce,
			now,
		});
		assert.deepEqual(verified.identity, serverOidcIdentity(claims.issuer, claims.subject));
		assert.match(verified.assertion.authenticationRef, /^auth:oidc:[a-f0-9]{64}$/);
		assert.equal(JSON.stringify(verified).includes("opaque-code-proof"), false);

		const base = normalizeServerRegistrySnapshot(registry());
		const enrolled = enrollServerOidcActor({
			registry: base,
			expectedRegistryGeneration: base.generation,
			authentication: verified,
			now: new Date("2026-08-13T10:00:01.000Z"),
		});
		assert.equal(enrolled.created, true);
		assert.match(enrolled.actor.actorId, /^user:oidc:/);
		assert.deepEqual(enrolled.actor.authenticatedIdentities, [verified.identity]);
		assert.equal(enrolled.registry.pairings.length, base.pairings.length);
		assert.equal(enrolled.registry.projects.length, base.projects.length);
		assert.equal(JSON.stringify(enrolled.registry).includes("username"), false);
		assert.equal(JSON.stringify(enrolled.registry).includes("authority"), false);
		const replay = enrollServerOidcActor({
			registry: enrolled.registry,
			expectedRegistryGeneration: enrolled.registry.generation,
			authentication: verified,
		});
		assert.equal(replay.created, false);
		assert.equal(replay.registry.generation, enrolled.registry.generation);
		assert.throws(
			() => enrollServerOidcActor({
				registry: enrolled.registry,
				expectedRegistryGeneration: base.generation,
				authentication: verified,
			}),
			/generation conflict/,
		);
		assert.throws(
			() => enrollServerOidcActor({
				registry: base,
				expectedRegistryGeneration: base.generation,
				authentication: structuredClone(verified),
			}),
			/lacks verifier provenance/,
		);
		const disabledRegistry = normalizeServerRegistrySnapshot({
			...enrolled.registry,
			generation: enrolled.registry.generation + 1,
			generatedAt: "2026-08-13T10:00:02.000Z",
			actors: enrolled.registry.actors.map((actor) =>
				actor.actorId === enrolled.actor.actorId
					? {...actor, status: "disabled", updatedAt: "2026-08-13T10:00:02.000Z"}
					: actor,
			),
		});
		assert.throws(
			() => enrollServerOidcActor({
				registry: disabledRegistry,
				expectedRegistryGeneration: disabledRegistry.generation,
				authentication: verified,
			}),
			/not active user enrollment/,
		);

		for (const [override, message] of [
			[{nonce: "x".repeat(32)}, /nonce does not match/],
			[{issuer: "https://other.example.test"}, /issuer does not match/],
			[{audience: "other-client"}, /audience does not match/],
			[{clientInstanceId: "app:other"}, /Client request/],
			[{expiresAt: "2026-08-13T09:59:59.000Z"}, /not currently valid/],
			[{expiresAt: "2026-08-13T10:20:00.000Z"}, /bounded token lifetime/],
			[{username: "mutable-name"}, /unsupported field username/],
		]) {
			await assert.rejects(
				() => verifyServerOidcAuthentication({
					adapter: {
						adapterId: "test.oidc@1.0.0",
						async verify() { return {...claims, ...override}; },
					},
					request: {clientKind: "app", clientInstanceId: "app:browser-1", proof: "opaque"},
					expectedIssuer: claims.issuer,
					expectedAudience: claims.audience,
					expectedNonce,
					now,
				}),
				message,
			);
		}
	});

	it("persists and resolves personal App Authentication, Pairing, and project routing", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-local-app-pairing-"));
		const serverStateRoot = join(root, "server-state");
		try {
			const first = await resolveLocalAppServerConnection({repoRoot: root, serverStateRoot});
			assert.match(first.actor.actorId, /^user:local:/);
			assert.match(first.actor.authenticatedIdentityRef, /^identity:local-os:/);
			assert.equal(first.client.clientKind, "app");
			assert.match(first.client.authenticationRef, /^auth:local-app:/);
			assert.equal(first.project.projectRoot, root);
			const stored = await readServerRegistrySnapshot(serverStateRoot);
			assert.equal(stored.actors.length, 1);
			assert.equal(stored.pairings.length, 1);
			assert.equal(stored.projects.length, 1);
			assert.equal(JSON.stringify(stored).includes("credential"), false);
			assert.equal(JSON.stringify(stored).includes("authority"), false);

			const revoked = revokeClientPairing({
				registry: stored,
				authentication: {
					clientKind: first.client.clientKind,
					clientInstanceId: first.client.clientInstanceId,
					authenticationRef: first.client.authenticationRef,
					authenticatedIdentityRef: first.actor.authenticatedIdentityRef,
				},
				command: {
					protocolId: CLIENT_PAIRING_PROTOCOL.id,
					protocolVersion: CLIENT_PAIRING_PROTOCOL.version,
					kind: "revoke",
					expectedRegistryGeneration: stored.generation,
					pairingId: stored.pairings[0].pairingId,
					expectedAuthenticationRef: first.client.authenticationRef,
				},
				now: new Date(Date.parse(stored.generatedAt) + 1),
			});
			await writeServerRegistrySnapshot({
				serverStateRoot,
				expectedGeneration: stored.generation,
				snapshot: revoked,
			});
			await assert.rejects(
				() => resolveLocalAppServerConnection({repoRoot: root, serverStateRoot}),
				/pairing is not active/,
			);
		} finally {
			await rm(root, {recursive: true, force: true});
		}
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
			() => normalizeServerRegistrySnapshot({
				...registry(),
				protocolVersion: "1.0.0",
			}),
			/protocol binding is invalid/,
		);
		assert.throws(
			() => normalizeServerRegistrySnapshot({
				...registry(),
				actors: [{
					...registry().actors[0],
					authenticatedIdentityRefs: ["identity:local:nuno"],
				}],
			}),
			/unsupported field authenticatedIdentityRefs/,
		);
		const oidc = serverOidcIdentity("https://identity.example.test", "subject-1");
		assert.throws(
			() => normalizeServerRegistrySnapshot({
				...registry(),
				actors: [{
					...registry().actors[0],
					authenticatedIdentities: [{...oidc, subject: "subject-1\nadmin"}],
				}],
			}),
			/bounded non-empty text/,
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

	it("opens, rotates, authorizes, and revokes one temporary Server session", async () => {
		const connection = resolveServerConnection({
			registry: normalizeServerRegistrySnapshot(registry()),
			expectedRegistryGeneration: 7,
			authentication,
			repositoryIdentity: digest("1"),
			now: new Date("2026-08-14T10:00:00.000Z"),
		});
		const opened = openServerSession({
			binding: {
				actor: connection.actor,
				client: connection.client,
				project: {
					projectId: connection.project.projectId,
					repositoryIdentity: connection.project.repositoryIdentity,
					runtimeRouteRef: connection.project.runtimeRouteRef,
				},
			},
			lifetimeSeconds: 600,
			now: new Date("2026-08-14T10:00:00.000Z"),
		});
		assert.equal(opened.session.generation, 1);
		assert.equal(opened.session.status, "active");
		assert.equal(JSON.stringify(opened.session).includes(opened.credential), false);
		assert.equal(Object.hasOwn(opened.session, "role"), false);

		let observed;
		const authorized = await authorizeServerEndpoint({
			session: opened.session,
			credential: opened.credential,
			expectedSessionGeneration: 1,
			endpoint: {
				endpointId: "app.state.read",
				method: "GET",
				repositoryIdentity: digest("1"),
			},
			adapter: {
				adapterId: "app-policy",
				authorize(context) {
					observed = context;
					return true;
				},
			},
			now: new Date("2026-08-14T10:01:00.000Z"),
		});
		assert.equal(authorized.authorizationAdapterId, "app-policy");
		assert.equal(authorized.requestContext.actor.actorId, "user:nuno");		assert.equal(authorized.requestContext.client.clientKind, "app");
		assert.equal(observed.endpoint.endpointId, "app.state.read");
		assert.equal(Object.hasOwn(observed, "credential"), false);

		const rotated = rotateServerSession({
			session: opened.session,
			credential: opened.credential,
			expectedSessionGeneration: 1,
			now: new Date("2026-08-14T10:02:00.000Z"),
		});
		assert.equal(rotated.session.generation, 2);
		assert.notEqual(rotated.credential, opened.credential);
		await assert.rejects(
			() => authorizeServerEndpoint({
				session: rotated.session,
				credential: opened.credential,
				expectedSessionGeneration: 2,
				endpoint: {
					endpointId: "app.state.read",
					method: "GET",
					repositoryIdentity: digest("1"),
				},
				adapter: {adapterId: "app-policy", authorize: () => true},
				now: new Date("2026-08-14T10:03:00.000Z"),
			}),
			/session credential is invalid/,
		);
		const revoked = revokeServerSession({
			session: rotated.session,
			credential: rotated.credential,
			expectedSessionGeneration: 2,
			now: new Date("2026-08-14T10:04:00.000Z"),
		});
		assert.equal(revoked.generation, 3);
		assert.equal(revoked.status, "revoked");
		await assert.rejects(
			() => authorizeServerEndpoint({
				session: revoked,
				credential: rotated.credential,
				expectedSessionGeneration: 3,
				endpoint: {
					endpointId: "app.state.read",
					method: "GET",
					repositoryIdentity: digest("1"),
				},
				adapter: {adapterId: "app-policy", authorize: () => true},
			}),
			/session is not active/,
		);
	});

	it("fails closed on Session drift, expiry, and endpoint denial", async () => {
		const opened = openServerSession({
			binding: {
				actor: {actorId: "user:nuno", authenticatedIdentityRef: "identity:local:nuno"},
				client: {
					clientKind: authentication.clientKind,
					clientInstanceId: authentication.clientInstanceId,
					authenticationRef: authentication.authenticationRef,
				},
				project: {
					projectId: "project:codewiki",
					repositoryIdentity: digest("1"),
					runtimeRouteRef: "runtime:codewiki",
				},
			},
			lifetimeSeconds: 60,
			now: new Date("2026-08-14T10:00:00.000Z"),
		});
		assert.throws(
			() => normalizeServerSessionRecord({...opened.session, role: "admin"}),
			/unsupported field role/,
		);
		await assert.rejects(
			() => authorizeServerEndpoint({
				session: opened.session,
				credential: opened.credential,
				expectedSessionGeneration: 1,
				endpoint: {endpointId: "app.state.read", method: "GET", repositoryIdentity: digest("1")},
				adapter: {adapterId: "app-policy", authorize: () => true},
				authority: "admin",
			}),
			/unsupported field authority/,
		);
		await assert.rejects(
			() => authorizeServerEndpoint({
				session: opened.session,
				credential: opened.credential,
				expectedSessionGeneration: 2,
				endpoint: {endpointId: "app.state.read", method: "GET", repositoryIdentity: digest("1")},
				adapter: {adapterId: "app-policy", authorize: () => true},
			}),
			/session generation is stale/,
		);
		await assert.rejects(
			() => authorizeServerEndpoint({
				session: opened.session,
				credential: opened.credential,
				expectedSessionGeneration: 1,
				endpoint: {endpointId: "app.state.read", method: "GET", repositoryIdentity: digest("9")},
				adapter: {adapterId: "app-policy", authorize: () => true},
				now: new Date("2026-08-14T10:00:30.000Z"),
			}),
			/repository binding does not match endpoint/,
		);
		await assert.rejects(
			() => authorizeServerEndpoint({
				session: opened.session,
				credential: opened.credential,
				expectedSessionGeneration: 1,
				endpoint: {endpointId: "app.state.read", method: "GET", repositoryIdentity: digest("1")},
				adapter: {adapterId: "app-policy", authorize: () => false},
				now: new Date("2026-08-14T10:00:30.000Z"),
			}),
			/endpoint authorization denied/,
		);
		await assert.rejects(
			() => authorizeServerEndpoint({
				session: opened.session,
				credential: opened.credential,
				expectedSessionGeneration: 1,
				endpoint: {endpointId: "app.state.read", method: "GET", repositoryIdentity: digest("1")},
				adapter: {adapterId: "app-policy", authorize: () => true},
				now: new Date("2026-08-14T10:01:00.000Z"),
			}),
			/session has expired/,
		);
	});
});
