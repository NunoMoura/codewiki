import { changeContentDigest } from "./digest.ts";
import { parseChange } from "./schema.ts";
import type { Change } from "./types.ts";
import {
	assertKnownInputKeys,
	createCodewikiOperationError,
	requiredArrayField,
	requiredStringField,
} from "../error-handling/operation-errors.ts";
import { ChangeTraceStore } from "./trace/store.ts";
import {
	addChangeEvidence,
	createChangeRecord,
	linkChangeRecord,
	mergeChangeRecords,
	reviseChangeRecord,
	splitChangeRecord,
	transitionChangeStatus,
	type ChangeLinkRelation,
	type ChangeRecord,
} from "./records.ts";
import {
	ChangeStoreConflictError,
	type ChangeQuery,
	type ChangeStore,
	type ChangeStoreSnapshot,
} from "./store.ts";
import { resolveCodewikiProjectRoot } from "../project/root.ts";

export const WIKI_CHANGE_OPERATIONS = [
	"list",
	"get",
	"create",
	"revise",
	"add_evidence",
	"link",
	"merge",
	"split",
	"validate",
	"defer",
	"reject",
	"withdraw",
] as const;

export type WikiChangeOperation = (typeof WIKI_CHANGE_OPERATIONS)[number];

export interface RunWikiChangeInput {
	repoRoot?: string;
	operation: WikiChangeOperation | string;
	changeId?: string;
	change?: unknown;
	children?: unknown[];
	query?: ChangeQuery;
	expectedHead?: string | null;
	expectedRecordRevision?: number;
	sourceRefs?: string[];
	proofRefs?: string[];
	targetChangeId?: string;
	relation?: ChangeLinkRelation | string;
	sourceChangeIds?: string[];
	actor?: string;
	createdAt?: string;
	reason?: string;
	limit?: number;
}

export interface WikiChangeSummary {
	id: string;
	revision: number;
	recordRevision: number;
	status: string;
	validationState: string;
	kind: string;
	type: string;
	scope: string;
	question: string;
	updatedAt: string;
	contentDigest: string;
	linkCount: number;
}

export interface RunWikiChangeResult {
	operation: WikiChangeOperation;
	head: string | null;
	changed: boolean;
	duplicate?: boolean;
	record?: ChangeRecord;
	records?: WikiChangeSummary[];
	validation?: {
		ready: boolean;
		issues: string[];
	};
	writtenChangeIds?: string[];
}

const INPUT_KEYS = [
	"repoRoot",
	"operation",
	"changeId",
	"change",
	"children",
	"query",
	"expectedHead",
	"expectedRecordRevision",
	"sourceRefs",
	"proofRefs",
	"targetChangeId",
	"relation",
	"sourceChangeIds",
	"actor",
	"createdAt",
	"reason",
	"limit",
] as const;
const MUTATING_OPERATIONS = new Set<WikiChangeOperation>([
	"create",
	"revise",
	"add_evidence",
	"link",
	"merge",
	"split",
	"defer",
	"reject",
	"withdraw",
]);
const MAX_INPUT_BYTES = 256 * 1024;
const MAX_CHANGE_BYTES = 64 * 1024;
const MAX_LIST_LIMIT = 100;

export function wikiChangeOperationMutates(operation: string): boolean {
	return MUTATING_OPERATIONS.has(operation as WikiChangeOperation);
}

export async function runWikiChange(
	input: RunWikiChangeInput,
): Promise<RunWikiChangeResult> {
	assertInput(input);
	const operation = input.operation as WikiChangeOperation;
	const repoRoot = await resolveCodewikiProjectRoot(input.repoRoot);
	const store = new ChangeTraceStore({ repoRoot });
	if (operation === "list") return listChanges(store, input);
	if (operation === "get") return getChange(store, input);
	if (operation === "validate") return validateChange(store, input);
	const snapshot = await store.read();
	assertExpectedHead(input, snapshot);
	const actor = requiredStringField("wiki_change", "actor", input.actor).trim();
	const createdAt = requiredStringField(
		"wiki_change",
		"createdAt",
		input.createdAt,
	).trim();
	assertIsoTimestamp(createdAt, "createdAt");
	return mutateChanges({ operation, store, snapshot, input, actor, createdAt });
}

async function listChanges(
	store: ChangeStore,
	input: RunWikiChangeInput,
): Promise<RunWikiChangeResult> {
	const limit = normalizedLimit(input.limit);
	const snapshot = await store.read();
	const records = input.query
		? await store.query(validateQuery(input.query))
		: snapshot.records;
	return {
		operation: "list",
		head: snapshot.head,
		changed: false,
		records: records.slice(0, limit).map(changeSummary),
	};
}

