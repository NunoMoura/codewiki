import assert from "node:assert/strict";
import {chmod, mkdtemp, readFile, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, it} from "node:test";

import {
	AGENT_RUNNER_PROTOCOL,
	createQualifiedRunnerBundle,
	createRunnerBundleManifest,
} from "../../../src/execution/ports.ts";
import {
	activateStoredRunnerBundle,
	bindActiveStoredRunnerBundle,
	createStoredNodeAgentRunnerArtifactResolver,
	qualifyStoredRunnerBundle,
	readStoredRunnerBundleRegistry,
} from "../../../src/execution/runner-bundles/store.ts";
import {
	canonicalJson,
	sha256Digest,
} from "../../../src/utils/canonical-json.ts";

describe("durable Runner Bundle registry", () => {
	it("copies exact artifact bytes and persists one canonical qualified registry", async () => {
		await withStore(async ({stateRoot, sourcePath}) => {
			const artifact = Buffer.from("console.log('runner-a');\n");
			await writeFile(sourcePath, artifact);
			const bundle = qualifiedBundle("a".repeat(40), artifact, "evidence-a");
			const registry = await qualifyStoredRunnerBundle({
				stateRoot,
				expectedGeneration: 0,
				bundle,
				artifactPath: sourcePath,
				generatedAt: "2026-08-17T10:00:00.000Z",
			});

			assert.equal(registry.generation, 1);
			assert.deepEqual(registry.bundles, [bundle]);
			assert.equal(registry.activeBundleDigest, null);
			const persisted = await readFile(
				join(stateRoot, "runner-bundles", "registry.json"),
				"utf8",
			);
			assert.equal(persisted, canonicalJson(registry));
			assert.deepEqual(await readStoredRunnerBundleRegistry({stateRoot}), registry);

			await writeFile(sourcePath, "changed source");
			assert.deepEqual(await readFile(storedArtifactPath(stateRoot, bundle)), artifact);
			if (process.platform !== "win32") {
				assert.equal(
					(await stat(join(stateRoot, "runner-bundles", "registry.json"))).mode &
						0o777,
					0o600,
				);
				assert.equal(
					(await stat(storedArtifactPath(stateRoot, bundle))).mode & 0o777,
					0o500,
				);
			}
		});
	});

	it("uses durable expected-generation CAS for qualification and activation", async () => {
		await withStore(async ({stateRoot, sourcePath}) => {
			const artifact = Buffer.from("console.log('runner-a');\n");
			await writeFile(sourcePath, artifact);
			const bundle = qualifiedBundle("a".repeat(40), artifact, "evidence-a");
			await qualifyStoredRunnerBundle({
				stateRoot,
				expectedGeneration: 0,
				bundle,
				artifactPath: sourcePath,
				generatedAt: "2026-08-17T10:00:00.000Z",
			});
			const active = await activateStoredRunnerBundle({
				stateRoot,
				expectedGeneration: 1,
				bundleDigest: bundle.bundleDigest,
				generatedAt: "2026-08-17T10:01:00.000Z",
			});
			assert.equal(active.generation, 2);
			assert.equal(active.activeBundleDigest, bundle.bundleDigest);
			await assert.rejects(
				activateStoredRunnerBundle({
					stateRoot,
					expectedGeneration: 1,
					bundleDigest: bundle.bundleDigest,
					generatedAt: "2026-08-17T10:02:00.000Z",
				}),
				/Runner Bundle registry generation conflict/,
			);
			assert.equal(
				(await readStoredRunnerBundleRegistry({stateRoot})).generation,
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
			await qualifyStoredRunnerBundle({
				stateRoot,
				expectedGeneration: 0,
				bundle: first,
				artifactPath: sourcePath,
				generatedAt: "2026-08-17T10:00:00.000Z",
			});
			await activateStoredRunnerBundle({
				stateRoot,
				expectedGeneration: 1,
				bundleDigest: first.bundleDigest,
				generatedAt: "2026-08-17T10:01:00.000Z",
			});
			await writeFile(sourcePath, secondBytes);
			await qualifyStoredRunnerBundle({
				stateRoot,
				expectedGeneration: 2,
				bundle: second,
				artifactPath: sourcePath,
				generatedAt: "2026-08-17T10:02:00.000Z",
			});
			await activateStoredRunnerBundle({
				stateRoot,
				expectedGeneration: 3,
				bundleDigest: second.bundleDigest,
				generatedAt: "2026-08-17T10:03:00.000Z",
			});

			assert.equal(
				(await bindActiveStoredRunnerBundle({stateRoot})).bundleDigest,
				second.bundleDigest,
			);
			const resolveArtifact = createStoredNodeAgentRunnerArtifactResolver({stateRoot});
			const retained = await resolveArtifact(challengeFor(first));
			assert.equal(retained.runnerBundleDigest, first.bundleDigest);
			assert.deepEqual(retained.args, [storedArtifactPath(stateRoot, first)]);
			assert.equal(
				retained.cwd,
				join(
					stateRoot,
					"runner-bundles",
					"artifacts",
					first.bundleDigest.slice(7),
				),
			);

			await activateStoredRunnerBundle({
				stateRoot,
				expectedGeneration: 4,
				bundleDigest: first.bundleDigest,
				generatedAt: "2026-08-17T10:04:00.000Z",
			});
			assert.equal(
				(await bindActiveStoredRunnerBundle({stateRoot})).bundleDigest,
				first.bundleDigest,
			);
		});
	});

	it("rejects altered stored bytes before activation or launch resolution", async () => {
		await withStore(async ({stateRoot, sourcePath}) => {
			const artifact = Buffer.from("console.log('runner-a');\n");
			await writeFile(sourcePath, artifact);
			const bundle = qualifiedBundle("a".repeat(40), artifact, "evidence-a");
			await qualifyStoredRunnerBundle({
				stateRoot,
				expectedGeneration: 0,
				bundle,
				artifactPath: sourcePath,
				generatedAt: "2026-08-17T10:00:00.000Z",
			});
			const stored = storedArtifactPath(stateRoot, bundle);
			if (process.platform !== "win32") await chmod(stored, 0o600);
			await writeFile(stored, "tampered");
			if (process.platform !== "win32") await chmod(stored, 0o500);

			await assert.rejects(
				activateStoredRunnerBundle({
					stateRoot,
					expectedGeneration: 1,
					bundleDigest: bundle.bundleDigest,
					generatedAt: "2026-08-17T10:01:00.000Z",
				}),
				/Stored Runner Bundle artifact digest does not match its manifest/,
			);
			assert.equal(
				(await readStoredRunnerBundleRegistry({stateRoot})).activeBundleDigest,
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
				qualifyStoredRunnerBundle({
					stateRoot,
					expectedGeneration: 0,
					bundle: wrongBytes,
					artifactPath: sourcePath,
					generatedAt: "2026-08-17T10:00:00.000Z",
				}),
				/Runner Bundle artifact digest does not match its manifest/,
			);
			assert.equal(await readStoredRunnerBundleRegistry({stateRoot}), undefined);

			const wrongNode = qualifiedBundle(
				"b".repeat(40),
				artifact,
				"evidence-node",
				"0.0.1",
			);
			await qualifyStoredRunnerBundle({
				stateRoot,
				expectedGeneration: 0,
				bundle: wrongNode,
				artifactPath: sourcePath,
				generatedAt: "2026-08-17T10:01:00.000Z",
			});
			await assert.rejects(
				activateStoredRunnerBundle({
					stateRoot,
					expectedGeneration: 1,
					bundleDigest: wrongNode.bundleDigest,
					generatedAt: "2026-08-17T10:02:00.000Z",
				}),
				/Runner Bundle requires Node 0\.0\.1/,
			);
			const resolveArtifact = createStoredNodeAgentRunnerArtifactResolver({stateRoot});
			await assert.rejects(
				resolveArtifact(challengeFor(wrongNode)),
				/Runner Bundle requires Node 0\.0\.1/,
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
	return createQualifiedRunnerBundle({
		manifest: createRunnerBundleManifest({
			schemaVersion: "1.0.0",
			runnerProtocolVersion: AGENT_RUNNER_PROTOCOL.version,
			nodeVersion,
			dshSourceCommit,
			dshPackageClosureDigest: sha256Digest(`dsh:${dshSourceCommit}`),
			cordisClosureDigest: sha256Digest("cordis"),
			backendPluginClosureDigest: sha256Digest("plugins"),
			modelAdapterClosureDigest: sha256Digest("models"),
			delegateAdapterClosureDigest: sha256Digest("delegates"),
			runnerArtifactDigest: sha256Digest(artifact),
		}),
		qualificationSuiteDigest: sha256Digest("suite-v1"),
		qualificationEvidenceDigest: sha256Digest(evidence),
		qualifiedAt: "2026-08-17T09:00:00.000Z",
	});
}

function challengeFor(bundle) {
	return {
		processProtocolId: "codewiki.agent-runner-process",
		processProtocolVersion: "1.0.0",
		runnerProtocolId: AGENT_RUNNER_PROTOCOL.id,
		runnerProtocolVersion: bundle.manifest.runnerProtocolVersion,
		runnerBundleDigest: bundle.bundleDigest,
		runId: "run-001",
		specDigest: sha256Digest("spec"),
		channelId: "channel-001",
		challengeNonce: "nonce-001",
		issuedAt: "2026-08-17T10:00:00.000Z",
		expiresAt: "2026-08-17T10:01:00.000Z",
		challengeDigest: sha256Digest("challenge"),
	};
}

function storedArtifactPath(stateRoot, bundle) {
	return join(
		stateRoot,
		"runner-bundles",
		"artifacts",
		bundle.bundleDigest.slice("sha256:".length),
		"runner.mjs",
	);
}

async function withStore(run) {
	const root = await mkdtemp(join(tmpdir(), "codewiki-runner-bundles-"));
	try {
		await run({stateRoot: join(root, "state"), sourcePath: join(root, "runner.mjs")});
	} finally {
		await rm(root, {recursive: true, force: true});
	}
}
