import type {
	AuthorityBinding,
	ChangeOperationPayload,
	CanonicalChangeOperation,
	OperationId,
} from "./contracts.ts";
import { createNextChangeOperation } from "./builder.ts";
import type { GitCommandRunner } from "./git-command.ts";
import type { ReplayAdmissionPolicy } from "./reducer.ts";
import type { ChangeWorkState, ProjectWorkState } from "./state.ts";
import {
	createCurrentGitSynchronizer,
	pushSynchronizedStateBatch,
	type ProjectAuthoritySnapshot,
	type SynchronizationObservation,
} from "./synchronization.ts";
import { canonicalJson, type Sha256Digest } from "../../utils/canonical-json.ts";

export interface DistributedMutationRuntimeInput {
	readonly repoRoot: string;
	readonly remote: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly currentProject: () =>
		| ProjectAuthoritySnapshot
		| Promise<ProjectAuthoritySnapshot>;
	readonly authorityBinding: AuthorityBinding;
	readonly policy: ReplayAdmissionPolicy;
	readonly runner?: GitCommandRunner;
	readonly materializationRoot?: string;
	readonly verifyTakeoverAuthority?: (authority: AuthorityBinding) => boolean;
	readonly clock?: () => string;
	readonly maxStaleRetries?: number;
}

export interface MutationReceipt {
	readonly status: "accepted" | "already_accepted";
	readonly operationId: OperationId;
	readonly stateHead: string;
	readonly attemptCount: number;
	readonly observation: SynchronizationObservation;
}

export interface AcquireChangeClaimInput {
	readonly changeId: string;
	readonly purpose: ChangeOperationPayload<"change_claim.acquired">["purpose"];
}

export interface ReleaseClaimInput {
	readonly changeId: string;
	readonly claimOperationId: OperationId;
	readonly reason: ChangeOperationPayload<"change_claim.released">["reason"];
}

export interface TakeoverChangeClaimInput {
	readonly changeId: string;
	readonly priorClaimOperationId: OperationId;
	readonly purpose: ChangeOperationPayload<"change_claim.takeover_recorded">["purpose"];
	readonly reason: string;
}

export type AcquireWorkItemClaimInput = Readonly<{changeId: string}> &
	ChangeOperationPayload<"work_item_claim.acquired">;

export type TakeoverWorkItemClaimInput = Readonly<{changeId: string}> &
	ChangeOperationPayload<"work_item_claim.takeover_recorded">;

export interface DistributedMutationRuntime {
	readonly synchronize: () => Promise<SynchronizationObservation>;
	readonly acquireChangeClaim: (
		input: AcquireChangeClaimInput,
	) => Promise<MutationReceipt>;
	readonly releaseChangeClaim: (
		input: ReleaseClaimInput,
	) => Promise<MutationReceipt>;
	readonly takeoverChangeClaim: (
		input: TakeoverChangeClaimInput,
	) => Promise<MutationReceipt>;
	readonly acquireWorkItemClaim: (
		input: AcquireWorkItemClaimInput,
	) => Promise<MutationReceipt>;
	readonly releaseWorkItemClaim: (
		input: ReleaseClaimInput,
	) => Promise<MutationReceipt>;
	readonly takeoverWorkItemClaim: (
		input: TakeoverWorkItemClaimInput,
	) => Promise<MutationReceipt>;
}

type ClaimMutationKind =
	| "change_claim.acquired"
	| "change_claim.released"
	| "change_claim.takeover_recorded"
	| "work_item_claim.acquired"
	| "work_item_claim.released"
	| "work_item_claim.takeover_recorded";

