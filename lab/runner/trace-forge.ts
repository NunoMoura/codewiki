#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { readTraceFile } from "../../src/traces/reader.ts";
import type { TraceEvent, TraceRecord } from "../../src/traces/types.ts";
import type { LabLoop, LabVerdict } from "./types.ts";

export type TraceForgeLabelStatus = "needs_human_label";

export interface TraceForgeSanitizationStats {
	redactedFields: number;
	redactedAbsolutePaths: number;
	truncatedStrings: number;
}

export interface TraceCaseDraft {
	id: string;
	loop: LabLoop;
	description: string;
	suggestedExpected: LabVerdict;
	labelStatus: TraceForgeLabelStatus;
	labelReason: string;
	source: {
		traceId: string;
		eventId: string;
		sequence: number;
		event: string;
		refs: string[];
	};
	input: unknown;
	downstreamSignals: string[];
	sanitization: TraceForgeSanitizationStats;
}

export interface TraceForgeReport {
	version: 1;
	sourceTraces: string[];
	draftCount: number;
	drafts: TraceCaseDraft[];
	warnings: string[];
}

export interface TraceForgeOptions {
	maxStringLength?: number;
}

const DEFAULT_MAX_STRING_LENGTH = 240;
const SENSITIVE_KEY_PATTERN =
	/(?:api[_-]?key|token|secret|password|session(?:id|file)?|workerid|claimid)/i;
const ABSOLUTE_PATH_PATTERN =
	/(^|[\s"'`])\/(?:home|Users|tmp|var|private|workspace|mnt)\/[^\s"'`]+/g;

export function forgeTraceCases(
	records: TraceRecord[],
	options: TraceForgeOptions = {},
): TraceForgeReport {
	const sourceTraces = unique(
		records.flatMap((record) => ("traceId" in record ? [record.traceId] : [])),
	);
	const semanticEvents = records.filter(isSemanticTraceEvent);
	const drafts = semanticEvents.map((event) =>
		forgeTraceEventDraft(event, options),
	);
	return {
		version: 1,
		sourceTraces,
		draftCount: drafts.length,
		drafts,
		warnings:
			drafts.length === 0
				? [
						"No semantic loop events were found. Trace-derived cases require decision, planning, or implementation trace events.",
					]
				: [
						"Draft labels are suggestions only. Human review must sanitize, reduce, and label downstream outcomes before cases join visible or sealed evals.",
					],
	};
}

export async function forgeTraceFiles(
	tracePaths: string[],
	options: TraceForgeOptions = {},
): Promise<TraceForgeReport> {
	const records = (
		await Promise.all(tracePaths.map((path) => readTraceFile(path)))
	).flat();
	return forgeTraceCases(records, options);
}

function forgeTraceEventDraft(
	event: TraceEvent & { loop: LabLoop },
	options: TraceForgeOptions,
): TraceCaseDraft {
	const stats: TraceForgeSanitizationStats = {
		redactedFields: 0,
		redactedAbsolutePaths: 0,
		truncatedStrings: 0,
	};
	const input = sanitizeValue(reducedLoopInput(event), stats, options);
	const suggestedExpected = suggestedLabel(event);
	return {
		id: draftId(event),
		loop: event.loop,
		description: `${event.loop} trace event ${event.event} from ${event.traceId} sequence ${event.sequence}`,
		suggestedExpected,
		labelStatus: "needs_human_label",
		labelReason: labelReason(event, suggestedExpected),
		source: {
			traceId: event.traceId,
			eventId: event.id,
			sequence: event.sequence,
			event: event.event,
			refs: sanitizeStringList(event.refs, stats, options),
		},
		input,
		downstreamSignals: downstreamSignals(event),
		sanitization: stats,
	};
}

function reducedLoopInput(event: TraceEvent & { loop: LabLoop }): unknown {
	const data = objectRecord(event.data);
	const output = objectRecord(data.output);
	if (event.loop === "decision") {
		return {
			prompt: text(output.summary) || text(data.trigger),
			changeRecord: objectRecord(output.changeRecord),
			decision: objectRecord(output.decision),
		};
	}
	if (event.loop === "planning") {
		return {
			decisions: stringList(output.changeRefs).map((id) => ({ id })),
			plan: {
				changeRefs: stringList(output.changeRefs),
				workItems: arrayValue(output.workItems),
				resolutions: arrayValue(output.resolutions),
			},
		};
	}
	return {
		plan: { planningRefs: stringList(output.planningRefs) },
		implementation: {
			planningRefs: stringList(output.planningRefs),
			changes: arrayValue(output.changes),
		},
	};
}

function suggestedLabel(event: TraceEvent): LabVerdict {
	const status = text(objectRecord(objectRecord(event.data).exit).status);
	if (status === "exit") return "pass";
	if (status === "blocked") return "block";
	return "fail";
}

function labelReason(event: TraceEvent, suggested: LabVerdict): string {
	const status = text(objectRecord(objectRecord(event.data).exit).status);
	return [
		`exit.status=${status || "unknown"}`,
		`event=${event.event}`,
		`suggested=${suggested}`,
		"review downstream outcome before accepting this label",
	].join("; ");
}

function downstreamSignals(event: TraceEvent): string[] {
	const data = objectRecord(event.data);
	const output = objectRecord(data.output);
	const exit = objectRecord(data.exit);
	const conditions = arrayValue(exit.conditions)
		.map(objectRecord)
		.filter((condition) => text(condition.status) !== "met")
		.map((condition) => `${text(condition.id)}:${text(condition.status)}`)
		.filter(Boolean);
	return [
		`exit.status=${text(exit.status) || "unknown"}`,
		`targetLoop=${text(exit.targetLoop) || "none"}`,
		...stringList(output.issueCodes).map((code) => `issue=${code}`),
		...conditions.map((condition) => `condition=${condition}`),
	];
}

function sanitizeValue(
	value: unknown,
	stats: TraceForgeSanitizationStats,
	options: TraceForgeOptions,
	key = "",
): unknown {
	if (SENSITIVE_KEY_PATTERN.test(key)) {
		stats.redactedFields += 1;
		return "<redacted>";
	}
	if (typeof value === "string") return sanitizeString(value, stats, options);
	if (Array.isArray(value)) {
		return value.map((item) => sanitizeValue(item, stats, options));
	}
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(
				([entryKey, entry]) => [
					entryKey,
					sanitizeValue(entry, stats, options, entryKey),
				],
			),
		);
	}
	return value;
}

