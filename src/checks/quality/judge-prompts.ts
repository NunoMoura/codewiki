import type { LoopQualityJudgeRequest } from "./judge.ts";

export const LOOP_QUALITY_JUDGE_PROMPT_VERSION = "loop-quality-judge.v3";

export interface LoopQualityJudgePrompt {
	system: string;
	user: string;
}

export function buildLoopQualityJudgePrompt(
	request: LoopQualityJudgeRequest,
): LoopQualityJudgePrompt {
	return buildLoopQualityJudgeBatchPrompt([request]);
}

export function buildLoopQualityJudgeBatchPrompt(
	requests: LoopQualityJudgeRequest[],
): LoopQualityJudgePrompt {
	const first = requests[0];
	return {
		system: [
			"You are an independent CodeWiki quality-network judge for one semantic loop attempt.",
			"False pass is the highest-cost error; fail when semantic evidence is weak, generic, contradictory, or insufficient.",
			"Deterministic hard gates already ran; do not re-score schema, enums, paths, or duplicate checks.",
			"Each supplied standard represents a specialized judge node with one job; judge nodes independently even when sent in one transport batch.",
			'Judge each supplied standard independently and return JSON only as {"verdicts":[...]}, with one verdict per standardId.',
			"Valid status values are pass, fail, or block. Use block for unavailable evidence, authority needs, or judge uncertainty that should stop progress.",
			"Each verdict must include standardId, status, score from 0-100, message, optional refs, optional repair, and optional confidence.",
		].join(" "),
		user: JSON.stringify(
			{
				promptVersion: first?.promptVersion,
				graph: first
					? {
							id: first.graphId,
							version: first.graphVersion,
							hash: first.graphHash,
						}
					: undefined,
				loopInput: first?.judgeInput,
				standards: requests.map((request) => ({
					standardId: request.standardId,
					method: request.method,
					gate: request.gate,
					description: request.description,
					judge: request.judge,
					standard: {
						status: request.standard.status,
						message: request.standard.message,
						refs: request.standard.refs,
						evidenceRefs: request.standard.evidenceRefs,
					},
					inputEvidenceHash: request.inputEvidenceHash,
				})),
			},
			null,
			2,
		),
	};
}
