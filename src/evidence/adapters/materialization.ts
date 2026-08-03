import type {
	EvidenceArtifact,
	EvidenceAuthority,
	EvidenceCoverage,
	EvidenceMaterial,
	EvidenceRecord,
	EvidenceSubject,
} from "../contracts.ts";
import {materializeEvidenceRecord, assertValidEvidenceRecord} from "../materialize.ts";
import {
	reduceEvidenceObligation,
	type EvidenceObligation,
} from "../obligations.ts";
import type {EvidenceObligationResolution} from "../obligation-resolution.ts";
import {SARIF_EVIDENCE_ADAPTER_PROTOCOL} from "./sarif.ts";
import {JUNIT_EVIDENCE_ADAPTER_PROTOCOL} from "./junit.ts";
import {
	COBERTURA_EVIDENCE_ADAPTER_PROTOCOL,
	LCOV_EVIDENCE_ADAPTER_PROTOCOL,
} from "./coverage.ts";
import {CYCLONEDX_EVIDENCE_ADAPTER_PROTOCOL} from "./cyclonedx.ts";
import {SPDX_EVIDENCE_ADAPTER_PROTOCOL} from "./spdx.ts";
import {PACT_EVIDENCE_ADAPTER_PROTOCOL} from "./pact.ts";
import {OPENAPI_EVIDENCE_ADAPTER_PROTOCOL} from "./openapi.ts";
import {PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL} from "./provider-check-receipt.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";

export const STANDARD_ADAPTER_MATERIALIZATION_PROTOCOL = Object.freeze({
	id: "codewiki.evidence-adapter.materialization",
	version: "1.0.0",
} as const);

export interface EvidenceAdapterProtocolIdentity {
	readonly id: string;
	readonly version: string;
}

export interface StandardAdapterIngestionResult {
	readonly protocol: EvidenceAdapterProtocolIdentity;
	readonly artifact: EvidenceArtifact;
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly authorityCeiling: "observed" | "verified";
	readonly grantsResult: false;
	readonly coverage: EvidenceCoverage;
	readonly bindingDigest: Sha256Digest;
	readonly commandExecution: EvidenceMaterial<"command_execution">;
	readonly sourceObservation?: EvidenceMaterial<"source_observation">;
	readonly receiptDigest: Sha256Digest;
}

export interface StandardAdapterEvidenceBundle {
	readonly protocol: typeof STANDARD_ADAPTER_MATERIALIZATION_PROTOCOL;
	readonly adapterProtocol: EvidenceAdapterProtocolIdentity;
	readonly adapterReceiptDigest: Sha256Digest;
	readonly adapterBindingDigest: Sha256Digest;
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly authority: EvidenceAuthority;
	readonly coverage: EvidenceCoverage;
	readonly grantsResult: false;
	readonly evidenceRecords: readonly EvidenceRecord[];
	readonly evidenceRecordIds: readonly string[];
	readonly bundleDigest: Sha256Digest;
}

interface MaterializeStandardAdapterEvidenceInput {
	readonly ingestion: StandardAdapterIngestionResult;
	readonly subject: EvidenceSubject;
	readonly observedAt: string;
}

interface ResolveStandardAdapterEvidenceObligationInput {
	readonly obligation: EvidenceObligation;
	readonly bundles: readonly StandardAdapterEvidenceBundle[];
	readonly acceptedProtocols: readonly EvidenceAdapterProtocolIdentity[];
	readonly expectedSubject: EvidenceSubject;
	readonly availableArtifactDigests?: readonly Sha256Digest[];
}

const SUPPORTED_PROTOCOLS = Object.freeze([
	SARIF_EVIDENCE_ADAPTER_PROTOCOL,
	JUNIT_EVIDENCE_ADAPTER_PROTOCOL,
	LCOV_EVIDENCE_ADAPTER_PROTOCOL,
	COBERTURA_EVIDENCE_ADAPTER_PROTOCOL,
	CYCLONEDX_EVIDENCE_ADAPTER_PROTOCOL,
	SPDX_EVIDENCE_ADAPTER_PROTOCOL,
	PACT_EVIDENCE_ADAPTER_PROTOCOL,
	OPENAPI_EVIDENCE_ADAPTER_PROTOCOL,
	PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL,
] as const);

const SUPPORTED_PROTOCOL_KEYS = new Set(SUPPORTED_PROTOCOLS.map(protocolKey));
const PROVIDER_PROTOCOL_KEY = protocolKey(
	PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL,
);

