import {
	componentsForRefs,
	componentSupportsSourcePath,
	componentSupportsTestPath,
	unknownComponentRefs,
	type SourceMapComponent,
} from "../knowledge/source-map.ts";
import {
	loopQualityRunnerSummary,
	type RunLoopQualityGraphResult,
} from "../loops/evaluator.ts";
import {
	loopGraphLayers,
	loopQualityGraphRef,
	loopQualityJudgeSpecForNode,
	loopQualityMethodForMode,
	type LoopQualityGraph,
	type LoopQualityGraphNode,
} from "../loops/graph.ts";
import {
	parseLoopQualityPack,
	type LoopQualityPack,
	type LoopQualityPackEvaluatorId,
	type LoopQualityPackEvidenceAdapterId,
	type LoopQualityPackStandard,
} from "../loops/quality-pack.ts";
import { composeLoopQualityPacks } from "../loops/runner.ts";
import { qualityDiagnosticsFromStandards } from "../loops/feedback.ts";
import {
	criteriaFromQualityStandards,
	loopQualityStandardSatisfied,
} from "../loops/quality-standards.ts";
import { invalidTraceRefs } from "../traces/refs.ts";
import {
	evaluateCommonReviewEvidence,
	mergeImplementationEvidenceReports,
	type ImplementationEvidenceReport,
} from "./review/index.ts";
import type {
	ExitFinding,
	ExitRemediationItem,
	ExitRoute,
	LoopRoutePlan,
} from "../traces/types.ts";
import {
	acceptanceEvidenceRefs,
	changedPaths,
	checkResultRefs,
	contentProofRefList,
	contentProofRefs,
} from "./evidence.ts";
import {
	evaluateImplementationQualityStandards,
	implementationIssueRefs,
	runImplementationQualityStandards,
} from "./quality-standards.ts";
import { detectImplementationWorkerProofConflicts } from "./worker-proof.ts";
import type {
	CheckResult,
	ImplementationChange,
	ImplementationExitInput,
	ImplementationExitIssue,
	ImplementationExitResult,
} from "./types.ts";

