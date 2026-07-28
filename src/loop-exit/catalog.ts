import type { SemanticLoop as TraceLoop } from "../semantic-loop.ts";
import type {
	QualityEnforcementMode,
	QualityStandard,
} from "./contracts.ts";

export const QUALITY_STANDARD_CATALOG_VERSION = "1.0.0";

const QUALITY_VERIFIER_IDS = [
	"codewiki.deterministic",
	"codewiki.model-assessor",
	"codewiki.external-evidence",
	"codewiki.human-authority",
] as const;

const QUALITY_EVIDENCE_ADAPTER_IDS = [
	"authority",
	"change",
	"checks",
	"content-proof",
	"planning",
	"preview",
	"source",
	"trace",
	"worker-report",
	"work-state",
] as const;

export type QualityStandardAuthority = "kernel" | "project";

export interface QualityStandardRolloutApproval {
	status: "approved";
	refs: string[];
}

export interface QualityStandardRegistration {
	standard: QualityStandard;
	stages: TraceLoop[];
	authority: QualityStandardAuthority;
	rollout: QualityEnforcementMode;
	rolloutHistory: QualityEnforcementMode[];
	approval?: QualityStandardRolloutApproval;
	evaluationDependsOn: string[];
}

export interface QualityStandardCatalog {
	version: typeof QUALITY_STANDARD_CATALOG_VERSION;
	get(standardId: string): QualityStandardRegistration | undefined;
	list(stage?: TraceLoop): QualityStandardRegistration[];
}

export type ProjectQualityStandardRegistration = Omit<
	QualityStandardRegistration,
	"authority"
> & { authority?: never };

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
		"Assessment protects user value and long-term project interests.",
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
		"Work Items have stable ownership, outcomes, requirements, criteria, and bounded paths.",
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
		"Acceptance criteria and verification are concrete and testable.",
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
		"Declared context, capabilities, isolation, Quality, evidence, and budgets can form a bounded Workbench.",
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
		"Every required criterion maps to structured evidence.",
	],
	[
		"verification_passed",
		"Required scoped and aggregate checks are present and passing.",
	],
	[
		"tdd_evidence_valid",
		"Required red and green proof maps to acceptance criteria.",
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
		"production_quality_reviewed",
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

const CONDITIONAL_STANDARDS = [
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
		"security_privacy_reviewed",
		"Security and privacy implications are explicitly assessed for this stage.",
	],
	[
		"accessibility_ui_reviewed",
		"UI changes include accessibility and interaction evidence appropriate to this stage.",
	],
	[
		"dependency_risk_controlled",
		"Dependency-surface changes include compatibility, provenance, and risk evidence.",
	],
	[
		"release_safety_approved",
		"Release or externally destructive effects have exact authority and safety evidence.",
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
		"typescript_quality_verified",
		"TypeScript or JavaScript changes carry relevant type, lint, and test evidence.",
	],
	[
		"python_quality_verified",
		"Python changes carry relevant lint, type, and test evidence.",
	],
	["go_quality_verified", "Go changes carry relevant vet and test evidence."],
	[
		"rust_quality_verified",
		"Rust changes carry relevant Clippy and test evidence.",
	],
	[
		"shell_quality_verified",
		"Shell changes carry relevant static-analysis and execution evidence.",
	],
] as const;

const MODEL_STANDARD_IDS = new Set([
	"recommendation_justified",
	"intention_validated",
	"production_quality_reviewed",
	"outcome_realization_accounted",
	"uncertainty_resolved",
	"security_privacy_reviewed",
	"accessibility_ui_reviewed",
	"api_contract_reviewed",
	"library_contract_preserved",
]);
const HUMAN_STANDARD_IDS = new Set([
	"approval_safety",
	"release_safety_approved",
]);
const EXTERNAL_STANDARD_IDS = new Set([
	"verification_passed",
	"tdd_evidence_valid",
	"content_proof_recorded",
	"typescript_quality_verified",
	"python_quality_verified",
	"go_quality_verified",
	"rust_quality_verified",
	"shell_quality_verified",
]);

const CODEWIKI_QUALITY_STANDARD_REGISTRATIONS = builtInRegistrations();

