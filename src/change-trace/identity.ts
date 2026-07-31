import {
	ARCHIVE_MANIFEST_PROTOCOL,
	CHANGE_TRACE_PROTOCOL,
	PLANNING_EPOCH_PROTOCOL,
	STATE_COMMIT_MANIFEST_PROTOCOL,
	archiveManifestBodySchema,
	archiveManifestSchema,
	canonicalChangeOperationSchema,
	changeOperationBodySchema,
	changeOperationPayloadSchemas,
	changeRevisionContentSchema,
	planningEpochBodySchema,
	planningEpochRecordSchema,
	stateCommitManifestBodySchema,
	stateCommitManifestSchema,
	type ArchiveManifest,
	type ArchiveManifestBody,
	type AuthorityBinding,
	type BaseSnapshot,
	type CanonicalChangeOperation,
	type CanonicalInlineSemanticArtifact,
	type ChangeOperationBody,
	type ChangeOperationKind,
	type ChangeOperationPayload,
	type ChangeRevision,
	type ChangeRevisionContent,
	type ChangedTraceTail,
	type PlanningEpochBody,
	type PlanningEpochRecord,
	type StateCommitManifest,
} from "./contracts.ts";
import { OPERATION_DEFINITIONS } from "./catalog.ts";
import {
	canonicalJson,
	canonicalJsonDigest,
	parseCanonicalJson,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
} from "../utils/canonical-json.ts";
import { assertTypeboxSchema } from "../utils/json.ts";

export type CreateChangeOperationInput<K extends ChangeOperationKind> = Omit<
	ChangeOperationBody<K>,
	"protocol" | "kindVersion"
>;

export type CreatePlanningEpochInput = Omit<
	PlanningEpochBody,
	"protocol" | "kind" | "kindVersion" | "globalWorkItemGraphDigest"
>;

export interface CreateStateCommitManifestInput {
	readonly previousStateHead: StateCommitManifest["body"]["previousStateHead"];
	readonly operationIds: StateCommitManifest["body"]["operationIds"];
	readonly changedTraceTails: readonly ChangedTraceTail[];
}

export type CreateArchiveManifestInput = Omit<
	ArchiveManifestBody,
	"protocol"
>;

export function createChangeRevision(
	content: ChangeRevisionContent,
): ChangeRevision {
	const normalized = normalizeChangeRevisionContent(content);
	assertTypeboxSchema(
		changeRevisionContentSchema,
		normalized,
		"Change revision content",
	);
	return canonicalObject({
		revisionId: canonicalJsonDigest(normalized),
		content: normalized,
	});
}

export function createCanonicalChangeOperation<
	K extends ChangeOperationKind,
>(input: CreateChangeOperationInput<K>): CanonicalChangeOperation<K> {
	const body = canonicalObject<ChangeOperationBody<K>>({
		protocol: CHANGE_TRACE_PROTOCOL,
		kindVersion: "1.0.0",
		...input,
	});
	assertValidChangeOperationBody(body);
	const operation = canonicalObject<CanonicalChangeOperation<K>>({
		operationId: canonicalJsonDigest(body),
		body,
	});
	assertValidCanonicalChangeOperation(operation);
	return operation;
}

export function assertValidCanonicalChangeOperation(
	value: unknown,
): asserts value is CanonicalChangeOperation {
	assertTypeboxSchema(
		canonicalChangeOperationSchema,
		value,
		"Canonical Change operation",
	);
	const operation = value as CanonicalChangeOperation;
	assertValidChangeOperationBody(operation.body);
	const expected = canonicalJsonDigest(operation.body);
	if (operation.operationId !== expected) {
		throw new Error(
			`Canonical Change operation identity mismatch: expected ${expected}.`,
		);
	}
}

export function assertValidChangeOperationBody(
	value: unknown,
): asserts value is ChangeOperationBody {
	assertTypeboxSchema(
		changeOperationBodySchema,
		value,
		"Change operation body",
	);
	const body = value as ChangeOperationBody;
	const payloadSchema = changeOperationPayloadSchemas[body.kind];
	if (!payloadSchema) {
		throw new Error(`Unsupported Change operation kind ${String(body.kind)}.`);
	}
	assertTypeboxSchema(payloadSchema, body.payload, `${body.kind} payload`);
	assertIsoTimestamp(body.recordedAt, "Change operation recordedAt");
	assertParentPolicy(body);
	assertPayloadIdentities(body);
	assertPayloadSetOrder(body);
}

export function serializeCanonicalChangeOperation(
	operation: CanonicalChangeOperation,
): string {
	assertValidCanonicalChangeOperation(operation);
	return canonicalJson(operation);
}

export function parseCanonicalChangeOperation(
	text: string,
): CanonicalChangeOperation {
	const value = parseCanonicalJson(text);
	assertValidCanonicalChangeOperation(value);
	return value;
}

