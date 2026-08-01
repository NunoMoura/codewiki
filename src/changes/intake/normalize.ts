import {isCanonicalTraceRef} from "../../traces/refs.ts";
import {
	assertSha256Digest,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
} from "../../utils/canonical-json.ts";
import {
	CHANGE_INTAKE_CLAIMED_CATEGORIES,
	CHANGE_INTAKE_CLAIMED_CONFIDENCES,
	CHANGE_INTAKE_CLAIMED_SEVERITIES,
	CHANGE_INTAKE_MATERIAL_PROTOCOL,
	CHANGE_INTAKE_MATERIAL_TYPES,
	type ChangeIntakeClaimedCategory,
	type ChangeIntakeClaimedConfidence,
	type ChangeIntakeClaimedSeverity,
	type ChangeIntakeContent,
	type ChangeIntakeMaterial,
	type ChangeIntakeMaterialType,
	type DeliveryObservationBinding,
	type KnowledgeDriftBinding,
	type OutcomeFindingBinding,
	type PullRequestFindingBinding,
	type RegressionFindingBinding,
	type SecurityScannerFindingBinding,
	type UserSuggestionBinding,
	type WorkerDiscoveryBinding,
} from "./contracts.ts";

const TOP_LEVEL_FIELDS = [
	"protocolId",
	"protocolVersion",
	"materialType",
	"binding",
	"content",
] as const;

const CONTENT_FIELDS = [
	"summary",
	"observedBehavior",
	"desiredBehavior",
	"affectedRefs",
	"sourceRefs",
	"reproduction",
	"claimedCategory",
	"claimedSeverity",
	"claimedConfidence",
] as const;

const BINDING_FIELDS = Object.freeze({
	user_suggestion: ["channel", "submissionId"],
	pull_request_finding: [
		"providerId",
		"repositoryId",
		"pullRequestId",
		"headCommit",
		"eventId",
		"findingId",
	],
	worker_discovery: [
		"workerReportId",
		"assignmentOperationId",
		"workItemClaimOperationId",
		"baseTree",
		"resultTree",
	],
	regression_finding: [
		"runId",
		"traceOperationId",
		"baseTree",
		"resultTree",
		"findingId",
	],
	security_scanner_finding: [
		"scannerId",
		"scannerVersion",
		"runId",
		"tree",
		"findingId",
	],
	delivery_observation: [
		"observationId",
		"deliveryId",
		"changeRevisionId",
		"artifactDigest",
		"environmentId",
	],
	outcome_finding: [
		"observationId",
		"changeRevisionId",
		"subjectRef",
		"sourceEvidenceDigest",
	],
	knowledge_drift: [
		"observationId",
		"previousSnapshotDigest",
		"currentSnapshotDigest",
		"topicRefs",
	],
} satisfies Record<ChangeIntakeMaterialType, readonly string[]>);

