import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	resolveCommandProject,
	resolveStatusDockProject,
	rememberStatusDockProject,
} from "../../../project/context.ts";
import { splitCommandArgs } from "../../../shared/utils.ts";
import { currentTaskLink } from "../session.ts";
import { openStatusPanel, refreshStatusDock } from "../ui/manager.ts";

function productInitialColumn(args: string): number {
	const [view] = splitCommandArgs(args);
	return String(view || "").toLowerCase() === "users" ? 1 : 0;
}

export async function runProductCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: any,
	commandName = "wiki product",
): Promise<void> {
	const resolved = await resolveStatusDockProject(ctx, { allowWhenOff: true });
	const project =
		resolved?.project ?? (await resolveCommandProject(ctx, null, commandName));
	const source = resolved?.source ?? "cwd";
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
		"product",
		0,
		productInitialColumn(args),
	);
	if (!opened) {
		ctx.ui.notify(
			"Custom UI unavailable. Use /wiki status product or wiki_state source refs for product navigation.",
			"warning",
		);
	}
}
