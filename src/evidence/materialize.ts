import {
	EVIDENCE_KINDS,
	evidenceMaterialEnvelopeSchema,
	evidencePayloadSchemas,
	evidenceRecordEnvelopeSchema,
	evidenceRuntimeContextSchema,
} from "./contracts.ts";
import type {
	ApprovalReceiptPayload,
	CommandExecutionPayload,
	EvidenceKind,
	EvidenceMaterial,
	EvidenceRecord,
	EvidenceRuntimeContext,
	IntegrationProofPayload,
	ModelAssessmentPayload,
	OutcomeObservationPayload,
	ResearchCitationPayload,
	ResourceUsagePayload,
	SourceObservationPayload,
	UiCapturePayload,
	WorkerReportPayload,
} from "./contracts.ts";
import { createEvidenceId, evidenceDigestFromId } from "./identity.ts";
import {
	canonicalJson,
	canonicalJsonDigest,
	toCanonicalJsonValue,
} from "../utils/canonical-json.ts";
import { assertExactKeys, assertTypeboxSchema } from "../utils/json.ts";

const MATERIAL_FIELDS = [
	"schemaVersion",
	"kind",
	"artifact",
	"provenanceRefs",
	"payload",
] as const;
const RUNTIME_FIELDS = [
	"evidenceId",
	"subject",
	"observedAt",
	"producer",
	"authority",
	"coverage",
	"freshnessBoundary",
	"sensitivity",
] as const;
const RECORD_FIELDS = [...MATERIAL_FIELDS, ...RUNTIME_FIELDS] as const;

export function materializeEvidenceRecord<TKind extends EvidenceKind>(
	material: EvidenceMaterial<TKind>,
	runtime: EvidenceRuntimeContext,
): EvidenceRecord<TKind> {
	const admittedMaterial = admittedEvidenceMaterial(material);
	const admittedRuntime = admittedRuntimeContext(runtime);
	const normalized = normalizedMaterial(admittedMaterial);
	const normalizedRuntime = normalizedRuntimeContext(admittedRuntime);
	assertEvidenceSemantics(normalized, normalizedRuntime);
	const body = canonicalObject<Omit<EvidenceRecord<TKind>, "evidenceId">>({
		...normalized,
		...normalizedRuntime,
	});
	const record = canonicalObject<EvidenceRecord<TKind>>({
		...body,
		evidenceId: createEvidenceId(normalized.kind, canonicalJsonDigest(body)),
	});
	assertValidEvidenceRecord(record);
	return record;
}

export function assertValidEvidenceRecord(
	value: unknown,
): asserts value is EvidenceRecord {
	const source = objectValue(value, "Evidence Record");
	assertExactKeys(source, RECORD_FIELDS, "Evidence Record");
	const record = canonicalObject<EvidenceRecord>(source);
	assertTypeboxSchema(evidenceRecordEnvelopeSchema, record, "Evidence Record");
	assertPayload(record.kind, record.payload);
	assertIsoTimestamp(record.observedAt, "Evidence Record observedAt");
	const material = materialFromRecord(record);
	const runtime = runtimeFromRecord(record);
	const normalized = normalizedMaterial(material);
	const normalizedRuntime = normalizedRuntimeContext(runtime);
	assertEvidenceSemantics(normalized, normalizedRuntime);
	const normalizedBody = canonicalObject<Omit<EvidenceRecord, "evidenceId">>({
		...normalized,
		...normalizedRuntime,
	});
	const actualBody = bodyFromRecord(record);
	if (canonicalJson(actualBody) !== canonicalJson(normalizedBody)) {
		throw new Error("Evidence Record is not canonically normalized.");
	}
	const expectedId = createEvidenceId(
		record.kind,
		canonicalJsonDigest(normalizedBody),
	);
	evidenceDigestFromId(record.evidenceId, record.kind);
	if (record.evidenceId !== expectedId) {
		throw new Error(
			`Evidence Record identity mismatch: expected ${expectedId}.`,
		);
	}
}

