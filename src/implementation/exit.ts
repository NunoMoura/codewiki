import {
	componentsForRefs,
	componentSupportsSourcePath,
	componentSupportsTestPath,
	unknownComponentRefs,
	type FileStructureComponent,
} from "../knowledge/file-structure-map.ts";
import { invalidTraceRefs } from "../traces/refs.ts";
import type {
	ExitFinding,
	ExitRemediationItem,
	ExitRoute,
} from "../traces/types.ts";
import {
	acceptanceEvidenceRefs,
	changedPaths,
	checkResultRefs,
	contentProofRefList,
	contentProofRefs,
} from "./evidence.ts";
import {
	criteriaFromQualityStandards,
	implementationQualityStandards,
	implementationIssueRefs,
} from "./quality-standards.ts";
import type {
	CheckResult,
	ImplementationChange,
	ImplementationExitInput,
	ImplementationExitIssue,
	ImplementationExitResult,
} from "./types.ts";

export function evaluateImplementationExit(
	input: ImplementationExitInput,
): ImplementationExitResult {
	const issues = collectImplementationExitIssues(input);
	const qualityStandards = implementationQualityStandards(issues);
	const verdict =
		issues.length === 0
			? "pass"
			: blockedIssues(issues).length > 0
				? "block"
				: "fail";
	return {
		passed: verdict === "pass",
		verdict,
		issues,
		criteria: criteriaFromQualityStandards(qualityStandards),
		qualityStandards,
		findings: issues.map(issueFinding),
		remediation: issues.map(issueRemediation),
		route: implementationRoute(verdict, issues),
		coveredPlanningRefs: coveredPlanningRefs(input),
		changeIds: input.changes.map((change) => change.id),
	};
}

function collectImplementationExitIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	return [
		...coverageIssues(input),
		...unknownPlanningRefIssues(input),
		...workerResultIssues(input),
		...duplicateChangeIssues(input.changes),
		...changeIssues(input.changes),
		...checkResultIssues(input.changes),
		...tddEvidenceIssues(input),
		...acceptanceEvidenceIssues(input),
		...componentAlignmentIssues(input),
		...pathExistenceIssues(input),
		...contentProofIssues(input),
		...implementationAssessmentIssues(input.changes),
		...sensitiveSurfaceIssues(input.changes),
		...releaseSafetyIssues(input.changes),
		...traceabilityRefIssues(input),
	];
}

export function implementationHasValidationInputs(
	change: ImplementationChange,
): boolean {
	return (
		changeIssues([change]).length === 0 &&
		checkResultIssues([change]).length === 0 &&
		acceptanceEvidenceIssues({
			planningRefs: change.planningRefs,
			changes: [change],
		}).length === 0 &&
		changeContentProofIssues([change]).length === 0
	);
}

function coverageIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	return input.planningRefs.flatMap((planningRef) => {
		if (
			input.changes.some((change) => change.planningRefs.includes(planningRef))
		)
			return [];
		return [
			{
				code: "missing_planning_coverage" as const,
				planningRef,
				message: `Implementation does not cover planning work ${planningRef}.`,
			},
		];
	});
}

function unknownPlanningRefIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	const known = new Set(input.planningRefs);
	return input.changes
		.flatMap((change) =>
			change.planningRefs.map((planningRef) => ({ change, planningRef })),
		)
		.filter(({ planningRef }) => !known.has(planningRef))
		.map(({ change, planningRef }) => ({
			code: "unknown_planning_ref" as const,
			planningRef,
			changeId: change.id,
			message: `Implementation change ${change.id} references unknown planning work ${planningRef}.`,
		}));
}

function workerResultIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	return (input.workerResults || []).flatMap((worker) => [
		...workerClaimIssues(input, worker),
		...workerStatusIssues(worker),
	]);
}

function workerStatusIssues(
	worker: NonNullable<ImplementationExitInput["workerResults"]>[number],
): ImplementationExitIssue[] {
	if (worker.status === "completed") return [];
	const code = worker.status === "blocked" ? "worker_blocked" : "worker_failed";
	return [
		{
			code,
			workerId: worker.workerId,
			claimId: worker.claimId,
			planningRef: worker.planningRefs[0],
			ref: worker.refs[0],
			message:
				worker.message ||
				`Implementation worker ${worker.workerId} ${worker.status} for ${worker.workUnitId}.`,
		},
	];
}