export function createPlanningEpochRecord(
	input: CreatePlanningEpochInput,
): PlanningEpochRecord {
	const normalized = normalizePlanningEpochInput(input);
	const body = canonicalObject<PlanningEpochBody>({
		protocol: PLANNING_EPOCH_PROTOCOL,
		kind: OPERATION_DEFINITIONS["planning.epoch_recorded"].kind,
		kindVersion: OPERATION_DEFINITIONS["planning.epoch_recorded"].kindVersion,
		...normalized,
		globalWorkItemGraphDigest: planningWorkItemGraphDigest(normalized),
	});
	assertValidPlanningEpochBody(body);
	const record = canonicalObject<PlanningEpochRecord>({
		operationId: canonicalJsonDigest(body),
		body,
	});
	assertValidPlanningEpochRecord(record);
	return record;
}

export function assertValidPlanningEpochRecord(
	value: unknown,
): asserts value is PlanningEpochRecord {
	assertTypeboxSchema(
		planningEpochRecordSchema,
		value,
		"Planning epoch record",
	);
	const record = value as PlanningEpochRecord;
	assertValidPlanningEpochBody(record.body);
	const expected = canonicalJsonDigest(record.body);
	if (record.operationId !== expected) {
		throw new Error(`Planning epoch identity mismatch: expected ${expected}.`);
	}
}

export function serializePlanningEpochRecord(record: PlanningEpochRecord): string {
	assertValidPlanningEpochRecord(record);
	return canonicalJson(record);
}

export function parsePlanningEpochRecord(text: string): PlanningEpochRecord {
	const value = parseCanonicalJson(text);
	assertValidPlanningEpochRecord(value);
	return value;
}

export function createStateCommitManifest(
	input: CreateStateCommitManifestInput,
): StateCommitManifest {
	const operationIds = Object.freeze([...input.operationIds]);
	const changedTraceTails = Object.freeze(
		[...input.changedTraceTails]
			.map((tail) => canonicalObject<ChangedTraceTail>(tail))
			.sort((left, right) => compareText(left.changeId, right.changeId)),
	);
	const body = canonicalObject<StateCommitManifest["body"]>({
		protocol: STATE_COMMIT_MANIFEST_PROTOCOL,
		previousStateHead: input.previousStateHead,
		operationIds,
		changedTraceTails,
		batchDigest: canonicalJsonDigest({operationIds}),
	});
	assertValidStateCommitManifestBody(body);
	const manifest = canonicalObject<StateCommitManifest>({
		manifestId: canonicalJsonDigest(body),
		body,
	});
	assertValidStateCommitManifest(manifest);
	return manifest;
}

export function assertValidStateCommitManifest(
	value: unknown,
): asserts value is StateCommitManifest {
	assertTypeboxSchema(
		stateCommitManifestSchema,
		value,
		"State commit manifest",
	);
	const manifest = value as StateCommitManifest;
	assertValidStateCommitManifestBody(manifest.body);
	const expected = canonicalJsonDigest(manifest.body);
	if (manifest.manifestId !== expected) {
		throw new Error(`State commit manifest identity mismatch: expected ${expected}.`);
	}
}

export function serializeStateCommitManifest(
	manifest: StateCommitManifest,
): string {
	assertValidStateCommitManifest(manifest);
	return canonicalJson(manifest);
}

export function parseStateCommitManifest(text: string): StateCommitManifest {
	const value = parseCanonicalJson(text);
	assertValidStateCommitManifest(value);
	return value;
}

export function createArchiveManifest(
	input: CreateArchiveManifestInput,
): ArchiveManifest {
	const normalized = normalizeArchiveManifestInput(input);
	const body = canonicalObject<ArchiveManifestBody>({
		protocol: ARCHIVE_MANIFEST_PROTOCOL,
		...normalized,
	});
	assertValidArchiveManifestBody(body);
	const manifest = canonicalObject<ArchiveManifest>({
		manifestId: canonicalJsonDigest(body),
		body,
	});
	assertValidArchiveManifest(manifest);
	return manifest;
}

export function assertValidArchiveManifest(
	value: unknown,
): asserts value is ArchiveManifest {
	assertTypeboxSchema(archiveManifestSchema, value, "Archive manifest");
	const manifest = value as ArchiveManifest;
	assertValidArchiveManifestBody(manifest.body);
	const expected = canonicalJsonDigest(manifest.body);
	if (manifest.manifestId !== expected) {
		throw new Error(`Archive manifest identity mismatch: expected ${expected}.`);
	}
}

export function serializeArchiveManifest(manifest: ArchiveManifest): string {
	assertValidArchiveManifest(manifest);
	return canonicalJson(manifest);
}

