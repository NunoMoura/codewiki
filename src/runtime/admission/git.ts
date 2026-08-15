import type {
	CanonicalChangeOperation,
	OperationId,
} from "../../changes/trace/contracts.ts";
import type {GitCommandRunner} from "../../changes/trace/git-command.ts";
import {projectAlignmentGraph} from "../../alignment/graph.ts";
import type {ReplayAdmissionPolicy} from "../../changes/trace/reducer.ts";
import type {ProjectWorkState} from "../../changes/trace/state.ts";
import {
	createCurrentGitSynchronizer,
	pushSynchronizedStateBatch,
	type ProjectAuthoritySnapshot,
	type SynchronizationObservation,
	type TeamSnapshot,
} from "../../changes/trace/synchronization.ts";
import {createBacklogTriagePolicy} from "../../changes/triage/policy.ts";
import {buildBacklogTriageProjection} from "../../changes/triage/projection.ts";
import type {DecisionAttentionSelectionContext} from "../../changes/triage/selection.ts";
import {
	loadProtectedWikiConfigFile,
	wikiConfigDigest,
} from "../../project/config-file.ts";
import type {Sha256Digest} from "../../utils/canonical-json.ts";
import type {DecisionAttemptAppendInput} from "./start.ts";

const DEFAULT_PROJECTION_TTL_MS = 30_000;
const MIN_PROJECTION_TTL_MS = 1_000;
const MAX_PROJECTION_TTL_MS = 300_000;

export interface DecisionGitAdmissionOptions {
	readonly repoRoot: string;
	readonly remote: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly currentProject: () =>
		| ProjectAuthoritySnapshot
		| Promise<ProjectAuthoritySnapshot>;
	readonly replayPolicy: ReplayAdmissionPolicy;
	readonly runner?: GitCommandRunner;
	readonly materializationRoot?: string;
	readonly now?: () => Date;
	readonly projectionTtlMs?: number;
}

export interface DecisionGitAdmission {
	readonly loadCurrentContext: () => Promise<DecisionAttentionSelectionContext>;
	readonly appendAttempt: (input: DecisionAttemptAppendInput) => Promise<OperationId>;
}

interface FreshDecisionState {
	readonly workState: ProjectWorkState;
	readonly teamSnapshot: TeamSnapshot;
}

interface CachedContext {
	readonly teamSnapshotDigest: Sha256Digest;
	readonly workStateDigest: Sha256Digest;
	readonly expiresAt: number;
	readonly context: DecisionAttentionSelectionContext;
}

