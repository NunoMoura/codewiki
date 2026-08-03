import type {EvidenceSubject} from "../evidence/contracts.ts";
import type {EvidenceObligationResolution} from "../evidence/obligation-resolution.ts";
import type {EvidenceObligation} from "../evidence/obligations.ts";
import {
	assertStandardAdapterEvidenceBundle,
	assertStandardAdapterIngestionResult,
	resolveStandardAdapterEvidenceObligation,
	type EvidenceAdapterProtocolIdentity,
	type StandardAdapterEvidenceBundle,
	type StandardAdapterIngestionResult,
} from "../evidence/adapters/materialization.ts";
import {
	JUNIT_EVIDENCE_ADAPTER_PROTOCOL,
	type JunitEvidenceIngestionResult,
} from "../evidence/adapters/junit.ts";
import {
	SARIF_EVIDENCE_ADAPTER_PROTOCOL,
	type SarifEvidenceIngestionResult,
} from "../evidence/adapters/sarif.ts";
import {
	COBERTURA_EVIDENCE_ADAPTER_PROTOCOL,
	LCOV_EVIDENCE_ADAPTER_PROTOCOL,
	type CoverageEvidenceIngestionResult,
} from "../evidence/adapters/coverage.ts";
import {
	PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL,
	type ProviderCheckConclusion,
	type ProviderCheckReceiptEvidenceIngestionResult,
} from "../evidence/adapters/provider-check-receipt.ts";
import {
	CYCLONEDX_EVIDENCE_ADAPTER_PROTOCOL,
	type CycloneDxEvidenceIngestionResult,
} from "../evidence/adapters/cyclonedx.ts";
import {
	SPDX_EVIDENCE_ADAPTER_PROTOCOL,
	type SpdxEvidenceIngestionResult,
} from "../evidence/adapters/spdx.ts";
import {
	PACT_EVIDENCE_ADAPTER_PROTOCOL,
	type PactEvidenceIngestionResult,
} from "../evidence/adapters/pact.ts";
import {
	OPENAPI_EVIDENCE_ADAPTER_PROTOCOL,
	type OpenApiEvidenceIngestionResult,
} from "../evidence/adapters/openapi.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import {assertExactKeys} from "../utils/json.ts";

export const STANDARD_EVIDENCE_CHECK_EVALUATION_PROTOCOL = Object.freeze({
	id: "codewiki.standard-evidence-check-evaluation",
	version: "1.0.0",
} as const);

export type StandardEvidenceCheckSelector =
	| {
			readonly kind: "junit_tests_passed";
			readonly minimumTestCount: number;
			readonly maximumSkippedCount: number;
	  }
	| {
			readonly kind: "coverage_minimum";
			readonly metric: "line" | "branch" | "function";
			readonly minimumBasisPoints: number;
	  }
	| {
			readonly kind: "sarif_findings_absent";
			readonly blockedLevels: readonly SarifFindingLevel[];
	  }
	| {
			readonly kind: "provider_conclusion_accepted";
			readonly acceptedConclusions: readonly ProviderCheckConclusion[];
	  }
	| {
			readonly kind: "artifact_identity_present";
			readonly adapterProtocol: EvidenceAdapterProtocolIdentity;
			readonly minimumIdentityCount: number;
	  };

export type StandardEvidenceCheckIngestionResult =
	| JunitEvidenceIngestionResult
	| SarifEvidenceIngestionResult
	| CoverageEvidenceIngestionResult
	| ProviderCheckReceiptEvidenceIngestionResult
	| CycloneDxEvidenceIngestionResult
	| SpdxEvidenceIngestionResult
	| PactEvidenceIngestionResult
	| OpenApiEvidenceIngestionResult;

export interface StandardEvidenceCheckEvaluation {
	readonly protocol: typeof STANDARD_EVIDENCE_CHECK_EVALUATION_PROTOCOL;
	readonly selector: StandardEvidenceCheckSelector;
	readonly selectorDigest: Sha256Digest;
	readonly adapterProtocol: EvidenceAdapterProtocolIdentity;
	readonly adapterReceiptDigest: Sha256Digest;
	readonly adapterBundleDigest: Sha256Digest;
	readonly evidenceResolution: EvidenceObligationResolution;
	readonly disposition: "satisfied" | "unsatisfied" | "indeterminate";
	readonly facts: Readonly<Record<string, boolean | number | string>>;
	readonly findings: readonly string[];
	readonly grantsResult: false;
	readonly evaluationDigest: Sha256Digest;
}

