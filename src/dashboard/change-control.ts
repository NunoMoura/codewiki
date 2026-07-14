import { createHash } from "node:crypto";
import {
	runWikiChange,
	type RunWikiChangeInput,
	type RunWikiChangeResult,
} from "../api/wiki-change.ts";
import { CodewikiApiError } from "../error-handling/api-errors.ts";
import {
	loadDashboardChangesState,
	type DashboardChangesState,
} from "./changes-state.ts";
import { DashboardTraceHostControlError } from "./trace-host-control.ts";

export type DashboardChangeAction = "draft" | "revise" | "validate" | "withdraw";

interface DashboardChangeCommand {
	action: DashboardChangeAction;
	commandId: string;
	expectedStateDigest: string;
	expectedHead: string | null;
	changeId?: string;
	expectedRecordRevision?: number;
	change?: unknown;
	reason?: string;
}

export interface DashboardChangeReceipt {
	receiptId: string;
	commandId: string;
	action: DashboardChangeAction;
	changeId: string;
	recordedAt: string;
	stateDigestBefore: string;
	stateDigestAfter: string;
	headBefore: string | null;
	headAfter: string | null;
	validationReady?: boolean;
}

export interface DashboardChangeCommandResult {
	replayed: boolean;
	receipt: DashboardChangeReceipt;
	state: DashboardChangesState;
}

export interface DashboardChangeControl {
	status(): Promise<DashboardChangesState>;
	execute(value: unknown): Promise<DashboardChangeCommandResult>;
}

interface DashboardChangeControlOptions {
	repoRoot: string;
	actor: string;
	now?: () => Date;
}

interface IdempotencyEntry {
	payloadDigest: string;
	result: DashboardChangeCommandResult;
}

interface PendingIdempotencyEntry {
	payloadDigest: string;
	result: Promise<DashboardChangeCommandResult>;
}

export function createDashboardChangeControl(
	options: DashboardChangeControlOptions,
): DashboardChangeControl {
	const completed = new Map<string, IdempotencyEntry>();
	const pending = new Map<string, PendingIdempotencyEntry>();
	const now = options.now || (() => new Date());
	return {
		status: () => loadDashboardChangesState(options.repoRoot),
		async execute(value) {
			const command = parseDashboardChangeCommand(value);
			const payloadDigest = digest(command);
			const existing = completed.get(command.commandId);
			if (existing) {
				if (existing.payloadDigest !== payloadDigest) {
					throw conflict("Command id was already used for different input.");
				}
				return { ...existing.result, replayed: true };
			}
			const inFlight = pending.get(command.commandId);
			if (inFlight) {
				if (inFlight.payloadDigest !== payloadDigest) {
					throw conflict("Command id is running with different input.");
				}
				return { ...(await inFlight.result), replayed: true };
			}
			const execution = executeCommand(options, command, now);
			pending.set(command.commandId, { payloadDigest, result: execution });
			try {
				const result = await execution;
				completed.set(command.commandId, { payloadDigest, result });
				trimEntries(completed, 64);
				return result;
			} finally {
				pending.delete(command.commandId);
			}
		},
	};
}

async function executeCommand(
	options: DashboardChangeControlOptions,
	command: DashboardChangeCommand,
	now: () => Date,
): Promise<DashboardChangeCommandResult> {
	const before = await loadDashboardChangesState(options.repoRoot);
	if (before.stateDigest !== command.expectedStateDigest) {
		throw conflict("Changes Backlog state changed; refresh before retrying.");
	}
	if (before.head !== command.expectedHead) {
		throw conflict("Changes Backlog head changed; refresh before retrying.");
	}
	assertRecordIdentity(before, command);
	let mutation: RunWikiChangeResult;
	try {
		mutation = await runWikiChange(commandInput(options, command, now));
	} catch (error) {
		throw dashboardChangeError(error);
	}
	const after = await loadDashboardChangesState(options.repoRoot);
	const changeId = mutation.record?.change.id || command.changeId;
	if (!changeId) throw conflict("Dashboard Change command produced no Change id.");
	return {
		replayed: false,
		receipt: {
			receiptId: `change-command:${command.commandId}`,
			commandId: command.commandId,
			action: command.action,
			changeId,
			recordedAt: now().toISOString(),
			stateDigestBefore: before.stateDigest,
			stateDigestAfter: after.stateDigest,
			headBefore: before.head,
			headAfter: after.head,
			...(mutation.validation
				? { validationReady: mutation.validation.ready }
				: {}),
		},
		state: after,
	};
}

function commandInput(
	options: DashboardChangeControlOptions,
	command: DashboardChangeCommand,
	now: () => Date,
): RunWikiChangeInput {
	const common = {
		repoRoot: options.repoRoot,
		expectedHead: command.expectedHead,
		actor: options.actor,
		createdAt: now().toISOString(),
	};
	if (command.action === "draft") {
		return { ...common, operation: "create", change: command.change };
	}
	if (command.action === "revise") {
		return {
			...common,
			operation: "revise",
			changeId: command.changeId,
			expectedRecordRevision: command.expectedRecordRevision,
			change: command.change,
		};
	}
	if (command.action === "validate") {
		return {
			repoRoot: options.repoRoot,
			operation: "validate",
			changeId: command.changeId,
		};
	}
	return {
		...common,
		operation: "withdraw",
		changeId: command.changeId,
		expectedRecordRevision: command.expectedRecordRevision,
		reason: command.reason,
	};
}

