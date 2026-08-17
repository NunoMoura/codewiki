import type {
	QueuedProjectServerHeartbeat,
	ProjectServerHeartbeatIntent,
	ProjectServerHeartbeatRequest,
} from "./types.ts";

const HEARTBEAT_PRIORITY: Record<ProjectServerHeartbeatIntent, number> = {
	retry: 0,
	scheduled: 1,
	event: 2,
	immediate: 3,
	manual: 4,
};

export interface ProjectServerHeartbeatQueueSnapshot {
	pending: QueuedProjectServerHeartbeat[];
	count: number;
}

export class ProjectServerHeartbeatQueue {
	readonly #pending = new Map<string, QueuedProjectServerHeartbeat>();
	readonly #now: () => number;

	constructor(options: { now?: () => number } = {}) {
		this.#now = options.now || Date.now;
	}

	get size(): number {
		return this.#pending.size;
	}

	request(input: ProjectServerHeartbeatRequest): QueuedProjectServerHeartbeat {
		const heartbeat = queuedHeartbeat(input, this.#now());
		const previous = this.#pending.get(heartbeat.key);
		if (!previous) {
			this.#pending.set(heartbeat.key, heartbeat);
			return heartbeat;
		}
		const merged = mergeHeartbeat(previous, heartbeat);
		this.#pending.set(heartbeat.key, merged);
		return merged;
	}

	drain(): QueuedProjectServerHeartbeat[] {
		const pending = sortedHeartbeats(this.#pending.values());
		this.#pending.clear();
		return pending;
	}

	peek(): QueuedProjectServerHeartbeat[] {
		return sortedHeartbeats(this.#pending.values());
	}

	clear(): void {
		this.#pending.clear();
	}

	snapshot(): ProjectServerHeartbeatQueueSnapshot {
		const pending = this.peek();
		return { pending, count: pending.length };
	}
}

export function createProjectServerHeartbeatQueue(
	options: { now?: () => number } = {},
): ProjectServerHeartbeatQueue {
	return new ProjectServerHeartbeatQueue(options);
}

export function runtimeHeartbeatPriority(
	intent: ProjectServerHeartbeatIntent,
): number {
	return HEARTBEAT_PRIORITY[intent];
}

export function runtimeHeartbeatKey(input: ProjectServerHeartbeatRequest): string {
	const traceId = normalized(input.traceId);
	const triggerId = normalized(input.triggerId);
	const workUnitId = normalized(input.workUnitId);
	const sessionId = normalized(input.sessionId);
	if (workUnitId) return `work:${workUnitId}`;
	if (triggerId) return `trigger:${triggerId}`;
	if (traceId) return `trace:${traceId}`;
	if (sessionId) return `session:${sessionId}`;
	return "repo";
}

function queuedHeartbeat(
	input: ProjectServerHeartbeatRequest,
	now: number,
): QueuedProjectServerHeartbeat {
	const requestedAt = Number.isFinite(input.requestedAt)
		? Number(input.requestedAt)
		: now;
	return {
		key: runtimeHeartbeatKey(input),
		source: input.source,
		intent: input.intent,
		reason: normalized(input.reason) || input.source,
		priority: runtimeHeartbeatPriority(input.intent),
		requestedAt,
		...(normalized(input.traceId)
			? { traceId: normalized(input.traceId) }
			: {}),
		...(normalized(input.triggerId)
			? { triggerId: normalized(input.triggerId) }
			: {}),
		...(normalized(input.workUnitId)
			? { workUnitId: normalized(input.workUnitId) }
			: {}),
		...(normalized(input.sessionId)
			? { sessionId: normalized(input.sessionId) }
			: {}),
		refs: unique(input.refs || []),
		...(input.data ? { data: { ...input.data } } : {}),
		coalescedCount: 1,
	};
}

function mergeHeartbeat(
	previous: QueuedProjectServerHeartbeat,
	next: QueuedProjectServerHeartbeat,
): QueuedProjectServerHeartbeat {
	const chosen = shouldReplaceHeartbeat(previous, next) ? next : previous;
	return {
		...chosen,
		refs: unique([...previous.refs, ...next.refs]),
		data: { ...(previous.data || {}), ...(next.data || {}) },
		coalescedCount: previous.coalescedCount + 1,
	};
}

function shouldReplaceHeartbeat(
	previous: QueuedProjectServerHeartbeat,
	next: QueuedProjectServerHeartbeat,
): boolean {
	if (next.priority !== previous.priority)
		return next.priority > previous.priority;
	return next.requestedAt >= previous.requestedAt;
}

function sortedHeartbeats(
	heartbeats: Iterable<QueuedProjectServerHeartbeat>,
): QueuedProjectServerHeartbeat[] {
	return [...heartbeats].sort((left, right) => {
		if (left.priority !== right.priority) return right.priority - left.priority;
		if (left.requestedAt !== right.requestedAt)
			return left.requestedAt - right.requestedAt;
		return left.key.localeCompare(right.key);
	});
}

function normalized(value: string | undefined): string {
	return typeof value === "string" ? value.trim() : "";
}

function unique(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