function workerClaimIssues(
	input: ImplementationExitInput,
	worker: NonNullable<ImplementationExitInput["workerResults"]>[number],
): ImplementationExitIssue[] {
	if (!worker.claimId) {
		return [
			{
				code: "missing_worker_claim" as const,
				workerId: worker.workerId,
				planningRef: worker.planningRefs[0],
				message: `Implementation worker ${worker.workerId} result does not identify a runtime claim.`,
			},
		];
	}
	const claim = (input.workerClaims || []).find(
		(candidate) => candidate.claimId === worker.claimId,
	);
	if (!claim) {
		return [
			{
				code: "unknown_worker_claim" as const,
				workerId: worker.workerId,
				claimId: worker.claimId,
				planningRef: worker.planningRefs[0],
				message: `Implementation worker ${worker.workerId} references unknown runtime claim ${worker.claimId}.`,
			},
		];
	}
	if (claim.status !== "active") {
		return [
			{
				code: "inactive_worker_claim" as const,
				workerId: worker.workerId,
				claimId: worker.claimId,
				planningRef: worker.planningRefs[0],
				ref: claim.refs[0],
				message: `Implementation worker ${worker.workerId} references ${claim.status} runtime claim ${worker.claimId}.`,
			},
		];
	}
	if (workerMatchesClaim(worker, claim)) return [];
	return [
		{
			code: "worker_claim_mismatch" as const,
			workerId: worker.workerId,
			claimId: worker.claimId,
			planningRef: worker.planningRefs[0],
			ref: claim.refs[0],
			message: `Implementation worker ${worker.workerId} result does not match runtime claim ${worker.claimId}.`,
		},
	];
}

function workerMatchesClaim(
	worker: NonNullable<ImplementationExitInput["workerResults"]>[number],
	claim: NonNullable<ImplementationExitInput["workerClaims"]>[number],
): boolean {
	return (
		worker.workerId === claim.workerId &&
		worker.workUnitId === claim.workUnitId &&
		worker.planningRefs.length > 0 &&
		worker.planningRefs.every((planningRef) =>
			claim.planningRefs.includes(planningRef),
		)
	);
}

function duplicateChangeIssues(
	changes: ImplementationChange[],
): ImplementationExitIssue[] {
	const counts = new Map<string, number>();
	for (const change of changes)
		counts.set(change.id, (counts.get(change.id) || 0) + 1);
	return [...counts.entries()]
		.filter(([id, count]) => id && count > 1)
		.map(([id]) => ({
			code: "duplicate_change_id" as const,
			changeId: id,
			message: `Implementation change id ${id} appears more than once.`,
		}));
}

function changeIssues(
	changes: ImplementationChange[],
): ImplementationExitIssue[] {
	return changes.flatMap((change) => {
		const missing = [
			change.id ? "" : "id",
			change.planningRefs.length ? "" : "planningRefs",
			changedPaths(change).length ? "" : "changedPaths",
		].filter(Boolean);
		if (missing.length === 0) return [];
		return [
			{
				code: "invalid_change" as const,
				changeId: change.id,
				message: `Implementation change ${change.id || "<missing>"} is missing ${missing.join(", ")}.`,
			},
		];
	});
}

function checkResultIssues(
	changes: ImplementationChange[],
): ImplementationExitIssue[] {
	return changes.flatMap((change) => {
		if (change.checkResults.length === 0) {
			return [
				{
					code: "missing_check_results" as const,
					changeId: change.id,
					message: `Implementation change ${change.id} needs structured check results.`,
				},
			];
		}
		return change.checkResults.flatMap((check) =>
			checkResultIssue(change, check),
		);
	});
}

function checkResultIssue(
	change: ImplementationChange,
	check: CheckResult,
): ImplementationExitIssue[] {
	if (!check.command) {
		return [
			{
				code: "invalid_check_result" as const,
				changeId: change.id,
				message: `Implementation change ${change.id} has a check result without a command.`,
			},
		];
	}
	if (check.phase === "red") {
		if (check.status === "fail") return [];
		return [
			{
				code: "invalid_tdd_evidence" as const,
				changeId: change.id,
				ref: check.outputRef,
				message: `Implementation change ${change.id} red TDD check ${check.command} must fail before implementation.`,
			},
		];
	}
	if (check.status !== "pass") {
		return [
			{
				code: "failed_check" as const,
				changeId: change.id,
				ref: check.outputRef,
				message: `Implementation change ${change.id} check ${check.command} is ${check.status}.`,
			},
		];
	}
	return [];
}

function tddEvidenceIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	if (!input.requireTddEvidence) return [];
	return [
		...tddCriterionIssues(input),
		...fallbackTddChangeIssues(input),
		...unknownTddCriterionIssues(input),
	];
}

function tddCriterionIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	const requirements = input.acceptanceRequirements || [];
	if (requirements.length === 0) return [];
	return requirements.flatMap((requirement) => {
		const changes = codeChangesForPlanningRef(
			input.changes,
			requirement.planningRef,
		);
		if (changes.length === 0) return [];
		return [
			...missingTddPhaseIssue({
				changes,
				requirement,
				phase: "red",
				status: "fail",
				code: "missing_tdd_red_evidence",
			}),
			...missingTddPhaseIssue({
				changes,
				requirement,
				phase: "green",
				status: "pass",
				code: "missing_tdd_green_evidence",
			}),
		];
	});
}

function fallbackTddChangeIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	if ((input.acceptanceRequirements || []).length > 0) return [];
	return input.changes.flatMap((change) => {
		if (change.codePaths.length === 0) return [];
		return [
			...missingChangeTddPhaseIssue({
				change,
				phase: "red",
				status: "fail",
				code: "missing_tdd_red_evidence",
			}),
			...missingChangeTddPhaseIssue({
				change,
				phase: "green",
				status: "pass",
				code: "missing_tdd_green_evidence",
			}),
		];
	});
}

function unknownTddCriterionIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	const requirements = input.acceptanceRequirements || [];
	if (requirements.length === 0) return [];
	const knownByPlanningRef = new Map<string, Set<string>>();
	for (const requirement of requirements) {
		const known =
			knownByPlanningRef.get(requirement.planningRef) || new Set<string>();
		known.add(requirement.criterionId);
		knownByPlanningRef.set(requirement.planningRef, known);
	}
	return input.changes.flatMap((change) =>
		change.checkResults.flatMap((check) => {
			if (!check.phase || !check.criterionId) return [];
			const known = change.planningRefs.some((planningRef) =>
				knownByPlanningRef.get(planningRef)?.has(check.criterionId || ""),
			);
			if (known) return [];
			return [
				{
					code: "unknown_tdd_criterion" as const,
					changeId: change.id,
					message: `Implementation change ${change.id} TDD check references unknown acceptance criterion ${check.criterionId}.`,
				},
			];
		}),
	);
}

function codeChangesForPlanningRef(
	changes: ImplementationChange[],
	planningRef: string,
): ImplementationChange[] {
	return changes.filter(
		(change) =>
			change.planningRefs.includes(planningRef) && change.codePaths.length > 0,
	);
}

function missingTddPhaseIssue(input: {
	changes: ImplementationChange[];
	requirement: { planningRef: string; criterionId: string };
	phase: "red" | "green";
	status: "fail" | "pass";
	code: "missing_tdd_red_evidence" | "missing_tdd_green_evidence";
}): ImplementationExitIssue[] {
	const covered = input.changes.some((change) =>
		change.checkResults.some(
			(check) =>
				check.phase === input.phase &&
				check.status === input.status &&
				check.criterionId === input.requirement.criterionId,
		),
	);
	if (covered) return [];
	return [
		{
			code: input.code,
			planningRef: input.requirement.planningRef,
			message: `Implementation needs ${input.phase} TDD evidence for acceptance criterion ${input.requirement.criterionId}.`,
		},
	];
}

function missingChangeTddPhaseIssue(input: {
	change: ImplementationChange;
	phase: "red" | "green";
	status: "fail" | "pass";
	code: "missing_tdd_red_evidence" | "missing_tdd_green_evidence";
}): ImplementationExitIssue[] {
	const covered = input.change.checkResults.some(
		(check) => check.phase === input.phase && check.status === input.status,
	);
	if (covered) return [];
	return [
		{
			code: input.code,
			changeId: input.change.id,
			message: `Implementation change ${input.change.id} needs ${input.phase} TDD evidence.`,
		},
	];
}

function acceptanceEvidenceIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	const structuralIssues = input.changes.flatMap(
		(change): ImplementationExitIssue[] => {
			if (change.acceptanceEvidenceItems.length === 0) {
				return [
					{
						code: "missing_acceptance_evidence" as const,
						changeId: change.id,
						message: `Implementation change ${change.id} needs structured acceptance evidence.`,
					},
				];
			}
			return change.acceptanceEvidenceItems.flatMap((item) => {
				if (item.summary && item.evidenceRefs.length > 0) return [];
				return [
					{
						code: "invalid_acceptance_evidence" as const,
						changeId: change.id,
						message: `Implementation change ${change.id} acceptance evidence needs summary and evidence refs.`,
					},
				];
			});
		},
	);
	if (structuralIssues.length > 0) return structuralIssues;
	return [
		...missingAcceptanceCriterionCoverageIssues(input),
		...unknownAcceptanceCriterionIssues(input),
	];
}

function missingAcceptanceCriterionCoverageIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	const requirements = input.acceptanceRequirements || [];
	return requirements.flatMap((requirement) => {
		const covered = input.changes.some(
			(change) =>
				change.planningRefs.includes(requirement.planningRef) &&
				change.acceptanceEvidenceItems.some(
					(item) =>
						item.criterionId === requirement.criterionId &&
						item.summary &&
						item.evidenceRefs.length > 0,
				),
		);
		if (covered) return [];
		return [
			{
				code: "missing_acceptance_criterion_coverage" as const,
				planningRef: requirement.planningRef,
				message: `Implementation does not cover acceptance criterion ${requirement.criterionId} for ${requirement.planningRef}.`,
			},
		];
	});
}

function unknownAcceptanceCriterionIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	const requirements = input.acceptanceRequirements || [];
	if (requirements.length === 0) return [];
	const knownByPlanningRef = new Map<string, Set<string>>();
	for (const requirement of requirements) {
		const known =
			knownByPlanningRef.get(requirement.planningRef) || new Set<string>();
		known.add(requirement.criterionId);
		knownByPlanningRef.set(requirement.planningRef, known);
	}
	return input.changes.flatMap((change) =>
		change.acceptanceEvidenceItems.flatMap((item) => {
			if (!item.criterionId) return [];
			const known = change.planningRefs.some((planningRef) =>
				knownByPlanningRef.get(planningRef)?.has(item.criterionId || ""),
			);
			if (known) return [];
			return [
				{
					code: "unknown_acceptance_criterion" as const,
					changeId: change.id,
					message: `Implementation change ${change.id} references unknown acceptance criterion ${item.criterionId}.`,
				},
			];
		}),
	);
}

function pathExistenceIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	if (!input.existingPaths) return [];
	const existing = new Set(input.existingPaths.map(normalizePath));
	return input.changes.flatMap((change) => [
		...missingChangedPathIssues(change, existing),
		...missingEvidencePathIssues(change, existing),
	]);
}

function missingChangedPathIssues(
	change: ImplementationChange,
	existing: Set<string>,
): ImplementationExitIssue[] {
	return changedPaths(change)
		.filter(isRepoPathRef)
		.filter((path) => !existing.has(normalizePath(path)))
		.map((path) => ({
			code: "missing_changed_path" as const,
			changeId: change.id,
			ref: path,
			message: `Implementation change ${change.id} references changed path ${path}, but it is absent from the repo snapshot.`,
		}));
}

function missingEvidencePathIssues(
	change: ImplementationChange,
	existing: Set<string>,
): ImplementationExitIssue[] {
	return uniqueStrings([
		...checkResultRefs(change),
		...acceptanceEvidenceRefs(change),
	])
		.filter(isRepoPathRef)
		.filter((path) => !existing.has(normalizePath(path)))
		.map((path) => ({
			code: "missing_evidence_path" as const,
			changeId: change.id,
			ref: path,
			message: `Implementation change ${change.id} references evidence path ${path}, but it is absent from the repo snapshot.`,
		}));
}

function isRepoPathRef(ref: string): boolean {
	return (
		ref.startsWith("src/") ||
		ref.startsWith("tests/") ||
		ref.startsWith(".codewiki/kb/") ||
		[
			"README.md",
			"CHANGELOG.md",
			"LICENSE",
			"package.json",
			"package-lock.json",
			"tsconfig.json",
		].includes(ref)
	);
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/$/, "");
}

function componentAlignmentIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	if (!input.componentMap) return [];
	return [
		...missingComponentRefIssues(input),
		...unknownComponentRefIssues(input),
		...invalidComponentContractIssues(input),
		...planningScopePathIssues(input),
		...changedPathComponentIssues(input),
		...componentTestCoverageIssues(input),
	];
}

function missingComponentRefIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	return (input.planningScopes || []).flatMap((scope) => {
		if (scope.componentRefs.length > 0) return [];
		return [
			{
				code: "missing_component_ref" as const,
				planningRef: scope.planningRef,
				message: `Planning scope ${scope.planningRef} needs componentRefs for implementation alignment.`,
			},
		];
	});
}

function unknownComponentRefIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	if (!input.componentMap) return [];
	return (input.planningScopes || []).flatMap((scope) =>
		unknownComponentRefs(input.componentMap!, scope.componentRefs).map(
			(componentRef) => ({
				code: "unknown_component_ref" as const,
				planningRef: scope.planningRef,
				componentRef,
				message: `Planning scope ${scope.planningRef} references unknown component ${componentRef}.`,
			}),
		),
	);
}

function invalidComponentContractIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	if (!input.componentMap) return [];
	const componentRefs = uniqueStrings(
		(input.planningScopes || []).flatMap((scope) => scope.componentRefs),
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

function planningScopePathIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	if (!input.componentMap) return [];
	return (input.planningScopes || []).flatMap((scope) => {
		const components = componentsForRefs(
			input.componentMap!,
			scope.componentRefs,
		);
		if (components.length === 0) return [];
		return scope.pathScopes.flatMap((pathScope) => {
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
					planningRef: scope.planningRef,
					ref: pathScope,
					message: `Planning scope ${scope.planningRef} path ${pathScope} is outside declared components ${scope.componentRefs.join(", ")}.`,
				},
			];
		});
	});
}

function changedPathComponentIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	return input.changes.flatMap((change) => {
		const components = componentsForChange(input, change);
		if (components.length === 0) return [];
		return [
			...sourcePathComponentIssues(change.id, components, [
				...change.codePaths,
				...change.docPaths,
			]),
			...testPathComponentIssues(change.id, components, change.testPaths),
		];
	});
}

function sourcePathComponentIssues(
	changeId: string,
	components: FileStructureComponent[],
	paths: string[],
): ImplementationExitIssue[] {
	return paths.flatMap((path) => {
		if (
			components.some((component) =>
				componentSupportsSourcePath(component, path),
			)
		) {
			return [];
		}
		return [
			{
				code: "path_outside_component_scope" as const,
				changeId,
				ref: path,
				message: `Implementation change ${changeId} path ${path} is outside declared component ownership.`,
			},
		];
	});
}

function testPathComponentIssues(
	changeId: string,
	components: FileStructureComponent[],
	paths: string[],
): ImplementationExitIssue[] {
	return paths.flatMap((path) => {
		if (
			components.some((component) => componentSupportsTestPath(component, path))
		) {
			return [];
		}
		return [
			{
				code: "path_outside_component_scope" as const,
				changeId,
				ref: path,
				message: `Implementation change ${changeId} test path ${path} is outside declared component test ownership.`,
			},
		];
	});
}

function componentTestCoverageIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	return input.changes.flatMap((change) => {
		if (change.codePaths.length === 0) return [];
		const touchedComponents = componentsForChange(input, change).filter(
			(component) =>
				change.codePaths.some((path) =>
					componentSupportsSourcePath(component, path),
				),
		);
		const testEvidenceRefs = componentTestEvidenceRefs(change);
		return touchedComponents.flatMap((component) => {
			if (
				testEvidenceRefs.some((path) =>
					componentSupportsTestPath(component, path),
				)
			) {
				return [];
			}
			return [
				{
					code: "missing_component_test_coverage" as const,
					changeId: change.id,
					componentRef: component.id,
					message: `Implementation change ${change.id} touches ${component.id} code without a matching component test path.`,
				},
			];
		});
	});
}

function componentTestEvidenceRefs(change: ImplementationChange): string[] {
	return uniqueStrings([
		...change.testPaths,
		...checkResultRefs(change),
		...acceptanceEvidenceRefs(change),
	]).filter((ref) => ref.startsWith("tests/"));
}

