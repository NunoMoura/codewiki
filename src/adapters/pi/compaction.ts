import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { buildCodewikiResumeContext } from "../../state/resume-context.ts";
import { resolveStatusDockProject } from "../../project/context.ts";
import type { WikiProject } from "../../project/types.ts";
import { formatError, nowIso } from "../../shared/utils.ts";
import { currentTaskLink } from "./session.ts";
import {
	effectiveAgencyPolicy,
	type EffectiveAgencyPolicy,
} from "../../agency/types.ts";

const DEFAULT_CONTEXT_REFRESH_THRESHOLD_PERCENT = 80;
const CONTEXT_REFRESH_PREFIX = "CodeWiki context refresh";

export const CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE = "codewiki.resume-kickoff";

export interface CodewikiContextRefreshRequest {
	reason: string;
	taskId?: string | null;
	followUpIntent?: string | null;
	requestedAt?: string;
}

export interface CodewikiResumeKickoffMessage {
	customType: typeof CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE;
	content: string;
	display: true;
	details: Record<string, unknown>;
}

export interface CodewikiResetBoundaryDecision {
	allowed: boolean;
	reason: string;
	policy: EffectiveAgencyPolicy;
}

export interface CodewikiCompactionSummary {
	summary: string;
	details: Record<string, unknown>;
	kickoff: CodewikiResumeKickoffMessage;
}

export interface CodewikiContextRefreshDeferredNotice {
	key: string;
	message: string;
	level: "info" | "warning";
	shouldNotify: boolean;
}

let pendingContextRefresh: CodewikiContextRefreshRequest | null = null;
let activeContextRefresh: CodewikiContextRefreshRequest | null = null;
let preparedContextRefreshSummary: CodewikiCompactionSummary | null = null;

export function requestCodewikiContextRefresh(
	request: CodewikiContextRefreshRequest,
): void {
	pendingContextRefresh = {
		...request,
		reason: request.reason.trim() || "context-refresh",
		taskId: request.taskId?.trim() || null,
		followUpIntent: request.followUpIntent?.trim() || null,
		requestedAt: request.requestedAt ?? nowIso(),
	};
}

export function takePendingCodewikiContextRefresh(): CodewikiContextRefreshRequest | null {
	const request = pendingContextRefresh;
	pendingContextRefresh = null;
	return request;
}

export function shouldTriggerCodewikiThresholdRefresh(
	usage: { percent: number | null } | undefined,
	previousPercent: number | null | undefined,
	thresholdPercent = DEFAULT_CONTEXT_REFRESH_THRESHOLD_PERCENT,
): boolean {
	const percent = usage?.percent ?? null;
	if (percent === null) return false;
	return (
		percent >= thresholdPercent &&
		(previousPercent === undefined ||
			previousPercent === null ||
			previousPercent < thresholdPercent)
	);
}

export function formatCodewikiContextRefreshDeferredNotice(
	request: CodewikiContextRefreshRequest,
	reason: string,
	previousKey: string | null | undefined,
): CodewikiContextRefreshDeferredNotice {
	const normalizedReason = reason.trim() || "unsafe reset boundary";
	const key = JSON.stringify([
		request.reason.trim() || "context-refresh",
		request.taskId?.trim() || "",
		request.followUpIntent?.trim() || "",
		request.requestedAt || "",
		normalizedReason,
	]);
	return {
		key,
		message: `${CONTEXT_REFRESH_PREFIX} deferred: ${normalizedReason}`,
		level: normalizedReason === "agent is not idle" ? "info" : "warning",
		shouldNotify: key !== previousKey,
	};
}

