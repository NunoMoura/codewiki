import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { WorktreeCommandRunner } from "../../git/worktrees.ts";
import type { TraceEvent, TraceRecord } from "../../traces/types.ts";
import type {
	ProjectCoordinator,
	ProjectCoordinatorJob,
} from "../coordinator/project.ts";
import type { RuntimeReactor } from "../coordinator/reactor.ts";
import { appendRuntimeTraceRecord } from "../trace-writer.ts";
import {
	assertMergedCheckout,
	promoteProjectBranch,
	verifyIntegrationCommit,
} from "./project-branch-merge-git.ts";

const INTEGRATION_EVENT = "runtime.integration.proven";
const MERGE_EVENT = "runtime.project_branch.merged";
const MERGE_SCHEMA_VERSION = 1 as const;
const GIT_OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const TARGET_BRANCH = /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/u;

export interface ProjectBranchMergeAuthority {
	kind: "user" | "policy";
	actor: string;
	ref: string;
	targetBranch: string;
}

export interface ProjectBranchMergeInput {
	repoRoot: string;
	coordinator: ProjectCoordinator;
	reactor: RuntimeReactor;
	integrationEvent: TraceEvent;
	authority: ProjectBranchMergeAuthority;
	createdAt: string;
	runner: WorktreeCommandRunner;
	beforeAppend?: () => void | Promise<void>;
}

export interface ProjectBranchMergeReceipt {
	jobId: string;
	traceId: string;
	workItemId: string;
	integrationEventId: string;
	targetBranch: string;
	previousCommit: string;
	commit: string;
	tree: string;
	eventId: string;
}

interface MergeIdentity {
	jobId: string;
	traceId: string;
	workItemId: string;
	integrationEventId: string;
	integrationJobId: string;
	targetBranch: string;
	expectedTargetCommit: string;
	commit: string;
	tree: string;
	contentProof: string;
	authorityKind: "user" | "policy";
	authorityActor: string;
	authorityRef: string;
}

interface CanonicalMergeObservation {
	records: TraceRecord[];
	expectedBytes: number;
	integrationEvent: TraceEvent;
	mergeEvent?: TraceEvent;
}

export function scheduleProjectBranchMerge(
	input: ProjectBranchMergeInput,
): Promise<ProjectBranchMergeReceipt> {
	return input.coordinator.schedule(projectBranchMergeJob(input));
}

export function projectBranchMergeJob(
	input: Omit<ProjectBranchMergeInput, "coordinator">,
): ProjectCoordinatorJob<ProjectBranchMergeReceipt> {
	const identity = mergeIdentity(input);
	return {
		idempotencyKey: identity.jobId,
		lane: { kind: "effect", targetRef: identity.targetBranch },
		conflictRefs: [
			`trace:${identity.traceId}`,
			`work-item:${identity.workItemId}`,
			`project-branch:${identity.targetBranch}`,
		],
		effect: "write",
		async recover() {
			const observation = await observeCanonicalMerge(input, identity);
			if (!observation.mergeEvent) return undefined;
			return {
				status: "completed",
				result: mergeReceipt(identity, observation.mergeEvent),
			};
		},
		async run(signal) {
			signal.throwIfAborted();
			let observation = await observeCanonicalMerge(input, identity);
			if (observation.mergeEvent) {
				return mergeReceipt(identity, observation.mergeEvent);
			}
			await verifyIntegrationCommit(
				{ ...input, integrationEvent: observation.integrationEvent },
				identity,
				signal,
			);
			await input.beforeAppend?.();
			observation = await observeCanonicalMerge(input, identity);
			if (observation.mergeEvent) {
				return mergeReceipt(identity, observation.mergeEvent);
			}
			await promoteProjectBranch(
				{ ...input, integrationEvent: observation.integrationEvent },
				identity,
				signal,
			);
			signal.throwIfAborted();
			await input.beforeAppend?.();
			observation = await observeCanonicalMerge(input, identity);
			if (observation.mergeEvent) {
				return mergeReceipt(identity, observation.mergeEvent);
			}
			await assertMergedCheckout(
				{ ...input, integrationEvent: observation.integrationEvent },
				identity,
				signal,
			);
			const event = mergeEvent(
				input,
				identity,
				observation.integrationEvent,
				observation.records,
			);
			await appendRuntimeTraceRecord(
				input.repoRoot,
				event,
				observation.expectedBytes,
			);
			input.reactor.invalidate(identity.traceId);
			return mergeReceipt(identity, event);
		},
	};
}

async function observeCanonicalMerge(
	input: Omit<ProjectBranchMergeInput, "coordinator">,
	identity: MergeIdentity,
): Promise<CanonicalMergeObservation> {
	const observation = await input.reactor.observe({
		kind: "project_truth_changed",
		occurredAt: input.createdAt,
		refs: [identity.traceId, identity.integrationEventId],
	});
	const integrationEvent = observation.records.find(
		(record): record is TraceEvent =>
			record.type === "trace_event" && record.id === identity.integrationEventId,
	);
	if (!integrationEvent || !integrationEventMatches(integrationEvent, identity)) {
		throw new Error("Project branch merge Integration proof is not canonical.");
	}
	const mergeEvent = observation.records.find(
		(record): record is TraceEvent =>
			record.type === "trace_event" &&
			record.event === MERGE_EVENT &&
			text(record.data?.runtimeJobId) === identity.jobId,
	);
	return {
		records: observation.records,
		expectedBytes: observation.expectedBytesByTrace[identity.traceId] ?? -1,
		integrationEvent,
		...(mergeEvent ? { mergeEvent } : {}),
	};
}

