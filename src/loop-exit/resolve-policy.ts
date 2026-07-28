import {
	CHANGE_KIND_VALUES,
	CHANGE_RISK_VALUES,
	CHANGE_TYPE_VALUES,
	type ChangeKind,
	type ChangeRisk,
	type ChangeType,
} from "../changes/types.ts";
import type { SemanticLoop as TraceLoop } from "../semantic-loop.ts";
import {
	createQualityPolicyResolution,
	qualityPolicyDigest,
	type QualityEnforcementMode,
	type QualityJsonValue,
	type QualityPolicyExclusionReason,
	type QualityPolicyResolution,
	type QualityStandardBinding,
} from "./contracts.ts";
import {
	createQualityStandardCatalog,
	type ProjectQualityStandardRegistration,
	type QualityStandardRegistration,
	type QualityStandardCatalog,
} from "./catalog.ts";

const QUALITY_POLICY_SELECTOR_VERSION = "1.0.0";

const QUALITY_PROJECT_TRAITS = [
	"web-ui",
	"public-api",
	"cli",
	"library",
	"persistent-data",
	"handles-personal-data",
	"security-sensitive",
	"release-producing",
] as const;
const QUALITY_TECHNOLOGIES = [
	"typescript",
	"javascript",
	"python",
	"go",
	"rust",
	"shell",
] as const;

type QualityProjectTrait = (typeof QUALITY_PROJECT_TRAITS)[number];
type QualityTechnology = (typeof QUALITY_TECHNOLOGIES)[number];
type QualityPathTrait = "ui" | "dependency" | "release";

interface QualityChangeSelectorFacts {
	changeId: string;
	revision: number;
	digest: string;
	kind: ChangeKind;
	type: ChangeType;
	risk: ChangeRisk;
	affectedLayers: string[];
}

interface QualityPolicyApprovedAddition {
	standardId: string;
	standardVersion: string;
	authorityRef: string;
	parameters?: Record<string, QualityJsonValue>;
}

interface QualityPolicyApprovedExclusion {
	standardId: string;
	standardVersion: string;
	authorityRef: string;
	reason: QualityPolicyExclusionReason;
	refs: string[];
}

interface QualityPolicyFrozenMinimumBinding {
	standardId: string;
	standardVersion: string;
	enforcement: QualityEnforcementMode;
	required: boolean;
	parameters: Record<string, QualityJsonValue>;
}

interface QualityPolicyFrozenMinimum {
	planningPolicyDigest: string;
	bindings: QualityPolicyFrozenMinimumBinding[];
}

interface ResolveQualityPolicyInput {
	stage: TraceLoop;
	candidateDigest: string;
	changes: QualityChangeSelectorFacts[];
	projectTraits?: QualityProjectTrait[];
	technologies?: QualityTechnology[];
	paths?: string[];
	approvedAdditions?: QualityPolicyApprovedAddition[];
	approvedExclusions?: QualityPolicyApprovedExclusion[];
	frozenMinimum?: QualityPolicyFrozenMinimum;
	projectRegistrations?: ProjectQualityStandardRegistration[];
}

interface QualityActivationRuleMatch {
	changeKinds?: ChangeKind[];
	changeTypes?: ChangeType[];
	risks?: ChangeRisk[];
	affectedLayers?: string[];
	projectTraits?: QualityProjectTrait[];
	technologies?: QualityTechnology[];
	pathTraits?: QualityPathTrait[];
}

interface QualityActivationRule {
	id: string;
	version: string;
	stage: TraceLoop;
	standardIds: string[];
	match: QualityActivationRuleMatch;
}

interface NormalizedSelectorInput {
	selectorVersion: typeof QUALITY_POLICY_SELECTOR_VERSION;
	catalogVersion: string;
	stage: TraceLoop;
	candidateDigest: string;
	changes: QualityChangeSelectorFacts[];
	projectTraits: QualityProjectTrait[];
	technologies: QualityTechnology[];
	paths: string[];
	pathTraits: QualityPathTrait[];
	approvedAdditions: QualityPolicyApprovedAddition[];
	approvedExclusions: QualityPolicyApprovedExclusion[];
	frozenMinimum?: QualityPolicyFrozenMinimum;
}

