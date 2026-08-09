import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { WorktreeCommandRunner } from "../../git/worktrees.ts";
import type { TraceEvent, TraceRecord } from "../../traces/types.ts";
import type {
	ProjectCoordinator,
	ProjectCoordinatorJob,
} from "../coordinator/project.ts";
import {
	assertPushCheckout,
	readRemoteBranchCommit,
	pushProjectBranch,
} from "./project-branch-push-operations.ts";
import {
	readProjectBranchPushManifest,
	removeProjectBranchPushManifest,
	writeProjectBranchPushManifest,
} from "./project-branch-push-manifest.ts";
import type { RuntimeReactor } from "../coordinator/reactor.ts";
import { appendRuntimeTraceRecord } from "../trace-writer.ts";

const MERGE_EVENT = "runtime.project_branch.merged";
const PUSH_EVENT = "runtime.project_branch.pushed";
const PUSH_SCHEMA_VERSION = 1 as const;
const GIT_OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const TARGET_BRANCH = /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/u;
const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export interface ProjectBranchPushAuthority {
	kind: "user";
	actor: string;
	ref: string;
	remote: string;
	targetBranch: string;
	expectedRemoteCommit: string | null;
}

export interface ProjectBranchPushInput {
	repoRoot: string;
	coordinator: ProjectCoordinator;
	reactor: RuntimeReactor;
	mergeEvent: TraceEvent;
	authority: ProjectBranchPushAuthority;
	createdAt: string;
	runner: WorktreeCommandRunner;
	beforeAppend?: () => void | Promise<void>;
}

export interface ProjectBranchPushReceipt {
	jobId: string;
	traceId: string;
	workItemId: string;
	mergeEventId: string;
	remote: string;
	targetBranch: string;
	previousRemoteCommit: string | null;
	commit: string;
	tree: string;
	eventId: string;
}

interface PushIdentity {
	jobId: string;
	traceId: string;
	workItemId: string;
	mergeEventId: string;
	mergeJobId: string;
	remote: string;
	targetBranch: string;
	expectedRemoteCommit: string | null;
	commit: string;
	tree: string;
	contentProof: string;
	authorityActor: string;
	authorityRef: string;
}

interface CanonicalPushObservation {
	records: TraceRecord[];
	expectedBytes: number;
	mergeEvent: TraceEvent;
	pushEvent?: TraceEvent;
}

export function scheduleProjectBranchPush(
	input: ProjectBranchPushInput,
): Promise<ProjectBranchPushReceipt> {
	return input.coordinator.schedule(projectBranchPushJob(input));
}

export function projectBranchPushJob(
	input: Omit<ProjectBranchPushInput, "coordinator">,
): ProjectCoordinatorJob<ProjectBranchPushReceipt> {
	const identity = pushIdentity(input);
	return {
		idempotencyKey: identity.jobId,
		lane: {
			kind: "effect",
			targetRef: `git-remote:${identity.remote}:${identity.targetBranch}`,
		},
		conflictRefs: [
			`trace:${identity.traceId}`,
			`work-item:${identity.workItemId}`,
			`project-branch:${identity.targetBranch}`,
			`git-remote:${identity.remote}:${identity.targetBranch}`,
		],
		effect: "write",
		async recover() {
			const observation = await observeCanonicalPush(input, identity);
			if (!observation.pushEvent) return undefined;
			await removeProjectBranchPushManifest(input.repoRoot, identity);
			return {
				status: "completed",
				result: pushReceipt(identity, observation.pushEvent),
			};
		},
		async run(signal) {
			signal.throwIfAborted();
			let observation = await observeCanonicalPush(input, identity);
			if (observation.pushEvent) {
				await removeProjectBranchPushManifest(input.repoRoot, identity);
				return pushReceipt(identity, observation.pushEvent);
			}
			let gitInput = { ...input, mergeEvent: observation.mergeEvent };
			await assertPushCheckout(gitInput, identity, signal);
			await input.beforeAppend?.();
			observation = await observeCanonicalPush(input, identity);
			if (observation.pushEvent) {
				return pushReceipt(identity, observation.pushEvent);
			}
			gitInput = { ...input, mergeEvent: observation.mergeEvent };
			const remoteBefore = await readRemoteBranchCommit(
				gitInput,
				identity,
				signal,
			);
			const manifest = await readProjectBranchPushManifest(input.repoRoot, identity);
			if (remoteBefore === identity.commit) {
				if (!manifest || manifest.phase !== "pushed") {
					throw new Error(
						"Project branch remote already matches commit without exact push recovery evidence.",
					);
				}
			} else if (remoteBefore !== identity.expectedRemoteCommit) {
				throw new Error(
					"Project branch remote moved after push authority was issued.",
				);
			} else {
				if (manifest?.phase === "pushed") {
					throw new Error(
						"Project branch remote moved after a completed push attempt.",
					);
				}
				if (!manifest) {
					await writeProjectBranchPushManifest(input.repoRoot, identity, "prepared");
				}
				await pushProjectBranch(gitInput, identity, signal);
				await writeProjectBranchPushManifest(input.repoRoot, identity, "pushed");
			}
			signal.throwIfAborted();
			await input.beforeAppend?.();
			observation = await observeCanonicalPush(input, identity);
			if (observation.pushEvent) {
				return pushReceipt(identity, observation.pushEvent);
			}
			gitInput = { ...input, mergeEvent: observation.mergeEvent };
			await assertPushCheckout(gitInput, identity, signal);
			const remoteAfter = await readRemoteBranchCommit(
				gitInput,
				identity,
				signal,
			);
			if (remoteAfter !== identity.commit) {
				throw new Error("Project branch remote does not match pushed commit.");
			}
			const event = pushEvent(
				input,
				identity,
				observation.mergeEvent,
				observation.records,
			);
			await appendRuntimeTraceRecord(
				input.repoRoot,
				event,
				observation.expectedBytes,
			);
			input.reactor.invalidate(identity.traceId);
			await removeProjectBranchPushManifest(input.repoRoot, identity);
			return pushReceipt(identity, event);
		},
	};
}