async function getChange(
	store: ChangeStore,
	input: RunWikiChangeInput,
): Promise<RunWikiChangeResult> {
	const changeId = requiredChangeId(input.changeId);
	const snapshot = await store.read();
	const record = snapshot.records.find((item) => item.change.id === changeId);
	if (!record)
		throw changeError("not_found", "changeId", `Change not found: ${changeId}`);
	return { operation: "get", head: snapshot.head, changed: false, record };
}

async function validateChange(
	store: ChangeStore,
	input: RunWikiChangeInput,
): Promise<RunWikiChangeResult> {
	const changeId = requiredChangeId(input.changeId);
	const snapshot = await store.read();
	const record = requiredRecord(snapshot, changeId);
	const issues = readinessIssues(record.change);
	return {
		operation: "validate",
		head: snapshot.head,
		changed: false,
		record,
		validation: { ready: issues.length === 0, issues },
	};
}

async function mutateChanges(args: {
	operation: WikiChangeOperation;
	store: ChangeStore;
	snapshot: ChangeStoreSnapshot;
	input: RunWikiChangeInput;
	actor: string;
	createdAt: string;
}): Promise<RunWikiChangeResult> {
	const { operation, store, snapshot, input, actor, createdAt } = args;
	const mutation = mutationRecords(
		operation,
		snapshot,
		input,
		actor,
		createdAt,
	);
	if (mutation.duplicate) {
		return {
			operation,
			head: snapshot.head,
			changed: false,
			duplicate: true,
			record: mutation.records[0],
		};
	}
	try {
		const written = await store.write({
			expectedHead: snapshot.head,
			records: mutation.records,
			message: `wiki_change ${operation}: ${mutation.records
				.map((record) => record.change.id)
				.join(", ")}`,
			actor,
			createdAt,
		});
		return {
			operation,
			head: written.head,
			changed: true,
			record: mutation.primary,
			writtenChangeIds: written.writtenChangeIds,
		};
	} catch (error) {
		if (error instanceof ChangeStoreConflictError) {
			throw changeError("conflict", "expectedHead", error.message);
		}
		throw error;
	}
}

function mutationRecords(
	operation: WikiChangeOperation,
	snapshot: ChangeStoreSnapshot,
	input: RunWikiChangeInput,
	actor: string,
	createdAt: string,
): { records: ChangeRecord[]; primary: ChangeRecord; duplicate?: boolean } {
	if (operation === "create") return createMutation(snapshot, input);
	if (operation === "revise") return reviseMutation(snapshot, input);
	if (operation === "add_evidence") {
		const current = checkedRecord(snapshot, input);
		const record = addChangeEvidence(current, {
			sourceRefs: stringArray(input.sourceRefs, "sourceRefs"),
			proofRefs: stringArray(input.proofRefs, "proofRefs"),
			updatedBy: actor,
			updatedAt: createdAt,
		});
		return one(record);
	}
	if (operation === "link") {
		const current = checkedRecord(snapshot, input);
		const relation = requiredStringField(
			"wiki_change",
			"relation",
			input.relation,
		);
		const record = linkChangeRecord(current, {
			relation: relation as ChangeLinkRelation,
			targetChangeId: requiredChangeId(input.targetChangeId),
			createdBy: actor,
			createdAt,
		});
		return one(record);
	}
	if (operation === "merge")
		return mergeMutation(snapshot, input, actor, createdAt);
	if (operation === "split")
		return splitMutation(snapshot, input, actor, createdAt);
	if (["defer", "reject", "withdraw"].includes(operation)) {
		const current = checkedRecord(snapshot, input);
		const record = transitionChangeStatus(current, {
			status: statusForOperation(operation),
			changedBy: actor,
			changedAt: createdAt,
			reason: input.reason?.trim(),
		});
		return one(record);
	}
	throw changeError(
		"invalid_input",
		"operation",
		`Unsupported mutation ${operation}`,
	);
}

function statusForOperation(
	operation: WikiChangeOperation,
): "deferred" | "rejected" | "withdrawn" {
	if (operation === "defer") return "deferred";
	if (operation === "reject") return "rejected";
	return "withdrawn";
}

function createMutation(
	snapshot: ChangeStoreSnapshot,
	input: RunWikiChangeInput,
): { records: ChangeRecord[]; primary: ChangeRecord; duplicate?: boolean } {
	const change = parsedInputChange(input.change);
	if (change.status === "accepted") {
		throw changeError(
			"forbidden",
			"change.status",
			"wiki_change cannot create accepted Changes.",
		);
	}
	const duplicate = findDuplicate(snapshot.records, change);
	if (duplicate)
		return { records: [duplicate], primary: duplicate, duplicate: true };
	return one(createChangeRecord(change));
}

