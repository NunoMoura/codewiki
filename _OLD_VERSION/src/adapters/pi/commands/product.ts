import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export async function runProductCommand(
	_pi: ExtensionAPI,
	_args: string,
	ctx: any,
	_commandName = "wiki product",
): Promise<void> {
	ctx.ui.notify(
		"Product UI command is deprecated. Use backend source refs and wiki_state instead.",
		"warning",
	);
}
