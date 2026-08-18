import assert from "node:assert/strict";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {after, describe, it} from "node:test";

import {
	STAGE_CONTEXT_QUERY_ENGINE_DIGEST,
	STAGE_CONTEXT_QUERY_ENGINE_ID,
	STAGE_CONTEXT_QUERY_ENGINE_VERSION,
	createStageContextBundle,
} from "../../../src/runtime/context/bundle.ts";
import {createStageContextSnapshot} from "../../../src/runtime/context/contracts.ts";
import {runDshAgent} from "../../../src/runtime/dsh/adapter.ts";
import {
	DSH_STAGE_CONTEXT_TOOL_SET_DIGEST,
} from "../../../src/runtime/dsh/context-tools.ts";
import {createDshReplayModelInstaller} from "../../../src/runtime/dsh/replay.ts";
import {createRunRequest} from "../../../src/runtime/contracts.ts";
import {
	canonicalJsonDigest,
	sha256Digest,
} from "../../../src/utils/canonical-json.ts";

const fixturePath = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"fixtures/replay-session.jsonl",
);
const fixtureDigest = sha256Digest(await readFile(fixturePath));
const stageContextFixturePath = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"fixtures/replay-stage-context.jsonl",
);
const stageContextFixtureDigest = sha256Digest(await readFile(stageContextFixturePath));
const temporaryDirectories = [];

after(async () => {
	await Promise.all(
		temporaryDirectories.map((path) => rm(path, {recursive: true, force: true})),
	);
});

describe("CodeWiki DSH Adapter", () => {
	it("runs one isolated DSH Agent Session with replay and persists its exact JSONL", async () => {
		const root = await temporaryRoot();
		const request = runRequest("run-dsh-1", "session-dsh-1");
		const result = await runDshAgent({
			request,
			artifacts: artifacts(root),
			installModelAdapter: createDshReplayModelInstaller({
				fixturePath,
				fixtureDigest,
			}),
			now: sequenceClock(
				"2026-08-17T20:00:01.000Z",
				"2026-08-17T20:00:02.000Z",
			),
		});

		assert.equal(result.outcome, "completed");
		assert.equal(result.output, "DSH vertical slice complete.");
		assert.equal(
			result.outputDigest,
			canonicalJsonDigest({text: "DSH vertical slice complete."}),
		);
		assert.ok(result.usageDigest);
		assert.match(result.executionLedgerDigest, /^sha256:[0-9a-f]{64}$/);
		assert.equal(result.rawLog.sessionId, "session-dsh-1");
		assert.equal(result.rawLog.runtimeBuildDigest, request.runtimeBuild.buildDigest);
		assert.equal(result.rawLog.digest, sha256Digest(await readFile(result.rawLogPath)));
		assert.ok(result.sessionEvents.some((event) => event.type === "request/header"));
		assert.ok(result.sessionEvents.some((event) => event.type === "assistant/message"));
		assert.equal(
			result.sessionEvents.some((event) => event.type === "tool/call"),
			false,
		);
		const rawLog = await readFile(result.rawLogPath, "utf8");
		assert.match(rawLog, /"id":"session-dsh-1"/);
		assert.match(rawLog, /DSH vertical slice complete\./);
	});

	it("creates no shared DSH Agent Session state across concurrent Runs", async () => {
		const [leftRoot, rightRoot] = await Promise.all([
			temporaryRoot(),
			temporaryRoot(),
		]);
		const installer = () =>
			createDshReplayModelInstaller({fixturePath, fixtureDigest});
		const [left, right] = await Promise.all([
			runDshAgent({
				request: runRequest("run-dsh-left", "session-dsh-left"),
				artifacts: artifacts(leftRoot),
				installModelAdapter: installer(),
			}),
			runDshAgent({
				request: runRequest("run-dsh-right", "session-dsh-right"),
				artifacts: artifacts(rightRoot),
				installModelAdapter: installer(),
			}),
		]);

		assert.notEqual(left.rawLogPath, right.rawLogPath);
		assert.notEqual(left.rawLog.sessionId, right.rawLog.sessionId);
		assert.notEqual(left.executionLedgerDigest, right.executionLedgerDigest);
		assert.equal(left.output, right.output);
	});

	it("executes admitted Stage Context tools and binds exact queries into its ledger", async () => {
		const root = await temporaryRoot();
		const stageContextBundle = contextBundle();
		const request = runRequest(
			"run-dsh-context",
			"session-dsh-context",
			stageContextBundle,
		);
		const result = await runDshAgent({
			request,
			artifacts: artifacts(root),
			stageContextBundle,
			installModelAdapter: createDshReplayModelInstaller({
				fixturePath: stageContextFixturePath,
				fixtureDigest: stageContextFixtureDigest,
			}),
		});

		assert.equal(result.outcome, "completed");
		assert.equal(result.output, "Stage Context query complete.");
		assert.ok(result.sessionEvents.some((event) => event.type === "tool/call"));
		assert.ok(result.sessionEvents.some((event) => event.type === "tool/result"));
		assert.equal(result.executionLedgerDigest, result.executionLedger.ledgerDigest);
		assert.deepEqual(
			result.executionLedger.entries.map(({kind}) => kind),
			[
				"static-input",
				"tool-call",
				"stage-context-query",
				"tool-result",
				"model-request",
				"model-request",
				"model-output",
				"model-output",
				"usage",
				"output",
			],
		);
		const queryEntry = result.executionLedger.entries.find(
			({kind}) => kind === "stage-context-query",
		);
		assert.deepEqual(queryEntry.payload.result.items.map(({id}) => id), ["runtime"]);
		assert.equal(queryEntry.payload.result.coverage, "complete");
	});

	it("rejects model-visible bytes that do not match the Run Request", async () => {
		const root = await temporaryRoot();
		await assert.rejects(
			runDshAgent({
				request: runRequest("run-dsh-tampered", "session-dsh-tampered"),
				artifacts: {...artifacts(root), prompt: "tampered"},
				installModelAdapter: createDshReplayModelInstaller({
					fixturePath,
					fixtureDigest,
				}),
			}),
			/DSH prompt does not match its Run Request digest/,
		);
	});
});

async function temporaryRoot() {
	const path = await mkdtemp(join(tmpdir(), "codewiki-dsh-adapter-"));
	temporaryDirectories.push(path);
	return path;
}

function artifacts(root) {
	return {
		systemPrompt: "CodeWiki deterministic qualification",
		prompt: "Return qualification text.",
		workspacePath: root,
		sessionRoot: join(root, "sessions"),
	};
}

function runRequest(runId, sessionId, stageContextBundle = null) {
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
		runtimeBuild: {
			buildDigest: digest("runtime-build"),
			runProtocolVersion: "1.0.0",
		},
		session: {mode: "create", sessionId, resumeLog: null},
		inputs: {
			stageContextDigest: stageContextBundle?.context.contextDigest ?? digest("stage-context"),
			staticInputManifestDigest: digest("static-inputs"),
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
		createdAt: "2026-08-17T20:00:00.000Z",
		deadlineAt: "2026-08-17T20:01:00.000Z",
	});
}

function contextBundle() {
	const context = createStageContextSnapshot({
		stage: "decision",
		subject: {id: "subject-run-dsh-context", digest: digest("subject")},
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

function digest(value) {
	return sha256Digest(value);
}

function sequenceClock(...values) {
	let index = 0;
	return () => values[Math.min(index++, values.length - 1)];
}
