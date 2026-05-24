import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgencyToolInput } from "../../../agency/types.ts";
import type { WikiProject } from "../../../domain/project/types.ts";
import { executeCodewikiAgencyTool } from "../../../agency/tool.ts";
import { piAgencyPorts } from "./ports.ts";

/** Execute the codewiki_agency tool. */
export async function executeCodewikiAgency(
	project: WikiProject,
	ctx: ExtensionContext,
	input: AgencyToolInput,
): Promise<{
	summary: string;
	mode: string;
	budget: Record<string, unknown>;
	cycles: Array<Record<string, unknown>>;
	stop: Record<string, unknown>;
	policy: Record<string, unknown>;
	bounded_context: Record<string, unknown>;
}> {
	return executeCodewikiAgencyTool(project, input, piAgencyPorts(ctx)) as any;
}
