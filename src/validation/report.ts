import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assessDecisionPropagation } from "../build/decision-propagation.ts";
import { isAcceptedBuildData } from "../build/lifecycle.ts";
import {
	acceptedBuildRefGaps,
	auditEvidenceGaps,
	auditRequirement,
	buildRefsByKind,
	buildSlug,
	isolationBoundary,
	normalizeBuildPath,
	normalizeRepoPath,
	readBuildRef,
	semanticTraceabilityGaps,
	trimList,
} from "../build/shared.ts";
import { normalizeChangeType, normalizeTraceabilityExemption, isSemanticTraceability } from "../change/traceability.ts";
import type { WikiProject } from "../project/types.ts";
import type { WorkflowLoop } from "../session/types.ts";
import { hasPublisherResultProof, publisherProofRefs } from "../session/worktree-isolation.ts";
import { nowIso, unique } from "../domain/shared/utils.ts";
import { normalizeWorktreeIsolation } from "../session/claims.ts";
import { fileStructureSatisfiedDeferredTriggerRefs } from "../knowledge/diagram-parser.ts";
import type { CodewikiValidationFailureClass, CodewikiValidationReportInput } from "./types.ts";
import { VALIDATION_FAILURE_CLASS_VALUES } from "./types.ts";

function validationContentProofRefs(isolation: ReturnType<typeof normalizeValidationIsolation> | undefined): string[] {
	return unique([
		isolation?.validated_sha,
		isolation?.head_sha,
		isolation?.published_sha,
		isolation?.tree_sha,
		isolation?.working_tree_digest,
		isolation?.worktree_digest,
		isolation?.package_digest,
		isolation?.archive_ref,
		isolation?.remote_ref,
	].map((value) => String(value || "").trim()).filter(Boolean));
}

function normalizeValidationIsolation(input: CodewikiValidationReportInput["isolation"]) {
	const base = normalizeWorktreeIsolation(input);
	const role = String(input?.role || "").trim();
	const out: Record<string, unknown> = { ...(base ?? {}) };
	if (["builder", "validator", "publisher", "observer"].includes(role)) out.role = role;
	return Object.keys(out).length ? out : undefined;
}

function validationIsolationRequirement(profile: string, policyProfile?: string) {
	const normalizedProfile = profile.trim().toLowerCase();
	const normalizedPolicy = String(policyProfile || "").trim().toLowerCase();
	const preCommitProfiles = new Set(["implementation"]);
	const immutableProfiles = new Set(["task-close", "publication", "publish", "release"]);
	const required = preCommitProfiles.has(normalizedProfile) || immutableProfiles.has(normalizedProfile) || normalizedPolicy.includes("isolation-required");
	const immutableRequired = immutableProfiles.has(normalizedProfile) || normalizedPolicy.includes("publication-proof-required");
	return isolationBoundary(
		required,
		immutableRequired ? "fresh-context-clean-immutable-content" : required ? "fresh-context-checked-content" : "fresh-context-preferred",
		immutableRequired
			? "Task-close and publication validation require independent validator context, a clean worktree, and immutable content proof."
			: required
				? "Implementation validation requires independent validator context and checked content proof."
				: "Fresh validation is preferred but not required for this profile.",
		immutableRequired
			? ["fresh_context=true", "clean=true", "publisher queue result proof", "published_sha/tree_sha/archive_ref/remote_ref"]
			: required
				? ["fresh_context=true", "clean state recorded", "validated_sha/head_sha/published_sha/tree_sha or working_tree_digest"]
				: ["fresh_context=true when high-risk or policy-required"],
		`${profile.trim()} validation`,
		required ? [normalizedProfile] : [],
	);
}

function hasImmutableContentProof(isolation: ReturnType<typeof normalizeValidationIsolation> | undefined): boolean {
	return Boolean(
		isolation?.validated_sha || isolation?.head_sha || isolation?.published_sha || isolation?.tree_sha ||
		isolation?.package_digest || isolation?.archive_ref || isolation?.remote_ref,
	);
}

function hasWorkingTreeContentProof(isolation: ReturnType<typeof normalizeValidationIsolation> | undefined): boolean {
	return Boolean(isolation?.working_tree_digest || isolation?.worktree_digest);
}

function validationIsolationGaps(isolation: ReturnType<typeof normalizeValidationIsolation> | undefined, requirement: ReturnType<typeof isolationBoundary>): string[] {
	if (!requirement.required) return [];
	const gaps: string[] = [];
	const publicationProofRequired = requirement.mode === "fresh-context-clean-immutable-content";
	const hasImmutableProof = hasImmutableContentProof(isolation);
	const hasWorkingTreeProof = hasWorkingTreeContentProof(isolation);
	if (isolation?.fresh_context !== true) gaps.push("fresh_context=true");
	if (publicationProofRequired) {
		if (isolation?.clean !== true) gaps.push("clean=true");
		if (!hasImmutableProof) gaps.push("immutable_content_proof");
		return gaps;
	}
	if (typeof isolation?.clean !== "boolean") gaps.push("clean=true|false");
	if (!hasImmutableProof && !hasWorkingTreeProof) gaps.push("checked_content_proof");
	if (isolation?.clean === false && !hasWorkingTreeProof) gaps.push("working_tree_digest");
	return unique(gaps);
}

