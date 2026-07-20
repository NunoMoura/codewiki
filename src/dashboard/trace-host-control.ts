import { createHash } from "node:crypto";
import type { WikiConfig } from "../project/config.ts";
import {
	planMainHostLifecycle,
	type RuntimeHostLifecyclePlan,
} from "../runtime/lifecycle.ts";
import { resolveTraceExecutionPolicy } from "../runtime/trace-execution-policy.ts";
import type { ResolvedExecutionPolicy } from "../runtime/execution-policy.ts";
import {
	traceHostResumePrompt,
	type TraceHostSessionFactory,
	type TraceHostTarget,
} from "../runtime/trace-host-runner.ts";
import {
	runSupervisedTraceHostDispatch,
	type TraceHostSessionSnapshot,
	type TraceHostSupervisor,
} from "../runtime/trace-host-supervisor.ts";
import type { TraceBoardView, TraceGoalView } from "../views/types.ts";

export type DashboardTraceHostAction = "start" | "resume" | "cancel";
export type DashboardTraceHostResumeAcknowledgement =
	| "approval_completed_externally"
	| "blocker_resolved_externally";

export interface DashboardTraceHostCommand {
	action: DashboardTraceHostAction;
	commandId: string;
	traceId: string;
	expectedStateDigest: string;
	expectedSessionRef?: string;
	resumeAcknowledgement?: DashboardTraceHostResumeAcknowledgement;
}

export interface DashboardTraceHostCard {
	traceId: string;
	traceStatus: TraceGoalView["status"];
	stateDigest: string;
	canStart: boolean;
	canResume: boolean;
	canCancel: boolean;
	blockers: string[];
	resumeBlockers: string[];
	executionPolicy?: ResolvedExecutionPolicy;
	session?: TraceHostSessionSnapshot;
}

export interface DashboardTraceHostControlState {
	generatedAt: string;
	supervisorId: string;
	policy: {
		piHostEnabled: boolean;
		automation: WikiConfig["runtime"]["automation"];
		agency: WikiConfig["runtime"]["agency"];
		maxSeconds?: number;
		maxTokens?: number;
		maxCostUsd?: number;
		maxLatencyMs?: number;
		qualityFloor: WikiConfig["runtime"]["modelRouting"]["qualityFloor"];
		maxEscalations: number;
		estimatedInputTokens: number;
		estimatedOutputTokens: number;
		modelRoutingDigest: string;
	};
	traces: DashboardTraceHostCard[];
}

export interface DashboardTraceHostReceipt {
	receiptId: string;
	commandId: string;
	action: DashboardTraceHostAction;
	traceId: string;
	acceptedAt: string;
	stateDigestBefore: string;
	stateDigestAfter: string;
	sessionRef?: string;
}

export interface DashboardTraceHostCommandResult {
	replayed: boolean;
	receipt: DashboardTraceHostReceipt;
	state: DashboardTraceHostControlState;
}

export interface DashboardTraceHostControl {
	status(): Promise<DashboardTraceHostControlState>;
	execute(value: unknown): Promise<DashboardTraceHostCommandResult>;
	heartbeat(supervisionAttached: boolean): Promise<void>;
	shutdown(): Promise<void>;
}

export interface DashboardTraceHostControlOptions {
	repoRoot: string;
	supervisorId: string;
	supervisor: TraceHostSupervisor;
	startSession: TraceHostSessionFactory;
	loadTraceBoard(): Promise<TraceBoardView>;
	loadConfig(): Promise<WikiConfig>;
	now?: () => Date;
}

interface IdempotencyEntry {
	payloadDigest: string;
	result: DashboardTraceHostCommandResult;
}

interface PendingIdempotencyEntry {
	payloadDigest: string;
	result: Promise<DashboardTraceHostCommandResult>;
}

export class DashboardTraceHostControlError extends Error {
	readonly status: 400 | 403 | 409;

	constructor(message: string, status: 400 | 403 | 409) {
		super(message);
		this.name = "DashboardTraceHostControlError";
		this.status = status;
	}
}

