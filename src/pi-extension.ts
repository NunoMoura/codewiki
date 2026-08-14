import { registerCodewikiExtension } from "./clients/pi/extension.ts";
import { createPiProjectServiceClients } from "./clients/pi/project-service-client.ts";
import { closePiPreviewRuntime, piPreviewControl } from "./clients/pi/preview-runtime.ts";
import type {
	CodewikiDashboardService,
	CodewikiExtensionApi,
} from "./clients/pi/types.ts";
import { spawnPiProjectCoordinatorDaemon } from "./execution/pi/coordinator-daemon.ts";
import { connectEnsuredProjectCoordinatorClient } from "./runtime/coordinator/process.ts";
import { connectProjectRuntimeGateway } from "./runtime/gateway.ts";
import { stopProjectCoordinatorService } from "./runtime/coordinator/service.ts";
import {
	closeCodewikiAppServer,
	closeInProcessCodewikiAppServer,
	startCodewikiAppServer,
} from "./server/app/server.ts";

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
				connectProjectRuntime: true,
				projectRuntimeConnector(repoRoot, connectionInput) {
					return connectProjectRuntimeGateway(repoRoot, connectionInput, {
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
