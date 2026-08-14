import {
	EVIDENCE_OBLIGATION_VERSION,
	createEvidenceObligation,
} from "../evidence/obligations.ts";
import type { EvidenceObligation } from "../evidence/obligations.ts";
import type { SemanticLoop } from "./contracts.ts";
import type { CustomCheckDefinition } from "./custom-checks/contracts.ts";
import type {CustomCheckEvaluatorStandardBinding} from "./custom-checks/model-evaluator.ts";
import {
	CHECK_PACK_CONFIG_PROTOCOL_VERSION,
	type ResolvedCheckConfiguration,
} from "./custom-checks/configuration.ts";
import type {
	ProjectCheckDefinition,
	ProjectCheckPack,
} from "./custom-checks/project-config-store.ts";
import {
	normalizeUserStandardDefinitions,
	type UserStandardDefinition,
} from "./custom-checks/user-standards.ts";
import {
	assertCustomCheckDefinition,
	customCheckConfigurationDigest,
	customCheckDefinitionCheckId,
	normalizeCustomCheckDefinitions,
} from "./custom-checks/contracts.ts";
import {
	CUSTOM_CHECK_TYPE_CATALOG_VERSION,
	getCustomCheckType,
} from "./custom-checks/check-types.ts";
import {
	customCodeTemplateEvidenceObligations,
	customCodeTemplateExecutionIdentity,
	resourceUsageMeasurementShape,
	resourceUsageTemplateSemantics,
} from "./custom-checks/code-templates.ts";
import type {
	CheckEnforcement,
	CheckDefinition,
} from "./contracts.ts";
import {
	ATOMIC_SECURITY_SCANNER_CHECK_PROTOCOL,
	ATOMIC_SECURITY_SCANNER_CHECKS,
} from "./security-scanner-checks.ts";
import {
	canonicalJsonDigest,
	checkRequirementDigest,
} from "./identity.ts";
import {assertResolvedRepairProfiles} from "./repair-profiles.ts";

export const CHECK_CATALOG_VERSION = "13.0.0";

const CHECK_EXECUTOR_IDS = [
	"codewiki.code-check",
	"codewiki.model-check",
	ATOMIC_SECURITY_SCANNER_CHECK_PROTOCOL.id,
	"codewiki.custom-code.resource_usage_limit",
	"codewiki.check-pack.model",
	"codewiki.check-pack.node-esm",
] as const;

const ATOMIC_SECURITY_SCANNER_CHECK_IDS: ReadonlySet<string> = new Set(
	ATOMIC_SECURITY_SCANNER_CHECKS.map((definition) => definition.checkId),
);

export type CheckAuthority = "kernel" | "project";

export interface CheckRegistration {
	check: CheckDefinition;
	loops: SemanticLoop[];
	authority: CheckAuthority;
	rollout: CheckEnforcement;
	dependsOn: string[];
	customCheck?: {
		definition: CustomCheckDefinition;
		checkTypeVersion: string;
		evaluatorId: string;
		standardBindings: readonly CustomCheckEvaluatorStandardBinding[];
	};
	packCheck?: {
		bindingId: string;
		checkId: string;
		evaluatorKind: ProjectCheckDefinition["evaluatorKind"];
		evaluatorPath: string;
		evaluatorDigest: string;
		checkDigest: string;
		configuration: ResolvedCheckConfiguration;
	};
}

export interface CheckCatalog {
	version: typeof CHECK_CATALOG_VERSION;
	customCheckTypeCatalogVersion: typeof CUSTOM_CHECK_TYPE_CATALOG_VERSION;
	customCheckConfigDigest: string;
	checkPackSnapshotDigest: string;
	digest: string;
	get(checkId: string, loop?: SemanticLoop): CheckRegistration | undefined;
	list(loop?: SemanticLoop): CheckRegistration[];
}

const DECISION_BASELINE = [
	[
		"change_revision_ready",
		"One stable, complete Change revision and digest are present.",
	],
	[
		"intention_understood",
		"Current state, desired state, rationale, and non-goals are explicit.",
	],
	["user_value_clear", "User or project outcome is concrete and observable."],
	[
		"outcome_contract_complete",
		"Desired outcome, success signals, and evidence expectations are bounded.",
	],
	["current_state_grounded", "Canonical project refs ground current state."],
	["evidence_sufficient", "Evidence is proportional to candidate risk."],
	[
		"recommendation_justified",
		"Recommendation and rationale are explicit and evidenced.",
	],
	[
		"intention_validated",
		"Evaluation protects user value and long-term project interests.",
	],
	["approval_safety", "Required authority binds the exact candidate."],
	[
		"risks_and_alternatives_considered",
		"Risks, alternatives, invariants, and rollback are proportional.",
	],
	[
		"knowledge_impact_accounted",
		"Knowledge changes or explicit no-impact rationale are complete.",
	],
	[
		"change_kind_classified",
		"Change kind is explicit and supports kind-specific assurance.",
	],
	[
		"delivery_constraints_safe",
		"Delivery constraints preserve Planning authority and safe downstream execution.",
	],
	[
		"active_change_overlap_accounted",
		"Overlapping active Changes are resolved or ordered.",
	],
] as const;