export function createDashboardTraceHostControl(
	options: DashboardTraceHostControlOptions,
): DashboardTraceHostControl {
	const entries = new Map<string, IdempotencyEntry>();
	const pending = new Map<string, PendingIdempotencyEntry>();
	const now = options.now || (() => new Date());

	return {
		status: () => controlState(options, now),
		async execute(value) {
			const command = parseDashboardTraceHostCommand(value);
			const payloadDigest = digest(command);
			const existing = entries.get(command.commandId);
			if (existing) {
				if (existing.payloadDigest !== payloadDigest) {
					throw conflict("Command id was already used for different input.");
				}
				return { ...existing.result, replayed: true };
			}
			const inFlight = pending.get(command.commandId);
			if (inFlight) {
				if (inFlight.payloadDigest !== payloadDigest) {
					throw conflict("Command id is running with different input.");
				}
				return { ...(await inFlight.result), replayed: true };
			}
			const execution = executeCommand(options, command, now);
			pending.set(command.commandId, { payloadDigest, result: execution });
			try {
				const result = await execution;
				entries.set(command.commandId, { payloadDigest, result });
				trimEntries(entries, 256);
				return result;
			} finally {
				pending.delete(command.commandId);
			}
		},
		async heartbeat(supervisionAttached) {
			await options.supervisor.reconcile({ supervisionAttached });
		},
		async shutdown() {
			await options.supervisor.stopAll("shutdown");
		},
	};
}

async function executeCommand(
	options: DashboardTraceHostControlOptions,
	command: DashboardTraceHostCommand,
	now: () => Date,
): Promise<DashboardTraceHostCommandResult> {
	const before = await controlState(options, now);
	const card = requiredCard(before, command.traceId);
	if (card.stateDigest !== command.expectedStateDigest) {
		throw conflict("Trace host state changed; refresh before retrying.");
	}
	if (command.action === "start") {
		await startTraceHost(options, command.traceId, card);
	} else if (command.action === "resume") {
		await resumeTraceHost(options, command, card);
	} else {
		await cancelTraceHost(options, command, card);
	}
	const after = await controlState(options, now);
	const afterCard = requiredCard(after, command.traceId);
	const sessionRef = afterCard.session?.sessionRef || card.session?.sessionRef;
	const acceptedAt = now().toISOString();
	return {
		replayed: false,
		receipt: {
			receiptId: `trace-host-command:${command.commandId}`,
			commandId: command.commandId,
			action: command.action,
			traceId: command.traceId,
			acceptedAt,
			stateDigestBefore: card.stateDigest,
			stateDigestAfter: afterCard.stateDigest,
			...(sessionRef ? { sessionRef } : {}),
		},
		state: after,
	};
}

async function startTraceHost(
	options: DashboardTraceHostControlOptions,
	traceId: string,
	card: DashboardTraceHostCard,
): Promise<void> {
	if (!card.canStart) {
		throw conflict(`Trace host cannot start: ${card.blockers.join(" ")}`);
	}
	const board = await options.loadTraceBoard();
	const plan = tracePlan(board, traceId, options.supervisor.activeTraceIds());
	const result = await runSupervisedTraceHostDispatch({
		repoRoot: options.repoRoot,
		plan,
		supervision: { attached: true, supervisorId: options.supervisorId },
		supervisor: options.supervisor,
		startSession: options.startSession,
	});
	if (result.dispatch.started.length !== 1) {
		throw conflict(
			result.dispatch.held[0]?.message || "Trace host did not start.",
		);
	}
}

async function resumeTraceHost(
	options: DashboardTraceHostControlOptions,
	command: DashboardTraceHostCommand,
	card: DashboardTraceHostCard,
): Promise<void> {
	if (!card.canResume || !card.session?.result?.sessionId) {
		throw conflict(
			`Trace host cannot resume: ${card.resumeBlockers.join(" ")}`,
		);
	}
	if (!command.expectedSessionRef) {
		throw badRequest("Resume requires expectedSessionRef.");
	}
	if (command.expectedSessionRef !== card.session.sessionRef) {
		throw conflict("Trace host session changed; refresh state.");
	}
	const expectedAcknowledgement =
		card.session.result.outcome === "needs_approval"
			? "approval_completed_externally"
			: "blocker_resolved_externally";
	if (command.resumeAcknowledgement !== expectedAcknowledgement) {
		throw badRequest(
			`Resume requires ${expectedAcknowledgement}; this acknowledgement does not grant semantic approval.`,
		);
	}
	const resumeSessionId = card.session.result.sessionId;
	const board = await options.loadTraceBoard();
	const plan = tracePlan(
		board,
		command.traceId,
		options.supervisor.activeTraceIds(),
	);
	const result = await runSupervisedTraceHostDispatch({
		repoRoot: options.repoRoot,
		plan,
		supervision: { attached: true, supervisorId: options.supervisorId },
		supervisor: options.supervisor,
		startSession: (input) =>
			options.startSession({
				...input,
				resumeSessionId,
				prompt: traceHostResumePrompt(input.traceId, input.target, input.refs),
			}),
	});
	if (result.dispatch.started.length !== 1) {
		throw conflict(
			result.dispatch.held[0]?.message || "Trace host did not resume.",
		);
	}
}

