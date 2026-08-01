import {
	EVIDENCE_OBLIGATION_VERSION,
	createEvidenceObligation,
} from "../evidence/obligations.ts";
import type { EvidenceObligation } from "../evidence/obligations.ts";
import type { SemanticLoop } from "../semantic-loop.ts";
import type { CustomCheckDefinition } from "./custom-checks/contracts.ts";
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
import type {
	CheckEnforcement,
	CheckDefinition,
} from "./contracts.ts";
import {
	canonicalJsonDigest,
	checkRequirementDigest,
} from "./identity.ts";

export const CHECK_CATALOG_VERSION = "4.0.0";

const CHECK_EXECUTOR_IDS = [
	"codewiki.code-check",
	"codewiki.model-check",
] as const;

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
	};
}

export interface CheckCatalog {
	version: typeof CHECK_CATALOG_VERSION;
	customCheckTypeCatalogVersion: typeof CUSTOM_CHECK_TYPE_CATALOG_VERSION;
	customCheckConfigDigest: string;
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
			"research_provenance_valid",
			"Required research citations have exact provenance, freshness, source identity, and durable passage evidence.",
		],
		[
			"research_claims_supported",
			"Independent assessment accounts for citation support, contradiction, overstatement, alternatives, and uncertainty.",
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
	"accessibility_ui_reviewed",
	"api_contract_reviewed",
	"library_contract_preserved",
	"release_plan_safe",
]);
const HUMAN_CHECK_IDS = new Set([
	"approval_safety",
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
	research_claims_supported: ["research_provenance_valid"],
	security_privacy_reviewed: [
		"security_surface_requirements_complete",
		"security_scanners_valid",
	],
};

const CODEWIKI_CHECK_REGISTRATIONS = builtInRegistrations();

export function createCheckCatalog(
	customChecks: readonly CustomCheckDefinition[] = [],
): CheckCatalog {
	const normalizedCustomChecks = normalizeCustomCheckDefinitions(customChecks);
	const customCheckConfigDigest = customCheckConfigurationDigest(
		normalizedCustomChecks,
	);
	const customRegistrations = normalizedCustomChecks
		.filter((definition) => definition.lifecycle === "active")
		.flatMap(customCheckRegistrations);
	const registrations = [
		...CODEWIKI_CHECK_REGISTRATIONS,
		...customRegistrations,
	]
		.map(normalizeRegistration)
		.sort(compareRegistrations);
	const byKey = new Map<string, CheckRegistration>();
	for (const registration of registrations) {
		validateRegistration(registration);
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
		registrations,
	});
	return Object.freeze({
		version: CHECK_CATALOG_VERSION,
		customCheckTypeCatalogVersion: CUSTOM_CHECK_TYPE_CATALOG_VERSION,
		customCheckConfigDigest,
		digest,
		get: (checkId: string, loop?: SemanticLoop) => {
			if (loop) {
				return cloneRegistration(byKey.get(registrationKey(loop, checkId)));
			}
			const matches = registrations.filter(
				(registration) => registration.check.id === checkId,
			);
			if (matches.length > 1) {
				throw new Error(
					`Check ${checkId} is registered independently for multiple loops; loop is required.`,
				);
			}
			return cloneRegistration(matches[0]);
		},
		list: (loop?: SemanticLoop) =>
			registrations.flatMap((registration) => {
				const clone = cloneRegistration(registration);
				return (!loop || registration.loops.includes(loop)) && clone
					? [clone]
					: [];
			}),
	});
}

