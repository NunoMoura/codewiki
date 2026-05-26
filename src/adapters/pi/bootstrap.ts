import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { formatError } from "../../domain/shared/utils.ts";
import {
	bootstrapFromCurrentProject,
	bootstrapToolPorts,
	formatBootstrapSummary,
	parseBootstrapArgs,
	renderOnboardingPrompt,
} from "../../project/bootstrap.ts";
import type { BootstrapResult } from "../../project/bootstrap.ts";
import {
	executeCodewikiBootstrapTool,
	executeCodewikiSetupTool,
} from "../../project/tool.ts";

const repoPathToolField = Type.Optional(
	Type.String({
		description:
			"Optional repo root, or any path inside the target repo, when the current cwd is outside that repo.",
	}),
);

export function registerBootstrapFeatures(pi: ExtensionAPI): void {
	pi.registerCommand("wiki-bootstrap", {
		description:
			"Adopt or scaffold a repo-local codebase wiki, then start intelligent onboarding. Usage: /wiki-bootstrap [project name] [--force]",
		getArgumentCompletions: (prefix) => {
			const options = ["--force"];
			const items = options.filter((item) => item.startsWith(prefix));
			return items.length
				? items.map((value) => ({ value, label: value }))
				: null;
		},
		handler: async (args, ctx) => {
			try {
				const result = await bootstrapFromCurrentProject(
					ctx.cwd,
					parseBootstrapArgs(args, { allowForce: true }),
				);
				ctx.ui.notify(formatBootstrapSummary("Bootstrapped", result), "info");
				queueOnboardingPrompt(pi, ctx, result);
			} catch (error) {
				ctx.ui.notify(formatError(error), "error");
			}
		},
	});

	pi.registerTool({
		name: "codewiki_setup",
		label: "Codewiki Setup",
		description:
			"Configure codewiki for the current project without overwriting existing starter files",
		promptSnippet:
			"Adopt or initialize the codebase wiki contract for the current project",
		promptGuidelines: [
			"Use this as the safe default when the repo should gain codewiki support but you do not want to overwrite starter files.",
			"This reuses an existing ancestor wiki root when present, otherwise it targets the enclosing git repo root when present, else the current working directory.",
		],
		parameters: Type.Object({
			projectName: Type.Optional(Type.String()),
			repoPath: repoPathToolField,
		}),
		async execute(_toolCallId: string, params: any, _signal: unknown, _onUpdate: unknown, ctx: any) {
			return executeCodewikiSetupTool(params, { cwd: ctx.cwd }, bootstrapToolPorts());
		},
	} as any);

	pi.registerTool({
		name: "codewiki_bootstrap",
		label: "Codewiki Bootstrap",
		description:
			"Scaffold a starter repo-local codebase wiki into the current project",
		promptSnippet:
			"Scaffold the starter codebase wiki contract into the current project",
		promptGuidelines: [
			"Use this when the user wants to create the starter codebase wiki contract in the current project.",
			"This reuses an existing ancestor wiki root when present, otherwise it targets the enclosing git repo root when present, else the current working directory.",
			"Prefer force=false unless the user explicitly asks to overwrite starter files.",
		],
		parameters: Type.Object({
			projectName: Type.Optional(
				Type.String({
					description:
						"Project name to write into starter docs; defaults to current directory name.",
				}),
			),
			force: Type.Optional(
				Type.Boolean({
					description: "Overwrite existing starter files if true.",
				}),
			),
			repoPath: repoPathToolField,
		}),
		async execute(_toolCallId: string, params: any, _signal: unknown, _onUpdate: unknown, ctx: any) {
			return executeCodewikiBootstrapTool(params, { cwd: ctx.cwd }, bootstrapToolPorts());
		},
	} as any);
}

function queueOnboardingPrompt(
	pi: ExtensionAPI,
	ctx: { isIdle?: () => boolean },
	result: BootstrapResult,
): void {
	const prompt = renderOnboardingPrompt(result);
	try {
		if (typeof ctx.isIdle === "function" && ctx.isIdle())
			pi.sendUserMessage(prompt);
		else pi.sendUserMessage(prompt, { deliverAs: "followUp" });
	} catch {
		// Ignore in smoke tests or non-standard execution contexts.
	}
}
