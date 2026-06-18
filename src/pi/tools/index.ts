import { Type } from "typebox";
import {
	runWikiArchive,
	runWikiConfig,
	runWikiDecide,
	runWikiImplement,
	runWikiPlan,
	runWikiRuntime,
	type RunWikiArchiveInput,
	type RunWikiConfigInput,
	type RunWikiDecideInput,
	type RunWikiImplementInput,
	type RunWikiPlanInput,
	type RunWikiRuntimeInput,
} from "../../api/index.ts";
import type { WikiStateSnapshot } from "../../api/state.ts";
import {
	loadWikiConfigFile,
	resolveWikiConfigFile,
	updateWikiConfigFile,
} from "../../project/config-file.ts";
import { findCodewikiProjectRoot } from "../../project/root.ts";
import { buildProjectWikiState } from "../../project/state-file.ts";
import {
	assertProjectLocalMutationAllowed,
	stripNonProjectInstallOverride,
} from "../install-scope.ts";
import {
	renderCodewikiToolCall,
	renderCodewikiToolResult,
} from "../rendering/tool-renderers.ts";
import type {
	CodewikiExtensionApi,
	CodewikiExtensionContext,
	CodewikiToolDefinition,
	CodewikiToolResult,
} from "../types.ts";

const WIKI_STATE_TOOL_NAME = "wiki_state";

export const CODEWIKI_TOOL_NAMES = [
	WIKI_STATE_TOOL_NAME,
	"wiki_config",
	"wiki_decide",
	"wiki_plan",
	"wiki_implement",
	"wiki_runtime",
	"wiki_archive",
] as const;

type WikiStateToolView = "summary" | "board" | "quality" | "blockers" | "all";

const READ_ONLY_TOOL_NAMES = new Set<string>([WIKI_STATE_TOOL_NAME]);
const WIKI_STATE_TOOL_VIEWS = new Set<string>([
	"summary",
	"board",
	"quality",
	"blockers",
	"all",
]);

export function registerCodewikiTools(pi: CodewikiExtensionApi): void {
	const runSequential = createSequentialRunner();
	for (const tool of codewikiTools()) {
		pi.registerTool(withSequentialExecution(tool, runSequential));
	}
}

function createSequentialRunner(): <T>(
	task: () => T | Promise<T>,
) => Promise<T> {
	let tail = Promise.resolve();
	return async <T>(task: () => T | Promise<T>): Promise<T> => {
		const result = tail.then(task, task);
		tail = result.then(
			() => undefined,
			() => undefined,
		);
		return await result;
	};
}

function withSequentialExecution(
	tool: CodewikiToolDefinition,
	runSequential: <T>(task: () => T | Promise<T>) => Promise<T>,
): CodewikiToolDefinition {
	if (tool.executionMode !== "sequential") return tool;
	return {
		...tool,
		execute: (toolCallId, params, signal, onUpdate, ctx) =>
			runSequential(() =>
				tool.execute(toolCallId, params, signal, onUpdate, ctx),
			),
	};
}

function codewikiTools(): CodewikiToolDefinition[] {
	return [
		wikiStateTool(),
		wikiConfigTool(),
		facadeTool<RunWikiDecideInput>(
			"wiki_decide",
			"CodeWiki Decide",
			"Preview or append a CodeWiki decision iteration using the core facade.",
			"Run the CodeWiki decision loop facade for accepted intent and risks.",
			runWikiDecide,
		),
		facadeTool<RunWikiPlanInput>(
			"wiki_plan",
			"CodeWiki Plan",
			"Preview or append a CodeWiki planning iteration using the core facade.",
			"Run the CodeWiki planning loop facade for executable work items.",
			runWikiPlan,
		),
		facadeTool<RunWikiImplementInput>(
			"wiki_implement",
			"CodeWiki Implement",
			"Preview or append a CodeWiki implementation iteration using the core facade.",
			"Run the CodeWiki implementation loop facade for source evidence and planned verification coverage.",
			runWikiImplement,
		),
		wikiRuntimeTool(),
		facadeTool<RunWikiArchiveInput>(
			"wiki_archive",
			"CodeWiki Archive",
			"Preview or append CodeWiki archive lifecycle actions using the core facade.",
			"Run the CodeWiki archive facade for trace close, retention stubs, and hydration planning.",
			runWikiArchive,
		),
	];
}

