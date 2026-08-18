import assert from "node:assert/strict";
import {mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {after, describe, it} from "node:test";

import {buildDshRuntimeCandidate} from "../../../scripts/build-dsh-runtime.mjs";

import {
	STAGE_CONTEXT_QUERY_ENGINE_DIGEST,
	STAGE_CONTEXT_QUERY_ENGINE_ID,
	STAGE_CONTEXT_QUERY_ENGINE_VERSION,
	createStageContextBundle,
} from "../../../src/runtime/context/bundle.ts";
import {createStageContextSnapshot} from "../../../src/runtime/context/contracts.ts";
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
import {
	DSH_STAGE_CONTEXT_TOOL_SET_DIGEST,
} from "../../../src/runtime/dsh/context-tools.ts";
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
const stageContextReplayFixturePath = resolve(
	testDirectory,
	"fixtures/replay-stage-context.jsonl",
);
const stageContextReplayFixtureDigest = sha256Digest(
	await readFile(stageContextReplayFixturePath),
);
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

	it("transports immutable Stage Context into admitted tools across authenticated process boundary", async () => {
		const fixture = await runtimeFixture("context", {admitted: true});
		const runtime = createRuntime({processManager: fixture.processManager});
		try {
			const handle = await runtime.start(fixture.request);
			const receipt = await runtime.waitForReceipt(handle);
			assert.equal(receipt.outcome, "completed");
			assert.equal(
				receipt.outputDigest,
				canonicalJsonDigest({text: "Stage Context query complete."}),
			);
			assert.ok(receipt.executionLedgerDigest);
			assert.deepEqual(receipt.operationalGaps, []);
			const rawLogPath = await onlyJsonlFile(fixture.sessionRoot);
			const rawLog = await readFile(rawLogPath, "utf8");
			assert.match(rawLog, /query_stage_context/);
			assert.match(rawLog, /Bounded execution mechanics/);
			assert.match(rawLog, /Stage Context query complete\./);
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

async function runtimeFixture(suffix, options = {}) {
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
	const runId = `run-dsh-process-${suffix}`;
	const stageContextBundle = options.admitted ? processContextBundle(runId) : null;
	const selectedReplayFixturePath = options.admitted
		? stageContextReplayFixturePath
		: replayFixturePath;
	const selectedReplayFixtureDigest = options.admitted
		? stageContextReplayFixtureDigest
		: replayFixtureDigest;
	const manifest = Object.freeze({
		schemaVersion: "1.0.0",
		runtimeBuildDigest: binding.buildDigest,
		runProtocolVersion: binding.runProtocolVersion,
		systemPrompt: "CodeWiki deterministic qualification",
		prompt: "Return qualification text.",
		workspacePath: root,
		sessionRoot,
		stageContextBundle,
		replayFixturePath: selectedReplayFixturePath,
		replayFixtureDigest: selectedReplayFixtureDigest,
	});
	const manifestPath = join(root, "input-manifest.json");
	await writeFile(manifestPath, canonicalJson(manifest));
	const request = runRequest({
		runId,
		sessionId: `session-dsh-process-${suffix}`,
		buildDigest: binding.buildDigest,
		staticInputManifestDigest: canonicalJsonDigest(manifest),
		stageContextBundle,
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

function runRequest({
	runId,
	sessionId,
	buildDigest,
	staticInputManifestDigest,
	stageContextBundle,
}) {
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
			stageContextDigest: stageContextBundle?.context.contextDigest ?? digest("stage-context"),
			staticInputManifestDigest,
			systemPromptDigest: canonicalJsonDigest("CodeWiki deterministic qualification"),
			promptDigest: canonicalJsonDigest("Return qualification text."),
			producerSkillSetDigest: null,
			toolMode: stageContextBundle ? "admitted" : "none",
			toolSetDigest: stageContextBundle
				? DSH_STAGE_CONTEXT_TOOL_SET_DIGEST
				: digest("no-tools"),
			modelRoute,
		},
		workspace: {
			kind: "immutable",
			repositorySnapshotDigest: digest("repository"),
		},
		budget: {
			timeoutMs: 30_000,
			maxModelRequests: stageContextBundle ? 2 : 1,
			maxToolCalls: stageContextBundle ? 2 : 0,
			maxInputTokens: 1_024,
			maxOutputTokens: 64,
		},
		createdAt,
		deadlineAt,
	});
}

function processContextBundle(runId) {
	const context = createStageContextSnapshot({
		stage: "decision",
		subject: {id: `subject-${runId}`, digest: digest("subject")},
		changeRevisionDigest: digest("revision"),
		sources: {
			workState: digest("work-state"),
			knowledge: digest("knowledge"),
			alignment: digest("alignment"),
			repository: digest("repository"),
			change: digest("change"),
			evidence: digest("evidence"),
			result: digest("result"),
		},
		producerSkillSetDigest: null,
		gateFeedbackDigest: null,
		capturedAt: "2026-08-17T20:00:00.000Z",
		stale: false,
		coverage: {status: "complete", unknowns: []},
		queryEngine: {
			id: STAGE_CONTEXT_QUERY_ENGINE_ID,
			version: STAGE_CONTEXT_QUERY_ENGINE_VERSION,
			digest: STAGE_CONTEXT_QUERY_ENGINE_DIGEST,
		},
	});
	return createStageContextBundle({
		context,
		routes: [{
			owner: "knowledge",
			operation: "concepts",
			arguments: {ids: ["runtime"]},
			items: [{
				value: {id: "runtime", summary: "Bounded execution mechanics."},
				sourceReferences: [{
					owner: "knowledge",
					id: "runtime",
					digest: digest("runtime"),
					location: "knowledge/runtime.md",
				}],
			}],
			coverage: "complete",
			unknowns: [],
			stale: false,
		}],
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
