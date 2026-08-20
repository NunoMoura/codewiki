import {
	assertValidCanonicalChangeOperation,
	assertValidStateCommitManifest,
	createStateCommitManifest,
	sameBaseSnapshot,
	type CreateStateCommitManifestInput,
} from "./identity.ts";
import type {
	AuthorityEvaluator,
	BaseSnapshot,
	CanonicalChangeOperation,
	ChangeOperationKind,
	GitObjectId,
	OperationAdmissionRequest,
	OperationId,
	StateCommitManifest,
} from "./contracts.ts";
import { OPERATION_DEFINITIONS } from "./catalog.ts";
import { reduceChangeOperation } from "./reduce-operation.ts";
import {
	changeById,
	createInitialProjectWorkState,
	materializeProjectWorkState,
	type ChangeWorkState,
	type ProjectWorkState,
} from "./state.ts";
import { canonicalJson } from "../../utils/canonical-json.ts";
import { throwProtocolFailure } from "./errors.ts";
import { compareText, sameText } from "./order.ts";

export type AcceptedProtocolRecord = CanonicalChangeOperation;

export interface AcceptedStateBatch {
	readonly stateHead: GitObjectId;
	readonly manifest: StateCommitManifest;
	readonly records: readonly AcceptedProtocolRecord[];
}

export interface SnapshotAdmissionRequest {
	readonly operationId: OperationId;
	readonly kind: AcceptedProtocolRecord["body"]["kind"];
	readonly baseSnapshot: BaseSnapshot;
	readonly expectedPreviousStateHead: GitObjectId | null;
}

export interface ReplayAdmissionPolicy {
	readonly authorize: AuthorityEvaluator;
	readonly acceptSnapshot: (request: SnapshotAdmissionRequest) => boolean;
}

export type StateBatchReductionErrorCode =
	| "INVALID_STATE_HEAD"
	| "MANIFEST_HEAD_MISMATCH"
	| "MANIFEST_RECORD_MISMATCH"
	| "DUPLICATE_OPERATION"
	| "UNAUTHORIZED_ACTOR"
	| "STALE_BASE"
	| "BATCH_BASE_MISMATCH"
	| "ATOMIC_BINDING_MISSING"
	| "TAIL_MISMATCH";

export function reduceAcceptedStateBatch(
	state: ProjectWorkState,
	batch: AcceptedStateBatch,
	policy: ReplayAdmissionPolicy,
): ProjectWorkState {
	validateBatchEnvelope(state, batch);
	const changeOperations = batch.records;
	validateRecordIdentities(batch.records);
	validateRecordOrder(state, batch);
	const observedBase = validateAdmission(state, batch, policy);
	validateAtomicMerges(changeOperations);
	validateAtomicSplits(changeOperations);
	let changes = [...state.changes];
	for (const operation of changeOperations) {
		const current = changes.find(
			(change) => change.changeId === operation.body.changeId,
		);
		const next = reduceChangeOperation(current ?? null, operation, {});
		changes = replaceChange(changes, next);
	}
	validateManifestTails(state, changes, changeOperations, batch.manifest);
	return materializeProjectWorkState({
		reducer: state.reducer,
		stateHead: batch.stateHead,
		observedBase,
		changes: changes.sort((left, right) => compareText(left.changeId, right.changeId)),
		acceptedOperationIds: [
			...state.acceptedOperationIds,
			...batch.records.map(recordId),
		],
	});
}

export function replayAcceptedStateBatches(
	batches: readonly AcceptedStateBatch[],
	policy: ReplayAdmissionPolicy,
	initialState: ProjectWorkState = createInitialProjectWorkState(),
): ProjectWorkState {
	return batches.reduce(
		(state, batch) => reduceAcceptedStateBatch(state, batch, policy),
		initialState,
	);
}

export function createManifestForRecords(
	state: ProjectWorkState,
	records: readonly AcceptedProtocolRecord[],
): StateCommitManifest {
	if (records.length === 0) {
		throw new Error("Accepted state batch must contain at least one record.");
	}
	const tails = new Map<
		string,
		{previousTail: OperationId | null; nextTail: OperationId}
	>();
	for (const operation of records) {
		const current = tails.get(operation.body.changeId);
		tails.set(operation.body.changeId, {
			previousTail:
				current?.previousTail ??
				changeById(state, operation.body.changeId)?.tailOperationId ??
				null,
			nextTail: operation.operationId,
		});
	}
	const input: CreateStateCommitManifestInput = {
		previousStateHead: state.stateHead,
		operationIds: records.map(recordId),
		changedTraceTails: [...tails]
			.map(([changeId, tail]) => ({changeId, ...tail}))
			.sort((left, right) => compareText(left.changeId, right.changeId)),
	};
	return createStateCommitManifest(input);
}

