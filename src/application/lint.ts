import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import type { LintIssue, LintReport, RoadmapTaskRecord, WikiProject } from "../domain/shared/types.ts";
import { extractLinks } from "./knowledge/doc-parser.ts";
import type { ParsedDoc } from "./knowledge/doc-parser.ts";
import { assessRoadmapTaskBoundary } from "../domain/roadmap/task-boundary.ts";
import { validateSystemDiagramRefs } from "./knowledge/diagram-parser.ts";

const DEFAULT_REQUIRED_FIELDS = ["id", "title", "state", "summary", "owners", "updated"];
const FORBIDDEN_HEADINGS = [
	"## Introduction",
	"## Overview",
	"## Table of contents",
	"## Background",
];
const DEFAULT_WORD_COUNT_WARN = 1000;
const DEFAULT_WORD_COUNT_EXEMPT = [".codewiki/roadmap.md", "index.md"];
const OPEN_ROADMAP_STATUSES = new Set(["todo", "in_progress", "blocked"]);

function isOpenRoadmapStatus(status: string): boolean {
	return OPEN_ROADMAP_STATUSES.has(String(status || "todo").trim());
}

export function createIssue(severity: string, kind: string, path: string, message: string): LintIssue {
	return { severity, kind, path, message };
}

function configuredWordCountWarn(project: WikiProject): number {
	const value = Number(project.config?.lint?.word_count_warn ?? DEFAULT_WORD_COUNT_WARN);
	return Number.isFinite(value) && value > 0 ? value : DEFAULT_WORD_COUNT_WARN;
}

function configuredWordCountExempt(project: WikiProject): Set<string> {
	return new Set([
		...DEFAULT_WORD_COUNT_EXEMPT,
		...(Array.isArray(project.config?.lint?.word_count_exempt) ? project.config.lint.word_count_exempt : []),
	]);
}

function configuredForbiddenHeadings(project: WikiProject): string[] {
	return Array.isArray(project.config?.lint?.forbidden_headings) && project.config.lint.forbidden_headings.length > 0
		? project.config.lint.forbidden_headings
		: FORBIDDEN_HEADINGS;
}

function listFiles(root: string, relDir: string): string[] {
	const start = resolve(root, relDir);
	if (!existsSync(start)) return [];
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const name of readdirSync(dir)) {
			const abs = resolve(dir, name);
			const stats = statSync(abs);
			if (stats.isDirectory()) walk(abs);
			else out.push(relative(root, abs).replace(/\\/g, "/"));
		}
	};
	walk(start);
	return out.sort();
}

function listDirectories(root: string, relDir: string): string[] {
	const start = resolve(root, relDir);
	if (!existsSync(start)) return [];
	return readdirSync(start)
		.filter((name) => statSync(resolve(start, name)).isDirectory())
		.sort();
}

function containsStaleDotWikiReference(text: string): boolean {
	return /(^|[^A-Za-z0-9_-])\.wiki\//.test(text);
}

export function lintFileContract(repoRoot: string, project: WikiProject, docs: ParsedDoc[]): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const path of listFiles(repoRoot, ".codewiki/index")) {
		issues.push(createIssue("error", "deprecated-codewiki-index", path, ".codewiki/index/** is deprecated; use .codewiki/index_graph.json."));
	}
	for (const path of listFiles(repoRoot, ".codewiki/evidence")) {
		issues.push(createIssue("error", "deprecated-codewiki-evidence", path, ".codewiki/evidence/** is deprecated; use implementation builds, validation reports, sources, or research roots."));
	}
	const configPath = resolve(repoRoot, project.configPath || ".codewiki/config.json");
	if (existsSync(configPath) && containsStaleDotWikiReference(readFileSync(configPath, "utf8"))) {
		issues.push(createIssue("error", "stale-dotwiki-reference", project.configPath || ".codewiki/config.json", "Active CodeWiki config references legacy dot-wiki paths."));
	}
	for (const doc of docs) {
		if (containsStaleDotWikiReference(doc.body) || containsStaleDotWikiReference(JSON.stringify(doc.frontmatter))) {
			issues.push(createIssue("error", "stale-dotwiki-reference", doc.path, "Active knowledge doc references legacy dot-wiki paths."));
		}
	}
	return issues;
}

