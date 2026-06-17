import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runDecisionIteration } from "../../src/decision/iteration.ts";
import { createDecisionTable } from "../../src/decision/table.ts";
import { parseFileStructureMapYaml } from "../../src/knowledge/file-structure-map.ts";
import { runPlanningIteration } from "../../src/planning/iteration.ts";
import { evaluatePlanningExit } from "../../src/planning/exit.ts";
import { normalizePlanningWorkItems } from "../../src/planning/materialization.ts";
import { orderWorkItems } from "../../src/planning/ordering.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";
import { planningQualityFields } from "../helpers/planning-work.mjs";

function decisionEvents() {
	const table = createDecisionTable({
		id: "DT-planning",
		createdAt: "2026-06-11T00:00:00.000Z",
		updatedAt: "2026-06-11T00:00:00.000Z",
		rows: [
			{
				id: "DTR-001",
				question: "What owns workflow state?",
				currentState: "Generated graph owns workflow state.",
				desiredState: "JSONL traces own workflow state.",
				rationale: "Matches Pi session-inspired model.",
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: ["kb:system/traces.md"],
			},
		],
	});
	return runDecisionIteration({ traceId: "TRACE-planning", table }).traceEvents;
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

function componentMap() {
	return {
		sourceRefs: [".codewiki/kb/system/diagrams/file-structure-map.yaml"],
		components: [
			{
				id: "component.planning",
				kbRefs: [".codewiki/kb/system/iteration runners.md"],
				pathPatterns: ["src/planning/**"],
				testPatterns: ["tests/planning/**"],
			},
		],
	};
}

describe("planning iteration runner", () => {
	it("materializes approved decision events into work units", () => {
		const decisions = decisionEvents();
		const decisionRef = approvedDecisionRef(decisions);
		const result = runPlanningIteration({
			traceId: "TRACE-planning",
			decisionEvents: decisions,
			createdAt: "2026-06-11T00:00:00.000Z",
			workItemInputs: [
				{
					id: "WU-001",
					title: "Implement trace storage",
					decision_refs: [decisionRef],
					outcome: "Trace JSONL storage exists.",
					...planningQualityFields(),
					acceptance: ["Append and replay trace records."],
					path_scopes: ["src/traces"],
					verification: ["tests/planning/planning-iteration.test.mjs"],
				},
			],
		});

		assert.equal(result.readyForImplementation, true);
		assert.equal(result.exit.passed, true);
		assert.equal(result.exit.verdict, "pass");
		assert.equal(result.exit.route, "implementation");
		assert.deepEqual(result.exit.coveredDecisionRefs, [decisionRef]);
		assert.equal(result.draftTraceEvents.length, 0);
		assert.equal(result.traceEvents.length, 1);
		assert.equal(result.traceEvents[0].event, "planning.iteration");
		assert.equal(result.traceEvents[0].data?.exit.status, "exit");
		assert.equal(result.traceEvents[0].data?.exit.targetLoop, "implementation");
		assert.equal(result.checkpoint.type, "tail_checkpoint");
		assert.equal(result.traceRecords.at(-1)?.type, "tail_checkpoint");
		assert.equal(result.traceEvents[0].refs.includes(decisionRef), true);
		assert.deepEqual(result.workItems[0].acceptanceCriteria, [
			{ id: "AC-001", text: "Append and replay trace records." },
		]);
		assert.deepEqual(
			result.traceEvents[0].data?.output?.workItems?.[0]?.acceptanceCriteria,
			[{ id: "AC-001", text: "Append and replay trace records." }],
		);
		assert.deepEqual(
			result.traceEvents[0].data?.output?.qualityStandards?.map(
				(standard) => standard.id,
			),
			[
				"decision_coverage_complete",
				"worker_units_self_contained",
				"technical_requirements_complete",
				"acceptance_and_verification_testable",
				"worker_assignment_ready",
				"uncertainty_resolved",
				"work_unit_right_sized",
				"source_ownership_aligned",
				"dependency_order_clear",
				"resolutions_accounted",
				"traceability_refs_canonical",
			],
		);
		assert.equal(
			result.exit.qualityStandards.every(
				(standard) => standard.status === "met",
			),
			true,
		);
	});

	it("parses KB file-structure component contracts", () => {
		const map = parseFileStructureMapYaml(
			readFileSync(
				".codewiki/kb/system/diagrams/file-structure-map.yaml",
				"utf8",
			),
		);

		assert.equal(
			map.components.some(
				(component) => component.id === "component.implementation",
			),
			true,
		);
		assert.equal(
			map.components
				.find((component) => component.id === "component.implementation")
				?.testPatterns.includes("tests/implementation/**"),
			true,
		);
		assert.deepEqual(
			map.components.find((component) => component.id === "component.git")
				?.pathPatterns,
			["src/git/**"],
		);
		assert.equal(
			map.components
				.find((component) => component.id === "component.git")
				?.testPatterns.includes("tests/runtime/worktrees.test.mjs"),
			true,
		);
		assert.equal(
			map.components
				.find((component) => component.id === "component.knowledge")
				?.testPatterns.includes("tests/knowledge/**"),
			true,
		);
	});

	it("links planning work to file-structure components", () => {
		const decisions = decisionEvents();
		const decisionRef = approvedDecisionRef(decisions);
		const result = runPlanningIteration({
			traceId: "TRACE-planning",
			decisionEvents: decisions,
			componentMap: componentMap(),
			createdAt: "2026-06-11T00:00:00.000Z",
			workItemInputs: [
				{
					id: "WU-component",
					decisionRefs: [decisionRef],
					outcome: "Planning component is aligned.",
					...planningQualityFields(),
					acceptance: ["Component refs and test scope are explicit."],
					componentRefs: ["component.planning"],
					pathScopes: ["src/planning"],
					verification: ["tests/planning/planning-iteration.test.mjs"],
				},
			],
		});

		assert.equal(result.exit.passed, true);
		assert.deepEqual(result.workItems[0].componentRefs, ["component.planning"]);
		assert.deepEqual(
			result.traceEvents[0].data?.output?.workItems?.[0]?.componentRefs,
			["component.planning"],
		);
		assert.equal(
			result.traceEvents[0].refs.includes(
				".codewiki/kb/system/diagrams/file-structure-map.yaml",
			),
			true,
		);
	});

	it("blocks work outside declared file-structure components", () => {
		const decisionRef = approvedDecisionRef(decisionEvents());
		const exit = evaluatePlanningExit({
			decisionRefs: [decisionRef],
			componentMap: componentMap(),
			workItems: normalizePlanningWorkItems([
				{
					id: "WU-component-drift",
					decisionRefs: [decisionRef],
					outcome: "Component drift is blocked.",
					...planningQualityFields(),
					acceptance: ["Done"],
					componentRefs: ["component.planning"],
					pathScopes: ["src/implementation"],
					verification: ["tests/views/views-projections.test.mjs"],
				},
			]),
			resolutions: [],
		});

		assert.equal(exit.passed, false);
		assert.equal(
			exit.issues.some(
				(issue) => issue.code === "path_outside_component_scope",
			),
			true,
		);
		assert.equal(
			exit.issues.some(
				(issue) => issue.code === "verification_outside_component_tests",
			),
			true,
		);
	});

	it("blocks worker units without implementation-ready agent assessment", () => {
		const decisionRef = approvedDecisionRef(decisionEvents());
		const exit = evaluatePlanningExit({
			decisionRefs: [decisionRef],
			workItems: normalizePlanningWorkItems([
				{
					id: "WU-handoff",
					decisionRefs: [decisionRef],
					outcome: "Worker handoff is blocked until right-sized.",
					...planningQualityFields({
						planningAssessment: {
							stance: "needs_split",
							workUnitSize: "too_large",
							rightSizing: "This is sprint-sized and should be split.",
							independence:
								"Worker needs more decomposition before implementation.",
							implementationReadiness:
								"Requirements span multiple source areas.",
							rationale:
								"One worker would need to make multiple unrelated changes.",
						},
					}),
					acceptance: ["Done"],
					pathScopes: ["src/planning"],
				},
			]),
			resolutions: [],
		});

		assert.equal(exit.passed, false);
		assert.equal(exit.verdict, "fail");
		const standards = Object.fromEntries(
			exit.qualityStandards.map((standard) => [standard.id, standard]),
		);
		assert.equal(standards.worker_assignment_ready.mode, "agent");
		assert.equal(standards.worker_assignment_ready.status, "unmet");
		assert.equal(standards.work_unit_right_sized.mode, "agent");
		assert.equal(standards.work_unit_right_sized.status, "unmet");
		assert.deepEqual(
			exit.issues
				.map((issue) => issue.code)
				.filter((code) => code.includes("worker") || code.includes("sized"))
				.sort(),
			["planning_assessment_not_worker_ready", "work_unit_not_right_sized"],
		);
	});

	it("routes unresolved planning uncertainty to user authority", () => {
		const decisionRef = approvedDecisionRef(decisionEvents());
		const exit = evaluatePlanningExit({
			decisionRefs: [decisionRef],
			workItems: normalizePlanningWorkItems([
				{
					id: "WU-uncertain",
					decisionRefs: [decisionRef],
					outcome: "User authority must resolve scope.",
					...planningQualityFields({
						planningAssessment: {
							stance: "worker_ready",
							workUnitSize: "right_sized",
							rightSizing: "Size is acceptable if user confirms scope.",
							independence: "Worker can proceed after authority is clarified.",
							implementationReadiness: "Implementation details are clear.",
							uncertainties: ["User-facing scope is ambiguous."],
							uncertaintyOwner: "user",
							uncertaintyResolution:
								"Block for user clarification before implementation.",
							rationale:
								"Planning must not leak user authority ambiguity downstream.",
						},
					}),
					acceptance: ["Done"],
					pathScopes: ["src/planning"],
				},
			]),
			resolutions: [],
		});

		assert.equal(exit.passed, false);
		assert.equal(exit.verdict, "block");
		assert.equal(exit.route, "user");
		const uncertainty = exit.qualityStandards.find(
			(standard) => standard.id === "uncertainty_resolved",
		);
		assert.equal(uncertainty?.status, "blocked");
		assert.equal(
			exit.criteria.find((criterion) => criterion.id === "uncertainty_resolved")
				?.status,
			"block",
		);
	});

	it("blocks invalid or duplicate acceptance criteria", () => {
		const decisionRef = approvedDecisionRef(decisionEvents());
		const [item] = normalizePlanningWorkItems([
			{
				id: "WU-criteria",
				decisionRefs: [decisionRef],
				outcome: "Criterion ids are stable.",
				...planningQualityFields(),
				acceptanceCriteria: [
					{ id: "AC-001", text: "First" },
					{ id: "AC-001", text: "Second" },
					{ id: "AC-002", text: "" },
				],
				pathScopes: ["src/planning"],
			},
		]);
		const exit = evaluatePlanningExit({
			decisionRefs: [decisionRef],
			workItems: [item],
			resolutions: [],
		});

		assert.equal(exit.passed, false);
		assert.equal(
			exit.issues.some(
				(issue) => issue.code === "duplicate_acceptance_criterion_id",
			),
			true,
		);
		assert.equal(
			exit.issues.some(
				(issue) => issue.code === "invalid_acceptance_criterion",
			),
			true,
		);
	});

	it("blocks accepted decision rows without planning coverage", () => {
		const decisions = decisionEvents();
		const result = runPlanningIteration({
			traceId: "TRACE-planning",
			decisionEvents: decisions,
		});

		assert.equal(result.readyForImplementation, false);
		assert.equal(result.exit.verdict, "fail");
		assert.equal(result.exit.route, "planning");
		assert.deepEqual(
			result.exit.issues.map((issue) => issue.code),
			["missing_decision_coverage"],
		);
		assert.equal(result.traceEvents.length, 1);
		assert.equal(result.traceEvents[0].event, "planning.iteration");
		assert.equal(result.traceEvents[0].data?.exit.status, "continue");
	});

	it("accepts deferred decisions only with owner, trigger, rationale, and evidence", () => {
		const decisions = decisionEvents();
		const decisionRef = approvedDecisionRef(decisions);
		const missing = runPlanningIteration({
			traceId: "TRACE-planning",
			decisionEvents: decisions,
			resolutionInputs: [
				{
					decisionRef: decisionRef,
					kind: "deferred",
					owner: "runtime migration",
				},
			],
		});
		assert.equal(missing.readyForImplementation, false);
		assert.equal(missing.exit.verdict, "fail");
		assert.equal(missing.exit.issues[0].code, "invalid_resolution");
		assert.equal(missing.traceEvents.length, 1);
		assert.equal(missing.traceEvents[0].event, "planning.iteration");

		const complete = runPlanningIteration({
			traceId: "TRACE-planning",
			decisionEvents: decisions,
			resolutionInputs: [
				{
					decisionRef: decisionRef,
					kind: "deferred",
					owner: "runtime migration",
					trigger: "after traces module lands",
					rationale: "Runtime needs trace append primitives first.",
					...decisionQualityFields(),
					evidenceRefs: ["kb:system/traces.md"],
				},
			],
		});
		assert.equal(complete.readyForImplementation, true);
		assert.equal(complete.exit.verdict, "pass");
		assert.equal(complete.exit.route, "close");
		assert.equal(complete.traceEvents[0].event, "planning.iteration");
		assert.equal(complete.traceEvents[0].data?.exit.targetLoop, null);
		assert.equal(
			complete.traceEvents[0].data?.output?.resolutions?.[0]?.kind,
			"deferred",
		);
	});

	it("blocks unknown planning resolution kinds", () => {
		const decisions = decisionEvents();
		const decisionRef = approvedDecisionRef(decisions);
		const result = runPlanningIteration({
			traceId: "TRACE-planning",
			decisionEvents: decisions,
			resolutionInputs: [
				{
					decisionRef,
					kind: "routeback",
					evidenceRefs: ["kb:system/planning-loop.md"],
				},
			],
		});

		assert.equal(result.readyForImplementation, false);
		assert.equal(result.exit.verdict, "fail");
		assert.equal(result.resolutions[0].kind, "routeback");
		assert.deepEqual(
			result.exit.issues.map((issue) => issue.code),
			["invalid_resolution_kind"],
		);
		assert.equal(
			result.exit.qualityStandards.find(
				(standard) => standard.id === "resolutions_accounted",
			)?.status,
			"unmet",
		);
	});

	it("routes complete route-back resolutions to decision authority", () => {
		const decisions = decisionEvents();
		const decisionRef = approvedDecisionRef(decisions);
		const incomplete = runPlanningIteration({
			traceId: "TRACE-planning",
			decisionEvents: decisions,
			resolutionInputs: [
				{
					decisionRef,
					kind: "route-back",
					evidenceRefs: ["kb:system/planning-loop.md"],
				},
			],
		});
		assert.equal(incomplete.readyForImplementation, false);
		assert.equal(incomplete.exit.route, "planning");
		assert.equal(incomplete.exit.issues[0].code, "invalid_resolution");

		const routed = runPlanningIteration({
			traceId: "TRACE-planning",
			decisionEvents: decisions,
			resolutionInputs: [
				{
					decisionRef,
					kind: "route-back",
					owner: "decision",
					trigger: "decision authority needed before implementation",
					rationale: "Accepted intent changed beyond planning authority.",
					evidenceRefs: ["kb:system/planning-loop.md"],
				},
			],
		});

		assert.equal(routed.readyForImplementation, false);
		assert.equal(routed.exit.verdict, "fail");
		assert.equal(routed.exit.route, "decision");
		assert.deepEqual(
			routed.exit.issues.map((issue) => issue.code),
			["route_back_resolution"],
		);
		assert.equal(routed.traceEvents[0].data?.exit.status, "route_back");
		assert.equal(routed.traceEvents[0].data?.exit.targetLoop, "decision");
	});

	it("detects conflicting path scopes unless dependency orders the work", () => {
		const decisionRef = approvedDecisionRef(decisionEvents());
		const conflictingItems = normalizePlanningWorkItems([
			{
				id: "WU-001",
				decisionRefs: [decisionRef],
				outcome: "First change",
				...planningQualityFields(),
				acceptance: ["Done"],
				pathScopes: ["src/traces"],
			},
			{
				id: "WU-002",
				decisionRefs: [decisionRef],
				outcome: "Second change",
				...planningQualityFields(),
				acceptance: ["Done"],
				pathScopes: ["src/traces"],
			},
		]);
		const conflictGate = evaluatePlanningExit({
			decisionRefs: [decisionRef],
			workItems: conflictingItems,
			resolutions: [],
		});
		assert.equal(conflictGate.passed, false);
		assert.equal(
			conflictGate.issues.some((issue) => issue.code === "path_conflict"),
			true,
		);

		const orderedItems = normalizePlanningWorkItems([
			{ ...conflictingItems[0] },
			{ ...conflictingItems[1], dependsOn: ["WU-001"] },
		]);
		const orderedGate = evaluatePlanningExit({
			decisionRefs: [decisionRef],
			workItems: orderedItems,
			resolutions: [],
		});
		assert.equal(orderedGate.passed, true);
		assert.deepEqual(
			orderWorkItems(orderedItems).map((item) => item.id),
			["WU-001", "WU-002"],
		);
	});

	it("blocks weak dependencies and hierarchical path conflicts", () => {
		const decisionRef = approvedDecisionRef(decisionEvents());
		const exit = evaluatePlanningExit({
			decisionRefs: [decisionRef],
			workItems: normalizePlanningWorkItems([
				{
					id: "WU-parent",
					decisionRefs: [decisionRef],
					outcome: "Parent scope",
					...planningQualityFields(),
					acceptance: ["Done"],
					pathScopes: ["src/views"],
					dependsOn: ["WU-missing"],
				},
				{
					id: "WU-child",
					decisionRefs: [decisionRef],
					outcome: "Child scope",
					...planningQualityFields(),
					acceptance: ["Done"],
					pathScopes: ["src/views/status.ts"],
				},
			]),
			resolutions: [],
		});

		assert.equal(exit.passed, false);
		assert.equal(
			exit.issues.some((issue) => issue.code === "unknown_dependency"),
			true,
		);
		assert.equal(
			exit.issues.some((issue) => issue.code === "path_conflict"),
			true,
		);
	});

	it("blocks non-canonical planning refs", () => {
		const decisionRef = approvedDecisionRef(decisionEvents());
		const exit = evaluatePlanningExit({
			decisionRefs: [decisionRef],
			workItems: normalizePlanningWorkItems([
				{
					id: "WU-ref",
					decisionRefs: [decisionRef],
					outcome: "Use canonical refs",
					...planningQualityFields(),
					acceptance: ["Done"],
					pathScopes: ["weak/path"],
				},
			]),
			resolutions: [],
		});

		assert.equal(exit.passed, false);
		assert.equal(
			exit.issues.some((issue) => issue.code === "invalid_traceability_ref"),
			true,
		);
	});

	it("blocks duplicate work items and dependency cycles", () => {
		const decisionRef = approvedDecisionRef(decisionEvents());
		const exit = evaluatePlanningExit({
			decisionRefs: [decisionRef],
			workItems: normalizePlanningWorkItems([
				{
					id: "WU-a",
					decisionRefs: [decisionRef],
					outcome: "A",
					...planningQualityFields(),
					acceptance: ["Done"],
					pathScopes: ["src/a"],
					dependsOn: ["WU-b"],
				},
				{
					id: "WU-b",
					decisionRefs: [decisionRef],
					outcome: "B",
					...planningQualityFields(),
					acceptance: ["Done"],
					pathScopes: ["src/b"],
					dependsOn: ["WU-a"],
				},
				{
					id: "WU-c",
					decisionRefs: [decisionRef],
					outcome: "C",
					...planningQualityFields(),
					acceptance: ["Done"],
					pathScopes: ["src/c"],
				},
				{
					id: "WU-c",
					decisionRefs: [decisionRef],
					outcome: "C duplicate",
					...planningQualityFields(),
					acceptance: ["Done"],
					pathScopes: ["src/d"],
				},
			]),
			resolutions: [],
		});

		assert.equal(exit.passed, false);
		assert.equal(
			exit.issues.some((issue) => issue.code === "duplicate_work_item_id"),
			true,
		);
		assert.equal(
			exit.issues.some((issue) => issue.code === "dependency_cycle"),
			true,
		);
	});
});
