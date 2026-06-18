import type { CodewikiRenderComponent, CodewikiToolResult } from "../types.ts";

interface RenderOptions {
	expanded?: boolean;
	isPartial?: boolean;
}

const TOOL_TITLES: Record<string, string> = {
	wiki_state: "CodeWiki State",
	wiki_config: "CodeWiki Config",
	wiki_decide: "CodeWiki Decision",
	wiki_plan: "CodeWiki Planning",
	wiki_implement: "CodeWiki Implementation",
	wiki_runtime: "CodeWiki Runtime",
	wiki_archive: "CodeWiki Archive",
};

export function renderCodewikiToolCall(
	toolName: string,
	args: unknown,
): CodewikiRenderComponent {
	const input = inputRecord(args);
	return linesComponent([
		`${toolTitle(toolName)} ${modeBadge(input.mode)} ${traceLabel(input.traceId)}`.trim(),
	]);
}

export function renderCodewikiToolResult(
	toolName: string,
	result: CodewikiToolResult,
	options: RenderOptions = {},
): CodewikiRenderComponent {
	if (options.isPartial) return linesComponent([`${toolTitle(toolName)} …`]);
	const payload = result.details.result;
	if (toolName === "wiki_decide") return renderDecision(payload, options);
	if (toolName === "wiki_plan") return renderPlan(payload, options);
	if (toolName === "wiki_implement")
		return renderImplementation(payload, options);
	if (toolName === "wiki_runtime") return renderRuntime(payload, options);
	if (toolName === "wiki_state") return renderState(payload, options);
	if (toolName === "wiki_config") return renderConfig(payload, options);
	if (toolName === "wiki_archive") return renderArchive(payload, options);
	return linesComponent([textContent(result)]);
}

function renderDecision(
	payload: unknown,
	options: RenderOptions,
): CodewikiRenderComponent {
	const result = record(payload);
	const loopResult = record(result.loopResult);
	const table = record(loopResult.table);
	const rows = arrayOfRecords(table.rows);
	const quality = qualityRows(record(loopResult.exit).qualityStandards);
	const decisionTable = decisionKindTable(rows, qualityVerdict(quality));
	return linesComponent([
		`${toolTitle("wiki_decide")} ${modeBadge(result.mode)}`,
		"",
		...tableLines(decisionTable.headers, decisionTable.rows),
		...agentJudgementLines(rows, options),
		...qualityFooter(quality, options),
	]);
}

function decisionKindTable(
	rows: Record<string, unknown>[],
	quality: string,
): { headers: string[]; rows: string[][] } {
	const kind = dominantDecisionKind(rows);
	if (kind === "debug") {
		return {
			headers: ["Row", "Kind", "Target", "Hypothesis", "Probe", "Quality"],
			rows: rows.map((row) => [
				stringValue(row.id, "row"),
				stringValue(row.decisionKind, "—"),
				arrayOfStrings(row.targetRefs).join(", ") || "—",
				stringValue(row.hypothesis, "—"),
				stringValue(row.probe, "—"),
				quality,
			]),
		};
	}
	if (kind === "fix") {
		return {
			headers: ["Row", "Kind", "Repro", "Expected", "Regression", "Quality"],
			rows: rows.map((row) => [
				stringValue(row.id, "row"),
				stringValue(row.decisionKind, "—"),
				stringValue(row.reproduction, "—"),
				stringValue(row.expectedBehavior, "—"),
				stringValue(row.regressionPlan, "—"),
				quality,
			]),
		};
	}
	if (kind === "harden") {
		return {
			headers: [
				"Row",
				"Kind",
				"Boundary",
				"Failure modes",
				"Negative tests",
				"Quality",
			],
			rows: rows.map((row) => [
				stringValue(row.id, "row"),
				stringValue(row.decisionKind, "—"),
				stringValue(row.safetyBoundary, "—"),
				arrayOfStrings(row.failureModes).join(", ") || "—",
				stringValue(row.negativeTestPlan, "—"),
				quality,
			]),
		};
	}
	if (kind === "improve") {
		return {
			headers: ["Row", "Kind", "Pain", "Outcome", "Success", "Quality"],
			rows: rows.map((row) => [
				stringValue(row.id, "row"),
				stringValue(row.decisionKind, "—"),
				stringValue(row.currentPain, "—"),
				stringValue(row.desiredOutcome, "—"),
				stringValue(row.successSignal, "—"),
				quality,
			]),
		};
	}
	if (kind === "migrate") {
		return {
			headers: ["Row", "Kind", "Source", "Target", "Proof", "Quality"],
			rows: rows.map((row) => [
				stringValue(row.id, "row"),
				stringValue(row.decisionKind, "—"),
				stringValue(row.sourceBehavior, "—"),
				stringValue(row.targetBehavior, "—"),
				stringValue(row.equivalenceProof, "—"),
				quality,
			]),
		};
	}
	return {
		headers: ["Row", "Kind", "Current state", "Desired state", "Quality"],
		rows: rows.map((row) => [
			stringValue(row.id, "row"),
			stringValue(row.decisionKind, "—"),
			stringValue(row.currentState, "—"),
			stringValue(row.desiredState, "—"),
			quality,
		]),
	};
}

