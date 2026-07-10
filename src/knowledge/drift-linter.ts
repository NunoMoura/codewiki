export type KnowledgeDriftScope =
	| "operating_guidance"
	| "product_documentation";

export interface KnowledgeDriftFile {
	path: string;
	content: string;
	scopes: KnowledgeDriftScope[];
}

export interface KnowledgeDriftRule {
	id: string;
	scope: KnowledgeDriftScope;
	pattern: RegExp;
	message: string;
}

export interface KnowledgeDriftIssue {
	ruleId: string;
	path: string;
	message: string;
	match: string;
}

export const CODEWIKI_KNOWLEDGE_DRIFT_RULES: KnowledgeDriftRule[] = [
	{
		id: "public_command_namespace",
		scope: "product_documentation",
		pattern: /(?:^|[\s`])\/codewiki(?:\s|$)/,
		message: "Public docs must use direct /wiki-* commands, not /codewiki.",
	},
	{
		id: "grouped_wiki_namespace",
		scope: "product_documentation",
		pattern: /\/wiki\s+(?:state|resume|explain|config|bootstrap)(?:\b|\s|$)/,
		message:
			"Public docs must use direct /wiki-* commands, not the grouped /wiki namespace.",
	},
	{
		id: "transitional_cli_product_ux",
		scope: "product_documentation",
		pattern: /\bcodewiki\s+(?:<command>|state|bootstrap)(?:\b|\s|$)/,
		message: "Product docs must not advertise the transitional CLI as UX.",
	},
	{
		id: "trace_close_event_name",
		scope: "product_documentation",
		pattern: /\btrace\.close\b/,
		message: "Docs must use trace_close event wording.",
	},
	{
		id: "prefixed_semantic_event_field",
		scope: "product_documentation",
		pattern: /["']event["']\s*:\s*["'](?:decision|planning|implementation)\./,
		message:
			"Stored semantic trace event examples must use split loop plus unprefixed event fields.",
	},
	{
		id: "public_state_command",
		scope: "product_documentation",
		pattern: /\bwiki_status\b|\/wiki[-\s]+status\b|\/wiki-state(?:`|\s|$)/,
		message: "Public UX must use /wiki-dashboard, not status or /wiki-state.",
	},
	{
		id: "folded_trace_product_concept",
		scope: "product_documentation",
		pattern: /\bfold(?:ed|ing)?\s+trace(?:s|\s+state|\s+records)?\b/i,
		message:
			"Product docs should say views are derived from traces instead of exposing fold as a product concept.",
	},
	{
		id: "loop_tool_rendering_ux",
		scope: "product_documentation",
		pattern: /\bloop tool renders\b|\bTool rendering contract\b/,
		message:
			"Post-bootstrap UX should be append/view driven, not rich loop tool rendering.",
	},
	{
		id: "repo_local_dogfood_boundary",
		scope: "operating_guidance",
		pattern: /\.pi\/extensions\/codewiki\.ts loads|hosts\.cli/i,
		message:
			"Docs and skills must keep CodeWiki dogfooding on the project-local package path, not legacy host or shim wiring.",
	},
];

export function lintKnowledgeDrift(
	files: KnowledgeDriftFile[],
	rules: KnowledgeDriftRule[] = CODEWIKI_KNOWLEDGE_DRIFT_RULES,
): KnowledgeDriftIssue[] {
	return files.flatMap((file) =>
		rules.flatMap((rule) => lintKnowledgeDriftFile(file, rule)),
	);
}

export function formatKnowledgeDriftIssues(
	issues: KnowledgeDriftIssue[],
): string[] {
	return issues.map(
		(issue) =>
			`${issue.path}: ${issue.ruleId}: ${issue.message} (matched ${JSON.stringify(issue.match)})`,
	);
}

function lintKnowledgeDriftFile(
	file: KnowledgeDriftFile,
	rule: KnowledgeDriftRule,
): KnowledgeDriftIssue[] {
	if (!file.scopes.includes(rule.scope)) return [];
	rule.pattern.lastIndex = 0;
	const match = rule.pattern.exec(file.content)?.[0];
	if (!match) return [];
	return [
		{
			ruleId: rule.id,
			path: file.path,
			message: rule.message,
			match,
		},
	];
}
