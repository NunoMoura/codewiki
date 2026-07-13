import { createSprintProposal } from "../../src/decision/proposal.ts";
import type {
	DecisionChangeInput,
	SprintProposal,
} from "../../src/decision/types.ts";
import type { LabCase } from "../runner/types.ts";
import type { DecisionLabInput } from "./loop.ts";

export const decisionCases: LabCase<DecisionLabInput>[] = [
	{
		id: "complete-improve-decision",
		loop: "decision",
		description:
			"Grounded improve decision with refs, no-KB-impact rationale, and aligned assessment exits.",
		input: {
			prompt:
				"Improve loop exit standards with deterministic adversarial coverage.",
			sprintProposal: sprintProposal(decisionChange()),
		},
		expected: "pass",
		weight: 10,
	},
	{
		id: "vague-docs-decision",
		loop: "decision",
		description:
			"Presence-only decision content uses short generic text while satisfying current fields.",
		input: {
			prompt: "Improve docs.",
			sprintProposal: sprintProposal(
				decisionChange({
					id: "D-vague",
					decisionKind: "docs",
					currentState: "ok",
					desiredState: "better",
					rationale: "needed",
					userImpact: "good",
					maintainerImpact: "small",
					recommendationRationale: "fine",
					agentAssessment: {
						stance: "aligned",
						userAlignment: "ok",
						projectBenefit: "ok",
						rationale: "ok",
						concerns: [],
					},
				}),
			),
		},
		expected: "fail",
		weight: 15,
		expectedFailures: [
			{
				standardId: "decision.current_desired_rationale_specificity",
				failureClass: "specificity",
			},
			{
				standardId: "decision.impact_specificity",
				failureClass: "specificity",
			},
			{
				standardId: "decision.agent_assessment_specificity",
				failureClass: "specificity",
			},
		],
	},
	{
		id: "high-risk-without-approval",
		loop: "decision",
		description:
			"High-risk approved decision without explicit user approval blocks before planning.",
		input: {
			prompt: "Approve high-risk runtime and API change.",
			sprintProposal: sprintProposal(
				decisionChange({
					id: "D-risk",
					risk: "high",
					affectedLayers: ["api", "runtime"],
					alternatives: ["Defer until explicit user approval."],
					approvalAuthority: "agent",
					approvalRef: undefined,
				}),
			),
		},
		expected: "block",
		weight: 12,
		expectedFailures: [
			{
				standardId: "decision.production_exit_contract",
				failureClass: "contract",
			},
			{
				standardId: "decision.risk_and_authority_boundary",
				failureClass: "authority",
			},
			{
				standardId: "decision.work_routing_contract",
				failureClass: "scope",
			},
		],
	},
	{
		id: "high_risk_explicit_user_approval",
		loop: "decision",
		description:
			"High-risk hardening decision exits when scope, alternatives, proof, and explicit user authority are present.",
		input: {
			prompt: "Approve supervised high-risk package boundary hardening.",
			sprintProposal: sprintProposal(
				decisionChange({
					id: "D-risk-approved",
					decisionKind: "harden",
					risk: "high",
					workScale: "normal",
					planningDepth: "standard",
					affectedLayers: ["api", "runtime"],
					alternatives: [
						"Keep the old package boundary until explicit release review.",
					],
					proofRefs: ["tests/runtime/readiness-checklist.test.mjs"],
					approvalAuthority: "user",
					approvalRef: "trace:TRACE-production-readiness-audit",
					safetyBoundary:
						"Keep mutation guarded by expected bytes and project-local install scope.",
					failureModes: [
						"A global install bypasses project-local mutation safeguards.",
					],
					negativeTestPlan:
						"Readiness tests reject global mutation and stale public command surfaces.",
					compatibilityImpact:
						"Existing packed/local install smokes continue to exercise the package boundary.",
				}),
			),
		},
		expected: "pass",
		weight: 10,
	},
	{
		id: "migration-without-rollback-plan",
		loop: "decision",
		description:
			"Migration decision without rollback plan fails because planning cannot safely execute it.",
		input: {
			prompt: "Migrate trace state layout without rollback guidance.",
			sprintProposal: sprintProposal(
				decisionChange({
					id: "D-migrate",
					decisionKind: "migrate",
					sourceBehavior:
						"Trace state is stored as append-only JSONL records under .codewiki/traces.",
					targetBehavior:
						"Trace state keeps append-only records while adding replay metadata.",
					preservedInvariants: [
						"Trace records remain append-only and schema-valid.",
					],
					equivalenceProof:
						"Replay before and after the migration yields the same board state.",
					rollbackPlan: undefined,
				}),
			),
		},
		expected: "fail",
		weight: 12,
		expectedFailures: [
			{
				standardId: "decision.production_exit_contract",
				failureClass: "contract",
			},
			{
				standardId: "decision.kind_specific_contract",
				failureClass: "production_readiness",
			},
		],
	},
];

function sprintProposal(change: DecisionChangeInput): SprintProposal {
	return createSprintProposal({
		id: "SP-lab",
		sourceRefs: ["kb:system/decision-loop.md"],
		changes: [change],
	});
}

function decisionChange(overrides: DecisionChangeInput = {}): DecisionChangeInput {
	return {
		id: "D-good",
		question: "Should loop exit standards become measurable?",
		decisionKind: "improve",
		currentState:
			"Loop exit standards exist but need adversarial debug coverage before autonomous optimization.",
		desiredState:
			"Loop exit standards have deterministic regression cases and known semantic gaps.",
		rationale:
			"A loop-level lab score catches cheap exits before expensive app benchmarks run.",
		currentPain:
			"Production readiness claims can be too coarse without loop-level adversarial checks.",
		desiredOutcome:
			"Decision, planning, and implementation exits expose measurable gaps before closure.",
		successSignal:
			"The lab reports pass/fail/block verdicts and known gap counts.",
		nonGoals: [
			"Do not run external model judges in the deterministic loop gate.",
		],
		userImpact:
			"Users get safer automation because shallow loop outputs fail before implementation or release.",
		maintainerImpact:
			"Maintainers get cheap deterministic fixtures before using costly agent review.",
		effort: "low",
		workScale: "small",
		planningDepth: "micro",
		affectedLayers: ["system", "lab"],
		risk: "low",
		approval: "approved",
		approvalAuthority: "agent",
		recommendation: "approve",
		recommendationRationale:
			"The change is bounded, traceable, and improves production-readiness evidence.",
		agentAssessment: {
			stance: "aligned",
			userAlignment:
				"Matches the user's request to debug loop quality before app benchmarks.",
			projectBenefit:
				"Improves CodeWiki's ability to enforce production-ready semantic loops cheaply.",
			rationale:
				"A deterministic adversarial corpus is lower cost than immediate model-judge loops.",
			concerns: [],
		},
		sourceRefs: ["kb:system/decision-loop.md"],
		proofRefs: [],
		changeType: "code",
		noKbImpactReason: "Fixture decision does not change KB source truth.",
		...overrides,
	};
}
