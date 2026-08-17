import assert from "node:assert/strict";
import {mkdir, mkdtemp, open, rm, stat, writeFile} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import {
	assertInstalledCodewikiCurrent,
	captureInstalledCodewikiIdentity,
	installedCodewikiHealth,
} from "../../../src/project-server/app/installed-codewiki.ts";
import {startCodewikiAppServer} from "../../../src/project-server/app/server.ts";
import { CLIENT_PAIRING_PROTOCOL } from "../../../src/protocol/client-pairing.ts";
import {
	projectServerOidcIdentity,
	verifyProjectServerOidcAuthentication,
} from "../../../src/project-server/authentication/oidc.ts";
import { verifyProjectServerAuthentication } from "../../../src/project-server/authentication/proof.ts";
import {
	issueAuthorizedClientPairing,
	revokeAuthorizedClientPairing,
} from "../../../src/project-server/pairing/authorization.ts";
import {
	issueClientPairing,
	revokeClientPairing,
} from "../../../src/project-server/pairing/commands.ts";
import {
	assertVerifiedProjectServerRepositoryAccess,
	checkProjectServerProviderRepositoryAccess,
} from "../../../src/project-server/repository-access/check.ts";
import {enrollProjectServerOidcActor} from "../../../src/project-server/registry/enrollment.ts";
import {resolveLocalAppServerConnection} from "../../../src/project-server/registry/local.ts";
import {
	PROJECT_SERVER_REGISTRY_PROTOCOL,
	normalizeProjectServerRegistrySnapshot,
	readProjectServerRegistrySnapshot,
	resolveProjectServerConnection,
	writeProjectServerRegistrySnapshot,
} from "../../../src/project-server/registry/state.ts";
import {
	authorizeProjectServerEndpoint,
	normalizeProjectServerSessionRecord,
	openProjectServerSession,
	revokeProjectServerSession,
	rotateProjectServerSession,
} from "../../../src/project-server/sessions/state.ts";

function pin(commit, sha256) {
	return JSON.stringify({
		source: { commit },
		package: { sha256 },
	});
}

const digest = (character) => `sha256:${character.repeat(64)}`;

function registry(overrides = {}) {
	return {
		protocolId: PROJECT_SERVER_REGISTRY_PROTOCOL.id,
		protocolVersion: PROJECT_SERVER_REGISTRY_PROTOCOL.version,
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
				projectServerRouteRef: "runtime:codewiki",
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
			const loaded = captureInstalledCodewikiIdentity(moduleUrl);
			assert.deepEqual(loaded, {
				commit: "a".repeat(40),
				packageSha256: "1".repeat(64),
			});
			assert.equal(
				installedCodewikiHealth(loaded, root).status,
				"current",
			);

			await writeFile(
				join(root, ".pi", "codewiki-controller.json"),
				pin("b".repeat(40), "2".repeat(64)),
			);
			assert.equal(
				installedCodewikiHealth(loaded, root).status,
				"mismatch",
			);
			assert.throws(
				() => assertInstalledCodewikiCurrent(loaded, root),
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
						projectServerStateRoot: join(root, ".server-state"),
					}),
				/did not serve pipeline state/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("leaves ordinary non-controller installs unmanaged", () => {
		const loaded = captureInstalledCodewikiIdentity(
			pathToFileURL("/tmp/codewiki/dist/project-server/app/server.js").href,
		);
		assert.equal(loaded, undefined);
		assert.deepEqual(installedCodewikiHealth(loaded, "/tmp/codewiki"), {
			status: "unmanaged",
		});
	});
});

