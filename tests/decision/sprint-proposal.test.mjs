import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runDecisionIteration } from "../../src/decision/iteration.ts";
import { evaluateDecisionExit } from "../../src/decision/loop.ts";
import {
	decisionPropagationRefs,
	decisionStateDeltaGaps,
} from "../../src/decision/propagation.ts";
import {
	applyDecisionChangeActions,
	createSprintProposal,
} from "../../src/decision/proposal.ts";
import { renderSprintProposalMarkdown } from "../../src/decision/proposal-rendering.ts";
import { formatTraceLine } from "../../src/traces/writer.ts";
import { parseTraceLine } from "../../src/traces/reader.ts";
import {
	builtInDecisionPolicyProfiles,
	decisionPolicyProfileById,
	validateDecisionPolicyProfiles,
} from "../../src/decision/policy-profiles.ts";
import { decisionQualityFields } from "../helpers/proposed-change.mjs";

describe("sprint proposals", () => {
	it("normalizes target proposed change inputs", () => {
		const proposal = createSprintProposal({
			id: "SP-001",
			createdAt: "2026-06-11T00:00:00.000Z",
			changes: [
				{
					id: "CHG-001",
					currentState: "Graph is treated as state truth.",
					desiredState: "JSONL traces are workflow/state truth.",
					rationale: "Matches recovered traces-first decision.",
					...decisionQualityFields(),
					approval: "accept",
					affectedLayers: ["system", "source"],
					sourceRefs: ["kb:system/components/traces.md"],
					scope: "source",
				},
			],
		});

		assert.equal(proposal.changes.length, 1);
		assert.equal(proposal.changes[0].approval, "approved");
		assert.equal(proposal.changes[0].scope, "source");
		assert.equal(proposal.changes[0].kind, "improve");
		assert.equal(proposal.changes[0].policyProfileId, "improve");
		assert.equal(proposal.changes[0].workScale, "small");
		assert.equal(proposal.changes[0].planningDepth, "micro");
		assert.deepEqual(proposal.changes[0].affectedLayers, ["system", "source"]);
	});

	it("normalizes and renders an explicit Sprint boundary", () => {
		const proposal = createSprintProposal({
			id: "SP-shaped",
			createdAt: "2026-06-11T00:00:00.000Z",
			sprintBoundary: {
				accountableGoal: " Keep one coherent lifecycle. ",
				knowledgeTopics: [
					".codewiki/kb/product/overview.md",
					".codewiki/kb/product/overview.md",
					".codewiki/kb/system/components/traces.md",
				],
				dependencies: ["CHG-next", "CHG-next"],
				rollbackBoundary: "Revert contract and projection together.",
				assessment: {
					stance: "coherent",
					rationale: "All selected intent serves one lifecycle boundary.",
				},
			},
		});

		assert.deepEqual(proposal.sprintBoundary.knowledgeTopics, [
			".codewiki/kb/product/overview.md",
			".codewiki/kb/system/components/traces.md",
		]);
		assert.deepEqual(proposal.sprintBoundary.dependencies, ["CHG-next"]);
		assert.match(
			renderSprintProposalMarkdown(proposal),
			/## Sprint Boundary[\s\S]*Accountable goal: Keep one coherent lifecycle\.[\s\S]*Knowledge topics:/,
		);
	});

	it("applies change actions atomically", () => {
		const proposal = createSprintProposal({
			id: "SP-002",
			changes: [
				{
					id: "CHG-001",
					currentState: "Old model",
					desiredState: "New model",
					rationale: "Needed",
					...decisionQualityFields(),
				},
			],
		});

		const failed = applyDecisionChangeActions(proposal, [
			{ changeId: "CHG-001", action: "accept" },
			{ changeId: "missing", action: "reject" },
		]);
		assert.equal(failed.changed, false);
		assert.equal(failed.proposal.changes[0].approval, "pending");

		const passed = applyDecisionChangeActions(proposal, [
			{ changeId: "CHG-001", action: "accept" },
		]);
		assert.equal(passed.changed, true);
		assert.equal(passed.proposal.changes[0].approval, "approved");
		assert.equal(proposal.changes[0].approval, "pending");
	});
});

