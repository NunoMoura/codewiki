import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WikiProject } from "../../../project/types.ts";
import type { CodewikiSessionToolInput } from "../../../domain/session/types.ts";
import { executeCodewikiSessionTool } from "../../../application/tools/session.ts";
import { piSessionToolPorts } from "./ports.ts";

/** Implementation of the codewiki_session tool. */
export async function executeCodewikiSession(
	pi: ExtensionAPI,
	project: WikiProject,
	ctx: ExtensionContext,
	input: CodewikiSessionToolInput,
) {
	return executeCodewikiSessionTool(project, input, piSessionToolPorts(pi, ctx));
}
