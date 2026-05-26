import type { WikiProject } from "../project/types.ts";
import { executeDiffTableAction, type CodewikiDiffTableToolInput } from "./diff-table.ts";

export async function executeCodewikiDiffTableTool(
	project: WikiProject,
	input: CodewikiDiffTableToolInput,
) {
	const result = await executeDiffTableAction(project, input);
	return {
		summary: `codewiki diff_table: ${input.action}`,
		result,
	};
}
