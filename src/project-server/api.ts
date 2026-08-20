import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import {
	normalizeClientProjectServerRequestContext,
	type ClientProjectServerRequestContext,
} from "../protocol/client-project-server.ts";
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
import {
	loadProjectServerAppState,
	type CodewikiAppState,
} from "./queries/app-state.ts";
import {
	loadProjectServerChangesState,
	type ProjectServerChangesState,
} from "./queries/changes.ts";
import {
	loadProjectServerConfigurationState,
	type ProjectServerConfigurationState,
} from "./queries/configuration.ts";

export type ProjectServerClientKind =
	| "pi"
	| "dashboard"
	| "cli"
	| "test"
	| "other";

export interface ProjectServerConnectionInput {
	clientId: string;
	kind: ProjectServerClientKind;
	supervision?: "observer" | "approved";
}

export interface ProjectServerConnectionOptions {
	timeoutMs?: number;
	spawnDaemon?: (repoRoot: string) => void;
}

export interface ProjectServerState {
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

export type ProjectServerTriggerKind =
	| "session_started"
	| "change_trace_appended"
	| "project_truth_changed"
	| "timer_due"
	| "user_response"
	| "manual_resume";

export interface ProjectServerTrigger {
	kind: ProjectServerTriggerKind;
	refs?: string[];
}

export interface ProjectServerReaction {
	schemaVersion: 3;
	status: "ready" | "quiescent";
	trigger: ProjectServerTrigger & { occurredAt?: string };
	observedWorkStateDigest: string;
}

export interface ProjectServerOperationReceipt {
	schemaVersion: 2;
	jobId: string;
	loop: "decision" | "planning" | "implementation";
	status: "completed" | "previewed" | "routed" | "stale";
	evidence: Array<{ traceId: string; eventId: string; sequence: number }>;
}

export interface ProjectServerCandidateResult {
	receipt: ProjectServerOperationReceipt;
	execution?: {
		status: "completed" | "previewed" | "routed" | "stale";
		mode: "preview" | "append";
		casRetries: number;
	};
}

export interface ProjectServerEvent {
	cursor: number;
	generationId: string;
	state: string;
	observedAt: string;
	clientId?: string;
	clientKind?: ProjectServerClientKind;
	idempotencyKey?: string;
	lane?: string;
	workStateDigest?: string;
	message?: string;
}

export interface ProjectServerEventBatch {
	schemaVersion: 1;
	generationId: string;
	latestCursor: number;
	cursor: number;
	resetRequired: boolean;
	events: ProjectServerEvent[];
}

export interface ProjectServerProjectionApi {
	appState(context: ClientProjectServerRequestContext): Promise<CodewikiAppState>;
	changes(context: ClientProjectServerRequestContext): Promise<ProjectServerChangesState>;
	configuration(context: ClientProjectServerRequestContext): Promise<ProjectServerConfigurationState>;
	subscribe(listener: () => void): () => void;
}

export interface ProjectServerApiClientPort {
	state(): Promise<ProjectServerState>;
	appState(context: ClientProjectServerRequestContext): Promise<CodewikiAppState>;
	changes(context: ClientProjectServerRequestContext): Promise<ProjectServerChangesState>;
	configuration(context: ClientProjectServerRequestContext): Promise<ProjectServerConfigurationState>;
	inspect(trigger: ProjectServerTrigger): Promise<ProjectServerReaction>;
	decisionAttention(
		request?: BacklogTriageQueryRequest,
	): Promise<BacklogTriageQueryResult>;
	selectDecision(
		command: DecisionAttentionSelectionCommand,
	): Promise<DecisionStartResult>;
	submitCandidate(
		trigger: ProjectServerTrigger,
		loop: "decision" | "planning" | "implementation",
		candidate: Record<string, unknown>,
		mode?: "preview" | "append",
	): Promise<ProjectServerCandidateResult>;
	events(
		afterCursor: number,
		options?: { maxEvents?: number; waitMs?: number },
	): Promise<ProjectServerEventBatch>;
	heartbeat(): Promise<void>;
	disconnect(): Promise<void>;
}

export interface ProjectServerApi {
	queries: {
		state: ProjectServerApiClientPort["state"];
		appState: ProjectServerApiClientPort["appState"];
		changes: ProjectServerApiClientPort["changes"];
		configuration: ProjectServerApiClientPort["configuration"];
		inspect: ProjectServerApiClientPort["inspect"];
		decisionAttention: ProjectServerApiClientPort["decisionAttention"];
	};
	commands: {
		selectDecision: ProjectServerApiClientPort["selectDecision"];
		submitCandidate: ProjectServerApiClientPort["submitCandidate"];
	};
	events: {
		read: ProjectServerApiClientPort["events"];
	};
	connection: {
		heartbeat: ProjectServerApiClientPort["heartbeat"];
		disconnect: ProjectServerApiClientPort["disconnect"];
	};
}

export type ProjectServerApiConnector = (
	repoRoot: string,
	input: ProjectServerConnectionInput,
) => Promise<ProjectServerApi>;

export function createProjectServerApi(
	client: ProjectServerApiClientPort,
): ProjectServerApi {
	const api: ProjectServerApi = {
		queries: {
			state: async () => projectServerState(await client.state()),
			appState: async (context) =>
				projection(
					await client.appState(normalizeClientProjectServerRequestContext(context)),
				),
			changes: async (context) =>
				projection(
					await client.changes(normalizeClientProjectServerRequestContext(context)),
				),
			configuration: async (context) =>
				projection(
					await client.configuration(normalizeClientProjectServerRequestContext(context)),
				),
			inspect: async (trigger) =>
				projectServerReaction(await client.inspect(trigger)),
			decisionAttention: (request) => client.decisionAttention(request),
		},
		commands: {
			selectDecision: (command) => client.selectDecision(command),
			submitCandidate: async (trigger, loop, candidate, mode) =>
				projectServerCandidateResult(
					await client.submitCandidate(trigger, loop, candidate, mode),
				),
		},
		events: {
			read: async (afterCursor, options) =>
				projectServerEventBatch(await client.events(afterCursor, options)),
		},
		connection: {
			heartbeat: () => client.heartbeat(),
			disconnect: () => client.disconnect(),
		},
	};
	Object.freeze(api.queries);
	Object.freeze(api.commands);
	Object.freeze(api.events);
	Object.freeze(api.connection);
	return Object.freeze(api);
}

export function createProjectServerProjectionApi(
	repoRoot: string,
): ProjectServerProjectionApi {
	return Object.freeze({
		appState: async (context: ClientProjectServerRequestContext) => {
			normalizeClientProjectServerRequestContext(context);
			return projection(await loadProjectServerAppState(repoRoot));
		},
		changes: async (context: ClientProjectServerRequestContext) => {
			normalizeClientProjectServerRequestContext(context);
			return projection(await loadProjectServerChangesState(repoRoot));
		},
		configuration: async (context: ClientProjectServerRequestContext) => {
			normalizeClientProjectServerRequestContext(context);
			return projection(await loadProjectServerConfigurationState(repoRoot));
		},
		subscribe(listener: () => void) {
			let watcher: FSWatcher | undefined;
			try {
				watcher = watch(
					join(repoRoot, ".codewiki", "traces"),
					{ persistent: false },
					listener,
				);
			} catch (error) {
				if (!isNotFound(error)) throw error;
			}
			return () => watcher?.close();
		},
	});
}

function projection<T>(value: T): T {
	return structuredClone(value);
}

function projectServerState(state: ProjectServerState): ProjectServerState {
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

function projectServerReaction(
	reaction: ProjectServerReaction,
): ProjectServerReaction {
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

function projectServerCandidateResult(
	result: ProjectServerCandidateResult,
): ProjectServerCandidateResult {
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

function projectServerEventBatch(
	batch: ProjectServerEventBatch,
): ProjectServerEventBatch {
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

function isNotFound(error: unknown): boolean {
	return Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code?: string }).code === "ENOENT",
	);
}

export async function connectProjectServerApi(
	repoRoot: string,
	input: ProjectServerConnectionInput,
	options: ProjectServerConnectionOptions = {},
): Promise<ProjectServerApi> {
	const client = await connectEnsuredProjectCoordinatorClient(
		repoRoot,
		input,
		options,
	);
	return createProjectServerApi(client);
}

export async function stopProjectServer(
	repoRoot: string,
	options: Pick<ProjectServerConnectionOptions, "timeoutMs"> = {},
): Promise<void> {
	await stopProjectCoordinatorService(repoRoot, options);
}