export const IMPLEMENTATION_LOOP_QUALITY_PACK = parseLoopQualityPack({
	schemaVersion: 1,
	id: "codewiki.implementation.kernel",
	version: "0.3.0",
	authority: "kernel",
	rollout: "enforce",
	graph: {
		id: "implementation.loop",
		version: "0.3.0.loop.9",
		layers: loopGraphLayers([
			"hard_gate",
			"input_contract",
			"trace_fidelity",
			"coverage",
			"scope_control",
			"evidence_quality",
			"risk_authority",
			"project_fit",
			"repairability",
			"pipeline_carryover",
			"exit_loss",
		]),
	},
	standards: [
		implementationPackStandard({
			id: "planning_coverage_complete",
			layer: "coverage",
			standardType: "trace_fidelity",
			weight: 12,
			cost: 12,
			hardGate: true,
			description:
				"Every planned work ref is covered by implementation evidence and no unknown planning refs are introduced.",
			codes: ["missing_planning_coverage", "unknown_planning_ref"],
		}),
		implementationPackStandard({
			id: "scope_controlled",
			layer: "scope_control",
			standardType: "scope_control",
			weight: 12,
			cost: 12,
			hardGate: true,
			description:
				"Implementation changes stay inside planned component/path scope and existing repo paths.",
			codes: [
				"invalid_change",
				"duplicate_change_id",
				"path_outside_component_scope",
				"missing_changed_path",
			],
		}),
		implementationPackStandard({
			id: "acceptance_evidence_complete",
			layer: "evidence_quality",
			standardType: "evidence_quality",
			weight: 16,
			cost: 16,
			hardGate: true,
			description:
				"Every planned acceptance criterion is covered by structured evidence refs.",
			codes: [
				"missing_acceptance_evidence",
				"invalid_acceptance_evidence",
				"missing_acceptance_criterion_coverage",
				"unknown_acceptance_criterion",
			],
		}),
		implementationPackStandard({
			id: "verification_passed",
			layer: "hard_gate",
			standardType: "robustness",
			method: "external_evidence",
			weight: 18,
			cost: 18,
			hardGate: true,
			description:
				"Required implementation checks are structured, present, passing, cover planned verification, and package changes include pack verification.",
			codes: [
				"missing_check_results",
				"invalid_check_result",
				"failed_check",
				"missing_planned_verification",
				"missing_package_pack_check",
			],
		}),
		implementationPackStandard({
			id: "tdd_evidence_valid",
			layer: "evidence_quality",
			standardType: "evidence_quality",
			method: "external_evidence",
			weight: 10,
			cost: 10,
			hardGate: true,
			description:
				"Required red/green TDD evidence is mapped to planned acceptance criteria.",
			codes: [
				"invalid_tdd_evidence",
				"missing_tdd_red_evidence",
				"missing_tdd_green_evidence",
				"unknown_tdd_criterion",
			],
		}),
		implementationPackStandard({
			id: "content_proof_recorded",
			layer: "evidence_quality",
			standardType: "evidence_quality",
			method: "external_evidence",
			weight: 14,
			cost: 14,
			hardGate: true,
			description:
				"Implementation output has change-level and aggregate content proof when required.",
			codes: [
				"missing_content_proof",
				"missing_aggregate_content_proof",
				"worker_proof_failed",
				"worker_proof_conflict",
			],
		}),
		implementationPackStandard({
			id: "worker_claims_correlated",
			layer: "trace_fidelity",
			standardType: "trace_fidelity",
			weight: 12,
			cost: 12,
			hardGate: true,
			description:
				"Worker-produced evidence is tied to active runtime claims and completed worker reports.",
			codes: [
				"worker_failed",
				"worker_blocked",
				"missing_worker_claim",
				"unknown_worker_claim",
				"inactive_worker_claim",
				"worker_claim_mismatch",
			],
		}),
		implementationPackStandard({
			id: "source_ownership_aligned",
			layer: "scope_control",
			standardType: "scope_control",
			weight: 12,
			cost: 12,
			hardGate: true,
			description:
				"Changed source/test paths align with OKF source ownership and test coverage.",
			codes: [
				"missing_component_ref",
				"unknown_component_ref",
				"invalid_component_contract",
				"missing_component_test_coverage",
				"missing_evidence_path",
			],
		}),
		implementationPackStandard({
			id: "production_quality_reviewed",
			layer: "project_fit",
			standardType: "maintainability",
			mode: "agent",
			weight: 16,
			cost: 16,
			description:
				"Agent assessment records maintainability, simplicity, project style, and error-handling readiness.",
			codes: [
				"missing_implementation_assessment",
				"implementation_not_production_ready",
			],
		}),
		implementationPackStandard({
			id: "archive_disposition_ready",
			layer: "pipeline_carryover",
			standardType: "trace_fidelity",
			weight: 10,
			cost: 10,
			hardGate: true,
			description:
				"Completed implementation output has a post-commit archive disposition when retention policy requires cleanup.",
			codes: ["missing_archive_disposition", "invalid_archive_disposition"],
		}),
		implementationPackStandard({
			id: "implementation_review_evidence_clean",
			layer: "hard_gate",
			standardType: "robustness",
			method: "external_evidence",
			weight: 18,
			cost: 18,
			hardGate: true,
			description:
				"CodeWiki-owned review evidence has no blocking diagnostics and links acceptance criteria to concrete evidence.",
			codes: [
				"review_blocking_diagnostic",
				"review_missing_acceptance_evidence_link",
			],
		}),
		implementationPackStandard({
			id: "evidence_matches_claims_judged",
			layer: "evidence_quality",
			standardType: "evidence_quality",
			method: "model_judge",
			weight: 16,
			cost: 16,
			description:
				"Independent judge verifies implementation evidence actually supports the claimed changes and acceptance criteria.",
			codes: ["semantic_evidence_mismatch"],
		}),
		implementationPackStandard({
			id: "checks_relevant_judged",
			layer: "evidence_quality",
			standardType: "robustness",
			method: "model_judge",
			weight: 14,
			cost: 14,
			description:
				"Independent judge verifies passing checks are relevant to changed behavior rather than generic or unrelated proof.",
			codes: ["semantic_checks_irrelevant"],
		}),
		implementationPackStandard({
			id: "implementation_readiness_judged",
			layer: "project_fit",
			standardType: "maintainability",
			method: "model_judge",
			weight: 12,
			cost: 12,
			description:
				"Independent judge verifies the production-readiness assessment is specific and not hand-wavy.",
			codes: ["semantic_implementation_not_ready"],
		}),
		implementationPackStandard({
			id: "uncertainty_resolved",
			layer: "repairability",
			standardType: "repairability",
			mode: "agent",
			weight: 14,
			cost: 14,
			description:
				"No unresolved implementation uncertainty remains; planning, decision, or user authority is routed instead of drifting.",
			codes: [
				"missing_implementation_uncertainty_resolution",
				"unresolved_implementation_uncertainty",
			],
		}),
		implementationPackStandard({
			id: "security_privacy_reviewed",
			layer: "risk_authority",
			standardType: "security",
			mode: "agent",
			weight: 12,
			cost: 12,
			description:
				"Security/privacy-sensitive changes include explicit review evidence.",
			codes: ["missing_security_privacy_assessment"],
		}),
		implementationPackStandard({
			id: "accessibility_ui_reviewed",
			layer: "risk_authority",
			standardType: "user_value",
			mode: "agent",
			weight: 8,
			cost: 8,
			description: "UI/page changes include accessibility review evidence.",
			codes: ["missing_accessibility_assessment"],
		}),
		implementationPackStandard({
			id: "dependency_risk_controlled",
			layer: "risk_authority",
			standardType: "robustness",
			mode: "agent",
			weight: 8,
			cost: 8,
			description: "Dependency-surface changes include risk review evidence.",
			codes: ["missing_dependency_risk_assessment"],
		}),
		implementationPackStandard({
			id: "release_safety_approved",
			layer: "hard_gate",
			standardType: "risk_authority",
			repairTarget: "user",
			mode: "user",
			weight: 20,
			cost: 20,
			hardGate: true,
			description:
				"Release, publication, destructive, or externally visible implementation refs require explicit user approval.",
			codes: ["missing_release_approval", "invalid_release_approval_ref"],
		}),
		implementationPackStandard({
			id: "traceability_refs_canonical",
			layer: "trace_fidelity",
			standardType: "trace_fidelity",
			weight: 8,
			cost: 8,
			hardGate: true,
			description:
				"Implementation refs are canonical trace, KB, Git, digest, source, or test refs.",
			codes: ["invalid_traceability_ref"],
		}),
	],
});

