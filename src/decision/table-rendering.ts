import { createHash } from "node:crypto";
import type { DecisionRow, DecisionTable } from "./types.ts";

export interface RenderDecisionTableMarkdownOptions {
	includeSourceRefs?: boolean;
}

export function renderDecisionTableMarkdown(
	table: DecisionTable,
	options: RenderDecisionTableMarkdownOptions = {},
): string {
	const lines = [
		`# Decision table: ${escapeMarkdownText(table.id)}`,
		"",
		`Summary: ${escapeMarkdownText(table.summary || "Decision table")}`,
		`Created: ${escapeMarkdownText(table.createdAt)}`,
		`Updated: ${escapeMarkdownText(table.updatedAt)}`,
	];
	if (options.includeSourceRefs !== false && table.sourceRefs.length) {
		lines.push("", "Source refs:");
		for (const ref of table.sourceRefs) lines.push(`- ${escapeMarkdownText(ref)}`);
	}
	lines.push(
		"",
		"| Row ID | Decision | Kind | Approval | Risk | Work scale | Route | Current state | Desired state | Success signal |",
		"|---|---|---|---|---|---|---|---|---|---|",
		...table.rows.map(renderDecisionTableRow),
		"",
	);
	return `${lines.join("\n").trimEnd()}\n`;
}

export function decisionTableMarkdownDigest(markdown: string): string {
	return `sha256:${createHash("sha256").update(markdown).digest("hex")}`;
}

function renderDecisionTableRow(row: DecisionRow): string {
	return [
		row.id,
		row.question,
		row.decisionType || row.decisionKind,
		row.approval,
		row.risk,
		row.workScale,
		row.routeTarget,
		row.currentState,
		row.desiredState,
		row.successSignal || row.desiredOutcome || row.recommendationRationale,
	]
		.map(markdownCell)
		.join(" | ")
		.replace(/^/, "| ")
		.replace(/$/, " |");
}

function markdownCell(value: unknown): string {
	return escapeMarkdownText(String(value ?? "").trim() || "—");
}

function escapeMarkdownText(value: string): string {
	return value.replace(/\s+/g, " ").replace(/\|/g, "\\|");
}