async function cancelTraceHost(
	options: DashboardTraceHostControlOptions,
	command: DashboardTraceHostCommand,
	card: DashboardTraceHostCard,
): Promise<void> {
	if (!card.canCancel || !card.session) {
		throw conflict("Trace host is not active.");
	}
	if (!command.expectedSessionRef) {
		throw badRequest("Cancel requires expectedSessionRef.");
	}
	try {
		await options.supervisor.cancel(
			command.traceId,
			command.expectedSessionRef,
		);
	} catch (error) {
		throw conflict(errorMessage(error));
	}
}

async function controlState(
	options: DashboardTraceHostControlOptions,
	now: () => Date,
): Promise<DashboardTraceHostControlState> {
	await options.supervisor.reconcile({ supervisionAttached: true });
	const [board, config] = await Promise.all([
		options.loadTraceBoard(),
		options.loadConfig(),
	]);
	const sessions = new Map(
		options.supervisor
			.snapshot()
			.filter((session) => session.state !== "stopped" || session.result)
			.map((session) => [session.traceId, session]),
	);
	const policy = {
		piHostEnabled: config.hosts.pi.enabled,
		automation: config.runtime.automation,
		agency: config.runtime.agency,
		...(config.runtime.budgets.maxSeconds
			? { maxSeconds: config.runtime.budgets.maxSeconds }
			: {}),
		...(config.runtime.budgets.maxTokens
			? { maxTokens: config.runtime.budgets.maxTokens }
			: {}),
		...(config.runtime.budgets.maxCostUsd
			? { maxCostUsd: config.runtime.budgets.maxCostUsd }
			: {}),
		...(config.runtime.budgets.maxLatencyMs
			? { maxLatencyMs: config.runtime.budgets.maxLatencyMs }
			: {}),
		qualityFloor: config.runtime.modelRouting.qualityFloor,
		maxEscalations: config.runtime.modelRouting.maxEscalations,
		estimatedInputTokens: config.runtime.modelRouting.estimatedInputTokens,
		estimatedOutputTokens: config.runtime.modelRouting.estimatedOutputTokens,
		modelRoutingDigest: digest(config.runtime.modelRouting),
	};
	return {
		generatedAt: now().toISOString(),
		supervisorId: options.supervisorId,
		policy,
		traces: board.traces.map((trace) => {
			const session = sessions.get(trace.traceId);
			const executionPolicy = executionPolicyForTrace(
				board,
				trace,
				config,
				session,
			);
			const blockers = startBlockers(
				board,
				trace,
				config,
				session,
				executionPolicy,
			);
			const resumeBlockers = traceResumeBlockers(
				board,
				trace,
				config,
				session,
				executionPolicy,
			);
			return {
				traceId: trace.traceId,
				traceStatus: trace.status,
				stateDigest: traceStateDigest(trace, session, policy),
				canStart: blockers.length === 0,
				canResume: resumeBlockers.length === 0,
				canCancel: sessionActive(session),
				blockers,
				resumeBlockers,
				...(executionPolicy ? { executionPolicy } : {}),
				...(session ? { session } : {}),
			};
		}),
	};
}

function executionPolicyForTrace(
	board: TraceBoardView,
	trace: TraceGoalView,
	config: WikiConfig,
	session: TraceHostSessionSnapshot | undefined,
): ResolvedExecutionPolicy | undefined {
	const target =
		session?.target || traceTarget(tracePlan(board, trace.traceId, []));
	if (!target) return undefined;
	const usage = session?.result?.usage || session?.usage;
	return resolveTraceExecutionPolicy(config, {
		target,
		pathScopes: trace.pathScopes,
		continuation: Boolean(session?.result),
		...(usage
			? {
					priorUsage: {
						totalTokens: usage.totalTokens,
						costUsd: usage.cost,
						latencyMs: 0,
					},
				}
			: {}),
	});
}

function traceTarget(
	plan: RuntimeHostLifecyclePlan,
): TraceHostTarget | undefined {
	const action = plan.actions.find(
		(candidate) => candidate.kind === "start_trace_host",
	);
	if (!action) return undefined;
	if (
		action.targetLoop === "planning" ||
		action.targetLoop === "implementation"
	) {
		return action.targetLoop;
	}
	return action.targetLoop ? undefined : "close";
}

