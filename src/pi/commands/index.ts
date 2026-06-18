import { runWikiConfig } from "../../api/wiki-config.ts";
import { bootstrapCodewiki } from "../../project/bootstrap.ts";
import { resolveWikiConfigFile } from "../../project/config-file.ts";
import { buildProjectExplainView } from "../../project/explain.ts";
import { findCodewikiProjectRoot } from "../../project/root.ts";
import { buildProjectWikiState } from "../../project/state-file.ts";
import {
	assertProjectLocalMutationAllowed,
	projectLocalInstallWarning,
} from "../install-scope.ts";
import {
	renderBootstrapCommand,
	renderCodewikiStateFooterStatus,
	renderConfigCommand,
	renderExplainCommand,
	renderResumeCommand,
	renderStateCommand,
	setCodewikiFooterStatus,
	type CommandRenderOptions,
} from "../tui/index.ts";
import type { WikiStateSnapshot } from "../../api/state.ts";
import type {
	CodewikiCommandDefinition,
	CodewikiExtensionApi,
	CodewikiExtensionContext,
} from "../types.ts";

export function registerCodewikiCommands(pi: CodewikiExtensionApi): void {
	pi.registerCommand("wiki", wikiCommand());
}

function wikiCommand(): CodewikiCommandDefinition {
	return {
		description:
			"CodeWiki project commands. Supported while extension is explicit: state, resume, explain, config, bootstrap.",
		handler: async (args, ctx) => {
			const [subcommand, ...rest] = tokens(args);
			if (!subcommand || subcommand === "help") return notifyUsage(ctx);
			if (subcommand === "state") return await stateCommand(rest, ctx);
			if (subcommand === "resume") return await resumeCommand(rest, ctx);
			if (subcommand === "explain") return await explainCommand(rest, ctx);
			if (subcommand === "config") return await configCommand(rest, ctx);
			if (subcommand === "bootstrap") return await bootstrapCommand(rest, ctx);
			throw new Error(`Unknown /wiki command: ${subcommand}`);
		},
	};
}

type StateView = "summary" | "board" | "quality" | "blockers" | "all";

interface StateCommandOptions {
	view: StateView;
	json: boolean;
	traceId?: string;
}

async function stateCommand(
	args: string[],
	ctx: CodewikiExtensionContext,
): Promise<unknown> {
	const options = parseStateOptions(args);
	const root = await requireCodewikiRoot(ctx);
	notifyInstallWarning(ctx, root);
	const snapshot = await buildProjectWikiState({
		repoRoot: root,
		traceId: options.traceId,
	});
	const data = stateViewData(snapshot, options.view);
	const renderOptions = commandRenderOptions(ctx);
	const rendered = renderStateCommand(snapshot, options.view, renderOptions);
	notify(
		ctx,
		options.json
			? `CodeWiki state ${options.view}: JSON returned.`
			: rendered.join("\n"),
	);
	setCodewikiFooterStatus(ctx, renderCodewikiStateFooterStatus(snapshot));
	return {
		command: "state",
		view: options.view,
		json: options.json,
		data,
		rendered,
	};
}

async function resumeCommand(
	args: string[],
	ctx: CodewikiExtensionContext,
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
		notify(
			ctx,
			options.json ? "CodeWiki resume: JSON returned." : rendered.join("\n"),
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
	notify(
		ctx,
		options.json ? "CodeWiki resume: JSON returned." : rendered.join("\n"),
	);
	return { command: "resume", json: options.json, data: resume, rendered };
}

async function explainCommand(
	args: string[],
	ctx: CodewikiExtensionContext,
): Promise<unknown> {
	const options = parseExplainOptions(args);
	const root = await requireCodewikiRoot(ctx);
	notifyInstallWarning(ctx, root);
	const view = await buildProjectExplainView({
		repoRoot: root,
		target: options.target,
	});
	const rendered = renderExplainCommand(view, commandRenderOptions(ctx));
	notify(
		ctx,
		options.json ? "CodeWiki explain: JSON returned." : rendered.join("\n"),
	);
	return { command: "explain", json: options.json, data: view, rendered };
}

async function configCommand(
	args: string[],
	ctx: CodewikiExtensionContext,
): Promise<unknown> {
	const options = parseTraceJsonOptions("config", args);
	const root = await findCodewikiProjectRoot(ctx.cwd);
	notifyInstallWarning(ctx, root);
	const config = root
		? await resolveWikiConfigFile(root, {})
		: runWikiConfig({});
	const rendered = renderConfigCommand(config, commandRenderOptions(ctx));
	notify(
		ctx,
		options.json ? "CodeWiki config: JSON returned." : rendered.join("\n"),
	);
	return { command: "config", json: options.json, data: config, rendered };
}

async function bootstrapCommand(
	args: string[],
	ctx: CodewikiExtensionContext,
): Promise<unknown> {
	const options = parseTraceJsonOptions("bootstrap", args, {
		allowNonProjectInstall: true,
	});
	assertProjectLocalMutationAllowed({
		toolName: "/wiki bootstrap",
		ctx,
		moduleUrl: import.meta.url,
		input: {
			allowNonProjectInstall: options.allowNonProjectInstall,
		},
	});
	const result = await bootstrapCodewiki(ctx.cwd);
	const rendered = renderBootstrapCommand(result, commandRenderOptions(ctx));
	notify(
		ctx,
		options.json ? "CodeWiki bootstrap: JSON returned." : rendered.join("\n"),
	);
	return { command: "bootstrap", json: options.json, data: result, rendered };
}

function parseStateOptions(args: string[]): StateCommandOptions {
	const options: StateCommandOptions = { view: "summary", json: false };
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg === "--board") {
			options.view = "board";
			continue;
		}
		if (arg === "--quality") {
			options.view = "quality";
			continue;
		}
		if (arg === "--blockers") {
			options.view = "blockers";
			continue;
		}
		if (arg === "--all") {
			options.view = "all";
			continue;
		}
		if (arg === "--trace") {
			options.traceId = requiredFlagValue("state", arg, args[++index]);
			continue;
		}
		throw new Error(`Unsupported /wiki state option: ${arg}`);
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
		throw new Error(`Unsupported /wiki ${command} option: ${arg}`);
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

function stateViewData(snapshot: WikiStateSnapshot, view: StateView): unknown {
	if (view === "summary") {
		return {
			traceIds: snapshot.traceIds,
			status: snapshot.status,
			resume: snapshot.resume,
			workQueueSummary: snapshot.workQueue.summary,
		};
	}
	if (view === "board") {
		return {
			workPlan: snapshot.workPlan,
			workQueue: snapshot.workQueue,
		};
	}
	if (view === "quality") return snapshot.quality;
	if (view === "blockers") return snapshot.blockers;
	return snapshot;
}

async function requireCodewikiRoot(
	ctx: CodewikiExtensionContext,
): Promise<string> {
	const root = await findCodewikiProjectRoot(ctx.cwd);
	if (!root) {
		throw new Error(
			"No CodeWiki project found. Run /wiki bootstrap from the project root.",
		);
	}
	return root;
}

function notifyUsage(ctx: CodewikiExtensionContext): void {
	notify(
		ctx,
		"Usage: /wiki state [--board|--quality|--blockers|--all] [--json] | resume | explain [target] | config | bootstrap",
	);
}

function notify(ctx: CodewikiExtensionContext, message: string): void {
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
): CommandRenderOptions {
	return typeof ctx.ui?.width === "number" && Number.isFinite(ctx.ui.width)
		? { width: ctx.ui.width }
		: {};
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
		throw new Error(`/wiki ${command} ${flag} requires a value.`);
	}
	return value;
}
