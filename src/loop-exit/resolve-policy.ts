import {
	CHANGE_KIND_VALUES,
	CHANGE_RISK_VALUES,
	CHANGE_TYPE_VALUES,
	type ChangeKind,
	type ChangeRisk,
	type ChangeType,
} from "../changes/types.ts";
import type { SemanticLoop } from "../semantic-loop.ts";
import {
	toCanonicalJsonValue,
	type CanonicalJsonValue,
} from "../utils/canonical-json.ts";
import {
	createResolvedExitPolicy,
	resolvedExitPolicyDigest,
	type CheckEnforcement,
	type CheckJsonValue,
	type CheckExclusionReason,
	type ResolvedExitPolicy,
	type CheckBinding,
	sortedCheckJsonObject,
} from "./contracts.ts";
import {
	createCheckCatalog,
	type CheckRegistration,
	type CheckCatalog,
} from "./catalog.ts";
import {
	assertProtectedCustomCheckConfigSnapshot,
	type ProtectedCustomCheckConfigSnapshot,
} from "./custom-checks/configuration.ts";
import type {CustomCheckDefinition} from "./custom-checks/contracts.ts";
import { loopQualifiedCheckDigest } from "./identity.ts";
import {
	SECURITY_SURFACES,
	assertSecuritySurfaceClassification,
	type SecuritySurface,
	type SecuritySurfaceClassification,
} from "./security-surfaces.ts";

const EXIT_POLICY_SELECTOR_VERSION = "2.0.0";

const PROJECT_TRAITS = [
	"web-ui",
	"public-api",
	"cli",
	"library",
	"persistent-data",
	"handles-personal-data",
	"security-sensitive",
	"release-producing",
] as const;
const TECHNOLOGIES = [
	"typescript",
	"javascript",
	"python",
	"go",
	"rust",
	"shell",
] as const;

type ProjectTrait = (typeof PROJECT_TRAITS)[number];
type Technology = (typeof TECHNOLOGIES)[number];
type PathTrait = "ui" | "dependency" | "release";

interface ChangeSelectorFacts {
	changeId: string;
	revision: number;
	digest: string;
	kind: ChangeKind;
	type: ChangeType;
	risk: ChangeRisk;
	affectedLayers: string[];
}

interface ApprovedCheckAddition {
	checkId: string;
	checkVersion: string;
	authorityRef: string;
	parameters?: Record<string, CheckJsonValue>;
}

interface ApprovedCheckExclusion {
	checkId: string;
	checkVersion: string;
	authorityRef: string;
	reason: CheckExclusionReason;
	refs: string[];
}

interface ResolveExitPolicyInput {
	loop: SemanticLoop;
	candidateDigest: string;
	changes: ChangeSelectorFacts[];
	securitySurfaceClassification?: SecuritySurfaceClassification;
	projectTraits?: ProjectTrait[];
	technologies?: Technology[];
	paths?: string[];
	approvedAdditions?: ApprovedCheckAddition[];
	approvedExclusions?: ApprovedCheckExclusion[];
	protectedBaseCustomCheckConfig?: ProtectedCustomCheckConfigSnapshot;
}

interface CheckActivationRuleMatch {
	changeKinds?: ChangeKind[];
	changeTypes?: ChangeType[];
	risks?: ChangeRisk[];
	affectedLayers?: string[];
	projectTraits?: ProjectTrait[];
	technologies?: Technology[];
	pathTraits?: PathTrait[];
	securitySurfaces?: SecuritySurface[];
}

interface CheckActivationRule {
	id: string;
	version: string;
	loop: SemanticLoop;
	checkIds: string[];
	match: CheckActivationRuleMatch;
}

interface NormalizedSelectorInput {
	selectorVersion: typeof EXIT_POLICY_SELECTOR_VERSION;
	catalogVersion: string;
	catalogDigest: string;
	loop: SemanticLoop;
	candidateDigest: string;
	changes: ChangeSelectorFacts[];
	projectTraits: ProjectTrait[];
	technologies: Technology[];
	paths: string[];
	pathTraits: PathTrait[];
	securitySurfaceClassification?: SecuritySurfaceClassification;
	securitySurfaces: SecuritySurface[];
	approvedAdditions: ApprovedCheckAddition[];
	approvedExclusions: ApprovedCheckExclusion[];
	protectedBaseCustomCheckConfig?: {
		protectedSourceHead: string;
		projectConfigDigest: string;
		customCheckConfigDigest: string;
		snapshotDigest: string;
	};
}

interface MutableBinding {
	registration: CheckRegistration;
	enforcement: CheckEnforcement;
	required: boolean;
	parameters: Record<string, CheckJsonValue>;
	activatedBy: Set<string>;
	ruleRefs: Set<string>;
}

