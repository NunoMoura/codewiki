import { createHash } from "node:crypto";
import { changeContentDigest, stableJson } from "./digest.ts";
import { parseChange } from "./schema.ts";
import {
	acceptChangeRecord,
	parseChangeRecord,
	type ChangeRecord,
} from "./records.ts";
import {
	DEFAULT_CHANGE_REF,
	type ChangeStoreSnapshot,
} from "./store.ts";
import type { Change } from "./types.ts";

export const ACCEPTED_CHANGE_BUNDLE_SCHEMA_VERSION = 1;

export interface AcceptedChangeSelection {
	changeId: string;
	revision: number;
	recordRevision: number;
	contentDigest: string;
}

export interface AcceptedChangeSnapshot {
	change: Change;
	recordRevision: number;
	contentDigest: string;
}

export interface AcceptedChangeBundle {
	schemaVersion: typeof ACCEPTED_CHANGE_BUNDLE_SCHEMA_VERSION;
	traceId: string;
	sourceRef: typeof DEFAULT_CHANGE_REF;
	sourceHead: string;
	acceptedBy: string;
	acceptedAt: string;
	changes: AcceptedChangeSnapshot[];
	digest: string;
}

export interface PrepareAcceptedChangeBundleInput {
	traceId: string;
	expectedHead: string;
	snapshot: ChangeStoreSnapshot;
	selections: AcceptedChangeSelection[];
	acceptedBy: string;
	acceptedAt: string;
}

export interface PreparedAcceptedChangeBundle {
	bundle: AcceptedChangeBundle;
	records: ChangeRecord[];
	recoveredAcceptance: boolean;
}

export function prepareAcceptedChangeBundle(
	input: PrepareAcceptedChangeBundleInput,
): PreparedAcceptedChangeBundle {
	const traceId = requiredText(input.traceId, "traceId");
	const expectedHead = requiredText(input.expectedHead, "expectedHead");
	const acceptedBy = requiredText(input.acceptedBy, "acceptedBy");
	const acceptedAt = utcTimestamp(input.acceptedAt, "acceptedAt");
	if (!input.selections.length) {
		throw invalidBundle("selections must contain at least one Change");
	}
	const selections = [...input.selections].sort((left, right) =>
		left.changeId.localeCompare(right.changeId),
	);
	assertUniqueSelections(selections);
	const records = selections.map((selection) =>
		acceptedRecord({
			selection,
			snapshot: input.snapshot,
			expectedHead,
			traceId,
			acceptedBy,
			acceptedAt,
		}),
	);
	const recoveredAcceptance = input.snapshot.head !== expectedHead;
	const unsigned: Omit<AcceptedChangeBundle, "digest"> = {
		schemaVersion: ACCEPTED_CHANGE_BUNDLE_SCHEMA_VERSION,
		traceId,
		sourceRef: DEFAULT_CHANGE_REF,
		sourceHead: expectedHead,
		acceptedBy,
		acceptedAt,
		changes: records.map(snapshotFromRecord),
	};
	return {
		bundle: {
			...unsigned,
			digest: acceptedChangeBundleDigest(unsigned),
		},
		records,
		recoveredAcceptance,
	};
}

export function parseAcceptedChangeBundle(value: unknown): AcceptedChangeBundle {
	if (!isRecord(value)) throw invalidBundle("bundle must be an object");
	assertKeys(value, [
		"schemaVersion",
		"traceId",
		"sourceRef",
		"sourceHead",
		"acceptedBy",
		"acceptedAt",
		"changes",
		"digest",
	]);
	if (value.schemaVersion !== ACCEPTED_CHANGE_BUNDLE_SCHEMA_VERSION) {
		throw invalidBundle("unsupported schemaVersion");
	}
	if (value.sourceRef !== DEFAULT_CHANGE_REF) {
		throw invalidBundle(`sourceRef must equal ${DEFAULT_CHANGE_REF}`);
	}
	if (!Array.isArray(value.changes) || !value.changes.length) {
		throw invalidBundle("changes must contain at least one snapshot");
	}
	const bundle: AcceptedChangeBundle = {
		schemaVersion: ACCEPTED_CHANGE_BUNDLE_SCHEMA_VERSION,
		traceId: requiredText(value.traceId, "traceId"),
		sourceRef: DEFAULT_CHANGE_REF,
		sourceHead: requiredText(value.sourceHead, "sourceHead"),
		acceptedBy: requiredText(value.acceptedBy, "acceptedBy"),
		acceptedAt: utcTimestamp(value.acceptedAt, "acceptedAt"),
		changes: value.changes.map(parseAcceptedSnapshot),
		digest: digestText(value.digest),
	};
	assertUniqueSelections(
		bundle.changes.map((snapshot) => ({
			changeId: snapshot.change.id,
			revision: snapshot.change.revision,
			recordRevision: snapshot.recordRevision,
			contentDigest: snapshot.contentDigest,
		})),
	);
	for (const snapshot of bundle.changes) {
		assertAcceptedSnapshot(snapshot, bundle);
	}
	const actualDigest = acceptedChangeBundleDigest(bundle);
	if (bundle.digest !== actualDigest) {
		throw invalidBundle(
			`digest mismatch: expected ${actualDigest}, found ${bundle.digest}`,
		);
	}
	return bundle;
}

export function acceptedChangeBundleDigest(
	bundle: Omit<AcceptedChangeBundle, "digest"> | AcceptedChangeBundle,
): string {
	const { digest: _digest, ...unsigned } = bundle as AcceptedChangeBundle;
	return `sha256:${createHash("sha256")
		.update(stableJson(unsigned))
		.digest("hex")}`;
}

