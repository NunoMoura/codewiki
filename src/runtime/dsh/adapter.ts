import {isAbsolute} from "node:path";

import {Context, type Fiber} from "@deepseek-ai/cordis";
import AgentRegistry, {
	type AgentHandle,
} from "@deepseek-ai/dsh-agent";
import AgentLoop from "@deepseek-ai/dsh-agent-loop";
import * as AgentLoopInvariant from "@deepseek-ai/dsh-agent-loop/invariant";
import * as AgentInvariant from "@deepseek-ai/dsh-agent/invariant";
import InvariantRegistry from "@deepseek-ai/dsh-invariants";
import LlmRuntime, {createUserMessage} from "@deepseek-ai/dsh-llm";
import SessionStore, {
	SessionId,
	type SessionEvent,
} from "@deepseek-ai/dsh-session";
import * as SessionInvariant from "@deepseek-ai/dsh-session/invariant";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime from "@deepseek-ai/dsh-tools";

import {
	createRunRawLogReference,
	type RunOutcome,
	type RunRawLogReference,
	type RunRequest,
} from "../contracts.ts";
import {
	canonicalJsonDigest,
	sha256Digest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export interface DshRunArtifacts {
	readonly systemPrompt: string;
	readonly prompt: string;
	readonly workspacePath: string;
	readonly sessionRoot: string;
}

export interface DshModelAdapterLease {
	readonly assertComplete?: () => void;
	readonly dispose: () => void | Promise<void>;
}

export type DshModelAdapterInstaller = (input: {
	readonly context: Context;
	readonly request: RunRequest;
}) => DshModelAdapterLease | Promise<DshModelAdapterLease>;

export interface DshSessionEventFact {
	readonly sequence: number;
	readonly type: string;
	readonly digest: Sha256Digest;
}

export interface DshRunResult {
	readonly outcome: RunOutcome;
	readonly startedAt: string;
	readonly finishedAt: string;
	readonly output: string;
	readonly outputDigest: Sha256Digest;
	readonly usageDigest: Sha256Digest | null;
	readonly executionLedgerDigest: Sha256Digest;
	readonly rawLog: RunRawLogReference;
	readonly rawLogPath: string;
	readonly sessionEvents: readonly DshSessionEventFact[];
}

export interface RunDshAgentOptions {
	readonly request: RunRequest;
	readonly artifacts: DshRunArtifacts;
	readonly installModelAdapter: DshModelAdapterInstaller;
	readonly signal?: AbortSignal;
	readonly now?: () => string;
}

export async function runDshAgent(
	options: RunDshAgentOptions,
): Promise<Readonly<DshRunResult>> {
	assertDshRunOptions(options);
	const now = options.now ?? (() => new Date().toISOString());
	const startedAt = now();
	const execution = await createDshExecution(options);
	try {
		const snapshot = await executeDshSession(execution, options);
		return buildDshRunResult({options, snapshot, startedAt, finishedAt: now()});
	} finally {
		await disposeDshExecution(execution);
	}
}

interface DshExecution {
	readonly context: Context;
	readonly fibers: readonly Fiber[];
	readonly modelLease: DshModelAdapterLease;
	readonly agentHandle: AgentHandle;
	readonly removeAbortListener?: () => void;
}

interface DshSessionSnapshot {
	readonly events: readonly SessionEvent[];
	readonly rawContent: string;
	readonly rawVersion: number;
	readonly rawPath: string;
}

async function createDshExecution(
	options: RunDshAgentOptions,
): Promise<DshExecution> {
	const context = new Context();
	const fibers = await mountDshContext(context, options.artifacts);
	let modelLease: DshModelAdapterLease | undefined;
	let agentHandle: AgentHandle | undefined;
	try {
		modelLease = await options.installModelAdapter({context, request: options.request});
		agentHandle = await context.agents.create({
			sessionId: SessionId(options.request.session.sessionId),
			meta: {cwd: options.artifacts.workspacePath},
			agentOptions: {
				provider: options.request.inputs.modelRoute.provider,
				model: options.request.inputs.modelRoute.model,
				maxTokens: options.request.budget.maxOutputTokens,
			},
		});
		return {
			context,
			fibers,
			modelLease,
			agentHandle,
			removeAbortListener: bindDshCancellation(agentHandle, options.signal),
		};
	} catch (error) {
		if (agentHandle) await agentHandle.dispose();
		if (modelLease) await modelLease.dispose();
		await disposeFibers(fibers);
		throw error;
	}
}

async function mountDshContext(
	context: Context,
	artifacts: DshRunArtifacts,
): Promise<readonly Fiber[]> {
	const fibers: Fiber[] = [];
	fibers.push(await context.plugin(InvariantRegistry));
	fibers.push(await context.plugin(LlmRuntime));
	fibers.push(await context.plugin(SessionStore));
	fibers.push(await context.plugin(SystemPrompt, {persona: artifacts.systemPrompt}));
	fibers.push(await context.plugin(ToolRuntime));
	fibers.push(await context.plugin(AgentRegistry));
	fibers.push(await context.plugin(JsonlSessionPersistence, {
		root: artifacts.sessionRoot,
		compression: "none",
		packChunks: false,
		writeBatchMaxDelayMs: 1,
	}));
	fibers.push(await context.plugin(AgentLoop, {agents: []}));
	fibers.push(await context.plugin(SessionInvariant));
	fibers.push(await context.plugin(AgentInvariant));
	fibers.push(await context.plugin(AgentLoopInvariant));
	return fibers;
}

function bindDshCancellation(
	agentHandle: AgentHandle,
	signal: AbortSignal | undefined,
): (() => void) | undefined {
	if (!signal) return undefined;
	const cancel = () => agentHandle.agent.cancel({kind: "user"});
	signal.addEventListener("abort", cancel, {once: true});
	if (signal.aborted) cancel();
	return () => signal.removeEventListener("abort", cancel);
}

async function executeDshSession(
	execution: DshExecution,
	options: RunDshAgentOptions,
): Promise<DshSessionSnapshot> {
	execution.agentHandle.agent.followup(createUserMessage({
		content: [{type: "text", text: options.artifacts.prompt}],
		source: {kind: "user"},
	}));
	await execution.agentHandle.agent.whenIdle();
	const flushed = await execution.context.sessions.flush(
		execution.agentHandle.agent.session,
	);
	if (!flushed) throw new Error("DSH Agent Session has no persistence checkpoint.");
	execution.modelLease.assertComplete?.();
	const sessionId = SessionId(options.request.session.sessionId);
	const raw = await execution.context.sessionPersistence.readRaw(sessionId);
	if (!raw) throw new Error("DSH Agent Session raw log is unavailable.");
	const location = execution.context.sessionPersistence.locate(
		execution.agentHandle.agent.session.header,
	);
	if (!location || location.kind !== "jsonl") {
		throw new Error("DSH Agent Session JSONL location is unavailable.");
	}
	return {
		events: [...execution.agentHandle.agent.session.events],
		rawContent: raw.content,
		rawVersion: raw.meta.version,
		rawPath: location.path,
	};
}

function buildDshRunResult(input: {
	readonly options: RunDshAgentOptions;
	readonly snapshot: DshSessionSnapshot;
	readonly startedAt: string;
	readonly finishedAt: string;
}): Readonly<DshRunResult> {
	const {options, snapshot} = input;
	const sessionEvents = Object.freeze(snapshot.events.map((event) => Object.freeze({
		sequence: event.seq,
		type: event.type,
		digest: canonicalJsonDigest(event),
	})));
	const output = finalAssistantText(snapshot.events);
	const outputDigest = canonicalJsonDigest({text: output});
	const usage = snapshot.events.flatMap((event) =>
		event.type === "assistant/message" && event.data.usage
			? [event.data.usage]
			: [],
	);
	const usageDigest = usage.length === 0 ? null : canonicalJsonDigest(usage);
	const outcome = runOutcome(snapshot.events, options.signal?.aborted === true);
	const rawLog = createRunRawLogReference({
		encoding: "jsonl",
		formatVersion: snapshot.rawVersion,
		sessionId: options.request.session.sessionId,
		storageId: `dsh-${sha256Digest(options.request.session.sessionId).slice(7, 39)}`,
		byteLength: Buffer.byteLength(snapshot.rawContent),
		digest: sha256Digest(snapshot.rawContent),
		runtimeBuildDigest: options.request.runtimeBuild.buildDigest,
	});
	const executionLedgerDigest = canonicalJsonDigest({
		runId: options.request.runId,
		requestDigest: options.request.requestDigest,
		runtimeBuildDigest: options.request.runtimeBuild.buildDigest,
		sessionId: options.request.session.sessionId,
		modelRoute: options.request.inputs.modelRoute,
		inputDigests: options.request.inputs,
		sessionEvents,
		outputDigest,
		usageDigest,
		outcome,
	});
	return Object.freeze({
		outcome,
		startedAt: input.startedAt,
		finishedAt: input.finishedAt,
		output,
		outputDigest,
		usageDigest,
		executionLedgerDigest,
		rawLog,
		rawLogPath: snapshot.rawPath,
		sessionEvents,
	});
}

async function disposeDshExecution(execution: DshExecution): Promise<void> {
	execution.removeAbortListener?.();
	await execution.agentHandle.dispose();
	await execution.modelLease.dispose();
	await disposeFibers(execution.fibers);
}

async function disposeFibers(fibers: readonly Fiber[]): Promise<void> {
	for (let index = fibers.length - 1; index >= 0; index -= 1) {
		await fibers[index]?.dispose();
	}
}

function assertDshRunOptions(options: RunDshAgentOptions): void {
	if (!options || typeof options.installModelAdapter !== "function") {
		throw new Error("DSH Adapter requires a model adapter installer.");
	}
	if (options.request.custody !== "backend-owned") {
		throw new Error("DSH-backed Runs require backend-owned custody.");
	}
	if (options.request.session.mode !== "create") {
		throw new Error("This DSH Adapter slice supports fresh Agent Sessions only.");
	}
	if (
		options.request.inputs.toolMode !== "none" ||
		options.request.budget.maxToolCalls !== 0
	) {
		throw new Error("This DSH Adapter slice permits no tools.");
	}
	if (
		canonicalJsonDigest(options.artifacts.systemPrompt) !==
		options.request.inputs.systemPromptDigest
	) {
		throw new Error("DSH system prompt does not match its Run Request digest.");
	}
	if (
		canonicalJsonDigest(options.artifacts.prompt) !==
		options.request.inputs.promptDigest
	) {
		throw new Error("DSH prompt does not match its Run Request digest.");
	}
	assertAbsolutePath(options.artifacts.workspacePath, "DSH workspace path");
	assertAbsolutePath(options.artifacts.sessionRoot, "DSH session root");
	if (options.signal?.aborted) {
		throw new Error("DSH Run was cancelled before Agent Session creation.");
	}
}

function finalAssistantText(events: readonly SessionEvent[]): string {
	const message = lastEventOfType(events, "assistant/message");
	if (!message) return "";
	return message.data.message.content
		.flatMap((block) => block.type === "text" ? [block.text] : [])
		.join("");
}

function runOutcome(
	events: readonly SessionEvent[],
	aborted: boolean,
): RunOutcome {
	const end = lastEventOfType(events, "turn/end");
	if (!end) return "failed";
	if (aborted || end.data.reason.kind === "aborted") return "cancelled";
	return end.data.reason.kind === "completed" ? "completed" : "failed";
}

function lastEventOfType<T extends SessionEvent["type"]>(
	events: readonly SessionEvent[],
	type: T,
): Extract<SessionEvent, {readonly type: T}> | undefined {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event?.type === type) {
			return event as Extract<SessionEvent, {readonly type: T}>;
		}
	}
	return undefined;
}

function assertAbsolutePath(value: string, field: string): void {
	if (typeof value !== "string" || !isAbsolute(value)) {
		throw new Error(`${field} must be absolute.`);
	}
}
