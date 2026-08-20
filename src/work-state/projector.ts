import { createHash } from "node:crypto";
import {
	changeRecordFromTrace,
	changeRecordOutput,
	changeTraceId,
} from "../changes/trace/change-record.ts";
import { changeContentDigest, stableJson } from "../changes/digest.ts";
import type { ChangeRecord } from "../changes/records.ts";
import {
	normalizeUiPreviewTargetBinding,
	uiPreviewTargetBindingValidationIssues,
	type UiPreviewTargetBinding,
} from "../preview/binding.ts";
import type { TraceEvent, TraceHead, TraceRecord } from "../changes/trace/types.ts";
import { projectProductPublications } from "./publication-projection.ts";
import { projectProductReleases } from "./release-projection.ts";
import {
	WORK_STATE_SCHEMA_VERSION,
	type WorkState,
	type WorkStateApproval,
	type WorkStateAssignment,
	type WorkStateAssignmentStatus,
	type WorkStateBlocker,
	type WorkStateChange,
	type WorkStateOutcomeStatus,
	type WorkStatePlanningStatus,
	type WorkStateRealizationStatus,
	type WorkStateMergeProof,
	type WorkStatePushProof,
	type WorkStateGraphDelta,
	type WorkStateWorkUnit,
} from "./types.ts";

interface BuildWorkStateInput {
	records: TraceRecord[];
	generatedAt?: string;
}

interface TraceGroup {
	head: TraceHead;
	records: TraceRecord[];
	events: TraceEvent[];
}

export function buildWorkState(input: BuildWorkStateInput): WorkState {
	const groups = traceGroups(input.records);
	const changeRecords = changeRecordsById(groups);
	const approvals = approvalsByChangeId(groups, changeRecords);
	const graphDeltaMap = new Map<string, WorkStateGraphDelta>();
	const workUnitMap = new Map<string, WorkStateWorkUnit>();
	const assignmentMap = new Map<string, WorkStateAssignment>();
	const blockers: WorkStateBlocker[] = [];

	for (const group of groups.values()) {
		projectPlanningGroup({
			group,
			graphDeltaMap,
			workUnitMap,
			blockers,
		});
	}
	for (const group of groups.values()) {
		projectAssignments(group, workUnitMap, assignmentMap);
		projectImplementation(group, workUnitMap);
		projectIntegration(group, workUnitMap);
		projectProjectBranchMerges(group, workUnitMap);
		projectProjectBranchPushes(group, workUnitMap);
		projectProductPublications(group.events, workUnitMap);
		projectProductReleases(group.events, workUnitMap);
		projectEventBlockers(group, blockers);
	}
	applyAssignmentRefs(workUnitMap, assignmentMap);

	const workGraphDeltas = [...graphDeltaMap.values()].sort((left, right) =>
		left.id.localeCompare(right.id),
	);
	const workUnits = [...workUnitMap.values()].sort((left, right) =>
		left.id.localeCompare(right.id),
	);
	const assignments = [...assignmentMap.values()].sort((left, right) =>
		left.id.localeCompare(right.id),
	);
	const changes = [...changeRecords.values()]
		.map((record) =>
			changeView({
				record,
				approval: approvals.get(record.change.id),
				workGraphDeltas,
				workUnits,
				assignments,
				blockers,
				group: groups.get(changeTraceId(record.change.id)),
			}),
		)
		.sort((left, right) => left.id.localeCompare(right.id));
	const sortedBlockers = blockers
		.sort((left, right) => left.id.localeCompare(right.id))
		.filter(
			(blocker, index, values) =>
				index === 0 || blocker.id !== values[index - 1]?.id,
		);
	const stateWithoutDigest: Omit<WorkState, "snapshotDigest"> = {
		schemaVersion: WORK_STATE_SCHEMA_VERSION,
		...(input.generatedAt ? { generatedAt: input.generatedAt } : {}),
		changeIds: changes.map((change) => change.id),
		workGraphDigest: graphDigest(workGraphDeltas, workUnits),
		workGraphDeltaIds: workGraphDeltas.map((delta) => delta.id),
		workUnitIds: workUnits.map((item) => item.id),
		assignmentIds: assignments.map((assignment) => assignment.id),
		changes,
		workGraphDeltas,
		workUnits,
		assignments,
		blockers: sortedBlockers,
		sources: {
			traceCount: groups.size,
			recordCount: input.records.length,
			changeTraceCount: [...groups.values()].filter(
				(group) => group.head.changeId !== undefined,
			).length,
		},
	};
	return {
		...stateWithoutDigest,
		snapshotDigest: workStateDigest(stateWithoutDigest),
	};
}