export function lintMarkdownDocs(repoRoot: string, project: WikiProject, docs: ParsedDoc[]): LintIssue[] {
	const issues: LintIssue[] = [];
	const ids = new Map<string, number>();
	const wordCountWarn = configuredWordCountWarn(project);
	const wordCountExempt = configuredWordCountExempt(project);
	const forbiddenHeadings = configuredForbiddenHeadings(project);

	for (const doc of docs) {
		const docId = `doc:${doc.path}`;
		ids.set(docId, (ids.get(docId) || 0) + 1);

		for (const field of DEFAULT_REQUIRED_FIELDS) {
			const val = doc.frontmatter[field];
			if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
				issues.push(createIssue("error", "missing-field", doc.path, `Missing required frontmatter field: ${field}`));
			}
		}

		if ((ids.get(docId) || 0) > 1) {
			issues.push(createIssue("error", "duplicate-id", doc.path, `Duplicate id: ${docId}`));
		}

		for (const rawTarget of extractLinks(repoRoot, doc.body, doc.path)) {
			// Links are pre-normalized by extractLinks
			const targetAbs = resolve(repoRoot, rawTarget);
			if (!existsSync(targetAbs)) {
				issues.push(createIssue("error", "broken-link", doc.path, `Broken link: ${rawTarget}`));
			}
		}

		for (const codePath of doc.code_paths) {
			const candidate = resolve(repoRoot, codePath);
			if (!existsSync(candidate)) {
				issues.push(createIssue("warning", "missing-code-path", doc.path, `Referenced code path does not exist: ${codePath}`));
			}
		}

		const trimmedBody = doc.body.trim();
		const wordCount = trimmedBody ? trimmedBody.split(/\s+/).length : 0;
		if (!wordCountExempt.has(doc.path) && wordCount > wordCountWarn) {
			issues.push(createIssue("warning", "large-doc", doc.path, `Live doc has ${wordCount} words; consider split or cut.`));
		}

		for (const heading of forbiddenHeadings) {
			if (doc.body.includes(heading)) {
				issues.push(createIssue("warning", "forbidden-heading", doc.path, `Forbidden heading in live doc: ${heading}`));
			}
		}

		const scoped = (Array.isArray(doc.code_paths) ? doc.code_paths.length : 0) + (Array.isArray(doc.spec_paths) ? doc.spec_paths.length : 0);
		if (scoped === 0) {
			issues.push(createIssue("warning", "unscoped-doc", doc.path, "Knowledge doc has no code_paths or spec_paths; consider adding cross-layer mapping."));
		}

		if (!doc.body.includes("## Related docs")) {
			issues.push(createIssue("warning", "missing-related-docs", doc.path, "Live doc should end with '## Related docs'."));
		}
	}

	return issues;
}

export interface EvidenceLinkInput {
	builds?: { path: string; kind: string; taskId?: string; data?: any }[];
	validations?: { path: string; taskId?: string; verdict?: string; data?: any }[];
	archivedTaskIds?: string[];
}

