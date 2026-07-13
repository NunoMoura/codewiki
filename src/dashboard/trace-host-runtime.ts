import { createPiTraceHostSessionFactory } from "../pi/process-session.ts";
import { loadWikiConfigFile } from "../project/config-file.ts";
import { buildProjectWikiState } from "../project/state-file.ts";
import { resolveTraceExecutionPolicy } from "../runtime/trace-execution-policy.ts";
import type { TraceHostSessionFactory } from "../runtime/trace-host-runner.ts";
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
		maxLatencyMs: config.runtime.budgets.maxLatencyMs,
		maxTokens: config.runtime.budgets.maxTokens,
		maxCostUsd: config.runtime.budgets.maxCostUsd,
	});
	return createDashboardTraceHostControl({
		repoRoot,
		supervisorId,
		supervisor,
		startSession: routedTraceHostSessionFactory(repoRoot),
		loadTraceBoard: async () =>
			(await buildProjectWikiState({ repoRoot })).traceBoard,
		loadConfig: () => loadWikiConfigFile(repoRoot),
	});
}

function routedTraceHostSessionFactory(
	repoRoot: string,
): TraceHostSessionFactory {
	return async (input) => {
		const [config, board] = await Promise.all([
			loadWikiConfigFile(repoRoot),
			buildProjectWikiState({ repoRoot }).then((state) => state.traceBoard),
		]);
		const trace = board.traces.find(
			(candidate) => candidate.traceId === input.traceId,
		);
		if (!trace)
			throw new Error(`Trace ${input.traceId} is not present in trace state.`);
		const policy = resolveTraceExecutionPolicy(config, {
			target: input.target,
			pathScopes: trace.pathScopes,
			continuation: Boolean(input.resumeSessionId),
		});
		if (!policy.selected) {
			throw new Error(`Execution policy blocked start: ${policy.rationale}`);
		}
		return createPiTraceHostSessionFactory({
			timeoutMs: policy.selected.timeoutMs,
			model: {
				provider: policy.selected.provider,
				model: policy.selected.model,
				thinking: policy.selected.thinking,
			},
		})(input);
	};
}
