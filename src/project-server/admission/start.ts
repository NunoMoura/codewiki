import {createNextChangeOperation} from "../../changes/trace/builder.ts";
import type {
	CanonicalChangeOperation,
	ChangeRevision,
	OperationId,
} from "../../changes/trace/contracts.ts";
import {reduceChangeOperation} from "../../changes/trace/reduce-operation.ts";
import type {
	ChangeWorkState,
	LoopAttemptProjection,
	ProjectWorkState,
} from "../../changes/trace/state.ts";
import {
	assertDecisionAttentionSelectionContext,
	decisionSelectionAuthorizationRequest,
	decisionSelectionConflictRefs,
	decisionSelectionIdempotencyDigest,
	normalizeDecisionSelectionAuthority,
	parseDecisionAttentionSelectionCommand,
	selectDecisionAttention,
	type AuthenticatedDecisionSelectionAuthority,
	type DecisionAttentionSelectionAuthorizationRequest,
	type DecisionAttentionSelectionCommand,
	type DecisionAttentionSelectionContext,
	DecisionAttentionSelectionError,
} from "../../changes/triage/selection.ts";
import type {Sha256Digest} from "../../utils/canonical-json.ts";
import type {
	ProjectCoordinator,
	ProjectCoordinatorJob,
	ProjectCoordinatorRecovery,
} from "../coordinator/project.ts";

export interface DecisionStartResult {
	readonly attemptOperationId: OperationId;
}

export interface DecisionAttemptExecutor<TResult = unknown> {
	run(input: {
		readonly attemptOperationId: OperationId;
		readonly changeId: string;
		readonly changeRevisionId: Sha256Digest;
		readonly signal: AbortSignal;
	}): TResult | Promise<TResult>;
	recover(input: {
		readonly attemptOperationId: OperationId;
		readonly changeId: string;
		readonly changeRevisionId: Sha256Digest;
	}):
		| ProjectCoordinatorRecovery<TResult>
		| undefined
		| Promise<ProjectCoordinatorRecovery<TResult> | undefined>;
}

export interface DecisionAttemptAppendInput {
	readonly operation: CanonicalChangeOperation<"loop.attempt_started">;
	readonly expectedWorkStateDigest: Sha256Digest;
}

export interface DecisionStartProjectServerOptions<TResult = unknown> {
	readonly coordinator: ProjectCoordinator;
	readonly loadCurrentContext: () =>
		| DecisionAttentionSelectionContext
		| Promise<DecisionAttentionSelectionContext>;
	readonly authorize: (
		request: DecisionAttentionSelectionAuthorizationRequest,
	) => boolean | Promise<boolean>;
	readonly appendAttempt: (
		input: DecisionAttemptAppendInput,
	) => OperationId | Promise<OperationId>;
	readonly executor: DecisionAttemptExecutor<TResult>;
	readonly now?: () => string;
}

export interface DecisionStartInput {
	readonly command: DecisionAttentionSelectionCommand;
	readonly authority: AuthenticatedDecisionSelectionAuthority;
}

export interface DecisionStartProjectServer {
	start(input: DecisionStartInput): Promise<DecisionStartResult>;
}

interface ExistingDecisionAttempt {
	readonly change: ChangeWorkState;
	readonly attempt: LoopAttemptProjection;
	readonly revision: ChangeRevision;
}

export function createDecisionStartProjectServer<TResult = unknown>(
	options: DecisionStartProjectServerOptions<TResult>,
): DecisionStartProjectServer {
	return Object.freeze({
		async start(input: DecisionStartInput) {
			const command = parseDecisionAttentionSelectionCommand(input.command);
			const authority = normalizeDecisionSelectionAuthority(input.authority);
			const idempotencyDigest = decisionSelectionIdempotencyDigest({
				command,
				authority,
			});
			const before = await options.loadCurrentContext();
			assertDecisionAttentionSelectionContext(before);
			const replayBefore = existingDecisionAttempt({
				state: before.workState,
				idempotencyDigest,
				command,
			});
			if (replayBefore) {
				return startExistingAttempt({options, existing: replayBefore});
			}
			selectDecisionAttention({context: before, command});
			const authorization = decisionSelectionAuthorizationRequest({
				command,
				authority,
			});
			if (!(await options.authorize(authorization))) {
				throw new DecisionAttentionSelectionError({
					code: "forbidden",
					message: "Decision attention selection authority was denied.",
				});
			}
			const after = await options.loadCurrentContext();
			assertDecisionAttentionSelectionContext(after);
			const replayAfter = existingDecisionAttempt({
				state: after.workState,
				idempotencyDigest,
				command,
			});
			if (replayAfter) {
				return startExistingAttempt({options, existing: replayAfter});
			}
			const selectedAfter = selectDecisionAttention({context: after, command});
			const operation = createAttemptOperation({
				context: after,
				change: selectedAfter.change,
				authority,
				idempotencyDigest,
				recordedAt: (options.now ?? (() => new Date().toISOString()))(),
			});
			try {
				const acceptedOperationId = await options.appendAttempt({
					operation,
					expectedWorkStateDigest: after.workState.workStateDigest,
				});
				if (acceptedOperationId !== operation.operationId) {
					throw new Error(
						"Decision attempt append returned a different canonical operation.",
					);
				}
			} catch (error) {
				const current = await options.loadCurrentContext();
				assertDecisionAttentionSelectionContext(current);
				const accepted = existingDecisionAttempt({
					state: current.workState,
					idempotencyDigest,
					command,
				});
				if (!accepted) throw error;
				return startExistingAttempt({options, existing: accepted});
			}
			scheduleDecisionAttempt({
				options,
				attemptOperationId: operation.operationId,
				changeId: command.changeId,
				changeRevisionId: command.changeRevisionId,
				conflictRefs: decisionSelectionConflictRefs({
					change: selectedAfter.change,
					revision: selectedAfter.change.currentRevision as ChangeRevision,
				}),
			});
			return Object.freeze({attemptOperationId: operation.operationId});
		},
	});
}

