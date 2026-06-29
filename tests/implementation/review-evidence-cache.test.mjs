import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runDecisionIteration } from "../../src/decision/iteration.ts";
import { createDecisionTable } from "../../src/decision/table.ts";
import { runImplementationIteration } from "../../src/implementation/iteration.ts";
import { InMemoryReviewEvidenceCache } from "../../src/implementation/review/index.ts";
import { runPlanningIteration } from "../../src/planning/iteration.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";
import { implementationQualityFields } from "../helpers/implementation-change.mjs";
import { planningQualityFields } from "../helpers/planning-work.mjs";

function planningTraceEvents(traceId = "TRACE-review-evidence-cache") {
	const decision = runDecisionIteration({
		traceId,
		table: createDecisionTable({
			id: "DT-cache",
			createdAt: "2026-06-26T00:00:00.000Z",
			updatedAt: "2026-06-26T00:00:00.000Z",
			rows: [
				{
					id: "DTR-cache",
					question: "Should implementation evidence be cached?",
					currentState: "Fast feedback evidence is transient.",
					desiredState: "Implementation can reuse cached review evidence.",
					rationale: "Cached diagnostics should survive until loop exit.",
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["kb:system/loop-contracts.md"],
				},
			],
		}),
	});
	const decisionEvent = decision.traceEvents[0];
	const decisionRef = `trace:${decisionEvent.id}#row:DTR-cache`;
	return runPlanningIteration({
		traceId,
		decisionEvents: decision.traceEvents,
		workItemInputs: [
			{
				id: "WU-cache",
				title: "Implement review evidence cache",
				decisionRefs: [decisionRef],
				outcome: "Review evidence cache participates in implementation.",
				...planningQualityFields(),
				acceptance: ["Cached diagnostics block implementation exit."],
				componentRefs: ["implementation"],
				pathScopes: ["src/feature.ts", "tests/feature.test.ts"],
				verification: ["npm test"],
			},
		],
	}).traceEvents;
}

function workRef(events) {
	const event = events.find((candidate) => candidate.loop === "planning");
	const work = event.data.output.workItems[0];
	return `trace:${event.id}#work:${work.id}`;
}

function implementationChange(planningRef) {
	return {
		id: "IC-cache",
		planningRefs: [planningRef],
		codePaths: ["src/feature.ts"],
		docPaths: [],
		testPaths: ["tests/feature.test.ts"],
		publicationRefs: [],
		checks: ["npm test"],
		checkResults: [
			{
				command: "npm test",
				status: "pass",
				outputRef: "tests/feature.test.ts",
			},
		],
		acceptanceEvidenceItems: [
			{
				criterionId: "AC-001",
				summary: "Feature behavior is covered by tests.",
				evidenceRefs: ["tests/feature.test.ts"],
			},
		],
		contentProof: { workingTreeDigest: "sha256:cacheproof" },
		...implementationQualityFields(),
	};
}

describe("implementation review evidence cache", () => {
	it("records and filters reports by trace, path, phase, and age", () => {
		const cache = new InMemoryReviewEvidenceCache({ maxEntries: 2 });
		cache.record({
			traceId: "TRACE-a",
			createdAt: "2026-06-26T00:00:00.000Z",
			report: { phase: "fast", changedPaths: ["src/a.ts"] },
		});
		cache.record({
			traceId: "TRACE-a",
			createdAt: "2026-06-26T00:00:02.000Z",
			report: { phase: "exit", changedPaths: ["src/b.ts"] },
		});
		cache.record({
			traceId: "TRACE-b",
			createdAt: "2026-06-26T00:00:04.000Z",
			report: { phase: "fast", changedPaths: ["src/c.ts"] },
		});

		assert.equal(cache.entries().length, 2);
		assert.equal(
			cache.reports({ traceId: "TRACE-a", changedPaths: ["src/b.ts"] }).length,
			1,
		);
		assert.equal(
			cache.reports({ phases: ["fast"], changedPaths: ["src/b.ts"] }).length,
			0,
		);
		assert.equal(
			cache.reports({
				maxAgeMs: 1000,
				now: "2026-06-26T00:00:05.000Z",
			}).length,
			1,
		);
	});

	it("reuses cached fast diagnostics during implementation exit", () => {
		const traceId = "TRACE-review-evidence-cache";
		const planningEvents = planningTraceEvents(traceId);
		const planningRef = workRef(planningEvents);
		const cache = new InMemoryReviewEvidenceCache();
		cache.record({
			traceId,
			report: {
				phase: "fast",
				changedPaths: ["src/feature.ts"],
				diagnostics: [
					{
						path: "src/feature.ts",
						severity: "error",
						message: "Cached fast diagnostic.",
						ruleId: "cached-fast",
					},
				],
			},
		});

		const result = runImplementationIteration({
			traceId,
			planningEvents,
			changes: [implementationChange(planningRef)],
			reviewEvidenceCache: cache,
		});

		assert.equal(result.exit.passed, false);
		assert.equal(
			result.exit.issues.some(
				(issue) => issue.code === "review_blocking_diagnostic",
			),
			true,
		);
		assert.equal(
			result.exit.issues.some(
				(issue) => issue.code === "review_missing_acceptance_evidence_link",
			),
			false,
		);
		assert.equal(
			result.traceEvents[0].data.output.reviewEvidenceReports.length,
			1,
		);
	});
});
