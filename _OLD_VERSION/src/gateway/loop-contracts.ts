export type CodewikiLoopId = "decision" | "planning" | "implementation";

export type CodewikiGateId = CodewikiLoopId;

export interface LoopGateOwnershipContract {
	loop: CodewikiLoopId;
	gate: CodewikiGateId;
	semantic_truth_owner: boolean;
	work_truth_owner: boolean;
	code_evidence_owner: boolean;
	canonical_truth: string[];
	evidence_providers: string[];
	blocks_on: string[];
	routes_to_decision_on_semantic_drift: boolean;
}

export interface LoopGateOwnershipCatalog {
	loops: LoopGateOwnershipContract[];
	evidence_providers: string[];
	compatibility_gate_aliases: string[];
	publication_owner: CodewikiLoopId;
	forbidden_loop_roots: string[];
	dogfood_special_case_allowed: false;
}

export const LOOP_GATE_OWNERSHIP_CONTRACT: LoopGateOwnershipCatalog = {
	loops: [
		{
			loop: "decision",
			gate: "decision",
			semantic_truth_owner: true,
			work_truth_owner: false,
			code_evidence_owner: false,
			canonical_truth: [".codewiki/kb/**", ".codewiki/kb/system/diagrams/**"],
			evidence_providers: ["stale-reference", "alignment"],
			blocks_on: [
				"approved semantic rows without row-to-KB/diagram mapping",
				"missing no-KB/no-diagram-impact rationale",
				"open semantic questions",
			],
			routes_to_decision_on_semantic_drift: true,
		},
		{
			loop: "planning",
			gate: "planning",
			semantic_truth_owner: false,
			work_truth_owner: true,
			code_evidence_owner: false,
			canonical_truth: [
				".codewiki/roadmap/queue.json",
				".codewiki/builds/planning/**",
				".codewiki/telemetry/**#/planning",
			],
			evidence_providers: ["alignment", "task", "source-contract"],
			blocks_on: [
				"executable accepted rows without roadmap/sprint/work-unit ownership",
				"stale or contradictory semantic KB",
				"missing roadmap reconciliation",
			],
			routes_to_decision_on_semantic_drift: true,
		},
		{
			loop: "implementation",
			gate: "implementation",
			semantic_truth_owner: false,
			work_truth_owner: false,
			code_evidence_owner: true,
			canonical_truth: [
				"src/**",
				"tests/**",
				".codewiki/builds/implementation/**",
				"Git commit/tree/package refs",
			],
			evidence_providers: [
				"tests",
				"linters",
				"source-contract",
				"package",
				"security",
			],
			blocks_on: [
				"unowned KB/diagram/source-contract drift",
				"missing content proof",
				"publication criteria outside implementation",
			],
			routes_to_decision_on_semantic_drift: true,
		},
	],
	evidence_providers: ["tests", "linters", "audits", "Git/content proof"],
	compatibility_gate_aliases: [
		"task-close",
		"sprint-close",
		"ship-ready",
		"publication",
		"publish",
		"release",
	],
	publication_owner: "implementation",
	forbidden_loop_roots: ["src/validation", "src/publish", "src/publication"],
	dogfood_special_case_allowed: false,
};

export function loopGateOwnershipContracts(): LoopGateOwnershipCatalog {
	return LOOP_GATE_OWNERSHIP_CONTRACT;
}

export function loopGateOwnershipFor(
	loop: CodewikiLoopId,
): LoopGateOwnershipContract {
	const contract = LOOP_GATE_OWNERSHIP_CONTRACT.loops.find(
		(candidate) => candidate.loop === loop,
	);
	if (!contract) throw new Error(`Unknown CodeWiki loop: ${loop}`);
	return contract;
}