export function parseArchiveManifest(text: string): ArchiveManifest {
	const value = parseCanonicalJson(text);
	assertValidArchiveManifest(value);
	return value;
}

export function planningWorkItemGraphDigest(
	value: Pick<
		PlanningEpochBody,
		"participants" | "sprints" | "workItems" | "activeWorkDispositions"
	>,
): `sha256:${string}` {
	return canonicalJsonDigest({
		participants: value.participants.map((binding) => ({
			changeId: binding.changeId,
			revisionId: binding.revisionId,
		})),
		sprints: value.sprints.map((sprint) => ({
			id: sprint.id,
			workItemIds: sprint.workItemIds,
			dependsOnSprintIds: sprint.dependsOnSprintIds,
		})),
		workItems: value.workItems.map((workItem) => ({
			id: workItem.id,
			sprintId: workItem.sprintId,
			owningChangeId: workItem.owningChange.changeId,
			contributingChangeIds: workItem.contributingChanges.map(
				(binding) => binding.changeId,
			),
			dependsOnWorkItemIds: workItem.dependsOnWorkItemIds,
		})),
		activeWorkDispositions: value.activeWorkDispositions.map((entry) => ({
			workItemId: entry.workItemId,
			disposition: entry.disposition,
			...(entry.activeAssignmentOperationId
				? {activeAssignmentOperationId: entry.activeAssignmentOperationId}
				: {}),
			...(entry.replacementWorkItemId
				? {replacementWorkItemId: entry.replacementWorkItemId}
				: {}),
		})),
	});
}

function assertValidPlanningEpochBody(
	value: unknown,
): asserts value is PlanningEpochBody {
	assertTypeboxSchema(planningEpochBodySchema, value, "Planning epoch body");
	const body = value as PlanningEpochBody;
	assertIsoTimestamp(body.recordedAt, "Planning epoch recordedAt");
	assertSortedObjects(body.participants, participantKey, "Planning participants");
	assertSortedObjects(body.sprints, (entry) => entry.id, "Planning sprints");
	assertSortedObjects(body.workItems, (entry) => entry.id, "Planning Work Items");
	assertSortedObjects(
		body.activeWorkDispositions,
		(entry) => entry.workItemId,
		"Planning active-work dispositions",
	);
	assertSortedUnique(body.safeExecutionFrontier, "Planning safe execution frontier");
	assertPlanningReferences(body);
	const expectedGraphDigest = planningWorkItemGraphDigest(body);
	if (body.globalWorkItemGraphDigest !== expectedGraphDigest) {
		throw new Error(
			`Planning Work Item graph digest mismatch: expected ${expectedGraphDigest}.`,
		);
	}
}

function assertValidStateCommitManifestBody(
	value: unknown,
): asserts value is StateCommitManifest["body"] {
	assertTypeboxSchema(
		stateCommitManifestBodySchema,
		value,
		"State commit manifest body",
	);
	const body = value as StateCommitManifest["body"];
	assertUnique(body.operationIds, "State commit operation IDs");
	assertSortedObjects(
		body.changedTraceTails,
		(entry) => entry.changeId,
		"State commit changed Trace tails",
	);
	const expectedBatchDigest = canonicalJsonDigest({
		operationIds: body.operationIds,
	});
	if (body.batchDigest !== expectedBatchDigest) {
		throw new Error(
			`State commit batch digest mismatch: expected ${expectedBatchDigest}.`,
		);
	}
	for (const tail of body.changedTraceTails) {
		if (tail.previousTail === tail.nextTail) {
			throw new Error(
				`State commit Trace ${tail.changeId} does not advance its tail.`,
			);
		}
		if (!body.operationIds.includes(tail.nextTail)) {
			throw new Error(
				`State commit Trace ${tail.changeId} next tail is absent from operationIds.`,
			);
		}
	}
}

function assertValidArchiveManifestBody(
	value: unknown,
): asserts value is ArchiveManifestBody {
	assertTypeboxSchema(
		archiveManifestBodySchema,
		value,
		"Archive manifest body",
	);
	const body = value as ArchiveManifestBody;
	body.segments.forEach((segment, index) => {
		if (segment.index !== index) {
			throw new Error(
				`Archive segment index ${segment.index} is invalid; expected ${index}.`,
			);
		}
	});
	if (body.segments[0]?.rootOperationId !== body.rootOperationId) {
		throw new Error("Archive root operation does not match first segment.");
	}
	if (body.segments.at(-1)?.tailOperationId !== body.tailOperationId) {
		throw new Error("Archive tail operation does not match final segment.");
	}
	if (body.closureOperationId !== body.tailOperationId) {
		throw new Error("Archive closure operation must be the archived tail.");
	}
	assertSortedUnique(
		body.integrationOperationIds,
		"Archive Integration operation IDs",
	);
	assertSortedUnique(body.deliveryOperationIds, "Archive delivery operation IDs");
	assertSortedUnique(body.outcomeOperationIds, "Archive outcome operation IDs");
	assertUnique(body.acceptedStateCommits, "Archive accepted state commits");
	if (body.acceptedStateCommits.at(-1) !== body.sourceStateHead) {
		throw new Error(
			"Archive sourceStateHead must be the final accepted state commit.",
		);
	}
}