export const IMPLEMENTATION_LOOP_GRAPH = compatibleImplementationGraph(
	IMPLEMENTATION_LOOP_QUALITY_PACK,
);

type ImplementationPackStandardDeclaration = Omit<
	LoopQualityPackStandard,
	"codes"
>;

function implementationPackStandard(
	node: Omit<
		LoopQualityGraphNode<ImplementationExitIssue["code"]>,
		"method" | "repairTarget"
	> & {
		method?: LoopQualityGraphNode<ImplementationExitIssue["code"]>["method"];
		repairTarget?: LoopQualityGraphNode<
			ImplementationExitIssue["code"]
		>["repairTarget"];
	},
): ImplementationPackStandardDeclaration {
	const resolved: LoopQualityGraphNode<ImplementationExitIssue["code"]> = {
		method: node.method || loopQualityMethodForMode(node.mode),
		gate: node.hardGate || node.layer === "hard_gate" ? "hard" : "soft",
		timeoutMs: 50,
		repairTarget: "implementation",
		...node,
	};
	const judge = resolved.judge || loopQualityJudgeSpecForNode(resolved);
	return {
		id: resolved.id,
		description: resolved.description,
		layer: resolved.layer,
		standardType: resolved.standardType,
		method: resolved.method,
		repairTarget: resolved.repairTarget,
		weight: resolved.weight,
		cost: resolved.cost,
		gate: resolved.gate,
		timeoutMs: resolved.timeoutMs || 50,
		dependsOn: resolved.dependsOn || [],
		evaluatorId: packEvaluatorId(resolved.method),
		evidenceAdapterIds: packEvidenceAdapterIds(resolved.method),
		issuePredicate: {
			kind: "issue_codes",
			match: "any",
			codes: resolved.codes || [],
		},
		...(resolved.scoreThreshold === undefined
			? {}
			: { scoreThreshold: resolved.scoreThreshold }),
		...(judge ? { judge } : {}),
	};
}

function compatibleImplementationGraph(
	pack: LoopQualityPack,
): LoopQualityGraph<ImplementationExitIssue["code"]> {
	const graph = composeLoopQualityPacks({ packs: [pack] }).graph;
	return {
		...graph,
		graphVersion: pack.graph.graphVersion,
		nodes: graph.nodes.map((node) => {
			const compatible = {
				...node,
			} as LoopQualityGraphNode<ImplementationExitIssue["code"]>;
			delete compatible.packId;
			delete compatible.rollout;
			delete compatible.evaluatorId;
			delete compatible.evidenceAdapterIds;
			if (compatible.dependsOn?.length === 0) delete compatible.dependsOn;
			if (compatible.gate === "hard") compatible.hardGate = true;
			if (compatible.method === "agent_self_assessment") compatible.mode = "agent";
			if (compatible.method === "human_authority") compatible.mode = "user";
			if (!("judge" in compatible)) compatible.judge = undefined;
			return compatible;
		}),
	};
}