export function createDecisionGitAdmission(
	options: DecisionGitAdmissionOptions,
): DecisionGitAdmission {
	const synchronizeCurrent = createCurrentGitSynchronizer({
		repoRoot: options.repoRoot,
		remote: options.remote,
		repositoryIdentity: options.repositoryIdentity,
		currentProject: options.currentProject,
		policy: options.replayPolicy,
		runner: options.runner,
		materializationRoot: options.materializationRoot,
	});
	const now = options.now ?? (() => new Date());
	const projectionTtlMs = boundedProjectionTtl(options.projectionTtlMs);
	let cached: CachedContext | undefined;

	const loadCurrentContext = async (): Promise<DecisionAttentionSelectionContext> => {
		const {observation} = await synchronizeCurrent();
		const current = requireFreshDecisionState(observation);
		const observedAt = now().getTime();
		if (!Number.isFinite(observedAt)) {
			throw new Error("Decision projection clock returned an invalid date.");
		}
		if (
			cached &&
			cached.teamSnapshotDigest === current.teamSnapshot.snapshotDigest &&
			cached.workStateDigest === current.workState.workStateDigest &&
			observedAt <= cached.expiresAt
		) {
			return cached.context;
		}
		const protectedConfig = await loadProtectedWikiConfigFile({
			repoRoot: options.repoRoot,
			protectedSourceHead: current.teamSnapshot.protectedSourceHead,
			runner: options.runner,
		});
		const projectConfigDigest = wikiConfigDigest(protectedConfig);
		if (projectConfigDigest !== current.teamSnapshot.configDigest) {
			throw new Error(
				"Decision projection protected config does not match the current team snapshot.",
			);
		}
		const policy = createBacklogTriagePolicy({
			projectConfigDigest,
			userStandards: protectedConfig.userStandards,
			bindings: protectedConfig.triagePreferences,
		});
		const context = Object.freeze({
			workState: current.workState,
			projection: buildBacklogTriageProjection({
				workState: current.workState,
				graph: projectAlignmentGraph(current.workState),
				policy,
				asOf: new Date(observedAt).toISOString(),
			}),
		});
		cached = {
			teamSnapshotDigest: current.teamSnapshot.snapshotDigest,
			workStateDigest: current.workState.workStateDigest,
			expiresAt: observedAt + projectionTtlMs,
			context,
		};
		return context;
	};

	const appendAttempt = async (
		input: DecisionAttemptAppendInput,
	): Promise<OperationId> => {
		const {observation} = await synchronizeCurrent();
		const current = requireFreshDecisionState(observation);
		if (current.workState.workStateDigest !== input.expectedWorkStateDigest) {
			throw new Error(
				"Decision attempt append received a stale expected WorkState digest.",
			);
		}
		assertAttemptSnapshot({operation: input.operation, current});
		const {pushResult} = await pushSynchronizedStateBatch({
			repoRoot: options.repoRoot,
			remote: options.remote,
			state: current.workState,
			records: [input.operation],
			policy: options.replayPolicy,
			observation,
			runner: options.runner,
		});
		if (pushResult.status === "stale") {
			throw new Error(
				"Decision attempt push became stale; Runtime must refetch and reevaluate selection.",
			);
		}
		const {observation: verifiedObservation} = await synchronizeCurrent();
		const verified = requireFreshDecisionState(verifiedObservation);
		if (!verified.workState.acceptedOperationIds.includes(input.operation.operationId)) {
			throw new Error(
				`Accepted Decision attempt ${input.operation.operationId} could not be verified.`,
			);
		}
		cached = undefined;
		return input.operation.operationId;
	};

	return Object.freeze({loadCurrentContext, appendAttempt});
}

function requireFreshDecisionState(
	observation: SynchronizationObservation,
): FreshDecisionState {
	if (
		observation.status !== "fresh" ||
		!observation.workState ||
		!observation.teamSnapshot
	) {
		throw new Error(
			`Decision admission requires fresh synchronization; current status is ${observation.status}.`,
		);
	}
	return {
		workState: observation.workState,
		teamSnapshot: observation.teamSnapshot,
	};
}

function assertAttemptSnapshot(input: {
	readonly operation: CanonicalChangeOperation<"loop.attempt_started">;
	readonly current: FreshDecisionState;
}): void {
	const snapshot = input.operation.body.baseSnapshot;
	const team = input.current.teamSnapshot;
	if (
		input.operation.body.kind !== "loop.attempt_started" ||
		input.operation.body.payload.loop !== "decision" ||
		snapshot.remoteStateHead !== team.remoteStateHead ||
		snapshot.sourceHead !== team.protectedSourceHead ||
		snapshot.knowledgeDigest !== team.knowledgeDigest ||
		snapshot.configDigest !== team.configDigest ||
		snapshot.policyDigest !== team.policyDigest
	) {
		throw new Error(
			"Decision attempt operation is not bound to the current team snapshot.",
		);
	}
}

function boundedProjectionTtl(value: number | undefined): number {
	const ttl = value ?? DEFAULT_PROJECTION_TTL_MS;
	if (
		!Number.isInteger(ttl) ||
		ttl < MIN_PROJECTION_TTL_MS ||
		ttl > MAX_PROJECTION_TTL_MS
	) {
		throw new Error(
			`projectionTtlMs must be an integer from ${MIN_PROJECTION_TTL_MS} to ${MAX_PROJECTION_TTL_MS}.`,
		);
	}
	return ttl;
}
