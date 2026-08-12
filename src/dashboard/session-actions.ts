import { createHash } from "node:crypto";
import { DashboardControlError } from "./control-error.ts";

export type DashboardSessionAction = "resume" | "change" | "resolve_blocker";

export interface DashboardSessionActionState {
	generatedAt: string;
	available: boolean;
	unavailableReason?: string;
	actions: DashboardSessionAction[];
	stateDigest: string;
}

export interface DashboardSessionActionReceipt {
	receiptId: string;
	commandId: string;
	traceId: string;
	action: DashboardSessionAction;
	deliveredAs: "immediate" | "steer";
	recordedAt: string;
}

export interface DashboardSessionActionResult {
	state: DashboardSessionActionState;
	receipt: DashboardSessionActionReceipt;
	replayed: boolean;
}

export interface DashboardSessionActionControl {
	status(): DashboardSessionActionState;
	execute(command: unknown): Promise<DashboardSessionActionResult>;
}

interface DashboardSessionActionBridge {
	isAvailable(): boolean;
	isIdle(): boolean;
	sendUserMessage(message: string, options?: { deliverAs: "steer" }): void;
}

interface DashboardSessionActionCommand {
	commandId: string;
	traceId: string;
	action: DashboardSessionAction;
	expectedStateDigest: string;
}

interface IdempotencyEntry {
	inputDigest: string;
	result: DashboardSessionActionResult;
}

const ACTIONS: DashboardSessionAction[] = [
	"resume",
	"change",
	"resolve_blocker",
];
const MAX_IDEMPOTENCY_ENTRIES = 100;

export function createDashboardSessionActionControl(options: {
	bridge?: DashboardSessionActionBridge;
	now?: () => Date;
	unavailableReason?: string;
}): DashboardSessionActionControl {
	const now = options.now || (() => new Date());
	const entries = new Map<string, IdempotencyEntry>();
	return {
		status: () =>
			dashboardSessionActionState(
				Boolean(options.bridge?.isAvailable()),
				options.unavailableReason,
				now(),
			),
		execute: async (value) => {
			const command = parseDashboardSessionActionCommand(value);
			const inputDigest = digest(command);
			const prior = entries.get(command.commandId);
			if (prior) {
				if (prior.inputDigest !== inputDigest) {
					throw conflict(
						"Command id was already used for different session action input.",
					);
				}
				return { ...prior.result, replayed: true };
			}
			const before = dashboardSessionActionState(
				Boolean(options.bridge?.isAvailable()),
				options.unavailableReason,
				now(),
			);
			if (command.expectedStateDigest !== before.stateDigest) {
				throw conflict(
					"Dashboard session action state changed. Refresh and retry.",
				);
			}
			if (!before.available || !options.bridge) {
				throw unavailable(
					before.unavailableReason ||
						"No active in-process Pi session bridge is attached.",
				);
			}
			const deliveredAs = options.bridge.isIdle() ? "immediate" : "steer";
			options.bridge.sendUserMessage(
				sessionActionMessage(command.action, command.traceId),
				deliveredAs === "steer" ? { deliverAs: "steer" } : undefined,
			);
			const recordedAt = now().toISOString();
			const receipt: DashboardSessionActionReceipt = {
				receiptId: `sha256:${digest({ ...command, deliveredAs, recordedAt })}`,
				commandId: command.commandId,
				traceId: command.traceId,
				action: command.action,
				deliveredAs,
				recordedAt,
			};
			const result: DashboardSessionActionResult = {
				state: dashboardSessionActionState(
					Boolean(options.bridge.isAvailable()),
					options.unavailableReason,
					now(),
				),
				receipt,
				replayed: false,
			};
			entries.set(command.commandId, { inputDigest, result });
			while (entries.size > MAX_IDEMPOTENCY_ENTRIES) {
				const oldest = entries.keys().next().value;
				if (typeof oldest !== "string") break;
				entries.delete(oldest);
			}
			return result;
		},
	};
}

function dashboardSessionActionState(
	available: boolean,
	unavailableReason: string | undefined,
	now = new Date(),
): DashboardSessionActionState {
	const actions = [...ACTIONS];
	const reason = available
		? undefined
		: unavailableReason ||
			"Open the dashboard from an active Pi TUI session to use Sprint actions.";
	return {
		generatedAt: now.toISOString(),
		available,
		...(reason ? { unavailableReason: reason } : {}),
		actions,
		stateDigest: `sha256:${digest({ available, reason, actions })}`,
	};
}

export function parseDashboardSessionActionCommand(
	value: unknown,
): DashboardSessionActionCommand {
	if (!isRecord(value))
		throw badRequest("Session action command must be an object.");
	assertKnownKeys(value, [
		"commandId",
		"traceId",
		"action",
		"expectedStateDigest",
	]);
	const commandId = identifier(value.commandId, "commandId", 160);
	const traceId = identifier(value.traceId, "traceId", 160);
	if (!/^TRACE-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(traceId)) {
		throw badRequest("traceId must be a canonical TRACE-* id.");
	}
	if (!ACTIONS.includes(value.action as DashboardSessionAction)) {
		throw badRequest("action must be resume, change, or resolve_blocker.");
	}
	const expectedStateDigest = String(value.expectedStateDigest || "");
	if (!/^sha256:[a-f0-9]{64}$/.test(expectedStateDigest)) {
		throw badRequest("expectedStateDigest must be a sha256 digest.");
	}
	return {
		commandId,
		traceId,
		action: value.action as DashboardSessionAction,
		expectedStateDigest,
	};
}

function sessionActionMessage(
	action: DashboardSessionAction,
	traceId: string,
): string {
	if (action === "resume") {
		return `Resume CodeWiki Sprint ${traceId}. Read current trace-backed state, explain the next guarded action, and continue only within existing authority.`;
	}
	if (action === "change") {
		return `Change CodeWiki Sprint ${traceId}. Ask me for the amendment intent, then create or reinforce only a linked mutable Change. Do not create an amendment Sprint until exact validation and explicit Decision approval.`;
	}
	return `Resolve the blocker for CodeWiki Sprint ${traceId}. Read the grounded blocker and current trace state, ask for any missing user input, and keep remediation inside this Sprint unless an independently validated amendment is approved.`;
}

function identifier(value: unknown, label: string, maximum: number): string {
	if (typeof value !== "string" || !value.trim() || value.length > maximum) {
		throw badRequest(
			`${label} must be a non-empty string up to ${maximum} characters.`,
		);
	}
	return value.trim();
}

function assertKnownKeys(
	value: Record<string, unknown>,
	allowed: readonly string[],
): void {
	for (const key of Object.keys(value)) {
		if (!allowed.includes(key)) {
			throw badRequest(`Unsupported session action field ${key}.`);
		}
	}
}

function digest(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function badRequest(message: string): DashboardControlError {
	return new DashboardControlError(message, 400);
}

function conflict(message: string): DashboardControlError {
	return new DashboardControlError(message, 409);
}

function unavailable(message: string): DashboardControlError {
	return new DashboardControlError(message, 409);
}
