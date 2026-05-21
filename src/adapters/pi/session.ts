import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { readFile, writeFile, appendFile } from "node:fs/promises";
import type { TaskSessionAction, TaskSessionLinkRecord } from "../../domain/session/types.ts";
import type { SessionPorts } from "../../application/session.ts";
import { findLatestTaskSessionLink } from "../../domain/shared/session.ts";

export function currentTaskLink(
	ctx: ExtensionContext | ExtensionCommandContext,
): TaskSessionLinkRecord | null {
	return findLatestTaskSessionLink(ctx.sessionManager?.getBranch?.());
}

export function piSessionStore(ctx: ExtensionContext | ExtensionCommandContext) {
	return {
		getCurrentSessionId: () => ctx.sessionManager?.getSessionId?.() ?? null,
		getSessionBranch: () => ctx.sessionManager?.getBranch?.() ?? null,
	};
}

export function piSessionPorts(
	pi: ExtensionAPI,
	ctx: ExtensionContext | ExtensionCommandContext,
): SessionPorts {
	return {
		fileStore: {
			readJson: async (path: string) => JSON.parse(await readFile(path, "utf8")),
			maybeReadJson: async (path: string) => {
				try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
			},
			writeJson: async (path: string, data: unknown) => writeFile(path, JSON.stringify(data, null, 2), "utf8"),
			appendJsonl: async (path: string, record: unknown) => appendFile(path, JSON.stringify(record) + "\n", "utf8"),
		},
		runtime: {
			setSessionName: (name: string) => pi.setSessionName(name),
			appendEntry: (type: string, data: unknown) => pi.appendEntry(type, data),
		},
		sessionStore: piSessionStore(ctx),
		notifier: {
			notify: (message: string, level: "info" | "warning" | "error") => ctx.ui.setStatus("codewiki-session", `${level}: ${message}`),
			setStatus: (key: string, value: string | undefined) => ctx.ui.setStatus(key, value),
		},
	};
}

export function setTaskSessionStatusText(
	ctx: ExtensionContext | ExtensionCommandContext,
	taskId: string,
	title: string,
	action: TaskSessionAction,
): void {
	const label = action === "focus" ? "focused" : action;
	ctx.ui.setStatus("codewiki-focus", `${taskId} ${label}: ${title}`);
}
