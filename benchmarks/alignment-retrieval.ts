import { performance } from "node:perf_hooks";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../src/utils/canonical-json.ts";

const ALIGNMENT_RETRIEVAL_METHODS = Object.freeze([
	"plain_search",
	"pi_lens",
	"okf_source_projection",
	"alignment_graph",
	"graphify",
] as const);

export type AlignmentRetrievalMethod =
	(typeof ALIGNMENT_RETRIEVAL_METHODS)[number];

interface AlignmentBenchmarkCase {
	readonly id: string;
	readonly query: string;
	readonly relevantRefs: readonly string[];
}

export interface AlignmentRetrievalRequest {
	readonly caseId: string;
	readonly query: string;
	readonly snapshotDigest: Sha256Digest;
	readonly maxResults: number;
}

interface AlignmentRetrievalResponse {
	readonly refs: readonly string[];
}

export interface AlignmentRetrievalAdapter {
	readonly method: AlignmentRetrievalMethod;
	readonly available: boolean;
	readonly unavailableReason?: string;
	readonly retrieve: (
		request: AlignmentRetrievalRequest,
	) => AlignmentRetrievalResponse | Promise<AlignmentRetrievalResponse>;
}

interface AlignmentBenchmarkCaseResult {
	readonly caseId: string;
	readonly returnedRefs: readonly string[];
	readonly relevantReturned: readonly string[];
	readonly falsePositiveRefs: readonly string[];
	readonly recall: number;
	readonly precision: number;
	readonly durationMs: number;
}

interface AlignmentBenchmarkMethodResult {
	readonly method: AlignmentRetrievalMethod;
	readonly status: "available" | "unavailable" | "error";
	readonly unavailableReason: string | null;
	readonly caseCount: number;
	readonly meanRecall: number | null;
	readonly meanPrecision: number | null;
	readonly falsePositiveRate: number | null;
	readonly successAtOneRate: number | null;
	readonly medianDurationMs: number | null;
	readonly caseResults: readonly AlignmentBenchmarkCaseResult[];
	readonly error: string | null;
}

interface AlignmentBenchmarkReport {
	readonly snapshotDigest: Sha256Digest;
	readonly maxResults: number;
	readonly caseIds: readonly string[];
	readonly methods: readonly AlignmentBenchmarkMethodResult[];
	readonly reportDigest: Sha256Digest;
}

interface RunAlignmentBenchmarkInput {
	readonly snapshotDigest: Sha256Digest;
	readonly maxResults: number;
	readonly cases: readonly AlignmentBenchmarkCase[];
	readonly adapters: readonly AlignmentRetrievalAdapter[];
	readonly now?: () => number;
}

export async function runAlignmentRetrievalBenchmark(
	input: RunAlignmentBenchmarkInput,
): Promise<AlignmentBenchmarkReport> {
	assertBenchmarkInput(input);
	const now = input.now ?? performance.now.bind(performance);
	const adapters = new Map(input.adapters.map((adapter) => [adapter.method, adapter]));
	const methods: AlignmentBenchmarkMethodResult[] = [];
	for (const method of ALIGNMENT_RETRIEVAL_METHODS) {
		const adapter = adapters.get(method);
		if (!adapter?.available) {
			methods.push(unavailableResult(method, adapter?.unavailableReason));
			continue;
		}
		try {
			const caseResults: AlignmentBenchmarkCaseResult[] = [];
			for (const benchmarkCase of input.cases) {
				caseResults.push(
					await runCase({
						adapter,
						benchmarkCase,
						snapshotDigest: input.snapshotDigest,
						maxResults: input.maxResults,
						now,
					}),
				);
			}
			methods.push(availableResult(method, caseResults));
		} catch (error) {
			methods.push(errorResult(method, error));
		}
	}
	const body = {
		snapshotDigest: input.snapshotDigest,
		maxResults: input.maxResults,
		caseIds: input.cases.map((entry) => entry.id),
		methods,
	};
	return canonicalValue({...body, reportDigest: canonicalJsonDigest(body)});
}

interface RunAlignmentBenchmarkCaseInput {
	readonly adapter: AlignmentRetrievalAdapter;
	readonly benchmarkCase: AlignmentBenchmarkCase;
	readonly snapshotDigest: Sha256Digest;
	readonly maxResults: number;
	readonly now: () => number;
}

