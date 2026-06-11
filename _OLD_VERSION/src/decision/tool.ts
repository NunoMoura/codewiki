import type { WikiProject } from "../project/types.ts";
import {
	executeDecisionTableAction,
	type CodewikiDecisionTableRowActionInput,
	type CodewikiDecisionTableToolInput,
} from "./table.ts";

export interface CodewikiDecisionWorkflowToolInput {
	action: "rows";
	table_id: string;
	row_actions: CodewikiDecisionTableRowActionInput[];
	summary?: string;
	source?: string;
}

export async function executeCodewikiDecisionTableTool(
	project: WikiProject,
	input: CodewikiDecisionTableToolInput,
) {
	const result = await executeDecisionTableAction(project, input);
	return {
		summary: `codewiki decision_table: ${input.action}`,
		result,
	};
}

export async function executeCodewikiDecisionTool(
	project: WikiProject,
	input: CodewikiDecisionWorkflowToolInput,
) {
	const result = await executeDecisionTableAction(project, {
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