function packEvaluatorId(
	method: LoopQualityGraphNode<string>["method"],
): LoopQualityPackEvaluatorId {
	if (method === "deterministic") return "issue_codes";
	if (method === "agent_self_assessment") return "agent_assessment";
	if (method === "model_judge") return "model_judge";
	if (method === "human_authority") return "human_approval";
	return "external_evidence";
}

function packEvidenceAdapterIds(
	method: LoopQualityGraphNode<string>["method"],
): LoopQualityPackEvidenceAdapterId[] {
	if (method === "human_authority") return ["approval_refs"];
	if (method === "external_evidence") {
		return ["check_results", "content_proof", "review_evidence"];
	}
	return ["trace_refs"];
}

export function evaluateImplementationExit(
	input: ImplementationExitInput,
): ImplementationExitResult {
	const issues = collectImplementationExitIssues(input);
	const qualityStandards = evaluateImplementationExitGraph(issues);
	return implementationExitResultFromQuality({
		input,
		issues,
		qualityStandards,
	});
}

export async function evaluateImplementationExitWithRunner(
	input: ImplementationExitInput,
): Promise<ImplementationExitResult> {
	const issues = collectImplementationExitIssues(input);
	const quality = await runImplementationQualityStandards(
		IMPLEMENTATION_LOOP_GRAPH,
		issues,
		{
			...(input.qualityJudge || {}),
			judgeInput:
				input.qualityJudge?.judgeInput || implementationJudgeInput(input),
		},
	);
	return implementationExitResultFromQuality({
		input,
		issues,
		qualityStandards: quality.standards,
		qualityRunner: quality,
	});
}

function implementationJudgeInput(
	input: ImplementationExitInput,
): Record<string, unknown> {
	return {
		loop: "implementation",
		planningRefs: input.planningRefs,
		acceptanceRequirements: input.acceptanceRequirements,
		planningScopes: input.planningScopes,
		changes: input.changes.map((change) => ({
			id: change.id,
			planningRefs: change.planningRefs,
			codePaths: change.codePaths,
			docPaths: change.docPaths,
			testPaths: change.testPaths,
			checks: change.checks,
			checkResults: change.checkResults,
			acceptanceEvidence: change.acceptanceEvidence,
			acceptanceEvidenceItems: change.acceptanceEvidenceItems,
			contentProof: change.contentProof,
			implementationAssessment: change.implementationAssessment,
			sensitiveSurfaceAssessment: change.sensitiveSurfaceAssessment,
			publicationRefs: change.publicationRefs,
			workerId: change.workerId,
			claimId: change.claimId,
		})),
		componentMap: input.componentMap,
		workerReports: input.workerReports,
		workerClaims: input.workerClaims,
		aggregateContentProof: input.aggregateContentProof,
		requireTddEvidence: input.requireTddEvidence,
	};
}

function implementationExitResultFromQuality(input: {
	input: ImplementationExitInput;
	issues: ImplementationExitIssue[];
	qualityStandards: ImplementationExitResult["qualityStandards"];
	qualityRunner?: RunLoopQualityGraphResult;
}): ImplementationExitResult {
	const remediation = input.issues.map(issueRemediation);
	const diagnostics = qualityDiagnosticsFromStandards(
		input.qualityStandards || [],
		remediation,
	);
	const verdict = implementationVerdictFromQuality(
		input.issues,
		input.qualityStandards || [],
	);
	return {
		passed: verdict === "pass",
		verdict,
		issues: input.issues,
		criteria: criteriaFromQualityStandards(input.qualityStandards || []),
		qualityStandards: input.qualityStandards,
		qualityGraph: loopQualityGraphRef(IMPLEMENTATION_LOOP_GRAPH),
		...(input.qualityRunner
			? { qualityRunner: loopQualityRunnerSummary(input.qualityRunner.runner) }
			: {}),
		findings: input.issues.map(issueFinding),
		remediation,
		diagnostics,
		route: implementationRoute(verdict, input.issues),
		routePlan: implementationRoutePlan(verdict, input.issues, input.input),
		coveredPlanningRefs: coveredPlanningRefs(input.input),
		changeIds: input.input.changes.map((change) => change.id),
	};
}

