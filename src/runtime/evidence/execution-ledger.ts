import type {RunRequest} from "../contracts.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export const EXECUTION_LEDGER_SCHEMA_VERSION = "1.0.0" as const;

export type ExecutionLedgerEntryKind =
	| "static-input"
	| "stage-context-query"
	| "model-request"
	| "model-output"
	| "tool-call"
	| "tool-result"
	| "compaction"
	| "usage"
	| "cancellation"
	| "output";

export interface ExecutionLedgerHeaderInput {
	readonly request: RunRequest;
	readonly createdAt: string;
}

export interface ExecutionLedgerHeader {
	readonly schemaVersion: typeof EXECUTION_LEDGER_SCHEMA_VERSION;
	readonly runId: string;
	readonly requestDigest: Sha256Digest;
	readonly runtimeBuildDigest: Sha256Digest;
	readonly sessionId: string;
	readonly stageContextDigest: Sha256Digest;
	readonly staticInputManifestDigest: Sha256Digest;
	readonly modelRouteDigest: Sha256Digest;
	readonly toolSetDigest: Sha256Digest;
	readonly producerSkillSetDigest: Sha256Digest | null;
	readonly createdAt: string;
	readonly headerDigest: Sha256Digest;
}

export interface ExecutionLedgerEntryInput {
	readonly kind: ExecutionLedgerEntryKind;
	readonly occurredAt: string;
	readonly modelVisible: boolean;
	readonly payload: unknown;
}

export interface ExecutionLedgerEntry {
	readonly sequence: number;
	readonly kind: ExecutionLedgerEntryKind;
	readonly occurredAt: string;
	readonly modelVisible: boolean;
	readonly payload: CanonicalJsonValue;
	readonly payloadDigest: Sha256Digest;
	readonly previousDigest: Sha256Digest;
	readonly entryDigest: Sha256Digest;
}

export interface ExecutionLedger {
	readonly schemaVersion: typeof EXECUTION_LEDGER_SCHEMA_VERSION;
	readonly header: ExecutionLedgerHeader;
	readonly entries: readonly ExecutionLedgerEntry[];
	readonly headDigest: Sha256Digest;
	readonly ledgerDigest: Sha256Digest;
}

export function createExecutionLedgerHeader(
	input: ExecutionLedgerHeaderInput,
): Readonly<ExecutionLedgerHeader> {
	const request = input.request;
	assertSha256Digest(request?.requestDigest, "Execution Ledger request digest");
	assertTimestamp(input.createdAt, "Execution Ledger createdAt");
	const body = {
		schemaVersion: EXECUTION_LEDGER_SCHEMA_VERSION,
		runId: boundedIdentifier(request.runId, "Execution Ledger Run id"),
		requestDigest: request.requestDigest,
		runtimeBuildDigest: assertSha256Digest(
			request.runtimeBuild.buildDigest,
			"Execution Ledger Runtime Build digest",
		),
		sessionId: boundedIdentifier(
			request.session.sessionId,
			"Execution Ledger DSH Agent Session id",
		),
		stageContextDigest: assertSha256Digest(
			request.inputs.stageContextDigest,
			"Execution Ledger Stage Context digest",
		),
		staticInputManifestDigest: assertSha256Digest(
			request.inputs.staticInputManifestDigest,
			"Execution Ledger static input manifest digest",
		),
		modelRouteDigest: assertSha256Digest(
			request.inputs.modelRoute.routeDigest,
			"Execution Ledger model route digest",
		),
		toolSetDigest: assertSha256Digest(
			request.inputs.toolSetDigest,
			"Execution Ledger tool set digest",
		),
		producerSkillSetDigest: optionalDigest(
			request.inputs.producerSkillSetDigest,
			"Execution Ledger producer Skill set digest",
		),
		createdAt: input.createdAt,
	};
	return Object.freeze({...body, headerDigest: canonicalJsonDigest(body)});
}

export function createExecutionLedger(
	header: ExecutionLedgerHeader,
): Readonly<ExecutionLedger> {
	const normalizedHeader = normalizeHeader(header);
	return ledgerFrom(normalizedHeader, []);
}

