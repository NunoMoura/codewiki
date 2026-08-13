import type {
	BacklogTriageQueryRequest,
	BacklogTriageQueryResult,
} from "../changes/triage/contracts.ts";
import type { DecisionAttentionSelectionCommand } from "../changes/triage/selection.ts";
import type { DecisionStartResult } from "./admission/start.ts";
import {
	connectEnsuredProjectCoordinatorClient,
} from "./coordinator/process.ts";
import { stopProjectCoordinatorService } from "./coordinator/service.ts";

export type ProjectRuntimeClientKind =
	| "pi"
	| "dashboard"
	| "cli"
	| "test"
	| "other";

export interface ProjectRuntimeConnectionInput {
	clientId: string;
	kind: ProjectRuntimeClientKind;
	supervision?: "observer" | "approved";
}

export interface ProjectRuntimeConnectionOptions {
	timeoutMs?: number;
	spawnDaemon?: (repoRoot: string) => void;
}

export interface ProjectRuntimeState {
	projectRoot: string;
	generationId: string;
	executionPolicy: "supervised" | "unattended" | "paused";
	executionPermitted: boolean;
	clientCount: number;
	supervisorCount: number;
	recoveringJobCount: number;
	queuedJobCount: number;
	activeJobCount: number;
	completedJobCount: number;
}

export type ProjectRuntimeTriggerKind =
	| "session_started"
	| "change_trace_appended"
	| "project_truth_changed"
	| "timer_due"
	| "user_response"
	| "manual_resume";

export interface ProjectRuntimeTrigger {
	kind: ProjectRuntimeTriggerKind;
	refs?: string[];
}

export interface ProjectRuntimeReaction {
	schemaVersion: 1;
	status: "ready" | "quiescent";
	trigger: ProjectRuntimeTrigger & { occurredAt?: string };
	observedWorkStateDigest: string;
}

export interface ProjectRuntimeOperationReceipt {
	schemaVersion: 1;
	jobId: string;
	loop: "decision" | "planning" | "implementation";
	status: "completed" | "previewed" | "routed" | "stale";
	evidence: Array<{ traceId: string; eventId: string; sequence: number }>;
}

export interface ProjectRuntimeCandidateResult {
	receipt: ProjectRuntimeOperationReceipt;
	execution?: {
		status: "completed" | "previewed" | "routed" | "stale";
		mode: "preview" | "append";
		casRetries: number;
	};
}

export interface ProjectRuntimeEvent {
	cursor: number;
	generationId: string;
	state: string;
	observedAt: string;
	clientId?: string;
	clientKind?: ProjectRuntimeClientKind;
	idempotencyKey?: string;
	lane?: string;
	workStateDigest?: string;
	message?: string;
}

export interface ProjectRuntimeEventBatch {
	schemaVersion: 1;
	generationId: string;
	latestCursor: number;
	cursor: number;
	resetRequired: boolean;
	events: ProjectRuntimeEvent[];
}

export interface ProjectRuntimeGatewayClientPort {
	state(): Promise<ProjectRuntimeState>;
	inspect(trigger: ProjectRuntimeTrigger): Promise<ProjectRuntimeReaction>;
	decisionAttention(
		request?: BacklogTriageQueryRequest,
	): Promise<BacklogTriageQueryResult>;
	selectDecision(
		command: DecisionAttentionSelectionCommand,
	): Promise<DecisionStartResult>;
	submitCandidate(
		trigger: ProjectRuntimeTrigger,
		loop: "decision" | "planning" | "implementation",
		candidate: Record<string, unknown>,
		mode?: "preview" | "append",
	): Promise<ProjectRuntimeCandidateResult>;
	events(
		afterCursor: number,
		options?: { maxEvents?: number; waitMs?: number },
	): Promise<ProjectRuntimeEventBatch>;
	heartbeat(): Promise<void>;
	disconnect(): Promise<void>;
}

export interface ProjectRuntimeGateway {
	queries: {
		state: ProjectRuntimeGatewayClientPort["state"];
		inspect: ProjectRuntimeGatewayClientPort["inspect"];
		decisionAttention: ProjectRuntimeGatewayClientPort["decisionAttention"];
	};
	commands: {
		selectDecision: ProjectRuntimeGatewayClientPort["selectDecision"];
		submitCandidate: ProjectRuntimeGatewayClientPort["submitCandidate"];
	};
	events: {
		read: ProjectRuntimeGatewayClientPort["events"];
	};
	connection: {
		heartbeat: ProjectRuntimeGatewayClientPort["heartbeat"];
		disconnect: ProjectRuntimeGatewayClientPort["disconnect"];
	};
}

