import { createPiTraceHostSessionFactory } from "../pi/process-session.ts";
import { loadWikiConfigFile } from "../project/config-file.ts";
import { buildProjectWikiState } from "../project/state-file.ts";
import { TraceHostSupervisor } from "../runtime/trace-host-supervisor.ts";
import {
	createDashboardTraceHostControl,
	type DashboardTraceHostControl,
} from "./trace-host-control.ts";

export async function createDefaultDashboardTraceHostControl(
	repoRoot: string,
	supervisorId: string,
): Promise<DashboardTraceHostControl> {
	const config = await loadWikiConfigFile(repoRoot);
	const supervisor = new TraceHostSupervisor({
		maxTraceHosts: 1,
		maxSeconds: config.runtime.budgets.maxSeconds,
	});
	return createDashboardTraceHostControl({
		repoRoot,
		supervisorId,
		supervisor,
		startSession: createPiTraceHostSessionFactory(),
		loadTraceBoard: async () =>
			(await buildProjectWikiState({ repoRoot })).traceBoard,
		loadConfig: () => loadWikiConfigFile(repoRoot),
	});
}
