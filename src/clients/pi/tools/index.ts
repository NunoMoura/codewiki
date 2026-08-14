import { Type } from "typebox";
import {
	buildProjectWikiState,
	runWikiArchive,
	runWikiConfig,
	runWikiChange,
	wikiChangeOperationMutates,
	type RunWikiArchiveInput,
	type RunWikiConfigInput,
	type RunWikiChangeInput,
	type RunWikiChangeResult,
	type WikiStateSnapshot,
} from "../../../runtime/index.ts";
import type { RuntimeReaction } from "../../../runtime/coordinator/reactor.ts";
import { buildChangeValidationCard } from "../../../changes/validation-view.ts";
import {
	resolveWikiConfigFile,
	updateWikiConfigFile,
	type WikiConfigFileResult,
} from "../../../project/config-file.ts";
import { findCodewikiProjectRoot } from "../../../project/root.ts";
import { previewProfileDigest } from "../../../preview/profile.ts";
import {
	assertProjectLocalMutationAllowed,
	projectLocalInstallWarning,
	stripNonProjectInstallOverride,
} from "../install-scope.ts";
import type { PiProjectServiceClientProvider } from "../project-service-client.ts";
import { renderPiChangeValidationCard } from "../rendering/change-validation-card.ts";
import type {
	CodewikiExtensionApi,
	CodewikiExtensionContext,
	CodewikiToolDefinition,
	CodewikiToolResult,
} from "../types.ts";

const WIKI_STATE_TOOL_NAME = "wiki_state";
const WIKI_ATTENTION_TOOL_NAME = "wiki_attention";

export const CODEWIKI_TOOL_NAMES = [
	WIKI_STATE_TOOL_NAME,
	WIKI_ATTENTION_TOOL_NAME,
	"wiki_config",
	"wiki_change",
	"wiki_archive",
] as const;

type WikiStateToolView = "summary" | "board" | "quality" | "blockers" | "all";

const READ_ONLY_TOOL_NAMES = new Set<string>([
	WIKI_STATE_TOOL_NAME,
	WIKI_ATTENTION_TOOL_NAME,
]);
const WIKI_STATE_TOOL_VIEWS = new Set<string>([
	"summary",
	"board",
	"quality",
	"blockers",
	"all",
]);

export function registerCodewikiTools(
	pi: CodewikiExtensionApi,
	projectServices: PiProjectServiceClientProvider,
): void {
	const runSequential = createSequentialRunner();
	for (const tool of codewikiTools(projectServices)) {
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

function codewikiTools(
	projectServices: PiProjectServiceClientProvider,
): CodewikiToolDefinition[] {
	return [
		wikiStateTool(projectServices),
		wikiAttentionTool(projectServices),
		wikiConfigTool(),
		wikiChangeTool(),
		facadeTool<RunWikiArchiveInput>(
			"wiki_archive",
			"CodeWiki Archive",
			"Preview or append CodeWiki archive lifecycle actions using the core facade.",
			"Run the CodeWiki archive facade for trace close, retention stubs, and hydration planning.",
			runWikiArchive,
		),
	];
}

function wikiStateTool(
	projectServices: PiProjectServiceClientProvider,
): CodewikiToolDefinition {
	return {
		name: WIKI_STATE_TOOL_NAME,
		label: "CodeWiki State",
		description:
			"Internal agent read of bounded WorkState-backed Change, Sprint, Work Item, Assignment, blocker, and quality projections for the current project.",
		promptSnippet:
			"Read internal CodeWiki WorkState views for the current repository.",
		promptGuidelines: [
			"Use internal wiki_state before Decision, Planning, Implementation, archive, or coordination-sensitive work to inspect current Change-trace-backed state.",
			"wiki_state does not write files and is not a user command; users see the automatically opened Work Pipeline dashboard instead.",
		],
		executionMode: "parallel",
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
			},
			{ additionalProperties: false },
		),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const root = await requireCodewikiRoot(ctx);
			const warning = notifyInstallWarning(ctx, root);
			const input = paramsObject(WIKI_STATE_TOOL_NAME, params, [
				"view",
				"traceId",
				"generatedAt",
			]);
			assertOptionalStateView(WIKI_STATE_TOOL_NAME, input, "view");
			assertOptionalString(WIKI_STATE_TOOL_NAME, input, "traceId");
			assertOptionalString(WIKI_STATE_TOOL_NAME, input, "generatedAt");
			const traceId = optionalString(input.traceId);
			const generatedAt = optionalString(input.generatedAt);
			const runtimeReaction = await projectServices.inspect(root, ctx, {
				kind: "manual_resume",
				...(traceId ? { refs: [`trace:${traceId}`] } : {}),
			});
			const snapshot = await buildProjectWikiState({
				repoRoot: root,
				traceId,
				generatedAt,
			});
			const view = optionalStateView(input.view);
			const activeWorkItems = snapshot.workQueue.items.filter(
				(item) => item.status !== "done",
			).length;
			const reviewBlockers = snapshot.reviewEvidence?.blockers.length || 0;
			return toolResult(
				`wiki_state: ${view || "all"} view, ${snapshot.traceIds.length} trace(s), ${activeWorkItems} active work item(s), ${reviewBlockers} review blocker(s).`,
				stateToolPayload(snapshot, view, runtimeReaction),
				warning,
				stateToolModelPayload(snapshot, view, runtimeReaction),
			);
		},
	};
}