const LOOP_BASELINES: Record<SemanticLoop, string[]> = {
	decision: [
		"change_revision_ready",
		"intention_understood",
		"user_value_clear",
		"outcome_contract_complete",
		"current_state_grounded",
		"evidence_sufficient",
		"recommendation_justified",
		"intention_validated",
		"approval_safety",
		"risks_and_alternatives_considered",
		"knowledge_impact_accounted",
		"change_kind_classified",
		"delivery_constraints_safe",
		"active_change_overlap_accounted",
	],
	planning: [
		"approved_change_coverage_complete",
		"sprint_boundaries_coherent",
		"work_items_self_contained",
		"cross_change_contribution_explicit",
		"technical_requirements_complete",
		"acceptance_and_verification_testable",
		"source_ownership_aligned",
		"dependency_order_clear",
		"claimed_work_stable",
		"integration_plan_safe",
		"worker_assignment_ready",
		"worker_workbench_buildable",
		"uncertainty_resolved",
		"triggers_valid",
		"resolutions_accounted",
		"traceability_refs_canonical",
	],
	implementation: [
		"approved_change_coverage_complete",
		"planning_coverage_complete",
		"scope_controlled",
		"acceptance_evidence_complete",
		"verification_passed",
		"tdd_evidence_valid",
		"worker_claims_correlated",
		"integration_conflicts_resolved",
		"content_proof_recorded",
		"source_ownership_aligned",
		"production_readiness_reviewed",
		"outcome_realization_accounted",
		"archive_disposition_ready",
		"uncertainty_resolved",
		"traceability_refs_canonical",
	],
};

const DECISION_RESEARCH_CHECK_IDS = [
	"research_provenance_valid",
	"research_claims_supported",
];

const CODEWIKI_CHECK_ACTIVATION_RULES: CheckActivationRule[] = [
	...(["decision", "planning", "implementation"] as const).map((loop) => ({
		id: `check.loop.${loop}.baseline`,
		version: "1.0.0",
		loop,
		checkIds: LOOP_BASELINES[loop],
		match: {},
	})),
	...rulesForLoop(
		"check.research.change.kind.migrate",
		"decision",
		DECISION_RESEARCH_CHECK_IDS,
		{ changeKinds: ["migrate"] },
	),
	...rulesForLoop(
		"check.research.change.type.dependency",
		"decision",
		DECISION_RESEARCH_CHECK_IDS,
		{ changeTypes: ["dependency_change"] },
	),
	...rulesForLoop(
		"check.research.change.type.security",
		"decision",
		DECISION_RESEARCH_CHECK_IDS,
		{ changeTypes: ["security_change"] },
	),
	...rulesForLoop(
		"check.research.change.risk.high",
		"decision",
		DECISION_RESEARCH_CHECK_IDS,
		{ risks: ["high"] },
	),
	...rulesForLoop(
		"check.research.project.security",
		"decision",
		DECISION_RESEARCH_CHECK_IDS,
		{ projectTraits: ["handles-personal-data", "security-sensitive"] },
	),
	...rulesForLoop(
		"check.research.layer.security",
		"decision",
		DECISION_RESEARCH_CHECK_IDS,
		{ affectedLayers: ["security", "privacy"] },
	),
	...rulesForLoop(
		"check.research.layer.dependency",
		"decision",
		DECISION_RESEARCH_CHECK_IDS,
		{ affectedLayers: ["dependency", "package"] },
	),
	...rulesForLoop(
		"check.research.path.dependency",
		"decision",
		DECISION_RESEARCH_CHECK_IDS,
		{ pathTraits: ["dependency"] },
	),
	...rulesForAllLoops("check.change.kind.fix", ["fix_reproducible"], {
		changeKinds: ["fix"],
	}),
	...rulesForAllLoops(
		"check.change.kind.harden",
		["hardening_boundaries_complete"],
		{ changeKinds: ["harden"] },
	),
	...rulesForAllLoops(
		"check.change.kind.improve",
		["improvement_outcome_observable"],
		{ changeKinds: ["improve"] },
	),
	...rulesForAllLoops(
		"check.change.kind.migrate",
		["migration_invariants_preserved"],
		{ changeKinds: ["migrate"] },
	),
	...rulesForAllLoops(
		"check.change.type.security",
		["security_privacy_reviewed"],
		{ changeTypes: ["security_change"] },
	),
	...rulesForLoop(
		"check.security.surface.detected",
		"decision",
		["security_privacy_reviewed"],
		{securitySurfaces: [...SECURITY_SURFACES]},
	),
	...rulesForLoop(
		"check.security.surface.dependency",
		"decision",
		["dependency_risk_controlled"],
		{securitySurfaces: ["dependency_supply_chain"]},
	),
	...rulesForLoop(
		"check.security.surface.public-api",
		"decision",
		["api_contract_reviewed"],
		{securitySurfaces: ["network_public_api"]},
	),
	...rulesForLoop(
		"check.security.surface.persistence",
		"decision",
		["persistent_data_safety_reviewed"],
		{securitySurfaces: ["persistence_migration"]},
	),
	...rulesForAllLoops(
		"check.change.risk.high",
		["security_privacy_reviewed"],
		{ risks: ["high"] },
	),
	...rulesForAllLoops(
		"check.project.security",
		["security_privacy_reviewed"],
		{ projectTraits: ["handles-personal-data", "security-sensitive"] },
	),
	...rulesForAllLoops(
		"check.layer.security",
		["security_privacy_reviewed"],
		{ affectedLayers: ["security", "privacy"] },
	),
	...rulesForAllLoops(
		"check.project.web-ui",
		["accessibility_ui_reviewed"],
		{ projectTraits: ["web-ui"] },
	),
	...rulesForAllLoops("check.layer.ui", ["accessibility_ui_reviewed"], {
		affectedLayers: ["frontend", "ui", "web"],
	}),
	...rulesForAllLoops("check.path.ui", ["accessibility_ui_reviewed"], {
		pathTraits: ["ui"],
	}),
	...rulesForLoop(
		"check.project.web-ui.preview-targets",
		"planning",
		["ui_preview_targets_valid"],
		{ projectTraits: ["web-ui"] },
	),
	...rulesForLoop(
		"check.layer.ui.preview-targets",
		"planning",
		["ui_preview_targets_valid"],
		{ affectedLayers: ["frontend", "ui", "web"] },
	),
	...rulesForLoop(
		"check.path.ui.preview-targets",
		"planning",
		["ui_preview_targets_valid"],
		{ pathTraits: ["ui"] },
	),
	...rulesForAllLoops(
		"check.change.type.dependency",
		["dependency_risk_controlled"],
		{ changeTypes: ["dependency_change"] },
	),
	...rulesForAllLoops(
		"check.layer.dependency",
		["dependency_risk_controlled"],
		{ affectedLayers: ["dependency", "package"] },
	),
	...rulesForAllLoops(
		"check.path.dependency",
		["dependency_risk_controlled"],
		{ pathTraits: ["dependency"] },
	),
	...releaseRulesForLoop("decision", "release_intent_authorized"),
	...releaseRulesForLoop("planning", "release_plan_safe"),
	...releaseRulesForLoop("implementation", "release_safety_approved"),
	...rulesForAllLoops(
		"check.project.public-api",
		["api_contract_reviewed"],
		{ projectTraits: ["public-api"] },
	),
	...rulesForAllLoops("check.layer.api", ["api_contract_reviewed"], {
		affectedLayers: ["api"],
	}),
	...rulesForAllLoops("check.project.cli", ["cli_behavior_verified"], {
		projectTraits: ["cli"],
	}),
	...rulesForAllLoops(
		"check.project.library",
		["library_contract_preserved"],
		{ projectTraits: ["library"] },
	),
	...rulesForAllLoops(
		"check.project.persistent-data",
		["persistent_data_safety_reviewed"],
		{ projectTraits: ["persistent-data"] },
	),
	...rulesForAllLoops(
		"check.layer.data",
		["persistent_data_safety_reviewed"],
		{ affectedLayers: ["data", "database", "storage"] },
	),
	technologyRule("typescript", "typescript_verified"),
	technologyRule("javascript", "typescript_verified"),
	technologyRule("python", "python_verified"),
	technologyRule("go", "go_verified"),
	technologyRule("rust", "rust_verified"),
	technologyRule("shell", "shell_verified"),
];