const PLANNING_BASELINE = [
	[
		"approved_change_coverage_complete",
		"Every selected approved Change has executable coverage or explicit resolution.",
	],
	[
		"sprint_boundaries_coherent",
		"Sprint goals, participants, rollback, integration, and dependencies form safe execution groups.",
	],
	[
		"work_items_self_contained",
		"Work Items have stable ownership, outcomes, requirements, evidence obligations, and bounded paths.",
	],
	[
		"cross_change_contribution_explicit",
		"Cross-Change contributions are explicit without duplicating ownership.",
	],
	[
		"technical_requirements_complete",
		"Technical requirements preserve accepted meaning and are executable.",
	],
	[
		"acceptance_and_verification_testable",
		"Acceptance requirements and verification are concrete and testable.",
	],
	[
		"source_ownership_aligned",
		"Components and path/test scopes align with source ownership.",
	],
	[
		"dependency_order_clear",
		"Dependencies exist, remain acyclic, and order overlapping work.",
	],
	[
		"claimed_work_stable",
		"Replanning does not silently mutate active Assignments.",
	],
	[
		"integration_plan_safe",
		"Integration, worktree, preview, and rollback constraints are explicit.",
	],
	[
		"worker_assignment_ready",
		"Work is coherent, independently verifiable, and safely sized.",
	],
	[
		"worker_workbench_buildable",
		"Declared context, capabilities, isolation, assurance, evidence, and budgets can form a bounded Workbench.",
	],
	[
		"uncertainty_resolved",
		"Remaining uncertainty is repaired or routed to its semantic owner.",
	],
	[
		"triggers_valid",
		"Recurring, event, hook, and manual triggers have bounded execution policy.",
	],
	[
		"resolutions_accounted",
		"Non-executable and route-back resolutions carry exact evidence.",
	],
	[
		"traceability_refs_canonical",
		"Change, trace, Knowledge, Git, digest, source, and test refs are canonical.",
	],
] as const;

const IMPLEMENTATION_BASELINE = [
	[
		"approved_change_coverage_complete",
		"Implementation covers the current approved Change requirements.",
	],
	[
		"planning_coverage_complete",
		"Every selected Work Item is known and dispositioned.",
	],
	[
		"scope_controlled",
		"Changed paths remain inside accepted scope and source base.",
	],
	[
		"acceptance_evidence_complete",
		"Every acceptance requirement maps to structured evidence.",
	],
	[
		"verification_passed",
		"Required scoped and aggregate checks are present and passing.",
	],
	[
		"tdd_evidence_valid",
		"Required red and green proof maps to acceptance requirements.",
	],
	[
		"worker_claims_correlated",
		"Worker evidence binds its active Assignment and exact execution identities.",
	],
	[
		"integration_conflicts_resolved",
		"Integrated output has no unresolved scope, base, ownership, or semantic conflict.",
	],
	[
		"content_proof_recorded",
		"Required local provenance and aggregate integrated proof exist.",
	],
	[
		"source_ownership_aligned",
		"Source and test changes align with source ownership.",
	],
	[
		"production_readiness_reviewed",
		"Changed code is maintainable, simple, robust, and production-ready.",
	],
	[
		"outcome_realization_accounted",
		"Delivery and observable outcome dimensions have evidence or explicit disposition.",
	],
	[
		"archive_disposition_ready",
		"Required retention action or retain-hot rationale exists.",
	],
	[
		"uncertainty_resolved",
		"Remaining uncertainty is repaired or routed to its semantic owner.",
	],
	[
		"traceability_refs_canonical",
		"Change, trace, Knowledge, Git, digest, source, and test refs are canonical.",
	],
] as const;

const CONDITIONAL_CHECKS = [
	[
		"fix_reproducible",
		"Fix candidates include reproducible source and expected behavior evidence.",
	],
	[
		"hardening_boundaries_complete",
		"Hardening candidates identify abuse, failure, and negative-test boundaries.",
	],
	[
		"improvement_outcome_observable",
		"Improvement candidates define an observable outcome.",
	],
	[
		"migration_invariants_preserved",
		"Migration candidates preserve declared invariants or bounded equivalence.",
	],
	[
		"security_surface_requirements_complete",
		"Activated security surfaces have explicit trust boundaries, invariants, failure modes, and negative assurance requirements.",
	],
	[
		"security_scanners_valid",
		"Every activated security surface has complete fresh deterministic scanner and advisory Evidence for the exact Candidate/source snapshot.",
	],
	[
		"security_privacy_reviewed",
		"Security and privacy implications are explicitly assessed for this loop.",
	],
	[
		"accessibility_ui_reviewed",
		"UI changes include accessibility and interaction evidence appropriate to this loop.",
	],
	[
		"dependency_risk_controlled",
		"Dependency-surface changes include compatibility, provenance, and risk evidence.",
	],
	[
		"api_contract_reviewed",
		"Public API behavior and compatibility are explicitly bounded.",
	],
	[
		"cli_behavior_verified",
		"CLI behavior, errors, and automation compatibility are explicitly bounded.",
	],
	[
		"library_contract_preserved",
		"Library consumers and public contracts remain accounted for.",
	],
	[
		"persistent_data_safety_reviewed",
		"Persistent-data changes include migration, rollback, and integrity evidence.",
	],
	[
		"typescript_verified",
		"TypeScript or JavaScript changes carry relevant type, lint, and test evidence.",
	],
	[
		"python_verified",
		"Python changes carry relevant lint, type, and test evidence.",
	],
	["go_verified", "Go changes carry relevant vet and test evidence."],
	[
		"rust_verified",
		"Rust changes carry relevant Clippy and test evidence.",
	],
	[
		"shell_verified",
		"Shell changes carry relevant static-analysis and execution evidence.",
	],
] as const;