export function installCodewikiCompaction(pi: ExtensionAPI): void {
	let previousContextPercent: number | null | undefined;
	let lastDeferredNoticeKey: string | null = null;

	pi.on("session_before_compact", async (event: any, ctx: ExtensionContext) => {
		const request = activeContextRefresh ??
			pendingContextRefresh ?? {
				reason: "pi-compaction",
				followUpIntent:
					typeof event.customInstructions === "string"
						? event.customInstructions
						: null,
			};
		try {
			const resolved = await resolveStatusDockProject(ctx, {
				allowWhenOff: true,
			});
			if (!resolved) return undefined;
			const summary =
				activeContextRefresh && preparedContextRefreshSummary
					? preparedContextRefreshSummary
					: await buildCodewikiCompactionSummary(
							resolved.project,
							ctx,
							request,
							event.customInstructions,
						);
			if (!summary) return undefined;
			return formatPiCompactionResult(summary, event);
		} catch (error) {
			if (ctx.hasUI)
				ctx.ui.notify(
					`${CONTEXT_REFRESH_PREFIX} skipped: ${formatError(error)}`,
					"warning",
				);
			return undefined;
		}
	});

	pi.on("agent_end", async (_event: unknown, ctx: ExtensionContext) => {
		const usage = ctx.getContextUsage();
		const pending = pendingContextRefresh;
		const shouldRefresh =
			pending ||
			shouldTriggerCodewikiThresholdRefresh(usage, previousContextPercent);
		previousContextPercent = usage?.percent ?? previousContextPercent ?? null;
		if (!shouldRefresh) return;

		let resolvedProject: { project: WikiProject } | null = null;
		try {
			resolvedProject = await resolveStatusDockProject(ctx, {
				allowWhenOff: true,
			});
		} catch {
			resolvedProject = null;
		}
		if (!resolvedProject) return;

		const lifecycle = evaluateCodewikiResetLifecycleBoundary(
			ctx,
			resolvedProject.project,
		);
		const request = pending ?? {
			reason: `context-usage-${Math.round(usage?.percent ?? 0)}pct`,
			requestedAt: nowIso(),
		};
		if (!lifecycle.allowed) {
			if (ctx.hasUI) {
				const notice = formatCodewikiContextRefreshDeferredNotice(
					request,
					lifecycle.reason,
					lastDeferredNoticeKey,
				);
				lastDeferredNoticeKey = notice.key;
				if (notice.shouldNotify) ctx.ui.notify(notice.message, notice.level);
			}
			return;
		}
		lastDeferredNoticeKey = null;
		if (pending) takePendingCodewikiContextRefresh();
		let summary: CodewikiCompactionSummary | null = null;
		try {
			summary = await buildCodewikiCompactionSummary(
				resolvedProject.project,
				ctx,
				request,
				null,
			);
		} catch (error) {
			if (ctx.hasUI)
				ctx.ui.notify(
					`${CONTEXT_REFRESH_PREFIX} skipped: ${formatError(error)}`,
					"warning",
				);
			return;
		}
		if (!summary) {
			if (ctx.hasUI)
				ctx.ui.notify(
					`${CONTEXT_REFRESH_PREFIX} skipped: no source-backed resume packet`,
					"info",
				);
			return;
		}
		activeContextRefresh = request;
		preparedContextRefreshSummary = summary;
		if (ctx.hasUI) ctx.ui.notify(`${CONTEXT_REFRESH_PREFIX} starting`, "info");
		ctx.compact({
			customInstructions: formatCodewikiCompactionInstruction(request),
			onComplete: () => {
				activeContextRefresh = null;
				preparedContextRefreshSummary = null;
				previousContextPercent = null;
				const autoPickup = evaluateCodewikiAutoPickupBoundary(
					ctx,
					resolvedProject.project,
					{
						canSendMessage: typeof pi.sendMessage === "function",
					},
				);
				if (ctx.hasUI)
					ctx.ui.notify(`${CONTEXT_REFRESH_PREFIX} complete`, "info");
				if (!autoPickup.allowed) {
					if (ctx.hasUI)
						ctx.ui.notify(
							`${CONTEXT_REFRESH_PREFIX} auto-pickup skipped: ${autoPickup.reason}`,
							"warning",
						);
					return;
				}
				try {
					pi.sendMessage(summary.kickoff, {
						triggerTurn: true,
						deliverAs: "followUp",
					});
					if (ctx.hasUI)
						ctx.ui.notify(
							`${CONTEXT_REFRESH_PREFIX} auto-pickup queued`,
							"info",
						);
				} catch (error) {
					if (ctx.hasUI)
						ctx.ui.notify(
							`${CONTEXT_REFRESH_PREFIX} auto-pickup failed: ${formatError(error)}`,
							"warning",
						);
				}
			},
			onError: (error) => {
				activeContextRefresh = null;
				preparedContextRefreshSummary = null;
				if (ctx.hasUI)
					ctx.ui.notify(
						`${CONTEXT_REFRESH_PREFIX} failed: ${error.message}`,
						"warning",
					);
			},
		});
	});
}