async function observeCanonicalPush(
	input: Omit<ProjectBranchPushInput, "coordinator">,
	identity: PushIdentity,
): Promise<CanonicalPushObservation> {
	const observation = await input.reactor.observe({
		kind: "project_truth_changed",
		occurredAt: input.createdAt,
		refs: [identity.traceId, identity.mergeEventId],
	});
	const mergeEvent = observation.records.find(
		(record): record is TraceEvent =>
			record.type === "trace_event" && record.id === identity.mergeEventId,
	);
	if (!mergeEvent || !mergeEventMatches(mergeEvent, identity)) {
		throw new Error("Project branch push merge proof is not canonical.");
	}
	const pushEvent = observation.records.find(
		(record): record is TraceEvent =>
			record.type === "trace_event" &&
			record.event === PUSH_EVENT &&
			text(record.data?.runtimeJobId) === identity.jobId,
	);
	return {
		records: observation.records,
		expectedBytes: observation.expectedBytesByTrace[identity.traceId] ?? -1,
		mergeEvent,
		...(pushEvent ? { pushEvent } : {}),
	};
}

function mergeEventMatches(event: TraceEvent, identity: PushIdentity): boolean {
	return (
		event.traceId === identity.traceId &&
		event.event === MERGE_EVENT &&
		text(event.data?.runtimeJobId) === identity.mergeJobId &&
		text(event.data?.workItemId) === identity.workItemId &&
		text(event.data?.targetBranch) === identity.targetBranch &&
		text(event.data?.commit) === identity.commit &&
		text(event.data?.tree) === identity.tree &&
		text(event.data?.contentProof) === identity.contentProof
	);
}

function pushEvent(
	input: Omit<ProjectBranchPushInput, "coordinator">,
	identity: PushIdentity,
	mergeEvent: TraceEvent,
	records: TraceRecord[],
): TraceEvent {
	const sequence = nextSequence(records, identity.traceId);
	return {
		type: "trace_event",
		id: `${identity.traceId}:runtime:project-branch-push:${sequence}:${identity.jobId.slice(-16)}`,
		parentId: mergeEvent.id,
		traceId: identity.traceId,
		sequence,
		event: PUSH_EVENT,
		refs: unique([
			mergeEvent.id,
			identity.contentProof,
			...(identity.expectedRemoteCommit
				? [`git-commit:${identity.expectedRemoteCommit}`]
				: []),
			`git-commit:${identity.commit}`,
			`git-tree:${identity.tree}`,
			identity.authorityRef,
		]),
		createdAt: input.createdAt,
		data: {
			schemaVersion: PUSH_SCHEMA_VERSION,
			runtimeJobId: identity.jobId,
			traceId: identity.traceId,
			workItemId: identity.workItemId,
			mergeEventId: identity.mergeEventId,
			mergeRuntimeJobId: identity.mergeJobId,
			remote: identity.remote,
			targetBranch: identity.targetBranch,
			expectedRemoteCommit: identity.expectedRemoteCommit,
			commit: identity.commit,
			tree: identity.tree,
			contentProof: identity.contentProof,
			authority: {
				kind: "user",
				actor: identity.authorityActor,
				ref: identity.authorityRef,
			},
			pushedAt: input.createdAt,
		},
	};
}

