import {
	createStageContextQuery,
	createStageContextQueryBatch,
	createStageContextQueryBatchResult,
	createStageContextQueryResult,
	createStageContextSnapshot,
	type StageContextOwner,
	type StageContextQuery,
	type StageContextQueryBatch,
	type StageContextQueryBatchResult,
	type StageContextQueryInput,
	type StageContextQueryResult,
	type StageContextSnapshot,
	type StageContextSourceReference,
} from "./contracts.ts";
import {
	assertSha256Digest,
	canonicalJson,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export const STAGE_CONTEXT_BUNDLE_SCHEMA_VERSION = "1.0.0" as const;
export const STAGE_CONTEXT_BUNDLE_MAX_BYTES = 8 * 1_024 * 1_024;
export const STAGE_CONTEXT_QUERY_ENGINE_ID = "codewiki-stage-context" as const;
export const STAGE_CONTEXT_QUERY_ENGINE_VERSION = "1.0.0" as const;
export const STAGE_CONTEXT_QUERY_ENGINE_DIGEST: Sha256Digest = canonicalJsonDigest({
	id: STAGE_CONTEXT_QUERY_ENGINE_ID,
	version: STAGE_CONTEXT_QUERY_ENGINE_VERSION,
	routeSelection: "owner-operation-canonical-arguments",
	pagination: "digest-bound-offset-cursor",
	unknownRoute: "explicit-unknown-coverage",
	maximumBundleBytes: STAGE_CONTEXT_BUNDLE_MAX_BYTES,
});

export interface StageContextRouteItemInput {
	readonly value: unknown;
	readonly sourceReferences: readonly StageContextSourceReference[];
}

export interface StageContextQueryRouteInput {
	readonly owner: StageContextOwner;
	readonly operation: string;
	readonly arguments: unknown;
	readonly items: readonly StageContextRouteItemInput[];
	readonly coverage: "complete" | "partial" | "unknown";
	readonly unknowns: readonly string[];
	readonly stale: boolean;
}

export interface StageContextRouteItem {
	readonly value: CanonicalJsonValue;
	readonly sourceReferences: readonly StageContextSourceReference[];
}

export interface StageContextQueryRoute {
	readonly owner: StageContextOwner;
	readonly operation: string;
	readonly arguments: CanonicalJsonValue;
	readonly items: readonly StageContextRouteItem[];
	readonly coverage: "complete" | "partial" | "unknown";
	readonly unknowns: readonly string[];
	readonly stale: boolean;
	readonly routeDigest: Sha256Digest;
}

export interface StageContextBundleInput {
	readonly context: StageContextSnapshot;
	readonly routes: readonly StageContextQueryRouteInput[];
}

export interface StageContextBundle {
	readonly schemaVersion: typeof STAGE_CONTEXT_BUNDLE_SCHEMA_VERSION;
	readonly context: StageContextSnapshot;
	readonly routes: readonly StageContextQueryRoute[];
	readonly bundleDigest: Sha256Digest;
}

export interface StageContextQueryExecution {
	readonly query: StageContextQuery;
	readonly result: StageContextQueryResult;
}

export interface StageContextQueryBatchExecution {
	readonly batch: StageContextQueryBatch;
	readonly result: StageContextQueryBatchResult;
}

export interface StageContextFacade {
	readonly context: StageContextSnapshot;
	readonly bundleDigest: Sha256Digest;
	query(input: StageContextQueryInput): Readonly<StageContextQueryExecution>;
	batch(inputs: readonly StageContextQueryInput[]): Readonly<StageContextQueryBatchExecution>;
}

export function createStageContextBundle(
	input: StageContextBundleInput,
): Readonly<StageContextBundle> {
	const context = normalizeContext(input.context);
	if (!Array.isArray(input.routes) || input.routes.length > 1_024) {
		throw new Error("Stage Context bundle routes must contain at most 1024 entries.");
	}
	const routes = input.routes.map(normalizeRoute).sort((left, right) =>
		compareText(left.routeDigest, right.routeDigest)
	);
	for (let index = 1; index < routes.length; index += 1) {
		if (routes[index - 1]?.routeDigest === routes[index]?.routeDigest) {
			throw new Error("Stage Context bundle contains a duplicate admitted route.");
		}
	}
	const body = {
		schemaVersion: STAGE_CONTEXT_BUNDLE_SCHEMA_VERSION,
		context,
		routes: Object.freeze(routes),
	};
	if (Buffer.byteLength(canonicalJson(body)) > STAGE_CONTEXT_BUNDLE_MAX_BYTES) {
		throw new Error("Stage Context bundle exceeds its byte limit.");
	}
	return Object.freeze({...body, bundleDigest: canonicalJsonDigest(body)});
}

export function assertStageContextBundle(value: unknown): Readonly<StageContextBundle> {
	if (!isRecord(value) || !hasExactKeys(value, [
		"schemaVersion",
		"context",
		"routes",
		"bundleDigest",
	])) {
		throw new Error("Stage Context bundle shape is invalid.");
	}
	if (value.schemaVersion !== STAGE_CONTEXT_BUNDLE_SCHEMA_VERSION) {
		throw new Error("Stage Context bundle schemaVersion is invalid.");
	}
	const normalized = createStageContextBundle({
		context: value.context as StageContextSnapshot,
		routes: value.routes as readonly StageContextQueryRouteInput[],
	});
	if (value.bundleDigest !== normalized.bundleDigest) {
		throw new Error("Stage Context bundle digest is invalid.");
	}
	return normalized;
}

export function createStageContextFacade(
	bundleValue: StageContextBundle,
): Readonly<StageContextFacade> {
	const bundle = assertStageContextBundle(bundleValue);
	const routes = new Map(bundle.routes.map((route) => [route.routeDigest, route]));
	const query = (input: StageContextQueryInput): Readonly<StageContextQueryExecution> => {
		const admitted = createStageContextQuery(bundle.context, input);
		const route = routes.get(routeDigest(admitted.owner, admitted.operation, admitted.arguments));
		const offset = admitted.cursor === null
			? 0
			: decodeCursor(admitted.cursor, route?.routeDigest ?? null);
		if (!route) {
			return Object.freeze({
				query: admitted,
				result: createStageContextQueryResult(bundle.context, admitted, {
					items: [],
					sourceReferences: [],
					coverage: "unknown",
					unknowns: ["No admitted Stage Context route matches this query."],
					truncated: false,
					nextCursor: null,
					stale: bundle.context.stale,
				}),
			});
		}
		if (offset > route.items.length) {
			throw new Error("Stage Context query cursor offset exceeds route bounds.");
		}
		const selected = route.items.slice(offset, offset + admitted.limit);
		const nextOffset = offset + selected.length;
		const truncated = nextOffset < route.items.length;
		return Object.freeze({
			query: admitted,
			result: createStageContextQueryResult(bundle.context, admitted, {
				items: selected.map((item) => item.value),
				sourceReferences: uniqueReferences(selected.flatMap((item) => item.sourceReferences)),
				coverage: route.coverage,
				unknowns: route.unknowns,
				truncated,
				nextCursor: truncated ? encodeCursor(route.routeDigest, nextOffset) : null,
				stale: bundle.context.stale || route.stale,
			}),
		});
	};
	return Object.freeze({
		context: bundle.context,
		bundleDigest: bundle.bundleDigest,
		query,
		batch: (inputs: readonly StageContextQueryInput[]) => {
			if (!Array.isArray(inputs)) {
				throw new Error("Stage Context query batch inputs must be an array.");
			}
			const executions = inputs.map(query);
			const batch = createStageContextQueryBatch(
				bundle.context,
				executions.map((execution) => execution.query),
			);
			return Object.freeze({
				batch,
				result: createStageContextQueryBatchResult(
					batch,
					executions.map((execution) => execution.result),
				),
			});
		},
	});
}

function normalizeContext(value: StageContextSnapshot): StageContextSnapshot {
	const normalized = createStageContextSnapshot(value);
	if (value.contextDigest !== normalized.contextDigest) {
		throw new Error("Stage Context snapshot digest is invalid.");
	}
	if (
		normalized.queryEngine.id !== STAGE_CONTEXT_QUERY_ENGINE_ID ||
		normalized.queryEngine.version !== STAGE_CONTEXT_QUERY_ENGINE_VERSION ||
		normalized.queryEngine.digest !== STAGE_CONTEXT_QUERY_ENGINE_DIGEST
	) {
		throw new Error("Stage Context snapshot query engine is not supported.");
	}
	return normalized;
}

function normalizeRoute(value: StageContextQueryRouteInput): StageContextQueryRoute {
	if (!isRecord(value) || !hasExactKeys(value, [
		"owner",
		"operation",
		"arguments",
		"items",
		"coverage",
		"unknowns",
		"stale",
		...(Object.hasOwn(value, "routeDigest") ? ["routeDigest"] : []),
	])) {
		throw new Error("Stage Context query route shape is invalid.");
	}
	assertOwner(value.owner);
	assertIdentifier(value.operation, "Stage Context route operation");
	if (!Array.isArray(value.items) || value.items.length > 100_000) {
		throw new Error("Stage Context route items must contain at most 100000 entries.");
	}
	const items = Object.freeze(value.items.map(normalizeItem));
	const coverage = assertCoverage(value.coverage);
	const unknowns = normalizeUnknowns(value.unknowns);
	if (coverage === "complete" && unknowns.length > 0) {
		throw new Error("Complete Stage Context route coverage cannot contain unknowns.");
	}
	if (typeof value.stale !== "boolean") {
		throw new Error("Stage Context route stale must be boolean.");
	}
	const argumentsValue = toCanonicalJsonValue(value.arguments);
	const digest = routeDigest(value.owner, value.operation, argumentsValue);
	if (Object.hasOwn(value, "routeDigest") && value.routeDigest !== digest) {
		throw new Error("Stage Context route digest is invalid.");
	}
	return Object.freeze({
		owner: value.owner,
		operation: value.operation,
		arguments: argumentsValue,
		items,
		coverage,
		unknowns,
		stale: value.stale,
		routeDigest: digest,
	});
}

function normalizeItem(value: StageContextRouteItemInput): StageContextRouteItem {
	if (!isRecord(value) || !hasExactKeys(value, ["value", "sourceReferences"])) {
		throw new Error("Stage Context route item shape is invalid.");
	}
	return Object.freeze({
		value: toCanonicalJsonValue(value.value),
		sourceReferences: uniqueReferences(value.sourceReferences),
	});
}

function uniqueReferences(
	values: readonly StageContextSourceReference[],
): readonly StageContextSourceReference[] {
	if (!Array.isArray(values) || values.length > 10_000) {
		throw new Error("Stage Context source references must contain at most 10000 entries.");
	}
	const references = values.map((value) => {
		if (!isRecord(value) || !hasExactKeys(value, ["owner", "id", "digest", "location"])) {
			throw new Error("Stage Context source reference shape is invalid.");
		}
		assertOwner(value.owner);
		assertIdentifier(value.id, "Stage Context source reference id");
		const digest = assertSha256Digest(value.digest, "Stage Context source reference digest");
		if (value.location !== null && (typeof value.location !== "string" || value.location.length > 4_096)) {
			throw new Error("Stage Context source reference location is invalid.");
		}
		return Object.freeze({
			owner: value.owner,
			id: value.id,
			digest,
			location: value.location,
		});
	});
	const byDigest = new Map<string, StageContextSourceReference>();
	for (const reference of references) {
		byDigest.set(canonicalJsonDigest(reference), reference);
	}
	return Object.freeze([...byDigest.values()].sort((left, right) =>
		compareText(canonicalJsonDigest(left), canonicalJsonDigest(right))
	));
}

function routeDigest(
	owner: StageContextOwner,
	operation: string,
	argumentsValue: unknown,
): Sha256Digest {
	return canonicalJsonDigest({
		owner,
		operation,
		arguments: toCanonicalJsonValue(argumentsValue),
	});
}

function encodeCursor(route: Sha256Digest, offset: number): string {
	const body = {routeDigest: route, offset};
	return Buffer.from(canonicalJson({...body, cursorDigest: canonicalJsonDigest(body)}))
		.toString("base64url");
}

function decodeCursor(value: string, expectedRoute: Sha256Digest | null): number {
	let parsed: unknown;
	try {
		parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
	} catch {
		throw new Error("Stage Context query cursor is invalid.");
	}
	if (!isRecord(parsed) || !hasExactKeys(parsed, ["routeDigest", "offset", "cursorDigest"])) {
		throw new Error("Stage Context query cursor shape is invalid.");
	}
	const route = assertSha256Digest(parsed.routeDigest, "Stage Context cursor route digest");
	if (expectedRoute === null || route !== expectedRoute) {
		throw new Error("Stage Context query cursor does not match its admitted route.");
	}
	if (!Number.isSafeInteger(parsed.offset) || (parsed.offset as number) < 0) {
		throw new Error("Stage Context query cursor offset is invalid.");
	}
	const body = {routeDigest: route, offset: parsed.offset as number};
	if (parsed.cursorDigest !== canonicalJsonDigest(body)) {
		throw new Error("Stage Context query cursor digest is invalid.");
	}
	return body.offset;
}

function normalizeUnknowns(value: readonly string[]): readonly string[] {
	if (!Array.isArray(value) || value.length > 256) {
		throw new Error("Stage Context route unknowns must contain at most 256 entries.");
	}
	return Object.freeze([...new Set(value.map((entry) => {
		if (typeof entry !== "string" || entry.trim() === "" || entry.length > 4_096) {
			throw new Error("Stage Context route unknown is invalid.");
		}
		return entry;
	}))].sort(compareText));
}

function assertOwner(value: unknown): asserts value is StageContextOwner {
	if (![
		"work-state",
		"knowledge",
		"alignment",
		"repository",
		"change-trace",
		"evidence",
		"check-result",
	].includes(value as string)) {
		throw new Error("Stage Context owner is invalid.");
	}
}

function assertCoverage(value: unknown): "complete" | "partial" | "unknown" {
	if (value !== "complete" && value !== "partial" && value !== "unknown") {
		throw new Error("Stage Context route coverage is invalid.");
	}
	return value;
}

function assertIdentifier(value: unknown, field: string): asserts value is string {
	if (typeof value !== "string" || value.trim() === "" || value.length > 256) {
		throw new Error(`${field} is invalid.`);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
	const actual = Object.keys(value).sort(compareText);
	const sorted = [...expected].sort(compareText);
	return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