function formatPiCompactionResult(
	summary: CodewikiCompactionSummary,
	event: any,
) {
	return {
		compaction: {
			summary: summary.summary,
			firstKeptEntryId: event.preparation.firstKeptEntryId,
			tokensBefore: event.preparation.tokensBefore,
			details: summary.details,
		},
	};
}

export async function buildCodewikiCompactionSummary(
	project: WikiProject,
	ctx: ExtensionContext,
	request: CodewikiContextRefreshRequest,
	customInstructions: unknown,
): Promise<CodewikiCompactionSummary | null> {
	const activeLink = currentTaskLink(ctx);
	const followUpIntent = [
		request.followUpIntent,
		typeof customInstructions === "string" ? customInstructions : "",
	]
		.map((item) => item?.trim())
		.filter(Boolean)
		.join("\n");
	const resumeInput = {
		requestedTaskId: request.taskId || undefined,
		followUpIntent: followUpIntent || undefined,
		activeLink,
		sessionId: String(
			ctx.sessionManager?.getSessionId?.() || "codewiki-compaction",
		),
		refresh: true,
	};
	let result;
	try {
		result = await buildCodewikiResumeContext(project, resumeInput);
	} catch (error) {
		if (!isStaleTaskResumeError(error)) throw error;
		result = await buildCodewikiResumeContext(project, {
			...resumeInput,
			requestedTaskId: undefined,
		});
	}
	if (!result.prompt.trim()) return null;
	const policy = effectiveAgencyPolicy(project.config);
	const details = {
		source: "codewiki",
		reason: request.reason,
		taskId: result.task?.id ?? request.taskId ?? activeLink?.taskId ?? null,
		contextPath: result.context_path,
		projectRoot: project.root,
		requestedAt: request.requestedAt ?? null,
		agencyLevel: policy.level,
		approvalCadence: policy.approval_cadence,
		contextResetAutoPickup:
			policy.context_reset.enabled && policy.context_reset.auto_pickup,
	};
	return {
		summary: [
			"## CodeWiki Context Refresh",
			`Reason: ${request.reason}`,
			`Generated: ${nowIso()}`,
			"",
			"The active CodeWiki project is source of truth. Continue from this bounded packet, not from discarded chat history.",
			"",
			result.prompt,
		].join("\n"),
		details,
		kickoff: buildCodewikiResumeKickoff({
			prompt: result.prompt,
			reason: request.reason,
			generatedAt: nowIso(),
			projectRoot: project.root,
			taskId: result.task?.id ?? request.taskId ?? activeLink?.taskId ?? null,
			contextPath: result.context_path,
			sourceRefs: result.source_refs,
			policy,
		}),
	};
}