function wikiAttentionTool(
	projectServices: PiProjectServiceClientProvider,
): CodewikiToolDefinition {
	return {
		name: WIKI_ATTENTION_TOOL_NAME,
		label: "CodeWiki Decision Attention",
		description:
			"Read the bounded, exact-revision Backlog Triage Projection currently available for user-selected Decision attention. This tool cannot select or approve work.",
		promptSnippet:
			"Read current Decision-attention recommendations; ask the user to run /wiki-select for any exact selection.",
		promptGuidelines: [
			"Use wiki_attention to inspect current eligible Change revisions and projection identity.",
			"Never treat recommendation as approval or Planning priority. Only an explicit /wiki-select user command can start Decision work.",
		],
		executionMode: "parallel",
		parameters: Type.Object({}, {additionalProperties: false}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			paramsObject(WIKI_ATTENTION_TOOL_NAME, params, []);
			const root = await requireCodewikiRoot(ctx);
			const warning = notifyInstallWarning(ctx, root);
			const result = await projectServices.decisionAttention({
				repoRoot: root,
				context: ctx,
			});
			return toolResult(
				`wiki_attention: ${result.coverage.returnedCandidateCount} of ${result.coverage.matchedCandidateCount} matched exact Change revision(s).`,
				result,
				warning,
				decisionAttentionModelPayload(result),
			);
		},
	};
}

function decisionAttentionModelPayload(
	result: Awaited<ReturnType<PiProjectServiceClientProvider["decisionAttention"]>>,
): unknown {
	return {
		protocol: result.protocol,
		projectionDigest: result.projectionDigest,
		coverage: result.coverage,
		items: result.items.map((item) => ({
			rank: item.rank,
			changeId: item.candidate.changeId,
			changeRevisionId: item.candidate.changeRevisionId,
			title: item.candidate.title,
			status: item.candidate.status,
			readiness: item.candidate.readiness,
			orderingReasons: item.orderingReasons,
		})),
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
			"Use wiki_config to inspect CodeWiki automation, runtime, retention, preview-profile digests, and host policy before acting.",
			"wiki_config writes only when its write parameter is true; otherwise it is read-only.",
		],
		executionMode: "sequential",
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
			const warning = !args.write ? notifyInstallWarning(ctx, root) : undefined;
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
				{
					...result,
					previewProfiles: result.config.preview.profiles.map((profile) => ({
						...profile,
						digest: previewProfileDigest(profile),
					})),
				},
				warning,
			);
		},
	};
}