function validateBatchEnvelope(
	state: ProjectWorkState,
	batch: AcceptedStateBatch,
): void {
	assertValidStateCommitManifest(batch.manifest);
	if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(batch.stateHead)) {
		batchInvalid("INVALID_STATE_HEAD", null, `invalid Git state head ${batch.stateHead}.`);
	}
	if (batch.stateHead === state.stateHead) {
		batchInvalid("INVALID_STATE_HEAD", null, "state head must advance.");
	}
	if (batch.manifest.body.previousStateHead !== state.stateHead) {
		batchInvalid(
			"MANIFEST_HEAD_MISMATCH",
			null,
			`manifest expected ${String(batch.manifest.body.previousStateHead)}, current is ${String(state.stateHead)}.`,
		);
	}
}

function validateRecordIdentities(
	records: readonly AcceptedProtocolRecord[],
): void {
	for (const record of records) {
		assertValidCanonicalChangeOperation(record);
	}
}

function validateRecordOrder(
	state: ProjectWorkState,
	batch: AcceptedStateBatch,
): void {
	const recordIds = batch.records.map(recordId);
	if (!sameText(recordIds, batch.manifest.body.operationIds)) {
		batchInvalid(
			"MANIFEST_RECORD_MISMATCH",
			null,
			"manifest operationIds do not match exact record order.",
		);
	}
	const unique = new Set(recordIds);
	if (unique.size !== recordIds.length) {
		batchInvalid("DUPLICATE_OPERATION", null, "batch contains duplicate operation IDs.");
	}
	const accepted = new Set(state.acceptedOperationIds);
	for (const operationId of recordIds) {
		if (accepted.has(operationId)) {
			batchInvalid(
				"DUPLICATE_OPERATION",
				operationId,
				`operation ${operationId} is already accepted.`,
			);
		}
	}
}

function validateAdmission(
	state: ProjectWorkState,
	batch: AcceptedStateBatch,
	policy: ReplayAdmissionPolicy,
): BaseSnapshot {
	const first = batch.records[0];
	if (!first) {
		batchInvalid("MANIFEST_RECORD_MISMATCH", null, "accepted batch is empty.");
	}
	const expectedBase = baseSnapshotOf(first);
	for (const record of batch.records) {
		const operationId = recordId(record);
		const baseSnapshot = baseSnapshotOf(record);
		if (baseSnapshot.remoteStateHead !== state.stateHead) {
			batchInvalid(
				"STALE_BASE",
				operationId,
				`record base ${String(baseSnapshot.remoteStateHead)} does not match ${String(state.stateHead)}.`,
			);
		}
		if (!sameBaseSnapshot(expectedBase, baseSnapshot)) {
			batchInvalid(
				"BATCH_BASE_MISMATCH",
				operationId,
				"accepted records do not share one exact base snapshot.",
			);
		}
		const definition = OPERATION_DEFINITIONS[record.body.kind];
		const admission: OperationAdmissionRequest = {
			operationId,
			kind: record.body.kind,
			capability: definition.capability,
			authorityBinding: record.body.authorityBinding,
			baseSnapshot,
		};
		if (!policy.authorize(admission)) {
			batchInvalid(
				"UNAUTHORIZED_ACTOR",
				operationId,
				`${record.body.authorityBinding.actorId} lacks ${definition.capability}.`,
			);
		}
		if (
			!policy.acceptSnapshot({
				operationId,
				kind: record.body.kind,
				baseSnapshot,
				expectedPreviousStateHead: state.stateHead,
			})
		) {
			batchInvalid("STALE_BASE", operationId, "snapshot admission rejected.");
		}
	}
	return expectedBase;
}

type MergeOperation = CanonicalChangeOperation<"change.merge_recorded">;
type SplitOperation = CanonicalChangeOperation<"change.split_recorded">;

