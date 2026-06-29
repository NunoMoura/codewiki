import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runDecisionIteration } from "../../src/decision/iteration.ts";
import { evaluateDecisionExit } from "../../src/decision/loop.ts";
import {
	decisionPropagationRefs,
	decisionStateDeltaGaps,
} from "../../src/decision/propagation.ts";
import {
	applyDecisionRowActions,
	createDecisionTable,
} from "../../src/decision/table.ts";
import { formatTraceLine } from "../../src/traces/writer.ts";
import { parseTraceLine } from "../../src/traces/reader.ts";
import {
	builtInDecisionTypeDefinitions,
	decisionTypeDefinitionById,
	validateDecisionTypeDefinitions,
} from "../../src/decision/type-definitions.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";

describe("decision tables", () => {
	it("normalizes target decision row inputs", () => {
		const table = createDecisionTable({
			id: "DT-001",
			createdAt: "2026-06-11T00:00:00.000Z",
			rows: [
				{
					id: "DTR-001",
					currentState: "Graph is treated as state truth.",
					desiredState: "JSONL traces are workflow/state truth.",
					rationale: "Matches recovered traces-first decision.",
					...decisionQualityFields(),
					approval: "accept",
					affectedLayers: ["system", "source"],
					sourceRefs: ["kb:system/traces.md"],
					changeType: "maintenance",
				},
			],
		});

		assert.equal(table.rows.length, 1);
		assert.equal(table.rows[0].approval, "approved");
		assert.equal(table.rows[0].changeType, "code");
		assert.equal(table.rows[0].decisionKind, "improve");
		assert.equal(table.rows[0].decisionType, "improve");
		assert.equal(table.rows[0].workScale, "small");
		assert.equal(table.rows[0].planningDepth, "micro");
		assert.deepEqual(table.rows[0].affectedLayers, ["system", "source"]);
	});

	it("applies row actions atomically", () => {
		const table = createDecisionTable({
			id: "DT-002",
			rows: [
				{
					id: "DTR-001",
					currentState: "Old model",
					desiredState: "New model",
					rationale: "Needed",
					...decisionQualityFields(),
				},
			],
		});

		const failed = applyDecisionRowActions(table, [
			{ rowId: "DTR-001", action: "accept" },
			{ rowId: "missing", action: "reject" },
		]);
		assert.equal(failed.changed, false);
		assert.equal(failed.table.rows[0].approval, "pending");

		const passed = applyDecisionRowActions(table, [
			{ rowId: "DTR-001", action: "accept" },
		]);
		assert.equal(passed.changed, true);
		assert.equal(passed.table.rows[0].approval, "approved");
		assert.equal(table.rows[0].approval, "pending");
	});
});

describe("decision type registry", () => {
	it("exposes safe built-in definitions and fail-closed lookup", () => {
		const definitions = builtInDecisionTypeDefinitions();
		assert.deepEqual(validateDecisionTypeDefinitions(definitions), []);
		assert.deepEqual(
			definitions.map((definition) => definition.id),
			[
				"debug",
				"fix",
				"harden",
				"improve",
				"migrate",
				"docs",
				"release",
				"direct_implementation",
			],
		);
		assert.equal(decisionTypeDefinitionById("missing", definitions), undefined);
		assert.equal(
			definitions.every(
				(definition) =>
					definition.pipelineProfile.id &&
					definition.loopQualityProfile.id &&
					definition.evidencePolicy.id &&
					definition.forbiddenSkips.includes("protected_hard_gates"),
			),
			true,
		);
	});

	it("blocks unknown decision types and unsafe direct profile routes", () => {
		const unknown = createDecisionTable({
			rows: [
				{
					id: "DTR-unknown-type",
					currentState: "A row can name an arbitrary type.",
					desiredState: "Unknown decision types fail closed.",
					rationale: "Profiles must be package-owned or guarded.",
					...decisionQualityFields(),
					decisionType: "surprise",
					approval: "approved",
					sourceRefs: ["kb:system/decision-loop.md"],
				},
			],
		});
		const unsafeDirect = createDecisionTable({
			rows: [
				{
					id: "DTR-release-direct",
					currentState: "Release rows can try to bypass Planning.",
					desiredState: "Release rows must route through Planning.",
					rationale: "Publication safety requires stronger process.",
					...decisionQualityFields({
						decisionKind: "release",
						routeTarget: "implementation",
						implementationMode: "targeted_checks",
						directImplementationScope: {
							pathScopes: ["package.json"],
							verification: ["npm run test:pack"],
							acceptanceCriteria: [
								{ id: "AC-REL", text: "Release check passes." },
							],
						},
					}),
					approval: "approved",
					sourceRefs: ["package.json"],
				},
			],
		});

		assert.equal(
			evaluateDecisionExit(unknown).issues.some(
				(issue) => issue.code === "unknown_decision_type",
			),
			true,
		);
		assert.equal(
			evaluateDecisionExit(unsafeDirect).issues.some(
				(issue) => issue.code === "pipeline_profile_direct_route_disallowed",
			),
			true,
		);
	});
});

