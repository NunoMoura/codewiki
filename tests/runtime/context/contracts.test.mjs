import assert from "node:assert/strict";
import test from "node:test";

import {
	createStageContextQuery,
	createStageContextQueryBatch,
	createStageContextQueryBatchResult,
	createStageContextQueryResult,
	createStageContextSnapshot,
} from "../../../src/runtime/context/contracts.ts";
import {digest} from "../helpers/run-evidence.mjs";

function stageContext(subjectId = "subject-context") {
	return createStageContextSnapshot({
		stage: "decision",
		subject: {id: subjectId, digest: digest(`subject-${subjectId}`)},
		changeRevisionDigest: digest("change-revision"),
		sources: {
			workState: digest("work-state"),
			knowledge: digest("knowledge"),
			alignment: digest("alignment"),
			repository: digest("repository"),
			change: digest("change"),
			evidence: digest("evidence"),
			result: digest("result"),
		},
		producerSkillSetDigest: digest("skills"),
		gateFeedbackDigest: null,
		capturedAt: "2026-08-18T10:00:00.000Z",
		stale: false,
		coverage: {status: "complete", unknowns: []},
		queryEngine: {
			id: "codewiki-stage-context",
			version: "1.0.0",
			digest: digest("query-engine"),
		},
	});
}

test("Stage Context binds exact owner snapshots and deterministic bounded queries", () => {
	const context = stageContext();
	const query = createStageContextQuery(context, {
		owner: "knowledge",
		operation: "concepts.by-id",
		arguments: {ids: ["beta", "alpha"]},
		limit: 2,
		cursor: null,
	});
	const result = createStageContextQueryResult(context, query, {
		items: [{id: "alpha"}, {id: "beta"}],
		sourceReferences: [
			{owner: "knowledge", id: "beta", digest: digest("beta"), location: "b.md"},
			{owner: "knowledge", id: "alpha", digest: digest("alpha"), location: "a.md"},
		],
		coverage: "complete",
		unknowns: [],
		truncated: false,
		nextCursor: null,
		stale: false,
	});

	assert.match(context.contextDigest, /^sha256:[0-9a-f]{64}$/);
	assert.match(query.queryDigest, /^sha256:[0-9a-f]{64}$/);
	assert.match(result.resultDigest, /^sha256:[0-9a-f]{64}$/);
	assert.deepEqual(
		result.sourceReferences.map(({id}) => id),
		["alpha", "beta"],
	);
	assert.equal(
		createStageContextQuery(context, {
			owner: "knowledge",
			operation: "concepts.by-id",
			arguments: {ids: ["beta", "alpha"]},
			limit: 2,
			cursor: null,
		}).queryDigest,
		query.queryDigest,
	);
});

test("Stage Context batch preserves declared query/result order and exact bindings", () => {
	const context = stageContext();
	const first = createStageContextQuery(context, {
		owner: "work-state",
		operation: "current",
		arguments: {},
		limit: 1,
		cursor: null,
	});
	const second = createStageContextQuery(context, {
		owner: "evidence",
		operation: "fresh.by-subject",
		arguments: {subjectId: context.subject.id},
		limit: 10,
		cursor: null,
	});
	const batch = createStageContextQueryBatch(context, [first, second]);
	const firstResult = createStageContextQueryResult(context, first, {
		items: [{stage: "decision"}],
		sourceReferences: [],
		coverage: "complete",
		unknowns: [],
		truncated: false,
		nextCursor: null,
		stale: false,
	});
	const secondResult = createStageContextQueryResult(context, second, {
		items: [],
		sourceReferences: [],
		coverage: "partial",
		unknowns: ["provider evidence unavailable"],
		truncated: false,
		nextCursor: null,
		stale: true,
	});
	const result = createStageContextQueryBatchResult(batch, [firstResult, secondResult]);

	assert.equal(result.results[0].queryDigest, first.queryDigest);
	assert.equal(result.results[1].queryDigest, second.queryDigest);
	assert.match(result.resultDigest, /^sha256:[0-9a-f]{64}$/);
	assert.throws(
		() => createStageContextQueryBatchResult(batch, [secondResult, firstResult]),
		/order or binding/,
	);
});

test("Stage Context rejects false completeness, cross-snapshot queries, and cursor drift", () => {
	assert.throws(
		() => createStageContextSnapshot({
			...stageContext(),
			coverage: {status: "complete", unknowns: ["missing repository"]},
		}),
		/cannot contain unknowns/,
	);
	const context = stageContext();
	const query = createStageContextQuery(context, {
		owner: "repository",
		operation: "files",
		arguments: {},
		limit: 1,
		cursor: null,
	});
	assert.throws(
		() => createStageContextQueryResult(stageContext("other-subject"), query, {
			items: [],
			sourceReferences: [],
			coverage: "complete",
			unknowns: [],
			truncated: false,
			nextCursor: null,
			stale: false,
		}),
		/belongs to another snapshot/,
	);
	assert.throws(
		() => createStageContextQueryResult(context, query, {
			items: [],
			sourceReferences: [],
			coverage: "partial",
			unknowns: ["more files exist"],
			truncated: true,
			nextCursor: null,
			stale: false,
		}),
		/truncation must agree/,
	);
});
