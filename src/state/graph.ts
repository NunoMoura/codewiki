import { assessDecisionPropagation } from "../build/decision-propagation.ts";
import { isAcceptedBuildData } from "../build/lifecycle.ts";
import {
	normalizeChangeType,
	normalizeTraceabilityExemption,
} from "../change/traceability.ts";
import type { WikiProject } from "../project/types.ts";
import type { RoadmapTaskRecord } from "../roadmap/types.ts";
import type { ChangeClaimsFile } from "../session/types.ts";
import type { GraphEdge, GraphFile, GraphNode, GraphViews } from "./types.ts";
import type { LintReport } from "../validation/types.ts";
import type { GitCache } from "../project/local/git-cache.ts";
import type { ParsedDoc } from "../knowledge/doc-parser.ts";
import {
	buildFileStructureDriftReport,
	compactFileStructureDriftReport,
	parseSystemDiagrams,
	resolveDiagramRef,
} from "../knowledge/diagram-parser.ts";
import { buildChangeClaimState, claimScopeLabels } from "../session/claims.ts";
import { unique } from "../shared/utils.ts";

export interface GraphBuildInputs {
	project: WikiProject;
	docs: ParsedDoc[];
	research: any[];
	roadmapEntries: RoadmapTaskRecord[];
	roadmapSprints?: any[];
	archivedTaskIds?: string[];
	gitCache: GitCache;
	builds: {
		path: string;
		kind: string;
		taskId?: string;
		status?: string;
		data: any;
	}[];
	validations: {
		path: string;
		taskId?: string;
		verdict?: string;
		data?: any;
	}[];
	testFiles: string[];
	claims: ChangeClaimsFile;
	lintReport?: LintReport;
}

function nowIso(): string {
	return new Date().toISOString();
}

function isActiveTaskStatus(status: string): boolean {
	return ["in_progress", "blocked"].includes(status);
}

function isOpenTaskStatus(status: string): boolean {
	return ["todo", "in_progress", "blocked"].includes(status);
}

type ReconciliationLoop =
	| "decision"
	| "planning"
	| "implementation"
	| "validation"
	| "observe";
type BuildArtifact = GraphBuildInputs["builds"][number];
type ValidationArtifact = GraphBuildInputs["validations"][number];

function reconciliationPriority(loop: ReconciliationLoop): number {
	return {
		decision: 0,
		planning: 1,
		implementation: 2,
		validation: 3,
		observe: 4,
	}[loop];
}

function normalizeReconciliationLoop(
	value: unknown,
): ReconciliationLoop | undefined {
	const loop = String(value || "")
		.trim()
		.toLowerCase()
		.replace(/_/g, "-");
	return [
		"decision",
		"planning",
		"implementation",
		"validation",
		"observe",
	].includes(loop)
		? (loop as ReconciliationLoop)
		: undefined;
}

function layerForReconciliationLoop(loop: ReconciliationLoop): string {
	return loop === "planning"
		? "roadmap"
		: loop === "implementation"
			? "code"
			: loop === "validation"
				? "validation"
				: loop === "observe"
					? "runtime"
					: "decision";
}

function validationRouting(data: any): {
	failure_class?: string;
	recommended_next_loop?: ReconciliationLoop;
	stop_reason?: string;
} {
	const routing = data?.routing || {};
	return {
		failure_class:
			String(data?.failure_class || routing?.failure_class || "").trim() ||
			undefined,
		recommended_next_loop: normalizeReconciliationLoop(
			data?.recommended_next_loop || routing?.recommended_next_loop,
		),
		stop_reason:
			String(data?.stop_reason || routing?.stop_reason || "").trim() ||
			undefined,
	};
}

function loopIsolationRequirement(loop: ReconciliationLoop) {
	if (loop === "observe") {
		return {
			required: false,
			mode: "none",
			reason: "No compiler or gateway handoff is active.",
			evidence: [],
			handoff: "observe",
		};
	}
	if (loop === "validation") {
		return {
			required: true,
			mode: "fresh-context-checked-content",
			reason:
				"Gateway validation must not reuse builder thought context and must cite checked content proof.",
			evidence: [
				"fresh_context=true",
				"clean state recorded",
				"validated_sha/head_sha/published_sha/tree_sha or working_tree_digest",
				"task-close/publication profiles require clean publisher result proof",
			],
			handoff: "submitted build -> validation gateway",
			profiles: [
				"implementation",
				"task-close",
				"publication",
				"publish",
				"release",
			],
		};
	}
	return {
		required: false,
		mode: "agent-owned-new-session",
		reason:
			"Compiler loops start from CodeWiki source refs; agents may refresh context when chat is noisy, stale, or token-heavy.",
		evidence: [
			"source build/task refs read",
			"new_session or context_refresh when useful",
		],
		handoff: `${loop}_loop context boundary`,
	};
}

function configuredGeneratedPaths(project: WikiProject): string[] {
	return [
		...stringList(project.config?.generated_files),
		...stringList(project.config?.codewiki?.gateway?.generated_readonly_paths),
	];
}

function normalizeScopePath(value: string): string {
	return value
		.replace(/\\/g, "/")
		.replace(/^\.\//, "")
		.replace(/^\.codewiki\//, "codewiki/");
}

function pathMatchesScope(path: string, scope: string): boolean {
	const normalizedPath = normalizeScopePath(path);
	const normalizedScope = normalizeScopePath(scope);
	if (!normalizedPath || !normalizedScope) return false;
	if (normalizedScope.endsWith("/**")) {
		const prefix = normalizedScope.slice(0, -3);
		return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
	}
	return normalizedPath === normalizedScope;
}

function isGeneratedPath(project: WikiProject, path: string): boolean {
	return configuredGeneratedPaths(project).some((scope) =>
		pathMatchesScope(path, scope),
	);
}

function isCodewikiDataPath(path: string): boolean {
	return normalizeScopePath(path).startsWith("codewiki/");
}

function isPathDirty(dirtyPaths: string[], codePath: string): boolean {
	return dirtyPaths.some(
		(dirtyPath) =>
			dirtyPath === codePath ||
			dirtyPath.startsWith(`${codePath}/`) ||
			codePath.startsWith(`${dirtyPath}/`),
	);
}

function pathsOverlap(left: string, right: string): boolean {
	const a = normalizeScopePath(left);
	const b = normalizeScopePath(right);
	return (
		a === b ||
		a.startsWith(`${b}/`) ||
		b.startsWith(`${a}/`) ||
		pathMatchesScope(a, b) ||
		pathMatchesScope(b, a)
	);
}

function isAcceptedBuild(build: BuildArtifact): boolean {
	return isAcceptedBuildData(build.data, build.status);
}

function isSemanticTraceability(
	build: BuildArtifact,
	fallbackChangeType: string,
): boolean {
	const exemption = normalizeTraceabilityExemption(
		build.data?.traceability?.exemption ??
			build.data?.traceability?.change_class ??
			build.data?.change_class,
	);
	if (typeof build.data?.traceability?.semantic === "boolean")
		return build.data.traceability.semantic;
	return (
		Boolean(
			normalizeChangeType(
				build.data?.traceability?.change_type ??
					build.data?.change_type ??
					build.data?.traceability?.change_class ??
					build.data?.change_class,
				fallbackChangeType,
			),
		) && !exemption
	);
}

function classifySemanticPath(
	project: WikiProject,
	path: string,
): string | null {
	const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
	if (!normalized || isGeneratedPath(project, normalized)) return null;
	if (
		normalized === ".codewiki/index_graph.json" ||
		normalized.startsWith(".codewiki/roadmap/tasks/")
	)
		return null;
	if (
		normalized.startsWith(".codewiki/session/") ||
		normalized.startsWith(".codewiki/runtime/")
	)
		return null;
	if (
		normalized.startsWith(".codewiki/builds/") ||
		normalized.startsWith(".codewiki/validation/")
	)
		return null;
	if (normalized.startsWith(".codewiki/kb/product/")) return "product";
	if (
		normalized.startsWith(".codewiki/kb/system/") ||
		normalized === ".codewiki/kb/lexicon.md"
	)
		return "system";
	if (normalized === ".codewiki/roadmap/queue.json") return "task";
	if (normalized === "package.json" || normalized === "package-lock.json")
		return "system";
	if (
		normalized.startsWith("skills/codewiki/") ||
		normalized.startsWith("src/audit/") ||
		normalized.startsWith("scripts/check-architecture")
	)
		return "system";
	if (
		normalized.startsWith("tests/") ||
		normalized.startsWith("src/") ||
		normalized.startsWith("scripts/")
	)
		return "code";
	if (normalized === "README.md" || normalized.startsWith("docs/"))
		return "system";
	return null;
}

function refsFromBuild(build: BuildArtifact): string[] {
	const data = build.data || {};
	return unique([
		...stringList(data?.produces?.knowledge),
		...stringList(data?.produces?.roadmap),
		...stringList(data?.produces?.code),
		...stringList(data?.produces?.tests),
		...stringList(data?.produces?.publication),
		...stringList(data?.produces?.closure),
		...stringList(data?.knowledge_changes),
		...stringList(data?.roadmap_changes),
		...stringList(data?.task_ids),
		...stringList(data?.code_files),
		...stringList(data?.test_files),
		...stringList(data?.candidate_code_paths),
		...stringList(data?.candidate_test_files),
		...stringList(data?.consumes?.roadmap),
	]).filter(Boolean);
}

function buildCoversSemanticPath(
	build: BuildArtifact,
	path: string,
	changeType: string,
): boolean {
	if (!isAcceptedBuild(build)) return false;
	if (!isSemanticTraceability(build, changeType)) return false;
	const refs = refsFromBuild(build);
	if (refs.some((ref) => pathsOverlap(ref, path))) return true;
	if (
		path === ".codewiki/roadmap/queue.json" &&
		refs.some((ref) => /^TASK-\d+/.test(ref))
	)
		return true;
	return false;
}

function isActionableLintIssue(issue: any): boolean {
	return String(issue?.kind || "") !== "large-doc";
}

function buildReconciliationAction(items: any[]) {
	const active = items
		.filter((item) => String(item.state || "") !== "aligned")
		.sort((a, b) => {
			const p =
				reconciliationPriority(a.next_loop || "observe") -
				reconciliationPriority(b.next_loop || "observe");
			if (p !== 0) return p;
			return String(a.id || "").localeCompare(String(b.id || ""));
		});
	const first = active[0];
	if (!first) {
		const isolation = loopIsolationRequirement("observe");
		return {
			loop: "observe" as ReconciliationLoop,
			command: "Observe — graph aligned",
			reason: "No reconciliation item currently requires a compiler loop.",
			isolation_required: isolation.required,
			isolation,
			context_boundary: "none",
			handoff_refs: [],
		};
	}
	const commands: Record<ReconciliationLoop, string> = {
		decision: "Run decision compiler",
		planning: "Run planning compiler",
		implementation: first.task_id
			? `/wiki-resume ${first.task_id}`
			: "/wiki-resume",
		validation: "Run validation gateway",
		observe: "Observe — graph aligned",
	};
	const loop = first.next_loop as ReconciliationLoop;
	const isolation = loopIsolationRequirement(loop);
	const handoffRefs = unique(
		[
			String(first.source_id || ""),
			String(first.task_id || ""),
			...(Array.isArray(first.doc_paths) ? first.doc_paths.map(String) : []),
		]
			.map((ref) => ref.trim())
			.filter(Boolean),
	);
	return {
		loop,
		command: commands[loop] || "Observe — graph aligned",
		reason: first.reason,
		item_id: first.id,
		isolation_required: isolation.required,
		isolation,
		context_boundary: isolation.required ? isolation.mode : "none",
		handoff_refs: handoffRefs,
	};
}

function stringList(value: any): string[] {
	if (Array.isArray(value))
		return value.map((item) => String(item || "").trim()).filter(Boolean);
	const single = String(value || "").trim();
	return single ? [single] : [];
}

function normalizeCodewikiRef(value: any): string {
	const ref = String(value || "")
		.trim()
		.replace(/\\/g, "/");
	if (!ref) return "";
	if (ref.startsWith(".codewiki/")) return ref;
	if (ref.startsWith("codewiki/")) return `.${ref}`;
	if (ref.startsWith("builds/") || ref.startsWith("validation/"))
		return `.codewiki/${ref}`;
	return ref;
}

function buildRefs(
	data: any,
	key: "decision" | "planning" | "implementation",
): string[] {
	return [
		...stringList(data?.linked_builds?.[key]),
		...stringList(data?.consumes?.[key]),
	]
		.map(normalizeCodewikiRef)
		.filter(Boolean);
}

function consumedBuildRefs(data: any): string[] {
	return [
		...stringList(data?.source_decision_build),
		...stringList(data?.source_planning_build),
		...stringList(data?.consumes?.decision),
		...stringList(data?.consumes?.planning),
		...stringList(data?.consumes?.implementation),
	]
		.map(normalizeCodewikiRef)
		.filter(Boolean);
}

function producedRefs(
	data: any,
	key:
		| "knowledge"
		| "roadmap"
		| "code"
		| "tests"
		| "validation"
		| "publication"
		| "closure",
): string[] {
	return stringList(data?.produces?.[key])
		.map(normalizeCodewikiRef)
		.filter(Boolean);
}

function buildTaskIds(build: BuildArtifact): string[] {
	const data = build.data || {};
	return Array.from(
		new Set(
			[
				...stringList(build.taskId),
				...stringList(data.task_id),
				...stringList(data.taskId),
				...stringList(data.task?.id),
				...stringList(data.roadmap_work_items),
				...stringList(data.task_ids),
				...stringList(data.consumes?.roadmap),
				...stringList(data.produces?.roadmap),
			]
				.map((id) => id.trim())
				.filter((id) => /^TASK-/.test(id)),
		),
	);
}

function firstTaskId(build: BuildArtifact): string | undefined {
	return buildTaskIds(build)[0];
}

function hasRoadmapChanges(build: BuildArtifact): boolean {
	return (
		stringList(build.data?.roadmap_changes).length > 0 ||
		producedRefs(build.data, "roadmap").length > 0
	);
}

function isLifecycleComplete(state: string): boolean {
	return ["consumed", "validated", "archived", "purged"].includes(state);
}

function buildArchiveLedger(build: BuildArtifact) {
	const publication = build.data?.publication || {};
	const ledger = publication.archive_ledger || {};
	const git = publication.git || {};
	const taskId =
		firstTaskId(build) || String(build.data?.task_id || ledger.id || "").trim();
	const archiveRef = String(ledger.archive_ref || git.archive_ref || "").trim();
	if (!taskId || !archiveRef) return null;
	return {
		kind: String(ledger.kind || "task"),
		id: String(ledger.id || taskId),
		build_path: normalizeCodewikiRef(ledger.build_path || build.path),
		archive_ref: archiveRef,
		commit_sha: String(ledger.commit_sha || git.commit_sha || "").trim(),
		digest: String(ledger.digest || "").trim(),
		restore_command: String(
			ledger.restore_command ||
				git.restore?.command ||
				`/wiki-restore ${taskId}`,
		).trim(),
		safety_status:
			publication.push_readiness?.safe_to_push === true
				? "safe_to_push"
				: "blocked",
	};
}

function hasArtifactDigestCapture(build: BuildArtifact): boolean {
	return (
		Array.isArray(build.data?.publication?.artifact_digests?.files) &&
		build.data.publication.artifact_digests.files.length > 0
	);
}

function publicationSafetyPassed(build: BuildArtifact): boolean {
	return build.data?.publication?.push_readiness?.safe_to_push === true;
}

function evidenceRefsFromItems(
	value: any,
	keys: string[] = [
		"ref",
		"path",
		"id",
		"digest",
		"sha",
		"commit_sha",
		"tree_sha",
		"package_digest",
		"archive_ref",
		"remote_ref",
	],
): string[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		if (typeof item === "string") return [item];
		if (!item || typeof item !== "object") return [];
		return keys
			.map((key) => item[key])
			.filter(Boolean)
			.map(String);
	});
}