function wikiStateTool(): CodewikiToolDefinition {
	return {
		name: WIKI_STATE_TOOL_NAME,
		label: "CodeWiki State",
		description:
			"Read CodeWiki trace-backed status, resume, work-plan, work-queue, blockers, conflicts, quality, and source ownership views for the current project.",
		promptSnippet:
			"Read CodeWiki state for the current repository from traces and source-map.",
		promptGuidelines: [
			"Use wiki_state before CodeWiki decision, planning, implementation, runtime, or archive work to inspect current trace-backed state.",
			"wiki_state does not write files and should not be replaced by shelling out to the transitional CodeWiki CLI.",
		],
		executionMode: "parallel",
		renderCall: (args) => renderCodewikiToolCall(WIKI_STATE_TOOL_NAME, args),
		renderResult: (result, options) =>
			renderCodewikiToolResult(WIKI_STATE_TOOL_NAME, result, options),
		parameters: Type.Object(
			{
				view: Type.Optional(
					Type.Union(
						[
							Type.Literal("summary"),
							Type.Literal("board"),
							Type.Literal("quality"),
							Type.Literal("blockers"),
							Type.Literal("all"),
						],
						{
							description:
								"Optional focused view to reduce returned state payload.",
						},
					),
				),
				traceId: Type.Optional(
					Type.String({
						description: "Optional trace id to select for per-trace views.",
					}),
				),
				generatedAt: Type.Optional(
					Type.String({
						description:
							"Optional generated timestamp for deterministic views.",
					}),
				),
				sourcePaths: Type.Optional(
					Type.Array(Type.String(), {
						description:
							"Optional source paths to resolve through source-map ownership.",
					}),
				),
			},
			{ additionalProperties: false },
		),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const root = await requireCodewikiRoot(ctx);
			const input = paramsObject(WIKI_STATE_TOOL_NAME, params, [
				"view",
				"traceId",
				"generatedAt",
				"sourcePaths",
			]);
			assertOptionalStateView(WIKI_STATE_TOOL_NAME, input, "view");
			assertOptionalString(WIKI_STATE_TOOL_NAME, input, "traceId");
			assertOptionalString(WIKI_STATE_TOOL_NAME, input, "generatedAt");
			assertOptionalStringArray(WIKI_STATE_TOOL_NAME, input, "sourcePaths");
			const snapshot = await buildProjectWikiState({
				repoRoot: root,
				traceId: optionalString(input.traceId),
				generatedAt: optionalString(input.generatedAt),
				sourcePaths: stringArray(input.sourcePaths),
			});
			const view = optionalStateView(input.view);
			return toolResult(
				`wiki_state: ${view || "all"} view, ${snapshot.traceIds.length} trace(s), ${snapshot.workQueue.items.length} queued item(s).`,
				stateToolPayload(snapshot, view),
			);
		},
	};
}

function wikiConfigTool(): CodewikiToolDefinition {
	return {
		name: "wiki_config",
		label: "CodeWiki Config",
		description:
			"Resolve or explicitly write CodeWiki configuration for the current project.",
		promptSnippet:
			"Resolve or write CodeWiki config for the current repository.",
		promptGuidelines: [
			"Use wiki_config to inspect CodeWiki automation, runtime, retention, and host policy before acting.",
			"wiki_config writes only when its write parameter is true; otherwise it is read-only.",
		],
		executionMode: "sequential",
		renderCall: (args) => renderCodewikiToolCall("wiki_config", args),
		renderResult: (result, options) =>
			renderCodewikiToolResult("wiki_config", result, options),
		parameters: Type.Object(
			{
				allowNonProjectInstall: Type.Optional(
					Type.Boolean({
						description:
							"Controlled-test override for write mode when CodeWiki is not loaded from this project's .pi install.",
					}),
				),
				input: Type.Optional(
					Type.Object(
						{},
						{
							additionalProperties: true,
							description:
								"Optional RunWikiConfigInput object, such as { patch: { runtime: { maxWorkers: 2 } } }.",
						},
					),
				),
				write: Type.Optional(
					Type.Boolean({
						description:
							"When true, write .codewiki/config.json in the current CodeWiki project.",
					}),
				),
			},
			{ additionalProperties: false },
		),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const args = paramsObject("wiki_config", params, [
				"allowNonProjectInstall",
				"input",
				"write",
			]);
			assertOptionalBoolean("wiki_config", args, "allowNonProjectInstall");
			assertOptionalBoolean("wiki_config", args, "write");
			const input = optionalInput<RunWikiConfigInput>(
				"wiki_config",
				args.input,
			);
			const root = await findCodewikiProjectRoot(ctx.cwd);
			if (args.write) {
				assertProjectLocalMutationAllowed({
					toolName: "wiki_config",
					ctx,
					projectRoot: root,
					moduleUrl: import.meta.url,
					input: {
						allowNonProjectInstall: args.allowNonProjectInstall,
					},
				});
			}
			const result = args.write
				? await writeConfig(root, input)
				: root
					? await resolveWikiConfigFile(root, input)
					: runWikiConfig(input);
			return toolResult(
				"wiki_config: resolved CodeWiki configuration.",
				result,
			);
		},
	};
}

