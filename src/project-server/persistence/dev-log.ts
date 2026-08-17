import {
	appendFile,
	chmod,
	mkdir,
	readFile,
	rename,
	rm,
	stat,
} from "node:fs/promises";
import { join } from "node:path";
import { traceTmpPath } from "./tmp.ts";

export const DEV_LOG_CATEGORIES = [
	"session",
	"worker",
	"tool",
	"file",
	"command",
	"check",
	"quality",
	"runtime",
	"retry",
	"error",
	"trace",
	"result",
	"integration",
] as const;
export const DEV_LOG_STATUSES = ["running", "success", "failure", "info"] as const;

export type DevLogCategory = (typeof DEV_LOG_CATEGORIES)[number];
export type DevLogStatus = (typeof DEV_LOG_STATUSES)[number];
export type DevLogTerminalOutcome = "completed" | "blocked" | "failed";

export interface DevLogEntryInput {
	id: string;
	timestamp: string;
	traceId: string;
	workUnitId?: string;
	workerId?: string;
	attemptId?: string;
	category: DevLogCategory;
	action: string;
	status: DevLogStatus;
	durationMs?: number;
	exitCode?: number;
	summary?: string;
	refs?: string[];
	redactions?: string[];
}

export interface DevLogEntry extends DevLogEntryInput {
	schemaVersion: "codewiki.dev-log.v1";
}

const ENTRY_KEYS = new Set([
	"schemaVersion", "id", "timestamp", "traceId", "workUnitId", "workerId", "attemptId",
	"category", "action", "status", "durationMs", "exitCode", "summary",
	"refs", "redactions",
]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ACTION_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;
const MAX_SUMMARY = 512;
const MAX_REFS = 32;
const MAX_REF = 256;
const MAX_ENTRY_BYTES = 8 * 1024;
const MAX_FILE_BYTES = 1024 * 1024;
const LOG_FILE = "events.jsonl";
const ROTATED_FILE = "events.1.jsonl";
const queues = new Map<string, Promise<void>>();

export function createDevLogEntry(value: unknown): DevLogEntry {
	const input = object(value, "Dev Log entry");
	for (const key of Object.keys(input)) {
		if (!ENTRY_KEYS.has(key)) throw new Error(`Dev Log field ${key} is not allowed.`);
	}
	if (
		input.schemaVersion !== undefined &&
		input.schemaVersion !== "codewiki.dev-log.v1"
	) {
		throw new Error("Dev Log schemaVersion is not supported.");
	}
	const entry: DevLogEntry = {
		schemaVersion: "codewiki.dev-log.v1",
		id: identifier(input.id, "id"),
		timestamp: timestamp(input.timestamp),
		traceId: identifier(input.traceId, "traceId"),
		...(optionalIdentifier(input.workUnitId, "workUnitId")),
		...(optionalIdentifier(input.workerId, "workerId")),
		...(optionalIdentifier(input.attemptId, "attemptId")),
		category: enumValue(input.category, DEV_LOG_CATEGORIES, "category"),
		action: action(input.action),
		status: enumValue(input.status, DEV_LOG_STATUSES, "status"),
		...(optionalInteger(input.durationMs, "durationMs", 0, 86_400_000)),
		...(optionalInteger(input.exitCode, "exitCode", -255, 255)),
		...(optionalSummary(input.summary)),
		...(optionalStrings(input.refs, "refs", MAX_REFS, MAX_REF)),
		...(optionalStrings(input.redactions, "redactions", 16, 64)),
	};
	const bytes = Buffer.byteLength(JSON.stringify(entry));
	if (bytes > MAX_ENTRY_BYTES) throw new Error("Dev Log entry exceeds 8192 bytes.");
	return entry;
}

export async function appendDevLogEntry(
	repoRoot: string,
	value: unknown,
): Promise<DevLogEntry> {
	const entry = createDevLogEntry(value);
	const key = `${repoRoot}\0${entry.traceId}`;
	const previous = queues.get(key) ?? Promise.resolve();
	const queued = previous.then(() => appendEntry(repoRoot, entry));
	const tracked = queued.catch(() => undefined);
	queues.set(key, tracked);
	try {
		await queued;
	} finally {
		if (queues.get(key) === tracked) queues.delete(key);
	}
	return entry;
}

export async function readDevLog(
	repoRoot: string,
	traceId: string,
	maxEntries = 1_000,
): Promise<DevLogEntry[]> {
	identifier(traceId, "traceId");
	if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 10_000)
		throw new Error("Dev Log maxEntries must be an integer from 1 to 10000.");
	const directory = devLogDirectory(repoRoot, traceId);
	const entries = [ROTATED_FILE, LOG_FILE].flatMap((file) =>
		readEntries(join(directory, file)),
	);
	return (await Promise.all(entries)).flat().slice(-maxEntries);
}