function normalizeEvidenceRef(value: any): string {
	return String(value || "")
		.trim()
		.replace(/\\/g, "/");
}

function auditEvidenceRefs(data: any): string[] {
	return unique([
		...stringList(data?.audit_refs),
		...stringList(data?.audit_reports),
		...stringList(data?.policy?.audit_refs),
		...stringList(data?.policy?.required_audits).map(
			(profile) => `profile:${profile}`,
		),
		...evidenceRefsFromItems(data?.audits),
		...evidenceRefsFromItems(data?.audit_results),
		...evidenceRefsFromItems(data?.policy?.audits),
		...evidenceRefsFromItems(data?.policy?.audit_results),
	])
		.map(normalizeEvidenceRef)
		.filter(Boolean);
}

function contentProofRefs(data: any): string[] {
	const publication = data?.publication || {};
	const git = publication.git || {};
	const ledger = publication.archive_ledger || {};
	const pushReadiness = publication.push_readiness || {};
	const isolation = data?.isolation || {};
	const artifactFiles = Array.isArray(publication.artifact_digests?.files)
		? publication.artifact_digests.files
		: [];
	const artifactRefs = artifactFiles.flatMap((file: any) => {
		const filePath = String(file?.path || "").trim();
		const digest = String(
			file?.digest || file?.sha256 || file?.hash || "",
		).trim();
		if (filePath && digest) return [`${filePath}@${digest}`];
		return [digest, filePath].filter(Boolean);
	});
	return unique([
		...stringList(data?.content_proof_refs),
		...evidenceRefsFromItems(data?.content_proofs),
		...artifactRefs,
		publication.commit_sha,
		publication.tree_sha,
		publication.package_digest,
		publication.archive_ref,
		publication.digest,
		publication.remote_ref,
		publication.published_sha,
		git.commit_sha,
		git.tree_sha,
		git.archive_ref,
		git.remote_ref,
		git.published_sha,
		ledger.commit_sha,
		ledger.digest,
		ledger.archive_ref,
		pushReadiness.commit_sha,
		pushReadiness.published_sha,
		pushReadiness.remote_ref,
		isolation.validated_sha,
		isolation.head_sha,
		isolation.published_sha,
		isolation.tree_sha,
		isolation.working_tree_digest,
		isolation.worktree_digest,
		isolation.package_digest,
		isolation.archive_ref,
		isolation.remote_ref,
	])
		.map(normalizeEvidenceRef)
		.filter(Boolean);
}

function contentProofKind(ref: string): string {
	if (/^[a-f0-9]{7,40}$/i.test(ref)) return "git_sha";
	if (ref.startsWith("sha256:") || ref.includes("@sha256:")) return "digest";
	if (ref.startsWith("refs/")) return "git_ref";
	if (ref.includes("package") || ref.endsWith(".tgz")) return "package";
	return "content_proof";
}

function publicationClaimRefs(build: BuildArtifact): string[] {
	const publication = build.data?.publication || {};
	return unique(
		[
			...producedRefs(build.data, "publication"),
			...stringList(build.data?.publication_refs),
			publication.safe_to_push === true ? "safe_to_push" : "",
			publication.push_readiness?.safe_to_push === true
				? "push_readiness.safe_to_push"
				: "",
			publication.published_sha ? "published_sha" : "",
		]
			.map(normalizeEvidenceRef)
			.filter(Boolean),
	);
}

function canonicalSourceRefsForBuild(build: BuildArtifact): string[] {
	return unique(
		[
			normalizeCodewikiRef(build.path),
			...consumedBuildRefs(build.data),
			...stringList(build.data?.consumes?.source).map(normalizeCodewikiRef),
			...stringList(build.data?.source).map(normalizeCodewikiRef),
			...producedRefs(build.data, "knowledge"),
			...producedRefs(build.data, "roadmap"),
			...producedRefs(build.data, "code"),
			...producedRefs(build.data, "tests"),
			...stringList(build.data?.code_files).map(normalizeCodewikiRef),
			...stringList(build.data?.test_files).map(normalizeCodewikiRef),
			...buildTaskIds(build),
		]
			.map(normalizeEvidenceRef)
			.filter(Boolean),
	);
}

function canCompactColdBuild(
	build: BuildArtifact,
	lifecycleState: string,
	validated: boolean,
): boolean {
	return (
		build.kind === "implementation_build" &&
		Boolean(buildArchiveLedger(build)) &&
		(validated || isLifecycleComplete(lifecycleState))
	);
}

function isPurgeableByGitArchive(
	build: BuildArtifact,
	lifecycleState: string,
	validated: boolean,
): boolean {
	return (
		canCompactColdBuild(build, lifecycleState, validated) &&
		hasArtifactDigestCapture(build) &&
		publicationSafetyPassed(build)
	);
}

function validationIsolationSummary(validation: {
	path: string;
	taskId?: string;
	verdict?: string;
	data?: any;
}) {
	const isolation = validation.data?.isolation || null;
	const proofRefs = contentProofRefs(validation.data);
	const profile = String(validation.data?.profile || "")
		.trim()
		.toLowerCase();
	const immutableProfile = [
		"task-close",
		"publication",
		"publish",
		"release",
	].includes(profile);
	const hasImmutableProof = Boolean(
		isolation?.validated_sha ||
			isolation?.head_sha ||
			isolation?.published_sha ||
			isolation?.tree_sha ||
			isolation?.package_digest ||
			isolation?.archive_ref ||
			isolation?.remote_ref,
	);
	const hasPublisherProof = Boolean(
		isolation?.published_sha ||
			isolation?.tree_sha ||
			isolation?.archive_ref ||
			isolation?.remote_ref,
	);
	const hasWorkingTreeProof = Boolean(
		isolation?.working_tree_digest || isolation?.worktree_digest,
	);
	const isolated = immutableProfile
		? isolation?.fresh_context === true &&
			isolation?.clean === true &&
			hasPublisherProof
		: isolation?.fresh_context === true &&
			typeof isolation?.clean === "boolean" &&
			(hasImmutableProof || hasWorkingTreeProof || proofRefs.length > 0);
	const status = isolation ? (isolated ? "isolated" : "partial") : "legacy";
	return {
		path: validation.path,
		task_id: validation.taskId,
		verdict: validation.verdict,
		status,
		role: isolation?.role,
		worktree_path: isolation?.worktree_path,
		branch: isolation?.branch,
		base_sha: isolation?.base_sha,
		head_sha: isolation?.head_sha,
		validated_sha: isolation?.validated_sha,
		published_sha: isolation?.published_sha,
		clean: isolation?.clean,
		fresh_context: isolation?.fresh_context,
		builder_session_id: isolation?.builder_session_id,
		builder_claim_id: isolation?.builder_claim_id,
		related_claim_ids: isolation?.related_claim_ids || [],
		content_proof_refs: proofRefs,
		publisher_result_refs: [
			isolation?.published_sha,
			isolation?.tree_sha,
			isolation?.archive_ref,
			isolation?.remote_ref,
		]
			.map((value) => String(value || "").trim())
			.filter(Boolean),
	};
}

type GraphLensFamilyId =
	| "decision"
	| "knowledge"
	| "work"
	| "execution"
	| "proof";

const DEFAULT_GRAPH_LENS_FAMILIES: Array<{
	id: GraphLensFamilyId;
	label: string;
	summary: string;
}> = [
	{
		id: "decision",
		label: "Decision",
		summary:
			"Approved intent, requirement rows, risk state, and semantic direction.",
	},
	{
		id: "knowledge",
		label: "Knowledge",
		summary:
			"Product/system docs, diagram refs, and source-backed knowledge context.",
	},
	{
		id: "work",
		label: "Work",
		summary: "Planning, roadmap, sprint, task, and coordination state.",
	},
	{
		id: "execution",
		label: "Execution",
		summary:
			"Code, tests, checks, implementation builds, and dirty working-set evidence.",
	},
	{
		id: "proof",
		label: "Proof",
		summary:
			"Validation, audit evidence, commits, publication, archive, and content proof.",
	},
];

function graphLensFamilyForNode(node: any): GraphLensFamilyId | null {
	const kind = String(node?.kind || "").trim();
	const layer = String(node?.layer || "").trim();
	const id = String(node?.id || "").trim();
	const path = String(node?.path || "").trim();
	if (
		kind === "decision_build" ||
		kind === "research_collection" ||
		kind === "research_entry" ||
		layer === "intent"
	)
		return "decision";
	if (
		kind === "doc" ||
		kind === "system_diagram" ||
		kind === "system_diagram_ref" ||
		kind === "missing_system_diagram_ref" ||
		layer === "knowledge"
	)
		return "knowledge";
	if (
		kind === "roadmap_task" ||
		kind === "roadmap_sprint" ||
		kind === "planning_build" ||
		kind === "change_claim" ||
		kind === "change_claim_waiter" ||
		kind === "change_claim_scope" ||
		layer === "roadmap"
	)
		return "work";
	if (
		kind === "code_path" ||
		kind === "test_file" ||
		kind === "implementation_build" ||
		layer === "code" ||
		id.startsWith("code:") ||
		id.startsWith("test:") ||
		path.startsWith("src/") ||
		path.startsWith("tests/")
	)
		return "execution";
	if (
		kind === "validation_report" ||
		kind === "content_proof" ||
		kind === "audit_evidence" ||
		kind === "canonical_source_ref" ||
		kind === "git_archive_ref" ||
		kind === "lint_issue" ||
		layer === "validation" ||
		layer === "content_proof" ||
		layer === "audit" ||
		layer === "archive"
	)
		return "proof";
	if (kind.endsWith("_build")) return "execution";
	return null;
}

function graphLensFamilyForReconciliation(item: any): GraphLensFamilyId {
	const loop = String(item?.next_loop || "").trim();
	const layers = [item?.from_layer, item?.to_layer].map((value) =>
		String(value || "").trim(),
	);
	if (
		loop === "decision" ||
		layers.some((layer) => ["intent", "decision"].includes(layer))
	)
		return "decision";
	if (layers.includes("knowledge")) return "knowledge";
	if (loop === "planning" || layers.includes("roadmap")) return "work";
	if (
		loop === "implementation" ||
		layers.some((layer) => ["code", "build"].includes(layer))
	)
		return "execution";
	return "proof";
}

function graphLensBadge(
	id: string,
	label: string,
	count: number,
	refs: string[] = [],
) {
	return {
		id,
		label,
		count,
		...(refs.length > 0
			? { refs: refs.slice(0, 6), ref_count: refs.length }
			: {}),
	};
}

function isBuildOrValidationNode(node: any): boolean {
	const kind = String(node?.kind || "").trim();
	return kind.endsWith("_build") || kind === "validation_report";
}

function extractNextActionSourceId(items: any[], action: any): string {
	const actionItemId = String(action?.item_id || "").trim();
	if (!actionItemId) return "";
	const item = items.find(
		(candidate) => String(candidate?.id || "").trim() === actionItemId,
	);
	return String(item?.source_id || "").trim();
}

function applyDefaultLensCompaction(
	nodes: any[],
	nextActionSourceId: string,
): void {
	for (const node of nodes) {
		const family = graphLensFamilyForNode(node);
		if (family) node.lens_family = family;
		if (!isBuildOrValidationNode(node)) continue;
		if (String(node.id || "") === nextActionSourceId) {
			node.default_next_action = true;
			continue;
		}
		node.default_hidden = true;
		node.default_collapsed = true;
		node.default_collapse_reason = "badge_in_default_lens";
	}
}

