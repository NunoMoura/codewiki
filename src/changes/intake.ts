import { createHash } from "node:crypto";
import { runWikiChange } from "../api/wiki-change.ts";
import { isCanonicalTraceRef } from "../traces/refs.ts";
import { findFeedbackDuplicate, type FeedbackDuplicateMethod } from "./deduplication.ts";
import { GitRefChangeStore } from "./git-ref-store.ts";
import { parseChange } from "./schema.ts";
import {
	CHANGE_EFFORT_VALUES,
	CHANGE_KIND_VALUES,
	CHANGE_RISK_VALUES,
	CHANGE_SCHEMA_VERSION,
	CHANGE_SCOPE_VALUES,
	CHANGE_TYPE_VALUES,
	CHANGE_WORK_SCALE_VALUES,
	type Change,
	type ChangeEffort,
	type ChangeKind,
	type ChangeRisk,
	type ChangeScope,
	type ChangeType,
	type ChangeWorkScale,
} from "./types.ts";
import type { ChangeRecord } from "./records.ts";

type ChangeFeedbackSource = "user" | "runtime" | "lab";

export interface ChangeFeedbackInput {
	source: ChangeFeedbackSource;
	sourceId: string;
	summary: string;
	question: string;
	currentState: string;
	desiredState: string;
	rationale: string;
	nonGoals: string[];
	kind: ChangeKind;
	type: ChangeType;
	scope: ChangeScope;
	affectedLayers: string[];
	targetRefs: string[];
	sourceRefs: string[];
	proofRefs: string[];
	userImpact: string;
	maintainerImpact: string;
	risk: ChangeRisk;
	failureModes: string[];
	successSignal: string;
	regressionPlan: string;
	effort: ChangeEffort;
	workScale: ChangeWorkScale;
	traceId?: string;
	taskId?: string;
}

interface IntakeChangeFeedbackInput {
	repoRoot: string;
	expectedHead: string | null;
	feedback: unknown;
	now?: () => Date;
}

export interface IntakeChangeFeedbackResult {
	action: "created" | "reinforced";
	head: string;
	record: ChangeRecord;
	match?: { method: FeedbackDuplicateMethod; score: number };
	receipt: {
		source: ChangeFeedbackSource;
		sourceId: string;
		changeId: string;
		recordedAt: string;
	};
}

const FEEDBACK_KEYS = [
	"source", "sourceId", "summary", "question", "currentState", "desiredState",
	"rationale", "nonGoals", "kind", "type", "scope", "affectedLayers",
	"targetRefs", "sourceRefs", "proofRefs", "userImpact", "maintainerImpact",
	"risk", "failureModes", "successSignal", "regressionPlan", "effort",
	"workScale", "traceId", "taskId",
] as const;

export async function intakeChangeFeedback(
	input: IntakeChangeFeedbackInput,
): Promise<IntakeChangeFeedbackResult> {
	const feedback = parseChangeFeedback(input.feedback);
	const now = input.now || (() => new Date());
	const recordedAt = now().toISOString();
	const candidate = feedbackChange(feedback, recordedAt);
	const store = new GitRefChangeStore({ repoRoot: input.repoRoot });
	const snapshot = await store.read();
	if (snapshot.head !== input.expectedHead) {
		throw new Error("Changes Backlog head changed; refresh before feedback intake.");
	}
	const match = findFeedbackDuplicate(snapshot.records, candidate);
	const actor = `feedback:${feedback.source}:${feedback.sourceId}`;
	const result = match
		? await runWikiChange({
			repoRoot: input.repoRoot,
			operation: "add_evidence",
			changeId: match.record.change.id,
			expectedHead: snapshot.head,
			expectedRecordRevision: match.record.recordRevision,
			sourceRefs: feedback.sourceRefs,
			proofRefs: feedback.proofRefs,
			actor,
			createdAt: recordedAt,
		})
		: await runWikiChange({
			repoRoot: input.repoRoot,
			operation: "create",
			expectedHead: snapshot.head,
			change: candidate,
			actor,
			createdAt: recordedAt,
		});
	if (!result.head || !result.record) {
		throw new Error("Feedback intake did not persist an exact Change record.");
	}
	return {
		action: match ? "reinforced" : "created",
		head: result.head,
		record: result.record,
		...(match ? { match: { method: match.method, score: match.score } } : {}),
		receipt: {
			source: feedback.source,
			sourceId: feedback.sourceId,
			changeId: result.record.change.id,
			recordedAt,
		},
	};
}

