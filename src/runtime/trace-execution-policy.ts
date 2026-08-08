import type { WikiConfig } from "../project/config.ts";
import type { TraceHostTarget } from "./trace-host-runner.ts";
import {
	resolveExecutionPolicy,
	type ResolvedExecutionPolicy,
} from "./workers/execution-policy.ts";

export interface TraceExecutionPolicyInput {
	target: TraceHostTarget;
	pathScopes: string[];
	continuation?: boolean;
	priorUsage?: {
		totalTokens: number;
		costUsd: number;
		latencyMs: number;
	};
}

export function resolveTraceExecutionPolicy(
	config: WikiConfig,
	input: TraceExecutionPolicyInput,
): ResolvedExecutionPolicy {
	const estimatedInputTokens = input.continuation
		? 0
		: config.runtime.modelRouting.estimatedInputTokens;
	const estimatedOutputTokens = input.continuation
		? 0
		: config.runtime.modelRouting.estimatedOutputTokens;
	return resolveExecutionPolicy(config, {
		target: input.target,
		risk: "medium",
		pathScopes: input.pathScopes,
		requiredTools: requiredTraceHostTools(input.target),
		estimatedInputTokens,
		estimatedOutputTokens,
		...(input.priorUsage ? { priorUsage: input.priorUsage } : {}),
	});
}

export function requiredTraceHostTools(target: TraceHostTarget): string[] {
	if (target === "planning") return ["wiki_state", "wiki_plan"];
	if (target === "implementation") return ["wiki_state", "wiki_implement"];
	return ["wiki_state", "wiki_archive"];
}
