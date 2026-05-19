import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodewikiSessionHandoffToolInput } from "../../../domain/shared/types.ts";
import {
	HANDOFF_COMMAND,
	HANDOFF_KIND,
	buildSessionHandoffPayload,
	executeCodewikiSessionHandoffTool,
	executeSessionHandoffFromTool,
	markHandoff,
	readStagedHandoff,
	stageSessionHandoff,
	type CodewikiSessionHandoffPayload,
} from "../../../application/tools/session-handoff.ts";
export {
	buildSessionHandoffPayload,
	executeSessionHandoffFromTool,
	stageSessionHandoff,
};
import { resolveToolProject } from "../../../application/project.ts";
import { refreshStatusDock, withUiErrorHandling } from "../ui/manager.ts";
import { currentTaskLink } from "../session.ts";
import { codewikiSessionHandoffToolInputSchema } from "../schemas.ts";

export async function runSessionHandoffCommand(
	args: string,
	ctx: ExtensionCommandContext,
): Promise<{ payload: CodewikiSessionHandoffPayload; cancelled: boolean }> {
	await ctx.waitForIdle();
	const { payload, path } = await readStagedHandoff(ctx.cwd, args);
	if (payload.mode === "external-orchestrator") {
		await markHandoff(path, payload, "external");
		ctx.ui.notify("CodeWiki external session boundary recorded for orchestrator.", "info");
		return { payload, cancelled: false };
	}
	if (payload.mode === "context-reset" || payload.mode === "context-refresh") {
		ctx.compact({ customInstructions: `CodeWiki context refresh for ${payload.reason}. Keep boundary refs and current task/build ids.` });
		await markHandoff(path, payload, "completed");
		return { payload, cancelled: false };
	}
	await markHandoff(path, payload, "started");
	const parentSession = ctx.sessionManager.getSessionFile();
	let result: { cancelled?: boolean } | undefined;
	try {
		result = await ctx.newSession({
			parentSession,
			setup: async (sessionManager: any) => {
				try {
					sessionManager.appendCustomEntry?.(HANDOFF_KIND, { ...payload, status: "started" });
				} catch {
					// Optional session metadata only.
				}
			},
			withSession: async (replacementCtx: any) => {
				await replacementCtx.sendUserMessage(payload.kickoff_prompt);
			},
		});
	} catch (error) {
		await markHandoff(path, payload, "failed");
		throw error;
	}
	if (result?.cancelled) {
		await markHandoff(path, payload, "cancelled");
		return { payload, cancelled: true };
	}
	await markHandoff(path, payload, "completed");
	return { payload, cancelled: false };
}

export function queueSessionHandoffFollowUp(
	_pi: Pick<ExtensionAPI, "sendUserMessage">,
	_command: string | undefined,
	_options: { autoQueue?: boolean } = {},
): boolean {
	// Pi sendUserMessage uses prompt expansion disabled, so queued slash commands
	// arrive as normal chat instead of running registered command handlers.
	return false;
}

export function registerSessionHandoffCommand(pi: ExtensionAPI): void {
	pi.registerCommand(HANDOFF_COMMAND, {
		description: "Compatibility executor for staged CodeWiki session boundaries.",
		handler: async (args, ctx) => {
			await withUiErrorHandling(ctx, async () => {
				await runSessionHandoffCommand(args, ctx);
			});
		},
	});
}

export function registerCodewikiSessionHandoffTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "codewiki_session_handoff",
		label: "Codewiki Session Boundary",
		description: "Compatibility tool for CodeWiki new_session/context_refresh boundaries and true handoffs when needed.",
		promptSnippet: "Request a CodeWiki new_session, context_refresh, or role/session handoff boundary from source refs.",
		promptGuidelines: [
			"Use this compatibility tool for policy-required boundaries; agents may also request new_session/context_refresh for context hygiene when chat is noisy, stale, or token-heavy.",
			"Do not call same-agent context hygiene a handoff. Reserve handoff for work transfer to another session/agent/role.",
			"In Pi tool context, context_refresh/context_reset uses adapter-owned ctx.compact automatically and reports zero user interrupts.",
			"In Pi tool context, new_session is platform-limited because ctx.newSession is command-context only; report the staged boundary and next safe action instead of asking the user to paste or press Enter on /wiki-session-handoff.",
			"Do not auto-queue /wiki-session-handoff through sendUserMessage: Pi treats extension-sent slash text as chat, not as a registered command.",
			"/wiki-session-handoff is an internal/compatibility command-context executor when an adapter has command context; it is not normal user workflow.",
			"Session boundaries do not replace artifact status coordination, validation, task evidence, checks, or publication policy.",
		],
		parameters: codewikiSessionHandoffToolInputSchema,
		async execute(_toolCallId: string, params: CodewikiSessionHandoffToolInput, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: ExtensionContext) {
			const project = await resolveToolProject(ctx.cwd, params.repoPath, "codewiki_session_handoff");
			const result = await executeCodewikiSessionHandoffTool(project, params, ctx);
			const shouldAutoQueue = (params.autoQueue ?? true) && result.result.auto_queue !== false;
			const queued = queueSessionHandoffFollowUp(pi, result.result.command, { autoQueue: shouldAutoQueue });
			const editorPrefilled = false;
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			const nextSafeAction = result.result.next_safe_action ? `; next_safe_action: ${result.result.next_safe_action}` : "";
			const reason = result.result.reason ? `; reason: ${result.result.reason}` : "";
			return {
				content: [{ type: "text", text: `codewiki session_boundary: ${result.result.action} ${result.staged.relativePath}${nextSafeAction}${reason}` }],
				details: { ...result, queued_follow_up: queued, editor_prefilled: editorPrefilled, user_command_surfaced: false },
			};
		},
	} as any);
}