function buildGraphLensViews(input: {
	nodes: GraphNode[];
	edges: GraphEdge[];
	reconciliationItems: any[];
	reconciliationAction: any;
	roadmapEntries: RoadmapTaskRecord[];
	activeSprintIds: string[];
	builds: BuildArtifact[];
	validations: ValidationArtifact[];
	dirtyPaths: string[];
	docPaths: string[];
	specPaths: string[];
	diagramRefCount: number;
	diagramParseIssueCount: number;
	traceabilityRows: any[];
	semanticChangeRows: any[];
	validationAttestations: any[];
	validationIsolationRows: any[];
	canonicalSourceRefs: string[];
	auditEvidenceRefs: string[];
	contentProofRefs: string[];
	fileStructureDrift: ReturnType<typeof compactFileStructureDriftReport>;
	claimState: ReturnType<typeof buildChangeClaimState>;
	gc: any;
}) {
	const nextActionSourceId = extractNextActionSourceId(
		input.reconciliationItems,
		input.reconciliationAction,
	);
	const familyRefs: Record<GraphLensFamilyId, string[]> = {
		decision: [],
		knowledge: [],
		work: [],
		execution: [],
		proof: [],
	};
	const familyDrift: Record<
		GraphLensFamilyId,
		{ drift: number; blocked: number }
	> = {
		decision: { drift: 0, blocked: 0 },
		knowledge: { drift: 0, blocked: 0 },
		work: { drift: 0, blocked: 0 },
		execution: { drift: 0, blocked: 0 },
		proof: { drift: 0, blocked: 0 },
	};
	for (const node of input.nodes) {
		const family = graphLensFamilyForNode(node);
		if (!family) continue;
		const hiddenByDefault =
			node.default_hidden === true ||
			node.compacted === true ||
			(isBuildOrValidationNode(node) &&
				String(node.id || "") !== nextActionSourceId);
		if (!hiddenByDefault) familyRefs[family].push(String(node.id || ""));
		const state = String(node.alignment_state || node.state || "").trim();
		if (state === "blocked") familyDrift[family].blocked += 1;
		else if (state && state !== "aligned") familyDrift[family].drift += 1;
	}
	for (const item of input.reconciliationItems) {
		if (String(item?.state || "").trim() === "aligned") continue;
		const family = graphLensFamilyForReconciliation(item);
		if (String(item?.state || "").trim() === "blocked")
			familyDrift[family].blocked += 1;
		else familyDrift[family].drift += 1;
	}
	const buildPaths = input.builds
		.map((build) => normalizeCodewikiRef(build.path))
		.filter(Boolean);
	const validationPaths = input.validations
		.map((validation) => normalizeCodewikiRef(validation.path))
		.filter(Boolean);
	const buildCounts = {
		total: input.builds.length,
		decision: input.builds.filter((build) => build.kind === "decision_build")
			.length,
		planning: input.builds.filter((build) => build.kind === "planning_build")
			.length,
		implementation: input.builds.filter(
			(build) => build.kind === "implementation_build",
		).length,
		hot: input.gc?.classes?.hot?.build_paths?.length || 0,
		collapsed: buildPaths.filter(
			(path) => `build:${path}` !== nextActionSourceId,
		).length,
	};
	const validationCounts = {
		total: input.validations.length,
		pass: input.validations.filter(
			(validation) => String(validation.verdict || "") === "pass",
		).length,
		fail_or_block: input.validations.filter((validation) =>
			["fail", "block"].includes(String(validation.verdict || "")),
		).length,
		hot: input.gc?.classes?.hot?.validation_paths?.length || 0,
		collapsed: validationPaths.filter(
			(path) => `validation:${path}` !== nextActionSourceId,
		).length,
	};
	const openTasks = input.roadmapEntries.filter((task) =>
		isOpenTaskStatus(String(task.status || "todo")),
	);
	const doneTasks = input.roadmapEntries.filter(
		(task) => String(task.status || "") === "done",
	);
	const semanticGaps = input.semanticChangeRows.filter(
		(row) => Array.isArray(row.gaps) && row.gaps.length > 0,
	);
	const traceabilityGaps = input.traceabilityRows.filter(
		(row) => Array.isArray(row.gaps) && row.gaps.length > 0,
	);
	const fileStructureAuditSummary = {
		version: input.fileStructureDrift.version,
		source: input.fileStructureDrift.source,
		map_path: input.fileStructureDrift.map_path,
		available: input.fileStructureDrift.available,
		categories: input.fileStructureDrift.categories,
		counts: input.fileStructureDrift.counts,
		path_rule_counts: {
			intended: input.fileStructureDrift.intended_paths.length,
			current: input.fileStructureDrift.current_paths.length,
			target: input.fileStructureDrift.target_paths.length,
		},
		approved_delta_edges: input.fileStructureDrift.approved_delta_edges,
		approved_migration_delta_paths:
			input.fileStructureDrift.approved_migration_deltas.map(
				(entry: any) => entry.path,
			),
		actionable_entries: input.fileStructureDrift.actionable_entries,
		parse_issues: input.fileStructureDrift.parse_issues,
	};
	const badgesByFamily: Record<GraphLensFamilyId, any[]> = {
		decision: [
			graphLensBadge(
				"decision_builds",
				"decision builds",
				buildCounts.decision,
			),
			graphLensBadge("semantic_gaps", "semantic gaps", semanticGaps.length),
		],
		knowledge: [
			graphLensBadge("docs", "docs", input.docPaths.length),
			graphLensBadge("specs", "specs", input.specPaths.length),
			graphLensBadge("diagram_refs", "diagram refs", input.diagramRefCount),
			graphLensBadge(
				"diagram_parse_issues",
				"diagram parse issues",
				input.diagramParseIssueCount,
			),
			graphLensBadge(
				"file_structure_approved_deltas",
				"approved structure deltas",
				input.fileStructureDrift.counts.approved_migration_delta,
				input.fileStructureDrift.approved_migration_deltas.map(
					(entry: any) => entry.path,
				),
			),
			graphLensBadge(
				"file_structure_actionable_drift",
				"structure drift",
				input.fileStructureDrift.actionable_entries.length,
			),
		],
		work: [
			graphLensBadge(
				"open_tasks",
				"open tasks",
				openTasks.length,
				openTasks.map((task) => task.id),
			),
			graphLensBadge("done_tasks", "done tasks", doneTasks.length),
			graphLensBadge(
				"active_sprints",
				"active sprints",
				input.activeSprintIds.length,
				input.activeSprintIds,
			),
			graphLensBadge(
				"active_claims",
				"active claims",
				input.claimState.active_claim_count,
			),
		],
		execution: [
			graphLensBadge(
				"code_paths",
				"code paths",
				input.nodes.filter((node) => node.kind === "code_path").length,
			),
			graphLensBadge(
				"test_files",
				"test files",
				input.nodes.filter((node) => node.kind === "test_file").length,
			),
			graphLensBadge(
				"implementation_builds",
				"implementation builds",
				buildCounts.implementation,
			),
			graphLensBadge(
				"dirty_paths",
				"dirty paths",
				input.dirtyPaths.length,
				input.dirtyPaths,
			),
		],
		proof: [
			graphLensBadge(
				"validation_reports",
				"validation reports",
				validationCounts.total,
			),
			graphLensBadge(
				"fail_or_block_validation",
				"fail/block validation",
				validationCounts.fail_or_block,
			),
			graphLensBadge(
				"audit_refs",
				"audit refs",
				input.auditEvidenceRefs.length,
			),
			graphLensBadge(
				"content_proofs",
				"content proofs",
				input.contentProofRefs.length,
			),
			graphLensBadge(
				"traceability_gaps",
				"trace gaps",
				traceabilityGaps.length,
			),
		],
	};
	const families = DEFAULT_GRAPH_LENS_FAMILIES.map((family) => {
		const drift = familyDrift[family.id];
		const state =
			drift.blocked > 0 ? "blocked" : drift.drift > 0 ? "drift" : "aligned";
		const refs = unique(familyRefs[family.id]).slice(0, 10);
		return {
			id: family.id,
			label: family.label,
			summary: family.summary,
			state,
			item_count: familyRefs[family.id].length,
			badges: badgesByFamily[family.id],
			hot_refs: refs,
			collapsed: true,
		};
	});
	const defaultLens = {
		version: 1,
		source: "generated:graph-default-lens",
		model: "decision-knowledge-work-execution-proof",
		families,
		badges: {
			builds: buildCounts,
			validations: validationCounts,
		},
		next_action: {
			item_id: input.reconciliationAction?.item_id || null,
			source_id: nextActionSourceId || null,
			loop: input.reconciliationAction?.loop || "observe",
			reason: input.reconciliationAction?.reason || "",
		},
		expands_to: {
			trace: "views.lenses.trace",
			audit: "views.lenses.audit",
			archive: "views.archive",
		},
		invariant: "generated_state_not_canonical_truth",
	};
	return {
		default: defaultLens,
		trace: {
			version: 1,
			source: "generated:graph-trace-lens",
			exact_refs: true,
			requirement_rows: input.traceabilityRows,
			semantic_change_rows: input.semanticChangeRows,
			semantic_change_gaps: semanticGaps,
			canonical_source_refs: input.canonicalSourceRefs,
			build_refs: input.builds.map((build) => ({
				path: normalizeCodewikiRef(build.path),
				kind: build.kind,
				status:
					build.status ||
					build.data?.status ||
					build.data?.lifecycle?.state ||
					"unknown",
				task_ids: buildTaskIds(build),
				source_refs: canonicalSourceRefsForBuild(build),
			})),
		},
		audit: {
			version: 1,
			source: "generated:graph-audit-lens",
			exact_refs: true,
			validation_reports: input.validationAttestations,
			validation_isolation: input.validationIsolationRows,
			audit_evidence_refs: input.auditEvidenceRefs,
			content_proof_refs: input.contentProofRefs,
			reconciliation_items: input.reconciliationItems,
			traceability_gaps: traceabilityGaps,
			semantic_change_gaps: semanticGaps,
			file_structure_drift: fileStructureAuditSummary,
		},
	};
}

function indexPush(
	map: Map<string, BuildArtifact[]>,
	key: string,
	build: BuildArtifact,
) {
	const normalized = normalizeCodewikiRef(key);
	if (!normalized) return;
	if (!map.has(normalized)) map.set(normalized, []);
	const list = map.get(normalized)!;
	if (
		!list.some(
			(item) =>
				normalizeCodewikiRef(item.path) === normalizeCodewikiRef(build.path),
		)
	)
		list.push(build);
}

function uniqueBuildsByPath(builds: BuildArtifact[]): BuildArtifact[] {
	const seen = new Set<string>();
	const out: BuildArtifact[] = [];
	for (const build of builds) {
		const path = normalizeCodewikiRef(build.path);
		if (!path || seen.has(path)) continue;
		seen.add(path);
		out.push(build);
	}
	return out;
}

