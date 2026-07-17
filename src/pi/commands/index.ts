import { runWikiConfig } from "../../api/wiki-config.ts";
import { bootstrapCodewiki } from "../../project/bootstrap.ts";
import { resolveWikiConfigFile } from "../../project/config-file.ts";
import { buildProjectExplainView } from "../../project/explain.ts";
import { findCodewikiProjectRoot } from "../../project/root.ts";
import { buildProjectWikiState } from "../../project/state-file.ts";
import {
	CODEWIKI_DIRECT_COMMANDS,
	type CodewikiSubcommand,
} from "../command-catalog.ts";
import {
	assertProjectLocalMutationAllowed,
	projectLocalInstallWarning,
} from "../install-scope.ts";
import { resolveCodewikiExtensionIdentity } from "../identity.ts";
import {
	buildCodewikiDashboardUrlMessage,
	closeCodewikiDashboardServer,
	startCodewikiDashboardServer,
} from "../../dashboard/index.ts";
import { CODEWIKI_COMMAND_MESSAGE_TYPE } from "../rendering/message-renderers.ts";
import {
	renderBootstrapCommand,
	renderConfigCommand,
	renderExplainCommand,
	renderResumeCommand,
	type CommandRenderOptions,
} from "../tui/index.ts";
import type {
	CodewikiCommandDefinition,
	CodewikiExtensionApi,
	CodewikiExtensionContext,
} from "../types.ts";

export function registerCodewikiCommands(pi: CodewikiExtensionApi): void {
	for (const command of CODEWIKI_DIRECT_COMMANDS) {
		pi.registerCommand(
			command.name,
			directWikiCommand(pi, command.subcommand, command.description),
		);
	}
}

function directWikiCommand(
	pi: CodewikiExtensionApi,
	subcommand: CodewikiSubcommand,
	description: string,
): CodewikiCommandDefinition {
	return {
		description,
		handler: async (args, ctx) => {
			return await dispatchWikiCommand(subcommand, tokens(args), ctx, pi);
		},
	};
}

async function dispatchWikiCommand(
	subcommand: string,
	args: string[],
	ctx: CodewikiExtensionContext,
	pi: CodewikiExtensionApi,
): Promise<unknown> {
	if (subcommand === "dashboard") return await dashboardCommand(args, ctx, pi);
	if (subcommand === "resume") return await resumeCommand(args, ctx, pi);
	if (subcommand === "explain") return await explainCommand(args, ctx, pi);
	if (subcommand === "config") return await configCommand(args, ctx, pi);
	if (subcommand === "bootstrap") return await bootstrapCommand(args, ctx, pi);
	throw new Error(`Unknown CodeWiki command: ${subcommand}`);
}

interface DashboardCommandOptions {
	json: boolean;
	open?: boolean;
	stop: boolean;
}

interface DashboardCommandResult {
	command: "dashboard";
	json: boolean;
	url?: string;
	opened: boolean;
	stopped: boolean;
	rendered: string[];
}

async function dashboardCommand(
	args: string[],
	ctx: CodewikiExtensionContext,
	pi: CodewikiExtensionApi,
): Promise<unknown> {
	const options = parseDashboardOptions(args);
	const result = await startDashboard(ctx, options);
	emitCommandOutput(
		pi,
		ctx,
		options.json
			? "CodeWiki dashboard: JSON returned."
			: result.rendered.join("\n"),
		result.rendered,
	);
	return result;
}

