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
		ctx.ui.notify("CodeWiki session handoff recorded for external orchestrator.", "info");
		return { payload, cancelled: false };
	}
	if (payload.mode === "context-reset") {
		ctx.compact({ customInstructions: `CodeWiki context reset for ${payload.reason}. Keep handoff refs and current task/build ids.` });
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
	pi: Pick<ExtensionAPI, "sendUserMessage">,
	command: string | undefined,
): boolean {
	if (!command) return false;
	pi.sendUserMessage(command, { deliverAs: "followUp" });
	return true;
}

export function registerSessionHandoffCommand(pi: ExtensionAPI): void {
	pi.registerCommand(HANDOFF_COMMAND, {
		description: "Continue CodeWiki work in a fresh session from a staged handoff.",
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
		label: "Codewiki Session Handoff",
		description: "Stage a CodeWiki fresh-session/context-reset handoff and queue the Pi command-context executor internally when needed.",
		promptSnippet: "Request a fresh CodeWiki session/context handoff at compiler, validation, or agency boundaries.",
		promptGuidelines: [
			"Use codewiki_session_handoff when graph/build policy requires a fresh session or context reset; do not ask the user to run /new or /wiki-session-handoff manually.",
			"From tool context, Pi cannot call ctx.newSession, and ctx.compact can hide the tool result; codewiki_session_handoff stages a durable handoff file and queues the internal /wiki-session-handoff command as a follow-up.",
			"/wiki-session-handoff is an internal/compatibility command-context executor that performs ctx.newSession or ctx.compact from the staged handoff file.",
			"Session handoffs do not replace artifact status coordination, validation, task evidence, checks, or publication policy.",
		],
		parameters: codewikiSessionHandoffToolInputSchema,
		async execute(_toolCallId: string, params: CodewikiSessionHandoffToolInput, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: ExtensionContext) {
			const project = await resolveToolProject(ctx.cwd, params.repoPath, "codewiki_session_handoff");
			const result = await executeCodewikiSessionHandoffTool(project, params, ctx);
			const queued = (params.autoQueue ?? true) && queueSessionHandoffFollowUp(pi, result.result.command);
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			const queueHint = queued ? "; queued internal handoff command" : "";
			return {
				content: [{ type: "text", text: `codewiki session_handoff: ${result.result.action} ${result.staged.relativePath}${queueHint}` }],
				details: { ...result, queued_follow_up: queued },
			};
		},
	} as any);
}