interface MutableBinding {
	registration: QualityStandardRegistration;
	enforcement: QualityEnforcementMode;
	required: boolean;
	parameters: Record<string, QualityJsonValue>;
	activatedBy: Set<string>;
	ruleRefs: Set<string>;
}

const STAGE_BASELINES: Record<TraceLoop, string[]> = {
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
		"production_quality_reviewed",
		"outcome_realization_accounted",
		"archive_disposition_ready",
		"uncertainty_resolved",
		"traceability_refs_canonical",
	],
};

const CODEWIKI_QUALITY_ACTIVATION_RULES: QualityActivationRule[] = [
	...(["decision", "planning", "implementation"] as const).map((stage) => ({
		id: `quality.stage.${stage}.baseline`,
		version: "1.0.0",
		stage,
		standardIds: STAGE_BASELINES[stage],
		match: {},
	})),
	...rulesForAllStages("quality.change.kind.fix", ["fix_reproducible"], {
		changeKinds: ["fix"],
	}),
	...rulesForAllStages(
		"quality.change.kind.harden",
		["hardening_boundaries_complete"],
		{ changeKinds: ["harden"] },
	),
	...rulesForAllStages(
		"quality.change.kind.improve",
		["improvement_outcome_observable"],
		{ changeKinds: ["improve"] },
	),
	...rulesForAllStages(
		"quality.change.kind.migrate",
		["migration_invariants_preserved"],
		{ changeKinds: ["migrate"] },
	),
	...rulesForAllStages(
		"quality.change.type.security",
		["security_privacy_reviewed"],
		{ changeTypes: ["security_change"] },
	),
	...rulesForAllStages(
		"quality.change.risk.high",
		["security_privacy_reviewed"],
		{ risks: ["high"] },
	),
	...rulesForAllStages(
		"quality.project.security",
		["security_privacy_reviewed"],
		{ projectTraits: ["handles-personal-data", "security-sensitive"] },
	),
	...rulesForAllStages(
		"quality.layer.security",
		["security_privacy_reviewed"],
		{ affectedLayers: ["security", "privacy"] },
	),
	...rulesForAllStages(
		"quality.project.web-ui",
		["accessibility_ui_reviewed"],
		{ projectTraits: ["web-ui"] },
	),
	...rulesForAllStages("quality.layer.ui", ["accessibility_ui_reviewed"], {
		affectedLayers: ["frontend", "ui", "web"],
	}),
	...rulesForAllStages("quality.path.ui", ["accessibility_ui_reviewed"], {
		pathTraits: ["ui"],
	}),
	...rulesForAllStages(
		"quality.change.type.dependency",
		["dependency_risk_controlled"],
		{ changeTypes: ["dependency_change"] },
	),
	...rulesForAllStages(
		"quality.layer.dependency",
		["dependency_risk_controlled"],
		{ affectedLayers: ["dependency", "package"] },
	),
	...rulesForAllStages(
		"quality.path.dependency",
		["dependency_risk_controlled"],
		{ pathTraits: ["dependency"] },
	),
	...rulesForAllStages(
		"quality.change.type.release",
		["release_safety_approved"],
		{ changeTypes: ["release_change"] },
	),
	...rulesForAllStages("quality.project.release", ["release_safety_approved"], {
		projectTraits: ["release-producing"],
	}),
	...rulesForAllStages("quality.layer.release", ["release_safety_approved"], {
		affectedLayers: ["publication", "release"],
	}),
	...rulesForAllStages("quality.path.release", ["release_safety_approved"], {
		pathTraits: ["release"],
	}),
	...rulesForAllStages(
		"quality.project.public-api",
		["api_contract_reviewed"],
		{ projectTraits: ["public-api"] },
	),
	...rulesForAllStages("quality.layer.api", ["api_contract_reviewed"], {
		affectedLayers: ["api"],
	}),
	...rulesForAllStages("quality.project.cli", ["cli_behavior_verified"], {
		projectTraits: ["cli"],
	}),
	...rulesForAllStages(
		"quality.project.library",
		["library_contract_preserved"],
		{ projectTraits: ["library"] },
	),
	...rulesForAllStages(
		"quality.project.persistent-data",
		["persistent_data_safety_reviewed"],
		{ projectTraits: ["persistent-data"] },
	),
	...rulesForAllStages(
		"quality.layer.data",
		["persistent_data_safety_reviewed"],
		{ affectedLayers: ["data", "database", "storage"] },
	),
	technologyRule("typescript", "typescript_quality_verified"),
	technologyRule("javascript", "typescript_quality_verified"),
	technologyRule("python", "python_quality_verified"),
	technologyRule("go", "go_quality_verified"),
	technologyRule("rust", "rust_quality_verified"),
	technologyRule("shell", "shell_quality_verified"),
];