const LOOP_SPECIFIC_CONDITIONAL_CHECKS = {
	decision: [
		[
			"static_analysis_findings_absent",
			"Static-analysis Evidence for the exact Candidate contains no findings and has complete coverage.",
		],
		[
			"dependency_advisories_absent",
			"Dependency-advisory Evidence for the exact Candidate contains no findings and uses a fresh advisory snapshot.",
		],
		[
			"credential_exposure_absent",
			"Secret-detection Evidence for the exact Candidate contains no credential-exposure findings and has complete coverage.",
		],
		[
			"infrastructure_configuration_verified",
			"Infrastructure-configuration Evidence for the exact Candidate contains no deployment or configuration findings and has complete coverage.",
		],
		[
			"authorization_controls_verified",
			"Authorization-test Evidence for the exact Candidate contains no control failures and has complete coverage.",
		],
		[
			"persistence_safety_verified",
			"Migration-test Evidence for the exact Candidate contains no persistence-safety failures and has complete coverage.",
		],
		[
			"research_provenance_valid",
			"Required research citations have exact provenance, freshness, source identity, and durable passage evidence.",
		],
		[
			"research_claims_supported",
			"Independent assessment accounts for citation support, contradiction, overstatement, alternatives, and uncertainty.",
		],
		[
			"security_independent_challenge_reviewed",
			"A separately routed security challenge independently assesses high or critical residual risk.",
		],
		[
			"security_residual_risk_authorized",
			"A separately authenticated qualified authority explicitly accepts exact high or critical residual risk.",
		],
		[
			"release_intent_authorized",
			"Release intent, authority boundary, and delivery constraints are explicitly accepted.",
		],
	],
	planning: [
		[
			"release_plan_safe",
			"Release sequencing, verification, rollback, and effect authority form a safe plan.",
		],
		[
			"ui_preview_targets_valid",
			"UI Work Items bind valid preview targets, profiles, and evidence obligations.",
		],
	],
	implementation: [
		[
			"release_safety_approved",
			"Release or externally destructive effects have exact authority and safety evidence.",
		],
	],
} as const;

const MODEL_CHECK_IDS = new Set([
	"research_claims_supported",
	"recommendation_justified",
	"intention_validated",
	"production_readiness_reviewed",
	"outcome_realization_accounted",
	"uncertainty_resolved",
	"security_privacy_reviewed",
	"security_independent_challenge_reviewed",
	"accessibility_ui_reviewed",
	"api_contract_reviewed",
	"library_contract_preserved",
	"release_plan_safe",
]);
const HUMAN_CHECK_IDS = new Set([
	"approval_safety",
	"security_residual_risk_authorized",
	"release_intent_authorized",
	"release_safety_approved",
]);
const WORKER_REPORT_CHECK_IDS = new Set(["worker_claims_correlated"]);
const CONTENT_PROOF_CHECK_IDS = new Set(["content_proof_recorded"]);
const EXTERNAL_CHECK_IDS = new Set([
	"verification_passed",
	"tdd_evidence_valid",
	"content_proof_recorded",
	"typescript_verified",
	"python_verified",
	"go_verified",
	"rust_verified",
	"shell_verified",
]);

const CHECK_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
	static_analysis_findings_absent: ["security_scanners_valid"],
	dependency_advisories_absent: ["security_scanners_valid"],
	credential_exposure_absent: ["security_scanners_valid"],
	infrastructure_configuration_verified: ["security_scanners_valid"],
	authorization_controls_verified: ["security_scanners_valid"],
	persistence_safety_verified: ["security_scanners_valid"],
	research_claims_supported: ["research_provenance_valid"],
	security_privacy_reviewed: [
		"security_surface_requirements_complete",
		"security_scanners_valid",
	],
	security_independent_challenge_reviewed: [
		"security_surface_requirements_complete",
		"security_scanners_valid",
	],
	security_residual_risk_authorized: [
		"security_privacy_reviewed",
		"security_independent_challenge_reviewed",
	],
};

const CODEWIKI_CHECK_REGISTRATIONS = builtInRegistrations();

