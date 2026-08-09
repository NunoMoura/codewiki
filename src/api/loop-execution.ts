import { runWikiDecide } from "./wiki-decide.ts";
import { runRuntimeSelectedWikiImplement } from "./wiki-implement.ts";
import { runRuntimeSelectedWikiPlan } from "./wiki-plan.ts";
import type { RuntimeLoopExecutionPorts } from "../runtime/coordinator/executor.ts";

/** Bind CodeWiki-owned Loop APIs to Runtime's injected execution contract. */
export function createCodeWikiLoopExecutionPorts(): RuntimeLoopExecutionPorts {
	return {
		decision: runWikiDecide,
		planning: runRuntimeSelectedWikiPlan,
		implementation: runRuntimeSelectedWikiImplement,
	};
}