function admittedEvidenceMaterial(value: unknown): EvidenceMaterial {
	const source = objectValue(value, "Evidence material");
	const claimed = RUNTIME_FIELDS.filter((field) => Object.hasOwn(source, field));
	if (claimed.length > 0) {
		throw new Error(
			`Evidence material cannot supply runtime-owned fields: ${claimed.join(", ")}.`,
		);
	}
	assertExactKeys(source, MATERIAL_FIELDS, "Evidence material");
	const material = canonicalObject<EvidenceMaterial>(source);
	assertTypeboxSchema(
		evidenceMaterialEnvelopeSchema,
		material,
		"Evidence material",
	);
	assertPayload(material.kind, material.payload);
	return material;
}

function admittedRuntimeContext(value: unknown): EvidenceRuntimeContext {
	const source = objectValue(value, "Evidence runtime context");
	assertExactKeys(source, RUNTIME_FIELDS.slice(1), "Evidence runtime context");
	const runtime = canonicalObject<EvidenceRuntimeContext>(source);
	assertTypeboxSchema(
		evidenceRuntimeContextSchema,
		runtime,
		"Evidence runtime context",
	);
	assertIsoTimestamp(runtime.observedAt, "Evidence runtime context observedAt");
	return runtime;
}

function assertPayload(kind: EvidenceKind, payload: unknown): void {
	if (!EVIDENCE_KINDS.includes(kind)) {
		throw new Error(`Evidence kind ${String(kind)} is invalid.`);
	}
	assertTypeboxSchema(
		evidencePayloadSchemas[kind],
		payload,
		`Evidence ${kind} payload`,
	);
}

function normalizedMaterial<TKind extends EvidenceKind>(
	material: EvidenceMaterial<TKind>,
): EvidenceMaterial<TKind> {
	return canonicalObject<EvidenceMaterial<TKind>>({
		...material,
		provenanceRefs: sortedUniqueText(material.provenanceRefs, "provenance ref"),
		payload: normalizedPayload(material.kind, material.payload),
	});
}

function normalizedRuntimeContext(
	runtime: EvidenceRuntimeContext,
): EvidenceRuntimeContext {
	return canonicalObject<EvidenceRuntimeContext>({
		...runtime,
		subject: {
			...runtime.subject,
			changeRefs: sortedUniqueText(runtime.subject.changeRefs, "change ref"),
			changeRevisionDigests: sortedUniqueText(
				runtime.subject.changeRevisionDigests,
				"change revision digest",
			),
			acceptanceRequirementIds: sortedUniqueText(
				runtime.subject.acceptanceRequirementIds,
				"acceptance requirement id",
			),
		},
	});
}

function normalizedPayload<TKind extends EvidenceKind>(
	kind: TKind,
	payload: EvidenceMaterial<TKind>["payload"],
): EvidenceMaterial<TKind>["payload"] {
	const source = payload as EvidenceMaterial["payload"];
	let normalized: EvidenceMaterial["payload"] = source;
	switch (kind) {
		case "source_observation": {
			const value = source as SourceObservationPayload;
			normalized = {
				...value,
				paths: sortedUniqueText(value.paths, "source path"),
				symbols: sortedUniqueText(value.symbols, "source symbol"),
				ownershipRefs: sortedUniqueText(value.ownershipRefs, "ownership ref"),
			};
			break;
		}
		case "command_execution": {
			const value = source as CommandExecutionPayload;
			normalized = {
				...value,
				diagnosticRefs: sortedUniqueText(value.diagnosticRefs, "diagnostic ref"),
			};
			break;
		}
		case "worker_report": {
			const value = source as WorkerReportPayload;
			normalized = {
				...value,
				changedPaths: sortedUniqueText(value.changedPaths, "changed path"),
				proofRefs: sortedUniqueText(value.proofRefs, "proof ref"),
			};
			break;
		}
		case "integration_proof": {
			const value = source as IntegrationProofPayload;
			normalized = {
				...value,
				changedPaths: sortedUniqueText(value.changedPaths, "changed path"),
				verificationEvidenceIds: sortedUniqueText(
					value.verificationEvidenceIds,
					"verification evidence id",
				),
			};
			break;
		}
		case "approval_receipt": {
			const value = source as ApprovalReceiptPayload;
			normalized = {
				...value,
				captureDigests: sortedUniqueText(value.captureDigests, "capture digest"),
				...(value.securityResidualRisk
					? {
							securityResidualRisk: {
								...value.securityResidualRisk,
								assessmentEvidenceIds: sortedUniqueText(
									value.securityResidualRisk.assessmentEvidenceIds,
									"security assessment evidence id",
								),
								findingDigests: sortedUniqueText(
									value.securityResidualRisk.findingDigests,
									"security finding digest",
								),
							},
						}
					: {}),
			};
			break;
		}
		default:
			break;
	}
	return normalized as EvidenceMaterial<TKind>["payload"];
}

