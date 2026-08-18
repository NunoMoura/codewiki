import type {EvidenceRecord} from "../../evidence/contracts.ts";
import type {KnowledgeDriftIssue} from "../../knowledge/drift-linter.ts";
import {assertValidEvidenceRecord} from "../../evidence/materialize.ts";
import {canonicalJsonDigest} from "../../utils/canonical-json.ts";
import type {ChangeIntakeContent, ChangeIntakeMaterial} from "./contracts.ts";
import {CHANGE_INTAKE_MATERIAL_PROTOCOL} from "./contracts.ts";
import {normalizeChangeIntakeMaterial} from "./normalize.ts";

export interface UserSuggestionProducerInput {
	readonly channel: "api" | "cli" | "dashboard" | "pi";
	readonly submissionId: string;
	readonly content: ChangeIntakeContent;
}

export interface PullRequestFindingProducerInput {
	readonly providerId: string;
	readonly repositoryId: string;
	readonly pullRequestId: string;
	readonly headCommit: string;
	readonly eventId: string;
	readonly findingId: string;
	readonly content: ChangeIntakeContent;
}

export interface WorkerDiscoveryProducerInput {
	readonly workerReportId: string;
	readonly assignmentOperationId: string;
	readonly workUnitClaimOperationId: string;
	readonly baseTree: string;
	readonly resultTree: string;
	readonly content: ChangeIntakeContent;
}

export interface WorkerReportDiscoveryProducerInput {
	readonly workerReportId: string;
	readonly assignmentOperationId: string;
	readonly workUnitClaimOperationId: string;
	readonly baseTree: string;
	readonly resultTree: string;
	readonly discoveries: readonly ChangeIntakeContent[];
}

export interface RegressionFindingProducerInput {
	readonly runId: string;
	readonly traceOperationId: string;
	readonly baseTree: string;
	readonly resultTree: string;
	readonly findingId: string;
	readonly content: ChangeIntakeContent;
}

export interface SecurityScannerFindingProducerInput {
	readonly scannerId: string;
	readonly scannerVersion: string;
	readonly runId: string;
	readonly tree: string;
	readonly findingId: string;
	readonly content: ChangeIntakeContent;
}

export interface DeliveryObservationProducerInput {
	readonly observationId: string;
	readonly deliveryId: string;
	readonly changeRevisionId: string;
	readonly artifactDigest: string;
	readonly environmentId: string;
	readonly content: ChangeIntakeContent;
}

export interface OutcomeFindingProducerInput {
	readonly observationId: string;
	readonly changeRevisionId: string;
	readonly subjectRef: string;
	readonly sourceEvidenceDigest: string;
	readonly content: ChangeIntakeContent;
}

export interface DeliveryEvidenceProducerInput {
	readonly evidence: EvidenceRecord<"delivery_attestation">;
	readonly changeRevisionId: string;
	readonly environmentId: string;
	readonly content: ChangeIntakeContent;
}

export interface OutcomeEvidenceProducerInput {
	readonly evidence: EvidenceRecord<"outcome_observation">;
	readonly changeRevisionId: string;
	readonly content: ChangeIntakeContent;
}

export interface KnowledgeDriftIssueProducerInput {
	readonly issue: KnowledgeDriftIssue;
	readonly observationId: string;
	readonly previousSnapshotDigest: string;
	readonly currentSnapshotDigest: string;
	readonly topicRefs: readonly string[];
	readonly sourceRef: string;
}

export interface KnowledgeDriftProducerInput {
	readonly observationId: string;
	readonly previousSnapshotDigest: string;
	readonly currentSnapshotDigest: string;
	readonly topicRefs: readonly string[];
	readonly content: ChangeIntakeContent;
}

export function createUserSuggestionMaterial(
	input: UserSuggestionProducerInput,
): ChangeIntakeMaterial {
	assertProducerInput(
		input,
		["channel", "submissionId", "content"],
		"User suggestion producer",
	);
	return produce("user_suggestion", {
		channel: input.channel,
		submissionId: input.submissionId,
	}, input.content);
}

