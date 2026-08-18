import type {
	CheckFailure,
	CheckSubject,
	GateReport,
} from "../../checks/contracts.ts";
import type {EvidenceRecord} from "../../evidence/contracts.ts";
import {assertValidEvidenceRecord} from "../../evidence/materialize.ts";
import {
	assertSha256Digest,
	canonicalJson,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export const REVIEW_ATTEMPT_SCHEMA_VERSION = "2.0.0" as const;

const REVIEW_ATTEMPT_FIELDS = [
	"integratedHead",
	"integratedTree",
	"targetBranch",
	"changeIds",
	"workUnitIds",
	"checkPackSnapshotDigest",
	"providerReceiptDigests",
	"evidenceRecordDigests",
] as const;
const MAX_BOUND_IDENTITIES = 4_096;
const MAX_IDENTITY_LENGTH = 512;

export interface CreateReviewAttemptInput {
	readonly integratedHead: string;
	readonly integratedTree: string;
	readonly targetBranch: string;
	readonly changeIds: readonly string[];
	readonly workUnitIds: readonly string[];
	readonly checkPackSnapshotDigest: Sha256Digest;
	readonly providerReceiptDigests: readonly Sha256Digest[];
	readonly evidenceRecordDigests: readonly Sha256Digest[];
}

export interface ReviewAttempt {
	readonly schemaVersion: typeof REVIEW_ATTEMPT_SCHEMA_VERSION;
	readonly integratedHead: string;
	readonly integratedTree: string;
	readonly targetBranch: string;
	readonly changeIds: readonly string[];
	readonly workUnitIds: readonly string[];
	readonly checkPackSnapshotDigest: Sha256Digest;
	readonly providerReceiptDigests: readonly Sha256Digest[];
	readonly evidenceRecordDigests: readonly Sha256Digest[];
	readonly attemptDigest: Sha256Digest;
}

export interface ReviewEvidenceSubmission {
	readonly integratedHead: string;
	readonly integratedTree: string;
	readonly record: EvidenceRecord;
}

export interface ReviewProviderReceiptBinding {
	readonly integratedHead: string;
	readonly receiptDigest: Sha256Digest;
}

export interface ReviewFeedbackItem {
	readonly packId: string;
	readonly checkId: string;
	readonly resultDigest: Sha256Digest;
	readonly failure: CheckFailure;
}

export function createReviewAttempt(
	input: CreateReviewAttemptInput,
): ReviewAttempt {
	assertExactKeys(input);
	const integratedHead = gitObjectId(input.integratedHead, "integratedHead");
	const integratedTree = gitObjectId(input.integratedTree, "integratedTree");
	const targetBranch = identity(input.targetBranch, "targetBranch");
	const changeIds = identities(input.changeIds, "changeIds", true);
	const workUnitIds = identities(input.workUnitIds, "workUnitIds", true);
	assertSha256Digest(
		input.checkPackSnapshotDigest,
		"Review Check Pack snapshot digest",
	);
	const providerReceiptDigests = digests(
		input.providerReceiptDigests,
		"providerReceiptDigests",
	);
	const evidenceRecordDigests = digests(
		input.evidenceRecordDigests,
		"evidenceRecordDigests",
	);
	const body = Object.freeze({
		schemaVersion: REVIEW_ATTEMPT_SCHEMA_VERSION,
		integratedHead,
		integratedTree,
		targetBranch,
		changeIds,
		workUnitIds,
		checkPackSnapshotDigest: input.checkPackSnapshotDigest,
		providerReceiptDigests,
		evidenceRecordDigests,
	});
	return Object.freeze({
		...body,
		attemptDigest: canonicalJsonDigest(body),
	});
}

export function reviewSubjectFromAttempt(attempt: ReviewAttempt): CheckSubject {
	const expected = createReviewAttempt({
		integratedHead: attempt.integratedHead,
		integratedTree: attempt.integratedTree,
		targetBranch: attempt.targetBranch,
		changeIds: attempt.changeIds,
		workUnitIds: attempt.workUnitIds,
		checkPackSnapshotDigest: attempt.checkPackSnapshotDigest,
		providerReceiptDigests: attempt.providerReceiptDigests,
		evidenceRecordDigests: attempt.evidenceRecordDigests,
	});
	if (canonicalJson(attempt) !== canonicalJson(expected)) {
		throw new Error("Review attempt identity is invalid.");
	}
	const subject = {
		stage: "review" as const,
		id: `review-attempt:${attempt.attemptDigest.slice("sha256:".length)}`,
		schemaVersion: attempt.schemaVersion,
		content: toCanonicalJsonValue(attempt),
	};
	return Object.freeze({...subject, digest: canonicalJsonDigest(subject)});
}

export function admitReviewEvidence(input: {
	readonly attempt: ReviewAttempt;
	readonly evidence: readonly ReviewEvidenceSubmission[];
	readonly providerReceipts: readonly ReviewProviderReceiptBinding[];
}): readonly EvidenceRecord[] {
	const evidence = input.evidence.map((submission) => {
		assertOnlyKeys(
			submission,
			["integratedHead", "integratedTree", "record"],
			"Review Evidence submission",
		);
		if (
			submission.integratedHead !== input.attempt.integratedHead ||
			submission.integratedTree !== input.attempt.integratedTree
		) {
			throw new Error("Review Evidence does not bind the exact integrated head and tree.");
		}
		return submission.record;
	});
	assertReviewEvidenceRecords(input.attempt, evidence);
	const providerDigests = input.providerReceipts.map((receipt) => {
		assertOnlyKeys(
			receipt,
			["integratedHead", "receiptDigest"],
			"Review provider receipt binding",
		);
		if (receipt.integratedHead !== input.attempt.integratedHead) {
			throw new Error("Review provider receipt does not bind the exact integrated head.");
		}
		assertSha256Digest(receipt.receiptDigest, "Review provider receipt digest");
		return receipt.receiptDigest;
	});
	assertExactDigestSet(
		providerDigests,
		input.attempt.providerReceiptDigests,
		"provider receipt",
	);
	return Object.freeze([...evidence]);
}

export function assertReviewEvidenceRecords(
	attempt: ReviewAttempt,
	evidence: readonly EvidenceRecord[],
): void {
	for (const record of evidence) assertValidEvidenceRecord(record);
	assertExactDigestSet(
		evidence.map((record) => canonicalJsonDigest(record)),
		attempt.evidenceRecordDigests,
		"Evidence",
	);
}

export function reviewFeedbackFromGate(input: {
	readonly attempt: ReviewAttempt;
	readonly report: GateReport;
}): readonly ReviewFeedbackItem[] {
	if (
		input.report.stage !== "review" ||
		input.report.subjectDigest !== reviewSubjectFromAttempt(input.attempt).digest
	) {
		throw new Error("Review Gate Report identity does not match Review attempt.");
	}
	const feedback: ReviewFeedbackItem[] = [];
	for (const result of input.report.results) {
		if (result.status !== "failed" || result.failure === undefined) continue;
		feedback.push(
			Object.freeze({
				packId: result.packId,
				checkId: result.checkId,
				resultDigest: result.resultDigest,
				failure: result.failure,
			}),
		);
	}
	return Object.freeze(feedback);
}

function assertExactDigestSet(
	actual: readonly Sha256Digest[],
	expected: readonly Sha256Digest[],
	label: string,
): void {
	const normalized = [...new Set(actual)].sort(compareText);
	if (
		normalized.length !== actual.length ||
		normalized.length !== expected.length ||
		normalized.some((digest, index) => digest !== expected[index])
	) {
		throw new Error(`Review ${label} digests do not match the admitted attempt.`);
	}
}

function assertOnlyKeys(
	value: object,
	allowed: readonly string[],
	label: string,
): void {
	const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unsupported.length > 0) {
		throw new Error(`${label} has unsupported fields: ${unsupported.join(", ")}.`);
	}
}