function assertParentPolicy(body: ChangeOperationBody): void {
	const policy = OPERATION_DEFINITIONS[body.kind].parentPolicy;
	if (!policy) {
		throw new Error(`${body.kind} is missing its Change parent policy.`);
	}
	if (policy.kind === "root") {
		if (body.parents.length !== 0) {
			throw new Error(`${body.kind} must have no parents.`);
		}
		return;
	}
	if (policy.kind === "tail") {
		if (body.parents.length !== 1) {
			throw new Error(`${body.kind} must have exactly one parent.`);
		}
		return;
	}
	if (
		body.parents.length < policy.minimum ||
		body.parents.length > policy.maximum
	) {
		throw new Error(
			`${body.kind} must have ${policy.minimum}-${policy.maximum} parents.`,
		);
	}
	assertSortedUnique(body.parents, `${body.kind} parents`);
}

function assertPayloadIdentities(body: ChangeOperationBody): void {
	const payload = body.payload as Record<string, unknown>;
	if (assertInlinePayloadIdentity(body.kind, payload)) return;
	switch (body.kind) {
		case "change.proposed":
		case "change.revised":
			assertChangeRevisionIdentity(payload);
			return;
		case "change.relationship_recorded":
			assertRelationshipIdentity(payload);
			return;
		case "change.merge_recorded":
			assertMergeIdentity(body.changeId, payload);
			return;
		case "change.split_recorded":
			assertSplitIdentity(body.changeId, payload);
			return;
		case "change_claim.takeover_recorded":
		case "work_item_claim.takeover_recorded":
			assertAuthenticatedTakeover(body);
			return;
		default:
			return;
	}
}

function assertInlinePayloadIdentity(
	kind: ChangeOperationKind,
	payload: Record<string, unknown>,
): boolean {
	switch (kind) {
		case "decision.candidate_recorded":
		case "planning.candidate_recorded":
		case "implementation.candidate_recorded":
			assertInlineSemanticArtifact(payload, "candidate", "Candidate", "candidate");
			return true;
		case "loop.exit_policy_recorded":
			assertInlineSemanticArtifact(
				payload,
				"policy",
				"Resolved Exit Policy",
				"policy",
			);
			return true;
		case "evidence.recorded":
			assertInlineSemanticArtifact(
				payload,
				"evidence",
				"Evidence Record",
				"evidence",
			);
			return true;
		case "check.result_recorded":
			assertInlineSemanticArtifact(payload, "result", "Check Result", "result");
			return true;
		case "loop.exit_report_recorded":
			assertInlineSemanticArtifact(payload, "report", "Exit Report", "report");
			return true;
		case "runtime.route_recorded":
			assertInlineSemanticArtifact(
				payload,
				"runtimeRoute",
				"Runtime Route",
				"route",
			);
			return true;
		default:
			return false;
	}
}

const MAX_INLINE_SEMANTIC_ARTIFACT_BYTES = 262_144;

type InlineSemanticArtifactKind =
	| "candidate"
	| "policy"
	| "evidence"
	| "result"
	| "report"
	| "route";

function assertInlineSemanticArtifact(
	payload: Record<string, unknown>,
	field: string,
	label: string,
	kind: InlineSemanticArtifactKind,
): void {
	const inline = payload[field] as CanonicalInlineSemanticArtifact;
	const expectedDigest = canonicalJsonDigest(inline.artifact);
	if (inline.digest !== expectedDigest) {
		throw new Error(`${label} inline artifact digest mismatch: expected ${expectedDigest}.`);
	}
	const artifact = inline.artifact as Record<string, CanonicalJsonValue>;
	if (!Object.hasOwn(artifact, "schemaVersion")) {
		throw new Error(`${label} inline artifact must contain schemaVersion.`);
	}
	if (String(artifact.schemaVersion) !== inline.schemaVersion) {
		throw new Error(`${label} inline artifact schemaVersion mismatch.`);
	}
	assertInlineSemanticIdentity(inline, artifact, label, kind);
	const byteLength = new TextEncoder().encode(canonicalJson(inline.artifact)).byteLength;
	if (byteLength > MAX_INLINE_SEMANTIC_ARTIFACT_BYTES) {
		throw new Error(
			`${label} inline artifact exceeds ${MAX_INLINE_SEMANTIC_ARTIFACT_BYTES} bytes.`,
		);
	}
}

