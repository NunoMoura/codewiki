import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { CodewikiBuildProducesInput, CodewikiBuildRefsInput, CodewikiBuildToolInput, CodewikiClosureBriefInput, CodewikiDiffTableRowInput } from "../domain/build/types.ts";
import { isAcceptedBuildData } from "../domain/build/lifecycle.ts";
import type { ChangeType } from "../domain/change/types.ts";
import type { WikiProject } from "../domain/project/types.ts";
import type { RoadmapTaskRecord } from "../domain/roadmap/types.ts";
import type { CodewikiValidationReportInput } from "../domain/validation/types.ts";
import { normalizeChangeType, normalizeTraceabilityExemption, isSemanticTraceability } from "../domain/change/traceability.ts";
import { nowIso, unique } from "../domain/shared/utils.ts";
import { normalizeWorktreeIsolation } from "./claims.ts";
import { readRoadmapTask } from "./roadmap.ts";
import { hasPublisherResultProof, publisherProofRefs } from "../domain/session/worktree-isolation.ts";
import { maybeReadGraph } from "./state-artifacts.ts";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function buildSlug(value: string, defaultPrefix: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48) || defaultPrefix;
}

function addDaysIso(baseIso: string, days: number): string {
	const date = new Date(baseIso);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString();
}

function buildLifecycle(input: CodewikiBuildToolInput, created: string, defaultTtlDays: number) {
	const ttlDays = input.lifecycle?.ttl_days ?? defaultTtlDays;
	return {
		state: input.lifecycle?.state ?? "accepted",
		ttl_days: ttlDays,
		archive_after: input.lifecycle?.archive_after ?? addDaysIso(created, ttlDays),
		purge_after: input.lifecycle?.purge_after ?? addDaysIso(created, ttlDays * 2),
	};
}

function buildBuildPath(project: WikiProject, kind: string, slug: string, day: string): string {
	const abs = resolve(project.root, `.codewiki/builds/${kind}/${day}-${slug}.json`);
	return abs;
}

function trimList(values?: unknown[]): string[] {
	return (values ?? []).map((value) => String(value || "").trim()).filter(Boolean);
}

function inferChangeTypeForBuild(kind: string, inputOrBuild: any): ChangeType {
	if (kind === "decision_build" || kind === "decision") {
		const paths = [
			...trimList(inputOrBuild.knowledge_changes),
			...trimList(inputOrBuild.produces?.knowledge),
			...trimList(inputOrBuild.row_to_kb_mappings?.flatMap((mapping: any) => mapping?.knowledge_refs ?? [])),
		];
		const direction = String(inputOrBuild.propagation?.direction || "").trim();
		if (direction === "product-first" || paths.some((path) => path.includes("/product/"))) return "product";
		return "system";
	}
	if (kind === "planning_build" || kind === "planning") return "task";
	if (kind === "implementation_build" || kind === "implementation") {
		const refs = [
			...trimList(inputOrBuild.code_files),
			...trimList(inputOrBuild.test_files),
			...trimList(inputOrBuild.produces?.code),
			...trimList(inputOrBuild.produces?.tests),
			...trimList(inputOrBuild.produces?.publication),
		];
		if (refs.some((ref) => ref.startsWith(".codewiki/roadmap/") || /^TASK-\d+/.test(ref))) return "task";
		if (refs.some((ref) => ref.startsWith(".codewiki/kb/product/"))) return "product";
		if (refs.some((ref) => ref.startsWith(".codewiki/kb/system/") || ref.startsWith("skills/codewiki/"))) return "system";
		return "code";
	}
	return "task";
}

