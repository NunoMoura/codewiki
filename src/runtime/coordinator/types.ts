export type RuntimeHeartbeatIntent =
	| "manual"
	| "immediate"
	| "event"
	| "scheduled"
	| "retry";

export type RuntimeHeartbeatSource =
	| "session-open"
	| "manual"
	| "schedule"
	| "hook"
	| "webhook"
	| "worker"
	| "lease"
	| "retry"
	| "other";

export interface RuntimeHeartbeatRequest {
	source: RuntimeHeartbeatSource;
	intent: RuntimeHeartbeatIntent;
	reason?: string;
	traceId?: string;
	triggerId?: string;
	workUnitId?: string;
	sessionId?: string;
	refs?: string[];
	requestedAt?: number;
	data?: Record<string, unknown>;
}

export interface QueuedRuntimeHeartbeat {
	key: string;
	source: RuntimeHeartbeatSource;
	intent: RuntimeHeartbeatIntent;
	reason: string;
	priority: number;
	requestedAt: number;
	traceId?: string;
	triggerId?: string;
	workUnitId?: string;
	sessionId?: string;
	refs: string[];
	data?: Record<string, unknown>;
	coalescedCount: number;
}
