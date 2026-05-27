/**
 * shared/ports.ts
 *
 * Primitive, harness-independent ports shared by concept use cases.
 * Adapters provide concrete implementations; concept roots depend only on these contracts.
 */

import type { WikiProject } from "../project/types.ts";

/** How CodeWiki reads and writes JSON/JSONL content. */
export interface FileStore {
	readJson<T>(path: string): Promise<T>;
	maybeReadJson<T>(path: string): Promise<T | null>;
	writeJson(path: string, data: unknown): Promise<void>;
	appendJsonl(path: string, record: unknown): Promise<void>;
}

/** How CodeWiki resolves which project to operate on. */
export interface ProjectResolver {
	/** Resolve a project from the current working directory context. */
	resolveFromCwd(cwd: string): Promise<string | null>;
	/** Resolve from persisted prefs (pinned or last-used repo). */
	resolveFromPrefs(): Promise<string | null>;
}

/** How CodeWiki surfaces feedback to a user or host. */
export interface UserNotifier {
	notify(message: string, level: "info" | "warning" | "error"): void;
	setStatus(key: string, value: string | undefined): void;
}

/** How CodeWiki reads the agent's current session state. */
export interface SessionStore {
	getCurrentSessionId(): string | null;
	/** Returns the raw session branch entries, or null if unavailable. */
	getSessionBranch(): unknown[] | null;
}

/** How CodeWiki triggers a re-derivation of generated wiki views. */
export interface RebuildRunner {
	run(project: WikiProject): Promise<void>;
}

export type MessageDeliveryMode = "immediate" | "followUp";

/** How CodeWiki sends messages to an agent conversation. */
export interface MessageBus {
	send(message: string, options?: { deliverAs?: MessageDeliveryMode }): void;
}