function reviseMutation(
	snapshot: ChangeStoreSnapshot,
	input: RunWikiChangeInput,
): { records: ChangeRecord[]; primary: ChangeRecord } {
	const current = checkedRecord(snapshot, input);
	const change = parsedInputChange(input.change);
	if (change.status === "accepted") {
		throw changeError(
			"forbidden",
			"change.status",
			"wiki_change cannot accept Changes.",
		);
	}
	return one(reviseChangeRecord(current, change));
}

function mergeMutation(
	snapshot: ChangeStoreSnapshot,
	input: RunWikiChangeInput,
	actor: string,
	createdAt: string,
): { records: ChangeRecord[]; primary: ChangeRecord } {
	const target = checkedRecord(snapshot, input);
	const sourceIds = stringArray(input.sourceChangeIds, "sourceChangeIds");
	if (!sourceIds.length)
		throw changeError(
			"missing_required",
			"sourceChangeIds",
			"wiki_change merge requires sourceChangeIds.",
		);
	const sources = sourceIds.map((id) =>
		requiredRecord(snapshot, requiredChangeId(id)),
	);
	const records = mergeChangeRecords({
		target,
		sources,
		changedBy: actor,
		changedAt: createdAt,
	});
	return { records, primary: records[0] };
}

function splitMutation(
	snapshot: ChangeStoreSnapshot,
	input: RunWikiChangeInput,
	actor: string,
	createdAt: string,
): { records: ChangeRecord[]; primary: ChangeRecord } {
	const parent = checkedRecord(snapshot, input);
	const children = requiredArrayField(
		"wiki_change",
		"children",
		input.children,
	).map(parsedInputChange);
	if (!children.length)
		throw changeError(
			"missing_required",
			"children",
			"wiki_change split requires children.",
		);
	const records = splitChangeRecord({
		parent,
		children,
		changedBy: actor,
		changedAt: createdAt,
	});
	return { records, primary: records[0] };
}

function checkedRecord(
	snapshot: ChangeStoreSnapshot,
	input: RunWikiChangeInput,
): ChangeRecord {
	const record = requiredRecord(snapshot, requiredChangeId(input.changeId));
	if (!Number.isInteger(input.expectedRecordRevision)) {
		throw changeError(
			"missing_required",
			"expectedRecordRevision",
			"wiki_change mutation requires expectedRecordRevision.",
		);
	}
	if (record.recordRevision !== input.expectedRecordRevision) {
		throw changeError(
			"conflict",
			"expectedRecordRevision",
			`Expected record revision ${input.expectedRecordRevision}, found ${record.recordRevision}.`,
		);
	}
	return record;
}

function requiredRecord(
	snapshot: ChangeStoreSnapshot,
	changeId: string,
): ChangeRecord {
	const record = snapshot.records.find((item) => item.change.id === changeId);
	if (!record)
		throw changeError("not_found", "changeId", `Change not found: ${changeId}`);
	return record;
}

function parsedInputChange(value: unknown): Change {
	const serialized = JSON.stringify(value);
	if (!serialized) {
		throw changeError(
			"missing_required",
			"change",
			"wiki_change requires change.",
		);
	}
	if (serialized.length > MAX_CHANGE_BYTES) {
		throw changeError(
			"invalid_input",
			"change",
			"wiki_change Change exceeds 64 KiB.",
		);
	}
	assertNoSecrets(value);
	try {
		return parseChange(value);
	} catch (error) {
		throw changeError(
			"invalid_input",
			"change",
			error instanceof Error ? error.message : "Invalid Change.",
		);
	}
}

function findDuplicate(
	records: ChangeRecord[],
	change: Change,
): ChangeRecord | undefined {
	const digest = changeContentDigest(change);
	const question = change.intent.question.trim().toLowerCase();
	return records.find(
		(record) =>
			changeContentDigest(record.change) === digest ||
			(record.change.status === "pending" &&
				record.change.intent.question.trim().toLowerCase() === question &&
				overlaps(
					record.change.classification.targetRefs,
					change.classification.targetRefs,
				)),
	);
}

function readinessIssues(change: Change): string[] {
	return [
		...(change.classification.targetRefs.length
			? []
			: ["Change needs target refs."]),
		...(change.evidence.sourceRefs.length || change.evidence.proofRefs.length
			? []
			: ["Change needs source or proof refs."]),
		...(change.safety.failureModes.length
			? []
			: ["Change needs failure modes."]),
		...(change.validation.state === "valid"
			? []
			: ["Change validation is not valid."]),
	];
}

