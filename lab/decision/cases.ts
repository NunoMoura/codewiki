import type { LabCase } from "../runner/types.ts";
import { decisionLabInput } from "./fixture.ts";
import type { DecisionLabInput } from "./loop.ts";

export const decisionCases: LabCase<DecisionLabInput>[] = [
	{
		id: "valid-exact-change-approval",
		loop: "decision",
		description:
			"Validated Change revision with explicit authority passes Decision quality.",
		input: decisionLabInput(),
		expected: "pass",
		weight: 15,
	},
	{
		id: "approval-without-authority",
		loop: "decision",
		description: "Approval without exact user or policy authority blocks.",
		input: decisionLabInput({ authority: null }),
		expected: "block",
		weight: 15,
		expectedFailures: [
			{
				standardId: "approval_safety",
				failureClass: "authority",
			},
		],
	},
	{
		id: "approval-without-success-signal",
		loop: "decision",
		description:
			"Change without bounded success signals fails Decision quality.",
		input: decisionLabInput({ successSignals: [] }),
		expected: "fail",
		weight: 12,
		expectedFailures: [
			{
				standardId: "outcome_contract_complete",
				failureClass: "contract",
			},
		],
	},
	{
		id: "high-risk-without-proportional-proof",
		loop: "decision",
		description:
			"High-risk Change without two proof refs fails evidence quality.",
		input: decisionLabInput({ risk: "high", proofRefs: [] }),
		expected: "fail",
		weight: 12,
		expectedFailures: [
			{
				standardId: "evidence_sufficient",
				failureClass: "evidence",
			},
		],
	},
];