function componentsForChange(
	input: ImplementationExitInput,
	change: ImplementationChange,
): FileStructureComponent[] {
	if (!input.componentMap) return [];
	return uniqueComponents(
		change.planningRefs.flatMap((planningRef) => {
			const scope = (input.planningScopes || []).find(
				(candidate) => candidate.planningRef === planningRef,
			);
			return scope
				? componentsForRefs(input.componentMap!, scope.componentRefs)
				: [];
		}),
	);
}

function uniqueComponents(
	components: FileStructureComponent[],
): FileStructureComponent[] {
	const seen = new Set<string>();
	return components.filter((component) => {
		if (seen.has(component.id)) return false;
		seen.add(component.id);
		return true;
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

function uniqueStrings(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}

function implementationAssessmentIssues(
	changes: ImplementationChange[],
): ImplementationExitIssue[] {
	return changes.flatMap((change): ImplementationExitIssue[] => {
		const assessment = change.implementationAssessment;
		const missingAssessment =
			!assessment.stance ||
			!assessment.maintainability ||
			!assessment.simplicity ||
			!assessment.projectStyle ||
			!assessment.errorHandling ||
			!assessment.rationale;
		const issues: ImplementationExitIssue[] = [];
		if (missingAssessment) {
			issues.push({
				code: "missing_implementation_assessment",
				changeId: change.id,
				message: `Implementation change ${change.id} needs agent production-quality assessment.`,
			});
		} else if (assessment.stance !== "production_ready") {
			issues.push({
				code: "implementation_not_production_ready",
				changeId: change.id,
				message: `Implementation change ${change.id} is assessed as ${assessment.stance}, not production_ready.`,
			});
		}
		if (!assessment.uncertaintyResolution) {
			issues.push({
				code: "missing_implementation_uncertainty_resolution",
				changeId: change.id,
				message: `Implementation change ${change.id} must state that uncertainty is resolved or routed.`,
			});
		}
		if (assessment.uncertainties.length > 0) {
			issues.push({
				code: "unresolved_implementation_uncertainty",
				changeId: change.id,
				route: uncertaintyRoute(assessment.uncertaintyOwner),
				message: `Implementation change ${change.id} has unresolved uncertainty: ${assessment.uncertainties.join("; ")}.`,
			});
		}
		return issues;
	});
}

function sensitiveSurfaceIssues(
	changes: ImplementationChange[],
): ImplementationExitIssue[] {
	return changes.flatMap((change): ImplementationExitIssue[] => [
		...securityPrivacyIssues(change),
		...accessibilityIssues(change),
		...dependencyRiskIssues(change),
	]);
}

function securityPrivacyIssues(
	change: ImplementationChange,
): ImplementationExitIssue[] {
	if (!needsSecurityPrivacyReview(change)) return [];
	const assessment = change.sensitiveSurfaceAssessment;
	if (assessment.security && assessment.privacy && assessment.rationale)
		return [];
	return [
		{
			code: "missing_security_privacy_assessment" as const,
			changeId: change.id,
			message: `Implementation change ${change.id} touches security/privacy-sensitive surface and needs review evidence.`,
		},
	];
}

function accessibilityIssues(
	change: ImplementationChange,
): ImplementationExitIssue[] {
	if (!needsAccessibilityReview(change)) return [];
	const assessment = change.sensitiveSurfaceAssessment;
	if (assessment.accessibility && assessment.rationale) return [];
	return [
		{
			code: "missing_accessibility_assessment" as const,
			changeId: change.id,
			message: `Implementation change ${change.id} touches UI/page surface and needs accessibility review evidence.`,
		},
	];
}

function dependencyRiskIssues(
	change: ImplementationChange,
): ImplementationExitIssue[] {
	if (!needsDependencyReview(change)) return [];
	const assessment = change.sensitiveSurfaceAssessment;
	if (assessment.dependencyRisk && assessment.rationale) return [];
	return [
		{
			code: "missing_dependency_risk_assessment" as const,
			changeId: change.id,
			message: `Implementation change ${change.id} touches dependency surface and needs dependency risk assessment.`,
		},
	];
}

function releaseSafetyIssues(
	changes: ImplementationChange[],
): ImplementationExitIssue[] {
	return changes.flatMap((change): ImplementationExitIssue[] => {
		if (change.publicationRefs.length === 0) return [];
		if (change.approvalAuthority !== "user" || !change.approvalRef) {
			return [
				{
					code: "missing_release_approval" as const,
					changeId: change.id,
					route: "user",
					message: `Implementation change ${change.id} has release/publication refs and needs explicit user approval.`,
				},
			];
		}
		const [invalidApprovalRef] = invalidTraceRefs([change.approvalRef]);
		return invalidApprovalRef
			? [
					{
						code: "invalid_release_approval_ref" as const,
						changeId: change.id,
						ref: invalidApprovalRef,
						route: "user",
						message: `Implementation change ${change.id} has non-canonical approval ref ${invalidApprovalRef}.`,
					},
				]
			: [];
	});
}

function needsSecurityPrivacyReview(change: ImplementationChange): boolean {
	return changedPaths(change).some((path) =>
		/(auth|security|privacy|secret|token|credential|session|permission|policy)/i.test(
			path,
		),
	);
}

function needsAccessibilityReview(change: ImplementationChange): boolean {
	return changedPaths(change).some((path) =>
		/(ui|page|screen|view|component|tsx|jsx|html|css)/i.test(path),
	);
}

function needsDependencyReview(change: ImplementationChange): boolean {
	return changedPaths(change).some((path) =>
		/^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(
			path,
		),
	);
}

function traceabilityRefIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	return invalidTraceRefs([
		...input.planningRefs,
		...input.changes.flatMap((change) => [
			...change.planningRefs,
			...changedPaths(change),
			...checkResultRefs(change),
			...acceptanceEvidenceRefs(change),
			...contentProofRefs(change),
			...change.publicationRefs,
		]),
		...contentProofRefList(input.aggregateContentProof),
	]).map((ref) => ({
		code: "invalid_traceability_ref" as const,
		ref,
		message: `Implementation has non-canonical ref ${ref}.`,
	}));
}

function contentProofIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	return [
		...changeContentProofIssues(input.changes),
		...aggregateContentProofIssues(input),
	];
}

function changeContentProofIssues(
	changes: ImplementationChange[],
): ImplementationExitIssue[] {
	return changes.flatMap((change) => {
		if (contentProofRefs(change).length > 0) return [];
		return [
			{
				code: "missing_content_proof" as const,
				changeId: change.id,
				message: `Implementation change ${change.id} needs commit/tree or working-tree digest proof.`,
			},
		];
	});
}

function aggregateContentProofIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	if (!requiresAggregateContentProof(input)) return [];
	if (contentProofRefList(input.aggregateContentProof).length > 0) return [];
	return [
		{
			code: "missing_aggregate_content_proof" as const,
			message:
				"Implementation output needs aggregate content proof after merging worker or parallel changes.",
		},
	];
}