export function resolveExitPolicy(
	input: ResolveExitPolicyInput,
): ResolvedExitPolicy {
	if (input.protectedBaseCustomCheckConfig) {
		assertProtectedCustomCheckConfigSnapshot(
			input.protectedBaseCustomCheckConfig,
		);
	}
	const catalog = createCheckCatalog(
		input.protectedBaseCustomCheckConfig?.customChecks,
	);
	const selector = normalizeSelectorInput(
		input,
		catalog.version,
		catalog.digest,
	);
	const active = new Map<string, MutableBinding>();
	activateRules(active, catalog, selector);
	activateCustomChecks(active, catalog, selector);
	activateApprovedAdditions(active, catalog, selector);
	activateDependencies(active, catalog, selector.loop);
	applyApprovedExclusions(active, catalog, selector);
	assertActiveDependencies(active);
	return resolvedPolicy(active, catalog, selector);
}

function activateRules(
	active: Map<string, MutableBinding>,
	catalog: CheckCatalog,
	selector: NormalizedSelectorInput,
): void {
	for (const rule of CODEWIKI_CHECK_ACTIVATION_RULES) {
		if (rule.loop !== selector.loop) continue;
		const reasons = ruleReasons(rule, selector);
		if (!reasons) continue;
		for (const checkId of rule.checkIds) {
			activate({
				active,
				catalog,
				loop: selector.loop,
				checkId,
				parameters: activationParameters(checkId, selector),
				activatedBy: reasons,
				ruleRef: `${rule.id}@${rule.version}`,
			});
		}
	}
}

