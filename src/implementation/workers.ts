import type {
	ImplementationChangeInput,
	ImplementationWorkerStatus,
	ImplementationWorkerSummary,
} from "./types.ts";

export interface ImplementationWorkerBlockerInput {
	message?: string;
	refs?: string[];
}

export interface ImplementationWorkerResultInput {
	workerId: string;
	workUnitId: string;
	planningRefs?: string[];
	planning_refs?: string[];
	status?: ImplementationWorkerStatus | string;
	claimId?: string;
	claim_id?: string;
	message?: string;
	refs?: string[];
	sessionId?: string;
	session_id?: string;
	sessionFile?: string;
	session_file?: string;
	changeInputs?: ImplementationChangeInput[];
	change_inputs?: ImplementationChangeInput[];
	changes?: ImplementationChangeInput[];
	blockers?: ImplementationWorkerBlockerInput[];
}

export interface ImplementationWorkerAggregation {
	workerResults: ImplementationWorkerSummary[];
	changeInputs: ImplementationChangeInput[];
	completed: ImplementationWorkerSummary[];
	blocked: ImplementationWorkerSummary[];
	failed: ImplementationWorkerSummary[];
}

export function aggregateImplementationWorkerResults(
	inputs: ImplementationWorkerResultInput[] = [],
): ImplementationWorkerAggregation {
	const workerResults = inputs.map(workerSummary);
	return {
		workerResults,
		changeInputs: inputs.flatMap(workerChangeInputs),
		completed: workerResults.filter((result) => result.status === "completed"),
		blocked: workerResults.filter((result) => result.status === "blocked"),
		failed: workerResults.filter((result) => result.status === "failed"),
	};
}

function workerSummary(
	input: ImplementationWorkerResultInput,
): ImplementationWorkerSummary {
	return {
		workerId: text(input.workerId),
		workUnitId: text(input.workUnitId),
		planningRefs: planningRefs(input),
		status: normalizeWorkerStatus(input.status),
		...(text(input.claimId ?? input.claim_id)
			? { claimId: text(input.claimId ?? input.claim_id) }
			: {}),
		message: workerMessage(input),
		refs: workerRefs(input),
		...(text(input.sessionId ?? input.session_id)
			? { sessionId: text(input.sessionId ?? input.session_id) }
			: {}),
		...(text(input.sessionFile ?? input.session_file)
			? { sessionFile: text(input.sessionFile ?? input.session_file) }
			: {}),
	};
}

function workerChangeInputs(
	input: ImplementationWorkerResultInput,
): ImplementationChangeInput[] {
	if (normalizeWorkerStatus(input.status) !== "completed") return [];
	return rawWorkerChangeInputs(input).map((change, index) => ({
		...change,
		id: text(change.id) || `${text(input.workUnitId)}-${index + 1}`,
		planningRefs: planningRefsForChange(change, input),
		workerId: text(input.workerId),
		workUnitId: text(input.workUnitId),
		...(text(input.claimId ?? input.claim_id)
			? { claimId: text(input.claimId ?? input.claim_id) }
			: {}),
		...(text(input.sessionId ?? input.session_id)
			? { sessionId: text(input.sessionId ?? input.session_id) }
			: {}),
		...(text(input.sessionFile ?? input.session_file)
			? { sessionFile: text(input.sessionFile ?? input.session_file) }
			: {}),
	}));
}

function rawWorkerChangeInputs(
	input: ImplementationWorkerResultInput,
): ImplementationChangeInput[] {
	return [
		...objectList<ImplementationChangeInput>(input.changeInputs),
		...objectList<ImplementationChangeInput>(input.change_inputs),
		...objectList<ImplementationChangeInput>(input.changes),
	];
}

function planningRefsForChange(
	change: ImplementationChangeInput,
	input: ImplementationWorkerResultInput,
): string[] {
	const refs = [
		...stringList(change.planningRefs),
		...stringList(change.planning_refs),
	];
	return refs.length > 0 ? unique(refs) : planningRefs(input);
}

function planningRefs(input: ImplementationWorkerResultInput): string[] {
	const explicitRefs = unique([
		...stringList(input.planningRefs),
		...stringList(input.planning_refs),
	]);
	if (explicitRefs.length > 0) return explicitRefs;
	return unique(
		rawWorkerChangeInputs(input).flatMap((change) => [
			...stringList(change.planningRefs),
			...stringList(change.planning_refs),
		]),
	);
}

function workerRefs(input: ImplementationWorkerResultInput): string[] {
	return unique([
		...planningRefs(input),
		...stringList(input.refs),
		...objectList<ImplementationWorkerBlockerInput>(input.blockers).flatMap(
			(blocker) => stringList(blocker.refs),
		),
	]);
}

function workerMessage(input: ImplementationWorkerResultInput): string {
	return (
		text(input.message) ||
		objectList<ImplementationWorkerBlockerInput>(input.blockers)
			.map((blocker) => text(blocker.message))
			.filter(Boolean)
			.join(" ")
	);
}

function normalizeWorkerStatus(value: unknown): ImplementationWorkerStatus {
	const status = text(value).toLowerCase();
	if (["completed", "blocked", "failed"].includes(status)) {
		return status as ImplementationWorkerStatus;
	}
	return "completed";
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function objectList<T>(value: unknown): T[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is T => typeof item === "object" && item !== null,
			)
		: [];
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => text(value)).filter(Boolean)),
	);
}
