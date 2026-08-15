import {
	CHECK_INVOCATION_PROTOCOL_ID,
	CHECK_INVOCATION_PROTOCOL_VERSION,
	CheckInvocationSchema,
	normalizeCheckOutput,
	qualifiedCheckId,
	type CheckInputItem,
	type CheckInputSelection,
	type CheckInputSelector,
	type CheckInvocation,
	type CheckOutput,
	type CheckSubject,
} from "./contracts.ts";
import {assertCheckSubject} from "./identity.ts";
import {assertTypeboxSchema} from "../utils/json.ts";
import type {CheckPackSnapshot, PackagedCheck} from "./packs/contracts.ts";
import {assertCheckPackSnapshot} from "./packs/contracts.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";

export interface CreateCheckInputSelectionInput {
	readonly selector: CheckInputSelector;
	readonly status: "ready" | "unavailable";
	readonly items?: readonly CheckInputItem[];
	readonly truncated?: boolean;
	readonly stale?: boolean;
}

export interface AssembleCheckInvocationInput {
	readonly subject: CheckSubject;
	readonly snapshot: CheckPackSnapshot;
	readonly check: PackagedCheck;
	readonly inputs: readonly CheckInputSelection[];
}

export function createCheckInputSelection(
	input: CreateCheckInputSelectionInput,
): CheckInputSelection {
	const items = [...(input.items ?? [])].sort(compareInputItems);
	for (const item of items) assertInputItem(item, input.selector);
	if (input.status === "unavailable" && items.length > 0) {
		throw new Error("Unavailable Check input selection cannot contain items.");
	}
	const body = {
		selector: input.selector,
		status: input.status,
		items,
		truncated: input.truncated ?? false,
		stale: input.stale ?? false,
	};
	assertSelectionBytes(body, input.selector.maximumBytes);
	return immutable({...body, selectionDigest: canonicalJsonDigest(body)});
}

export function subjectInputSelection(
	subject: CheckSubject,
	selector: CheckInputSelector,
): CheckInputSelection {
	if (selector.source !== "subject") {
		throw new Error("Subject input selection requires subject selector.");
	}
	assertCheckSubject(subject);
	const item = {
		source: "subject" as const,
		ref: subject.id,
		digest: subject.digest,
		content: subject.content,
	};
	return createCheckInputSelection({selector, status: "ready", items: [item]});
}

export function assembleCheckInvocation(
	input: AssembleCheckInvocationInput,
): CheckInvocation {
	assertCheckSubject(input.subject);
	assertCheckPackSnapshot(input.snapshot, input.subject.stage);
	if (
		input.check.stage !== input.subject.stage ||
		input.check.stage !== input.snapshot.stage
	) {
		throw new Error("Check Invocation stage identity is inconsistent.");
	}
	const present = input.snapshot.packs
		.find((pack) => pack.id === input.check.packId)
		?.checks.some((check) => check.checkDigest === input.check.checkDigest);
	if (!present) {
		throw new Error(
			`Check ${qualifiedCheckId(input.check.packId, input.check.checkId)} is absent from snapshot.`,
		);
	}
	const inputs = normalizedSelections(input.check, input.inputs);
	const inputDigest = canonicalJsonDigest(
		inputs.map((selection) => selection.selectionDigest),
	);
	const body = {
		protocolId: CHECK_INVOCATION_PROTOCOL_ID,
		protocolVersion: CHECK_INVOCATION_PROTOCOL_VERSION,
		subject: input.subject,
		packSnapshotDigest: input.snapshot.digest,
		check: {
			packId: input.check.packId,
			checkId: input.check.checkId,
			checkVersion: input.check.definition.version,
			checkDigest: input.check.checkDigest,
			implementationKind: input.check.definition.implementation.kind,
		},
		inputs,
		inputDigest,
	};
	const normalized = toCanonicalJsonValue(body);
	const bytes = Buffer.byteLength(JSON.stringify(normalized), "utf8");
	if (bytes > input.check.definition.limits.maximumInputBytes) {
		throw new Error(
			`Check Invocation exceeds ${input.check.definition.limits.maximumInputBytes} bytes.`,
		);
	}
	return immutable({...body, invocationDigest: canonicalJsonDigest(body)});
}

export function admitCheckOutput(input: {
	readonly invocation: CheckInvocation;
	readonly value: unknown;
	readonly maximumOutputBytes: number;
}): CheckOutput {
	assertCheckInvocation(input.invocation);
	return normalizeCheckOutput(
		input.value,
		input.invocation.invocationDigest,
		input.maximumOutputBytes,
	);
}