function dominantDecisionKind(rows: Record<string, unknown>[]): string {
	const kinds = unique(
		rows.map((row) => stringValue(row.decisionKind, "")).filter(Boolean),
	);
	return kinds.length === 1 ? kinds[0] : "mixed";
}

function renderPlan(
	payload: unknown,
	options: RenderOptions,
): CodewikiRenderComponent {
	const result = record(payload);
	const loopResult = record(result.loopResult);
	const workItems = arrayOfRecords(loopResult.workItems);
	const resolutions = arrayOfRecords(loopResult.resolutions);
	const quality = qualityRows(record(loopResult.exit).qualityStandards);
	return linesComponent([
		`${toolTitle("wiki_plan")} ${modeBadge(result.mode)}`,
		"",
		"Work units",
		...tableLines(
			["Work", "Outcome", "Paths"],
			workItems.map((item) => [
				workItemLabel(item),
				stringValue(item.outcome, "—"),
				arrayOfStrings(item.pathScopes).join(", ") || "—",
			]),
		),
		...resolutionLines(resolutions),
		...qualityFooter(quality, options),
	]);
}

function renderImplementation(
	payload: unknown,
	options: RenderOptions,
): CodewikiRenderComponent {
	const result = record(payload);
	const loopResult = record(result.loopResult);
	const changes = arrayOfRecords(loopResult.changes);
	const quality = qualityRows(record(loopResult.exit).qualityStandards);
	return linesComponent([
		`${toolTitle("wiki_implement")} ${modeBadge(result.mode)}`,
		"",
		...tableLines(
			["Work", "Code", "Tests", "Publish"],
			changes.map((change) => [
				stringValue(change.workUnitId, stringValue(change.id, "change")),
				pathBadge(change.codePaths, change.docPaths),
				pathBadge(change.testPaths, change.checkResults),
				publishBadge(change),
			]),
		),
		...changedPathLines(changes, options),
		...qualityFooter(quality, options),
	]);
}

function renderRuntime(
	payload: unknown,
	options: RenderOptions,
): CodewikiRenderComponent {
	const result = record(payload);
	const plan = record(result.plan);
	const dispatch = arrayOfRecords(plan.dispatch);
	const policy = record(result.policy);
	const worktrees = arrayOfRecords(policy.worktrees);
	const blockers = arrayOfStrings(policy.blockers);
	return linesComponent([
		`${toolTitle("wiki_runtime")} ${modeBadge(result.mode)}`,
		"",
		...boardTable({ todo: [], doing: dispatch.map(dispatchLabel), done: [] }),
		...runtimeWorktreeLines(worktrees, options),
		...qualityFooter(
			blockers.length
				? blockers.map((blocker) => ({ id: blocker, status: "blocked" }))
				: [{ id: "runtime_dispatch_policy", status: "met" }],
			options,
		),
	]);
}

function renderState(
	payload: unknown,
	_options: RenderOptions,
): CodewikiRenderComponent {
	const wrapped = record(payload);
	const view = stringValue(wrapped.view, "all");
	const data = wrapped.data === undefined ? wrapped : record(wrapped.data);
	if (view === "quality") return renderStateQuality(data, view);
	if (view === "blockers") return renderStateBlockers(data, view);
	const summary =
		view === "summary"
			? record(data.workQueueSummary)
			: record(record(data.workQueue).summary);
	const traceIds =
		view === "summary"
			? arrayOfStrings(data.traceIds)
			: arrayOfStrings(data.traceIds || wrapped.traceIds);
	return linesComponent([
		stateTitle(view),
		"",
		...tableLines(
			["Traces", "Ready", "Blocked", "Done"],
			[
				[
					String(traceIds.length),
					String(numberValue(summary.ready)),
					String(numberValue(summary.blocked)),
					String(numberValue(summary.done)),
				],
			],
		),
	]);
}

function renderStateQuality(
	quality: Record<string, unknown>,
	view: string,
): CodewikiRenderComponent {
	const summary = record(quality.summary);
	return linesComponent([
		stateTitle(view),
		"",
		...tableLines(
			["Loop", "Met", "Unmet", "Blocked"],
			(["decision", "planning", "implementation"] as const).map((loop) => {
				const item = record(summary[loop]);
				return [
					loop,
					String(numberValue(item.met)),
					String(numberValue(item.unmet) + numberValue(item.missing)),
					String(numberValue(item.blocked)),
				];
			}),
		),
	]);
}