export function createDistributedMutationRuntime(
	input: DistributedMutationRuntimeInput,
): DistributedMutationRuntime {
	const clock = input.clock ?? (() => new Date().toISOString());
	const maxStaleRetries = input.maxStaleRetries ?? 2;
	if (!Number.isInteger(maxStaleRetries) || maxStaleRetries < 0) {
		throw new Error("maxStaleRetries must be a non-negative integer.");
	}
	const synchronizeCurrent = createCurrentGitSynchronizer(input);
	const synchronize = async (): Promise<SynchronizationObservation> => {
		const current = await synchronizeCurrent();
		return current.observation;
	};
	const execute = async <K extends ClaimMutationKind>(
		changeId: string,
		kind: K,
		payloadFor: (
			state: ChangeWorkState,
		) => ChangeOperationPayload<K>,
	): Promise<MutationReceipt> => {
		const recordedAt = clock();
		for (let attempt = 1; attempt <= maxStaleRetries + 1; attempt += 1) {
			const {currentProject, observation} = await synchronizeCurrent();
			if (
				observation.status !== "fresh" ||
				!observation.teamSnapshot ||
				!observation.workState
			) {
				throw new Error(
					`Distributed mutation requires fresh synchronization; current status is ${observation.status}.`,
				);
			}
			const change = requireChange(observation.workState, changeId);
			const payload = payloadFor(change);
			const alreadyAccepted = findAlreadyAccepted(
				change,
				kind,
				payload,
				input.authorityBinding,
			);
			if (alreadyAccepted) {
				return Object.freeze({
					status: "already_accepted",
					operationId: alreadyAccepted.operationId,
					stateHead: requireStateHead(observation.workState),
					attemptCount: attempt,
					observation,
				});
			}
			validateClaimMutation({
				change,
				kind,
				payload,
				authority: input.authorityBinding,
				verifyTakeoverAuthority: input.verifyTakeoverAuthority,
			});
			const operation = createNextChangeOperation(change, {
				changeId,
				kind,
				baseSnapshot: {
					remoteStateHead: observation.teamSnapshot.remoteStateHead,
					sourceHead: currentProject.sourceHead,
					knowledgeDigest: currentProject.knowledgeDigest,
					configDigest: currentProject.configDigest,
					policyDigest: currentProject.policyDigest,
				},
				authorityBinding: input.authorityBinding,
				recordedAt,
				payload,
			});
			const {pushResult} = await pushSynchronizedStateBatch({
				repoRoot: input.repoRoot,
				remote: input.remote,
				state: observation.workState,
				records: [operation],
				policy: input.policy,
				observation,
				runner: input.runner,
			});
			if (pushResult.status === "stale") continue;
			const verified = await synchronize();
			if (
				verified.status !== "fresh" ||
				!verified.workState ||
				!hasOperation(verified.workState, operation.operationId)
			) {
				throw new Error(
					`Accepted mutation ${operation.operationId} could not be verified from fresh Git state.`,
				);
			}
			return Object.freeze({
				status: "accepted",
				operationId: operation.operationId,
				stateHead: requireStateHead(verified.workState),
				attemptCount: attempt,
				observation: verified,
			});
		}
		throw new Error(
			`Distributed mutation remained stale after ${maxStaleRetries + 1} attempts.`,
		);
	};
	return Object.freeze({
		synchronize,
		acquireChangeClaim: (request: AcquireChangeClaimInput) =>
			execute(request.changeId, "change_claim.acquired", (change) => ({
				revisionId: requireCurrentRevision(change),
				purpose: request.purpose,
			})),
		releaseChangeClaim: (request: ReleaseClaimInput) =>
			execute(request.changeId, "change_claim.released", () => ({
				claimOperationId: request.claimOperationId,
				reason: request.reason,
			})),
		takeoverChangeClaim: (request: TakeoverChangeClaimInput) =>
			execute(request.changeId, "change_claim.takeover_recorded", (change) => ({
				priorClaimOperationId: request.priorClaimOperationId,
				revisionId: requireCurrentRevision(change),
				purpose: request.purpose,
				reason: request.reason,
			})),
		acquireWorkItemClaim: (request: AcquireWorkItemClaimInput) =>
			execute(request.changeId, "work_item_claim.acquired", () =>
				workItemClaimPayload(request),
			),
		releaseWorkItemClaim: (request: ReleaseClaimInput) =>
			execute(request.changeId, "work_item_claim.released", () => ({
				claimOperationId: request.claimOperationId,
				reason: request.reason,
			})),
		takeoverWorkItemClaim: (request: TakeoverWorkItemClaimInput) =>
			execute(request.changeId, "work_item_claim.takeover_recorded", () => ({
				...workItemClaimPayload(request),
				priorClaimOperationId: request.priorClaimOperationId,
				reason: request.reason,
			})),
	});
}

