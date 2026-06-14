import {
	componentsForRefs,
	componentSupportsSourcePath,
	componentSupportsTestPath,
	unknownComponentRefs,
	type FileStructureComponent,
	type FileStructureMapContract,
} from "../knowledge/file-structure-map.ts";
import { invalidTraceRefs } from "../traces/refs.ts";
import type {
	ExitDetails,
	ExitFinding,
	ExitRemediationItem,
	ExitRoute,
} from "../traces/types.ts";
import { planningConflicts } from "./conflicts.ts";
import {
	criteriaFromQualityStandards,
	planningIssueRefs,
	planningQualityStandards,
} from "./quality-standards.ts";
import { workItemsForDecisionRef } from "./materialization.ts";
import type { PlanningDecisionResolution, PlanningWorkItem } from "./types.ts";

export type PlanningExitIssueCode =
	| "missing_decision_coverage"
	| "unknown_decision_ref"
	| "invalid_work_item"
	| "missing_technical_requirements"
	| "missing_verification"
	| "missing_worker_profile"
	| "missing_planning_assessment"
	| "planning_assessment_not_worker_ready"
	| "missing_uncertainty_resolution"
	| "unresolved_planning_uncertainty"
	| "missing_right_sizing"
	| "work_unit_not_right_sized"
	| "invalid_resolution"
	| "path_conflict"
	| "duplicate_work_item_id"
	| "invalid_acceptance_criterion"
	| "duplicate_acceptance_criterion_id"
	| "missing_component_ref"
	| "unknown_component_ref"
	| "invalid_component_contract"
	| "path_outside_component_scope"
	| "verification_outside_component_tests"
	| "unknown_dependency"
	| "dependency_cycle"
	| "invalid_traceability_ref";

export interface PlanningExitIssue {
	code: PlanningExitIssueCode;
	decisionRef?: string;
	workItemId?: string;
	ref?: string;
	componentRef?: string;
	route?: ExitRoute;
	message: string;
}

export interface PlanningExitInput {
	decisionRefs: string[];
	workItems: PlanningWorkItem[];
	resolutions: PlanningDecisionResolution[];
	componentMap?: FileStructureMapContract;
}

export interface PlanningExitResult extends ExitDetails {
	passed: boolean;
	issues: PlanningExitIssue[];
	coveredDecisionRefs: string[];
	workUnitIds: string[];
}

export function evaluatePlanningExit(
	input: PlanningExitInput,
): PlanningExitResult {
	const issues = collectPlanningExitIssues(input);
	const qualityStandards = planningQualityStandards(issues);
	const verdict =
		blockedIssues(issues).length > 0
			? "block"
			: issues.length === 0
				? "pass"
				: "fail";
	return {
		passed: verdict === "pass",
		verdict,
		issues,
		criteria: criteriaFromQualityStandards(qualityStandards),
		qualityStandards,
		findings: issues.map(issueFinding),
		remediation: issues.map(issueRemediation),
		route: planningRoute(verdict, issues),
		coveredDecisionRefs: coveredDecisionRefs(input),
		workUnitIds: input.workItems.map((item) => item.id),
	};
}

function collectPlanningExitIssues(
	input: PlanningExitInput,
): PlanningExitIssue[] {
	return [
		...coverageIssues(input),
		...unknownDecisionRefIssues(input),
		...duplicateWorkItemIssues(input.workItems),
		...workItemIssues(input.workItems),
		...technicalRequirementIssues(input.workItems),
		...verificationIssues(input.workItems),
		...workerProfileIssues(input.workItems),
		...planningAssessmentIssues(input.workItems),
		...planningUncertaintyIssues(input.workItems),
		...rightSizingIssues(input.workItems),
		...acceptanceCriterionIssues(input.workItems),
		...componentAlignmentIssues(input),
		...dependencyIssues(input.workItems),
		...traceabilityRefIssues(input),
		...resolutionIssues(input.resolutions),
		...conflictIssues(input.workItems),
	];
}

export function planningItemIsExecutable(item: PlanningWorkItem): boolean {
	return (
		[
			...workItemIssues([item]),
			...technicalRequirementIssues([item]),
			...verificationIssues([item]),
			...workerProfileIssues([item]),
			...planningAssessmentIssues([item]),
			...planningUncertaintyIssues([item]),
			...rightSizingIssues([item]),
		].length === 0
	);
}

