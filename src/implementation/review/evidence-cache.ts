import {
	createImplementationEvidenceReport,
	type ImplementationEvidenceReport,
	type ImplementationEvidenceReportInput,
	type ImplementationReviewPhase,
} from "./evidence-report.ts";

export interface CachedReviewEvidenceEntry {
	id: string;
	createdAt: string;
	traceId?: string;
	sessionId?: string;
	report: ImplementationEvidenceReport;
}

export interface ReviewEvidenceCacheRecordInput {
	report: ImplementationEvidenceReportInput;
	traceId?: string;
	sessionId?: string;
	createdAt?: string;
}

export interface ReviewEvidenceCacheQuery {
	traceId?: string;
	sessionId?: string;
	changedPaths?: string[];
	phases?: ImplementationReviewPhase[];
	maxAgeMs?: number;
	now?: string;
}

export interface ReviewEvidenceCacheReader {
	reports(query?: ReviewEvidenceCacheQuery): ImplementationEvidenceReport[];
}

export interface ReviewEvidenceCache extends ReviewEvidenceCacheReader {
	record(input: ReviewEvidenceCacheRecordInput): CachedReviewEvidenceEntry;
	entries(query?: ReviewEvidenceCacheQuery): CachedReviewEvidenceEntry[];
	clear(): void;
}

export interface InMemoryReviewEvidenceCacheOptions {
	maxEntries?: number;
	defaultTtlMs?: number;
}

export class InMemoryReviewEvidenceCache implements ReviewEvidenceCache {
	#entries: CachedReviewEvidenceEntry[] = [];
	#nextId = 1;
	readonly maxEntries: number;
	readonly defaultTtlMs?: number;

	constructor(options: InMemoryReviewEvidenceCacheOptions = {}) {
		this.maxEntries = options.maxEntries ?? 200;
		this.defaultTtlMs = options.defaultTtlMs;
	}

	record(input: ReviewEvidenceCacheRecordInput): CachedReviewEvidenceEntry {
		const createdAt = input.createdAt || new Date().toISOString();
		const report = createImplementationEvidenceReport({
			createdAt,
			...input.report,
		});
		const entry = {
			id: report.id || `review-evidence-cache:${this.#nextId++}`,
			createdAt,
			...(input.traceId ? { traceId: input.traceId } : {}),
			...(input.sessionId ? { sessionId: input.sessionId } : {}),
			report,
		};
		this.#entries.push(entry);
		this.#entries = this.#entries.slice(-this.maxEntries);
		return entry;
	}

	reports(
		query: ReviewEvidenceCacheQuery = {},
	): ImplementationEvidenceReport[] {
		return this.entries(query).map((entry) => entry.report);
	}

	entries(query: ReviewEvidenceCacheQuery = {}): CachedReviewEvidenceEntry[] {
		const now = Date.parse(query.now || new Date().toISOString());
		const maxAgeMs = query.maxAgeMs ?? this.defaultTtlMs;
		const changedPaths = new Set(normalizePaths(query.changedPaths || []));
		return this.#entries.filter((entry) => {
			if (query.traceId && entry.traceId !== query.traceId) return false;
			if (query.sessionId && entry.sessionId !== query.sessionId) return false;
			if (query.phases && !query.phases.includes(entry.report.phase))
				return false;
			if (maxAgeMs !== undefined) {
				const age = now - Date.parse(entry.createdAt);
				if (!Number.isFinite(age) || age > maxAgeMs) return false;
			}
			if (changedPaths.size > 0) {
				const reportPaths = normalizePaths(entry.report.changedPaths);
				if (!reportPaths.some((path) => changedPaths.has(path))) return false;
			}
			return true;
		});
	}

	clear(): void {
		this.#entries = [];
	}
}

export const defaultReviewEvidenceCache = new InMemoryReviewEvidenceCache();

export function normalizeReviewEvidenceCachePaths(paths: string[]): string[] {
	return normalizePaths(paths);
}

function normalizePaths(paths: string[]): string[] {
	return Array.from(
		new Set(
			paths
				.map((path) => path.trim().replace(/\\/g, "/").replace(/^\.\//, ""))
				.filter(Boolean),
		),
	);
}
