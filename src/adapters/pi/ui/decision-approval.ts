import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { WikiProject } from "../../../project/types.ts";
import {
	executeDecisionTableAction,
	type CodewikiDecisionTableToolInput,
} from "../../../change/decision-table.ts";
import { truncatePlain } from "./text.ts";

export type DecisionApprovalAction = "approve" | "reject" | "defer" | "edit";

export interface DecisionApprovalRow {
	kind: "decision-row";
	tableId: string;
	rowId: string;
	status: string;
	lifecycleStatus: string;
	current: string;
	currentProjectState: string;
	desired: string;
	agreedChange: string;
	expectedFinalState: string;
	validatedFinalState: string;
	rationale: string;
	affectedLayers: string[];
	risk: string;
	source: string;
	alternatives: string[];
	proofRefs: string[];
	readOnly: boolean;
	buildEligible: boolean;
	actionEvidence: string;
}

export interface DecisionApprovalModel {
	kind: "decision-approval";
	summary: string;
	rows: DecisionApprovalRow[];
	pendingCount: number;
	approvedRowIds: string[];
	decisionBuildEligible: boolean;
	fallbackInstruction: string;
}

export interface DecisionApprovalActionResult {
	changed: boolean;
	tableId: string;
	rowId: string;
	userAction: string;
	evidence: {
		capability: "codewiki.decision_table";
		action: CodewikiDecisionTableToolInput["action"];
		table_id: string;
		row_id: string;
		alternative?: string;
	};
}

export interface TaskCandidateApprovalInput {
	id: string;
	title: string;
	summary: string;
	kind?: string;
	priority?: string;
	sprint_id?: string;
	status?: "pending" | "approved" | "rejected" | "deferred";
	code_paths?: string[];
	spec_paths?: string[];
}

export interface TaskCandidateApprovalModel {
	kind: "task-candidate-approval";
	candidates: Array<
		TaskCandidateApprovalInput & {
			buildEligible: boolean;
			fallbackInstruction: string;
		}
	>;
	fallbackInstruction: string;
	toolContract: "wiki_roadmap";
}

export function readDecisionApprovalModel(
	project: WikiProject,
): DecisionApprovalModel {
	const rows = readRuntimeApprovalRows(project);
	if (rows.length === 0) rows.push(...readDecisionBuildRows(project));
	const pendingCount = rows.filter(
		(row) => row.status === "pending" || row.status === "edited",
	).length;
	const approvedRowIds = rows
		.filter((row) => row.status === "approved")
		.map((row) => row.rowId);
	return {
		kind: "decision-approval",
		summary: rows.some((row) => !row.readOnly)
			? "Pending decision approval rows"
			: "Latest accepted decision rows (read-only)",
		rows,
		pendingCount,
		approvedRowIds,
		decisionBuildEligible: approvedRowIds.length > 0 && pendingCount === 0,
		fallbackInstruction: buildDecisionFallbackInstruction(rows),
	};
}

export async function applyDecisionApprovalAction(
	project: WikiProject,
	input: {
		tableId: string;
		rowId: string;
		action: DecisionApprovalAction;
		alternative?: string;
	},
): Promise<DecisionApprovalActionResult> {
	const toolAction = decisionTableActionForApproval(input.action);
	if (toolAction === "alternative" && !input.alternative?.trim()) {
		throw new Error(
			"Decision row edit requires alternative desired state text.",
		);
	}
	await executeDecisionTableAction(project, {
		action: toolAction,
		table_id: input.tableId,
		row_id: input.rowId,
		...(input.alternative?.trim()
			? { alternative: input.alternative.trim() }
			: {}),
	});
	return {
		changed: true,
		tableId: input.tableId,
		rowId: input.rowId,
		userAction: userActionForApproval(input.action),
		evidence: {
			capability: "codewiki.decision_table",
			action: toolAction,
			table_id: input.tableId,
			row_id: input.rowId,
			...(input.alternative?.trim()
				? { alternative: input.alternative.trim() }
				: {}),
		},
	};
}

