import {
	parseLoopQualityPack,
	type LoopQualityPack,
	type LoopQualityPackEvaluatorId,
	type LoopQualityPackEvidenceAdapterId,
} from "../../src/loops/quality-pack.ts";
import type {
	LabCandidateStandards,
	LabQualityStandardMethod,
	LabStandard,
} from "./types.ts";

type CandidateWithoutPack<TInput> = Omit<
	LabCandidateStandards<TInput>,
	"qualityPack"
>;

export function labQualityPackForCandidate<TInput>(
	candidate: CandidateWithoutPack<TInput>,
): LoopQualityPack {
	return parseLoopQualityPack({
		schemaVersion: 1,
		id: `codewiki.lab.${candidate.loop}`,
		version: candidate.graphVersion,
		authority: "lab",
		rollout: "observe",
		graph: {
			id: `${candidate.loop}.loop`,
			version: candidate.graphVersion,
			layers: candidate.layers,
		},
		standards: candidate.standards.map(packStandard),
	});
}

function packStandard<TInput>(standard: LabStandard<TInput>) {
	const method = standard.method || "deterministic";
	return {
		id: standard.id,
		description: standard.description,
		layer: standard.layer || "input_contract",
		standardType: standard.standardType || "loop_contract",
		method,
		repairTarget: standard.repairTarget || "trace",
		weight: standard.weight,
		cost: standard.cost || standard.weight,
		gate: standard.hardGate || standard.layer === "hard_gate" ? "hard" : "soft",
		timeoutMs: 50,
		dependsOn: [],
		evaluatorId: evaluatorId(method),
		evidenceAdapterIds: evidenceAdapterIds(method),
		issuePredicate: {
			kind: "issue_codes",
			match: "any",
			codes: [standard.id],
		},
	};
}

function evaluatorId(
	method: LabQualityStandardMethod,
): LoopQualityPackEvaluatorId {
	if (method === "deterministic") return "issue_codes";
	if (method === "agent_self_assessment") return "agent_assessment";
	if (method === "model_judge") return "model_judge";
	if (method === "human_authority") return "human_approval";
	return "external_evidence";
}

function evidenceAdapterIds(
	method: LabQualityStandardMethod,
): LoopQualityPackEvidenceAdapterId[] {
	if (method === "human_authority") return ["approval_refs"];
	if (method === "external_evidence") {
		return ["check_results", "content_proof", "review_evidence"];
	}
	return ["trace_refs"];
}
