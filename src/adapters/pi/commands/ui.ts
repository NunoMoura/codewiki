import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const WIKI_UI_DEPRECATION_MESSAGE =
	"/wiki-ui is deprecated. Use /wiki-status, /wiki-resume, /wiki-config, and /audit for Pi-hosted CodeWiki views.";

export function registerUiCommand(pi: ExtensionAPI): void {
	pi.registerCommand("wiki-ui", {
		description:
			"Deprecated. Use /wiki-status, /wiki-resume, /wiki-config, and /audit.",
		handler: async (_args, ctx) => {
			ctx.ui.notify(WIKI_UI_DEPRECATION_MESSAGE, "warning");
		},
	});
}
