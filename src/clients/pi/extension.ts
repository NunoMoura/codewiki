import { registerCodewikiCommands } from "./commands/index.ts";
import { registerCodewikiMessageRenderers } from "./messages.ts";
import { registerCodewikiPromptHooks } from "./prompt/index.ts";
import type { PiProjectServiceClientProvider } from "./project-service-client.ts";
import { registerCodeWikiReviewHooks } from "./review-hooks.ts";
import { registerCodewikiTools } from "./tools/index.ts";
import { registerCodewikiFooter } from "./tui/index.ts";
import type {
	CodewikiDashboardService,
	CodewikiExtensionApi,
} from "./types.ts";

/**
 * Pi Client registration is available for neutral package bootstrap wiring.
 */
export const piExtensionAvailable = true as const;

export interface RegisterCodewikiExtensionOptions {
	projectServices: PiProjectServiceClientProvider;
	dashboardService: CodewikiDashboardService;
}

export function registerCodewikiExtension(
	pi: CodewikiExtensionApi,
	options: RegisterCodewikiExtensionOptions,
): void {
	const { dashboardService, projectServices } = options;
	registerCodewikiMessageRenderers(pi);
	registerCodewikiTools(pi, projectServices);
	registerCodewikiCommands(pi, projectServices, dashboardService);
	registerCodewikiPromptHooks(pi);
	registerCodeWikiReviewHooks({ on: pi.on?.bind(pi) });
	registerCodewikiFooter(pi, dashboardService);
	pi.on?.("session_shutdown", () => projectServices.disconnect());
}
