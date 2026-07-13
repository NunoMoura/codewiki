import { changeContentDigest } from "./digest.ts";
import { parseChange } from "./schema.ts";
import type { Change, ChangeStatus } from "./types.ts";

export const CHANGE_RECORD_SCHEMA_VERSION = 1;
export const CHANGE_LINK_RELATION_VALUES = [
	"related",
	"duplicate_of",
	"merged_into",
	"merged_from",
	"split_into",
	"split_from",
] as const;

export type ChangeLinkRelation = (typeof CHANGE_LINK_RELATION_VALUES)[number];

export interface ChangeLink {
	relation: ChangeLinkRelation;
	targetChangeId: string;
	createdBy: string;
	createdAt: string;
}

export interface ChangeRecord {
	schemaVersion: typeof CHANGE_RECORD_SCHEMA_VERSION;
	recordRevision: number;
	change: Change;
	links: ChangeLink[];
}

interface ChangeEvidenceAddition {
	sourceRefs?: string[];
	proofRefs?: string[];
	updatedBy: string;
	updatedAt: string;
}

interface ChangeStatusChange {
	status: Exclude<ChangeStatus, "accepted">;
	changedBy: string;
	changedAt: string;
	reason?: string;
	authority?: string;
	ref?: string;
}

export function createChangeRecord(change: Change): ChangeRecord {
	return {
		schemaVersion: CHANGE_RECORD_SCHEMA_VERSION,
		recordRevision: 1,
		change: parseChange(change),
		links: [],
	};
}

export function parseChangeRecord(value: unknown): ChangeRecord {
	if (!isRecord(value)) throw invalidRecord("record must be an object");
	assertKeys(value, ["schemaVersion", "recordRevision", "change", "links"]);
	if (value.schemaVersion !== CHANGE_RECORD_SCHEMA_VERSION) {
		throw invalidRecord(
			`schemaVersion must be ${CHANGE_RECORD_SCHEMA_VERSION}`,
		);
	}
	if (
		!Number.isInteger(value.recordRevision) ||
		Number(value.recordRevision) < 1
	) {
		throw invalidRecord("recordRevision must be a positive integer");
	}
	if (!Array.isArray(value.links))
		throw invalidRecord("links must be an array");
	const change = parseChange(value.change);
	const links = value.links.map((link, index) => parseChangeLink(link, index));
	if (links.some((link) => link.targetChangeId === change.id)) {
		throw invalidRecord("record cannot link to itself");
	}
	return {
		schemaVersion: CHANGE_RECORD_SCHEMA_VERSION,
		recordRevision: Number(value.recordRevision),
		change,
		links: uniqueLinks(links),
	};
}

export function reviseChangeRecord(
	record: ChangeRecord,
	change: Change,
): ChangeRecord {
	const current = parseChangeRecord(record);
	const replacement = parseChange(change);
	if (replacement.id !== current.change.id) {
		throw invalidRecord("replacement Change id must remain stable");
	}
	if (replacement.revision !== current.change.revision + 1) {
		throw invalidRecord("replacement Change revision must increase by one");
	}
	return {
		...current,
		recordRevision: current.recordRevision + 1,
		change: replacement,
	};
}

export function addChangeEvidence(
	record: ChangeRecord,
	addition: ChangeEvidenceAddition,
): ChangeRecord {
	const current = parseChangeRecord(record);
	const change = nextEditableChange(
		current.change,
		addition.updatedBy,
		addition.updatedAt,
	);
	change.evidence.sourceRefs = unique([
		...change.evidence.sourceRefs,
		...(addition.sourceRefs || []),
	]);
	change.evidence.proofRefs = unique([
		...change.evidence.proofRefs,
		...(addition.proofRefs || []),
	]);
	return reviseChangeRecord(current, parseChange(change));
}

export function transitionChangeStatus(
	record: ChangeRecord,
	input: ChangeStatusChange,
): ChangeRecord {
	const current = parseChangeRecord(record);
	if (current.change.status === input.status) {
		throw invalidRecord(`Change is already ${input.status}`);
	}
	const change = nextEditableChange(
		current.change,
		input.changedBy,
		input.changedAt,
	);
	const from = current.change.status;
	change.status = input.status;
	change.lastStatusTransition = {
		changeId: change.id,
		revision: change.revision,
		contentDigest: changeContentDigest(change),
		from,
		to: input.status,
		changedBy: input.changedBy,
		changedAt: input.changedAt,
		...(input.reason ? { reason: input.reason } : {}),
		...(input.authority ? { authority: input.authority } : {}),
		...(input.ref ? { ref: input.ref } : {}),
	};
	return reviseChangeRecord(current, parseChange(change));
}

export function linkChangeRecord(
	record: ChangeRecord,
	link: ChangeLink,
): ChangeRecord {
	const current = parseChangeRecord(record);
	const parsedLink = parseChangeLink(link, current.links.length);
	if (parsedLink.targetChangeId === current.change.id) {
		throw invalidRecord("record cannot link to itself");
	}
	return {
		...current,
		recordRevision: current.recordRevision + 1,
		links: uniqueLinks([...current.links, parsedLink]),
	};
}