export function assertCheckInvocation(
	invocation: CheckInvocation,
): void {
	assertTypeboxSchema(CheckInvocationSchema, invocation, "Check Invocation");
	if (
		invocation.protocolId !== CHECK_INVOCATION_PROTOCOL_ID ||
		invocation.protocolVersion !== CHECK_INVOCATION_PROTOCOL_VERSION
	) {
		throw new Error("Check Invocation protocol identity is unsupported.");
	}
	assertCheckSubject(invocation.subject);
	assertSha256Digest(invocation.packSnapshotDigest, "Check Invocation Pack digest");
	assertSha256Digest(invocation.check.checkDigest, "Check Invocation Check digest");
	assertSha256Digest(invocation.inputDigest, "Check Invocation input digest");
	assertSha256Digest(invocation.invocationDigest, "Check Invocation digest");
	const expectedInputDigest = canonicalJsonDigest(
		invocation.inputs.map((selection) => selection.selectionDigest),
	);
	if (invocation.inputDigest !== expectedInputDigest) {
		throw new Error("Check Invocation input digest does not match selections.");
	}
	const {invocationDigest, ...body} = invocation;
	if (invocationDigest !== canonicalJsonDigest(body)) {
		throw new Error("Check Invocation digest does not match its content.");
	}
}

function normalizedSelections(
	check: PackagedCheck,
	values: readonly CheckInputSelection[],
): CheckInputSelection[] {
	if (!Array.isArray(values)) throw new Error("Check Invocation inputs must be an array.");
	if (values.length !== check.definition.inputs.length) {
		throw new Error(`Check ${check.packId}/${check.checkId} input selection count is invalid.`);
	}
	const bySource = new Map(values.map((selection) => [selection.selector.source, selection]));
	if (bySource.size !== values.length) {
		throw new Error("Check Invocation input sources must be unique.");
	}
	return check.definition.inputs.map((selector) => {
		const selection = bySource.get(selector.source);
		if (!selection) {
			throw new Error(`Check Invocation is missing ${selector.source} inputs.`);
		}
		assertSelection(selection, selector);
		return selection;
	});
}

function assertSelection(
	selection: CheckInputSelection,
	selector: CheckInputSelector,
): void {
	if (canonicalJsonDigest(selection.selector) !== canonicalJsonDigest(selector)) {
		throw new Error(`Check input selector ${selector.source} does not match definition.`);
	}
	if (selection.status !== "ready" && selection.status !== "unavailable") {
		throw new Error(`Check input selection ${selector.source} has invalid status.`);
	}
	for (const item of selection.items) assertInputItem(item, selector);
	const {selectionDigest, ...body} = selection;
	if (selectionDigest !== canonicalJsonDigest(body)) {
		throw new Error(`Check input selection ${selector.source} digest is invalid.`);
	}
	assertSelectionBytes(body, selector.maximumBytes);
}

function assertInputItem(item: CheckInputItem, selector: CheckInputSelector): void {
	if (item.source !== selector.source) {
		throw new Error(`Check input item ${item.ref} has wrong source ${item.source}.`);
	}
	if (!item.ref.trim() || item.ref !== item.ref.trim()) {
		throw new Error("Check input item ref must be trimmed non-empty text.");
	}
	assertSha256Digest(item.digest, "Check input item digest");
	if (canonicalJsonDigest(item.content) !== item.digest && item.source !== "subject") {
		throw new Error(`Check input item ${item.ref} digest does not match content.`);
	}
	if (
		selector.refs.length > 0 &&
		!selector.refs.some((ref) => inputRefMatches(ref, item.ref))
	) {
		throw new Error(`Check input item ${item.ref} is outside selector refs.`);
	}
}

function inputRefMatches(selectorRef: string, itemRef: string): boolean {
	if (selectorRef.endsWith("/**")) {
		return itemRef.startsWith(selectorRef.slice(0, -2));
	}
	return selectorRef === itemRef;
}

function assertSelectionBytes(value: unknown, maximumBytes: number): void {
	const bytes = Buffer.byteLength(JSON.stringify(toCanonicalJsonValue(value)), "utf8");
	if (bytes > maximumBytes) {
		throw new Error(`Check input selection exceeds ${maximumBytes} bytes.`);
	}
}

function compareInputItems(left: CheckInputItem, right: CheckInputItem): number {
	if (left.ref < right.ref) return -1;
	if (left.ref > right.ref) return 1;
	return 0;
}

function immutable<T>(value: T): T {
	return toCanonicalJsonValue(value) as unknown as T;
}

export type {Sha256Digest};