function validateAtomicMerges(
	operations: readonly CanonicalChangeOperation[],
): void {
	const merges = operations.filter(
		(operation): operation is MergeOperation =>
			isOperationKind(operation, "change.merge_recorded"),
	);
	validateLineageGroups({
		records: merges,
		kind: "change.merge_recorded",
		identityOf: (operation) => operation.body.payload.mergeId,
		participantsOf: (operation) => [
			...operation.body.payload.sources.map((entry) => entry.changeId),
			operation.body.payload.result.changeId,
		],
	});
}

function validateAtomicSplits(
	operations: readonly CanonicalChangeOperation[],
): void {
	const splits = operations.filter(
		(operation): operation is SplitOperation =>
			isOperationKind(operation, "change.split_recorded"),
	);
	validateLineageGroups({
		records: splits,
		kind: "change.split_recorded",
		identityOf: (operation) => operation.body.payload.splitId,
		participantsOf: (operation) => [
			operation.body.payload.source.changeId,
			...operation.body.payload.results.map((entry) => entry.changeId),
		],
	});
}

interface LineageGroupValidation<T extends CanonicalChangeOperation> {
	readonly records: readonly T[];
	readonly kind: "change.merge_recorded" | "change.split_recorded";
	readonly identityOf: (operation: T) => string;
	readonly participantsOf: (operation: T) => readonly string[];
}

function validateLineageGroups<T extends CanonicalChangeOperation>({
	records,
	kind,
	identityOf,
	participantsOf,
}: LineageGroupValidation<T>): void {
	const identities = new Set(records.map(identityOf));
	for (const identity of identities) {
		const group = records.filter((operation) => identityOf(operation) === identity);
		const first = group[0];
		if (!first) continue;
		const expected = new Set(participantsOf(first));
		const actual = new Set(group.map((operation) => operation.body.changeId));
		if (actual.size !== group.length || !sameSet(actual, expected)) {
			batchInvalid(
				"ATOMIC_BINDING_MISSING",
				first.operationId,
				`${kind} ${identity} lacks exact participant operations.`,
			);
		}
	}
}

function validateManifestTails(
	before: ProjectWorkState,
	afterChanges: readonly ChangeWorkState[],
	operations: readonly CanonicalChangeOperation[],
	manifest: StateCommitManifest,
): void {
	const changedIds = [...new Set(operations.map((operation) => operation.body.changeId))].sort(
		compareText,
	);
	const manifestIds = manifest.body.changedTraceTails.map((entry) => entry.changeId);
	if (!sameText(changedIds, manifestIds)) {
		batchInvalid("TAIL_MISMATCH", null, "manifest changed Trace set is incomplete.");
	}
	for (const entry of manifest.body.changedTraceTails) {
		const previous = changeById(before, entry.changeId)?.tailOperationId ?? null;
		const next = afterChanges.find((change) => change.changeId === entry.changeId);
		if (entry.previousTail !== previous || entry.nextTail !== next?.tailOperationId) {
			batchInvalid(
				"TAIL_MISMATCH",
				entry.nextTail,
				`manifest tail transition for ${entry.changeId} is invalid.`,
			);
		}
	}
}

function isOperationKind<K extends ChangeOperationKind>(
	operation: CanonicalChangeOperation,
	kind: K,
): operation is CanonicalChangeOperation<K> {
	return operation.body.kind === kind;
}

function baseSnapshotOf(record: AcceptedProtocolRecord): BaseSnapshot {
	const snapshot = record.body.baseSnapshot;
	return {
		remoteStateHead: snapshot.remoteStateHead,
		sourceHead: snapshot.sourceHead,
		knowledgeDigest: snapshot.knowledgeDigest,
		configDigest: snapshot.configDigest,
		policyDigest: snapshot.policyDigest,
	};
}

function recordId(record: AcceptedProtocolRecord): OperationId {
	return record.operationId;
}

function replaceChange(
	changes: readonly ChangeWorkState[],
	next: ChangeWorkState,
): ChangeWorkState[] {
	const index = changes.findIndex((change) => change.changeId === next.changeId);
	if (index < 0) return [...changes, next];
	return changes.map((change, changeIndex) =>
		changeIndex === index ? next : change,
	);
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
	return left.size === right.size && [...left].every((value) => right.has(value));
}

function batchInvalid(
	code: StateBatchReductionErrorCode,
	operationId: OperationId | null,
	message: string,
): never {
	return throwProtocolFailure(
		"StateBatchReductionError",
		code,
		operationId,
		message,
	);
}

export function sameWorkState(
	left: ProjectWorkState,
	right: ProjectWorkState,
): boolean {
	return canonicalJson(left) === canonicalJson(right);
}