function traceGroups(records: TraceRecord[]): Map<string, TraceGroup> {
	const recordsByTrace = new Map<string, TraceRecord[]>();
	for (const record of records) {
		recordsByTrace.set(record.traceId, [
			...(recordsByTrace.get(record.traceId) || []),
			record,
		]);
	}
	const groups = new Map<string, TraceGroup>();
	for (const [traceId, traceRecords] of recordsByTrace) {
		const head = traceRecords.find(
			(record): record is TraceHead => record.type === "trace_head",
		);
		if (!head) continue;
		groups.set(traceId, {
			head,
			records: traceRecords,
			events: traceRecords
				.filter((record): record is TraceEvent => record.type === "trace_event")
				.sort((left, right) => left.sequence - right.sequence),
		});
	}
	return groups;
}

function changeRecordsById(
	groups: Map<string, TraceGroup>,
): Map<string, ChangeRecord> {
	const records = new Map<string, ChangeRecord>();
	for (const group of groups.values()) {
		const record = changeRecordFromTrace(group.records);
		if (record) records.set(record.change.id, record);
	}
	return records;
}

function approvalsByChangeId(
	groups: Map<string, TraceGroup>,
	changeRecords: Map<string, ChangeRecord>,
): Map<string, WorkStateApproval> {
	const approvals = new Map<string, WorkStateApproval>();
	for (const record of changeRecords.values()) {
		const group = groups.get(changeTraceId(record.change.id));
		const event = group?.events
			.filter((candidate) => candidate.event === "change_approved")
			.at(-1);
		approvals.set(record.change.id, approvalFromChangeRecord(record, event));
	}
	for (const group of groups.values()) {
		for (const event of group.events.filter(isExitedDecisionEvent)) {
			const output = objectValue(event.data?.output);
			for (const change of objectList(output?.changes)) {
				const changeId = text(change.id);
				if (!changeId || !changeRecords.has(changeId)) continue;
				const current = approvals.get(changeId);
				if (current?.eventId) continue;
				const record = changeRecords.get(changeId);
				if (!record) continue;
				approvals.set(changeId, {
					status: "approved",
					changeRevision: record.change.revision,
					changeDigest: changeContentDigest(record.change),
					eventId: event.id,
					approvedAt: event.createdAt,
				});
			}
		}
	}
	return approvals;
}

function approvalFromChangeRecord(
	record: ChangeRecord,
	event: TraceEvent | undefined,
): WorkStateApproval {
	const eventRecord = event ? changeRecordOutput(event) : undefined;
	const output = objectValue(event?.data?.output);
	return {
		status: approvalStatus(record),
		changeRevision: record.change.revision,
		changeDigest: changeContentDigest(record.change),
		...(event
			? {
					eventId: event.id,
					approvedAt: event.createdAt,
					approvedBy:
						text(output?.actor) ||
						eventRecord?.change.lastStatusTransition?.changedBy,
					approvalRef: event.id,
				}
			: {}),
	};
}

function approvalStatus(record: ChangeRecord): WorkStateApproval["status"] {
	if (record.change.status === "accepted") return "approved";
	if (record.change.status === "deferred") return "deferred";
	if (record.change.status === "rejected") return "rejected";
	if (record.change.status === "withdrawn") return "withdrawn";
	return "pending";
}