describe("policy profile registry", () => {
	it("exposes safe built-in definitions and fail-closed lookup", () => {
		const definitions = builtInDecisionPolicyProfiles();
		assert.deepEqual(validateDecisionPolicyProfiles(definitions), []);
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
		assert.equal(decisionPolicyProfileById("missing", definitions), undefined);
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

	it("blocks unknown policy profiles and unsafe direct profile routes", () => {
		const unknown = createSprintProposal({
			changes: [
				{
					id: "CHG-unknown-type",
					currentState: "A change can name an arbitrary type.",
					desiredState: "Unknown policy profiles fail closed.",
					rationale: "Profiles must be package-owned or guarded.",
					...decisionQualityFields(),
					policyProfileId: "surprise",
					approval: "approved",
					sourceRefs: ["kb:system/components/decision-loop.md"],
				},
			],
		});
		const unsafeDirect = createSprintProposal({
			changes: [
				{
					id: "CHG-release-direct",
					currentState: "Release changes can try to bypass Planning.",
					desiredState: "Release changes must route through Planning.",
					rationale: "Publication safety requires stronger process.",
					...decisionQualityFields({
						kind: "release",
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
				(issue) => issue.code === "unknown_policy_profile",
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
	it("blocks unshaped or incoherent multi-Change Sprint boundaries", () => {
		const changes = ["CHG-one", "CHG-two"].map((id) => ({
			id,
			currentState: "Intent is separate.",
			desiredState: "Intent shares one accountable lifecycle.",
			rationale: "One user-confirmed boundary should govern it.",
			...decisionQualityFields(),
			approval: "approved",
			sourceRefs: [".codewiki/kb/product/overview.md"],
		}));
		const unshaped = evaluateDecisionExit(createSprintProposal({ changes }));
		assert.equal(
			unshaped.issues.some((issue) => issue.code === "missing_sprint_boundary"),
			true,
		);

		const incoherent = evaluateDecisionExit(
			createSprintProposal({
				changes,
				sprintBoundary: {
					accountableGoal: "One lifecycle.",
					knowledgeTopics: ["kb:product/overview.md"],
					dependencies: ["not-canonical"],
					rollbackBoundary: "Revert independently.",
					assessment: {
						stance: "split_required",
						rationale: "Goals do not share one boundary.",
					},
				},
			}),
		);
		assert.deepEqual(
			incoherent.issues
				.map((issue) => issue.code)
				.filter((code) => code.includes("sprint"))
				.sort(),
			[
				"invalid_sprint_dependency",
				"invalid_sprint_knowledge_topic",
				"sprint_boundary_split_required",
			],
		);
	});

	it("blocks approved changes without traceability refs or no-impact rationale", () => {
		const proposal = createSprintProposal({
			changes: [
				{
					id: "CHG-001",
					currentState: "Implicit source roots",
					desiredState: "Explicit traces-first roots",
					rationale: "Avoid stale graph model",
					...decisionQualityFields(),
					approval: "approved",
				},
			],
		});

		const exit = evaluateDecisionExit(proposal);
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

	it("blocks proposal-level weak source refs", () => {
		const proposal = createSprintProposal({
			sourceRefs: ["not-a-ref"],
			changes: [
				{
					id: "CHG-proposal-ref",
					currentState:
						"Sprint Proposal source refs can seed current-state packets.",
					desiredState: "Only canonical source refs enter decision evidence.",
					rationale: "Trace-backed consumers need stable refs.",
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["kb:system/components/decision-loop.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(proposal, {
			knowledgeDelta: {
				updatedRefs: ["kb:system/components/decision-loop.md"],
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

	it("blocks duplicate changes and weak refs", () => {
		const proposal = createSprintProposal({
			changes: [
				{
					id: "CHG-dup",
					currentState: "Old",
					desiredState: "New",
					rationale: "Needed",
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["not-a-ref"],
				},
				{
					id: "CHG-dup",
					currentState: "Old 2",
					desiredState: "New 2",
					rationale: "Needed",
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["kb:system/components/traces.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(proposal);
		assert.equal(exit.passed, false);
		assert.deepEqual(exit.issues.map((issue) => issue.code).sort(), [
			"duplicate_change_id",
			"invalid_traceability_ref",
			"missing_knowledge_delta",
		]);
	});

	it("blocks decisions that overlap active trace goals", () => {
		const proposal = createSprintProposal({
			changes: [
				{
					id: "CHG-overlap",
					currentState: "Runtime host lifecycle work is active elsewhere.",
					desiredState: "A second trace edits the same runtime host files.",
					rationale: "The overlap must be resolved before approval.",
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["src/runtime/host-runner.ts"],
				},
			],
		});

		const exit = evaluateDecisionExit(proposal, {
			knowledgeDelta: {
				updatedRefs: ["src/runtime/host-runner.ts"],
				sections: [],
			},
			activeTraceGoals: [
				{
					traceId: "TRACE-host-lifecycle",
					status: "needs_implementation",
					decisionRefs: [
						"trace:TRACE-host-lifecycle:decision:iteration:1#change:CHG-host",
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
		const proposal = createSprintProposal({
			changes: [
				{
					id: "CHG-agent",
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
					sourceRefs: ["kb:system/components/decision-loop.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(proposal);
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

	it("blocks approved changes without explicit valid risk tier", () => {
		const missingRisk = createSprintProposal({
			changes: [
				{
					id: "CHG-risk-missing",
					currentState: "Risk defaults could hide authority needs.",
					desiredState: "Proposed changes declare risk explicitly.",
					rationale: "Planning needs trusted risk metadata.",
					...decisionQualityFields({ risk: undefined }),
					approval: "approved",
					sourceRefs: ["kb:system/components/decision-loop.md"],
				},
			],
		});
		const invalidRisk = createSprintProposal({
			changes: [
				{
					id: "CHG-risk-invalid",
					currentState: "Risk can be free text.",
					desiredState: "Risk tier is canonical.",
					rationale: "Approval handling depends on the tier.",
					...decisionQualityFields({ risk: "severe" }),
					approval: "approved",
					sourceRefs: ["kb:system/components/decision-loop.md"],
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
		const missing = createSprintProposal({
			changes: [
				{
					id: "CHG-routing-missing",
					currentState: "Proposed changes do not classify work routing.",
					desiredState: "Proposed changes classify routing before planning.",
					rationale: "Planning needs trusted route metadata.",
					...decisionQualityFields({
						workScale: undefined,
						planningDepth: undefined,
					}),
					approval: "approved",
					sourceRefs: ["kb:system/components/decision-loop.md"],
				},
			],
		});
		const invalidMicro = createSprintProposal({
			changes: [
				{
					id: "CHG-routing-invalid",
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
					sourceRefs: ["kb:system/components/decision-loop.md"],
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
		const proposal = createSprintProposal({
			changes: [
				{
					id: "CHG-debug",
					kind: "debug",
					currentState: "Runtime completion behavior is uncertain.",
					desiredState: "Runtime completion behavior is verified.",
					rationale: "Availability requires known safety boundaries.",
					...decisionQualityFields({
						kind: "debug",
						currentPain: undefined,
						desiredOutcome: undefined,
						successSignal: undefined,
						nonGoals: undefined,
					}),
					approval: "approved",
					sourceRefs: ["kb:system/components/runtime.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(proposal, {
			knowledgeDelta: {
				updatedRefs: ["kb:system/components/runtime.md"],
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
		assert.equal(standards.change_kind_classified.status, "met");
		assert.equal(standards.debug_decision_focused.status, "unmet");
	});

	it("passes kind-specific standards for a complete migration decision", () => {
		const proposal = createSprintProposal({
			changes: [
				{
					id: "CHG-migrate",
					currentState: "Proposed changes are untyped.",
					desiredState: "Proposed changes carry kind-specific intent.",
					rationale: "Planning can trust better structured intent.",
					...decisionQualityFields({
						kind: "refactor",
						currentPain: undefined,
						desiredOutcome: undefined,
						successSignal: undefined,
						nonGoals: undefined,
					}),
					sourceBehavior: "Changes use only shared decision fields.",
					targetBehavior:
						"Changes include shared fields plus kind-specific fields.",
					preservedInvariants: ["Decision remains the only intent loop."],
					equivalenceProof: "Existing shared standards still pass.",
					rollbackPlan: "Treat kind as optional metadata if needed.",
					approval: "approved",
					sourceRefs: ["kb:system/components/decision-loop.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(proposal, {
			knowledgeDelta: {
				updatedRefs: ["kb:system/components/decision-loop.md"],
				sections: [],
			},
		});
		const standards = Object.fromEntries(
			exit.qualityStandards.map((standard) => [standard.id, standard]),
		);

		assert.equal(proposal.changes[0].kind, "migrate");
		assert.equal(exit.passed, true);
		assert.equal(standards.migrate_decision_equivalent.status, "met");
	});

	it("blocks high-risk decisions without quality evidence", () => {
		const proposal = createSprintProposal({
			changes: [
				{
					id: "CHG-risk",
					currentState: "Runtime may select work-unit claims automatically.",
					desiredState: "Runtime may apply high-risk changes automatically.",
					rationale: "User asked to explore automation.",
					...decisionQualityFields({ planningDepth: "standard" }),
					approval: "approved",
					risk: "high",
					sourceRefs: ["kb:system/components/runtime.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(proposal);
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
		const proposal = createSprintProposal({
			changes: [
				{
					id: "CHG-knowledge",
					currentState: "Old KB contract",
					desiredState: "New KB contract",
					rationale: "Decision owns knowledge propagation.",
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["kb:system/components/loop-contracts.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(proposal, {
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
		const proposal = createSprintProposal({
			id: "SP-003",
			createdAt: "2026-06-11T00:00:00.000Z",
			updatedAt: "2026-06-11T00:00:00.000Z",
			changes: [
				{
					id: "CHG-001",
					question: "What owns CodeWiki workflow state?",
					currentState: "Graph/root state owns workflow state.",
					desiredState: "Trace JSONL owns workflow state.",
					rationale: "Matches Pi session model.",
					...decisionQualityFields(),
					approval: "approved",
					sourceRefs: ["kb:system/components/traces.md"],
				},
			],
		});

		const result = runDecisionIteration({
			traceId: "TRACE-20260611-decision",
			proposal,
		});
		assert.equal(result.readyForPlanning, true);
		assert.equal(result.exit.verdict, "pass");
		assert.equal(result.exit.route, "planning");
		assert.equal(result.draftTraceEvents.length, 0);
		assert.equal(result.traceEvents.length, 1);
		assert.equal(result.traceEvents[0].event, "changes_approved");
		assert.deepEqual(result.output.currentStatePacket.refs, [
			"kb:system/components/traces.md",
		]);
		assert.deepEqual(
			result.traceEvents[0].data?.output?.approvedChanges?.[0]
				?.currentStateRefs,
			["kb:system/components/traces.md"],
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
				"sprint_proposal_ready",
				"sprint_boundary_coherent",
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
				"change_kind_classified",
				"improve_decision_outcome",
			],
		);
		assert.equal(result.traceEvents[0].data?.exit.status, "exit");
		assert.equal(result.traceEvents[0].data?.exit.targetLoop, "planning");
		assert.equal(result.checkpoint.type, "tail_checkpoint");
		assert.equal(result.traceRecords.at(-1)?.type, "tail_checkpoint");
		assert.deepEqual(decisionPropagationRefs(proposal), [
			"kb:system/components/traces.md",
		]);
		assert.deepEqual(decisionStateDeltaGaps(proposal), []);

		const parsed = parseTraceLine(formatTraceLine(result.traceEvents[0]));
		assert.equal(parsed.type, "trace_event");
		assert.equal(parsed.traceId, "TRACE-20260611-decision");
	});
});
