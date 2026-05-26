import { renderSkillAsset } from "./skill-assets.ts";
import { unique } from "../domain/shared/utils.ts";
import type { WikiProject } from "../project/types.ts";
import type { RoadmapTaskRecord } from "../domain/roadmap/types.ts";
import type { GraphFile, RoadmapTaskContextPacket, StatusScope } from "../domain/state/types.ts";
import type { LintReport } from "../validation/types.ts";

export function statusColor(report: LintReport): "green" | "yellow" | "red" {
	if (report.counts.error > 0) return "red";
	if (report.counts.warning > 0) return "yellow";
	return "green";
}

export interface DriftContext {
	selfInclude: string[];
	selfExclude: string[];
	docsScope: string[];
	docsExclude: string[];
	repoDocs: string[];
	codeScope: string[];
}

export function defaultSelfDriftScope(_project: WikiProject) {
	return {
		include: [".codewiki/kb/product/**/*.md", ".codewiki/kb/system/**/*.md"],
		exclude: [
			".codewiki/kb/system/architecture/mermaid.md",
			".codewiki/kb/system/architecture/components.json",
		],
	};
}

export function defaultCodeDriftDocsScope(_project: WikiProject) {
	return [".codewiki/kb/product/**/*.md", ".codewiki/kb/system/**/*.md"];
}

export function buildDriftContext(
	project: WikiProject,
	graph: GraphFile | null,
): DriftContext {
	const selfScope =
		project.config.codewiki?.self_drift_scope ?? defaultSelfDriftScope(project);
	const selfInclude = unique(selfScope.include ?? []);
	const selfExclude = unique(selfScope.exclude ?? []);
	const docsScope = unique(
		project.config.codewiki?.code_drift_scope?.docs ??
			defaultCodeDriftDocsScope(project),
	);
	const docsExclude = unique(
		project.config.codewiki?.self_drift_scope?.exclude ??
			defaultSelfDriftScope(project).exclude ??
			[],
	);
	const repoDocs = unique(
		project.config.codewiki?.code_drift_scope?.repo_docs ?? ["README.md"],
	);
	const configCode = unique(
		project.config.codewiki?.code_drift_scope?.code ?? [],
	);
	const graphCode = unique(graph?.views?.code?.paths ?? []);
	const codeScope = unique([...configCode, ...graphCode]);
	return {
		selfInclude,
		selfExclude,
		docsScope,
		docsExclude,
		repoDocs,
		codeScope,
	};
}

export function promptContextFiles(project: WikiProject): string[] {
	return unique([
		"README.md",
		".codewiki/config.json",
		project.roadmapStatePath,
		project.statusStatePath,
	]);
}

export function graphSpecCodePaths(
	graph: GraphFile | null,
	specPath: string,
): string[] {
	if (!graph) return [];
	const docNodeId = `doc:${specPath}`;
	return unique(
		(graph.edges ?? [])
			.filter(
				(edge) => edge.kind === "doc_code_path" && edge.from === docNodeId,
			)
			.map((edge) => edge.to.replace(/^code:/, "")),
	);
}

export function renderSpecPromptMap(graph: GraphFile | null): string[] {
	const graphSpecs = (graph?.nodes ?? [])
		.filter(
			(node) => node.kind === "doc" && node.doc_type === "spec" && node.path,
		)
		.map((node) => ({
			path: node.path as string,
			title: node.title,
			code_paths: graphSpecCodePaths(graph, node.path as string),
		}))
		.sort((a, b) => a.path.localeCompare(b.path));
	if (graphSpecs.length === 0) return ["- none"];
	return graphSpecs.map((spec) => {
		const codePaths = unique(spec.code_paths ?? []);
		return `- ${spec.title ?? spec.path} | ${spec.path} | code=${codePaths.length > 0 ? codePaths.join(", ") : "none mapped"}`;
	});
}

export function renderScope(label: string, items: string[]): string[] {
	return items.length > 0 ? [`${label}:`, ...items.map((i) => `- ${i}`)] : [];
}

export function renderList(items: string[]): string[] {
	return items.length > 0 ? items.map((i) => `- ${i}`) : ["- none"];
}

export function renderScopeForPrompt(
	scope: StatusScope | "both",
	drift: DriftContext,
): string[] {
	if (scope === "docs") {
		return [
			"Docs drift scope:",
			...renderScope("Include", drift.selfInclude),
			...renderScope("Exclude", drift.selfExclude),
		];
	}
	if (scope === "code") {
		return [
			"Docs scope:",
			...renderScope("Include", drift.docsScope),
			...renderScope("Exclude", drift.docsExclude),
			"Additional repository docs:",
			...renderList(drift.repoDocs),
			"Implementation scope:",
			...renderList(
				drift.codeScope.length > 0
					? drift.codeScope
					: [
							"Use code paths referenced by live specs; no explicit code scope configured.",
						],
			),
		];
	}
	return [
		"Docs drift scope:",
		...renderScope("Include", drift.selfInclude),
		...renderScope("Exclude", drift.selfExclude),
		"Code comparison scope:",
		...renderScope("Docs include", drift.docsScope),
		...renderScope("Docs exclude", drift.docsExclude),
		"Additional repository docs:",
		...renderList(drift.repoDocs),
		"Implementation scope:",
		...renderList(
			drift.codeScope.length > 0
				? drift.codeScope
				: [
						"Use code paths referenced by live specs; no explicit code scope configured.",
					],
		),
	];
}