function parseChangeFeedback(value: unknown): ChangeFeedbackInput {
	if (!isRecord(value)) throw new Error("Feedback must be an object.");
	if (Buffer.byteLength(JSON.stringify(value), "utf8") > 12_000) {
		throw new Error("Feedback exceeds 12000 bytes.");
	}
	for (const key of Object.keys(value)) {
		if (!(FEEDBACK_KEYS as readonly string[]).includes(key)) {
			throw new Error(`Feedback contains unsupported field ${key}.`);
		}
	}
	assertNoSensitiveData(value);
	return {
		source: member(value.source, ["user", "runtime", "lab"], "source"),
		sourceId: identifier(value.sourceId, "sourceId", 120),
		summary: text(value.summary, "summary", 1_000),
		question: text(value.question, "question", 1_000),
		currentState: text(value.currentState, "currentState", 4_000),
		desiredState: text(value.desiredState, "desiredState", 4_000),
		rationale: text(value.rationale, "rationale", 4_000),
		nonGoals: textList(value.nonGoals, "nonGoals"),
		kind: member(value.kind, CHANGE_KIND_VALUES, "kind"),
		type: member(value.type, CHANGE_TYPE_VALUES, "type"),
		scope: member(value.scope, CHANGE_SCOPE_VALUES, "scope"),
		affectedLayers: textList(value.affectedLayers, "affectedLayers"),
		targetRefs: refList(value.targetRefs, "targetRefs"),
		sourceRefs: refList(value.sourceRefs, "sourceRefs"),
		proofRefs: refList(value.proofRefs, "proofRefs"),
		userImpact: text(value.userImpact, "userImpact", 2_000),
		maintainerImpact: text(value.maintainerImpact, "maintainerImpact", 2_000),
		risk: member(value.risk, CHANGE_RISK_VALUES, "risk"),
		failureModes: textList(value.failureModes, "failureModes"),
		successSignal: text(value.successSignal, "successSignal", 2_000),
		regressionPlan: text(value.regressionPlan, "regressionPlan", 2_000),
		effort: member(value.effort, CHANGE_EFFORT_VALUES, "effort"),
		workScale: member(value.workScale, CHANGE_WORK_SCALE_VALUES, "workScale"),
		...(value.traceId === undefined ? {} : { traceId: identifier(value.traceId, "traceId", 160) }),
		...(value.taskId === undefined ? {} : { taskId: identifier(value.taskId, "taskId", 160) }),
	};
}

function feedbackChange(feedback: ChangeFeedbackInput, createdAt: string): Change {
	return parseChange({
		schemaVersion: CHANGE_SCHEMA_VERSION,
		id: feedbackChangeId(feedback),
		revision: 1,
		status: "pending",
		intent: {
			question: feedback.question,
			currentState: feedback.currentState,
			currentPain: feedback.summary,
			desiredState: feedback.desiredState,
			rationale: feedback.rationale,
			nonGoals: feedback.nonGoals,
		},
		classification: {
			kind: feedback.kind,
			type: feedback.type,
			scope: feedback.scope,
			affectedLayers: feedback.affectedLayers,
			targetRefs: feedback.targetRefs,
		},
		impact: { user: feedback.userImpact, maintainer: feedback.maintainerImpact },
		evidence: { sourceRefs: feedback.sourceRefs, proofRefs: feedback.proofRefs },
		safety: { risk: feedback.risk, failureModes: feedback.failureModes },
		validation: {
			state: "draft",
			issues: [],
			assessments: [],
			recommendations: [],
			successSignal: feedback.successSignal,
			regressionPlan: feedback.regressionPlan,
		},
		estimates: { effort: feedback.effort, workScale: feedback.workScale },
		provenance: {
			origin: feedback.source === "runtime" ? "telemetry" : feedback.source,
			createdBy: `feedback:${feedback.source}:${feedback.sourceId}`,
			createdAt,
			updatedAt: createdAt,
			...(feedback.traceId || feedback.taskId
				? { discoveredWhile: { traceId: feedback.traceId, taskId: feedback.taskId } }
				: {}),
		},
	});
}

function feedbackChangeId(feedback: ChangeFeedbackInput): string {
	const slug = feedback.sourceId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
	const hash = createHash("sha256")
		.update(JSON.stringify([feedback.source, feedback.sourceId, feedback.summary]))
		.digest("hex")
		.slice(0, 12);
	return `CHG-feedback-${feedback.source}-${slug || "observation"}-${hash}`;
}

function refList(value: unknown, field: string): string[] {
	const values = textList(value, field, 512);
	if (!values.length) throw new Error(`${field} must not be empty.`);
	for (const ref of values) {
		if (!isCanonicalTraceRef(ref)) throw new Error(`${field} contains unsupported ref ${ref}.`);
	}
	return values;
}

function textList(value: unknown, field: string, maxLength = 1_000): string[] {
	if (!Array.isArray(value) || value.length > 16) {
		throw new Error(`${field} must contain at most 16 strings.`);
	}
	return [...new Set(value.map((entry) => text(entry, field, maxLength)))];
}

function text(value: unknown, field: string, max: number): string {
	if (typeof value !== "string" || value.length < 1 || value.length > max) {
		throw new Error(`${field} must be non-empty and not exceed ${max} characters.`);
	}
	if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
		throw new Error(`${field} contains unsupported control characters.`);
	}
	return value;
}

function identifier(value: unknown, field: string, max: number): string {
	const result = text(value, field, max);
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) {
		throw new Error(`${field} contains unsupported characters.`);
	}
	return result;
}

function member<T extends string>(value: unknown, values: readonly T[], field: string): T {
	if (typeof value !== "string" || !values.includes(value as T)) {
		throw new Error(`${field} has unsupported value.`);
	}
	return value as T;
}

function assertNoSensitiveData(value: unknown): void {
	const serialized = JSON.stringify(value);
	if (
		/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\b(api[_-]?key|password|credential|secret|access[_-]?token)\s*[:=]/i.test(serialized)
	) {
		throw new Error("Feedback contains sensitive data.");
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