export async function applyDevLogRetention(
	repoRoot: string,
	traceId: string,
	outcome: DevLogTerminalOutcome,
): Promise<void> {
	identifier(traceId, "traceId");
	if (outcome !== "completed") return;
	await rm(devLogDirectory(repoRoot, traceId), { recursive: true, force: true });
}

export function devLogDirectory(repoRoot: string, traceId: string): string {
	identifier(traceId, "traceId");
	return join(repoRoot, traceTmpPath(traceId, "dev-log"));
}

async function appendEntry(repoRoot: string, entry: DevLogEntry): Promise<void> {
	const directory = devLogDirectory(repoRoot, entry.traceId);
	const path = join(directory, LOG_FILE);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	if (process.platform !== "win32") await chmod(directory, 0o700);
	const line = `${JSON.stringify(entry)}\n`;
	if ((await fileSize(path)) + Buffer.byteLength(line) > MAX_FILE_BYTES) {
		await rm(join(directory, ROTATED_FILE), { force: true });
		await rename(path, join(directory, ROTATED_FILE)).catch((error) => {
			if (!isNotFound(error)) throw error;
		});
	}
	await appendFile(path, line, { encoding: "utf8", mode: 0o600 });
	if (process.platform !== "win32") await chmod(path, 0o600);
}

async function readEntries(path: string): Promise<DevLogEntry[]> {
	try {
		const text = await readFile(path, "utf8");
		return text.split("\n").filter(Boolean).map((line) => createDevLogEntry(JSON.parse(line)));
	} catch (error) {
		if (isNotFound(error)) return [];
		throw error;
	}
}

async function fileSize(path: string): Promise<number> {
	try { return (await stat(path)).size; }
	catch (error) { if (isNotFound(error)) return 0; throw error; }
}

function optionalSummary(value: unknown): { summary?: string } {
	if (value === undefined) return {};
	if (typeof value !== "string" || !value.trim() || value.length > MAX_SUMMARY)
		throw new Error(`Dev Log summary must contain 1 to ${MAX_SUMMARY} characters.`);
	assertNoSensitiveText(value, "summary");
	return { summary: value.trim() };
}

function optionalStrings(
	value: unknown,
	field: "refs" | "redactions",
	maxItems: number,
	maxLength: number,
): { refs?: string[]; redactions?: string[] } {
	if (value === undefined) return {};
	if (!Array.isArray(value) || value.length > maxItems)
		throw new Error(`Dev Log ${field} exceeds ${maxItems} items.`);
	const values = value.map((item) => {
		if (typeof item !== "string" || !item.trim() || item.length > maxLength)
			throw new Error(`Dev Log ${field} item is invalid.`);
		assertNoSensitiveText(item, field);
		return item.trim();
	});
	return { [field]: values };
}

function optionalIdentifier(value: unknown, field: string): Record<string, string> {
	return value === undefined ? {} : { [field]: identifier(value, field) };
}

function optionalInteger(
	value: unknown,
	field: string,
	minimum: number,
	maximum: number,
): Record<string, number> {
	if (value === undefined) return {};
	if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
		throw new Error(`Dev Log ${field} is out of bounds.`);
	return { [field]: value as number };
}

function identifier(value: unknown, field: string): string {
	if (typeof value !== "string" || !ID_PATTERN.test(value))
		throw new Error(`Dev Log ${field} is invalid.`);
	return value;
}

function action(value: unknown): string {
	if (typeof value !== "string" || !ACTION_PATTERN.test(value))
		throw new Error("Dev Log action is invalid.");
	return value;
}

function timestamp(value: unknown): string {
	if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
		throw new Error("Dev Log timestamp must be ISO-compatible.");
	return value;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T {
	if (!values.includes(value as T)) throw new Error(`Dev Log ${field} is not allowed.`);
	return value as T;
}

function assertNoSensitiveText(value: string, field: string): void {
	if (/\b(?:bearer|authorization|api[_-]?key|access[_-]?token|password|secret)\b\s*[:=]?\s*\S+/i.test(value) || /[?&#]token=/i.test(value))
		throw new Error(`Dev Log ${field} contains sensitive text.`);
}

function object(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error(`${label} must be an object.`);
	return value as Record<string, unknown>;
}

function isNotFound(error: unknown): boolean {
	return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
