import { registerCodewikiCommands } from "./commands/index.ts";
import { registerCodewikiMessageRenderers } from "./messages.ts";
import { registerCodewikiPromptHooks } from "./prompt/index.ts";
import {
	createPiProjectServiceClients,
	type PiProjectServiceClientProvider,
} from "./project-service-client.ts";
import { registerCodeWikiReviewHooks } from "./review-hooks.ts";
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

export interface RegisterCodewikiExtensionOptions {
	projectServices?: PiProjectServiceClientProvider;
	connectDashboardCoordinator?: boolean;
}

export function registerCodewikiExtension(
	pi: CodewikiExtensionApi,
	options: RegisterCodewikiExtensionOptions = {},
): void {
	const projectServices =
		options.projectServices || createPiProjectServiceClients();
	const connectDashboardCoordinator =
		options.connectDashboardCoordinator ?? true;
	registerCodewikiMessageRenderers(pi);
	registerCodewikiTools(pi, projectServices);
	registerCodewikiCommands(
		pi,
		connectDashboardCoordinator,
		projectServices,
	);
	registerCodewikiPromptHooks(pi);
	registerCodeWikiReviewHooks({ on: pi.on?.bind(pi) });
	registerCodewikiFooter(pi, connectDashboardCoordinator);
	pi.on?.("session_shutdown", () => projectServices.disconnect());
}
