import { createHash } from "node:crypto";
import {
	changeRecordFromTrace,
	changeRecordOutput,
	changeTraceId,
} from "../changes/change-trace.ts";
import { changeContentDigest, stableJson } from "../changes/digest.ts";
import type { ChangeRecord } from "../changes/records.ts";
import type { TraceEvent, TraceHead, TraceRecord } from "../traces/types.ts";
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
	type WorkStateSprint,
	type WorkStateWorkItem,
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

interface PlanningEpochObservation {
	participantChangeIds: Set<string>;
	observedChangeIds: Set<string>;
	sprintIds: Set<string>;
}

export function buildWorkState(input: BuildWorkStateInput): WorkState {
	const groups = traceGroups(input.records);
	const changeRecords = changeRecordsById(groups);
	const approvals = approvalsByChangeId(groups, changeRecords);
	const sprintMap = new Map<string, WorkStateSprint>();
	const workItemMap = new Map<string, WorkStateWorkItem>();
	const assignmentMap = new Map<string, WorkStateAssignment>();
	const blockers: WorkStateBlocker[] = [];
	const planningEpochs = new Map<string, PlanningEpochObservation>();

	for (const group of groups.values()) {
		projectPlanningGroup({
			group,
			sprintMap,
			workItemMap,
			blockers,
			planningEpochs,
		});
	}
	for (const group of groups.values()) {
		projectAssignments(group, workItemMap, assignmentMap);
		projectImplementation(group, workItemMap);
		projectEventBlockers(group, blockers);
	}
	applyAssignmentRefs(workItemMap, assignmentMap);
	applyPlanningEpochIntegrity(planningEpochs, sprintMap, blockers);

	const sprints = [...sprintMap.values()]
		.map((sprint) => finalizedSprint(sprint, workItemMap, blockers))
		.sort((left, right) => left.id.localeCompare(right.id));
	const workItems = [...workItemMap.values()].sort((left, right) =>
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
				sprints,
				workItems,
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
		sprintIds: sprints.map((sprint) => sprint.id),
		workItemIds: workItems.map((item) => item.id),
		assignmentIds: assignments.map((assignment) => assignment.id),
		changes,
		sprints,
		workItems,
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
	sprintMap: Map<string, WorkStateSprint>;
	workItemMap: Map<string, WorkStateWorkItem>;
	blockers: WorkStateBlocker[];
	planningEpochs: Map<string, PlanningEpochObservation>;
}): void {
	const planningEvents = input.group.events.filter(
		(event) => event.loop === "planning" && eventExitStatus(event) === "exit",
	);
	if (planningEvents.length === 0) return;
	for (const event of planningEvents) {
		const output = objectValue(event.data?.output);
		if (!output) continue;
		const epochId = text(output.planningEpochId);
		const participatingChanges = unique([
			...objectList(output.participantChanges)
				.map((participant) => text(participant.changeId))
				.filter((id): id is string => id !== undefined),
			...(input.group.head.changeId ? [input.group.head.changeId] : []),
		]);
		const sprints = objectList(output.sprints);
		const sprintIds = sprints
			.map((plan) => text(plan.id))
			.filter((id): id is string => id !== undefined);
		for (const plan of sprints) {
			const sprintId = text(plan.id);
			if (!sprintId) continue;
			const planParticipants = unique([
				...stringList(plan.participatingChangeIds),
				...participatingChanges,
			]);
			mergeSprint(input.sprintMap, {
				id: sprintId,
				source: "planning",
				...(epochId ? { planningEpochId: epochId } : {}),
				...(text(plan.digest) ? { digest: text(plan.digest) } : {}),
				goal: text(plan.goal) || text(plan.summary) || input.group.head.title,
				participatingChangeIds: planParticipants,
				workItemIds: stringList(plan.workItemIds),
				dependencyIds: stringList(plan.dependsOn),
				integrationRefs: unique([
					...stringList(plan.integrationRefs),
					...stringList(plan.previewTargetRefs),
				]),
				complete: false,
				blockers: [],
			});
		}
		for (const item of objectList(output.workItems)) {
			projectWorkItem({
				item,
				event,
				epochId,
				sprintIds,
				participatingChanges,
				sprintMap: input.sprintMap,
				workItemMap: input.workItemMap,
				blockers: input.blockers,
			});
		}
		if (epochId) {
			const observation = input.planningEpochs.get(epochId) || {
				participantChangeIds: new Set<string>(),
				observedChangeIds: new Set<string>(),
				sprintIds: new Set<string>(),
			};
			for (const changeId of participatingChanges)
				observation.participantChangeIds.add(changeId);
			if (input.group.head.changeId)
				observation.observedChangeIds.add(input.group.head.changeId);
			for (const sprintId of sprintIds) observation.sprintIds.add(sprintId);
			input.planningEpochs.set(epochId, observation);
		}
	}
}