function renderStateBlockers(
	blockersView: Record<string, unknown>,
	view: string,
): CodewikiRenderComponent {
	const blockers = arrayOfRecords(blockersView.blockers);
	return linesComponent([
		stateTitle(view),
		"",
		...tableLines(
			["Blockers", "First"],
			[[String(blockers.length), stringValue(blockers[0]?.message, "none")]],
		),
	]);
}

function renderConfig(
	payload: unknown,
	_options: RenderOptions,
): CodewikiRenderComponent {
	const result = record(payload);
	const config = record(result.config);
	return linesComponent([
		toolTitle("wiki_config"),
		"",
		...tableLines(
			["Project", "Mode", "Written"],
			[
				[
					stringValue(config.project, "codewiki"),
					stringValue(record(config.automation).mode, "manual"),
					result.written === true ? "✓ yes" : "— no",
				],
			],
		),
	]);
}

function renderArchive(
	payload: unknown,
	_options: RenderOptions,
): CodewikiRenderComponent {
	const result = record(payload);
	const stub = record(result.stub);
	return linesComponent([
		`${toolTitle("wiki_archive")} ${modeBadge(result.mode)}`,
		"",
		...tableLines(
			["Trace", "Restore ref", "Applied"],
			[
				[
					stringValue(stub.traceId, stringValue(result.traceId, "—")),
					stringValue(
						stub.gitRestoreRef,
						stringValue(result.gitRestoreRef, "—"),
					),
					result.append ? "✓ yes" : "— preview",
				],
			],
		),
		...archiveReasonLines(result, stub),
	]);
}

function resolutionLines(resolutions: Record<string, unknown>[]): string[] {
	if (resolutions.length === 0) return [];
	return [
		"",
		"Resolutions",
		...tableLines(
			["Decision", "Kind", "Evidence"],
			resolutions.map((resolution) => [
				stringValue(resolution.decisionRef, "decision"),
				stringValue(resolution.kind, "—"),
				arrayOfStrings(resolution.evidenceRefs).join(", ") || "—",
			]),
		),
	];
}

function archiveReasonLines(
	result: Record<string, unknown>,
	stub: Record<string, unknown>,
): string[] {
	const closeRecord = record(result.closeRecord);
	const reason = stringValue(
		closeRecord.reason,
		stringValue(stub.closeReason, ""),
	);
	return reason ? ["", "Reason", `• ${reason}`] : [];
}

function runtimeWorktreeLines(
	worktrees: Record<string, unknown>[],
	options: RenderOptions,
): string[] {
	const required = worktrees.filter((plan) => plan.required === true);
	if (required.length === 0) return [];
	return [
		"",
		"Worktrees",
		...tableLines(
			["Work", "Reason", "Branch"],
			required.map((plan) => {
				const worktree = record(plan.worktree);
				return [
					stringValue(plan.workUnitId, "work"),
					stringValue(plan.reason, "required"),
					stringValue(worktree.branch, "—"),
				];
			}),
		),
		...runtimeWorktreeCommandLines(required, options),
	];
}

function runtimeWorktreeCommandLines(
	worktrees: Record<string, unknown>[],
	options: RenderOptions,
): string[] {
	if (!options.expanded) return [];
	const commands = unique(
		worktrees.flatMap((plan) => {
			const commands = record(plan.commands);
			return [
				...arrayOfStrings(commands.worktreePrepare),
				...arrayOfStrings(commands.worktreeCleanup),
			];
		}),
	);
	return commands.length
		? ["", "Dry-run commands", ...commands.map((command) => `• ${command}`)]
		: [];
}

function boardTable(columns: {
	todo: string[];
	doing: string[];
	done: string[];
}): string[] {
	const height = Math.max(
		1,
		columns.todo.length,
		columns.doing.length,
		columns.done.length,
	);
	const rows = Array.from({ length: height }, (_, index) => [
		columns.todo[index] || "",
		columns.doing[index] || "",
		columns.done[index] || "",
	]);
	return tableLines(["To do", "Doing", "Done"], rows);
}

function tableLines(headers: string[], rows: string[][]): string[] {
	const safeRows = rows.length ? rows : [headers.map(() => "—")];
	const widths = headers.map((header, index) =>
		Math.min(
			32,
			Math.max(
				visibleLength(header),
				...safeRows.map((row) => visibleLength(row[index] || "")),
			),
		),
	);
	return [
		border("┌", "┬", "┐", widths),
		rowLine(headers, widths),
		border("├", "┼", "┤", widths),
		...safeRows.map((row) => rowLine(row, widths)),
		border("└", "┴", "┘", widths),
	];
}