describe("Server registry, Client pairing, and Sessions", () => {
	it("resolves stable actor, paired client, and project route from trusted authentication", () => {
		const normalized = normalizeProjectServerRegistrySnapshot(registry());
		const resolved = resolveProjectServerConnection({
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
		assert.equal(resolved.project.projectServerRouteRef, "runtime:codewiki");
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
		const verified = await verifyProjectServerOidcAuthentication({
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
		assert.deepEqual(verified.identity, projectServerOidcIdentity(claims.issuer, claims.subject));
		assert.match(verified.assertion.authenticationRef, /^auth:oidc:[a-f0-9]{64}$/);
		assert.equal(JSON.stringify(verified).includes("opaque-code-proof"), false);

		const base = normalizeProjectServerRegistrySnapshot(registry());
		const enrolled = enrollProjectServerOidcActor({
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
		const replay = enrollProjectServerOidcActor({
			registry: enrolled.registry,
			expectedRegistryGeneration: enrolled.registry.generation,
			authentication: verified,
		});
		assert.equal(replay.created, false);
		assert.equal(replay.registry.generation, enrolled.registry.generation);
		assert.throws(
			() => enrollProjectServerOidcActor({
				registry: enrolled.registry,
				expectedRegistryGeneration: base.generation,
				authentication: verified,
			}),
			/generation conflict/,
		);
		assert.throws(
			() => enrollProjectServerOidcActor({
				registry: base,
				expectedRegistryGeneration: base.generation,
				authentication: structuredClone(verified),
			}),
			/lacks verifier provenance/,
		);
		const disabledRegistry = normalizeProjectServerRegistrySnapshot({
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
			() => enrollProjectServerOidcActor({
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
				() => verifyProjectServerOidcAuthentication({
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

	it("checks provider repository access as coarse expiring evidence without authority", async () => {
		const now = new Date("2026-08-13T10:00:00.000Z");
		const issuer = "https://identity.example.test/tenant";
		const identity = projectServerOidcIdentity(issuer, "provider-user-42");
		const authentication = await verifyProjectServerOidcAuthentication({
			adapter: {
				adapterId: "test.oidc@1.0.0",
				async verify() {
					return {
						clientKind: "app",
						clientInstanceId: "app:browser-1",
						issuer,
						subject: identity.subject,
						audience: "codewiki-team",
						nonce: "n".repeat(32),
						issuedAt: "2026-08-13T09:59:30.000Z",
						expiresAt: "2026-08-13T10:04:30.000Z",
					};
				},
			},
			request: {
				clientKind: "app",
				clientInstanceId: "app:browser-1",
				proof: "opaque-code-proof",
			},
			expectedIssuer: issuer,
			expectedAudience: "codewiki-team",
			expectedNonce: "n".repeat(32),
			now,
		});
		const observation = {
			authenticatedIdentityRef: identity.identityRef,
			repositoryIdentity: digest("1"),
			providerRepositoryRef: "github:repository:123456",
			access: "accessible",
			checkedAt: "2026-08-13T09:59:59.000Z",
			expiresAt: "2026-08-13T10:04:59.000Z",
		};
		const evidence = await checkProjectServerProviderRepositoryAccess({
			adapter: {
				adapterId: "test.github-access@1.0.0",
				providerId: "github",
				issuer,
				async check(request) {
					assert.deepEqual(request.identity, identity);
					assert.equal(request.repositoryIdentity, digest("1"));
					assert.equal(request.providerRepositoryRef, observation.providerRepositoryRef);
					assert.equal(JSON.stringify(request).includes("opaque-code-proof"), false);
					return observation;
				},
			},
			authentication,
			repositoryIdentity: digest("1"),
			providerRepositoryRef: observation.providerRepositoryRef,
			now,
		});
		assert.equal(evidence.access, "accessible");
		assert.equal(evidence.repositoryIdentity, digest("1"));
		assert.match(evidence.evidenceRef, /^repository-access:[a-f0-9]{64}$/);
		assert.equal(Object.isFrozen(evidence), true);
		assert.doesNotMatch(JSON.stringify(evidence), /role|permission|capability|authority|token/);
		assert.doesNotThrow(() => assertVerifiedProjectServerRepositoryAccess(evidence));
		assert.throws(
			() => assertVerifiedProjectServerRepositoryAccess(structuredClone(evidence)),
			/lacks verifier provenance/,
		);
		await assert.rejects(
			() => checkProjectServerProviderRepositoryAccess({
				adapter: {
					adapterId: "test.github-access@1.0.0",
					providerId: "github",
					issuer,
					async check() { return observation; },
				},
				authentication: structuredClone(authentication),
				repositoryIdentity: digest("1"),
				providerRepositoryRef: observation.providerRepositoryRef,
				now,
			}),
			/lacks verifier provenance/,
		);

		for (const [override, message] of [
			[{authenticatedIdentityRef: projectServerOidcIdentity(issuer, "other").identityRef}, /identity does not match/],
			[{repositoryIdentity: digest("2")}, /repository identity does not match/],
			[{providerRepositoryRef: "github:repository:other"}, /repository does not match/],
			[{expiresAt: "2026-08-13T09:59:59.000Z"}, /not currently valid/],
			[{expiresAt: "2026-08-13T10:20:00.000Z"}, /bounded lifetime/],
			[{access: "admin"}, /accessible or inaccessible/],
			[{permission: "admin"}, /unsupported field permission/],
		]) {
			await assert.rejects(
				() => checkProjectServerProviderRepositoryAccess({
					adapter: {
						adapterId: "test.github-access@1.0.0",
						providerId: "github",
						issuer,
						async check() { return {...observation, ...override}; },
					},
					authentication,
					repositoryIdentity: digest("1"),
					providerRepositoryRef: observation.providerRepositoryRef,
					now,
				}),
				message,
			);
		}
		await assert.rejects(
			() => checkProjectServerProviderRepositoryAccess({
				adapter: {
					adapterId: "test.gitlab-access@1.0.0",
					providerId: "gitlab",
					issuer,
					async check() { return observation; },
				},
				authentication,
				repositoryIdentity: digest("1"),
				providerRepositoryRef: observation.providerRepositoryRef,
				now,
			}),
			/provider-bound identifier/,
		);
		const inaccessible = await checkProjectServerProviderRepositoryAccess({
			adapter: {
				adapterId: "test.github-access@1.0.0",
				providerId: "github",
				issuer,
				async check() { return {...observation, access: "inaccessible"}; },
			},
			authentication,
			repositoryIdentity: digest("1"),
			providerRepositoryRef: observation.providerRepositoryRef,
			now,
		});
		assert.equal(inaccessible.access, "inaccessible");
	});

	it("persists and resolves personal App Authentication, Pairing, and project routing", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-local-app-pairing-"));
		const projectServerStateRoot = join(root, "server-state");
		try {
			const first = await resolveLocalAppServerConnection({repoRoot: root, projectServerStateRoot});
			assert.match(first.actor.actorId, /^user:local:/);
			assert.match(first.actor.authenticatedIdentityRef, /^identity:local-os:/);
			assert.equal(first.client.clientKind, "app");
			assert.match(first.client.authenticationRef, /^auth:local-app:/);
			assert.equal(first.project.projectRoot, root);
			const stored = await readProjectServerRegistrySnapshot(projectServerStateRoot);
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
			await writeProjectServerRegistrySnapshot({
				projectServerStateRoot,
				expectedGeneration: stored.generation,
				snapshot: revoked,
			});
			await assert.rejects(
				() => resolveLocalAppServerConnection({repoRoot: root, projectServerStateRoot}),
				/pairing is not active/,
			);
		} finally {
			await rm(root, {recursive: true, force: true});
		}
	});

	it("persists canonical snapshots under generation CAS and an exclusive writer lock", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-server-registry-"));
		try {
			assert.equal(await readProjectServerRegistrySnapshot(root), undefined);
			const first = normalizeProjectServerRegistrySnapshot(registry({generation: 1}));
			await writeProjectServerRegistrySnapshot({
				projectServerStateRoot: root,
				expectedGeneration: 0,
				snapshot: first,
			});
			assert.deepEqual(await readProjectServerRegistrySnapshot(root), first);
			if (process.platform !== "win32") {
				assert.equal((await stat(join(root, "registry.json"))).mode & 0o777, 0o600);
			}
			await assert.rejects(
				() =>
					writeProjectServerRegistrySnapshot({
						projectServerStateRoot: root,
						expectedGeneration: 0,
						snapshot: first,
					}),
				/generation conflict|next generation/,
			);
			const lock = await open(join(root, "registry.lock"), "wx", 0o600);
			try {
				await assert.rejects(
					() =>
						writeProjectServerRegistrySnapshot({
							projectServerStateRoot: root,
							expectedGeneration: 1,
							snapshot: normalizeProjectServerRegistrySnapshot(
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
					writeProjectServerRegistrySnapshot({
						projectServerStateRoot: root,
						expectedGeneration: 1,
						snapshot: normalizeProjectServerRegistrySnapshot(
							registry({
								generation: 2,
								generatedAt: "2026-08-14T10:00:00.000Z",
								actors: [{...registry().actors[0], actorKind: "service"}],
							}),
						),
					}),
			/cannot change actor kind/,
			);
			const disabled = normalizeProjectServerRegistrySnapshot(
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
			await writeProjectServerRegistrySnapshot({
				projectServerStateRoot: root,
				expectedGeneration: 1,
				snapshot: disabled,
			});
			await assert.rejects(
				() =>
					writeProjectServerRegistrySnapshot({
						projectServerStateRoot: root,
						expectedGeneration: 2,
						snapshot: normalizeProjectServerRegistrySnapshot(
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
				normalizeProjectServerRegistrySnapshot({
					...registry(),
					protocolId: "codewiki.host-registry",
				}),
			/protocol binding is invalid/,
		);
		assert.throws(
			() => normalizeProjectServerRegistrySnapshot({...registry(), credential: "secret"}),
			/unsupported field credential/,
		);
		assert.throws(
			() => normalizeProjectServerRegistrySnapshot({
				...registry(),
				protocolVersion: "1.0.0",
			}),
			/protocol binding is invalid/,
		);
		assert.throws(
			() => normalizeProjectServerRegistrySnapshot({
				...registry(),
				actors: [{
					...registry().actors[0],
					authenticatedIdentityRefs: ["identity:local:nuno"],
				}],
			}),
			/unsupported field authenticatedIdentityRefs/,
		);
		const oidc = projectServerOidcIdentity("https://identity.example.test", "subject-1");
		assert.throws(
			() => normalizeProjectServerRegistrySnapshot({
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
				normalizeProjectServerRegistrySnapshot(
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
				normalizeProjectServerRegistrySnapshot(
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
		const verified = await verifyProjectServerAuthentication({
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
			registry: normalizeProjectServerRegistrySnapshot(registry()),
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

	it("authorizes Pairing transitions through exact active Server Session context", async () => {
		const base = normalizeProjectServerRegistrySnapshot(registry());
		const opened = openProjectServerSession({
			binding: {
				actor: {actorId: "user:nuno", authenticatedIdentityRef: "identity:local:nuno"},
				client: {
					clientKind: "app",
					clientInstanceId: "app:laptop",
					authenticationRef: "auth:pairing:app-laptop",
				},
				project: {
					projectId: "project:codewiki",
					repositoryIdentity: digest("1"),
					projectServerRouteRef: "runtime:codewiki",
				},
			},
			lifetimeSeconds: 600,
			now: new Date("2026-08-14T09:59:00.000Z"),
		});
		const targetAuthentication = await verifyProjectServerAuthentication({
			adapter: {
				adapterId: "target-client",
				async verify() {
					return {
						clientKind: "cli",
						clientInstanceId: "cli:desktop",
						authenticationRef: "auth:pairing:cli-desktop",
						authenticatedIdentityRef: "identity:local:nuno",
					};
				},
			},
			request: {
				clientKind: "cli",
				clientInstanceId: "cli:desktop",
				proof: "opaque-target-proof",
			},
		});
		const issueCommand = {
			protocolId: CLIENT_PAIRING_PROTOCOL.id,
			protocolVersion: CLIENT_PAIRING_PROTOCOL.version,
			kind: "issue",
			expectedRegistryGeneration: base.generation,
			pairingId: "pairing:cli-desktop",
			clientKind: "cli",
			clientInstanceId: "cli:desktop",
		};
		let policyCalls = 0;
		const issued = await issueAuthorizedClientPairing({
			registry: base,
			command: issueCommand,
			authentication: targetAuthentication,
			session: opened.session,
			sessionCredential: opened.credential,
			expectedSessionGeneration: opened.session.generation,
			authorization: {
				adapterId: "pairing-policy",
				authorize(context) {
					policyCalls += 1;
					assert.equal(context.endpoint.endpointId, "server.pairing.issue");
					assert.equal(context.endpoint.method, "POST");
					assert.deepEqual(context.command, issueCommand);
					assert.deepEqual(context.targetClient, {
						clientKind: "cli",
						clientInstanceId: "cli:desktop",
					});
					assert.equal(JSON.stringify(context).includes(opened.credential), false);
					return true;
				},
			},
			now: new Date("2026-08-14T10:00:00.000Z"),
		});
		assert.equal(policyCalls, 1);
		assert.equal(issued.registry.generation, base.generation + 1);
		assert.equal(issued.registry.pairings.at(-1).actorId, "user:nuno");
		assert.equal(issued.authorization.authorizationAdapterId, "pairing-policy");
		let duplicatePolicyCalls = 0;
		await assert.rejects(
			() => issueAuthorizedClientPairing({
				registry: issued.registry,
				command: {...issueCommand, expectedRegistryGeneration: issued.registry.generation},
				authentication: targetAuthentication,
				session: opened.session,
				sessionCredential: opened.credential,
				expectedSessionGeneration: opened.session.generation,
				authorization: {
					adapterId: "pairing-policy",
					authorize() { duplicatePolicyCalls += 1; return true; },
				},
				now: new Date("2026-08-14T10:00:30.000Z"),
			}),
			/endpoint authorization denied/,
		);
		assert.equal(duplicatePolicyCalls, 0);

		const revokeCommand = {
			protocolId: CLIENT_PAIRING_PROTOCOL.id,
			protocolVersion: CLIENT_PAIRING_PROTOCOL.version,
			kind: "revoke",
			expectedRegistryGeneration: issued.registry.generation,
			pairingId: "pairing:cli-desktop",
			expectedAuthenticationRef: targetAuthentication.authenticationRef,
		};
		const revoked = await revokeAuthorizedClientPairing({
			registry: issued.registry,
			command: revokeCommand,
			authentication: targetAuthentication,
			session: opened.session,
			sessionCredential: opened.credential,
			expectedSessionGeneration: opened.session.generation,
			authorization: {
				adapterId: "pairing-policy",
				authorize(context) {
					assert.equal(context.endpoint.endpointId, "server.pairing.revoke");
					assert.equal(context.endpoint.method, "DELETE");
					assert.deepEqual(context.command, revokeCommand);
					return true;
				},
			},
			now: new Date("2026-08-14T10:01:00.000Z"),
		});
		assert.equal(revoked.registry.pairings.at(-1).status, "revoked");

		const attempt = (overrides = {}) => issueAuthorizedClientPairing({
			registry: base,
			command: issueCommand,
			authentication: targetAuthentication,
			session: opened.session,
			sessionCredential: opened.credential,
			expectedSessionGeneration: opened.session.generation,
			authorization: {adapterId: "pairing-policy", authorize: () => true},
			now: new Date("2026-08-14T10:00:00.000Z"),
			...overrides,
		});
		await assert.rejects(
			() => attempt({sessionCredential: "forged"}),
			/session credential is invalid/,
		);
		await assert.rejects(
			() => attempt({authorization: {adapterId: "deny", authorize: () => false}}),
			/endpoint authorization denied/,
		);
		await assert.rejects(
			() => attempt({command: {...issueCommand, expectedRegistryGeneration: 6}}),
			/endpoint authorization denied/,
		);
		await assert.rejects(
			() => attempt({
				authentication: {...targetAuthentication, authenticatedIdentityRef: "identity:local:other"},
			}),
			/lacks verifier provenance/,
		);
		const otherAuthentication = await verifyProjectServerAuthentication({
			adapter: {
				adapterId: "other-target",
				async verify() {
					return {
						...targetAuthentication,
						authenticatedIdentityRef: "identity:local:other",
					};
				},
			},
			request: {
				clientKind: "cli",
				clientInstanceId: "cli:desktop",
				proof: "opaque-other-proof",
			},
		});
		await assert.rejects(
			() => attempt({authentication: otherAuthentication}),
			/endpoint authorization denied/,
		);
		await assert.rejects(
			() => attempt({
				session: {
					...opened.session,
					project: {...opened.session.project, projectServerRouteRef: "runtime:other"},
				},
			}),
			/endpoint authorization denied/,
		);
		await assert.rejects(
			() => attempt({authorization: {adapterId: "throw", authorize: () => { throw new Error("x"); }}}),
			/endpoint authorization denied/,
		);
		await assert.rejects(
			() => attempt({authority: "admin"}),
			/unsupported field authority/,
		);
	});

	it("fails closed on proof and pairing command drift", async () => {
		await assert.rejects(
			() =>
				verifyProjectServerAuthentication({
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
				verifyProjectServerAuthentication({
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
				verifyProjectServerAuthentication({
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
			registry: normalizeProjectServerRegistrySnapshot(registry()),
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
				registry: normalizeProjectServerRegistrySnapshot(registry()),
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
			const normalized = normalizeProjectServerRegistrySnapshot(registryValue);
			return resolveProjectServerConnection({
				registry: normalized,
				expectedRegistryGeneration: normalized.generation,
				authentication: assertion,
				repositoryIdentity: identity,
				now,
			});
		};
		assert.throws(
			() =>
				resolveProjectServerConnection({
					registry: normalizeProjectServerRegistrySnapshot(registry()),
					expectedRegistryGeneration: 7,
					authentication,
					repositoryIdentity: digest("1"),
					now: new Date("2026-08-12T10:00:00.000Z"),
				}),
			/future-dated/,
		);
		assert.throws(
			() =>
				resolveProjectServerConnection({
					registry: normalizeProjectServerRegistrySnapshot(registry()),
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
		const connection = resolveProjectServerConnection({
			registry: normalizeProjectServerRegistrySnapshot(registry()),
			expectedRegistryGeneration: 7,
			authentication,
			repositoryIdentity: digest("1"),
			now: new Date("2026-08-14T10:00:00.000Z"),
		});
		const opened = openProjectServerSession({
			binding: {
				actor: connection.actor,
				client: connection.client,
				project: {
					projectId: connection.project.projectId,
					repositoryIdentity: connection.project.repositoryIdentity,
					projectServerRouteRef: connection.project.projectServerRouteRef,
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
		const authorized = await authorizeProjectServerEndpoint({
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

		const rotated = rotateProjectServerSession({
			session: opened.session,
			credential: opened.credential,
			expectedSessionGeneration: 1,
			now: new Date("2026-08-14T10:02:00.000Z"),
		});
		assert.equal(rotated.session.generation, 2);
		assert.notEqual(rotated.credential, opened.credential);
		await assert.rejects(
			() => authorizeProjectServerEndpoint({
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
		const revoked = revokeProjectServerSession({
			session: rotated.session,
			credential: rotated.credential,
			expectedSessionGeneration: 2,
			now: new Date("2026-08-14T10:04:00.000Z"),
		});
		assert.equal(revoked.generation, 3);
		assert.equal(revoked.status, "revoked");
		await assert.rejects(
			() => authorizeProjectServerEndpoint({
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
		const opened = openProjectServerSession({
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
					projectServerRouteRef: "runtime:codewiki",
				},
			},
			lifetimeSeconds: 60,
			now: new Date("2026-08-14T10:00:00.000Z"),
		});
		assert.throws(
			() => normalizeProjectServerSessionRecord({...opened.session, role: "admin"}),
			/unsupported field role/,
		);
		await assert.rejects(
			() => authorizeProjectServerEndpoint({
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
			() => authorizeProjectServerEndpoint({
				session: opened.session,
				credential: opened.credential,
				expectedSessionGeneration: 2,
				endpoint: {endpointId: "app.state.read", method: "GET", repositoryIdentity: digest("1")},
				adapter: {adapterId: "app-policy", authorize: () => true},
			}),
			/session generation is stale/,
		);
		await assert.rejects(
			() => authorizeProjectServerEndpoint({
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
			() => authorizeProjectServerEndpoint({
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
			() => authorizeProjectServerEndpoint({
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