async function startDashboard(
	ctx: CodewikiExtensionContext,
	options: DashboardCommandOptions,
): Promise<DashboardCommandResult> {
	const root = await requireCodewikiRoot(ctx);
	notifyInstallWarning(ctx, root);
	if (options.stop) {
		await closeCodewikiDashboardServer(root);
		return {
			command: "dashboard",
			json: options.json,
			opened: false,
			stopped: true,
			rendered: [
				"CodeWiki dashboard stopped. Run /wiki-dashboard to reopen it.",
			],
		};
	}
	const open = options.open ?? (!options.json && ctx.mode === "tui");
	const dashboard = await startCodewikiDashboardServer({
		repoRoot: root,
		open,
		keepAlive: ctx.mode === "tui",
		inProcess: true,
		persistent: false,
	});
	return {
		command: "dashboard",
		json: options.json,
		url: dashboard.url,
		opened: dashboard.opened,
		stopped: false,
		rendered: renderDashboardMessage(dashboard.url),
	};
}

function renderDashboardMessage(url: string): string[] {
	return [buildCodewikiDashboardUrlMessage(url)];
}

async function resumeCommand(
	args: string[],
	ctx: CodewikiExtensionContext,
	pi: CodewikiExtensionApi,
): Promise<unknown> {
	const options = parseTraceJsonOptions("resume", args);
	const root = await requireCodewikiRoot(ctx);
	notifyInstallWarning(ctx, root);
	const snapshot = await buildProjectWikiState({
		repoRoot: root,
		traceId: options.traceId,
	});
	const resume = snapshot.resume;
	const renderOptions = commandRenderOptions(ctx);
	if (!resume) {
		const rendered = renderResumeCommand(undefined, renderOptions);
		emitCommandOutput(
			pi,
			ctx,
			options.json ? "CodeWiki resume: JSON returned." : rendered.join("\n"),
			rendered,
		);
		return {
			command: "resume",
			json: options.json,
			message: "CodeWiki resume: select a trace with --trace.",
			data: snapshot,
			rendered,
		};
	}
	const rendered = renderResumeCommand(resume, renderOptions);
	emitCommandOutput(
		pi,
		ctx,
		options.json ? "CodeWiki resume: JSON returned." : rendered.join("\n"),
		rendered,
	);
	return { command: "resume", json: options.json, data: resume, rendered };
}

async function explainCommand(
	args: string[],
	ctx: CodewikiExtensionContext,
	pi: CodewikiExtensionApi,
): Promise<unknown> {
	const options = parseExplainOptions(args);
	const root = await requireCodewikiRoot(ctx);
	notifyInstallWarning(ctx, root);
	const view = await buildProjectExplainView({
		repoRoot: root,
		target: options.target,
	});
	const rendered = renderExplainCommand(view, commandRenderOptions(ctx, root));
	emitCommandOutput(
		pi,
		ctx,
		options.json ? "CodeWiki explain: JSON returned." : rendered.join("\n"),
		rendered,
	);
	return { command: "explain", json: options.json, data: view, rendered };
}

async function configCommand(
	args: string[],
	ctx: CodewikiExtensionContext,
	pi: CodewikiExtensionApi,
): Promise<unknown> {
	const options = parseTraceJsonOptions("config", args);
	const root = await findCodewikiProjectRoot(ctx.cwd);
	notifyInstallWarning(ctx, root);
	const config = root
		? await resolveWikiConfigFile(root, {})
		: runWikiConfig({});
	const rendered = renderConfigCommand(config, commandRenderOptions(ctx, root));
	emitCommandOutput(
		pi,
		ctx,
		options.json ? "CodeWiki config: JSON returned." : rendered.join("\n"),
		rendered,
	);
	return { command: "config", json: options.json, data: config, rendered };
}

async function bootstrapCommand(
	args: string[],
	ctx: CodewikiExtensionContext,
	pi: CodewikiExtensionApi,
): Promise<unknown> {
	const options = parseTraceJsonOptions("bootstrap", args, {
		allowNonProjectInstall: true,
	});
	assertProjectLocalMutationAllowed({
		toolName: "/wiki-bootstrap",
		ctx,
		moduleUrl: import.meta.url,
		input: {
			allowNonProjectInstall: options.allowNonProjectInstall,
		},
	});
	const result = await bootstrapCodewiki(ctx.cwd);
	const rendered = renderBootstrapCommand(
		result,
		commandRenderOptions(ctx, result.repoRoot),
	);
	emitCommandOutput(
		pi,
		ctx,
		options.json ? "CodeWiki bootstrap: JSON returned." : rendered.join("\n"),
		rendered,
	);
	return { command: "bootstrap", json: options.json, data: result, rendered };
}

