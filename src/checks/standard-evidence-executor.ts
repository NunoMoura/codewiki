import type {EvidenceSubject} from "../evidence/contracts.ts";
import type {EvidenceObligation} from "../evidence/obligations.ts";
import {
	assertStandardAdapterEvidenceBundle,
	assertStandardAdapterIngestionResult,
	resolveStandardAdapterEvidenceObligation,
	type StandardAdapterEvidenceBundle,
} from "../evidence/adapters/materialization.ts";
import type {CheckCatalog, CheckRegistration} from "./catalog.ts";
import type {CheckJsonValue} from "./contracts.ts";
import type {
	CheckExecutorObservation,
	LoopCheckExecutor,
	LoopCheckExecutorContext,
} from "./runner.ts";
import {
	evaluateStandardEvidenceCheck,
	normalizeStandardEvidenceCheckSelector,
	type StandardEvidenceCheckIngestionResult,
	type StandardEvidenceCheckSelector,
} from "./standard-evidence-checks.ts";
import type {SemanticLoop} from "./contracts.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import {assertExactKeys} from "../utils/json.ts";

export const STANDARD_EVIDENCE_CHECK_SELECTOR_PARAMETER =
	"standardEvidenceCheckSelector" as const;
export const STANDARD_EVIDENCE_CHECK_EXECUTOR_PROTOCOL = Object.freeze({
	id: "codewiki.standard-evidence-check-executor",
	version: "1.1.0",
} as const);

export interface StandardEvidenceCheckCapability {
	readonly loop: SemanticLoop;
	readonly checkId: string;
	readonly checkVersion: string;
	readonly obligationIds: readonly string[];
	readonly selector: StandardEvidenceCheckSelector;
	readonly ingestion: StandardEvidenceCheckIngestionResult;
	readonly bundle: StandardAdapterEvidenceBundle;
}

interface AdmittedCapability extends StandardEvidenceCheckCapability {
	readonly selectorDigest: Sha256Digest;
	readonly ingestionDigest: Sha256Digest;
	readonly configurationDigest: Sha256Digest;
}

export function createStandardEvidenceCheckBindingParameters(
	selector: StandardEvidenceCheckSelector,
): Record<string, CheckJsonValue> {
	const normalized = normalizeStandardEvidenceCheckSelector(selector);
	return Object.freeze({
		[STANDARD_EVIDENCE_CHECK_SELECTOR_PARAMETER]: toCanonicalJsonValue(normalized),
	}) as Readonly<Record<string, CheckJsonValue>>;
}

export function createStandardEvidenceCheckExecutors(input: {
	readonly catalog: CheckCatalog;
	readonly capabilities: readonly StandardEvidenceCheckCapability[];
}): readonly LoopCheckExecutor[] {
	assertExactKeys(
		input,
		["catalog", "capabilities"],
		"Standard Evidence Check executor input",
	);
	if (!Array.isArray(input.capabilities) || input.capabilities.length > 64) {
		throw new Error("Standard Evidence Check executors require at most 64 capabilities.");
	}
	const seen = new Set<string>();
	const seenBundles = new Map<
		string,
		{readonly loop: SemanticLoop; readonly ingestionDigest: Sha256Digest}
	>();
	const executors: LoopCheckExecutor[] = [];
	for (const [ordinal, value] of input.capabilities.entries()) {
		const capability = admittedCapability(value, input.catalog, ordinal);
		const key = `${capability.loop}:${capability.checkId}@${capability.checkVersion}`;
		if (seen.has(key)) {
			throw new Error(`Standard Evidence Check capability ${key} is duplicated.`);
		}
		seen.add(key);
		const priorBundle = seenBundles.get(capability.bundle.bundleDigest);
		if (
			priorBundle &&
			(priorBundle.loop !== capability.loop ||
				priorBundle.ingestionDigest !== capability.ingestionDigest)
		) {
			throw new Error(
				`Standard Evidence Check bundle ${capability.bundle.bundleDigest} has inconsistent shared-substrate bindings.`,
			);
		}
		seenBundles.set(capability.bundle.bundleDigest, {
			loop: capability.loop,
			ingestionDigest: capability.ingestionDigest,
		});
		const registration = requiredRegistration(
			input.catalog,
			capability.checkId,
			capability.loop,
		);
		executors.push(
			Object.freeze({
				loop: capability.loop,
				checkId: capability.checkId,
				checkVersion: capability.checkVersion,
				execution: {
					...registration.check.execution,
					adapterVersion: STANDARD_EVIDENCE_CHECK_EXECUTOR_PROTOCOL.version,
					configurationDigest: capability.configurationDigest,
				},
				cacheable: false,
				producesEvidenceObligationIds: capability.obligationIds,
				execute: (context: LoopCheckExecutorContext) =>
					executeStandardEvidenceCheck(context, capability),
			}),
		);
	}
	return Object.freeze(executors);
}

