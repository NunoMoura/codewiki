import { realpathSync } from "node:fs";
import { startProjectCoordinatorService } from "./project-coordinator-service.ts";

const repoRoot = process.argv[2];
if (!repoRoot) {
	throw new Error("CodeWiki project coordinator daemon requires a repo root argument.");
}

const service = await startProjectCoordinatorService(realpathSync(repoRoot));
let closing = false;

async function shutdown(): Promise<void> {
	if (closing) return;
	closing = true;
	service.coordinator.setExecutionPolicy("paused");
	await waitForJobs(Date.now() + 30_000);
	await service.close().catch(() => undefined);
}

async function waitForJobs(deadline: number): Promise<void> {
	if (
		service.coordinator.snapshot().jobs.length === 0 ||
		Date.now() >= deadline
	) {
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, 50));
	return waitForJobs(deadline);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => {
		void shutdown().finally(() => process.exit(0));
	});
}
