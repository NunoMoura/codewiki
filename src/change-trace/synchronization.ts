import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	createGitStateCommit,
	gitStateManifestPath,
	gitStateRecordPath,
	isGitStateTransportError,
	pushGitStateCommit,
	readGitStateHistory,
	type GitStateCommitProposal,
	type GitStateHistory,
	type GitStatePushResult,
	type ReadGitStateHistoryInput,
} from "./git-state.ts";
import type { GitCommandRunner } from "./git-command.ts";
import {
	reduceAcceptedStateBatch,
	replayAcceptedStateBatches,
	type AcceptedProtocolRecord,
	type ReplayAdmissionPolicy,
} from "./reducer.ts";
import {
	serializeCanonicalChangeOperation,
	serializePlanningEpochRecord,
	serializeStateCommitManifest,
} from "./identity.ts";
import {
	projectAlignmentGraph,
	type AlignmentGraphSnapshot,
} from "./alignment-graph.ts";
import type { PlanningEpochRecord } from "./contracts.ts";
import type { ProjectWorkState } from "./state.ts";
import {
	assertSha256Digest,
	canonicalJson,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";

export type SynchronizationStatus = "fresh" | "stale" | "offline";
export type SynchronizationStaleReason =
	| "source_head_mismatch"
	| "knowledge_digest_mismatch"
	| "config_digest_mismatch"
	| "policy_digest_mismatch";

export interface ProjectAuthoritySnapshot {
	readonly sourceHead: string;
	readonly knowledgeDigest: Sha256Digest;
	readonly configDigest: Sha256Digest;
	readonly policyDigest: Sha256Digest;
}

export interface TeamSnapshot {
	readonly repositoryIdentity: Sha256Digest;
	readonly remoteStateHead: string | null;
	readonly protectedSourceHead: string;
	readonly knowledgeDigest: Sha256Digest;
	readonly configDigest: Sha256Digest;
	readonly policyDigest: Sha256Digest;
	readonly snapshotDigest: Sha256Digest;
}

export interface SynchronizationObservation {
	readonly status: SynchronizationStatus;
	readonly canMutate: boolean;
	readonly teamSnapshot: TeamSnapshot | null;
	readonly workState: ProjectWorkState | null;
	readonly alignmentGraph: AlignmentGraphSnapshot | null;
	readonly staleReasons: readonly SynchronizationStaleReason[];
	readonly failureCode: "remote_unavailable" | null;
}

export interface SynchronizeGitStateInput extends ReadGitStateHistoryInput {
	readonly repositoryIdentity: Sha256Digest;
	readonly currentProject: ProjectAuthoritySnapshot;
	readonly policy: ReplayAdmissionPolicy;
	readonly materializationRoot?: string;
	readonly lastVerified?: SynchronizationObservation;
}

export interface SynchronizeCurrentGitStateInput
	extends Omit<SynchronizeGitStateInput, "currentProject"> {
	readonly currentProject: () =>
		| ProjectAuthoritySnapshot
		| Promise<ProjectAuthoritySnapshot>;
}

export interface CurrentGitSynchronization {
	readonly currentProject: ProjectAuthoritySnapshot;
	readonly observation: SynchronizationObservation;
}

export async function synchronizeCurrentGitState(
	input: SynchronizeCurrentGitStateInput,
): Promise<CurrentGitSynchronization> {
	const currentProject = await input.currentProject();
	const observation = await synchronizeGitState({...input, currentProject});
	return Object.freeze({currentProject, observation});
}

export function createCurrentGitSynchronizer(
	input: SynchronizeCurrentGitStateInput,
): () => Promise<CurrentGitSynchronization> {
	return () => synchronizeCurrentGitState(input);
}

export async function synchronizeGitState(
	input: SynchronizeGitStateInput,
): Promise<SynchronizationObservation> {
	assertSynchronizationInput(input);
	let history: GitStateHistory;
	try {
		history = await readGitStateHistory(input);
	} catch (error) {
		if (!isGitStateTransportError(error)) throw error;
		return offlineObservation(input.lastVerified);
	}
	const workState = replayAcceptedStateBatches(history.batches, input.policy);
	const alignmentGraph = workState.stateHead
		? projectAlignmentGraph(workState)
		: null;
	const teamSnapshot = createTeamSnapshot(
		input.repositoryIdentity,
		history.remoteStateHead,
		input.currentProject,
	);
	const staleReasons = staleReasonsFor(workState, input.currentProject);
	const status = staleReasons.length === 0 ? "fresh" : "stale";
	const observation = canonicalValue<SynchronizationObservation>({
		status,
		canMutate: status === "fresh",
		teamSnapshot,
		workState,
		alignmentGraph,
		staleReasons,
		failureCode: null,
	});
	if (input.materializationRoot) {
		await materializeSynchronization(
			input.materializationRoot,
			history,
			observation,
		);
	}
	return observation;
}

export function createTeamSnapshot(
	repositoryIdentity: Sha256Digest,
	remoteStateHead: string | null,
	project: ProjectAuthoritySnapshot,
): TeamSnapshot {
	assertSha256Digest(repositoryIdentity, "repositoryIdentity");
	assertProjectAuthoritySnapshot(project);
	if (remoteStateHead !== null) assertGitObjectId(remoteStateHead, "remoteStateHead");
	const body = {
		repositoryIdentity,
		remoteStateHead,
		protectedSourceHead: project.sourceHead,
		knowledgeDigest: project.knowledgeDigest,
		configDigest: project.configDigest,
		policyDigest: project.policyDigest,
	};
	return canonicalValue({...body, snapshotDigest: canonicalJsonDigest(body)});
}

export function assertFreshSynchronization(
	observation: SynchronizationObservation,
	expectedSnapshotDigest?: Sha256Digest,
): void {
	if (
		observation.status !== "fresh" ||
		!observation.canMutate ||
		!observation.teamSnapshot
	) {
		throw new Error(
			`Unsafe distributed mutation requires fresh synchronization; current status is ${observation.status}.`,
		);
	}
	if (
		expectedSnapshotDigest &&
		observation.teamSnapshot.snapshotDigest !== expectedSnapshotDigest
	) {
		throw new Error("Fresh synchronization snapshot digest changed before mutation.");
	}
}

export interface PushSynchronizedGitStateInput {
	readonly repoRoot: string;
	readonly remote: string;
	readonly proposal: GitStateCommitProposal;
	readonly observation: SynchronizationObservation;
	readonly expectedSnapshotDigest: Sha256Digest;
	readonly runner?: GitCommandRunner;
	readonly signal?: AbortSignal;
}

export function pushSynchronizedGitStateCommit(
	input: PushSynchronizedGitStateInput,
): Promise<GitStatePushResult> {
	assertFreshSynchronization(input.observation, input.expectedSnapshotDigest);
	if (
		input.observation.teamSnapshot?.remoteStateHead !==
		input.proposal.expectedStateHead
	) {
		throw new Error(
			"Fresh synchronization remote state head does not match proposal expected head.",
		);
	}
	return pushGitStateCommit({
		repoRoot: input.repoRoot,
		remote: input.remote,
		proposal: input.proposal,
		runner: input.runner,
		signal: input.signal,
	});
}

export interface PushSynchronizedStateBatchInput {
	readonly repoRoot: string;
	readonly remote: string;
	readonly state: ProjectWorkState;
	readonly records: readonly AcceptedProtocolRecord[];
	readonly policy: ReplayAdmissionPolicy;
	readonly observation: SynchronizationObservation;
	readonly runner?: GitCommandRunner;
	readonly signal?: AbortSignal;
}

export interface SynchronizedStateBatchResult {
	readonly proposal: GitStateCommitProposal;
	readonly pushResult: GitStatePushResult;
}

export async function pushSynchronizedStateBatch(
	input: PushSynchronizedStateBatchInput,
): Promise<SynchronizedStateBatchResult> {
	if (!input.observation.teamSnapshot) {
		throw new Error("Synchronized state batch requires a verified team snapshot.");
	}
	const proposal = await createGitStateCommit({
		repoRoot: input.repoRoot,
		state: input.state,
		records: input.records,
		runner: input.runner,
		signal: input.signal,
	});
	reduceAcceptedStateBatch(
		input.state,
		{
			stateHead: proposal.stateCommit,
			manifest: proposal.manifest,
			records: proposal.records,
		},
		input.policy,
	);
	const pushResult = await pushSynchronizedGitStateCommit({
		repoRoot: input.repoRoot,
		remote: input.remote,
		proposal,
		observation: input.observation,
		expectedSnapshotDigest: input.observation.teamSnapshot.snapshotDigest,
		runner: input.runner,
		signal: input.signal,
	});
	return Object.freeze({proposal, pushResult});
}

export interface SynchronizationPoller {
	readonly poll: (force?: boolean) => Promise<SynchronizationObservation>;
	readonly invalidate: () => void;
	readonly current: () => SynchronizationObservation | null;
}

export interface CreateSynchronizationPollerInput {
	readonly synchronize: () => Promise<SynchronizationObservation>;
	readonly minimumIntervalMs: number;
	readonly now?: () => number;
}

export function createSynchronizationPoller(
	input: CreateSynchronizationPollerInput,
): SynchronizationPoller {
	if (!Number.isInteger(input.minimumIntervalMs) || input.minimumIntervalMs < 0) {
		throw new Error("Synchronization poll interval must be a non-negative integer.");
	}
	const now = input.now ?? Date.now;
	let invalidated = true;
	let invalidationVersion = 0;
	let lastPollAt = Number.NEGATIVE_INFINITY;
	let observation: SynchronizationObservation | null = null;
	let pending: Promise<SynchronizationObservation> | null = null;
	const poll = async (force = false): Promise<SynchronizationObservation> => {
		const elapsed = now() - lastPollAt;
		if (
			!force &&
			!invalidated &&
			observation &&
			elapsed < input.minimumIntervalMs
		) {
			return observation;
		}
		if (pending) return pending;
		const startingInvalidationVersion = invalidationVersion;
		pending = input.synchronize().then((next) => {
			observation = next;
			lastPollAt = now();
			invalidated = invalidationVersion !== startingInvalidationVersion;
			return next;
		});
		try {
			return await pending;
		} finally {
			pending = null;
		}
	};
	return Object.freeze({
		poll,
		invalidate: () => {
			invalidationVersion += 1;
			invalidated = true;
		},
		current: () => (invalidated ? null : observation),
	});
}

async function materializeSynchronization(
	root: string,
	history: GitStateHistory,
	observation: SynchronizationObservation,
): Promise<void> {
	if (!observation.teamSnapshot || !observation.workState) return;
	await Promise.all(
		history.batches.flatMap((batch) => [
			writeImmutable(
				join(root, gitStateManifestPath(batch.manifest)),
				serializeStateCommitManifest(batch.manifest),
			),
			...batch.records.map((record) =>
				writeImmutable(
					join(root, gitStateRecordPath(record)),
					isPlanningEpoch(record)
						? serializePlanningEpochRecord(record)
						: serializeCanonicalChangeOperation(record),
				),
			),
		]),
	);
	const snapshotDirectory = join(
		root,
		".codewiki/runtime/snapshots",
		digestHex(observation.teamSnapshot.snapshotDigest),
	);
	await writeImmutable(
		join(snapshotDirectory, "work-state.json"),
		canonicalJson(observation.workState),
	);
	if (observation.alignmentGraph) {
		await writeImmutable(
			join(snapshotDirectory, "alignment-graph.json"),
			canonicalJson(observation.alignmentGraph),
		);
	}
	await writeAtomic(
		join(root, ".codewiki/runtime/synchronization.json"),
		canonicalJson({
			status: observation.status,
			canMutate: observation.canMutate,
			teamSnapshot: observation.teamSnapshot,
			workStateDigest: observation.workState.workStateDigest,
			graphSnapshotDigest:
				observation.alignmentGraph?.graphSnapshotDigest ?? null,
			staleReasons: observation.staleReasons,
		}),
	);
}

function staleReasonsFor(
	state: ProjectWorkState,
	current: ProjectAuthoritySnapshot,
): SynchronizationStaleReason[] {
	if (!state.observedBase) return [];
	const reasons: SynchronizationStaleReason[] = [];
	if (state.observedBase.sourceHead !== current.sourceHead) {
		reasons.push("source_head_mismatch");
	}
	if (state.observedBase.knowledgeDigest !== current.knowledgeDigest) {
		reasons.push("knowledge_digest_mismatch");
	}
	if (state.observedBase.configDigest !== current.configDigest) {
		reasons.push("config_digest_mismatch");
	}
	if (state.observedBase.policyDigest !== current.policyDigest) {
		reasons.push("policy_digest_mismatch");
	}
	return reasons.sort(compareText);
}

function offlineObservation(
	lastVerified?: SynchronizationObservation,
): SynchronizationObservation {
	return canonicalValue({
		status: "offline",
		canMutate: false,
		teamSnapshot: lastVerified?.teamSnapshot ?? null,
		workState: lastVerified?.workState ?? null,
		alignmentGraph: lastVerified?.alignmentGraph ?? null,
		staleReasons: [],
		failureCode: "remote_unavailable",
	});
}

async function writeImmutable(path: string, bytes: string): Promise<void> {
	await mkdir(dirname(path), {recursive: true});
	try {
		const existing = await readFile(path, "utf8");
		if (existing !== bytes) {
			throw new Error(`Immutable synchronization file ${path} has conflicting bytes.`);
		}
		return;
	} catch (error) {
		if (!isNotFound(error)) throw error;
	}
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, bytes, {encoding: "utf8", flag: "wx"});
		await link(temporary, path);
	} catch (error) {
		if (!isAlreadyExists(error)) throw error;
		const existing = await readFile(path, "utf8");
		if (existing !== bytes) {
			throw new Error(`Immutable synchronization file ${path} raced with conflicting bytes.`);
		}
	} finally {
		await rm(temporary, {force: true});
	}
}