function wikiRuntimeTool(): CodewikiToolDefinition {
	return facadeTool<RunWikiRuntimeInput>(
		"wiki_runtime",
		"CodeWiki Runtime",
		"Preview or append CodeWiki runtime dispatch claims using the core facade.",
		"Run the CodeWiki runtime facade for dispatch planning and trace-owned worker claims.",
		async (input, ctx) => {
			const root = await findCodewikiProjectRoot(ctx.cwd);
			const prepared = withRepoRoot(
				input,
				root,
			) as unknown as RunWikiRuntimeInput;
			if (!prepared.config && prepared.repoRoot) {
				prepared.config = await loadWikiConfigFile(prepared.repoRoot);
			}
			return runWikiRuntime(prepared);
		},
	);
}

function facadeTool<T extends object>(
	name: string,
	label: string,
	description: string,
	promptSnippet: string,
	run: (input: T, ctx: CodewikiExtensionContext) => unknown | Promise<unknown>,
): CodewikiToolDefinition {
	return {
		name,
		label,
		description,
		promptSnippet,
		promptGuidelines: [
			`Use ${name} through Pi's registered tool surface instead of invoking the transitional CodeWiki CLI through bash.`,
			`${name} defaults to preview mode unless its input.mode is explicitly set to append with expected byte checks.`,
		],
		executionMode: READ_ONLY_TOOL_NAMES.has(name) ? "parallel" : "sequential",
		renderCall: (args) => renderCodewikiToolCall(name, args),
		renderResult: (result, options) =>
			renderCodewikiToolResult(name, result, options),
		parameters: inputSchema(description),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const args = paramsObject(name, params, ["input"]);
			const input = requiredInput<T>(name, args.input);
			const root = await findCodewikiProjectRoot(ctx.cwd);
			const prepared = withRepoRoot(input, root);
			assertAppendContract(name, prepared);
			if (prepared.mode === "append") {
				assertProjectLocalMutationAllowed({
					toolName: name,
					ctx,
					projectRoot: root,
					moduleUrl: import.meta.url,
					input: prepared,
				});
			}
			const coreInput = stripNonProjectInstallOverride(prepared);
			const result = await run(coreInput as unknown as T, ctx);
			return toolResult(`${name}: completed ${modeText(input)} run.`, result);
		},
	};
}

