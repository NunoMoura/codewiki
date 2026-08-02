import {
	assertSha256Digest,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import {
	createCustomCheckConfigState,
	type CustomCheckConfigState,
} from "./configuration.ts";
import {
	assertCustomCheckMutationReceipt,
	normalizeAuthenticatedCustomCheckAuthority,
	type AuthenticatedCustomCheckAuthority,
	type CustomCheckMutationReceipt,
} from "./mutations.ts";
import {canonicalIsoTimestamp} from "./validation.ts";

export const CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL = Object.freeze({
	id: "codewiki.custom-check-policy-review",
	version: "2.0.0",
	maxEvidenceIds: 16,
	maxSummaryLength: 1_000,
});

export type CustomCheckPolicyReviewStatus =
	| "pass"
	| "fail"
	| "indeterminate";

export interface CustomCheckPolicyReviewRequest {
	readonly protocolId: typeof CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.id;
	readonly protocolVersion: typeof CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.version;
	readonly mutationReceipt: CustomCheckMutationReceipt;
	readonly proposedConfig: CustomCheckConfigState;
	readonly requestDigest: Sha256Digest;
}

export interface CustomCheckPolicyReviewReceipt {
	readonly receiptId: string;
	readonly protocolId: typeof CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.id;
	readonly protocolVersion: typeof CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.version;
	readonly requestDigest: Sha256Digest;
	readonly mutationReceiptId: string;
	readonly protectedSourceHead: string;
	readonly configDigestAfter: Sha256Digest;
	readonly customCheckConfigDigestAfter: Sha256Digest;
	readonly status: CustomCheckPolicyReviewStatus;
	readonly reviewer: AuthenticatedCustomCheckAuthority;
	readonly evidenceIds: readonly string[];
	readonly summary: string;
	readonly reviewedAt: string;
}

export function createCustomCheckPolicyReviewRequest(input: {
	readonly mutationReceipt: CustomCheckMutationReceipt;
	readonly proposedConfig: CustomCheckConfigState;
}): CustomCheckPolicyReviewRequest {
	assertCustomCheckMutationReceipt(input.mutationReceipt);
	const proposedConfig = normalizeConfigState(input.proposedConfig);
	if (
		proposedConfig.projectConfigDigest !== input.mutationReceipt.configDigestAfter ||
		proposedConfig.customCheckConfigDigest !==
			input.mutationReceipt.customCheckConfigDigestAfter
	) {
		throw new Error(
			"Custom Check policy review config does not match the mutation receipt.",
		);
	}
	const identity = {
		protocolId: CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.version,
		mutationReceiptId: input.mutationReceipt.receiptId,
		protectedBaseSnapshotDigest:
			input.mutationReceipt.protectedBaseSnapshotDigest,
		protectedSourceHead: input.mutationReceipt.protectedSourceHead,
		protectedConfigDigest: input.mutationReceipt.protectedConfigDigest,
		configDigestBefore: input.mutationReceipt.configDigestBefore,
		configDigestAfter: proposedConfig.projectConfigDigest,
		customCheckConfigDigestBefore:
			input.mutationReceipt.customCheckConfigDigestBefore,
		customCheckConfigDigestAfter: proposedConfig.customCheckConfigDigest,
		definitionBefore: input.mutationReceipt.definitionBefore,
		definitionAfter: input.mutationReceipt.definitionAfter,
		proposedUserStandards: proposedConfig.userStandards,
		proposedCustomChecks: proposedConfig.customChecks,
	};
	return Object.freeze({
		protocolId: CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.version,
		mutationReceipt: input.mutationReceipt,
		proposedConfig,
		requestDigest: canonicalJsonDigest(identity),
	});
}

export function assertCustomCheckPolicyReviewRequest(
	value: CustomCheckPolicyReviewRequest,
): void {
	assertExactKeys(
		value,
		[
			"protocolId",
			"protocolVersion",
			"mutationReceipt",
			"proposedConfig",
			"requestDigest",
		],
		"Custom Check policy review request",
	);
	if (value.protocolId !== CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.id) {
		throw new Error("Custom Check policy review request protocolId is invalid.");
	}
	if (value.protocolVersion !== CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.version) {
		throw new Error("Custom Check policy review request protocolVersion is invalid.");
	}
	const expected = createCustomCheckPolicyReviewRequest({
		mutationReceipt: value.mutationReceipt,
		proposedConfig: value.proposedConfig,
	});
	if (value.requestDigest !== expected.requestDigest) {
		throw new Error("Custom Check policy review request digest is invalid.");
	}
}

export function createCustomCheckPolicyReviewReceipt(input: {
	readonly request: CustomCheckPolicyReviewRequest;
	readonly status: CustomCheckPolicyReviewStatus;
	readonly reviewer: AuthenticatedCustomCheckAuthority;
	readonly evidenceIds: readonly string[];
	readonly summary: string;
	readonly reviewedAt: string;
}): CustomCheckPolicyReviewReceipt {
	assertCustomCheckPolicyReviewRequest(input.request);
	const reviewer = normalizeAuthenticatedCustomCheckAuthority(input.reviewer);
	const payload = {
		protocolId: CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.version,
		requestDigest: sha256Digest(input.request.requestDigest, "review.requestDigest"),
		mutationReceiptId: boundedText(
			input.request.mutationReceipt.receiptId,
			"review.mutationReceiptId",
			200,
		),
		protectedSourceHead: gitObjectId(
			input.request.mutationReceipt.protectedSourceHead,
			"review.protectedSourceHead",
		),
		configDigestAfter: sha256Digest(
			input.request.proposedConfig.projectConfigDigest,
			"review.configDigestAfter",
		),
		customCheckConfigDigestAfter: sha256Digest(
			input.request.proposedConfig.customCheckConfigDigest,
			"review.customCheckConfigDigestAfter",
		),
		status: reviewStatus(input.status),
		reviewer,
		evidenceIds: evidenceIds(input.evidenceIds),
		summary: boundedText(
			input.summary,
			"review.summary",
			CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.maxSummaryLength,
		),
		reviewedAt: canonicalIsoTimestamp(input.reviewedAt, "review.reviewedAt"),
	};
	return Object.freeze({
		receiptId: reviewReceiptId(payload),
		...payload,
	});
}

export function assertCustomCheckPolicyReviewReceipt(
	value: CustomCheckPolicyReviewReceipt,
): void {
	assertExactKeys(
		value,
		[
			"receiptId",
			"protocolId",
			"protocolVersion",
			"requestDigest",
			"mutationReceiptId",
			"protectedSourceHead",
			"configDigestAfter",
			"customCheckConfigDigestAfter",
			"status",
			"reviewer",
			"evidenceIds",
			"summary",
			"reviewedAt",
		],
		"Custom Check policy review receipt",
	);
	if (value.protocolId !== CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.id) {
		throw new Error("Custom Check policy review receipt protocolId is invalid.");
	}
	if (value.protocolVersion !== CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.version) {
		throw new Error("Custom Check policy review receipt protocolVersion is invalid.");
	}
	const payload = {
		protocolId: CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.version,
		requestDigest: sha256Digest(value.requestDigest, "review.requestDigest"),
		mutationReceiptId: boundedText(
			value.mutationReceiptId,
			"review.mutationReceiptId",
			200,
		),
		protectedSourceHead: gitObjectId(
			value.protectedSourceHead,
			"review.protectedSourceHead",
		),
		configDigestAfter: sha256Digest(
			value.configDigestAfter,
			"review.configDigestAfter",
		),
		customCheckConfigDigestAfter: sha256Digest(
			value.customCheckConfigDigestAfter,
			"review.customCheckConfigDigestAfter",
		),
		status: reviewStatus(value.status),
		reviewer: normalizeAuthenticatedCustomCheckAuthority(value.reviewer),
		evidenceIds: evidenceIds(value.evidenceIds),
		summary: boundedText(
			value.summary,
			"review.summary",
			CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.maxSummaryLength,
		),
		reviewedAt: canonicalIsoTimestamp(value.reviewedAt, "review.reviewedAt"),
	};
	const {receiptId: _receiptId, ...rawPayload} = value;
	if (
		value.receiptId !== reviewReceiptId(payload) ||
		value.receiptId !== reviewReceiptId(rawPayload)
	) {
		throw new Error("Custom Check policy review receipt id does not match its content.");
	}
}

function normalizeConfigState(value: CustomCheckConfigState): CustomCheckConfigState {
	const normalized = createCustomCheckConfigState({
		projectConfigDigest: sha256Digest(
			value.projectConfigDigest,
			"proposedConfig.projectConfigDigest",
		),
		userStandards: value.userStandards,
		customChecks: value.customChecks,
	});
	if (normalized.customCheckConfigDigest !== value.customCheckConfigDigest) {
		throw new Error("Custom Check policy review config digest is invalid.");
	}
	return normalized;
}

function reviewReceiptId(payload: object): string {
	return `custom-check-policy-review:${canonicalJsonDigest(payload).slice("sha256:".length)}`;
}

function reviewStatus(value: unknown): CustomCheckPolicyReviewStatus {
	if (value === "pass" || value === "fail" || value === "indeterminate") {
		return value;
	}
	throw new Error("Custom Check policy review status is invalid.");
}

function evidenceIds(value: readonly string[]): readonly string[] {
	if (!Array.isArray(value)) {
		throw new Error("Custom Check policy review evidenceIds must be an array.");
	}
	const normalized = [
		...new Set(
			value.map((entry) => boundedText(entry, "review.evidenceId", 512)),
		),
	].sort(compareText);
	if (
		normalized.length === 0 ||
		normalized.length > CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.maxEvidenceIds
	) {
		throw new Error(
			`Custom Check policy review requires 1..${CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.maxEvidenceIds} Evidence ids.`,
		);
	}
	return Object.freeze(normalized);
}

function gitObjectId(value: unknown, field: string): string {
	const id = boundedText(value, field, 64);
	if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(id)) {
		throw new Error(`${field} must be a Git object id.`);
	}
	return id;
}

function sha256Digest(value: unknown, field: string): Sha256Digest {
	return assertSha256Digest(value, field);
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function boundedText(value: unknown, field: string, max: number): string {
	if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
		throw new Error(`${field} must be non-empty text of at most ${max} characters.`);
	}
	return value.trim();
}