function assertInlineSemanticIdentity(
	inline: CanonicalInlineSemanticArtifact,
	artifact: Record<string, CanonicalJsonValue>,
	label: string,
	kind: InlineSemanticArtifactKind,
): void {
	const semanticDigest = inlineSemanticDigest(artifact, label, kind);
	const digestHex = semanticDigest.slice("sha256:".length);
	const expectedId = expectedInlineSemanticId(artifact, kind, digestHex);
	assertArtifactOwnedIdentity(artifact, label, kind, expectedId);
	const hasExpectedGenericPrefix =
		(kind !== "result" || inline.id.startsWith("check-result:")) &&
		(kind !== "route" || inline.id.startsWith("runtime-route:"));
	if (
		!hasExpectedGenericPrefix ||
		(expectedId ? inline.id !== expectedId : !inline.id.endsWith(`:${digestHex}`))
	) {
		throw new Error(`${label} inline artifact identity mismatch.`);
	}
}

function inlineSemanticDigest(
	artifact: Record<string, CanonicalJsonValue>,
	label: string,
	kind: InlineSemanticArtifactKind,
): string {
	if (kind === "evidence") {
		return canonicalJsonDigest(
			Object.fromEntries(
				Object.entries(artifact).filter(([key]) => key !== "evidenceId"),
			),
		);
	}
	const digestField = semanticDigestField(kind);
	if (!digestField || typeof artifact[digestField] !== "string") {
		throw new Error(`${label} inline artifact is missing semantic digest.`);
	}
	const semanticDigest = artifact[digestField] as string;
	const excluded = new Set([
		digestField,
		...(kind === "candidate" ? ["id"] : []),
	]);
	const body = Object.fromEntries(
		Object.entries(artifact).filter(([key]) => !excluded.has(key)),
	);
	const expected = canonicalJsonDigest(body);
	if (semanticDigest !== expected) {
		throw new Error(`${label} semantic identity mismatch: expected ${expected}.`);
	}
	return semanticDigest;
}

function expectedInlineSemanticId(
	artifact: Record<string, CanonicalJsonValue>,
	kind: InlineSemanticArtifactKind,
	digestHex: string,
): string | null {
	const loop = typeof artifact.loop === "string" ? artifact.loop : null;
	if (kind === "candidate" && loop) return `candidate:${loop}:${digestHex}`;
	if (kind === "policy" && loop) return `exit-policy:${loop}:${digestHex}`;
	if (kind === "evidence" && typeof artifact.kind === "string") {
		return `evidence:${artifact.kind}:${digestHex}`;
	}
	if (kind === "report" && loop) return `exit-report:${loop}:${digestHex}`;
	return null;
}

function assertArtifactOwnedIdentity(
	artifact: Record<string, CanonicalJsonValue>,
	label: string,
	kind: InlineSemanticArtifactKind,
	expectedId: string | null,
): void {
	if (
		(kind === "candidate" && artifact.id !== expectedId) ||
		(kind === "evidence" && artifact.evidenceId !== expectedId)
	) {
		throw new Error(`${label} artifact-owned identity mismatch.`);
	}
}

function semanticDigestField(kind: InlineSemanticArtifactKind): string | null {
	switch (kind) {
		case "candidate":
			return "digest";
		case "policy":
			return "policyDigest";
		case "result":
			return "resultDigest";
		case "report":
			return "reportDigest";
		case "route":
			return "routeDigest";
		case "evidence":
			return null;
		default:
			throw new Error(`Unsupported inline semantic artifact kind ${String(kind)}.`);
	}
}

function assertChangeRevisionIdentity(payload: Record<string, unknown>): void {
	const revision = payload.revision as ChangeRevision;
	const expected = canonicalJsonDigest(revision.content);
	if (revision.revisionId !== expected) {
		throw new Error(`Change revision identity mismatch: expected ${expected}.`);
	}
}

function assertRelationshipIdentity(payload: Record<string, unknown>): void {
	const expected = canonicalJsonDigest(payload.relationship);
	if (payload.relationshipId !== expected) {
		throw new Error(`Change relationship identity mismatch: expected ${expected}.`);
	}
}

function assertMergeIdentity(
	changeId: string,
	payload: Record<string, unknown>,
): void {
	const expected = canonicalJsonDigest({
		sources: payload.sources,
		result: payload.result,
		rationale: payload.rationale,
	});
	if (payload.mergeId !== expected) {
		throw new Error(`Change merge identity mismatch: expected ${expected}.`);
	}
	const role = payload.role;
	const sources = payload.sources as readonly {changeId: string}[];
	const result = payload.result as {changeId: string};
	const appliesToChange =
		role === "source"
			? sources.some((entry) => entry.changeId === changeId)
			: role === "result" && result.changeId === changeId;
	if (!appliesToChange) {
		throw new Error("Change merge role does not match operation changeId.");
	}
}