interface EvaluateStandardEvidenceCheckInput {
	readonly selector: StandardEvidenceCheckSelector;
	readonly ingestion: StandardEvidenceCheckIngestionResult;
	readonly bundle: StandardAdapterEvidenceBundle;
	readonly obligation: EvidenceObligation;
	readonly expectedSubject: EvidenceSubject;
	readonly availableArtifactDigests?: readonly Sha256Digest[];
}

type SarifFindingLevel = "error" | "warning" | "note" | "none";
type StructuredIdentityIngestionResult =
	| CycloneDxEvidenceIngestionResult
	| SpdxEvidenceIngestionResult
	| PactEvidenceIngestionResult
	| OpenApiEvidenceIngestionResult;
type EvaluationOutcome = Pick<
	StandardEvidenceCheckEvaluation,
	"disposition" | "facts" | "findings"
>;

const STRUCTURED_IDENTITY_PROTOCOL_KEYS = new Set([
	protocolKey(CYCLONEDX_EVIDENCE_ADAPTER_PROTOCOL),
	protocolKey(SPDX_EVIDENCE_ADAPTER_PROTOCOL),
	protocolKey(PACT_EVIDENCE_ADAPTER_PROTOCOL),
	protocolKey(OPENAPI_EVIDENCE_ADAPTER_PROTOCOL),
]);

const PROVIDER_CONCLUSIONS: readonly ProviderCheckConclusion[] = Object.freeze([
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
]);
const SARIF_LEVELS: readonly SarifFindingLevel[] = Object.freeze([
	"error",
	"warning",
	"note",
	"none",
]);

export function evaluateStandardEvidenceCheck(
	input: EvaluateStandardEvidenceCheckInput,
): StandardEvidenceCheckEvaluation {
	assertExactKeys(
		input,
		[
			"selector",
			"ingestion",
			"bundle",
			"obligation",
			"expectedSubject",
			"availableArtifactDigests",
		],
		"Standard Evidence Check input",
	);
	const selector = normalizeStandardEvidenceCheckSelector(input.selector);
	assertSemanticObligation(input.obligation);
	assertStandardAdapterIngestionResult(input.ingestion);
	assertStandardAdapterEvidenceBundle(input.bundle);
	assertIngestionBundleIdentity(input.ingestion, input.bundle);
	const acceptedProtocols = acceptedProtocolsForSelector(selector);
	const actualProtocolKey = protocolKey(input.ingestion.protocol);
	if (!acceptedProtocols.some((protocol) => protocolKey(protocol) === actualProtocolKey)) {
		throw new Error(
			`Standard Evidence Check ${selector.kind} cannot consume ${actualProtocolKey}.`,
		);
	}
	const evidenceResolution = resolveStandardAdapterEvidenceObligation({
		obligation: input.obligation,
		bundles: [input.bundle],
		acceptedProtocols,
		expectedSubject: input.expectedSubject,
		availableArtifactDigests: input.availableArtifactDigests,
	});
	const outcome =
		evidenceResolution.status === "ready"
			? evaluateReadyEvidence(selector, input.ingestion)
			: indeterminateOutcome(evidenceResolution.status);
	const body = toCanonicalJsonValue({
		protocol: STANDARD_EVIDENCE_CHECK_EVALUATION_PROTOCOL,
		selector,
		selectorDigest: canonicalJsonDigest(selector),
		adapterProtocol: input.ingestion.protocol,
		adapterReceiptDigest: input.ingestion.receiptDigest,
		adapterBundleDigest: input.bundle.bundleDigest,
		evidenceResolution,
		disposition: outcome.disposition,
		facts: outcome.facts,
		findings: outcome.findings,
		grantsResult: false,
	}) as unknown as Omit<StandardEvidenceCheckEvaluation, "evaluationDigest">;
	return Object.freeze({...body, evaluationDigest: canonicalJsonDigest(body)});
}