export function renderDecisionApprovalCards(
	model: DecisionApprovalModel,
	width = 80,
): string[] {
	if (model.rows.length === 0) return ["No pending decision approvals."];
	const body = [
		model.summary,
		`approved=${model.approvedRowIds.length} pending=${model.pendingCount} build=${model.decisionBuildEligible ? "eligible" : "blocked"}`,
		"actions: a approve · x reject · d defer · p edit/alternative",
	];
	for (const row of model.rows) {
		body.push(
			`[${row.status}${row.readOnly ? "/ro" : ""}] ${row.tableId}/${row.rowId} risk=${row.risk} layers=${row.affectedLayers.join(",") || "—"}`,
		);
		body.push(
			`  current: ${truncatePlain(row.current, Math.max(16, width - 13))}`,
		);
		body.push(
			`  desired: ${truncatePlain(row.desired, Math.max(16, width - 13))}`,
		);
		if (row.expectedFinalState && row.expectedFinalState !== row.desired)
			body.push(
				`  expected: ${truncatePlain(row.expectedFinalState, Math.max(16, width - 14))}`,
			);
		if (row.validatedFinalState)
			body.push(
				`  validated: ${truncatePlain(row.validatedFinalState, Math.max(16, width - 15))}`,
			);
		if (row.proofRefs.length)
			body.push(
				`  evidence: ${truncatePlain(row.proofRefs.join(", "), Math.max(16, width - 12))}`,
			);
		if (row.alternatives.length)
			body.push(
				`  alternatives: ${truncatePlain(row.alternatives.join(" | "), Math.max(16, width - 18))}`,
			);
	}
	return body;
}

export function buildTaskCandidateApprovalModel(
	candidates: TaskCandidateApprovalInput[],
): TaskCandidateApprovalModel {
	const normalized = candidates.map((candidate) => {
		const status = candidate.status || "pending";
		return {
			...candidate,
			status,
			buildEligible: status === "approved",
			fallbackInstruction: `Type APPROVE ${candidate.id} to allow wiki_roadmap mutation, or DEFER ${candidate.id} with reason.`,
		};
	});
	return {
		kind: "task-candidate-approval",
		candidates: normalized,
		fallbackInstruction: normalized.length
			? normalized.map((candidate) => candidate.fallbackInstruction).join("\n")
			: "No task candidates pending approval.",
		toolContract: "wiki_roadmap",
	};
}

export function renderTaskCandidateApprovalCards(
	model: TaskCandidateApprovalModel,
	width = 80,
): string[] {
	if (model.candidates.length === 0)
		return ["No task candidates pending approval."];
	const lines = [
		"Task/sprint candidates pending approval",
		"actions: typed APPROVE/DEFER/REJECT fallback before wiki_roadmap mutation",
	];
	for (const candidate of model.candidates) {
		lines.push(
			`[${candidate.status}] ${candidate.id} ${candidate.priority || "medium"}/${candidate.kind || "task"}${candidate.sprint_id ? ` sprint=${candidate.sprint_id}` : ""}${candidate.buildEligible ? " ✓" : ""}`,
		);
		lines.push(`  ${truncatePlain(candidate.title, Math.max(16, width - 4))}`);
		lines.push(
			`  ${truncatePlain(candidate.summary, Math.max(16, width - 4))}`,
		);
	}
	return lines;
}

function readRuntimeApprovalRows(project: WikiProject): DecisionApprovalRow[] {
	const runtime = readJson(
		resolve(project.root, ".codewiki/runtime/decision-tables.json"),
	);
	const rows: DecisionApprovalRow[] = [];
	for (const table of Array.isArray(runtime?.tables) ? runtime.tables : []) {
		if (String(table.status || "pending") !== "pending") continue;
		for (const row of Array.isArray(table.rows) ? table.rows : []) {
			rows.push(toApprovalRow(table, row, false));
		}
	}
	return rows;
}

