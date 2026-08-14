import type {
	EvidenceAuthority,
	EvidenceKind,
} from "../evidence/contracts.ts";
import type {EvidenceObligation} from "../evidence/obligations.ts";
import type {SemanticLoop} from "./contracts.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import {
	createCheckCatalog,
	type CheckCatalog,
	type CheckRegistration,
} from "./catalog.ts";
import type {CheckExecutionKind} from "./contracts.ts";

export const VERIFICATION_CAPABILITY_MATRIX_PROTOCOL = Object.freeze({
	id: "codewiki.verification-capability-matrix",
	version: "2.0.0",
} as const);

export type VerificationCapabilityStatus =
	| "native"
	| "host_required"
	| "capability_required";

export type VerificationArtifactFormat =
	| "codewiki_evidence_material"
	| "sarif_2_1_0"
	| "junit_xml"
	| "lcov"
	| "cobertura_xml"
	| "cyclonedx"
	| "spdx"
	| "pact"
	| "openapi"
	| "provider_check_receipt";

export type VerificationAdapterStatus =
	| "native_admission"
	| "implemented"
	| "not_implemented";

export interface VerificationFormatCapability {
	readonly format: VerificationArtifactFormat;
	readonly status: VerificationAdapterStatus;
	readonly evidenceKinds: readonly EvidenceKind[];
	readonly authorityCeiling: EvidenceAuthority;
	readonly grantsResult: false;
}

export interface CheckVerificationCapability {
	readonly loop: SemanticLoop;
	readonly checkId: string;
	readonly checkVersion: string;
	readonly requirementDigest: string;
	readonly executionKind: CheckExecutionKind;
	readonly executorId: string;
	readonly rollout: CheckRegistration["rollout"];
	readonly status: VerificationCapabilityStatus;
	readonly evidenceObligations: readonly EvidenceObligation[];
	readonly formats: readonly VerificationFormatCapability[];
	readonly gaps: readonly string[];
	readonly capabilityDigest: Sha256Digest;
}

export interface VerificationCapabilityMatrix {
	readonly protocol: typeof VERIFICATION_CAPABILITY_MATRIX_PROTOCOL;
	readonly checkCatalogVersion: string;
	readonly checkCatalogDigest: string;
	readonly customCheckConfigDigest: string;
	readonly capabilities: readonly CheckVerificationCapability[];
	readonly summary: {
		readonly checkCount: number;
		readonly nativeCount: number;
		readonly hostRequiredCount: number;
		readonly capabilityRequiredCount: number;
		readonly standardAdapterCount: number;
		readonly implementedStandardAdapterCount: number;
	};
	readonly matrixDigest: Sha256Digest;
}

interface StandardFormatBinding {
	readonly format: Exclude<
		VerificationArtifactFormat,
		"codewiki_evidence_material"
	>;
	readonly evidenceKinds: readonly EvidenceKind[];
	readonly authorityCeiling: EvidenceAuthority;
}

const LOOPS: readonly SemanticLoop[] = [
	"decision",
	"planning",
	"implementation",
];

const IMPLEMENTED_STANDARD_ADAPTER_FORMATS = new Set<VerificationArtifactFormat>([
	"sarif_2_1_0",
	"junit_xml",
	"lcov",
	"cobertura_xml",
	"cyclonedx",
	"spdx",
	"pact",
	"openapi",
	"provider_check_receipt",
]);

const STANDARD_FORMAT_BINDINGS: readonly StandardFormatBinding[] = [
	{
		format: "sarif_2_1_0",
		evidenceKinds: ["command_execution", "source_observation"],
		authorityCeiling: "observed",
	},
	{
		format: "junit_xml",
		evidenceKinds: ["command_execution"],
		authorityCeiling: "observed",
	},
	{
		format: "lcov",
		evidenceKinds: ["command_execution", "source_observation"],
		authorityCeiling: "observed",
	},
	{
		format: "cobertura_xml",
		evidenceKinds: ["command_execution", "source_observation"],
		authorityCeiling: "observed",
	},
	{
		format: "cyclonedx",
		evidenceKinds: ["source_observation"],
		authorityCeiling: "observed",
	},
	{
		format: "spdx",
		evidenceKinds: ["source_observation"],
		authorityCeiling: "observed",
	},
	{
		format: "pact",
		evidenceKinds: ["source_observation"],
		authorityCeiling: "observed",
	},
	{
		format: "openapi",
		evidenceKinds: ["source_observation"],
		authorityCeiling: "observed",
	},
	{
		format: "provider_check_receipt",
		evidenceKinds: ["command_execution"],
		authorityCeiling: "verified",
	},
];

