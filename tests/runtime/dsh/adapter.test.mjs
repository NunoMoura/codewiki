import assert from "node:assert/strict";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {after, describe, it} from "node:test";

import {runDshAgent} from "../../../src/runtime/dsh/adapter.ts";
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

function runRequest(runId, sessionId) {
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
			stageContextDigest: digest("stage-context"),
			staticInputManifestDigest: digest("static-inputs"),
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
		createdAt: "2026-08-17T20:00:00.000Z",
		deadlineAt: "2026-08-17T20:01:00.000Z",
	});
}

function digest(value) {
	return sha256Digest(value);
}

function sequenceClock(...values) {
	let index = 0;
	return () => values[Math.min(index++, values.length - 1)];
}