export function resolveQualityPolicy(
	input: ResolveQualityPolicyInput,
): QualityPolicyResolution {
	const catalog = createQualityStandardCatalog(input.projectRegistrations);
	const selector = normalizeSelectorInput(input, catalog.version);
	const active = new Map<string, MutableBinding>();
	activateRules(active, catalog, selector);
	activateApprovedAdditions(active, catalog, selector);
	activateFrozenMinimum(active, catalog, selector);
	activateDependencies(active, catalog, selector.stage);
	applyApprovedExclusions(active, catalog, selector);
	assertActiveDependencies(active);
	return resolvedPolicy(active, catalog, selector);
}

function activateRules(
	active: Map<string, MutableBinding>,
	catalog: QualityStandardCatalog,
	selector: NormalizedSelectorInput,
): void {
	for (const rule of CODEWIKI_QUALITY_ACTIVATION_RULES) {
		if (rule.stage !== selector.stage) continue;
		const reasons = ruleReasons(rule, selector);
		if (!reasons) continue;
		for (const standardId of rule.standardIds) {
			activate({
				active,
				catalog,
				stage: selector.stage,
				standardId,
				activatedBy: reasons,
				ruleRef: `${rule.id}@${rule.version}`,
			});
		}
	}
}

function activateApprovedAdditions(
	active: Map<string, MutableBinding>,
	catalog: QualityStandardCatalog,
	selector: NormalizedSelectorInput,
): void {
	for (const addition of selector.approvedAdditions) {
		activate({
			active,
			catalog,
			stage: selector.stage,
			standardId: addition.standardId,
			standardVersion: addition.standardVersion,
			parameters: addition.parameters,
			activatedBy: [`approved-addition:${addition.authorityRef}`],
			ruleRef: `quality.approved-addition@${QUALITY_POLICY_SELECTOR_VERSION}`,
		});
	}
}

function activateFrozenMinimum(
	active: Map<string, MutableBinding>,
	catalog: QualityStandardCatalog,
	selector: NormalizedSelectorInput,
): void {
	if (!selector.frozenMinimum) return;
	for (const minimum of selector.frozenMinimum.bindings) {
		activate({
			active,
			catalog,
			stage: selector.stage,
			standardId: minimum.standardId,
			standardVersion: minimum.standardVersion,
			parameters: minimum.parameters,
			enforcement: minimum.enforcement,
			required: minimum.required,
			activatedBy: [
				`planning-minimum:${selector.frozenMinimum.planningPolicyDigest}`,
			],
			ruleRef: `quality.planning-minimum@${QUALITY_POLICY_SELECTOR_VERSION}`,
		});
	}
}

