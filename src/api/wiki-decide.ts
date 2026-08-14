import { createCodewikiApiError } from "../error-handling/api-errors.ts";
import {
	appendTraceRecords,
	type AppendTraceBatchResult,
} from "../traces/append.ts";
import { readTraceFileSnapshot } from "../traces/reader.ts";
import {
	assertRuntimeSemanticJobId,
	traceFilePath,
} from "../traces/schema.ts";
import type { LoopQualityStandardResult, TraceEvent } from "../traces/types.ts";
import {
	changeTraceEventId,
	changeTraceId,
	changeRecordFromTrace,
	createChangeRecordTraceEvent,
	type ChangeTraceOperation,
} from "../changes/change-trace.ts";
import { changeContentDigest } from "../changes/digest.ts";
import {
	acceptChangeRecord,
	transitionChangeStatus,
	type ChangeRecord,
} from "../changes/records.ts";
import { ChangeTraceStore } from "../changes/trace-store.ts";
import { evaluateChangeDecision } from "../decision/change-quality.ts";
import type {
	DecisionDisposition,
	RuntimeDecisionAuthority,
} from "../decision/candidate-proposal.ts";
import { buildProjectWorkState } from "../work-state/project.ts";
import type { WorkState } from "../work-state/types.ts";
import { join } from "node:path";

export type WikiDecideMode = "preview" | "append";

export interface RunWikiDecideInput {
	changeId: string;
	expectedRevision: number;
	expectedChangeDigest: string;
	expectedWorkStateDigest: string;
	disposition: DecisionDisposition;
	rationale: string;
	authority?: RuntimeDecisionAuthority;
	occurredAt?: string;
	mode?: WikiDecideMode;
	repoRoot?: string;
	expectedBytes?: number;
	runtimeJobId?: string;
}

export interface ChangeApproval {
	changeRevision: number;
	changeDigest: string;
	approvedBy: string;
	approvalRef: string;
	observedWorkStateDigest: string;
	qualityRef: string;
	approvedAt: string;
	authorityKind: RuntimeDecisionAuthority["kind"];
	authorityRef: string;
}

export interface ChangeTerminalDisposition {
	kind: Exclude<DecisionDisposition, "approve">;
	actor: string;
	authorityRef: string;
	rationale: string;
	disposedAt: string;
}

export interface ChangeDecisionReport {
	schemaVersion: 1;
	changeId: string;
	traceId: string;
	changeRevision: number;
	changeDigest: string;
	observedWorkStateDigest: string;
	disposition: DecisionDisposition;
	rationale: string;
	qualityRef: string;
	qualityStandards: LoopQualityStandardResult[];
	exit: {
		status: "continue" | "exit" | "blocked";
		nextLoop?: "planning" | "implementation";
	};
	approval?: ChangeApproval;
	terminalDisposition?: ChangeTerminalDisposition;
}

export interface RunWikiDecideResult {
	mode: WikiDecideMode;
	traceId: string;
	record: ChangeRecord;
	report: ChangeDecisionReport;
	event?: TraceEvent;
	append?: AppendTraceBatchResult;
	storeHead: string;
	recovered: boolean;
}

const INPUT_KEYS = [
	"changeId",
	"expectedRevision",
	"expectedChangeDigest",
	"expectedWorkStateDigest",
	"disposition",
	"rationale",
	"authority",
	"occurredAt",
	"mode",
	"repoRoot",
	"expectedBytes",
	"runtimeJobId",
] as const;