export function createQualityStandardCatalog(
	additional: ProjectQualityStandardRegistration[] = [],
): QualityStandardCatalog {
	for (const registration of additional) {
		if ("authority" in registration) {
			throw new Error(
				`Caller-supplied Quality Standard ${registration.standard.id} cannot declare authority; the catalog assigns project authority.`,
			);
		}
	}
	const registrations = [
		...CODEWIKI_QUALITY_STANDARD_REGISTRATIONS,
		...additional.map((registration) => ({
			...registration,
			authority: "project" as const,
		})),
	].map(normalizeRegistration);
	const byId = new Map<string, QualityStandardRegistration>();
	for (const registration of registrations) {
		validateRegistration(registration);
		if (byId.has(registration.standard.id)) {
			throw new Error(
				`Duplicate Quality Standard registration ${registration.standard.id}.`,
			);
		}
		byId.set(registration.standard.id, registration);
	}
	for (const registration of registrations) {
		for (const dependency of registration.evaluationDependsOn) {
			const dependencyRegistration = byId.get(dependency);
			if (!dependencyRegistration) {
				throw new Error(
					`Quality Standard ${registration.standard.id} has unknown catalog dependency ${dependency}.`,
				);
			}
			for (const stage of registration.stages) {
				if (!dependencyRegistration.stages.includes(stage)) {
					throw new Error(
						`Quality Standard ${registration.standard.id} dependency ${dependency} is not registered for ${stage}.`,
					);
				}
			}
		}
	}
	assertAcyclicCatalog(registrations);
	return Object.freeze({
		version: QUALITY_STANDARD_CATALOG_VERSION,
		get: (standardId: string) => cloneRegistration(byId.get(standardId)),
		list: (stage?: TraceLoop) =>
			registrations
				.flatMap((registration) => {
					const clone = cloneRegistration(registration);
					return (!stage || registration.stages.includes(stage)) && clone
						? [clone]
						: [];
				})
				.sort((left, right) =>
					left.standard.id.localeCompare(right.standard.id),
				),
	});
}

function builtInRegistrations(): QualityStandardRegistration[] {
	const byId = new Map<
		string,
		{ description: string; stages: Set<TraceLoop> }
	>();
	addDefinitions(byId, "decision", DECISION_BASELINE);
	addDefinitions(byId, "planning", PLANNING_BASELINE);
	addDefinitions(byId, "implementation", IMPLEMENTATION_BASELINE);
	addDefinitions(
		byId,
		["decision", "planning", "implementation"],
		CONDITIONAL_STANDARDS.slice(0, 12),
	);
	addDefinitions(byId, "implementation", CONDITIONAL_STANDARDS.slice(12));
	return [...byId.entries()].map(([id, definition]) =>
		kernelRegistration(id, definition.description, [...definition.stages]),
	);
}

function addDefinitions(
	byId: Map<string, { description: string; stages: Set<TraceLoop> }>,
	stages: TraceLoop | TraceLoop[],
	definitions: readonly (readonly [string, string])[],
): void {
	for (const [id, description] of definitions) {
		const current = byId.get(id);
		if (current) {
			for (const stage of asArray(stages)) current.stages.add(stage);
			continue;
		}
		byId.set(id, { description, stages: new Set(asArray(stages)) });
	}
}

function kernelRegistration(
	id: string,
	description: string,
	stages: TraceLoop[],
): QualityStandardRegistration {
	const kind = standardVerifierKind(id);
	const verifierId = verifierIdForKind(kind);
	return {
		standard: {
			id,
			version: "1.0.0",
			description,
			assessmentCriteria: [description],
			verifier: { id: verifierId, version: "1.0.0", kind },
			measurement: { shape: "boolean" },
			evidenceAdapterIds: evidenceAdapters(kind),
			repairTarget: "stage-candidate",
			cost: standardCost(kind),
			timeoutMs: standardTimeout(kind),
			protected: true,
		},
		stages,
		authority: "kernel",
		rollout: "enforce",
		rolloutHistory: ["observe", "warn"],
		evaluationDependsOn: [],
	};
}

function standardVerifierKind(id: string): QualityStandard["verifier"]["kind"] {
	if (HUMAN_STANDARD_IDS.has(id)) return "human";
	if (MODEL_STANDARD_IDS.has(id)) return "model";
	if (EXTERNAL_STANDARD_IDS.has(id)) return "external";
	return "deterministic";
}

function verifierIdForKind(
	kind: QualityStandard["verifier"]["kind"],
): (typeof QUALITY_VERIFIER_IDS)[number] {
	if (kind === "human") return "codewiki.human-authority";
	if (kind === "model") return "codewiki.model-assessor";
	if (kind === "external") return "codewiki.external-evidence";
	return "codewiki.deterministic";
}

function standardCost(kind: QualityStandard["verifier"]["kind"]): number {
	if (kind === "model") return 4;
	if (kind === "external") return 2;
	return 1;
}

function standardTimeout(kind: QualityStandard["verifier"]["kind"]): number {
	if (kind === "model") return 30_000;
	if (kind === "external") return 60_000;
	return 5_000;
}

function evidenceAdapters(kind: QualityStandard["verifier"]["kind"]): string[] {
	if (kind === "human") return ["authority", "trace"];
	if (kind === "external") return ["checks", "source", "trace"];
	if (kind === "model") return ["change", "planning", "source", "trace"];
	return ["change", "planning", "trace", "work-state"];
}