export function createPullRequestFindingMaterial(
	input: PullRequestFindingProducerInput,
): ChangeIntakeMaterial {
	assertProducerInput(
		input,
		[
			"providerId",
			"repositoryId",
			"pullRequestId",
			"headCommit",
			"eventId",
			"findingId",
			"content",
		],
		"Pull-request finding producer",
	);
	return produce("pull_request_finding", {
		providerId: input.providerId,
		repositoryId: input.repositoryId,
		pullRequestId: input.pullRequestId,
		headCommit: input.headCommit,
		eventId: input.eventId,
		findingId: input.findingId,
	}, input.content);
}

export function createWorkerDiscoveryMaterial(
	input: WorkerDiscoveryProducerInput,
): ChangeIntakeMaterial {
	assertProducerInput(
		input,
		[
			"workerReportId",
			"assignmentOperationId",
			"workUnitClaimOperationId",
			"baseTree",
			"resultTree",
			"content",
		],
		"Worker discovery producer",
	);
	return produce("worker_discovery", {
		workerReportId: input.workerReportId,
		assignmentOperationId: input.assignmentOperationId,
		workUnitClaimOperationId: input.workUnitClaimOperationId,
		baseTree: input.baseTree,
		resultTree: input.resultTree,
	}, input.content);
}

export function createWorkerReportDiscoveryMaterials(
	input: WorkerReportDiscoveryProducerInput,
): readonly ChangeIntakeMaterial[] {
	assertProducerInput(
		input,
		[
			"workerReportId",
			"assignmentOperationId",
			"workUnitClaimOperationId",
			"baseTree",
			"resultTree",
			"discoveries",
		],
		"Worker Report discovery producer",
	);
	if (!Array.isArray(input.discoveries) || input.discoveries.length > 16) {
		throw new Error("Worker Report may contain at most 16 discoveries.");
	}
	return Object.freeze(
		input.discoveries.map((content) =>
			createWorkerDiscoveryMaterial({
				workerReportId: input.workerReportId,
				assignmentOperationId: input.assignmentOperationId,
				workUnitClaimOperationId: input.workUnitClaimOperationId,
				baseTree: input.baseTree,
				resultTree: input.resultTree,
				content,
			}),
		),
	);
}

export function createRegressionFindingMaterial(
	input: RegressionFindingProducerInput,
): ChangeIntakeMaterial {
	assertProducerInput(
		input,
		[
			"runId",
			"traceOperationId",
			"baseTree",
			"resultTree",
			"findingId",
			"content",
		],
		"Regression finding producer",
	);
	return produce("regression_finding", {
		runId: input.runId,
		traceOperationId: input.traceOperationId,
		baseTree: input.baseTree,
		resultTree: input.resultTree,
		findingId: input.findingId,
	}, input.content);
}

export function createSecurityScannerFindingMaterial(
	input: SecurityScannerFindingProducerInput,
): ChangeIntakeMaterial {
	assertProducerInput(
		input,
		[
			"scannerId",
			"scannerVersion",
			"runId",
			"tree",
			"findingId",
			"content",
		],
		"Security scanner finding producer",
	);
	return produce("security_scanner_finding", {
		scannerId: input.scannerId,
		scannerVersion: input.scannerVersion,
		runId: input.runId,
		tree: input.tree,
		findingId: input.findingId,
	}, input.content);
}

export function createDeliveryObservationMaterial(
	input: DeliveryObservationProducerInput,
): ChangeIntakeMaterial {
	assertProducerInput(
		input,
		[
			"observationId",
			"deliveryId",
			"changeRevisionId",
			"artifactDigest",
			"environmentId",
			"content",
		],
		"Delivery observation producer",
	);
	return produce("delivery_observation", {
		observationId: input.observationId,
		deliveryId: input.deliveryId,
		changeRevisionId: input.changeRevisionId,
		artifactDigest: input.artifactDigest,
		environmentId: input.environmentId,
	}, input.content);
}

export function createDeliveryObservationMaterialFromEvidence(
	input: DeliveryEvidenceProducerInput,
): ChangeIntakeMaterial {
	assertProducerInput(
		input,
		["evidence", "changeRevisionId", "environmentId", "content"],
		"Delivery Evidence producer",
	);
	assertValidEvidenceRecord(input.evidence);
	if (input.evidence.kind !== "delivery_attestation") {
		throw new Error("Delivery Evidence producer requires delivery_attestation Evidence.");
	}
	return createDeliveryObservationMaterial({
		observationId: input.evidence.evidenceId,
		deliveryId: input.evidence.payload.operationId,
		changeRevisionId: input.changeRevisionId,
		artifactDigest:
			input.evidence.payload.artifactDigest ??
			input.evidence.payload.remoteStateDigest,
		environmentId: input.environmentId,
		content: input.content,
	});
}