export async function runWikiDecide(
	input: RunWikiDecideInput,
): Promise<RunWikiDecideResult> {
	assertInput(input);
	const repoRoot = requiredText(input.repoRoot, "repoRoot");
	const mode = input.mode || "preview";
	const occurredAt = timestamp(input.occurredAt);
	const store = new ChangeTraceStore({ repoRoot });
	const storeSnapshot = await store.read();
	const record = storeSnapshot.records.find(
		(candidate) => candidate.change.id === input.changeId,
	);
	if (!record)
		throw new Error(`Decision Change ${input.changeId} was not found.`);
	assertExactChange(record, input);
	const workState = await buildProjectWorkState({ repoRoot });
	if (workState.snapshotDigest !== input.expectedWorkStateDigest) {
		throw new Error(
			`Decision WorkState changed: expected ${input.expectedWorkStateDigest}, actual ${workState.snapshotDigest}.`,
		);
	}
	const traceId = changeTraceId(record.change.id);
	const path = join(repoRoot, traceFilePath(traceId));
	const trace = await readTraceFileSnapshot(path);
	const traceRecord = changeRecordFromTrace(trace.records);
	if (!traceRecord || traceRecord.recordRevision !== record.recordRevision) {
		throw new Error(
			"Decision Change Trace state differs from projected Change state.",
		);
	}
	if (mode === "append" && trace.bytes !== input.expectedBytes) {
		throw new Error(
			`Decision trace bytes changed: expected ${String(input.expectedBytes)}, actual ${trace.bytes}.`,
		);
	}

	const quality = evaluateChangeDecision({
		record,
		workState,
		disposition: input.disposition,
		rationale: input.rationale,
		authority: input.authority,
	});
	const existing = matchingDisposition(record, input);
	if (existing) {
		const event = lastChangeEvent(trace.records, existing.operation);
		const report = decisionReport({
			input,
			record,
			workState,
			quality,
			occurredAt,
			approvalRef: event?.id || changeTraceEventId(record, existing.operation),
		});
		return {
			mode,
			traceId,
			record,
			report,
			...(event ? { event } : {}),
			storeHead: requiredStoreHead(storeSnapshot.head),
			recovered: true,
		};
	}
	if (record.change.status !== "pending") {
		throw new Error(
			`Decision requires pending Change, found ${record.change.status}.`,
		);
	}

	const operation = dispositionOperation(input.disposition);
	const nextRecord = dispositionRecord(record, input, occurredAt);
	const approvalRef = changeTraceEventId(nextRecord, operation);
	const report = decisionReport({
		input,
		record: nextRecord,
		workState,
		quality,
		occurredAt,
		approvalRef,
	});
	if (!quality.passed) {
		if (mode === "append") {
			const blockers = quality.standards
				.filter((standard) => standard.status !== "met")
				.map((standard) => standard.id)
				.join(", ");
			throw new Error(`Decision quality did not exit: ${blockers}.`);
		}
		return {
			mode,
			traceId,
			record,
			report,
			storeHead: requiredStoreHead(storeSnapshot.head),
			recovered: false,
		};
	}

	const event = decisionEvent({
		records: trace.records,
		record: nextRecord,
		operation,
		input,
		report,
		occurredAt,
	});
	if (mode === "preview") {
		return {
			mode,
			traceId,
			record: nextRecord,
			report,
			event,
			storeHead: requiredStoreHead(storeSnapshot.head),
			recovered: false,
		};
	}
	const append = await appendTraceRecords(repoRoot, [event], trace.bytes);
	const nextStore = await store.read();
	return {
		mode,
		traceId,
		record: nextRecord,
		report,
		event,
		append,
		storeHead: requiredStoreHead(nextStore.head),
		recovered: false,
	};
}

function decisionEvent(input: {
	records: Parameters<typeof createChangeRecordTraceEvent>[0]["records"];
	record: ChangeRecord;
	operation: ChangeTraceOperation;
	input: RunWikiDecideInput;
	report: ChangeDecisionReport;
	occurredAt: string;
}): TraceEvent {
	const event = createChangeRecordTraceEvent({
		records: input.records,
		record: input.record,
		operation: input.operation,
		actor: requiredAuthority(input.input).actor,
		createdAt: input.occurredAt,
		message: input.input.rationale,
		additionalRefs: [
			input.input.expectedWorkStateDigest,
			requiredAuthority(input.input).ref,
			input.report.qualityRef,
		],
		additionalOutput: {
			decision: input.report,
			knowledgeImpacts: input.record.change.knowledge,
			outcomeContract: input.record.change.outcome,
			qualityStandards: input.report.qualityStandards,
		},
	});
	return {
		...event,
		data: {
			...event.data,
			...(input.input.runtimeJobId
				? { runtimeJobId: input.input.runtimeJobId }
				: {}),
			trigger: `decision.${input.input.disposition}`,
			observedWorkStateDigest: input.input.expectedWorkStateDigest,
			exit: {
				status: "exit",
				conditions: input.report.qualityStandards.map((standard) => ({
					id: standard.id,
					status: "pass" as const,
					...(standard.message ? { message: standard.message } : {}),
					...(standard.refs ? { refs: standard.refs } : {}),
				})),
				targetLoop: input.input.disposition === "approve" ? "planning" : null,
				nextAction:
					input.input.disposition === "approve"
						? "Include approved Change in Planning horizon."
						: "Retain terminal Change disposition.",
			},
		},
	};
}

