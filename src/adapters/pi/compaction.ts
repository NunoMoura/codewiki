import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildCodewikiResumeContext } from "../../application/resume-context.ts";
import { resolveStatusDockProject } from "../../application/project.ts";
import type { WikiProject } from "../../domain/shared/types.ts";
import { formatError, nowIso } from "../../domain/shared/utils.ts";
import { currentTaskLink } from "./session.ts";

const DEFAULT_CONTEXT_REFRESH_THRESHOLD_PERCENT = 80;
const CONTEXT_REFRESH_PREFIX = "CodeWiki context refresh";

export interface CodewikiContextRefreshRequest {
	reason: string;
	taskId?: string | null;
	followUpIntent?: string | null;
	requestedAt?: string;
}

let pendingContextRefresh: CodewikiContextRefreshRequest | null = null;
let activeContextRefresh: CodewikiContextRefreshRequest | null = null;

export function requestCodewikiContextRefresh(request: CodewikiContextRefreshRequest): void {
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
	return percent >= thresholdPercent && (previousPercent === undefined || previousPercent === null || previousPercent < thresholdPercent);
}

export function installCodewikiCompaction(pi: ExtensionAPI): void {
	let previousContextPercent: number | null | undefined;

	pi.on("session_before_compact", async (event: any, ctx: ExtensionContext) => {
		const request = activeContextRefresh ?? pendingContextRefresh ?? {
			reason: "pi-compaction",
			followUpIntent: typeof event.customInstructions === "string" ? event.customInstructions : null,
		};
		try {
			const resolved = await resolveStatusDockProject(ctx, { allowWhenOff: true });
			if (!resolved) return undefined;
			const summary = await buildCodewikiCompactionSummary(resolved.project, ctx, request, event.customInstructions);
			if (!summary) return undefined;
			return {
				compaction: {
					summary: summary.summary,
					firstKeptEntryId: event.preparation.firstKeptEntryId,
					tokensBefore: event.preparation.tokensBefore,
					details: summary.details,
				},
			};
		} catch (error) {
			if (ctx.hasUI) ctx.ui.notify(`${CONTEXT_REFRESH_PREFIX} skipped: ${formatError(error)}`, "warning");
			return undefined;
		}
	});

	pi.on("agent_end", async (_event: unknown, ctx: ExtensionContext) => {
		const usage = ctx.getContextUsage();
		const pending = takePendingCodewikiContextRefresh();
		const shouldRefresh = pending || shouldTriggerCodewikiThresholdRefresh(usage, previousContextPercent);
		previousContextPercent = usage?.percent ?? previousContextPercent ?? null;
		if (!shouldRefresh) return;

		let projectResolved = false;
		try {
			projectResolved = Boolean(await resolveStatusDockProject(ctx, { allowWhenOff: true }));
		} catch {
			projectResolved = false;
		}
		if (!projectResolved) return;

		const request = pending ?? {
			reason: `context-usage-${Math.round(usage?.percent ?? 0)}pct`,
			requestedAt: nowIso(),
		};
		activeContextRefresh = request;
		if (ctx.hasUI) ctx.ui.notify(`${CONTEXT_REFRESH_PREFIX} starting`, "info");
		ctx.compact({
			customInstructions: formatCodewikiCompactionInstruction(request),
			onComplete: () => {
				activeContextRefresh = null;
				previousContextPercent = null;
				if (ctx.hasUI) ctx.ui.notify(`${CONTEXT_REFRESH_PREFIX} complete`, "info");
			},
			onError: (error) => {
				activeContextRefresh = null;
				if (ctx.hasUI) ctx.ui.notify(`${CONTEXT_REFRESH_PREFIX} failed: ${error.message}`, "warning");
			},
		});
	});
}

async function buildCodewikiCompactionSummary(
	project: WikiProject,
	ctx: ExtensionContext,
	request: CodewikiContextRefreshRequest,
	customInstructions: unknown,
): Promise<{ summary: string; details: Record<string, unknown> } | null> {
	const activeLink = currentTaskLink(ctx);
	const followUpIntent = [request.followUpIntent, typeof customInstructions === "string" ? customInstructions : ""]
		.map((item) => item?.trim())
		.filter(Boolean)
		.join("\n");
	const result = await buildCodewikiResumeContext(project, {
		requestedTaskId: request.taskId || activeLink?.taskId,
		followUpIntent: followUpIntent || undefined,
		activeLink,
		sessionId: String(ctx.sessionManager?.getSessionId?.() || "codewiki-compaction"),
		refresh: true,
	});
	if (!result.prompt.trim()) return null;
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
		details: {
			source: "codewiki",
			reason: request.reason,
			taskId: result.task?.id ?? request.taskId ?? activeLink?.taskId ?? null,
			contextPath: result.context_path,
			projectRoot: project.root,
			requestedAt: request.requestedAt ?? null,
		},
	};
}

export function formatCodewikiCompactionInstruction(request: CodewikiContextRefreshRequest): string {
	return [
		`${CONTEXT_REFRESH_PREFIX}: ${request.reason}`,
		request.taskId ? `task=${request.taskId}` : "",
		request.followUpIntent ? `intent=${request.followUpIntent}` : "",
	].filter(Boolean).join("; ");
}