async function runCase(
	input: RunAlignmentBenchmarkCaseInput,
): Promise<AlignmentBenchmarkCaseResult> {
	const started = input.now();
	const response = await input.adapter.retrieve({
		caseId: input.benchmarkCase.id,
		query: input.benchmarkCase.query,
		snapshotDigest: input.snapshotDigest,
		maxResults: input.maxResults,
	});
	const durationMs = Math.max(0, input.now() - started);
	if (!response || !Array.isArray(response.refs) || !response.refs.every(isText)) {
		throw new Error(
			`Alignment retrieval adapter ${input.adapter.method} returned invalid refs.`,
		);
	}
	const returnedRefs = [...new Set(response.refs)].slice(0, input.maxResults);
	const relevant = new Set(input.benchmarkCase.relevantRefs);
	const relevantReturned = returnedRefs.filter((ref) => relevant.has(ref));
	const falsePositiveRefs = returnedRefs.filter((ref) => !relevant.has(ref));
	return {
		caseId: input.benchmarkCase.id,
		returnedRefs,
		relevantReturned,
		falsePositiveRefs,
		recall: relevantReturned.length / relevant.size,
		precision:
			returnedRefs.length === 0 ? 0 : relevantReturned.length / returnedRefs.length,
		durationMs,
	};
}

function availableResult(
	method: AlignmentRetrievalMethod,
	caseResults: readonly AlignmentBenchmarkCaseResult[],
): AlignmentBenchmarkMethodResult {
	const returnedCount = sum(
		caseResults.map((result) => result.returnedRefs.length),
	);
	const falsePositiveCount = sum(
		caseResults.map((result) => result.falsePositiveRefs.length),
	);
	return {
		method,
		status: "available",
		unavailableReason: null,
		caseCount: caseResults.length,
		meanRecall: mean(caseResults.map((result) => result.recall)),
		meanPrecision: mean(caseResults.map((result) => result.precision)),
		falsePositiveRate:
			returnedCount === 0 ? 0 : falsePositiveCount / returnedCount,
		successAtOneRate: mean(
			caseResults.map((result) =>
				result.returnedRefs[0] &&
				result.relevantReturned.includes(result.returnedRefs[0])
					? 1
					: 0,
			),
		),
		medianDurationMs: median(
			caseResults.map((result) => result.durationMs),
		),
		caseResults,
		error: null,
	};
}

function unavailableResult(
	method: AlignmentRetrievalMethod,
	reason = "adapter_not_configured",
): AlignmentBenchmarkMethodResult {
	return {
		method,
		status: "unavailable",
		unavailableReason: reason,
		caseCount: 0,
		meanRecall: null,
		meanPrecision: null,
		falsePositiveRate: null,
		successAtOneRate: null,
		medianDurationMs: null,
		caseResults: [],
		error: null,
	};
}

function errorResult(
	method: AlignmentRetrievalMethod,
	error: unknown,
): AlignmentBenchmarkMethodResult {
	return {
		...unavailableResult(method, "adapter_failed"),
		status: "error",
		unavailableReason: null,
		error: error instanceof Error ? error.message : String(error),
	};
}

function assertBenchmarkInput(input: RunAlignmentBenchmarkInput): void {
	assertSha256Digest(input.snapshotDigest, "Alignment benchmark snapshotDigest");
	if (!Number.isInteger(input.maxResults) || input.maxResults < 1 || input.maxResults > 100) {
		throw new Error("Alignment benchmark maxResults must be an integer from 1 to 100.");
	}
	if (input.cases.length === 0) {
		throw new Error("Alignment benchmark requires at least one case.");
	}
	const caseIds = input.cases.map((entry) => entry.id);
	if (new Set(caseIds).size !== caseIds.length) {
		throw new Error("Alignment benchmark case IDs must be unique.");
	}
	for (const benchmarkCase of input.cases) {
		if (!isText(benchmarkCase.id) || !isText(benchmarkCase.query)) {
			throw new Error("Alignment benchmark case IDs and queries must be non-empty.");
		}
		if (
			benchmarkCase.relevantRefs.length === 0 ||
			!benchmarkCase.relevantRefs.every(isText)
		) {
			throw new Error(`Alignment benchmark case ${benchmarkCase.id} has no valid relevance set.`);
		}
	}
	const methods = input.adapters.map((adapter) => adapter.method);
	if (new Set(methods).size !== methods.length) {
		throw new Error("Alignment benchmark adapter methods must be unique.");
	}
	if (methods.some((method) => !ALIGNMENT_RETRIEVAL_METHODS.includes(method))) {
		throw new Error("Alignment benchmark adapter method is unsupported.");
	}
}

function isText(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function mean(values: readonly number[]): number {
	return sum(values) / values.length;
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((left, right) => left - right);
	const midpoint = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[midpoint - 1] + sorted[midpoint]) / 2
		: sorted[midpoint];
}

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

function canonicalValue<T>(value: unknown): T {
	return toCanonicalJsonValue(value) as unknown as T;
}
