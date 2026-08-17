import assert from "node:assert/strict";
import {chmod, mkdtemp, readFile, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, it} from "node:test";

import {
	RUN_PROTOCOL,
	createQualifiedRuntimeBuild,
	createRuntimeBuildManifest,
} from "../../../src/runtime/contracts.ts";
import {
	activateStoredRuntimeBuild,
	bindActiveStoredRuntimeBuild,
	createStoredNodeRuntimeBuildResolver,
	qualifyStoredRuntimeBuild,
	readStoredRuntimeBuildRegistry,
} from "../../../src/runtime/builds/store.ts";
import {
	canonicalJson,
	sha256Digest,
} from "../../../src/utils/canonical-json.ts";

describe("durable Runtime Build registry", () => {
	it("copies exact artifact bytes and persists one canonical qualified registry", async () => {
		await withStore(async ({stateRoot, sourcePath}) => {
			const artifact = Buffer.from("console.log('runner-a');\n");
			await writeFile(sourcePath, artifact);
			const build = qualifiedBundle("a".repeat(40), artifact, "evidence-a");
			const registry = await qualifyStoredRuntimeBuild({
				stateRoot,
				expectedGeneration: 0,
				build,
				artifactPath: sourcePath,
				generatedAt: "2026-08-17T10:00:00.000Z",
			});

			assert.equal(registry.generation, 1);
			assert.deepEqual(registry.builds, [build]);
			assert.equal(registry.activeBuildDigest, null);
			const persisted = await readFile(
				join(stateRoot, "runtime-builds", "registry.json"),
				"utf8",
			);
			assert.equal(persisted, canonicalJson(registry));
			assert.deepEqual(await readStoredRuntimeBuildRegistry({stateRoot}), registry);

			await writeFile(sourcePath, "changed source");
			assert.deepEqual(await readFile(storedArtifactPath(stateRoot, build)), artifact);
			if (process.platform !== "win32") {
				assert.equal(
					(await stat(join(stateRoot, "runtime-builds", "registry.json"))).mode &
						0o777,
					0o600,
				);
				assert.equal(
					(await stat(storedArtifactPath(stateRoot, build))).mode & 0o777,
					0o500,
				);
			}
		});
	});

	it("uses durable expected-generation CAS for qualification and activation", async () => {
		await withStore(async ({stateRoot, sourcePath}) => {
			const artifact = Buffer.from("console.log('runner-a');\n");
			await writeFile(sourcePath, artifact);
			const build = qualifiedBundle("a".repeat(40), artifact, "evidence-a");
			await qualifyStoredRuntimeBuild({
				stateRoot,
				expectedGeneration: 0,
				build,
				artifactPath: sourcePath,
				generatedAt: "2026-08-17T10:00:00.000Z",
			});
			const active = await activateStoredRuntimeBuild({
				stateRoot,
				expectedGeneration: 1,
				buildDigest: build.buildDigest,
				generatedAt: "2026-08-17T10:01:00.000Z",
			});
			assert.equal(active.generation, 2);
			assert.equal(active.activeBuildDigest, build.buildDigest);
			await assert.rejects(
				activateStoredRuntimeBuild({
					stateRoot,
					expectedGeneration: 1,
					buildDigest: build.buildDigest,
					generatedAt: "2026-08-17T10:02:00.000Z",
				}),
				/Runtime Build registry generation conflict/,
			);
			assert.equal(
				(await readStoredRuntimeBuildRegistry({stateRoot})).generation,
				2,
			);
		});
	});

	it("resolves active and retained resume artifacts without a version selector", async () => {
		await withStore(async ({stateRoot, sourcePath}) => {
			const firstBytes = Buffer.from("console.log('runner-a');\n");
			const secondBytes = Buffer.from("console.log('runner-b');\n");
			const first = qualifiedBundle("a".repeat(40), firstBytes, "evidence-a");
			const second = qualifiedBundle("b".repeat(40), secondBytes, "evidence-b");
			await writeFile(sourcePath, firstBytes);
			await qualifyStoredRuntimeBuild({
				stateRoot,
				expectedGeneration: 0,
				build: first,
				artifactPath: sourcePath,
				generatedAt: "2026-08-17T10:00:00.000Z",
			});
			await activateStoredRuntimeBuild({
				stateRoot,
				expectedGeneration: 1,
				buildDigest: first.buildDigest,
				generatedAt: "2026-08-17T10:01:00.000Z",
			});
			await writeFile(sourcePath, secondBytes);
			await qualifyStoredRuntimeBuild({
				stateRoot,
				expectedGeneration: 2,
				build: second,
				artifactPath: sourcePath,
				generatedAt: "2026-08-17T10:02:00.000Z",
			});
			await activateStoredRuntimeBuild({
				stateRoot,
				expectedGeneration: 3,
				buildDigest: second.buildDigest,
				generatedAt: "2026-08-17T10:03:00.000Z",
			});

			assert.equal(
				(await bindActiveStoredRuntimeBuild({stateRoot})).buildDigest,
				second.buildDigest,
			);
			const resolveArtifact = createStoredNodeRuntimeBuildResolver({stateRoot});
			const retained = await resolveArtifact(challengeFor(first));
			assert.equal(retained.runtimeBuildDigest, first.buildDigest);
			assert.deepEqual(retained.args, [storedArtifactPath(stateRoot, first)]);
			assert.equal(
				retained.cwd,
				join(
					stateRoot,
					"runtime-builds",
					"artifacts",
					first.buildDigest.slice(7),
				),
			);

			await activateStoredRuntimeBuild({
				stateRoot,
				expectedGeneration: 4,
				buildDigest: first.buildDigest,
				generatedAt: "2026-08-17T10:04:00.000Z",
			});
			assert.equal(
				(await bindActiveStoredRuntimeBuild({stateRoot})).buildDigest,
				first.buildDigest,
			);
		});
	});

	it("rejects altered stored bytes before activation or launch resolution", async () => {
		await withStore(async ({stateRoot, sourcePath}) => {
			const artifact = Buffer.from("console.log('runner-a');\n");
			await writeFile(sourcePath, artifact);
			const build = qualifiedBundle("a".repeat(40), artifact, "evidence-a");
			await qualifyStoredRuntimeBuild({
				stateRoot,
				expectedGeneration: 0,
				build,
				artifactPath: sourcePath,
				generatedAt: "2026-08-17T10:00:00.000Z",
			});
			const stored = storedArtifactPath(stateRoot, build);
			if (process.platform !== "win32") await chmod(stored, 0o600);
			await writeFile(stored, "tampered");
			if (process.platform !== "win32") await chmod(stored, 0o500);

			await assert.rejects(
				activateStoredRuntimeBuild({
					stateRoot,
					expectedGeneration: 1,
					buildDigest: build.buildDigest,
					generatedAt: "2026-08-17T10:01:00.000Z",
				}),
				/Stored Runtime Build artifact digest does not match its manifest/,
			);
			assert.equal(
				(await readStoredRuntimeBuildRegistry({stateRoot})).activeBuildDigest,
				null,
			);
		});
	});

	it("rejects source digest and exact Node-version mismatches", async () => {
		await withStore(async ({stateRoot, sourcePath}) => {
			const artifact = Buffer.from("console.log('runner-a');\n");
			await writeFile(sourcePath, artifact);
			const wrongBytes = qualifiedBundle("a".repeat(40), Buffer.from("other"), "evidence");
			await assert.rejects(
				qualifyStoredRuntimeBuild({
					stateRoot,
					expectedGeneration: 0,
					build: wrongBytes,
					artifactPath: sourcePath,
					generatedAt: "2026-08-17T10:00:00.000Z",
				}),
				/Runtime Build artifact digest does not match its manifest/,
			);
			assert.equal(await readStoredRuntimeBuildRegistry({stateRoot}), undefined);

			const wrongNode = qualifiedBundle(
				"b".repeat(40),
				artifact,
				"evidence-node",
				"0.0.1",
			);
			await qualifyStoredRuntimeBuild({
				stateRoot,
				expectedGeneration: 0,
				build: wrongNode,
				artifactPath: sourcePath,
				generatedAt: "2026-08-17T10:01:00.000Z",
			});
			await assert.rejects(
				activateStoredRuntimeBuild({
					stateRoot,
					expectedGeneration: 1,
					buildDigest: wrongNode.buildDigest,
					generatedAt: "2026-08-17T10:02:00.000Z",
				}),
				/Runtime Build requires Node 0\.0\.1/,
			);
			const resolveArtifact = createStoredNodeRuntimeBuildResolver({stateRoot});
			await assert.rejects(
				resolveArtifact(challengeFor(wrongNode)),
				/Runtime Build requires Node 0\.0\.1/,
			);
		});
	});
});