function activateCustomChecks(
	active: Map<string, MutableBinding>,
	catalog: CheckCatalog,
	selector: NormalizedSelectorInput,
): void {
	for (const registration of catalog.list(selector.loop)) {
		const customCheck = registration.customCheck;
		if (!customCheck) continue;
		const applicabilityReasons = customCheckApplicabilityReasons(
			customCheck.definition,
			selector,
		);
		if (!applicabilityReasons) continue;
		const definition = customCheck.definition;
		const protectedConfig = selector.protectedBaseCustomCheckConfig;
		if (!protectedConfig) {
			throw new Error(
				`Custom Check ${definition.customCheckId} has no protected-base configuration binding.`,
			);
		}
		const parameters: Record<string, CheckJsonValue> = {
			customCheckId: definition.customCheckId,
			protectedSourceHead: protectedConfig.protectedSourceHead,
			protectedConfigDigest: protectedConfig.projectConfigDigest,
			customCheckConfigDigest: protectedConfig.customCheckConfigDigest,
			protectedCustomCheckConfigSnapshotDigest: protectedConfig.snapshotDigest,
			customCheckDefinitionDigest: definition.definitionDigest,
			customCheckTypeId: definition.checkTypeId,
			customCheckTypeVersion: customCheck.checkTypeVersion,
			checkEvaluatorId: customCheck.evaluatorId,
			knowledgeRefs: [...(definition.knowledgeRefs ?? [])],
			...(definition.repairGuidance
				? { repairGuidance: definition.repairGuidance }
				: {}),
		};
		if (
			definition.checkTypeId === "security_and_privacy" &&
			selector.securitySurfaceClassification
		) {
			parameters.securitySurfaceClassification = mutableCheckJsonValue(
				toCanonicalJsonValue(selector.securitySurfaceClassification),
			);
		}
		activate({
			active,
			catalog,
			loop: selector.loop,
			checkId: registration.check.id,
			checkVersion: registration.check.version,
			parameters,
			enforcement: "require",
			required: true,
			activatedBy: [
				`custom_check:${definition.customCheckId}@${definition.definitionDigest}`,
				`custom_check_type:${definition.checkTypeId}@${customCheck.checkTypeVersion}`,
				...applicabilityReasons,
			],
			ruleRef: `custom-check:${definition.customCheckId}:definition:${definition.definitionDigest}`,
		});
	}
}

function customCheckApplicabilityReasons(
	definition: CustomCheckDefinition,
	selector: NormalizedSelectorInput,
): string[] | undefined {
	const applicability = definition.appliesWhen;
	const reasons: string[] = [];
	if (applicability.changeKinds?.length) {
		const matched = selector.changes
			.map((change) => change.kind)
			.filter((kind) => applicability.changeKinds?.includes(kind));
		if (matched.length === 0) return undefined;
		reasons.push(...unique(matched).map((kind) => `custom_change_kind:${kind}`));
	}
	if (applicability.affectedLayers?.length) {
		const layers = selector.changes.flatMap((change) => change.affectedLayers);
		const matched = layers.filter((layer) =>
			applicability.affectedLayers?.includes(layer),
		);
		if (matched.length === 0) return undefined;
		reasons.push(...unique(matched).map((layer) => `custom_affected_layer:${layer}`));
	}
	if (applicability.pathScopes?.length) {
		const matched = applicability.pathScopes.filter((scope) =>
			selector.paths.some(
				(path) => path === scope || path.startsWith(`${scope}/`),
			),
		);
		if (matched.length === 0) return undefined;
		reasons.push(...matched.map((scope) => `custom_path_scope:${scope}`));
	}
	if (reasons.length === 0) reasons.push("custom_project_default");
	return reasons.sort(compareSelectorValue);
}

function activateApprovedAdditions(
	active: Map<string, MutableBinding>,
	catalog: CheckCatalog,
	selector: NormalizedSelectorInput,
): void {
	for (const addition of selector.approvedAdditions) {
		activate({
			active,
			catalog,
			loop: selector.loop,
			checkId: addition.checkId,
			checkVersion: addition.checkVersion,
			parameters: addition.parameters,
			activatedBy: [`approved-addition:${addition.authorityRef}`],
			ruleRef: `check.approved-addition@${EXIT_POLICY_SELECTOR_VERSION}`,
		});
	}
}

function applyApprovedExclusions(
	active: Map<string, MutableBinding>,
	catalog: CheckCatalog,
	selector: NormalizedSelectorInput,
): void {
	for (const exclusion of selector.approvedExclusions) {
		const registration = requiredRegistration(
			catalog,
			exclusion.checkId,
			selector.loop,
			exclusion.checkVersion,
		);
		if (registration.authority === "kernel" || registration.customCheck) {
			throw new Error(
				`Check ${exclusion.checkId} cannot be excluded from ${selector.loop}.`,
			);
		}
		active.delete(exclusion.checkId);
	}
}