function wikiChangeTool(): CodewikiToolDefinition {
	return {
		name: "wiki_change",
		label: "CodeWiki Change",
		description:
			"Persist, query, or refine Change revisions in canonical JSONL Change Traces; the Changes Backlog is a generated view.",
		promptSnippet:
			"Capture and refine intent in the owning Change Trace without widening the active Work Item.",
		promptGuidelines: [
			"Search before creating a Change and reinforce an existing match instead of duplicating it.",
			"Change intake uses the dedicated Runtime-owned source-specific admission contract, not wiki_change.",
			"wiki_change cannot approve Changes, create Planning-owned Sprints or Work Items, launch workers, edit source, publish, or advance controllers.",
			"Mutations require exact Change Trace store-head and record-revision guards; list, get, and validate are read-only.",
		],
		executionMode: "sequential",
		parameters: Type.Object(
			{
				allowNonProjectInstall: Type.Optional(
					Type.Boolean({
						description:
							"Controlled-test override for mutation when CodeWiki is not loaded from this project's .pi install.",
					}),
				),
				input: Type.Object(
					{},
					{
						additionalProperties: true,
						description: "Structured RunWikiChangeInput operation.",
					},
				),
			},
			{ additionalProperties: false },
		),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const args = paramsObject("wiki_change", params, [
				"allowNonProjectInstall",
				"input",
			]);
			assertOptionalBoolean("wiki_change", args, "allowNonProjectInstall");
			const input = requiredInput<RunWikiChangeInput>("wiki_change", args.input);
			const root = await requireCodewikiRoot(ctx);
			const operation = String(input.operation || "");
			const mutates = wikiChangeOperationMutates(operation);
			if (mutates) {
				assertProjectLocalMutationAllowed({
					toolName: "wiki_change",
					ctx,
					projectRoot: root,
					moduleUrl: import.meta.url,
					input: {
						allowNonProjectInstall: args.allowNonProjectInstall,
					},
				});
			}
			const prepared = withRepoRoot(
				input,
				root,
			) as unknown as RunWikiChangeInput;
			const result = await runWikiChange(prepared);
			return toolResult(
				`wiki_change: completed ${result.operation} operation.`,
				result,
				mutates ? undefined : notifyInstallWarning(ctx, root),
				wikiChangeModelPayload(result),
			);
		},
	};
}

function wikiChangeModelPayload(result: RunWikiChangeResult): unknown {
	if (!result.record) {
		return {
			operation: result.operation,
			head: result.head,
			changed: result.changed,
			recordsCount: result.records?.length,
			validation: result.validation,
		};
	}
	const changeCard = buildChangeValidationCard(result.record);
	return {
		operation: result.operation,
		head: result.head,
		changed: result.changed,
		lines: renderPiChangeValidationCard(changeCard),
	};
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
		parameters: inputSchema(description),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const args = paramsObject(name, params, ["input"]);
			const input = requiredInput<T>(name, args.input);
			const root = await findCodewikiProjectRoot(ctx.cwd);
			const prepared = withRepoRoot(input, root);
			assertAppendContract(name, prepared);
			const warning =
				prepared.mode === "append"
					? undefined
					: notifyInstallWarning(ctx, root);
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
			return toolResult(
				`${name}: completed ${modeText(input)} run.`,
				result,
				warning,
			);
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
			"No CodeWiki project found. Run /wiki-bootstrap from the project root.",
		);
	}
	return root;
}