export function normalizeStandardEvidenceCheckSelector(
	selector: StandardEvidenceCheckSelector,
): StandardEvidenceCheckSelector {
	if (!selector || typeof selector !== "object" || Array.isArray(selector)) {
		throw new Error("Standard Evidence Check selector must be an object.");
	}
	if (selector.kind === "junit_tests_passed") {
		assertExactKeys(
			selector,
			["kind", "minimumTestCount", "maximumSkippedCount"],
			"JUnit Evidence Check selector",
		);
		return Object.freeze({
			kind: selector.kind,
			minimumTestCount: boundedInteger(
				selector.minimumTestCount,
				1,
				8_192,
				"JUnit minimumTestCount",
			),
			maximumSkippedCount: boundedInteger(
				selector.maximumSkippedCount,
				0,
				8_192,
				"JUnit maximumSkippedCount",
			),
		});
	}
	if (selector.kind === "coverage_minimum") {
		assertExactKeys(
			selector,
			["kind", "metric", "minimumBasisPoints"],
			"Coverage Evidence Check selector",
		);
		if (
			selector.metric !== "line" &&
			selector.metric !== "branch" &&
			selector.metric !== "function"
		) {
			throw new Error("Coverage Evidence Check metric is invalid.");
		}
		return Object.freeze({
			kind: selector.kind,
			metric: selector.metric,
			minimumBasisPoints: boundedInteger(
				selector.minimumBasisPoints,
				0,
				10_000,
				"Coverage minimumBasisPoints",
			),
		});
	}
	if (selector.kind === "sarif_findings_absent") {
		assertExactKeys(
			selector,
			["kind", "blockedLevels"],
			"SARIF Evidence Check selector",
		);
		return Object.freeze({
			kind: selector.kind,
			blockedLevels: admittedEnumList(
				selector.blockedLevels,
				SARIF_LEVELS,
				"SARIF blockedLevels",
			),
		});
	}
	if (selector.kind === "provider_conclusion_accepted") {
		assertExactKeys(
			selector,
			["kind", "acceptedConclusions"],
			"Provider Evidence Check selector",
		);
		return Object.freeze({
			kind: selector.kind,
			acceptedConclusions: admittedEnumList(
				selector.acceptedConclusions,
				PROVIDER_CONCLUSIONS,
				"Provider acceptedConclusions",
			),
		});
	}
	if (selector.kind === "artifact_identity_present") {
		assertExactKeys(
			selector,
			["kind", "adapterProtocol", "minimumIdentityCount"],
			"Artifact identity Evidence Check selector",
		);
		const key = protocolKey(selector.adapterProtocol);
		if (!STRUCTURED_IDENTITY_PROTOCOL_KEYS.has(key)) {
			throw new Error(
				`Artifact identity Evidence Check protocol ${key} is unsupported.`,
			);
		}
		return Object.freeze({
			kind: selector.kind,
			adapterProtocol: Object.freeze({...selector.adapterProtocol}),
			minimumIdentityCount: boundedInteger(
				selector.minimumIdentityCount,
				1,
				512,
				"Artifact identity minimumIdentityCount",
			),
		});
	}
	throw new Error("Standard Evidence Check selector kind is unsupported.");
}

function acceptedProtocolsForSelector(
	selector: StandardEvidenceCheckSelector,
): readonly EvidenceAdapterProtocolIdentity[] {
	if (selector.kind === "junit_tests_passed") {
		return [JUNIT_EVIDENCE_ADAPTER_PROTOCOL];
	}
	if (selector.kind === "coverage_minimum") {
		return [LCOV_EVIDENCE_ADAPTER_PROTOCOL, COBERTURA_EVIDENCE_ADAPTER_PROTOCOL];
	}
	if (selector.kind === "sarif_findings_absent") {
		return [SARIF_EVIDENCE_ADAPTER_PROTOCOL];
	}
	if (selector.kind === "provider_conclusion_accepted") {
		return [PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL];
	}
	return [selector.adapterProtocol];
}

function evaluateReadyEvidence(
	...args: [StandardEvidenceCheckSelector, StandardEvidenceCheckIngestionResult]
): EvaluationOutcome {
	const [selector, ingestion] = args;
	if (selector.kind === "junit_tests_passed") {
		return evaluateJunit(selector, ingestion as JunitEvidenceIngestionResult);
	}
	if (selector.kind === "coverage_minimum") {
		return evaluateCoverage(
			selector,
			ingestion as CoverageEvidenceIngestionResult,
		);
	}
	if (selector.kind === "sarif_findings_absent") {
		return evaluateSarif(selector, ingestion as SarifEvidenceIngestionResult);
	}
	if (selector.kind === "provider_conclusion_accepted") {
		return evaluateProvider(
			selector,
			ingestion as ProviderCheckReceiptEvidenceIngestionResult,
		);
	}
	return evaluateArtifactIdentity(selector, ingestion);
}

