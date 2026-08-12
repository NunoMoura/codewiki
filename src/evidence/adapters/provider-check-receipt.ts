import type {
	EvidenceArtifact,
	EvidenceCoverage,
	EvidenceMaterial,
} from "../contracts.ts";
import {
	canonicalJsonDigest,
	parseCanonicalJson,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import * as adapterShared from "./shared.ts";

const {
	admitAdapterArtifact,
	admitStandardAdapterExecution,
	assertOnlyKeys,
	boundedText,
	buildCommandExecutionMaterial,
	digestValue: digest,
	enumValue,
	integerValue,
	normalizedRefList,
	objectValue: object,
	safeOpaqueRef: safeRef,
	sortedUnique,
} = adapterShared;

export const PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL = Object.freeze({
	id: "codewiki.evidence-adapter.provider-check-receipt",
	version: "2.0.0",
} as const);

const MAX_RECEIPT_BYTES = 64 * 1024;
const MAX_PROVENANCE_REFS = 240;
const MAX_PROVIDER_COUNT = 1_000_000;
const RECEIPT_MEDIA_TYPE =
	"application/vnd.codewiki.provider-check-receipt+json";
const RECEIPT_KEYS = [
	"protocolId",
	"protocolVersion",
	"providerId",
	"providerInstanceDigest",
	"repositoryIdDigest",
	"sourceSnapshotDigest",
	"headCommit",
	"checkIdentityDigest",
	"checkConfigurationDigest",
	"authenticationDigest",
	"adapterId",
	"adapterVersion",
	"requestDigest",
	"executionDigest",
	"providerCheckIdDigest",
	"providerCheckSuiteIdDigest",
	"providerPayloadDigest",
	"attempt",
	"state",
	"conclusion",
	"startedAt",
	"completedAt",
	"outputDigest",
	"annotationCount",
] as const;

export type ProviderCheckAuthenticationMethod =
	| "authenticated_api"
	| "verified_webhook";

export type ProviderCheckState =
	| "queued"
	| "in_progress"
	| "completed"
	| "unavailable";

export type ProviderCheckConclusion =
	| "success"
	| "failure"
	| "neutral"
	| "cancelled"
	| "timed_out"
	| "action_required"
	| "skipped"
	| "stale"
	| "startup_failure"
	| "unknown";

export interface ProviderCheckIdentity {
	readonly providerId: string;
	readonly providerInstanceDigest: Sha256Digest;
}

export interface ProviderCheckAuthenticationBinding {
	readonly method: ProviderCheckAuthenticationMethod;
	readonly authenticatedIdentityDigest: Sha256Digest;
	readonly credentialBindingDigest: Sha256Digest;
}

export type ProviderCheckReceiptExecutionBinding =
	adapterShared.StandardAdapterExecutionBinding;

export interface ProviderCheckReceiptEvidenceIngestionInput {
	readonly artifact: {
		readonly bytes: string | Uint8Array;
		readonly ref: string;
	};
	readonly provider: ProviderCheckIdentity;
	readonly repositoryIdDigest: Sha256Digest;
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly headCommit: string;
	readonly checkIdentityDigest: Sha256Digest;
	readonly checkConfigurationDigest: Sha256Digest;
	readonly authentication: ProviderCheckAuthenticationBinding;
	readonly execution: ProviderCheckReceiptExecutionBinding;
	readonly provenanceRefs?: readonly string[];
}

export interface ProviderCheckReceiptSummary {
	readonly providerCheckIdDigest?: Sha256Digest;
	readonly providerCheckSuiteIdDigest?: Sha256Digest;
	readonly providerPayloadDigest?: Sha256Digest;
	readonly attempt?: number;
	readonly state: ProviderCheckState;
	readonly conclusion?: ProviderCheckConclusion;
	readonly startedAt?: string;
	readonly completedAt?: string;
	readonly providerDurationMs?: number;
	readonly outputDigest?: Sha256Digest;
	readonly annotationCount?: number;
}

export interface ProviderCheckReceiptEvidenceIngestionResult {
	readonly protocol: typeof PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL;
	readonly artifact: EvidenceArtifact;
	readonly provider: ProviderCheckIdentity;
	readonly repositoryIdDigest: Sha256Digest;
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly headCommit: string;
	readonly checkIdentityDigest: Sha256Digest;
	readonly checkConfigurationDigest: Sha256Digest;
	readonly authenticationDigest: Sha256Digest;
	readonly authorityCeiling: "verified";
	readonly grantsResult: false;
	readonly coverage: EvidenceCoverage;
	readonly summary: ProviderCheckReceiptSummary;
	readonly bindingDigest: Sha256Digest;
	readonly commandExecution: EvidenceMaterial<"command_execution">;
	readonly receiptDigest: Sha256Digest;
}

interface ParsedProviderCheckReceipt extends ProviderCheckReceiptSummary {
	readonly protocolId: string;
	readonly protocolVersion: string;
	readonly providerId: string;
	readonly providerInstanceDigest: Sha256Digest;
	readonly repositoryIdDigest: Sha256Digest;
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly headCommit: string;
	readonly checkIdentityDigest: Sha256Digest;
	readonly checkConfigurationDigest: Sha256Digest;
	readonly authenticationDigest: Sha256Digest;
	readonly adapterId: string;
	readonly adapterVersion: string;
	readonly requestDigest: Sha256Digest;
	readonly executionDigest: Sha256Digest;
}

interface AdmittedProviderCheckInput {
	readonly artifact: ProviderCheckReceiptEvidenceIngestionInput["artifact"];
	readonly provider: ProviderCheckIdentity;
	readonly repositoryIdDigest: Sha256Digest;
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly headCommit: string;
	readonly checkIdentityDigest: Sha256Digest;
	readonly checkConfigurationDigest: Sha256Digest;
	readonly authentication: ProviderCheckAuthenticationBinding;
	readonly execution: ProviderCheckReceiptExecutionBinding;
	readonly provenanceRefs: readonly string[];
}

export function ingestProviderCheckReceiptEvidence(
	input: ProviderCheckReceiptEvidenceIngestionInput,
): ProviderCheckReceiptEvidenceIngestionResult {
	const admitted = admittedInput(input);
	const {artifactBytes, artifact} = admitAdapterArtifact(admitted.artifact, {
		label: "Provider Check receipt",
		maximumBytes: MAX_RECEIPT_BYTES,
		mediaType: RECEIPT_MEDIA_TYPE,
	});
	const receipt = parseProviderCheckReceipt(artifactBytes);
	const authenticationDigest = canonicalJsonDigest(admitted.authentication);
	assertReceiptBinding(receipt, admitted, authenticationDigest);
	assertReceiptState(receipt, admitted.execution);
	const coverage = receiptCoverage(receipt, admitted.execution);
	const summary = receiptSummary(receipt);
	const bindingDigest = canonicalJsonDigest({
		provider: admitted.provider,
		repositoryIdDigest: admitted.repositoryIdDigest,
		sourceSnapshotDigest: admitted.sourceSnapshotDigest,
		headCommit: admitted.headCommit,
		checkIdentityDigest: admitted.checkIdentityDigest,
		checkConfigurationDigest: admitted.checkConfigurationDigest,
		authentication: admitted.authentication,
		execution: admitted.execution,
	});
	const provenanceRefs = sortedUnique([
		...admitted.provenanceRefs,
		`provider-check-artifact:${artifact.digest}`,
		`provider-check-binding:${bindingDigest}`,
		`provider-check-provider:${admitted.provider.providerId}`,
		`provider-check-instance:${admitted.provider.providerInstanceDigest}`,
		`provider-check-repository:${admitted.repositoryIdDigest}`,
		`provider-check-source-snapshot:${admitted.sourceSnapshotDigest}`,
		`provider-check-head:${admitted.headCommit}`,
		`provider-check-identity:${admitted.checkIdentityDigest}`,
		`provider-check-configuration:${admitted.checkConfigurationDigest}`,
		`provider-check-authentication:${authenticationDigest}`,
		`provider-check-request:${admitted.execution.requestDigest}`,
		...(receipt.providerPayloadDigest
			? [`provider-check-payload:${receipt.providerPayloadDigest}`]
			: []),
	]);
	const commandExecution = buildCommandExecutionMaterial({
		artifact,
		provenanceRefs,
		execution: admitted.execution,
		diagnosticRefs: diagnosticRefs(receipt, authenticationDigest),
		...(receipt.providerPayloadDigest
			? {stdoutDigest: receipt.providerPayloadDigest}
			: {}),
	});
	const body = toCanonicalJsonValue({
		protocol: PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL,
		artifact,
		provider: admitted.provider,
		repositoryIdDigest: admitted.repositoryIdDigest,
		sourceSnapshotDigest: admitted.sourceSnapshotDigest,
		headCommit: admitted.headCommit,
		checkIdentityDigest: admitted.checkIdentityDigest,
		checkConfigurationDigest: admitted.checkConfigurationDigest,
		authenticationDigest,
		authorityCeiling: "verified",
		grantsResult: false,
		coverage,
		summary,
		bindingDigest,
		commandExecution,
	}) as unknown as Omit<
		ProviderCheckReceiptEvidenceIngestionResult,
		"receiptDigest"
	>;
	return Object.freeze({...body, receiptDigest: canonicalJsonDigest(body)});
}

function admittedInput(value: unknown): AdmittedProviderCheckInput {
	const input = object(value, "Provider Check receipt input");
	assertOnlyKeys(
		input,
		[
			"artifact",
			"provider",
			"repositoryIdDigest",
			"sourceSnapshotDigest",
			"headCommit",
			"checkIdentityDigest",
			"checkConfigurationDigest",
			"authentication",
			"execution",
			"provenanceRefs",
		],
		"Provider Check receipt ingestion",
	);
	const artifact = object(input.artifact, "Provider Check receipt artifact");
	assertOnlyKeys(
		artifact,
		["bytes", "ref"],
		"Provider Check receipt artifact",
	);
	if (typeof artifact.bytes !== "string" && !(artifact.bytes instanceof Uint8Array)) {
		throw new Error("Provider Check receipt artifact bytes must be text or bytes.");
	}
	const provider = admittedProvider(input.provider);
	const authentication = admittedAuthentication(input.authentication);
	const execution = admitStandardAdapterExecution(input.execution, {
		label: "Provider Check receipt",
		errorPrefix: "Provider Check receipt execution",
	});
	adapterIdentifier(execution.adapterId);
	adapterVersion(execution.adapterVersion);
	return Object.freeze({
		artifact: Object.freeze({
			bytes: artifact.bytes,
			ref: safeRef(artifact.ref, "Provider Check receipt artifact ref"),
		}),
		provider,
		repositoryIdDigest: digest(
			input.repositoryIdDigest,
			"Provider Check receipt repositoryIdDigest",
		),
		sourceSnapshotDigest: digest(
			input.sourceSnapshotDigest,
			"Provider Check receipt sourceSnapshotDigest",
		),
		headCommit: gitObjectId(input.headCommit, "Provider Check receipt headCommit"),
		checkIdentityDigest: digest(
			input.checkIdentityDigest,
			"Provider Check receipt checkIdentityDigest",
		),
		checkConfigurationDigest: digest(
			input.checkConfigurationDigest,
			"Provider Check receipt checkConfigurationDigest",
		),
		authentication,
		execution,
		provenanceRefs: normalizedRefList(
			input.provenanceRefs ?? [],
			"Provider Check receipt provenanceRefs",
			MAX_PROVENANCE_REFS,
		),
	});
}

function admittedProvider(value: unknown): ProviderCheckIdentity {
	const provider = object(value, "Provider Check receipt provider");
	assertOnlyKeys(
		provider,
		["providerId", "providerInstanceDigest"],
		"Provider Check receipt provider",
	);
	return Object.freeze({
		providerId: providerIdentifier(provider.providerId),
		providerInstanceDigest: digest(
			provider.providerInstanceDigest,
			"Provider Check receipt providerInstanceDigest",
		),
	});
}

function admittedAuthentication(
	value: unknown,
): ProviderCheckAuthenticationBinding {
	const authentication = object(value, "Provider Check receipt authentication");
	assertOnlyKeys(
		authentication,
		["method", "authenticatedIdentityDigest", "credentialBindingDigest"],
		"Provider Check receipt authentication",
	);
	return Object.freeze({
		method: enumValue(
			authentication.method,
			["authenticated_api", "verified_webhook"] as const,
			"Provider Check receipt authentication method",
		),
		authenticatedIdentityDigest: digest(
			authentication.authenticatedIdentityDigest,
			"Provider Check receipt authenticatedIdentityDigest",
		),
		credentialBindingDigest: digest(
			authentication.credentialBindingDigest,
			"Provider Check receipt credentialBindingDigest",
		),
	});
}

function parseProviderCheckReceipt(
	bytes: Uint8Array,
): ParsedProviderCheckReceipt {
	let text: string;
	try {
		text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
	} catch {
		throw new Error("Provider Check receipt must be valid UTF-8 JSON.");
	}
	let parsed: unknown;
	try {
		parsed = parseCanonicalJson(text);
	} catch {
		throw new Error(
			"Provider Check receipt must be strict canonical JSON without duplicate keys.",
		);
	}
	const receipt = object(parsed, "Provider Check receipt document");
	assertOnlyKeys(receipt, RECEIPT_KEYS, "Provider Check receipt document");
	const protocolId = boundedText(
		receipt.protocolId,
		"Provider Check receipt protocolId",
		128,
	);
	const protocolVersion = boundedText(
		receipt.protocolVersion,
		"Provider Check receipt protocolVersion",
		32,
	);
	if (
		protocolId !== PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL.id ||
		protocolVersion !== PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL.version
	) {
		throw new Error("Provider Check receipt protocol identity is unsupported.");
	}
	const state = enumValue(
		receipt.state,
		["queued", "in_progress", "completed", "unavailable"] as const,
		"Provider Check receipt state",
	);
	const startedAt = optionalTimestamp(receipt.startedAt, "startedAt");
	const completedAt = optionalTimestamp(receipt.completedAt, "completedAt");
	const providerDurationMs = durationBetween(startedAt, completedAt);
	return Object.freeze({
		protocolId,
		protocolVersion,
		providerId: providerIdentifier(receipt.providerId),
		providerInstanceDigest: digest(
			receipt.providerInstanceDigest,
			"Provider Check receipt providerInstanceDigest",
		),
		repositoryIdDigest: digest(
			receipt.repositoryIdDigest,
			"Provider Check receipt repositoryIdDigest",
		),
		sourceSnapshotDigest: digest(
			receipt.sourceSnapshotDigest,
			"Provider Check receipt sourceSnapshotDigest",
		),
		headCommit: gitObjectId(receipt.headCommit, "Provider Check receipt headCommit"),
		checkIdentityDigest: digest(
			receipt.checkIdentityDigest,
			"Provider Check receipt checkIdentityDigest",
		),
		checkConfigurationDigest: digest(
			receipt.checkConfigurationDigest,
			"Provider Check receipt checkConfigurationDigest",
		),
		authenticationDigest: digest(
			receipt.authenticationDigest,
			"Provider Check receipt authenticationDigest",
		),
		adapterId: adapterIdentifier(receipt.adapterId),
		adapterVersion: adapterVersion(receipt.adapterVersion),
		requestDigest: digest(
			receipt.requestDigest,
			"Provider Check receipt requestDigest",
		),
		executionDigest: digest(
			receipt.executionDigest,
			"Provider Check receipt executionDigest",
		),
		providerCheckIdDigest: optionalDigest(receipt.providerCheckIdDigest, "providerCheckIdDigest"),
		providerCheckSuiteIdDigest: optionalDigest(
			receipt.providerCheckSuiteIdDigest,
			"providerCheckSuiteIdDigest",
		),
		providerPayloadDigest: optionalDigest(
			receipt.providerPayloadDigest,
			"providerPayloadDigest",
		),
		attempt: optionalCount(receipt.attempt, "attempt", 1),
		state,
		conclusion: optionalConclusion(receipt.conclusion),
		...(startedAt ? {startedAt} : {}),
		...(completedAt ? {completedAt} : {}),
		...(providerDurationMs === undefined ? {} : {providerDurationMs}),
		outputDigest: optionalDigest(receipt.outputDigest, "outputDigest"),
		annotationCount: optionalCount(receipt.annotationCount, "annotationCount", 0),
	});
}

function assertReceiptBinding(
	...args: [
		ParsedProviderCheckReceipt,
		AdmittedProviderCheckInput,
		Sha256Digest,
	]
): void {
	const [receipt, binding, authenticationDigest] = args;
	const comparisons: readonly [unknown, unknown, string][] = [
		[receipt.providerId, binding.provider.providerId, "provider"],
		[
			receipt.providerInstanceDigest,
			binding.provider.providerInstanceDigest,
			"provider instance",
		],
		[receipt.repositoryIdDigest, binding.repositoryIdDigest, "repository"],
		[receipt.sourceSnapshotDigest, binding.sourceSnapshotDigest, "source snapshot"],
		[receipt.headCommit, binding.headCommit, "head commit"],
		[receipt.checkIdentityDigest, binding.checkIdentityDigest, "check identity"],
		[
			receipt.checkConfigurationDigest,
			binding.checkConfigurationDigest,
			"check configuration",
		],
		[receipt.authenticationDigest, authenticationDigest, "authentication"],
		[receipt.adapterId, binding.execution.adapterId, "adapter"],
		[receipt.adapterVersion, binding.execution.adapterVersion, "adapter version"],
		[receipt.requestDigest, binding.execution.requestDigest, "request"],
		[
			receipt.executionDigest,
			canonicalJsonDigest(binding.execution),
			"execution",
		],
	];
	for (const [actual, expected, label] of comparisons) {
		if (actual !== expected) {
			throw new Error(
				`Provider Check receipt ${label} does not match the Runtime binding.`,
			);
		}
	}
}

function assertReceiptState(
	...args: [ParsedProviderCheckReceipt, ProviderCheckReceiptExecutionBinding]
): void {
	const [receipt, execution] = args;
	if (receipt.state === "unavailable") {
		forbidUnavailableReceiptFields(receipt);
		return;
	}
	assertSuccessfulRetrieval(execution);
	requireKnownReceiptFields(receipt);
	if (receipt.state === "queued") {
		assertQueuedReceipt(receipt);
		return;
	}
	if (receipt.state === "in_progress") {
		assertInProgressReceipt(receipt);
		return;
	}
	assertCompletedReceipt(receipt);
}

function assertSuccessfulRetrieval(
	execution: ProviderCheckReceiptExecutionBinding,
): void {
	if (execution.termination !== "exited" || execution.exitCode !== 0) {
		throw new Error(
			"Available Provider Check receipt requires successful authenticated retrieval.",
		);
	}
}

function assertQueuedReceipt(receipt: ParsedProviderCheckReceipt): void {
	if (receipt.startedAt || receipt.completedAt || receipt.conclusion || receipt.outputDigest) {
		throw new Error("Queued Provider Check receipt has contradictory completion fields.");
	}
}

function assertInProgressReceipt(receipt: ParsedProviderCheckReceipt): void {
	if (!receipt.startedAt || receipt.completedAt || receipt.conclusion) {
		throw new Error("In-progress Provider Check receipt has contradictory timing or outcome.");
	}
}

function assertCompletedReceipt(receipt: ParsedProviderCheckReceipt): void {
	if (!receipt.startedAt || !receipt.completedAt || !receipt.conclusion) {
		throw new Error("Completed Provider Check receipt requires timing and conclusion.");
	}
}

function requireKnownReceiptFields(receipt: ParsedProviderCheckReceipt): void {
	if (
		!receipt.providerCheckIdDigest ||
		!receipt.providerPayloadDigest ||
		receipt.attempt === undefined ||
		receipt.annotationCount === undefined
	) {
		throw new Error(
			"Available Provider Check receipt requires check, payload, attempt, and annotation identity.",
		);
	}
}

function forbidUnavailableReceiptFields(receipt: ParsedProviderCheckReceipt): void {
	if (
		receipt.providerCheckIdDigest ||
		receipt.providerCheckSuiteIdDigest ||
		receipt.attempt !== undefined ||
		receipt.conclusion ||
		receipt.startedAt ||
		receipt.completedAt ||
		receipt.outputDigest ||
		receipt.annotationCount !== undefined
	) {
		throw new Error("Unavailable Provider Check receipt cannot claim check outcome fields.");
	}
}

function receiptCoverage(
	...args: [ParsedProviderCheckReceipt, ProviderCheckReceiptExecutionBinding]
): EvidenceCoverage {
	const [receipt, execution] = args;
	if (receipt.state === "unavailable" || execution.termination === "unavailable") {
		return "unknown";
	}
	if (execution.termination !== "exited" || receipt.state !== "completed") {
		return "partial";
	}
	return "complete";
}

function receiptSummary(
	receipt: ParsedProviderCheckReceipt,
): ProviderCheckReceiptSummary {
	return Object.freeze({
		...(receipt.providerCheckIdDigest
			? {providerCheckIdDigest: receipt.providerCheckIdDigest}
			: {}),
		...(receipt.providerCheckSuiteIdDigest
			? {providerCheckSuiteIdDigest: receipt.providerCheckSuiteIdDigest}
			: {}),
		...(receipt.providerPayloadDigest
			? {providerPayloadDigest: receipt.providerPayloadDigest}
			: {}),
		...(receipt.attempt === undefined ? {} : {attempt: receipt.attempt}),
		state: receipt.state,
		...(receipt.conclusion ? {conclusion: receipt.conclusion} : {}),
		...(receipt.startedAt ? {startedAt: receipt.startedAt} : {}),
		...(receipt.completedAt ? {completedAt: receipt.completedAt} : {}),
		...(receipt.providerDurationMs === undefined
			? {}
			: {providerDurationMs: receipt.providerDurationMs}),
		...(receipt.outputDigest ? {outputDigest: receipt.outputDigest} : {}),
		...(receipt.annotationCount === undefined
			? {}
			: {annotationCount: receipt.annotationCount}),
	});
}

function diagnosticRefs(
	...args: [ParsedProviderCheckReceipt, Sha256Digest]
): readonly string[] {
	const [receipt, authenticationDigest] = args;
	return sortedUnique([
		`provider-check/state/${receipt.state}`,
		`provider-check/conclusion/${receipt.conclusion ?? "none"}`,
		`provider-check/authentication/${authenticationDigest}`,
		...(receipt.providerCheckIdDigest
			? [`provider-check/id/${receipt.providerCheckIdDigest}`]
			: []),
		...(receipt.providerCheckSuiteIdDigest
			? [`provider-check/suite/${receipt.providerCheckSuiteIdDigest}`]
			: []),
		...(receipt.attempt === undefined
			? []
			: [`provider-check/attempt/${receipt.attempt}`]),
		...(receipt.annotationCount === undefined
			? []
			: [`provider-check/annotations/${receipt.annotationCount}`]),
	]);
}

function providerIdentifier(value: unknown): string {
	const id = boundedText(value, "Provider Check receipt providerId", 64);
	if (!/^[a-z][a-z0-9._-]*$/.test(id)) {
		throw new Error("Provider Check receipt providerId is invalid.");
	}
	return id;
}

function adapterIdentifier(value: unknown): string {
	const id = boundedText(value, "Provider Check receipt adapterId", 256);
	if (!/^[A-Za-z][A-Za-z0-9._/-]*$/.test(id)) {
		throw new Error("Provider Check receipt adapterId is invalid.");
	}
	return id;
}

function adapterVersion(value: unknown): string {
	const version = boundedText(value, "Provider Check receipt adapterVersion", 128);
	if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(version)) {
		throw new Error("Provider Check receipt adapterVersion is invalid.");
	}
	return version;
}

