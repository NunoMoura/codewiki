import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const WIKI_UI_DEPRECATION_MESSAGE =
	"/wiki-ui is deprecated. Use backend tools such as wiki_state, /wiki resume, /wiki config, and /audit.";

export function registerUiCommand(pi: ExtensionAPI): void {
	pi.registerCommand("wiki-ui", {
		description:
			"Deprecated UI command. Use backend tools such as wiki_state, /wiki resume, /wiki config, and /audit.",
		handler: async (_args, ctx) => {
			ctx.ui.notify(WIKI_UI_DEPRECATION_MESSAGE, "warning");
		},
	});
}