export function createCheckCatalog(input: {
	readonly userStandards: readonly UserStandardDefinition[];
	readonly customChecks: readonly CustomCheckDefinition[];
	readonly checkPacks?: readonly ProjectCheckPack[];
} = {userStandards: [], customChecks: [], checkPacks: []}): CheckCatalog {
	const userStandards = normalizeUserStandardDefinitions(input.userStandards);
	const normalizedCustomChecks = normalizeCustomCheckDefinitions(
		input.customChecks,
		userStandards,
	);
	const customCheckConfigDigest = customCheckConfigurationDigest({
		userStandards,
		customChecks: normalizedCustomChecks,
	});
	const customRegistrations = normalizedCustomChecks
		.filter((definition) => definition.lifecycle === "active")
		.flatMap((definition) =>
			customCheckRegistrations({definition, userStandards}),
		);
	const checkPacks = [...(input.checkPacks ?? [])].sort((left, right) =>
		compareText(left.bindingId, right.bindingId),
	);
	if (new Set(checkPacks.map((pack) => pack.bindingId)).size !== checkPacks.length) {
		throw new Error("Check Catalog cannot contain duplicate Pack bindings.");
	}
	for (const pack of checkPacks) validateCheckPack(pack);
	const checkPackSnapshotDigest = canonicalJsonDigest({
		version: CHECK_PACK_CONFIG_PROTOCOL_VERSION,
		packs: checkPacks.map((pack) => ({
			bindingId: pack.bindingId,
			digest: pack.digest,
		})),
	});
	const registrations = [
		...CODEWIKI_CHECK_REGISTRATIONS,
		...customRegistrations,
		...checkPacks.flatMap(checkPackRegistrations),
	]
		.map((registration) => normalizeRegistration({registration, userStandards}))
		.sort(compareRegistrations);
	const byKey = new Map<string, CheckRegistration>();
	for (const registration of registrations) {
		validateRegistration(registration, userStandards);
		for (const loop of registration.loops) {
			const key = registrationKey(loop, registration.check.id);
			if (byKey.has(key)) {
				throw new Error(
					`Duplicate Check registration ${registration.check.id} for ${loop}.`,
				);
			}
			byKey.set(key, registration);
		}
	}
	for (const registration of registrations) {
		for (const dependency of registration.dependsOn) {
			for (const loop of registration.loops) {
				if (!byKey.has(registrationKey(loop, dependency))) {
					throw new Error(
						`Check ${registration.check.id} dependency ${dependency} is not registered for ${loop}.`,
					);
				}
			}
		}
	}
	assertAcyclicCatalog(registrations);
	const digest = canonicalJsonDigest({
		version: CHECK_CATALOG_VERSION,
		customCheckTypeCatalogVersion: CUSTOM_CHECK_TYPE_CATALOG_VERSION,
		customCheckConfigDigest,
		checkPackSnapshotDigest,
		registrations,
	});
	return Object.freeze({
		version: CHECK_CATALOG_VERSION,
		customCheckTypeCatalogVersion: CUSTOM_CHECK_TYPE_CATALOG_VERSION,
		customCheckConfigDigest,
		checkPackSnapshotDigest,
		digest,
		get: (checkId: string, loop?: SemanticLoop) => {
			if (loop) {
				return cloneRegistration({
					registration: byKey.get(registrationKey(loop, checkId)),
					userStandards,
				});
			}
			const matches = registrations.filter(
				(registration) => registration.check.id === checkId,
			);
			if (matches.length > 1) {
				throw new Error(
					`Check ${checkId} is registered independently for multiple loops; loop is required.`,
				);
			}
			return cloneRegistration({
				registration: matches[0],
				userStandards,
			});
		},
		list: (loop?: SemanticLoop) =>
			registrations.flatMap((registration) => {
				const clone = cloneRegistration({registration, userStandards});
				return (!loop || registration.loops.includes(loop)) && clone
					? [clone]
					: [];
			}),
	});
}

function validateCheckPack(pack: ProjectCheckPack): void {
	const configurationDigest = canonicalJsonDigest(pack.configuration);
	if (configurationDigest !== pack.configurationDigest) {
		throw new Error(`Check Pack ${pack.bindingId} configuration digest mismatch.`);
	}
	if (
		new Set(pack.checks.map((check) => check.checkId)).size !==
		pack.checks.length
	) {
		throw new Error(`Check Pack ${pack.bindingId} contains duplicate Check ids.`);
	}
	if (pack.checks.some((check) => check.bindingId !== pack.bindingId)) {
		throw new Error(`Check Pack ${pack.bindingId} contains a Check from another binding.`);
	}
	const expectedDigest = canonicalJsonDigest({
		version: CHECK_PACK_CONFIG_PROTOCOL_VERSION,
		bindingId: pack.bindingId,
		configurationDigest,
		checks: pack.checks.map((check) => ({id: check.id, digest: check.digest})),
	});
	if (pack.digest !== expectedDigest) {
		throw new Error(`Check Pack ${pack.bindingId} content digest mismatch.`);
	}
}

function checkPackRegistrations(pack: ProjectCheckPack): CheckRegistration[] {
	return [...pack.checks]
		.sort((left, right) => compareText(left.id, right.id))
		.map((definition) => {
			const executionKind =
				definition.evaluatorKind === "model" ? "model" : "code";
			const requirement =
				definition.evaluatorKind === "model"
					? definition.evaluatorSource.trim()
					: `Code evaluator ${definition.id} must return a passing Check Observation.`;
			return {
				check: {
					id: definition.id,
					version: CHECK_PACK_CONFIG_PROTOCOL_VERSION,
					description: `Project Check ${definition.bindingId}/${definition.checkId}.`,
					requirement,
					requirementDigest: checkRequirementDigest(requirement),
					execution: {
						id:
							definition.evaluatorKind === "model"
								? "codewiki.check-pack.model"
								: "codewiki.check-pack.node-esm",
						version: CHECK_PACK_CONFIG_PROTOCOL_VERSION,
						kind: executionKind,
					},
					measurement: {kind: "qualitative", shape: "boolean"},
					evidenceObligations: [],
					repairTarget: `Address findings from ${definition.id}.`,
					cost: checkCost(executionKind),
					timeoutMs: definition.configuration.execution.timeoutMs,
					protected: false,
				},
				loops: [...definition.configuration.applicability.stages],
				authority: "project",
				rollout: definition.configuration.enforcement,
				dependsOn: [],
				packCheck: {
					bindingId: definition.bindingId,
					checkId: definition.checkId,
					evaluatorKind: definition.evaluatorKind,
					evaluatorPath: definition.evaluatorPath,
					evaluatorDigest: definition.evaluatorDigest,
					checkDigest: definition.digest,
					configuration: definition.configuration,
				},
			};
		});
}

