import type { DevLogEntry } from "../runtime/dev-log.ts";

export interface DashboardDevLogItem {
	id: string;
	timestamp: string;
	workUnitId?: string;
	workerId?: string;
	attemptId?: string;
	category: DevLogEntry["category"];
	action: string;
	status: DevLogEntry["status"];
	durationMs?: number;
	exitCode?: number;
	summary?: string;
	refs: string[];
	redacted: boolean;
}

export interface DashboardDevLogProjection {
	available: boolean;
	entryCount: number;
	items: DashboardDevLogItem[];
}

export function projectDevLog(
	entries: DevLogEntry[] | undefined,
	limit = 200,
): DashboardDevLogProjection {
	if (!Number.isInteger(limit) || limit < 1 || limit > 1_000)
		throw new Error("Dashboard Dev Log limit must be an integer from 1 to 1000.");
	if (!entries) return { available: false, entryCount: 0, items: [] };
	return {
		available: true,
		entryCount: entries.length,
		items: entries.slice(-limit).reverse().map((entry) => ({
			id: entry.id,
			timestamp: entry.timestamp,
			...(entry.workUnitId ? { workUnitId: entry.workUnitId } : {}),
			...(entry.workerId ? { workerId: entry.workerId } : {}),
			...(entry.attemptId ? { attemptId: entry.attemptId } : {}),
			category: entry.category,
			action: entry.action,
			status: entry.status,
			...(entry.durationMs === undefined ? {} : { durationMs: entry.durationMs }),
			...(entry.exitCode === undefined ? {} : { exitCode: entry.exitCode }),
			...(entry.summary ? { summary: entry.summary } : {}),
			refs: [...(entry.refs ?? [])],
			redacted: Boolean(entry.redactions?.length),
		})),
	};
}