export function materializeStandardAdapterEvidence(
	input: MaterializeStandardAdapterEvidenceInput,
): StandardAdapterEvidenceBundle {
	assertExactKeys(
		input,
		["ingestion", "subject", "observedAt"],
		"Standard adapter Evidence materialization input",
	);
	const ingestion = admittedIngestion(input.ingestion);
	if (!input.subject.sourceTreeDigest) {
		throw new Error(
			"Standard adapter Evidence subject requires sourceTreeDigest.",
		);
	}
	if (input.subject.sourceTreeDigest !== ingestion.sourceSnapshotDigest) {
		throw new Error(
			"Standard adapter Evidence source snapshot does not match the Runtime subject.",
		);
	}
	const protocolRef = adapterProtocolRef(ingestion.protocol);
	const receiptRef = `evidence-adapter-receipt:${ingestion.receiptDigest}`;
	const bindingRef = `evidence-adapter-binding:${ingestion.bindingDigest}`;
	const materials = [
		ingestion.commandExecution,
		...(ingestion.sourceObservation ? [ingestion.sourceObservation] : []),
	];
	const runtime = {
		subject: input.subject,
		observedAt: input.observedAt,
		producer: {
			kind:
				protocolKey(ingestion.protocol) === PROVIDER_PROTOCOL_KEY
					? ("external_service" as const)
					: ("runtime" as const),
			id: ingestion.protocol.id,
			version: ingestion.protocol.version,
		},
		authority: ingestion.authorityCeiling,
		coverage: ingestion.coverage,
		freshnessBoundary: ingestion.sourceSnapshotDigest,
		sensitivity: "project" as const,
	};
	const evidenceRecords = materials.map((material) => {
		assertMaterialBinding(material, ingestion);
		return materializeEvidenceRecord(
			{
				...material,
				provenanceRefs: sortedUnique([
					...material.provenanceRefs,
					protocolRef,
					receiptRef,
					bindingRef,
				]),
			},
			runtime,
		);
	});
	const body = toCanonicalJsonValue({
		protocol: STANDARD_ADAPTER_MATERIALIZATION_PROTOCOL,
		adapterProtocol: ingestion.protocol,
		adapterReceiptDigest: ingestion.receiptDigest,
		adapterBindingDigest: ingestion.bindingDigest,
		sourceSnapshotDigest: ingestion.sourceSnapshotDigest,
		authority: ingestion.authorityCeiling,
		coverage: ingestion.coverage,
		grantsResult: false,
		evidenceRecords,
		evidenceRecordIds: evidenceRecords.map((record) => record.evidenceId),
	}) as unknown as Omit<StandardAdapterEvidenceBundle, "bundleDigest">;
	return Object.freeze({
		...body,
		bundleDigest: canonicalJsonDigest(body),
	});
}

export function resolveStandardAdapterEvidenceObligation(
	input: ResolveStandardAdapterEvidenceObligationInput,
): EvidenceObligationResolution {
	assertExactKeys(
		input,
		[
			"obligation",
			"bundles",
			"acceptedProtocols",
			"expectedSubject",
			"availableArtifactDigests",
		],
		"Standard adapter Evidence obligation input",
	);
	const acceptedProtocolKeys = admittedAcceptedProtocols(input.acceptedProtocols);
	const bundles = input.bundles.map(admittedBundle);
	return reduceEvidenceObligation({
		obligation: input.obligation,
		evidence: bundles.flatMap((bundle) => {
			const relation = acceptedProtocolKeys.has(
				protocolKey(bundle.adapterProtocol),
			)
				? ("supporting" as const)
				: ("neutral" as const);
			return bundle.evidenceRecords.map((evidence) => ({evidence, relation}));
		}),
		expectedSubject: input.expectedSubject,
		expectedFreshnessBoundary: input.expectedSubject.sourceTreeDigest,
		availableArtifactDigests: input.availableArtifactDigests,
	});
}

export function adapterProtocolRef(
	protocol: EvidenceAdapterProtocolIdentity,
): string {
	admittedProtocol(protocol, "Evidence adapter protocol");
	return `evidence-adapter-protocol:${protocol.id}@${protocol.version}`;
}

function admittedIngestion(
	value: StandardAdapterIngestionResult,
): StandardAdapterIngestionResult {
	const protocol = admittedProtocol(value.protocol, "Standard adapter protocol");
	if (!SUPPORTED_PROTOCOL_KEYS.has(protocolKey(protocol))) {
		throw new Error(
			`Standard adapter protocol ${protocol.id}@${protocol.version} is unsupported.`,
		);
	}
	assertSha256Digest(value.sourceSnapshotDigest, "Standard adapter source snapshot");
	assertSha256Digest(value.bindingDigest, "Standard adapter binding");
	assertSha256Digest(value.receiptDigest, "Standard adapter receipt");
	if (value.grantsResult !== false) {
		throw new Error("Standard adapter Evidence cannot grant a Result.");
	}
	const expectedAuthority =
		protocolKey(protocol) === PROVIDER_PROTOCOL_KEY ? "verified" : "observed";
	if (value.authorityCeiling !== expectedAuthority) {
		throw new Error(
			`Standard adapter Evidence authority ceiling must be ${expectedAuthority}.`,
		);
	}
	if (
		value.coverage !== "complete" &&
		value.coverage !== "partial" &&
		value.coverage !== "unknown"
	) {
		throw new Error("Standard adapter Evidence coverage is invalid.");
	}
	const object = value as unknown as Readonly<Record<string, unknown>>;
	const {receiptDigest: _receiptDigest, ...body} = object;
	if (canonicalJsonDigest(body) !== value.receiptDigest) {
		throw new Error("Standard adapter Evidence receipt digest does not match its body.");
	}
	return value;
}