export function lintRoadmapEntries(repoRoot: string, project: WikiProject, entries: RoadmapTaskRecord[], research: any[]): LintIssue[] {
	const issues: LintIssue[] = [];
	const seenIds = new Set<string>();
	const allowedStatus = new Set(["todo", "in_progress", "blocked", "done", "cancelled"]);
	const allowedPriority = new Set(["critical", "high", "medium", "low"]);
	const sourcePath = project.roadmapPath;

	const researchIds = new Set<string>();
	for (const collection of research) {
		for (const entry of (collection.entries || [])) {
			if (entry.id) researchIds.add(entry.id);
		}
	}

	entries.forEach((entry, idx) => {
		const index = idx + 1;
		const entryId = typeof entry.id === "string" ? entry.id.trim() : "";
		
		if (!entryId) {
			issues.push(createIssue("error", "roadmap-missing-id", sourcePath, `Entry ${index} missing task id`));
			return;
		}

		if (seenIds.has(entryId)) {
			issues.push(createIssue("error", "roadmap-duplicate-id", sourcePath, `Duplicate roadmap task id: ${entryId}`));
		}
		seenIds.add(entryId);

		if (!/^TASK-\d{3}$/.test(entryId)) {
			issues.push(createIssue("error", "roadmap-noncanonical-id", sourcePath, `${entryId} must use canonical TASK-### format.`));
		}

		const requiredFields: (keyof RoadmapTaskRecord)[] = ["title", "status", "priority", "kind", "summary", "created", "updated"];
		for (const field of requiredFields) {
			if (!String(entry[field] || "").trim()) {
				issues.push(createIssue("error", `roadmap-missing-${field}`, sourcePath, `${entryId} missing ${field}`));
			}
		}

		const status = String(entry.status || "todo");
		if (!allowedStatus.has(status)) {
			issues.push(createIssue("error", "roadmap-bad-status", sourcePath, `${entryId} has invalid status: ${status}`));
		}

		const priority = String(entry.priority || "medium");
		if (!allowedPriority.has(priority)) {
			issues.push(createIssue("error", "roadmap-bad-priority", sourcePath, `${entryId} has invalid priority: ${priority}`));
		}

		const specPaths = entry.spec_paths || [];
		const codePaths = entry.code_paths || [];
		const goal = entry.goal || ({} as any);

		const outcome = String(goal.outcome || "").trim();
		const acceptance = Array.isArray(goal.acceptance) ? goal.acceptance : [];
		const verification = Array.isArray(goal.verification) ? goal.verification : [];
		const nonGoals = Array.isArray(goal.non_goals) ? goal.non_goals : [];

		if (Object.keys(goal).length > 0 && !outcome && acceptance.length === 0 && nonGoals.length === 0 && verification.length === 0) {
			issues.push(createIssue("warning", "roadmap-empty-goal", sourcePath, `${entryId} includes a goal object with no meaningful content`));
		}

		if (Object.keys(goal).length > 0 && verification.length === 0) {
			issues.push(createIssue("warning", "roadmap-missing-verification", sourcePath, `${entryId} goal should define at least one verification step`));
		}

		if (isOpenRoadmapStatus(status) && specPaths.length === 0 && codePaths.length === 0) {
			issues.push(createIssue("warning", "roadmap-unscoped", sourcePath, `${entryId} should reference at least one spec_paths or code_paths entry`));
		}

		const boundary = assessRoadmapTaskBoundary(entry);
		if (isOpenRoadmapStatus(status) && !boundary.executable) {
			issues.push(createIssue("error", "roadmap-container-task", sourcePath, `${entryId} is not self-contained executable work; use a sprint for grouping. ${boundary.reasons.join("; ")}`));
		}

		for (const specPath of specPaths) {
			if (!existsSync(resolve(repoRoot, specPath))) {
				issues.push(createIssue("error", "roadmap-missing-spec-path", sourcePath, `${entryId} references missing spec path: ${specPath}`));
			}
		}

		for (const codePath of codePaths) {
			if (!existsSync(resolve(repoRoot, codePath))) {
				issues.push(createIssue("warning", "roadmap-missing-code-path", sourcePath, `${entryId} references missing code path: ${codePath}`));
			}
		}

		for (const researchId of entry.research_ids || []) {
			if (!researchIds.has(researchId)) {
				issues.push(createIssue("warning", "roadmap-missing-research-id", sourcePath, `${entryId} references unknown research id: ${researchId}`));
			}
		}
	});

	const expectedTaskIds = seenIds;
	const taskViewRoot = ".codewiki/roadmap/tasks";
	for (const dirName of listDirectories(repoRoot, taskViewRoot)) {
		const dirPath = `${taskViewRoot}/${dirName}`;
		if (!expectedTaskIds.has(dirName)) {
			issues.push(createIssue("error", "roadmap-stale-task-view", dirPath, `${dirPath} has no matching task in ${sourcePath}.`));
			continue;
		}
		for (const fileName of ["task.json", "context.json"]) {
			const filePath = `${dirPath}/${fileName}`;
			if (!existsSync(resolve(repoRoot, filePath))) {
				issues.push(createIssue("error", "roadmap-missing-task-view-file", filePath, `${filePath} is missing from generated task view.`));
			}
		}
	}
	for (const taskId of expectedTaskIds) {
		const dirPath = `${taskViewRoot}/${taskId}`;
		if (!existsSync(resolve(repoRoot, dirPath))) {
			issues.push(createIssue("error", "roadmap-missing-task-view", dirPath, `${sourcePath} contains ${taskId} but generated task view is missing.`));
		}
	}

	return issues;
}