function projectPlanningGroup(input: {
	group: TraceGroup;
	graphDeltaMap: Map<string, WorkStateGraphDelta>;
	workUnitMap: Map<string, WorkStateWorkUnit>;
	blockers: WorkStateBlocker[];
}): void {
	const planningEvents = input.group.events.filter(
		(event) => event.loop === "planning" && eventExitStatus(event) === "exit",
	);
	for (const event of planningEvents) {
		const output = objectValue(event.data?.output);
		if (!output) continue;
		const workGraphDeltaId = text(output.workGraphDeltaId);
		const change = objectValue(output.change);
		const owningChangeId = text(change?.changeId) || input.group.head.changeId;
		const digest = text(output.digest);
		if (!workGraphDeltaId || !owningChangeId || !digest) continue;
		const items = objectList(output.workUnits);
		const workUnitIds: string[] = [];
		for (const item of items) {
			const id = projectWorkUnit({
				item, event, workGraphDeltaId, owningChangeId,
				workUnitMap: input.workUnitMap, blockers: input.blockers,
			});
			if (id) workUnitIds.push(id);
		}
		input.graphDeltaMap.set(workGraphDeltaId, {
			id: workGraphDeltaId,
			digest,
			owningChangeId,
			planningEventId: event.id,
			workUnitIds: unique(workUnitIds),
			acceptanceCoverage: objectList(output.acceptanceCoverage).flatMap((entry) => {
				const acceptanceRequirement = text(entry.acceptanceRequirement);
				return acceptanceRequirement
					? [{acceptanceRequirement, workUnitIds: stringList(entry.workUnitIds)}]
					: [];
			}),
			integrationRequirements: stringList(output.integrationRequirements),
			uiPreviewTargets: projectedUiPreviewTargets(output.uiPreviewTargets),
		});
	}
}

function projectWorkUnit(input: {
	item: Record<string, unknown>;
	event: TraceEvent;
	workGraphDeltaId: string;
	owningChangeId: string;
	workUnitMap: Map<string, WorkStateWorkUnit>;
	blockers: WorkStateBlocker[];
}): string | undefined {
	const id = text(input.item.id);
	if (!id) return undefined;
	const owningChangeId = text(input.item.owningChangeId) || input.owningChangeId;
	const projected: WorkStateWorkUnit = {
		id,
		workGraphDeltaId: input.workGraphDeltaId,
		owningChangeId,
		title: text(input.item.title) || id,
		planningEventId: input.event.id,
		dependsOn: stringList(input.item.dependsOn),
		componentRefs: stringList(input.item.componentRefs),
		pathScopes: stringList(input.item.pathScopes),
		acceptanceCriterionIds: objectList(input.item.acceptanceCriteria)
			.map((criterion) => text(criterion.id))
			.filter((criterionId): criterionId is string => criterionId !== undefined),
		assignmentIds: [],
		implemented: false,
		blockers: [],
	};
	const existing = input.workUnitMap.get(id);
	if (existing && (existing.workGraphDeltaId !== projected.workGraphDeltaId || existing.owningChangeId !== projected.owningChangeId)) {
		const blocker: WorkStateBlocker = {
			id: `work-unit-conflict:${id}`,
			message: `Work Unit ${id} has conflicting graph-delta or owning Change facts.`,
			changeId: owningChangeId,
			workUnitId: id,
			refs: unique([existing.planningEventId, input.event.id]),
		};
		input.blockers.push(blocker);
		projected.blockers.push(blocker.message);
	}
	input.workUnitMap.set(id, mergeWorkUnit(existing, projected));
	return id;
}