function requiresAggregateContentProof(
	input: ImplementationExitInput,
): boolean {
	return (
		input.changes.length > 1 ||
		(input.workerResults || []).length > 0 ||
		input.changes.some((change) => Boolean(change.workerId || change.claimId))
	);
}

function coveredPlanningRefs(input: ImplementationExitInput): string[] {
	return input.planningRefs.filter((planningRef) =>
		input.changes.some((change) => change.planningRefs.includes(planningRef)),
	);
}

function implementationRoute(
	verdict: ImplementationExitVerdict,
	issues: ImplementationExitIssue[],
): ExitRoute {
	if (verdict === "pass") return "close";
	const [explicitRoute] = issues
		.map((issue) => issue.route)
		.filter((route): route is ExitRoute => Boolean(route));
	if (explicitRoute) return explicitRoute;
	return "implementation";
}

function blockedIssues(
	issues: ImplementationExitIssue[],
): ImplementationExitIssue[] {
	return issues.filter(
		(issue) => issue.route === "user" || issue.code === "worker_blocked",
	);
}

function uncertaintyRoute(owner: string): ExitRoute {
	if (owner === "planning") return "planning";
	if (owner === "decision") return "decision";
	if (owner === "user") return "user";
	return "implementation";
}

type ImplementationExitVerdict = "pass" | "fail" | "block";

function issueFinding(issue: ImplementationExitIssue): ExitFinding {
	const refs = implementationIssueRefs(issue);
	return {
		id: `implementation:${issue.code}:${refs[0] || "change"}`,
		severity: "error",
		criterion: issue.code,
		message: issue.message,
		refs,
		rationale:
			"Implementation evidence must prove planned work before closure.",
	};
}

function issueRemediation(issue: ImplementationExitIssue): ExitRemediationItem {
	const refs = implementationIssueRefs(issue);
	return {
		action: implementationRemediationAction(issue),
		route: "implementation",
		refs,
		blocking: true,
	};
}