async function writeAtomic(path: string, bytes: string): Promise<void> {
	await mkdir(dirname(path), {recursive: true});
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, bytes, {encoding: "utf8", flag: "wx"});
		await rename(temporary, path);
	} finally {
		await rm(temporary, {force: true});
	}
}

function assertSynchronizationInput(input: SynchronizeGitStateInput): void {
	assertSha256Digest(input.repositoryIdentity, "repositoryIdentity");
	assertProjectAuthoritySnapshot(input.currentProject);
}

function assertProjectAuthoritySnapshot(snapshot: ProjectAuthoritySnapshot): void {
	assertGitObjectId(snapshot.sourceHead, "sourceHead");
	assertSha256Digest(snapshot.knowledgeDigest, "knowledgeDigest");
	assertSha256Digest(snapshot.configDigest, "configDigest");
	assertSha256Digest(snapshot.policyDigest, "policyDigest");
}

function assertGitObjectId(value: string, field: string): void {
	if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(value)) {
		throw new Error(`${field} must be a Git object ID.`);
	}
}

function isPlanningEpoch(
	record: GitStateHistory["batches"][number]["records"][number],
): record is PlanningEpochRecord {
	return record.body.kind === "planning.epoch_recorded";
}

function digestHex(digest: Sha256Digest): string {
	return digest.slice("sha256:".length);
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

function isAlreadyExists(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "EEXIST"
	);
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function canonicalValue<T>(value: unknown): T {
	return toCanonicalJsonValue(value) as unknown as T;
}