function projectAssignments(
	group: TraceGroup,
	workUnitMap: Map<string, WorkStateWorkUnit>,
	assignmentMap: Map<string, WorkStateAssignment>,
): void {
	for (const event of group.events) {
		if (event.event === "runtime.work_unit.claimed") {
			const workUnitId = text(event.data?.workUnitId);
			if (!workUnitId) continue;
			const item = workUnitMap.get(workUnitId);
			const id = text(event.data?.claimId) || event.id;
			assignmentMap.set(id, {
				id,
				workUnitId,
				...(item?.owningChangeId
					? { owningChangeId: item.owningChangeId }
					: {}),
				...(text(event.data?.workerId)
					? { workerId: text(event.data?.workerId) }
					: {}),
				status: "claimed",
				claimedAt: event.createdAt,
				...(text(event.data?.expiresAt)
					? { expiresAt: text(event.data?.expiresAt) }
					: {}),
				claimEventId: event.id,
			});
			continue;
		}
		const terminalStatus = assignmentTerminalStatus(event.event);
		if (!terminalStatus) continue;
		const id = text(event.data?.claimId) || event.id;
		const existing = assignmentMap.get(id);
		const workUnitId = text(event.data?.workUnitId) || existing?.workUnitId;
		if (!workUnitId) continue;
		const item = workUnitMap.get(workUnitId);
		assignmentMap.set(id, {
			id,
			workUnitId,
			...(existing?.owningChangeId || item?.owningChangeId
				? { owningChangeId: existing?.owningChangeId || item?.owningChangeId }
				: {}),
			...(existing?.workerId || text(event.data?.workerId)
				? { workerId: existing?.workerId || text(event.data?.workerId) }
				: {}),
			status: terminalStatus,
			...(existing?.claimedAt ? { claimedAt: existing.claimedAt } : {}),
			terminalAt: event.createdAt,
			...(existing?.expiresAt ? { expiresAt: existing.expiresAt } : {}),
			...(existing?.claimEventId
				? { claimEventId: existing.claimEventId }
				: {}),
			terminalEventId: event.id,
		});
	}
}

function projectImplementation(
	group: TraceGroup,
	workUnitMap: Map<string, WorkStateWorkUnit>,
): void {
	for (const event of group.events.filter(
		(candidate) => candidate.loop === "implementation",
	)) {
		const output = objectValue(event.data?.output);
		const coveredIds = unique([
			...stringList(output?.coveredWorkUnitRefs).flatMap(workUnitIdsFromRef),
			...objectList(output?.changes).flatMap((change) =>
				stringList(change.planningRefs).flatMap(workUnitIdsFromRef),
			),
		]);
		for (const id of coveredIds) {
			const item = workUnitMap.get(id);
			if (item) item.implemented = true;
		}
	}
}

function projectIntegration(
	group: TraceGroup,
	workUnitMap: Map<string, WorkStateWorkUnit>,
): void {
	for (const event of group.events.filter(
		(candidate) => candidate.event === "runtime.integration.proven",
	)) {
		const workUnitId = text(event.data?.workUnitId);
		const item = workUnitId ? workUnitMap.get(workUnitId) : undefined;
		const jobId = text(event.data?.runtimeJobId);
		const targetRef = text(event.data?.targetRef);
		const baseCommit = text(event.data?.baseCommit);
		const commit = text(event.data?.commit);
		const tree = text(event.data?.tree);
		const contentProof = text(event.data?.contentProof);
		const workerReportRef = text(event.data?.workerReportRef);
		if (
			!item ||
			!jobId ||
			!targetRef ||
			!baseCommit ||
			!commit ||
			!tree ||
			!contentProof ||
			!workerReportRef
		) {
			continue;
		}
		item.integrationProofs = [
			...(item.integrationProofs || []).filter(
				(proof) => proof.eventId !== event.id,
			),
			{
				eventId: event.id,
				jobId,
				targetRef,
				targetRefs: stringList(event.data?.targetRefs),
				baseCommit,
				commit,
				tree,
				contentProof,
				changedPaths: stringList(event.data?.changedPaths),
				workerReportRef,
				integratedAt: event.createdAt,
			},
		].sort((left, right) => left.eventId.localeCompare(right.eventId));
	}
}

function projectEventBlockers(
	group: TraceGroup,
	blockers: WorkStateBlocker[],
): void {
	for (const event of group.events.filter(
		(candidate) => eventExitStatus(candidate) === "blocked",
	)) {
		const exit = objectValue(event.data?.exit);
		const messages = unique([
			...stringList(exit?.blockers),
			...objectList(exit?.findings)
				.map((finding) => text(finding.message))
				.filter((message): message is string => message !== undefined),
		]);
		for (const [index, message] of messages.entries()) {
			blockers.push({
				id: `blocked:${event.id}:${index}`,
				message,
				...(group.head.changeId ? { changeId: group.head.changeId } : {}),
				refs: [event.id],
			});
		}
	}
}

