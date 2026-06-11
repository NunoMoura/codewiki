import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	resolveCommandProject,
	resolveStatusDockProject,
	rememberStatusDockProject,
} from "../../../project/context.ts";
import {
	readStatusDockPrefs,
	writeStatusDockPrefs,
} from "../../../state/local/status-dock-prefs.ts";
import {
	withUiErrorHandling,
	openConfigPanel,
	refreshStatusDock,
	clearStatusDock,
	activeStatusPanelGlobal,
} from "../ui/manager.ts";
import {
	STATUS_DOCK_MODE_VALUES,
	STATUS_DOCK_DENSITY_VALUES,
} from "../../../state/types.ts";
import type { StatusDockMode } from "../../../state/types.ts";
import { currentTaskLink } from "../session.ts";
import { maybeReadStatusState } from "../../../state/artifacts.ts";
import { effectiveAgencyPolicy } from "../../../agency/types.ts";
import { formatStatusConfigSummary } from "../ui/theme.ts";
import { splitCommandArgs } from "../../../shared/utils.ts";

/**
 * Register the wiki-config command.
 */
export function registerConfigCommand(pi: ExtensionAPI): void {
	pi.registerCommand(`wiki-config`, {
		description:
			"Compatibility shim for /wiki config. Usage: /wiki-config [show|auto|pin|off|minimal|standard|full] [repo-path]",
		getArgumentCompletions: completeConfigCommandOptions,
		handler: async (args, ctx) => {
			await withUiErrorHandling(ctx, async () => {
				await runConfigCommand(args, ctx, "wiki-config");
			});
		},
	});
}

export function completeConfigCommandOptions(prefix: string) {
	const options = [
		"show",
		...STATUS_DOCK_MODE_VALUES,
		...STATUS_DOCK_DENSITY_VALUES,
	];
	return options
		.filter((item) => item.startsWith(prefix))
		.map((value) => ({ value, label: value }));
}

export async function runConfigCommand(
	args: string,
	ctx: any,
	commandName = "wiki config",
): Promise<void> {
	const input = parseConfigCommandInput(args);
	const prefs = await readStatusDockPrefs();
	if (input.kind === "show") {
		const resolved = await resolveStatusDockProject(ctx, {
			allowWhenOff: true,
		});
		if (resolved) {
			await rememberStatusDockProject(resolved.project);
			await refreshStatusDock(
				resolved.project,
				ctx,
				currentTaskLink(ctx),
				resolved,
			);
		}
		const opened = await openConfigPanel(ctx, resolved?.project ?? null);
		if (!opened) {
			if (!resolved) {
				ctx.ui.notify(
					`No codewiki project resolved. Use /wiki bootstrap first or work inside a repo with .codewiki/config.json.`,
					"warning",
				);
				return;
			}
			ctx.ui.notify(
				formatStatusConfigSummary(
					prefs,
					effectiveAgencyPolicy(resolved.project.config),
				),
				"info",
			);
		}
		return;
	}
	if (input.density) {
		const nextPrefs = { ...prefs, density: input.density };
		await writeStatusDockPrefs(nextPrefs);
		if (activeStatusPanelGlobal) {
			activeStatusPanelGlobal.density = input.density;
			activeStatusPanelGlobal.requestRender?.();
		}
		const resolved = await resolveStatusDockProject(ctx);
		if (resolved)
			await refreshStatusDock(
				resolved.project,
				ctx,
				currentTaskLink(ctx),
				resolved,
			);
		else clearStatusDock(ctx);
		ctx.ui.notify(`Status dock density set to ${input.density}.`, "info");
		return;
	}
	if (input.mode === "off") {
		const nextPrefs = { ...prefs, mode: "off" as StatusDockMode };
		await writeStatusDockPrefs(nextPrefs);
		clearStatusDock(ctx);
		ctx.ui.notify("Status summary hidden.", "info");
		return;
	}
	if (input.mode === "auto") {
		const nextPrefs = { ...prefs, mode: "auto" as StatusDockMode };
		await writeStatusDockPrefs(nextPrefs);
		const resolved = await resolveStatusDockProject(ctx);
		if (resolved)
			await refreshStatusDock(
				resolved.project,
				ctx,
				currentTaskLink(ctx),
				resolved,
			);
		else clearStatusDock(ctx);
		ctx.ui.notify("Status summary set to auto mode.", "info");
		return;
	}
	const project = await resolveCommandProject(ctx, input.pathArg, commandName);
	const nextPrefs = {
		...prefs,
		mode: "pin" as StatusDockMode,
		pinnedRepoPath: project.root,
	};
	await writeStatusDockPrefs(nextPrefs);
	await refreshStatusDock(project, ctx, currentTaskLink(ctx), {
		...project,
		project,
		statusState:
			(await maybeReadStatusState(project.statusStatePath)) ?? undefined,
		source: "pinned",
	});
	ctx.ui.notify(`Status summary pinned to ${project.root}.`, "info");
}

export function parseConfigCommandInput(args: string): {
	kind: "show" | "set";
	mode?: StatusDockMode;
	density?: any;
	pathArg: string | null;
} {
	const tokens = splitCommandArgs(args);
	if (tokens.length === 0 || tokens[0] === "show") {
		return { kind: "show", pathArg: null };
	}
	const first = tokens[0] as any;
	if (STATUS_DOCK_MODE_VALUES.includes(first)) {
		return { kind: "set", mode: first, pathArg: tokens[1] || null };
	}
	if (STATUS_DOCK_DENSITY_VALUES.includes(first)) {
		return { kind: "set", density: first, pathArg: tokens[1] || null };
	}
	return { kind: "set", pathArg: first };
}

/**
 * Get argument completions for the config command.
 */
export function completeCommandOptions(
	prefix: string,
	options: readonly string[],
): { value: string; label: string }[] | null {
	const items = options.filter((item) => item.startsWith(prefix));
	return items.length > 0
		? items.map((value) => ({ value, label: value }))
		: null;
}
