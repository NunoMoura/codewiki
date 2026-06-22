import type { CodewikiRecoveryAction } from "./codewiki-error.ts";

export type CodewikiHostRole = "main" | "trace" | "worker";

export type CodewikiHostErrorKind =
	| "spawn_failed"
	| "session_lost"
	| "append_conflict"
	| "worktree_failed"
	| "permission_denied"
	| "timeout"
	| "output_missing"
	| "output_malformed"
	| "policy_blocked"
	| "unknown";

export type CodewikiHostRecoveryAction = Extract<
	CodewikiRecoveryAction,
	| "retry"
	| "refresh_trace"
	| "release_claim"
	| "ask_user"
	| "route_to_trace_host"
	| "stop"
>;

export interface CodewikiHostErrorInput {
	role: CodewikiHostRole;
	kind: CodewikiHostErrorKind;
	message: string;
	traceId?: string;
	workUnitId?: string;
	workerId?: string;
	claimId?: string;
	recoverable?: boolean;
	retryable?: boolean;
	suggestedAction?: CodewikiHostRecoveryAction;
	refs?: string[];
	data?: Record<string, unknown>;
}

export interface CodewikiHostError {
	role: CodewikiHostRole;
	kind: CodewikiHostErrorKind;
	message: string;
	recoverable: boolean;
	retryable: boolean;
	suggestedAction: CodewikiHostRecoveryAction;
	refs: string[];
	traceId?: string;
	workUnitId?: string;
	workerId?: string;
	claimId?: string;
	data?: Record<string, unknown>;
}

export function createCodewikiHostError(
	input: CodewikiHostErrorInput,
): CodewikiHostError {
	return {
		role: input.role,
		kind: input.kind,
		message: input.message,
		recoverable: input.recoverable ?? defaultRecoverable(input.kind),
		retryable: input.retryable ?? defaultRetryable(input.kind),
		suggestedAction:
			input.suggestedAction ?? defaultSuggestedAction(input.kind),
		refs: unique([
			input.traceId,
			input.workUnitId,
			input.workerId,
			input.claimId,
			...(input.refs || []),
		]),
		...(input.traceId ? { traceId: input.traceId } : {}),
		...(input.workUnitId ? { workUnitId: input.workUnitId } : {}),
		...(input.workerId ? { workerId: input.workerId } : {}),
		...(input.claimId ? { claimId: input.claimId } : {}),
		...(input.data ? { data: input.data } : {}),
	};
}

export function hostErrorData(
	error: CodewikiHostError | undefined,
): Record<string, unknown> | undefined {
	if (!error) return undefined;
	return {
		role: error.role,
		kind: error.kind,
		message: error.message,
		recoverable: error.recoverable,
		retryable: error.retryable,
		suggestedAction: error.suggestedAction,
		refs: [...error.refs],
		...(error.traceId ? { traceId: error.traceId } : {}),
		...(error.workUnitId ? { workUnitId: error.workUnitId } : {}),
		...(error.workerId ? { workerId: error.workerId } : {}),
		...(error.claimId ? { claimId: error.claimId } : {}),
		...(error.data ? { data: error.data } : {}),
	};
}

export function isCodewikiHostError(
	value: unknown,
): value is CodewikiHostError {
	return (
		typeof value === "object" &&
		value !== null &&
		"role" in value &&
		"kind" in value &&
		"message" in value &&
		"suggestedAction" in value
	);
}

function defaultRecoverable(kind: CodewikiHostErrorKind): boolean {
	return kind !== "permission_denied";
}

function defaultRetryable(kind: CodewikiHostErrorKind): boolean {
	return !["permission_denied", "policy_blocked", "append_conflict"].includes(
		kind,
	);
}

function defaultSuggestedAction(
	kind: CodewikiHostErrorKind,
): CodewikiHostRecoveryAction {
	if (kind === "append_conflict") return "refresh_trace";
	if (kind === "permission_denied" || kind === "policy_blocked") {
		return "ask_user";
	}
	if (kind === "session_lost") return "retry";
	if (
		kind === "output_missing" ||
		kind === "output_malformed" ||
		kind === "spawn_failed" ||
		kind === "worktree_failed" ||
		kind === "timeout"
	) {
		return "release_claim";
	}
	return "retry";
}

function unique(values: Array<string | undefined>): string[] {
	return Array.from(
		new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
	);
}