function projectProjectBranchMerges(
	group: TraceGroup,
	workUnitMap: Map<string, WorkStateWorkUnit>,
): void {
	for (const event of group.events.filter(
		(candidate) => candidate.event === "runtime.project_branch.merged",
	)) {
		const workUnitId = text(event.data?.workUnitId);
		const item = workUnitId ? workUnitMap.get(workUnitId) : undefined;
		const authority = objectValue(event.data?.authority);
		const jobId = text(event.data?.runtimeJobId);
		const integrationEventId = text(event.data?.integrationEventId);
		const targetBranch = text(event.data?.targetBranch);
		const previousCommit = text(event.data?.expectedTargetCommit);
		const commit = text(event.data?.commit);
		const tree = text(event.data?.tree);
		const contentProof = text(event.data?.contentProof);
		const authorityKind = text(authority?.kind);
		const authorityActor = text(authority?.actor);
		const authorityRef = text(authority?.ref);
		if (
			!item ||
			!jobId ||
			!integrationEventId ||
			!targetBranch ||
			!previousCommit ||
			!commit ||
			!tree ||
			!contentProof ||
			(authorityKind !== "user" && authorityKind !== "policy") ||
			!authorityActor ||
			!authorityRef
		) {
			continue;
		}
		const proof: WorkStateMergeProof = {
			eventId: event.id,
			jobId,
			integrationEventId,
			targetBranch,
			previousCommit,
			commit,
			tree,
			contentProof,
			authorityKind,
			authorityActor,
			authorityRef,
			mergedAt: event.createdAt,
		};
		item.mergeProofs = [
			...(item.mergeProofs || []).filter(
				(candidate) => candidate.eventId !== event.id,
			),
			proof,
		].sort((left, right) => left.eventId.localeCompare(right.eventId));
	}
}

function projectProjectBranchPushes(
	group: TraceGroup,
	workUnitMap: Map<string, WorkStateWorkUnit>,
): void {
	for (const event of group.events.filter(
		(candidate) => candidate.event === "runtime.project_branch.pushed",
	)) {
		const workUnitId = text(event.data?.workUnitId);
		const item = workUnitId ? workUnitMap.get(workUnitId) : undefined;
		const authority = objectValue(event.data?.authority);
		const jobId = text(event.data?.runtimeJobId);
		const mergeEventId = text(event.data?.mergeEventId);
		const remote = text(event.data?.remote);
		const targetBranch = text(event.data?.targetBranch);
		const previousRemoteCommit = nullableText(
			event.data?.expectedRemoteCommit,
		);
		const commit = text(event.data?.commit);
		const tree = text(event.data?.tree);
		const contentProof = text(event.data?.contentProof);
		const authorityKind = text(authority?.kind);
		const authorityActor = text(authority?.actor);
		const authorityRef = text(authority?.ref);
		if (
			!item ||
			!jobId ||
			!mergeEventId ||
			!remote ||
			!targetBranch ||
			previousRemoteCommit === undefined ||
			!commit ||
			!tree ||
			!contentProof ||
			authorityKind !== "user" ||
			!authorityActor ||
			!authorityRef
		) {
			continue;
		}
		const proof: WorkStatePushProof = {
			eventId: event.id,
			jobId,
			mergeEventId,
			remote,
			targetBranch,
			previousRemoteCommit,
			commit,
			tree,
			contentProof,
			authorityActor,
			authorityRef,
			pushedAt: event.createdAt,
		};
		item.pushProofs = [
			...(item.pushProofs || []).filter(
				(candidate) => candidate.eventId !== event.id,
			),
			proof,
		].sort((left, right) => left.eventId.localeCompare(right.eventId));
	}
}

function applyAssignmentRefs(
	workUnitMap: Map<string, WorkStateWorkUnit>,
	assignmentMap: Map<string, WorkStateAssignment>,
): void {
	for (const assignment of assignmentMap.values()) {
		const item = workUnitMap.get(assignment.workUnitId);
		if (item)
			item.assignmentIds = unique([...item.assignmentIds, assignment.id]);
	}
}

