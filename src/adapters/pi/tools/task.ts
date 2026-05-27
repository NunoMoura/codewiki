import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WikiProject } from "../../../project/types.ts";
import type { CodewikiTaskToolInput } from "../../../roadmap/types.ts";
import { executeCodewikiTaskTool } from "../../../api/tools.ts";
import { piTaskPorts } from "./ports.ts";

/** Implementation of the codewiki_task tool. */
export async function executeCodewikiTask(
	_pi: ExtensionAPI,
	project: WikiProject,
	_ctx: ExtensionContext,
	input: CodewikiTaskToolInput,
) {
	return executeCodewikiTaskTool(project, input, piTaskPorts());
}
