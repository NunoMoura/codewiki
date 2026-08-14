import { registerCodewikiCommands } from "./commands/index.ts";
import { registerCodewikiMessageRenderers } from "./messages.ts";
import { registerCodewikiPromptHooks } from "./prompt/index.ts";
import type { ProjectRuntimeGatewayConnector } from "../../runtime/index.ts";
import type { PiProjectServiceClientProvider } from "./project-service-client.ts";
import { registerCodeWikiReviewHooks } from "./review-hooks.ts";
import { registerCodewikiTools } from "./tools/index.ts";
import { registerCodewikiFooter } from "./tui/index.ts";
import type { CodewikiExtensionApi } from "./types.ts";

/**
 * Pi Client registration is available for neutral package bootstrap wiring.
 */
export const piExtensionAvailable = true as const;

export interface RegisterCodewikiExtensionOptions {
	projectServices: PiProjectServiceClientProvider;
	connectDashboardCoordinator?: boolean;
	projectRuntimeConnector?: ProjectRuntimeGatewayConnector;
}

export function registerCodewikiExtension(
	pi: CodewikiExtensionApi,
	options: RegisterCodewikiExtensionOptions,
): void {
	const { projectServices } = options;
	const connectDashboardCoordinator =
		options.connectDashboardCoordinator ?? true;
	registerCodewikiMessageRenderers(pi);
	registerCodewikiTools(pi, projectServices);
	registerCodewikiCommands(
		pi,
		connectDashboardCoordinator,
		projectServices,
		options.projectRuntimeConnector,
	);
	registerCodewikiPromptHooks(pi);
	registerCodeWikiReviewHooks({ on: pi.on?.bind(pi) });
	registerCodewikiFooter(
		pi,
		connectDashboardCoordinator,
		options.projectRuntimeConnector,
	);
	pi.on?.("session_shutdown", () => projectServices.disconnect());
}