function applyApprovedExclusions(
	active: Map<string, MutableBinding>,
	catalog: QualityStandardCatalog,
	selector: NormalizedSelectorInput,
): void {
	const frozenIds = new Set(
		selector.frozenMinimum?.bindings.map((binding) => binding.standardId) ?? [],
	);
	for (const exclusion of selector.approvedExclusions) {
		const registration = requiredRegistration(
			catalog,
			exclusion.standardId,
			selector.stage,
			exclusion.standardVersion,
		);
		if (
			registration.authority === "kernel" ||
			frozenIds.has(exclusion.standardId)
		) {
			throw new Error(
				`Quality Standard ${exclusion.standardId} cannot be excluded from ${selector.stage}.`,
			);
		}
		active.delete(exclusion.standardId);
	}
}

function resolvedPolicy(
	active: Map<string, MutableBinding>,
	catalog: QualityStandardCatalog,
	selector: NormalizedSelectorInput,
): QualityPolicyResolution {
	const bindings = [...active.values()].map(toBinding);
	const requiredStandardIds = bindings.flatMap((binding) =>
		binding.required && binding.enforcement === "enforce"
			? [binding.standardId]
			: [],
	);
	return createQualityPolicyResolution({
		stage: selector.stage,
		candidateDigest: selector.candidateDigest,
		selectorInputDigest: qualityPolicyDigest(selector),
		bindings,
		exclusions: resolvedExclusions(active, catalog, selector),
		gates: [
			{
				id: `${selector.stage}.exit`,
				version: QUALITY_POLICY_SELECTOR_VERSION,
				kind: "all_required",
				standardIds: requiredStandardIds,
				onFailure:
					selector.stage === "implementation" ? "repair" : "route_back",
			},
		],
		protectedStandardIds: [...active.values()].flatMap((binding) =>
			binding.registration.standard.protected
				? [binding.registration.standard.id]
				: [],
		),
	});
}

function resolvedExclusions(
	active: Map<string, MutableBinding>,
	catalog: QualityStandardCatalog,
	selector: NormalizedSelectorInput,
) {
	const approvedById = new Map(
		selector.approvedExclusions.map((exclusion) => [
			exclusion.standardId,
			exclusion,
		]),
	);
	return catalog.list(selector.stage).flatMap((registration) => {
		const standardId = registration.standard.id;
		if (active.has(standardId)) return [];
		const approved = approvedById.get(standardId);
		return [
			{
				standardId,
				standardVersion: registration.standard.version,
				reason: approved?.reason ?? ("not_applicable" as const),
				refs: approved
					? unique([approved.authorityRef, ...approved.refs])
					: ruleRefsForStandard(selector.stage, standardId),
			},
		];
	});
}

function normalizeSelectorInput(
	input: ResolveQualityPolicyInput,
	catalogVersion: string,
): NormalizedSelectorInput {
	assertValidSelectorInput(input);
	const additions = optionalValues(input.approvedAdditions);
	const exclusions = optionalValues(input.approvedExclusions);
	const paths = unique(optionalValues(input.paths).map(normalizePath));
	return {
		selectorVersion: QUALITY_POLICY_SELECTOR_VERSION,
		catalogVersion,
		stage: input.stage,
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
		approvedAdditions: [...additions]
			.map((addition) => ({
				...addition,
				parameters: sortObject(addition.parameters ?? {}),
			}))
			.sort((left, right) => left.standardId.localeCompare(right.standardId)),
		approvedExclusions: [...exclusions]
			.map((exclusion) => ({ ...exclusion, refs: unique(exclusion.refs) }))
			.sort((left, right) => left.standardId.localeCompare(right.standardId)),
		...(input.frozenMinimum
			? {
					frozenMinimum: {
						planningPolicyDigest: input.frozenMinimum.planningPolicyDigest,
						bindings: [...input.frozenMinimum.bindings]
							.map((binding) => ({
								...binding,
								parameters: sortObject(binding.parameters),
							}))
							.sort((left, right) =>
								left.standardId.localeCompare(right.standardId),
							),
					},
				}
			: {}),
	};
}