function list(value: any): any[] {
	return Array.isArray(value) ? value : [];
}

function isBuildV2(build: { data?: any }): boolean {
	return Number(build.data?.schema_version || 0) >= 2;
}

function lintDecisionBuildV2(buildPath: string, data: any): LintIssue[] {
	const issues: LintIssue[] = [];
	const rows = list(data?.diff_table);
	const approved = rows.filter((row) => String(row?.user_action || "").trim() === "approved" || list(data?.approved_diff_rows).includes(row?.id));
	const mappings = list(data?.row_to_kb_mappings);
	const mode = String(data?.decision_mode || (String(data?.status || data?.lifecycle?.state || "") === "proposed" ? "proposal" : "accepted"));
	if (rows.length === 0) {
		issues.push(createIssue("error", "decision-build-missing-diff-table", buildPath, "Decision build v2 requires diff_table rows."));
	}
	if (mode === "proposal") {
		if (approved.length || mappings.length || list(data?.knowledge_changes).length) {
			issues.push(createIssue("error", "decision-build-proposal-mutates", buildPath, "Proposal decision builds must not record approved rows or canonical KB changes."));
		}
		return issues;
	}
	if (approved.length === 0) {
		issues.push(createIssue("error", "decision-build-missing-approved-diff-row", buildPath, "Accepted decision build v2 requires at least one approved diff_table row."));
	}
	if (mappings.length === 0) {
		issues.push(createIssue("error", "decision-build-missing-row-kb-mapping", buildPath, "Accepted decision build v2 requires row_to_kb_mappings."));
	}
	const mappedRows = new Set(mappings.map((mapping) => String(mapping?.row_id || "").trim()).filter(Boolean));
	for (const row of approved) {
		if (!mappedRows.has(String(row?.id || "").trim())) {
			issues.push(createIssue("error", "decision-build-unmapped-approved-row", buildPath, `${row?.id || "approved row"} missing row_to_kb_mappings entry.`));
		}
	}
	if (!String(data?.propagation?.direction || "").trim()) {
		issues.push(createIssue("error", "decision-build-missing-propagation", buildPath, "Accepted decision build v2 requires propagation.direction."));
	}
	return issues;
}

function lintPlanningBuildV2(buildPath: string, data: any): LintIssue[] {
	const issues: LintIssue[] = [];
	const upstreamLoop = String(data?.traceability?.upstream_loop || "").trim().toLowerCase();
	const requiresDecisionSource = !upstreamLoop || upstreamLoop === "decision";
	if (requiresDecisionSource && !String(data?.source_decision_build || "").trim() && !list(data?.consumes?.decision).length) {
		issues.push(createIssue("error", "planning-build-missing-decision-source", buildPath, "Planning build v2 requires source_decision_build or consumes.decision."));
	}
	if (!list(data?.task_ids).length && !list(data?.task_changes).length && !list(data?.produces?.roadmap).length) {
		issues.push(createIssue("warning", "planning-build-missing-roadmap-output", buildPath, "Planning build v2 should name task_ids, task_changes, or produces.roadmap."));
	}
	if (!list(data?.tdd_plan).length && !list(data?.candidate_test_files).length && !list(data?.evidence_mapping).length) {
		issues.push(createIssue("warning", "planning-build-missing-test-strategy", buildPath, "Planning build v2 should include TDD/test strategy or evidence mapping."));
	}
	return issues;
}

function lintImplementationBuildV2(buildPath: string, data: any): LintIssue[] {
	const issues: LintIssue[] = [];
	const closure = data?.closure_brief || null;
	if (!closure) {
		issues.push(createIssue("error", "implementation-build-missing-closure-brief", buildPath, "Implementation build v2 requires closure_brief."));
		return issues;
	}
	if (!String(closure.user_intent || "").trim()) issues.push(createIssue("error", "implementation-build-bad-closure-brief", buildPath, "closure_brief missing user_intent."));
	for (const field of ["implemented_changes", "acceptance_evidence", "checks"]) {
		if (!Array.isArray(closure[field]) || closure[field].length === 0) {
			issues.push(createIssue("error", "implementation-build-bad-closure-brief", buildPath, `closure_brief missing ${field}.`));
		}
	}
	return issues;
}

