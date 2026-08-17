import { startProjectCoordinatorService } from "../../src/project-server/coordinator/service.ts";

const repoRoot = process.argv[2];
if (!repoRoot) throw new Error("Project root argument is required.");

const service = await startProjectCoordinatorService(repoRoot, {
	executionPolicy: "unattended",
});
process.stdout.write(
	`${JSON.stringify({
		generationId: service.endpoint.generationId,
		pid: process.pid,
	})}\n`,
);

await new Promise(() => undefined);