function changeSummary(record: ChangeRecord): WikiChangeSummary {
	return {
		id: record.change.id,
		revision: record.change.revision,
		recordRevision: record.recordRevision,
		status: record.change.status,
		validationState: record.change.validation.state,
		kind: record.change.classification.kind,
		type: record.change.classification.type,
		scope: record.change.classification.scope,
		question: record.change.intent.question,
		updatedAt: record.change.provenance.updatedAt,
		contentDigest: changeContentDigest(record.change),
		linkCount: record.links.length,
	};
}

function assertInput(input: RunWikiChangeInput): void {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw changeError(
			"invalid_input",
			"input",
			"wiki_change input must be an object.",
		);
	}
	assertKnownInputKeys(
		"wiki_change",
		input as unknown as Record<string, unknown>,
		INPUT_KEYS,
	);
	if (JSON.stringify(input).length > MAX_INPUT_BYTES) {
		throw changeError(
			"invalid_input",
			"input",
			"wiki_change input exceeds 256 KiB.",
		);
	}
	assertNoSecrets(input);
	if (
		!WIKI_CHANGE_OPERATIONS.includes(input.operation as WikiChangeOperation)
	) {
		throw changeError(
			"invalid_input",
			"operation",
			`Unsupported wiki_change operation ${input.operation}.`,
		);
	}
	if (
		MUTATING_OPERATIONS.has(input.operation as WikiChangeOperation) &&
		!("expectedHead" in input)
	) {
		throw changeError(
			"missing_required",
			"expectedHead",
			"wiki_change mutations require expectedHead, including null for an empty store.",
		);
	}
}

function assertExpectedHead(
	input: RunWikiChangeInput,
	snapshot: ChangeStoreSnapshot,
): void {
	if (input.expectedHead !== snapshot.head) {
		throw changeError(
			"conflict",
			"expectedHead",
			`Expected Changes Backlog head ${input.expectedHead || "empty"}, found ${snapshot.head || "empty"}.`,
		);
	}
}

function validateQuery(query: ChangeQuery): ChangeQuery {
	if (!query || typeof query !== "object" || Array.isArray(query)) {
		throw changeError(
			"invalid_input",
			"query",
			"wiki_change query must be an object.",
		);
	}
	assertKnownInputKeys("wiki_change.query", query as Record<string, unknown>, [
		"status",
		"type",
		"origin",
		"text",
	]);
	return query;
}

function normalizedLimit(value: number | undefined): number {
	if (value === undefined) return 50;
	if (!Number.isInteger(value) || value < 1 || value > MAX_LIST_LIMIT) {
		throw changeError(
			"invalid_input",
			"limit",
			`wiki_change limit must be 1-${MAX_LIST_LIMIT}.`,
		);
	}
	return value;
}

function requiredChangeId(value: unknown): string {
	const id = requiredStringField("wiki_change", "changeId", value).trim();
	if (!/^CHG-[A-Za-z0-9._-]+$/.test(id)) {
		throw changeError(
			"invalid_input",
			"changeId",
			"wiki_change changeId must use CHG- prefix.",
		);
	}
	return id;
}

function stringArray(value: unknown, field: string): string[] {
	if (value === undefined) return [];
	return requiredArrayField("wiki_change", field, value).map((entry, index) =>
		requiredStringField("wiki_change", `${field}[${index}]`, entry).trim(),
	);
}

function assertNoSecrets(value: unknown): void {
	const serialized = JSON.stringify(value);
	if (
		/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}/.test(
			serialized,
		)
	) {
		throw changeError(
			"forbidden",
			"change",
			"wiki_change rejects secret-shaped Change content.",
		);
	}
}

function assertIsoTimestamp(value: string, field: string): void {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
		throw changeError(
			"invalid_input",
			field,
			`wiki_change ${field} must be an ISO UTC timestamp.`,
		);
	}
}

function one(record: ChangeRecord): {
	records: ChangeRecord[];
	primary: ChangeRecord;
} {
	return { records: [record], primary: record };
}

function overlaps(left: string[], right: string[]): boolean {
	const rightSet = new Set(right);
	return left.some((value) => rightSet.has(value));
}

function changeError(
	code:
		| "invalid_input"
		| "missing_required"
		| "not_found"
		| "conflict"
		| "forbidden",
	field: string,
	message: string,
): Error {
	return createCodewikiOperationError({
		operation: "wiki_change",
		code: code === "missing_required" ? "missing_required" : "invalid_input",
		field,
		message,
		data: { reason: code },
	});
}