function startBlockers(
	board: TraceBoardView,
	trace: TraceGoalView,
	config: WikiConfig,
	session: TraceHostSessionSnapshot | undefined,
	executionPolicy: ResolvedExecutionPolicy | undefined,
): string[] {
	const blockers: string[] = [];
	if (sessionActive(session)) blockers.push("Trace host is already active.");
	if (session?.result?.outcome === "needs_approval") {
		blockers.push(
			"Exact user approval is required before this session can resume.",
		);
	}
	if (session?.result?.outcome === "blocked") {
		blockers.push(
			"Resolve the reported blocker before this session can resume.",
		);
	}
	if (!config.hosts.pi.enabled) blockers.push("hosts.pi.enabled is false.");
	if (config.runtime.agency === "observe") {
		blockers.push("runtime.agency is observe.");
	}
	if (config.hosts.pi.enabled && executionPolicy?.status === "blocked") {
		blockers.push(executionPolicy.rationale);
	}
	const plan = tracePlan(
		board,
		trace.traceId,
		sessionActive(session) ? [trace.traceId] : [],
	);
	if (!plan.actions.some((action) => action.kind === "start_trace_host")) {
		blockers.push(
			...(plan.blockers.length
				? plan.blockers
				: ["Trace is not ready for a host."]),
		);
	}
	return unique(blockers);
}

function traceResumeBlockers(
	board: TraceBoardView,
	trace: TraceGoalView,
	config: WikiConfig,
	session: TraceHostSessionSnapshot | undefined,
	executionPolicy: ResolvedExecutionPolicy | undefined,
): string[] {
	const blockers: string[] = [];
	if (sessionActive(session)) blockers.push("Trace host is already active.");
	if (
		session?.result?.outcome !== "needs_approval" &&
		session?.result?.outcome !== "blocked"
	) {
		blockers.push("Trace host has no resumable approval or blocker outcome.");
	}
	if (!session?.result?.sessionId) {
		blockers.push("Trace host did not report a resumable Pi session id.");
	}
	if (executionModelChanged(session, executionPolicy)) {
		blockers.push(
			"Resolved model policy changed; the persisted Pi session cannot resume under a different provider, model, or thinking level.",
		);
	}
	if (!config.hosts.pi.enabled) blockers.push("hosts.pi.enabled is false.");
	if (config.runtime.agency === "observe") {
		blockers.push("runtime.agency is observe.");
	}
	if (config.hosts.pi.enabled && executionPolicy?.status === "blocked") {
		blockers.push(executionPolicy.rationale);
	}
	const plan = tracePlan(
		board,
		trace.traceId,
		sessionActive(session) ? [trace.traceId] : [],
	);
	if (!plan.actions.some((action) => action.kind === "start_trace_host")) {
		blockers.push(
			...(plan.blockers.length
				? plan.blockers
				: ["Trace is not ready to resume."]),
		);
	}
	return unique(blockers);
}

function executionModelChanged(
	session: TraceHostSessionSnapshot | undefined,
	policy: ResolvedExecutionPolicy | undefined,
): boolean {
	if (!session?.executionModel || !policy?.selected) return false;
	return (
		session.executionModel.provider !== policy.selected.provider ||
		session.executionModel.model !== policy.selected.model ||
		session.executionModel.thinking !== policy.selected.thinking
	);
}

function tracePlan(
	board: TraceBoardView,
	traceId: string,
	activeTraceHosts: string[],
): RuntimeHostLifecyclePlan {
	const trace = board.traces.find((candidate) => candidate.traceId === traceId);
	if (!trace) throw notFound(traceId);
	const conflicts = board.conflicts.filter(
		(conflict) =>
			conflict.leftTraceId === traceId || conflict.rightTraceId === traceId,
	);
	return planMainHostLifecycle({
		traceBoard: {
			...board,
			traceIds: [traceId],
			traces: [trace],
			conflicts,
		},
		activeTraceHosts,
		maxTraceHosts: 1,
	});
}

function traceStateDigest(
	trace: TraceGoalView,
	session: TraceHostSessionSnapshot | undefined,
	policy: DashboardTraceHostControlState["policy"],
): string {
	return digest({
		trace: {
			traceId: trace.traceId,
			status: trace.status,
			closable: trace.closable,
			closed: trace.closed,
			changeRefs: trace.changeRefs,
			plannedChangeRefs: trace.plannedChangeRefs,
			unresolvedChangeRefs: trace.unresolvedChangeRefs,
			workUnitRefs: trace.workUnitRefs,
			incompleteWorkUnitRefs: trace.incompleteWorkUnitRefs,
			blockers: trace.blockers,
			lastEventId: trace.lastEventId,
		},
		session: session
			? {
					sessionRef: session.sessionRef,
					state: session.state,
					target: session.target,
					stopReason: session.stopReason,
					usage: session.usage,
					executionModel: session.executionModel,
					result: session.result,
				}
			: undefined,
		policy,
	});
}