function changeView(input: {
	record: ChangeRecord;
	approval: WorkStateApproval | undefined;
	workGraphDeltas: WorkStateGraphDelta[];
	workUnits: WorkStateWorkUnit[];
	assignments: WorkStateAssignment[];
	blockers: WorkStateBlocker[];
	group?: TraceGroup;
}): WorkStateChange {
	const id = input.record.change.id;
	const workGraphDeltaIds = input.workGraphDeltas.flatMap((delta) =>
		delta.owningChangeId === id ? [delta.id] : [],
	);
	const workUnitIds = input.workUnits.flatMap((item) =>
		item.owningChangeId === id ? [item.id]
			: [],
	);
	const assignmentIds = input.assignments.flatMap((assignment) =>
		assignment.owningChangeId === id ||
		workUnitIds.includes(assignment.workUnitId)
			? [assignment.id]
			: [],
	);
	const changeBlockers = input.blockers.flatMap((blocker) =>
		blocker.changeId === id ||
		(blocker.workUnitId && workUnitIds.includes(blocker.workUnitId))
			? [blocker.message]
			: [],
	);
	const approval =
		input.approval || approvalFromChangeRecord(input.record, undefined);
	const planningStatus = changePlanningStatus(
		approval,
		workGraphDeltaIds,
		changeBlockers,
	);
	const realizationStatus = changeRealizationStatus(
		workUnitIds,
		input.workUnits,
		changeBlockers,
	);
	const outcomeStatus = outcomeStatusFromEvents(input.group?.events || []);
	const currentLoop = currentLoopForChange(
		approval,
		planningStatus,
		realizationStatus,
	);
	return {
		id,
		traceId: changeTraceId(id),
		record: input.record,
		approval,
		planningStatus,
		realizationStatus,
		outcomeStatus,
		workGraphDeltaIds: unique(workGraphDeltaIds),
		workUnitIds: unique(workUnitIds),
		assignmentIds: unique(assignmentIds),
		blockers: unique(changeBlockers),
		...(currentLoop ? { currentLoop } : {}),
		...(nextActionForChange(
			approval,
			planningStatus,
			realizationStatus,
			outcomeStatus,
		)
			? {
					nextAction: nextActionForChange(
						approval,
						planningStatus,
						realizationStatus,
						outcomeStatus,
					),
				}
			: {}),
		...(input.group?.events.at(-1)
			? { lastEventId: input.group.events.at(-1)?.id }
			: {}),
	};
}

function changePlanningStatus(
	approval: WorkStateApproval,
	workGraphDeltaIds: string[],
	_blockers: string[],
): WorkStatePlanningStatus {
	if (approval.status !== "approved") return "unplanned";
	return workGraphDeltaIds.length > 0 ? "planned" : "unplanned";
}

function changeRealizationStatus(
	workUnitIds: string[],
	items: WorkStateWorkUnit[],
	blockers: string[],
): WorkStateRealizationStatus {
	if (blockers.length > 0) return "blocked";
	if (workUnitIds.length === 0) return "not_started";
	const relevant = items.filter((item) => workUnitIds.includes(item.id));
	return relevant.every((item) => item.implemented) ? "realized" : "active";
}

function outcomeStatusFromEvents(events: TraceEvent[]): WorkStateOutcomeStatus {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (!event) continue;
		const output = objectValue(event.data?.output);
		const disposition = objectValue(output?.outcomeDisposition);
		const status = text(disposition?.status) || text(output?.outcomeStatus);
		if (isOutcomeStatus(status)) return status;
	}
	return "pending";
}

function currentLoopForChange(
	approval: WorkStateApproval,
	planningStatus: WorkStatePlanningStatus,
	realizationStatus: WorkStateRealizationStatus,
): WorkStateChange["currentLoop"] {
	if (approval.status === "pending") return "decision";
	if (approval.status !== "approved") return undefined;
	if (planningStatus !== "planned") return "planning";
	if (realizationStatus !== "realized") return "implementation";
	return undefined;
}

