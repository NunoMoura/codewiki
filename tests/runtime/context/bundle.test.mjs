import assert from "node:assert/strict";
import test from "node:test";

import {
	STAGE_CONTEXT_BUNDLE_MAX_BYTES,
	STAGE_CONTEXT_QUERY_ENGINE_DIGEST,
	STAGE_CONTEXT_QUERY_ENGINE_ID,
	STAGE_CONTEXT_QUERY_ENGINE_VERSION,
	assertStageContextBundle,
	createStageContextBundle,
	createStageContextFacade,
} from "../../../src/runtime/context/bundle.ts";
import {createStageContextSnapshot} from "../../../src/runtime/context/contracts.ts";
import {digest} from "../helpers/run-evidence.mjs";

function context() {
	return createStageContextSnapshot({
		stage: "decision",
		subject: {id: "change-17", digest: digest("change-17")},
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
		producerSkillSetDigest: null,
		gateFeedbackDigest: null,
		capturedAt: "2026-08-18T12:00:00.000Z",
		stale: false,
		coverage: {status: "complete", unknowns: []},
		queryEngine: {
			id: STAGE_CONTEXT_QUERY_ENGINE_ID,
			version: STAGE_CONTEXT_QUERY_ENGINE_VERSION,
			digest: STAGE_CONTEXT_QUERY_ENGINE_DIGEST,
		},
	});
}

function route(owner, operation, argumentsValue, values) {
	return {
		owner,
		operation,
		arguments: argumentsValue,
		items: values.map((value, index) => ({
			value,
			sourceReferences: [{
				owner,
				id: `${operation}-${index}`,
				digest: digest(`${operation}-${index}`),
				location: `${operation}.md#${index}`,
			}],
		})),
		coverage: "complete",
		unknowns: [],
		stale: false,
	};
}

test("Stage Context bundle is deterministic and rejects modified retained bytes", () => {
	const snapshot = context();
	const first = createStageContextBundle({
		context: snapshot,
		routes: [
			route("knowledge", "concepts", {prefix: "r"}, [{id: "runtime"}]),
			route("work-state", "current", {}, [{stage: "decision"}]),
		],
	});
	const reordered = createStageContextBundle({
		context: snapshot,
		routes: [
			route("work-state", "current", {}, [{stage: "decision"}]),
			route("knowledge", "concepts", {prefix: "r"}, [{id: "runtime"}]),
		],
	});
	assert.equal(first.bundleDigest, reordered.bundleDigest);
	assert.equal(assertStageContextBundle(first).bundleDigest, first.bundleDigest);
	assert.throws(
		() => assertStageContextBundle({...first, bundleDigest: digest("tampered")}),
		/bundle digest is invalid/,
	);
	assert.throws(
		() => createStageContextBundle({
			context: snapshot,
			routes: [
				route("work-state", "current", {}, []),
				route("work-state", "current", {}, []),
			],
		}),
		/duplicate admitted route/,
	);
	assert.throws(
		() => createStageContextBundle({
			context: snapshot,
			routes: [route("knowledge", "oversized", {}, [
				{text: "x".repeat(STAGE_CONTEXT_BUNDLE_MAX_BYTES)},
			])],
		}),
		/exceeds its byte limit/,
	);
	const unsupportedEngine = createStageContextSnapshot({
		...snapshot,
		queryEngine: {...snapshot.queryEngine, digest: digest("unsupported-engine")},
	});
	assert.throws(
		() => createStageContextBundle({context: unsupportedEngine, routes: []}),
		/query engine is not supported/,
	);
});

test("Stage Context facade paginates one immutable admitted route with bound cursors", () => {
	const facade = createStageContextFacade(createStageContextBundle({
		context: context(),
		routes: [route("knowledge", "concepts", {prefix: ""}, [
			{id: "alignment"},
			{id: "runtime"},
			{id: "trace"},
		])],
	}));
	const first = facade.query({
		owner: "knowledge",
		operation: "concepts",
		arguments: {prefix: ""},
		limit: 2,
		cursor: null,
	});
	assert.deepEqual(first.result.items.map(({id}) => id), ["alignment", "runtime"]);
	assert.equal(first.result.truncated, true);
	assert.equal(first.result.sourceReferences.length, 2);

	const second = facade.query({
		owner: "knowledge",
		operation: "concepts",
		arguments: {prefix: ""},
		limit: 2,
		cursor: first.result.nextCursor,
	});
	assert.deepEqual(second.result.items.map(({id}) => id), ["trace"]);
	assert.equal(second.result.truncated, false);
	assert.equal(second.result.nextCursor, null);
	assert.throws(
		() => facade.query({
			owner: "knowledge",
			operation: "concepts",
			arguments: {prefix: "other"},
			limit: 2,
			cursor: first.result.nextCursor,
		}),
		/cursor does not match/,
	);
});

test("Stage Context facade returns explicit unknown coverage and digest-bound batches", () => {
	const facade = createStageContextFacade(createStageContextBundle({
		context: context(),
		routes: [route("work-state", "current", {}, [{stage: "decision"}])],
	}));
	const missing = facade.query({
		owner: "evidence",
		operation: "fresh",
		arguments: {},
		limit: 5,
		cursor: null,
	});
	assert.equal(missing.result.coverage, "unknown");
	assert.deepEqual(missing.result.unknowns, [
		"No admitted Stage Context route matches this query.",
	]);

	const batch = facade.batch([
		{
			owner: "work-state",
			operation: "current",
			arguments: {},
			limit: 1,
			cursor: null,
		},
		{
			owner: "evidence",
			operation: "fresh",
			arguments: {},
			limit: 5,
			cursor: null,
		},
	]);
	assert.equal(batch.result.results.length, 2);
	assert.equal(batch.result.results[0].coverage, "complete");
	assert.equal(batch.result.results[1].coverage, "unknown");
	assert.match(batch.result.resultDigest, /^sha256:[0-9a-f]{64}$/);
});
