import {
	createRunHandle,
	createRunRawLogReference,
	createRunReceipt,
	createRunRequest,
} from "../../../src/runtime/contracts.ts";
import {
	canonicalJsonDigest,
	sha256Digest,
} from "../../../src/utils/canonical-json.ts";

export function digest(label) {
	return sha256Digest(label);
}

export function runRequest(runId = "run-evidence", sessionId = "session-evidence") {
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
			systemPromptDigest: canonicalJsonDigest("System prompt"),
			promptDigest: canonicalJsonDigest("Run prompt"),
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
		createdAt: "2026-08-18T10:00:00.000Z",
		deadlineAt: "2026-08-18T10:01:00.000Z",
	});
}

export function rawLogReference(request, content) {
	return createRunRawLogReference({
		encoding: "jsonl",
		formatVersion: 1,
		sessionId: request.session.sessionId,
		storageId: `raw-${request.runId}`,
		byteLength: content.byteLength,
		digest: sha256Digest(content),
		runtimeBuildDigest: request.runtimeBuild.buildDigest,
	});
}

export function completedReceipt(request, executionLedgerDigest, rawLog) {
	return createRunReceipt({
		handle: createRunHandle(request, "2026-08-18T10:00:01.000Z"),
		outcome: "completed",
		finalEventSequence: 2,
		startedAt: "2026-08-18T10:00:02.000Z",
		finishedAt: "2026-08-18T10:00:03.000Z",
		executionLedgerDigest,
		rawLog,
		outputDigest: digest("output"),
		usageDigest: digest("usage"),
		cancellationDigest: null,
		quiescenceDigest: digest("quiescence"),
		custodyGaps: [],
		operationalGaps: [],
	});
}