function inputSchema(description: string): unknown {
	return Type.Object(
		{
			input: Type.Object({}, { additionalProperties: true, description }),
		},
		{ additionalProperties: false },
	);
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

async function writeConfig(
	root: string | undefined,
	input: RunWikiConfigInput,
): Promise<unknown> {
	if (!root) {
		throw new Error(
			"wiki_config write requires an existing CodeWiki project. Run /wiki bootstrap first.",
		);
	}
	return await updateWikiConfigFile(root, input);
}

function withRepoRoot(
	input: object,
	repoRoot: string | undefined,
): Record<string, unknown> {
	const record = input as Record<string, unknown>;
	return repoRoot && !record.repoRoot ? { ...record, repoRoot } : { ...record };
}

function paramsObject(
	toolName: string,
	params: unknown,
	allowedKeys: string[],
): Record<string, unknown> {
	if (params === undefined) return {};
	if (!params || typeof params !== "object" || Array.isArray(params)) {
		throw new Error(`${toolName} parameters must be a JSON object.`);
	}
	const record = params as Record<string, unknown>;
	for (const key of Object.keys(record)) {
		if (!allowedKeys.includes(key)) {
			throw new Error(`${toolName} received unsupported parameter ${key}.`);
		}
	}
	return record;
}

function optionalInput<T extends object>(toolName: string, value: unknown): T {
	if (value === undefined) return {} as T;
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${toolName} input must be a JSON object.`);
	}
	return { ...(value as Record<string, unknown>) } as T;
}

function requiredInput<T extends object>(toolName: string, value: unknown): T {
	if (value === undefined)
		throw new Error(`${toolName} requires input object.`);
	return optionalInput<T>(toolName, value);
}

function assertOptionalString(
	toolName: string,
	input: Record<string, unknown>,
	key: string,
): void {
	if (input[key] !== undefined && typeof input[key] !== "string") {
		throw new Error(`${toolName} ${key} must be a string.`);
	}
}

function assertOptionalStringArray(
	toolName: string,
	input: Record<string, unknown>,
	key: string,
): void {
	const value = input[key];
	if (value === undefined) return;
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new Error(`${toolName} ${key} must be an array of strings.`);
	}
}

function assertOptionalBoolean(
	toolName: string,
	input: Record<string, unknown>,
	key: string,
): void {
	if (input[key] !== undefined && typeof input[key] !== "boolean") {
		throw new Error(`${toolName} ${key} must be a boolean.`);
	}
}

function assertOptionalStateView(
	toolName: string,
	input: Record<string, unknown>,
	key: string,
): void {
	const value = input[key];
	if (value === undefined) return;
	if (typeof value !== "string" || !WIKI_STATE_TOOL_VIEWS.has(value)) {
		throw new Error(
			`${toolName} ${key} must be one of summary, board, quality, blockers, all.`,
		);
	}
}

function assertAppendContract(
	toolName: string,
	input: Record<string, unknown>,
): void {
	const mode = input.mode === undefined ? "preview" : input.mode;
	if (mode !== "preview" && mode !== "append") {
		throw new Error(`${toolName} input.mode must be preview or append.`);
	}
	if (mode !== "append") return;
	if (typeof input.repoRoot !== "string" || !input.repoRoot.trim()) {
		throw new Error(
			`${toolName} append mode requires a discovered CodeWiki project root.`,
		);
	}
	if (toolName === "wiki_runtime") {
		assertIntegerMap(toolName, input, "nextSequenceByTrace", 1);
		assertIntegerMap(toolName, input, "expectedBytesByTrace", 0);
		return;
	}
	assertIntegerField(toolName, input, "expectedBytes", 0);
	if (toolName !== "wiki_archive") {
		assertIntegerField(toolName, input, "nextSequence", 1);
	}
}

function assertIntegerField(
	toolName: string,
	input: Record<string, unknown>,
	key: string,
	minimum: number,
): void {
	const value = input[key];
	if (!Number.isInteger(value) || (value as number) < minimum) {
		throw new Error(`${toolName} append mode requires ${key} >= ${minimum}.`);
	}
}

function assertIntegerMap(
	toolName: string,
	input: Record<string, unknown>,
	key: string,
	minimum: number,
): void {
	const value = input[key];
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${toolName} append mode requires ${key}.`);
	}
	for (const [traceId, entry] of Object.entries(
		value as Record<string, unknown>,
	)) {
		if (!Number.isInteger(entry) || (entry as number) < minimum) {
			throw new Error(
				`${toolName} append mode requires ${key}.${traceId} >= ${minimum}.`,
			);
		}
	}
}

function optionalStateView(value: unknown): WikiStateToolView | undefined {
	return typeof value === "string" && WIKI_STATE_TOOL_VIEWS.has(value)
		? (value as WikiStateToolView)
		: undefined;
}

function stateToolPayload(
	snapshot: WikiStateSnapshot,
	view: WikiStateToolView | undefined,
): unknown {
	if (!view) return snapshot;
	return {
		view,
		data: stateToolViewData(snapshot, view),
		...(snapshot.sourceOwners.length
			? { sourceOwners: snapshot.sourceOwners }
			: {}),
	};
}

function stateToolViewData(
	snapshot: WikiStateSnapshot,
	view: WikiStateToolView,
): unknown {
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

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function modeText(input: object): string {
	const record = input as Record<string, unknown>;
	return typeof record.mode === "string" ? record.mode : "preview";
}

function toolResult(message: string, result: unknown): CodewikiToolResult {
	return {
		content: [{ type: "text", text: message }],
		details: { result },
	};
}