function nextActionForChange(
	approval: WorkStateApproval,
	planningStatus: WorkStatePlanningStatus,
	realizationStatus: WorkStateRealizationStatus,
	outcomeStatus: WorkStateOutcomeStatus,
): string | undefined {
	if (approval.status === "pending") return "Continue Decision review.";
	if (approval.status !== "approved") return undefined;
	if (planningStatus === "incomplete_commit")
		return "Repair incomplete Planning graph-delta append.";
	if (planningStatus !== "planned")
		return "Plan approved Change against current Work Graph.";
	if (realizationStatus === "blocked") return "Resolve implementation blocker.";
	if (realizationStatus !== "realized")
		return "Execute and validate ready Work Units.";
	if (outcomeStatus === "pending") return "Record outcome disposition.";
	return undefined;
}

function mergeWorkUnit(
	current: WorkStateWorkUnit | undefined,
	next: WorkStateWorkUnit,
): WorkStateWorkUnit {
	if (!current) return next;
	return {
		...current,
		...next,
		dependsOn: unique([...current.dependsOn, ...next.dependsOn]),
		componentRefs: unique([...current.componentRefs, ...next.componentRefs]),
		pathScopes: unique([...current.pathScopes, ...next.pathScopes]),
		acceptanceCriterionIds: unique([
			...current.acceptanceCriterionIds,
			...next.acceptanceCriterionIds,
		]),
		assignmentIds: unique([...current.assignmentIds, ...next.assignmentIds]),
		implemented: current.implemented || next.implemented,
		blockers: unique([...current.blockers, ...next.blockers]),
	};
}

function isExitedDecisionEvent(event: TraceEvent): boolean {
	return event.loop === "decision" && eventExitStatus(event) === "exit";
}

function eventExitStatus(event: TraceEvent): string | undefined {
	return text(objectValue(event.data?.exit)?.status);
}

function assignmentTerminalStatus(
	eventName: string,
): WorkStateAssignmentStatus | undefined {
	if (eventName === "runtime.work_unit.claim.released") return "released";
	if (eventName === "runtime.work_unit.claim.expired") return "expired";
	if (eventName === "runtime.work_unit.claim.cancelled") return "cancelled";
	return undefined;
}

function workUnitIdsFromRef(ref: string): string[] {
	const subref = /#(?:work-unit|work-unit):([^#]+)$/.exec(ref);
	if (subref) return [subref[1]];
	return [ref];
}

function graphDigest(
	deltas: WorkStateGraphDelta[],
	workUnits: WorkStateWorkUnit[],
): string {
	return `sha256:${createHash("sha256")
		.update(stableJson({deltas, workUnits}))
		.digest("hex")}`;
}

function workStateDigest(value: Omit<WorkState, "snapshotDigest">): string {
	const digestInput = Object.fromEntries(
		Object.entries(value).filter(([key]) => key !== "generatedAt"),
	);
	return `sha256:${createHash("sha256")
		.update(stableJson(digestInput))
		.digest("hex")}`;
}

function isOutcomeStatus(
	value: string | undefined,
): value is WorkStateOutcomeStatus {
	return [
		"pending",
		"observed",
		"observation_scheduled",
		"not_observable",
		"deferred",
		"failed",
		"abandoned",
	].includes(value || "");
}

function projectedUiPreviewTargets(value: unknown): UiPreviewTargetBinding[] {
	return objectList(value)
		.map((target) =>
			normalizeUiPreviewTargetBinding({
				targetId: text(target.targetId),
				targetDigest: text(target.targetDigest),
				profileId: text(target.profileId),
				profileDigest: text(target.profileDigest),
				workUnitIds: stringList(target.workUnitIds),
				changeIds: stringList(target.changeIds),
				required:
					typeof target.required === "boolean" ? target.required : undefined,
				activation: text(target.activation),
				autoOpen: text(target.autoOpen),
			}),
		)
		.filter(
			(target) => uiPreviewTargetBindingValidationIssues(target).length === 0,
		);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function objectList(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is Record<string, unknown> =>
					item !== null && typeof item === "object" && !Array.isArray(item),
			)
		: [];
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		if (typeof item !== "string") return [];
		const normalized = item.trim();
		return normalized ? [normalized] : [];
	});
}

function nullableText(value: unknown): string | null | undefined {
	if (value === null) return null;
	return text(value);
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function unique(values: string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