describe("decision exit and iteration runner", () => {
	it("blocks approved rows without traceability refs or no-impact rationale", () => {
		const table = createDecisionTable({
			rows: [
				{
					id: "DTR-001",
					currentState: "Implicit source roots",
					desiredState: "Explicit traces-first roots",
					rationale: "Avoid stale graph model",
					...decisionQualityFields(),
					approval: "approved",
				},
			],
		});

		const exit = evaluateDecisionExit(table);
		assert.equal(exit.passed, false);
		assert.equal(exit.verdict, "fail");
		assert.equal(exit.route, "decision");
		assert.deepEqual(
			exit.issues.map((issue) => issue.code),
			[
				"missing_current_state_packet",
				"missing_traceability_ref",
				"missing_knowledge_delta",
			],
		);
		assert.equal(
			exit.findings.some(
				(finding) => finding.criterion === "missing_traceability_ref",
			),
			true,
		);
		assert.equal(exit.remediation[0].blocking, true);
	});

	it("blocks table-level weak source refs", () => {
		const table = createDecisionTable({
			sourceRefs: ["not-a-ref"],
			rows: [
				{
					id: "DTR-table-ref",
					currentState:
						"Decision table source refs can seed current-state packets.",
					desiredState: "Only canonical source refs enter decision evidence.",
					rationale: "Trace-backed consumers need stable refs.",
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["kb:system/decision-loop.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(table, {
			knowledgeDelta: {
				updatedRefs: ["kb:system/decision-loop.md"],
				sections: [],
			},
		});

		assert.equal(exit.passed, false);
		assert.deepEqual(
			exit.issues.map((issue) => issue.code),
			["invalid_traceability_ref"],
		);
		assert.deepEqual(exit.findings[0].refs, ["not-a-ref"]);
	});

	it("blocks duplicate rows and weak refs", () => {
		const table = createDecisionTable({
			rows: [
				{
					id: "DTR-dup",
					currentState: "Old",
					desiredState: "New",
					rationale: "Needed",
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["not-a-ref"],
				},
				{
					id: "DTR-dup",
					currentState: "Old 2",
					desiredState: "New 2",
					rationale: "Needed",
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["kb:system/traces.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(table);
		assert.equal(exit.passed, false);
		assert.deepEqual(exit.issues.map((issue) => issue.code).sort(), [
			"duplicate_decision_row_id",
			"invalid_traceability_ref",
			"missing_knowledge_delta",
		]);
	});

	it("blocks decisions that overlap active trace goals", () => {
		const table = createDecisionTable({
			rows: [
				{
					id: "DTR-overlap",
					currentState: "Runtime host lifecycle work is active elsewhere.",
					desiredState: "A second trace edits the same runtime host files.",
					rationale: "The overlap must be resolved before approval.",
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["src/runtime/host-runner.ts"],
				},
			],
		});

		const exit = evaluateDecisionExit(table, {
			knowledgeDelta: {
				updatedRefs: ["src/runtime/host-runner.ts"],
				sections: [],
			},
			activeTraceGoals: [
				{
					traceId: "TRACE-host-lifecycle",
					status: "needs_implementation",
					decisionRefs: [
						"trace:TRACE-host-lifecycle:decision:iteration:1#row:DTR-host",
					],
					pathScopes: ["src/runtime"],
				},
			],
		});

		assert.equal(exit.passed, false);
		assert.equal(exit.verdict, "block");
		assert.equal(exit.route, "user");
		assert.equal(
			exit.issues.some((issue) => issue.code === "active_trace_conflict"),
			true,
		);
		assert.equal(
			exit.qualityStandards.find(
				(standard) => standard.id === "active_trace_conflicts_resolved",
			)?.status,
			"blocked",
		);
	});

	it("blocks agent-judged misalignment before planning", () => {
		const table = createDecisionTable({
			rows: [
				{
					id: "DTR-agent",
					currentState: "User wants a risky shortcut.",
					desiredState: "Shortcut becomes accepted product direction.",
					rationale:
						"The user is acting in good faith but may lack system context.",
					...decisionQualityFields({
						agentAssessment: {
							stance: "concerns",
							userAlignment: "The request reflects the user's stated goal.",
							projectBenefit:
								"Benefit is unclear compared with safer alternatives.",
							rationale:
								"The agent cannot validate alignment without user clarification.",
							concerns: ["Could reduce project safety."],
						},
					}),
					approval: "approved",
					sourceRefs: ["kb:system/decision-loop.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(table);
		assert.equal(exit.passed, false);
		assert.equal(exit.verdict, "block");
		assert.equal(exit.route, "user");
		const standards = Object.fromEntries(
			exit.qualityStandards.map((standard) => [standard.id, standard]),
		);
		assert.equal(standards.intention_validated.mode, "agent");
		assert.equal(standards.intention_validated.status, "blocked");
		assert.equal(
			exit.criteria.find((criterion) => criterion.id === "intention_validated")
				?.status,
			"block",
		);
	});

	it("blocks approved rows without explicit valid risk tier", () => {
		const missingRisk = createDecisionTable({
			rows: [
				{
					id: "DTR-risk-missing",
					currentState: "Risk defaults could hide authority needs.",
					desiredState: "Decision rows declare risk explicitly.",
					rationale: "Planning needs trusted risk metadata.",
					...decisionQualityFields({ risk: undefined }),
					approval: "approved",
					sourceRefs: ["kb:system/decision-loop.md"],
				},
			],
		});
		const invalidRisk = createDecisionTable({
			rows: [
				{
					id: "DTR-risk-invalid",
					currentState: "Risk can be free text.",
					desiredState: "Risk tier is canonical.",
					rationale: "Approval handling depends on the tier.",
					...decisionQualityFields({ risk: "severe" }),
					approval: "approved",
					sourceRefs: ["kb:system/decision-loop.md"],
				},
			],
		});

		const missing = evaluateDecisionExit(missingRisk);
		const invalid = evaluateDecisionExit(invalidRisk);

		assert.equal(missing.passed, false);
		assert.equal(
			missing.issues.some((issue) => issue.code === "missing_risk"),
			true,
		);
		assert.equal(invalid.passed, false);
		assert.equal(
			invalid.issues.some((issue) => issue.code === "invalid_risk"),
			true,
		);
		assert.equal(
			missing.qualityStandards.find(
				(standard) => standard.id === "risks_and_alternatives_considered",
			)?.status,
			"unmet",
		);
	});

	it("blocks missing and invalid decision work routing", () => {
		const missing = createDecisionTable({
			rows: [
				{
					id: "DTR-routing-missing",
					currentState: "Decision rows do not classify work routing.",
					desiredState: "Decision rows classify routing before planning.",
					rationale: "Planning needs trusted route metadata.",
					...decisionQualityFields({
						workScale: undefined,
						planningDepth: undefined,
					}),
					approval: "approved",
					sourceRefs: ["kb:system/decision-loop.md"],
				},
			],
		});
		const invalidMicro = createDecisionTable({
			rows: [
				{
					id: "DTR-routing-invalid",
					currentState: "Micro-plans could be selected for broad work.",
					desiredState:
						"Micro-plans are limited to tiny or small low-risk work.",
					rationale: "Large or risky work needs standard planning.",
					...decisionQualityFields({
						workScale: "large",
						planningDepth: "micro",
						risk: "medium",
					}),
					approval: "approved",
					sourceRefs: ["kb:system/decision-loop.md"],
				},
			],
		});

		const missingExit = evaluateDecisionExit(missing);
		const invalidExit = evaluateDecisionExit(invalidMicro);

		assert.equal(missingExit.passed, false);
		assert.deepEqual(
			missingExit.issues
				.map((issue) => issue.code)
				.filter(
					(code) =>
						code.includes("work_scale") || code.includes("planning_depth"),
				)
				.sort(),
			["missing_planning_depth", "missing_work_scale"],
		);
		assert.equal(invalidExit.passed, false);
		assert.deepEqual(
			invalidExit.issues
				.map((issue) => issue.code)
				.filter((code) => code.startsWith("invalid_micro_plan"))
				.sort(),
			["invalid_micro_plan_risk", "invalid_micro_plan_scale"],
		);
		assert.equal(
			invalidExit.qualityStandards.find(
				(standard) => standard.id === "work_routing_classified",
			)?.status,
			"unmet",
		);
	});

	it("adds kind-specific standards for debug decisions", () => {
		const table = createDecisionTable({
			rows: [
				{
					id: "DTR-debug",
					decisionKind: "debug",
					currentState: "Runtime completion behavior is uncertain.",
					desiredState: "Runtime completion behavior is verified.",
					rationale: "Availability requires known safety boundaries.",
					...decisionQualityFields({
						decisionKind: "debug",
						currentPain: undefined,
						desiredOutcome: undefined,
						successSignal: undefined,
						nonGoals: undefined,
					}),
					approval: "approved",
					sourceRefs: ["kb:system/runtime.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(table, {
			knowledgeDelta: {
				updatedRefs: ["kb:system/runtime.md"],
				sections: [],
			},
		});
		const standards = Object.fromEntries(
			exit.qualityStandards.map((standard) => [standard.id, standard]),
		);

		assert.equal(exit.passed, false);
		assert.deepEqual(
			exit.issues
				.map((issue) => issue.code)
				.filter((code) => code.startsWith("missing_debug_"))
				.sort(),
			[
				"missing_debug_expected_safe_behavior",
				"missing_debug_hypothesis",
				"missing_debug_invariant",
				"missing_debug_probe",
				"missing_debug_stop_condition",
				"missing_debug_target",
			],
		);
		assert.equal(standards.decision_kind_classified.status, "met");
		assert.equal(standards.debug_decision_focused.status, "unmet");
	});

	it("passes kind-specific standards for a complete migration decision", () => {
		const table = createDecisionTable({
			rows: [
				{
					id: "DTR-migrate",
					currentState: "Decision rows are untyped.",
					desiredState: "Decision rows carry kind-specific intent.",
					rationale: "Planning can trust better structured intent.",
					...decisionQualityFields({
						decisionKind: "refactor",
						currentPain: undefined,
						desiredOutcome: undefined,
						successSignal: undefined,
						nonGoals: undefined,
					}),
					sourceBehavior: "Rows use only shared decision fields.",
					targetBehavior:
						"Rows include shared fields plus kind-specific fields.",
					preservedInvariants: ["Decision remains the only intent loop."],
					equivalenceProof: "Existing shared standards still pass.",
					rollbackPlan: "Treat decisionKind as optional metadata if needed.",
					approval: "approved",
					sourceRefs: ["kb:system/decision-loop.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(table, {
			knowledgeDelta: {
				updatedRefs: ["kb:system/decision-loop.md"],
				sections: [],
			},
		});
		const standards = Object.fromEntries(
			exit.qualityStandards.map((standard) => [standard.id, standard]),
		);

		assert.equal(table.rows[0].decisionKind, "migrate");
		assert.equal(exit.passed, true);
		assert.equal(standards.migrate_decision_equivalent.status, "met");
	});

	it("blocks high-risk decisions without quality evidence", () => {
		const table = createDecisionTable({
			rows: [
				{
					id: "DTR-risk",
					currentState: "Runtime may select work-unit claims automatically.",
					desiredState: "Runtime may apply high-risk changes automatically.",
					rationale: "User asked to explore automation.",
					...decisionQualityFields({ planningDepth: "standard" }),
					approval: "approved",
					risk: "high",
					sourceRefs: ["kb:system/runtime.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(table);
		assert.equal(exit.passed, false);
		assert.deepEqual(
			exit.issues
				.map((issue) => issue.code)
				.filter((code) => code.startsWith("missing_high_risk"))
				.sort(),
			[
				"missing_high_risk_alternative",
				"missing_high_risk_approval",
				"missing_high_risk_evidence",
				"missing_high_risk_scope",
			],
		);
		const standards = Object.fromEntries(
			exit.qualityStandards.map((standard) => [standard.id, standard]),
		);
		assert.equal(standards.risks_and_alternatives_considered.status, "unmet");
		assert.equal(standards.evidence_sufficient.status, "unmet");
		assert.equal(standards.approval_safety.status, "blocked");
		assert.equal(
			exit.remediation.find((item) => item.action.includes("approval"))?.route,
			"user",
		);
	});

	it("blocks incomplete or weak knowledge deltas", () => {
		const table = createDecisionTable({
			rows: [
				{
					id: "DTR-knowledge",
					currentState: "Old KB contract",
					desiredState: "New KB contract",
					rationale: "Decision owns knowledge propagation.",
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["kb:system/loop-contracts.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(table, {
			knowledgeDelta: {
				updatedRefs: ["weak-ref"],
				sections: ["Loop responsibilities"],
				beforeDigest: "sha256:abc123",
			},
		});

		assert.equal(exit.passed, false);
		assert.deepEqual(exit.issues.map((issue) => issue.code).sort(), [
			"incomplete_knowledge_digest",
			"invalid_knowledge_ref",
		]);
	});

	it("emits approved decision trace events for planning", () => {
		const table = createDecisionTable({
			id: "DT-003",
			createdAt: "2026-06-11T00:00:00.000Z",
			updatedAt: "2026-06-11T00:00:00.000Z",
			rows: [
				{
					id: "DTR-001",
					question: "What owns CodeWiki workflow state?",
					currentState: "Graph/root state owns workflow state.",
					desiredState: "Trace JSONL owns workflow state.",
					rationale: "Matches Pi session model.",
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["kb:system/traces.md"],
				},
			],
		});

		const result = runDecisionIteration({
			traceId: "TRACE-20260611-decision",
			table,
		});
		assert.equal(result.readyForPlanning, true);
		assert.equal(result.exit.verdict, "pass");
		assert.equal(result.exit.route, "planning");
		assert.equal(result.draftTraceEvents.length, 0);
		assert.equal(result.traceEvents.length, 1);
		assert.equal(result.traceEvents[0].event, "rows_approved");
		assert.deepEqual(result.output.currentStatePacket.refs, [
			"kb:system/traces.md",
		]);
		assert.deepEqual(
			result.traceEvents[0].data?.output?.approvedRows?.[0]?.currentStateRefs,
			["kb:system/traces.md"],
		);
		assert.equal(
			result.exit.qualityStandards.every(
				(standard) => standard.status === "met",
			),
			true,
		);
		assert.deepEqual(
			result.traceEvents[0].data?.output?.qualityStandards?.map(
				(standard) => standard.id,
			),
			[
				"decision_table_ready",
				"intention_understood",
				"user_value_clear",
				"cost_understood",
				"work_routing_classified",
				"loop_route_safe",
				"recommendation_justified",
				"intention_validated",
				"decision_semantically_sufficient",
				"cost_tradeoff_plausible",
				"risk_tier_plausible",
				"approval_safety",
				"current_state_grounded",
				"evidence_sufficient",
				"risks_and_alternatives_considered",
				"active_trace_conflicts_resolved",
				"knowledge_impact_accounted",
				"decision_kind_classified",
				"improve_decision_outcome",
			],
		);
		assert.equal(result.traceEvents[0].data?.exit.status, "exit");
		assert.equal(result.traceEvents[0].data?.exit.targetLoop, "planning");
		assert.equal(result.checkpoint.type, "tail_checkpoint");
		assert.equal(result.traceRecords.at(-1)?.type, "tail_checkpoint");
		assert.deepEqual(decisionPropagationRefs(table), ["kb:system/traces.md"]);
		assert.deepEqual(decisionStateDeltaGaps(table), []);

		const parsed = parseTraceLine(formatTraceLine(result.traceEvents[0]));
		assert.equal(parsed.type, "trace_event");
		assert.equal(parsed.traceId, "TRACE-20260611-decision");
	});
});