function evaluateArtifactIdentity(
	...args: [
		Extract<
			StandardEvidenceCheckSelector,
			{kind: "artifact_identity_present"}
		>,
		StandardEvidenceCheckIngestionResult,
	]
): EvaluationOutcome {
	const [selector, ingestion] = args;
	const identityCount = (ingestion as StructuredIdentityIngestionResult).summary
		.identityCount;
	const satisfied = identityCount >= selector.minimumIdentityCount;
	return {
		disposition: satisfied ? "satisfied" : "unsatisfied",
		facts: Object.freeze({
			identityEvidenceComplete: true,
			identityCount,
			minimumIdentityCount: selector.minimumIdentityCount,
		}),
		findings: satisfied
			? []
			: [
					`Structured artifact contains ${identityCount} identities; ${selector.minimumIdentityCount} are required.`,
				],
	};
}

function evaluateJunit(
	...args: [
		Extract<StandardEvidenceCheckSelector, {kind: "junit_tests_passed"}>,
		JunitEvidenceIngestionResult,
	]
): EvaluationOutcome {
	const [selector, ingestion] = args;
	const summary = ingestion.summary;
	const failedCount = summary.failureCount + summary.errorCount;
	const satisfied =
		failedCount === 0 &&
		summary.testCount >= selector.minimumTestCount &&
		summary.skippedCount <= selector.maximumSkippedCount;
	return {
		disposition: satisfied ? "satisfied" : "unsatisfied",
		facts: Object.freeze({
			testCount: summary.testCount,
			failureCount: summary.failureCount,
			errorCount: summary.errorCount,
			skippedCount: summary.skippedCount,
			minimumTestCount: selector.minimumTestCount,
			maximumSkippedCount: selector.maximumSkippedCount,
		}),
		findings: satisfied
			? []
			: [
					`JUnit verification observed ${failedCount} failed/error tests, ${summary.testCount} total tests, and ${summary.skippedCount} skipped tests.`,
				],
	};
}

function evaluateCoverage(
	...args: [
		Extract<StandardEvidenceCheckSelector, {kind: "coverage_minimum"}>,
		CoverageEvidenceIngestionResult,
	]
): EvaluationOutcome {
	const [selector, ingestion] = args;
	const foundKey = `${selector.metric}Found` as const;
	const hitKey = `${selector.metric}Hit` as const;
	const found = ingestion.summary[foundKey];
	const hit = ingestion.summary[hitKey];
	if (found === 0) {
		return {
			disposition: "indeterminate",
			facts: Object.freeze({metric: selector.metric, found, hit}),
			findings: [`Coverage verification observed no ${selector.metric} denominator.`],
		};
	}
	const observedBasisPoints = Math.floor((hit * 10_000) / found);
	const satisfied = hit * 10_000 >= selector.minimumBasisPoints * found;
	return {
		disposition: satisfied ? "satisfied" : "unsatisfied",
		facts: Object.freeze({
			metric: selector.metric,
			found,
			hit,
			observedBasisPoints,
			minimumBasisPoints: selector.minimumBasisPoints,
		}),
		findings: satisfied
			? []
			: [
					`${selector.metric} coverage ${observedBasisPoints} basis points is below required ${selector.minimumBasisPoints}.`,
				],
	};
}

function evaluateSarif(
	...args: [
		Extract<StandardEvidenceCheckSelector, {kind: "sarif_findings_absent"}>,
		SarifEvidenceIngestionResult,
	]
): EvaluationOutcome {
	const [selector, ingestion] = args;
	const counts: Record<SarifFindingLevel, number> = {
		error: ingestion.summary.errorCount,
		warning: ingestion.summary.warningCount,
		note: ingestion.summary.noteCount,
		none: ingestion.summary.noneCount,
	};
	let blockedFindingCount = 0;
	for (const blockedLevel of selector.blockedLevels) {
		blockedFindingCount += counts[blockedLevel];
	}
	const satisfied = blockedFindingCount === 0;
	return {
		disposition: satisfied ? "satisfied" : "unsatisfied",
		facts: Object.freeze({
			blockedFindingCount,
			errorCount: counts.error,
			warningCount: counts.warning,
			noteCount: counts.note,
			noneCount: counts.none,
		}),
		findings: satisfied
			? []
			: [`SARIF verification observed ${blockedFindingCount} blocked-level findings.`],
	};
}

