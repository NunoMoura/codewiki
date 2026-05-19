import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { CodewikiSessionHandoffToolInput, WikiProject } from "../../domain/shared/types.ts";
import { splitCommandArgs, unique } from "../../domain/shared/utils.ts";

export const HANDOFF_COMMAND = "wiki-session-handoff";
export const HANDOFF_KIND = "codewiki_session_handoff";
export type HandoffMode = "new-session" | "context-reset" | "external-orchestrator";
export type HandoffStatus = "queued" | "started" | "completed" | "cancelled" | "external" | "failed";

export interface CodewikiSessionHandoffPayload {
	version: 1;
	kind: typeof HANDOFF_KIND;
	id: string;
	created: string;
	repo_path: string;
	mode: HandoffMode;
	task_id?: string;
	build_ref?: string;
	profile?: string;
	reason: string;
	input_refs: string[];
	expected_output?: string;
	context_boundary: string;
	kickoff_prompt: string;
	status: HandoffStatus;
}

export interface StagedSessionHandoff {
	payload: CodewikiSessionHandoffPayload;
	absolutePath: string;
	relativePath: string;
	command: string;
}

export interface ToolSessionHandoffResult {
	action: "staged" | "external";
	command?: string;
	reason?: string;
}

export interface CompactContext {
	compact(input: { customInstructions: string }): void;
}

function slug(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "handoff";
}

function normalizeMode(mode: string | undefined): HandoffMode {
	if (mode === "context-reset" || mode === "external-orchestrator") return mode;
	return "new-session";
}

export function buildSessionHandoffPrompt(payload: Omit<CodewikiSessionHandoffPayload, "kickoff_prompt" | "status">): string {
	const refs = payload.input_refs.length ? payload.input_refs.map((ref) => `- ${ref}`).join("\n") : "- codewiki_state";
	const taskLine = payload.task_id ? `Task: ${payload.task_id}\n` : "";
	const buildLine = payload.build_ref ? `Build: ${payload.build_ref}\n` : "";
	const profileLine = payload.profile ? `Profile: ${payload.profile}\n` : "";
	const expected = payload.expected_output || "Continue the next CodeWiki loop from artifacts.";
	return [
		"CodeWiki fresh-session handoff.",
		"Do not rely on previous chat context. Start from repository truth and the refs below.",
		"",
		`Repo: ${payload.repo_path}`,
		taskLine.trimEnd(),
		buildLine.trimEnd(),
		profileLine.trimEnd(),
		`Reason: ${payload.reason}`,
		`Context boundary: ${payload.context_boundary}`,
		`Expected output: ${expected}`,
		"",
		"Start:",
		`1. Run codewiki_state for repo ${payload.repo_path}${payload.task_id ? ` and ${payload.task_id}` : ""}.`,
		"2. Read only the handoff refs needed for the active loop.",
		"3. Use artifact statuses, builds, validation, and task evidence normally.",
		"",
		"Handoff refs:",
		refs,
	].filter((line) => line !== undefined).join("\n");
}

export function buildSessionHandoffPayload(
	project: WikiProject,
	input: CodewikiSessionHandoffToolInput,
): CodewikiSessionHandoffPayload {
	const createdAt = new Date();
	const created = createdAt.toISOString().replace(/\.\d{3}Z$/, "Z");
	const mode = normalizeMode(input.mode);
	const reason = input.reason.trim();
	const taskId = input.taskId?.trim() || undefined;
	const buildRef = input.buildRef?.trim() || undefined;
	const profile = input.profile?.trim() || undefined;
	const inputRefs = unique([
		...(input.handoff_refs ?? []),
		...(buildRef ? [buildRef] : []),
		...(taskId ? [taskId] : []),
	].map((ref) => ref.trim()).filter(Boolean));
	const id = `HANDOFF-${createdAt.toISOString().replace(/[-:.TZ]/g, "").slice(0, 17)}-${slug(taskId || profile || reason)}`;
	const base = {
		version: 1 as const,
		kind: HANDOFF_KIND as typeof HANDOFF_KIND,
		id,
		created,
		repo_path: project.root,
		mode,
		...(taskId ? { task_id: taskId } : {}),
		...(buildRef ? { build_ref: buildRef } : {}),
		...(profile ? { profile } : {}),
		reason,
		input_refs: inputRefs,
		...(input.expected_output?.trim() ? { expected_output: input.expected_output.trim() } : {}),
		context_boundary: mode === "new-session" ? "fresh-process-or-session" : mode,
	};
	return {
		...base,
		kickoff_prompt: input.kickoff_prompt?.trim() || buildSessionHandoffPrompt(base),
		status: "queued",
	};
}

