import {
	acceptanceEvidenceRefs,
	changedPaths,
	checkResultRefs,
	contentProofRefs,
	implementationEvidenceRefs,
	normalizeImplementationChanges,
} from "../../loops/implementation/evidence.ts";
import type {
	CheckResult,
	ImplementationChange,
	ImplementationChangeInput,
} from "../../loops/implementation/types.ts";
import { replayTrace } from "./replay.ts";
import type { TraceRecord } from "./types.ts";

type RawImplementationChangeInput = ImplementationChangeInput &
	Record<string, unknown>;

export interface TraceCloseReleaseNotes {
	traceId: string;
	title: string;
	closed: boolean;
	closedAt?: string;
	closeReason?: string;
	gitRestoreRef?: string;
	headRef?: string;
	changes: TraceReleaseNoteChange[];
	checks: TraceReleaseNoteCheck[];
	changedPaths: string[];
	evidenceRefs: string[];
	refs: string[];
}

export interface TraceReleaseNoteChange {
	id: string;
	summary: string;
	planningRefs: string[];
	workUnitId?: string;
	workerId?: string;
	codePaths: string[];
	docPaths: string[];
	testPaths: string[];
	evidenceRefs: string[];
	contentProofRefs: string[];
	publicationRefs: string[];
}

export interface TraceReleaseNoteCheck {
	command: string;
	status: string;
	outputRef?: string;
	summary?: string;
}

export function buildTraceCloseReleaseNotes(
	records: TraceRecord[],
): TraceCloseReleaseNotes {
	const state = replayTrace(records);
	const changes = implementationChangesFromRecords(records);
	const releaseChanges = changes.map(traceReleaseNoteChange);
	const close = state.close;
	return {
		traceId: state.head.traceId,
		title: state.head.title,
		closed: state.closed,
		...(close
			? {
					closedAt: close.createdAt,
					closeReason: close.reason,
					gitRestoreRef: close.gitRestoreRef,
					headRef: close.headRef,
				}
			: {}),
		changes: releaseChanges,
		checks: releaseNoteChecks(changes),
		changedPaths: unique(changes.flatMap(changedPaths)),
		evidenceRefs: unique(changes.flatMap(implementationEvidenceRefs)),
		refs: unique([...(state.refs || []), ...(close?.refs || [])]),
	};
}

export function renderTraceCloseReleaseNotes(
	notes: TraceCloseReleaseNotes,
): string {
	return [
		`# Release Notes: ${notes.title}`,
		"",
		`- Trace: ${notes.traceId}`,
		`- Status: ${notes.closed ? "closed" : "open"}`,
		...(notes.closedAt ? [`- Closed: ${notes.closedAt}`] : []),
		...(notes.closeReason ? [`- Reason: ${notes.closeReason}`] : []),
		...(notes.gitRestoreRef ? [`- Restore ref: ${notes.gitRestoreRef}`] : []),
		"",
		"## Changes",
		...(notes.changes.length
			? notes.changes.flatMap(renderChange)
			: ["- No implementation changes recorded."]),
		"",
		"## Verification",
		...(notes.checks.length
			? notes.checks.map(renderCheck)
			: ["- No verification checks recorded."]),
		"",
		"## Evidence Refs",
		...(notes.evidenceRefs.length
			? notes.evidenceRefs.map((ref) => `- ${ref}`)
			: ["- No implementation evidence refs recorded."]),
	]
		.join("\n")
		.trimEnd();
}

function implementationChangesFromRecords(
	records: TraceRecord[],
): ImplementationChange[] {
	const state = replayTrace(records);
	const rawChanges = state.events.flatMap((event) => {
		if (event.loop !== "implementation") return [];
		return objectList(objectRecord(event.data?.output).changes).filter(
			isImplementationChangeInput,
		);
	});
	return normalizeImplementationChanges(rawChanges);
}

function traceReleaseNoteChange(
	change: ImplementationChange,
): TraceReleaseNoteChange {
	return {
		id: change.id,
		summary: releaseChangeSummary(change),
		planningRefs: change.planningRefs,
		...(change.workUnitId ? { workUnitId: change.workUnitId } : {}),
		...(change.workerId ? { workerId: change.workerId } : {}),
		codePaths: change.codePaths,
		docPaths: change.docPaths,
		testPaths: change.testPaths,
		evidenceRefs: unique([
			...checkResultRefs(change),
			...acceptanceEvidenceRefs(change),
		]),
		contentProofRefs: contentProofRefs(change),
		publicationRefs: change.publicationRefs,
	};
}

function releaseChangeSummary(change: ImplementationChange): string {
	return (
		change.acceptanceEvidenceItems.find((item) => item.summary)?.summary ||
		change.acceptanceEvidence[0] ||
		change.implementationAssessment.rationale ||
		`${changedPaths(change).length} path(s) changed.`
	);
}

function releaseNoteChecks(
	changes: ImplementationChange[],
): TraceReleaseNoteCheck[] {
	return uniqueBy(
		changes.flatMap((change): TraceReleaseNoteCheck[] =>
			change.checkResults.length
				? change.checkResults.map(traceReleaseNoteCheck)
				: change.checks.map((command) => ({ command, status: "not-run" })),
		),
		(check) =>
			[
				check.command,
				check.status,
				check.outputRef || "",
				check.summary || "",
			].join("\0"),
	);
}

function traceReleaseNoteCheck(check: CheckResult): TraceReleaseNoteCheck {
	return {
		command: check.command,
		status: check.status,
		...(check.outputRef ? { outputRef: check.outputRef } : {}),
		...(check.summary ? { summary: check.summary } : {}),
	};
}

function renderChange(change: TraceReleaseNoteChange): string[] {
	return [
		`- ${change.id}: ${change.summary}`,
		...(change.planningRefs.length
			? [`  - Planning: ${change.planningRefs.join(", ")}`]
			: []),
		...(changedPathsFromReleaseChange(change).length
			? [`  - Paths: ${changedPathsFromReleaseChange(change).join(", ")}`]
			: []),
	];
}

function renderCheck(check: TraceReleaseNoteCheck): string {
	return `- [${check.status}] ${check.command}${check.outputRef ? ` (${check.outputRef})` : ""}`;
}

function changedPathsFromReleaseChange(
	change: TraceReleaseNoteChange,
): string[] {
	return unique([...change.codePaths, ...change.docPaths, ...change.testPaths]);
}

function isImplementationChangeInput(
	value: Record<string, unknown>,
): value is RawImplementationChangeInput {
	return typeof value.id === "string" && value.id.trim().length > 0;
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function objectList(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
		: [];
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
	);
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
	const seen = new Set<string>();
	const output: T[] = [];
	for (const value of values) {
		const id = key(value);
		if (seen.has(id)) continue;
		seen.add(id);
		output.push(value);
	}
	return output;
}