const IMPLEMENTATION_REMEDIATION: Record<
	ImplementationExitIssue["code"],
	string
> = {
	missing_planning_coverage:
		"Record an implementation change covering the uncovered planning work.",
	unknown_planning_ref:
		"Replace the unknown planning ref with a passed planning work-unit ref.",
	worker_failed:
		"Inspect the worker failure, fix the assigned work, or release/retry the claim.",
	worker_blocked:
		"Resolve the worker blocker, route back if needed, or release/retry the claim.",
	missing_worker_claim:
		"Attach the runtime claim id to the worker result before aggregation.",
	unknown_worker_claim:
		"Reference an active runtime claim from the trace, or reacquire the work claim.",
	inactive_worker_claim:
		"Reacquire the work claim before accepting worker evidence.",
	worker_claim_mismatch:
		"Align worker id, work unit id, and planning refs with the runtime claim.",
	invalid_change: "Complete change id, planning refs, and changed paths.",
	duplicate_change_id: "Give every implementation change a stable unique id.",
	missing_check_results:
		"Attach structured check results with command and pass/fail status.",
	invalid_check_result: "Complete each check result with command and status.",
	failed_check:
		"Fix or route failed/blocked checks before implementation closure.",
	invalid_tdd_evidence:
		"Record red TDD checks as failing before implementation and green checks as passing after implementation.",
	missing_tdd_red_evidence:
		"Attach a failing red TDD check for each required acceptance criterion before implementation.",
	missing_tdd_green_evidence:
		"Attach a passing green TDD check for each required acceptance criterion after implementation.",
	unknown_tdd_criterion:
		"Map TDD check evidence to acceptance criterion ids emitted by planning.",
	missing_acceptance_evidence:
		"Attach structured acceptance evidence with summary and evidence refs.",
	invalid_acceptance_evidence:
		"Complete acceptance evidence with summary and canonical evidence refs.",
	missing_acceptance_criterion_coverage:
		"Map implementation evidence to every planned acceptance criterion id.",
	unknown_acceptance_criterion:
		"Use acceptance criterion ids emitted by the planning work unit.",
	missing_component_ref:
		"Attach planning componentRefs from the KB file-structure map.",
	unknown_component_ref:
		"Use component ids declared in the KB file-structure map.",
	invalid_component_contract:
		"Complete the component map entry with KB refs, owned paths, and test paths.",
	path_outside_component_scope:
		"Move the change into the declared component scope or re-plan with the correct component.",
	missing_component_test_coverage:
		"Add or update tests under the component test paths for touched code.",
	missing_changed_path:
		"Refresh the repo snapshot or create/fix the changed path before closure.",
	missing_evidence_path:
		"Refresh the repo snapshot or attach evidence refs that exist in the repository.",
	invalid_traceability_ref:
		"Replace weak refs with canonical KB, trace, Git, digest, source, or test refs.",
	missing_implementation_assessment:
		"Add agent production-quality assessment for maintainability, simplicity, style, error handling, and rationale.",
	implementation_not_production_ready:
		"Continue implementation until the agent assesses the change as production-ready.",
	missing_implementation_uncertainty_resolution:
		"State whether implementation uncertainty is resolved locally or routed to planning/decision/user authority.",
	unresolved_implementation_uncertainty:
		"Resolve uncertainty in implementation, route back, or block for user clarification before closure.",
	missing_security_privacy_assessment:
		"Add security/privacy assessment evidence for sensitive paths.",
	missing_accessibility_assessment:
		"Add accessibility assessment evidence for UI/page changes.",
	missing_dependency_risk_assessment:
		"Add dependency risk assessment for package/dependency changes.",
	missing_release_approval:
		"Capture explicit user approval for release, publication, or externally visible implementation refs.",
	invalid_release_approval_ref:
		"Replace weak release approval refs with canonical trace, KB, Git, digest, source, or test refs.",
	missing_content_proof:
		"Attach fresh content proof: commit, tree, or working-tree digest.",
	missing_aggregate_content_proof:
		"Attach final aggregate content proof after merging worker or parallel changes.",
};

function implementationRemediationAction(
	issue: ImplementationExitIssue,
): string {
	return IMPLEMENTATION_REMEDIATION[issue.code];
}