function validationPublisherResultGaps(isolation: ReturnType<typeof normalizeValidationIsolation> | undefined, requirement: ReturnType<typeof isolationBoundary>): string[] {
	if (!requirement.required || requirement.mode !== "fresh-context-clean-immutable-content") return [];
	return hasPublisherResultProof(isolation) ? [] : ["published_sha/tree_sha/archive_ref/remote_ref"];
}

function validationCommitReadinessGaps(project: WikiProject, input: CodewikiValidationReportInput, profile: string, isolationGaps: string[]): string[] {
	if (profile.trim().toLowerCase() !== "implementation") return [];
	if (input.verdict !== "pass") return [];
	if (isolationGaps.length > 0) return [];
	const source = (input.source ?? "").trim();
	if (!source) return ["source_implementation_build"];
	const absPath = resolve(project.root, source.replace(/^\.\//, ""));
	let build: any;
	try {
		build = JSON.parse(readFileSync(absPath, "utf8"));
	} catch {
		return ["source_implementation_build_readable"];
	}
	const gaps: string[] = [];
	const taskId = String(build.task_id || build.task?.id || "").trim();
	if (build.kind !== "implementation_build") gaps.push("source_kind=implementation_build");
	if (!taskId) gaps.push("task_id");
	const exemption = normalizeTraceabilityExemption(build?.traceability?.exemption ?? build?.traceability?.change_class ?? build?.change_class);
	const requiresPlanning = build?.traceability?.requires_accepted_build ?? isSemanticTraceability(build?.traceability?.semantic, exemption);
	const planningRefs = buildRefsByKind(build, "planning");
	if (requiresPlanning) {
		if (planningRefs.length === 0) gaps.push("source_planning_build");
		else gaps.push(...acceptedBuildRefGaps(project, planningRefs, "accepted_planning_build_ref"));
	}
	gaps.push(...semanticTraceabilityGaps(project, build));
	if (!Array.isArray(build.acceptance_mapping) || build.acceptance_mapping.length === 0) gaps.push("acceptance_mapping");
	const codeRefs = unique([...trimList(build.code_files), ...trimList(build.produces?.code)]);
	const testRefs = unique([...trimList(build.test_files), ...trimList(build.produces?.tests), ...trimList(build.test_design_evidence)]);
	if (codeRefs.length === 0) gaps.push("code_files");
	if (testRefs.length === 0) gaps.push("test_files_or_test_design_evidence");
	if (!Array.isArray(build.checks_run) || build.checks_run.length === 0) gaps.push("checks_run");
	const closure = build.closure_brief || {};
	if (!closure.user_intent || !Array.isArray(closure.implemented_changes) || closure.implemented_changes.length === 0 || !Array.isArray(closure.acceptance_evidence) || closure.acceptance_evidence.length === 0 || !Array.isArray(closure.checks) || closure.checks.length === 0) {
		gaps.push("closure_brief");
	}
	const commit = build.publication?.commit || {};
	const trailers = Array.isArray(commit.trailers) ? commit.trailers.map((value: unknown) => String(value)) : [];
	const hasTrailer = (name: string, expected?: string) => trailers.some((trailer: string) => {
		const normalized = trailer.trim();
		return expected ? normalized === `${name}: ${expected}` : normalized.startsWith(`${name}:`);
	});
	if (!String(commit.title || "").trim()) gaps.push("publication.commit.title");
	if (!String(commit.body || "").trim()) gaps.push("publication.commit.body");
	if (!hasTrailer("CodeWiki-Task", taskId)) gaps.push("CodeWiki-Task trailer");
	if (!hasTrailer("CodeWiki-Build", source)) gaps.push("CodeWiki-Build trailer");
	if (!hasTrailer("CodeWiki-Checks")) gaps.push("CodeWiki-Checks trailer");
	if (!hasTrailer("CodeWiki-Validation")) gaps.push("CodeWiki-Validation trailer_or_placeholder");
	if (!hasTrailer("CodeWiki-Recover") && !hasTrailer("CodeWiki-Restore")) gaps.push("CodeWiki-Recover trailer");
	return unique(gaps);
}

function validationSemanticTraceability(project: WikiProject, input: CodewikiValidationReportInput, profile: string): { gaps: string[]; warnings: string[] } {
	if (input.verdict !== "pass") return { gaps: [], warnings: [] };
	const normalizedProfile = profile.trim().toLowerCase();
	if (!["implementation", "task-close", "publication", "publish", "release"].includes(normalizedProfile)) return { gaps: [], warnings: [] };
	const source = (input.source ?? "").trim();
	if (!source) {
		const warning = "source_implementation_build missing; semantic build traceability could not be checked.";
		const strict = String(input.policy_profile || "").toLowerCase().includes("traceability-required");
		return strict ? { gaps: ["source_implementation_build"], warnings: [] } : { gaps: [], warnings: [warning] };
	}
	const result = readBuildRef(project, source);
	if (!result.ok) return { gaps: [`source_implementation_build:${result.reason}`], warnings: [] };
	const build = result.data;
	const gaps: string[] = [];
	if (build.kind !== "implementation_build") gaps.push("source_kind=implementation_build");
	const expectedTaskId = String(input.task_id || "").trim();
	const buildTaskId = String(build.task_id || build.task?.id || "").trim();
	if (expectedTaskId && buildTaskId && expectedTaskId !== buildTaskId) gaps.push("source_task_id_mismatch");
	if (!isAcceptedBuildData(build)) gaps.push("source_implementation_build_accepted");
	gaps.push(...semanticTraceabilityGaps(project, build));
	return { gaps: unique(gaps), warnings: [] };
}

const VALIDATION_TASK_ID_PROFILES = new Set(["implementation", "task-close", "publication", "publish", "release"]);
const IMMUTABLE_VALIDATION_PROFILES = new Set(["task-close", "publication", "publish", "release"]);
const HIGH_RISK_VALIDATION_TIERS = new Set(["semantic-system", "security-migration-publication", "destructive"]);

type ValidationPreflightSource = { source: string; build?: any; stale_refs: string[] };

function readValidationPreflightSource(project: WikiProject, input: CodewikiValidationReportInput): ValidationPreflightSource {
	const source = (input.source ?? "").trim();
	if (!source) return { source, stale_refs: [] };
	const normalized = normalizeBuildPath(source);
	const absPath = resolve(project.root, normalized);
	if (!existsSync(absPath)) return { source, stale_refs: [`source:${source}:missing`] };
	const result = readBuildRef(project, source);
	if (!result.ok) return { source, stale_refs: [`source:${source}:${result.reason}`] };
	return { source, build: result.data, stale_refs: [] };
}

function readRoadmapPropagationRefs(project: WikiProject): { taskIds: string[]; sprintIds: string[] } {
	try {
		const data = JSON.parse(readFileSync(resolve(project.root, project.roadmapPath), "utf8"));
		let archivedTaskIds: string[] = [];
		try {
			const archivePath = resolve(project.root, dirname(project.roadmapPath), "archive.jsonl");
			archivedTaskIds = readFileSync(archivePath, "utf8").split(/\r?\n/).flatMap((line) => {
				if (!line.trim()) return [];
				try {
					const record = JSON.parse(line);
					return trimList([record?.id, record?.task?.id]);
				} catch {
					return [];
				}
			});
		} catch {
			archivedTaskIds = [];
		}
		return {
			taskIds: unique([...Object.keys(data?.tasks || {}), ...trimList(data?.order), ...archivedTaskIds]),
			sprintIds: unique([...Object.keys(data?.sprints || {}), ...trimList(data?.views?.sprint_ids)]),
		};
	} catch {
		return { taskIds: [], sprintIds: [] };
	}
}

function planningDecisionPropagationGaps(project: WikiProject, planning: any, planningPath = ""): string[] {
	const decisionRefs = buildRefsByKind(planning, "decision");
	if (decisionRefs.length === 0) return [];
	const known = readRoadmapPropagationRefs(project);
	const satisfiedDeferredTriggers = fileStructureSatisfiedDeferredTriggerRefs(project.root, project);
	const gaps: string[] = [];
	for (const decisionRef of decisionRefs) {
		const decision = readBuildRef(project, decisionRef);
		if (!decision.ok) {
			gaps.push(`${planningPath || "planning_build"}:${decisionRef}:${decision.reason}`);
			continue;
		}
		if (String(decision.data?.kind || "") !== "decision_build") continue;
		const assessment = assessDecisionPropagation(decision.data, [{ path: planningPath, data: planning }], { knownTaskIds: known.taskIds, knownSprintIds: known.sprintIds, satisfiedDeferredTriggers });
		gaps.push(...assessment.gaps.map((gap) => `${decisionRef}:${gap}`));
	}
	return unique(gaps);
}

function implementationPlanningPropagationGaps(project: WikiProject, build: any): string[] {
	const gaps: string[] = [];
	for (const planningRef of buildRefsByKind(build, "planning")) {
		const planning = readBuildRef(project, planningRef);
		if (!planning.ok) continue;
		if (String(planning.data?.kind || "") !== "planning_build") continue;
		gaps.push(...planningDecisionPropagationGaps(project, planning.data, planningRef).map((gap) => `${planningRef}:${gap}`));
	}
	return unique(gaps);
}

function graphDecisionPropagationResidualGaps(project: WikiProject, input: CodewikiValidationReportInput, profile: string): string[] {
	if (profile.trim().toLowerCase() !== "task-close") return [];
	try {
		const graph = JSON.parse(readFileSync(resolve(project.root, project.graphPath), "utf8"));
		const residuals = Array.isArray(graph?.views?.decision_propagation?.residuals) ? graph.views.decision_propagation.residuals : [];
		if (residuals.length === 0) return [];
		const openTaskIds = Array.isArray(graph?.views?.roadmap?.open_task_ids) ? graph.views.roadmap.open_task_ids.map((id: unknown) => String(id || "").trim()).filter(Boolean) : [];
		const taskId = String(input.task_id || "").trim();
		const roadmapWouldBeEmpty = openTaskIds.length === 0 || (taskId && openTaskIds.length === 1 && openTaskIds[0] === taskId);
		if (!roadmapWouldBeEmpty) return [];
		return residuals.map((item: any) => `${String(item.decision_build || "decision_build")}:${String(item.kind || "row")}:${String(item.id || "unknown")}:${trimList(item.gaps).join("|") || "missing_resolution"}`);
	} catch {
		return [];
	}
}

function validationDecisionPropagationGaps(project: WikiProject, input: CodewikiValidationReportInput, build: any, profile: string): string[] {
	const normalizedProfile = profile.trim().toLowerCase();
	const gaps: string[] = [];
	const kind = String(build?.kind || "").trim();
	if (normalizedProfile === "planning" && kind === "planning_build") {
		gaps.push(...planningDecisionPropagationGaps(project, build, input.source || ""));
	}
	if (["implementation", "task-close", "publication", "publish", "release"].includes(normalizedProfile) && kind === "implementation_build") {
		gaps.push(...implementationPlanningPropagationGaps(project, build));
	}
	gaps.push(...graphDecisionPropagationResidualGaps(project, input, normalizedProfile));
	return unique(gaps);
}

function repoRefMissing(project: WikiProject, ref: string): boolean {
	const normalized = normalizeRepoPath(ref);
	if (!normalized || !normalized.includes("/")) return false;
	if (!normalized.startsWith(".codewiki/") && !normalized.startsWith("src/") && !normalized.startsWith("tests/") && !normalized.startsWith("skills/")) return false;
	return !existsSync(resolve(project.root, normalized));
}

function validationStaleRefs(project: WikiProject, input: CodewikiValidationReportInput, source: ValidationPreflightSource): string[] {
	return unique([
		...source.stale_refs,
		...trimList(input.audit_reports).filter((ref) => repoRefMissing(project, ref)).map((ref) => `audit_report:${ref}:missing`),
	]);
}

function validationTaskIdGaps(input: CodewikiValidationReportInput, build: any, profile: string): string[] {
	const normalizedProfile = profile.trim().toLowerCase();
	if (!VALIDATION_TASK_ID_PROFILES.has(normalizedProfile)) return [];
	const inputTaskId = String(input.task_id || "").trim();
	const buildTaskId = String(build?.task_id || build?.task?.id || "").trim();
	const gaps: string[] = [];
	if (!inputTaskId && !buildTaskId) gaps.push("task_id");
	if (inputTaskId && buildTaskId && inputTaskId !== buildTaskId) gaps.push("source_task_id_mismatch");
	return gaps;
}

function validationUpstreamBuildGaps(project: WikiProject, input: CodewikiValidationReportInput, build: any, profile: string): string[] {
	const normalizedProfile = profile.trim().toLowerCase();
	const gaps: string[] = [];
	if (!build) {
		if (["implementation", "task-close", "publication", "publish", "release"].includes(normalizedProfile) && !(input.source ?? "").trim()) gaps.push("source_implementation_build");
		return gaps;
	}
	const kind = String(build.kind || "").trim();
	if (kind === "implementation_build") {
		const exemption = normalizeTraceabilityExemption(build?.traceability?.exemption ?? build?.traceability?.change_class ?? build?.change_class);
		const requiresPlanning = build?.traceability?.requires_accepted_build ?? isSemanticTraceability(build?.traceability?.semantic, exemption);
		const planningRefs = buildRefsByKind(build, "planning");
		if (requiresPlanning) {
			if (planningRefs.length === 0) gaps.push("source_planning_build");
			else gaps.push(...acceptedBuildRefGaps(project, planningRefs, "accepted_planning_build_ref"));
		}
		gaps.push(...semanticTraceabilityGaps(project, build));
	} else if (kind === "planning_build") {
		const decisionRefs = buildRefsByKind(build, "decision");
		if (decisionRefs.length === 0) gaps.push("source_decision_build");
		else gaps.push(...acceptedBuildRefGaps(project, decisionRefs, "accepted_decision_build_ref"));
	}
	return unique(gaps);
}

function validationPathRefs(build: any): string[] {
	return unique([
		...trimList(build?.knowledge_changes),
		...trimList(build?.roadmap_changes),
		...trimList(build?.code_files),
		...trimList(build?.test_files),
		...trimList(build?.produces?.knowledge),
		...trimList(build?.produces?.roadmap),
		...trimList(build?.produces?.code),
		...trimList(build?.produces?.tests),
		...trimList(build?.produces?.publication),
	]);
}

function isDocsOrMechanicalRef(ref: string): boolean {
	const normalized = normalizeRepoPath(ref);
	return normalized.startsWith(".codewiki/kb/") || normalized.endsWith(".md") || normalized.endsWith(".mdx") || normalized.endsWith(".rst") || normalized.endsWith(".adoc") || normalized.endsWith(".txt");
}

function classifyValidationRisk(input: CodewikiValidationReportInput, build: any) {
	const profile = input.profile.trim().toLowerCase();
	const policyProfile = String(input.policy_profile || "").trim().toLowerCase();
	const exemption = normalizeTraceabilityExemption(build?.traceability?.exemption ?? build?.traceability?.change_class ?? build?.change_class);
	const changeType = normalizeChangeType(build?.traceability?.change_type ?? build?.change_type ?? build?.traceability?.change_class ?? build?.change_class, "code");
	const semantic = isSemanticTraceability(build?.traceability?.semantic, exemption);
	const pathRefs = validationPathRefs(build);
	const docsOnly = pathRefs.length > 0 && pathRefs.every(isDocsOrMechanicalRef);
	const haystack = [
		profile,
		policyProfile,
		input.source,
		...(input.checks ?? []),
		...(input.audit_refs ?? []),
		...(input.audit_reports ?? []),
		build?.summary,
		build?.change_type,
		build?.change_class,
		build?.traceability?.change_type,
		build?.traceability?.exemption,
		...pathRefs,
	].map((value) => String(value || "").toLowerCase()).join(" ");
	let tier = "code-local";
	let reason = "Code-local change; gateway audits and content proof still required.";
	if (/\b(destructive|irreversible|drop\s+table|delete\s+all|rm\s+-rf|force[- ]push|wipe|destroy)\b/.test(haystack)) {
		tier = "destructive";
		reason = "Destructive or irreversible wording requires explicit user approval before promotion.";
	} else if (["publication", "publish", "release"].includes(profile) || /\b(security|migration|publication|publish|release|secret|credential|remote|breaking[- ]api)\b/.test(haystack)) {
		tier = "security-migration-publication";
		reason = "Security, migration, publication, or release work requires explicit user approval before promotion.";
	} else if (exemption || docsOnly || /\b(mechanical|generated|runtime|docs[- ]cleanup|documentation[- ]cleanup)\b/.test(haystack)) {
		tier = "mechanical-docs";
		reason = "Mechanical, generated, runtime, or docs-only cleanup can use the low-risk fast path when gateway evidence is complete.";
	} else if (semantic && ["product", "system", "task"].includes(String(changeType))) {
		tier = "semantic-system";
		reason = "Semantic product/system/task change must trace to accepted user semantics before lower-layer promotion.";
	}
	const approvalRequired = HIGH_RISK_VALIDATION_TIERS.has(tier);
	return { tier, reason, approval_required: approvalRequired };
}

function validationApprovalEvidence(input: CodewikiValidationReportInput, build: any, tier: string): string[] {
	const refs = trimList([...(input.audit_refs ?? []), ...(input.audit_reports ?? []), ...(input.checks ?? [])]);
	const explicit = refs.filter((ref) => /\b(approval:user|user[-_ ]approval|explicit[-_ ]approval|approved[-_ ]by[-_ ]user|semantic[-_ ]approval)\b/i.test(ref));
	if (explicit.length > 0) return unique(explicit);
	if (tier === "semantic-system") {
		const acceptedRefs = trimList(build?.traceability?.accepted_build_refs);
		if (acceptedRefs.length > 0) return acceptedRefs.map((ref) => `accepted_semantics:${ref}`);
		const rows = trimList(build?.approved_diff_rows);
		if (rows.length > 0) return rows.map((row) => `approved_diff_row:${row}`);
	}
	return [];
}

function validationPreflightIssue(kind: string, severity: "high" | "medium" | "low", items: string[], summary: string) {
	return items.length ? [{ kind, severity, summary, evidence: items }] : [];
}

const VALIDATION_ROUTE_LOOP_VALUES: WorkflowLoop[] = ["decision", "planning", "implementation", "validation", "observe"];

function normalizeValidationFailureClass(value: unknown): CodewikiValidationFailureClass | undefined {
	const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
	return (VALIDATION_FAILURE_CLASS_VALUES as readonly string[]).includes(normalized)
		? normalized as CodewikiValidationFailureClass
		: undefined;
}

function normalizeValidationRouteLoop(value: unknown): WorkflowLoop | undefined {
	const normalized = String(value || "").trim().toLowerCase().replace(/_/g, "-");
	return (VALIDATION_ROUTE_LOOP_VALUES as readonly string[]).includes(normalized)
		? normalized as WorkflowLoop
		: undefined;
}

function routeForFailureClass(failureClass: CodewikiValidationFailureClass): WorkflowLoop {
	if (failureClass === "planning_gap") return "planning";
	if (failureClass === "compiler_incomplete") return "implementation";
	if (failureClass === "content_proof_missing" || failureClass === "evidence_missing") return "validation";
	if (failureClass === "runtime_conflict") return "observe";
	return "decision";
}

function inferValidationRouting(input: CodewikiValidationReportInput, signals: string[]): {
	failure_class?: CodewikiValidationFailureClass;
	recommended_next_loop?: WorkflowLoop;
	stop_reason?: string;
} {
	const explicitClass = normalizeValidationFailureClass(input.failure_class);
	const joined = unique([
		...signals,
		...trimList(input.failed_criteria),
		...trimList(input.blocking_questions),
		...trimList(input.issues?.map((issue) => issue.summary)),
		input.stop_reason || "",
	]).join("\n").toLowerCase();
	const failureClass = explicitClass
		|| (joined.includes("decision_propagation") || joined.includes("planning gap") ? "planning_gap" : undefined)
		|| (joined.includes("risk_approval") || joined.includes("user_approval") || joined.includes("approval required") ? "risk_approval_missing" : undefined)
		|| (joined.includes("commit_readiness") || joined.includes("compiler output") || joined.includes("compiler incomplete") ? "compiler_incomplete" : undefined)
		|| (joined.includes("publisher_result") || joined.includes("validation_isolation") || joined.includes("content_proof") || joined.includes("publication_readiness") || joined.includes("clean=true") || joined.includes("immutable") ? "content_proof_missing" : undefined)
		|| (joined.includes("runtime_conflict") || joined.includes("artifact conflict") || joined.includes("lease") ? "runtime_conflict" : undefined)
		|| (joined.includes("semantic_build_traceability") || joined.includes("ambiguous intent") || joined.includes("decision ambiguity") ? "decision_ambiguity" : undefined)
		|| (joined.includes("audit") || joined.includes("stale") || joined.includes("source refs") || joined.includes("task_id") || joined.includes("upstream") || joined.includes("evidence") ? "evidence_missing" : undefined)
		|| (input.verdict === "fail" || input.verdict === "block" ? "decision_ambiguity" : undefined);
	const recommendedLoop = normalizeValidationRouteLoop(input.recommended_next_loop)
		|| (failureClass ? routeForFailureClass(failureClass) : undefined);
	const stopReason = String(input.stop_reason || "").trim()
		|| (failureClass === "runtime_conflict" ? "Wait for scoped runtime coordination to clear before retrying." : undefined)
		|| (failureClass === "content_proof_missing" ? "Collect or cite required validation/publication content proof before promotion." : undefined);
	return {
		...(failureClass ? { failure_class: failureClass } : {}),
		...(recommendedLoop ? { recommended_next_loop: recommendedLoop } : {}),
		...(stopReason ? { stop_reason: stopReason } : {}),
	};
}

export function buildValidationPreflight(project: WikiProject, input: CodewikiValidationReportInput) {
	const profile = input.profile.trim();
	const policyProfile = (input.policy_profile ?? input.profile ?? "").trim() || undefined;
	const source = readValidationPreflightSource(project, input);
	const isolation = normalizeValidationIsolation(input.isolation);
	const isolationReq = validationIsolationRequirement(profile, policyProfile);
	const isolationGaps = validationIsolationGaps(isolation, isolationReq);
	const publisherGaps = validationPublisherResultGaps(isolation, isolationReq);
	const auditReq = auditRequirement(profile, policyProfile, input.required_audits);
	const auditGaps = auditEvidenceGaps([...unique(trimList(input.audit_refs)), ...unique(trimList(input.audit_reports))], auditReq).map((auditProfile) => `audit:${auditProfile}`);
	const taskIdGaps = validationTaskIdGaps(input, source.build, profile);
	const upstreamGaps = validationUpstreamBuildGaps(project, input, source.build, profile);
	const decisionPropagationGaps = validationDecisionPropagationGaps(project, input, source.build, profile);
	const staleRefs = validationStaleRefs(project, input, source);
	const closePublicationBlockers = unique([
		...publisherGaps.map((gap) => `publisher_result:${gap}`),
		...(IMMUTABLE_VALIDATION_PROFILES.has(profile.toLowerCase()) && isolation?.clean !== true ? ["clean=true"] : []),
		...(["publication", "publish", "release"].includes(profile.toLowerCase()) && source.build?.publication?.push_readiness?.safe_to_push === false ? ["publication_safe_to_push"] : []),
	]);
	const risk = classifyValidationRisk(input, source.build);
	const approvalEvidence = validationApprovalEvidence(input, source.build, risk.tier);
	const approvalMissing = risk.approval_required && approvalEvidence.length === 0 ? [`user_approval:${risk.tier}`] : [];
	const blockingGaps = unique([...upstreamGaps, ...decisionPropagationGaps, ...auditGaps, ...taskIdGaps, ...isolationGaps, ...staleRefs, ...closePublicationBlockers]);
	const status = blockingGaps.length > 0 ? "blocked" : approvalMissing.length > 0 ? "escalate" : "ready";
	const lowRiskFastPathCandidate = ["mechanical-docs", "code-local"].includes(risk.tier);
	const missing = {
		upstream_builds: upstreamGaps,
		decision_propagation: decisionPropagationGaps,
		audit_evidence: auditGaps,
		task_ids: taskIdGaps,
		content_proof: isolationGaps,
		stale_refs: staleRefs,
		close_publication_blockers: closePublicationBlockers,
		user_approval: approvalMissing,
	};
	const issues = [
		...validationPreflightIssue("upstream-builds", "high", upstreamGaps, "Missing accepted upstream build evidence."),
		...validationPreflightIssue("decision-propagation", "high", decisionPropagationGaps, "Accepted decision rows or downstream planning questions are not durably resolved."),
		...validationPreflightIssue("audit-evidence", "high", auditGaps, "Missing required audit evidence."),
		...validationPreflightIssue("task-id", "high", taskIdGaps, "Missing or inconsistent task id evidence."),
		...validationPreflightIssue("content-proof", "high", isolationGaps, "Missing required content proof strategy."),
		...validationPreflightIssue("stale-refs", "medium", staleRefs, "Source or report references are missing or unreadable."),
		...validationPreflightIssue("close-publication-blockers", "high", closePublicationBlockers, "Task-close/publication blockers must clear before validation can pass."),
		...validationPreflightIssue("risk-approval", "high", approvalMissing, "Risk tier requires explicit user approval before lower-layer promotion."),
	];
	const routingSignals = [
		...upstreamGaps.map((gap) => `upstream:${gap}`),
		...decisionPropagationGaps.map((gap) => `decision_propagation:${gap}`),
		...auditGaps.map((gap) => `audit:${gap}`),
		...taskIdGaps.map((gap) => `task_id:${gap}`),
		...isolationGaps.map((gap) => `content_proof:${gap}`),
		...staleRefs.map((gap) => `stale_refs:${gap}`),
		...closePublicationBlockers.map((gap) => `close_publication:${gap}`),
		...approvalMissing.map((gap) => `risk_approval:${gap}`),
	];
	const routing = inferValidationRouting(input, routingSignals);
	return {
		version: 1,
		status,
		profile,
		task_id: input.task_id || source.build?.task_id || source.build?.task?.id || undefined,
		checks: [
			"source refs readable",
			"accepted upstream builds",
			"decision-row propagation coverage",
			"required audit evidence",
			"task id consistency",
			"content proof strategy",
			"close/publication blockers",
			"risk-tier approval policy",
		],
		missing,
		issues,
		routing,
		risk: {
			...risk,
			approval_evidence: approvalEvidence,
			approval_missing: approvalMissing,
			fast_path: {
				candidate: lowRiskFastPathCandidate,
				eligible: lowRiskFastPathCandidate && status === "ready",
				reason: lowRiskFastPathCandidate
					? "User approval is not required beyond accepted semantics, but gateway audits and content proof remain mandatory."
					: "High-risk work must cite approval evidence before lower-layer promotion.",
			},
		},
	};
}

export async function writeValidationReport(
	project: WikiProject,
	input: CodewikiValidationReportInput,
) {
	if (!input.profile.trim()) throw new Error("Validation report requires profile.");
	if (!input.verdict) throw new Error("Validation report requires verdict.");
	if (!input.rationale.trim()) throw new Error("Validation report requires rationale.");

	const created = nowIso();
	const isolation = normalizeValidationIsolation(input.isolation);
	const profile = input.profile.trim();
	const policyProfile = (input.policy_profile ?? input.profile ?? "").trim() || undefined;
	const requirement = validationIsolationRequirement(profile, policyProfile);
	const isolationGaps = validationIsolationGaps(isolation, requirement);
	const publisherResultGaps = validationPublisherResultGaps(isolation, requirement);
	const commitReadinessGaps = validationCommitReadinessGaps(project, input, profile, isolationGaps);
	const traceabilityPolicy = validationSemanticTraceability(project, input, profile);
	const auditRefs = unique(trimList(input.audit_refs));
	const auditReports = unique(trimList(input.audit_reports));
	const auditReq = auditRequirement(profile, policyProfile, input.required_audits);
	const auditGaps = input.verdict === "pass" ? auditEvidenceGaps([...auditRefs, ...auditReports], auditReq) : [];
	const preflight = buildValidationPreflight(project, input);
	const decisionPropagationGaps = input.verdict === "pass" ? preflight.missing.decision_propagation : [];
	const riskApprovalGaps = input.verdict === "pass" ? preflight.missing.user_approval : [];
	const publicationReadinessGaps = input.verdict === "pass"
		? preflight.missing.close_publication_blockers.filter((gap) => gap === "publication_safe_to_push")
		: [];
	const policyGaps = unique([
		...isolationGaps,
		...publisherResultGaps.map((gap) => `publisher_result:${gap}`),
		...commitReadinessGaps,
		...traceabilityPolicy.gaps,
		...decisionPropagationGaps.map((gap) => `decision_propagation:${gap}`),
		...auditGaps.map((profileName) => `audit:${profileName}`),
		...riskApprovalGaps.map((gap) => `risk_approval:${gap}`),
		...publicationReadinessGaps.map((gap) => `publication_readiness:${gap}`),
	]);
	const policyBlocked = policyGaps.length > 0;
	const verdict = policyBlocked ? "block" : input.verdict;
	const routing = inferValidationRouting(input, policyGaps.length ? policyGaps : input.verdict === "pass" ? [] : [input.verdict]);
	const taskPart = input.task_id?.trim() ? `-${input.task_id.trim()}` : "";
	const slug = buildSlug(`${profile}-${verdict}${taskPart}`, "validation-report");
	const day = created.slice(0, 10);
	const absPath = resolve(project.root, `.codewiki/validation/${day}-${slug}.json`);
	const inputIssues = (input.issues ?? []).map((i) => ({ severity: i.severity.trim(), summary: i.summary.trim() })).filter((i) => i.summary);
	const isolationIssue = isolationGaps.length > 0
		? [{ severity: "high", summary: `Missing required validation isolation evidence: ${isolationGaps.join(", ")}.` }]
		: [];
	const publisherResultIssue = publisherResultGaps.length > 0
		? [{ severity: "high", summary: `Missing publisher result proof: ${publisherResultGaps.join(", ")}.` }]
		: [];
	const commitReadinessIssue = commitReadinessGaps.length > 0
		? [{ severity: "high", summary: `Implementation build is not commit-ready: ${commitReadinessGaps.join(", ")}.` }]
		: [];
	const auditIssue = auditGaps.length > 0
		? [{ severity: "high", summary: `Missing required audit evidence for profiles: ${auditGaps.join(", ")}.` }]
		: [];
	const decisionPropagationIssue = decisionPropagationGaps.length > 0
		? [{ severity: "high", summary: `Accepted decision propagation gaps remain: ${decisionPropagationGaps.join(", ")}.` }]
		: [];
	const riskApprovalIssue = riskApprovalGaps.length > 0
		? [{ severity: "high", summary: `Risk tier ${preflight.risk.tier} requires user approval before promotion: ${riskApprovalGaps.join(", ")}.` }]
		: [];
	const publicationReadinessIssue = publicationReadinessGaps.length > 0
		? [{ severity: "high", summary: `Publication readiness blockers remain: ${publicationReadinessGaps.join(", ")}.` }]
		: [];
	const traceabilityIssue = traceabilityPolicy.gaps.length > 0
		? [{ severity: "high", summary: `Missing accepted semantic build traceability: ${traceabilityPolicy.gaps.join(", ")}.` }]
		: traceabilityPolicy.warnings.map((summary) => ({ severity: "medium", summary }));
	const contentProofRefs = validationContentProofRefs(isolation);
	const data = {
		version: 1,
		kind: "validation_report",
		created,
		profile,
		task_id: (input.task_id ?? "").trim() || undefined,
		verdict,
		rationale: policyBlocked
			? `${input.rationale.trim()} Policy blocks ${profile} validation until ${policyGaps.join(", ")} are recorded.`
			: input.rationale.trim(),
		checks: (input.checks ?? []).map((v) => v.trim()).filter(Boolean),
		issues: [...inputIssues, ...isolationIssue, ...publisherResultIssue, ...commitReadinessIssue, ...traceabilityIssue, ...decisionPropagationIssue, ...auditIssue, ...riskApprovalIssue, ...publicationReadinessIssue],
		source: (input.source ?? "").trim() || undefined,
		policy_profile: policyProfile,
		failure_class: routing.failure_class,
		recommended_next_loop: routing.recommended_next_loop,
		stop_reason: routing.stop_reason,
		routing,
		required_audits: auditReq.profiles,
		audit_refs: auditRefs,
		audit_reports: auditReports,
		content_proof_refs: contentProofRefs,
		failed_criteria: unique([
			...trimList(input.failed_criteria),
			...(isolationGaps.length > 0 ? ["validation_isolation"] : []),
			...(publisherResultGaps.length > 0 ? ["publisher_result_proof"] : []),
			...(commitReadinessGaps.length > 0 ? ["commit_readiness"] : []),
			...(traceabilityPolicy.gaps.length > 0 ? ["semantic_build_traceability"] : []),
			...(decisionPropagationGaps.length > 0 ? ["decision_propagation"] : []),
			...(auditGaps.length > 0 ? ["audit_evidence"] : []),
			...(riskApprovalGaps.length > 0 ? ["risk_approval"] : []),
			...(publicationReadinessGaps.length > 0 ? ["publication_readiness"] : []),
		]),
		blocking_questions: unique([
			...trimList(input.blocking_questions),
			...(isolationGaps.length > 0 ? ["Run this gateway from fresh validator context and record required checked content proof for the profile."] : []),
			...(publisherResultGaps.length > 0 ? ["Publish through the publisher queue or cite its clean immutable result proof before this profile can pass."] : []),
			...(commitReadinessGaps.length > 0 ? ["Update the implementation build with commit-ready title, body, trailers, checks, validation placeholder, closure brief, and file evidence before validation can pass."] : []),
			...(traceabilityPolicy.gaps.length > 0 ? ["Cite an accepted upstream compiler build chain for semantic changes or set a generated/runtime/mechanical traceability exemption when policy allows."] : []),
			...(decisionPropagationGaps.length > 0 ? ["Create or validate a superseding planning build that maps each accepted decision row/downstream question to knowledge-only, roadmap task, sprint metadata, or explicit deferred owner/trigger/rationale evidence."] : []),
			...(auditGaps.length > 0 ? [`Run or cite audit evidence for required profiles: ${auditGaps.join(", ")}.`] : []),
			...(riskApprovalGaps.length > 0 ? [`Record explicit user approval for risk tier ${preflight.risk.tier} before lower-layer promotion.`] : []),
			...(publicationReadinessGaps.length > 0 ? ["Record publication readiness evidence such as safe_to_push=true with passing secret and remote visibility checks before publication validation can pass."] : []),
		]),
		isolation_requirement: requirement,
		publisher_result_requirement: requirement.mode === "fresh-context-clean-immutable-content"
			? {
				required: true,
				evidence: ["publisher queue result", "clean=true", "published_sha/tree_sha/archive_ref/remote_ref"],
				proof_refs: publisherProofRefs(isolation),
				gaps: publisherResultGaps,
			}
			: undefined,
		audit_requirement: {
			...auditReq,
			gaps: auditGaps,
		},
		preflight,
		commit_readiness_requirement: profile.trim().toLowerCase() === "implementation"
			? {
				required: true,
				evidence: ["task_id", "source_planning_build", "accepted_planning_build_ref", "acceptance_mapping", "code_files", "test_files or test_design_evidence", "checks_run", "closure_brief", "publication.commit title/body", "CodeWiki task/build/checks/validation/recover trailers"],
				gaps: commitReadinessGaps,
			}
			: undefined,
		semantic_traceability_requirement: {
			required: traceabilityPolicy.gaps.length > 0 || profile.trim().toLowerCase() === "implementation" || Boolean((input.source ?? "").trim() && ["task-close", "publication", "publish", "release"].includes(profile.trim().toLowerCase())),
			evidence: ["source implementation build", "change_type", "accepted upstream compiler build refs"],
			gaps: traceabilityPolicy.gaps,
			warnings: traceabilityPolicy.warnings,
		},
		isolation,
	};
	await mkdir(dirname(absPath), { recursive: true });
	await writeFile(absPath, JSON.stringify(data, null, 2) + "\n", "utf8");
	const relPath = `.codewiki/validation/${day}-${slug}.json`;
	return { path: relPath, data };
}