export function handoffCommand(relativePath: string): string {
	return `/${HANDOFF_COMMAND} ${relativePath}`;
}

export async function stageSessionHandoff(
	project: WikiProject,
	input: CodewikiSessionHandoffToolInput,
): Promise<StagedSessionHandoff> {
	const payload = buildSessionHandoffPayload(project, input);
	const dir = resolve(project.root, ".codewiki/runtime/session-handoffs");
	const absolutePath = join(dir, `${payload.id}.json`);
	await mkdir(dirname(absolutePath), { recursive: true });
	await writeFile(absolutePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
	const relativePath = relative(project.root, absolutePath);
	return { payload, absolutePath, relativePath, command: handoffCommand(relativePath) };
}

export async function readHandoffFile(absolutePath: string): Promise<{ payload: CodewikiSessionHandoffPayload; path: string }> {
	const payload = JSON.parse(await readFile(absolutePath, "utf8")) as CodewikiSessionHandoffPayload;
	if (payload.kind !== HANDOFF_KIND) throw new Error(`Invalid CodeWiki session handoff: ${basename(absolutePath)}`);
	return { payload, path: absolutePath };
}

export async function readLatestQueuedHandoff(cwd: string): Promise<{ payload: CodewikiSessionHandoffPayload; path: string } | undefined> {
	const dir = resolve(cwd, ".codewiki/runtime/session-handoffs");
	let names: string[];
	try {
		names = await readdir(dir);
	} catch {
		return undefined;
	}
	const handoffs: { payload: CodewikiSessionHandoffPayload; path: string }[] = [];
	for (const name of names) {
		if (!name.endsWith(".json") || name.endsWith(".spawn.json")) continue;
		try {
			const handoff = await readHandoffFile(join(dir, name));
			if (handoff.payload.status === "queued") handoffs.push(handoff);
		} catch {
			// Ignore unrelated or malformed runtime files while finding latest queued handoff.
		}
	}
	return handoffs.sort((a, b) =>
		b.payload.created.localeCompare(a.payload.created) || b.payload.id.localeCompare(a.payload.id),
	)[0];
}

export async function readStagedHandoff(cwd: string, arg: string): Promise<{ payload: CodewikiSessionHandoffPayload; path: string }> {
	const raw = splitCommandArgs(arg)[0];
	if (raw) return readHandoffFile(isAbsolute(raw) ? raw : resolve(cwd, raw));
	const latest = await readLatestQueuedHandoff(cwd);
	if (latest) return latest;
	throw new Error(`/${HANDOFF_COMMAND} requires a staged handoff path or a queued handoff in .codewiki/runtime/session-handoffs.`);
}

export async function markHandoff(path: string, payload: CodewikiSessionHandoffPayload, status: HandoffStatus): Promise<void> {
	await writeFile(path, JSON.stringify({ ...payload, status }, null, 2) + "\n", "utf8");
}

export async function executeSessionHandoffFromTool(
	staged: StagedSessionHandoff,
	_ctx: CompactContext,
): Promise<ToolSessionHandoffResult> {
	if (staged.payload.mode === "external-orchestrator") {
		await markHandoff(staged.absolutePath, staged.payload, "external");
		return { action: "external" };
	}
	if (staged.payload.mode === "context-reset") {
		return {
			action: "staged",
			command: staged.command,
			reason: "context-reset handoffs must run from command context after the tool result is visible; the Pi adapter queues the internal /wiki-session-handoff command as a follow-up.",
		};
	}
	return {
		action: "staged",
		command: staged.command,
		reason: "new-session handoffs require command-context ctx.newSession; the Pi adapter queues the internal /wiki-session-handoff command as a follow-up.",
	};
}

export async function executeCodewikiSessionHandoffTool(
	project: WikiProject,
	input: CodewikiSessionHandoffToolInput,
	ctx: CompactContext,
) {
	const staged = await stageSessionHandoff(project, input);
	const result = (input.autoQueue ?? true)
		? await executeSessionHandoffFromTool(staged, ctx)
		: { action: "staged" as const, command: staged.command };
	return {
		staged,
		result,
		summary: result.action === "staged"
			? `codewiki session_handoff: staged ${staged.relativePath}; internal command prepared`
			: `codewiki session_handoff: ${result.action} ${staged.relativePath}`,
	};
}