function customCheckRegistrations(
	definition: CustomCheckDefinition,
): CheckRegistration[] {
	const checkType = getCustomCheckType(definition.checkTypeId);
	const loops = definition.appliesWhen.loops?.length
		? definition.appliesWhen.loops
		: checkType.loops;
	const checkId = customCheckDefinitionCheckId(definition);
	return loops.map((loop) => ({
		check: {
			id: checkId,
			version: definition.schemaVersion,
			description: `Custom Check: ${definition.name}`,
			requirement: definition.requirement,
			requirementDigest: checkRequirementDigest(definition.requirement),
			execution: {
				id: "codewiki.model-check",
				version: "1.0.0",
				kind: "model",
			},
			measurement: { kind: "qualitative", shape: "boolean" },
			evidenceObligations: evidenceObligations(checkId, "model"),
			repairTarget: "custom-check",
			cost: checkCost("model"),
			timeoutMs: checkTimeout("model"),
			protected: false,
		},
		loops: [loop],
		authority: "project",
		rollout: "require",
		dependsOn: [...(checkType.prerequisites[loop] ?? [])],
		customCheck: {
			definition,
			checkTypeVersion: checkType.version,
			evaluatorId: checkType.evaluatorId,
		},
	}));
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
	byId: Map<string, { description: string; loops: Set<SemanticLoop> }>,
	loops: SemanticLoop | SemanticLoop[],
	definitions: readonly (readonly [string, string])[],
): void {
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
	id: string,
	description: string,
	loops: SemanticLoop[],
): CheckRegistration {
	const kind = checkExecutionKind(id);
	const executionId = executionIdForKind(kind);
	return {
		check: {
			id,
			version: "1.0.0",
			description,
			requirement: description,
			requirementDigest: checkRequirementDigest(description),
			execution: { id: executionId, version: "1.0.0", kind },
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

function executionIdForKind(
	kind: CheckDefinition["execution"]["kind"],
): (typeof CHECK_EXECUTOR_IDS)[number] {
	return kind === "model" ? "codewiki.model-check" : "codewiki.code-check";
}

function checkCost(kind: CheckDefinition["execution"]["kind"]): number {
	return kind === "model" ? 4 : 1;
}

function checkTimeout(kind: CheckDefinition["execution"]["kind"]): number {
	return kind === "model" ? 30_000 : 5_000;
}

function evidenceObligations(
	id: string,
	kind: CheckDefinition["execution"]["kind"],
): EvidenceObligation[] {
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
	if (id === "security_scanners_valid") {
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
	if (id === "security_privacy_reviewed") {
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
				artifact: "optional",
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

function registrationKey(loop: SemanticLoop, checkId: string): string {
	return `${loop}:${checkId}`;
}

function compareRegistrations(
	left: CheckRegistration,
	right: CheckRegistration,
): number {
	return (
		left.check.id.localeCompare(right.check.id) ||
		left.loops.join(",").localeCompare(right.loops.join(","))
	);
}

function normalizeRegistration(
	registration: CheckRegistration,
): CheckRegistration {
	return {
		...registration,
		check: {
			...registration.check,
			evidenceObligations: registration.check.evidenceObligations
				.map((entry) => createEvidenceObligation(entry))
				.sort((left, right) => compareText(left.id, right.id)),
			execution: { ...registration.check.execution },
			measurement: { ...registration.check.measurement },
		},
		loops: unique(registration.loops).sort(compareText),
		dependsOn: unique(registration.dependsOn).sort(compareText),
		...(registration.customCheck
			? {
					customCheck: {
						...registration.customCheck,
						definition: normalizeCustomCheckDefinitions([
							registration.customCheck.definition,
						])[0],
					},
				}
			: {}),
	};
}

function validateRegistration(registration: CheckRegistration): void {
	validateCheckShape(registration);
	validateClosedExecutionInputs(registration);
	validateCheckAuthority(registration);
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
	registration: CheckRegistration,
): void {
	const check = registration.check;
	if (registration.authority === "kernel") {
		if (registration.customCheck) {
			throw new Error(`Kernel Check ${check.id} cannot carry Custom Check data.`);
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
	validateCustomCheckRegistration(registration);
}

function validateCustomCheckRegistration(
	registration: CheckRegistration,
): void {
	const customCheck = registration.customCheck;
	if (!customCheck) {
		throw new Error(
			`Project-authority Check ${registration.check.id} requires Custom Check data.`,
		);
	}
	assertCustomCheckDefinition(customCheck.definition);
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
	if (registration.check.execution.kind !== "model") {
		throw new Error("V1 Custom Checks must execute as Model Checks.");
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

function cloneRegistration(
	registration: CheckRegistration | undefined,
): CheckRegistration | undefined {
	return registration ? normalizeRegistration(registration) : undefined;
}

function asArray<T>(value: T | T[]): T[] {
	return Array.isArray(value) ? value : [value];
}

function unique<T>(values: T[]): T[] {
	return [...new Set(values)];
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