function customCheckRegistrations(input: {
	readonly definition: CustomCheckDefinition;
	readonly userStandards: readonly UserStandardDefinition[];
}): CheckRegistration[] {
	const definition = input.definition;
	const checkType = getCustomCheckType(definition.checkTypeId);
	const loops = definition.appliesWhen.loops?.length
		? definition.appliesWhen.loops
		: checkType.loops;
	const checkId = customCheckDefinitionCheckId(definition);
	const codeTemplate = definition.evaluator === "code"
		? definition.codeTemplate
		: undefined;
	if (definition.evaluator === "code" && !codeTemplate) {
		throw new Error(`Custom Code Check ${definition.customCheckId} has no template.`);
	}
	const execution = codeTemplate
		? customCodeTemplateExecutionIdentity(codeTemplate)
		: {id: "codewiki.model-check", version: "1.0.0", kind: "model" as const};
	const semantics = codeTemplate
		? resourceUsageTemplateSemantics(codeTemplate.parameters)
		: undefined;
	return loops.map((loop) => ({
		check: {
			id: checkId,
			version: definition.schemaVersion,
			description: `Custom Check: ${definition.name}`,
			requirement: definition.requirement,
			requirementDigest: checkRequirementDigest(definition.requirement),
			execution,
			measurement: semantics
				? {
						kind: "quantitative",
						shape: resourceUsageMeasurementShape(semantics.metric),
						minimum: 0,
						maximum: semantics.maximum,
					}
				: {kind: "qualitative", shape: "boolean"},
			evidenceObligations: codeTemplate
				? [...customCodeTemplateEvidenceObligations(codeTemplate)]
				: evidenceObligations(checkId, "model"),
			repairTarget: "custom-check",
			cost: codeTemplate ? 1 : checkCost("model"),
			timeoutMs: codeTemplate ? 5_000 : checkTimeout("model"),
			protected: false,
		},
		loops: [loop],
		authority: "project",
		rollout: "require",
		dependsOn: [...(checkType.prerequisites[loop] ?? [])],
		customCheck: {
			definition,
			checkTypeVersion: checkType.version,
			evaluatorId: codeTemplate ? execution.id : checkType.evaluatorId,
			standardBindings: customCheckStandardBindings({
				definition,
				userStandards: input.userStandards,
			}),
		},
	}));
}

function customCheckStandardBindings(input: {
	readonly definition: CustomCheckDefinition;
	readonly userStandards: readonly UserStandardDefinition[];
}): CustomCheckEvaluatorStandardBinding[] {
	return input.definition.standardRefs.map((reference) => {
		const standard = input.userStandards.find(
			(candidate) => candidate.userStandardId === reference.userStandardId,
		);
		if (!standard || standard.standardDigest !== reference.standardDigest) {
			throw new Error(
				`Custom Check ${input.definition.customCheckId} has an invalid User Standard binding.`,
			);
		}
		const passageById = new Map(
			standard.passages.map((passage) => [passage.passageId, passage]),
		);
		return {
			userStandardId: standard.userStandardId,
			standardDigest: standard.standardDigest,
			name: standard.name,
			source: {
				kind: standard.source.kind,
				mediaType: standard.source.mediaType,
				contentDigest: standard.source.contentDigest,
				observedAt: standard.source.observedAt,
				...(standard.source.uri ? {uri: standard.source.uri} : {}),
			},
			passages: reference.passageIds.map((passageId) => {
				const passage = passageById.get(passageId);
				if (!passage) {
					throw new Error(
						`Custom Check ${input.definition.customCheckId} has an invalid User Standard passage binding.`,
					);
				}
				return {passageId: passage.passageId, text: passage.text};
			}),
		};
	});
}

function builtInRegistrations(): CheckRegistration[] {
	const byId = new Map<
		string,
		{ description: string; loops: Set<SemanticLoop> }
	>();
	addDefinitions(byId, "decision", DECISION_BASELINE);
	addDefinitions(byId, "planning", PLANNING_BASELINE);
	addDefinitions(byId, "implementation", IMPLEMENTATION_BASELINE);
	addDefinitions(
		byId,
		["decision", "planning", "implementation"],
		CONDITIONAL_CHECKS.slice(0, 13),
	);
	addDefinitions(byId, "implementation", CONDITIONAL_CHECKS.slice(13));
	addDefinitions(byId, "decision", LOOP_SPECIFIC_CONDITIONAL_CHECKS.decision);
	addDefinitions(byId, "planning", LOOP_SPECIFIC_CONDITIONAL_CHECKS.planning);
	addDefinitions(
		byId,
		"implementation",
		LOOP_SPECIFIC_CONDITIONAL_CHECKS.implementation,
	);
	return [...byId.entries()].map(([id, definition]) =>
		kernelRegistration(id, definition.description, [...definition.loops]),
	);
}

function addDefinitions(
	...args: [
		Map<string, {description: string; loops: Set<SemanticLoop>}>,
		SemanticLoop | SemanticLoop[],
		readonly (readonly [string, string])[],
	]
): void {
	const [byId, loops, definitions] = args;
	for (const [id, description] of definitions) {
		const current = byId.get(id);
		if (current) {
			for (const loop of asArray(loops)) current.loops.add(loop);
			continue;
		}
		byId.set(id, { description, loops: new Set(asArray(loops)) });
	}
}

