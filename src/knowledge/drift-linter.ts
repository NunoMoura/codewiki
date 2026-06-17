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
		pattern: /\/codewiki(?:\s|$)/,
		message: "Public docs must use /wiki, not /codewiki.",
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
		id: "public_state_command",
		scope: "product_documentation",
		pattern: /\bwiki_status\b|\/wiki\s+status\b/,
		message: "Public UX must use state, not status.",
	},
	{
		id: "current_dogfood_guidance",
		scope: "operating_guidance",
		pattern: /extension is disabled|while the extension is disabled|hosts\.cli/,
		message:
			"Docs and skills must use current repo-local dogfood gating wording.",
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
	const pattern = statelessPattern(rule.pattern);
	const match = pattern.exec(file.content)?.[0];
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

function statelessPattern(pattern: RegExp): RegExp {
	return new RegExp(pattern.source, pattern.flags.replace(/g/g, ""));
}
