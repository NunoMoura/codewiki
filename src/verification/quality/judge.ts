import { createHash } from "node:crypto";
import type {
	LoopQualityStandardMethod,
	LoopQualityStandardResult,
} from "../../changes/trace/types.ts";
import type {
	LoopQualityGraphNode,
	LoopQualityJudgeNodeSpec,
} from "./graph.ts";

export type LoopQualityJudgeStatus = "pass" | "fail" | "block";

export interface LoopQualityJudgeVerdict {
	standardId: string;
	status: LoopQualityJudgeStatus;
	message: string;
	refs?: string[];
	repair?: string;
	confidence?: number;
	score?: number;
}

export interface LoopQualityJudgeRequest {
	cacheKey: string;
	promptVersion: string;
	graphHash: string;
	graphId: string;
	graphVersion: string;
	standardId: string;
	method: LoopQualityStandardMethod | string;
	gate: string;
	description: string;
	standard: LoopQualityStandardResult;
	inputEvidenceHash: string;
	judge?: LoopQualityJudgeNodeSpec;
	judgeInput?: unknown;
}

export interface LoopQualityJudge {
	promptVersion: string;
	judge(
		requests: LoopQualityJudgeRequest[],
	): Promise<LoopQualityJudgeVerdict[]>;
}

export interface LoopQualityJudgeCache {
	get(key: string): LoopQualityJudgeVerdict | undefined;
	set(key: string, verdict: LoopQualityJudgeVerdict): void;
}

export interface LoopQualityJudgeSummary {
	status: LoopQualityJudgeStatus;
	promptVersion: string;
	cached: boolean;
	cacheKey: string;
	confidence?: number;
	score?: number;
}

export interface LoopQualityJudgeResolution {
	request: LoopQualityJudgeRequest;
	verdict: LoopQualityJudgeVerdict;
	summary: LoopQualityJudgeSummary;
}

export class MemoryLoopQualityJudgeCache implements LoopQualityJudgeCache {
	readonly #entries = new Map<string, LoopQualityJudgeVerdict>();

	get(key: string): LoopQualityJudgeVerdict | undefined {
		return this.#entries.get(key);
	}

	set(key: string, verdict: LoopQualityJudgeVerdict): void {
		this.#entries.set(key, verdict);
	}
}

export function loopQualityJudgeCacheKey(input: {
	graphHash: string;
	promptVersion: string;
	inputEvidenceHash: string;
}): string {
	return `sha256:${createHash("sha256")
		.update(
			stableJson({
				graphHash: input.graphHash,
				promptVersion: input.promptVersion,
				inputEvidenceHash: input.inputEvidenceHash,
			}),
		)
		.digest("hex")}`;
}

export function loopQualityJudgeInputEvidenceHash(input: {
	node: LoopQualityGraphNode<string>;
	standard: LoopQualityStandardResult;
	judgeInput?: unknown;
}): string {
	return `sha256:${createHash("sha256")
		.update(
			stableJson({
				node: {
					id: input.node.id,
					description: input.node.description,
					method: input.node.method,
					gate: input.node.gate,
					standardType: input.node.standardType,
					layer: input.node.layer,
					judge: input.node.judge,
				},
				standard: {
					id: input.standard.id,
					status: input.standard.status,
					message: input.standard.message,
					refs: input.standard.refs,
					evidenceRefs: input.standard.evidenceRefs,
				},
				judgeInput: input.judgeInput,
			}),
		)
		.digest("hex")}`;
}

function stableJson(value: unknown): string {
	if (typeof value === "function") return JSON.stringify("[function]");
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}