function decisionReport(input: {
	input: RunWikiDecideInput;
	record: ChangeRecord;
	workState: WorkState;
	quality: ReturnType<typeof evaluateChangeDecision>;
	occurredAt: string;
	approvalRef: string;
}): ChangeDecisionReport {
	const authority = input.input.authority;
	const passed = input.quality.passed;
	const exitStatus = passed
		? "exit"
		: input.quality.blocked
			? "blocked"
			: "continue";
	return {
		schemaVersion: 1,
		changeId: input.record.change.id,
		traceId: changeTraceId(input.record.change.id),
		changeRevision: input.record.change.revision,
		changeDigest: changeContentDigest(input.record.change),
		observedWorkStateDigest: input.workState.snapshotDigest,
		disposition: input.input.disposition,
		rationale: input.input.rationale,
		qualityRef: input.quality.qualityRef,
		qualityStandards: input.quality.standards,
		exit: {
			status: exitStatus,
			...(passed && input.input.disposition === "approve"
				? { nextLoop: "planning" as const }
				: {}),
		},
		...(passed && input.input.disposition === "approve" && authority
			? {
					approval: {
						changeRevision: input.record.change.revision,
						changeDigest: changeContentDigest(input.record.change),
						approvedBy: authority.actor,
						approvalRef: input.approvalRef,
						observedWorkStateDigest: input.workState.snapshotDigest,
						qualityRef: input.quality.qualityRef,
						approvedAt: input.occurredAt,
						authorityKind: authority.kind,
						authorityRef: authority.ref,
					},
				}
			: {}),
		...(passed && input.input.disposition !== "approve" && authority
			? {
					terminalDisposition: {
						kind: input.input.disposition,
						actor: authority.actor,
						authorityRef: authority.ref,
						rationale: input.input.rationale,
						disposedAt: input.occurredAt,
					},
				}
			: {}),
	};
}

function dispositionRecord(
	record: ChangeRecord,
	input: RunWikiDecideInput,
	occurredAt: string,
): ChangeRecord {
	const authority = requiredAuthority(input);
	const common = {
		changedBy: authority.actor,
		changedAt: occurredAt,
		reason: input.rationale,
		authority: authority.kind,
		ref: authority.ref,
	};
	if (input.disposition === "approve") {
		return acceptChangeRecord(record, common);
	}
	return transitionChangeStatus(record, {
		...common,
		status: terminalDispositionStatus(input.disposition),
	});
}

function matchingDisposition(
	record: ChangeRecord,
	input: RunWikiDecideInput,
): { operation: ChangeTraceOperation } | undefined {
	const authority = input.authority;
	const transition = record.change.lastStatusTransition;
	if (!authority || !transition) return undefined;
	if (
		transition.to !== dispositionStatus(input.disposition) ||
		transition.changedBy !== authority.actor ||
		transition.ref !== authority.ref ||
		transition.reason !== input.rationale
	) {
		return undefined;
	}
	return { operation: dispositionOperation(input.disposition) };
}

function lastChangeEvent(
	records: Parameters<typeof changeRecordFromTrace>[0],
	operation: ChangeTraceOperation,
): TraceEvent | undefined {
	return records
		.filter((record): record is TraceEvent => record.type === "trace_event")
		.filter((event) => event.id.endsWith(`-${operation}`))
		.at(-1);
}

function dispositionOperation(
	disposition: DecisionDisposition,
): ChangeTraceOperation {
	return disposition === "approve" ? "accept" : disposition;
}