export function createOutcomeFindingMaterial(
	input: OutcomeFindingProducerInput,
): ChangeIntakeMaterial {
	assertProducerInput(
		input,
		[
			"observationId",
			"changeRevisionId",
			"subjectRef",
			"sourceEvidenceDigest",
			"content",
		],
		"Outcome finding producer",
	);
	return produce("outcome_finding", {
		observationId: input.observationId,
		changeRevisionId: input.changeRevisionId,
		subjectRef: input.subjectRef,
		sourceEvidenceDigest: input.sourceEvidenceDigest,
	}, input.content);
}

export function createOutcomeFindingMaterialFromEvidence(
	input: OutcomeEvidenceProducerInput,
): ChangeIntakeMaterial {
	assertProducerInput(
		input,
		["evidence", "changeRevisionId", "content"],
		"Outcome Evidence producer",
	);
	assertValidEvidenceRecord(input.evidence);
	if (input.evidence.kind !== "outcome_observation") {
		throw new Error("Outcome Evidence producer requires outcome_observation Evidence.");
	}
	return createOutcomeFindingMaterial({
		observationId: input.evidence.payload.outcomeId,
		changeRevisionId: input.changeRevisionId,
		subjectRef: input.evidence.payload.sourceRef,
		sourceEvidenceDigest: canonicalJsonDigest(input.evidence),
		content: input.content,
	});
}

export function createKnowledgeDriftMaterial(
	input: KnowledgeDriftProducerInput,
): ChangeIntakeMaterial {
	assertProducerInput(
		input,
		[
			"observationId",
			"previousSnapshotDigest",
			"currentSnapshotDigest",
			"topicRefs",
			"content",
		],
		"Knowledge-drift producer",
	);
	return produce("knowledge_drift", {
		observationId: input.observationId,
		previousSnapshotDigest: input.previousSnapshotDigest,
		currentSnapshotDigest: input.currentSnapshotDigest,
		topicRefs: [...input.topicRefs],
	}, input.content);
}

export function createKnowledgeDriftMaterialFromIssue(
	input: KnowledgeDriftIssueProducerInput,
): ChangeIntakeMaterial {
	assertProducerInput(
		input,
		[
			"issue",
			"observationId",
			"previousSnapshotDigest",
			"currentSnapshotDigest",
			"topicRefs",
			"sourceRef",
		],
		"Knowledge-drift issue producer",
	);
	return createKnowledgeDriftMaterial({
		observationId: input.observationId,
		previousSnapshotDigest: input.previousSnapshotDigest,
		currentSnapshotDigest: input.currentSnapshotDigest,
		topicRefs: input.topicRefs,
		content: {
			summary: input.issue.message,
			observedBehavior: `Knowledge drift rule ${input.issue.ruleId} matched ${JSON.stringify(input.issue.match)}.`,
			desiredBehavior: `Update ${input.issue.path} to match current project contracts.`,
			affectedRefs: [input.issue.path],
			sourceRefs: [input.sourceRef],
			claimedCategory: "knowledge",
			claimedSeverity: "informational",
			claimedConfidence: "high",
		},
	});
}

function produce(
	materialType: ChangeIntakeMaterial["materialType"],
	binding: object,
	content: ChangeIntakeContent,
): ChangeIntakeMaterial {
	return normalizeChangeIntakeMaterial({
		protocolId: CHANGE_INTAKE_MATERIAL_PROTOCOL.id,
		protocolVersion: CHANGE_INTAKE_MATERIAL_PROTOCOL.version,
		materialType,
		binding,
		content,
	});
}

function assertProducerInput(
	value: object,
	allowed: readonly string[],
	label: string,
): void {
	const allowedSet = new Set(allowed);
	const unsupported = Object.keys(value)
		.filter((key) => !allowedSet.has(key))
		.sort(compareText);
	if (unsupported.length > 0) {
		throw new Error(`${label} received unsupported field ${unsupported[0]}.`);
	}
	for (const key of allowed) {
		if (!Object.hasOwn(value, key)) {
			throw new Error(`${label} is missing required field ${key}.`);
		}
	}
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