function parseDashboardOptions(args: string[]): DashboardCommandOptions {
	const options: DashboardCommandOptions = { json: false, stop: false };
	for (const arg of args) {
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg === "--no-open") {
			options.open = false;
			continue;
		}
		if (arg === "--open") {
			options.open = true;
			continue;
		}
		if (arg === "--stop") {
			options.stop = true;
			continue;
		}
		throw new Error(`Unsupported /wiki-dashboard option: ${arg}`);
	}
	if (options.stop && options.open !== undefined) {
		throw new Error(
			"/wiki-dashboard --stop cannot be combined with --open or --no-open.",
		);
	}
	return options;
}

function parseTraceJsonOptions(
	command: string,
	args: string[],
	flags: { allowNonProjectInstall?: boolean } = {},
): { json: boolean; traceId?: string; allowNonProjectInstall?: boolean } {
	const options: {
		json: boolean;
		traceId?: string;
		allowNonProjectInstall?: boolean;
	} = { json: false };
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg === "--trace") {
			options.traceId = requiredFlagValue(command, arg, args[++index]);
			continue;
		}
		if (arg === "--allow-non-project-install" && flags.allowNonProjectInstall) {
			options.allowNonProjectInstall = true;
			continue;
		}
		throw new Error(`Unsupported /wiki-${command} option: ${arg}`);
	}
	return options;
}

function parseExplainOptions(args: string[]): {
	json: boolean;
	target?: string;
} {
	const target: string[] = [];
	let json = false;
	for (const arg of args) {
		if (arg === "--json") {
			json = true;
			continue;
		}
		target.push(arg);
	}
	return { json, ...(target.length ? { target: target.join(" ") } : {}) };
}

async function requireCodewikiRoot(
	ctx: CodewikiExtensionContext,
): Promise<string> {
	const root = await findCodewikiProjectRoot(ctx.cwd);
	if (!root) {
		throw new Error(
			"No CodeWiki project found. Run /wiki-bootstrap from the project root.",
		);
	}
	return root;
}

function emitCommandOutput(
	pi: CodewikiExtensionApi,
	ctx: CodewikiExtensionContext,
	message: string,
	lines = message.split("\n"),
): void {
	if (ctx.mode === "tui" && pi.sendMessage) {
		pi.sendMessage({
			customType: CODEWIKI_COMMAND_MESSAGE_TYPE,
			content: [{ type: "text", text: message }],
			display: true,
			details: { lines },
		});
		return;
	}
	ctx.ui?.notify(message, "info");
}

function notifyInstallWarning(
	ctx: CodewikiExtensionContext,
	projectRoot: string | undefined,
): void {
	const warning = projectLocalInstallWarning(import.meta.url, projectRoot);
	if (warning) ctx.ui?.notify(warning, "warning");
}

function commandRenderOptions(
	ctx: CodewikiExtensionContext,
	projectRoot?: string,
): CommandRenderOptions {
	const options: CommandRenderOptions = {
		extensionIdentity: resolveCodewikiExtensionIdentity(
			import.meta.url,
			projectRoot,
		),
	};
	if (typeof ctx.ui?.width === "number" && Number.isFinite(ctx.ui.width)) {
		options.width = ctx.ui.width;
	}
	return options;
}

function tokens(args: string): string[] {
	return args.trim().split(/\s+/).filter(Boolean);
}

function requiredFlagValue(
	command: string,
	flag: string,
	value: string | undefined,
): string {
	if (!value || value.startsWith("--")) {
		throw new Error(`/wiki-${command} ${flag} requires a value.`);
	}
	return value;
}