function coverageIssues(input: PlanningExitInput): PlanningExitIssue[] {
	return input.decisionRefs.flatMap((decisionRef) => {
		const workItems = workItemsForDecisionRef(input.workItems, decisionRef);
		const resolutions = input.resolutions.filter(
			(resolution) => resolution.decisionRef === decisionRef,
		);
		if (workItems.length || resolutions.length) return [];
		return [
			{
				code: "missing_decision_coverage" as const,
				decisionRef,
				message: `Planning does not cover decision ${decisionRef}.`,
			},
		];
	});
}

function unknownDecisionRefIssues(
	input: PlanningExitInput,
): PlanningExitIssue[] {
	const known = new Set(input.decisionRefs);
	return [
		...input.workItems.flatMap((item) => item.decisionRefs),
		...input.resolutions.map((item) => item.decisionRef),
	]
		.filter((decisionRef) => !known.has(decisionRef))
		.map((decisionRef) => ({
			code: "unknown_decision_ref" as const,
			decisionRef,
			message: `Planning references unknown decision ${decisionRef}.`,
		}));
}

function workItemIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	return items.flatMap((item) => {
		const missing = [
			item.id ? "" : "id",
			item.decisionRefs.length ? "" : "decisionRefs",
			item.outcome ? "" : "outcome",
			item.acceptanceCriteria.length ? "" : "acceptanceCriteria",
			item.pathScopes.length ? "" : "pathScopes",
		].filter(Boolean);
		if (missing.length === 0) return [];
		return [
			{
				code: "invalid_work_item" as const,
				workItemId: item.id,
				message: `Planning work item ${item.id || "<missing>"} is missing ${missing.join(", ")}.`,
			},
		];
	});
}

function technicalRequirementIssues(
	items: PlanningWorkItem[],
): PlanningExitIssue[] {
	return items.flatMap((item) => {
		if (item.technicalRequirements.length > 0) return [];
		return [
			{
				code: "missing_technical_requirements" as const,
				workItemId: item.id,
				message: `Planning work item ${item.id} needs technical requirements for implementation handoff.`,
			},
		];
	});
}

function verificationIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	return items.flatMap((item) => {
		if (item.verification.length > 0) return [];
		return [
			{
				code: "missing_verification" as const,
				workItemId: item.id,
				message: `Planning work item ${item.id} needs verification refs or commands.`,
			},
		];
	});
}

function workerProfileIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	return items.flatMap((item) => {
		if (item.workerProfile) return [];
		return [
			{
				code: "missing_worker_profile" as const,
				workItemId: item.id,
				message: `Planning work item ${item.id} needs a worker profile for assignment.`,
			},
		];
	});
}

function planningAssessmentIssues(
	items: PlanningWorkItem[],
): PlanningExitIssue[] {
	return items.flatMap((item): PlanningExitIssue[] => {
		const assessment = item.planningAssessment;
		const missingStance = !assessment.stance;
		const missingIndependence = !assessment.independence;
		const missingImplementationReadiness = !assessment.implementationReadiness;
		const missingRationale = !assessment.rationale;
		if (
			missingStance ||
			missingIndependence ||
			missingImplementationReadiness ||
			missingRationale
		) {
			return [
				{
					code: "missing_planning_assessment" as const,
					workItemId: item.id,
					message: `Planning work item ${item.id} needs agent assessment for independence and implementation readiness.`,
				},
			];
		}
		if (assessment.stance !== "worker_ready") {
			return [
				{
					code: "planning_assessment_not_worker_ready" as const,
					workItemId: item.id,
					message: `Planning work item ${item.id} is not assessed as worker-ready.`,
				},
			];
		}
		return [];
	});
}

function planningUncertaintyIssues(
	items: PlanningWorkItem[],
): PlanningExitIssue[] {
	return items.flatMap((item): PlanningExitIssue[] => {
		const assessment = item.planningAssessment;
		const issues: PlanningExitIssue[] = [];
		if (!assessment.uncertaintyResolution) {
			issues.push({
				code: "missing_uncertainty_resolution",
				workItemId: item.id,
				message: `Planning work item ${item.id} must state that uncertainty is resolved or name where it is routed.`,
			});
		}
		if (assessment.uncertainties.length > 0) {
			issues.push({
				code: "unresolved_planning_uncertainty",
				workItemId: item.id,
				route: uncertaintyRoute(assessment.uncertaintyOwner),
				message: `Planning work item ${item.id} has unresolved uncertainty: ${assessment.uncertainties.join("; ")}.`,
			});
		}
		return issues;
	});
}

function rightSizingIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	return items.flatMap((item): PlanningExitIssue[] => {
		const assessment = item.planningAssessment;
		if (!assessment.workUnitSize || !assessment.rightSizing) {
			return [
				{
					code: "missing_right_sizing" as const,
					workItemId: item.id,
					message: `Planning work item ${item.id} needs right-sizing assessment so sprint-sized or tiny busywork is not assigned as a worker unit.`,
				},
			];
		}
		if (assessment.workUnitSize !== "right_sized") {
			return [
				{
					code: "work_unit_not_right_sized" as const,
					workItemId: item.id,
					message: `Planning work item ${item.id} is assessed as ${assessment.workUnitSize}, not right_sized.`,
				},
			];
		}
		return [];
	});
}

function acceptanceCriterionIssues(
	items: PlanningWorkItem[],
): PlanningExitIssue[] {
	return items.flatMap((item) => [
		...invalidAcceptanceCriterionIssues(item),
		...duplicateAcceptanceCriterionIssues(item),
	]);
}

function invalidAcceptanceCriterionIssues(
	item: PlanningWorkItem,
): PlanningExitIssue[] {
	return item.acceptanceCriteria.flatMap((criterion) => {
		if (criterion.id && criterion.text) return [];
		return [
			{
				code: "invalid_acceptance_criterion" as const,
				workItemId: item.id,
				message: `Planning work item ${item.id} has acceptance criterion missing id or text.`,
			},
		];
	});
}

function duplicateAcceptanceCriterionIssues(
	item: PlanningWorkItem,
): PlanningExitIssue[] {
	const counts = new Map<string, number>();
	for (const criterion of item.acceptanceCriteria) {
		counts.set(criterion.id, (counts.get(criterion.id) || 0) + 1);
	}
	return [...counts.entries()]
		.filter(([id, count]) => id && count > 1)
		.map(([id]) => ({
			code: "duplicate_acceptance_criterion_id" as const,
			workItemId: item.id,
			message: `Planning work item ${item.id} acceptance criterion id ${id} appears more than once.`,
		}));
}

function componentAlignmentIssues(
	input: PlanningExitInput,
): PlanningExitIssue[] {
	if (!input.componentMap) return [];
	return [
		...missingComponentRefIssues(input.workItems),
		...unknownComponentRefIssues(input),
		...invalidComponentContractIssues(input),
		...componentPathScopeIssues(input),
		...componentVerificationIssues(input),
	];
}

function missingComponentRefIssues(
	items: PlanningWorkItem[],
): PlanningExitIssue[] {
	return items.flatMap((item) => {
		if (item.componentRefs.length > 0) return [];
		return [
			{
				code: "missing_component_ref" as const,
				workItemId: item.id,
				message: `Planning work item ${item.id} needs componentRefs for file-structure alignment.`,
			},
		];
	});
}

function unknownComponentRefIssues(
	input: PlanningExitInput,
): PlanningExitIssue[] {
	if (!input.componentMap) return [];
	return input.workItems.flatMap((item) =>
		unknownComponentRefs(input.componentMap!, item.componentRefs).map(
			(componentRef) => ({
				code: "unknown_component_ref" as const,
				workItemId: item.id,
				componentRef,
				message: `Planning work item ${item.id} references unknown component ${componentRef}.`,
			}),
		),
	);
}

function invalidComponentContractIssues(
	input: PlanningExitInput,
): PlanningExitIssue[] {
	if (!input.componentMap) return [];
	const componentRefs = uniqueStrings(
		input.workItems.flatMap((item) => item.componentRefs),
	);
	return componentsForRefs(input.componentMap, componentRefs).flatMap(
		(component) => {
			const missing = componentContractMissingFields(component);
			if (missing.length === 0) return [];
			return [
				{
					code: "invalid_component_contract" as const,
					componentRef: component.id,
					message: `File-structure component ${component.id} is missing ${missing.join(", ")}.`,
				},
			];
		},
	);
}

function componentPathScopeIssues(
	input: PlanningExitInput,
): PlanningExitIssue[] {
	if (!input.componentMap) return [];
	return input.workItems.flatMap((item) => {
		const components = componentsForRefs(
			input.componentMap!,
			item.componentRefs,
		);
		if (components.length === 0) return [];
		return item.pathScopes.flatMap((pathScope) => {
			if (
				components.some((component) =>
					componentSupportsSourcePath(component, pathScope),
				)
			) {
				return [];
			}
			return [
				{
					code: "path_outside_component_scope" as const,
					workItemId: item.id,
					ref: pathScope,
					message: `Planning work item ${item.id} path scope ${pathScope} is outside declared components ${item.componentRefs.join(", ")}.`,
				},
			];
		});
	});
}

