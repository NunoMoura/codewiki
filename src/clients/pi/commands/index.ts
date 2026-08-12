import {randomUUID} from "node:crypto";

import { runWikiConfig } from "../../../api/wiki-config.ts";
import { bootstrapCodewiki } from "../../../project/bootstrap.ts";
import {BACKLOG_TRIAGE_QUERY_PROTOCOL} from "../../../changes/triage/contracts.ts";
import {
	DECISION_ATTENTION_SELECTION_PROTOCOL,
	parseDecisionAttentionSelectionCommand,
} from "../../../changes/triage/selection.ts";
import { resolveWikiConfigFile } from "../../../project/config-file.ts";
import { buildProjectExplainView } from "../../../project/explain.ts";
import { findCodewikiProjectRoot } from "../../../project/root.ts";
import { buildProjectWikiState } from "../../../project/state-file.ts";
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
	buildCodewikiAppUrlMessage,
	closeCodewikiAppServer,
	startCodewikiAppServer,
} from "../../../host/app/server.ts";
import { stopProjectCoordinatorService } from "../../../runtime/coordinator/service.ts";
import { piPreviewControl } from "../preview-runtime.ts";
import {
	createPiProjectServiceClients,
	type PiProjectServiceClientProvider,
} from "../project-service-client.ts";
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

export function registerCodewikiCommands(
	pi: CodewikiExtensionApi,
	connectProjectCoordinator = true,
	projectServices: PiProjectServiceClientProvider = createPiProjectServiceClients(),
): void {
	for (const command of CODEWIKI_DIRECT_COMMANDS) {
		pi.registerCommand(
			command.name,
			directWikiCommand(
				pi,
				command.subcommand,
				command.description,
				connectProjectCoordinator,
				projectServices,
			),
		);
	}
}

function directWikiCommand(
	pi: CodewikiExtensionApi,
	subcommand: CodewikiSubcommand,
	description: string,
	connectProjectCoordinator: boolean,
	projectServices: PiProjectServiceClientProvider,
): CodewikiCommandDefinition {
	return {
		description,
		handler: async (args, ctx) => {
			return await dispatchWikiCommand(
				subcommand,
				tokens(args),
				ctx,
				pi,
				connectProjectCoordinator,
				projectServices,
			);
		},
	};
}

