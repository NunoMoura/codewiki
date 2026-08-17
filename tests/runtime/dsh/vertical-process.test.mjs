import assert from "node:assert/strict";
import {mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {after, describe, it} from "node:test";

import {buildDshRuntimeCandidate} from "../../../scripts/build-dsh-runtime.mjs";

import {
	RUN_PROTOCOL,
	createQualifiedRuntimeBuild,
	createRunRequest,
	createRuntimeBuildManifest,
} from "../../../src/runtime/contracts.ts";
import {
	activateStoredRuntimeBuild,
	bindActiveStoredRuntimeBuild,
	createStoredNodeRuntimeBuildResolver,
	qualifyStoredRuntimeBuild,
} from "../../../src/runtime/builds/store.ts";
import {readDshRuntimeProvenance} from "../../../src/runtime/dsh/provenance.ts";
import {
	createNodeRunProcessManager,
} from "../../../src/runtime/processes/node-process-manager.ts";
import {createRuntime} from "../../../src/runtime/runtime.ts";
import {
	canonicalJson,
	canonicalJsonDigest,
	sha256Digest,
} from "../../../src/utils/canonical-json.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "../../..");
const replayFixturePath = resolve(
	testDirectory,
	"fixtures/replay-session.jsonl",
);
const replayFixtureDigest = sha256Digest(await readFile(replayFixturePath));
const packageLockPath = resolve(repositoryRoot, "package-lock.json");
const temporaryDirectories = [];
const candidateRoot = await mkdtemp(join(tmpdir(), "codewiki-dsh-candidate-"));
temporaryDirectories.push(candidateRoot);
const candidate = await buildDshRuntimeCandidate({
	outfile: join(candidateRoot, "dsh-run-process.mjs"),
});
const candidateBytes = await readFile(candidate.artifactPath);
const provenance = readDshRuntimeProvenance(packageLockPath);
const qualifiedBuild = createQualifiedRuntimeBuild({
	manifest: createRuntimeBuildManifest({
		schemaVersion: "1.0.0",
		runProtocolVersion: RUN_PROTOCOL.version,
		nodeVersion: process.version.slice(1),
		dshSourceCommit: provenance.reviewedSource.commit,
		dshPackageClosureDigest: provenance.dshPackageClosureDigest,
		cordisClosureDigest: provenance.cordisClosureDigest,
		runtimePluginClosureDigest: digest("runtime-plugins"),
		modelAdapterClosureDigest: digest("replay-model-adapter"),
		delegateAdapterClosureDigest: digest("no-delegates"),
		runtimeArtifactDigest: sha256Digest(candidateBytes),
	}),
	qualificationSuiteDigest: digest("dsh-qualification-suite"),
	qualificationEvidenceDigest: digest("dsh-qualification-evidence"),
	qualifiedAt: "2026-08-17T20:00:00.000Z",
});

after(async () => {
	await Promise.all(
		temporaryDirectories.map((path) => rm(path, {recursive: true, force: true})),
	);
});

describe("DSH Runtime vertical process", () => {
	it("executes Run Request through authenticated Run Process and returns Runtime-authored receipt", async () => {
		const fixture = await runtimeFixture("complete");
		assert.equal(fixture.binding.buildDigest, qualifiedBuild.buildDigest);
		assert.ok(
			candidate.inputPaths.some((path) => path.includes("dsh-agent-loop")),
		);
		assert.doesNotMatch(
			candidateBytes.toString("utf8"),
			/\bfrom\s+["']@deepseek-ai\//,
		);
		const runtime = createRuntime({processManager: fixture.processManager});
		try {
			const handle = await runtime.start(fixture.request);
			const receipt = await runtime.waitForReceipt(handle);
			const quiescence = await runtime.waitForQuiescence(handle);
			const events = runtime.readEvents(handle);

			assert.equal(receipt.outcome, "completed");
			assert.equal(receipt.runtimeBuild.buildDigest, fixture.buildDigest);
			assert.equal(receipt.requestDigest, fixture.request.requestDigest);
			assert.equal(receipt.sessionId, fixture.request.session.sessionId);
			assert.equal(receipt.finalEventSequence, events.at(-1).sequence);
			assert.equal(quiescence.finalEventSequence, events.at(-1).sequence);
			assert.deepEqual(
				events.map(({kind}) => kind).filter((kind, index, all) =>
					index === 0 || kind !== all[index - 1]),
				["accepted", "process-started", "session-event", "quiescent"],
			);
			assert.ok(receipt.executionLedgerDigest);
			assert.equal(
				receipt.outputDigest,
				canonicalJsonDigest({text: "DSH vertical slice complete."}),
			);
			assert.ok(receipt.usageDigest);
			assert.ok(receipt.quiescenceDigest);
			assert.deepEqual(receipt.operationalGaps, []);
			assert.deepEqual(receipt.custodyGaps, []);
			const rawLogPath = await onlyJsonlFile(fixture.sessionRoot);
			assert.equal(receipt.rawLog.digest, sha256Digest(await readFile(rawLogPath)));
			assert.match(await readFile(rawLogPath, "utf8"), /DSH vertical slice complete\./);
		} finally {
			await runtime.shutdown();
		}
	});

	it("creates no receipt when bound static input bytes are changed", async () => {
		const fixture = await runtimeFixture("tampered");
		await writeFile(
			fixture.manifestPath,
			canonicalJson({...fixture.manifest, prompt: "tampered"}),
		);
		const runtime = createRuntime({processManager: fixture.processManager});
		try {
			const handle = await runtime.start(fixture.request);
			await assert.rejects(
				runtime.waitForReceipt(handle),
				/Run Process event (?:channel closed before another frame|pipe ended)/,
			);
		} finally {
			await runtime.shutdown();
		}
	});
});

async function runtimeFixture(suffix) {
	const root = await mkdtemp(join(tmpdir(), `codewiki-dsh-process-${suffix}-`));
	temporaryDirectories.push(root);
	const stateRoot = join(root, "runtime-state");
	const sessionRoot = join(root, "sessions");
	await qualifyStoredRuntimeBuild({
		stateRoot,
		expectedGeneration: 0,
		build: qualifiedBuild,
		artifactPath: candidate.artifactPath,
		generatedAt: "2026-08-17T20:01:00.000Z",
	});
	await activateStoredRuntimeBuild({
		stateRoot,
		expectedGeneration: 1,
		buildDigest: qualifiedBuild.buildDigest,
		generatedAt: "2026-08-17T20:02:00.000Z",
	});
	const binding = await bindActiveStoredRuntimeBuild({stateRoot});
	const manifest = Object.freeze({
		schemaVersion: "1.0.0",
		runtimeBuildDigest: binding.buildDigest,
		runProtocolVersion: binding.runProtocolVersion,
		systemPrompt: "CodeWiki deterministic qualification",
		prompt: "Return qualification text.",
		workspacePath: root,
		sessionRoot,
		replayFixturePath,
		replayFixtureDigest,
	});
	const manifestPath = join(root, "input-manifest.json");
	await writeFile(manifestPath, canonicalJson(manifest));
	const request = runRequest({
		runId: `run-dsh-process-${suffix}`,
		sessionId: `session-dsh-process-${suffix}`,
		buildDigest: binding.buildDigest,
		staticInputManifestDigest: canonicalJsonDigest(manifest),
	});
	const storedResolver = createStoredNodeRuntimeBuildResolver({stateRoot});
	const processManager = createNodeRunProcessManager({
		resolveArtifact: async (challenge) => {
			const artifact = await storedResolver(challenge);
			return Object.freeze({
				...artifact,
				args: Object.freeze([...artifact.args, manifestPath]),
			});
		},
	});
	return {
		root,
		sessionRoot,
		buildDigest: binding.buildDigest,
		binding,
		manifest,
		manifestPath,
		request,
		processManager,
	};
}

function runRequest({runId, sessionId, buildDigest, staticInputManifestDigest}) {
	const createdAt = new Date(Date.now() - 1_000).toISOString();
	const deadlineAt = new Date(Date.now() + 30_000).toISOString();
	const optionsDigest = digest("model-options");
	const modelRoute = {
		provider: "codewiki-replay",
		model: "deterministic",
		optionsDigest,
		routeDigest: canonicalJsonDigest({
			provider: "codewiki-replay",
			model: "deterministic",
			optionsDigest,
		}),
	};
	return createRunRequest({
		runId,
		operationId: `operation-${runId}`,
		custody: "backend-owned",
		role: "decision-producer",
		stage: "decision",
		subject: {id: `subject-${runId}`, digest: digest("subject")},
		runtimeBuild: {buildDigest, runProtocolVersion: RUN_PROTOCOL.version},
		session: {mode: "create", sessionId, resumeLog: null},
		inputs: {
			stageContextDigest: digest("stage-context"),
			staticInputManifestDigest,
			systemPromptDigest: canonicalJsonDigest("CodeWiki deterministic qualification"),
			promptDigest: canonicalJsonDigest("Return qualification text."),
			producerSkillSetDigest: null,
			toolMode: "none",
			toolSetDigest: digest("no-tools"),
			modelRoute,
		},
		workspace: {
			kind: "immutable",
			repositorySnapshotDigest: digest("repository"),
		},
		budget: {
			timeoutMs: 30_000,
			maxModelRequests: 1,
			maxToolCalls: 0,
			maxInputTokens: 1_024,
			maxOutputTokens: 64,
		},
		createdAt,
		deadlineAt,
	});
}

async function onlyJsonlFile(root) {
	const entries = await readdir(root, {recursive: true, withFileTypes: true});
	const files = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
		.map((entry) => join(entry.parentPath, entry.name));
	assert.equal(files.length, 1);
	return files[0];
}

function digest(value) {
	return sha256Digest(value);
}
