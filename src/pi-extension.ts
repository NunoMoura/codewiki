import { registerCodewikiExtension } from "./clients/pi/extension.ts";
import { createPiProjectServiceClients } from "./clients/pi/project-service-client.ts";
import type { CodewikiExtensionApi } from "./clients/pi/types.ts";
import { spawnPiProjectCoordinatorDaemon } from "./execution/pi/coordinator-daemon.ts";
import { connectEnsuredProjectCoordinatorClient } from "./runtime/coordinator/process.ts";
import { connectProjectRuntimeGateway } from "./runtime/gateway.ts";
import { stopProjectCoordinatorService } from "./runtime/coordinator/service.ts";

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
	registerCodewikiExtension(pi, {
		projectServices,
		projectRuntimeConnector(repoRoot, input) {
			return connectProjectRuntimeGateway(repoRoot, input, {
				spawnDaemon: spawnPiProjectCoordinatorDaemon,
			});
		},
	});
}
