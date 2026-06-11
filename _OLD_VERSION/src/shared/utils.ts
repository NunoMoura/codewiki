/**
 * shared/utils.ts
 *
 * Pure utility functions with zero external dependencies.
 * No node:fs, no Pi types, no TUI — runtime code belongs in concept-local implementations or adapters/.
 */

/**
 * Format an error message consistently, including stdout/stderr for exec errors.
 */
export function formatError(error: unknown): string {
	if (!error) return "Unknown error";
	if (error instanceof Error) {
		const withOutput = error as Error & { stderr?: string; stdout?: string };
		const parts = [error.message];
		const stderr = withOutput.stderr?.trim();
		const stdout = withOutput.stdout?.trim();
		if (stderr) parts.push(stderr);
		if (stdout) parts.push(stdout);
		return parts.join("\n");
	}
	return String(error);
}

/**
 * Filter unique non-empty strings.
 */
export function unique(items: string[]): string[] {
	return [...new Set(items.filter(Boolean))];
}

/**
 * Get current timestamp in ISO format.
 */
export function nowIso(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Cycle an index within a given length, wrapping at boundaries.
 */
export function cycleIndex(length: number, current: number, delta: number): number {
	if (length === 0) return 0;
	return (((current + delta) % length) + length) % length;
}

/**
 * Split command arguments correctly, respecting double-quoted strings.
 */
export function splitCommandArgs(args: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let inQuote = false;
	for (let i = 0; i < args.length; i++) {
		const char = args[i];
		if (char === '"') {
			inQuote = !inQuote;
		} else if (char === " " && !inQuote) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
		} else {
			current += char;
		}
	}
	if (current.length > 0) tokens.push(current);
	return tokens;
}

/**
 * Join command argument tokens back into a string, quoting tokens with spaces.
 */
export function joinCommandArgs(tokens: string[]): string | null {
	if (tokens.length === 0) return null;
	return tokens.map((t) => (t.includes(" ") ? `"${t}"` : t)).join(" ");
}

/**
 * Normalize command arguments for code tasks.
 */
export function normalizeCodeArgs(args: string): {
	requestedTaskId?: string;
	pathArg?: string;
	cleanArgs: string;
} {
	const parts = args.trim().split(/\s+/);
	let requestedTaskId: string | undefined;
	let pathArg: string | undefined;
	const cleanParts: string[] = [];
	for (const part of parts) {
		if (/^(T|TASK-)\d+$/i.test(part)) {
			requestedTaskId = part.toUpperCase();
		} else if (part.includes("/") || part.includes(".") || part === "cwd") {
			pathArg = part;
		} else {
			cleanParts.push(part);
		}
	}
	return {
		requestedTaskId,
		pathArg,
		cleanArgs: cleanParts.join(" "),
	};
}