function kernelRegistration(
	...args: [string, string, SemanticLoop[]]
): CheckRegistration {
	const [id, description, loops] = args;
	const kind = checkExecutionKind(id);
	const executionId = executionIdForCheck(id, kind);
	const executionVersion = ATOMIC_SECURITY_SCANNER_CHECK_IDS.has(id)
		? ATOMIC_SECURITY_SCANNER_CHECK_PROTOCOL.version
		: "1.0.0";
	return {
		check: {
			id,
			version: "1.0.0",
			description,
			requirement: description,
			requirementDigest: checkRequirementDigest(description),
			execution: {id: executionId, version: executionVersion, kind},
			measurement: {
				kind: kind === "model" ? "qualitative" : "quantitative",
				shape: "boolean",
			},
			evidenceObligations: evidenceObligations(id, kind),
			repairTarget: "loop-candidate",
			cost: checkCost(kind),
			timeoutMs: checkTimeout(kind),
			protected: true,
		},
		loops,
		authority: "kernel",
		rollout: "require",
		dependsOn: [...(CHECK_DEPENDENCIES[id] ?? [])],
	};
}

function checkExecutionKind(id: string): CheckDefinition["execution"]["kind"] {
	return MODEL_CHECK_IDS.has(id) ? "model" : "code";
}

function executionIdForCheck(
	...args: [string, CheckDefinition["execution"]["kind"]]
): (typeof CHECK_EXECUTOR_IDS)[number] {
	const [id, kind] = args;
	if (ATOMIC_SECURITY_SCANNER_CHECK_IDS.has(id)) {
		return ATOMIC_SECURITY_SCANNER_CHECK_PROTOCOL.id;
	}
	return kind === "model" ? "codewiki.model-check" : "codewiki.code-check";
}

function checkCost(kind: CheckDefinition["execution"]["kind"]): number {
	return kind === "model" ? 4 : 1;
}

function checkTimeout(kind: CheckDefinition["execution"]["kind"]): number {
	return kind === "model" ? 30_000 : 5_000;
}

function evidenceObligations(
	...args: [string, CheckDefinition["execution"]["kind"]]
): EvidenceObligation[] {
	const [id, kind] = args;
	if (id === "research_provenance_valid") {
		return [researchCitationObligation()];
	}
	if (id === "research_claims_supported") {
		return [
			researchCitationObligation(),
			obligation({
				id: "model-assessment",
				kinds: ["model_assessment"],
				producerKinds: ["model"],
				authorities: ["observed"],
				coverages: ["complete"],
				subject: "candidate",
				freshness: "none",
				artifact: "optional",
			}),
		];
	}
	if (
		id === "security_scanners_valid" ||
		ATOMIC_SECURITY_SCANNER_CHECK_IDS.has(id)
	) {
		return [
			obligation({
				id: "scanner-command-execution",
				kinds: ["command_execution"],
				producerKinds: ["runtime"],
				authorities: ["observed"],
				coverages: ["complete", "partial", "unknown"],
				subject: "candidate",
				freshness: "none",
				artifact: "optional",
			}),
			obligation({
				id: "scanner-source-observation",
				kinds: ["source_observation"],
				producerKinds: ["runtime"],
				authorities: ["observed"],
				coverages: ["complete", "partial", "unknown"],
				subject: "candidate",
				freshness: "none",
				artifact: "optional",
			}),
		];
	}
	if (
		id === "security_privacy_reviewed" ||
		id === "security_independent_challenge_reviewed"
	) {
		return [
			obligation({
				id: "model-assessment",
				kinds: ["model_assessment"],
				producerKinds: ["model"],
				authorities: ["asserted"],
				coverages: ["complete"],
				subject: "candidate",
				freshness: "none",
				artifact: "optional",
			}),
		];
	}
	if (HUMAN_CHECK_IDS.has(id)) {
		return [
			obligation({
				id: "approval-receipt",
				kinds: ["approval_receipt"],
				producerKinds: ["user", "external_service"],
				authorities: ["approved"],
				coverages: ["complete"],
				subject: "candidate",
				freshness: "none",
				artifact: "optional",
			}),
		];
	}
	if (WORKER_REPORT_CHECK_IDS.has(id)) {
		return [
			obligation({
				id: "worker-report",
				kinds: ["worker_report"],
				producerKinds: ["worker"],
				authorities: ["asserted"],
				coverages: ["complete"],
				subject: "candidate_source_tree",
				freshness: "exact_boundary",
				artifact: "optional",
			}),
		];
	}
	if (CONTENT_PROOF_CHECK_IDS.has(id)) {
		return [
			obligation({
				id: "integration-proof",
				kinds: ["integration_proof", "source_observation"],
				producerKinds: ["runtime"],
				authorities: ["verified"],
				coverages: ["complete"],
				subject: "candidate_source_tree",
				freshness: "exact_boundary",
				artifact: "optional",
			}),
		];
	}
	if (EXTERNAL_CHECK_IDS.has(id)) {
		return [
			obligation({
				id: "command-execution",
				kinds: ["command_execution"],
				producerKinds: ["runtime", "external_service"],
				authorities: ["observed", "verified"],
				coverages: ["complete"],
				subject: "candidate_source_tree",
				freshness: "exact_boundary",
				artifact: "required",
			}),
		];
	}
	if (kind === "model") {
		return [
			obligation({
				id: "model-assessment",
				kinds: ["model_assessment"],
				producerKinds: ["model"],
				authorities: ["observed"],
				coverages: ["complete"],
				subject: "candidate",
				freshness: "none",
				artifact: "optional",
			}),
		];
	}
	return [];
}

function researchCitationObligation(): EvidenceObligation {
	return createEvidenceObligation({
		id: "research-citations",
		version: EVIDENCE_OBLIGATION_VERSION,
		kinds: ["research_citation"],
		producerKinds: ["runtime", "external_service"],
		authorities: ["observed", "verified"],
		coverages: ["complete"],
		sensitivities: ["public", "project", "private"],
		minimumCount: 1,
		subject: "change_revision",
		freshness: "exact_boundary",
		artifact: "optional",
		contradiction: "retain",
	});
}