function optionalValues<T>(values: T[] | undefined): T[] {
	return values || [];
}

function assertValidSelectorInput(input: ResolveQualityPolicyInput): void {
	assertSelectorChanges(input);
	assertSelectorTraits(input);
	assertApprovedAdjustments(input);
	assertFrozenMinimum(input);
}

function assertSelectorChanges(input: ResolveQualityPolicyInput): void {
	if (input.changes.length === 0) {
		throw new Error("Quality Policy selector requires at least one Change.");
	}
	assertDigest(input.candidateDigest, "candidateDigest");
	assertUnique(
		input.changes.map((change) => change.changeId),
		"Change",
	);
	for (const change of input.changes) assertChangeFacts(change);
}

function assertSelectorTraits(input: ResolveQualityPolicyInput): void {
	for (const trait of optionalValues(input.projectTraits)) {
		if (!(QUALITY_PROJECT_TRAITS as readonly string[]).includes(trait)) {
			throw new Error(`Unknown Quality Policy project trait ${trait}.`);
		}
	}
	for (const technology of optionalValues(input.technologies)) {
		if (!(QUALITY_TECHNOLOGIES as readonly string[]).includes(technology)) {
			throw new Error(`Unknown Quality Policy technology ${technology}.`);
		}
	}
}

function assertApprovedAdjustments(input: ResolveQualityPolicyInput): void {
	const additions = optionalValues(input.approvedAdditions);
	const exclusions = optionalValues(input.approvedExclusions);
	assertUnique(
		additions.map((entry) => entry.standardId),
		"approved addition",
	);
	assertUnique(
		exclusions.map((entry) => entry.standardId),
		"approved exclusion",
	);
	for (const addition of additions) assertAuthorityRef(addition.authorityRef);
	for (const exclusion of exclusions)
		assertAuthorityRef(exclusion.authorityRef);
	for (const addition of additions) {
		if (
			exclusions.some(
				(exclusion) => exclusion.standardId === addition.standardId,
			)
		) {
			throw new Error(
				`Quality Standard ${addition.standardId} cannot be both added and excluded.`,
			);
		}
	}
}

function assertFrozenMinimum(input: ResolveQualityPolicyInput): void {
	if (!input.frozenMinimum) return;
	if (input.stage !== "implementation") {
		throw new Error(
			"Only Implementation Quality Policy may carry a frozen Planning minimum.",
		);
	}
	assertDigest(
		input.frozenMinimum.planningPolicyDigest,
		"planningPolicyDigest",
	);
	assertUnique(
		input.frozenMinimum.bindings.map((binding) => binding.standardId),
		"Planning minimum",
	);
}

function activate(input: {
	active: Map<string, MutableBinding>;
	catalog: QualityStandardCatalog;
	stage: TraceLoop;
	standardId: string;
	standardVersion?: string;
	parameters?: Record<string, QualityJsonValue>;
	enforcement?: QualityEnforcementMode;
	required?: boolean;
	activatedBy: string[];
	ruleRef: string;
}): void {
	const registration = requiredRegistration(
		input.catalog,
		input.standardId,
		input.stage,
		input.standardVersion,
	);
	const current = input.active.get(input.standardId);
	const parameters = input.parameters || {};
	assertEnforcementWithinRollout(input.enforcement, registration);
	const enforcement = input.enforcement || registration.rollout;
	const required =
		typeof input.required === "boolean"
			? input.required
			: registration.rollout === "enforce";
	if (!current) {
		input.active.set(input.standardId, {
			registration,
			enforcement,
			required,
			parameters: { ...parameters },
			activatedBy: new Set(input.activatedBy),
			ruleRefs: new Set([input.ruleRef]),
		});
		return;
	}
	mergeParameters(current.parameters, parameters, input.standardId);
	current.enforcement = strongerEnforcement(current.enforcement, enforcement);
	current.required ||= required;
	for (const reason of input.activatedBy) current.activatedBy.add(reason);
	current.ruleRefs.add(input.ruleRef);
}