function evaluateProvider(
	...args: [
		Extract<
			StandardEvidenceCheckSelector,
			{kind: "provider_conclusion_accepted"}
		>,
		ProviderCheckReceiptEvidenceIngestionResult,
	]
): EvaluationOutcome {
	const [selector, ingestion] = args;
	const conclusion = ingestion.summary.conclusion;
	if (ingestion.summary.state !== "completed" || !conclusion) {
		return {
			disposition: "indeterminate",
			facts: Object.freeze({state: ingestion.summary.state}),
			findings: ["Provider Check did not have a completed conclusion."],
		};
	}
	const satisfied = selector.acceptedConclusions.includes(conclusion);
	return {
		disposition: satisfied ? "satisfied" : "unsatisfied",
		facts: Object.freeze({state: ingestion.summary.state, conclusion}),
		findings: satisfied
			? []
			: [`Provider Check conclusion ${conclusion} is not accepted.`],
	};
}

function assertSemanticObligation(obligation: EvidenceObligation): void {
	if (
		obligation.coverages.length !== 1 ||
		obligation.coverages[0] !== "complete"
	) {
		throw new Error(
			"Standard Evidence Check obligation must require complete coverage.",
		);
	}
	if (
		obligation.subject !== "candidate_source_tree" ||
		obligation.freshness !== "exact_boundary"
	) {
		throw new Error(
			"Standard Evidence Check obligation must bind the exact Candidate source tree.",
		);
	}
	if (obligation.artifact === "optional") {
		throw new Error(
			"Standard Evidence Check obligation must require an artifact.",
		);
	}
	if (obligation.minimumCount < 1) {
		throw new Error(
			"Standard Evidence Check obligation must require Evidence.",
		);
	}
}

function indeterminateOutcome(
	status: EvidenceObligationResolution["status"],
): EvaluationOutcome {
	return {
		disposition: "indeterminate",
		facts: Object.freeze({evidenceStatus: status}),
		findings: [`Standard Evidence Check input is ${status}.`],
	};
}

function assertIngestionBundleIdentity(
	...args: [StandardAdapterIngestionResult, StandardAdapterEvidenceBundle]
): void {
	const [ingestion, bundle] = args;
	if (protocolKey(ingestion.protocol) !== protocolKey(bundle.adapterProtocol)) {
		throw new Error("Standard Evidence Check adapter protocol does not match bundle.");
	}
	if (
		ingestion.receiptDigest !== bundle.adapterReceiptDigest ||
		ingestion.bindingDigest !== bundle.adapterBindingDigest ||
		ingestion.sourceSnapshotDigest !== bundle.sourceSnapshotDigest ||
		ingestion.coverage !== bundle.coverage ||
		ingestion.authorityCeiling !== bundle.authority
	) {
		throw new Error("Standard Evidence Check adapter receipt does not match bundle.");
	}
}

function admittedEnumList<T extends string>(
	...args: [readonly T[], readonly T[], string]
): readonly T[] {
	const [values, supported, label] = args;
	if (!Array.isArray(values) || values.length < 1 || values.length > supported.length) {
		throw new Error(`${label} must contain 1..${supported.length} values.`);
	}
	const allowed = new Set<string>(supported);
	for (const value of values) {
		if (!allowed.has(value)) throw new Error(`${label} contains unsupported value.`);
	}
	const normalized = [...new Set(values)].sort(compareText);
	if (normalized.length !== values.length) {
		throw new Error(`${label} must not contain duplicates.`);
	}
	return Object.freeze(normalized);
}

function boundedInteger(
	...args: [number, number, number, string]
): number {
	const [value, minimum, maximum, label] = args;
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new Error(`${label} must be an integer in ${minimum}..${maximum}.`);
	}
	return value;
}

function protocolKey(...args: [EvidenceAdapterProtocolIdentity]): string {
	const [protocol] = args;
	return `${protocol.id}@${protocol.version}`;
}

function compareText(...args: [string, string]): number {
	const [left, right] = args;
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