function readDecisionBuildRows(project: WikiProject): DecisionApprovalRow[] {
	const decisionDir = resolve(project.root, ".codewiki/builds/decision");
	if (!existsSync(decisionDir)) return [];
	const rows: DecisionApprovalRow[] = [];
	for (const file of readdirSync(decisionDir)
		.filter((name) => name.endsWith(".json"))
		.sort()
		.reverse()
		.slice(0, 3)) {
		const build = readJson(resolve(decisionDir, file));
		for (const row of Array.isArray(build?.decision_table?.rows)
			? build.decision_table.rows
			: []) {
			rows.push(
				toApprovalRow({ id: file, summary: build?.summary || file }, row, true),
			);
		}
	}
	return rows;
}

function toApprovalRow(
	table: any,
	row: any,
	readOnly: boolean,
): DecisionApprovalRow {
	const status =
		String(row.approval?.status || row.user_action || "pending").trim() ||
		"pending";
	const tableId = String(table.id || "").trim();
	const rowId = String(row.id || "").trim();
	return {
		kind: "decision-row",
		tableId,
		rowId,
		status,
		lifecycleStatus: String(row.status || status).trim() || status,
		current: String(
			row.state_delta?.current ||
				row.current_state ||
				row.current_project_state ||
				"",
		).trim(),
		currentProjectState: String(
			row.state_delta?.current ||
				row.current_project_state ||
				row.current_state ||
				"",
		).trim(),
		desired: String(
			row.state_delta?.desired ||
				row.desired_state ||
				row.expected_final_state ||
				row.agreed_change ||
				"",
		).trim(),
		agreedChange: String(
			row.proposed_change || row.agreed_change || row.desired_state || "",
		).trim(),
		expectedFinalState: String(
			row.expected_outcome ||
				row.expected_final_state ||
				row.desired_state ||
				"",
		).trim(),
		validatedFinalState: String(
			row.validated_outcome || row.validated_final_state || "",
		).trim(),
		rationale: String(row.rationale || "").trim(),
		affectedLayers: [
			...stringList(row.impact?.product),
			...stringList(row.impact?.system),
			...stringList(row.impact?.source),
			...stringList(row.impact?.tests),
			...stringList(row.impact?.docs),
		],
		risk: String(row.risk?.level || row.risk || "medium").trim(),
		source: String(table.summary || table.id || "pending").trim(),
		alternatives: Array.isArray(row.options)
			? row.options
					.map((option: any) => String(option.label || "").trim())
					.filter(Boolean)
			: stringList(row.alternatives),
		proofRefs: Array.isArray(row.evidence_refs)
			? row.evidence_refs
					.map((ref: any) => String(ref.ref || ref || "").trim())
					.filter(Boolean)
			: stringList(row.proof_refs),
		readOnly,
		buildEligible: !readOnly && status === "approved",
		actionEvidence: `wiki_decision_table ${status} ${tableId}/${rowId}`,
	};
}

function stringList(values: unknown): string[] {
	return Array.isArray(values)
		? Array.from(
				new Set(
					values
						.map(String)
						.map((value) => value.trim())
						.filter(Boolean),
				),
			)
		: [];
}

function decisionTableActionForApproval(
	action: DecisionApprovalAction,
): CodewikiDecisionTableToolInput["action"] {
	if (action === "approve") return "accept";
	if (action === "reject") return "reject";
	if (action === "defer") return "defer";
	return "alternative";
}

function userActionForApproval(action: DecisionApprovalAction): string {
	if (action === "approve") return "approved";
	if (action === "reject") return "rejected";
	if (action === "defer") return "deferred";
	return "edited";
}

function buildDecisionFallbackInstruction(rows: DecisionApprovalRow[]): string {
	const editable = rows.filter((row) => !row.readOnly);
	if (editable.length === 0)
		return "No editable decision rows. Use typed approval in chat if adapter UI is unavailable.";
	return editable
		.map(
			(row) =>
				`Type APPROVE ${row.tableId}/${row.rowId}, REJECT ${row.tableId}/${row.rowId}, DEFER ${row.tableId}/${row.rowId}, or EDIT ${row.tableId}/${row.rowId}: <alternative>.`,
		)
		.join("\n");
}

function readJson(path: string): any {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}
