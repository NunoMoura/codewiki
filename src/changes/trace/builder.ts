import {
	CHANGE_TRACE_PROTOCOL,
	type CanonicalChangeOperation,
	type ChangeOperationBody,
	type ChangeOperationKind,
	type OperationId,
} from "./contracts.ts";
import { OPERATION_DEFINITIONS } from "./catalog.ts";
import {
	createCanonicalChangeOperation,
	type CreateChangeOperationInput,
} from "./identity.ts";
import {
	initialChangeStateDigest,
	nextChangeStateDigest,
	type ChangeWorkState,
} from "./state.ts";
import { compareText } from "./order.ts";

export type CreateNextChangeOperationInput<K extends ChangeOperationKind> = Omit<
	CreateChangeOperationInput<K>,
	"parents" | "preStateDigest" | "postStateDigest"
> & {
	readonly additionalParents?: readonly OperationId[];
};

export function createNextChangeOperation<K extends ChangeOperationKind>(
	state: ChangeWorkState | null,
	input: CreateNextChangeOperationInput<K>,
): CanonicalChangeOperation<K> {
	const definition = OPERATION_DEFINITIONS[input.kind];
	const parentPolicy = definition.parentPolicy;
	if (!parentPolicy) {
		throw new Error(`${input.kind} is not Change-scoped.`);
	}
	const preStateDigest =
		state?.stateDigest ?? initialChangeStateDigest(input.changeId);
	const parents = operationParents(
		state,
		parentPolicy,
		input.additionalParents ?? [],
		input.kind,
	);
	const bodyWithoutPost = {
		protocol: CHANGE_TRACE_PROTOCOL,
		changeId: input.changeId,
		kind: input.kind,
		kindVersion: "1.0.0" as const,
		parents,
		baseSnapshot: input.baseSnapshot,
		authorityBinding: input.authorityBinding,
		recordedAt: input.recordedAt,
		preStateDigest,
		payload: input.payload,
	} as Omit<ChangeOperationBody<K>, "postStateDigest">;
	const postStateDigest = nextChangeStateDigest(bodyWithoutPost);
	return createCanonicalChangeOperation({
		changeId: input.changeId,
		kind: input.kind,
		parents,
		baseSnapshot: input.baseSnapshot,
		authorityBinding: input.authorityBinding,
		recordedAt: input.recordedAt,
		preStateDigest,
		postStateDigest,
		payload: input.payload,
	});
}

function operationParents(
	state: ChangeWorkState | null,
	policy: NonNullable<
		(typeof OPERATION_DEFINITIONS)[ChangeOperationKind]["parentPolicy"]
	>,
	additionalParents: readonly OperationId[],
	kind: ChangeOperationKind,
): readonly OperationId[] {
	if (policy.kind === "root") {
		if (additionalParents.length > 0) {
			throw new Error(`${kind} cannot have additional parents.`);
		}
		return [];
	}
	if (!state) {
		throw new Error(`${kind} requires an existing Change tail.`);
	}
	if (policy.kind === "tail") {
		if (additionalParents.length > 0) {
			throw new Error(`${kind} cannot have additional parents.`);
		}
		return [state.tailOperationId];
	}
	return Object.freeze(
		[...new Set([state.tailOperationId, ...additionalParents])].sort(compareText),
	);
}
