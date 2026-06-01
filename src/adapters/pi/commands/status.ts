import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	resolveCommandProject,
	resolveStatusDockProject,
	rememberStatusDockProject,
} from "../../../project/context.ts";
import {
	withUiErrorHandling,
	openStatusPanel,
	refreshStatusDock,
} from "../ui/manager.ts";
import { currentTaskLink } from "../session.ts";
import { maybeReadStatusState } from "../../../state/artifacts.ts";
import type { StatusPanelSection } from "../../../state/types.ts";

/**
 * Register the wiki-status command.
 */
export function registerStatusCommand(pi: ExtensionAPI): void {
	pi.registerCommand(`wiki-status`, {
		description:
			"Compatibility shim for /wiki status. Usage: /wiki-status [repo-path] [status|product|system|board|graph]",
		handler: async (args, ctx) => {
			await withUiErrorHandling(ctx, async () => {
				await runStatusCommand(pi, args, ctx, "wiki-status");
			});
		},
	});
}

export async function runStatusCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: any,
	commandName = "wiki status",
): Promise<void> {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	const sectionCandidate = parts[parts.length - 1];
	const sectionAlias: Record<string, StatusPanelSection> = {
		status: "home",
		home: "home",
		product: "product",
		system: "system",
		board: "roadmap",
		roadmap: "roadmap",
		graph: "graph",
	};
	const section = sectionAlias[sectionCandidate || ""] ?? "home";
	if (sectionCandidate && sectionCandidate in sectionAlias) parts.pop();
	const pathArg = parts.join(" ") || null;
	const resolved = pathArg
		? null
		: await resolveStatusDockProject(ctx, { allowWhenOff: true });
	const project = pathArg
		? await resolveCommandProject(ctx, pathArg, commandName)
		: resolved?.project;
	const source: string = pathArg ? "cwd" : (resolved?.source ?? "cwd");
	if (!project) {
		ctx.ui.notify(
			`No codewiki project resolved. Use /wiki bootstrap first or work inside a repo with .codewiki/config.json.`,
			"warning",
		);
		return;
	}
	await rememberStatusDockProject(project);
	await refreshStatusDock(project, ctx, currentTaskLink(ctx));
	const opened = await openStatusPanel(
		pi,
		project,
		ctx,
		"both",
		currentTaskLink(ctx),
		source,
		() => undefined,
		section,
	);
	if (!opened) {
		await maybeReadStatusState(project.statusStatePath);
		ctx.ui.notify(
			"Custom UI unavailable. Use wiki_state output or configure Pi UI mode.",
			"warning",
		);
	}
}