async function writeConfig(
	root: string | undefined,
	input: RunWikiConfigInput,
): Promise<WikiConfigFileResult> {
	if (!root) {
		throw new Error(
			"wiki_config write requires an existing CodeWiki project. Run /wiki-bootstrap first.",
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
	assertIntegerField(toolName, input, "expectedBytes", 0);
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

function optionalStateView(value: unknown): WikiStateToolView | undefined {
	return typeof value === "string" && WIKI_STATE_TOOL_VIEWS.has(value)
		? (value as WikiStateToolView)
		: undefined;
}

function stateToolModelPayload(
	snapshot: WikiStateSnapshot,
	view: WikiStateToolView | undefined,
	runtimeReaction: RuntimeReaction,
): unknown {
	const traceId = snapshot.selectedTraceId;
	if (traceId) {
		const trace = snapshot.traceBoard.traces.find(
			(candidate) => candidate.traceId === traceId,
		);
		return {
			view: view || "all",
			runtimeReaction,
			traceId,
			change: snapshot.workState.changes.find(
				(candidate) => candidate.traceId === traceId,
			),
			trace,
			append: snapshot.append?.byTrace[traceId],
			status: snapshot.status
				? {
						currentLoop: snapshot.status.currentLoop,
						readyForClosure: snapshot.status.readyForClosure,
						blockers: snapshot.status.blockers,
						qualityBlockers: snapshot.status.qualityBlockers,
					}
				: undefined,
			next: snapshot.next,
		};
	}
	return {
		view: view || "all",
		runtimeReaction,
		changeCount: snapshot.workState.changeIds.length,
		sprintCount: snapshot.workState.sprintIds.length,
		traceCount: snapshot.traceIds.length,
		traceSummary: snapshot.traceBoard.summary,
		workQueueSummary: snapshot.workQueue.summary,
		reviewBlockerCount: snapshot.reviewEvidence?.blockers.length || 0,
		next: snapshot.next,
	};
}

function stateToolPayload(
	snapshot: WikiStateSnapshot,
	view: WikiStateToolView | undefined,
	runtimeReaction: RuntimeReaction,
): unknown {
	if (!view) return { ...snapshot, runtimeReaction };
	return {
		view,
		runtimeReaction,
		data: stateToolViewData(snapshot, view),
	};
}

function stateToolViewData(
	snapshot: WikiStateSnapshot,
	view: WikiStateToolView,
): unknown {
	if (view === "summary") {
		return {
			workState: {
				snapshotDigest: snapshot.workState.snapshotDigest,
				changeIds: snapshot.workState.changeIds,
				sprintIds: snapshot.workState.sprintIds,
				workItemIds: snapshot.workState.workItemIds,
				assignmentIds: snapshot.workState.assignmentIds,
			},
			traceIds: snapshot.traceIds,
			status: snapshot.status,
			resume: snapshot.resume,
			workQueueSummary: snapshot.workQueue.summary,
			reviewEvidence: snapshot.reviewEvidence,
			next: snapshot.next,
			append: snapshot.append,
		};
	}
	if (view === "board") {
		return {
			changes: snapshot.workState.changes,
			sprints: snapshot.workState.sprints,
			workItems: snapshot.workState.workItems,
			assignments: snapshot.workState.assignments,
			workPlan: snapshot.workPlan,
			workQueue: snapshot.workQueue,
			runtimeBoard: snapshot.runtimeBoard,
			next: snapshot.next,
			append: snapshot.append,
		};
	}
	if (view === "quality") return snapshot.quality;
	if (view === "blockers") return snapshot.blockers;
	return snapshot;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function modeText(input: object): string {
	const record = input as Record<string, unknown>;
	return typeof record.mode === "string" ? record.mode : "preview";
}

function notifyInstallWarning(
	ctx: CodewikiExtensionContext,
	projectRoot: string | undefined,
): string | undefined {
	const warning = projectLocalInstallWarning(import.meta.url, projectRoot);
	if (warning) ctx.ui?.notify(warning, "warning");
	return warning;
}

function toolResult(
	message: string,
	result: unknown,
	warning?: string,
	modelPayload?: unknown,
): CodewikiToolResult {
	const payloadText =
		modelPayload === undefined ? undefined : JSON.stringify(modelPayload);
	let modelText = message;
	if (payloadText !== undefined) {
		modelText =
			payloadText.length <= 32_000
				? `${message}\n${payloadText}`
				: `${message}\n${JSON.stringify({ truncated: true })}`;
	}
	return {
		content: [{ type: "text", text: modelText }],
		details: { result, ...(warning ? { warnings: [warning] } : {}) },
	};
}
