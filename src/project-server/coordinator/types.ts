export type ProjectServerHeartbeatIntent =
	| "manual"
	| "immediate"
	| "event"
	| "scheduled"
	| "retry";

export type ProjectServerHeartbeatSource =
	| "session-open"
	| "manual"
	| "schedule"
	| "hook"
	| "webhook"
	| "worker"
	| "lease"
	| "retry"
	| "other";

export interface ProjectServerHeartbeatRequest {
	source: ProjectServerHeartbeatSource;
	intent: ProjectServerHeartbeatIntent;
	reason?: string;
	traceId?: string;
	triggerId?: string;
	workUnitId?: string;
	sessionId?: string;
	refs?: string[];
	requestedAt?: number;
	data?: Record<string, unknown>;
}

export interface QueuedProjectServerHeartbeat {
	key: string;
	source: ProjectServerHeartbeatSource;
	intent: ProjectServerHeartbeatIntent;
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
