import type { AgencyScope } from "../agency/types.ts";
import type {
	CodewikiIsolationRequirementInput,
	TaskSessionAction,
	TaskSessionLinkInput,
	TaskSessionLinkRecord,
	WorkflowCursor,
	WorkflowLoop,
} from "./types.ts";
import { nowIso, unique } from "../shared/utils.ts";

const TASK_SESSION_LINK_CUSTOM_TYPE = "codewiki.task-link";

export function normalizeTaskSessionLinkInput(
	input: TaskSessionLinkInput,
): TaskSessionLinkRecord {
	return {
		taskId: input.taskId,
		action: normalizeTaskSessionAction(input.action),
		summary: typeof input.summary === "string" ? input.summary : "",
		filesTouched: unique(input.filesTouched ?? []),
		spawnedTaskIds: unique(input.spawnedTaskIds ?? []),
		...(input.cursor ? { cursor: normalizeWorkflowCursor(input.cursor) } : {}),
		timestamp: nowIso(),
	};
}

export function normalizeAgencyScope(scope: unknown): AgencyScope | undefined {
	const value = scope as { kind?: string; id?: string } | null | undefined;
	const kind = String(value?.kind || "").trim();
	if (kind !== "roadmap" && kind !== "sprint" && kind !== "task") return undefined;
	const id = String(value?.id || "").trim();
	return { kind, ...(id ? { id } : {}) };
}

export function normalizeWorkflowCursor(cursor: unknown): WorkflowCursor | undefined {
	const value = cursor as Record<string, unknown> | null | undefined;
	const activeLoop = String(value?.active_loop || "").trim();
	if (!isWorkflowLoop(activeLoop)) return undefined;
	const scope = normalizeAgencyScope(value?.scope);
	const isolation = normalizeIsolationRequirement(value?.isolation);
	return {
		active_loop: activeLoop,
		...(typeof value?.reason === "string" && value.reason.trim() ? { reason: value.reason.trim() } : {}),
		input_refs: Array.isArray(value?.input_refs) ? unique(value.input_refs.map(String).map((v) => v.trim()).filter(Boolean)) : [],
		...(typeof value?.expected_output === "string" && value.expected_output.trim() ? { expected_output: value.expected_output.trim() } : {}),
		...(typeof value?.exit_gate === "string" && value.exit_gate.trim() ? { exit_gate: value.exit_gate.trim() } : {}),
		...(scope ? { scope } : {}),
		...(isolation ? { isolation } : {}),
		...(typeof value?.context_boundary === "string" && value.context_boundary.trim() ? { context_boundary: value.context_boundary.trim() } : {}),
		handoff_refs: Array.isArray(value?.handoff_refs) ? unique(value.handoff_refs.map(String).map((v) => v.trim()).filter(Boolean)) : [],
	};
}

function normalizeIsolationRequirement(value: unknown): CodewikiIsolationRequirementInput | undefined {
	const record = value as Record<string, unknown> | null | undefined;
	if (!record || typeof record !== "object") return undefined;
	const out: CodewikiIsolationRequirementInput = {};
	if (typeof record.required === "boolean") out.required = record.required;
	for (const key of ["mode", "reason", "handoff"] as const) {
		const text = String(record[key] || "").trim();
		if (text) out[key] = text;
	}
	for (const key of ["evidence", "profiles"] as const) {
		const values = Array.isArray(record[key]) ? unique(record[key].map(String).map((v) => v.trim()).filter(Boolean)) : [];
		if (values.length) out[key] = values;
	}
	return Object.keys(out).length ? out : undefined;
}

function isWorkflowLoop(value: string): value is WorkflowLoop {
	return value === "decision" || value === "planning" || value === "implementation" || value === "validation" || value === "observe";
}

export function normalizeTaskSessionAction(
	action: string | undefined,
): TaskSessionAction {
	const a = (action || "focus").trim();
	return a === "focus" ||
		a === "progress" ||
		a === "blocked" ||
		a === "done" ||
		a === "spawn" ||
		a === "note" ||
		a === "clear"
		? a
		: "focus";
}

export function findLatestTaskSessionLink(
	entries: unknown[] | null | undefined,
): TaskSessionLinkRecord | null {
	if (!Array.isArray(entries) || entries.length === 0) return null;
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const parsed = parseTaskSessionLinkEntry(entries[index]);
		if (parsed) return parsed;
	}
	return null;
}

export function parseTaskSessionLinkEntry(
	entry: unknown,
): TaskSessionLinkRecord | null {
	const value = entry as {
		type?: string;
		customType?: string;
		timestamp?: string;
		data?: {
			taskId?: string;
			action?: string;
			summary?: string;
			filesTouched?: string[];
			spawnedTaskIds?: string[];
			cursor?: unknown;
		};
	};
	if (
		value?.type !== "custom" ||
		value.customType !== TASK_SESSION_LINK_CUSTOM_TYPE ||
		!value.data?.taskId
	) {
		return null;
	}
	try {
		return {
			taskId: String(value.data.taskId),
			action: normalizeTaskSessionAction(value.data.action),
			summary: typeof value.data.summary === "string" ? value.data.summary : "",
			filesTouched: Array.isArray(value.data.filesTouched)
				? unique(value.data.filesTouched)
				: [],
			spawnedTaskIds: Array.isArray(value.data.spawnedTaskIds)
				? unique(value.data.spawnedTaskIds)
				: [],
			...(normalizeWorkflowCursor(value.data.cursor) ? { cursor: normalizeWorkflowCursor(value.data.cursor) } : {}),
			timestamp:
				typeof value.timestamp === "string" ? value.timestamp : nowIso(),
		};
	} catch {
		return null;
	}
}