function obligation(
	input: Omit<
		EvidenceObligation,
		"version" | "sensitivities" | "minimumCount" | "contradiction"
	>,
): EvidenceObligation {
	return createEvidenceObligation({
		...input,
		version: EVIDENCE_OBLIGATION_VERSION,
		sensitivities: ["public", "project", "private"],
		minimumCount: 1,
		contradiction: "indeterminate",
	});
}

function registrationKey(...args: [SemanticLoop, string]): string {
	const [loop, checkId] = args;
	return `${loop}:${checkId}`;
}

function compareRegistrations(
	...args: [CheckRegistration, CheckRegistration]
): number {
	const [left, right] = args;
	return (
		left.check.id.localeCompare(right.check.id) ||
		left.loops.join(",").localeCompare(right.loops.join(","))
	);
}

function normalizeRegistration(input: {
	readonly registration: CheckRegistration;
	readonly userStandards: readonly UserStandardDefinition[];
}): CheckRegistration {
	const {registration, userStandards} = input;
	return {
		...registration,
		check: {
			...registration.check,
			evidenceObligations: registration.check.evidenceObligations
				.map((entry) => createEvidenceObligation(entry))
				.sort(compareObligations),
			execution: { ...registration.check.execution },
			measurement: { ...registration.check.measurement },
		},
		loops: unique(registration.loops).sort(compareText),
		dependsOn: unique(registration.dependsOn).sort(compareText),
		...(registration.customCheck
			? {
					customCheck: {
						...registration.customCheck,
						definition: normalizeCustomCheckDefinitions(
							[registration.customCheck.definition],
							userStandards,
						)[0],
						standardBindings: registration.customCheck.standardBindings.map(
							(standard) => ({
								...standard,
								source: {...standard.source},
								passages: standard.passages.map((passage) => ({...passage})),
							}),
						),
					},
				}
			: {}),
		...(registration.packCheck
			? {packCheck: clonePackCheckRegistration(registration.packCheck)}
			: {}),
	};
}

function validateRegistration(
	...args: [CheckRegistration, readonly UserStandardDefinition[]]
): void {
	const [registration, userStandards] = args;
	validateCheckShape(registration);
	validateClosedExecutionInputs(registration);
	validateCheckAuthority(registration, userStandards);
}

function validateCheckShape(
	registration: CheckRegistration,
): void {
	const check = registration.check;
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(check.id)) {
		throw new Error("Check registration requires a stable id.");
	}
	if (!check.version.trim() || !check.description.trim()) {
		throw new Error(
			`Check ${check.id} requires version and description.`,
		);
	}
	if (!check.requirement.trim() || registration.loops.length === 0) {
		throw new Error(`Check ${check.id} requires one requirement and loops.`);
	}
	const expectedRequirementDigest = checkRequirementDigest(check.requirement);
	if (check.requirementDigest !== expectedRequirementDigest) {
		throw new Error(
			`Check ${check.id} requirement digest mismatch: expected ${expectedRequirementDigest}.`,
		);
	}
	const obligationIds = check.evidenceObligations.map((entry) => entry.id);
	if (new Set(obligationIds).size !== obligationIds.length) {
		throw new Error(`Check ${check.id} evidence obligation ids must be unique.`);
	}
}

function validateClosedExecutionInputs(
	registration: CheckRegistration,
): void {
	const check = registration.check;
	if (
		!(CHECK_EXECUTOR_IDS as readonly string[]).includes(check.execution.id)
	) {
		throw new Error(
			`Check ${check.id} uses unknown execution ${check.execution.id}.`,
		);
	}
}

function validateCheckAuthority(
	...args: [CheckRegistration, readonly UserStandardDefinition[]]
): void {
	const [registration, userStandards] = args;
	const check = registration.check;
	if (registration.authority === "kernel") {
		if (registration.customCheck || registration.packCheck) {
			throw new Error(`Kernel Check ${check.id} cannot carry project Check data.`);
		}
		if (!check.protected || registration.rollout !== "require") {
			throw new Error(
				`Kernel Check ${check.id} must be protected and required.`,
			);
		}
		return;
	}
	if (check.protected) {
		throw new Error(
			`Only kernel Checks may be protected: ${check.id}.`,
		);
	}
	if (registration.customCheck && registration.packCheck) {
		throw new Error(`Project Check ${check.id} cannot carry two definitions.`);
	}
	if (registration.packCheck) {
		validatePackCheckRegistration(registration);
		return;
	}
	validateCustomCheckRegistration(registration, userStandards);
}

