import type { TraceLoop } from "../traces/types.ts";
import type {
	RuntimeHostAction,
	RuntimeHostLifecyclePlan,
} from "./lifecycle.ts";

export type TraceHostTarget = Exclude<TraceLoop, "decision"> | "close";
export interface TraceHostExecutionModel {
	provider: string;
	model: string;
	thinking: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
}
export type TraceHostOutcome =
	| "completed"
	| "needs_approval"
	| "blocked"
	| "failed"
	| "cancelled";

export interface TraceHostApprovalRequest {
	kind: "planning" | "implementation" | "archive";
	proposalDigest: string;
	proposalRef?: string;
}

export interface TraceHostResult {
	version: 1;
	outcome: TraceHostOutcome;
	summary: string;
	refs: string[];
	sessionId?: string;
	approval?: TraceHostApprovalRequest;
	model?: string;
	provider?: string;
	usage?: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		totalTokens: number;
		cost: number;
	};
}

export interface TraceHostProcessCompletion {
	exitCode: number | null;
	signal: NodeJS.Signals | string | null;
	result: TraceHostResult;
}

export interface TraceHostSessionInput {
	repoRoot: string;
	traceId: string;
	target: TraceHostTarget;
	refs: string[];
	prompt: string;
	supervisorId: string;
	resumeSessionId?: string;
}

export interface TraceHostSessionController {
	isRunning(): Promise<boolean> | boolean;
	currentUsage?():
		| Promise<TraceHostResult["usage"] | undefined>
		| TraceHostResult["usage"]
		| undefined;
	completion?(): Promise<TraceHostProcessCompletion | undefined>;
	stop(reason: string): Promise<void> | void;
}

export interface TraceHostSessionStart {
	traceId: string;
	target: TraceHostTarget;
	sessionRef: string;
	controller: TraceHostSessionController;
	pid?: number;
	timeoutMs?: number;
	executionModel?: TraceHostExecutionModel;
}

export type TraceHostSessionFactory = (
	input: TraceHostSessionInput,
) => Promise<TraceHostSessionStart>;

export interface DispatchTraceHostsInput {
	repoRoot: string;
	plan: RuntimeHostLifecyclePlan;
	supervision: {
		attached: boolean;
		supervisorId: string;
	};
	startSession: TraceHostSessionFactory;
}

export interface TraceHostDispatchFailure {
	traceId: string;
	target?: TraceHostTarget;
	message: string;
}

export interface DispatchTraceHostsResult {
	started: TraceHostSessionStart[];
	held: TraceHostDispatchFailure[];
}

export async function dispatchTraceHosts(
	input: DispatchTraceHostsInput,
): Promise<DispatchTraceHostsResult> {
	const actions = input.plan.actions.filter(
		(action) => action.kind === "start_trace_host",
	);
	if (!input.supervision.attached) {
		return {
			started: [],
			held: actions.map((action) => ({
				traceId: requiredTraceId(action),
				message:
					"Trace host start requires an attached supervisor; execution remains pending.",
			})),
		};
	}
	const started: TraceHostSessionStart[] = [];
	const held: TraceHostDispatchFailure[] = [];
	for (const action of actions) {
		const traceId = requiredTraceId(action);
		const target = traceHostTarget(action);
		if (!target) {
			held.push({
				traceId,
				message:
					"Main host cannot dispatch Decision authority; validate a Change in the main session first.",
			});
			continue;
		}
		try {
			started.push(
				await input.startSession({
					repoRoot: input.repoRoot,
					traceId,
					target,
					refs: boundedRefs(action.refs),
					prompt: traceHostPrompt(traceId, target, action.refs),
					supervisorId: input.supervision.supervisorId,
				}),
			);
		} catch (error) {
			held.push({
				traceId,
				target,
				message: `Trace host failed to start: ${errorMessage(error)}`,
			});
		}
	}
	return { started, held };
}

export function traceHostResumePrompt(
	traceId: string,
	target: TraceHostTarget,
	refs: string[],
): string {
	return [
		traceHostPrompt(traceId, target, refs),
		"",
		"Resume context:",
		"This process resumes an earlier Pi session after an external user action.",
		"The resume signal is not semantic approval and does not prove a blocker is resolved.",
		"Re-read trace truth, verify every required approval or external condition through guarded state, and stop again if authority or evidence is still missing.",
	].join("\n");
}

export function traceHostPrompt(
	traceId: string,
	target: TraceHostTarget,
	refs: string[],
): string {
	const action =
		target === "close"
			? "Review closure evidence through wiki_state, then call wiki_archive close with traceId and append guards only when complete. The facade resolves trace records internally; do not read raw trace JSONL."
			: `Run the ${target} loop for this trace through its guarded CodeWiki facade.`;
	const referenceLines = boundedRefs(refs).map((ref) => `- ${ref}`);
	return [
		`You are the supervised trace host for ${traceId}.`,
		"Work only on this trace; the main user session remains independent.",
		action,
		"Read trace-backed state before acting and preserve expected-byte and sequence guards.",
		"Do not create or accept Changes, broaden scope, publish, promote source, advance controllers, or relax kernel standards.",
		"Stop and report a blocker when user authority, unsafe ambiguity, missing evidence, or lost supervision prevents progress.",
		"End your final response with exactly one CODEWIKI_TRACE_HOST_RESULT line containing a compact JSON object.",
		'Format: CODEWIKI_TRACE_HOST_RESULT {"version":1,"outcome":"completed|needs_approval|blocked|failed","summary":"bounded non-sensitive summary","refs":["bounded refs"],"approval":{"kind":"planning|implementation|archive","proposalDigest":"sha256:...","proposalRef":"optional bounded ref"}}',
		"Include approval only for needs_approval. Never include prompts, chain-of-thought, credentials, raw source, or private data.",
		"Relevant refs:",
		...(referenceLines.length ? referenceLines : ["- none"]),
	].join("\n");
}

function traceHostTarget(
	action: RuntimeHostAction,
): TraceHostTarget | undefined {
	if (
		action.targetLoop === "planning" ||
		action.targetLoop === "implementation"
	) {
		return action.targetLoop;
	}
	if (!action.targetLoop) return "close";
	return undefined;
}

function requiredTraceId(action: RuntimeHostAction): string {
	if (!action.traceId) throw new Error("Trace host action requires traceId.");
	return action.traceId;
}

function boundedRefs(refs: string[]): string[] {
	return [...new Set(refs.filter(Boolean))].slice(0, 20);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