function projectWorkItem(input: {
	item: Record<string, unknown>;
	event: TraceEvent;
	epochId?: string;
	sprintIds: string[];
	participatingChanges: string[];
	sprintMap: Map<string, WorkStateSprint>;
	workItemMap: Map<string, WorkStateWorkItem>;
	blockers: WorkStateBlocker[];
}): void {
	const id = text(input.item.id);
	if (!id) return;
	const explicitSprintId = text(input.item.sprintId);
	const sprintId =
		explicitSprintId || input.sprintIds[0] || input.event.traceId;
	const owningChangeId =
		text(input.item.owningChangeId) ||
		(input.participatingChanges.length === 1
			? input.participatingChanges[0]
			: undefined);
	const contributesToChangeIds = unique([
		...stringList(input.item.contributingChangeIds),
	]).filter((changeId) => changeId !== owningChangeId);
	const projected: WorkStateWorkItem = {
		id,
		sprintId,
		...(owningChangeId ? { owningChangeId } : {}),
		contributesToChangeIds,
		title: text(input.item.title) || text(input.item.summary) || id,
		planningEventId: input.event.id,
		...(input.epochId ? { planningEpochId: input.epochId } : {}),
		dependsOn: stringList(input.item.dependsOn),
		componentRefs: stringList(input.item.componentRefs),
		pathScopes: stringList(input.item.pathScopes),
		acceptanceCriterionIds: objectList(input.item.acceptanceCriteria)
			.map((criterion) => text(criterion.id))
			.filter(
				(criterionId): criterionId is string => criterionId !== undefined,
			),
		assignmentIds: [],
		implemented: false,
		blockers: [],
	};
	const existing = input.workItemMap.get(id);
	if (
		existing &&
		(existing.sprintId !== projected.sprintId ||
			existing.owningChangeId !== projected.owningChangeId)
	) {
		const blocker: WorkStateBlocker = {
			id: `work-item-conflict:${id}`,
			message: `Work Item ${id} has conflicting Sprint or owning Change facts.`,
			...(owningChangeId ? { changeId: owningChangeId } : {}),
			sprintId,
			workItemId: id,
			refs: unique([existing.planningEventId, input.event.id]),
		};
		input.blockers.push(blocker);
		projected.blockers.push(blocker.message);
	}
	input.workItemMap.set(id, mergeWorkItem(existing, projected));
	const sprint = input.sprintMap.get(sprintId);
	if (sprint) sprint.workItemIds = unique([...sprint.workItemIds, id]);
}

