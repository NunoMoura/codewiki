import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileDecision } from "../../src/decision/compiler.ts";
import { createDecisionTable } from "../../src/decision/table.ts";
import { compileImplementation } from "../../src/implementation/compiler.ts";
import { contentProofRefs, normalizeImplementationChanges } from "../../src/implementation/evidence.ts";
import { evaluateImplementationGate } from "../../src/implementation/gate.ts";
import { compilePlan } from "../../src/planning/compiler.ts";

function planningEvents() {
	const table = createDecisionTable({
		id: "DT-implementation",
		createdAt: "2026-06-11T00:00:00.000Z",
		updatedAt: "2026-06-11T00:00:00.000Z",
		rows: [
			{
				id: "DTR-001",
				question: "How should implementation evidence be represented?",
				currentState: "Implementation build files own evidence.",
				desiredState: "Implementation trace events own evidence refs.",
				rationale: "Matches traces-first model.",
				approval: "approved",
				sourceRefs: ["kb:system/traces.md"],
			},
		],
	});
	const [decisionEvent] = compileDecision({ traceId: "TRACE-implementation", table }).traceEvents;
	const plan = compilePlan({
		traceId: "TRACE-implementation",
		decisionEvents: [decisionEvent],
		createdAt: "2026-06-11T00:00:00.000Z",
		workItemInputs: [
			{
				id: "WU-001",
				title: "Implement trace-backed evidence",
				decisionRefs: [decisionEvent.id],
				outcome: "Implementation evidence emits trace events.",
				acceptance: ["Changed paths, checks, and proof refs are recorded."],
				pathScopes: ["src/implementation"],
				verification: ["tests/implementation/implementation-compiler.test.mjs"],
			},
		],
	});
	return plan.traceEvents;
}

describe("implementation compiler", () => {
	it("records implementation evidence as trace events", () => {
		const [planningEvent] = planningEvents();
		const result = compileImplementation({
			traceId: "TRACE-implementation",
			planningEvents: [planningEvent],
			createdAt: "2026-06-11T00:00:00.000Z",
			changeInputs: [
				{
					id: "IC-001",
					planningRefs: [planningEvent.id],
					codePaths: ["src/implementation/compiler.ts"],
					testPaths: ["tests/implementation/implementation-compiler.test.mjs"],
					checks: ["npm test"],
					acceptanceEvidence: ["Implementation compiler test passed."],
					contentProof: { workingTreeDigest: "sha256:implementation" },
				},
			],
		});

		assert.equal(result.readyForClosure, true);
		assert.equal(result.gate.passed, true);
		assert.deepEqual(result.gate.coveredPlanningRefs, [planningEvent.id]);
		assert.equal(result.traceEvents[0].event, "implementation.change.recorded");
		assert.equal(result.traceEvents[0].refs.includes("sha256:implementation"), true);
	});

	it("blocks planning work without implementation coverage", () => {
		const [planningEvent] = planningEvents();
		const result = compileImplementation({
			traceId: "TRACE-implementation",
			planningEvents: [planningEvent],
		});

		assert.equal(result.readyForClosure, false);
		assert.deepEqual(result.gate.issues.map((issue) => issue.code), [
			"missing_planning_coverage",
		]);
	});

	it("requires changed paths, checks, acceptance evidence, and content proof", () => {
		const [planningEvent] = planningEvents();
		const [change] = normalizeImplementationChanges([
			{
				id: "IC-001",
				planningRefs: [planningEvent.id],
				codePaths: ["src/implementation/compiler.ts"],
				checks: ["npm test"],
			},
		]);
		const gate = evaluateImplementationGate({
			planningRefs: [planningEvent.id],
			changes: [change],
		});

		assert.equal(gate.passed, false);
		assert.deepEqual(gate.issues.map((issue) => issue.code), [
			"invalid_change",
			"missing_content_proof",
		]);
		assert.deepEqual(contentProofRefs(change), []);
	});

	it("accepts documentation-only changes when proof and checks exist", () => {
		const [planningEvent] = planningEvents();
		const result = compileImplementation({
			traceId: "TRACE-implementation",
			planningEvents: [planningEvent],
			changeInputs: [
				{
					id: "IC-docs",
					planning_refs: [planningEvent.id],
					doc_paths: [".codewiki/kb/system/traces.md"],
					checks_run: ["npm test"],
					acceptance_evidence: ["Trace docs updated."],
					content_proof: { commit: "abc123", tree: "def456" },
				},
			],
		});

		assert.equal(result.readyForClosure, true);
		assert.equal(result.traceEvents[0].refs.includes("abc123"), true);
		assert.equal(result.traceEvents[0].refs.includes("def456"), true);
	});
});