export function createProjectRuntimeGateway(
	client: ProjectRuntimeGatewayClientPort,
): ProjectRuntimeGateway {
	const gateway: ProjectRuntimeGateway = {
		queries: {
			state: async () => projectRuntimeState(await client.state()),
			inspect: async (trigger) =>
				projectRuntimeReaction(await client.inspect(trigger)),
			decisionAttention: (request) => client.decisionAttention(request),
		},
		commands: {
			selectDecision: (command) => client.selectDecision(command),
			submitCandidate: async (trigger, loop, candidate, mode) =>
				projectRuntimeCandidateResult(
					await client.submitCandidate(trigger, loop, candidate, mode),
				),
		},
		events: {
			read: async (afterCursor, options) =>
				projectRuntimeEventBatch(await client.events(afterCursor, options)),
		},
		connection: {
			heartbeat: () => client.heartbeat(),
			disconnect: () => client.disconnect(),
		},
	};
	Object.freeze(gateway.queries);
	Object.freeze(gateway.commands);
	Object.freeze(gateway.events);
	Object.freeze(gateway.connection);
	return Object.freeze(gateway);
}

function projectRuntimeState(state: ProjectRuntimeState): ProjectRuntimeState {
	return {
		projectRoot: state.projectRoot,
		generationId: state.generationId,
		executionPolicy: state.executionPolicy,
		executionPermitted: state.executionPermitted,
		clientCount: state.clientCount,
		supervisorCount: state.supervisorCount,
		recoveringJobCount: state.recoveringJobCount,
		queuedJobCount: state.queuedJobCount,
		activeJobCount: state.activeJobCount,
		completedJobCount: state.completedJobCount,
	};
}

function projectRuntimeReaction(
	reaction: ProjectRuntimeReaction,
): ProjectRuntimeReaction {
	return {
		schemaVersion: reaction.schemaVersion,
		status: reaction.status,
		trigger: {
			kind: reaction.trigger.kind,
			...(reaction.trigger.refs ? { refs: [...reaction.trigger.refs] } : {}),
			...(reaction.trigger.occurredAt
				? { occurredAt: reaction.trigger.occurredAt }
				: {}),
		},
		observedWorkStateDigest: reaction.observedWorkStateDigest,
	};
}

function projectRuntimeCandidateResult(
	result: ProjectRuntimeCandidateResult,
): ProjectRuntimeCandidateResult {
	return {
		receipt: {
			schemaVersion: result.receipt.schemaVersion,
			jobId: result.receipt.jobId,
			loop: result.receipt.loop,
			status: result.receipt.status,
			evidence: result.receipt.evidence.map((entry) => ({ ...entry })),
		},
		...(result.execution
			? {
					execution: {
						status: result.execution.status,
						mode: result.execution.mode,
						casRetries: result.execution.casRetries,
					},
				}
			: {}),
	};
}

function projectRuntimeEventBatch(
	batch: ProjectRuntimeEventBatch,
): ProjectRuntimeEventBatch {
	return {
		schemaVersion: batch.schemaVersion,
		generationId: batch.generationId,
		latestCursor: batch.latestCursor,
		cursor: batch.cursor,
		resetRequired: batch.resetRequired,
		events: batch.events.map((event) => ({
			cursor: event.cursor,
			generationId: event.generationId,
			state: event.state,
			observedAt: event.observedAt,
			...(event.clientId ? { clientId: event.clientId } : {}),
			...(event.clientKind ? { clientKind: event.clientKind } : {}),
			...(event.idempotencyKey
				? { idempotencyKey: event.idempotencyKey }
				: {}),
			...(event.lane ? { lane: event.lane } : {}),
			...(event.workStateDigest
				? { workStateDigest: event.workStateDigest }
				: {}),
			...(event.message ? { message: event.message } : {}),
		})),
	};
}

export async function connectProjectRuntimeGateway(
	repoRoot: string,
	input: ProjectRuntimeConnectionInput,
	options: ProjectRuntimeConnectionOptions = {},
): Promise<ProjectRuntimeGateway> {
	const client = await connectEnsuredProjectCoordinatorClient(
		repoRoot,
		input,
		options,
	);
	return createProjectRuntimeGateway(client);
}

export async function stopProjectRuntime(
	repoRoot: string,
	options: Pick<ProjectRuntimeConnectionOptions, "timeoutMs"> = {},
): Promise<void> {
	await stopProjectCoordinatorService(repoRoot, options);
}