function componentVerificationIssues(
	input: PlanningExitInput,
): PlanningExitIssue[] {
	if (!input.componentMap) return [];
	return input.workItems.flatMap((item) => {
		const components = componentsForRefs(
			input.componentMap!,
			item.componentRefs,
		);
		if (components.length === 0) return [];
		return item.verification
			.filter((verificationRef) => verificationRef.startsWith("tests/"))
			.flatMap((verificationRef) => {
				if (
					components.some((component) =>
						componentSupportsTestPath(component, verificationRef),
					)
				) {
					return [];
				}
				return [
					{
						code: "verification_outside_component_tests" as const,
						workItemId: item.id,
						ref: verificationRef,
						message: `Planning work item ${item.id} verification ${verificationRef} is outside declared component test paths.`,
					},
				];
			});
	});
}

function componentContractMissingFields(
	component: FileStructureComponent,
): string[] {
	return [
		component.kbRefs.length ? "" : "kbRefs",
		component.pathPatterns.length ? "" : "paths",
		component.testPatterns.length ? "" : "testPaths",
	].filter(Boolean);
}

function duplicateWorkItemIssues(
	items: PlanningWorkItem[],
): PlanningExitIssue[] {
	const counts = new Map<string, number>();
	for (const item of items) counts.set(item.id, (counts.get(item.id) || 0) + 1);
	return [...counts.entries()]
		.filter(([id, count]) => id && count > 1)
		.map(([id]) => ({
			code: "duplicate_work_item_id" as const,
			workItemId: id,
			message: `Planning work item id ${id} appears more than once.`,
		}));
}

function dependencyIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	return [...unknownDependencyIssues(items), ...dependencyCycleIssues(items)];
}

function unknownDependencyIssues(
	items: PlanningWorkItem[],
): PlanningExitIssue[] {
	const ids = new Set(items.map((item) => item.id));
	return items.flatMap((item) =>
		item.dependsOn
			.filter((dependency) => !ids.has(dependency))
			.map((dependency) => ({
				code: "unknown_dependency" as const,
				workItemId: item.id,
				message: `Planning work item ${item.id} depends on unknown work item ${dependency}.`,
			})),
	);
}

function dependencyCycleIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	const byId = new Map(items.map((item) => [item.id, item]));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const cycleIds = new Set<string>();
	for (const item of items)
		visitDependency(item.id, byId, visiting, visited, cycleIds);
	return [...cycleIds].map((id) => ({
		code: "dependency_cycle" as const,
		workItemId: id,
		message: `Planning work item ${id} participates in a dependency cycle.`,
	}));
}

function visitDependency(
	id: string,
	byId: Map<string, PlanningWorkItem>,
	visiting: Set<string>,
	visited: Set<string>,
	cycleIds: Set<string>,
): void {
	if (!id || visited.has(id)) return;
	if (visiting.has(id)) {
		cycleIds.add(id);
		return;
	}
	const item = byId.get(id);
	if (!item) return;
	visiting.add(id);
	for (const dependency of item.dependsOn)
		visitDependency(dependency, byId, visiting, visited, cycleIds);
	visiting.delete(id);
	visited.add(id);
}

function traceabilityRefIssues(input: PlanningExitInput): PlanningExitIssue[] {
	return invalidTraceRefs([
		...input.decisionRefs,
		...input.workItems.flatMap((item) => [
			...item.decisionRefs,
			...item.pathScopes,
		]),
		...input.resolutions.flatMap((resolution) => [
			resolution.decisionRef,
			...resolution.evidenceRefs,
		]),
	]).map((ref) => ({
		code: "invalid_traceability_ref" as const,
		ref,
		message: `Planning has non-canonical ref ${ref}.`,
	}));
}

function resolutionIssues(
	resolutions: PlanningDecisionResolution[],
): PlanningExitIssue[] {
	return resolutions.flatMap((resolution) => {
		const missing = requiredResolutionFields(resolution);
		if (missing.length === 0) return [];
		return [
			{
				code: "invalid_resolution" as const,
				decisionRef: resolution.decisionRef,
				message: `Planning resolution for ${resolution.decisionRef} is missing ${missing.join(", ")}.`,
			},
		];
	});
}

function requiredResolutionFields(
	resolution: PlanningDecisionResolution,
): string[] {
	if (resolution.kind === "work-unit")
		return resolution.workUnitIds.length ? [] : ["workUnitIds"];
	if (resolution.kind === "deferred") {
		return [
			resolution.owner ? "" : "owner",
			resolution.trigger ? "" : "trigger",
			resolution.rationale ? "" : "rationale",
			resolution.evidenceRefs.length ? "" : "evidenceRefs",
		].filter(Boolean);
	}
	return resolution.evidenceRefs.length ? [] : ["evidenceRefs"];
}