function assertEvidenceSemantics(
	material: EvidenceMaterial,
	runtime: EvidenceRuntimeContext,
): void {
	assertEvidenceAuthority(material.kind, runtime.authority);
	assertEvidenceSubject(material.kind, runtime.subject);
	assertKindSemantics(material, runtime);
}

function assertEvidenceAuthority(
	kind: EvidenceKind,
	authority: EvidenceRuntimeContext["authority"],
): void {
	if (kind === "approval_receipt") {
		if (authority !== "approved") {
			throw new Error("Approval receipt Evidence requires approved authority.");
		}
	} else if (authority === "approved") {
		throw new Error(`Evidence kind ${kind} cannot receive approved authority.`);
	}
}

function assertEvidenceSubject(
	kind: EvidenceKind,
	subject: EvidenceRuntimeContext["subject"],
): void {
	if (candidateBoundKind(kind) && !subject.candidateDigest) {
		throw new Error(`Evidence kind ${kind} requires subject.candidateDigest.`);
	}
	if (
		(kind === "ui_capture" || kind === "delivery_attestation") &&
		!subject.sourceTreeDigest
	) {
		throw new Error(`Evidence kind ${kind} requires subject.sourceTreeDigest.`);
	}
}

function assertKindSemantics(
	material: EvidenceMaterial,
	runtime: EvidenceRuntimeContext,
): void {
	if (material.kind === "research_citation") {
		assertResearchCitation(material.payload, runtime.producer.kind);
		return;
	}
	if (material.kind === "source_observation") {
		assertSourceObservation(material.payload);
		return;
	}
	if (material.kind === "command_execution") {
		assertCommandExecution(material.payload);
		return;
	}
	if (material.kind === "resource_usage") {
		assertResourceUsage(material.payload, runtime);
		return;
	}
	if (material.kind === "ui_capture") {
		assertUiCapture(material.payload, runtime.producer.kind);
		return;
	}
	if (material.kind === "model_assessment") {
		assertModelAssessment(material.payload, runtime.producer.kind);
		return;
	}
	if (material.kind === "worker_report") {
		assertProducerKind(runtime.producer.kind, "worker", "Worker report");
		return;
	}
	if (material.kind === "integration_proof") {
		assertIntegrationProof(material.payload);
		return;
	}
	if (material.kind === "approval_receipt") {
		assertApprovalReceipt(
			material.payload,
			runtime.producer.kind,
			runtime.observedAt,
		);
		return;
	}
	if (material.kind === "delivery_attestation") {
		assertDeliveryProducer(runtime.producer.kind);
		return;
	}
	if (material.kind === "outcome_observation") {
		assertOutcomeObservation(material.payload);
		return;
	}
	throw new Error("Evidence kind has no semantic validator.");
}

function assertResearchCitation(
	payload: ResearchCitationPayload,
	producerKind: EvidenceRuntimeContext["producer"]["kind"],
): void {
	if (producerKind !== "runtime" && producerKind !== "external_service") {
		throw new Error(
			"Research citation Evidence producer must be runtime or external_service.",
		);
	}
	assertDate(payload.publicationDate, "research publicationDate");
}

function assertSourceObservation(payload: SourceObservationPayload): void {
	if (
		payload.paths.length === 0 &&
		payload.symbols.length === 0 &&
		payload.ownershipRefs.length === 0
	) {
		throw new Error(
			"Source observation Evidence requires a path, symbol, or ownership ref.",
		);
	}
}

function assertCommandExecution(payload: CommandExecutionPayload): void {
	if (payload.termination === "exited" && payload.exitCode === undefined) {
		throw new Error("Exited command Evidence requires exitCode.");
	}
	if (payload.termination !== "exited" && payload.exitCode !== undefined) {
		throw new Error(
			`Command Evidence termination ${payload.termination} cannot include exitCode.`,
		);
	}
}