function activateDependencies(
	active: Map<string, MutableBinding>,
	catalog: QualityStandardCatalog,
	stage: TraceLoop,
): void {
	for (;;) {
		let changed = false;
		for (const binding of [...active.values()]) {
			for (const dependency of binding.registration.evaluationDependsOn) {
				if (active.has(dependency)) continue;
				activate({
					active,
					catalog,
					stage,
					standardId: dependency,
					activatedBy: [
						`evaluation-dependency:${binding.registration.standard.id}`,
					],
					ruleRef: `quality.catalog-dependency@${QUALITY_STANDARD_DEPENDENCY_VERSION}`,
				});
				changed = true;
			}
		}
		if (!changed) return;
	}
}

const QUALITY_STANDARD_DEPENDENCY_VERSION = "1.0.0";

function requiredRegistration(
	catalog: QualityStandardCatalog,
	standardId: string,
	stage: TraceLoop,
	standardVersion?: string,
): QualityStandardRegistration {
	const registration = catalog.get(standardId);
	if (!registration) throw new Error(`Unknown Quality Standard ${standardId}.`);
	if (!registration.stages.includes(stage)) {
		throw new Error(
			`Quality Standard ${standardId} is not registered for ${stage}.`,
		);
	}
	if (standardVersion && registration.standard.version !== standardVersion) {
		throw new Error(
			`Quality Standard ${standardId} version changed: expected ${standardVersion}, actual ${registration.standard.version}.`,
		);
	}
	return registration;
}

function toBinding(binding: MutableBinding): QualityStandardBinding {
	return {
		standardId: binding.registration.standard.id,
		standardVersion: binding.registration.standard.version,
		enforcement: binding.enforcement,
		required: binding.required,
		parameters: sortObject(binding.parameters),
		evaluationDependsOn: binding.registration.evaluationDependsOn,
		activatedBy: [...binding.activatedBy],
		ruleRefs: [...binding.ruleRefs],
	};
}

function assertActiveDependencies(active: Map<string, MutableBinding>): void {
	for (const binding of active.values()) {
		for (const dependency of binding.registration.evaluationDependsOn) {
			if (!active.has(dependency)) {
				throw new Error(
					`Quality Standard ${binding.registration.standard.id} requires excluded dependency ${dependency}.`,
				);
			}
		}
	}
}

function ruleReasons(
	rule: QualityActivationRule,
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
	];
	const reasons = [`stage:${rule.stage}`];
	for (const match of matches) {
		if (match?.length === 0) return undefined;
		if (match) reasons.push(...match);
	}
	return unique(reasons);
}

function optionalRuleReasons<T>(
	configured: T[] | undefined,
	resolve: (values: T[]) => string[],
): string[] | undefined {
	return configured ? resolve(configured) : undefined;
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
	values: Array<QualityChangeSelectorFacts[T]>,
): string[] {
	return selector.changes.flatMap((change) =>
		values.includes(change[field])
			? [`change:${change.changeId}:${field}:${change[field]}`]
			: [],
	);
}

