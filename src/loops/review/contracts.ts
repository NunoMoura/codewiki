import {
	assertSha256Digest,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export const REVIEW_ATTEMPT_SCHEMA_VERSION = "1.0.0" as const;

const REVIEW_ATTEMPT_FIELDS = [
	"integratedHead",
	"integratedTree",
	"targetBranch",
	"changeIds",
	"workItemIds",
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
	readonly workItemIds: readonly string[];
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
	readonly workItemIds: readonly string[];
	readonly checkPackSnapshotDigest: Sha256Digest;
	readonly providerReceiptDigests: readonly Sha256Digest[];
	readonly evidenceRecordDigests: readonly Sha256Digest[];
	readonly attemptDigest: Sha256Digest;
}

export function createReviewAttempt(
	input: CreateReviewAttemptInput,
): ReviewAttempt {
	assertExactKeys(input);
	const integratedHead = gitObjectId(input.integratedHead, "integratedHead");
	const integratedTree = gitObjectId(input.integratedTree, "integratedTree");
	const targetBranch = identity(input.targetBranch, "targetBranch");
	const changeIds = identities(input.changeIds, "changeIds", true);
	const workItemIds = identities(input.workItemIds, "workItemIds", true);
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
		workItemIds,
		checkPackSnapshotDigest: input.checkPackSnapshotDigest,
		providerReceiptDigests,
		evidenceRecordDigests,
	});
	return Object.freeze({
		...body,
		attemptDigest: canonicalJsonDigest(body),
	});
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