export function mergeChangeRecords(input: {
	target: ChangeRecord;
	sources: ChangeRecord[];
	changedBy: string;
	changedAt: string;
}): ChangeRecord[] {
	let target = parseChangeRecord(input.target);
	const sourceIds = new Set<string>();
	const sources = input.sources.map((source) => {
		const current = parseChangeRecord(source);
		if (
			current.change.id === target.change.id ||
			sourceIds.has(current.change.id)
		) {
			throw invalidRecord(
				"merge source ids must be unique and differ from target",
			);
		}
		sourceIds.add(current.change.id);
		target = linkChangeRecord(target, {
			relation: "merged_from",
			targetChangeId: current.change.id,
			createdBy: input.changedBy,
			createdAt: input.changedAt,
		});
		return transitionChangeStatus(
			linkChangeRecord(current, {
				relation: "merged_into",
				targetChangeId: target.change.id,
				createdBy: input.changedBy,
				createdAt: input.changedAt,
			}),
			{
				status: "withdrawn",
				changedBy: input.changedBy,
				changedAt: input.changedAt,
				reason: `Merged into ${target.change.id}.`,
			},
		);
	});
	return [target, ...sources];
}

export function splitChangeRecord(input: {
	parent: ChangeRecord;
	children: Change[];
	changedBy: string;
	changedAt: string;
}): ChangeRecord[] {
	let parent = parseChangeRecord(input.parent);
	const childIds = new Set<string>();
	const children = input.children.map((change) => {
		const child = createChangeRecord(change);
		if (child.change.id === parent.change.id || childIds.has(child.change.id)) {
			throw invalidRecord(
				"split child ids must be unique and differ from parent",
			);
		}
		childIds.add(child.change.id);
		parent = linkChangeRecord(parent, {
			relation: "split_into",
			targetChangeId: child.change.id,
			createdBy: input.changedBy,
			createdAt: input.changedAt,
		});
		return parseChangeRecord({
			...child,
			links: [
				{
					relation: "split_from",
					targetChangeId: parent.change.id,
					createdBy: input.changedBy,
					createdAt: input.changedAt,
				},
			],
		});
	});
	return [parent, ...children];
}

function nextEditableChange(
	change: Change,
	updatedBy: string,
	updatedAt: string,
): Change {
	if (change.status === "accepted") {
		throw invalidRecord("accepted Change revisions are immutable");
	}
	return {
		...change,
		revision: change.revision + 1,
		lastStatusTransition: undefined,
		evidence: {
			...change.evidence,
			sourceRefs: [...change.evidence.sourceRefs],
			proofRefs: [...change.evidence.proofRefs],
		},
		validation: invalidateValidation(change),
		provenance: {
			...change.provenance,
			updatedAt,
			createdBy: change.provenance.createdBy || updatedBy,
		},
	};
}

function invalidateValidation(change: Change): Change["validation"] {
	return {
		...change.validation,
		state:
			change.validation.state === "valid" ? "stale" : change.validation.state,
		validatedRevision: undefined,
		validatedDigest: undefined,
		issues: change.validation.issues.map((issue) => ({
			...issue,
			refs: [...issue.refs],
		})),
		assessments: change.validation.assessments.map((assessment) => ({
			...assessment,
			concerns: [...assessment.concerns],
			evidenceRefs: [...assessment.evidenceRefs],
		})),
		recommendations: change.validation.recommendations.map(
			(recommendation) => ({
				...recommendation,
				evidenceRefs: [...recommendation.evidenceRefs],
			}),
		),
	};
}

function parseChangeLink(value: unknown, index: number): ChangeLink {
	if (!isRecord(value))
		throw invalidRecord(`links[${index}] must be an object`);
	assertKeys(value, ["relation", "targetChangeId", "createdBy", "createdAt"]);
	const relation = requiredText(value.relation, `links[${index}].relation`);
	if (!CHANGE_LINK_RELATION_VALUES.includes(relation as ChangeLinkRelation)) {
		throw invalidRecord(`links[${index}].relation is unsupported`);
	}
	const targetChangeId = requiredText(
		value.targetChangeId,
		`links[${index}].targetChangeId`,
	);
	if (!/^CHG-[A-Za-z0-9._-]+$/.test(targetChangeId)) {
		throw invalidRecord(`links[${index}].targetChangeId must use CHG- prefix`);
	}
	return {
		relation: relation as ChangeLinkRelation,
		targetChangeId,
		createdBy: requiredText(value.createdBy, `links[${index}].createdBy`),
		createdAt: requiredText(value.createdAt, `links[${index}].createdAt`),
	};
}

function uniqueLinks(links: ChangeLink[]): ChangeLink[] {
	const seen = new Set<string>();
	return links.filter((link) => {
		const key = `${link.relation}:${link.targetChangeId}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function unique(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function assertKeys(value: Record<string, unknown>, allowed: string[]): void {
	const allowedSet = new Set(allowed);
	for (const key of Object.keys(value)) {
		if (!allowedSet.has(key)) throw invalidRecord(`unknown field ${key}`);
	}
}

function requiredText(value: unknown, path: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw invalidRecord(`${path} must be non-empty text`);
	}
	return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidRecord(message: string): Error {
	return new Error(`Invalid Change record: ${message}`);
}