export function appendExecutionLedgerEntry(
	ledger: ExecutionLedger,
	input: ExecutionLedgerEntryInput,
): Readonly<ExecutionLedger> {
	const normalized = assertExecutionLedger(ledger);
	assertEntryKind(input.kind);
	assertTimestamp(input.occurredAt, "Execution Ledger entry occurredAt");
	if (typeof input.modelVisible !== "boolean") {
		throw new Error("Execution Ledger modelVisible must be boolean.");
	}
	const payload = toCanonicalJsonValue(input.payload);
	const previousDigest = normalized.headDigest;
	const body = {
		sequence: normalized.entries.length,
		kind: input.kind,
		occurredAt: input.occurredAt,
		modelVisible: input.modelVisible,
		payload,
		payloadDigest: canonicalJsonDigest(payload),
		previousDigest,
	};
	const entry = Object.freeze({...body, entryDigest: canonicalJsonDigest(body)});
	return ledgerFrom(normalized.header, [...normalized.entries, entry]);
}

export function assertExecutionLedger(
	value: unknown,
): Readonly<ExecutionLedger> {
	const ledger = record(value, "Execution Ledger");
	if (ledger.schemaVersion !== EXECUTION_LEDGER_SCHEMA_VERSION) {
		throw new Error("Execution Ledger schemaVersion is invalid.");
	}
	const header = normalizeHeader(ledger.header);
	if (!Array.isArray(ledger.entries)) {
		throw new Error("Execution Ledger entries must be an array.");
	}
	let previousDigest = header.headerDigest;
	const entries = ledger.entries.map((entry, sequence) => {
		const normalized = normalizeEntry(entry, sequence, previousDigest);
		previousDigest = normalized.entryDigest;
		return normalized;
	});
	const normalized = ledgerFrom(header, entries);
	if (
		ledger.headDigest !== normalized.headDigest ||
		ledger.ledgerDigest !== normalized.ledgerDigest
	) {
		throw new Error("Execution Ledger head or ledger digest is invalid.");
	}
	return normalized;
}

function ledgerFrom(
	header: ExecutionLedgerHeader,
	entries: readonly ExecutionLedgerEntry[],
): Readonly<ExecutionLedger> {
	const frozenEntries = Object.freeze([...entries]);
	const headDigest = frozenEntries.at(-1)?.entryDigest ?? header.headerDigest;
	const body = {
		schemaVersion: EXECUTION_LEDGER_SCHEMA_VERSION,
		header,
		entries: frozenEntries,
		headDigest,
	};
	return Object.freeze({...body, ledgerDigest: canonicalJsonDigest({
		headerDigest: header.headerDigest,
		entryCount: frozenEntries.length,
		headDigest,
	})});
}

function normalizeHeader(value: unknown): Readonly<ExecutionLedgerHeader> {
	const header = record(value, "Execution Ledger header");
	if (header.schemaVersion !== EXECUTION_LEDGER_SCHEMA_VERSION) {
		throw new Error("Execution Ledger header schemaVersion is invalid.");
	}
	const body = {
		schemaVersion: EXECUTION_LEDGER_SCHEMA_VERSION,
		runId: boundedIdentifier(header.runId, "Execution Ledger Run id"),
		requestDigest: assertSha256Digest(
			header.requestDigest,
			"Execution Ledger request digest",
		),
		runtimeBuildDigest: assertSha256Digest(
			header.runtimeBuildDigest,
			"Execution Ledger Runtime Build digest",
		),
		sessionId: boundedIdentifier(
			header.sessionId,
			"Execution Ledger DSH Agent Session id",
		),
		stageContextDigest: assertSha256Digest(
			header.stageContextDigest,
			"Execution Ledger Stage Context digest",
		),
		staticInputManifestDigest: assertSha256Digest(
			header.staticInputManifestDigest,
			"Execution Ledger static input manifest digest",
		),
		modelRouteDigest: assertSha256Digest(
			header.modelRouteDigest,
			"Execution Ledger model route digest",
		),
		toolSetDigest: assertSha256Digest(
			header.toolSetDigest,
			"Execution Ledger tool set digest",
		),
		producerSkillSetDigest: optionalDigest(
			header.producerSkillSetDigest,
			"Execution Ledger producer Skill set digest",
		),
		createdAt: timestamp(header.createdAt, "Execution Ledger createdAt"),
	};
	const headerDigest = assertSha256Digest(
		header.headerDigest,
		"Execution Ledger header digest",
	);
	if (canonicalJsonDigest(body) !== headerDigest) {
		throw new Error("Execution Ledger header digest is invalid.");
	}
	return Object.freeze({...body, headerDigest});
}

