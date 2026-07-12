import type { TraceEvent, TraceRecord } from "../traces/types.ts";

export type ActivityFeedStatus =
	| "progress"
	| "success"
	| "blocked"
	| "failure"
	| "info";

export interface ActivityFeedItem {
	id: string;
	headline: string;
	detail: string;
	impact: string;
	nextAction: string;
	status: ActivityFeedStatus;
	createdAt?: string;
	evidenceRefs: string[];
	source: "durable" | "live" | "stale";
}

export function buildActivityFeed(
	records: TraceRecord[],
	workTitles: ReadonlyMap<string, string> = new Map(),
	limit = 20,
): ActivityFeedItem[] {
	if (!Number.isInteger(limit) || limit < 1 || limit > 100)
		throw new Error("Activity Feed limit must be an integer from 1 to 100.");
	const narrated = records
		.filter((record): record is TraceEvent => record.type === "trace_event")
		.map((event) => narrateEvent(event, workTitles))
		.filter((item): item is ActivityFeedItem => Boolean(item));
	return coalesce(narrated).slice(-limit).reverse();
}

function narrateEvent(
	event: TraceEvent,
	workTitles: ReadonlyMap<string, string>,
): ActivityFeedItem | undefined {
	const data = record(event.data);
	const workUnitId = text(data?.workUnitId);
	const workerId = text(data?.workerId);
	const title = workUnitId ? workTitles.get(workUnitId) || workUnitId : undefined;
	const base = {
		id: event.id,
		createdAt: event.createdAt,
		evidenceRefs: [...event.refs],
		source: "durable" as const,
	};
	if (event.event === "runtime.work_unit.claimed" && title) {
		return {
			...base,
			headline: `${title} started`,
			detail: `${workerId || "A worker"} claimed this Task and began scoped work.`,
			impact: "Implementation work is now in progress.",
			nextAction: "Waiting for the worker's next verified milestone.",
			status: "progress",
		};
	}
	if (event.event === "runtime.work_unit.claim.released" && title) {
		const status = text(data?.status) || "released";
		if (status === "completed") {
			return {
				...base,
				headline: `${title} completed`,
				detail: `${workerId || "The worker"} returned its scoped result and evidence.`,
				impact: "This Task is ready for aggregate Implementation review.",
				nextAction: "Collect remaining results and run integration checks.",
				status: "success",
			};
		}
		return {
			...base,
			headline: `${title} ${status}`,
			detail: `${workerId || "The worker"} released this Task with status ${status}.`,
			impact:
				status === "blocked"
					? "Implementation cannot finish until this blocker is resolved."
					: "This Task needs another execution attempt.",
			nextAction:
				status === "blocked"
					? "Resolve the reported blocker or route work to its authority owner."
					: "Review the failure and retry the Task.",
			status: status === "blocked" ? "blocked" : "failure",
		};
	}
	if (event.event === "changes_approved") {
		const count = objects(record(data?.output)?.approvedChanges).length;
		return {
			...base,
			headline: "Decision approved",
			detail: count ? `${count} approved change${count === 1 ? "" : "s"} can now be planned.` : "Approved intent can now be planned.",
			impact: "Product and system direction is settled for this iteration.",
			nextAction: "Planning will turn the approved change into executable Tasks.",
			status: "success",
		};
	}
	if (event.event === "work_units_created") {
		const count = objects(record(data?.output)?.workItems).length;
		return {
			...base,
			headline: "Implementation plan ready",
			detail: count ? `${count} Task${count === 1 ? " is" : "s are"} ready for dependency-aware execution.` : "Executable Tasks were created.",
			impact: "Workers can now claim ready work without overlapping path ownership.",
			nextAction: "Start ready Tasks and report meaningful worker milestones.",
			status: "success",
		};
	}
	if (event.event === "evidence_accepted") {
		return {
			...base,
			headline: "Implementation evidence accepted",
			detail: "Changed paths, checks, acceptance evidence, and content proof passed review.",
			impact: "Verified work can count toward aggregate Implementation completion.",
			nextAction: "Continue remaining Tasks or close the trace when all work is covered.",
			status: "success",
		};
	}
	if (event.event === "runtime.host.blocked") {
		return {
			...base,
			headline: "Runtime is blocked",
			detail: "The runtime host reported a blocker that prevents safe progress.",
			impact: "No further autonomous execution should occur for this work.",
			nextAction: "Review the blocker and route it to the named authority owner.",
			status: "blocked",
		};
	}
	return undefined;
}

function coalesce(items: ActivityFeedItem[]): ActivityFeedItem[] {
	const result: ActivityFeedItem[] = [];
	for (const item of items) {
		const previous = result.at(-1);
		if (previous && previous.headline === item.headline && previous.status === item.status) {
			result[result.length - 1] = item;
		} else result.push(item);
	}
	return result;
}

function record(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function objects(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter((item): item is Record<string, unknown> => Boolean(record(item)))
		: [];
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
