import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { WikiProject } from "../../../project/types.ts";
import type { CodewikiRoadmapToolInput } from "../../../roadmap/types.ts";
import { executeCodewikiRoadmapTool } from "../../../api/tools.ts";
import { piTaskPorts } from "./ports.ts";

/** Implementation of the wiki_roadmap tool. */
export async function executeCodewikiRoadmap(
	_pi: ExtensionAPI,
	project: WikiProject,
	_ctx: ExtensionContext,
	input: CodewikiRoadmapToolInput,
) {
	return executeCodewikiRoadmapTool(project, input, piTaskPorts());
}