function normalizeEntry(
	value: unknown,
	expectedSequence: number,
	expectedPreviousDigest: Sha256Digest,
): Readonly<ExecutionLedgerEntry> {
	const entry = record(value, "Execution Ledger entry");
	if (entry.sequence !== expectedSequence) {
		throw new Error("Execution Ledger entry sequence is not contiguous.");
	}
	assertEntryKind(entry.kind);
	const occurredAt = timestamp(
		entry.occurredAt,
		"Execution Ledger entry occurredAt",
	);
	if (typeof entry.modelVisible !== "boolean") {
		throw new Error("Execution Ledger entry modelVisible must be boolean.");
	}
	const payload = toCanonicalJsonValue(entry.payload);
	const payloadDigest = assertSha256Digest(
		entry.payloadDigest,
		"Execution Ledger entry payload digest",
	);
	if (canonicalJsonDigest(payload) !== payloadDigest) {
		throw new Error("Execution Ledger entry payload digest is invalid.");
	}
	const previousDigest = assertSha256Digest(
		entry.previousDigest,
		"Execution Ledger previous digest",
	);
	if (previousDigest !== expectedPreviousDigest) {
		throw new Error("Execution Ledger entry hash chain is invalid.");
	}
	const body = {
		sequence: expectedSequence,
		kind: entry.kind,
		occurredAt,
		modelVisible: entry.modelVisible,
		payload,
		payloadDigest,
		previousDigest,
	};
	const entryDigest = assertSha256Digest(
		entry.entryDigest,
		"Execution Ledger entry digest",
	);
	if (canonicalJsonDigest(body) !== entryDigest) {
		throw new Error("Execution Ledger entry digest is invalid.");
	}
	return Object.freeze({...body, entryDigest});
}

function assertEntryKind(value: unknown): asserts value is ExecutionLedgerEntryKind {
	if (!([
		"static-input",
		"stage-context-query",
		"model-request",
		"model-output",
		"tool-call",
		"tool-result",
		"compaction",
		"usage",
		"cancellation",
		"output",
	] as const).includes(value as ExecutionLedgerEntryKind)) {
		throw new Error("Execution Ledger entry kind is invalid.");
	}
}

function optionalDigest(value: unknown, field: string): Sha256Digest | null {
	return value === null ? null : assertSha256Digest(value, field);
}

function boundedIdentifier(value: unknown, field: string): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > 256 ||
		!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
	) {
		throw new Error(`${field} is invalid.`);
	}
	return value;
}

function timestamp(value: unknown, field: string): string {
	assertTimestamp(value, field);
	return value;
}

function assertTimestamp(value: unknown, field: string): asserts value is string {
	if (typeof value !== "string") {
		throw new Error(`${field} is invalid.`);
	}
	const milliseconds = Date.parse(value);
	if (
		!Number.isFinite(milliseconds) ||
		new Date(milliseconds).toISOString() !== value
	) {
		throw new Error(`${field} is invalid.`);
	}
}

function record(value: unknown, field: string): Readonly<Record<string, unknown>> {
	if (
		Object.prototype.toString.call(value) !== "[object Object]" ||
		Object.getPrototypeOf(value) !== Object.prototype
	) {
		throw new Error(`${field} must be an object.`);
	}
	return value as Readonly<Record<string, unknown>>;
}