function resolvedPolicy(
	active: Map<string, MutableBinding>,
	catalog: CheckCatalog,
	selector: NormalizedSelectorInput,
): ResolvedExitPolicy {
	const bindings = [...active.values()].map((binding) =>
		toBinding(binding, selector.loop, catalog.digest),
	);
	return createResolvedExitPolicy({
		loop: selector.loop,
		candidateDigest: selector.candidateDigest,
		catalogDigest: catalog.digest,
		selectorInputDigest: resolvedExitPolicyDigest(selector),
		bindings,
		exclusions: resolvedExclusions(active, catalog, selector),
		protectedCheckIds: [...active.values()].flatMap((binding) =>
			binding.registration.check.protected
				? [binding.registration.check.id]
				: [],
		),
	});
}

function resolvedExclusions(
	active: Map<string, MutableBinding>,
	catalog: CheckCatalog,
	selector: NormalizedSelectorInput,
) {
	const approvedById = new Map(
		selector.approvedExclusions.map((exclusion) => [
			exclusion.checkId,
			exclusion,
		]),
	);
	return catalog.list(selector.loop).flatMap((registration) => {
		const checkId = registration.check.id;
		if (active.has(checkId)) return [];
		const approved = approvedById.get(checkId);
		return [
			{
				checkId,
				checkVersion: registration.check.version,
				requirementDigest: registration.check.requirementDigest,
				checkDigest: loopQualifiedCheckDigest({
					loop: selector.loop,
					check: registration.check,
					configuration: {},
					catalogDigest: catalog.digest,
				}),
				reason: approved?.reason ?? ("not_applicable" as const),
				refs: approved
					? unique([approved.authorityRef, ...approved.refs])
					: ruleRefsForCheck(selector.loop, checkId),
			},
		];
	});
}

function normalizeSelectorInput(
	input: ResolveExitPolicyInput,
	catalogVersion: string,
	catalogDigest: string,
): NormalizedSelectorInput {
	assertValidSelectorInput(input);
	const additions = optionalValues(input.approvedAdditions);
	const exclusions = optionalValues(input.approvedExclusions);
	const paths = unique(optionalValues(input.paths).map(normalizePath));
	if (input.securitySurfaceClassification) {
		assertSecuritySurfaceClassification(input.securitySurfaceClassification);
	}
	const securitySurfaces = input.securitySurfaceClassification
		? [...input.securitySurfaceClassification.surfaces]
		: [];
	return {
		selectorVersion: EXIT_POLICY_SELECTOR_VERSION,
		catalogVersion,
		catalogDigest,
		loop: input.loop,
		candidateDigest: input.candidateDigest,
		changes: [...input.changes]
			.map((change) => ({
				...change,
				affectedLayers: unique(change.affectedLayers.map(normalizeLayer)),
			}))
			.sort((left, right) => left.changeId.localeCompare(right.changeId)),
		projectTraits: unique(optionalValues(input.projectTraits)),
		technologies: unique(optionalValues(input.technologies)),
		paths,
		pathTraits: classifyPathTraits(paths),
		...(input.securitySurfaceClassification
			? {securitySurfaceClassification: input.securitySurfaceClassification}
			: {}),
		securitySurfaces,
		...(input.protectedBaseCustomCheckConfig
			? {
					protectedBaseCustomCheckConfig: {
						protectedSourceHead:
							input.protectedBaseCustomCheckConfig.protectedSourceHead,
						projectConfigDigest:
							input.protectedBaseCustomCheckConfig.projectConfigDigest,
						customCheckConfigDigest:
							input.protectedBaseCustomCheckConfig.customCheckConfigDigest,
						snapshotDigest:
							input.protectedBaseCustomCheckConfig.snapshotDigest,
					},
				}
			: {}),
		approvedAdditions: [...additions]
			.map((addition) => ({
				...addition,
				parameters: sortedCheckJsonObject(addition.parameters ?? {}),
			}))
			.sort((left, right) => left.checkId.localeCompare(right.checkId)),
		approvedExclusions: [...exclusions]
			.map((exclusion) => ({ ...exclusion, refs: unique(exclusion.refs) }))
			.sort((left, right) => left.checkId.localeCompare(right.checkId)),
	};
}

function optionalValues<T>(values: T[] | undefined): T[] {
	return values || [];
}

function assertValidSelectorInput(input: ResolveExitPolicyInput): void {
	if ("customChecks" in input) {
		throw new Error(
			"Resolved Exit Policy received unsupported field customChecks; use protectedBaseCustomCheckConfig.",
		);
	}
	if ("projectRegistrations" in input) {
		throw new Error(
			"Resolved Exit Policy received unsupported field projectRegistrations; use bounded Custom Checks.",
		);
	}
	if ("frozenMinimum" in input) {
		throw new Error(
			"Resolved Exit Policy received unsupported field frozenMinimum; Runtime must derive Planning minimums from canonical Planning evidence.",
		);
	}
	assertSelectorChanges(input);
	assertSelectorTraits(input);
	assertApprovedAdjustments(input);
}

function assertSelectorChanges(input: ResolveExitPolicyInput): void {
	if (input.changes.length === 0) {
		throw new Error("Resolved Exit Policy selector requires at least one Change.");
	}
	assertDigest(input.candidateDigest, "candidateDigest");
	assertUnique(
		input.changes.map((change) => change.changeId),
		"Change",
	);
	for (const change of input.changes) assertChangeFacts(change);
}

