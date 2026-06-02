import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runBootstrapCommand } from "../bootstrap.ts";
import { runConfigCommand } from "./config.ts";
import { runProductCommand } from "./product.ts";
import { runResumeCommand } from "./resume.ts";
import { runStatusCommand } from "./status.ts";
import { runSystemCommand } from "./system.ts";
import { splitCommandArgs, joinCommandArgs } from "../../../shared/utils.ts";
import { withUiErrorHandling } from "../ui/manager.ts";

const WIKI_SUBCOMMANDS = [
	"bootstrap",
	"status",
	"resume",
	"config",
	"system",
	"product",
] as const;

type WikiSubcommand = (typeof WIKI_SUBCOMMANDS)[number];

interface WikiCommandInput {
	subcommand: WikiSubcommand | null;
	rest: string;
}

export function parseWikiCommandInput(args: string): WikiCommandInput {
	const tokens = splitCommandArgs(args);
	const [rawSubcommand, ...restTokens] = tokens;
	const normalized = String(rawSubcommand || "").toLowerCase();
	const subcommand = WIKI_SUBCOMMANDS.includes(normalized as WikiSubcommand)
		? (normalized as WikiSubcommand)
		: null;
	return {
		subcommand,
		rest: joinCommandArgs(restTokens) || "",
	};
}

export function completeWikiCommand(prefix: string) {
	const tokens = splitCommandArgs(prefix);
	if (tokens.length > 1 || /\s$/.test(prefix)) return null;
	return WIKI_SUBCOMMANDS.filter((item) =>
		item.startsWith(tokens[0] || ""),
	).map((value) => ({ value, label: value }));
}

export function registerWikiCommand(pi: ExtensionAPI): void {
	pi.registerCommand("wiki", {
		description:
			"CodeWiki command router. Usage: /wiki <bootstrap|status|resume|config|system|product> [...args]",
		getArgumentCompletions: completeWikiCommand,
		handler: async (args, ctx) => {
			await withUiErrorHandling(ctx, async () => {
				const input = parseWikiCommandInput(args);
				switch (input.subcommand) {
					case "bootstrap":
						await runBootstrapCommand(pi, input.rest, ctx);
						return;
					case "status":
						await runStatusCommand(pi, input.rest, ctx, "wiki status");
						return;
					case "resume":
						await runResumeCommand(pi, "wiki resume", input.rest, ctx);
						return;
					case "config":
						await runConfigCommand(input.rest, ctx, "wiki config");
						return;
					case "system":
						await runSystemCommand(pi, input.rest, ctx, "wiki system");
						return;
					case "product":
						await runProductCommand(pi, input.rest, ctx, "wiki product");
						return;
					default:
						ctx.ui.notify(
							"Usage: /wiki <bootstrap|status|resume|config|system|product> [...args].",
							"warning",
						);
				}
			});
		},
	});
}