function border(left: string, join: string, right: string, widths: number[]) {
	return `${left}${widths.map((width) => "─".repeat(width + 2)).join(join)}${right}`;
}

function rowLine(row: string[], widths: number[]): string {
	return `│ ${widths
		.map((width, index) => padCell(row[index] || "", width))
		.join(" │ ")} │`;
}

function padCell(value: string, width: number): string {
	const text = truncate(value, width);
	return text + " ".repeat(Math.max(0, width - visibleLength(text)));
}

function qualityFooter(
	quality: Array<{ id: string; status: string }>,
	options: RenderOptions,
): string[] {
	const visible = options.expanded ? quality : quality.slice(0, 6);
	return [
		"",
		"Quality",
		...visible.map((item) => `${statusBadge(item.status)} ${item.id}`),
		...(quality.length > visible.length
			? [`… ${quality.length - visible.length} more`]
			: []),
	];
}

function agentJudgementLines(
	rows: Record<string, unknown>[],
	options: RenderOptions,
): string[] {
	if (!options.expanded) return [];
	return rows.flatMap((row) => {
		const assessment = record(row.agentAssessment);
		const rationale = stringValue(row.recommendationRationale, "");
		const concerns = arrayOfStrings(assessment.concerns);
		return [
			"",
			"Agent judgement",
			...(rationale ? [`→ ${rationale}`] : []),
			...concerns.map((concern) => `⚠ ${concern}`),
		];
	});
}

function changedPathLines(
	changes: Record<string, unknown>[],
	options: RenderOptions,
): string[] {
	if (!options.expanded) return [];
	const paths = unique(
		changes.flatMap((change) => [
			...arrayOfStrings(change.codePaths),
			...arrayOfStrings(change.docPaths),
			...arrayOfStrings(change.testPaths),
		]),
	);
	return paths.length
		? ["", "Changed", ...paths.map((path) => `• ${path}`)]
		: [];
}

function qualityRows(value: unknown): Array<{ id: string; status: string }> {
	return arrayOfRecords(value).map((item) => ({
		id: stringValue(item.id, "quality"),
		status: stringValue(item.status, "unmet"),
	}));
}

function qualityVerdict(quality: Array<{ status: string }>): string {
	if (quality.some((item) => item.status === "blocked")) return "✗ block";
	if (quality.some((item) => item.status !== "met")) return "⚠ uncertain";
	return "✓ pass";
}

function statusBadge(status: string): string {
	if (status === "met" || status === "pass") return "✓";
	if (status === "blocked" || status === "block") return "✗";
	return "⚠";
}

function modeBadge(value: unknown): string {
	return value === "append" ? "◆ append" : "◇ preview";
}

function pathBadge(...values: unknown[]): string {
	return values.some((value) => arrayOfUnknown(value).length > 0) ? "✓" : "—";
}

function publishBadge(change: Record<string, unknown>): string {
	return arrayOfStrings(change.publicationRefs).length > 0 ? "✓" : "—";
}

function traceLabel(traceId: unknown): string {
	return typeof traceId === "string" && traceId.trim() ? traceId : "";
}

function workItemLabel(item: Record<string, unknown>): string {
	return `${stringValue(item.id, "work")} ${stringValue(item.title, "")}`.trim();
}

function dispatchLabel(item: Record<string, unknown>): string {
	return stringValue(item.workUnitId, stringValue(item.id, "work"));
}

function inputRecord(args: unknown): Record<string, unknown> {
	return record(record(args).input || args);
}

function textContent(result: CodewikiToolResult): string {
	return result.content
		.filter((item) => item.type === "text")
		.map((item) => item.text)
		.join("\n");
}

function linesComponent(lines: string[]): CodewikiRenderComponent {
	return {
		render(width: number) {
			return lines.map((line) => truncate(line, width));
		},
		invalidate() {},
	};
}

function toolTitle(toolName: string): string {
	return TOOL_TITLES[toolName] || toolName;
}

function stateTitle(view: string): string {
	return view && view !== "all"
		? `${toolTitle("wiki_state")} — ${view}`
		: toolTitle("wiki_state");
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? value.map(record).filter(hasKeys) : [];
}

function arrayOfStrings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function arrayOfUnknown(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function hasKeys(value: Record<string, unknown>): boolean {
	return Object.keys(value).length > 0;
}

function stringValue(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}

function truncate(value: string, width: number): string {
	if (width < 1) return "";
	if (visibleLength(value) <= width) return value;
	return `${value.slice(0, Math.max(0, width - 1))}…`;
}

function visibleLength(value: string): number {
	return value.length;
}