export function buildGraph(inputs: GraphBuildInputs): GraphFile {
	const {
		project,
		docs,
		research,
		roadmapEntries,
		roadmapSprints = [],
		archivedTaskIds = [],
		gitCache,
		builds,
		validations,
		testFiles,
		claims,
		lintReport,
	} = inputs;
	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];
	const seenNodes = new Set<string>();
	const seenEdges = new Set<string>();

	const addNode = (nodeId: string, payload: Partial<GraphNode>) => {
		if (!nodeId || seenNodes.has(nodeId)) return;
		seenNodes.add(nodeId);
		nodes.push({ id: nodeId, kind: payload.kind || "unknown", ...payload });
	};

	const addEdge = (
		kind: string,
		source: string,
		target: string,
		payload: Partial<GraphEdge> = {},
	) => {
		if (!source || !target) return;
		const key = `${kind}:${source}->${target}`;
		if (seenEdges.has(key)) return;
		seenEdges.add(key);
		edges.push({ kind, from: source, to: target, ...payload });
	};
	const addCanonicalSourceRef = (
		ownerId: string,
		ref: string,
		edgeKind: string,
	) => {
		const normalized = normalizeEvidenceRef(ref);
		if (!normalized) return;
		canonicalSourceRefs.add(normalized);
		const nodeId = `source:${normalized}`;
		addNode(nodeId, {
			kind: "canonical_source_ref",
			path: normalized,
			layer: "source",
			default_hidden: true,
		});
		addEdge(edgeKind, ownerId, nodeId, { default_hidden: true });
	};
	const addAuditEvidenceRef = (
		ownerId: string,
		ref: string,
		edgeKind: string,
	) => {
		const normalized = normalizeEvidenceRef(ref);
		if (!normalized) return;
		auditEvidenceRefSet.add(normalized);
		const nodeId = `audit:${normalized}`;
		addNode(nodeId, {
			kind: "audit_evidence",
			path: normalized,
			layer: "audit",
			default_hidden: true,
		});
		addEdge(edgeKind, ownerId, nodeId, { default_hidden: true });
	};
	const addContentProofRef = (
		ownerId: string,
		ref: string,
		edgeKind: string,
	) => {
		const normalized = normalizeEvidenceRef(ref);
		if (!normalized) return;
		contentProofRefSet.add(normalized);
		const nodeId = `content_proof:${normalized}`;
		addNode(nodeId, {
			kind: "content_proof",
			path: normalized,
			proof_kind: contentProofKind(normalized),
			layer: "content_proof",
			default_hidden: true,
		});
		addEdge(edgeKind, ownerId, nodeId, { default_hidden: true });
	};

	const codePaths = new Set<string>();
	const canonicalSourceRefs = new Set<string>();
	const auditEvidenceRefSet = new Set<string>();
	const contentProofRefSet = new Set<string>();
	const diagramInventory = parseSystemDiagrams(project.root, project);
	const fileStructureDriftReport = buildFileStructureDriftReport(
		project.root,
		project,
	);
	const fileStructureDrift = compactFileStructureDriftReport(
		fileStructureDriftReport,
	);
	const docsByDiagramRef = new Map<string, string[]>();
	const validationAttestations: any[] = [];
	const researchEntryIds: string[] = [];
	const docsByCodePath = new Map<string, string[]>();
	const openTasksBySpec = new Map<string, string[]>();
	const openTaskCodeScopes: { path: string; taskId: string }[] = [];
	const diagramRefByResolvedRef = new Map(
		diagramInventory.refs.map((ref) => [ref.ref, ref]),
	);
	const derivedDiagramCodePathsByDoc = new Map<
		string,
		Array<{ path: string; source_ref: string }>
	>();
	const diagramRefCodePaths = (ref: any): string[] =>
		stringList(ref?.metadata?.paths).map(normalizeCodewikiRef).filter(Boolean);
	const addDerivedDiagramCodePath = (
		docPath: string,
		codePath: string,
		sourceRef: string,
	) => {
		if (!docPath || !codePath) return;
		if (!derivedDiagramCodePathsByDoc.has(docPath))
			derivedDiagramCodePathsByDoc.set(docPath, []);
		derivedDiagramCodePathsByDoc
			.get(docPath)!
			.push({ path: codePath, source_ref: sourceRef });
	};
	for (const ref of diagramInventory.refs) {
		const paths = diagramRefCodePaths(ref);
		if (paths.length === 0) continue;
		if (ref.source) {
			for (const codePath of paths)
				addDerivedDiagramCodePath(ref.source, codePath, ref.ref);
		}
		const diagram = diagramInventory.diagrams.find(
			(candidate) => candidate.path === ref.diagram_path,
		);
		if (diagram) {
			for (const sourceDoc of diagram.source_docs) {
				for (const codePath of paths)
					addDerivedDiagramCodePath(sourceDoc, codePath, ref.ref);
			}
		}
	}
	const addDocCodeLink = (
		docPath: string,
		codePath: string,
		linkSource: string,
		sourceRef?: string,
	) => {
		const normalizedCodePath = normalizeCodewikiRef(codePath);
		if (!docPath || !normalizedCodePath || docPath === normalizedCodePath)
			return;
		codePaths.add(normalizedCodePath);
		if (!docsByCodePath.has(normalizedCodePath))
			docsByCodePath.set(normalizedCodePath, []);
		docsByCodePath.get(normalizedCodePath)!.push(docPath);
		const isDirty =
			!isGeneratedPath(project, normalizedCodePath) &&
			isPathDirty(dirtyPaths, normalizedCodePath);
		addNode(`code:${normalizedCodePath}`, {
			kind: "code_path",
			path: normalizedCodePath,
			layer: "code",
			alignment_state: isDirty ? "drift" : "aligned",
		});
		addEdge("doc_code_path", `doc:${docPath}`, `code:${normalizedCodePath}`, {
			link_source: linkSource,
			...(sourceRef ? { source_ref: sourceRef } : {}),
		});
	};
	const normalizedSprints = roadmapSprints
		.map((sprint: any) => ({
			id: String(sprint?.id || "").trim(),
			title: String(sprint?.title || sprint?.id || "").trim(),
			status: String(sprint?.status || "planned").trim(),
			outcome: String(sprint?.outcome || sprint?.summary || "").trim(),
			task_ids: stringList(sprint?.task_ids).filter((id) => /^TASK-/.test(id)),
			scope: sprint?.scope || {},
			budget: sprint?.budget || {},
			gates: stringList(sprint?.gates),
		}))
		.filter((sprint) => sprint.id);
	const sprintByTaskId = new Map<string, string[]>();
	for (const sprint of normalizedSprints) {
		for (const taskId of sprint.task_ids) {
			if (!sprintByTaskId.has(taskId)) sprintByTaskId.set(taskId, []);
			sprintByTaskId.get(taskId)!.push(sprint.id);
		}
	}
	const archivedTaskIdSet = new Set(
		archivedTaskIds.map((id) => String(id || "").trim()).filter(Boolean),
	);
	const activeRoadmapTaskIds = new Set(
		roadmapEntries
			.filter((task) => isOpenTaskStatus(String(task.status || "")))
			.map((task) => task.id),
	);
	let dirtyPaths: string[] = [];
	let rawDirtyPaths: string[] = [];
	try {
		rawDirtyPaths = gitCache.getDirtyPaths();
		dirtyPaths = rawDirtyPaths.filter(
			(path) => !isGeneratedPath(project, path) && !isCodewikiDataPath(path),
		);
	} catch {
		rawDirtyPaths = [];
		dirtyPaths = [];
	}

	// Process system diagram raw data
	const diagramRefsByCategory: Record<string, string[]> = {};
	for (const diagram of diagramInventory.diagrams) {
		const diagramNodeId = `diagram:${diagram.path}`;
		addNode(diagramNodeId, {
			kind: "system_diagram",
			path: diagram.path,
			title: diagram.title,
			diagram_id: diagram.id,
			diagram_kind: diagram.kind,
			purpose: diagram.purpose,
			layer: "knowledge",
		});
		for (const sourceDoc of diagram.source_docs)
			addEdge("diagram_source_doc", diagramNodeId, `doc:${sourceDoc}`);
		for (const ref of diagram.refs) {
			if (!diagramRefsByCategory[ref.category])
				diagramRefsByCategory[ref.category] = [];
			diagramRefsByCategory[ref.category].push(ref.ref);
			const refNodeId = `diagram_ref:${ref.ref}`;
			addNode(refNodeId, {
				kind: "system_diagram_ref",
				title: ref.label,
				path: ref.diagram_path,
				ref: ref.ref,
				aliases: ref.aliases,
				diagram_id: ref.diagram_id,
				diagram_slug: ref.diagram_slug,
				ref_category: ref.category,
				raw_kind: ref.raw_kind,
				requires_doc: ref.requires_doc,
				source: ref.source,
				layer: "knowledge",
			});
			addEdge("diagram_contains_ref", diagramNodeId, refNodeId);
			if (ref.source)
				addEdge("diagram_ref_source_doc", refNodeId, `doc:${ref.source}`);
		}
		for (const edge of diagram.edges) {
			const fromRef =
				resolveDiagramRef(`${diagram.slug}:${edge.from}`, diagramInventory) ||
				resolveDiagramRef(edge.from, diagramInventory);
			const toRef =
				resolveDiagramRef(`${diagram.slug}:${edge.to}`, diagramInventory) ||
				resolveDiagramRef(edge.to, diagramInventory);
			const flowRef = edge.ref
				? resolveDiagramRef(`${diagram.slug}:${edge.ref}`, diagramInventory) ||
					resolveDiagramRef(edge.ref, diagramInventory)
				: null;
			if (flowRef) {
				if (fromRef)
					addEdge(
						"diagram_flow_from",
						`diagram_ref:${flowRef}`,
						`diagram_ref:${fromRef}`,
						{ label: edge.label, diagram_path: edge.diagram_path },
					);
				if (toRef)
					addEdge(
						"diagram_flow_to",
						`diagram_ref:${flowRef}`,
						`diagram_ref:${toRef}`,
						{ label: edge.label, diagram_path: edge.diagram_path },
					);
			} else if (fromRef && toRef) {
				addEdge(
					"diagram_ref_relation",
					`diagram_ref:${fromRef}`,
					`diagram_ref:${toRef}`,
					{
						label: edge.label,
						relation_kind: edge.kind,
						diagram_path: edge.diagram_path,
					},
				);
			}
		}
	}

	if (
		fileStructureDrift.available ||
		fileStructureDrift.parse_issues.length > 0
	) {
		const actionableEntries = fileStructureDrift.actionable_entries;
		const fileStructureEntries = [
			...fileStructureDrift.actionable_entries,
			...fileStructureDrift.approved_migration_deltas,
		];
		const fileStructureNodeId = `file_structure:${fileStructureDrift.map_path}`;
		addNode(fileStructureNodeId, {
			kind: "audit_evidence",
			path: fileStructureDrift.map_path,
			title: "File-structure drift lens",
			layer: "audit",
			alignment_state:
				actionableEntries.length > 0 ||
				fileStructureDrift.parse_issues.length > 0
					? "drift"
					: "aligned",
			issue_kind: "file_structure_drift",
			summary: {
				approved_migration_delta:
					fileStructureDrift.counts.approved_migration_delta,
				actionable_drift: actionableEntries.length,
				parse_issues: fileStructureDrift.parse_issues.length,
			},
			file_structure_counts: fileStructureDrift.counts,
		});
		if (
			diagramInventory.diagrams.some(
				(diagram) => diagram.path === fileStructureDrift.map_path,
			)
		) {
			addEdge(
				"file_structure_source_diagram",
				fileStructureNodeId,
				`diagram:${fileStructureDrift.map_path}`,
			);
		}
		for (const entry of fileStructureEntries.slice(0, 200)) {
			const entryNodeId = `file_structure_drift:${entry.category}:${entry.path}`;
			addNode(entryNodeId, {
				kind: "audit_evidence",
				path: entry.path,
				layer: "audit",
				severity: entry.severity,
				issue_kind: entry.category,
				message: entry.message,
				alignment_state:
					entry.category === "approved_migration_delta" ? "aligned" : "drift",
				default_hidden: entry.category === "approved_migration_delta",
			});
			addEdge("file_structure_drift_entry", fileStructureNodeId, entryNodeId, {
				default_hidden: entry.category === "approved_migration_delta",
			});
		}
	}

	// Process Docs
	const sortedDocs = [...docs].sort((a, b) => a.path.localeCompare(b.path));
	for (const doc of sortedDocs) {
		const docId = `doc:${doc.path}`;

		addNode(docId, {
			kind: "doc",
			path: doc.path,
			title: doc.title,
			doc_type: doc.doc_type,
			group:
				doc.doc_type === "spec" && doc.path.includes("/")
					? doc.path.split("/")[0]
					: "",
		});

		for (const target of doc.links) {
			addEdge("doc_link", docId, `doc:${target}`);
		}
		for (const rawRef of stringList(doc.diagram_refs)) {
			const resolvedRef = resolveDiagramRef(rawRef, diagramInventory);
			const refNodeId = `diagram_ref:${resolvedRef || rawRef}`;
			if (!resolvedRef)
				addNode(refNodeId, {
					kind: "missing_system_diagram_ref",
					ref: rawRef,
					layer: "knowledge",
				});
			addEdge("doc_diagram_ref", docId, refNodeId, {
				ref: rawRef,
				resolved: Boolean(resolvedRef),
			});
			if (resolvedRef) {
				if (!docsByDiagramRef.has(resolvedRef))
					docsByDiagramRef.set(resolvedRef, []);
				docsByDiagramRef.get(resolvedRef)!.push(doc.path);
				const diagramRef = diagramRefByResolvedRef.get(resolvedRef);
				for (const codePath of diagramRefCodePaths(diagramRef))
					addDocCodeLink(doc.path, codePath, "diagram_ref", resolvedRef);
			}
		}
		for (const derived of derivedDiagramCodePathsByDoc.get(doc.path) || []) {
			addDocCodeLink(
				doc.path,
				derived.path,
				"diagram_source",
				derived.source_ref,
			);
		}
		for (const codePath of stringList(doc.source_paths)) {
			addDocCodeLink(doc.path, codePath, "source_fact");
		}
		for (const codePath of stringList(doc.code_paths)) {
			addDocCodeLink(doc.path, codePath, "frontmatter_override");
		}
	}

	// Process Research Collections
	for (const collection of research) {
		const collectionPath =
			typeof collection.path === "string" ? collection.path.trim() : "";
		const collectionId = `research_collection:${collectionPath}`;
		addNode(collectionId, {
			kind: "research_collection",
			path: collectionPath,
		});

		for (const entry of Array.isArray(collection.entries)
			? collection.entries
			: []) {
			const entryId = typeof entry.id === "string" ? entry.id.trim() : "";
			if (!entryId) continue;
			researchEntryIds.push(entryId);

			const entryNodeId = `research_entry:${entryId}`;
			addNode(entryNodeId, {
				kind: "research_entry",
				title: entry.title,
			});
			addEdge("collection_contains_entry", collectionId, entryNodeId);
		}
	}

	// Process Roadmap Sprints
	for (const sprint of normalizedSprints) {
		const sprintNodeId = `sprint:${sprint.id}`;
		addNode(sprintNodeId, {
			kind: "roadmap_sprint",
			title: sprint.title,
			layer: "roadmap",
			status: sprint.status,
			outcome: sprint.outcome,
			budget: sprint.budget,
			gates: sprint.gates,
			alignment_state: ["closed", "cancelled"].includes(sprint.status)
				? "aligned"
				: "drift",
		});
		for (const taskId of sprint.task_ids)
			addEdge("sprint_task", sprintNodeId, `task:${taskId}`);
		for (const docPath of stringList(sprint.scope?.knowledge))
			addEdge("sprint_knowledge_scope", sprintNodeId, `doc:${docPath}`);
		for (const codePath of stringList(sprint.scope?.code)) {
			codePaths.add(codePath);
			addNode(`code:${codePath}`, {
				kind: "code_path",
				path: codePath,
				layer: "code",
			});
			addEdge("sprint_code_scope", sprintNodeId, `code:${codePath}`);
		}
	}

	// Process Roadmap Tasks
	const statusCounts: Record<string, number> = {};
	for (const task of roadmapEntries) {
		const status = task.status || "todo";
		statusCounts[status] = (statusCounts[status] || 0) + 1;

		const taskId = task.id.trim();
		if (!taskId) continue;

		const taskNodeId = `task:${taskId}`;
		addNode(taskNodeId, {
			kind: "roadmap_task",
			title: task.title,
			layer: "roadmap",
			status,
			change_type: task.change_type,
			alignment_state: isOpenTaskStatus(status) ? "drift" : "aligned",
		});

		for (const specPath of task.spec_paths || []) {
			if (isOpenTaskStatus(status)) {
				if (!openTasksBySpec.has(specPath)) openTasksBySpec.set(specPath, []);
				openTasksBySpec.get(specPath)!.push(taskId);
			}
			addEdge("task_spec", taskNodeId, `doc:${specPath}`);
			for (const codePath of task.code_paths || [])
				addDocCodeLink(specPath, codePath, "roadmap_task", taskId);
		}
		for (const codePath of task.code_paths || []) {
			codePaths.add(codePath);
			if (isOpenTaskStatus(status))
				openTaskCodeScopes.push({ path: codePath, taskId });
			const isDirty =
				!isGeneratedPath(project, codePath) &&
				isPathDirty(dirtyPaths, codePath);
			addNode(`code:${codePath}`, {
				kind: "code_path",
				path: codePath,
				layer: "code",
				alignment_state: isDirty ? "drift" : "aligned",
			});
			addEdge("task_code_path", taskNodeId, `code:${codePath}`);
		}
		for (const researchId of task.research_ids || []) {
			addEdge("task_research", taskNodeId, `research_entry:${researchId}`);
		}
	}

	// Process build evidence before tests so derived code paths participate in test-code edges.
	for (const build of builds) {
		const buildPath = normalizeCodewikiRef(build.path);
		const knowledgeRefs = unique([
			...producedRefs(build.data, "knowledge"),
			...stringList(build.data?.knowledge_changes).map(normalizeCodewikiRef),
			...stringList(
				build.data?.row_to_kb_mappings?.flatMap(
					(mapping: any) => mapping?.knowledge_refs ?? [],
				),
			).map(normalizeCodewikiRef),
		]).filter((ref) => ref.startsWith(".codewiki/kb/"));
		const codeRefs = unique([
			...producedRefs(build.data, "code"),
			...stringList(build.data?.code_files).map(normalizeCodewikiRef),
			...stringList(build.data?.candidate_code_paths).map(normalizeCodewikiRef),
		]).filter(Boolean);
		for (const docPath of knowledgeRefs) {
			for (const codePath of codeRefs)
				addDocCodeLink(docPath, codePath, "build_evidence", buildPath);
		}
	}

	// Process Test Files
	for (const testFilePath of testFiles) {
		const testNodeId = `test:${testFilePath}`;
		addNode(testNodeId, { kind: "test_file", path: testFilePath });
		for (const codePath of codePaths) {
			if (
				testFilePath.includes(codePath.replace(/\\.[^.]+$/, "")) ||
				codePath.includes(testFilePath.replace(/\\.[^.]+$/, ""))
			) {
				addEdge("test_code", testNodeId, `code:${codePath}`);
			}
		}
	}

	// Process Builds
	const buildTaskMap = new Map<string, string[]>();
	const reconciliationItems: any[] = [];
	const buildsByPath = new Map<string, BuildArtifact>();
	const planningByDecision = new Map<string, BuildArtifact[]>();
	const implementationByPlanning = new Map<string, BuildArtifact[]>();

	for (const build of builds) {
		const buildPath = normalizeCodewikiRef(build.path);
		if (buildPath) buildsByPath.set(buildPath, build);
	}
	const supersededByPath = new Map<string, string[]>();
	for (const build of builds) {
		const buildPath = normalizeCodewikiRef(build.path);
		for (const ref of [
			...stringList(build.data?.cycle?.supersedes),
			...stringList(build.data?.supersedes),
		].map(normalizeCodewikiRef)) {
			if (!ref) continue;
			if (!supersededByPath.has(ref)) supersededByPath.set(ref, []);
			supersededByPath.get(ref)!.push(buildPath);
		}
	}
	for (const build of builds) {
		if (build.kind === "planning_build") {
			indexPush(planningByDecision, build.data?.source_decision_build, build);
			for (const ref of buildRefs(build.data, "decision")) {
				indexPush(planningByDecision, ref, build);
			}
		} else if (build.kind === "implementation_build") {
			for (const ref of [
				normalizeCodewikiRef(build.data?.source_planning_build),
				...buildRefs(build.data, "planning"),
			]) {
				indexPush(implementationByPlanning, ref, build);
			}
		}
	}

	const hasPassingValidationForBuild = (build: BuildArtifact) => {
		const buildPath = normalizeCodewikiRef(build.path);
		const taskIds = new Set(buildTaskIds(build));
		const archiveLedger = buildArchiveLedger(build);
		const validationRefs = new Set(
			[
				...stringList(build.data?.validation_refs),
				...producedRefs(build.data, "validation"),
			]
				.map(normalizeCodewikiRef)
				.filter(Boolean),
		);
		if (String(build.data?.validation_verdict?.verdict || "").trim() === "pass")
			return true;
		if (archiveLedger && publicationSafetyPassed(build)) return true;
		if (
			build.kind === "implementation_build" &&
			taskIds.size > 0 &&
			[...taskIds].every(
				(taskId) =>
					archivedTaskIdSet.has(taskId) || !activeRoadmapTaskIds.has(taskId),
			)
		)
			return true;
		return validations.some((validation: ValidationArtifact) => {
			if (String(validation.verdict || "") !== "pass") return false;
			const sources = [
				normalizeCodewikiRef(validation.data?.source),
				...stringList(validation.data?.sources).map(normalizeCodewikiRef),
			].filter(Boolean);
			if (sources.includes(buildPath)) return true;
			if (validationRefs.has(normalizeCodewikiRef(validation.path)))
				return true;
			const profile = String(validation.data?.profile || "").trim();
			return Boolean(
				validation.taskId &&
					taskIds.has(validation.taskId) &&
					["implementation", "task-close"].includes(profile) &&
					sources.length === 0,
			);
		});
	};
	const decisionConsumed = (build: BuildArtifact) => {
		const buildPath = normalizeCodewikiRef(build.path);
		return Boolean(
			planningByDecision.get(buildPath)?.length ||
				hasPassingValidationForBuild(build),
		);
	};
	const planningConsumed = (build: BuildArtifact) => {
		const buildPath = normalizeCodewikiRef(build.path);
		return Boolean(
			hasRoadmapChanges(build) ||
				implementationByPlanning.get(buildPath)?.length ||
				hasPassingValidationForBuild(build),
		);
	};
	const buildLinkedToOpenTask = (build: BuildArtifact) => {
		const buildPath = normalizeCodewikiRef(build.path);
		const taskIds = buildTaskIds(build);
		if (taskIds.some((taskId) => activeRoadmapTaskIds.has(taskId))) return true;
		return roadmapEntries.some(
			(task) =>
				isOpenTaskStatus(String(task.status || "")) &&
				[...stringList(task.spec_paths), ...stringList(task.code_paths)].some(
					(path) => normalizeCodewikiRef(path) === buildPath,
				),
		);
	};
	const buildDirty = (build: BuildArtifact) =>
		rawDirtyPaths.some(
			(path) => normalizeCodewikiRef(path) === normalizeCodewikiRef(build.path),
		);
	const historicalColdBuild = (
		build: BuildArtifact,
		lifecycleState: string,
	) => {
		if (archivedTaskIdSet.size === 0) return false;
		if (buildDirty(build) || buildLinkedToOpenTask(build)) return false;
		return ["accepted", "applied", "validated", "archived"].includes(
			lifecycleState,
		);
	};
	for (const build of builds) {
		const buildPath = normalizeCodewikiRef(build.path);
		const lifecycleState =
			String(
				build.data?.lifecycle?.state ||
					build.data?.status ||
					build.status ||
					"",
			).trim() || "unknown";
		const buildValidated = hasPassingValidationForBuild(build);
		const superseded = supersededByPath.has(buildPath);
		const consumed =
			build.kind === "decision_build"
				? decisionConsumed(build)
				: build.kind === "planning_build"
					? planningConsumed(build)
					: false;
		const historicalCold = historicalColdBuild(build, lifecycleState);
		const buildAlignmentState =
			superseded ||
			isLifecycleComplete(lifecycleState) ||
			buildValidated ||
			consumed ||
			historicalCold
				? "aligned"
				: "drift";
		const archiveLedger = buildArchiveLedger(build);
		const compactCold = canCompactColdBuild(
			build,
			lifecycleState,
			buildValidated,
		);
		const buildId = `build:${buildPath}`;
		const buildCanonicalRefs = canonicalSourceRefsForBuild(build);
		const buildAuditRefs = auditEvidenceRefs(build.data);
		const buildContentProofRefs = contentProofRefs(build.data);
		addNode(buildId, {
			kind: build.kind as any,
			path: buildPath,
			title:
				build.data?.source_decision_build || build.data?.source || buildPath,
			status: build.data?.status ?? build.status,
			layer: "build",
			lifecycle_state: lifecycleState,
			alignment_state: buildAlignmentState,
			compacted: compactCold,
			default_hidden: compactCold || superseded,
			archive_ref: archiveLedger?.archive_ref,
			superseded_by: supersededByPath.get(buildPath) || [],
			evidence_summary: {
				canonical_source_refs: buildCanonicalRefs,
				audit_evidence_refs: buildAuditRefs,
				content_proof_refs: buildContentProofRefs,
				validation_attestation_refs: [
					...stringList(build.data?.validation_refs),
					...producedRefs(build.data, "validation"),
				]
					.map(normalizeCodewikiRef)
					.filter(Boolean),
			},
		});
		for (const ref of buildCanonicalRefs)
			addCanonicalSourceRef(buildId, ref, "build_references_canonical_source");
		for (const ref of buildAuditRefs)
			addAuditEvidenceRef(buildId, ref, "build_audit_evidence");
		for (const ref of buildContentProofRefs)
			addContentProofRef(buildId, ref, "build_content_proof");
		if (
			!superseded &&
			!historicalCold &&
			build.kind === "decision_build" &&
			lifecycleState === "proposed"
		) {
			reconciliationItems.push({
				id: `reconcile:${buildPath}`,
				source_id: buildId,
				state: "drift",
				direction: "downward",
				from_layer: "intent",
				to_layer: "knowledge",
				next_loop: "decision",
				reason:
					"Decision build is proposed; approve, edit, reject, or defer semantic rows before canonical knowledge changes.",
			});
		} else if (
			!superseded &&
			!historicalCold &&
			build.kind === "decision_build" &&
			lifecycleState === "accepted" &&
			!decisionConsumed(build)
		) {
			reconciliationItems.push({
				id: `reconcile:${buildPath}`,
				source_id: buildId,
				state: "drift",
				direction: "downward",
				from_layer: "knowledge",
				to_layer: "roadmap",
				next_loop: "planning",
				reason:
					"Accepted decision build has no downstream planning build or validation evidence yet.",
			});
		} else if (
			!superseded &&
			!historicalCold &&
			build.kind === "planning_build" &&
			lifecycleState === "accepted" &&
			!planningConsumed(build)
		) {
			reconciliationItems.push({
				id: `reconcile:${buildPath}`,
				source_id: buildId,
				state: "drift",
				direction: "downward",
				from_layer: "roadmap",
				to_layer: "code",
				next_loop: "planning",
				reason:
					"Accepted planning build has no roadmap task, implementation link, or validation evidence yet.",
			});
		} else if (
			!superseded &&
			!historicalCold &&
			build.kind === "implementation_build" &&
			lifecycleState === "accepted" &&
			!buildValidated
		) {
			reconciliationItems.push({
				id: `reconcile:${buildPath}`,
				source_id: buildId,
				state: "drift",
				direction: "gateway",
				from_layer: "build",
				to_layer: "validation",
				next_loop: "validation",
				task_id: firstTaskId(build),
				reason:
					"Accepted implementation build still needs passing validation gateway evidence.",
			});
		} else if (
			!superseded &&
			!historicalCold &&
			["decision_build", "planning_build", "implementation_build"].includes(
				build.kind,
			) &&
			lifecycleState === "applied" &&
			!buildValidated
		) {
			reconciliationItems.push({
				id: `reconcile:${buildPath}`,
				source_id: buildId,
				state: "drift",
				direction: "gateway",
				from_layer: "build",
				to_layer: "validation",
				next_loop: "validation",
				task_id: firstTaskId(build),
				reason:
					"Applied compiler build still needs validation gateway evidence.",
			});
		}
		const publicationClaims = publicationClaimRefs(build);
		if (
			!superseded &&
			!historicalCold &&
			!isLifecycleComplete(lifecycleState) &&
			publicationClaims.length > 0 &&
			buildContentProofRefs.length === 0
		) {
			reconciliationItems.push({
				id: `reconcile:publication-proof:${buildPath}`,
				source_id: buildId,
				state: "drift",
				direction: "gateway",
				from_layer: "publication",
				to_layer: "content_proof",
				next_loop: "validation",
				task_id: firstTaskId(build),
				reason:
					"Publication claim lacks immutable content proof such as commit/tree SHA, package digest, archive ledger, or remote ref.",
				publication_refs: publicationClaims,
			});
		}
		for (const taskId of buildTaskIds(build)) {
			addEdge("build_task", buildId, `task:${taskId}`);
			if (!buildTaskMap.has(taskId)) buildTaskMap.set(taskId, []);
			buildTaskMap.get(taskId)!.push(buildPath);
		}
		if (archiveLedger) {
			const archiveNodeId = `archive_ref:${archiveLedger.archive_ref}`;
			addNode(archiveNodeId, {
				kind: "git_archive_ref",
				path: archiveLedger.archive_ref,
				task_id: archiveLedger.id,
				digest: archiveLedger.digest,
				restore_command: archiveLedger.restore_command,
				safety_status: archiveLedger.safety_status,
				default_hidden: true,
				layer: "archive",
			});
			addEdge("build_archive_ref", buildId, archiveNodeId, {
				default_hidden: true,
			});
		}
		if (compactCold) continue;
		for (const ref of consumedBuildRefs(build.data)) {
			if (ref) addEdge("build_derives_from", buildId, `build:${ref}`);
		}
		for (const ref of stringList(build.data?.consumes?.roadmap)) {
			if (/^TASK-/.test(ref))
				addEdge("build_consumes_task", buildId, `task:${ref}`);
		}
		for (const ref of stringList(build.data?.consumes?.planning).map(
			normalizeCodewikiRef,
		)) {
			if (ref) addEdge("build_consumes_planning", buildId, `build:${ref}`);
		}
		for (const ref of stringList(build.data?.consumes?.validation).map(
			normalizeCodewikiRef,
		)) {
			if (ref)
				addEdge("build_consumes_validation", buildId, `validation:${ref}`);
		}
		for (const ref of stringList(build.data?.consumes?.source).map(
			normalizeCodewikiRef,
		)) {
			if (ref) addEdge("build_consumes_source", buildId, `source:${ref}`);
		}
		for (const ref of producedRefs(build.data, "knowledge")) {
			addEdge("build_produces_knowledge", buildId, `doc:${ref}`);
		}
		for (const ref of producedRefs(build.data, "roadmap")) {
			if (/^TASK-/.test(ref))
				addEdge("build_produces_task", buildId, `task:${ref}`);
		}
		for (const ref of producedRefs(build.data, "code")) {
			addNode(`code:${ref}`, { kind: "code_path", path: ref, layer: "code" });
			addEdge("build_produces_code", buildId, `code:${ref}`);
		}
		for (const ref of producedRefs(build.data, "tests")) {
			addNode(`test:${ref}`, { kind: "test_file", path: ref });
			addEdge("build_produces_test", buildId, `test:${ref}`);
		}
		for (const ref of producedRefs(build.data, "validation")) {
			addEdge("build_produces_validation", buildId, `validation:${ref}`);
		}
		for (const ref of producedRefs(build.data, "closure")) {
			addNode(`closure:${ref}`, { kind: "closure_brief", path: ref });
			addEdge("build_produces_closure", buildId, `closure:${ref}`);
		}
		for (const v of validations) {
			if (
				v.path.includes(build.path.replace(/\\.[^.]+$/, "")) ||
				build.path.includes(v.path.replace(/\\.[^.]+$/, ""))
			) {
				addEdge("build_validated_by", buildId, `validation:${v.path}`);
			}
		}
	}

	const traceabilityRows: any[] = [];
	const decisionPropagationAssessments: any[] = [];
	const semanticChangeRows = unique(rawDirtyPaths)
		.map((path) => ({ path, change_type: classifySemanticPath(project, path) }))
		.filter((row): row is { path: string; change_type: string } =>
			Boolean(row.change_type),
		)
		.map((row) => {
			const accepted_build_refs = builds
				.filter((build) =>
					buildCoversSemanticPath(build, row.path, row.change_type),
				)
				.map((build) => normalizeCodewikiRef(build.path));
			const gaps =
				accepted_build_refs.length > 0
					? []
					: ["missing_accepted_build_coverage"];
			return {
				path: row.path,
				change_type: row.change_type,
				semantic: true,
				accepted_build_refs,
				gaps,
			};
		});
	for (const row of semanticChangeRows.filter((row) => row.gaps.length > 0)) {
		reconciliationItems.push({
			id: `reconcile:semantic-build:${row.path}`,
			source_id: `path:${row.path}`,
			state: "drift",
			direction: "upward",
			from_layer:
				row.change_type === "code"
					? "code"
					: row.change_type === "task"
						? "roadmap"
						: "knowledge",
			to_layer: "build",
			next_loop:
				row.change_type === "product" || row.change_type === "system"
					? "decision"
					: row.change_type === "task"
						? "planning"
						: "implementation",
			reason: `Semantic ${row.change_type} change ${row.path} lacks accepted compiler build coverage.`,
			gaps: row.gaps,
			change_type: row.change_type,
		});
	}
	for (const decision of builds.filter((build) => {
		if (build.kind !== "decision_build") return false;
		const lifecycleState =
			String(
				build.data?.lifecycle?.state ||
					build.data?.status ||
					build.status ||
					"",
			).trim() || "unknown";
		const buildPath = normalizeCodewikiRef(build.path);
		if (isLifecycleComplete(lifecycleState)) return false;
		if (
			supersededByPath.has(buildPath) ||
			historicalColdBuild(build, lifecycleState)
		)
			return false;
		const downstreamPlanning = planningByDecision.get(buildPath) || [];
		const downstreamTaskIds = unique(
			downstreamPlanning
				.flatMap((planningBuild) => buildTaskIds(planningBuild))
				.filter((ref) => /^TASK-/.test(ref)),
		);
		const hasOpenDownstreamTask = downstreamTaskIds.some((taskId) =>
			activeRoadmapTaskIds.has(taskId),
		);
		return (
			!decisionConsumed(build) ||
			buildLinkedToOpenTask(build) ||
			buildDirty(build) ||
			hasOpenDownstreamTask
		);
	})) {
		const decisionPath = normalizeCodewikiRef(decision.path);
		const explicitRequirements = Array.isArray(decision.data?.requirements)
			? decision.data.requirements
			: [];
		const approvedDiffRows = (decision.data?.diff_table || []).filter(
			(row: any) =>
				String(row?.user_action || "") === "approved" ||
				stringList(decision.data?.approved_diff_rows).includes(
					String(row?.id || ""),
				),
		);
		const acceptedDecisions = decision.data?.accepted_decisions || [];
		const requirementRows = (
			explicitRequirements.length > 0
				? explicitRequirements.map((req: any) => ({
						id: String(req.id || "").trim(),
						text: String(req.text || "").trim(),
					}))
				: approvedDiffRows.length > 0
					? approvedDiffRows.map((row: any) => ({
							id: String(row.id || "").trim(),
							text: String(row.desired_state || "").trim(),
						}))
					: acceptedDecisions.map((entry: any) => ({
							id: String(entry.id || "").trim(),
							text: String(entry.summary || "").trim(),
						}))
		).filter((req: any) => req.id && req.text);
		for (const requirement of requirementRows) {
			const knowledgePaths = unique(
				[
					...producedRefs(decision.data, "knowledge"),
					...stringList(decision.data?.knowledge_changes).map(
						normalizeCodewikiRef,
					),
					...stringList(
						decision.data?.row_to_kb_mappings?.flatMap(
							(mapping: any) => mapping?.knowledge_refs ?? [],
						),
					).map(normalizeCodewikiRef),
				].filter(Boolean),
			);
			const planningBuilds = uniqueBuildsByPath(
				planningByDecision.get(decisionPath) || [],
			);
			const planningPaths = planningBuilds
				.map((build) => normalizeCodewikiRef(build.path))
				.filter(Boolean);
			const taskIds = unique(
				planningBuilds.flatMap((build) => buildTaskIds(build)),
			);
			const implementationBuilds = unique(
				planningBuilds
					.flatMap(
						(build) =>
							implementationByPlanning.get(normalizeCodewikiRef(build.path)) ||
							[],
					)
					.map((build) => normalizeCodewikiRef(build.path)),
			);
			const implementationArtifacts = implementationBuilds
				.map((path) => buildsByPath.get(path))
				.filter(Boolean) as BuildArtifact[];
			const testPaths = unique(
				implementationArtifacts.flatMap((build) => [
					...producedRefs(build.data, "tests"),
					...stringList(build.data?.test_files).map(normalizeCodewikiRef),
				]),
			);
			const codeRefs = unique(
				implementationArtifacts.flatMap((build) => [
					...producedRefs(build.data, "code"),
					...stringList(build.data?.code_files).map(normalizeCodewikiRef),
				]),
			);
			const validationPaths = unique([
				...implementationArtifacts.flatMap((build) => [
					...producedRefs(build.data, "validation"),
					...stringList(build.data?.validation_refs).map(normalizeCodewikiRef),
				]),
				...implementationArtifacts
					.filter(
						(build) =>
							String(build.data?.validation_verdict?.verdict || "") === "pass",
					)
					.map(
						(build) => `${normalizeCodewikiRef(build.path)}#validation_verdict`,
					),
				...validations
					.filter((validation) =>
						implementationBuilds.includes(
							normalizeCodewikiRef(validation.data?.source),
						),
					)
					.map((validation) => normalizeCodewikiRef(validation.path)),
			]);
			const publicationRefs = unique(
				implementationArtifacts.flatMap((build) => publicationClaimRefs(build)),
			);
			const contentProofRefsForRequirement = unique(
				implementationArtifacts.flatMap((build) =>
					contentProofRefs(build.data),
				),
			);
			const auditRefsForRequirement = unique(
				implementationArtifacts.flatMap((build) =>
					auditEvidenceRefs(build.data),
				),
			);
			const gaps: string[] = [];
			if (knowledgePaths.length === 0) gaps.push("missing_knowledge_mapping");
			if (planningPaths.length === 0 && taskIds.length === 0)
				gaps.push("missing_planning_build");
			if (taskIds.length > 0 && implementationBuilds.length === 0)
				gaps.push("missing_implementation_build");
			if (implementationBuilds.length > 0 && testPaths.length === 0)
				gaps.push("missing_test_evidence");
			if (implementationBuilds.length > 0 && validationPaths.length === 0)
				gaps.push("missing_validation_evidence");
			if (
				publicationRefs.length > 0 &&
				contentProofRefsForRequirement.length === 0
			)
				gaps.push("missing_publication_content_proof");
			const traceabilityRow = {
				requirement_id: requirement.id,
				requirement_text: requirement.text,
				decision_build: decisionPath,
				knowledge_paths: knowledgePaths,
				planning_builds: planningPaths,
				roadmap_task_ids: taskIds,
				test_paths: testPaths,
				code_paths: codeRefs,
				implementation_builds: implementationBuilds,
				validation_paths: validationPaths,
				audit_evidence_refs: auditRefsForRequirement,
				publication_refs: publicationRefs,
				content_proof_refs: contentProofRefsForRequirement,
				gaps,
			};
			traceabilityRows.push(traceabilityRow);
			if (gaps.length > 0) {
				const nextLoop = gaps.includes("missing_planning_build")
					? "planning"
					: gaps.includes("missing_validation_evidence") ||
							gaps.includes("missing_publication_content_proof")
						? "validation"
						: gaps.includes("missing_knowledge_mapping")
							? "decision"
							: "implementation";
				reconciliationItems.push({
					id: `reconcile:traceability:${decisionPath}:${requirement.id}`,
					source_id: `build:${decisionPath}`,
					state: "drift",
					direction: "downward",
					from_layer: "decision",
					to_layer: gaps.includes("missing_publication_content_proof")
						? "content_proof"
						: gaps.includes("missing_validation_evidence")
							? "validation"
							: gaps.includes("missing_implementation_build") ||
									gaps.includes("missing_test_evidence")
								? "code"
								: gaps.includes("missing_planning_build")
									? "roadmap"
									: "knowledge",
					next_loop: nextLoop,
					task_id: taskIds[0],
					reason: `Traceability gap for ${requirement.id}: ${gaps.join(", ")}.`,
					gaps,
				});
			}
		}
	}

	for (const decision of builds.filter((build) => {
		if (build.kind !== "decision_build") return false;
		const lifecycleState =
			String(
				build.data?.lifecycle?.state ||
					build.data?.status ||
					build.status ||
					"",
			).trim() || "unknown";
		const buildPath = normalizeCodewikiRef(build.path);
		if (isLifecycleComplete(lifecycleState)) return false;
		return (
			!supersededByPath.has(buildPath) &&
			!historicalColdBuild(build, lifecycleState)
		);
	})) {
		const decisionPath = normalizeCodewikiRef(decision.path);
		const planningBuilds = uniqueBuildsByPath(
			planningByDecision.get(decisionPath) || [],
		).filter(
			(planningBuild) =>
				!supersededByPath.has(normalizeCodewikiRef(planningBuild.path)),
		);
		const assessment = assessDecisionPropagation(
			decision.data,
			planningBuilds,
			{
				knownTaskIds: unique([
					...roadmapEntries.map((task) => task.id),
					...archivedTaskIds,
				]),
				knownSprintIds: normalizedSprints.map((sprint) => sprint.id),
				satisfiedDeferredTriggers:
					fileStructureDrift.satisfied_deferred_triggers || [],
			},
		);
		if (assessment.rows.length === 0 && assessment.questions.length === 0)
			continue;
		const decoratedRows = assessment.rows.map((row) => ({
			...row,
			decision_build: decisionPath,
		}));
		const decoratedQuestions = assessment.questions.map((question) => ({
			...question,
			decision_build: decisionPath,
		}));
		const decoratedResiduals = [...decoratedRows, ...decoratedQuestions].filter(
			(entry) => entry.gaps.length > 0,
		);
		decisionPropagationAssessments.push({
			decision_build: decisionPath,
			planning_builds: assessment.planning_builds,
			row_count: decoratedRows.length,
			question_count: decoratedQuestions.length,
			residual_count: decoratedResiduals.length,
			rows: decoratedRows,
			questions: decoratedQuestions,
			residuals: decoratedResiduals,
		});
		for (const residual of decoratedResiduals) {
			reconciliationItems.push({
				id: `reconcile:decision-propagation:${decisionPath}:${residual.kind}:${residual.id}`,
				source_id: `build:${decisionPath}`,
				state: "drift",
				direction: "downward",
				from_layer: "decision",
				to_layer: "roadmap",
				next_loop: "planning",
				task_id: residual.task_ids[0],
				reason: `Accepted decision ${residual.kind} ${residual.id} lacks durable planning propagation: ${residual.gaps.join(", ")}.`,
				gaps: residual.gaps,
				decision_build: decisionPath,
				planning_builds: residual.planning_builds,
				roadmap_task_ids: residual.task_ids,
				sprint_ids: residual.sprint_ids,
			});
		}
	}

	// Process active change claims
	const claimState = buildChangeClaimState(claims);
	for (const claim of claimState.claims) {
		const claimId = `claim:${claim.id}`;
		addNode(claimId, {
			kind: "change_claim",
			claim_id: claim.id,
			session_id: claim.session_id,
			agent_name: claim.agent_name,
			mode: claim.mode,
			role: claim.role,
			status: claim.status,
			summary: claim.summary,
			expires_at: claim.expires_at,
			worktree: claim.worktree,
			scopes: claim.scopes,
		});
		if (claim.task_id) addEdge("claim_task", claimId, `task:${claim.task_id}`);
		if (claim.build_ref)
			addEdge("claim_build", claimId, `build:${claim.build_ref}`);
		for (const label of claimScopeLabels(claim.scopes)) {
			const scopeId = `claim_scope:${label}`;
			addNode(scopeId, { kind: "change_claim_scope", path: label });
			addEdge("claim_scope", claimId, scopeId);
		}
	}
	for (const waiter of claimState.waiters) {
		const waiterId = `claim_wait:${waiter.id}`;
		addNode(waiterId, {
			kind: "change_claim_waiter",
			wait_id: waiter.id,
			session_id: waiter.session_id,
			agent_name: waiter.agent_name,
			mode: waiter.mode,
			role: waiter.role,
			status: waiter.status,
			summary: waiter.summary,
			expires_at: waiter.expires_at,
			ready_at: waiter.ready_at,
			blocked_by_claim_ids: waiter.blocked_by_claim_ids,
			blockers: waiter.blockers || [],
			blocker_summary: waiter.blocker_summary || "",
			next_safe_action: waiter.next_safe_action || "",
			worktree: waiter.worktree,
			scopes: waiter.scopes,
		});
		if (waiter.task_id)
			addEdge("claim_wait_task", waiterId, `task:${waiter.task_id}`);
		if (waiter.build_ref)
			addEdge("claim_wait_build", waiterId, `build:${waiter.build_ref}`);
		for (const blockedBy of waiter.blocked_by_claim_ids || [])
			addEdge("claim_wait_blocked_by", waiterId, `claim:${blockedBy}`);
		for (const label of claimScopeLabels(waiter.scopes)) {
			const scopeId = `claim_scope:${label}`;
			addNode(scopeId, { kind: "change_claim_scope", path: label });
			addEdge("claim_wait_scope", waiterId, scopeId);
		}
	}

	// Process Validations
	const validationIsolationRows = validations.map(validationIsolationSummary);
	for (const v of validations) {
		const valNodeId = `validation:${v.path}`;
		const isolation = validationIsolationSummary(v);
		const validationSources = unique(
			[
				normalizeCodewikiRef(v.data?.source),
				...stringList(v.data?.sources).map(normalizeCodewikiRef),
			].filter(Boolean),
		);
		const validationAuditRefs = auditEvidenceRefs(v.data);
		const validationContentProofRefs = contentProofRefs(v.data);
		validationAttestations.push({
			path: v.path,
			verdict: v.verdict,
			profile: String(v.data?.profile || "").trim(),
			task_id: v.taskId,
			source_refs: validationSources,
			audit_evidence_refs: validationAuditRefs,
			content_proof_refs: validationContentProofRefs,
			isolation_status: isolation.status,
		});
		const route = validationRouting(v.data);
		addNode(valNodeId, {
			kind: "validation_report",
			path: v.path,
			verdict: v.verdict,
			failure_class: route.failure_class,
			recommended_next_loop: route.recommended_next_loop,
			stop_reason: route.stop_reason,
			isolation_status: isolation.status,
			isolation: v.data?.isolation,
			evidence_summary: {
				canonical_source_refs: validationSources,
				audit_evidence_refs: validationAuditRefs,
				content_proof_refs: validationContentProofRefs,
			},
		});
		for (const ref of validationSources)
			addCanonicalSourceRef(valNodeId, ref, "validation_attests_source");
		for (const ref of validationAuditRefs)
			addAuditEvidenceRef(valNodeId, ref, "validation_audit_evidence");
		for (const ref of validationContentProofRefs)
			addContentProofRef(valNodeId, ref, "validation_content_proof");
		if (v.taskId) {
			addEdge("validation_task", valNodeId, `task:${v.taskId}`);
		}
		const validationTaskId = String(
			v.taskId || v.data?.task_id || v.data?.taskId || "",
		).trim();
		const validationTargetsClosedTask = Boolean(
			validationTaskId && !activeRoadmapTaskIds.has(validationTaskId),
		);
		const validationTargetsNoTask = !validationTaskId;
		const validationHasSupersedingPass = validations.some((candidate) => {
			if (candidate === v || candidate.verdict !== "pass") return false;
			const candidateTaskId = String(
				candidate.taskId ||
					candidate.data?.task_id ||
					candidate.data?.taskId ||
					"",
			).trim();
			if (candidateTaskId !== validationTaskId) return false;
			const candidateProfile = String(candidate.data?.profile || "").trim();
			const profile = String(v.data?.profile || "").trim();
			if (candidateProfile && profile && candidateProfile !== profile)
				return false;
			return (
				String(candidate.data?.source || "").trim() ===
				String(v.data?.source || "").trim()
			);
		});
		const unscopedBlock = v.verdict === "block" && validationTargetsNoTask;
		if (
			(v.verdict === "fail" || v.verdict === "block") &&
			!validationTargetsClosedTask &&
			!unscopedBlock &&
			!validationHasSupersedingPass
		) {
			const nextLoop = route.recommended_next_loop || "decision";
			const routeLabel = route.failure_class ? ` (${route.failure_class})` : "";
			const stopReason = route.stop_reason ? ` ${route.stop_reason}` : "";
			reconciliationItems.push({
				id: `reconcile:validation:${v.path}`,
				source_id: valNodeId,
				state: v.verdict === "block" ? "blocked" : "drift",
				direction: "gateway",
				from_layer: "validation",
				to_layer: layerForReconciliationLoop(nextLoop),
				next_loop: nextLoop,
				failure_class: route.failure_class,
				recommended_next_loop: route.recommended_next_loop,
				stop_reason: route.stop_reason,
				task_id: v.taskId,
				reason: route.recommended_next_loop
					? `Validation ${v.verdict}${routeLabel}; route to ${nextLoop}.${stopReason}`
					: v.verdict === "block"
						? "Validation blocked; escalate ambiguous intent to decision compiler."
						: "Validation failed; return to decision compiler to fix knowledge/roadmap gaps.",
			});
		}
	}

	for (const issue of lintReport?.issues || []) {
		if (!isActionableLintIssue(issue)) continue;
		const issuePath = String(issue.path || "").trim();
		if (!issuePath) continue;
		const relatedOpenTaskIds = openTasksBySpec.get(issuePath) || [];
		if (relatedOpenTaskIds.length > 0) continue;
		const lintNodeId = `lint:${issue.kind}:${issuePath}`;
		addNode(lintNodeId, {
			kind: "lint_issue",
			path: issuePath,
			layer: "validation",
			severity: issue.severity,
			issue_kind: issue.kind,
			message: issue.message,
		});
		addEdge("lint_issue_path", lintNodeId, `doc:${issuePath}`);
		reconciliationItems.push({
			id: `reconcile:lint:${issue.kind}:${issuePath}`,
			source_id: lintNodeId,
			state: "drift",
			direction: "gateway",
			from_layer: "knowledge",
			to_layer: "roadmap",
			next_loop: "decision",
			reason: `Lint ${issue.severity} (${issue.kind}) has no open roadmap coverage; reconcile knowledge or create scoped work.`,
			doc_paths: [issuePath],
		});
	}

	const taskHasPendingImplementationValidation = (taskId: string) =>
		builds.some((build) => {
			if (build.kind !== "implementation_build") return false;
			if (!buildTaskIds(build).includes(taskId)) return false;
			const lifecycleState = String(
				build.data?.lifecycle?.state ||
					build.data?.status ||
					build.status ||
					"",
			).trim();
			return (
				["accepted", "applied"].includes(lifecycleState) &&
				!hasPassingValidationForBuild(build)
			);
		});

	const validatedImplementationScopes = builds
		.filter(
			(build) =>
				build.kind === "implementation_build" &&
				hasPassingValidationForBuild(build),
		)
		.flatMap((build) => [
			...producedRefs(build.data, "code"),
			...producedRefs(build.data, "tests"),
			...stringList(build.data?.code_files).map(normalizeCodewikiRef),
			...stringList(build.data?.test_files).map(normalizeCodewikiRef),
		])
		.filter(Boolean);

	// Reconciliation from roadmap and code reality.
	for (const task of roadmapEntries) {
		const status = String(task.status || "todo").trim();
		if (!isOpenTaskStatus(status)) continue;
		const taskId = String(task.id || "").trim();
		if (taskHasPendingImplementationValidation(taskId)) continue;
		reconciliationItems.push({
			id: `reconcile:task:${taskId}`,
			source_id: `task:${taskId}`,
			state: status === "blocked" ? "blocked" : "drift",
			direction: "downward",
			from_layer: "roadmap",
			to_layer: "code",
			next_loop: "implementation",
			task_id: taskId,
			reason:
				status === "blocked"
					? `${taskId} is blocked; implementation loop needs unblock evidence or rerouting.`
					: `${taskId} is open implementation delta below knowledge.`,
		});
	}
	for (const codePath of codePaths) {
		const relatedDocs = docsByCodePath.get(codePath) || [];
		const isDirty =
			!isGeneratedPath(project, codePath) && isPathDirty(dirtyPaths, codePath);
		if (!isDirty || relatedDocs.length === 0) continue;
		if (
			validatedImplementationScopes.some((scope) =>
				pathsOverlap(scope, codePath),
			)
		)
			continue;
		const relatedOpenTaskIds = Array.from(
			new Set([
				...relatedDocs.flatMap((docPath) => openTasksBySpec.get(docPath) || []),
				...openTaskCodeScopes
					.filter((scope) => pathsOverlap(scope.path, codePath))
					.map((scope) => scope.taskId),
			]),
		);
		if (relatedOpenTaskIds.length > 0) continue;
		reconciliationItems.push({
			id: `reconcile:code:${codePath}`,
			source_id: `code:${codePath}`,
			state: "drift",
			direction: "upward",
			from_layer: "code",
			to_layer: "knowledge",
			next_loop: "decision",
			reason: `Mapped code changed without open roadmap coverage; reconcile upward into knowledge or decision if intent is unclear.`,
			doc_paths: relatedDocs,
		});
	}
	const reconciliationAction = buildReconciliationAction(reconciliationItems);
	const reconciliationCounts = reconciliationItems.reduce(
		(acc: Record<string, number>, item: any) => {
			const loop = String(item.next_loop || "observe");
			acc[loop] = (acc[loop] || 0) + 1;
			return acc;
		},
		{},
	);
	const layerHasDrift = (layer: string) =>
		reconciliationItems.some(
			(item) =>
				item.state !== "aligned" &&
				(item.from_layer === layer || item.to_layer === layer),
		);
	const openTaskIds = roadmapEntries
		.filter((task) => isOpenTaskStatus(String(task.status || "todo")))
		.map((task) => task.id);
	const inProgressTaskIds = roadmapEntries
		.filter((task) => isActiveTaskStatus(String(task.status || "todo")))
		.map((task) => task.id);
	const todoTaskIds = roadmapEntries
		.filter((task) => String(task.status || "todo") === "todo")
		.map((task) => task.id);
	const blockedTaskIds = roadmapEntries
		.filter((task) => String(task.status || "todo") === "blocked")
		.map((task) => task.id);
	const doneTaskIds = roadmapEntries
		.filter((task) => String(task.status || "todo") === "done")
		.map((task) => task.id);
	const cancelledTaskIds = roadmapEntries
		.filter((task) => String(task.status || "todo") === "cancelled")
		.map((task) => task.id);
	const sprintViews = normalizedSprints.map((sprint) => {
		const sprintOpenTaskIds = sprint.task_ids.filter((taskId) =>
			openTaskIds.includes(taskId),
		);
		return {
			id: sprint.id,
			title: sprint.title,
			status: sprint.status,
			outcome: sprint.outcome,
			task_ids: sprint.task_ids,
			open_task_ids: sprintOpenTaskIds,
			budget: sprint.budget,
			gates: sprint.gates,
			scope: sprint.scope,
		};
	});
	const activeSprintIds = sprintViews
		.filter(
			(sprint) =>
				!["closed", "cancelled"].includes(sprint.status) &&
				(sprint.open_task_ids.length > 0 || sprint.status === "active"),
		)
		.map((sprint) => sprint.id);
	const claimRoleCounts = claimState.claims.reduce(
		(acc: Record<string, number>, claim) => {
			const role = claim.role || "unspecified";
			acc[role] = (acc[role] || 0) + 1;
			return acc;
		},
		{},
	);
	const claimIsolationRows = claimState.claims.map((claim) => ({
		id: claim.id,
		role: claim.role || "unspecified",
		mode: claim.mode,
		task_id: claim.task_id,
		worktree_path: claim.worktree?.worktree_path,
		branch: claim.worktree?.branch,
		base_sha: claim.worktree?.base_sha,
		head_sha: claim.worktree?.head_sha,
		validated_sha: claim.worktree?.validated_sha,
		published_sha: claim.worktree?.published_sha,
		clean: claim.worktree?.clean,
		fresh_context: claim.worktree?.fresh_context,
	}));
	const taskScopeViews = Object.fromEntries(
		roadmapEntries.map((task) => [
			task.id,
			{
				kind: "task",
				id: task.id,
				task_ids: [task.id],
				open_task_ids: isOpenTaskStatus(String(task.status || "todo"))
					? [task.id]
					: [],
				sprint_ids: sprintByTaskId.get(task.id) || [],
				spec_paths: task.spec_paths || [],
				code_paths: task.code_paths || [],
			},
		]),
	);
	const hotBuildPaths = builds
		.filter((build) => {
			const lifecycleState = String(
				build.data?.lifecycle?.state ||
					build.data?.status ||
					build.status ||
					"",
			).trim();
			const validated = hasPassingValidationForBuild(build);
			const superseded = supersededByPath.has(normalizeCodewikiRef(build.path));
			const consumed =
				build.kind === "decision_build"
					? decisionConsumed(build)
					: build.kind === "planning_build"
						? planningConsumed(build)
						: false;
			return (
				!superseded &&
				!historicalColdBuild(build, lifecycleState) &&
				!isLifecycleComplete(lifecycleState) &&
				!validated &&
				!consumed
			);
		})
		.map((build) => normalizeCodewikiRef(build.path))
		.filter(Boolean);
	const passValidationPaths = validations
		.filter((v) => String(v.verdict || "") === "pass")
		.map((v) => v.path);
	const failValidationPaths = validations
		.filter((v) => {
			if (!["fail", "block"].includes(String(v.verdict || ""))) return false;
			const taskId = String(
				v.taskId || v.data?.task_id || v.data?.taskId || "",
			).trim();
			return !taskId || activeRoadmapTaskIds.has(taskId);
		})
		.map((v) => v.path);
	const archiveLedgers = builds
		.map((build) => buildArchiveLedger(build))
		.filter(Boolean) as NonNullable<ReturnType<typeof buildArchiveLedger>>[];
	const safelyArchivedTaskIds = new Set(
		builds
			.filter(
				(build) =>
					Boolean(buildArchiveLedger(build)) && publicationSafetyPassed(build),
			)
			.flatMap((build) => buildTaskIds(build)),
	);
	const gitArchivedBuildPaths = builds
		.filter((build) => Boolean(buildArchiveLedger(build)))
		.map((build) => normalizeCodewikiRef(build.path))
		.filter(Boolean);
	const purgeableBuilds = builds.filter((build) => {
		const lifecycleState = String(
			build.data?.lifecycle?.state || build.status || "",
		).trim();
		const validated = hasPassingValidationForBuild(build);
		return (
			lifecycleState === "purged" ||
			isPurgeableByGitArchive(build, lifecycleState, validated)
		);
	});
	const purgeableBuildPaths = purgeableBuilds
		.map((build) => normalizeCodewikiRef(build.path))
		.filter(Boolean);
	const purgeableBuildPathSet = new Set(purgeableBuildPaths);
	const purgeableTaskIds = Array.from(
		new Set(purgeableBuilds.flatMap((build) => buildTaskIds(build))),
	);
	const purgeableValidationPaths = validations
		.filter((validation) => {
			if (String(validation.verdict || "") !== "pass") return false;
			const taskId = String(
				validation.taskId ||
					validation.data?.task_id ||
					validation.data?.taskId ||
					"",
			).trim();
			const source = normalizeCodewikiRef(validation.data?.source);
			return (
				(taskId && safelyArchivedTaskIds.has(taskId)) ||
				(source && purgeableBuildPathSet.has(source))
			);
		})
		.map((validation) => normalizeCodewikiRef(validation.path))
		.filter(Boolean);
	const purgeableValidationPathSet = new Set(purgeableValidationPaths);
	const warmPassValidationPaths = passValidationPaths
		.map(normalizeCodewikiRef)
		.filter((path) => !purgeableValidationPathSet.has(path));
	const blockedArchiveBuildPaths = builds
		.filter((build) => {
			const lifecycleState = String(
				build.data?.lifecycle?.state || build.status || "",
			).trim();
			const validated = hasPassingValidationForBuild(build);
			return (
				canCompactColdBuild(build, lifecycleState, validated) &&
				!isPurgeableByGitArchive(build, lifecycleState, validated)
			);
		})
		.map((build) => normalizeCodewikiRef(build.path))
		.filter(Boolean);
	const gc = {
		policy: {
			hot_days: project.config.codewiki?.gc?.hot_days ?? 7,
			warm_days: project.config.codewiki?.gc?.warm_days ?? 30,
			cold_days: project.config.codewiki?.gc?.cold_days ?? 90,
			purge_days: project.config.codewiki?.gc?.purge_days ?? 180,
			sprint_close_hook: project.config.codewiki?.gc?.sprint_close_hook ?? true,
		},
		classes: {
			hot: {
				task_ids: openTaskIds,
				sprint_ids: activeSprintIds,
				build_paths: hotBuildPaths,
				validation_paths: failValidationPaths,
				claim_ids: claimState.claims.map((claim) => claim.id),
				claim_wait_ids: claimState.waiters.map((waiter) => waiter.id),
			},
			warm: {
				build_paths: builds
					.filter(
						(build) =>
							String(build.data?.lifecycle?.state || build.status || "") ===
								"accepted" &&
							!hotBuildPaths.includes(normalizeCodewikiRef(build.path)) &&
							!purgeableBuildPathSet.has(normalizeCodewikiRef(build.path)),
					)
					.map((build) => normalizeCodewikiRef(build.path))
					.filter(Boolean),
				validation_paths: warmPassValidationPaths.slice(0, 20),
			},
			cold: {
				task_ids: [...doneTaskIds, ...cancelledTaskIds],
				build_paths: builds
					.filter(
						(build) =>
							isLifecycleComplete(
								String(build.data?.lifecycle?.state || build.status || ""),
							) || hasPassingValidationForBuild(build),
					)
					.map((build) => normalizeCodewikiRef(build.path))
					.filter(Boolean),
			},
			purgeable: {
				task_ids: purgeableTaskIds,
				build_paths: purgeableBuildPaths,
				validation_paths: purgeableValidationPaths,
			},
		},
		sprint_close_hooks: [
			"mark consumed builds cold after downstream evidence exists",
			"move pass validation reports to warm/cold evidence",
			"checkpoint closed task shards",
			"purge expired runtime claims and pending diff tables",
		],
	};
	const cursorScope = activeSprintIds[0]
		? { kind: "sprint", id: activeSprintIds[0] }
		: openTaskIds[0]
			? { kind: "task", id: openTaskIds[0] }
			: { kind: "roadmap" };
	const workflowCursor = {
		active_loop: reconciliationAction.loop,
		reason: reconciliationAction.reason,
		input_refs: reconciliationAction.handoff_refs || [],
		expected_output:
			reconciliationAction.loop === "decision"
				? "decision_build"
				: reconciliationAction.loop === "planning"
					? "planning_build"
					: reconciliationAction.loop === "implementation"
						? "implementation_build"
						: reconciliationAction.loop === "validation"
							? "validation_report"
							: "observation",
		exit_gate:
			reconciliationAction.loop === "observe"
				? "no drift"
				: "validation pass or explicit user decision",
		scope: cursorScope,
		isolation: reconciliationAction.isolation,
		context_boundary: reconciliationAction.context_boundary,
		handoff_refs: reconciliationAction.handoff_refs || [],
	};

	// Construct Views
	const docPaths = sortedDocs.map((d) => d.path);
	const specPaths = sortedDocs
		.filter((d) => d.doc_type === "spec")
		.map((d) => d.path);
	const byGroup: Record<string, string[]> = {};
	for (const path of specPaths) {
		const parts = path.split("/");
		const group = parts.length > 2 ? parts[2] : "unknown";
		if (!byGroup[group]) byGroup[group] = [];
		byGroup[group].push(path);
	}
	const decisionPropagationRows = decisionPropagationAssessments.flatMap(
		(assessment) => [...assessment.rows, ...assessment.questions],
	);
	const decisionPropagationResiduals = decisionPropagationAssessments.flatMap(
		(assessment) => assessment.residuals,
	);
	const graphLensViews = buildGraphLensViews({
		nodes,
		edges,
		reconciliationItems,
		reconciliationAction,
		roadmapEntries,
		activeSprintIds,
		builds,
		validations,
		dirtyPaths,
		docPaths,
		specPaths,
		diagramRefCount: diagramInventory.refs.length,
		diagramParseIssueCount: diagramInventory.parse_issues.length,
		traceabilityRows,
		semanticChangeRows,
		validationAttestations,
		validationIsolationRows,
		canonicalSourceRefs: Array.from(canonicalSourceRefs).sort(),
		auditEvidenceRefs: Array.from(auditEvidenceRefSet).sort(),
		contentProofRefs: Array.from(contentProofRefSet).sort(),
		fileStructureDrift,
		claimState,
		gc,
	});
	applyDefaultLensCompaction(
		nodes,
		graphLensViews.default.next_action.source_id || "",
	);

	const views: GraphViews = {
		lenses: graphLensViews,
		docs: {
			all_paths: docPaths,
			spec_paths: specPaths,
			by_group: byGroup,
		},
		roadmap: {
			task_ids: roadmapEntries.map((t) => t.id),
			open_task_ids: openTaskIds,
			in_progress_task_ids: inProgressTaskIds,
			todo_task_ids: todoTaskIds,
			blocked_task_ids: blockedTaskIds,
			done_task_ids: doneTaskIds,
			cancelled_task_ids: cancelledTaskIds,
			status_counts: statusCounts,
			sprint_ids: sprintViews.map((sprint) => sprint.id),
			active_sprint_ids: activeSprintIds,
			sprints: sprintViews,
		},
		decision_propagation: {
			version: 1,
			model: "accepted-decision-row-to-roadmap-resolution",
			checked_decision_count: decisionPropagationAssessments.length,
			row_count: decisionPropagationRows.length,
			residual_count: decisionPropagationResiduals.length,
			assessments: decisionPropagationAssessments,
			residuals: decisionPropagationResiduals,
		},
		research: {
			collection_paths: research.map((c) => c.path),
			entry_ids: Array.from(new Set(researchEntryIds)).sort(),
		},
		code: {
			paths: Array.from(codePaths).sort(),
			dirty_paths: dirtyPaths,
		},
		claims: {
			active_claim_count: claimState.active_claim_count,
			warning_count: claimState.warning_count,
			conflict_count: claimState.conflict_count,
			pending_waiter_count: claimState.pending_waiter_count,
			ready_waiter_count: claimState.ready_waiter_count,
			by_role: claimRoleCounts,
			isolation: claimIsolationRows,
			claims: claimState.claims,
			conflicts: claimState.conflicts,
			waiters: claimState.waiters,
			artifact_statuses: claimState.artifact_statuses || [],
		},
		artifact_status: {
			in_use_count: claimState.active_claim_count,
			warning_count: claimState.warning_count,
			conflict_count: claimState.conflict_count,
			waiting_count: claimState.pending_waiter_count,
			ready_waiter_count: claimState.ready_waiter_count,
			artifacts: claimState.artifact_statuses || [],
		},
		validation: {
			isolation: validationIsolationRows,
		},
		alignment: {
			version: 1,
			model: "derived-vertical-state-machine",
			precedence: [
				"content_proof",
				"canonical_source",
				"gateway_policy",
				"audit_evidence",
				"graph_state",
				"validation_attestation",
				"session_memory",
			],
			graph_role: "required_gateway_input_not_canonical_truth",
			canonical_source_refs: Array.from(canonicalSourceRefs).sort(),
			audit_evidence_refs: Array.from(auditEvidenceRefSet).sort(),
			content_proof_refs: Array.from(contentProofRefSet).sort(),
			validation_attestations: validationAttestations,
		},
		system_diagrams: {
			diagram_paths: diagramInventory.diagrams
				.map((diagram) => diagram.path)
				.sort(),
			refs: diagramInventory.refs.map((ref) => ref.ref).sort(),
			by_category: Object.fromEntries(
				Object.entries(diagramRefsByCategory).map(([category, refs]) => [
					category,
					unique(refs).sort(),
				]),
			),
			docs_by_ref: Object.fromEntries(
				[...docsByDiagramRef.entries()]
					.sort(([a], [b]) => a.localeCompare(b))
					.map(([ref, docPaths]) => [ref, unique(docPaths).sort()]),
			),
			required_refs: diagramInventory.refs
				.filter((ref) => ref.requires_doc)
				.map((ref) => ref.ref)
				.sort(),
			parse_issue_count: diagramInventory.parse_issues.length,
		},
		file_structure: fileStructureDrift,
		traceability: {
			rows: traceabilityRows,
			semantic_change_rows: semanticChangeRows,
			semantic_change_gaps: semanticChangeRows.filter(
				(row) => row.gaps.length > 0,
			),
			gap_count:
				traceabilityRows.reduce(
					(count, row) =>
						count + (Array.isArray(row.gaps) ? row.gaps.length : 0),
					0,
				) +
				semanticChangeRows.reduce((count, row) => count + row.gaps.length, 0),
			gaps: [
				...traceabilityRows.filter(
					(row) => Array.isArray(row.gaps) && row.gaps.length > 0,
				),
				...semanticChangeRows.filter((row) => row.gaps.length > 0),
			],
		},
		scope_views: {
			roadmap: {
				kind: "roadmap",
				task_ids: roadmapEntries.map((task) => task.id),
				open_task_ids: openTaskIds,
				sprint_ids: sprintViews.map((sprint) => sprint.id),
			},
			sprints: Object.fromEntries(
				sprintViews.map((sprint) => [sprint.id, { kind: "sprint", ...sprint }]),
			),
			tasks: taskScopeViews,
		},
		workflow_cursor: workflowCursor,
		gc,
		archive: {
			restore_index: archiveLedgers,
			git_archive: {
				ledger_count: archiveLedgers.length,
				archive_refs: archiveLedgers.map((ledger) => ledger.archive_ref),
				build_paths: gitArchivedBuildPaths,
				blocked_purge_build_paths: blockedArchiveBuildPaths,
				gate: "validated + artifact digests + archive ledger + publication safety pass",
			},
		},
		reconciliation: {
			version: 1,
			controller: "reconciliation_gateway",
			model: "graph-backed-state-machine",
			items: reconciliationItems,
			counts_by_loop: reconciliationCounts,
			next_action: reconciliationAction,
			layer_states: {
				intent: layerHasDrift("intent") ? "drift" : "aligned",
				knowledge: layerHasDrift("knowledge") ? "drift" : "aligned",
				roadmap: layerHasDrift("roadmap") ? "drift" : "aligned",
				code: layerHasDrift("code") ? "drift" : "aligned",
				validation: layerHasDrift("validation") ? "drift" : "aligned",
			},
		},
	};

	return {
		version: 1,
		generated_at: nowIso(),
		nodes,
		edges,
		views,
	};
}