function assertSelectorTraits(input: ResolveExitPolicyInput): void {
	for (const trait of optionalValues(input.projectTraits)) {
		if (!(PROJECT_TRAITS as readonly string[]).includes(trait)) {
			throw new Error(`Unknown Resolved Exit Policy project trait ${trait}.`);
		}
	}
	for (const technology of optionalValues(input.technologies)) {
		if (!(TECHNOLOGIES as readonly string[]).includes(technology)) {
			throw new Error(`Unknown Resolved Exit Policy technology ${technology}.`);
		}
	}
}

function assertApprovedAdjustments(input: ResolveExitPolicyInput): void {
	const additions = optionalValues(input.approvedAdditions);
	const exclusions = optionalValues(input.approvedExclusions);
	assertUnique(
		additions.map((entry) => entry.checkId),
		"approved addition",
	);
	assertUnique(
		exclusions.map((entry) => entry.checkId),
		"approved exclusion",
	);
	for (const addition of additions) assertAuthorityRef(addition.authorityRef);
	for (const exclusion of exclusions)
		assertAuthorityRef(exclusion.authorityRef);
	for (const addition of additions) {
		if (
			exclusions.some(
				(exclusion) => exclusion.checkId === addition.checkId,
			)
		) {
			throw new Error(
				`Check ${addition.checkId} cannot be both added and excluded.`,
			);
		}
	}
}

function activate(input: {
	active: Map<string, MutableBinding>;
	catalog: CheckCatalog;
	loop: SemanticLoop;
	checkId: string;
	checkVersion?: string;
	parameters?: Record<string, CheckJsonValue>;
	enforcement?: CheckEnforcement;
	required?: boolean;
	activatedBy: string[];
	ruleRef: string;
}): void {
	const registration = requiredRegistration(
		input.catalog,
		input.checkId,
		input.loop,
		input.checkVersion,
	);
	const current = input.active.get(input.checkId);
	const parameters = input.parameters || {};
	assertEnforcementWithinRollout(input.enforcement, registration);
	const enforcement = input.enforcement || registration.rollout;
	const required =
		typeof input.required === "boolean"
			? input.required
			: registration.rollout === "require";
	if (!current) {
		input.active.set(input.checkId, {
			registration,
			enforcement,
			required,
			parameters: { ...parameters },
			activatedBy: new Set(input.activatedBy),
			ruleRefs: new Set([input.ruleRef]),
		});
		return;
	}
	mergeParameters(current.parameters, parameters, input.checkId);
	current.enforcement = strongerEnforcement(current.enforcement, enforcement);
	current.required ||= required;
	for (const reason of input.activatedBy) current.activatedBy.add(reason);
	current.ruleRefs.add(input.ruleRef);
}

function activateDependencies(
	active: Map<string, MutableBinding>,
	catalog: CheckCatalog,
	loop: SemanticLoop,
): void {
	for (;;) {
		let changed = false;
		for (const binding of [...active.values()]) {
			for (const dependency of binding.registration.dependsOn) {
				if (active.has(dependency)) continue;
				activate({
					active,
					catalog,
					loop,
					checkId: dependency,
					activatedBy: [
						`check-dependency:${binding.registration.check.id}`,
					],
					ruleRef: `check.catalog-dependency@${CHECK_DEPENDENCY_RULE_VERSION}`,
				});
				changed = true;
			}
		}
		if (!changed) return;
	}
}

const CHECK_DEPENDENCY_RULE_VERSION = "1.0.0";

function requiredRegistration(
	catalog: CheckCatalog,
	checkId: string,
	loop: SemanticLoop,
	checkVersion?: string,
): CheckRegistration {
	const registration = catalog.get(checkId, loop);
	if (!registration) {
		if (catalog.list().some((entry) => entry.check.id === checkId)) {
			throw new Error(`Check ${checkId} is not registered for ${loop}.`);
		}
		throw new Error(`Unknown Check ${checkId}.`);
	}
	if (checkVersion && registration.check.version !== checkVersion) {
		throw new Error(
			`Check ${checkId} version changed: expected ${checkVersion}, actual ${registration.check.version}.`,
		);
	}
	return registration;
}

function toBinding(
	binding: MutableBinding,
	loop: SemanticLoop,
	catalogDigest: string,
): CheckBinding {
	return {
		checkId: binding.registration.check.id,
		checkVersion: binding.registration.check.version,
		requirementDigest: binding.registration.check.requirementDigest,
		checkDigest: loopQualifiedCheckDigest({
			loop,
			check: binding.registration.check,
			configuration: binding.parameters,
			catalogDigest,
		}),
		enforcement: binding.enforcement,
		required: binding.required,
		parameters: sortedCheckJsonObject(binding.parameters),
		dependsOn: binding.registration.dependsOn,
		activatedBy: [...binding.activatedBy],
		ruleRefs: [...binding.ruleRefs],
	};
}