function sanitizeStringList(
	values: string[],
	stats: TraceForgeSanitizationStats,
	options: TraceForgeOptions,
): string[] {
	return values.map((value) => sanitizeString(value, stats, options));
}

function sanitizeString(
	value: string,
	stats: TraceForgeSanitizationStats,
	options: TraceForgeOptions,
): string {
	let sanitized = value.replace(
		ABSOLUTE_PATH_PATTERN,
		(_match, prefix: string) => {
			stats.redactedAbsolutePaths += 1;
			return `${prefix}<abs-path>`;
		},
	);
	const maxLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;
	if (sanitized.length > maxLength) {
		stats.truncatedStrings += 1;
		sanitized = `${sanitized.slice(0, maxLength)}…`;
	}
	return sanitized;
}

function isSemanticTraceEvent(
	record: TraceRecord,
): record is TraceEvent & { loop: LabLoop } {
	return (
		record.type === "trace_event" &&
		(record.loop === "decision" ||
			record.loop === "planning" ||
			record.loop === "implementation")
	);
}

function draftId(event: TraceEvent): string {
	return ["draft", event.traceId, event.sequence, event.loop]
		.filter(Boolean)
		.join("-")
		.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function arrayValue(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function unique(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))];
}

function defaultTracePaths(repoRoot: string): string[] {
	const traceDir = join(repoRoot, ".codewiki", "traces");
	if (!existsSync(traceDir)) return [];
	return readdirSync(traceDir)
		.filter((entry) => /^TRACE-.*\.jsonl$/.test(entry))
		.sort()
		.map((entry) => join(traceDir, entry));
}

function parseArgs(argv: string[]): {
	repoRoot: string;
	tracePaths: string[];
	json: boolean;
} {
	let repoRoot = process.cwd();
	const tracePaths: string[] = [];
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--repo-root") repoRoot = resolve(argv[++index] || repoRoot);
		else if (arg === "--trace") tracePaths.push(resolve(argv[++index] || ""));
	}
	return {
		repoRoot,
		tracePaths:
			tracePaths.length > 0 ? tracePaths : defaultTracePaths(repoRoot),
		json: argv.includes("--json"),
	};
}

function printTraceForgeReport(report: TraceForgeReport): void {
	console.log(
		`Trace forge: ${report.draftCount} draft case(s) from ${report.sourceTraces.length} trace(s)`,
	);
	for (const draft of report.drafts) {
		console.log(
			`- ${draft.id}: ${draft.loop} suggested=${draft.suggestedExpected} (${draft.labelStatus})`,
		);
	}
	for (const warning of report.warnings) console.log(`Warning: ${warning}`);
}

async function main(argv = process.argv.slice(2)) {
	const args = parseArgs(argv);
	if (args.tracePaths.length === 0) {
		throw new Error("No .codewiki/traces/TRACE-*.jsonl files found to forge.");
	}
	const report = await forgeTraceFiles(args.tracePaths);
	if (args.json) console.log(JSON.stringify(report, null, 2));
	else printTraceForgeReport(report);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
