import type { CodewikiBuildToolInput } from "./types.ts";
import type { WikiProject } from "../project/types.ts";
import { writeBuild } from "./writer.ts";
import { runRebuild } from "../state/artifacts.ts";

export async function executeCodewikiBuildTool(
	project: WikiProject,
	input: CodewikiBuildToolInput,
) {
	const result = await writeBuild(project, input);
	if (input.refresh ?? true) await runRebuild(project);
	return {
		summary: `codewiki build: wrote ${result.path}`,
		result,
	};
}