function validatePackCheckRegistration(registration: CheckRegistration): void {
	const packCheck = registration.packCheck;
	if (!packCheck) {
		throw new Error(`Project Check ${registration.check.id} requires Pack Check data.`);
	}
	const expectedId = `check-pack:${packCheck.bindingId}:${packCheck.checkId}`;
	if (registration.check.id !== expectedId) {
		throw new Error("Pack Check registration identity does not match its path.");
	}
	const expectedExecution =
		packCheck.evaluatorKind === "model"
			? {id: "codewiki.check-pack.model", kind: "model"}
			: {id: "codewiki.check-pack.node-esm", kind: "code"};
	if (
		registration.check.execution.id !== expectedExecution.id ||
		registration.check.execution.kind !== expectedExecution.kind
	) {
		throw new Error("Pack Check execution identity does not match its evaluator.");
	}
	const {digest: configurationDigest, ...configuration} =
		packCheck.configuration;
	if (canonicalJsonDigest(configuration) !== configurationDigest) {
		throw new Error("Pack Check resolved configuration digest mismatch.");
	}
	assertResolvedRepairProfiles(packCheck.configuration.repairProfiles);
	if (packCheck.configuration.applicability.changeKinds.length === 0) {
		throw new Error("Pack Check must select at least one Change kind.");
	}
	if (registration.rollout !== packCheck.configuration.enforcement) {
		throw new Error("Pack Check rollout does not match resolved configuration.");
	}
	if (
		registration.check.timeoutMs !==
		packCheck.configuration.execution.timeoutMs
	) {
		throw new Error("Pack Check timeout does not match resolved configuration.");
	}
	if (
		canonicalJsonDigest({
			version: CHECK_PACK_CONFIG_PROTOCOL_VERSION,
			id: expectedId,
			evaluatorKind: packCheck.evaluatorKind,
			evaluatorPath: packCheck.evaluatorPath,
			evaluatorDigest: packCheck.evaluatorDigest,
			configurationDigest: packCheck.configuration.digest,
		}) !== packCheck.checkDigest
	) {
		throw new Error("Pack Check digest does not match its content identity.");
	}
	const configuredLoops = [...packCheck.configuration.applicability.stages].sort(
		compareText,
	);
	if (
		configuredLoops.length !== registration.loops.length ||
		configuredLoops.some((loop, index) => loop !== registration.loops[index])
	) {
		throw new Error("Pack Check loops do not match resolved applicability.");
	}
}

function validateCustomCheckRegistration(
	...args: [CheckRegistration, readonly UserStandardDefinition[]]
): void {
	const [registration, userStandards] = args;
	const customCheck = registration.customCheck;
	if (!customCheck) {
		throw new Error(
			`Project-authority Check ${registration.check.id} requires Custom Check data.`,
		);
	}
	assertCustomCheckDefinition(customCheck.definition, userStandards);
	if (customCheck.definition.lifecycle !== "active") {
		throw new Error(
			`Custom Check ${customCheck.definition.customCheckId} must be active before registration.`,
		);
	}
	if (
		registration.check.id !==
		customCheckDefinitionCheckId(customCheck.definition)
	) {
		throw new Error("Custom Check registration identity does not match definition.");
	}
	if (registration.check.execution.kind !== customCheck.definition.evaluator) {
		throw new Error("Custom Check execution kind does not match its evaluator.");
	}
	if (customCheck.definition.evaluator === "code") {
		if (!customCheck.definition.codeTemplate) {
			throw new Error("Custom Code Check registration requires a template binding.");
		}
		const expected = customCodeTemplateExecutionIdentity(
			customCheck.definition.codeTemplate,
		);
		if (
			registration.check.execution.id !== expected.id ||
			registration.check.execution.version !== expected.version
		) {
			throw new Error(
				"Custom Code Check execution identity does not match its template binding.",
			);
		}
	}
	if (registration.rollout !== "require") {
		throw new Error("Active Custom Checks must be required.");
	}
}

function assertAcyclicCatalog(
	registrations: CheckRegistration[],
): void {
	const byKey = new Map<string, CheckRegistration>();
	for (const registration of registrations) {
		for (const loop of registration.loops) {
			byKey.set(registrationKey(loop, registration.check.id), registration);
		}
	}
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (key: string): void => {
		if (visiting.has(key)) {
			throw new Error(`Check catalog dependency cycle includes ${key}.`);
		}
		if (visited.has(key)) return;
		visiting.add(key);
		const registration = byKey.get(key);
		const loop = key.slice(0, key.indexOf(":")) as SemanticLoop;
		for (const dependency of registration?.dependsOn ?? []) {
			visit(registrationKey(loop, dependency));
		}
		visiting.delete(key);
		visited.add(key);
	};
	for (const key of byKey.keys()) visit(key);
}

function clonePackCheckRegistration(
	packCheck: NonNullable<CheckRegistration["packCheck"]>,
): NonNullable<CheckRegistration["packCheck"]> {
	return {
		...packCheck,
		configuration: {
			...packCheck.configuration,
			applicability: {
				stages: [...packCheck.configuration.applicability.stages],
				paths: [...packCheck.configuration.applicability.paths],
				languages: [...packCheck.configuration.applicability.languages],
				changeTypes: [...packCheck.configuration.applicability.changeTypes],
				changeKinds: [...packCheck.configuration.applicability.changeKinds],
			},
			input: {paths: [...packCheck.configuration.input.paths]},
			execution: {
				...packCheck.configuration.execution,
				capabilities: [...packCheck.configuration.execution.capabilities],
			},
		},
	};
}

function cloneRegistration(input: {
	readonly registration: CheckRegistration | undefined;
	readonly userStandards: readonly UserStandardDefinition[];
}): CheckRegistration | undefined {
	return input.registration
		? normalizeRegistration({
				registration: input.registration,
				userStandards: input.userStandards,
			})
		: undefined;
}

function asArray<T>(value: T | T[]): T[] {
	return Array.isArray(value) ? value : [value];
}

function unique<T>(values: T[]): T[] {
	return [...new Set(values)];
}

function compareObligations(
	...args: [EvidenceObligation, EvidenceObligation]
): number {
	return Number(args[0].id > args[1].id) - Number(args[0].id < args[1].id);
}

function compareText(...args: [string, string]): number {
	return Number(args[0] > args[1]) - Number(args[0] < args[1]);
}