function assertUiCapture(
	payload: UiCapturePayload,
	producerKind: EvidenceRuntimeContext["producer"]["kind"],
): void {
	assertProducerKind(producerKind, "runtime", "UI capture");
	const seen = new Set<string>();
	for (const capture of payload.captures) {
		if (seen.has(capture.digest)) {
			throw new Error(`UI capture Evidence repeats artifact ${capture.digest}.`);
		}
		seen.add(capture.digest);
		if (capture.role === "screenshot" && !capture.mediaType.startsWith("image/")) {
			throw new Error("UI screenshot Evidence must use an image media type.");
		}
		if (capture.role === "video") {
			if (!capture.mediaType.startsWith("video/")) {
				throw new Error("UI video Evidence must use a video media type.");
			}
			if (!capture.durationMs) {
				throw new Error("UI video Evidence requires positive durationMs.");
			}
		}
	}
}

function assertModelAssessment(
	payload: ModelAssessmentPayload,
	producerKind: EvidenceRuntimeContext["producer"]["kind"],
): void {
	assertProducerKind(producerKind, "model", "Model assessment");
	assertMeasurement(payload.measurement, "Model assessment measurement");
}

function assertIntegrationProof(payload: IntegrationProofPayload): void {
	if (!payload.resultCommit) {
		throw new Error("Integration proof Evidence requires resultCommit.");
	}
}

function assertApprovalReceipt(
	payload: ApprovalReceiptPayload,
	producerKind: EvidenceRuntimeContext["producer"]["kind"],
	observedAt: string,
): void {
	assertIsoTimestamp(payload.decidedAt, "Approval receipt decidedAt");
	if (Date.parse(payload.decidedAt) > Date.parse(observedAt)) {
		throw new Error("Approval receipt decidedAt cannot be after observedAt.");
	}
	const scopedCheckIds: Record<ApprovalReceiptPayload["approvalScope"], string> = {
		candidate_exit: "approval_safety",
		security_residual_risk: "security_residual_risk_authorized",
		release_intent: "release_intent_authorized",
		release_safety: "release_safety_approved",
	};
	if (payload.checkId !== scopedCheckIds[payload.approvalScope]) {
		throw new Error("Approval receipt scope does not match its Check.");
	}
	if (
		payload.approvalScope === "security_residual_risk" &&
		(payload.checkId !== "security_residual_risk_authorized" ||
			!payload.securityResidualRisk)
	) {
		throw new Error(
			"Security residual-risk approval Evidence requires its exact Check and risk binding.",
		);
	}
	if (
		payload.approvalScope !== "security_residual_risk" &&
		payload.securityResidualRisk
	) {
		throw new Error(
			"Non-security approval Evidence cannot include residual-risk binding.",
		);
	}
	if (payload.channel === "git_provider") {
		assertProducerKind(producerKind, "external_service", "Git-provider approval");
		if (!payload.provider) {
			throw new Error("Git-provider approval Evidence requires provider binding.");
		}
	} else {
		assertProducerKind(producerKind, "user", "CodeWiki approval");
		if (payload.provider) {
			throw new Error("CodeWiki approval Evidence cannot include provider binding.");
		}
	}
}

function assertDeliveryProducer(
	producerKind: EvidenceRuntimeContext["producer"]["kind"],
): void {
	if (producerKind !== "runtime" && producerKind !== "external_service") {
		throw new Error(
			"Delivery attestation Evidence producer must be runtime or external_service.",
		);
	}
}

function assertOutcomeObservation(payload: OutcomeObservationPayload): void {
	assertIsoTimestamp(payload.window.startedAt, "Outcome observation window.startedAt");
	assertIsoTimestamp(payload.window.endedAt, "Outcome observation window.endedAt");
	if (Date.parse(payload.window.startedAt) > Date.parse(payload.window.endedAt)) {
		throw new Error("Outcome observation window cannot end before it starts.");
	}
	if (payload.observationType === "metric" && !payload.measurement) {
		throw new Error("Metric outcome Evidence requires measurement.");
	}
	if (payload.measurement) {
		assertMeasurement(payload.measurement, "Outcome observation measurement");
	}
}

function assertMeasurement(
	measurement: ModelAssessmentPayload["measurement"],
	label: string,
): void {
	if (measurement.kind !== "score") return;
	if (measurement.minimum >= measurement.maximum) {
		throw new Error(`${label} minimum must be lower than maximum.`);
	}
	if (
		measurement.value < measurement.minimum ||
		measurement.value > measurement.maximum
	) {
		throw new Error(`${label} value must be within its declared range.`);
	}
}