function conflictIssues(items: PlanningWorkItem[]): PlanningExitIssue[] {
	return planningConflicts(items).map((conflict) => ({
		code: "path_conflict" as const,
		workItemId: conflict.leftId,
		message: `Planning work items ${conflict.leftId} and ${conflict.rightId} overlap on ${conflict.pathScopes.join(", ")}.`,
	}));
}

function coveredDecisionRefs(input: PlanningExitInput): string[] {
	return input.decisionRefs.filter(
		(decisionRef) =>
			workItemsForDecisionRef(input.workItems, decisionRef).length > 0 ||
			input.resolutions.some(
				(resolution) => resolution.decisionRef === decisionRef,
			),
	);
}

function planningRoute(
	verdict: PlanningExitVerdict,
	issues: PlanningExitIssue[],
): ExitRoute {
	if (verdict === "pass") return "implementation";
	const [explicitRoute] = issues
		.map((issue) => issue.route)
		.filter((route): route is ExitRoute => Boolean(route));
	if (explicitRoute) return explicitRoute;
	return "planning";
}

function blockedIssues(issues: PlanningExitIssue[]): PlanningExitIssue[] {
	return issues.filter((issue) => issue.route === "user");
}

function uncertaintyRoute(owner: string): ExitRoute {
	if (owner === "decision") return "decision";
	if (owner === "user") return "user";
	return "planning";
}

type PlanningExitVerdict = "pass" | "fail" | "block";

function issueFinding(issue: PlanningExitIssue): ExitFinding {
	const refs = planningIssueRefs(issue);
	return {
		id: `planning:${issue.code}:${refs[0] || "plan"}`,
		severity: "error",
		criterion: issue.code,
		message: issue.message,
		refs,
		rationale:
			"Planning evidence must cover accepted decisions before implementation consumes it.",
	};
}

function issueRemediation(issue: PlanningExitIssue): ExitRemediationItem {
	const refs = planningIssueRefs(issue);
	return {
		action: planningRemediationAction(issue),
		route: "planning",
		refs,
		blocking: true,
	};
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}

const PLANNING_REMEDIATION: Record<PlanningExitIssueCode, string> = {
	missing_decision_coverage:
		"Create a work unit or explicit resolution for the uncovered decision.",
	unknown_decision_ref:
		"Replace the unknown decision ref with a passed decision event ref.",
	invalid_work_item:
		"Complete work item id, decision refs, outcome, acceptance, and path scopes.",
	missing_technical_requirements:
		"Break the work item into concrete technical requirements for implementation.",
	missing_verification:
		"Add verification refs or commands that implementation must run or satisfy.",
	missing_worker_profile:
		"Declare the worker profile needed to claim this unit of work.",
	missing_planning_assessment:
		"Add agent assessment proving the work item is independent and implementation-ready.",
	planning_assessment_not_worker_ready:
		"Split or clarify the work item until the agent assesses it as worker-ready.",
	missing_uncertainty_resolution:
		"State whether planning uncertainty is resolved locally or routed to decision/user authority.",
	unresolved_planning_uncertainty:
		"Resolve uncertainty in planning, route back to decision, or block for user clarification before implementation.",
	missing_right_sizing:
		"Add agent assessment that the work item is neither sprint-sized nor tiny busywork.",
	work_unit_not_right_sized:
		"Split, merge, or reframe the work item until it is right-sized for one worker.",
	duplicate_work_item_id: "Give every planning work item a stable unique id.",
	invalid_acceptance_criterion:
		"Give every planning acceptance criterion a stable id and testable text.",
	duplicate_acceptance_criterion_id:
		"Give each acceptance criterion within a work item a unique id.",
	missing_component_ref:
		"Attach componentRefs from the file-structure map to the work item.",
	unknown_component_ref:
		"Use component ids declared in the KB file-structure map.",
	invalid_component_contract:
		"Complete the component map entry with KB refs, owned paths, and test paths.",
	path_outside_component_scope:
		"Align path scopes with declared component ownership or choose the correct component.",
	verification_outside_component_tests:
		"Point verification to tests owned by the declared component.",
	unknown_dependency:
		"Replace unknown dependencies with valid work item ids or remove them.",
	dependency_cycle:
		"Break the dependency cycle by reordering or splitting work items.",
	invalid_traceability_ref:
		"Replace weak refs with canonical KB, trace, Git, digest, source, or test refs.",
	invalid_resolution:
		"Complete resolution evidence, owner, trigger, rationale, or work-unit links as required by its kind.",
	path_conflict:
		"Order conflicting work units with a real dependency or split the path scopes.",
};

function planningRemediationAction(issue: PlanningExitIssue): string {
	return PLANNING_REMEDIATION[issue.code];
}