function assertSplitIdentity(
	changeId: string,
	payload: Record<string, unknown>,
): void {
	const expected = canonicalJsonDigest({
		source: payload.source,
		results: payload.results,
		rationale: payload.rationale,
	});
	if (payload.splitId !== expected) {
		throw new Error(`Change split identity mismatch: expected ${expected}.`);
	}
	const role = payload.role;
	const source = payload.source as {changeId: string};
	const results = payload.results as readonly {changeId: string}[];
	const appliesToChange =
		role === "source"
			? source.changeId === changeId
			: role === "result" && results.some((entry) => entry.changeId === changeId);
	if (!appliesToChange) {
		throw new Error("Change split role does not match operation changeId.");
	}
}

function assertAuthenticatedTakeover(body: ChangeOperationBody): void {
	if (!body.authorityBinding.authenticationEvidenceId) {
		throw new Error(`${body.kind} requires authentication Evidence.`);
	}
}

function assertPayloadSetOrder(body: ChangeOperationBody): void {
	const payload = body.payload as Record<string, unknown>;
	const textSetFields = new Set([
		"provenanceRefs",
		"constraints",
		"nonGoals",
		"knowledgeRefs",
		"sourceRefs",
		"evidenceRecordIds",
		"resultIds",
		"workItemIds",
		"assignmentOperationIds",
		"sourceCandidateIds",
		"conflictRefs",
	]);
	walkSetFields(payload, `$payload.${body.kind}`, textSetFields);
	if (body.kind === "change.proposed" || body.kind === "change.revised") {
		const revision = payload.revision as ChangeRevision;
		assertSortedObjects(
			revision.content.acceptanceRequirements,
			(entry) => entry.id,
			"Change acceptance requirements",
		);
	}
	if (body.kind === "change.merge_recorded") {
		assertSortedObjects(
			payload.sources as readonly {changeId: string; revisionId: string}[],
			participantKey,
			"Change merge sources",
		);
	}
	if (body.kind === "change.split_recorded") {
		assertSortedObjects(
			payload.results as readonly {changeId: string; revisionId: string}[],
			participantKey,
			"Change split results",
		);
	}
}

const PLANNING_SET_FIELDS = new Set([
	"evidenceObligationIds",
	"checkIds",
	"sourcePaths",
	"knowledgeRefs",
	"componentRefs",
	"toolIds",
	"skillIds",
	"contextRefs",
	"requiredCheckIds",
]);

type PlanningSprint = PlanningEpochBody["sprints"][number];
type PlanningWorkItem = PlanningEpochBody["workItems"][number];
type ActiveWorkDisposition = PlanningEpochBody["activeWorkDispositions"][number];

function assertPlanningReferences(body: PlanningEpochBody): void {
	const participantIds = new Set(body.participants.map((entry) => entry.changeId));
	const sprintIds = new Set(body.sprints.map((entry) => entry.id));
	const workItemIds = new Set(body.workItems.map((entry) => entry.id));
	body.sprints.forEach((sprint) =>
		assertSprintReferences(sprint, participantIds, sprintIds, workItemIds),
	);
	body.workItems.forEach((workItem) =>
		assertWorkItemReferences(workItem, participantIds, sprintIds, workItemIds),
	);
	assertAcyclic(
		body.sprints.map((entry) => [entry.id, entry.dependsOnSprintIds] as const),
		"Planning Sprint graph",
	);
	assertAcyclic(
		body.workItems.map((entry) => [entry.id, entry.dependsOnWorkItemIds] as const),
		"Planning Work Item graph",
	);
	body.safeExecutionFrontier.forEach((workItemId) =>
		assertKnownWorkItem(workItemId, workItemIds, "Planning safe execution frontier"),
	);
	body.activeWorkDispositions.forEach((entry) =>
		assertActiveWorkDisposition(entry, workItemIds),
	);
}

function assertSprintReferences(
	sprint: PlanningSprint,
	participantIds: ReadonlySet<string>,
	sprintIds: ReadonlySet<string>,
	workItemIds: ReadonlySet<string>,
): void {
	assertSortedUnique(sprint.participantChangeIds, `Sprint ${sprint.id} participants`);
	assertSortedUnique(sprint.workItemIds, `Sprint ${sprint.id} Work Items`);
	assertSortedUnique(sprint.dependsOnSprintIds, `Sprint ${sprint.id} dependencies`);
	for (const changeId of sprint.participantChangeIds) {
		if (!participantIds.has(changeId)) {
			throw new Error(`Sprint ${sprint.id} references unknown Change ${changeId}.`);
		}
	}
	for (const workItemId of sprint.workItemIds) {
		assertKnownWorkItem(workItemId, workItemIds, `Sprint ${sprint.id}`);
	}
	for (const dependency of sprint.dependsOnSprintIds) {
		if (!sprintIds.has(dependency) || dependency === sprint.id) {
			throw new Error(`Sprint ${sprint.id} has invalid dependency ${dependency}.`);
		}
	}
}