function classifyPathTraits(paths: string[]): QualityPathTrait[] {
	const traits = new Set<QualityPathTrait>();
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

function rulesForAllStages(
	id: string,
	standardIds: string[],
	match: QualityActivationRuleMatch,
): QualityActivationRule[] {
	return (["decision", "planning", "implementation"] as const).map((stage) => ({
		id: `${id}.${stage}`,
		version: "1.0.0",
		stage,
		standardIds,
		match,
	}));
}

function technologyRule(
	technology: QualityTechnology,
	standardId: string,
): QualityActivationRule {
	return {
		id: `quality.technology.${technology}.implementation`,
		version: "1.0.0",
		stage: "implementation",
		standardIds: [standardId],
		match: { technologies: [technology] },
	};
}

function ruleRefsForStandard(stage: TraceLoop, standardId: string): string[] {
	const refs = CODEWIKI_QUALITY_ACTIVATION_RULES.flatMap((rule) =>
		rule.stage === stage && rule.standardIds.includes(standardId)
			? [`${rule.id}@${rule.version}`]
			: [],
	);
	return refs.length > 0 ? refs : ["quality.selector:no-activation-rule"];
}

function normalizePath(value: string): string {
	const path = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
	if (!path || path.startsWith("/") || path.split("/").includes("..")) {
		throw new Error(
			`Quality Policy selector path must be repository-relative: ${value}.`,
		);
	}
	return path;
}

function assertChangeFacts(change: QualityChangeSelectorFacts): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(change.changeId)) {
		throw new Error("Quality Policy Change requires a stable changeId.");
	}
	if (!Number.isInteger(change.revision) || change.revision < 1) {
		throw new Error(
			`Quality Policy Change ${change.changeId} requires a positive revision.`,
		);
	}
	assertDigest(change.digest, `Change ${change.changeId} digest`);
	if (!(CHANGE_KIND_VALUES as readonly string[]).includes(change.kind)) {
		throw new Error(`Unknown Quality Policy Change kind ${change.kind}.`);
	}
	if (!(CHANGE_TYPE_VALUES as readonly string[]).includes(change.type)) {
		throw new Error(`Unknown Quality Policy Change type ${change.type}.`);
	}
	if (!(CHANGE_RISK_VALUES as readonly string[]).includes(change.risk)) {
		throw new Error(`Unknown Quality Policy Change risk ${change.risk}.`);
	}
}

function normalizeLayer(value: string): string {
	const layer = value.trim().toLowerCase().replaceAll("_", "-");
	if (!/^[a-z0-9][a-z0-9.-]*$/.test(layer)) {
		throw new Error(
			`Quality Policy affected layer must be a stable id: ${value}.`,
		);
	}
	return layer;
}

function mergeParameters(
	current: Record<string, QualityJsonValue>,
	incoming: Record<string, QualityJsonValue>,
	standardId: string,
): void {
	for (const [key, value] of Object.entries(incoming)) {
		if (
			key in current &&
			qualityPolicyDigest(current[key]) !== qualityPolicyDigest(value)
		) {
			throw new Error(
				`Quality Standard ${standardId} has conflicting parameter ${key}.`,
			);
		}
		current[key] = value;
	}
}

function assertEnforcementWithinRollout(
	enforcement: QualityEnforcementMode | undefined,
	registration: QualityStandardRegistration,
): void {
	if (
		enforcement &&
		enforcement !== registration.rollout &&
		strongerEnforcement(enforcement, registration.rollout) === enforcement
	) {
		throw new Error(
			`Quality Standard ${registration.standard.id} cannot exceed catalog rollout ${registration.rollout}.`,
		);
	}
}

function strongerEnforcement(
	left: QualityEnforcementMode,
	right: QualityEnforcementMode,
): QualityEnforcementMode {
	const rank: Record<QualityEnforcementMode, number> = {
		observe: 0,
		warn: 1,
		enforce: 2,
	};
	return rank[left] >= rank[right] ? left : right;
}

function sortObject(
	value: Record<string, QualityJsonValue>,
): Record<string, QualityJsonValue> {
	return Object.fromEntries(
		Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
	);
}

function assertUnique(values: string[], label: string): void {
	if (new Set(values).size !== values.length) {
		throw new Error(`Quality Policy selector has duplicate ${label}.`);
	}
}

function assertAuthorityRef(value: string): void {
	if (!value.trim())
		throw new Error(
			"Quality Policy addition or exclusion requires authorityRef.",
		);
}

function assertDigest(value: string, label: string): void {
	if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
		throw new Error(`Quality Policy ${label} must be a sha256 digest.`);
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