function assertActiveDependencies(active: Map<string, MutableBinding>): void {
	for (const binding of active.values()) {
		for (const dependency of binding.registration.dependsOn) {
			if (!active.has(dependency)) {
				throw new Error(
					`Check ${binding.registration.check.id} requires excluded dependency ${dependency}.`,
				);
			}
		}
	}
}

function ruleReasons(
	rule: CheckActivationRule,
	selector: NormalizedSelectorInput,
): string[] | undefined {
	const matches = [
		optionalRuleReasons(rule.match.changeKinds, (values) =>
			changeReasons(selector, "kind", values),
		),
		optionalRuleReasons(rule.match.changeTypes, (values) =>
			changeReasons(selector, "type", values),
		),
		optionalRuleReasons(rule.match.risks, (values) =>
			changeReasons(selector, "risk", values),
		),
		optionalRuleReasons(rule.match.affectedLayers, (values) =>
			layerReasons(selector, values),
		),
		optionalRuleReasons(rule.match.projectTraits, (values) =>
			selectedReasons("project-trait", selector.projectTraits, values),
		),
		optionalRuleReasons(rule.match.technologies, (values) =>
			selectedReasons("technology", selector.technologies, values),
		),
		optionalRuleReasons(rule.match.pathTraits, (values) =>
			selectedReasons("path-trait", selector.pathTraits, values),
		),
		optionalRuleReasons(rule.match.securitySurfaces, (values) =>
			selectedReasons("security-surface", selector.securitySurfaces, values),
		),
	];
	const reasons = [`loop:${rule.loop}`];
	for (const match of matches) {
		if (match?.length === 0) return undefined;
		if (match) reasons.push(...match);
	}
	return unique(reasons);
}

function mutableCheckJsonValue(value: CanonicalJsonValue): CheckJsonValue {
	if (Array.isArray(value)) return value.map(mutableCheckJsonValue);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				mutableCheckJsonValue(entry),
			]),
		);
	}
	return value;
}

function optionalRuleReasons<T>(
	configured: T[] | undefined,
	resolve: (values: T[]) => string[],
): string[] | undefined {
	return configured ? resolve(configured) : undefined;
}

function activationParameters(
	checkId: string,
	selector: NormalizedSelectorInput,
): Record<string, CheckJsonValue> | undefined {
	if (
		checkId !== "security_privacy_reviewed" ||
		!selector.securitySurfaceClassification
	) {
		return undefined;
	}
	return {
		securitySurfaceClassification: mutableCheckJsonValue(
			toCanonicalJsonValue(selector.securitySurfaceClassification),
		),
	};
}

function layerReasons(
	selector: NormalizedSelectorInput,
	layers: string[],
): string[] {
	const wanted = new Set(layers);
	return selector.changes.flatMap((change) =>
		change.affectedLayers.flatMap((layer) =>
			wanted.has(layer) ? [`change:${change.changeId}:layer:${layer}`] : [],
		),
	);
}

function selectedReasons<T extends string>(
	prefix: string,
	selected: T[],
	wanted: T[],
): string[] {
	return selected.flatMap((value) =>
		wanted.includes(value) ? [`${prefix}:${value}`] : [],
	);
}

function changeReasons<T extends "kind" | "type" | "risk">(
	selector: NormalizedSelectorInput,
	field: T,
	values: Array<ChangeSelectorFacts[T]>,
): string[] {
	return selector.changes.flatMap((change) =>
		values.includes(change[field])
			? [`change:${change.changeId}:${field}:${change[field]}`]
			: [],
	);
}

function classifyPathTraits(paths: string[]): PathTrait[] {
	const traits = new Set<PathTrait>();
	for (const path of paths) {
		const classifiedPath = path.toLowerCase();
		if (
			/(^|\/)(?:ui|web|frontend|components)(\/|$)|\.(?:css|html|jsx|tsx|vue|svelte)$/.test(
				classifiedPath,
			)
		) {
			traits.add("ui");
		}
		if (
			/(^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|pyproject\.toml|requirements[^/]*\.txt|go\.mod|cargo\.toml)$/.test(
				classifiedPath,
			)
		) {
			traits.add("dependency");
		}
		if (
			/(^|\/)(?:\.github\/workflows|release|releases|changelog)(\/|\.|$)/.test(
				classifiedPath,
			)
		) {
			traits.add("release");
		}
	}
	return [...traits].sort((left, right) => left.localeCompare(right));
}

function rulesForLoop(
	id: string,
	loop: SemanticLoop,
	checkIds: string[],
	match: CheckActivationRuleMatch,
): CheckActivationRule[] {
	return [
		{
			id: `${id}.${loop}`,
			version: "1.0.0",
			loop,
			checkIds,
			match,
		},
	];
}

