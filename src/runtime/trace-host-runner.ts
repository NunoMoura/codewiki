import type { TraceLoop } from "../traces/types.ts";
import type {
	RuntimeHostAction,
	RuntimeHostLifecyclePlan,
} from "./lifecycle.ts";

export type TraceHostTarget = Exclude<TraceLoop, "decision"> | "close";

export interface TraceHostSessionInput {
	repoRoot: string;
	traceId: string;
	target: TraceHostTarget;
	refs: string[];
	prompt: string;
	supervisorId: string;
}

export interface TraceHostSessionController {
	isRunning(): Promise<boolean> | boolean;
	stop(reason: string): Promise<void> | void;
}

export interface TraceHostSessionStart {
	traceId: string;
	target: TraceHostTarget;
	sessionRef: string;
	controller: TraceHostSessionController;
	pid?: number;
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

export function traceHostPrompt(
	traceId: string,
	target: TraceHostTarget,
	refs: string[],
): string {
	const action =
		target === "close"
			? "Review closure evidence and use the guarded archive facade only when the trace is complete."
			: `Run the ${target} loop for this trace through its guarded CodeWiki facade.`;
	const referenceLines = boundedRefs(refs).map((ref) => `- ${ref}`);
	return [
		`You are the supervised trace host for ${traceId}.`,
		"Work only on this trace; the main user session remains independent.",
		action,
		"Read trace-backed state before acting and preserve expected-byte and sequence guards.",
		"Do not create or accept Changes, broaden scope, publish, promote source, advance controllers, or relax kernel standards.",
		"Stop and report a blocker when user authority, unsafe ambiguity, missing evidence, or lost supervision prevents progress.",
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
