import { registerCodewikiCommands } from "./commands/index.ts";
import { registerCodewikiMessageRenderers } from "./messages.ts";
import { registerCodewikiPromptHooks } from "./prompt/index.ts";
import { registerCodewikiTools } from "./tools/index.ts";
import { registerCodewikiFooter } from "./tui/index.ts";
import type { CodewikiExtensionApi } from "./types.ts";

/**
 * The package manifest exposes this entry for external Pi install.
 * Repo-local enablement remains controlled by `.pi/settings.json`.
 */
export const piExtensionAvailable = true as const;

export default function codewikiExtension(pi: CodewikiExtensionApi): void {
	registerCodewikiExtension(pi);
}

export function registerCodewikiExtension(pi: CodewikiExtensionApi): void {
	registerCodewikiMessageRenderers(pi);
	registerCodewikiTools(pi);
	registerCodewikiCommands(pi);
	registerCodewikiPromptHooks(pi);
	registerCodewikiFooter(pi);
}