async function dispatchWikiCommand(
	subcommand: string,
	args: string[],
	ctx: CodewikiExtensionContext,
	pi: CodewikiExtensionApi,
	connectProjectCoordinator: boolean,
	projectServices: PiProjectServiceClientProvider,
): Promise<unknown> {
	if (subcommand === "dashboard") {
		return await dashboardCommand(args, ctx, pi, connectProjectCoordinator);
	}
	if (subcommand === "attention") {
		return await decisionAttentionCommand(args, ctx, pi, projectServices);
	}
	if (subcommand === "select") {
		return await selectDecisionCommand(args, ctx, pi, projectServices);
	}
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
	connectProjectCoordinator: boolean,
): Promise<unknown> {
	const options = parseDashboardOptions(args);
	const result = await startDashboard(
		ctx,
		options,
		connectProjectCoordinator,
	);
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
	connectProjectCoordinator: boolean,
): Promise<DashboardCommandResult> {
	const root = await requireCodewikiRoot(ctx);
	notifyInstallWarning(ctx, root);
	if (options.stop) {
		await closeCodewikiAppServer(root);
		if (connectProjectCoordinator) {
			await stopProjectCoordinatorService(root).catch(() => undefined);
		}
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
	const dashboard = await startCodewikiAppServer({
		repoRoot: root,
		open,
		keepAlive: ctx.mode === "tui",
		inProcess: true,
		persistent: false,
		previewControl: piPreviewControl(root),
		projectCoordinatorClient: connectProjectCoordinator,
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
	return [buildCodewikiAppUrlMessage(url)];
}

interface DecisionAttentionCommandOptions {
	json: boolean;
}

interface SelectDecisionCommandOptions {
	changeId: string;
	changeRevisionId: string;
	expectedProjectionDigest: string;
	json: boolean;
	allowNonProjectInstall: boolean;
}

async function decisionAttentionCommand(
	args: string[],
	ctx: CodewikiExtensionContext,
	pi: CodewikiExtensionApi,
	projectServices: PiProjectServiceClientProvider,
): Promise<unknown> {
	const options = parseDecisionAttentionOptions(args);
	const root = await requireCodewikiRoot(ctx);
	const result = await projectServices.decisionAttention({
		repoRoot: root,
		context: ctx,
	});
	if (
		result.protocol.id !== BACKLOG_TRIAGE_QUERY_PROTOCOL.id ||
		result.protocol.version !== BACKLOG_TRIAGE_QUERY_PROTOCOL.version
	) {
		throw new Error("Coordinator returned an unsupported Decision attention protocol.");
	}
	const rendered = renderDecisionAttention(result);
	const message = options.json ? JSON.stringify(result, null, 2) : rendered.join("\n");
	emitCommandOutput(pi, ctx, message, options.json ? [message] : rendered);
	return {
		command: "attention",
		json: options.json,
		result,
		rendered,
	};
}

async function selectDecisionCommand(
	args: string[],
	ctx: CodewikiExtensionContext,
	pi: CodewikiExtensionApi,
	projectServices: PiProjectServiceClientProvider,
): Promise<unknown> {
	const options = parseSelectDecisionOptions(args);
	const root = await requireCodewikiRoot(ctx);
	assertProjectLocalMutationAllowed({
		toolName: "/wiki-select",
		ctx,
		projectRoot: root,
		moduleUrl: import.meta.url,
		input: options.allowNonProjectInstall
			? {allowNonProjectInstall: true}
			: {},
	});
	const command = parseDecisionAttentionSelectionCommand({
		protocolId: DECISION_ATTENTION_SELECTION_PROTOCOL.id,
		protocolVersion: DECISION_ATTENTION_SELECTION_PROTOCOL.version,
		idempotencyKey: `pi-selection:${randomUUID()}`,
		changeId: options.changeId,
		changeRevisionId: options.changeRevisionId,
		expectedProjectionDigest: options.expectedProjectionDigest,
	});
	const result = await projectServices.selectDecision({
		repoRoot: root,
		context: ctx,
		command,
	});
	const body = {
		command: "select",
		changeId: command.changeId,
		changeRevisionId: command.changeRevisionId,
		expectedProjectionDigest: command.expectedProjectionDigest,
		idempotencyKey: command.idempotencyKey,
		attemptOperationId: result.attemptOperationId,
	};
	const rendered = [
		"CodeWiki Decision Selection",
		`Change: ${command.changeId}`,
		`Revision: ${command.changeRevisionId}`,
		`Projection: ${command.expectedProjectionDigest}`,
		`Attempt: ${result.attemptOperationId}`,
	];
	const message = options.json ? JSON.stringify(body, null, 2) : rendered.join("\n");
	emitCommandOutput(pi, ctx, message, options.json ? [message] : rendered);
	return {...body, json: options.json, rendered};
}

function parseDecisionAttentionOptions(
	args: string[],
): DecisionAttentionCommandOptions {
	if (args.length === 0) return {json: false};
	if (args.length === 1 && args[0] === "--json") return {json: true};
	throw new Error(`Unsupported /wiki-attention option: ${args[0]}`);
}

function parseSelectDecisionOptions(args: string[]): SelectDecisionCommandOptions {
	let changeId: string | undefined;
	let changeRevisionId: string | undefined;
	let expectedProjectionDigest: string | undefined;
	let json = false;
	let allowNonProjectInstall = false;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--revision") {
			changeRevisionId = requiredFlagValue("select", arg, args[++index]);
			continue;
		}
		if (arg === "--projection") {
			expectedProjectionDigest = requiredFlagValue(
				"select",
				arg,
				args[++index],
			);
			continue;
		}
		if (arg === "--json") {
			json = true;
			continue;
		}
		if (arg === "--allow-non-project-install") {
			allowNonProjectInstall = true;
			continue;
		}
		if (arg.startsWith("--")) {
			throw new Error(`Unsupported /wiki-select option: ${arg}`);
		}
		if (changeId !== undefined) {
			throw new Error(`/wiki-select received unexpected argument: ${arg}`);
		}
		changeId = arg;
	}
	if (!changeId || !changeRevisionId || !expectedProjectionDigest) {
		throw new Error(
			"Usage: /wiki-select <change-id> --revision <revision-id> --projection <digest> [--json]",
		);
	}
	return {
		changeId,
		changeRevisionId,
		expectedProjectionDigest,
		json,
		allowNonProjectInstall,
	};
}

function renderDecisionAttention(
	result: Awaited<ReturnType<PiProjectServiceClientProvider["decisionAttention"]>>,
): string[] {
	const lines = [
		"CodeWiki Decision Attention",
		`Projection: ${result.projectionDigest}`,
		`Showing ${result.coverage.returnedCandidateCount} of ${result.coverage.matchedCandidateCount} matched Change revision(s).`,
	];
	for (const item of result.items) {
		lines.push(
			`${item.rank}. ${item.candidate.title} (${item.candidate.changeId})`,
			`   Revision: ${item.candidate.changeRevisionId}`,
			`   Status: ${item.candidate.status}; readiness: ${item.candidate.readiness.value}`,
		);
		for (const reason of item.orderingReasons.slice(0, 2)) {
			lines.push(`   Why: ${reason.detail}`);
		}
	}
	if (result.coverage.truncated) {
		lines.push("Result is truncated; use the coordinator query API with this projection digest for bounded filtering.");
	}
	return lines;
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