export function buildCodewikiResumeKickoff(input: {
	prompt: string;
	reason: string;
	generatedAt?: string;
	projectRoot?: string | null;
	taskId?: string | null;
	contextPath?: string | null;
	sourceRefs?: string[];
	policy: EffectiveAgencyPolicy;
}): CodewikiResumeKickoffMessage {
	const generatedAt = input.generatedAt ?? nowIso();
	const sourceRefs = (input.sourceRefs || [])
		.map((ref) => String(ref || "").trim())
		.filter(Boolean);
	const resetAutoPickup =
		input.policy.context_reset.enabled &&
		input.policy.context_reset.auto_pickup;
	const header = [
		"## CodeWiki Auto-Pickup Kickoff",
		`Reason: ${input.reason}`,
		`Generated: ${generatedAt}`,
		`Task: ${input.taskId || "—"}`,
		`Context packet: ${input.contextPath || "—"}`,
		`Agency: level=${input.policy.level}; approval=${input.policy.approval_cadence}; reset_auto_pickup=${resetAutoPickup ? "on" : "off"}`,
		`Source refs: ${sourceRefs.slice(0, 8).join(", ") || "—"}`,
		"",
		"Proceed from this CodeWiki source-backed kickoff. Do not depend on pre-reset chat history.",
		"",
	];
	return {
		customType: CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE,
		display: true,
		content: [...header, input.prompt.trim()].join("\n"),
		details: {
			source: "codewiki",
			reason: input.reason,
			generatedAt,
			projectRoot: input.projectRoot ?? null,
			taskId: input.taskId ?? null,
			contextPath: input.contextPath ?? null,
			sourceRefs,
			agencyLevel: input.policy.level,
			approvalCadence: input.policy.approval_cadence,
			contextResetAutoPickup: resetAutoPickup,
		},
	};
}

export function evaluateCodewikiResetLifecycleBoundary(
	ctx: Pick<ExtensionContext, "isIdle" | "hasPendingMessages">,
	project: WikiProject,
): CodewikiResetBoundaryDecision {
	const policy = effectiveAgencyPolicy(project.config);
	if (!policy.context_reset.enabled)
		return {
			allowed: false,
			reason: "context reset disabled by config",
			policy,
		};
	if (policy.context_reset.require_idle_boundary) {
		if (typeof ctx.isIdle !== "function")
			return {
				allowed: false,
				reason: "adapter cannot report idle boundary",
				policy,
			};
		if (!ctx.isIdle())
			return { allowed: false, reason: "agent is not idle", policy };
		if (typeof ctx.hasPendingMessages !== "function")
			return {
				allowed: false,
				reason: "adapter cannot report pending messages",
				policy,
			};
		if (ctx.hasPendingMessages())
			return {
				allowed: false,
				reason: "pending messages would break reset boundary",
				policy,
			};
	}
	return { allowed: true, reason: "safe reset lifecycle boundary", policy };
}

export function evaluateCodewikiAutoPickupBoundary(
	ctx: Pick<ExtensionContext, "isIdle" | "hasPendingMessages">,
	project: WikiProject,
	input: { canSendMessage?: boolean } = {},
): CodewikiResetBoundaryDecision {
	const lifecycle = evaluateCodewikiResetLifecycleBoundary(ctx, project);
	if (!lifecycle.allowed) return lifecycle;
	if (!lifecycle.policy.context_reset.auto_pickup)
		return {
			...lifecycle,
			allowed: false,
			reason: "context reset auto-pickup disabled by config",
		};
	if (input.canSendMessage === false)
		return {
			...lifecycle,
			allowed: false,
			reason: "adapter cannot send protocol-safe custom kickoff",
		};
	return { ...lifecycle, reason: "protocol-safe custom kickoff available" };
}

function isStaleTaskResumeError(error: unknown): boolean {
	const message = formatError(error);
	return /Roadmap task (not found|already closed): TASK-\d+/i.test(message);
}

export function formatCodewikiCompactionInstruction(
	request: CodewikiContextRefreshRequest,
): string {
	return [
		`${CONTEXT_REFRESH_PREFIX}: ${request.reason}`,
		request.taskId ? `task=${request.taskId}` : "",
		request.followUpIntent ? `intent=${request.followUpIntent}` : "",
	]
		.filter(Boolean)
		.join("; ");
}
