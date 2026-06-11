import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildCodewikiResumeContext } from "../../state/resume-context.ts";
import { maybeLoadProject } from "../../project/context.ts";
import type { WikiProject } from "../../project/types.ts";
import { formatError, nowIso, unique } from "../../shared/utils.ts";
import { currentTaskLink } from "./session.ts";
import { CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE } from "../../state/resume-kickoff.ts";
import type { CodewikiResumeContextPacket } from "../../state/resume-context.ts";

const CODEWIKI_CONTEXT_PROJECTION_CUSTOM_TYPE = "codewiki.context-projection";
const CODEWIKI_CONTEXT_PROJECTION_HEADER =
	"## CodeWiki Source-Backed Context Projection";
const CONTEXT_CACHE_TTL_MS = 5000;

type AgentMessageLike = Record<string, any>;

export interface CodewikiContextProjectionResult {
	messages: AgentMessageLike[];
	injected: boolean;
	pruned: boolean;
	checkpoint_index: number | null;
	dropped_messages: number;
}

interface ProjectionCacheEntry {
	key: string;
	expiresAt: number;
	message: AgentMessageLike | null;
}

export function installCodewikiContextProjection(pi: ExtensionAPI): void {
	let cache: ProjectionCacheEntry | null = null;
	let lastWarningKey: string | null = null;

	// biome-ignore lint/suspicious/noExplicitAny: pi.on("context") overload is missing in current Pi type surface.
	(pi as any).on("context", async (event: any, ctx: any) => {
		const originalMessages = Array.isArray(event?.messages)
			? event.messages
			: null;
		if (!originalMessages) return undefined;
		try {
			const project = await maybeLoadProject({
				cwd: ctx?.cwd,
				workspaceRoot: ctx?.workspaceRoot,
				ui: ctx?.ui,
			});
			if (!project) return undefined;
			const projectionMessage = await cachedProjectionMessage(
				project,
				ctx,
				cache,
			);
			cache = projectionMessage.cache;
			if (!projectionMessage.message) return undefined;
			return projectCodewikiContextMessages(
				originalMessages,
				projectionMessage.message,
			);
		} catch (error) {
			const key = formatError(error);
			if (ctx?.hasUI && key !== lastWarningKey) {
				lastWarningKey = key;
				ctx.ui.notify(`CodeWiki context projection skipped: ${key}`, "warning");
			}
			return undefined;
		}
	});
}

async function cachedProjectionMessage(
	project: WikiProject,
	ctx: any,
	cache: ProjectionCacheEntry | null,
): Promise<{
	cache: ProjectionCacheEntry | null;
	message: AgentMessageLike | null;
}> {
	const activeLink = currentTaskLink(ctx);
	const sessionId = String(
		ctx?.sessionManager?.getSessionId?.() || "context-projection",
	);
	const key = [project.root, sessionId, activeLink?.taskId || ""].join("::");
	const time = Date.now();
	if (cache && cache.key === key && cache.expiresAt > time) {
		return { cache, message: cache.message };
	}
	let resume:
		| CodewikiResumeContextPacket
		| Awaited<ReturnType<typeof buildCodewikiResumeContext>>;
	try {
		resume = await buildCodewikiResumeContext(project, {
			requestedTaskId: activeLink?.taskId || undefined,
			activeLink,
			sessionId,
			refresh: false,
		});
	} catch (error) {
		const message = formatError(error);
		if (!isStaleSessionTaskError(message, activeLink?.taskId || null))
			throw error;
		resume = await buildCodewikiResumeContext(project, {
			requestedTaskId: undefined,
			activeLink: null,
			sessionId,
			refresh: false,
		});
	}
	const message = resume.task ? sourceBackedProjectionMessage(resume) : null;
	const nextCache = {
		key,
		expiresAt: time + CONTEXT_CACHE_TTL_MS,
		message,
	};
	return { cache: nextCache, message };
}

function isStaleSessionTaskError(
	message: string,
	taskId: string | null,
): boolean {
	if (!taskId) return false;
	return (
		message.includes(`Roadmap task not found: ${taskId}`) ||
		message.includes(`Roadmap task already closed: ${taskId}`)
	);
}

export function sourceBackedProjectionMessage(
	resume: CodewikiResumeContextPacket,
): AgentMessageLike {
	return {
		role: "custom",
		customType: CODEWIKI_CONTEXT_PROJECTION_CUSTOM_TYPE,
		content: renderSourceBackedProjection(resume),
		display: false,
		details: {
			source: "codewiki",
			projection: "checkpoint-aware-context",
			taskId: resume.task.id,
			contextPath: resume.context_path,
			graphLens: resume.graph_lens,
			sourceRefs: resume.source_refs,
			constraints: resume.constraints,
			contentEvidenceRequirements: resume.content_evidence_requirements,
		},
		timestamp: Date.now(),
	};
}

export function projectCodewikiContextMessages(
	messages: AgentMessageLike[],
	projectionMessage: AgentMessageLike,
): CodewikiContextProjectionResult {
	const checkpointIndex = findLastStableCheckpointIndex(messages);
	const startIndex =
		checkpointIndex === null
			? 0
			: repairStartForToolResultPairs(messages, checkpointIndex + 1);
	const retained = messages
		.slice(startIndex)
		.filter((message) => !isCodewikiProjectionOrKickoff(message));
	const projected = [projectionMessage, ...retained];
	return {
		messages: projected,
		injected: true,
		pruned: startIndex > 0,
		checkpoint_index: checkpointIndex,
		dropped_messages: Math.max(0, messages.length - retained.length),
	};
}