function admittedCapability(
	...args: [StandardEvidenceCheckCapability, CheckCatalog, number]
): AdmittedCapability {
	const [value, catalog, index] = args;
	assertExactKeys(
		value,
		[
			"loop",
			"checkId",
			"checkVersion",
			"obligationIds",
			"selector",
			"ingestion",
			"bundle",
		],
		`Standard Evidence Check capability ${index}`,
	);
	const registration = requiredRegistration(catalog, value.checkId, value.loop);
	if (registration.check.version !== value.checkVersion) {
		throw new Error(
			`Standard Evidence Check capability ${value.checkId} version does not match the Catalog.`,
		);
	}
	if (
		registration.check.execution.kind !== "code" ||
		registration.check.measurement.shape !== "boolean"
	) {
		throw new Error(
			`Standard Evidence Check capability ${value.checkId} requires a boolean Code Check.`,
		);
	}
	if (
		!Array.isArray(value.obligationIds) ||
		value.obligationIds.length < 1 ||
		value.obligationIds.length > 8 ||
		new Set(value.obligationIds).size !== value.obligationIds.length
	) {
		throw new Error(
			`Standard Evidence Check capability ${value.checkId} requires 1..8 unique obligationIds.`,
		);
	}
	for (const obligationId of value.obligationIds) {
		const obligation = registration.check.evidenceObligations.find(
			(entry) => entry.id === obligationId,
		);
		if (!obligation) {
			throw new Error(
				`Standard Evidence Check capability ${value.checkId} has unknown obligation ${obligationId}.`,
			);
		}
		assertExecutorObligation(obligation);
	}
	if (
		value.obligationIds.length !== registration.check.evidenceObligations.length
	) {
		throw new Error(
			`Standard Evidence Check capability ${value.checkId} must own every Check obligation.`,
		);
	}
	const selector = normalizeStandardEvidenceCheckSelector(value.selector);
	assertStandardAdapterIngestionResult(value.ingestion);
	assertStandardAdapterEvidenceBundle(value.bundle);
	const selectorDigest = canonicalJsonDigest(selector);
	const ingestionDigest = canonicalJsonDigest(toCanonicalJsonValue(value.ingestion));
	const configurationDigest = canonicalJsonDigest({
		protocol: STANDARD_EVIDENCE_CHECK_EXECUTOR_PROTOCOL,
		checkId: value.checkId,
		checkVersion: value.checkVersion,
		obligationIds: value.obligationIds,
		selectorDigest,
		ingestionDigest,
		bundleDigest: value.bundle.bundleDigest,
		adapterProtocol: value.bundle.adapterProtocol,
	});
	return Object.freeze({
		...value,
		obligationIds: Object.freeze([...value.obligationIds]),
		selector,
		selectorDigest,
		ingestionDigest,
		configurationDigest,
	});
}

