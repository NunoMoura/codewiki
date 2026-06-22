import type {
	QueuedRuntimeHeartbeat,
	RuntimeHeartbeatIntent,
	RuntimeHeartbeatRequest,
} from "./types.ts";

const HEARTBEAT_PRIORITY: Record<RuntimeHeartbeatIntent, number> = {
	retry: 0,
	scheduled: 1,
	event: 2,
	immediate: 3,
	manual: 4,
};

export interface RuntimeHeartbeatQueueSnapshot {
	pending: QueuedRuntimeHeartbeat[];
	count: number;
}

export class RuntimeHeartbeatQueue {
	readonly #pending = new Map<string, QueuedRuntimeHeartbeat>();
	readonly #now: () => number;

	constructor(options: { now?: () => number } = {}) {
		this.#now = options.now || Date.now;
	}

	get size(): number {
		return this.#pending.size;
	}

	request(input: RuntimeHeartbeatRequest): QueuedRuntimeHeartbeat {
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

	drain(): QueuedRuntimeHeartbeat[] {
		const pending = sortedHeartbeats(this.#pending.values());
		this.#pending.clear();
		return pending;
	}

	peek(): QueuedRuntimeHeartbeat[] {
		return sortedHeartbeats(this.#pending.values());
	}

	clear(): void {
		this.#pending.clear();
	}

	snapshot(): RuntimeHeartbeatQueueSnapshot {
		const pending = this.peek();
		return { pending, count: pending.length };
	}
}

export function createRuntimeHeartbeatQueue(
	options: { now?: () => number } = {},
): RuntimeHeartbeatQueue {
	return new RuntimeHeartbeatQueue(options);
}

export function runtimeHeartbeatPriority(
	intent: RuntimeHeartbeatIntent,
): number {
	return HEARTBEAT_PRIORITY[intent];
}

export function runtimeHeartbeatKey(input: RuntimeHeartbeatRequest): string {
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
	input: RuntimeHeartbeatRequest,
	now: number,
): QueuedRuntimeHeartbeat {
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
	previous: QueuedRuntimeHeartbeat,
	next: QueuedRuntimeHeartbeat,
): QueuedRuntimeHeartbeat {
	const chosen = shouldReplaceHeartbeat(previous, next) ? next : previous;
	return {
		...chosen,
		refs: unique([...previous.refs, ...next.refs]),
		data: { ...(previous.data || {}), ...(next.data || {}) },
		coalescedCount: previous.coalescedCount + 1,
	};
}

function shouldReplaceHeartbeat(
	previous: QueuedRuntimeHeartbeat,
	next: QueuedRuntimeHeartbeat,
): boolean {
	if (next.priority !== previous.priority)
		return next.priority > previous.priority;
	return next.requestedAt >= previous.requestedAt;
}

function sortedHeartbeats(
	heartbeats: Iterable<QueuedRuntimeHeartbeat>,
): QueuedRuntimeHeartbeat[] {
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