function implementationVerdictFromQuality(
	issues: ImplementationExitIssue[],
	standards: ImplementationExitResult["qualityStandards"],
): "pass" | "fail" | "block" {
	if (
		blockedIssues(issues).length > 0 ||
		standards?.some((standard) => standard.status === "blocked")
	) {
		return "block";
	}
	if (
		issues.length === 0 &&
		standards?.every((standard) => loopQualityStandardSatisfied(standard))
	) {
		return "pass";
	}
	return "fail";
}

export function evaluateImplementationExitGraph(
	issues: ImplementationExitIssue[],
) {
	return evaluateImplementationQualityStandards(
		IMPLEMENTATION_LOOP_GRAPH,
		issues,
	);
}

export function collectImplementationExitIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	return [
		...coverageIssues(input),
		...unknownPlanningRefIssues(input),
		...workerReportIssues(input),
		...workerProofIssues(input),
		...duplicateChangeIssues(input.changes),
		...changeIssues(input.changes),
		...checkResultIssues(input.changes),
		...plannedVerificationIssues(input),
		...packagePackCheckIssues(input.changes),
		...tddEvidenceIssues(input),
		...acceptanceEvidenceIssues(input),
		...componentAlignmentIssues(input),
		...pathExistenceIssues(input),
		...contentProofIssues(input),
		...implementationAssessmentIssues(input.changes),
		...sensitiveSurfaceIssues(input.changes),
		...releaseSafetyIssues(input.changes),
		...archiveDispositionIssues(input),
		...reviewEvidenceIssues(input),
		...traceabilityRefIssues(input),
	];
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

function workerReportIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	return (input.workerReports || []).flatMap((report) => [
		...workerClaimIssues(input, report),
		...workerStatusIssues(report),
	]);
}

function workerStatusIssues(
	report: NonNullable<ImplementationExitInput["workerReports"]>[number],
): ImplementationExitIssue[] {
	if (report.status === "completed") return [];
	const code = report.status === "blocked" ? "worker_blocked" : "worker_failed";
	return [
		{
			code,
			workerId: report.workerId,
			claimId: report.claimId,
			planningRef: report.planningRefs[0],
			ref: report.refs[0],
			message:
				report.message ||
				`Implementation worker ${report.workerId} ${report.status} for ${report.workUnitId}.`,
		},
	];
}

function workerProofIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	const proofs = input.workerProofs || [];
	const conflicts = uniqueWorkerProofConflicts([
		...(input.workerProofConflicts || []),
		...detectImplementationWorkerProofConflicts(
			proofs,
			input.expectedWorkerBaseSha,
		),
	]);
	return [
		...proofs.flatMap((proof) => {
			if (["pass", "unknown"].includes(proof.validationVerdict)) return [];
			return [
				{
					code: "worker_proof_failed" as const,
					workerId: proof.workerId,
					claimId: proof.claimId,
					planningRef: proof.planningRefs[0],
					ref: proof.validationRef || proof.digest,
					message: `Implementation worker ${proof.workerId} proof verdict is ${proof.validationVerdict}.`,
				},
			];
		}),
		...conflicts.map((conflict) => ({
			code: "worker_proof_conflict" as const,
			workerId: conflict.workerIds[0],
			ref: conflict.refs[0] || conflict.files[0],
			message: conflict.message,
		})),
	];
}

