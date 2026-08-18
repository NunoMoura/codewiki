import assert from "node:assert/strict";
import test from "node:test";

import {Context} from "@deepseek-ai/cordis";
import {CallId} from "@deepseek-ai/dsh-llm";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime from "@deepseek-ai/dsh-tools";

import {
	STAGE_CONTEXT_QUERY_ENGINE_DIGEST,
	STAGE_CONTEXT_QUERY_ENGINE_ID,
	STAGE_CONTEXT_QUERY_ENGINE_VERSION,
	createStageContextBundle,
} from "../../../src/runtime/context/bundle.ts";
import {createStageContextSnapshot} from "../../../src/runtime/context/contracts.ts";
import {
	DSH_STAGE_CONTEXT_BATCH_QUERY_TOOL,
	DSH_STAGE_CONTEXT_QUERY_TOOL,
	DSH_STAGE_CONTEXT_TOOL_OUTPUT_MAX_BYTES,
	DSH_STAGE_CONTEXT_TOOL_SET_DIGEST,
	registerDshStageContextTools,
} from "../../../src/runtime/dsh/context-tools.ts";
import {digest} from "../helpers/run-evidence.mjs";

function bundle(summary = "Bounded execution mechanics.") {
	const context = createStageContextSnapshot({
		stage: "planning",
		subject: {id: "change-tools", digest: digest("change-tools")},
		changeRevisionDigest: digest("revision-tools"),
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
		capturedAt: "2026-08-18T13:00:00.000Z",
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
				value: {id: "runtime", summary},
				sourceReferences: [{
					owner: "knowledge",
					id: "runtime",
					digest: digest("runtime-concept"),
					location: "knowledge/runtime.md",
				}],
			}],
			coverage: "complete",
			unknowns: [],
			stale: false,
		}],
	});
}

async function harness(maxToolCalls = 2, stageContextBundle = bundle()) {
	const context = new Context();
	const promptFiber = await context.plugin(SystemPrompt, {persona: "test"});
	const toolFiber = await context.plugin(ToolRuntime);
	const entries = [];
	const registration = registerDshStageContextTools({
		context,
		bundle: stageContextBundle,
		maxToolCalls,
		record: (entry) => entries.push(entry),
		now: () => "2026-08-18T13:00:01.000Z",
	});
	return {
		context,
		entries,
		registration,
		dispose: async () => {
			registration.dispose();
			await toolFiber.dispose();
			await promptFiber.dispose();
		},
	};
}

async function execute(context, callId, name, argumentsValue) {
	return context.tools.execute({
		callId: CallId(callId),
		name,
		arguments: argumentsValue,
		signal: new AbortController().signal,
	});
}

test("DSH Stage Context tools expose only fixed digest-bound direct and batch schemas", async () => {
	const value = await harness();
	try {
		assert.match(DSH_STAGE_CONTEXT_TOOL_SET_DIGEST, /^sha256:[0-9a-f]{64}$/);
		assert.equal(value.registration.toolSetDigest, DSH_STAGE_CONTEXT_TOOL_SET_DIGEST);
		assert.deepEqual(
			value.context.tools.schemas().map(({name}) => name).sort(),
			[DSH_STAGE_CONTEXT_QUERY_TOOL, DSH_STAGE_CONTEXT_BATCH_QUERY_TOOL],
		);
	} finally {
		await value.dispose();
	}
});

test("DSH direct and batch tools return canonical results and capture exact ledger entries", async () => {
	const value = await harness();
	try {
		const direct = await execute(value.context, "direct-1", DSH_STAGE_CONTEXT_QUERY_TOOL, {
			owner: "knowledge",
			operation: "concepts",
			arguments: {ids: ["runtime"]},
			limit: 10,
		});
		assert.equal(direct.isError, false);
		assert.deepEqual(direct.isError ? null : direct.value.result.items, [{
			id: "runtime",
			summary: "Bounded execution mechanics.",
		}]);

		const batch = await execute(value.context, "batch-1", DSH_STAGE_CONTEXT_BATCH_QUERY_TOOL, {
			queries: [{
				owner: "evidence",
				operation: "fresh",
				arguments: {},
				limit: 5,
			}],
		});
		assert.equal(batch.isError, false);
		assert.equal(batch.isError ? null : batch.value.result.results[0].coverage, "unknown");
		assert.deepEqual(value.entries.map(({kind}) => kind), [
			"tool-call",
			"stage-context-query",
			"tool-result",
			"tool-call",
			"stage-context-query",
			"tool-result",
		]);
		assert.deepEqual(
			value.entries.map(({modelVisible}) => modelVisible),
			[true, false, true, true, false, true],
		);
		assert.equal(value.entries[1].payload.query.queryDigest, direct.isError
			? null
			: direct.value.query.queryDigest);
	} finally {
		await value.dispose();
	}
});

test("DSH Stage Context tool budget fails closed before a query executes", async () => {
	const value = await harness(1);
	try {
		const argumentsValue = {
			owner: "knowledge",
			operation: "concepts",
			arguments: {ids: ["runtime"]},
			limit: 1,
		};
		assert.equal((await execute(
			value.context,
			"first",
			DSH_STAGE_CONTEXT_QUERY_TOOL,
			argumentsValue,
		)).isError, false);
		const denied = await execute(
			value.context,
			"second",
			DSH_STAGE_CONTEXT_QUERY_TOOL,
			argumentsValue,
		);
		assert.equal(denied.isError, true);
		assert.match(denied.isError ? denied.error.message : "", /budget is exhausted/);
		assert.deepEqual(value.entries.map(({kind}) => kind), [
			"tool-call",
			"stage-context-query",
			"tool-result",
			"tool-call",
			"tool-result",
		]);
		assert.match(value.entries.at(-1).payload.error, /budget is exhausted/);
	} finally {
		await value.dispose();
	}
});

test("DSH Stage Context tools reject oversized model-visible results", async () => {
	const value = await harness(
		1,
		bundle("x".repeat(DSH_STAGE_CONTEXT_TOOL_OUTPUT_MAX_BYTES)),
	);
	try {
		const result = await execute(value.context, "oversized", DSH_STAGE_CONTEXT_QUERY_TOOL, {
			owner: "knowledge",
			operation: "concepts",
			arguments: {ids: ["runtime"]},
			limit: 1,
		});
		assert.equal(result.isError, true);
		assert.match(result.isError ? result.error.message : "", /result exceeds its byte limit/);
		assert.match(value.entries.at(-1).payload.error, /result exceeds its byte limit/);
	} finally {
		await value.dispose();
	}
});