function pushIdentity(
	input: Omit<ProjectBranchPushInput, "coordinator">,
): PushIdentity {
	assertPushInput(input);
	const data = input.mergeEvent.data;
	const tree = gitObjectIdText(data?.tree);
	const contentProof = requiredText(data?.contentProof);
	if (contentProof !== `git-tree:${tree}`) {
		throw new Error("Project branch push content proof does not match tree.");
	}
	const identity = {
		traceId: input.mergeEvent.traceId,
		workItemId: requiredText(data?.workItemId),
		mergeEventId: input.mergeEvent.id,
		mergeJobId: requiredText(data?.runtimeJobId),
		remote: input.authority.remote,
		targetBranch: input.authority.targetBranch,
		expectedRemoteCommit:
			input.authority.expectedRemoteCommit === null
				? null
				: gitObjectIdText(input.authority.expectedRemoteCommit),
		commit: gitObjectIdText(data?.commit),
		tree,
		contentProof,
		authorityActor: input.authority.actor,
		authorityRef: input.authority.ref,
	};
	if (identity.expectedRemoteCommit === identity.commit) {
		throw new Error("Project branch push requires a remote state transition.");
	}
	return {
		...identity,
		jobId: `project-branch-push:${createHash("sha256")
			.update(stableJson({ repoRoot: resolve(input.repoRoot), ...identity }))
			.digest("hex")}`,
	};
}

function assertPushInput(
	input: Omit<ProjectBranchPushInput, "coordinator">,
): void {
	if (
		resolve(input.repoRoot) !== input.repoRoot ||
		realpathSync(input.repoRoot) !== input.repoRoot
	) {
		throw new Error(
			"Project branch push repository root must be absolute and canonical.",
		);
	}
	if (
		input.mergeEvent.type !== "trace_event" ||
		input.mergeEvent.event !== MERGE_EVENT
	) {
		throw new Error("Project branch push requires a branch-merge proof event.");
	}
	if (input.authority.kind !== "user") {
		throw new Error("Project branch push requires explicit user authority.");
	}
	if (!safeTargetBranch(input.authority.targetBranch)) {
		throw new Error("Project branch push target must be an exact local branch ref.");
	}
	if (!REMOTE_NAME.test(input.authority.remote)) {
		throw new Error("Project branch push remote name is invalid.");
	}
	for (const value of [input.authority.actor, input.authority.ref]) {
		if (!value || value.length > 1024 || /[\u0000-\u001f]/u.test(value)) {
			throw new Error("Project branch push user authority is invalid.");
		}
	}
	if (!input.createdAt || Number.isNaN(Date.parse(input.createdAt))) {
		throw new Error("Project branch push observation time is invalid.");
	}
}

function pushReceipt(
	identity: PushIdentity,
	event: TraceEvent,
): ProjectBranchPushReceipt {
	const authority = objectValue(event.data?.authority);
	if (
		event.event !== PUSH_EVENT ||
		text(event.data?.runtimeJobId) !== identity.jobId ||
		text(event.data?.mergeEventId) !== identity.mergeEventId ||
		text(event.data?.remote) !== identity.remote ||
		text(event.data?.targetBranch) !== identity.targetBranch ||
		nullableText(event.data?.expectedRemoteCommit) !==
			identity.expectedRemoteCommit ||
		text(event.data?.commit) !== identity.commit ||
		text(event.data?.tree) !== identity.tree ||
		text(authority?.kind) !== "user" ||
		text(authority?.actor) !== identity.authorityActor ||
		text(authority?.ref) !== identity.authorityRef
	) {
		throw new Error("Canonical project branch push proof does not match job.");
	}
	return {
		jobId: identity.jobId,
		traceId: identity.traceId,
		workItemId: identity.workItemId,
		mergeEventId: identity.mergeEventId,
		remote: identity.remote,
		targetBranch: identity.targetBranch,
		previousRemoteCommit: identity.expectedRemoteCommit,
		commit: identity.commit,
		tree: identity.tree,
		eventId: event.id,
	};
}

function nextSequence(records: TraceRecord[], traceId: string): number {
	return (
		Math.max(
			0,
			...records.flatMap((record) =>
				record.type === "trace_event" && record.traceId === traceId
					? [record.sequence]
					: [],
			),
		) + 1
	);
}

function safeTargetBranch(value: string): boolean {
	const branch = value.slice("refs/heads/".length);
	return (
		TARGET_BRANCH.test(value) &&
		!value.includes("..") &&
		!value.includes("@{") &&
		!value.includes("//") &&
		!value.endsWith("/") &&
		!value.endsWith(".") &&
		!value.endsWith(".lock") &&
		branch.split("/").every((segment) => segment && !segment.startsWith("."))
	);
}

function gitObjectIdText(value: unknown): string {
	const resolved = requiredText(value);
	if (!GIT_OBJECT_ID.test(resolved)) {
		throw new Error("Project branch push Git object identity is invalid.");
	}
	return resolved;
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function requiredText(value: unknown): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error("Project branch push proof field is missing.");
	}
	return value.trim();
}

function nullableText(value: unknown): string | null | undefined {
	if (value === null) return null;
	return text(value);
}

function objectValue(
	value: unknown,
): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}