function workItemClaimPayload(
	request: AcquireWorkItemClaimInput | TakeoverWorkItemClaimInput,
): ChangeOperationPayload<"work_item_claim.acquired"> {
	return {
		planningEpochId: request.planningEpochId,
		workItemId: request.workItemId,
		assignmentAttemptId: request.assignmentAttemptId,
		workerId: request.workerId,
		workbenchId: request.workbenchId,
		sourceBase: request.sourceBase,
		scopeDigest: request.scopeDigest,
		budgetDigest: request.budgetDigest,
		obligationDigest: request.obligationDigest,
	};
}

function findAlreadyAccepted<K extends ClaimMutationKind>(
	change: ChangeWorkState,
	kind: K,
	payload: ChangeOperationPayload<K>,
	authority: AuthorityBinding,
): CanonicalChangeOperation | null {
	let operation: CanonicalChangeOperation | undefined;
	for (let index = change.operations.length - 1; index >= 0; index -= 1) {
		const candidate = change.operations[index];
		if (
			candidate.body.kind === kind &&
			canonicalJson(candidate.body.payload) === canonicalJson(payload) &&
			canonicalJson(candidate.body.authorityBinding) === canonicalJson(authority)
		) {
			operation = candidate;
			break;
		}
	}
	if (!operation) return null;
	if (kind === "change_claim.acquired") {
		return change.changeClaims.some(
			(claim) => claim.operationId === operation.operationId && claim.status === "active",
		)
			? operation
			: null;
	}
	if (kind === "work_item_claim.acquired") {
		return change.workItemClaims.some(
			(claim) => claim.operationId === operation.operationId && claim.status === "active",
		)
			? operation
			: null;
	}
	return operation;
}

function validateClaimMutation<K extends ClaimMutationKind>(input: {
	readonly change: ChangeWorkState;
	readonly kind: K;
	readonly payload: ChangeOperationPayload<K>;
	readonly authority: AuthorityBinding;
	readonly verifyTakeoverAuthority?: (authority: AuthorityBinding) => boolean;
}): void {
	if (
		input.kind === "change_claim.takeover_recorded" ||
		input.kind === "work_item_claim.takeover_recorded"
	) {
		if (
			!input.authority.authenticationEvidenceId ||
			!input.verifyTakeoverAuthority?.(input.authority)
		) {
			throw new Error("Claim takeover requires authenticated authority evidence.");
		}
		return;
	}
	if (
		input.kind === "change_claim.released" ||
		input.kind === "work_item_claim.released"
	) {
		const released = input.payload as ChangeOperationPayload<"change_claim.released">;
		const claimOperation = input.change.operations.find(
			(operation) => operation.operationId === released.claimOperationId,
		);
		if (!claimOperation) {
			throw new Error(
				`Claim ${released.claimOperationId} does not exist on ${input.change.changeId}.`,
			);
		}
		if (
			claimOperation.body.authorityBinding.actorId !== input.authority.actorId
		) {
			throw new Error("Claim release requires the current claim actor.");
		}
	}
}

function requireChange(state: ProjectWorkState, changeId: string): ChangeWorkState {
	const change = state.changes.find((candidate) => candidate.changeId === changeId);
	if (!change) throw new Error(`Change ${changeId} does not exist in accepted WorkState.`);
	return change;
}

function requireCurrentRevision(change: ChangeWorkState): Sha256Digest {
	if (!change.currentRevision) {
		throw new Error(`Change ${change.changeId} has no current revision.`);
	}
	return change.currentRevision.revisionId;
}

function requireStateHead(state: ProjectWorkState): string {
	if (!state.stateHead) throw new Error("Accepted mutation WorkState has no state head.");
	return state.stateHead;
}

function hasOperation(state: ProjectWorkState, operationId: OperationId): boolean {
	return state.changes.some((change) =>
		change.operations.some((operation) => operation.operationId === operationId),
	);
}