function gitObjectId(...args: [unknown, string]): string {
	const [value, label] = args;
	const objectId = boundedText(value, label, 64);
	if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(objectId)) {
		throw new Error(`${label} must be a lowercase Git object ID.`);
	}
	return objectId;
}

function optionalDigest(
	...args: [unknown, string]
): Sha256Digest | undefined {
	const [value, label] = args;
	return value === undefined
		? undefined
		: digest(value, `Provider Check receipt ${label}`);
}

function optionalConclusion(
	value: unknown,
): ProviderCheckConclusion | undefined {
	return value === undefined
		? undefined
		: enumValue(
				value,
				[
					"success",
					"failure",
					"neutral",
					"cancelled",
					"timed_out",
					"action_required",
					"skipped",
					"stale",
					"startup_failure",
					"unknown",
				] as const,
				"Provider Check receipt conclusion",
			);
}

function optionalCount(
	...args: [unknown, string, number]
): number | undefined {
	const [value, label, minimum] = args;
	if (value === undefined) return undefined;
	const count = integerValue(
		value,
		`Provider Check receipt ${label}`,
		minimum,
	);
	if (count > MAX_PROVIDER_COUNT) {
		throw new Error(
			`Provider Check receipt ${label} must be at most ${MAX_PROVIDER_COUNT}.`,
		);
	}
	return count;
}

function optionalTimestamp(...args: [unknown, string]): string | undefined {
	const [value, label] = args;
	if (value === undefined) return undefined;
	const timestamp = boundedText(
		value,
		`Provider Check receipt ${label}`,
		32,
	);
	const parsed = new Date(timestamp);
	if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== timestamp) {
		throw new Error(
			`Provider Check receipt ${label} must be a canonical UTC timestamp.`,
		);
	}
	return timestamp;
}

function durationBetween(
	...args: [string | undefined, string | undefined]
): number | undefined {
	const [startedAt, completedAt] = args;
	if (!startedAt || !completedAt) return undefined;
	const durationMs = Date.parse(completedAt) - Date.parse(startedAt);
	if (durationMs < 0) {
		throw new Error("Provider Check receipt completedAt precedes startedAt.");
	}
	return durationMs;
}
