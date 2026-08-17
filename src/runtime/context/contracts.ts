import type {CheckStage} from "../../checks/contracts.ts";
import {
	assertSha256Digest,
	canonicalJson,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export const STAGE_CONTEXT_SCHEMA_VERSION = "1.0.0" as const;
export const STAGE_CONTEXT_QUERY_SCHEMA_VERSION = "1.0.0" as const;

export type StageContextOwner =
	| "work-state"
	| "knowledge"
	| "alignment"
	| "repository"
	| "change"
	| "evidence"
	| "result";

export interface StageContextSourceSnapshots {
	readonly workState: Sha256Digest;
	readonly knowledge: Sha256Digest;
	readonly alignment: Sha256Digest;
	readonly repository: Sha256Digest;
	readonly change: Sha256Digest;
	readonly evidence: Sha256Digest;
	readonly result: Sha256Digest;
}

export interface StageContextSnapshotInput {
	readonly stage: CheckStage;
	readonly subject: {
		readonly id: string;
		readonly digest: Sha256Digest;
	};
	readonly changeRevisionDigest: Sha256Digest;
	readonly sources: StageContextSourceSnapshots;
	readonly producerSkillSetDigest: Sha256Digest | null;
	readonly gateFeedbackDigest: Sha256Digest | null;
	readonly capturedAt: string;
	readonly stale: boolean;
	readonly coverage: {
		readonly status: "complete" | "partial" | "unknown";
		readonly unknowns: readonly string[];
	};
	readonly queryEngine: {
		readonly id: string;
		readonly version: string;
		readonly digest: Sha256Digest;
	};
}

export interface StageContextSnapshot extends StageContextSnapshotInput {
	readonly schemaVersion: typeof STAGE_CONTEXT_SCHEMA_VERSION;
	readonly contextDigest: Sha256Digest;
}

export interface StageContextQueryInput {
	readonly owner: StageContextOwner;
	readonly operation: string;
	readonly arguments: unknown;
	readonly limit: number;
	readonly cursor: string | null;
}

export interface StageContextQuery {
	readonly schemaVersion: typeof STAGE_CONTEXT_QUERY_SCHEMA_VERSION;
	readonly contextDigest: Sha256Digest;
	readonly owner: StageContextOwner;
	readonly operation: string;
	readonly arguments: CanonicalJsonValue;
	readonly limit: number;
	readonly cursor: string | null;
	readonly queryDigest: Sha256Digest;
}

export interface StageContextSourceReference {
	readonly owner: StageContextOwner;
	readonly id: string;
	readonly digest: Sha256Digest;
	readonly location: string | null;
}

export interface StageContextQueryResultInput {
	readonly items: readonly unknown[];
	readonly sourceReferences: readonly StageContextSourceReference[];
	readonly coverage: "complete" | "partial" | "unknown";
	readonly unknowns: readonly string[];
	readonly truncated: boolean;
	readonly nextCursor: string | null;
	readonly stale: boolean;
}

export interface StageContextQueryResult {
	readonly schemaVersion: typeof STAGE_CONTEXT_QUERY_SCHEMA_VERSION;
	readonly contextDigest: Sha256Digest;
	readonly queryDigest: Sha256Digest;
	readonly items: readonly CanonicalJsonValue[];
	readonly sourceReferences: readonly StageContextSourceReference[];
	readonly coverage: "complete" | "partial" | "unknown";
	readonly unknowns: readonly string[];
	readonly truncated: boolean;
	readonly nextCursor: string | null;
	readonly stale: boolean;
	readonly resultDigest: Sha256Digest;
}

export interface StageContextQueryBatch {
	readonly schemaVersion: typeof STAGE_CONTEXT_QUERY_SCHEMA_VERSION;
	readonly contextDigest: Sha256Digest;
	readonly queries: readonly StageContextQuery[];
	readonly batchDigest: Sha256Digest;
}

export interface StageContextQueryBatchResult {
	readonly schemaVersion: typeof STAGE_CONTEXT_QUERY_SCHEMA_VERSION;
	readonly contextDigest: Sha256Digest;
	readonly batchDigest: Sha256Digest;
	readonly results: readonly StageContextQueryResult[];
	readonly resultDigest: Sha256Digest;
}

export function createStageContextSnapshot(
	input: StageContextSnapshotInput,
): Readonly<StageContextSnapshot> {
	assertStage(input.stage);
	assertIdentifier(input.subject?.id, "Stage Context subject id");
	assertSha256Digest(input.subject?.digest, "Stage Context subject digest");
	assertSha256Digest(
		input.changeRevisionDigest,
		"Stage Context Change revision digest",
	);
	const sources = normalizeSources(input.sources);
	optionalDigest(input.producerSkillSetDigest, "Stage Context Skill set digest");
	optionalDigest(input.gateFeedbackDigest, "Stage Context Gate feedback digest");
	assertTimestamp(input.capturedAt, "Stage Context capturedAt");
	if (typeof input.stale !== "boolean") {
		throw new Error("Stage Context stale must be boolean.");
	}
	const coverage = normalizeCoverage(input.coverage);
	const queryEngine = normalizeQueryEngine(input.queryEngine);
	const body = {
		schemaVersion: STAGE_CONTEXT_SCHEMA_VERSION,
		stage: input.stage,
		subject: Object.freeze({
			id: input.subject.id,
			digest: input.subject.digest,
		}),
		changeRevisionDigest: input.changeRevisionDigest,
		sources,
		producerSkillSetDigest: input.producerSkillSetDigest,
		gateFeedbackDigest: input.gateFeedbackDigest,
		capturedAt: input.capturedAt,
		stale: input.stale,
		coverage,
		queryEngine,
	};
	return Object.freeze({
		...body,
		contextDigest: canonicalJsonDigest(body),
	});
}

export function createStageContextQuery(
	context: StageContextSnapshot,
	input: StageContextQueryInput,
): Readonly<StageContextQuery> {
	assertSha256Digest(context?.contextDigest, "Stage Context digest");
	assertOwner(input.owner);
	assertIdentifier(input.operation, "Stage Context query operation");
	assertBoundedInteger(input.limit, "Stage Context query limit", 1, 1_000);
	const cursor = optionalText(input.cursor, "Stage Context query cursor", 4_096);
	const body = {
		schemaVersion: STAGE_CONTEXT_QUERY_SCHEMA_VERSION,
		contextDigest: context.contextDigest,
		owner: input.owner,
		operation: input.operation,
		arguments: toCanonicalJsonValue(input.arguments),
		limit: input.limit,
		cursor,
	};
	return Object.freeze({...body, queryDigest: canonicalJsonDigest(body)});
}

export function createStageContextQueryResult(
	context: StageContextSnapshot,
	query: StageContextQuery,
	input: StageContextQueryResultInput,
): Readonly<StageContextQueryResult> {
	assertQueryBinding(context, query);
	if (!Array.isArray(input.items) || input.items.length > query.limit) {
		throw new Error("Stage Context query items exceed the admitted limit.");
	}
	const coverage = coverageStatus(input.coverage);
	const unknowns = normalizedTextSet(
		input.unknowns,
		"Stage Context query unknown",
		256,
	);
	if (coverage === "complete" && unknowns.length > 0) {
		throw new Error("Complete Stage Context query coverage cannot contain unknowns.");
	}
	if (typeof input.truncated !== "boolean" || typeof input.stale !== "boolean") {
		throw new Error("Stage Context query truncation and staleness must be boolean.");
	}
	const nextCursor = optionalText(
		input.nextCursor,
		"Stage Context query next cursor",
		4_096,
	);
	if (input.truncated !== (nextCursor !== null)) {
		throw new Error("Stage Context query truncation must agree with next cursor.");
	}
	const body = {
		schemaVersion: STAGE_CONTEXT_QUERY_SCHEMA_VERSION,
		contextDigest: context.contextDigest,
		queryDigest: query.queryDigest,
		items: Object.freeze(input.items.map((item) => toCanonicalJsonValue(item))),
		sourceReferences: normalizeSourceReferences(input.sourceReferences),
		coverage,
		unknowns,
		truncated: input.truncated,
		nextCursor,
		stale: input.stale,
	};
	return Object.freeze({...body, resultDigest: canonicalJsonDigest(body)});
}

export function createStageContextQueryBatch(
	context: StageContextSnapshot,
	queries: readonly StageContextQuery[],
): Readonly<StageContextQueryBatch> {
	if (!Array.isArray(queries) || queries.length === 0 || queries.length > 64) {
		throw new Error("Stage Context query batch must contain 1 to 64 queries.");
	}
	const digests = new Set<string>();
	for (const query of queries) {
		assertQueryBinding(context, query);
		if (digests.has(query.queryDigest)) {
			throw new Error("Stage Context query batch contains a duplicate query.");
		}
		digests.add(query.queryDigest);
	}
	const body = {
		schemaVersion: STAGE_CONTEXT_QUERY_SCHEMA_VERSION,
		contextDigest: context.contextDigest,
		queries: Object.freeze([...queries]),
	};
	return Object.freeze({...body, batchDigest: canonicalJsonDigest(body)});
}

export function createStageContextQueryBatchResult(
	batch: StageContextQueryBatch,
	results: readonly StageContextQueryResult[],
): Readonly<StageContextQueryBatchResult> {
	if (!Array.isArray(results) || results.length !== batch.queries.length) {
		throw new Error("Stage Context batch result count does not match its queries.");
	}
	for (let index = 0; index < results.length; index += 1) {
		const result = results[index];
		const query = batch.queries[index];
		if (
			!result ||
			!query ||
			result.contextDigest !== batch.contextDigest ||
			result.queryDigest !== query.queryDigest
		) {
			throw new Error("Stage Context batch result order or binding is invalid.");
		}
	}
	const body = {
		schemaVersion: STAGE_CONTEXT_QUERY_SCHEMA_VERSION,
		contextDigest: batch.contextDigest,
		batchDigest: batch.batchDigest,
		results: Object.freeze([...results]),
	};
	return Object.freeze({...body, resultDigest: canonicalJsonDigest(body)});
}

function normalizeSources(
	value: StageContextSourceSnapshots,
): Readonly<StageContextSourceSnapshots> {
	if (!value || typeof value !== "object") {
		throw new Error("Stage Context source snapshots must be an object.");
	}
	const normalized = {
		workState: assertSha256Digest(value.workState, "WorkState snapshot digest"),
		knowledge: assertSha256Digest(value.knowledge, "Knowledge snapshot digest"),
		alignment: assertSha256Digest(value.alignment, "Alignment snapshot digest"),
		repository: assertSha256Digest(value.repository, "repository snapshot digest"),
		change: assertSha256Digest(value.change, "Change snapshot digest"),
		evidence: assertSha256Digest(value.evidence, "Evidence snapshot digest"),
		result: assertSha256Digest(value.result, "Result snapshot digest"),
	};
	return Object.freeze(normalized);
}

function normalizeCoverage(
	value: StageContextSnapshotInput["coverage"],
): StageContextSnapshot["coverage"] {
	if (!value || typeof value !== "object") {
		throw new Error("Stage Context coverage must be an object.");
	}
	const status = coverageStatus(value.status);
	const unknowns = normalizedTextSet(value.unknowns, "Stage Context unknown", 256);
	if (status === "complete" && unknowns.length > 0) {
		throw new Error("Complete Stage Context coverage cannot contain unknowns.");
	}
	return Object.freeze({status, unknowns});
}

function normalizeQueryEngine(
	value: StageContextSnapshotInput["queryEngine"],
): StageContextSnapshot["queryEngine"] {
	if (!value || typeof value !== "object") {
		throw new Error("Stage Context query engine must be an object.");
	}
	assertIdentifier(value.id, "Stage Context query engine id");
	assertIdentifier(value.version, "Stage Context query engine version");
	assertSha256Digest(value.digest, "Stage Context query engine digest");
	return Object.freeze({id: value.id, version: value.version, digest: value.digest});
}

function normalizeSourceReferences(
	values: readonly StageContextSourceReference[],
): readonly StageContextSourceReference[] {
	if (!Array.isArray(values) || values.length > 1_000) {
		throw new Error("Stage Context source references are invalid.");
	}
	const normalized = values.map((value) => {
		assertOwner(value.owner);
		assertIdentifier(value.id, "Stage Context source reference id");
		assertSha256Digest(value.digest, "Stage Context source reference digest");
		return Object.freeze({
			owner: value.owner,
			id: value.id,
			digest: value.digest,
			location: optionalText(
				value.location,
				"Stage Context source reference location",
				8_192,
			),
		});
	});
	normalized.sort((left, right) => compareText(canonicalJson(left), canonicalJson(right)));
	for (let index = 1; index < normalized.length; index += 1) {
		if (canonicalJson(normalized[index - 1]) === canonicalJson(normalized[index])) {
			throw new Error("Stage Context source references contain a duplicate.");
		}
	}
	return Object.freeze(normalized);
}

function assertQueryBinding(
	context: StageContextSnapshot,
	query: StageContextQuery,
): void {
	assertSha256Digest(context?.contextDigest, "Stage Context digest");
	assertSha256Digest(query?.queryDigest, "Stage Context query digest");
	if (query.contextDigest !== context.contextDigest) {
		throw new Error("Stage Context query belongs to another snapshot.");
	}
	const {queryDigest: _queryDigest, ...body} = query;
	if (canonicalJsonDigest(body) !== query.queryDigest) {
		throw new Error("Stage Context query digest is invalid.");
	}
}

function normalizedTextSet(
	values: readonly string[],
	field: string,
	maximumCount: number,
): readonly string[] {
	if (!Array.isArray(values) || values.length > maximumCount) {
		throw new Error(`${field} list is invalid.`);
	}
	const normalized = values.map((value) => boundedText(value, field, 8_192));
	normalized.sort(compareText);
	if (new Set(normalized).size !== normalized.length) {
		throw new Error(`${field} list contains a duplicate.`);
	}
	return Object.freeze(normalized);
}

function assertStage(value: unknown): asserts value is CheckStage {
	if (!(["decision", "planning", "implementation", "review"] as const).includes(
		value as CheckStage,
	)) {
		throw new Error("Stage Context stage is invalid.");
	}
}

function assertOwner(value: unknown): asserts value is StageContextOwner {
	if (!([
		"work-state",
		"knowledge",
		"alignment",
		"repository",
		"change",
		"evidence",
		"result",
	] as const).includes(value as StageContextOwner)) {
		throw new Error("Stage Context owner is invalid.");
	}
}

function coverageStatus(
	value: unknown,
): "complete" | "partial" | "unknown" {
	if (value !== "complete" && value !== "partial" && value !== "unknown") {
		throw new Error("Stage Context coverage status is invalid.");
	}
	return value;
}

function optionalDigest(value: unknown, field: string): void {
	if (value !== null) assertSha256Digest(value, field);
}

function assertIdentifier(value: unknown, field: string): asserts value is string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > 256 ||
		!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
	) {
		throw new Error(`${field} is invalid.`);
	}
}

function boundedText(value: unknown, field: string, maximum: number): string {
	if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
		throw new Error(`${field} is invalid.`);
	}
	return value;
}

function optionalText(
	value: unknown,
	field: string,
	maximum: number,
): string | null {
	return value === null ? null : boundedText(value, field, maximum);
}

function assertBoundedInteger(
	value: unknown,
	field: string,
	minimum: number,
	maximum: number,
): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
		throw new Error(`${field} is invalid.`);
	}
}

function assertTimestamp(value: unknown, field: string): asserts value is string {
	if (
		typeof value !== "string" ||
		!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
		Number.isNaN(Date.parse(value))
	) {
		throw new Error(`${field} is invalid.`);
	}
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