function releaseRulesForLoop(
	loop: SemanticLoop,
	checkId: string,
): CheckActivationRule[] {
	return [
		...rulesForLoop("check.change.type.release", loop, [checkId], {
			changeTypes: ["release_change"],
		}),
		...rulesForLoop("check.project.release", loop, [checkId], {
			projectTraits: ["release-producing"],
		}),
		...rulesForLoop("check.layer.release", loop, [checkId], {
			affectedLayers: ["publication", "release"],
		}),
		...rulesForLoop("check.path.release", loop, [checkId], {
			pathTraits: ["release"],
		}),
	];
}

function rulesForAllLoops(
	id: string,
	checkIds: string[],
	match: CheckActivationRuleMatch,
): CheckActivationRule[] {
	return (["decision", "planning", "implementation"] as const).flatMap(
		(loop) => rulesForLoop(id, loop, checkIds, match),
	);
}

function technologyRule(
	technology: Technology,
	checkId: string,
): CheckActivationRule {
	return {
		id: `check.technology.${technology}.implementation`,
		version: "1.0.0",
		loop: "implementation",
		checkIds: [checkId],
		match: { technologies: [technology] },
	};
}

function ruleRefsForCheck(loop: SemanticLoop, checkId: string): string[] {
	const refs = CODEWIKI_CHECK_ACTIVATION_RULES.flatMap((rule) =>
		rule.loop === loop && rule.checkIds.includes(checkId)
			? [`${rule.id}@${rule.version}`]
			: [],
	);
	return refs.length > 0 ? refs : ["check.selector:no-activation-rule"];
}

function normalizePath(value: string): string {
	const path = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
	if (!path || path.startsWith("/") || path.split("/").includes("..")) {
		throw new Error(
			`Resolved Exit Policy selector path must be repository-relative: ${value}.`,
		);
	}
	return path;
}

function assertChangeFacts(change: ChangeSelectorFacts): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(change.changeId)) {
		throw new Error("Resolved Exit Policy Change requires a stable changeId.");
	}
	if (!Number.isInteger(change.revision) || change.revision < 1) {
		throw new Error(
			`Resolved Exit Policy Change ${change.changeId} requires a positive revision.`,
		);
	}
	assertDigest(change.digest, `Change ${change.changeId} digest`);
	if (!(CHANGE_KIND_VALUES as readonly string[]).includes(change.kind)) {
		throw new Error(`Unknown Resolved Exit Policy Change kind ${change.kind}.`);
	}
	if (!(CHANGE_TYPE_VALUES as readonly string[]).includes(change.type)) {
		throw new Error(`Unknown Resolved Exit Policy Change type ${change.type}.`);
	}
	if (!(CHANGE_RISK_VALUES as readonly string[]).includes(change.risk)) {
		throw new Error(`Unknown Resolved Exit Policy Change risk ${change.risk}.`);
	}
}

function normalizeLayer(value: string): string {
	const layer = value.trim().toLowerCase().replaceAll("_", "-");
	if (!/^[a-z0-9][a-z0-9.-]*$/.test(layer)) {
		throw new Error(
			`Resolved Exit Policy affected layer must be a stable id: ${value}.`,
		);
	}
	return layer;
}

function mergeParameters(
	current: Record<string, CheckJsonValue>,
	incoming: Record<string, CheckJsonValue>,
	checkId: string,
): void {
	for (const [key, value] of Object.entries(incoming)) {
		if (
			key in current &&
			resolvedExitPolicyDigest(current[key]) !== resolvedExitPolicyDigest(value)
		) {
			throw new Error(
				`Check ${checkId} has conflicting parameter ${key}.`,
			);
		}
		current[key] = value;
	}
}

function assertEnforcementWithinRollout(
	enforcement: CheckEnforcement | undefined,
	registration: CheckRegistration,
): void {
	if (
		enforcement &&
		enforcement !== registration.rollout &&
		strongerEnforcement(enforcement, registration.rollout) === enforcement
	) {
		throw new Error(
			`Check ${registration.check.id} cannot exceed catalog rollout ${registration.rollout}.`,
		);
	}
}

function strongerEnforcement(
	left: CheckEnforcement,
	right: CheckEnforcement,
): CheckEnforcement {
	const rank: Record<CheckEnforcement, number> = {
		observe: 0,
		warn: 1,
		require: 2,
	};
	return rank[left] >= rank[right] ? left : right;
}

function assertUnique(values: string[], label: string): void {
	if (new Set(values).size !== values.length) {
		throw new Error(`Resolved Exit Policy selector has duplicate ${label}.`);
	}
}

function assertAuthorityRef(value: string): void {
	if (!value.trim())
		throw new Error(
			"Resolved Exit Policy addition or exclusion requires authorityRef.",
		);
}

function assertDigest(value: string, label: string): void {
	if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
		throw new Error(`Resolved Exit Policy ${label} must be a sha256 digest.`);
	}
}

function unique<T>(values: T[]): T[] {
	const result = Array.from(new Set(values));
	result.sort(compareSelectorValue);
	return result;
}

function compareSelectorValue<T>(left: T, right: T): number {
	return String(left).localeCompare(String(right));
}
