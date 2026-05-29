import type { WikiProject } from "../project/types.ts";
import {
	CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE,
	buildCodewikiResumeKickoff,
	type CodewikiResumeKickoffMessage,
} from "../state/resume-kickoff.ts";
import { nowIso, unique } from "../shared/utils.ts";
import {
	agencyLevelAllowsContinuation,
	type AgencyApprovalCadence,
	type AgencyBudget,
} from "./types.ts";
import {
	configuredAgencyBudget,
	resolveAgencyAutoPickupPolicy,
} from "./config.ts";

export type AgencyPickupBoundary =
	| "soft-compaction"
	| "runtime-context-refresh"
	| "hard-new-session"
	| "external-orchestrator";

export interface AgencyResumePacket {
	prompt: string;
	taskId?: string | null;
	contextPath?: string | null;
	sourceRefs?: string[];
	followUpIntent?: string | null;
}

export interface AgencyAutoPickupInput {
	boundary: AgencyPickupBoundary;
	reason: string;
	resume: AgencyResumePacket;
	budget?: Partial<AgencyBudget>;
	used?: {
		cycles?: number;
		sessions?: number;
		resets?: number;
		tokens?: number;
	};
	adapterCanDeliver?: boolean;
	lifecycleSafe?: boolean;
	intentStored?: boolean;
	approvalRequired?: boolean;
	approvalBoundary?: AgencyApprovalCadence;
	prebuiltKickoff?: CodewikiResumeKickoffMessage | null;
	activeBuildRefs?: string[];
	visibleToolResults?: string[];
	stopConditions?: string[];
}

export interface AgencyAutoPickupDecision {
	allowed: boolean;
	status: "allowed" | "blocked";
	action: "auto_pickup" | "stop";
	reason: string;
	boundary: AgencyPickupBoundary;
	taskId: string | null;
	kickoff: CodewikiResumeKickoffMessage | null;
	budget: AgencyBudget;
	agency: {
		level: string;
		approval_cadence: string;
		context_reset_auto_pickup: boolean;
		max_resets_per_run: number;
	};
	preserved: {
		visible_tool_results: string[];
		active_build_refs: string[];
		source_refs: string[];
		context_path: string | null;
	};
	stop_conditions: string[];
	fallback?: {
		mode: "manual-visible-instructions" | "external-orchestrator";
		reason: string;
	};
}

function tokenEstimate(prompt: string): number {
	return prompt.trim() ? Math.ceil(prompt.length / 4) : 0;
}

function sourceBacked(input: AgencyResumePacket): boolean {
	return Boolean(
		input.prompt.trim() &&
			(input.taskId || input.contextPath || (input.sourceRefs || []).length),
	);
}

function firstBudgetStop(input: {
	budget: AgencyBudget;
	used: Required<NonNullable<AgencyAutoPickupInput["used"]>>;
	prompt: string;
	maxResetsPerRun: number;
}): string | null {
	if (Number(input.budget.maxCycles ?? 1) <= input.used.cycles)
		return "cycle budget exhausted";
	if (Number(input.budget.maxSessions ?? 1) <= input.used.sessions)
		return "session budget exhausted";
	if (input.maxResetsPerRun <= input.used.resets)
		return "context reset budget exhausted";
	const maxTokens = Number(input.budget.maxTokens ?? 0);
	if (maxTokens > 0 && input.used.tokens + tokenEstimate(input.prompt) > maxTokens)
		return "token budget exhausted";
	return null;
}

function buildKickoff(
	project: WikiProject,
	input: AgencyAutoPickupInput,
): CodewikiResumeKickoffMessage | null {
	if (
		input.prebuiltKickoff?.customType === CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE
	) {
		return input.prebuiltKickoff;
	}
	const pickup = resolveAgencyAutoPickupPolicy(project);
	if (!input.resume.prompt.trim()) return null;
	return buildCodewikiResumeKickoff({
		prompt: input.resume.prompt,
		reason: input.reason,
		generatedAt: nowIso(),
		projectRoot: project.root,
		taskId: input.resume.taskId ?? null,
		contextPath: input.resume.contextPath ?? null,
		sourceRefs: input.resume.sourceRefs || [],
		policy: pickup.policy,
	});
}