function assertResourceUsage(
	payload: ResourceUsagePayload,
	runtime: EvidenceRuntimeContext,
): void {
	if (
		runtime.producer.kind !== "runtime" &&
		runtime.producer.kind !== "external_service"
	) {
		throw new Error("Resource usage must be produced by Runtime or an external service.");
	}
	if (runtime.authority !== "observed" && runtime.authority !== "verified") {
		throw new Error("Resource usage must have observed or verified authority.");
	}
	if (runtime.coverage !== "complete") {
		throw new Error("Resource usage must cover one complete accounting window.");
	}
	if (!runtime.freshnessBoundary) {
		throw new Error("Resource usage requires an exact freshness boundary.");
	}
	const expectedUnit = {
		model_tokens: "tokens",
		cost_usd: "usd",
		latency_ms: "milliseconds",
		changed_files: "files",
		trace_bytes: "bytes",
	} as const;
	if (payload.unit !== expectedUnit[payload.metric]) {
		throw new Error("Resource usage metric and unit do not match.");
	}
	if (
		(payload.metric === "model_tokens" ||
			payload.metric === "changed_files" ||
			payload.metric === "trace_bytes") &&
		!Number.isSafeInteger(payload.value)
	) {
		throw new Error(`Resource usage ${payload.metric} value must be a safe integer.`);
	}
}

function candidateBoundKind(kind: EvidenceKind): boolean {
	return (
		kind === "resource_usage" ||
		kind === "ui_capture" ||
		kind === "model_assessment" ||
		kind === "integration_proof" ||
		kind === "approval_receipt" ||
		kind === "delivery_attestation" ||
		kind === "outcome_observation"
	);
}

function assertProducerKind(
	actual: EvidenceRuntimeContext["producer"]["kind"],
	expected: EvidenceRuntimeContext["producer"]["kind"],
	label: string,
): void {
	if (actual !== expected) {
		throw new Error(`${label} Evidence producer must be ${expected}.`);
	}
}

function assertDate(value: string | undefined, label: string): void {
	if (value === undefined) return;
	const date = new Date(`${value}T00:00:00.000Z`);
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
		throw new Error(`Evidence ${label} must be a valid ISO date.`);
	}
}

function assertIsoTimestamp(value: string, label: string): void {
	const time = new Date(value);
	if (!Number.isFinite(time.getTime()) || time.toISOString() !== value) {
		throw new Error(`${label} must be a canonical ISO timestamp.`);
	}
}

function sortedUniqueText<T extends string>(
	values: readonly T[],
	label: string,
): T[] {
	const result = values.map((value, index) => {
		if (!value.trim() || value !== value.trim()) {
			throw new Error(`Evidence ${label} ${index} must be trimmed non-empty text.`);
		}
		return value;
	});
	return [...new Set(result)].sort(compareText);
}

function materialFromRecord(record: EvidenceRecord): EvidenceMaterial {
	return canonicalObject<EvidenceMaterial>({
		schemaVersion: record.schemaVersion,
		kind: record.kind,
		...(record.artifact ? { artifact: record.artifact } : {}),
		provenanceRefs: record.provenanceRefs,
		payload: record.payload,
	});
}

function runtimeFromRecord(record: EvidenceRecord): EvidenceRuntimeContext {
	return canonicalObject<EvidenceRuntimeContext>({
		subject: record.subject,
		observedAt: record.observedAt,
		producer: record.producer,
		authority: record.authority,
		coverage: record.coverage,
		...(record.freshnessBoundary
			? { freshnessBoundary: record.freshnessBoundary }
			: {}),
		sensitivity: record.sensitivity,
	});
}

function bodyFromRecord(
	record: EvidenceRecord,
): Omit<EvidenceRecord, "evidenceId"> {
	return canonicalObject<Omit<EvidenceRecord, "evidenceId">>({
		...materialFromRecord(record),
		...runtimeFromRecord(record),
	});
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new Error(`${label} must be a plain object.`);
	}
	return value as Record<string, unknown>;
}

function canonicalObject<T>(value: unknown): T {
	return toCanonicalJsonValue(value) as unknown as T;
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