function acceptedRecord(input: {
	selection: AcceptedChangeSelection;
	snapshot: ChangeStoreSnapshot;
	expectedHead: string;
	traceId: string;
	acceptedBy: string;
	acceptedAt: string;
}): ChangeRecord {
	const record = input.snapshot.records.find(
		(candidate) => candidate.change.id === input.selection.changeId,
	);
	if (!record) throw invalidBundle(`Change ${input.selection.changeId} was not found`);
	const current = parseChangeRecord(record);
	assertSelection(current, input.selection);
	assertValidated(current.change);
	if (current.change.status === "accepted") {
		if (!isMatchingAcceptance(current, input)) {
			throw invalidBundle(
				`Change ${current.change.id} is accepted by a different boundary`,
			);
		}
		return current;
	}
	if (current.change.status !== "pending") {
		throw invalidBundle(
			`Change ${current.change.id} must be pending, found ${current.change.status}`,
		);
	}
	if (input.snapshot.head !== input.expectedHead) {
		throw invalidBundle(
			`Change Store head changed: expected ${input.expectedHead}, found ${input.snapshot.head || "empty"}`,
		);
	}
	if (input.snapshot.head === null) {
		throw invalidBundle("Change Store cannot be empty when accepting Changes");
	}
	return acceptChangeRecord(current, {
		changedBy: input.acceptedBy,
		changedAt: input.acceptedAt,
		reason: `Accepted for independent trace ${input.traceId}.`,
		authority: input.acceptedBy,
		ref: input.traceId,
	});
}

function assertSelection(
	record: ChangeRecord,
	selection: AcceptedChangeSelection,
): void {
	if (
		record.change.revision !== selection.revision ||
		changeContentDigest(record.change) !== selection.contentDigest ||
		(record.change.status === "accepted"
			? record.recordRevision !== selection.recordRevision + 1
			: record.recordRevision !== selection.recordRevision)
	) {
		throw invalidBundle(`Change ${selection.changeId} selection is stale`);
	}
}

function assertValidated(change: Change): void {
	const digest = changeContentDigest(change);
	if (
		change.validation.state !== "valid" ||
		change.validation.validatedRevision !== change.revision ||
		change.validation.validatedDigest !== digest
	) {
		throw invalidBundle(
			`Change ${change.id} validation does not bind revision ${change.revision} and digest ${digest}`,
		);
	}
}

function isMatchingAcceptance(
	record: ChangeRecord,
	input: {
		selection: AcceptedChangeSelection;
		traceId: string;
		acceptedBy: string;
		acceptedAt: string;
	},
): boolean {
	const transition = record.change.lastStatusTransition;
	return (
		record.change.status === "accepted" &&
		record.change.revision === input.selection.revision &&
		record.recordRevision === input.selection.recordRevision + 1 &&
		changeContentDigest(record.change) === input.selection.contentDigest &&
		transition?.to === "accepted" &&
		transition.revision === input.selection.revision &&
		transition.contentDigest === input.selection.contentDigest &&
		transition.changedBy === input.acceptedBy &&
		transition.changedAt === input.acceptedAt &&
		transition.ref === input.traceId
	);
}

function snapshotFromRecord(record: ChangeRecord): AcceptedChangeSnapshot {
	return {
		change: record.change,
		recordRevision: record.recordRevision,
		contentDigest: changeContentDigest(record.change),
	};
}

function parseAcceptedSnapshot(value: unknown): AcceptedChangeSnapshot {
	if (!isRecord(value)) throw invalidBundle("Change snapshot must be an object");
	assertKeys(value, ["change", "recordRevision", "contentDigest"]);
	if (!Number.isInteger(value.recordRevision) || Number(value.recordRevision) < 1) {
		throw invalidBundle("snapshot recordRevision must be a positive integer");
	}
	return {
		change: parseChange(value.change),
		recordRevision: Number(value.recordRevision),
		contentDigest: digestText(value.contentDigest),
	};
}

function assertAcceptedSnapshot(
	snapshot: AcceptedChangeSnapshot,
	bundle: AcceptedChangeBundle,
): void {
	const digest = changeContentDigest(snapshot.change);
	const transition = snapshot.change.lastStatusTransition;
	if (
		snapshot.change.status !== "accepted" ||
		snapshot.contentDigest !== digest ||
		transition?.to !== "accepted" ||
		transition.revision !== snapshot.change.revision ||
		transition.contentDigest !== digest ||
		transition.changedBy !== bundle.acceptedBy ||
		transition.changedAt !== bundle.acceptedAt ||
		transition.authority !== bundle.acceptedBy ||
		transition.ref !== bundle.traceId
	) {
		throw invalidBundle(`Change ${snapshot.change.id} acceptance metadata is invalid`);
	}
	assertValidated(snapshot.change);
}

function assertUniqueSelections(selections: AcceptedChangeSelection[]): void {
	const ids = selections.map((selection) => requiredText(selection.changeId, "changeId"));
	if (new Set(ids).size !== ids.length) {
		throw invalidBundle("Change selections must have unique ids");
	}
}

function assertKeys(value: Record<string, unknown>, allowed: string[]): void {
	const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unknown.length) throw invalidBundle(`unknown field ${unknown[0]}`);
}

function requiredText(value: unknown, field: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw invalidBundle(`${field} must be a non-empty string`);
	}
	return value.trim();
}

function digestText(value: unknown): string {
	const digest = requiredText(value, "digest");
	if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
		throw invalidBundle("digest must be a sha256 value");
	}
	return digest;
}

function utcTimestamp(value: unknown, field: string): string {
	const timestamp = requiredText(value, field);
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp)) {
		throw invalidBundle(`${field} must be an ISO UTC timestamp`);
	}
	return timestamp;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidBundle(message: string): Error {
	return new Error(`Accepted Change bundle invalid: ${message}.`);
}