function assertWorkItemReferences(
	workItem: PlanningWorkItem,
	participantIds: ReadonlySet<string>,
	sprintIds: ReadonlySet<string>,
	workItemIds: ReadonlySet<string>,
): void {
	if (!sprintIds.has(workItem.sprintId)) {
		throw new Error(
			`Work Item ${workItem.id} references unknown Sprint ${workItem.sprintId}.`,
		);
	}
	if (!participantIds.has(workItem.owningChange.changeId)) {
		throw new Error(`Work Item ${workItem.id} owner is not a Planning participant.`);
	}
	assertSortedObjects(
		workItem.contributingChanges,
		participantKey,
		`Work Item ${workItem.id} contributing Changes`,
	);
	assertSortedUnique(
		workItem.dependsOnWorkItemIds,
		`Work Item ${workItem.id} dependencies`,
	);
	for (const dependency of workItem.dependsOnWorkItemIds) {
		if (!workItemIds.has(dependency) || dependency === workItem.id) {
			throw new Error(
				`Work Item ${workItem.id} has invalid dependency ${dependency}.`,
			);
		}
	}
	assertSortedObjects(
		workItem.acceptanceRequirements,
		(entry) => entry.id,
		`Work Item ${workItem.id} acceptance requirements`,
	);
	walkSetFields(workItem, `Work Item ${workItem.id}`, PLANNING_SET_FIELDS);
}

function assertKnownWorkItem(
	workItemId: string,
	workItemIds: ReadonlySet<string>,
	context: string,
): void {
	if (!workItemIds.has(workItemId)) {
		throw new Error(`${context} references unknown Work Item ${workItemId}.`);
	}
}

function assertActiveWorkDisposition(
	entry: ActiveWorkDisposition,
	workItemIds: ReadonlySet<string>,
): void {
	assertKnownWorkItem(entry.workItemId, workItemIds, "Active-work disposition");
	if (entry.disposition === "migrate" && !entry.replacementWorkItemId) {
		throw new Error(
			`Migration disposition for ${entry.workItemId} requires replacementWorkItemId.`,
		);
	}
	if (entry.replacementWorkItemId) {
		assertKnownWorkItem(
			entry.replacementWorkItemId,
			workItemIds,
			"Active-work disposition",
		);
	}
}

function normalizeChangeRevisionContent(
	content: ChangeRevisionContent,
): ChangeRevisionContent {
	return canonicalObject({
		...content,
		acceptanceRequirements: sortedObjects(
			content.acceptanceRequirements,
			(entry) => entry.id,
		),
		constraints: sortedUnique(content.constraints),
		nonGoals: sortedUnique(content.nonGoals),
		knowledgeRefs: sortedUnique(content.knowledgeRefs),
		sourceRefs: sortedUnique(content.sourceRefs),
	});
}

function normalizePlanningEpochInput(
	input: CreatePlanningEpochInput,
): CreatePlanningEpochInput {
	return canonicalObject({
		...input,
		participants: sortedObjects(input.participants, participantKey),
		sprints: sortedObjects(
			input.sprints.map((sprint) => ({
				...sprint,
				participantChangeIds: sortedUnique(sprint.participantChangeIds),
				workItemIds: sortedUnique(sprint.workItemIds),
				dependsOnSprintIds: sortedUnique(sprint.dependsOnSprintIds),
			})),
			(entry) => entry.id,
		),
		workItems: sortedObjects(
			input.workItems.map((workItem) => ({
				...workItem,
				contributingChanges: sortedObjects(
					workItem.contributingChanges,
					participantKey,
				),
				dependsOnWorkItemIds: sortedUnique(workItem.dependsOnWorkItemIds),
				acceptanceRequirements: sortedObjects(
					workItem.acceptanceRequirements.map((requirement) => ({
						...requirement,
						evidenceObligationIds: sortedUnique(
							requirement.evidenceObligationIds,
						),
						checkIds: sortedUnique(requirement.checkIds),
					})),
					(entry) => entry.id,
				),
				scope: {
					...workItem.scope,
					sourcePaths: sortedUnique(workItem.scope.sourcePaths),
					knowledgeRefs: sortedUnique(workItem.scope.knowledgeRefs),
					componentRefs: sortedUnique(workItem.scope.componentRefs),
				},
				workbench: {
					...workItem.workbench,
					toolIds: sortedUnique(workItem.workbench.toolIds),
					skillIds: sortedUnique(workItem.workbench.skillIds),
					contextRefs: sortedUnique(workItem.workbench.contextRefs),
				},
				integration: {
					...workItem.integration,
					requiredCheckIds: sortedUnique(
						workItem.integration.requiredCheckIds,
					),
				},
			})),
			(entry) => entry.id,
		),
		activeWorkDispositions: sortedObjects(
			input.activeWorkDispositions,
			(entry) => entry.workItemId,
		),
		safeExecutionFrontier: sortedUnique(input.safeExecutionFrontier),
	});
}