function admittedBundle(
	value: StandardAdapterEvidenceBundle,
): StandardAdapterEvidenceBundle {
	if (
		value.protocol.id !== STANDARD_ADAPTER_MATERIALIZATION_PROTOCOL.id ||
		value.protocol.version !== STANDARD_ADAPTER_MATERIALIZATION_PROTOCOL.version
	) {
		throw new Error("Standard adapter Evidence bundle protocol is unsupported.");
	}
	if (value.grantsResult !== false) {
		throw new Error("Standard adapter Evidence bundle cannot grant a Result.");
	}
	admittedProtocol(value.adapterProtocol, "Standard adapter Evidence bundle protocol");
	assertSha256Digest(value.adapterReceiptDigest, "Standard adapter bundle receipt");
	assertSha256Digest(value.adapterBindingDigest, "Standard adapter bundle binding");
	assertSha256Digest(value.sourceSnapshotDigest, "Standard adapter bundle source snapshot");
	assertSha256Digest(value.bundleDigest, "Standard adapter Evidence bundle");
	for (const record of value.evidenceRecords) assertValidEvidenceRecord(record);
	if (value.evidenceRecordIds.length !== value.evidenceRecords.length) {
		throw new Error("Standard adapter Evidence bundle record identities do not match.");
	}
	for (let ordinal = 0; ordinal < value.evidenceRecordIds.length; ordinal += 1) {
		if (value.evidenceRecordIds[ordinal] !== value.evidenceRecords[ordinal]?.evidenceId) {
			throw new Error("Standard adapter Evidence bundle record identities do not match.");
		}
	}
	const {bundleDigest: _bundleDigest, ...body} = value;
	if (canonicalJsonDigest(body) !== value.bundleDigest) {
		throw new Error("Standard adapter Evidence bundle digest does not match its body.");
	}
	return value;
}

function admittedAcceptedProtocols(
	values: readonly EvidenceAdapterProtocolIdentity[],
): ReadonlySet<string> {
	if (!Array.isArray(values) || values.length < 1 || values.length > 9) {
		throw new Error("Standard adapter Evidence requires 1..9 accepted protocols.");
	}
	const keys: string[] = [];
	for (const [ordinal, candidate] of values.entries()) {
		const protocol = admittedProtocol(
			candidate,
			`Standard adapter accepted protocol ${ordinal}`,
		);
		const key = protocolKey(protocol);
		if (!SUPPORTED_PROTOCOL_KEYS.has(key)) {
			throw new Error(
				`Standard adapter accepted protocol ${protocol.id}@${protocol.version} is unsupported.`,
			);
		}
		keys.push(key);
	}
	if (new Set(keys).size !== keys.length) {
		throw new Error("Standard adapter accepted protocols contain duplicates.");
	}
	return new Set(keys);
}

function admittedProtocol(
	...args: [EvidenceAdapterProtocolIdentity, string]
): EvidenceAdapterProtocolIdentity {
	const [value, label] = args;
	assertExactKeys(value, ["id", "version"], label);
	if (!/^[A-Za-z][A-Za-z0-9._/-]{0,255}$/.test(value.id)) {
		throw new Error(`${label} id is invalid.`);
	}
	if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(value.version)) {
		throw new Error(`${label} version is invalid.`);
	}
	return value;
}

function assertMaterialBinding(
	...args: [EvidenceMaterial, StandardAdapterIngestionResult]
): void {
	const [material, ingestion] = args;
	if (
		material.kind !== "command_execution" &&
		material.kind !== "source_observation"
	) {
		throw new Error("Standard adapter emitted unsupported Evidence material.");
	}
	if (canonicalJsonDigest(material.artifact) !== canonicalJsonDigest(ingestion.artifact)) {
		throw new Error("Standard adapter Evidence material artifact does not match its receipt.");
	}
	if (
		material.kind === "source_observation" &&
		material.payload.snapshotDigest !== ingestion.sourceSnapshotDigest
	) {
		throw new Error(
			"Standard adapter source observation does not match its source snapshot.",
		);
	}
}

function protocolKey(...args: [EvidenceAdapterProtocolIdentity]): string {
	const [protocol] = args;
	return `${protocol.id}@${protocol.version}`;
}

function sortedUnique(values: readonly string[]): readonly string[] {
	return [...new Set(values)].sort(compareText);
}

function compareText(...args: [string, string]): number {
	const [left, right] = args;
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