function assertExactKeys(value: object): void {
	const expected = new Set<string>(REVIEW_ATTEMPT_FIELDS);
	const actual = Object.keys(value);
	const unsupported = actual
		.filter((key) => !expected.has(key))
		.sort(compareText);
	const missing = REVIEW_ATTEMPT_FIELDS.filter(
		(key) => !Object.hasOwn(value, key),
	);
	if (unsupported.length > 0 || missing.length > 0) {
		throw new Error(
			`Review attempt fields are invalid; unsupported=${unsupported.join(",") || "none"}; missing=${missing.join(",") || "none"}.`,
		);
	}
}

function gitObjectId(value: unknown, field: string): string {
	if (typeof value !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
		throw new Error(`Review ${field} must be a lowercase full Git object id.`);
	}
	return value;
}

function identities(
	values: unknown,
	field: string,
	required: boolean,
): readonly string[] {
	if (!Array.isArray(values) || values.length > MAX_BOUND_IDENTITIES) {
		throw new Error(`Review ${field} must be a bounded array.`);
	}
	const normalized = values.map((value, index) =>
		identity(value, `${field}[${index}]`),
	);
	if (required && normalized.length === 0) {
		throw new Error(`Review ${field} must not be empty.`);
	}
	const unique = [...new Set(normalized)].sort(compareText);
	if (unique.length !== normalized.length) {
		throw new Error(`Review ${field} must not contain duplicates.`);
	}
	return Object.freeze(unique);
}

function digests(values: unknown, field: string): readonly Sha256Digest[] {
	const normalized = identities(values, field, false);
	for (const [index, value] of normalized.entries()) {
		assertSha256Digest(value, `Review ${field}[${index}]`);
	}
	return normalized as readonly Sha256Digest[];
}

function identity(value: unknown, field: string): string {
	if (typeof value !== "string") {
		throw new Error(`Review ${field} must be text.`);
	}
	const normalized = value.trim();
	if (
		normalized !== value ||
		normalized.length === 0 ||
		normalized.length > MAX_IDENTITY_LENGTH ||
		/[\u0000-\u001f\u007f]/u.test(normalized)
	) {
		throw new Error(`Review ${field} is invalid.`);
	}
	return normalized;
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
