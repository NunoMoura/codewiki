import type { AuthorityBinding } from "./contracts.ts";
import type { GitCommandRunner } from "./git-command.ts";
import type { ReplayAdmissionPolicy } from "./reducer.ts";
import {
	resolveRollingPlanningEpoch,
	type PlanningExitBinding,
	type RollingPlanningCandidate,
} from "./rolling-planning.ts";
import {
	createCurrentGitSynchronizer,
	pushSynchronizedStateBatch,
	type ProjectAuthoritySnapshot,
	type SynchronizationObservation,
} from "./synchronization.ts";
import type { Sha256Digest } from "../../utils/canonical-json.ts";

export interface CommitRollingPlanningEpochInput {
	readonly repoRoot: string;
	readonly remote: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly currentProject: () =>
		| ProjectAuthoritySnapshot
		| Promise<ProjectAuthoritySnapshot>;
	readonly authorityBinding: AuthorityBinding;
	readonly policy: ReplayAdmissionPolicy;
	readonly candidate: RollingPlanningCandidate;
	readonly exitReport: PlanningExitBinding;
	readonly expectedWorkStateDigest: Sha256Digest;
	readonly recordedAt: string;
	readonly runner?: GitCommandRunner;
	readonly materializationRoot?: string;
}

export interface RollingPlanningCommitReceipt {
	readonly epochId: Sha256Digest;
	readonly stateHead: string;
	readonly observation: SynchronizationObservation;
}

export async function commitRollingPlanningEpoch(
	input: CommitRollingPlanningEpochInput,
): Promise<RollingPlanningCommitReceipt> {
	const synchronizeCurrent = createCurrentGitSynchronizer(input);
	const {observation} = await synchronizeCurrent();
	if (
		observation.status !== "fresh" ||
		!observation.workState ||
		!observation.teamSnapshot
	) {
		throw new Error(
			`Rolling Planning commit requires fresh synchronization; current status is ${observation.status}.`,
		);
	}
	if (observation.workState.workStateDigest !== input.expectedWorkStateDigest) {
		throw new Error("Rolling Planning Candidate WorkState is stale and must be rerun.");
	}
	const resolved = resolveRollingPlanningEpoch({
		state: observation.workState,
		candidate: input.candidate,
		exitReport: input.exitReport,
		authorityBinding: input.authorityBinding,
		recordedAt: input.recordedAt,
	});
	const {pushResult} = await pushSynchronizedStateBatch({
		repoRoot: input.repoRoot,
		remote: input.remote,
		state: observation.workState,
		records: resolved.records,
		policy: input.policy,
		observation,
		runner: input.runner,
	});
	if (pushResult.status === "stale") {
		throw new Error(
			"Rolling Planning push became stale; Runtime must refetch and rerun Planning.",
		);
	}
	const {observation: verified} = await synchronizeCurrent();
	if (
		verified.status !== "fresh" ||
		!verified.workState?.planningEpochs.some(
			(epoch) => epoch.operationId === resolved.epoch.operationId,
		) ||
		!verified.workState.stateHead
	) {
		throw new Error(
			`Accepted Planning epoch ${resolved.epoch.operationId} could not be verified.`,
		);
	}
	return Object.freeze({
		epochId: resolved.epoch.operationId,
		stateHead: verified.workState.stateHead,
		observation: verified,
	});
}