function lintBuildContractV2(build: { path: string; kind: string; data?: any }): LintIssue[] {
	if (!isBuildV2(build)) return [];
	const issues: LintIssue[] = [];
	const consumes = build.data?.consumes || {};
	const produces = build.data?.produces || {};
	const consumeCount = Object.values(consumes).reduce<number>((count, value) => count + list(value).length, 0);
	const produceCount = Object.values(produces).reduce<number>((count, value) => count + list(value).length, 0);
	if (produceCount === 0) {
		issues.push(createIssue("warning", "build-v2-missing-produces", build.path, "Build v2 should expose produces edges."));
	}
	if (build.kind !== "decision_build" && consumeCount === 0) {
		issues.push(createIssue("warning", "build-v2-missing-consumes", build.path, "Build v2 should expose consumes edges."));
	}
	if (build.kind === "decision_build") issues.push(...lintDecisionBuildV2(build.path, build.data));
	if (build.kind === "planning_build") issues.push(...lintPlanningBuildV2(build.path, build.data));
	if (build.kind === "implementation_build") issues.push(...lintImplementationBuildV2(build.path, build.data));
	return issues;
}

export function lintEvidenceLinks(
	_project: WikiProject,
	entries: RoadmapTaskRecord[],
	evidence: EvidenceLinkInput = {},
): LintIssue[] {
	const issues: LintIssue[] = [];
	const knownTaskIds = new Set([
		...entries.map((entry) => String(entry.id || "").trim()).filter(Boolean),
		...(evidence.archivedTaskIds || []).map((id) => String(id || "").trim()).filter(Boolean),
	]);

	for (const build of evidence.builds || []) {
		issues.push(...lintBuildContractV2(build));
		const buildPath = String(build.path || "").trim();
		const taskId = String(build.taskId || build.data?.task_id || build.data?.taskId || "").trim();
		if (taskId && !knownTaskIds.has(taskId)) {
			issues.push(createIssue("error", "evidence-missing-task", buildPath, `Build references unknown task: ${taskId}`));
		}
		if (String(build.kind || "") === "implementation_build") {
			const mapping = Array.isArray(build.data?.acceptance_mapping) ? build.data.acceptance_mapping : [];
			if (taskId && mapping.length === 0) {
				issues.push(createIssue("warning", "implementation-build-missing-acceptance", buildPath, `Implementation build for ${taskId} should include acceptance_mapping evidence.`));
			}
		}
	}

	for (const validation of evidence.validations || []) {
		const validationPath = String(validation.path || "").trim();
		const taskId = String(validation.taskId || validation.data?.task_id || validation.data?.taskId || "").trim();
		if (taskId && !knownTaskIds.has(taskId)) {
			issues.push(createIssue("error", "evidence-missing-task", validationPath, `Validation report references unknown task: ${taskId}`));
		}
	}

	return issues;
}

export function buildLintReport(repoRoot: string, project: WikiProject, docs: ParsedDoc[], roadmapEntries: RoadmapTaskRecord[], research: any[], evidence: EvidenceLinkInput = {}): LintReport {
	const diagramValidation = validateSystemDiagramRefs(repoRoot, project, docs);
	const issues: LintIssue[] = [
		...lintFileContract(repoRoot, project, docs),
		...lintMarkdownDocs(repoRoot, project, docs),
		...diagramValidation.issues.map((issue) => createIssue(issue.severity, issue.kind, issue.path, issue.message)),
		...lintRoadmapEntries(repoRoot, project, roadmapEntries, research),
		...lintEvidenceLinks(project, roadmapEntries, evidence),
	];

	const counts: Record<string, number> = {};
	for (const issue of issues) {
		counts[issue.kind] = (counts[issue.kind] || 0) + 1;
	}

	return {
		generated_at: new Date().toISOString(),
		counts,
		issues
	};
}
