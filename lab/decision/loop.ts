import { labQualityPackForCandidate } from "../runner/quality-pack.ts";
import type { LabCandidateStandards, LabStandard } from "../runner/types.ts";

export interface DecisionLabInput {
	revisionReady: boolean;
	semanticComplete: boolean;
	knowledgeAccounted: boolean;
	successSignals: string[];
	risk: "low" | "medium" | "high";
	proofRefs: string[];
	overlapAccounted: boolean;
	rationale: string;
	authority?: string;
}

const DEFINITIONS: Array<{
	id: string;
	mode: "deterministic" | "agent" | "user";
	description: string;
	evaluate(input: DecisionLabInput): boolean;
	blocked?: boolean;
}> = [
	{
		id: "change_revision_ready",
		mode: "deterministic",
		description: "Change revision is exact, validated, and digest-bound.",
		evaluate: (input) => input.revisionReady,
	},
	{
		id: "semantic_completeness",
		mode: "agent",
		description: "Change intent and scope are semantically complete.",
		evaluate: (input) => input.semanticComplete,
	},
	{
		id: "knowledge_impact_accounted",
		mode: "agent",
		description: "Knowledge impact is explicit.",
		evaluate: (input) => input.knowledgeAccounted,
	},
	{
		id: "outcome_contract_complete",
		mode: "agent",
		description: "Outcome contract has bounded success signals.",
		evaluate: (input) => input.successSignals.length > 0,
	},
	{
		id: "risk_and_regression_bounded",
		mode: "agent",
		description: "Risk and regression boundaries are explicit.",
		evaluate: () => true,
	},
	{
		id: "evidence_sufficient",
		mode: "agent",
		description: "Evidence is proportional to risk.",
		evaluate: (input) => input.risk !== "high" || input.proofRefs.length >= 2,
	},
	{
		id: "active_change_overlap_accounted",
		mode: "deterministic",
		description: "Overlapping active Changes are linked.",
		evaluate: (input) => input.overlapAccounted,
	},
	{
		id: "approval_safety",
		mode: "user",
		description: "Approval has explicit authority and rationale.",
		evaluate: (input) => Boolean(input.authority && input.rationale.trim()),
		blocked: true,
	},
];

export const decisionLoopStandards: LabStandard<DecisionLabInput>[] =
	DEFINITIONS.map((definition) => ({
		id: definition.id,
		mode: definition.mode,
		weight: 10,
		cost: 10,
		standardType: "loop_contract",
		layer: "hard_gate",
		hardGate: true,
		repairTarget: "decision",
		description: definition.description,
		evaluate(input) {
			const passed = definition.evaluate(input);
			let route: "pass" | "fail" | "block" = "fail";
			if (passed) route = "pass";
			else if (definition.blocked) route = "block";
			return {
				id: definition.id,
				mode: definition.mode,
				weight: 10,
				cost: 10,
				passed,
				route,
				description: definition.description,
				standardType: "loop_contract",
				layer: "hard_gate",
				hardGate: true,
				repairTarget: "decision",
				score: passed ? 0 : 1,
			};
		},
	}));

const decisionLoopCandidateDeclaration = {
	loop: "decision",
	metric: "DEC",
	graphId: "codewiki.decision.change.lab",
	graphVersion: "1.0.0.lab.1",
	schemaVersion: 1,
	layers: ["hard_gate"],
	standards: decisionLoopStandards,
} satisfies Omit<LabCandidateStandards<DecisionLabInput>, "qualityPack">;

export const decisionLoopCandidate = {
	...decisionLoopCandidateDeclaration,
	qualityPack: labQualityPackForCandidate(decisionLoopCandidateDeclaration),
} satisfies LabCandidateStandards<DecisionLabInput>;
