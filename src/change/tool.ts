import type { WikiProject } from "../project/types.ts";
import {
	executeDiffTableAction,
	type CodewikiDiffTableRowActionInput,
	type CodewikiDiffTableToolInput,
} from "./diff-table.ts";

export interface CodewikiDecisionWorkflowToolInput {
	action: "rows";
	table_id: string;
	row_actions: CodewikiDiffTableRowActionInput[];
	summary?: string;
	source?: string;
}

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

export async function executeCodewikiDecisionTool(
	project: WikiProject,
	input: CodewikiDecisionWorkflowToolInput,
) {
	const result = await executeDiffTableAction(project, {
		action: "accept",
		table_id: input.table_id,
		row_actions: input.row_actions,
		summary: input.summary,
		source: input.source,
	});
	return {
		summary: `codewiki decide: ${input.action}`,
		result,
	};
}
