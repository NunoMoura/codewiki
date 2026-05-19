import { isAcceptedBuildData } from "../domain/build/lifecycle.ts";
import { normalizeChangeType, normalizeTraceabilityExemption } from "../domain/change/traceability.ts";
import type { ChangeClaimsFile, GraphEdge, GraphFile, GraphNode, GraphViews, LintReport, RoadmapTaskRecord, WikiProject } from "../domain/shared/types.ts";
import { GitCache } from "./local/git-cache.ts";
import type { ParsedDoc } from "./knowledge/doc-parser.ts";
import { buildChangeClaimState, claimScopeLabels } from "./claims.ts";
import { unique } from "../domain/shared/utils.ts";

export interface GraphBuildInputs {
	project: WikiProject;
	docs: ParsedDoc[];
	research: any[];
	roadmapEntries: RoadmapTaskRecord[];
	roadmapSprints?: any[];
	archivedTaskIds?: string[];
	gitCache: GitCache;
	builds: { path: string; kind: string; taskId?: string; status?: string; data: any }[];
	validations: { path: string; taskId?: string; verdict?: string; data?: any }[];
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

type ReconciliationLoop = "feedback" | "documentation" | "planning" | "implementation" | "validation" | "observe";
type BuildArtifact = GraphBuildInputs["builds"][number];
type ValidationArtifact = GraphBuildInputs["validations"][number];

function reconciliationPriority(loop: ReconciliationLoop): number {
	return { feedback: 0, documentation: 1, planning: 2, implementation: 3, validation: 4, observe: 5 }[loop];
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
			reason: "Gateway validation must not reuse builder thought context and must cite checked content proof.",
			evidence: ["fresh_context=true", "clean state recorded", "validated_sha/head_sha/published_sha/tree_sha or working_tree_digest", "task-close/publication profiles require clean publisher result proof"],
			handoff: "submitted build -> validation gateway",
			profiles: ["implementation", "task-close", "publication", "publish", "release"],
		};
	}
	return {
		required: false,
		mode: "agent-owned-new-session",
		reason: "Compiler loops start from CodeWiki source refs; agents may refresh context when chat is noisy, stale, or token-heavy.",
		evidence: ["source build/task refs read", "new_session or context_refresh when useful"],
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
	return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\.codewiki\//, "codewiki/");
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
	return configuredGeneratedPaths(project).some((scope) => pathMatchesScope(path, scope));
}

function isCodewikiDataPath(path: string): boolean {
	return normalizeScopePath(path).startsWith("codewiki/");
}

function isPathDirty(dirtyPaths: string[], codePath: string): boolean {
	return dirtyPaths.some((dirtyPath) => dirtyPath === codePath || dirtyPath.startsWith(`${codePath}/`) || codePath.startsWith(`${dirtyPath}/`));
}

