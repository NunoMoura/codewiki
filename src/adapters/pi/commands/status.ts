import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { withUiErrorHandling } from "../ui/manager.ts";

const STATUS_DEPRECATION_MESSAGE =
	"Status UI commands are deprecated. Use wiki_state or graph lenses for backend status.";

/**
 * Register deprecated status command shim.
 */
export function registerStatusCommand(pi: ExtensionAPI): void {
	pi.registerCommand(`wiki-status`, {
		description:
			"Deprecated status UI shim. Use wiki_state or graph lenses for backend status.",
		handler: async (_args, ctx) => {
			await withUiErrorHandling(ctx, async () => {
				await runStatusCommand(pi, "", ctx, "wiki-status");
			});
		},
	});
}

export async function runStatusCommand(
	_pi: ExtensionAPI,
	_args: string,
	ctx: any,
	_commandName = "wiki status",
): Promise<void> {
	ctx.ui.notify(STATUS_DEPRECATION_MESSAGE, "warning");
}