function qualifiedBundle(
	dshSourceCommit,
	artifact,
	evidence,
	nodeVersion = process.versions.node,
) {
	return createQualifiedRuntimeBuild({
		manifest: createRuntimeBuildManifest({
			schemaVersion: "1.0.0",
			runProtocolVersion: RUN_PROTOCOL.version,
			nodeVersion,
			dshSourceCommit,
			dshPackageClosureDigest: sha256Digest(`dsh:${dshSourceCommit}`),
			cordisClosureDigest: sha256Digest("cordis"),
			runtimePluginClosureDigest: sha256Digest("plugins"),
			modelAdapterClosureDigest: sha256Digest("models"),
			delegateAdapterClosureDigest: sha256Digest("delegates"),
			runtimeArtifactDigest: sha256Digest(artifact),
		}),
		qualificationSuiteDigest: sha256Digest("suite-v1"),
		qualificationEvidenceDigest: sha256Digest(evidence),
		qualifiedAt: "2026-08-17T09:00:00.000Z",
	});
}

function challengeFor(build) {
	return {
		processProtocolId: "codewiki.run-process",
		processProtocolVersion: "1.0.0",
		runProtocolId: RUN_PROTOCOL.id,
		runProtocolVersion: build.manifest.runProtocolVersion,
		runtimeBuildDigest: build.buildDigest,
		runId: "run-001",
		requestDigest: sha256Digest("spec"),
		channelId: "channel-001",
		challengeNonce: "nonce-001",
		issuedAt: "2026-08-17T10:00:00.000Z",
		expiresAt: "2026-08-17T10:01:00.000Z",
		challengeDigest: sha256Digest("challenge"),
	};
}

function storedArtifactPath(stateRoot, build) {
	return join(
		stateRoot,
		"runtime-builds",
		"artifacts",
		build.buildDigest.slice("sha256:".length),
		"runtime.mjs",
	);
}

async function withStore(run) {
	const root = await mkdtemp(join(tmpdir(), "codewiki-runtime-builds-"));
	try {
		await run({stateRoot: join(root, "state"), sourcePath: join(root, "runtime.mjs")});
	} finally {
		await rm(root, {recursive: true, force: true});
	}
}