function pathsOverlap(left: string, right: string): boolean {
	const a = normalizeScopePath(left);
	const b = normalizeScopePath(right);
	return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`) || pathMatchesScope(a, b) || pathMatchesScope(b, a);
}

function isAcceptedBuild(build: BuildArtifact): boolean {
	return isAcceptedBuildData(build.data, build.status);
}

function isSemanticTraceability(build: BuildArtifact, fallbackChangeType: string): boolean {
	const exemption = normalizeTraceabilityExemption(build.data?.traceability?.exemption ?? build.data?.traceability?.change_class ?? build.data?.change_class);
	if (typeof build.data?.traceability?.semantic === "boolean") return build.data.traceability.semantic;
	return Boolean(normalizeChangeType(build.data?.traceability?.change_type ?? build.data?.change_type ?? build.data?.traceability?.change_class ?? build.data?.change_class, fallbackChangeType)) && !exemption;
}

function classifySemanticPath(project: WikiProject, path: string): string | null {
	const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
	if (!normalized || isGeneratedPath(project, normalized)) return null;
	if (normalized === ".codewiki/index_graph.json" || normalized.startsWith(".codewiki/roadmap/tasks/")) return null;
	if (normalized.startsWith(".codewiki/session/") || normalized.startsWith(".codewiki/runtime/")) return null;
	if (normalized.startsWith(".codewiki/builds/") || normalized.startsWith(".codewiki/validation/")) return null;
	if (normalized.startsWith(".codewiki/kb/product/")) return "product";
	if (normalized.startsWith(".codewiki/kb/system/") || normalized === ".codewiki/kb/lexicon.md") return "system";
	if (normalized === ".codewiki/roadmap/queue.json") return "task";
	if (normalized === "package.json" || normalized === "package-lock.json") return "system";
	if (normalized.startsWith("skills/codewiki/") || normalized.startsWith("src/application/tools/audit") || normalized.startsWith("scripts/check-architecture")) return "system";
	if (normalized.startsWith("tests/") || normalized.startsWith("src/") || normalized.startsWith("scripts/")) return "code";
	if (normalized === "README.md" || normalized.startsWith("docs/")) return "system";
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

function buildCoversSemanticPath(build: BuildArtifact, path: string, changeType: string): boolean {
	if (!isAcceptedBuild(build)) return false;
	if (!isSemanticTraceability(build, changeType)) return false;
	const refs = refsFromBuild(build);
	if (refs.some((ref) => pathsOverlap(ref, path))) return true;
	if (path === ".codewiki/roadmap/queue.json" && refs.some((ref) => /^TASK-\d+/.test(ref))) return true;
	return false;
}

function isActionableLintIssue(issue: any): boolean {
	return String(issue?.kind || "") !== "large-doc";
}

function buildReconciliationAction(items: any[]) {
	const active = items
		.filter((item) => String(item.state || "") !== "aligned")
		.sort((a, b) => {
			const p = reconciliationPriority(a.next_loop || "observe") - reconciliationPriority(b.next_loop || "observe");
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
		feedback: "Run feedback compiler",
		documentation: "Run documentation compiler",
		planning: "Run planning compiler",
		implementation: first.task_id ? `/wiki-resume ${first.task_id}` : "/wiki-resume",
		validation: "Run validation gateway",
		observe: "Observe — graph aligned",
	};
	const loop = first.next_loop as ReconciliationLoop;
	const isolation = loopIsolationRequirement(loop);
	const handoffRefs = unique([
		String(first.source_id || ""),
		String(first.task_id || ""),
		...(Array.isArray(first.doc_paths) ? first.doc_paths.map(String) : []),
	].map((ref) => ref.trim()).filter(Boolean));
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
	if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
	const single = String(value || "").trim();
	return single ? [single] : [];
}

function normalizeCodewikiRef(value: any): string {
	const ref = String(value || "").trim().replace(/\\/g, "/");
	if (!ref) return "";
	if (ref.startsWith(".codewiki/")) return ref;
	if (ref.startsWith("codewiki/")) return `.${ref}`;
	if (ref.startsWith("builds/") || ref.startsWith("validation/")) return `.codewiki/${ref}`;
	return ref;
}

function buildRefs(data: any, key: "feedback" | "documentation" | "planning" | "implementation"): string[] {
	return [
		...stringList(data?.linked_builds?.[key]),
		...stringList(data?.consumes?.[key]),
	].map(normalizeCodewikiRef).filter(Boolean);
}

function consumedBuildRefs(data: any): string[] {
	return [
		...stringList(data?.source_feedback_build),
		...stringList(data?.source_documentation_build),
		...stringList(data?.source_planning_build),
		...stringList(data?.consumes?.feedback),
		...stringList(data?.consumes?.documentation),
		...stringList(data?.consumes?.planning),
		...stringList(data?.consumes?.implementation),
	].map(normalizeCodewikiRef).filter(Boolean);
}

function producedRefs(data: any, key: "knowledge" | "roadmap" | "code" | "tests" | "validation" | "publication" | "closure"): string[] {
	return stringList(data?.produces?.[key]).map(normalizeCodewikiRef).filter(Boolean);
}

function buildTaskIds(build: BuildArtifact): string[] {
	const data = build.data || {};
	return Array.from(new Set([
		...stringList(build.taskId),
		...stringList(data.task_id),
		...stringList(data.taskId),
		...stringList(data.task?.id),
		...stringList(data.roadmap_work_items),
		...stringList(data.task_ids),
		...stringList(data.consumes?.roadmap),
		...stringList(data.produces?.roadmap),
	].map((id) => id.trim()).filter((id) => /^TASK-/.test(id))));
}

function firstTaskId(build: BuildArtifact): string | undefined {
	return buildTaskIds(build)[0];
}

function hasActionableLowerLayerDelta(build: BuildArtifact | undefined): boolean {
	if (!build) return false;
	const delta = build.data?.lower_layer_delta || {};
	return stringList(delta.roadmap).length > 0 || stringList(delta.code).length > 0 || producedRefs(build.data, "roadmap").length > 0 || producedRefs(build.data, "code").length > 0 || producedRefs(build.data, "tests").length > 0;
}

function hasRoadmapChanges(build: BuildArtifact): boolean {
	return stringList(build.data?.roadmap_changes).length > 0 || producedRefs(build.data, "roadmap").length > 0;
}

function isLifecycleComplete(state: string): boolean {
	return ["consumed", "validated", "archived", "purged"].includes(state);
}

function buildArchiveLedger(build: BuildArtifact) {
	const publication = build.data?.publication || {};
	const ledger = publication.archive_ledger || {};
	const git = publication.git || {};
	const taskId = firstTaskId(build) || String(build.data?.task_id || ledger.id || "").trim();
	const archiveRef = String(ledger.archive_ref || git.archive_ref || "").trim();
	if (!taskId || !archiveRef) return null;
	return {
		kind: String(ledger.kind || "task"),
		id: String(ledger.id || taskId),
		build_path: normalizeCodewikiRef(ledger.build_path || build.path),
		archive_ref: archiveRef,
		commit_sha: String(ledger.commit_sha || git.commit_sha || "").trim(),
		digest: String(ledger.digest || "").trim(),
		restore_command: String(ledger.restore_command || git.restore?.command || `/wiki-restore ${taskId}`).trim(),
		safety_status: publication.push_readiness?.safe_to_push === true ? "safe_to_push" : "blocked",
	};
}

function hasArtifactDigestCapture(build: BuildArtifact): boolean {
	return Array.isArray(build.data?.publication?.artifact_digests?.files) && build.data.publication.artifact_digests.files.length > 0;
}

function publicationSafetyPassed(build: BuildArtifact): boolean {
	return build.data?.publication?.push_readiness?.safe_to_push === true;
}


function evidenceRefsFromItems(value: any, keys: string[] = ["ref", "path", "id", "digest", "sha", "commit_sha", "tree_sha", "package_digest", "archive_ref", "remote_ref"]): string[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		if (typeof item === "string") return [item];
		if (!item || typeof item !== "object") return [];
		return keys.map((key) => item[key]).filter(Boolean).map(String);
	});
}

function normalizeEvidenceRef(value: any): string {
	return String(value || "").trim().replace(/\\/g, "/");
}

function auditEvidenceRefs(data: any): string[] {
	return unique([
		...stringList(data?.audit_refs),
		...stringList(data?.audit_reports),
		...stringList(data?.policy?.audit_refs),
		...stringList(data?.policy?.required_audits).map((profile) => `profile:${profile}`),
		...evidenceRefsFromItems(data?.audits),
		...evidenceRefsFromItems(data?.audit_results),
		...evidenceRefsFromItems(data?.policy?.audits),
		...evidenceRefsFromItems(data?.policy?.audit_results),
	]).map(normalizeEvidenceRef).filter(Boolean);
}

function contentProofRefs(data: any): string[] {
	const publication = data?.publication || {};
	const git = publication.git || {};
	const ledger = publication.archive_ledger || {};
	const pushReadiness = publication.push_readiness || {};
	const isolation = data?.isolation || {};
	const artifactFiles = Array.isArray(publication.artifact_digests?.files) ? publication.artifact_digests.files : [];
	const artifactRefs = artifactFiles.flatMap((file: any) => {
		const filePath = String(file?.path || "").trim();
		const digest = String(file?.digest || file?.sha256 || file?.hash || "").trim();
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
	]).map(normalizeEvidenceRef).filter(Boolean);
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
	return unique([
		...producedRefs(build.data, "publication"),
		...stringList(build.data?.publication_refs),
		publication.safe_to_push === true ? "safe_to_push" : "",
		publication.push_readiness?.safe_to_push === true ? "push_readiness.safe_to_push" : "",
		publication.published_sha ? "published_sha" : "",
	].map(normalizeEvidenceRef).filter(Boolean));
}

function canonicalSourceRefsForBuild(build: BuildArtifact): string[] {
	return unique([
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
	].map(normalizeEvidenceRef).filter(Boolean));
}

function canCompactColdBuild(build: BuildArtifact, lifecycleState: string, validated: boolean): boolean {
	return build.kind === "implementation_build" && Boolean(buildArchiveLedger(build)) && (validated || isLifecycleComplete(lifecycleState));
}

function isPurgeableByGitArchive(build: BuildArtifact, lifecycleState: string, validated: boolean): boolean {
	return canCompactColdBuild(build, lifecycleState, validated) && hasArtifactDigestCapture(build) && publicationSafetyPassed(build);
}

function validationIsolationSummary(validation: { path: string; taskId?: string; verdict?: string; data?: any }) {
	const isolation = validation.data?.isolation || null;
	const proofRefs = contentProofRefs(validation.data);
	const profile = String(validation.data?.profile || "").trim().toLowerCase();
	const immutableProfile = ["task-close", "publication", "publish", "release"].includes(profile);
	const hasImmutableProof = Boolean(isolation?.validated_sha || isolation?.head_sha || isolation?.published_sha || isolation?.tree_sha || isolation?.package_digest || isolation?.archive_ref || isolation?.remote_ref);
	const hasPublisherProof = Boolean(isolation?.published_sha || isolation?.tree_sha || isolation?.archive_ref || isolation?.remote_ref);
	const hasWorkingTreeProof = Boolean(isolation?.working_tree_digest || isolation?.worktree_digest);
	const isolated = immutableProfile
		? isolation?.fresh_context === true && isolation?.clean === true && hasPublisherProof
		: isolation?.fresh_context === true && typeof isolation?.clean === "boolean" && (hasImmutableProof || hasWorkingTreeProof || proofRefs.length > 0);
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
		publisher_result_refs: [isolation?.published_sha, isolation?.tree_sha, isolation?.archive_ref, isolation?.remote_ref].map((value) => String(value || "").trim()).filter(Boolean),
	};
}

function indexPush(map: Map<string, BuildArtifact[]>, key: string, build: BuildArtifact) {
	const normalized = normalizeCodewikiRef(key);
	if (!normalized) return;
	if (!map.has(normalized)) map.set(normalized, []);
	const list = map.get(normalized)!;
	if (!list.some((item) => normalizeCodewikiRef(item.path) === normalizeCodewikiRef(build.path))) list.push(build);
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
	const { project, docs, research, roadmapEntries, roadmapSprints = [], archivedTaskIds = [], gitCache, builds, validations, testFiles, claims, lintReport } = inputs;
	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];
	const seenNodes = new Set<string>();
	const seenEdges = new Set<string>();

	const addNode = (nodeId: string, payload: Partial<GraphNode>) => {
		if (!nodeId || seenNodes.has(nodeId)) return;
		seenNodes.add(nodeId);
		nodes.push({ id: nodeId, kind: payload.kind || "unknown", ...payload });
	};

	const addEdge = (kind: string, source: string, target: string, payload: Partial<GraphEdge> = {}) => {
		if (!source || !target) return;
		const key = `${kind}:${source}->${target}`;
		if (seenEdges.has(key)) return;
		seenEdges.add(key);
		edges.push({ kind, from: source, to: target, ...payload });
	};
	const addCanonicalSourceRef = (ownerId: string, ref: string, edgeKind: string) => {
		const normalized = normalizeEvidenceRef(ref);
		if (!normalized) return;
		canonicalSourceRefs.add(normalized);
		const nodeId = `source:${normalized}`;
		addNode(nodeId, { kind: "canonical_source_ref", path: normalized, layer: "source", default_hidden: true });
		addEdge(edgeKind, ownerId, nodeId, { default_hidden: true });
	};
	const addAuditEvidenceRef = (ownerId: string, ref: string, edgeKind: string) => {
		const normalized = normalizeEvidenceRef(ref);
		if (!normalized) return;
		auditEvidenceRefSet.add(normalized);
		const nodeId = `audit:${normalized}`;
		addNode(nodeId, { kind: "audit_evidence", path: normalized, layer: "audit", default_hidden: true });
		addEdge(edgeKind, ownerId, nodeId, { default_hidden: true });
	};
	const addContentProofRef = (ownerId: string, ref: string, edgeKind: string) => {
		const normalized = normalizeEvidenceRef(ref);
		if (!normalized) return;
		contentProofRefSet.add(normalized);
		const nodeId = `content_proof:${normalized}`;
		addNode(nodeId, { kind: "content_proof", path: normalized, proof_kind: contentProofKind(normalized), layer: "content_proof", default_hidden: true });
		addEdge(edgeKind, ownerId, nodeId, { default_hidden: true });
	};

	const codePaths = new Set<string>();
	const canonicalSourceRefs = new Set<string>();
	const auditEvidenceRefSet = new Set<string>();
	const contentProofRefSet = new Set<string>();
	const validationAttestations: any[] = [];
	const researchEntryIds: string[] = [];
	const docsByCodePath = new Map<string, string[]>();
	const openTasksBySpec = new Map<string, string[]>();
	const openTaskCodeScopes: { path: string; taskId: string }[] = [];
	const normalizedSprints = roadmapSprints.map((sprint: any) => ({
		id: String(sprint?.id || "").trim(),
		title: String(sprint?.title || sprint?.id || "").trim(),
		status: String(sprint?.status || "planned").trim(),
		outcome: String(sprint?.outcome || sprint?.summary || "").trim(),
		task_ids: stringList(sprint?.task_ids).filter((id) => /^TASK-/.test(id)),
		scope: sprint?.scope || {},
		budget: sprint?.budget || {},
		gates: stringList(sprint?.gates),
	})).filter((sprint) => sprint.id);
	const sprintByTaskId = new Map<string, string[]>();
	for (const sprint of normalizedSprints) {
		for (const taskId of sprint.task_ids) {
			if (!sprintByTaskId.has(taskId)) sprintByTaskId.set(taskId, []);
			sprintByTaskId.get(taskId)!.push(sprint.id);
		}
	}
	const archivedTaskIdSet = new Set(archivedTaskIds.map((id) => String(id || "").trim()).filter(Boolean));
	const activeRoadmapTaskIds = new Set(roadmapEntries.filter((task) => isOpenTaskStatus(String(task.status || ""))).map((task) => task.id));
	let dirtyPaths: string[] = [];
	let rawDirtyPaths: string[] = [];
	try {
		rawDirtyPaths = gitCache.getDirtyPaths();
		dirtyPaths = rawDirtyPaths.filter((path) => !isGeneratedPath(project, path) && !isCodewikiDataPath(path));
	} catch {
		rawDirtyPaths = [];
		dirtyPaths = [];
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
			group: doc.doc_type === "spec" && doc.path.includes("/") ? doc.path.split("/")[0] : "",
		});

		for (const target of doc.links) {
			addEdge("doc_link", docId, `doc:${target}`);
		}
		for (const codePath of doc.code_paths) {
			codePaths.add(codePath);
			if (!docsByCodePath.has(codePath)) docsByCodePath.set(codePath, []);
			docsByCodePath.get(codePath)!.push(doc.path);
			const isDirty = !isGeneratedPath(project, codePath) && isPathDirty(dirtyPaths, codePath);
			addNode(`code:${codePath}`, { kind: "code_path", path: codePath, layer: "code", alignment_state: isDirty ? "drift" : "aligned" });
			addEdge("doc_code_path", docId, `code:${codePath}`);
		}
	}

	// Process Research Collections
	for (const collection of research) {
		const collectionPath = typeof collection.path === "string" ? collection.path.trim() : "";
		const collectionId = `research_collection:${collectionPath}`;
		addNode(collectionId, { kind: "research_collection", path: collectionPath });

		for (const entry of Array.isArray(collection.entries) ? collection.entries : []) {
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
			alignment_state: ["closed", "cancelled"].includes(sprint.status) ? "aligned" : "drift",
		});
		for (const taskId of sprint.task_ids) addEdge("sprint_task", sprintNodeId, `task:${taskId}`);
		for (const docPath of stringList(sprint.scope?.knowledge)) addEdge("sprint_knowledge_scope", sprintNodeId, `doc:${docPath}`);
		for (const codePath of stringList(sprint.scope?.code)) {
			codePaths.add(codePath);
			addNode(`code:${codePath}`, { kind: "code_path", path: codePath, layer: "code" });
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
		}
		for (const codePath of task.code_paths || []) {
			codePaths.add(codePath);
			if (isOpenTaskStatus(status)) openTaskCodeScopes.push({ path: codePath, taskId });
			const isDirty = !isGeneratedPath(project, codePath) && isPathDirty(dirtyPaths, codePath);
			addNode(`code:${codePath}`, { kind: "code_path", path: codePath, layer: "code", alignment_state: isDirty ? "drift" : "aligned" });
			addEdge("task_code_path", taskNodeId, `code:${codePath}`);
		}
		for (const researchId of task.research_ids || []) {
			addEdge("task_research", taskNodeId, `research_entry:${researchId}`);
		}
	}

	// Process Test Files
	for (const testFilePath of testFiles) {
		const testNodeId = `test:${testFilePath}`;
		addNode(testNodeId, { kind: "test_file", path: testFilePath });
		for (const codePath of codePaths) {
			if (testFilePath.includes(codePath.replace(/\\.[^.]+$/, "")) || codePath.includes(testFilePath.replace(/\\.[^.]+$/, ""))) {
				addEdge("test_code", testNodeId, `code:${codePath}`);
			}
		}
	}

	// Process Builds
	const buildTaskMap = new Map<string, string[]>();
	const reconciliationItems: any[] = [];
	const buildsByPath = new Map<string, BuildArtifact>();
	const documentationByFeedback = new Map<string, BuildArtifact[]>();
	const planningByDocumentation = new Map<string, BuildArtifact[]>();
	const implementationByPlanning = new Map<string, BuildArtifact[]>();
	const implementationByDocumentation = new Map<string, BuildArtifact[]>();
	const implementationByFeedback = new Map<string, BuildArtifact[]>();

	for (const build of builds) {
		const buildPath = normalizeCodewikiRef(build.path);
		if (buildPath) buildsByPath.set(buildPath, build);
	}
	const supersededByPath = new Map<string, string[]>();
	for (const build of builds) {
		const buildPath = normalizeCodewikiRef(build.path);
		for (const ref of [...stringList(build.data?.cycle?.supersedes), ...stringList(build.data?.supersedes)].map(normalizeCodewikiRef)) {
			if (!ref) continue;
			if (!supersededByPath.has(ref)) supersededByPath.set(ref, []);
			supersededByPath.get(ref)!.push(buildPath);
		}
	}
	for (const build of builds) {
		if (build.kind === "documentation_build") {
			indexPush(documentationByFeedback, build.data?.source_feedback_build, build);
			for (const ref of buildRefs(build.data, "feedback")) {
				indexPush(documentationByFeedback, ref, build);
			}
		} else if (build.kind === "planning_build") {
			indexPush(planningByDocumentation, build.data?.source_documentation_build, build);
			for (const ref of buildRefs(build.data, "documentation")) {
				indexPush(planningByDocumentation, ref, build);
			}
		} else if (build.kind === "implementation_build") {
			for (const ref of [normalizeCodewikiRef(build.data?.source_planning_build), ...buildRefs(build.data, "planning")]) {
				indexPush(implementationByPlanning, ref, build);
			}
			for (const ref of [normalizeCodewikiRef(build.data?.source_documentation_build), ...buildRefs(build.data, "documentation")]) {
				indexPush(implementationByDocumentation, ref, build);
			}
			for (const ref of buildRefs(build.data, "feedback")) {
				indexPush(implementationByFeedback, ref, build);
			}
		}
	}

	const hasPassingValidationForBuild = (build: BuildArtifact) => {
		const buildPath = normalizeCodewikiRef(build.path);
		const taskIds = new Set(buildTaskIds(build));
		const archiveLedger = buildArchiveLedger(build);
		const validationRefs = new Set([...stringList(build.data?.validation_refs), ...producedRefs(build.data, "validation")].map(normalizeCodewikiRef).filter(Boolean));
		if (String(build.data?.validation_verdict?.verdict || "").trim() === "pass") return true;
		if (archiveLedger && publicationSafetyPassed(build)) return true;
		if (build.kind === "implementation_build" && taskIds.size > 0 && [...taskIds].every((taskId) => archivedTaskIdSet.has(taskId) || !activeRoadmapTaskIds.has(taskId))) return true;
		return validations.some((validation: ValidationArtifact) => {
			if (String(validation.verdict || "") !== "pass") return false;
			const sources = [normalizeCodewikiRef(validation.data?.source), ...stringList(validation.data?.sources).map(normalizeCodewikiRef)].filter(Boolean);
			if (sources.includes(buildPath)) return true;
			if (validationRefs.has(normalizeCodewikiRef(validation.path))) return true;
			const profile = String(validation.data?.profile || "").trim();
			return Boolean(validation.taskId && taskIds.has(validation.taskId) && ["implementation", "task-close"].includes(profile) && sources.length === 0);
		});
	};
	const feedbackConsumed = (build: BuildArtifact) => {
		const buildPath = normalizeCodewikiRef(build.path);
		return Boolean(
			documentationByFeedback.get(buildPath)?.length ||
			implementationByFeedback.get(buildPath)?.length ||
			hasPassingValidationForBuild(build)
		);
	};
	const documentationConsumed = (build: BuildArtifact) => {
		const buildPath = normalizeCodewikiRef(build.path);
		const sourceFeedback = buildsByPath.get(normalizeCodewikiRef(build.data?.source_feedback_build));
		const expectsPlanning = hasActionableLowerLayerDelta(sourceFeedback);
		return Boolean(
			planningByDocumentation.get(buildPath)?.length ||
			hasRoadmapChanges(build) ||
			implementationByDocumentation.get(buildPath)?.length ||
			hasPassingValidationForBuild(build) ||
			!expectsPlanning
		);
	};
	const planningConsumed = (build: BuildArtifact) => {
		const buildPath = normalizeCodewikiRef(build.path);
		return Boolean(
			hasRoadmapChanges(build) ||
			implementationByPlanning.get(buildPath)?.length ||
			hasPassingValidationForBuild(build)
		);
	};
	const buildLinkedToOpenTask = (build: BuildArtifact) => {
		const buildPath = normalizeCodewikiRef(build.path);
		const taskIds = buildTaskIds(build);
		if (taskIds.some((taskId) => activeRoadmapTaskIds.has(taskId))) return true;
		return roadmapEntries.some((task) => isOpenTaskStatus(String(task.status || "")) && [...stringList(task.spec_paths), ...stringList(task.code_paths)].some((path) => normalizeCodewikiRef(path) === buildPath));
	};
	const buildDirty = (build: BuildArtifact) => rawDirtyPaths.some((path) => normalizeCodewikiRef(path) === normalizeCodewikiRef(build.path));
	const historicalColdBuild = (build: BuildArtifact, lifecycleState: string) => {
		if (archivedTaskIdSet.size === 0) return false;
		if (buildDirty(build) || buildLinkedToOpenTask(build)) return false;
		return ["accepted", "applied", "validated", "archived"].includes(lifecycleState);
	};
	for (const build of builds) {
		const buildPath = normalizeCodewikiRef(build.path);
		const lifecycleState = String(build.data?.lifecycle?.state || build.data?.status || build.status || "").trim() || "unknown";
		const buildValidated = hasPassingValidationForBuild(build);
		const superseded = supersededByPath.has(buildPath);
		const consumed = build.kind === "feedback_build" ? feedbackConsumed(build) : build.kind === "documentation_build" ? documentationConsumed(build) : build.kind === "planning_build" ? planningConsumed(build) : false;
		const historicalCold = historicalColdBuild(build, lifecycleState);
		const buildAlignmentState = superseded || isLifecycleComplete(lifecycleState) || buildValidated || consumed || historicalCold ? "aligned" : "drift";
		const archiveLedger = buildArchiveLedger(build);
		const compactCold = canCompactColdBuild(build, lifecycleState, buildValidated);
		const buildId = `build:${buildPath}`;
		const buildCanonicalRefs = canonicalSourceRefsForBuild(build);
		const buildAuditRefs = auditEvidenceRefs(build.data);
		const buildContentProofRefs = contentProofRefs(build.data);
		addNode(buildId, {
			kind: build.kind as any,
			path: buildPath,
			title: build.data?.source_feedback_build || build.data?.source || buildPath,
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
				validation_attestation_refs: [...stringList(build.data?.validation_refs), ...producedRefs(build.data, "validation")].map(normalizeCodewikiRef).filter(Boolean),
			},
		});
		for (const ref of buildCanonicalRefs) addCanonicalSourceRef(buildId, ref, "build_references_canonical_source");
		for (const ref of buildAuditRefs) addAuditEvidenceRef(buildId, ref, "build_audit_evidence");
		for (const ref of buildContentProofRefs) addContentProofRef(buildId, ref, "build_content_proof");
		if (!superseded && !historicalCold && build.kind === "feedback_build" && lifecycleState === "proposed") {
			reconciliationItems.push({
				id: `reconcile:${buildPath}`,
				source_id: buildId,
				state: "drift",
				direction: "downward",
				from_layer: "intent",
				to_layer: "knowledge",
				next_loop: "feedback",
				reason: "Feedback build is proposed; confirm or reject intent before documentation changes.",
			});
		} else if (!superseded && !historicalCold && build.kind === "feedback_build" && lifecycleState === "accepted" && !feedbackConsumed(build)) {
			reconciliationItems.push({
				id: `reconcile:${buildPath}`,
				source_id: buildId,
				state: "drift",
				direction: "downward",
				from_layer: "intent",
				to_layer: "knowledge",
				next_loop: "documentation",
				reason: "Accepted feedback build has no downstream documentation, implementation, or validation evidence yet.",
			});
		} else if (!superseded && !historicalCold && build.kind === "documentation_build" && lifecycleState === "accepted" && !documentationConsumed(build)) {
			reconciliationItems.push({
				id: `reconcile:${buildPath}`,
				source_id: buildId,
				state: "drift",
				direction: "downward",
				from_layer: "knowledge",
				to_layer: "roadmap",
				next_loop: "planning",
				reason: "Accepted documentation build has actionable downstream delta but no planning build, roadmap change, implementation link, or validation evidence yet.",
			});
		} else if (!superseded && !historicalCold && build.kind === "planning_build" && lifecycleState === "accepted" && !planningConsumed(build)) {
			reconciliationItems.push({
				id: `reconcile:${buildPath}`,
				source_id: buildId,
				state: "drift",
				direction: "downward",
				from_layer: "roadmap",
				to_layer: "code",
				next_loop: "planning",
				reason: "Accepted planning build has no roadmap task, implementation link, or validation evidence yet.",
			});
		} else if (!superseded && !historicalCold && build.kind === "implementation_build" && lifecycleState === "accepted" && !buildValidated) {
			reconciliationItems.push({
				id: `reconcile:${buildPath}`,
				source_id: buildId,
				state: "drift",
				direction: "gateway",
				from_layer: "build",
				to_layer: "validation",
				next_loop: "validation",
				task_id: firstTaskId(build),
				reason: "Accepted implementation build still needs passing validation gateway evidence.",
			});
		} else if (!superseded && !historicalCold && ["documentation_build", "planning_build", "implementation_build"].includes(build.kind) && lifecycleState === "applied" && !buildValidated) {
			reconciliationItems.push({
				id: `reconcile:${buildPath}`,
				source_id: buildId,
				state: "drift",
				direction: "gateway",
				from_layer: "build",
				to_layer: "validation",
				next_loop: "validation",
				task_id: firstTaskId(build),
				reason: "Applied compiler build still needs validation gateway evidence.",
			});
		}
		const publicationClaims = publicationClaimRefs(build);
		if (!superseded && !historicalCold && !isLifecycleComplete(lifecycleState) && publicationClaims.length > 0 && buildContentProofRefs.length === 0) {
			reconciliationItems.push({
				id: `reconcile:publication-proof:${buildPath}`,
				source_id: buildId,
				state: "drift",
				direction: "gateway",
				from_layer: "publication",
				to_layer: "content_proof",
				next_loop: "validation",
				task_id: firstTaskId(build),
				reason: "Publication claim lacks immutable content proof such as commit/tree SHA, package digest, archive ledger, or remote ref.",
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
			addNode(archiveNodeId, { kind: "git_archive_ref", path: archiveLedger.archive_ref, task_id: archiveLedger.id, digest: archiveLedger.digest, restore_command: archiveLedger.restore_command, safety_status: archiveLedger.safety_status, default_hidden: true, layer: "archive" });
			addEdge("build_archive_ref", buildId, archiveNodeId, { default_hidden: true });
		}
		if (compactCold) continue;
		for (const ref of consumedBuildRefs(build.data)) {
			if (ref) addEdge("build_derives_from", buildId, `build:${ref}`);
		}
		for (const ref of stringList(build.data?.consumes?.roadmap)) {
			if (/^TASK-/.test(ref)) addEdge("build_consumes_task", buildId, `task:${ref}`);
		}
		for (const ref of stringList(build.data?.consumes?.planning).map(normalizeCodewikiRef)) {
			if (ref) addEdge("build_consumes_planning", buildId, `build:${ref}`);
		}
		for (const ref of stringList(build.data?.consumes?.validation).map(normalizeCodewikiRef)) {
			if (ref) addEdge("build_consumes_validation", buildId, `validation:${ref}`);
		}
		for (const ref of stringList(build.data?.consumes?.source).map(normalizeCodewikiRef)) {
			if (ref) addEdge("build_consumes_source", buildId, `source:${ref}`);
		}
		for (const ref of producedRefs(build.data, "knowledge")) {
			addEdge("build_produces_knowledge", buildId, `doc:${ref}`);
		}
		for (const ref of producedRefs(build.data, "roadmap")) {
			if (/^TASK-/.test(ref)) addEdge("build_produces_task", buildId, `task:${ref}`);
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
			if (v.path.includes(build.path.replace(/\\.[^.]+$/, "")) || build.path.includes(v.path.replace(/\\.[^.]+$/, ""))) {
				addEdge("build_validated_by", buildId, `validation:${v.path}`);
			}
		}
	}

	const traceabilityRows: any[] = [];
	const semanticChangeRows = unique(rawDirtyPaths)
		.map((path) => ({ path, change_type: classifySemanticPath(project, path) }))
		.filter((row): row is { path: string; change_type: string } => Boolean(row.change_type))
		.map((row) => {
			const accepted_build_refs = builds
				.filter((build) => buildCoversSemanticPath(build, row.path, row.change_type))
				.map((build) => normalizeCodewikiRef(build.path));
			const gaps = accepted_build_refs.length > 0 ? [] : ["missing_accepted_build_coverage"];
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
			from_layer: row.change_type === "code" ? "code" : row.change_type === "task" ? "roadmap" : "knowledge",
			to_layer: "build",
			next_loop: row.change_type === "product" || row.change_type === "system" ? "feedback" : row.change_type === "task" ? "planning" : "implementation",
			reason: `Semantic ${row.change_type} change ${row.path} lacks accepted compiler build coverage.`,
			gaps: row.gaps,
			change_type: row.change_type,
		});
	}
	for (const feedback of builds.filter((build) => {
		if (build.kind !== "feedback_build") return false;
		const lifecycleState = String(build.data?.lifecycle?.state || build.data?.status || build.status || "").trim() || "unknown";
		const buildPath = normalizeCodewikiRef(build.path);
		if (supersededByPath.has(buildPath) || historicalColdBuild(build, lifecycleState)) return false;
		const downstreamDocs = documentationByFeedback.get(buildPath) || [];
		const downstreamPlanning = downstreamDocs.flatMap((docBuild) => planningByDocumentation.get(normalizeCodewikiRef(docBuild.path)) || []);
		const downstreamTaskIds = unique([
			...downstreamDocs.flatMap((docBuild) => producedRefs(docBuild.data, "roadmap")),
			...downstreamPlanning.flatMap((planningBuild) => buildTaskIds(planningBuild)),
		].filter((ref) => /^TASK-/.test(ref)));
		const hasOpenDownstreamTask = downstreamTaskIds.some((taskId) => activeRoadmapTaskIds.has(taskId));
		const needsTraceabilityFollowUp = hasActionableLowerLayerDelta(build) && downstreamDocs.some((docBuild) => !documentationConsumed(docBuild));
		return !feedbackConsumed(build) || buildLinkedToOpenTask(build) || buildDirty(build) || hasOpenDownstreamTask || needsTraceabilityFollowUp;
	})) {
		const feedbackPath = normalizeCodewikiRef(feedback.path);
		const explicitRequirements = Array.isArray(feedback.data?.requirements) ? feedback.data.requirements : [];
		const approvedDiffRows = (feedback.data?.diff_table || []).filter((row: any) => String(row?.user_action || "") === "approved" || stringList(feedback.data?.approved_diff_rows).includes(String(row?.id || "")));
		const acceptedDecisions = feedback.data?.accepted_decisions || [];
		const requirementRows = (explicitRequirements.length > 0
			? explicitRequirements.map((req: any) => ({ id: String(req.id || "").trim(), text: String(req.text || "").trim() }))
			: approvedDiffRows.length > 0
				? approvedDiffRows.map((row: any) => ({ id: String(row.id || "").trim(), text: String(row.desired_state || "").trim() }))
				: acceptedDecisions.map((decision: any) => ({ id: String(decision.id || "").trim(), text: String(decision.summary || "").trim() })))
			.filter((req: any) => req.id && req.text);
		for (const requirement of requirementRows) {
			const docsForFeedback = uniqueBuildsByPath(documentationByFeedback.get(feedbackPath) || []);
			const documentationPaths = docsForFeedback.map((build) => normalizeCodewikiRef(build.path)).filter(Boolean);
			const knowledgePaths = unique(docsForFeedback.flatMap((build) => [
				...producedRefs(build.data, "knowledge"),
				...stringList(build.data?.knowledge_changes).map(normalizeCodewikiRef),
			]).filter(Boolean));
			const planningBuilds = uniqueBuildsByPath(docsForFeedback.flatMap((build) => planningByDocumentation.get(normalizeCodewikiRef(build.path)) || []));
			const planningPaths = planningBuilds.map((build) => normalizeCodewikiRef(build.path)).filter(Boolean);
			const legacyTaskIds = docsForFeedback.flatMap((build) => [
				...producedRefs(build.data, "roadmap"),
				...stringList(build.data?.roadmap_changes),
			]).filter((ref) => /^TASK-\d+$/.test(ref));
			const planningTaskIds = planningBuilds.flatMap((build) => buildTaskIds(build));
			const taskIds = unique([...legacyTaskIds, ...planningTaskIds]);
			const implementationBuilds = unique([
				...planningBuilds.flatMap((build) => implementationByPlanning.get(normalizeCodewikiRef(build.path)) || []).map((build) => normalizeCodewikiRef(build.path)),
				...docsForFeedback.flatMap((build) => implementationByDocumentation.get(normalizeCodewikiRef(build.path)) || []).map((build) => normalizeCodewikiRef(build.path)),
			]);
			const implementationArtifacts = implementationBuilds.map((path) => buildsByPath.get(path)).filter(Boolean) as BuildArtifact[];
			const testPaths = unique(implementationArtifacts.flatMap((build) => [...producedRefs(build.data, "tests"), ...stringList(build.data?.test_files).map(normalizeCodewikiRef)]));
			const codeRefs = unique(implementationArtifacts.flatMap((build) => [...producedRefs(build.data, "code"), ...stringList(build.data?.code_files).map(normalizeCodewikiRef)]));
			const validationPaths = unique([
				...implementationArtifacts.flatMap((build) => [...producedRefs(build.data, "validation"), ...stringList(build.data?.validation_refs).map(normalizeCodewikiRef)]),
				...implementationArtifacts.filter((build) => String(build.data?.validation_verdict?.verdict || "") === "pass").map((build) => `${normalizeCodewikiRef(build.path)}#validation_verdict`),
				...validations.filter((validation) => implementationBuilds.includes(normalizeCodewikiRef(validation.data?.source))).map((validation) => normalizeCodewikiRef(validation.path)),
			]);
			const publicationRefs = unique(implementationArtifacts.flatMap((build) => publicationClaimRefs(build)));
			const contentProofRefsForRequirement = unique(implementationArtifacts.flatMap((build) => contentProofRefs(build.data)));
			const auditRefsForRequirement = unique(implementationArtifacts.flatMap((build) => auditEvidenceRefs(build.data)));
			const gaps: string[] = [];
			if (documentationPaths.length === 0) gaps.push("missing_documentation_build");
			if (hasActionableLowerLayerDelta(feedback) && planningPaths.length === 0 && taskIds.length === 0) gaps.push("missing_planning_build");
			if (taskIds.length > 0 && implementationBuilds.length === 0) gaps.push("missing_implementation_build");
			if (implementationBuilds.length > 0 && testPaths.length === 0) gaps.push("missing_test_evidence");
			if (implementationBuilds.length > 0 && validationPaths.length === 0) gaps.push("missing_validation_evidence");
			if (publicationRefs.length > 0 && contentProofRefsForRequirement.length === 0) gaps.push("missing_publication_content_proof");
			const traceabilityRow = {
				requirement_id: requirement.id,
				requirement_text: requirement.text,
				feedback_build: feedbackPath,
				documentation_builds: documentationPaths,
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
				const nextLoop = gaps.includes("missing_documentation_build")
					? "documentation"
					: gaps.includes("missing_planning_build")
						? "planning"
						: gaps.includes("missing_validation_evidence") || gaps.includes("missing_publication_content_proof")
							? "validation"
							: "implementation";
				reconciliationItems.push({
					id: `reconcile:traceability:${feedbackPath}:${requirement.id}`,
					source_id: `build:${feedbackPath}`,
					state: "drift",
					direction: "downward",
					from_layer: "intent",
					to_layer: gaps.includes("missing_publication_content_proof") ? "content_proof" : gaps.includes("missing_validation_evidence") ? "validation" : gaps.includes("missing_implementation_build") || gaps.includes("missing_test_evidence") ? "code" : "knowledge",
					next_loop: nextLoop,
					task_id: taskIds[0],
					reason: `Traceability gap for ${requirement.id}: ${gaps.join(", ")}.`,
					gaps,
				});
			}
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
		if (claim.build_ref) addEdge("claim_build", claimId, `build:${claim.build_ref}`);
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
		if (waiter.task_id) addEdge("claim_wait_task", waiterId, `task:${waiter.task_id}`);
		if (waiter.build_ref) addEdge("claim_wait_build", waiterId, `build:${waiter.build_ref}`);
		for (const blockedBy of waiter.blocked_by_claim_ids || []) addEdge("claim_wait_blocked_by", waiterId, `claim:${blockedBy}`);
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
		const validationSources = unique([
			normalizeCodewikiRef(v.data?.source),
			...stringList(v.data?.sources).map(normalizeCodewikiRef),
		].filter(Boolean));
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
		addNode(valNodeId, {
			kind: "validation_report",
			path: v.path,
			verdict: v.verdict,
			isolation_status: isolation.status,
			isolation: v.data?.isolation,
			evidence_summary: {
				canonical_source_refs: validationSources,
				audit_evidence_refs: validationAuditRefs,
				content_proof_refs: validationContentProofRefs,
			},
		});
		for (const ref of validationSources) addCanonicalSourceRef(valNodeId, ref, "validation_attests_source");
		for (const ref of validationAuditRefs) addAuditEvidenceRef(valNodeId, ref, "validation_audit_evidence");
		for (const ref of validationContentProofRefs) addContentProofRef(valNodeId, ref, "validation_content_proof");
		if (v.taskId) {
			addEdge("validation_task", valNodeId, `task:${v.taskId}`);
		}
		const validationTaskId = String(v.taskId || v.data?.task_id || v.data?.taskId || "").trim();
		const validationTargetsClosedTask = Boolean(validationTaskId && !activeRoadmapTaskIds.has(validationTaskId));
		const validationTargetsNoTask = !validationTaskId;
		const validationHasSupersedingPass = validations.some((candidate) => {
			if (candidate === v || candidate.verdict !== "pass") return false;
			const candidateTaskId = String(candidate.taskId || candidate.data?.task_id || candidate.data?.taskId || "").trim();
			if (candidateTaskId !== validationTaskId) return false;
			const candidateProfile = String(candidate.data?.profile || "").trim();
			const profile = String(v.data?.profile || "").trim();
			if (candidateProfile && profile && candidateProfile !== profile) return false;
			return String(candidate.data?.source || "").trim() === String(v.data?.source || "").trim();
		});
		const unscopedBlock = v.verdict === "block" && validationTargetsNoTask;
		if ((v.verdict === "fail" || v.verdict === "block") && !validationTargetsClosedTask && !unscopedBlock && !validationHasSupersedingPass) {
			reconciliationItems.push({
				id: `reconcile:validation:${v.path}`,
				source_id: valNodeId,
				state: v.verdict === "block" ? "blocked" : "drift",
				direction: "gateway",
				from_layer: "validation",
				to_layer: v.verdict === "block" ? "feedback" : "documentation",
				next_loop: v.verdict === "block" ? "feedback" : "documentation",
				task_id: v.taskId,
				reason: v.verdict === "block"
					? "Validation blocked; escalate ambiguous intent to feedback compiler."
					: "Validation failed; return to documentation compiler to fix knowledge/roadmap gaps.",
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
			next_loop: "documentation",
			reason: `Lint ${issue.severity} (${issue.kind}) has no open roadmap coverage; reconcile knowledge or create scoped work.`,
			doc_paths: [issuePath],
		});
	}

	const taskHasPendingImplementationValidation = (taskId: string) => builds.some((build) => {
		if (build.kind !== "implementation_build") return false;
		if (!buildTaskIds(build).includes(taskId)) return false;
		const lifecycleState = String(build.data?.lifecycle?.state || build.data?.status || build.status || "").trim();
		return ["accepted", "applied"].includes(lifecycleState) && !hasPassingValidationForBuild(build);
	});

	const validatedImplementationScopes = builds
		.filter((build) => build.kind === "implementation_build" && hasPassingValidationForBuild(build))
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
			reason: status === "blocked"
				? `${taskId} is blocked; implementation loop needs unblock evidence or rerouting.`
				: `${taskId} is open implementation delta below knowledge.`,
		});
	}
	for (const codePath of codePaths) {
		const relatedDocs = docsByCodePath.get(codePath) || [];
		const isDirty = !isGeneratedPath(project, codePath) && isPathDirty(dirtyPaths, codePath);
		if (!isDirty || relatedDocs.length === 0) continue;
		if (validatedImplementationScopes.some((scope) => pathsOverlap(scope, codePath))) continue;
		const relatedOpenTaskIds = Array.from(new Set([
			...relatedDocs.flatMap((docPath) => openTasksBySpec.get(docPath) || []),
			...openTaskCodeScopes.filter((scope) => pathsOverlap(scope.path, codePath)).map((scope) => scope.taskId),
		]));
		if (relatedOpenTaskIds.length > 0) continue;
		reconciliationItems.push({
			id: `reconcile:code:${codePath}`,
			source_id: `code:${codePath}`,
			state: "drift",
			direction: "upward",
			from_layer: "code",
			to_layer: "knowledge",
			next_loop: "documentation",
			reason: `Mapped code changed without open roadmap coverage; reconcile upward into knowledge or feedback if intent is unclear.`,
			doc_paths: relatedDocs,
		});
	}
	const reconciliationAction = buildReconciliationAction(reconciliationItems);
	const reconciliationCounts = reconciliationItems.reduce((acc: Record<string, number>, item: any) => {
		const loop = String(item.next_loop || "observe");
		acc[loop] = (acc[loop] || 0) + 1;
		return acc;
	}, {});
	const layerHasDrift = (layer: string) => reconciliationItems.some(
		(item) => item.state !== "aligned" && (item.from_layer === layer || item.to_layer === layer),
	);
	const openTaskIds = roadmapEntries.filter((task) => isOpenTaskStatus(String(task.status || "todo"))).map((task) => task.id);
	const inProgressTaskIds = roadmapEntries.filter((task) => isActiveTaskStatus(String(task.status || "todo"))).map((task) => task.id);
	const todoTaskIds = roadmapEntries.filter((task) => String(task.status || "todo") === "todo").map((task) => task.id);
	const blockedTaskIds = roadmapEntries.filter((task) => String(task.status || "todo") === "blocked").map((task) => task.id);
	const doneTaskIds = roadmapEntries.filter((task) => String(task.status || "todo") === "done").map((task) => task.id);
	const cancelledTaskIds = roadmapEntries.filter((task) => String(task.status || "todo") === "cancelled").map((task) => task.id);
	const sprintViews = normalizedSprints.map((sprint) => {
		const sprintOpenTaskIds = sprint.task_ids.filter((taskId) => openTaskIds.includes(taskId));
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
	const activeSprintIds = sprintViews.filter((sprint) => !["closed", "cancelled"].includes(sprint.status) && (sprint.open_task_ids.length > 0 || sprint.status === "active")).map((sprint) => sprint.id);
	const claimRoleCounts = claimState.claims.reduce((acc: Record<string, number>, claim) => {
		const role = claim.role || "unspecified";
		acc[role] = (acc[role] || 0) + 1;
		return acc;
	}, {});
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
	const taskScopeViews = Object.fromEntries(roadmapEntries.map((task) => [task.id, {
		kind: "task",
		id: task.id,
		task_ids: [task.id],
		open_task_ids: isOpenTaskStatus(String(task.status || "todo")) ? [task.id] : [],
		sprint_ids: sprintByTaskId.get(task.id) || [],
		spec_paths: task.spec_paths || [],
		code_paths: task.code_paths || [],
	}]));
	const hotBuildPaths = builds.filter((build) => {
		const lifecycleState = String(build.data?.lifecycle?.state || build.data?.status || build.status || "").trim();
		const validated = hasPassingValidationForBuild(build);
		const superseded = supersededByPath.has(normalizeCodewikiRef(build.path));
		const consumed = build.kind === "feedback_build" ? feedbackConsumed(build) : build.kind === "documentation_build" ? documentationConsumed(build) : build.kind === "planning_build" ? planningConsumed(build) : false;
		return !superseded && !historicalColdBuild(build, lifecycleState) && !isLifecycleComplete(lifecycleState) && !validated && !consumed;
	}).map((build) => normalizeCodewikiRef(build.path)).filter(Boolean);
	const passValidationPaths = validations.filter((v) => String(v.verdict || "") === "pass").map((v) => v.path);
	const failValidationPaths = validations.filter((v) => {
		if (!["fail", "block"].includes(String(v.verdict || ""))) return false;
		const taskId = String(v.taskId || v.data?.task_id || v.data?.taskId || "").trim();
		return !taskId || activeRoadmapTaskIds.has(taskId);
	}).map((v) => v.path);
	const archiveLedgers = builds.map((build) => buildArchiveLedger(build)).filter(Boolean) as NonNullable<ReturnType<typeof buildArchiveLedger>>[];
	const safelyArchivedTaskIds = new Set(builds.filter((build) => Boolean(buildArchiveLedger(build)) && publicationSafetyPassed(build)).flatMap((build) => buildTaskIds(build)));
	const gitArchivedBuildPaths = builds.filter((build) => Boolean(buildArchiveLedger(build))).map((build) => normalizeCodewikiRef(build.path)).filter(Boolean);
	const purgeableBuilds = builds.filter((build) => {
		const lifecycleState = String(build.data?.lifecycle?.state || build.status || "").trim();
		const validated = hasPassingValidationForBuild(build);
		return lifecycleState === "purged" || isPurgeableByGitArchive(build, lifecycleState, validated);
	});
	const purgeableBuildPaths = purgeableBuilds.map((build) => normalizeCodewikiRef(build.path)).filter(Boolean);
	const purgeableBuildPathSet = new Set(purgeableBuildPaths);
	const purgeableTaskIds = Array.from(new Set(purgeableBuilds.flatMap((build) => buildTaskIds(build))));
	const purgeableValidationPaths = validations.filter((validation) => {
		if (String(validation.verdict || "") !== "pass") return false;
		const taskId = String(validation.taskId || validation.data?.task_id || validation.data?.taskId || "").trim();
		const source = normalizeCodewikiRef(validation.data?.source);
		return (taskId && safelyArchivedTaskIds.has(taskId)) || (source && purgeableBuildPathSet.has(source));
	}).map((validation) => normalizeCodewikiRef(validation.path)).filter(Boolean);
	const purgeableValidationPathSet = new Set(purgeableValidationPaths);
	const warmPassValidationPaths = passValidationPaths.map(normalizeCodewikiRef).filter((path) => !purgeableValidationPathSet.has(path));
	const blockedArchiveBuildPaths = builds.filter((build) => {
		const lifecycleState = String(build.data?.lifecycle?.state || build.status || "").trim();
		const validated = hasPassingValidationForBuild(build);
		return canCompactColdBuild(build, lifecycleState, validated) && !isPurgeableByGitArchive(build, lifecycleState, validated);
	}).map((build) => normalizeCodewikiRef(build.path)).filter(Boolean);
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
				build_paths: builds.filter((build) => String(build.data?.lifecycle?.state || build.status || "") === "accepted" && !hotBuildPaths.includes(normalizeCodewikiRef(build.path)) && !purgeableBuildPathSet.has(normalizeCodewikiRef(build.path))).map((build) => normalizeCodewikiRef(build.path)).filter(Boolean),
				validation_paths: warmPassValidationPaths.slice(0, 20),
			},
			cold: {
				task_ids: [...doneTaskIds, ...cancelledTaskIds],
				build_paths: builds.filter((build) => isLifecycleComplete(String(build.data?.lifecycle?.state || build.status || "")) || hasPassingValidationForBuild(build)).map((build) => normalizeCodewikiRef(build.path)).filter(Boolean),
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
		expected_output: reconciliationAction.loop === "feedback" ? "feedback_build" : reconciliationAction.loop === "documentation" ? "documentation_build" : reconciliationAction.loop === "planning" ? "planning_build" : reconciliationAction.loop === "implementation" ? "implementation_build" : reconciliationAction.loop === "validation" ? "validation_report" : "observation",
		exit_gate: reconciliationAction.loop === "observe" ? "no drift" : "validation pass or explicit user decision",
		scope: cursorScope,
		isolation: reconciliationAction.isolation,
		context_boundary: reconciliationAction.context_boundary,
		handoff_refs: reconciliationAction.handoff_refs || [],
	};

	// Construct Views
	const docPaths = sortedDocs.map(d => d.path);
	const specPaths = sortedDocs.filter(d => d.doc_type === "spec").map(d => d.path);
	const byGroup: Record<string, string[]> = {};
	for (const path of specPaths) {
		const parts = path.split("/");
		const group = parts.length > 2 ? parts[2] : "unknown";
		if (!byGroup[group]) byGroup[group] = [];
		byGroup[group].push(path);
	}
	
	const views: GraphViews = {
		docs: {
			all_paths: docPaths,
			spec_paths: specPaths,
			by_group: byGroup,
		},
		roadmap: {
			task_ids: roadmapEntries.map(t => t.id),
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
		research: {
			collection_paths: research.map(c => c.path),
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
			precedence: ["content_proof", "canonical_source", "gateway_policy", "audit_evidence", "graph_state", "validation_attestation", "session_memory"],
			graph_role: "required_gateway_input_not_canonical_truth",
			canonical_source_refs: Array.from(canonicalSourceRefs).sort(),
			audit_evidence_refs: Array.from(auditEvidenceRefSet).sort(),
			content_proof_refs: Array.from(contentProofRefSet).sort(),
			validation_attestations: validationAttestations,
		},
		traceability: {
			rows: traceabilityRows,
			semantic_change_rows: semanticChangeRows,
			semantic_change_gaps: semanticChangeRows.filter((row) => row.gaps.length > 0),
			gap_count: traceabilityRows.reduce((count, row) => count + (Array.isArray(row.gaps) ? row.gaps.length : 0), 0)
				+ semanticChangeRows.reduce((count, row) => count + row.gaps.length, 0),
			gaps: [
				...traceabilityRows.filter((row) => Array.isArray(row.gaps) && row.gaps.length > 0),
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
			sprints: Object.fromEntries(sprintViews.map((sprint) => [sprint.id, { kind: "sprint", ...sprint }])),
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
		}
	};

	return {
		version: 1,
		generated_at: nowIso(),
		nodes,
		edges,
		views,
	};
}