function uniqueWorkerProofConflicts(
	conflicts: NonNullable<ImplementationExitInput["workerProofConflicts"]>,
): NonNullable<ImplementationExitInput["workerProofConflicts"]> {
	const seen = new Set<string>();
	return conflicts.filter((conflict) => {
		const key = `${conflict.kind}\0${conflict.message}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function workerClaimIssues(
	input: ImplementationExitInput,
	report: NonNullable<ImplementationExitInput["workerReports"]>[number],
): ImplementationExitIssue[] {
	if (!report.claimId) {
		return [
			{
				code: "missing_worker_claim" as const,
				workerId: report.workerId,
				planningRef: report.planningRefs[0],
				message: `Implementation worker ${report.workerId} report does not identify a runtime claim.`,
			},
		];
	}
	const claim = (input.workerClaims || []).find(
		(candidate) => candidate.claimId === report.claimId,
	);
	if (!claim) {
		return [
			{
				code: "unknown_worker_claim" as const,
				workerId: report.workerId,
				claimId: report.claimId,
				planningRef: report.planningRefs[0],
				message: `Implementation worker ${report.workerId} references unknown runtime claim ${report.claimId}.`,
			},
		];
	}
	if (claim.status !== "active") {
		return [
			{
				code: "inactive_worker_claim" as const,
				workerId: report.workerId,
				claimId: report.claimId,
				planningRef: report.planningRefs[0],
				ref: claim.refs[0],
				message: `Implementation worker ${report.workerId} references ${claim.status} runtime claim ${report.claimId}.`,
			},
		];
	}
	if (workerMatchesClaim(report, claim)) return [];
	return [
		{
			code: "worker_claim_mismatch" as const,
			workerId: report.workerId,
			claimId: report.claimId,
			planningRef: report.planningRefs[0],
			ref: claim.refs[0],
			message: `Implementation worker ${report.workerId} report does not match runtime claim ${report.claimId}.`,
		},
	];
}

function workerMatchesClaim(
	report: NonNullable<ImplementationExitInput["workerReports"]>[number],
	claim: NonNullable<ImplementationExitInput["workerClaims"]>[number],
): boolean {
	return (
		report.workerId === claim.workerId &&
		report.workUnitId === claim.workUnitId &&
		report.planningRefs.length > 0 &&
		report.planningRefs.every((planningRef) =>
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
					message: `Source ownership component ${component.id} is missing ${missing.join(", ")}.`,
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
	components: SourceMapComponent[],
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
	components: SourceMapComponent[],
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
): SourceMapComponent[] {
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
	components: SourceMapComponent[],
): SourceMapComponent[] {
	const seen = new Set<string>();
	return components.filter((component) => {
		if (seen.has(component.id)) return false;
		seen.add(component.id);
		return true;
	});
}

function componentContractMissingFields(
	component: SourceMapComponent,
): string[] {
	return [
		component.doc ? "" : "doc",
		component.sourcePatterns.length ? "" : "source",
		component.testPatterns.length || component.testRationale ? "" : "tests",
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
					route: "decision",
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
						route: "decision",
						message: `Implementation change ${change.id} has non-canonical approval ref ${invalidApprovalRef}.`,
					},
				]
			: [];
	});
}

function archiveDispositionIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	if (!input.requireArchiveDisposition) return [];
	const disposition = input.archiveDisposition;
	if (!disposition) {
		return [
			{
				code: "missing_archive_disposition" as const,
				message:
					"Implementation requires an archive disposition: post-commit compact plan or explicit retain-hot reason.",
			},
		];
	}
	const action = String(disposition.action || "").trim();
	const traceId = String(disposition.traceId || "").trim();
	const reason = String(disposition.reason || "").trim();
	const invalidReasons: string[] = [];
	if (!traceId) invalidReasons.push("traceId is required");
	if (!reason) invalidReasons.push("reason is required");
	if (action === "post_commit_compact" && !disposition.afterCommit) {
		invalidReasons.push("post_commit_compact must be marked afterCommit");
	} else if (action === "retain_hot") {
		if (!reason) invalidReasons.push("retain_hot requires an explicit reason");
	} else if (action !== "post_commit_compact") {
		invalidReasons.push("action must be post_commit_compact or retain_hot");
	}
	return invalidReasons.length
		? [
				{
					code: "invalid_archive_disposition" as const,
					ref: traceId || undefined,
					message: `Implementation archive disposition is invalid: ${invalidReasons.join("; ")}.`,
				},
			]
		: [];
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

function plannedVerificationIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	return (input.planningScopes || []).flatMap((scope) => {
		const changes = input.changes.filter((change) =>
			change.planningRefs.includes(scope.planningRef),
		);
		if (changes.length === 0) return [];
		return uniqueStrings(scope.verification).flatMap((verification) => {
			if (
				changes.some((change) =>
					changeSatisfiesPlannedVerification(change, verification),
				)
			) {
				return [];
			}
			return [
				{
					code: "missing_planned_verification" as const,
					planningRef: scope.planningRef,
					ref: verification,
					message: `Implementation does not include passing verification for ${verification} from ${scope.planningRef}.`,
				},
			];
		});
	});
}

function changeSatisfiesPlannedVerification(
	change: ImplementationChange,
	verification: string,
): boolean {
	const normalizedVerification = normalizePath(verification).toLowerCase();
	const evidenceRefs = new Set(
		[
			...change.testPaths,
			...change.checkResults
				.filter((check) => check.status === "pass")
				.map((check) => check.outputRef || ""),
			...acceptanceEvidenceRefs(change),
		]
			.map((ref) => normalizePath(ref).toLowerCase())
			.filter(Boolean),
	);
	if (evidenceRefs.has(normalizedVerification)) return true;
	return change.checkResults.some(
		(check) =>
			check.status === "pass" &&
			commandSatisfiesPlannedVerification(
				check.command,
				normalizedVerification,
			),
	);
}

function commandSatisfiesPlannedVerification(
	command: string,
	normalizedVerification: string,
): boolean {
	const normalizedCommand = command.trim().toLowerCase();
	if (!normalizedCommand || !normalizedVerification) return false;
	if (
		normalizedCommand === normalizedVerification ||
		normalizedCommand.includes(normalizedVerification)
	) {
		return true;
	}
	return (
		normalizedVerification.startsWith("tests/") &&
		/^(npm test|npm run test(?::(?:smoke|features))?|pnpm test|yarn test|node --test)(\s|$)/.test(
			normalizedCommand,
		)
	);
}

function packagePackCheckIssues(
	changes: ImplementationChange[],
): ImplementationExitIssue[] {
	return changes.flatMap((change) => {
		if (!needsDependencyReview(change) || hasPassingPackagePackCheck(change)) {
			return [];
		}
		return [
			{
				code: "missing_package_pack_check" as const,
				changeId: change.id,
				ref: "package.json",
				message: `Implementation change ${change.id} touches package/dependency files and needs passing package pack verification.`,
			},
		];
	});
}

function hasPassingPackagePackCheck(change: ImplementationChange): boolean {
	return change.checkResults.some(
		(check) => check.status === "pass" && isPackagePackCommand(check.command),
	);
}

function isPackagePackCommand(command: string): boolean {
	const normalized = command.trim().toLowerCase();
	return (
		/\bnpm\s+run\s+test:pack\b/.test(normalized) ||
		/\bnpm\s+pack\b.*--dry-run/.test(normalized) ||
		/\bpnpm\s+pack\b.*--dry-run/.test(normalized) ||
		/\byarn\s+pack\b.*--dry-run/.test(normalized)
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
		...reviewEvidenceRefs(input),
		...contentProofRefList(input.aggregateContentProof),
	]).map((ref) => ({
		code: "invalid_traceability_ref" as const,
		ref,
		message: `Implementation has non-canonical ref ${ref}.`,
	}));
}

function reviewEvidenceIssues(
	input: ImplementationExitInput,
): ImplementationExitIssue[] {
	const report = mergedReviewEvidenceReport(input);
	if (!report) return [];
	return evaluateCommonReviewEvidence({
		report,
		acceptanceRequirements: reviewEvidenceRequiresAcceptanceLinks(input)
			? input.acceptanceRequirements || []
			: [],
		requireRelevantChecks: true,
	}).findings.flatMap((finding): ImplementationExitIssue[] => {
		if (finding.severity !== "block") return [];
		const code = reviewFindingIssueCode(finding.code);
		if (!code) return [];
		return [
			{
				code,
				planningRef: finding.planningRef,
				ref: finding.path || finding.evidenceRefs[0],
				message: finding.message,
			},
		];
	});
}

function reviewFindingIssueCode(
	code: ReturnType<
		typeof evaluateCommonReviewEvidence
	>["findings"][number]["code"],
):
	| "review_blocking_diagnostic"
	| "review_missing_acceptance_evidence_link"
	| undefined {
	if (code === "review_blocking_diagnostic") return code;
	if (code === "review_missing_acceptance_evidence_link") return code;
	return undefined;
}

function reviewEvidenceRequiresAcceptanceLinks(
	input: ImplementationExitInput,
): boolean {
	return Boolean(
		input.reviewEvidenceReports?.some(
			(report) => (report.phase || "exit") === "exit",
		),
	);
}

function mergedReviewEvidenceReport(
	input: ImplementationExitInput,
): ImplementationEvidenceReport | undefined {
	if (
		!input.reviewEvidenceReports ||
		input.reviewEvidenceReports.length === 0
	) {
		return undefined;
	}
	return mergeImplementationEvidenceReports(input.reviewEvidenceReports, {
		phase: "exit",
	});
}

function reviewEvidenceRefs(input: ImplementationExitInput): string[] {
	const report = mergedReviewEvidenceReport(input);
	if (!report) return [];
	return [
		...report.changedPaths,
		...report.checks.map((check) => check.outputRef || ""),
		...report.diagnostics.flatMap((diagnostic) => [
			diagnostic.path,
			...(diagnostic.evidenceRefs || []),
		]),
		...report.symbols.flatMap((symbol) => [
			symbol.path,
			...(symbol.evidenceRefs || []),
		]),
		...report.dependencyEdges.flatMap((edge) => [
			edge.from,
			edge.to,
			...(edge.evidenceRefs || []),
		]),
		...report.evidenceLinks.flatMap((link) => [
			link.targetRef,
			...link.evidenceRefs,
		]),
	];
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
		(input.workerReports || []).length > 0 ||
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

function implementationRoutePlan(
	verdict: ImplementationExitVerdict,
	issues: ImplementationExitIssue[],
	input: ImplementationExitInput,
): LoopRoutePlan {
	const route = implementationRoute(verdict, issues);
	const refs = issues.length
		? issues.flatMap(implementationIssueRefs)
		: input.changes.map((change) => change.id);
	if (route === "close") {
		return {
			target: "close",
			kind: "advance",
			rationale: "Implementation evidence passed and the trace can close.",
			refs,
		};
	}
	if (route === "decision") {
		return {
			target: "decision",
			kind: routeKindForImplementationIssues(issues),
			rationale:
				"Implementation found authority, scope, or product ambiguity that must return to decision before continuing.",
			refs,
		};
	}
	if (route === "planning") {
		return {
			target: "planning",
			kind: "scope_change",
			rationale:
				"Implementation evidence no longer matches the planned work scope.",
			refs,
		};
	}
	if (route === "user") {
		return {
			target: "decision",
			kind: "authority_validation",
			rationale:
				"Implementation needs explicit user authority, represented as a decision-loop request.",
			refs,
		};
	}
	return {
		target: "continue",
		kind: "continue",
		rationale: "Implementation must continue until required evidence passes.",
		refs,
	};
}

function routeKindForImplementationIssues(
	issues: ImplementationExitIssue[],
): string {
	if (
		issues.some((issue) =>
			["missing_release_approval", "invalid_release_approval_ref"].includes(
				issue.code,
			),
		)
	) {
		return "authority_validation";
	}
	if (issues.some((issue) => issue.route === "decision"))
		return "clarification";
	return "continue";
}

function uncertaintyRoute(owner: string): ExitRoute {
	if (owner === "planning") return "planning";
	if (owner === "decision" || owner === "user") return "decision";
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
		route: issue.route || "implementation",
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
		"Attach the runtime claim id to the worker report before aggregation.",
	unknown_worker_claim:
		"Reference an active runtime claim from the trace, or reacquire the work claim.",
	inactive_worker_claim:
		"Reacquire the work claim before accepting worker evidence.",
	worker_claim_mismatch:
		"Align worker id, work unit id, and planning refs with the runtime claim.",
	worker_proof_failed:
		"Fix failed worker proof checks or route the worker report as blocked/failed.",
	worker_proof_conflict:
		"Resolve overlapping worker proof paths, duplicate worker proofs, or base-SHA mismatch before aggregate closure.",
	invalid_change: "Complete change id, planning refs, and changed paths.",
	duplicate_change_id: "Give every implementation change a stable unique id.",
	missing_check_results:
		"Attach structured check results with command and pass/fail status.",
	invalid_check_result: "Complete each check result with command and status.",
	failed_check:
		"Fix or route failed/blocked checks before implementation closure.",
	missing_planned_verification:
		"Run or record passing evidence for each verification item required by planning.",
	missing_package_pack_check:
		"Run package pack verification, such as npm run test:pack or npm pack --dry-run, for package/dependency changes.",
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
		"Attach planning componentRefs from OKF ownership metadata.",
	unknown_component_ref:
		"Use component ids declared in OKF ownership metadata.",
	invalid_component_contract:
		"Complete the OKF ownership entry with doc, source, and tests.",
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
	review_blocking_diagnostic:
		"Fix CodeWiki-owned review diagnostics before implementation closure.",
	review_missing_acceptance_evidence_link:
		"Link review evidence to every planned acceptance criterion before implementation closure.",
	missing_archive_disposition:
		"Add a post-commit archive compact plan or an explicit retain-hot reason before closure.",
	invalid_archive_disposition:
		"Fix archive disposition fields: action, traceId, reason, and afterCommit policy.",
	semantic_evidence_mismatch:
		"Strengthen or correct implementation evidence until an independent judge can verify it supports the claimed changes.",
	semantic_checks_irrelevant:
		"Run or record checks that directly exercise the changed behavior and planned verification.",
	semantic_implementation_not_ready:
		"Revise implementation or assessment until an independent judge can verify production readiness.",
};

function implementationRemediationAction(
	issue: ImplementationExitIssue,
): string {
	return IMPLEMENTATION_REMEDIATION[issue.code];
}
