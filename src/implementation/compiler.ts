import type { TraceEvent } from "../traces/types.ts";
import { implementationEvidenceRefs, normalizeImplementationChanges, planningRefsFromEvents } from "./evidence.ts";
import { evaluateImplementationGate } from "./gate.ts";
import type {
	ImplementationChange,
	ImplementationChangeInput,
	ImplementationGateResult,
} from "./types.ts";

export interface ImplementationCompileInput {
	traceId: string;
	planningEvents: TraceEvent[];
	changes?: ImplementationChange[];
	changeInputs?: ImplementationChangeInput[];
	parentId?: string | null;
	startSequence?: number;
	createdAt?: string;
}

export interface ImplementationCompileResult {
	planningRefs: string[];
	changes: ImplementationChange[];
	gate: ImplementationGateResult;
	traceEvents: TraceEvent[];
	readyForClosure: boolean;
}

export function compileImplementation(
	input: ImplementationCompileInput,
): ImplementationCompileResult {
	const planningRefs = planningRefsFromEvents(input.planningEvents);
	const changes = input.changes ?? normalizeImplementationChanges(input.changeInputs || []);
	const gate = evaluateImplementationGate({ planningRefs, changes });
	const traceEvents = changes.map((change, index) =>
		implementationChangeTraceEvent({ change, input, sequenceOffset: index }),
	);
	return {
		planningRefs,
		changes,
		gate,
		traceEvents,
		readyForClosure: gate.passed,
	};
}

function implementationChangeTraceEvent(args: {
	change: ImplementationChange;
	input: ImplementationCompileInput;
	sequenceOffset: number;
}): TraceEvent {
	const { change, input, sequenceOffset } = args;
	return {
		type: "trace_event",
		id: `${input.traceId}:implementation:${change.id}`,
		parentId: input.parentId ?? null,
		traceId: input.traceId,
		sequence: (input.startSequence ?? 1) + sequenceOffset,
		loop: "implementation",
		event: "implementation.change.recorded",
		refs: implementationEvidenceRefs(change),
		createdAt: input.createdAt || new Date().toISOString(),
		data: {
			changeId: change.id,
			planningRefs: change.planningRefs,
			codePaths: change.codePaths,
			docPaths: change.docPaths,
			testPaths: change.testPaths,
			checks: change.checks,
			acceptanceEvidence: change.acceptanceEvidence,
			contentProof: change.contentProof,
			publicationRefs: change.publicationRefs,
		},
	};
}
