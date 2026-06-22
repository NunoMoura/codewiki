export type CodewikiSubcommand =
	| "state"
	| "resume"
	| "explain"
	| "config"
	| "bootstrap";

export interface CodewikiDirectCommandSpec {
	name: string;
	subcommand: CodewikiSubcommand;
	syntax: string;
	description: string;
}

export const CODEWIKI_DIRECT_COMMANDS: readonly CodewikiDirectCommandSpec[] = [
	{
		name: "wiki-state",
		subcommand: "state",
		syntax:
			"/wiki-state [--board|--quality|--blockers|--all] [--trace <id>] [--json]",
		description: "show project state",
	},
	{
		name: "wiki-resume",
		subcommand: "resume",
		syntax: "/wiki-resume [--trace <id>] [--json]",
		description: "show the next safe action",
	},
	{
		name: "wiki-explain",
		subcommand: "explain",
		syntax: "/wiki-explain [target] [--json]",
		description: "explain the project, a flow, component, or path",
	},
	{
		name: "wiki-config",
		subcommand: "config",
		syntax: "/wiki-config [--json]",
		description: "inspect effective CodeWiki config",
	},
	{
		name: "wiki-bootstrap",
		subcommand: "bootstrap",
		syntax: "/wiki-bootstrap [--allow-non-project-install] [--json]",
		description: "set up or refresh this project",
	},
] as const;

export const CODEWIKI_COMMAND_NAMES = [
	"wiki-state",
	"wiki-resume",
	"wiki-explain",
	"wiki-config",
	"wiki-bootstrap",
] as const;

export const CODEWIKI_USAGE_LINES = [
	"Available CodeWiki commands:",
	...CODEWIKI_DIRECT_COMMANDS.map(
		(command) => `• ${command.syntax} — ${command.description}`,
	),
] as const;