function blocked(
	project: WikiProject,
	input: AgencyAutoPickupInput,
	budget: AgencyBudget,
	reason: string,
	fallback?: AgencyAutoPickupDecision["fallback"],
): AgencyAutoPickupDecision {
	const pickup = resolveAgencyAutoPickupPolicy(project);
	return {
		allowed: false,
		status: "blocked",
		action: "stop",
		reason,
		boundary: input.boundary,
		taskId: input.resume.taskId ?? null,
		kickoff: buildKickoff(project, input),
		budget,
		agency: {
			level: pickup.policy.level,
			approval_cadence: pickup.policy.approval_cadence,
			context_reset_auto_pickup: pickup.autoPickupEnabled,
			max_resets_per_run: pickup.maxResetsPerRun,
		},
		preserved: {
			visible_tool_results: input.visibleToolResults || [],
			active_build_refs: input.activeBuildRefs || [],
			source_refs: unique(input.resume.sourceRefs || []),
			context_path: input.resume.contextPath ?? null,
		},
		stop_conditions: unique([reason, ...(input.stopConditions || [])]),
		...(fallback ? { fallback } : {}),
	};
}

export function planAgencyAutoPickup(
	project: WikiProject,
	input: AgencyAutoPickupInput,
): AgencyAutoPickupDecision {
	const pickup = resolveAgencyAutoPickupPolicy(project);
	const budget = configuredAgencyBudget(project, { kind: "roadmap" }, input.budget);
	const used = {
		cycles: Number(input.used?.cycles ?? 0),
		sessions: Number(input.used?.sessions ?? 0),
		resets: Number(input.used?.resets ?? 0),
		tokens: Number(input.used?.tokens ?? 0),
	};
	if (!pickup.policy.context_reset.enabled) {
		return blocked(project, input, budget, "context reset disabled by config");
	}
	if (!pickup.policy.context_reset.auto_pickup) {
		return blocked(project, input, budget, "context reset auto-pickup disabled by config");
	}
	if (input.lifecycleSafe === false) {
		return blocked(project, input, budget, "unsafe reset boundary");
	}
	if (input.adapterCanDeliver === false) {
		return blocked(
			project,
			input,
			budget,
			"adapter cannot deliver protocol-safe auto-pickup kickoff",
			{
				mode:
					input.boundary === "external-orchestrator"
						? "external-orchestrator"
						: "manual-visible-instructions",
				reason:
					input.boundary === "hard-new-session"
						? "hard replacement-session pickup is unavailable in this adapter context"
						: "adapter must show the source-backed kickoff instead of auto-continuing",
			},
		);
	}
	if (input.intentStored === false) {
		return blocked(
			project,
			input,
			budget,
			"intent is not stored in CodeWiki source refs; mid-loop auto-pickup blocked",
		);
	}
	if (pickup.requireSourceBackedKickoff && !sourceBacked(input.resume)) {
		return blocked(project, input, budget, "source-backed resume context unavailable");
	}
	if (input.approvalRequired) {
		return blocked(project, input, budget, "user approval required before auto-pickup");
	}
	if (
		input.approvalBoundary &&
		!agencyLevelAllowsContinuation(pickup.policy.level, input.approvalBoundary)
	) {
		return blocked(
			project,
			input,
			budget,
			`approval cadence boundary reached for agency level ${pickup.policy.level}`,
		);
	}
	const budgetStop = firstBudgetStop({
		budget,
		used,
		prompt: input.resume.prompt,
		maxResetsPerRun: pickup.maxResetsPerRun,
	});
	if (budgetStop) return blocked(project, input, budget, budgetStop);
	if (input.stopConditions?.length) {
		return blocked(project, input, budget, input.stopConditions[0] || "stop gate reached");
	}
	return {
		allowed: true,
		status: "allowed",
		action: "auto_pickup",
		reason: "agency policy permits source-backed auto-pickup",
		boundary: input.boundary,
		taskId: input.resume.taskId ?? null,
		kickoff: buildKickoff(project, input),
		budget,
		agency: {
			level: pickup.policy.level,
			approval_cadence: pickup.policy.approval_cadence,
			context_reset_auto_pickup: pickup.autoPickupEnabled,
			max_resets_per_run: pickup.maxResetsPerRun,
		},
		preserved: {
			visible_tool_results: input.visibleToolResults || [],
			active_build_refs: input.activeBuildRefs || [],
			source_refs: unique(input.resume.sourceRefs || []),
			context_path: input.resume.contextPath ?? null,
		},
		stop_conditions: input.stopConditions || [],
	};
}
