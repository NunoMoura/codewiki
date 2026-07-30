import { Type, type Static } from "typebox";
import {
	activeWorkDispositionSchema,
	planningAcceptanceRequirementSchema,
	planningIntegrationSchema,
	planningScopeSchema,
	planningSprintSchema,
	planningWorkbenchSchema,
	type AuthorityBinding,
	type CanonicalChangeOperation,
	type ChangeBinding,
	type PlanningEpochBody,
	type PlanningEpochRecord,
} from "./contracts.ts";
import {
	createPlanningEpochRecord,
	operationPayload,
} from "./identity.ts";
import { createNextChangeOperation } from "./builder.ts";
import type {
	AssignmentProjection,
	ChangeWorkState,
	LoopAttemptProjection,
	ProjectWorkState,
	WorkItemClaimProjection,
} from "./state.ts";
import {
	createLoopCandidate,
	type CandidateObservedBase,
	type LoopCandidate,
} from "../loop-exit/identity.ts";
import {
	canonicalJson,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import { assertExactKeys, assertTypeboxSchema } from "../utils/json.ts";

export const ROLLING_PLANNING_CANDIDATE_SCHEMA_VERSION = "1.0.0";

export const rollingPlanningWorkItemCandidateSchema = Type.Object(
	{
		id: Type.String({minLength: 1, pattern: "\\S"}),
		sprintId: Type.String({minLength: 1, pattern: "\\S"}),
		title: Type.String({minLength: 1, maxLength: 512, pattern: "\\S"}),
		outcome: Type.String({minLength: 1, pattern: "\\S"}),
		owningChangeId: Type.String({minLength: 1, pattern: "^CHG-[A-Za-z0-9._-]+$"}),
		contributingChangeIds: Type.Array(
			Type.String({minLength: 1, pattern: "^CHG-[A-Za-z0-9._-]+$"}),
			{maxItems: 256},
		),
		dependsOnWorkItemIds: Type.Array(Type.String({minLength: 1, pattern: "\\S"}), {
			maxItems: 2_048,
		}),
		acceptanceRequirements: Type.Array(planningAcceptanceRequirementSchema, {
			minItems: 1,
			maxItems: 256,
		}),
		scope: planningScopeSchema,
		workbench: planningWorkbenchSchema,
		integration: planningIntegrationSchema,
	},
	{additionalProperties: false},
);

export const rollingPlanningCandidateContentSchema = Type.Object(
	{
		participantChangeIds: Type.Array(
			Type.String({minLength: 1, pattern: "^CHG-[A-Za-z0-9._-]+$"}),
			{minItems: 1, maxItems: 256},
		),
		sprints: Type.Array(planningSprintSchema, {minItems: 1, maxItems: 256}),
		workItems: Type.Array(rollingPlanningWorkItemCandidateSchema, {
			minItems: 1,
			maxItems: 512,
		}),
		activeWorkDispositions: Type.Array(activeWorkDispositionSchema, {
			maxItems: 2_048,
		}),
		rationale: Type.String({minLength: 1, pattern: "\\S"}),
	},
	{additionalProperties: false},
);

export type RollingPlanningCandidateContent = Static<
	typeof rollingPlanningCandidateContentSchema
>;

export type RollingPlanningCandidate = LoopCandidate<
	"planning",
	CanonicalJsonValue
> & {
	readonly content: RollingPlanningCandidateContent;
};

export interface CreateRollingPlanningCandidateInput {
	readonly content: RollingPlanningCandidateContent;
	readonly observedBase: CandidateObservedBase;
}

export interface PlanningExitBinding {
	readonly id: string;
	readonly digest: Sha256Digest;
}

export interface ResolveRollingPlanningEpochInput {
	readonly state: ProjectWorkState;
	readonly candidate: RollingPlanningCandidate;
	readonly exitReport: PlanningExitBinding;
	readonly authorityBinding: AuthorityBinding;
	readonly recordedAt: string;
}

export interface ResolvedRollingPlanningEpoch {
	readonly epoch: PlanningEpochRecord;
	readonly bindings: readonly CanonicalChangeOperation<"planning.epoch_bound">[];
	readonly records: readonly (
		| PlanningEpochRecord
		| CanonicalChangeOperation<"planning.epoch_bound">
	)[];
}

export type RollingWorkItemStatus =
	| "ready"
	| "waiting"
	| "claimed"
	| "assigned"
	| "completed"
	| "failed"
	| "cancelled"
	| "paused"
	| "migrated"
	| "blocked"
	| "route_back";

export interface RollingPlanningWorkItemView {
	readonly id: string;
	readonly sprintId: string;
	readonly owningChangeId: string;
	readonly status: RollingWorkItemStatus;
	readonly assignmentOperationId: string | null;
	readonly claimOperationId: string | null;
}

export interface RollingPlanningView {
	readonly epochId: string | null;
	readonly planningCandidateId: string | null;
	readonly sprintIds: readonly string[];
	readonly safeExecutionFrontier: readonly string[];
	readonly workItems: readonly RollingPlanningWorkItemView[];
}

export function createRollingPlanningCandidate(
	input: CreateRollingPlanningCandidateInput,
): RollingPlanningCandidate {
	assertExactKeys(input, ["content", "observedBase"], "Rolling Planning Candidate input");
	assertTypeboxSchema(
		rollingPlanningCandidateContentSchema,
		input.content,
		"Rolling Planning Candidate content",
	);
	const candidate = createLoopCandidate({
		loop: "planning",
		schemaVersion: ROLLING_PLANNING_CANDIDATE_SCHEMA_VERSION,
		content: toCanonicalJsonValue(input.content),
		observedBase: input.observedBase,
	});
	return candidate as RollingPlanningCandidate;
}

export function resolveRollingPlanningEpoch(
	input: ResolveRollingPlanningEpochInput,
): ResolvedRollingPlanningEpoch {
	assertCanonicalPlanningCandidate(input.candidate);
	const baseSnapshot = requirePlanningBase(input.state);
	const participants = materializeParticipants(
		input.state,
		input.candidate.content.participantChangeIds,
	);
	const workItems = materializeWorkItems(
		input.candidate.content.workItems,
		participants,
	);
	const planningFields: MaterializedPlanningFields = {
		participants,
		sprints: input.candidate.content.sprints,
		workItems,
		activeWorkDispositions: input.candidate.content.activeWorkDispositions,
	};
	const safeExecutionFrontier = deriveSafeExecutionFrontier(
		input.state,
		planningFields,
	);
	const epoch = createPlanningEpochRecord({
		recordedAt: input.recordedAt,
		baseSnapshot: {
			...baseSnapshot,
			workStateDigest: input.state.workStateDigest,
		},
		authorityBinding: input.authorityBinding,
		planningCandidateId: input.candidate.id,
		exitReportId: input.exitReport.id,
		participants: planningFields.participants,
		sprints: planningFields.sprints,
		workItems: planningFields.workItems,
		activeWorkDispositions: planningFields.activeWorkDispositions,
		safeExecutionFrontier,
	});
	assertCandidateCopiedExactly(input.candidate.content, epoch.body);
	validatePassingPlanningExits(
		input.state,
		input.candidate,
		input.exitReport,
	);
	const bindings = epoch.body.participants.map((participant) => {
		const change = requireChange(input.state, participant.changeId);
		return createNextChangeOperation(change, {
			changeId: participant.changeId,
			kind: "planning.epoch_bound",
			baseSnapshot,
			authorityBinding: input.authorityBinding,
			recordedAt: input.recordedAt,
			payload: {
				planningEpochId: epoch.operationId,
				participantRevisionId: participant.revisionId,
				planningCandidateId: input.candidate.id,
				exitReportId: input.exitReport.id,
				workItemIds: workItemIdsForChange(epoch, participant.changeId),
			},
		});
	});
	return toCanonicalJsonValue({
		epoch,
		bindings,
		records: [epoch, ...bindings],
	}) as unknown as ResolvedRollingPlanningEpoch;
}

export function projectRollingPlanningView(
	state: ProjectWorkState,
): RollingPlanningView {
	const epoch = state.planningEpochs.at(-1);
	if (!epoch) {
		return toCanonicalJsonValue({
			epochId: null,
			planningCandidateId: null,
			sprintIds: [],
			safeExecutionFrontier: [],
			workItems: [],
		}) as unknown as RollingPlanningView;
	}
	const frontier = new Set(epoch.body.safeExecutionFrontier);
	const dispositions = new Map(
		epoch.body.activeWorkDispositions.map((entry) => [entry.workItemId, entry]),
	);
	const workItems = epoch.body.workItems.map((workItem) => {
		const assignment = latestAssignment(state, workItem.id);
		const claim = activeWorkItemClaim(state, workItem.id);
		return {
			id: workItem.id,
			sprintId: workItem.sprintId,
			owningChangeId: workItem.owningChange.changeId,
			status: projectedWorkItemStatus(
				assignment,
				claim,
				dispositions.get(workItem.id)?.disposition,
				frontier.has(workItem.id),
			),
			assignmentOperationId: assignment?.operationId ?? null,
			claimOperationId: claim?.operationId ?? null,
		};
	});
	return toCanonicalJsonValue({
		epochId: epoch.operationId,
		planningCandidateId: epoch.body.planningCandidateId,
		sprintIds: epoch.body.sprints.map((sprint) => sprint.id),
		safeExecutionFrontier: epoch.body.safeExecutionFrontier,
		workItems,
	}) as unknown as RollingPlanningView;
}

type MaterializedPlanningFields = Pick<
	PlanningEpochBody,
	"participants" | "sprints" | "workItems" | "activeWorkDispositions"
>;

function deriveSafeExecutionFrontier(
	state: ProjectWorkState,
	content: MaterializedPlanningFields,
): string[] {
	validateActiveWorkDispositions(state, content);
	const completed = new Set(
		allAssignments(state).flatMap((assignment) =>
			assignment.status === "completed" ? [assignment.workItemId] : [],
		),
	);
	const dispositions = new Map(
		content.activeWorkDispositions.map((entry) => [entry.workItemId, entry]),
	);
	return content.workItems
		.flatMap((workItem) => {
			if (completed.has(workItem.id)) return [];
			const disposition = dispositions.get(workItem.id)?.disposition;
			if (disposition && disposition !== "preserve") return [];
			return workItem.dependsOnWorkItemIds.every((dependency) =>
				completed.has(dependency),
			)
				? [workItem.id]
				: [];
		})
		.sort(compareText);
}

function validateActiveWorkDispositions(
	state: ProjectWorkState,
	content: MaterializedPlanningFields,
): void {
	const active = activeWorkById(state);
	const dispositions = new Map(
		content.activeWorkDispositions.map((entry) => [entry.workItemId, entry]),
	);
	assertDispositionCoverage(
		active,
		dispositions,
		content.activeWorkDispositions.length,
	);
	for (const [workItemId, disposition] of dispositions) {
		validateActiveWorkDisposition({
			state,
			content,
			workItemId,
			disposition,
			activeWork: active.get(workItemId) as ActiveWork,
		});
	}
}

type ActiveWorkDisposition = PlanningEpochBody["activeWorkDispositions"][number];

function assertDispositionCoverage(
	active: ReadonlyMap<string, ActiveWork>,
	dispositions: ReadonlyMap<string, ActiveWorkDisposition>,
	entryCount: number,
): void {
	if (dispositions.size !== entryCount) {
		throw new Error("Rolling Planning Candidate has duplicate active-work dispositions.");
	}
	for (const workItemId of active.keys()) {
		if (!dispositions.has(workItemId)) {
			throw new Error(`Active Work Item ${workItemId} requires an explicit disposition.`);
		}
	}
	for (const workItemId of dispositions.keys()) {
		if (!active.has(workItemId)) {
			throw new Error(`Disposition ${workItemId} does not identify active work.`);
		}
	}
}

function validateActiveWorkDisposition(input: {
	readonly state: ProjectWorkState;
	readonly content: MaterializedPlanningFields;
	readonly workItemId: string;
	readonly disposition: ActiveWorkDisposition;
	readonly activeWork: ActiveWork;
}): void {
	if (
		input.disposition.activeAssignmentOperationId !==
		input.activeWork.assignment?.operationId
	) {
		throw new Error(
			`Disposition ${input.workItemId} must bind the exact active Assignment.`,
		);
	}
	if (input.disposition.disposition === "preserve") {
		assertPreservedWorkItem(
			input.state,
			input.content,
			input.workItemId,
			input.activeWork,
		);
	}
	assertMigrationReplacement(input.workItemId, input.disposition);
}

function assertPreservedWorkItem(
	state: ProjectWorkState,
	content: MaterializedPlanningFields,
	workItemId: string,
	activeWork: ActiveWork,
): void {
	const previous = previousWorkItem(state, activeWork);
	const proposed = content.workItems.find((item) => item.id === workItemId);
	if (!previous || !proposed || !sameWorkItemMeaning(previous, proposed)) {
		throw new Error(
			`Preserved Work Item ${workItemId} changed immutable Planning meaning.`,
		);
	}
}

function assertMigrationReplacement(
	workItemId: string,
	disposition: ActiveWorkDisposition,
): void {
	if (disposition.disposition === "migrate") {
		if (
			!disposition.replacementWorkItemId ||
			disposition.replacementWorkItemId === workItemId
		) {
			throw new Error(
				`Migrated Work Item ${workItemId} requires a distinct replacement.`,
			);
		}
		return;
	}
	if (disposition.replacementWorkItemId) {
		throw new Error(
			`Disposition ${workItemId} may only name a replacement when migrating.`,
		);
	}
}

interface ActiveWork {
	readonly claim: WorkItemClaimProjection | null;
	readonly assignment: AssignmentProjection | null;
	readonly planningEpochId: string;
}

function activeWorkById(state: ProjectWorkState): Map<string, ActiveWork> {
	const active = new Map<string, ActiveWork>();
	for (const change of state.changes) {
		for (const claim of change.workItemClaims) {
			if (claim.status !== "active") continue;
			active.set(claim.workItemId, {
				claim,
				assignment: null,
				planningEpochId: claim.planningEpochId,
			});
		}
		for (const assignment of change.assignments) {
			if (assignment.status !== "active" && assignment.status !== "cancel_requested") {
				continue;
			}
			const existing = active.get(assignment.workItemId);
			active.set(assignment.workItemId, {
				claim: existing?.claim ?? null,
				assignment,
				planningEpochId: assignment.planningEpochId,
			});
		}
	}
	return active;
}

function sameWorkItemMeaning(
	left: PlanningEpochBody["workItems"][number],
	right: PlanningEpochBody["workItems"][number],
): boolean {
	const withoutTails = (workItem: PlanningEpochBody["workItems"][number]) => ({
		...workItem,
		owningChange: {
			changeId: workItem.owningChange.changeId,
			revisionId: workItem.owningChange.revisionId,
		},
		contributingChanges: workItem.contributingChanges.map((binding) => ({
			changeId: binding.changeId,
			revisionId: binding.revisionId,
		})),
	});
	return canonicalJson(withoutTails(left)) === canonicalJson(withoutTails(right));
}

function previousWorkItem(
	state: ProjectWorkState,
	active: ActiveWork,
): PlanningEpochBody["workItems"][number] | null {
	const epoch = state.planningEpochs.find(
		(candidate) => candidate.operationId === active.planningEpochId,
	);
	return (
		epoch?.body.workItems.find((item) => {
			const activeId = active.assignment?.workItemId ?? active.claim?.workItemId;
			return item.id === activeId;
		}) ?? null
	);
}

function materializeParticipants(
	state: ProjectWorkState,
	participantChangeIds: readonly string[],
): ChangeBinding[] {
	const seen = new Set<string>();
	return participantChangeIds.map((changeId) => {
		if (seen.has(changeId)) {
			throw new Error(`Planning participant ${changeId} is duplicated.`);
		}
		seen.add(changeId);
		const change = requireChange(state, changeId);
		if (!change.currentRevision) {
			throw new Error(`Planning participant ${changeId} has no current revision.`);
		}
		return {
			changeId,
			revisionId: change.currentRevision.revisionId,
			tailOperationId: change.tailOperationId,
		};
	});
}

function materializeWorkItems(
	workItems: RollingPlanningCandidateContent["workItems"],
	participants: readonly ChangeBinding[],
): PlanningEpochBody["workItems"] {
	const bindings = new Map(
		participants.map((participant) => [participant.changeId, participant]),
	);
	return workItems.map((candidate) => {
		const {owningChangeId, contributingChangeIds, ...workItem} = candidate;
		const owningChange = bindings.get(owningChangeId);
		if (!owningChange) {
			throw new Error(`Work Item ${candidate.id} owner ${owningChangeId} is not a participant.`);
		}
		const contributingChanges = contributingChangeIds.map((changeId) => {
			const binding = bindings.get(changeId);
			if (!binding) {
				throw new Error(
					`Work Item ${candidate.id} contributor ${changeId} is not a participant.`,
				);
			}
			return binding;
		});
		return {...workItem, owningChange, contributingChanges};
	});
}

function validatePassingPlanningExits(
	state: ProjectWorkState,
	candidate: RollingPlanningCandidate,
	exitReport: PlanningExitBinding,
): void {
	for (const changeId of candidate.content.participantChangeIds) {
		const change = requireChange(state, changeId);
		if (!hasExactPassingPlanningExit(change, candidate, exitReport)) {
			throw new Error(
				`Planning participant ${changeId} lacks the exact passing Planning exit.`,
			);
		}
	}
}

function hasExactPassingPlanningExit(
	change: ChangeWorkState,
	candidate: RollingPlanningCandidate,
	exitReport: PlanningExitBinding,
): boolean {
	return change.loopAttempts.some(
		(attempt) =>
			isPassingPlanningAttempt(attempt, change, candidate) &&
			hasExactCandidateBinding(change, attempt, candidate) &&
			hasExactReportBinding(change, attempt, exitReport),
	);
}

function isPassingPlanningAttempt(
	attempt: LoopAttemptProjection,
	change: ChangeWorkState,
	candidate: RollingPlanningCandidate,
): boolean {
	return (
		attempt.loop === "planning" &&
		attempt.status === "passed" &&
		attempt.changeRevisionId === change.currentRevision?.revisionId &&
		attempt.currentCandidateId === candidate.id &&
		Boolean(attempt.exitReportOperationId) &&
		Boolean(attempt.routeOperationId)
	);
}

function hasExactCandidateBinding(
	change: ChangeWorkState,
	attempt: LoopAttemptProjection,
	candidate: RollingPlanningCandidate,
): boolean {
	return change.operations.some((operation) => {
		if (
			operation.body.kind !== "planning.candidate_recorded" ||
			!attempt.candidateOperationIds.includes(operation.operationId)
		) {
			return false;
		}
		const payload = operationPayload(operation, "planning.candidate_recorded");
		return (
			payload.candidate.id === candidate.id &&
			payload.candidate.digest === candidate.digest &&
			payload.observedBaseDigest === candidate.observedBase.workStateDigest
		);
	});
}

function hasExactReportBinding(
	change: ChangeWorkState,
	attempt: LoopAttemptProjection,
	exitReport: PlanningExitBinding,
): boolean {
	const operation = change.operations.find(
		(candidate) => candidate.operationId === attempt.exitReportOperationId,
	);
	if (operation?.body.kind !== "loop.exit_report_recorded") return false;
	const report = operationPayload(operation, "loop.exit_report_recorded");
	return (
		report.status === "passed" &&
		report.report.id === exitReport.id &&
		report.report.digest === exitReport.digest
	);
}

function assertCanonicalPlanningCandidate(candidate: RollingPlanningCandidate): void {
	assertExactKeys(
		candidate,
		["id", "digest", "loop", "schemaVersion", "content", "observedBase"],
		"Rolling Planning Candidate",
	);
	assertTypeboxSchema(
		rollingPlanningCandidateContentSchema,
		candidate.content,
		"Rolling Planning Candidate content",
	);
	const rebuilt = createRollingPlanningCandidate({
		content: candidate.content,
		observedBase: candidate.observedBase,
	});
	if (
		candidate.loop !== "planning" ||
		candidate.schemaVersion !== ROLLING_PLANNING_CANDIDATE_SCHEMA_VERSION ||
		candidate.id !== rebuilt.id ||
		candidate.digest !== rebuilt.digest
	) {
		throw new Error("Rolling Planning Candidate identity is invalid.");
	}
}

function assertCandidateCopiedExactly(
	content: RollingPlanningCandidateContent,
	body: PlanningEpochBody,
): void {
	const candidateFields = {
		participantChangeIds: content.participantChangeIds,
		sprints: content.sprints,
		workItems: content.workItems,
		activeWorkDispositions: content.activeWorkDispositions,
	};
	const epochFields = {
		participantChangeIds: body.participants.map(
			(participant) => participant.changeId,
		),
		sprints: body.sprints,
		workItems: body.workItems.map((workItem) => {
			const {owningChange, contributingChanges, ...workItemFields} = workItem;
			return {
				...workItemFields,
				owningChangeId: owningChange.changeId,
				contributingChangeIds: contributingChanges.map(
					(contributor) => contributor.changeId,
				),
			};
		}),
		activeWorkDispositions: body.activeWorkDispositions,
	};
	if (canonicalJson(candidateFields) !== canonicalJson(epochFields)) {
		throw new Error(
			"Rolling Planning Candidate collections must be canonical, sorted, and duplicate-free.",
		);
	}
}

function requirePlanningBase(
	state: ProjectWorkState,
): Omit<PlanningEpochBody["baseSnapshot"], "workStateDigest"> {
	if (!state.stateHead || !state.observedBase) {
		throw new Error("Rolling Planning requires accepted non-empty WorkState.");
	}
	return {
		remoteStateHead: state.stateHead,
		sourceHead: state.observedBase.sourceHead,
		knowledgeDigest: state.observedBase.knowledgeDigest,
		configDigest: state.observedBase.configDigest,
		policyDigest: state.observedBase.policyDigest,
	};
}

function workItemIdsForChange(
	epoch: PlanningEpochRecord,
	changeId: string,
): string[] {
	return epoch.body.workItems
		.flatMap((workItem) =>
			workItem.owningChange.changeId === changeId ||
			workItem.contributingChanges.some(
				(contributor) => contributor.changeId === changeId,
			)
				? [workItem.id]
				: [],
		)
		.sort(compareText);
}

function projectedWorkItemStatus(
	assignment: AssignmentProjection | null,
	claim: WorkItemClaimProjection | null,
	disposition: PlanningEpochBody["activeWorkDispositions"][number]["disposition"] | undefined,
	inFrontier: boolean,
): RollingWorkItemStatus {
	if (assignment?.status === "completed") return "completed";
	if (assignment?.status === "failed") return "failed";
	if (assignment?.status === "cancelled") return "cancelled";
	if (assignment?.status === "blocked") return "blocked";
	if (disposition === "pause") return "paused";
	if (disposition === "migrate") return "migrated";
	if (disposition === "cancel") return "cancelled";
	if (disposition === "block") return "blocked";
	if (disposition === "route_back") return "route_back";
	if (assignment?.status === "active" || assignment?.status === "cancel_requested") {
		return "assigned";
	}
	if (claim?.status === "active") return "claimed";
	return inFrontier ? "ready" : "waiting";
}

function latestAssignment(
	state: ProjectWorkState,
	workItemId: string,
): AssignmentProjection | null {
	const assignments = allAssignments(state).filter(
		(assignment) => assignment.workItemId === workItemId,
	);
	return assignments.at(-1) ?? null;
}

function activeWorkItemClaim(
	state: ProjectWorkState,
	workItemId: string,
): WorkItemClaimProjection | null {
	for (const change of state.changes) {
		const claim = change.workItemClaims.find(
			(candidate) =>
				candidate.workItemId === workItemId && candidate.status === "active",
		);
		if (claim) return claim;
	}
	return null;
}

function allAssignments(state: ProjectWorkState): AssignmentProjection[] {
	return state.changes.flatMap((change) => [...change.assignments]);
}

function requireChange(state: ProjectWorkState, changeId: string): ChangeWorkState {
	const change = state.changes.find((candidate) => candidate.changeId === changeId);
	if (!change) throw new Error(`Planning participant ${changeId} is not accepted.`);
	return change;
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