function projectAssignments(
	group: TraceGroup,
	workItemMap: Map<string, WorkStateWorkItem>,
	assignmentMap: Map<string, WorkStateAssignment>,
): void {
	for (const event of group.events) {
		if (event.event === "runtime.work_unit.claimed") {
			const workItemId = text(event.data?.workUnitId);
			if (!workItemId) continue;
			const item = workItemMap.get(workItemId);
			const id = text(event.data?.claimId) || event.id;
			assignmentMap.set(id, {
				id,
				workItemId,
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
		const workItemId = text(event.data?.workUnitId) || existing?.workItemId;
		if (!workItemId) continue;
		const item = workItemMap.get(workItemId);
		assignmentMap.set(id, {
			id,
			workItemId,
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
	workItemMap: Map<string, WorkStateWorkItem>,
): void {
	for (const event of group.events.filter(
		(candidate) => candidate.loop === "implementation",
	)) {
		const output = objectValue(event.data?.output);
		const coveredIds = unique([
			...stringList(output?.coveredWorkItemRefs).flatMap(workItemIdsFromRef),
			...objectList(output?.changes).flatMap((change) =>
				stringList(change.planningRefs).flatMap(workItemIdsFromRef),
			),
		]);
		for (const id of coveredIds) {
			const item = workItemMap.get(id);
			if (item) item.implemented = true;
		}
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

function applyAssignmentRefs(
	workItemMap: Map<string, WorkStateWorkItem>,
	assignmentMap: Map<string, WorkStateAssignment>,
): void {
	for (const assignment of assignmentMap.values()) {
		const item = workItemMap.get(assignment.workItemId);
		if (item)
			item.assignmentIds = unique([...item.assignmentIds, assignment.id]);
	}
}

function applyPlanningEpochIntegrity(
	epochs: Map<string, PlanningEpochObservation>,
	sprintMap: Map<string, WorkStateSprint>,
	blockers: WorkStateBlocker[],
): void {
	for (const [epochId, epoch] of epochs) {
		const missing = [...epoch.participantChangeIds].filter(
			(changeId) => !epoch.observedChangeIds.has(changeId),
		);
		if (missing.length === 0) continue;
		for (const sprintId of epoch.sprintIds) {
			const sprint = sprintMap.get(sprintId);
			if (!sprint) continue;
			const message = `Planning epoch ${epochId} is missing Change Trace append(s): ${missing.join(", ")}.`;
			sprint.blockers = unique([...sprint.blockers, message]);
			blockers.push({
				id: `planning-epoch-incomplete:${epochId}:${sprintId}`,
				message,
				sprintId,
				refs: [epochId, ...missing],
			});
		}
	}
}

function finalizedSprint(
	sprint: WorkStateSprint,
	workItemMap: Map<string, WorkStateWorkItem>,
	blockers: WorkStateBlocker[],
): WorkStateSprint {
	const items = sprint.workItemIds.flatMap((id) => {
		const item = workItemMap.get(id);
		return item ? [item] : [];
	});
	return {
		...sprint,
		participatingChangeIds: unique(sprint.participatingChangeIds),
		workItemIds: unique(sprint.workItemIds),
		dependencyIds: unique(sprint.dependencyIds),
		integrationRefs: unique(sprint.integrationRefs),
		complete: items.length > 0 && items.every((item) => item.implemented),
		blockers: unique([
			...sprint.blockers,
			...blockers.flatMap((blocker) =>
				blocker.sprintId === sprint.id ? [blocker.message] : [],
			),
		]),
	};
}

function changeView(input: {
	record: ChangeRecord;
	approval: WorkStateApproval | undefined;
	sprints: WorkStateSprint[];
	workItems: WorkStateWorkItem[];
	assignments: WorkStateAssignment[];
	blockers: WorkStateBlocker[];
	group?: TraceGroup;
}): WorkStateChange {
	const id = input.record.change.id;
	const sprintIds = input.sprints.flatMap((sprint) =>
		sprint.participatingChangeIds.includes(id) ? [sprint.id] : [],
	);
	const workItemIds = input.workItems.flatMap((item) =>
		item.owningChangeId === id || item.contributesToChangeIds.includes(id)
			? [item.id]
			: [],
	);
	const assignmentIds = input.assignments.flatMap((assignment) =>
		assignment.owningChangeId === id ||
		workItemIds.includes(assignment.workItemId)
			? [assignment.id]
			: [],
	);
	const changeBlockers = input.blockers.flatMap((blocker) =>
		blocker.changeId === id ||
		(blocker.sprintId && sprintIds.includes(blocker.sprintId)) ||
		(blocker.workItemId && workItemIds.includes(blocker.workItemId))
			? [blocker.message]
			: [],
	);
	const approval =
		input.approval || approvalFromChangeRecord(input.record, undefined);
	const planningStatus = changePlanningStatus(
		approval,
		sprintIds,
		changeBlockers,
	);
	const realizationStatus = changeRealizationStatus(
		workItemIds,
		input.workItems,
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
		sprintIds: unique(sprintIds),
		workItemIds: unique(workItemIds),
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
	sprintIds: string[],
	blockers: string[],
): WorkStatePlanningStatus {
	if (
		blockers.some(
			(message) =>
				message.includes("Planning epoch") && message.includes("missing"),
		)
	) {
		return "incomplete_commit";
	}
	if (approval.status !== "approved") return "unplanned";
	return sprintIds.length > 0 ? "planned" : "unplanned";
}

function changeRealizationStatus(
	workItemIds: string[],
	items: WorkStateWorkItem[],
	blockers: string[],
): WorkStateRealizationStatus {
	if (blockers.length > 0) return "blocked";
	if (workItemIds.length === 0) return "not_started";
	const relevant = items.filter((item) => workItemIds.includes(item.id));
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
		return "Repair incomplete Planning epoch append.";
	if (planningStatus !== "planned")
		return "Include approved Change in Planning horizon.";
	if (realizationStatus === "blocked") return "Resolve implementation blocker.";
	if (realizationStatus !== "realized")
		return "Execute and validate ready Work Items.";
	if (outcomeStatus === "pending") return "Record outcome disposition.";
	return undefined;
}

function mergeSprint(
	map: Map<string, WorkStateSprint>,
	next: WorkStateSprint,
): void {
	const current = map.get(next.id);
	if (!current) {
		map.set(next.id, next);
		return;
	}
	map.set(next.id, {
		...current,
		...next,
		participatingChangeIds: unique([
			...current.participatingChangeIds,
			...next.participatingChangeIds,
		]),
		workItemIds: unique([...current.workItemIds, ...next.workItemIds]),
		dependencyIds: unique([...current.dependencyIds, ...next.dependencyIds]),
		integrationRefs: unique([
			...current.integrationRefs,
			...next.integrationRefs,
		]),
		blockers: unique([...current.blockers, ...next.blockers]),
	});
}

function mergeWorkItem(
	current: WorkStateWorkItem | undefined,
	next: WorkStateWorkItem,
): WorkStateWorkItem {
	if (!current) return next;
	return {
		...current,
		...next,
		contributesToChangeIds: unique([
			...current.contributesToChangeIds,
			...next.contributesToChangeIds,
		]),
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

function workItemIdsFromRef(ref: string): string[] {
	const subref = /#(?:work-unit|work-item):([^#]+)$/.exec(ref);
	if (subref) return [subref[1]];
	return [ref];
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

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function unique(values: string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
