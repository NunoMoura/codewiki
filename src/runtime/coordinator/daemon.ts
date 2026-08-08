import { realpathSync } from "node:fs";
import {
	startProjectCoordinatorService,
	type ProjectCoordinatorServiceHandle,
	type ProjectCoordinatorServiceOptions,
} from "./service.ts";

export interface ProjectCoordinatorDaemonHandle
	extends Omit<ProjectCoordinatorServiceHandle, "close"> {
	close(): Promise<void>;
}

export async function startProjectCoordinatorDaemon(
	repoRoot: string,
	options: ProjectCoordinatorServiceOptions = {},
): Promise<ProjectCoordinatorDaemonHandle> {
	const service = await startProjectCoordinatorService(
		realpathSync(repoRoot),
		options,
	);
	let closing = false;
	return {
		endpoint: service.endpoint,
		coordinator: service.coordinator,
		scheduleWorkerAssignments: service.scheduleWorkerAssignments.bind(service),
		reconcileWorkers: service.reconcileWorkers.bind(service),
		async close() {
			if (closing) return;
			closing = true;
			service.coordinator.setExecutionPolicy("paused");
			await waitForJobs(service, Date.now() + 30_000);
			await service.close();
		},
	};
}

async function waitForJobs(
	service: ProjectCoordinatorServiceHandle,
	deadline: number,
): Promise<void> {
	if (
		service.coordinator.snapshot().jobs.length === 0 ||
		Date.now() >= deadline
	) {
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, 50));
	return waitForJobs(service, deadline);
}
