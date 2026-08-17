import { registerCodewikiExtension } from "./clients/pi/extension.ts";
import { createPiProjectServiceClients } from "./clients/pi/project-service-client.ts";
import { closePiPreviewRuntime, piPreviewControl } from "./clients/pi/preview-project-server.ts";
import type {
	CodewikiDashboardService,
	CodewikiExtensionApi,
} from "./clients/pi/types.ts";
import { spawnPiProjectCoordinatorDaemon } from "./runtime/pi/coordinator-daemon.ts";
import { connectEnsuredProjectCoordinatorClient } from "./project-server/coordinator/process.ts";
import { connectProjectServerApi } from "./project-server/api.ts";
import { stopProjectCoordinatorService } from "./project-server/coordinator/service.ts";
import {
	closeCodewikiAppServer,
	closeInProcessCodewikiAppServer,
	startCodewikiAppServer,
} from "./project-server/app/server.ts";

/**
 * Neutral package bootstrap for the shipped Pi Client and managed Execution path.
 */
export default function codewikiExtension(pi: CodewikiExtensionApi): void {
	const projectServices = createPiProjectServiceClients({
		connect(repoRoot, input) {
			return connectEnsuredProjectCoordinatorClient(repoRoot, input, {
				spawnDaemon: spawnPiProjectCoordinatorDaemon,
			});
		},
		stop: stopProjectCoordinatorService,
	});
	const dashboardService: CodewikiDashboardService = {
		start(input) {
			return startCodewikiAppServer({
				...input,
				inProcess: true,
				persistent: false,
				previewControl: piPreviewControl(input.repoRoot),
				connectProjectServer: true,
				projectServerConnector(repoRoot, connectionInput) {
					return connectProjectServerApi(repoRoot, connectionInput, {
						spawnDaemon: spawnPiProjectCoordinatorDaemon,
					});
				},
			});
		},
		async stop(repoRoot) {
			await closeCodewikiAppServer(repoRoot);
			await projectServices.stop(repoRoot).catch(() => undefined);
		},
		async shutdown(repoRoot) {
			await Promise.all([
				closeInProcessCodewikiAppServer(repoRoot),
				closePiPreviewRuntime(repoRoot),
			]);
		},
	};
	registerCodewikiExtension(pi, { dashboardService, projectServices });
}