function normalizeBuildPath(ref: string): string {
	return normalizeRepoPath(ref).replace(/^\.\//, "");
}

function readBuildRef(project: WikiProject, ref: string): { ok: true; data: any } | { ok: false; reason: string } {
	const normalized = normalizeBuildPath(ref);
	if (!normalized.startsWith(".codewiki/builds/")) return { ok: false, reason: "not-build-ref" };
	try {
		return { ok: true, data: JSON.parse(readFileSync(resolve(project.root, normalized), "utf8")) };
	} catch {
		return { ok: false, reason: "unreadable" };
	}
}

function acceptedBuildRefGaps(project: WikiProject, refs: string[], gapName: string): string[] {
	if (refs.length === 0) return [gapName];
	const gaps: string[] = [];
	for (const ref of refs) {
		const result = readBuildRef(project, ref);
		if (!result.ok) {
			gaps.push(`${gapName}:${ref}:${result.reason}`);
			continue;
		}
		if (!isAcceptedBuildData(result.data)) gaps.push(`${gapName}:${ref}:not_accepted`);
	}
	return unique(gaps);
}

function buildRefsByKind(build: any, loop: "decision" | "planning" | "implementation"): string[] {
	const field = loop === "decision"
		? "source_decision_build"
		: loop === "planning"
			? "source_planning_build"
			: "source_implementation_build";
	return unique([
		...trimList([build?.[field]]),
		...trimList(build?.consumes?.[loop]),
		...trimList(build?.traceability?.accepted_build_refs).filter((ref) => ref.includes(`/builds/${loop}/`)),
		...trimList(build?.accepted_build_refs).filter((ref) => ref.includes(`/builds/${loop}/`)),
	]);
}

function requiredUpstreamLoop(kind: string): "decision" | "planning" | null {
	if (kind === "planning_build") return "decision";
	if (kind === "implementation_build") return "planning";
	return null;
}

function semanticTraceabilityGaps(project: WikiProject, build: any): string[] {
	const kind = String(build?.kind || "").trim();
	const exemption = normalizeTraceabilityExemption(build?.traceability?.exemption ?? build?.traceability?.change_class ?? build?.change_class);
	const semantic = isSemanticTraceability(build?.traceability?.semantic, exemption);
	const requires = build?.traceability?.requires_accepted_build ?? (semantic && requiredUpstreamLoop(kind) !== null);
	if (!requires) return [];
	const upstream = requiredUpstreamLoop(kind);
	if (!upstream) return [];
	return acceptedBuildRefGaps(project, buildRefsByKind(build, upstream), `accepted_${upstream}_build_ref`);
}

function buildTraceability(kind: string, input: CodewikiBuildToolInput, consumes: CodewikiBuildRefsInput, produces: CodewikiBuildProducesInput) {
	const exemption = normalizeTraceabilityExemption(input.traceability?.exemption ?? input.traceability?.change_class ?? input.change_class);
	const changeType = normalizeChangeType(
		input.traceability?.change_type ?? input.change_type ?? input.traceability?.change_class ?? input.change_class,
		inferChangeTypeForBuild(kind, { ...input, consumes, produces }),
	);
	const semantic = isSemanticTraceability(input.traceability?.semantic, exemption);
	const upstreamLoop = requiredUpstreamLoop(`${kind}_build`);
	const upstreamBuildRefs = unique([
		...trimList(input.upstream_build_refs),
		...trimList(input.traceability?.upstream_build_refs),
		...(upstreamLoop ? buildRefsByKind({ ...input, consumes }, upstreamLoop) : []),
	]);
	const acceptedBuildRefs = unique([
		...trimList(input.accepted_build_refs),
		...trimList(input.traceability?.accepted_build_refs),
		...upstreamBuildRefs,
	]);
	return {
		change_type: changeType,
		exemption,
		semantic,
		requires_accepted_build: input.traceability?.requires_accepted_build ?? (semantic && upstreamLoop !== null),
		upstream_loop: upstreamLoop,
		upstream_build_refs: upstreamBuildRefs,
		accepted_build_refs: acceptedBuildRefs,
	};
}

const DEFAULT_REQUIRED_AUDIT_PROFILES: Record<string, string[]> = {
	decision: ["alignment", "stale-reference"],
	planning: ["alignment"],
	implementation: ["alignment", "changed"],
	"task-close": ["alignment", "changed", "task", "generated-parity"],
	publication: ["alignment", "package", "security"],
	publish: ["alignment", "package", "security"],
	release: ["alignment", "package", "security", "stale-reference"],
	"drift-audit": ["alignment", "generated-parity"],
	"graph-audit": ["alignment", "generated-parity"],
};

function normalizeAuditProfile(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/^(profile|audit|audit-profile):/, "")
		.replace(/^audit\//, "")
		.replace(/\.json$/, "")
		.trim();
}

function requiredAuditProfiles(profile: string, explicit?: string[], policyProfile?: string): string[] {
	const profileKey = profile.trim().toLowerCase();
	const policyKey = String(policyProfile || "").trim().toLowerCase();
	return unique([
		...(DEFAULT_REQUIRED_AUDIT_PROFILES[profileKey] ?? []),
		...(policyKey && policyKey !== profileKey ? DEFAULT_REQUIRED_AUDIT_PROFILES[policyKey] ?? [] : []),
		...trimList(explicit),
	]).map(normalizeAuditProfile).filter(Boolean);
}

function auditRequirement(profile: string, policyProfile?: string, explicit?: string[]) {
	const profiles = requiredAuditProfiles(profile, explicit, policyProfile);
	return {
		required: profiles.length > 0,
		profiles,
		evidence: profiles.map((auditProfile) => `audit:${auditProfile} or profile:${auditProfile}`),
		reason: "Gateway profiles require deterministic audit evidence for their build or boundary context.",
	};
}

function auditProfileNamesFromRefs(refs: string[]): string[] {
	return unique(refs.map(normalizeAuditProfile).filter((profile) => DEFAULT_REQUIRED_AUDIT_PROFILES[profile] || /^[a-z0-9-]+$/.test(profile)));
}

function auditEvidenceGaps(refs: string[], requirement: ReturnType<typeof auditRequirement>): string[] {
	if (!requirement.required) return [];
	const present = new Set(auditProfileNamesFromRefs(refs));
	return requirement.profiles.filter((profile) => !present.has(profile));
}

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

function sha256Text(value: string): string {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256Buffer(value: Buffer): string {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizeRepoPath(value: string): string {
	return value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function buildArtifactDigests(project: WikiProject, refs: Array<{ path: string; role: string }>) {
	const files: Array<{ path: string; role: string; sha256: string; bytes: number }> = [];
	const skipped: Array<{ path: string; role: string; reason: string }> = [];
	for (const ref of refs) {
		const path = normalizeRepoPath(ref.path);
		if (!path) continue;
		const absPath = resolve(project.root, path);
		try {
			if (!existsSync(absPath)) {
				skipped.push({ path, role: ref.role, reason: "missing" });
				continue;
			}
			const stats = statSync(absPath);
			if (!stats.isFile()) {
				skipped.push({ path, role: ref.role, reason: "not-file" });
				continue;
			}
			if (stats.size > 1_000_000) {
				skipped.push({ path, role: ref.role, reason: "too-large" });
				continue;
			}
			files.push({ path, role: ref.role, sha256: sha256Buffer(readFileSync(absPath)), bytes: stats.size });
		} catch {
			skipped.push({ path, role: ref.role, reason: "unreadable" });
		}
	}
	return { algorithm: "sha256", files, skipped };
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
	const staleRefs = validationStaleRefs(project, input, source);
	const closePublicationBlockers = unique([
		...publisherGaps.map((gap) => `publisher_result:${gap}`),
		...(IMMUTABLE_VALIDATION_PROFILES.has(profile.toLowerCase()) && isolation?.clean !== true ? ["clean=true"] : []),
		...(["publication", "publish", "release"].includes(profile.toLowerCase()) && source.build?.publication?.push_readiness?.safe_to_push === false ? ["publication_safe_to_push"] : []),
	]);
	const risk = classifyValidationRisk(input, source.build);
	const approvalEvidence = validationApprovalEvidence(input, source.build, risk.tier);
	const approvalMissing = risk.approval_required && approvalEvidence.length === 0 ? [`user_approval:${risk.tier}`] : [];
	const blockingGaps = unique([...upstreamGaps, ...auditGaps, ...taskIdGaps, ...isolationGaps, ...staleRefs, ...closePublicationBlockers]);
	const status = blockingGaps.length > 0 ? "blocked" : approvalMissing.length > 0 ? "escalate" : "ready";
	const lowRiskFastPathCandidate = ["mechanical-docs", "code-local"].includes(risk.tier);
	const missing = {
		upstream_builds: upstreamGaps,
		audit_evidence: auditGaps,
		task_ids: taskIdGaps,
		content_proof: isolationGaps,
		stale_refs: staleRefs,
		close_publication_blockers: closePublicationBlockers,
		user_approval: approvalMissing,
	};
	const issues = [
		...validationPreflightIssue("upstream-builds", "high", upstreamGaps, "Missing accepted upstream build evidence."),
		...validationPreflightIssue("audit-evidence", "high", auditGaps, "Missing required audit evidence."),
		...validationPreflightIssue("task-id", "high", taskIdGaps, "Missing or inconsistent task id evidence."),
		...validationPreflightIssue("content-proof", "high", isolationGaps, "Missing required content proof strategy."),
		...validationPreflightIssue("stale-refs", "medium", staleRefs, "Source or report references are missing or unreadable."),
		...validationPreflightIssue("close-publication-blockers", "high", closePublicationBlockers, "Task-close/publication blockers must clear before validation can pass."),
		...validationPreflightIssue("risk-approval", "high", approvalMissing, "Risk tier requires explicit user approval before lower-layer promotion."),
	];
	return {
		version: 1,
		status,
		profile,
		task_id: input.task_id || source.build?.task_id || source.build?.task?.id || undefined,
		checks: [
			"source refs readable",
			"accepted upstream builds",
			"required audit evidence",
			"task id consistency",
			"content proof strategy",
			"close/publication blockers",
			"risk-tier approval policy",
		],
		missing,
		issues,
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

function trimRefGroups(input?: CodewikiBuildRefsInput): CodewikiBuildRefsInput {
	return {
		decision: trimList(input?.decision),
		planning: trimList(input?.planning),
		implementation: trimList(input?.implementation),
		roadmap: trimList(input?.roadmap),
		validation: trimList(input?.validation),
		source: trimList(input?.source),
	};
}

function trimProduces(input?: CodewikiBuildProducesInput): CodewikiBuildProducesInput {
	return {
		knowledge: trimList(input?.knowledge),
		roadmap: trimList(input?.roadmap),
		code: trimList(input?.code),
		tests: trimList(input?.tests),
		validation: trimList(input?.validation),
		publication: trimList(input?.publication),
		closure: trimList(input?.closure),
	};
}

function mergeProduces(base: CodewikiBuildProducesInput, overrides?: CodewikiBuildProducesInput): CodewikiBuildProducesInput {
	const extra = trimProduces(overrides);
	return {
		knowledge: unique([...(base.knowledge ?? []), ...(extra.knowledge ?? [])]),
		roadmap: unique([...(base.roadmap ?? []), ...(extra.roadmap ?? [])]),
		code: unique([...(base.code ?? []), ...(extra.code ?? [])]),
		tests: unique([...(base.tests ?? []), ...(extra.tests ?? [])]),
		validation: unique([...(base.validation ?? []), ...(extra.validation ?? [])]),
		publication: unique([...(base.publication ?? []), ...(extra.publication ?? [])]),
		closure: unique([...(base.closure ?? []), ...(extra.closure ?? [])]),
	};
}

function normalizeCycle(input: CodewikiBuildToolInput, loop: string) {
	return {
		loop,
		sequence: input.cycle?.sequence ?? 1,
		attempt: String(input.cycle?.attempt || "").trim() || undefined,
		supersedes: trimList(input.cycle?.supersedes),
		status: String(input.cycle?.status || input.lifecycle?.state || "accepted").trim(),
	};
}

function isolationBoundary(required: boolean, mode: string, reason: string, evidence: string[], handoff: string, profiles: string[] = []) {
	return { required, mode, reason, evidence, handoff, profiles };
}

function defaultIsolationPolicy(loop: string) {
	const nextLoop = loop === "decision"
		? "planning"
		: loop === "planning"
			? "implementation"
			: "validation";
	const compilerBoundary = isolationBoundary(
		false,
		"agent-owned-new-session",
		"Compiler loops start from CodeWiki source refs; agents may refresh context when chat is noisy, stale, or token-heavy.",
		["source build/task refs read", "new_session or context_refresh when useful"],
		`${loop}_loop context boundary`,
	);
	const semanticValidation = loop === "implementation";
	return {
		loop_start: compilerBoundary,
		validation: semanticValidation
			? isolationBoundary(
				true,
				"fresh-context-checked-content",
				"Implementation validation must not reuse builder thought context and must cite checked content proof.",
				["fresh_context=true", "clean state recorded", "validated_sha/head_sha/published_sha/tree_sha or working_tree_digest"],
				"implementation_build -> validation gateway",
				["implementation"],
			)
			: isolationBoundary(
				false,
				"fresh-context-preferred",
				"Fresh validation is preferred; policy may require it for high-risk semantic gates.",
				["fresh_context=true when high-risk or policy-required"],
				`${loop}_build -> validation gateway`,
			),
		next_loop: loop === "implementation"
			? isolationBoundary(
				true,
				"fresh-context-checked-content",
				"The next gateway must independently validate implementation evidence and cite checked content proof.",
				["fresh_context=true", "clean state recorded", "validated_sha/head_sha/published_sha/tree_sha or working_tree_digest"],
				"implementation_build -> validation gateway",
				["implementation"],
			)
			: isolationBoundary(
				false,
				"agent-owned-new-session",
				"The next compiler loop should start from CodeWiki source refs; the agent may refresh context when useful.",
				["source build ref", "new_session or context_refresh when useful"],
				`${loop}_build -> ${nextLoop}_loop`,
			),
	};
}

function mergeIsolationBoundary(base: ReturnType<typeof isolationBoundary>, override: any) {
	if (!override || typeof override !== "object") return base;
	return {
		required: typeof override.required === "boolean" ? override.required : base.required,
		mode: String(override.mode || base.mode).trim(),
		reason: String(override.reason || base.reason).trim(),
		evidence: unique([...base.evidence, ...trimList(override.evidence)]),
		handoff: String(override.handoff || base.handoff).trim(),
		profiles: unique([...base.profiles, ...trimList(override.profiles)]),
	};
}

function normalizeIsolationPolicy(input: CodewikiBuildToolInput, loop: string) {
	const defaults = defaultIsolationPolicy(loop);
	const overrides = input.policy?.isolation;
	return {
		loop_start: mergeIsolationBoundary(defaults.loop_start, overrides?.loop_start),
		validation: mergeIsolationBoundary(defaults.validation, overrides?.validation),
		next_loop: mergeIsolationBoundary(defaults.next_loop, overrides?.next_loop),
	};
}

function normalizePolicy(input: CodewikiBuildToolInput, defaultProfile: string, loop: string) {
	const profile = String(input.policy?.profile || defaultProfile).trim();
	return {
		profile,
		exit_criteria: trimList(input.policy?.exit_criteria),
		required_audits: requiredAuditProfiles(profile, input.policy?.required_audits),
		audit_refs: trimList(input.policy?.audit_refs),
		audit_reports: trimList(input.policy?.audit_reports),
		isolation: normalizeIsolationPolicy(input, loop),
	};
}

function normalizeRequirements(input: CodewikiBuildToolInput) {
	return (input.requirements ?? [])
		.map((requirement) => ({
			id: String(requirement.id || "").trim(),
			text: String(requirement.text || "").trim(),
			source_refs: trimList(requirement.source_refs),
			state: String(requirement.state || "accepted").trim(),
		}))
		.filter((requirement) => requirement.id && requirement.text);
}

function normalizeEvidenceMapping(input: CodewikiBuildToolInput) {
	return (input.evidence_mapping ?? [])
		.map((mapping) => ({
			criterion: String(mapping.criterion || "").trim(),
			evidence: String(mapping.evidence || "").trim(),
			requirement_ids: trimList(mapping.requirement_ids),
			source_refs: trimList(mapping.source_refs),
		}))
		.filter((mapping) => mapping.criterion && mapping.evidence);
}

function buildCycleFields(input: CodewikiBuildToolInput, loop: string, defaultPolicyProfile: string) {
	return {
		cycle: normalizeCycle(input, loop),
		policy: normalizePolicy(input, defaultPolicyProfile, loop),
		requirements: normalizeRequirements(input),
		evidence_mapping: normalizeEvidenceMapping(input),
		audit_refs: trimList(input.audit_refs),
		audit_reports: trimList(input.audit_reports),
		agent_assessment: String(input.agent_assessment || "").trim(),
	};
}

function normalizeDiffTable(rows?: CodewikiDiffTableRowInput[]) {
	return (rows ?? []).map((row, index) => ({
		id: String(row.id || `DTR-${String(index + 1).padStart(3, "0")}`).trim(),
		current_state: String(row.current_state || "").trim(),
		desired_state: String(row.desired_state || "").trim(),
		rationale: String(row.rationale || "").trim(),
		affected_layers: trimList(row.affected_layers),
		risk: String(row.risk || "medium").trim(),
		user_action: String(row.user_action || "pending").trim(),
		alternatives: trimList(row.alternatives),
	})).filter((row) => row.current_state && row.desired_state && row.rationale);
}

function approvedDiffRows(rows: ReturnType<typeof normalizeDiffTable>, approvedIds?: string[]) {
	const explicitApproved = new Set(trimList(approvedIds));
	return rows.filter((row) => row.user_action === "approved" || explicitApproved.has(row.id));
}

function normalizeDecisionKbMappings(input: CodewikiBuildToolInput) {
	return (input.row_to_kb_mappings ?? [])
		.map((mapping) => ({
			row_id: String(mapping.row_id || "").trim(),
			knowledge_refs: trimList(mapping.knowledge_refs),
			diagram_refs: trimList(mapping.diagram_refs),
			evidence: String(mapping.evidence || "").trim(),
			deferred: Boolean(mapping.deferred),
			deferred_reason: String(mapping.deferred_reason || "").trim() || undefined,
		}))
		.filter((mapping) => mapping.row_id && mapping.evidence);
}

function normalizeDecisionPropagation(input: CodewikiBuildToolInput) {
	const propagation = input.propagation || {};
	return {
		direction: String(propagation.direction || "").trim() || undefined,
		product_impact: trimList(propagation.product_impact),
		system_impact: trimList(propagation.system_impact),
		no_product_impact: String(propagation.no_product_impact || "").trim() || undefined,
		no_system_impact: String(propagation.no_system_impact || "").trim() || undefined,
		downstream_planning_questions: trimList(propagation.downstream_planning_questions),
	};
}

function normalizeClosureBrief(input: CodewikiClosureBriefInput | undefined, task: RoadmapTaskRecord | null, checksRun: string[], acceptanceEvidence: string[], validationRefs: string[], risks: string[]) {
	if (!input) return null;
	return {
		user_intent: String(input.user_intent || task?.goal?.outcome || "").trim(),
		implemented_changes: trimList(input.implemented_changes),
		layers_updated: {
			knowledge: trimList(input.layers_updated?.knowledge),
			roadmap: trimList(input.layers_updated?.roadmap),
			code: trimList(input.layers_updated?.code),
			tests: trimList(input.layers_updated?.tests),
			validation: unique([...trimList(input.layers_updated?.validation), ...validationRefs]),
		},
		acceptance_evidence: trimList(input.acceptance_evidence).length ? trimList(input.acceptance_evidence) : acceptanceEvidence,
		checks: trimList(input.checks).length ? trimList(input.checks) : checksRun,
		non_goals_preserved: trimList(input.non_goals_preserved),
		remaining_risks: trimList(input.remaining_risks).length ? trimList(input.remaining_risks) : risks,
	};
}

function taskSnapshot(task: RoadmapTaskRecord | null) {
	if (!task) return undefined;
	return {
		id: task.id,
		title: task.title,
		status: task.status,
		priority: task.priority,
		kind: task.kind,
		summary: task.summary,
		spec_paths: task.spec_paths,
		code_paths: task.code_paths,
		goal: task.goal,
	};
}

async function nextFocusTaskId(project: WikiProject, currentTaskId: string): Promise<string> {
	const graph = await maybeReadGraph(project.graphPath) as any;
	const openTaskIds = Array.isArray(graph?.lenses?.roadmap?.views?.open_task_ids)
		? graph.lenses.roadmap.views.open_task_ids.map((id: unknown) => String(id).trim()).filter(Boolean)
		: [];
	return openTaskIds.find((id: string) => id !== currentTaskId) || "";
}

function publicationDefaults(
	input: CodewikiBuildToolInput,
	task: RoadmapTaskRecord | null,
	checksRun: string[],
	validationRefs: string[],
	buildPath: string,
	artifactDigests: ReturnType<typeof buildArtifactDigests>,
	payloadDigest: string,
) {
	const taskId = input.task_id?.trim() || task?.id || "implementation-work";
	const taskLabel = task ? `${task.id} ${task.title}` : taskId;
	const archiveRef = input.publication?.archive_ref?.trim() || `refs/codewiki/archive/task/${taskId}`;
	const restoreCommand = input.publication?.restore_command?.trim() || `/wiki-restore ${taskId}`;
	const commitTitle = input.publication?.commit_title?.trim() || `chore(codewiki): record ${taskLabel} implementation evidence`;
	const checksTrailerValue = checksRun.length ? checksRun.join(", ") : "<missing-checks>";
	const validationTrailerValue = validationRefs.length ? validationRefs.join(", ") : "<pending-validation>";
	const trailers = [
		`CodeWiki-Task: ${taskId}`,
		`CodeWiki-Build: ${buildPath}`,
		`CodeWiki-Checks: ${checksTrailerValue}`,
		`CodeWiki-Validation: ${validationTrailerValue}`,
		`CodeWiki-Recover: ${restoreCommand}`,
		`CodeWiki-Archive-Ref: ${archiveRef}`,
		`CodeWiki-Digest: ${payloadDigest}`,
		`CodeWiki-Restore: ${restoreCommand}`,
	];
	const commitBody = input.publication?.commit_body?.trim() || [
		input.summary.trim(),
		"",
		checksRun.length ? `Checks: ${checksRun.join(", ")}` : "Checks: not recorded in build input.",
		validationRefs.length ? `Validation: ${validationRefs.join(", ")}` : "Validation: no durable validation refs recorded.",
		"Remote publication requires explicit approval; this build is recommendation-only.",
		"",
		...trailers,
	].join("\n");
	const secretScan = input.publication?.secret_scan?.trim() || "required";
	const remoteVisibility = input.publication?.remote_visibility?.trim() || "required";
	const privateEvidence = input.publication?.private_evidence?.trim() || "required";
	const safeToPush = input.publication?.safe_to_push === true && secretScan === "pass" && remoteVisibility === "pass" && privateEvidence === "pass";
	const publisherQueue = {
		status: validationRefs.length ? "ready_for_publisher" : "waiting_validation",
		task_id: taskId,
		source_build: buildPath,
		role: "publisher",
		inputs: {
			builder_refs: unique([
				...trimList(input.code_files),
				...trimList(input.test_files),
				...trimList(input.produces?.code),
				...trimList(input.produces?.tests),
			]),
			validation_refs: validationRefs,
			archive_ref: archiveRef,
			restore_command: restoreCommand,
		},
		required_steps: [
			"consume implementation_build from fresh publisher context",
			"refresh generated CodeWiki state",
			"verify validation refs and checks",
			"create clean publisher commit/tree or archive ref",
			"record immutable publisher result proof",
		],
		result: {
			state: "pending",
			required_proof: ["clean=true", "published_sha", "tree_sha", "archive_ref or remote_ref"],
		},
	};
	return {
		policy: {
			execution: "recommendation_only",
			approval_required: true,
			remote_updates: "blocked_until_explicit_approval",
			security_review_required: true,
		},
		commit: {
			title: commitTitle,
			body: commitBody,
			trailers,
			commit_ready: checksRun.length > 0,
			validation_ref_policy: validationRefs.length ? "validation refs recorded" : "replace <pending-validation> with validation report ref before commit",
		},
		pr: {
			title: input.publication?.pr_title?.trim() || commitTitle,
			body: input.publication?.pr_body?.trim() || commitBody,
		},
		issue_update: input.publication?.issue_update?.trim() || "",
		release_notes: input.publication?.release_notes?.trim() || "",
		git: {
			strategy: "implementation_build_publication_payload",
			archive_ref: archiveRef,
			commit_sha: input.publication?.commit_sha?.trim() || "",
			remote: input.publication?.remote?.trim() || "origin",
			branch: input.publication?.branch?.trim() || "",
			atomic_push_refspecs: ["HEAD", archiveRef],
			restore: {
				command: restoreCommand,
				worktree: `git worktree add --detach <tmp> ${archiveRef}`,
				show_build: `git show ${archiveRef}:${buildPath}`,
				sparse_paths: unique([buildPath, ...(task?.spec_paths ?? []), ...(task?.code_paths ?? [])]),
				note: "Restored history is reference material until promoted into active knowledge or roadmap truth.",
			},
		},
		archive_ledger: {
			kind: "task",
			id: taskId,
			build_path: buildPath,
			archive_ref: archiveRef,
			commit_sha: input.publication?.commit_sha?.trim() || "",
			digest: payloadDigest,
			restore_command: restoreCommand,
		},
		artifact_digests: artifactDigests,
		publisher_queue: publisherQueue,
		push_readiness: {
			checks_recorded: checksRun,
			validation_refs: validationRefs,
			approval_required: true,
			allowed_by_default: false,
			safe_to_push: safeToPush,
			blocked_reasons: safeToPush ? [] : [
				input.publication?.safe_to_push === true ? "publication safety prerequisites incomplete" : "explicit approval required",
				secretScan === "pass" ? "" : "secret scan required",
				remoteVisibility === "pass" ? "" : "remote visibility review required",
				privateEvidence === "pass" ? "" : "fail/block/private evidence policy required",
			].filter(Boolean),
			security: {
				secret_scan: secretScan,
				remote_visibility: remoteVisibility,
				private_evidence: privateEvidence,
				git_namespaces: "not_access_control",
			},
		},
	};
}

// ---------------------------------------------------------------------------
// Build writers
// ---------------------------------------------------------------------------

export async function writeDecisionBuild(
	project: WikiProject,
	input: CodewikiBuildToolInput,
) {
	if (!input.summary?.trim()) throw new Error("Decision build requires summary.");

	const diffTable = normalizeDiffTable(input.diff_table);
	const approvedRows = approvedDiffRows(diffTable, input.approved_diff_rows);
	const decisions = trimList(input.decisions).length
		? trimList(input.decisions)
		: approvedRows.map((row) => row.desired_state);
	const created = nowIso();
	const slug = buildSlug(input.slug || input.summary, "decision-build");
	const day = created.slice(0, 10);
	const absPath = buildBuildPath(project, "decision", slug, day);
	const lifecycle = buildLifecycle(input, created, 30);
	const mode = String(input.decision_mode || (lifecycle.state === "proposed" ? "proposal" : "accepted")).trim();
	if (!["proposal", "accepted"].includes(mode)) throw new Error("Decision build mode must be proposal or accepted.");
	if (mode === "proposal") lifecycle.state = "proposed";
	if (mode === "accepted" && lifecycle.state === "proposed") throw new Error("Accepted decision build cannot use proposed lifecycle state.");

	const knowledgeChanges = trimList(input.knowledge_changes);
	const roadmapChanges = trimList(input.roadmap_changes);
	const rowToKbMappings = normalizeDecisionKbMappings(input);
	const propagation = normalizeDecisionPropagation(input);
	const diagramRefs = unique([
		...trimList(input.diagram_refs),
		...rowToKbMappings.flatMap((mapping) => mapping.diagram_refs),
	]);
	const downstreamPlanningQuestions = unique([
		...trimList(input.downstream_planning_questions),
		...propagation.downstream_planning_questions,
	]);
	const producedKnowledge = unique([
		...knowledgeChanges,
		...trimList(input.produces?.knowledge),
		...rowToKbMappings.flatMap((mapping) => mapping.knowledge_refs),
	]);

	if (mode === "proposal") {
		if (approvedRows.length > 0 || knowledgeChanges.length > 0 || rowToKbMappings.length > 0) {
			throw new Error("Proposal decision build must not record approved rows or canonical KB changes.");
		}
	} else {
		if (approvedRows.length === 0) throw new Error("Accepted decision build requires at least one approved diff_table row.");
		if (!decisions.length) throw new Error("Decision build requires at least one accepted decision or approved diff_table row.");
		if (rowToKbMappings.length === 0) throw new Error("Accepted decision build requires row_to_kb_mappings.");
		const mappedRows = new Set(rowToKbMappings.map((mapping) => mapping.row_id));
		const missingRows = approvedRows.map((row) => row.id).filter((rowId) => !mappedRows.has(rowId));
		if (missingRows.length) throw new Error(`Accepted decision build missing row_to_kb_mappings for ${missingRows.join(", ")} .`.replace(" .", "."));
		if (!propagation.direction) throw new Error("Accepted decision build requires propagation.direction.");
		if (propagation.direction === "product-first" && !propagation.system_impact.length && !propagation.no_system_impact) {
			throw new Error("Product-first decision build requires system_impact or no_system_impact evidence.");
		}
		if (propagation.direction === "system-first" && !propagation.product_impact.length && !propagation.no_product_impact) {
			throw new Error("System-first decision build requires product_impact or no_product_impact evidence.");
		}
	}

	const consumes = trimRefGroups(input.consumes);
	const produces = mergeProduces({
		knowledge: producedKnowledge,
		roadmap: roadmapChanges,
	}, input.produces);
	const traceability = buildTraceability("decision", input, consumes, produces);
	const data = {
		version: 1,
		schema_version: input.schema_version ?? 2,
		kind: "decision_build",
		created,
		source: input.source?.trim() || "codewiki_build tool",
		status: lifecycle.state,
		lifecycle,
		...buildCycleFields(input, "decision", "decision"),
		summary: input.summary.trim(),
		decision_mode: mode,
		diff_table: diffTable,
		approved_diff_rows: approvedRows.map((row) => row.id),
		approved_rows: approvedRows,
		accepted_decisions: decisions.map((summary, index) => ({ id: `D${index + 1}`, summary })),
		knowledge_changes: knowledgeChanges,
		roadmap_changes: roadmapChanges,
		row_to_kb_mappings: rowToKbMappings,
		propagation,
		diagram_refs: diagramRefs,
		downstream_planning_questions: downstreamPlanningQuestions,
		assumptions: trimList(input.assumptions),
		open_questions: trimList(input.open_questions),
		non_goals: trimList(input.non_goals),
		risks: trimList(input.risks),
		change_type: traceability.change_type,
		traceability,
		consumes,
		produces,
	};
	await mkdir(dirname(absPath), { recursive: true });
	await writeFile(absPath, JSON.stringify(data, null, 2) + "\n", "utf8");
	const relPath = `.codewiki/builds/decision/${day}-${slug}.json`;
	return { path: relPath, data };
}

export async function writePlanningBuild(
	project: WikiProject,
	input: CodewikiBuildToolInput,
) {
	if (!input.summary?.trim()) throw new Error("Planning build requires summary.");
	if (!input.source_decision_build?.trim()) throw new Error("Planning build requires source_decision_build.");

	const created = nowIso();
	const slug = buildSlug(input.slug || input.summary, "planning-build");
	const day = created.slice(0, 10);
	const absPath = buildBuildPath(project, "planning", slug, day);
	const lifecycle = buildLifecycle(input, created, 14);
	const sourceDecisionBuild = input.source_decision_build.trim();
	const taskIds = trimList(input.task_ids);
	const taskChanges = trimList(input.task_changes).length ? trimList(input.task_changes) : trimList(input.roadmap_changes);
	const tddPlan = trimList(input.tdd_plan);
	const candidateTestFiles = trimList(input.candidate_test_files);
	const candidateCodePaths = trimList(input.candidate_code_paths);
	const consumes = trimRefGroups({
		...input.consumes,
		decision: unique([sourceDecisionBuild, ...(input.consumes?.decision ?? [])]),
		roadmap: unique([...taskIds, ...(input.consumes?.roadmap ?? [])]),
	});
	const produces = mergeProduces({
		roadmap: taskIds,
		tests: candidateTestFiles,
		code: candidateCodePaths,
	}, input.produces);
	const traceability = buildTraceability("planning", input, consumes, produces);
	const data = {
		version: 1,
		schema_version: input.schema_version ?? 2,
		kind: "planning_build",
		created,
		source: input.source?.trim() || "codewiki_build tool",
		source_decision_build: sourceDecisionBuild,
		status: lifecycle.state,
		lifecycle,
		...buildCycleFields(input, "planning", "planning"),
		summary: input.summary.trim(),
		task_ids: taskIds,
		task_changes: taskChanges,
		roadmap_changes: taskChanges,
		tdd_plan: tddPlan,
		candidate_test_files: candidateTestFiles,
		candidate_code_paths: candidateCodePaths,
		acceptance_mapping: normalizeEvidenceMapping(input).length ? normalizeEvidenceMapping(input) : (input.acceptance_mapping ?? []).filter((m) => m.criterion.trim() && m.evidence.trim()),
		assumptions: trimList(input.assumptions),
		open_questions: trimList(input.open_questions),
		non_goals: trimList(input.non_goals),
		risks: trimList(input.risks),
		change_type: traceability.change_type,
		traceability,
		consumes,
		produces,
	};
	await mkdir(dirname(absPath), { recursive: true });
	await writeFile(absPath, JSON.stringify(data, null, 2) + "\n", "utf8");
	const relPath = `.codewiki/builds/planning/${day}-${slug}.json`;
	return { path: relPath, data };
}

export async function writeImplementationBuild(
	project: WikiProject,
	input: CodewikiBuildToolInput,
) {
	if (!input.summary?.trim()) throw new Error("Implementation build requires summary.");
	if (!input.task_id?.trim()) throw new Error("Implementation build requires task_id.");

	const taskId = input.task_id.trim();
	const task = await readRoadmapTask(project, taskId);
	const created = nowIso();
	const slug = buildSlug(input.slug || input.summary, "implementation-build");
	const day = created.slice(0, 10);
	const absPath = buildBuildPath(project, "implementation", slug, day);
	const relPath = `.codewiki/builds/implementation/${day}-${slug}.json`;
	const lifecycle = buildLifecycle(input, created, 7);
	const testFiles = trimList(input.test_files);
	const codeFiles = trimList(input.code_files);
	const checksRun = trimList(input.checks_run);
	const testDesignEvidence = trimList(input.test_design_evidence);
	const codeChangeEvidence = trimList(input.code_change_evidence);
	const testerNotes = trimList(input.tester_notes);
	const builderNotes = trimList(input.builder_notes);
	const validationRefs = trimList(input.validation_refs);
	const risks = trimList(input.risks);
	const openQuestions = trimList(input.open_questions);
	const nextFocus = await nextFocusTaskId(project, taskId);
	const sourcePlanningBuild = (input.source_planning_build ?? "").trim();
	const acceptanceMapping = (input.acceptance_mapping ?? []).filter((m) => m.criterion.trim() && m.evidence.trim());
	const acceptanceEvidence = acceptanceMapping.map((mapping) => `${mapping.criterion}: ${mapping.evidence}`);
	const closureBrief = normalizeClosureBrief(input.closure_brief, task, checksRun, acceptanceEvidence, validationRefs, risks);
	if (lifecycle.state === "accepted" && !closureBrief) {
		throw new Error("Accepted implementation build requires closure_brief.");
	}
	if (closureBrief && (!closureBrief.user_intent || closureBrief.implemented_changes.length === 0 || closureBrief.acceptance_evidence.length === 0 || closureBrief.checks.length === 0)) {
		throw new Error("closure_brief requires user_intent, implemented_changes, acceptance_evidence, and checks.");
	}
	const compactContext = {
		source: "implementation_build",
		task_id: taskId,
		title: task?.title ?? taskId,
		summary: input.summary.trim(),
		spec_paths: task?.spec_paths ?? [],
		code_paths: unique([...(task?.code_paths ?? []), ...codeFiles]),
		acceptance: task?.goal?.acceptance ?? [],
		verification: task?.goal?.verification ?? [],
		source_planning_build: sourcePlanningBuild || "",
		checks_run: checksRun,
		test_design_evidence: testDesignEvidence,
		code_change_evidence: codeChangeEvidence,
		validation_refs: validationRefs,
	};
	const roleEvidence = {
		tester: {
			role: "tester",
			source_planning_build: sourcePlanningBuild || "",
			roadmap_task_id: taskId,
			test_files: testFiles,
			evidence: testDesignEvidence,
			notes: testerNotes,
			boundary: "derive tests or test-design evidence before code changes where practical",
		},
		builder: {
			role: "builder",
			source_planning_build: sourcePlanningBuild || "",
			roadmap_task_id: taskId,
			code_files: codeFiles,
			evidence: codeChangeEvidence,
			notes: builderNotes,
			boundary: "change code until tests, roadmap acceptance, and required checks pass",
		},
	};
	const consumes = trimRefGroups({
		...input.consumes,
		planning: unique([...(sourcePlanningBuild ? [sourcePlanningBuild] : []), ...(input.consumes?.planning ?? [])]),
		roadmap: unique([taskId, ...(input.consumes?.roadmap ?? [])]),
	});
	const produces = mergeProduces({
		code: codeFiles,
		tests: testFiles,
		validation: validationRefs,
		closure: [taskId],
	}, input.produces);
	const traceability = buildTraceability("implementation", input, consumes, produces);
	const artifactDigests = buildArtifactDigests(project, [
		...(sourcePlanningBuild ? [{ path: sourcePlanningBuild, role: "source_planning_build" }] : []),
		...validationRefs.map((path) => ({ path, role: "validation_ref" })),
		...testFiles.map((path) => ({ path, role: "test_file" })),
		...codeFiles.map((path) => ({ path, role: "code_file" })),
	]);
	const payloadDigest = sha256Text(JSON.stringify({
		task_id: taskId,
		summary: input.summary.trim(),
		checks_run: checksRun,
		validation_refs: validationRefs,
		files_changed: unique([...testFiles, ...codeFiles]),
		closure_brief: closureBrief,
		artifact_digests: artifactDigests,
	}));
	const publication = publicationDefaults(input, task, checksRun, validationRefs, relPath, artifactDigests, payloadDigest);
	const data = {
		version: 1,
		schema_version: input.schema_version ?? 2,
		kind: "implementation_build",
		created,
		source: input.source?.trim() || "codewiki_build tool",
		source_planning_build: sourcePlanningBuild || undefined,
		task_id: taskId,
		task: taskSnapshot(task),
		status: lifecycle.state,
		lifecycle,
		...buildCycleFields(input, "implementation", "implementation"),
		summary: input.summary.trim(),
		change_type: traceability.change_type,
		traceability,
		consumes,
		produces,
		linked_refs: {
			planning_build: sourcePlanningBuild || "",
			spec_paths: task?.spec_paths ?? [],
			code_paths: task?.code_paths ?? [],
		},
		test_files: testFiles,
		code_files: codeFiles,
		files_changed: unique([...testFiles, ...codeFiles]),
		checks_run: checksRun,
		role_evidence: roleEvidence,
		test_design_evidence: testDesignEvidence,
		code_change_evidence: codeChangeEvidence,
		acceptance_mapping: acceptanceMapping,
		validation_refs: validationRefs,
		closure_brief: closureBrief || undefined,
		risks,
		unresolved_issues: openQuestions,
		open_questions: openQuestions,
		handoff: {
			resume: {
				source: "implementation_build",
				command: `/wiki-resume ${taskId}`,
				task_id: taskId,
				next_focus_task_id: nextFocus,
				context: compactContext,
			},
			restore: publication.git.restore,
			fallback: "Use codewiki_state refresh=true and this implementation_build; do not rely on chat transcript memory.",
		},
		publication,
	};
	await mkdir(dirname(absPath), { recursive: true });
	await writeFile(absPath, JSON.stringify(data, null, 2) + "\n", "utf8");
	return { path: relPath, data };
}

export async function writeBuild(
	project: WikiProject,
	input: CodewikiBuildToolInput,
) {
	switch (input.kind) {
		case "decision":
			return writeDecisionBuild(project, input);
		case "planning":
			return writePlanningBuild(project, input);
		case "implementation":
			return writeImplementationBuild(project, input);
		default:
			throw new Error(`Unsupported build kind: ${(input as any).kind}`);
	}
}

// ---------------------------------------------------------------------------
// Validation report writer
// ---------------------------------------------------------------------------

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
	const riskApprovalGaps = input.verdict === "pass" ? preflight.missing.user_approval : [];
	const publicationReadinessGaps = input.verdict === "pass"
		? preflight.missing.close_publication_blockers.filter((gap) => gap === "publication_safe_to_push")
		: [];
	const policyGaps = unique([
		...isolationGaps,
		...publisherResultGaps.map((gap) => `publisher_result:${gap}`),
		...commitReadinessGaps,
		...traceabilityPolicy.gaps,
		...auditGaps.map((profileName) => `audit:${profileName}`),
		...riskApprovalGaps.map((gap) => `risk_approval:${gap}`),
		...publicationReadinessGaps.map((gap) => `publication_readiness:${gap}`),
	]);
	const policyBlocked = policyGaps.length > 0;
	const verdict = policyBlocked ? "block" : input.verdict;
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
		issues: [...inputIssues, ...isolationIssue, ...publisherResultIssue, ...commitReadinessIssue, ...traceabilityIssue, ...auditIssue, ...riskApprovalIssue, ...publicationReadinessIssue],
		source: (input.source ?? "").trim() || undefined,
		policy_profile: policyProfile,
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
