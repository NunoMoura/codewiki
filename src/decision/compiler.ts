import type { TraceEvent } from "../traces/types.ts";
import { evaluateDecisionGate, type DecisionGateResult } from "./gate.ts";
import { approvedDecisionRows, createDecisionTable } from "./table.ts";
import type { DecisionRow, DecisionTable, DecisionTableInput } from "./types.ts";

export interface DecisionCompileInput {
	traceId: string;
	table?: DecisionTable;
	tableInput?: DecisionTableInput;
	parentId?: string | null;
	startSequence?: number;
	createdAt?: string;
}

export interface DecisionCompileResult {
	table: DecisionTable;
	gate: DecisionGateResult;
	approvedRows: DecisionRow[];
	traceEvents: TraceEvent[];
	readyForPlanning: boolean;
}

export function compileDecision(input: DecisionCompileInput): DecisionCompileResult {
	const table = input.table ?? createDecisionTable(input.tableInput ?? {});
	const gate = evaluateDecisionGate(table);
	const approvedRows = approvedDecisionRows(table);
	const traceEvents = approvedRows.map((row, index) =>
		decisionRowTraceEvent({
			row,
			traceId: input.traceId,
			parentId: input.parentId ?? null,
			sequence: (input.startSequence ?? 1) + index,
			createdAt: input.createdAt || table.updatedAt,
		}),
	);
	return {
		table,
		gate,
		approvedRows,
		traceEvents,
		readyForPlanning: gate.passed,
	};
}

function decisionRowTraceEvent(input: {
	row: DecisionRow;
	traceId: string;
	parentId: string | null;
	sequence: number;
	createdAt: string;
}): TraceEvent {
	return {
		type: "trace_event",
		id: `${input.traceId}:decision:${input.row.id}`,
		parentId: input.parentId,
		traceId: input.traceId,
		sequence: input.sequence,
		loop: "decision",
		event: "decision.row.approved",
		refs: [...input.row.sourceRefs, ...input.row.proofRefs],
		createdAt: input.createdAt,
		data: {
			rowId: input.row.id,
			question: input.row.question,
			currentState: input.row.currentState,
			desiredState: input.row.desiredState,
			rationale: input.row.rationale,
			affectedLayers: input.row.affectedLayers,
			risk: input.row.risk,
			changeType: input.row.changeType,
			noKbImpactReason: input.row.noKbImpactReason,
		},
	};
}