function createAttemptOperation(input: {
	readonly context: DecisionAttentionSelectionContext;
	readonly change: ChangeWorkState;
	readonly authority: AuthenticatedDecisionSelectionAuthority;
	readonly idempotencyDigest: Sha256Digest;
	readonly recordedAt: string;
}): CanonicalChangeOperation<"loop.attempt_started"> {
	const revision = input.change.currentRevision;
	if (!revision) {
		throw selectionConflict(
			"Decision attention selection Change revision is unavailable.",
		);
	}
	const binding = input.context.projection.binding;
	const operation = createNextChangeOperation(input.change, {
		changeId: input.change.changeId,
		kind: "loop.attempt_started",
		baseSnapshot: {
			remoteStateHead: binding.remoteStateHead,
			sourceHead: binding.sourceHead,
			knowledgeDigest: binding.knowledgeDigest,
			configDigest: binding.configDigest,
			policyDigest: binding.policyDigest,
		},
		authorityBinding: input.authority,
		recordedAt: input.recordedAt,
		payload: {
			loop: "decision",
			changeRevisionId: revision.revisionId,
			loopProtocolDigest: binding.policyDigest,
			routeId: "decision-selected-v2",
			privateAttemptDigest: input.idempotencyDigest,
		},
	});
	reduceChangeOperation(input.change, operation, {});
	return operation;
}

function startExistingAttempt<TResult>(input: {
	readonly options: DecisionStartProjectServerOptions<TResult>;
	readonly existing: ExistingDecisionAttempt;
}): DecisionStartResult {
	scheduleDecisionAttempt({
		options: input.options,
		attemptOperationId: input.existing.attempt.operationId,
		changeId: input.existing.change.changeId,
		changeRevisionId: input.existing.attempt.changeRevisionId,
		conflictRefs: decisionSelectionConflictRefs({
			change: input.existing.change,
			revision: input.existing.revision,
		}),
	});
	return Object.freeze({
		attemptOperationId: input.existing.attempt.operationId,
	});
}

function scheduleDecisionAttempt<TResult>(input: {
	readonly options: DecisionStartProjectServerOptions<TResult>;
	readonly attemptOperationId: OperationId;
	readonly changeId: string;
	readonly changeRevisionId: Sha256Digest;
	readonly conflictRefs: readonly string[];
}): void {
	const execution = {
		attemptOperationId: input.attemptOperationId,
		changeId: input.changeId,
		changeRevisionId: input.changeRevisionId,
	};
	const job: ProjectCoordinatorJob<TResult> = {
		idempotencyKey: input.attemptOperationId,
		lane: {
			kind: "decision",
			changeId: input.changeId,
			changeRevisionId: input.changeRevisionId,
		},
		conflictRefs: [...input.conflictRefs],
		effect: "write",
		recover: () => input.options.executor.recover(execution),
		run: (signal) => input.options.executor.run({...execution, signal}),
	};
	void input.options.coordinator.schedule(job).catch(() => {
		// Coordinator events retain the failure; command admission already committed.
	});
}

function existingDecisionAttempt(input: {
	readonly state: ProjectWorkState;
	readonly idempotencyDigest: Sha256Digest;
	readonly command: DecisionAttentionSelectionCommand;
}): ExistingDecisionAttempt | undefined {
	for (const change of input.state.changes) {
		const attempt = change.loopAttempts.find(
			(entry) => entry.privateAttemptDigest === input.idempotencyDigest,
		);
		if (!attempt) continue;
		if (
			attempt.loop !== "decision" ||
			change.changeId !== input.command.changeId ||
			attempt.changeRevisionId !== input.command.changeRevisionId
		) {
			throw selectionConflict(
				"Decision attention selection idempotencyKey was already used with different authenticated input.",
			);
		}
		const revision = changeRevision({
			change,
			revisionId: attempt.changeRevisionId,
		});
		if (!revision) {
			throw selectionConflict(
				"Decision attention selection revision history is incomplete.",
			);
		}
		return {change, attempt, revision};
	}
	return undefined;
}

function changeRevision(input: {
	readonly change: ChangeWorkState;
	readonly revisionId: Sha256Digest;
}): ChangeRevision | undefined {
	if (input.change.currentRevision?.revisionId === input.revisionId) {
		return input.change.currentRevision;
	}
	for (const operation of input.change.operations) {
		if (
			operation.body.kind !== "change.proposed" &&
			operation.body.kind !== "change.revised"
		) {
			continue;
		}
		const payload = operation.body.payload as {readonly revision: ChangeRevision};
		if (payload.revision.revisionId === input.revisionId) {
			return payload.revision;
		}
	}
	return undefined;
}

function selectionConflict(message: string): DecisionAttentionSelectionError {
	return new DecisionAttentionSelectionError({code: "conflict", message});
}
