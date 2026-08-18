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
	WorkUnitClaimProjection,
} from "./state.ts";
import {
	createLoopCandidate,
	type CandidateObservedBase,
	type LoopCandidate,
} from "../../checks/identity.ts";
import {
	canonicalJson,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import { assertExactKeys, assertTypeboxSchema } from "../../utils/json.ts";

export const ROLLING_PLANNING_CANDIDATE_SCHEMA_VERSION = "2.0.0";

export const rollingPlanningWorkUnitCandidateSchema = Type.Object(
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
		dependsOnWorkUnitIds: Type.Array(Type.String({minLength: 1, pattern: "\\S"}), {
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
		workUnits: Type.Array(rollingPlanningWorkUnitCandidateSchema, {
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

export type RollingWorkUnitStatus =
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

export interface RollingPlanningWorkUnitView {
	readonly id: string;
	readonly sprintId: string;
	readonly owningChangeId: string;
	readonly status: RollingWorkUnitStatus;
	readonly assignmentOperationId: string | null;
	readonly claimOperationId: string | null;
}

export interface RollingPlanningView {
	readonly epochId: string | null;
	readonly planningCandidateId: string | null;
	readonly sprintIds: readonly string[];
	readonly safeExecutionFrontier: readonly string[];
	readonly workUnits: readonly RollingPlanningWorkUnitView[];
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
	const workUnits = materializeWorkUnits(
		input.candidate.content.workUnits,
		participants,
	);
	const planningFields: MaterializedPlanningFields = {
		participants,
		sprints: input.candidate.content.sprints,
		workUnits,
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
		workUnits: planningFields.workUnits,
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
				workUnitIds: workUnitIdsForChange(epoch, participant.changeId),
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
			workUnits: [],
		}) as unknown as RollingPlanningView;
	}
	const frontier = new Set(epoch.body.safeExecutionFrontier);
	const dispositions = new Map(
		epoch.body.activeWorkDispositions.map((entry) => [entry.workUnitId, entry]),
	);
	const workUnits = epoch.body.workUnits.map((workUnit) => {
		const assignment = latestAssignment(state, workUnit.id);
		const claim = activeWorkUnitClaim(state, workUnit.id);
		return {
			id: workUnit.id,
			sprintId: workUnit.sprintId,
			owningChangeId: workUnit.owningChange.changeId,
			status: projectedWorkUnitStatus(
				assignment,
				claim,
				dispositions.get(workUnit.id)?.disposition,
				frontier.has(workUnit.id),
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
		workUnits,
	}) as unknown as RollingPlanningView;
}

type MaterializedPlanningFields = Pick<
	PlanningEpochBody,
	"participants" | "sprints" | "workUnits" | "activeWorkDispositions"
>;

function deriveSafeExecutionFrontier(
	state: ProjectWorkState,
	content: MaterializedPlanningFields,
): string[] {
	validateActiveWorkDispositions(state, content);
	const completed = new Set(
		allAssignments(state).flatMap((assignment) =>
			assignment.status === "completed" ? [assignment.workUnitId] : [],
		),
	);
	const dispositions = new Map(
		content.activeWorkDispositions.map((entry) => [entry.workUnitId, entry]),
	);
	return content.workUnits
		.flatMap((workUnit) => {
			if (completed.has(workUnit.id)) return [];
			const disposition = dispositions.get(workUnit.id)?.disposition;
			if (disposition && disposition !== "preserve") return [];
			return workUnit.dependsOnWorkUnitIds.every((dependency) =>
				completed.has(dependency),
			)
				? [workUnit.id]
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
		content.activeWorkDispositions.map((entry) => [entry.workUnitId, entry]),
	);
	assertDispositionCoverage(
		active,
		dispositions,
		content.activeWorkDispositions.length,
	);
	for (const [workUnitId, disposition] of dispositions) {
		validateActiveWorkDisposition({
			state,
			content,
			workUnitId,
			disposition,
			activeWork: active.get(workUnitId) as ActiveWork,
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
	for (const workUnitId of active.keys()) {
		if (!dispositions.has(workUnitId)) {
			throw new Error(`Active Work Unit ${workUnitId} requires an explicit disposition.`);
		}
	}
	for (const workUnitId of dispositions.keys()) {
		if (!active.has(workUnitId)) {
			throw new Error(`Disposition ${workUnitId} does not identify active work.`);
		}
	}
}

function validateActiveWorkDisposition(input: {
	readonly state: ProjectWorkState;
	readonly content: MaterializedPlanningFields;
	readonly workUnitId: string;
	readonly disposition: ActiveWorkDisposition;
	readonly activeWork: ActiveWork;
}): void {
	if (
		input.disposition.activeAssignmentOperationId !==
		input.activeWork.assignment?.operationId
	) {
		throw new Error(
			`Disposition ${input.workUnitId} must bind the exact active Assignment.`,
		);
	}
	if (input.disposition.disposition === "preserve") {
		assertPreservedWorkUnit(
			input.state,
			input.content,
			input.workUnitId,
			input.activeWork,
		);
	}
	assertMigrationReplacement(input.workUnitId, input.disposition);
}

function assertPreservedWorkUnit(
	state: ProjectWorkState,
	content: MaterializedPlanningFields,
	workUnitId: string,
	activeWork: ActiveWork,
): void {
	const previous = previousWorkUnit(state, activeWork);
	const proposed = content.workUnits.find((item) => item.id === workUnitId);
	if (!previous || !proposed || !sameWorkUnitMeaning(previous, proposed)) {
		throw new Error(
			`Preserved Work Unit ${workUnitId} changed immutable Planning meaning.`,
		);
	}
}

function assertMigrationReplacement(
	workUnitId: string,
	disposition: ActiveWorkDisposition,
): void {
	if (disposition.disposition === "migrate") {
		if (
			!disposition.replacementWorkUnitId ||
			disposition.replacementWorkUnitId === workUnitId
		) {
			throw new Error(
				`Migrated Work Unit ${workUnitId} requires a distinct replacement.`,
			);
		}
		return;
	}
	if (disposition.replacementWorkUnitId) {
		throw new Error(
			`Disposition ${workUnitId} may only name a replacement when migrating.`,
		);
	}
}

interface ActiveWork {
	readonly claim: WorkUnitClaimProjection | null;
	readonly assignment: AssignmentProjection | null;
	readonly planningEpochId: string;
}

function activeWorkById(state: ProjectWorkState): Map<string, ActiveWork> {
	const active = new Map<string, ActiveWork>();
	for (const change of state.changes) {
		for (const claim of change.workUnitClaims) {
			if (claim.status !== "active") continue;
			active.set(claim.workUnitId, {
				claim,
				assignment: null,
				planningEpochId: claim.planningEpochId,
			});
		}
		for (const assignment of change.assignments) {
			if (assignment.status !== "active" && assignment.status !== "cancel_requested") {
				continue;
			}
			const existing = active.get(assignment.workUnitId);
			active.set(assignment.workUnitId, {
				claim: existing?.claim ?? null,
				assignment,
				planningEpochId: assignment.planningEpochId,
			});
		}
	}
	return active;
}

function sameWorkUnitMeaning(
	left: PlanningEpochBody["workUnits"][number],
	right: PlanningEpochBody["workUnits"][number],
): boolean {
	const withoutTails = (workUnit: PlanningEpochBody["workUnits"][number]) => ({
		...workUnit,
		owningChange: {
			changeId: workUnit.owningChange.changeId,
			revisionId: workUnit.owningChange.revisionId,
		},
		contributingChanges: workUnit.contributingChanges.map((binding) => ({
			changeId: binding.changeId,
			revisionId: binding.revisionId,
		})),
	});
	return canonicalJson(withoutTails(left)) === canonicalJson(withoutTails(right));
}

function previousWorkUnit(
	state: ProjectWorkState,
	active: ActiveWork,
): PlanningEpochBody["workUnits"][number] | null {
	const epoch = state.planningEpochs.find(
		(candidate) => candidate.operationId === active.planningEpochId,
	);
	return (
		epoch?.body.workUnits.find((item) => {
			const activeId = active.assignment?.workUnitId ?? active.claim?.workUnitId;
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

function materializeWorkUnits(
	workUnits: RollingPlanningCandidateContent["workUnits"],
	participants: readonly ChangeBinding[],
): PlanningEpochBody["workUnits"] {
	const bindings = new Map(
		participants.map((participant) => [participant.changeId, participant]),
	);
	return workUnits.map((candidate) => {
		const {owningChangeId, contributingChangeIds, ...workUnit} = candidate;
		const owningChange = bindings.get(owningChangeId);
		if (!owningChange) {
			throw new Error(`Work Unit ${candidate.id} owner ${owningChangeId} is not a participant.`);
		}
		const contributingChanges = contributingChangeIds.map((changeId) => {
			const binding = bindings.get(changeId);
			if (!binding) {
				throw new Error(
					`Work Unit ${candidate.id} contributor ${changeId} is not a participant.`,
				);
			}
			return binding;
		});
		return {...workUnit, owningChange, contributingChanges};
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
		const artifact = payload.candidate.artifact as Record<string, unknown>;
		return (
			payload.candidate.id === candidate.id &&
			artifact.digest === candidate.digest &&
			payload.observedBaseDigest === canonicalJsonDigest(candidate.observedBase)
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
	const artifact = report.report.artifact as Record<string, unknown>;
	return (
		report.status === "passed" &&
		report.report.id === exitReport.id &&
		artifact.reportDigest === exitReport.digest
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
		workUnits: content.workUnits,
		activeWorkDispositions: content.activeWorkDispositions,
	};
	const epochFields = {
		participantChangeIds: body.participants.map(
			(participant) => participant.changeId,
		),
		sprints: body.sprints,
		workUnits: body.workUnits.map((workUnit) => {
			const {owningChange, contributingChanges, ...workUnitFields} = workUnit;
			return {
				...workUnitFields,
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

function workUnitIdsForChange(
	epoch: PlanningEpochRecord,
	changeId: string,
): string[] {
	return epoch.body.workUnits
		.flatMap((workUnit) =>
			workUnit.owningChange.changeId === changeId ||
			workUnit.contributingChanges.some(
				(contributor) => contributor.changeId === changeId,
			)
				? [workUnit.id]
				: [],
		)
		.sort(compareText);
}

function projectedWorkUnitStatus(
	assignment: AssignmentProjection | null,
	claim: WorkUnitClaimProjection | null,
	disposition: PlanningEpochBody["activeWorkDispositions"][number]["disposition"] | undefined,
	inFrontier: boolean,
): RollingWorkUnitStatus {
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
	workUnitId: string,
): AssignmentProjection | null {
	const assignments = allAssignments(state).filter(
		(assignment) => assignment.workUnitId === workUnitId,
	);
	return assignments.at(-1) ?? null;
}

function activeWorkUnitClaim(
	state: ProjectWorkState,
	workUnitId: string,
): WorkUnitClaimProjection | null {
	for (const change of state.changes) {
		const claim = change.workUnitClaims.find(
			(candidate) =>
				candidate.workUnitId === workUnitId && candidate.status === "active",
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