function dispositionStatus(
	disposition: DecisionDisposition,
): "accepted" | "rejected" | "deferred" | "withdrawn" {
	switch (disposition) {
		case "approve":
			return "accepted";
		case "reject":
			return "rejected";
		case "defer":
			return "deferred";
		case "withdraw":
			return "withdrawn";
	}
}

function terminalDispositionStatus(
	disposition: Exclude<DecisionDisposition, "approve">,
): "rejected" | "deferred" | "withdrawn" {
	switch (disposition) {
		case "reject":
			return "rejected";
		case "defer":
			return "deferred";
		case "withdraw":
			return "withdrawn";
	}
}

function assertExactChange(
	record: ChangeRecord,
	input: RunWikiDecideInput,
): void {
	if (record.change.revision !== input.expectedRevision) {
		throw new Error(
			`Decision Change revision changed: expected ${input.expectedRevision}, actual ${record.change.revision}.`,
		);
	}
	const digest = changeContentDigest(record.change);
	if (digest !== input.expectedChangeDigest) {
		throw new Error(
			`Decision Change digest changed: expected ${input.expectedChangeDigest}, actual ${digest}.`,
		);
	}
}

function assertInput(input: RunWikiDecideInput): void {
	if (!input || typeof input !== "object")
		throw new Error("wiki_decide requires input object.");
	for (const key of Object.keys(input)) {
		if (!(INPUT_KEYS as readonly string[]).includes(key)) {
			throw new Error(`wiki_decide received unsupported input field ${key}.`);
		}
	}
	requiredText(input.changeId, "changeId");
	if (
		!Number.isSafeInteger(input.expectedRevision) ||
		input.expectedRevision < 1
	) {
		throw new Error("wiki_decide expectedRevision must be >= 1.");
	}
	if (!/^sha256:[a-f0-9]{64}$/.test(input.expectedChangeDigest)) {
		throw new Error(
			"wiki_decide expectedChangeDigest must be a sha256 digest.",
		);
	}
	if (!/^sha256:[a-f0-9]{64}$/.test(input.expectedWorkStateDigest)) {
		throw new Error(
			"wiki_decide expectedWorkStateDigest must be a sha256 digest.",
		);
	}
	if (!["approve", "reject", "defer", "withdraw"].includes(input.disposition)) {
		throw new Error("wiki_decide disposition is invalid.");
	}
	requiredText(input.rationale, "rationale");
	assertRuntimeSemanticJobId(input.runtimeJobId, "wiki_decide");
	if (input.authority) {
		if (!["user", "policy"].includes(input.authority.kind)) {
			throw new Error("wiki_decide authority.kind is invalid.");
		}
		requiredText(input.authority.actor, "authority.actor");
		requiredText(input.authority.ref, "authority.ref");
	}
	if (input.mode && !["preview", "append"].includes(input.mode)) {
		throw new Error("wiki_decide mode is invalid.");
	}
	if (
		input.mode === "append" &&
		(!Number.isSafeInteger(input.expectedBytes) || input.expectedBytes! < 0)
	) {
		throw createCodewikiApiError({
			operation: "wiki_decide",
			code: "invalid_input",
			field: "expectedBytes",
			message: "wiki_decide append mode requires expectedBytes >= 0.",
			data: { value: input.expectedBytes },
		});
	}
}

function requiredAuthority(input: RunWikiDecideInput): RuntimeDecisionAuthority {
	if (!input.authority)
		throw new Error("wiki_decide requires exact authority.");
	return input.authority;
}

function requiredText(value: string | undefined, field: string): string {
	if (!value?.trim()) throw new Error(`wiki_decide ${field} is required.`);
	return value.trim();
}

function timestamp(value: string | undefined): string {
	const timestampValue = value || new Date().toISOString();
	if (Number.isNaN(Date.parse(timestampValue))) {
		throw new Error("wiki_decide occurredAt must be an ISO timestamp.");
	}
	return new Date(timestampValue).toISOString();
}

function requiredStoreHead(value: string | null): string {
	if (!value) throw new Error("Decision Change Trace store is empty.");
	return value;
}
