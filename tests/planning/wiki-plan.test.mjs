import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runWikiDecide } from "../../src/api/wiki-decide.ts";
import { runWikiPlan } from "../../src/api/wiki-plan.ts";
import { appendTraceRecord } from "../../src/traces/append.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { replayTrace } from "../../src/traces/replay.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { createTraceHead } from "../../src/traces/writer.ts";

function nextSequence(events) {
	return Math.max(0, ...events.map((event) => event.sequence || 0)) + 1;
}

function approvedDecisionRef(events) {
	const iteration = events.find(
		(event) => event.event === "decision.iteration",
	);
	const row = iteration?.data?.output?.approvedRows?.[0];
	assert.ok(iteration);
	assert.ok(row);
	return `trace:${iteration.id}#row:${row.id}`;
}

async function decision(traceId, options = {}) {
	return runWikiDecide({
		mode: options.mode || "preview",
		repoRoot: options.repoRoot,
		expectedBytes: options.expectedBytes,
		traceId,
		nextSequence: options.nextSequence || 1,
		createdAt: "2026-06-11T00:00:01.000Z",
		tableInput: {
			id: `${traceId}-DT`,
			createdAt: "2026-06-11T00:00:01.000Z",
			updatedAt: "2026-06-11T00:00:01.000Z",
			rows: [
				{
					id: "DTR-wiki-plan",
					currentState: "Planning callers use iteration runner directly.",
					desiredState: "wiki_plan wraps planning output and append safely.",
					rationale: "Avoid split output/exit public workflow.",
					approval: "approved",
					sourceRefs: ["kb:system/planning-loop.md"],
				},
			],
		},
	});
}

function workItemInput(decisionEventId) {
	return {
		id: "WU-wiki-plan",
		title: "Run wiki_plan",
		decisionRefs: [decisionEventId],
		outcome: "Planning facade runs and appends safely.",
		acceptance: ["wiki_plan appends planning iteration."],
		componentRefs: ["api"],
		pathScopes: ["src/api/wiki-plan.ts"],
		verification: ["tests/planning/wiki-plan.test.mjs"],
	};
}

describe("wiki_plan core facade", () => {
	it("previews planning loop iterations", async () => {
		const traceId = "TRACE-wiki-plan-preview";
		const decided = await decision(traceId);
		const decisionRef = approvedDecisionRef(decided.loopResult.traceEvents);
		const result = await runWikiPlan({
			mode: "preview",
			traceId,
			decisionEvents: decided.loopResult.traceEvents,
			nextSequence: nextSequence(decided.loopResult.traceEvents),
			createdAt: "2026-06-11T00:00:02.000Z",
			workItemInputs: [workItemInput(decisionRef)],
		});

		assert.equal(result.mode, "preview");
		assert.equal(result.iterationEvent.event, "planning.iteration");
		assert.equal(result.loopResult.readyForImplementation, true);
		assert.equal(result.append, undefined);
	});

	it("appends planning loop iterations after decision iterations", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-wiki-plan-"));
		try {
			const traceId = "TRACE-wiki-plan-append";
			const head = createTraceHead({
				traceId,
				title: "Append wiki_plan result",
				createdAt: "2026-06-11T00:00:00.000Z",
			});
			const first = await appendTraceRecord(root, head, 0);
			const decided = await decision(traceId, {
				mode: "append",
				repoRoot: root,
				expectedBytes: first.nextBytes,
				nextSequence: 1,
			});
			const decisionRef = approvedDecisionRef(decided.loopResult.traceEvents);
			const result = await runWikiPlan({
				repoRoot: root,
				mode: "append",
				expectedBytes: decided.append?.nextBytes,
				traceId,
				decisionEvents: decided.loopResult.traceEvents,
				nextSequence: nextSequence(decided.loopResult.traceEvents),
				createdAt: "2026-06-11T00:00:02.000Z",
				workItemInputs: [workItemInput(decisionRef)],
			});
			const readBack = await readTrace(join(root, traceFilePath(traceId)));
			const state = replayTrace(readBack.records);

			assert.equal(result.mode, "append");
			assert.equal(result.append?.records.length, 2);
			assert.equal(state.events.at(-1)?.event, "planning.iteration");
			assert.equal(state.latestCheckpoint?.parentId, result.iterationEvent.id);
			await assert.rejects(
				() =>
					runWikiPlan({
						repoRoot: root,
						mode: "append",
						traceId,
						decisionEvents: decided.loopResult.traceEvents,
						workItemInputs: [workItemInput(decisionRef)],
					}),
				/expectedBytes/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