export function buildVerificationCapabilityMatrix(
	catalog: CheckCatalog = createCheckCatalog(),
): VerificationCapabilityMatrix {
	const capabilities = LOOPS.flatMap((loop) =>
		catalog.list(loop).map((registration) =>
			capabilityForRegistration({loop, registration}),
		),
	).sort(compareCapabilities);
	const summary = Object.freeze({
		checkCount: capabilities.length,
		nativeCount: capabilities.filter((entry) => entry.status === "native")
			.length,
		hostRequiredCount: capabilities.filter(
			(entry) => entry.status === "host_required",
		).length,
		capabilityRequiredCount: capabilities.filter(
			(entry) => entry.status === "capability_required",
		).length,
		standardAdapterCount: STANDARD_FORMAT_BINDINGS.length,
		implementedStandardAdapterCount: IMPLEMENTED_STANDARD_ADAPTER_FORMATS.size,
	});
	const body = toCanonicalJsonValue({
		protocol: VERIFICATION_CAPABILITY_MATRIX_PROTOCOL,
		checkCatalogVersion: catalog.version,
		checkCatalogDigest: catalog.digest,
		customCheckConfigDigest: catalog.customCheckConfigDigest,
		capabilities,
		summary,
	}) as unknown as Omit<VerificationCapabilityMatrix, "matrixDigest">;
	return Object.freeze({
		...body,
		matrixDigest: canonicalJsonDigest(body),
	});
}

function capabilityForRegistration(input: {
	readonly loop: SemanticLoop;
	readonly registration: CheckRegistration;
}): CheckVerificationCapability {
	const {loop, registration} = input;
	const obligations = registration.check.evidenceObligations;
	const status = capabilityStatus({registration, obligations});
	const formats = formatCapabilities(obligations);
	const gaps = capabilityGaps({registration, obligations, status});
	const body = toCanonicalJsonValue({
		loop,
		checkId: registration.check.id,
		checkVersion: registration.check.version,
		requirementDigest: registration.check.requirementDigest,
		executionKind: registration.check.execution.kind,
		executorId: registration.check.execution.id,
		rollout: registration.rollout,
		status,
		evidenceObligations: obligations,
		formats,
		gaps,
	}) as unknown as Omit<CheckVerificationCapability, "capabilityDigest">;
	return Object.freeze({
		...body,
		capabilityDigest: canonicalJsonDigest(body),
	});
}

function capabilityStatus(input: {
	readonly registration: CheckRegistration;
	readonly obligations: readonly EvidenceObligation[];
}): VerificationCapabilityStatus {
	if (
		input.registration.check.execution.id ===
		"codewiki.custom-code.resource_usage_limit"
	) {
		return "capability_required";
	}
	if (
		input.registration.check.execution.kind === "model" ||
		input.obligations.length > 0
	) {
		return "host_required";
	}
	return "native";
}

function formatCapabilities(
	obligations: readonly EvidenceObligation[],
): VerificationFormatCapability[] {
	const requiredKinds = new Set(obligations.flatMap((entry) => entry.kinds));
	if (requiredKinds.size === 0) return [];
	const capabilities: VerificationFormatCapability[] = [
		{
			format: "codewiki_evidence_material",
			status: "native_admission",
			evidenceKinds: [...requiredKinds].sort(compareText),
			authorityCeiling: highestAuthority(
				obligations.flatMap((entry) => entry.authorities),
			),
			grantsResult: false,
		},
	];
	for (const binding of STANDARD_FORMAT_BINDINGS) {
		const evidenceKinds = binding.evidenceKinds.filter((kind) =>
			requiredKinds.has(kind),
		);
		if (evidenceKinds.length === 0) continue;
		capabilities.push({
			format: binding.format,
			status: IMPLEMENTED_STANDARD_ADAPTER_FORMATS.has(binding.format)
				? "implemented"
				: "not_implemented",
			evidenceKinds,
			authorityCeiling: binding.authorityCeiling,
			grantsResult: false,
		});
	}
	return capabilities;
}

function capabilityGaps(input: {
	readonly registration: CheckRegistration;
	readonly obligations: readonly EvidenceObligation[];
	readonly status: VerificationCapabilityStatus;
}): string[] {
	const gaps = new Set<string>();
	if (input.registration.check.execution.kind === "model") {
		gaps.add("independent_model_executor_required");
	}
	if (input.obligations.length > 0) {
		gaps.add("exact_evidence_collection_required");
	}
	for (const obligation of input.obligations) {
		for (const producerKind of obligation.producerKinds) {
			if (producerKind !== "runtime") {
				gaps.add(`trusted_${producerKind}_producer_required`);
			}
		}
	}
	if (input.status === "capability_required") {
		gaps.add("measured_executor_capability_required");
	}
	return [...gaps].sort(compareText);
}

function highestAuthority(
	authorities: readonly EvidenceAuthority[],
): EvidenceAuthority {
	return [...authorities].sort(compareAuthorityDescending)[0] || "asserted";
}

function compareAuthorityDescending(
	...authorities: [EvidenceAuthority, EvidenceAuthority]
): number {
	const [left, right] = authorities;
	return authorityRank(right) - authorityRank(left);
}

function authorityRank(authority: EvidenceAuthority): number {
	return {
		asserted: 0,
		observed: 1,
		verified: 2,
		approved: 3,
	}[authority];
}

function compareCapabilities(
	...entries: [CheckVerificationCapability, CheckVerificationCapability]
): number {
	const [left, right] = entries;
	const loopOrder = LOOPS.indexOf(left.loop) - LOOPS.indexOf(right.loop);
	if (loopOrder !== 0) return loopOrder;
	return compareText(left.checkId, right.checkId);
}

function compareText(...values: [string, string]): number {
	const [left, right] = values;
	if (left > right) return 1;
	return left === right ? 0 : -1;
}