function normalizeRegistration(
	registration: QualityStandardRegistration,
): QualityStandardRegistration {
	return {
		...registration,
		standard: {
			...registration.standard,
			assessmentCriteria: unique(registration.standard.assessmentCriteria),
			evidenceAdapterIds: unique(registration.standard.evidenceAdapterIds),
			verifier: { ...registration.standard.verifier },
			measurement: { ...registration.standard.measurement },
		},
		stages: unique(registration.stages),
		rolloutHistory: [...registration.rolloutHistory],
		evaluationDependsOn: unique(registration.evaluationDependsOn),
		...(registration.approval
			? {
					approval: {
						status: "approved",
						refs: unique(registration.approval.refs),
					},
				}
			: {}),
	};
}

function validateRegistration(registration: QualityStandardRegistration): void {
	validateStandardShape(registration);
	validateClosedVerifierInputs(registration);
	validateStandardAuthority(registration);
}

function validateStandardShape(
	registration: QualityStandardRegistration,
): void {
	const standard = registration.standard;
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(standard.id)) {
		throw new Error("Quality Standard registration requires a stable id.");
	}
	if (!standard.version.trim() || !standard.description.trim()) {
		throw new Error(
			`Quality Standard ${standard.id} requires version and description.`,
		);
	}
	if (
		standard.assessmentCriteria.length === 0 ||
		registration.stages.length === 0
	) {
		throw new Error(
			`Quality Standard ${standard.id} requires criteria and stages.`,
		);
	}
}

function validateClosedVerifierInputs(
	registration: QualityStandardRegistration,
): void {
	const standard = registration.standard;
	if (
		!(QUALITY_VERIFIER_IDS as readonly string[]).includes(standard.verifier.id)
	) {
		throw new Error(
			`Quality Standard ${standard.id} uses unknown verifier ${standard.verifier.id}.`,
		);
	}
	for (const adapterId of standard.evidenceAdapterIds) {
		if (
			!(QUALITY_EVIDENCE_ADAPTER_IDS as readonly string[]).includes(adapterId)
		) {
			throw new Error(
				`Quality Standard ${standard.id} uses unknown evidence adapter ${adapterId}.`,
			);
		}
	}
}

function validateStandardAuthority(
	registration: QualityStandardRegistration,
): void {
	const standard = registration.standard;
	if (registration.authority === "kernel") {
		if (!standard.protected || registration.rollout !== "enforce") {
			throw new Error(
				`Kernel Quality Standard ${standard.id} must be protected and enforced.`,
			);
		}
		return;
	}
	if (standard.protected) {
		throw new Error(
			`Only kernel Quality Standards may be protected: ${standard.id}.`,
		);
	}
	if (registration.authority === "project")
		validateProjectRollout(registration);
}

function validateProjectRollout(
	registration: QualityStandardRegistration,
): void {
	const standardId = registration.standard.id;
	const expectedHistory = expectedProjectRolloutHistory(registration.rollout);
	if (
		JSON.stringify(registration.rolloutHistory) !==
		JSON.stringify(expectedHistory)
	) {
		throw new Error(
			`Project Quality Standard ${standardId} must progress through ${expectedHistory.join(" -> ") || "no prior rollout"} before ${registration.rollout}.`,
		);
	}
	if (
		registration.rollout === "enforce" &&
		!registration.approval?.refs.length
	) {
		throw new Error(
			`Project Quality Standard ${standardId} requires approval before enforce.`,
		);
	}
}

function assertAcyclicCatalog(
	registrations: QualityStandardRegistration[],
): void {
	const byId = new Map(
		registrations.map((registration) => [
			registration.standard.id,
			registration,
		]),
	);
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (standardId: string): void => {
		if (visiting.has(standardId)) {
			throw new Error(
				`Quality Standard catalog dependency cycle includes ${standardId}.`,
			);
		}
		if (visited.has(standardId)) return;
		visiting.add(standardId);
		for (const dependency of byId.get(standardId)?.evaluationDependsOn ?? []) {
			visit(dependency);
		}
		visiting.delete(standardId);
		visited.add(standardId);
	};
	for (const registration of registrations) visit(registration.standard.id);
}

function expectedProjectRolloutHistory(
	rollout: QualityEnforcementMode,
): QualityEnforcementMode[] {
	if (rollout === "observe") return [];
	if (rollout === "warn") return ["observe"];
	return ["observe", "warn"];
}

function cloneRegistration(
	registration: QualityStandardRegistration | undefined,
): QualityStandardRegistration | undefined {
	return registration ? normalizeRegistration(registration) : undefined;
}

function asArray<T>(value: T | T[]): T[] {
	return Array.isArray(value) ? value : [value];
}

function unique<T>(values: T[]): T[] {
	return [...new Set(values)].sort((left, right) =>
		String(left).localeCompare(String(right)),
	);
}