function executeStandardEvidenceCheck(
	...args: [LoopCheckExecutorContext, AdmittedCapability]
): CheckExecutorObservation {
	const [context, capability] = args;
	if (context.signal.aborted) {
		return indeterminate("Standard Evidence Check execution was cancelled.");
	}
	const boundSelector = context.binding.parameters[
		STANDARD_EVIDENCE_CHECK_SELECTOR_PARAMETER
	];
	if (
		boundSelector === undefined ||
		canonicalJsonDigest(boundSelector) !== capability.selectorDigest
	) {
		return indeterminate(
			"Standard Evidence Check selector does not match the protected policy binding.",
		);
	}
	const expectedSourceSnapshot =
		context.candidate.observedBase.sourceSnapshotDigest ??
		context.candidate.observedBase.gitTreeDigest;
	if (
		context.candidate.digest !== capability.bundle.evidenceRecords[0]?.subject.candidateDigest ||
		!expectedSourceSnapshot ||
		expectedSourceSnapshot !== capability.bundle.sourceSnapshotDigest
	) {
		return indeterminate(
			"Standard Evidence Check bundle does not match the exact Candidate source snapshot.",
		);
	}
	const expectedSubject = capability.bundle.evidenceRecords[0]?.subject;
	if (!expectedSubject || !sameBundleSubject(capability.bundle, expectedSubject)) {
		return indeterminate(
			"Standard Evidence Check bundle has inconsistent Evidence subjects.",
		);
	}
	try {
		const primaryObligation = requiredObligation(
			context,
			capability.obligationIds[0] as string,
		);
		const evaluation = evaluateStandardEvidenceCheck({
			selector: capability.selector,
			ingestion: capability.ingestion,
			bundle: capability.bundle,
			obligation: primaryObligation,
			expectedSubject,
		});
		const resolutions = [
			evaluation.evidenceResolution,
			...capability.obligationIds.slice(1).map((obligationId) =>
				resolveStandardAdapterEvidenceObligation({
					obligation: requiredObligation(context, obligationId),
					bundles: [capability.bundle],
					acceptedProtocols: [capability.bundle.adapterProtocol],
					expectedSubject,
				}),
			),
		];
		if (evaluation.disposition === "indeterminate") {
			return {
				disposition: "indeterminate",
				findings: evaluation.findings,
				issueClass: "standard_evidence_indeterminate",
				feedback: `Standard Evidence evaluation ${evaluation.evaluationDigest} requires complete exact Evidence.`,
				producedEvidenceRecords: capability.bundle.evidenceRecords,
				producedEvidenceResolutions: resolutions,
			};
		}
		const satisfied = evaluation.disposition === "satisfied";
		return {
			disposition: evaluation.disposition,
			measurement: {shape: "boolean", value: satisfied},
			findings: evaluation.findings,
			...(satisfied
				? {}
				: {
						issueClass: issueClass(capability.selector.kind),
						feedback:
							"Repair the observed implementation or revise the accepted Check policy through protected review.",
					}),
			producedEvidenceRecords: capability.bundle.evidenceRecords,
			producedEvidenceResolutions: resolutions,
		};
	} catch {
		return indeterminate(
			"Standard Evidence Check evaluation failed closed; details were redacted.",
		);
	}
}

function assertExecutorObligation(obligation: EvidenceObligation): void {
	if (
		obligation.coverages.length !== 1 ||
		obligation.coverages[0] !== "complete" ||
		obligation.subject !== "candidate_source_tree" ||
		obligation.freshness !== "exact_boundary" ||
		obligation.artifact === "optional" ||
		obligation.minimumCount < 1
	) {
		throw new Error(
			`Standard Evidence Check obligation ${obligation.id} is not exact and fail-closed.`,
		);
	}
}

function requiredObligation(
	...args: [LoopCheckExecutorContext, string]
) {
	const [context, obligationId] = args;
	const obligation = context.check.evidenceObligations.find(
		(entry) => entry.id === obligationId,
	);
	if (!obligation) {
		throw new Error(`Standard Evidence Check obligation ${obligationId} is missing.`);
	}
	return obligation;
}

function sameBundleSubject(
	...args: [StandardAdapterEvidenceBundle, EvidenceSubject]
): boolean {
	const [bundle, expectedSubject] = args;
	const expectedDigest = canonicalJsonDigest(expectedSubject);
	return bundle.evidenceRecords.every(
		(record) => canonicalJsonDigest(record.subject) === expectedDigest,
	);
}

function requiredRegistration(
	...args: [CheckCatalog, string, SemanticLoop]
): CheckRegistration {
	const [catalog, checkId, loop] = args;
	const registration = catalog.get(checkId, loop);
	if (!registration) {
		throw new Error(
			`Standard Evidence Check capability ${checkId} is not registered for ${loop}.`,
		);
	}
	return registration;
}

function issueClass(kind: StandardEvidenceCheckSelector["kind"]): string {
	if (kind === "junit_tests_passed") return "test_verification_failed";
	if (kind === "coverage_minimum") return "coverage_threshold_failed";
	if (kind === "sarif_findings_absent") return "scanner_findings_blocked";
	if (kind === "provider_conclusion_accepted") return "provider_check_failed";
	return "artifact_identity_incomplete";
}

function indeterminate(finding: string): CheckExecutorObservation {
	return {
		disposition: "indeterminate",
		findings: [finding],
		issueClass: "standard_evidence_indeterminate",
	};
}