function normalizeArchiveManifestInput(
	input: CreateArchiveManifestInput,
): CreateArchiveManifestInput {
	return canonicalObject({
		...input,
		segments: [...input.segments].sort((left, right) => left.index - right.index),
		integrationOperationIds: sortedUnique(input.integrationOperationIds),
		deliveryOperationIds: sortedUnique(input.deliveryOperationIds),
		outcomeOperationIds: sortedUnique(input.outcomeOperationIds),
		acceptedStateCommits: Object.freeze([...input.acceptedStateCommits]),
	});
}

function walkSetFields(
	value: unknown,
	path: string,
	setFields: ReadonlySet<string>,
): void {
	if (Array.isArray(value)) {
		value.forEach((entry, index) => walkSetFields(entry, `${path}[${index}]`, setFields));
		return;
	}
	if (typeof value !== "object" || value === null) return;
	Object.entries(value).forEach(([key, entry]) => {
		if (setFields.has(key) && Array.isArray(entry)) {
			assertSortedUnique(entry as readonly string[], `${path}.${key}`);
		}
		walkSetFields(entry, `${path}.${key}`, setFields);
	});
}

function assertAcyclic(
	edges: readonly (readonly [string, readonly string[]])[],
	label: string,
): void {
	const dependenciesByNode = new Map(edges);
	const states = new Map<string, "active" | "done">();
	const traverse = (nodeId: string): void => {
		const state = states.get(nodeId);
		if (state === "done") return;
		if (state === "active") {
			throw new Error(`${label} contains a cycle at ${nodeId}.`);
		}
		states.set(nodeId, "active");
		(dependenciesByNode.get(nodeId) ?? []).forEach(traverse);
		states.set(nodeId, "done");
	};
	dependenciesByNode.forEach((_dependencies, nodeId) => traverse(nodeId));
}

function assertIsoTimestamp(value: string, label: string): void {
	const date = new Date(value);
	if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
		throw new Error(`${label} must be an exact UTC timestamp with milliseconds.`);
	}
}

function assertSortedUnique(values: readonly string[], label: string): void {
	for (let index = 0; index < values.length; index += 1) {
		if (index > 0 && compareText(values[index - 1] ?? "", values[index] ?? "") >= 0) {
			throw new Error(`${label} must be sorted and unique.`);
		}
	}
}

function assertUnique(values: readonly string[], label: string): void {
	if (new Set(values).size !== values.length) {
		throw new Error(`${label} must be unique.`);
	}
}

function assertSortedObjects<T>(
	values: readonly T[],
	key: (value: T) => string,
	label: string,
): void {
	assertSortedUnique(values.map(key), label);
}

function sortedUnique<T extends string>(values: readonly T[]): readonly T[] {
	return Object.freeze([...new Set(values)].sort(compareText));
}

function sortedObjects<T>(
	values: readonly T[],
	key: (value: T) => string,
): readonly T[] {
	const sorted = [...values].sort((left, right) => compareText(key(left), key(right)));
	assertSortedUnique(sorted.map(key), "Canonical object set");
	return Object.freeze(sorted);
}

function participantKey(value: {changeId: string; revisionId?: string}): string {
	return `${value.changeId}\u0000${value.revisionId ?? ""}`;
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function canonicalObject<T>(value: unknown): T {
	return toCanonicalJsonValue(value) as unknown as T;
}

export function operationPayload<K extends ChangeOperationKind>(
	operation: CanonicalChangeOperation,
	kind: K,
): ChangeOperationPayload<K> {
	if (operation.body.kind !== kind) {
		throw new Error(`Expected ${kind}, received ${operation.body.kind}.`);
	}
	return operation.body.payload as ChangeOperationPayload<K>;
}

export function candidateOperationPayload(
	operation: CanonicalChangeOperation,
): ChangeOperationPayload<"decision.candidate_recorded"> {
	if (!operation.body.kind.endsWith(".candidate_recorded")) {
		throw new Error(
			`Expected Candidate operation, received ${operation.body.kind}.`,
		);
	}
	return operation.body.payload as ChangeOperationPayload<"decision.candidate_recorded">;
}

export function sameBaseSnapshot(left: BaseSnapshot, right: BaseSnapshot): boolean {
	return canonicalJson(left) === canonicalJson(right);
}

export function sameAuthorityBinding(
	left: AuthorityBinding,
	right: AuthorityBinding,
): boolean {
	return canonicalJson(left) === canonicalJson(right);
}