export function parseDashboardTraceHostCommand(
	value: unknown,
): DashboardTraceHostCommand {
	if (!isRecord(value))
		throw badRequest("Trace host command must be an object.");
	const allowed = new Set([
		"action",
		"commandId",
		"traceId",
		"expectedStateDigest",
		"expectedSessionRef",
		"resumeAcknowledgement",
	]);
	for (const key of Object.keys(value)) {
		if (!allowed.has(key))
			throw badRequest(`Unsupported command field ${key}.`);
	}
	if (
		value.action !== "start" &&
		value.action !== "resume" &&
		value.action !== "cancel"
	) {
		throw badRequest("Trace host action must be start, resume, or cancel.");
	}
	const command: DashboardTraceHostCommand = {
		action: value.action,
		commandId: identifier(value.commandId, "commandId", 128),
		traceId: identifier(value.traceId, "traceId", 160),
		expectedStateDigest: sha256Digest(value.expectedStateDigest),
		...(value.expectedSessionRef === undefined
			? {}
			: {
					expectedSessionRef: boundedText(
						value.expectedSessionRef,
						"expectedSessionRef",
						240,
					),
				}),
		...(value.resumeAcknowledgement === undefined
			? {}
			: {
					resumeAcknowledgement: resumeAcknowledgement(
						value.resumeAcknowledgement,
					),
				}),
	};
	if (
		command.action === "start" &&
		(command.expectedSessionRef || command.resumeAcknowledgement)
	) {
		throw badRequest(
			"Start does not accept expectedSessionRef or resumeAcknowledgement.",
		);
	}
	if (command.action === "cancel" && command.resumeAcknowledgement) {
		throw badRequest("Cancel does not accept resumeAcknowledgement.");
	}
	if (
		command.action === "resume" &&
		(!command.expectedSessionRef || !command.resumeAcknowledgement)
	) {
		throw badRequest(
			"Resume requires expectedSessionRef and resumeAcknowledgement.",
		);
	}
	return command;
}

function sessionActive(session: TraceHostSessionSnapshot | undefined): boolean {
	return Boolean(session && session.state !== "stopped");
}

function requiredCard(
	state: DashboardTraceHostControlState,
	traceId: string,
): DashboardTraceHostCard {
	const card = state.traces.find((candidate) => candidate.traceId === traceId);
	if (!card) throw notFound(traceId);
	return card;
}

function digest(value: unknown): string {
	return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.filter(([, entry]) => entry !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function trimEntries(
	entries: Map<string, IdempotencyEntry>,
	max: number,
): void {
	while (entries.size > max) {
		const first = entries.keys().next().value;
		if (typeof first !== "string") return;
		entries.delete(first);
	}
}

function resumeAcknowledgement(
	value: unknown,
): DashboardTraceHostResumeAcknowledgement {
	if (
		value !== "approval_completed_externally" &&
		value !== "blocker_resolved_externally"
	) {
		throw badRequest("resumeAcknowledgement is invalid.");
	}
	return value;
}

function identifier(value: unknown, label: string, max: number): string {
	const text = boundedText(value, label, max);
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text)) {
		throw badRequest(`${label} contains unsupported characters.`);
	}
	return text;
}

function sha256Digest(value: unknown): string {
	const text = boundedText(value, "expectedStateDigest", 71);
	if (!/^sha256:[a-f0-9]{64}$/.test(text)) {
		throw badRequest("expectedStateDigest must be a sha256 digest.");
	}
	return text;
}

function boundedText(value: unknown, label: string, max: number): string {
	if (typeof value !== "string" || value.length < 1 || value.length > max) {
		throw badRequest(
			`${label} must be a non-empty string of at most ${max} characters.`,
		);
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))];
}

function badRequest(message: string): DashboardTraceHostControlError {
	return new DashboardTraceHostControlError(message, 400);
}

function conflict(message: string): DashboardTraceHostControlError {
	return new DashboardTraceHostControlError(message, 409);
}

function notFound(traceId: string): DashboardTraceHostControlError {
	return new DashboardTraceHostControlError(
		`Trace ${traceId} was not found.`,
		409,
	);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