function integrationEventMatches(
	event: TraceEvent,
	identity: MergeIdentity,
): boolean {
	return (
		event.traceId === identity.traceId &&
		event.event === INTEGRATION_EVENT &&
		text(event.data?.runtimeJobId) === identity.integrationJobId &&
		text(event.data?.workItemId) === identity.workItemId &&
		text(event.data?.parentCommit) === identity.expectedTargetCommit &&
		text(event.data?.commit) === identity.commit &&
		text(event.data?.tree) === identity.tree &&
		text(event.data?.contentProof) === identity.contentProof
	);
}

function mergeEvent(
	input: Omit<ProjectBranchMergeInput, "coordinator">,
	identity: MergeIdentity,
	integrationEvent: TraceEvent,
	records: TraceRecord[],
): TraceEvent {
	const sequence = nextSequence(records, identity.traceId);
	return {
		type: "trace_event",
		id: `${identity.traceId}:runtime:project-branch-merge:${sequence}:${identity.jobId.slice(-16)}`,
		parentId: integrationEvent.id,
		traceId: identity.traceId,
		sequence,
		event: MERGE_EVENT,
		refs: unique([
			integrationEvent.id,
			identity.contentProof,
			`git-commit:${identity.expectedTargetCommit}`,
			`git-commit:${identity.commit}`,
			`git-tree:${identity.tree}`,
			identity.authorityRef,
		]),
		createdAt: input.createdAt,
		data: {
			schemaVersion: MERGE_SCHEMA_VERSION,
			runtimeJobId: identity.jobId,
			traceId: identity.traceId,
			workItemId: identity.workItemId,
			integrationEventId: identity.integrationEventId,
			integrationRuntimeJobId: identity.integrationJobId,
			targetBranch: identity.targetBranch,
			expectedTargetCommit: identity.expectedTargetCommit,
			commit: identity.commit,
			tree: identity.tree,
			contentProof: identity.contentProof,
			authority: {
				kind: identity.authorityKind,
				actor: identity.authorityActor,
				ref: identity.authorityRef,
			},
			mergedAt: input.createdAt,
		},
	};
}

function mergeIdentity(
	input: Omit<ProjectBranchMergeInput, "coordinator">,
): MergeIdentity {
	assertMergeInput(input);
	const data = input.integrationEvent.data;
	const tree = gitObjectIdText(data?.tree);
	const contentProof = requiredText(data?.contentProof);
	if (contentProof !== `git-tree:${tree}`) {
		throw new Error("Project branch merge content proof does not match tree.");
	}
	const identity = {
		traceId: input.integrationEvent.traceId,
		workItemId: requiredText(data?.workItemId),
		integrationEventId: input.integrationEvent.id,
		integrationJobId: requiredText(data?.runtimeJobId),
		targetBranch: input.authority.targetBranch,
		expectedTargetCommit: gitObjectIdText(data?.parentCommit),
		commit: gitObjectIdText(data?.commit),
		tree,
		contentProof,
		authorityKind: input.authority.kind,
		authorityActor: input.authority.actor,
		authorityRef: input.authority.ref,
	};
	return {
		...identity,
		jobId: `project-branch-merge:${createHash("sha256")
			.update(
				stableJson({
					repoRoot: resolve(input.repoRoot),
					...identity,
				}),
			)
			.digest("hex")}`,
	};
}

function assertMergeInput(
	input: Omit<ProjectBranchMergeInput, "coordinator">,
): void {
	if (
		resolve(input.repoRoot) !== input.repoRoot ||
		realpathSync(input.repoRoot) !== input.repoRoot
	) {
		throw new Error(
			"Project branch merge repository root must be absolute and canonical.",
		);
	}
	if (
		input.integrationEvent.type !== "trace_event" ||
		input.integrationEvent.event !== INTEGRATION_EVENT
	) {
		throw new Error("Project branch merge requires an Integration proof event.");
	}
	if (!safeTargetBranch(input.authority.targetBranch)) {
		throw new Error("Project branch merge target must be an exact local branch ref.");
	}
	for (const value of [input.authority.actor, input.authority.ref]) {
		if (!value || value.length > 1024 || /[\u0000-\u001f]/u.test(value)) {
			throw new Error("Project branch merge authority is invalid.");
		}
	}
	if (!input.createdAt || Number.isNaN(Date.parse(input.createdAt))) {
		throw new Error("Project branch merge observation time is invalid.");
	}
}

function mergeReceipt(
	identity: MergeIdentity,
	event: TraceEvent,
): ProjectBranchMergeReceipt {
	if (
		event.event !== MERGE_EVENT ||
		text(event.data?.runtimeJobId) !== identity.jobId ||
		text(event.data?.integrationEventId) !== identity.integrationEventId ||
		text(event.data?.targetBranch) !== identity.targetBranch ||
		text(event.data?.expectedTargetCommit) !== identity.expectedTargetCommit ||
		text(event.data?.commit) !== identity.commit ||
		text(event.data?.tree) !== identity.tree ||
		text(objectValue(event.data?.authority)?.kind) !== identity.authorityKind ||
		text(objectValue(event.data?.authority)?.actor) !== identity.authorityActor ||
		text(objectValue(event.data?.authority)?.ref) !== identity.authorityRef
	) {
		throw new Error("Canonical project branch merge proof does not match job.");
	}
	return {
		jobId: identity.jobId,
		traceId: identity.traceId,
		workItemId: identity.workItemId,
		integrationEventId: identity.integrationEventId,
		targetBranch: identity.targetBranch,
		previousCommit: identity.expectedTargetCommit,
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

function gitObjectIdText(value: unknown): string {
	const resolved = requiredText(value);
	if (!GIT_OBJECT_ID.test(resolved)) {
		throw new Error("Project branch merge Git object identity is invalid.");
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

function requiredText(value: unknown): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error("Project branch merge proof field is missing.");
	}
	return value.trim();
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
