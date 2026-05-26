/**
 * application/ports.ts
 *
 * Defines the abstract contracts (ports) that the application layer depends on.
 * Each adapter (Pi, MCP, CLI, etc.) provides concrete implementations of these ports.
 * The domain and application layers have zero knowledge of any specific agent.
 */

import type { WikiProject } from "../project/types.ts";

// ---------------------------------------------------------------------------
// File I/O port
// ---------------------------------------------------------------------------

/** How the application reads and writes files. */
export interface FileStore {
	readJson<T>(path: string): Promise<T>;
	maybeReadJson<T>(path: string): Promise<T | null>;
	writeJson(path: string, data: unknown): Promise<void>;
	appendJsonl(path: string, record: unknown): Promise<void>;
}

// ---------------------------------------------------------------------------
// Project resolution port
// ---------------------------------------------------------------------------

/** How the application resolves which project to operate on. */
export interface ProjectResolver {
	/** Resolve a project from the current working directory context. */
	resolveFromCwd(cwd: string): Promise<string | null>;
	/** Resolve from persisted prefs (pinned or last-used repo). */
	resolveFromPrefs(): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// User notification port
// ---------------------------------------------------------------------------

/** How the application surfaces feedback to the user. */
export interface UserNotifier {
	notify(message: string, level: "info" | "warning" | "error"): void;
	setStatus(key: string, value: string | undefined): void;
}

// ---------------------------------------------------------------------------
// Session store port
// ---------------------------------------------------------------------------

/** How the application reads the agent's current session state. */
export interface SessionStore {
	getCurrentSessionId(): string | null;
	/** Returns the raw session branch entries, or null if unavailable. */
	getSessionBranch(): unknown[] | null;
}

// ---------------------------------------------------------------------------
// Rebuild runner port
// ---------------------------------------------------------------------------

/** How the application triggers a re-derivation of wiki views. */
export interface RebuildRunner {
	run(project: WikiProject): Promise<void>;
}

// ---------------------------------------------------------------------------
// Message delivery port (for agent-to-agent messaging)
// ---------------------------------------------------------------------------

export type MessageDeliveryMode = "immediate" | "followUp";

/** How the application sends messages to the agent's conversation. */
export interface MessageBus {
	send(message: string, options?: { deliverAs?: MessageDeliveryMode }): void;
}