export function findLastStableCheckpointIndex(
	messages: AgentMessageLike[],
): number | null {
	const latestUserIndex = latestUserLikeMessageIndex(messages);
	if (latestUserIndex <= 0) return null;
	for (let index = latestUserIndex - 1; index >= 0; index -= 1) {
		if (isDurableCheckpointMessage(messages[index])) return index;
	}
	return null;
}

function latestUserLikeMessageIndex(messages: AgentMessageLike[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message?.role === "user" || message?.role === "custom") return index;
	}
	return -1;
}

function repairStartForToolResultPairs(
	messages: AgentMessageLike[],
	startIndex: number,
): number {
	const first = messages[startIndex];
	if (first?.role !== "toolResult") return startIndex;
	for (let index = startIndex - 1; index >= 0; index -= 1) {
		if (messageHasToolCall(messages[index])) return index;
	}
	return startIndex;
}

function isDurableCheckpointMessage(
	message: AgentMessageLike | undefined,
): boolean {
	if (!message) return false;
	if (isCodewikiProjectionMessage(message)) return false;
	if (isCodewikiDurableResumeBoundary(message)) return true;
	const text = messageText(message);
	return DURABLE_CHECKPOINT_PATTERNS.some((pattern) => pattern.test(text));
}

const DURABLE_CHECKPOINT_PATTERNS = [
	/\.codewiki\/builds\/(decision|planning|implementation)\//i,
	/\.codewiki\/validation\//i,
	/wiki_implement:\s+codewiki\s+(build|roadmap)/i,
	/wiki_(gate|gateway):\s+codewiki\s+gateway/i,
	/wiki_(plan|roadmap):\s+codewiki\s+roadmap:\s+(close|cancel|update)/i,
	/CodeWiki-Build:/i,
	/CodeWiki-Task:/i,
];

function isCodewikiProjectionMessage(message: AgentMessageLike): boolean {
	return (
		message?.customType === CODEWIKI_CONTEXT_PROJECTION_CUSTOM_TYPE ||
		messageText(message).includes(CODEWIKI_CONTEXT_PROJECTION_HEADER)
	);
}

function isCodewikiDurableResumeBoundary(message: AgentMessageLike): boolean {
	if (message?.customType === CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE) {
		return true;
	}
	const text = messageText(message);
	return (
		text.includes("## CodeWiki Auto-Pickup Kickoff") ||
		text.includes("## CodeWiki Context Refresh")
	);
}

function isCodewikiProjectionOrKickoff(message: AgentMessageLike): boolean {
	if (isCodewikiProjectionMessage(message)) return true;
	return isCodewikiDurableResumeBoundary(message);
}

function messageHasToolCall(message: AgentMessageLike | undefined): boolean {
	if (!message || message.role !== "assistant") return false;
	return messageContentItems(message).some((item) => item?.type === "toolCall");
}

function messageText(message: AgentMessageLike): string {
	if (typeof message?.content === "string") return message.content;
	const contentItems = messageContentItems(message);
	if (contentItems.length > 0) {
		return contentItems
			.map((item) => (item?.type === "text" ? String(item.text || "") : ""))
			.filter(Boolean)
			.join("\n");
	}
	return [message?.summary, message?.output, message?.command]
		.map((value) => String(value || ""))
		.filter(Boolean)
		.join("\n");
}

function messageContentItems(message: AgentMessageLike): any[] {
	return Array.isArray(message?.content) ? message.content : [];
}

function contextStringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => String(item).trim()).filter(Boolean)
		: [];
}

function renderSourceBackedProjection(
	resume: CodewikiResumeContextPacket,
): string {
	const artifactStatus = resume.artifact_status
		.map((record) => {
			const artifact = record.artifact;
			const target =
				artifact.task_id ||
				artifact.path ||
				artifact.ref ||
				artifact.description ||
				"artifact";
			return `${record.status}: ${target}`;
		})
		.slice(0, 12);
	const refs = unique(resume.source_refs).slice(0, 16);
	const runtimeConstraints = contextStringList(
		(resume.constraints as Record<string, unknown>)?.runtime_constraints,
	).slice(0, 5);
	return [
		CODEWIKI_CONTEXT_PROJECTION_HEADER,
		`Generated: ${nowIso()}`,
		`Task: ${resume.task.id} — ${resume.task.title}`,
		`Context packet: ${resume.context_path || "—"}`,
		`Graph lens: ${resume.graph_lens}`,
		`Expected output: ${resume.expected_output}`,
		`Source refs: ${refs.join(", ") || "—"}`,
		resume.blockers.length
			? `Blockers: ${resume.blockers.join("; ")}`
			: "Blockers: —",
		artifactStatus.length
			? `Artifact status: ${artifactStatus.join("; ")}`
			: "Artifact status: —",
		resume.content_evidence_requirements.length
			? `Content evidence requirements: ${resume.content_evidence_requirements.join("; ")}`
			: "Content evidence requirements: —",
		runtimeConstraints.length
			? `Active runtime constraints: ${runtimeConstraints.join("; ")}`
			: "Active runtime constraints: —",
		"",
		"Context policy:",
		"- Treat CodeWiki graph, roadmap, builds, gates, source, tests, and Git refs as truth.",
		"- Use raw session messages only for uncheckpointed working-set details below this projection.",
		"- Ignore older CodeWiki kickoff or context-refresh messages if they appear elsewhere in session history.",
		"- Do not depend on full chat history, full graph dumps, or unrelated roadmap work.",
		"",
		"Source-backed packet:",
		resume.prompt.trim(),
	]
		.filter((line) => line !== undefined)
		.join("\n");
}