export function compactDigest(value: unknown): string {
	const text = typeof value === "string" ? value : "";
	return text ? text.slice(0, 12) : "—";
}

export function contextRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function contextStringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => String(item).trim()).filter(Boolean)
		: [];
}

export function renderTaskContextForPrompt(
	packet: RoadmapTaskContextPacket | null,
): string[] {
	if (!packet) return [];
	const budget = contextRecord(packet.budget);
	const revision = contextRecord(packet.revision);
	const taskRevision = contextRecord(revision.task);
	const gitRevision = contextRecord(revision.git);
	const code = contextRecord(packet.code);
	const codePaths = contextStringList(code.paths);
	const specs = Array.isArray(packet.specs) ? packet.specs : [];
	const evidence = contextRecord(packet.evidence);
	return [
		"Compact task context packet:",
		`- Path: ${packet.context_path}`,
		`- Budget: ${budget.target_tokens ?? 6000} tokens; ${budget.policy ?? "Use packet first; expand listed files only when needed."}`,
		`- Revision: task=${compactDigest(taskRevision.digest)} spec=${compactDigest(revision.spec_digest)} code=${compactDigest(revision.code_digest)} git=${compactDigest(gitRevision.head)} dirty=${gitRevision.dirty === true ? "yes" : "no"}`,
		...(specs.length > 0
			? [
					"Spec contracts:",
					...specs.slice(0, 8).map((item) => {
						const spec = contextRecord(item);
						const specRevision = contextRecord(spec.revision);
						return `- ${spec.path ?? "unknown"} | ${spec.title ?? "Untitled"} | ${spec.summary ?? ""} | digest=${compactDigest(specRevision.digest)}`;
					}),
				]
			: []),
		...(codePaths.length > 0
			? [
					"Code expansion paths:",
					...codePaths.slice(0, 12).map((path) => `- ${path}`),
				]
			: []),
		...(evidence.summary
			? [
					"Latest evidence:",
					`- ${evidence.verdict ?? "progress"}: ${evidence.summary}`,
				]
			: []),
		"Expansion rule: read only listed specs/code/evidence when packet is insufficient, stale, or exact implementation detail is required.",
	];
}

function renderBlock(lines: string[]): string {
	return lines.length > 0 ? lines.join("\n") : "- none";
}

function renderFollowUpIntentSection(followUpIntent: string): string {
	const trimmed = followUpIntent.trim();
	return trimmed ? `User follow-up intent:\n${trimmed}` : "";
}

export function codePrompt(
	project: WikiProject,
	graph: GraphFile | null,
	report: LintReport,
	task: RoadmapTaskRecord,
	evidence = "No closure evidence recorded yet.",
	taskContext: RoadmapTaskContextPacket | null = null,
	followUpIntent = "",
): string {
	const drift = buildDriftContext(project, graph);
	const taskContextLines = renderTaskContextForPrompt(taskContext);
	const fallbackContextLines = [
		...renderScopeForPrompt("both", drift),
		"Context files:",
		...promptContextFiles(project),
		"Spec map:",
		...renderSpecPromptMap(graph),
	];
	const taskSummaryLines = [
		`- Title: ${task.title}`,
		`- Status: ${task.status}`,
		`- Priority: ${task.priority}`,
		`- Kind: ${task.kind}`,
		`- Summary: ${task.summary}`,
		...(task.goal.outcome ? [`- Outcome: ${task.goal.outcome}`] : []),
		...(task.goal.acceptance.length > 0
			? ["- Success signals:", ...task.goal.acceptance.map((item) => `  - ${item}`)]
			: []),
		...(task.goal.non_goals.length > 0
			? ["- Non-goals:", ...task.goal.non_goals.map((item) => `  - ${item}`)]
			: []),
		...(task.goal.verification.length > 0
			? ["- Verification steps:", ...task.goal.verification.map((item) => `  - ${item}`)]
			: []),
	];
	const taskRefLines = [
		...(task.spec_paths.length > 0
			? ["Spec paths:", ...task.spec_paths.map((path) => `- ${path}`)]
			: []),
		...(task.code_paths.length > 0
			? ["Code paths:", ...task.code_paths.map((path) => `- ${path}`)]
			: []),
		...(task.research_ids.length > 0
			? ["Research ids:", ...task.research_ids.map((researchId) => `- ${researchId}`)]
			: []),
	];
	return renderSkillAsset("prompts/resume-implementation.md", {
		"project.label": project.label,
		"task.id": task.id,
		"task.summary_block": renderBlock(taskSummaryLines),
		"task.context_block": renderBlock(
			taskContextLines.length > 0 ? taskContextLines : fallbackContextLines,
		),
		"task.delta_block": renderBlock([
			`- Desired: ${task.delta.desired}`,
			`- Current: ${task.delta.current}`,
			`- Closure: ${task.delta.closure}`,
		]),
		"task.refs_block": renderBlock(taskRefLines),
		"preflight.color": statusColor(report),
		"evidence": evidence,
		"follow_up_intent_section": renderFollowUpIntentSection(followUpIntent),
	});
}