const PROHIBITED_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const PRIVATE_DATA_PATTERNS = [
	/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/iu,
	/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/iu,
	/\b(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/iu,
	/\bgh[pousr]_[A-Za-z0-9]{20,}\b/u,
] as const;

export function normalizeChangeIntakeMaterial(
	input: unknown,
): ChangeIntakeMaterial {
	const value = canonicalInput(input);
	assertExactKeys(value, TOP_LEVEL_FIELDS, "Change intake material");
	if (value.protocolId !== CHANGE_INTAKE_MATERIAL_PROTOCOL.id) {
		throw new Error("Change intake material protocolId is invalid.");
	}
	if (value.protocolVersion !== CHANGE_INTAKE_MATERIAL_PROTOCOL.version) {
		throw new Error("Change intake material protocolVersion is invalid.");
	}
	const materialType = member(
		value.materialType,
		CHANGE_INTAKE_MATERIAL_TYPES,
		"materialType",
	);
	const binding = record(value.binding, "binding");
	assertExactKeys(
		binding,
		BINDING_FIELDS[materialType],
		`${materialType} binding`,
	);
	const content = normalizeContent(value.content);
	return material(materialType, binding, content);
}

function material(
	materialType: ChangeIntakeMaterialType,
	binding: Readonly<Record<string, CanonicalJsonValue>>,
	content: ChangeIntakeContent,
): ChangeIntakeMaterial {
	const base = {
		protocolId: CHANGE_INTAKE_MATERIAL_PROTOCOL.id,
		protocolVersion: CHANGE_INTAKE_MATERIAL_PROTOCOL.version,
		content,
	};
	switch (materialType) {
		case "user_suggestion":
			return Object.freeze({
				...base,
				materialType,
				binding: userSuggestionBinding(binding),
			});
		case "pull_request_finding":
			return Object.freeze({
				...base,
				materialType,
				binding: pullRequestFindingBinding(binding),
			});
		case "worker_discovery":
			return Object.freeze({
				...base,
				materialType,
				binding: workerDiscoveryBinding(binding),
			});
		case "regression_finding":
			return Object.freeze({
				...base,
				materialType,
				binding: regressionFindingBinding(binding),
			});
		case "security_scanner_finding":
			return Object.freeze({
				...base,
				materialType,
				binding: securityScannerFindingBinding(binding),
			});
		case "delivery_observation":
			return Object.freeze({
				...base,
				materialType,
				binding: deliveryObservationBinding(binding),
			});
		case "outcome_finding":
			return Object.freeze({
				...base,
				materialType,
				binding: outcomeFindingBinding(binding),
			});
		case "knowledge_drift":
			return Object.freeze({
				...base,
				materialType,
				binding: knowledgeDriftBinding(binding),
			});
		default:
			throw new Error("Change intake materialType is invalid.");
	}
}

function normalizeContent(value: unknown): ChangeIntakeContent {
	const content = record(value, "content");
	assertExactKeys(
		content,
		CONTENT_FIELDS,
		"Change intake content",
		["summary", "observedBehavior", "affectedRefs", "sourceRefs"],
	);
	const result: {
		summary: string;
		observedBehavior: string;
		desiredBehavior?: string;
		affectedRefs: readonly string[];
		sourceRefs: readonly string[];
		reproduction?: string;
		claimedCategory?: ChangeIntakeClaimedCategory;
		claimedSeverity?: ChangeIntakeClaimedSeverity;
		claimedConfidence?: ChangeIntakeClaimedConfidence;
	} = {
		summary: text(content.summary, "content.summary", 500),
		observedBehavior: text(
			content.observedBehavior,
			"content.observedBehavior",
			4_000,
		),
		affectedRefs: refList(
			content.affectedRefs,
			"content.affectedRefs",
			1,
			CHANGE_INTAKE_MATERIAL_PROTOCOL.maxAffectedRefs,
		),
		sourceRefs: refList(
			content.sourceRefs,
			"content.sourceRefs",
			0,
			CHANGE_INTAKE_MATERIAL_PROTOCOL.maxSourceRefs,
		),
	};
	if (content.desiredBehavior !== undefined) {
		result.desiredBehavior = text(
			content.desiredBehavior,
			"content.desiredBehavior",
			4_000,
		);
	}
	if (content.reproduction !== undefined) {
		result.reproduction = text(
			content.reproduction,
			"content.reproduction",
			4_000,
		);
	}
	if (content.claimedCategory !== undefined) {
		result.claimedCategory = member(
			content.claimedCategory,
			CHANGE_INTAKE_CLAIMED_CATEGORIES,
			"content.claimedCategory",
		);
	}
	if (content.claimedSeverity !== undefined) {
		result.claimedSeverity = member(
			content.claimedSeverity,
			CHANGE_INTAKE_CLAIMED_SEVERITIES,
			"content.claimedSeverity",
		);
	}
	if (content.claimedConfidence !== undefined) {
		result.claimedConfidence = member(
			content.claimedConfidence,
			CHANGE_INTAKE_CLAIMED_CONFIDENCES,
			"content.claimedConfidence",
		);
	}
	return Object.freeze(result);
}

function userSuggestionBinding(
	value: Readonly<Record<string, CanonicalJsonValue>>,
): UserSuggestionBinding {
	return Object.freeze({
		channel: member(value.channel, ["api", "cli", "dashboard", "pi"], "binding.channel"),
		submissionId: identifier(value.submissionId, "binding.submissionId"),
	});
}

function pullRequestFindingBinding(
	value: Readonly<Record<string, CanonicalJsonValue>>,
): PullRequestFindingBinding {
	return Object.freeze({
		providerId: identifier(value.providerId, "binding.providerId"),
		repositoryId: identifier(value.repositoryId, "binding.repositoryId"),
		pullRequestId: identifier(value.pullRequestId, "binding.pullRequestId"),
		headCommit: gitObjectId(value.headCommit, "binding.headCommit"),
		eventId: identifier(value.eventId, "binding.eventId"),
		findingId: identifier(value.findingId, "binding.findingId"),
	});
}

function workerDiscoveryBinding(
	value: Readonly<Record<string, CanonicalJsonValue>>,
): WorkerDiscoveryBinding {
	return Object.freeze({
		workerReportId: identifier(value.workerReportId, "binding.workerReportId"),
		assignmentOperationId: assertSha256Digest(
			value.assignmentOperationId,
			"binding.assignmentOperationId",
		),
		workItemClaimOperationId: assertSha256Digest(
			value.workItemClaimOperationId,
			"binding.workItemClaimOperationId",
		),
		baseTree: gitObjectId(value.baseTree, "binding.baseTree"),
		resultTree: gitObjectId(value.resultTree, "binding.resultTree"),
	});
}

function regressionFindingBinding(
	value: Readonly<Record<string, CanonicalJsonValue>>,
): RegressionFindingBinding {
	return Object.freeze({
		runId: identifier(value.runId, "binding.runId"),
		traceOperationId: assertSha256Digest(
			value.traceOperationId,
			"binding.traceOperationId",
		),
		baseTree: gitObjectId(value.baseTree, "binding.baseTree"),
		resultTree: gitObjectId(value.resultTree, "binding.resultTree"),
		findingId: identifier(value.findingId, "binding.findingId"),
	});
}

function securityScannerFindingBinding(
	value: Readonly<Record<string, CanonicalJsonValue>>,
): SecurityScannerFindingBinding {
	return Object.freeze({
		scannerId: identifier(value.scannerId, "binding.scannerId"),
		scannerVersion: identifier(value.scannerVersion, "binding.scannerVersion"),
		runId: identifier(value.runId, "binding.runId"),
		tree: gitObjectId(value.tree, "binding.tree"),
		findingId: identifier(value.findingId, "binding.findingId"),
	});
}

function deliveryObservationBinding(
	value: Readonly<Record<string, CanonicalJsonValue>>,
): DeliveryObservationBinding {
	return Object.freeze({
		observationId: identifier(value.observationId, "binding.observationId"),
		deliveryId: identifier(value.deliveryId, "binding.deliveryId"),
		changeRevisionId: assertSha256Digest(
			value.changeRevisionId,
			"binding.changeRevisionId",
		),
		artifactDigest: assertSha256Digest(
			value.artifactDigest,
			"binding.artifactDigest",
		),
		environmentId: identifier(value.environmentId, "binding.environmentId"),
	});
}

function outcomeFindingBinding(
	value: Readonly<Record<string, CanonicalJsonValue>>,
): OutcomeFindingBinding {
	return Object.freeze({
		observationId: identifier(value.observationId, "binding.observationId"),
		changeRevisionId: assertSha256Digest(
			value.changeRevisionId,
			"binding.changeRevisionId",
		),
		subjectRef: canonicalRef(value.subjectRef, "binding.subjectRef"),
		sourceEvidenceDigest: assertSha256Digest(
			value.sourceEvidenceDigest,
			"binding.sourceEvidenceDigest",
		),
	});
}

function knowledgeDriftBinding(
	value: Readonly<Record<string, CanonicalJsonValue>>,
): KnowledgeDriftBinding {
	return Object.freeze({
		observationId: identifier(value.observationId, "binding.observationId"),
		previousSnapshotDigest: assertSha256Digest(
			value.previousSnapshotDigest,
			"binding.previousSnapshotDigest",
		),
		currentSnapshotDigest: assertSha256Digest(
			value.currentSnapshotDigest,
			"binding.currentSnapshotDigest",
		),
		topicRefs: refList(
			value.topicRefs,
			"binding.topicRefs",
			1,
			CHANGE_INTAKE_MATERIAL_PROTOCOL.maxTopicRefs,
		),
	});
}

function canonicalInput(value: unknown): Readonly<Record<string, CanonicalJsonValue>> {
	let canonical: CanonicalJsonValue;
	try {
		canonical = toCanonicalJsonValue(value);
	} catch {
		throw new Error("Change intake material must be canonical JSON data.");
	}
	if (
		Buffer.byteLength(JSON.stringify(canonical), "utf8") >
		CHANGE_INTAKE_MATERIAL_PROTOCOL.maxCanonicalBytes
	) {
		throw new Error(
			`Change intake material exceeds ${CHANGE_INTAKE_MATERIAL_PROTOCOL.maxCanonicalBytes} UTF-8 bytes.`,
		);
	}
	return record(canonical, "Change intake material");
}

function record(
	value: unknown,
	field: string,
): Readonly<Record<string, CanonicalJsonValue>> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${field} must be an object.`);
	}
	return value as Readonly<Record<string, CanonicalJsonValue>>;
}

function assertExactKeys(
	value: Readonly<Record<string, unknown>>,
	allowed: readonly string[],
	label: string,
	required: readonly string[] = allowed,
): void {
	const allowedKeys = new Set(allowed);
	const unsupported = Object.keys(value)
		.filter((key) => !allowedKeys.has(key))
		.sort(compareText);
	if (unsupported.length > 0) {
		throw new Error(`${label} received unsupported field ${unsupported[0]}.`);
	}
	for (const key of required) {
		if (!Object.hasOwn(value, key)) {
			throw new Error(`${label} is missing required field ${key}.`);
		}
	}
}

function text(value: unknown, field: string, maxCodePoints: number): string {
	if (typeof value !== "string") throw new Error(`${field} must be text.`);
	const normalized = value.replace(/\r\n?/gu, "\n").normalize("NFC").trim();
	const length = [...normalized].length;
	if (length === 0 || length > maxCodePoints) {
		throw new Error(`${field} must contain 1..${maxCodePoints} Unicode code points.`);
	}
	if (PROHIBITED_CONTROLS.test(normalized)) {
		throw new Error(`${field} contains prohibited control characters.`);
	}
	if (PRIVATE_DATA_PATTERNS.some((pattern) => pattern.test(normalized))) {
		throw new Error("Change intake material contains credential-like private data.");
	}
	return normalized;
}

function identifier(value: unknown, field: string): string {
	const result = text(value, field, 160);
	if (!/^[A-Za-z0-9][A-Za-z0-9._:@/#-]*$/u.test(result)) {
		throw new Error(`${field} must be a bounded source identifier.`);
	}
	return result;
}

function gitObjectId(value: unknown, field: string): string {
	if (typeof value !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
		throw new Error(`${field} must be a lowercase Git object id.`);
	}
	return value;
}

function refList(
	value: unknown,
	field: string,
	minimum: number,
	maximum: number,
): readonly string[] {
	if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
		throw new Error(`${field} must contain ${minimum}..${maximum} refs.`);
	}
	const refs = value.map((entry, index) => canonicalRef(entry, `${field}[${index}]`));
	const unique = [...new Set(refs)].sort(compareText);
	if (unique.length !== refs.length) {
		throw new Error(`${field} must not contain duplicate refs.`);
	}
	return Object.freeze(unique);
}

function canonicalRef(value: unknown, field: string): string {
	const ref = text(value, field, 500);
	if (!isCanonicalTraceRef(ref)) {
		throw new Error(`${field} must be a canonical CodeWiki ref.`);
	}
	if (ref.startsWith("trace:intake:")) {
		throw new Error(`${field} uses a Runtime-reserved intake ref.`);
	}
	return ref;
}

function member<const T extends readonly string[]>(
	value: unknown,
	values: T,
	field: string,
): T[number] {
	if (typeof value !== "string" || !values.includes(value)) {
		throw new Error(`${field} is invalid.`);
	}
	return value as T[number];
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
