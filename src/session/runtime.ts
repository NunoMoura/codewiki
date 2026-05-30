/**
 * session/runtime.ts
 *
 * Session focus management use cases.
 * Links runtime agent session state to the CodeWiki roadmap without importing Pi types.
 */
import type { WikiProject } from "../project/types.ts";
import type { RoadmapTaskRecord } from "../roadmap/types.ts";
import type { TaskSessionLinkRecord, TaskSessionAction, TaskSessionLinkInput } from "./types.ts";
import { findLatestTaskSessionLink, normalizeTaskSessionLinkInput } from "./links.ts";
import { readRoadmapTask } from "../roadmap/store.ts";
import { unique } from "../shared/utils.ts";
import type { FileStore, SessionStore, UserNotifier } from "../shared/ports.ts";

const TASK_SESSION_LINK_CUSTOM_TYPE = "codewiki.task-link";

export interface SessionRuntime {
	setSessionName(name: string): void;
	appendEntry(type: string, data: unknown): void;
}

export interface SessionPorts {
	fileStore: FileStore;
	runtime: SessionRuntime;
	sessionStore: SessionStore;
	notifier: UserNotifier;
}

export function getFocusedTaskLink(
	ports: SessionPorts,
): TaskSessionLinkRecord | null {
	return findLatestTaskSessionLink(ports.sessionStore.getSessionBranch());
}

async function linkTaskToSession(
	project: WikiProject,
	input: TaskSessionLinkInput,
	ports: SessionPorts,
): Promise<TaskSessionLinkRecord & { title: string; renamed: boolean }> {
	const task = await readRoadmapTask(project, input.taskId);
	if (!task) throw new Error(`Roadmap task not found: ${input.taskId}`);
	const link = normalizeTaskSessionLinkInput(input);
	const renamed = recordTaskSessionLink(task, link, input, ports);
	return {
		...link,
		title: task.title,
		renamed,
	};
}

function recordTaskSessionLink(
	task: RoadmapTaskRecord,
	link: TaskSessionLinkRecord,
	input: TaskSessionLinkInput,
	ports: SessionPorts,
): boolean {
	if (link.action === "clear") {
		ports.notifier.setStatus("codewiki-focus", undefined);
	} else {
		setTaskSessionStatusText(ports, task.id, task.title, link.action);
	}

	const shouldSetSessionName = input.setSessionName ?? link.action === "focus";
	let renamed = false;
	if (shouldSetSessionName) {
		try {
			ports.runtime.setSessionName(`${task.id} ${task.title}`);
			renamed = true;
		} catch {
			// Ignore optional runtime rename failures.
		}
	}

	try {
		ports.runtime.appendEntry(TASK_SESSION_LINK_CUSTOM_TYPE, {
			taskId: task.id,
			action: link.action,
			summary: link.summary,
			filesTouched: link.filesTouched,
			spawnedTaskIds: link.spawnedTaskIds,
			...(link.cursor ? { cursor: link.cursor } : {}),
		});
	} catch {
		// Ignore optional runtime history failures.
	}
	return renamed;
}

function setTaskSessionStatusText(
	ports: SessionPorts,
	taskId: string,
	title: string,
	action: TaskSessionAction,
): void {
	const label = action === "focus" ? "focused" : action;
	ports.notifier.setStatus("codewiki-focus", `${taskId} ${label}: ${title}`);
}

export async function recordSessionTaskAction(
	project: WikiProject,
	opts: {
		taskId?: string;
		action: TaskSessionAction;
		summary?: string;
		filesTouched?: string[];
		cursor?: TaskSessionLinkInput["cursor"];
		setSessionName?: boolean;
	},
	ports: SessionPorts,
): Promise<TaskSessionLinkRecord & { title: string; renamed: boolean }> {
	const active = getFocusedTaskLink(ports);
	const taskId = opts.taskId?.trim() || active?.taskId;
	if (!taskId) {
		throw new Error(
			`codewiki_session ${opts.action} requires taskId or an active focused task.`,
		);
	}
	const summary = opts.summary?.trim() ||
		(opts.action === "focus"
			? `Focused current session on ${taskId}.`
			: `Recorded runtime session note for ${taskId}.`);
	return linkTaskToSession(
		project,
		{
			taskId,
			action: opts.action,
			summary,
			filesTouched: unique(opts.filesTouched ?? []),
			spawnedTaskIds: [],
			cursor: opts.cursor,
			setSessionName: opts.action === "focus" ? (opts.setSessionName ?? false) : false,
		},
		ports,
	);
}

export async function focusOnTask(
	project: WikiProject,
	taskId: string,
	opts: { summary?: string; setSessionName?: boolean },
	ports: SessionPorts,
): Promise<TaskSessionLinkRecord & { title: string; renamed: boolean }> {
	return recordSessionTaskAction(project, {
		taskId,
		action: "focus",
		summary: opts.summary,
		setSessionName: opts.setSessionName,
	}, ports);
}

export async function clearSessionFocus(
	project: WikiProject,
	ports: SessionPorts,
	summary?: string,
): Promise<(TaskSessionLinkRecord & { title: string; renamed: boolean }) | null> {
	const active = getFocusedTaskLink(ports);
	if (!active) return null;
	return linkTaskToSession(
		project,
		{
			taskId: active.taskId,
			action: "clear",
			summary: summary?.trim() || `Cleared current session focus from ${active.taskId}.`,
			setSessionName: false,
		},
		ports,
	);
}