function assertRecordIdentity(
	state: DashboardChangesState,
	command: DashboardChangeCommand,
): void {
	if (command.action === "draft") return;
	const record = state.records.find(
		(candidate) => candidate.identity.changeId === command.changeId,
	);
	if (!record) throw conflict(`Change ${command.changeId} was not found.`);
	if (record.identity.recordRevision !== command.expectedRecordRevision) {
		throw conflict("Change record revision changed; refresh before retrying.");
	}
}

export function parseDashboardChangeCommand(
	value: unknown,
): DashboardChangeCommand {
	if (!isRecord(value)) throw badRequest("Dashboard Change command must be an object.");
	const allowed = new Set([
		"action",
		"commandId",
		"expectedStateDigest",
		"expectedHead",
		"changeId",
		"expectedRecordRevision",
		"change",
		"reason",
	]);
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) throw badRequest(`Unsupported command field ${key}.`);
	}
	if (
		value.action !== "draft" &&
		value.action !== "revise" &&
		value.action !== "validate" &&
		value.action !== "withdraw"
	) {
		throw badRequest(
			"Dashboard Change action must be draft, revise, validate, or withdraw.",
		);
	}
	if (!Object.hasOwn(value, "expectedHead")) {
		throw badRequest("expectedHead is required.");
	}
	const action = value.action;
	const command: DashboardChangeCommand = {
		action,
		commandId: identifier(value.commandId, "commandId", 128),
		expectedStateDigest: sha256Digest(value.expectedStateDigest),
		expectedHead: expectedHead(value.expectedHead),
		...(value.changeId === undefined
			? {}
			: { changeId: identifier(value.changeId, "changeId", 160) }),
		...(value.expectedRecordRevision === undefined
			? {}
			: {
					expectedRecordRevision: positiveInteger(
						value.expectedRecordRevision,
						"expectedRecordRevision",
					),
				}),
		...(value.change === undefined ? {} : { change: boundedChange(value.change) }),
		...(value.reason === undefined
			? {}
			: { reason: boundedText(value.reason, "reason", 1_000) }),
	};
	assertActionFields(command);
	return command;
}

function assertActionFields(command: DashboardChangeCommand): void {
	if (command.action === "draft") return assertDraftFields(command);
	assertExistingRecordFields(command);
	if (command.action === "revise") return assertReviseFields(command);
	if (command.change !== undefined) {
		throw badRequest(`${command.action} does not accept change.`);
	}
	if (command.action === "validate" && command.reason) {
		throw badRequest("Validate does not accept reason.");
	}
	if (command.action === "withdraw" && !command.reason) {
		throw badRequest("Withdraw requires reason.");
	}
}

function assertDraftFields(command: DashboardChangeCommand): void {
	if (command.change === undefined) throw badRequest("Draft requires change.");
	if (command.changeId || command.expectedRecordRevision || command.reason) {
		throw badRequest("Draft does not accept record identity or reason fields.");
	}
}

function assertExistingRecordFields(command: DashboardChangeCommand): void {
	if (!command.changeId || !command.expectedRecordRevision) {
		throw badRequest(`${command.action} requires changeId and expectedRecordRevision.`);
	}
}

function assertReviseFields(command: DashboardChangeCommand): void {
	if (command.change === undefined) throw badRequest("Revise requires change.");
	if (command.reason) throw badRequest("Revise does not accept reason.");
}

function boundedChange(value: unknown): unknown {
	if (!isRecord(value)) throw badRequest("change must be an object.");
	if (Buffer.byteLength(JSON.stringify(value), "utf8") > 12_000) {
		throw badRequest("change exceeds 12000 bytes.");
	}
	return value;
}

function expectedHead(value: unknown): string | null {
	if (value === null) return null;
	if (typeof value !== "string" || !/^[a-f0-9]{40,64}$/.test(value)) {
		throw badRequest("expectedHead must be null or a Git object id.");
	}
	return value;
}

function identifier(value: unknown, label: string, max: number): string {
	const text = boundedText(value, label, max);
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text)) {
		throw badRequest(`${label} contains unsupported characters.`);
	}
	return text;
}

function sha256Digest(value: unknown): string {
	const text = boundedText(value, "expectedStateDigest", 71);
	if (!/^sha256:[a-f0-9]{64}$/.test(text)) {
		throw badRequest("expectedStateDigest must be a sha256 digest.");
	}
	return text;
}

function positiveInteger(value: unknown, label: string): number {
	if (!Number.isInteger(value) || Number(value) < 1) {
		throw badRequest(`${label} must be a positive integer.`);
	}
	return Number(value);
}

function boundedText(value: unknown, label: string, max: number): string {
	if (typeof value !== "string" || value.length < 1 || value.length > max) {
		throw badRequest(`${label} must be a non-empty string of at most ${max} characters.`);
	}
	return value;
}

function digest(value: unknown): string {
	return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.filter(([, entry]) => entry !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function trimEntries(entries: Map<string, IdempotencyEntry>, max: number): void {
	while (entries.size > max) {
		const first = entries.keys().next().value;
		if (typeof first !== "string") return;
		entries.delete(first);
	}
}

function dashboardChangeError(error: unknown): DashboardTraceHostControlError {
	if (error instanceof DashboardTraceHostControlError) return error;
	if (error instanceof CodewikiApiError) {
		if (error.code === "forbidden") return new DashboardTraceHostControlError(error.message, 403);
		if (error.code === "conflict" || error.code === "not_found") {
			return conflict(error.message);
		}
		return badRequest(error.message);
	}
	return new DashboardTraceHostControlError(
		error instanceof Error ? error.message : String(error),
		400,
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function badRequest(message: string): DashboardTraceHostControlError {
	return new DashboardTraceHostControlError(message, 400);
}

function conflict(message: string): DashboardTraceHostControlError {
	return new DashboardTraceHostControlError(message, 409);
}
