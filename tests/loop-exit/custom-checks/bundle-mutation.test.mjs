import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	assertCustomCheckMutationReceipt,
	CUSTOM_CHECK_MUTATION_PROTOCOL,
	CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL,
	createCustomCheckConfigState,
	createCustomCheckMutationRuntime,
	createCustomCheckPolicyReviewReceipt,
	createCustomCheckPolicyReviewRequest,
	createProtectedCustomCheckConfigSnapshot,
	parseCustomCheckMutationCommand,
} from "../../../src/loop-exit/custom-checks/index.ts";
import {canonicalJsonDigest} from "../../../src/utils/canonical-json.ts";
import {createCompletedDistillationFixture} from "./distillation-fixture.mjs";

const HEAD = "a".repeat(40);

function authority() {
	return {
		actorId: "policy-editor",
		principalRef: "identity:policy-editor",
		role: "maintainer",
		actorPolicyDigest: `sha256:${"1".repeat(64)}`,
		authenticationEvidenceId: "auth:test:policy-editor",
		runtimeProtocolDigest: `sha256:${"2".repeat(64)}`,
	};
}

function stateFor(userStandards, customChecks) {
	return createCustomCheckConfigState({
		projectConfigDigest: canonicalJsonDigest({
			project: "bundle-mutation",
			userStandards,
			customChecks,
		}),
		userStandards,
		customChecks,
	});
}

function memoryStore() {
	let current = stateFor([], []);
	let writes = 0;
	return {
		async load() {
			return current;
		},
		async preview(input) {
			return stateFor(input.userStandards, input.customChecks);
		},
		async compareAndSwap(input) {
			assert.equal(current.projectConfigDigest, input.expectedConfigDigest);
			const next = stateFor(input.userStandards, input.customChecks);
			assert.equal(next.projectConfigDigest, input.expectedNextConfigDigest);
			current = next;
			writes += 1;
			return current;
		},
		current: () => current,
		writes: () => writes,
	};
}

function command(current, protectedBase, distillationReceipt, selectedProposalIds, overrides = {}) {
	return {
		protocolId: CUSTOM_CHECK_MUTATION_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_MUTATION_PROTOCOL.version,
		action: "create_distilled_bundle",
		idempotencyKey: "create-service-policy-bundle",
		expectedConfigDigest: current.projectConfigDigest,
		expectedProtectedSourceHead: protectedBase.protectedSourceHead,
		expectedProtectedConfigDigest: protectedBase.projectConfigDigest,
		distillationReceipt,
		selectedProposalIds,
		...overrides,
	};
}

describe("atomic distilled User Standard bundle mutation", () => {
	it("adds one exact Standard plus selected draft Checks through one authorized CAS", async () => {
		const fixture = await createCompletedDistillationFixture();
		const store = memoryStore();
		const protectedBase = createProtectedCustomCheckConfigSnapshot({
			protectedSourceHead: HEAD,
			projectConfigDigest: store.current().projectConfigDigest,
			userStandards: [],
			customChecks: [],
		});
		const authorizationRequests = [];
		const runtime = createCustomCheckMutationRuntime({
			store,
			loadProtectedBase: async () => protectedBase,
			authorize(request) {
				authorizationRequests.push(request);
				return true;
			},
			now: () => new Date("2026-08-05T11:00:00.000Z"),
		});
		const selectedProposalIds = fixture.bundle.customCheckProposals.map(
			(proposal) => proposal.proposalId,
		);
		const mutationCommand = command(
			store.current(),
			protectedBase,
			fixture.receipt,
			selectedProposalIds,
		);
		const result = await runtime.execute(mutationCommand, authority());

		assert.equal(CUSTOM_CHECK_MUTATION_PROTOCOL.version, "3.0.0");
		assert.equal(result.changedUserStandards.length, 1);
		assert.equal(result.changedCustomChecks.length, 2);
		assert.equal(result.changedCustomChecks.every((check) => check.lifecycle === "draft"), true);
		assert.equal(result.state.userStandards.length, 1);
		assert.equal(result.state.customChecks.length, 2);
		assert.equal(store.writes(), 1);
		assert.equal(authorizationRequests.length, 1);
		assert.equal(authorizationRequests[0].standardChanges.length, 1);
		assert.equal(authorizationRequests[0].definitionChanges.length, 2);
		assert.equal(result.receipt.distillationReceipt.receiptId, fixture.receipt.receiptId);
		assert.deepEqual(
			result.receipt.selectedProposalIds,
			[...selectedProposalIds].sort(),
		);
		assert.equal(result.receipt.standardChanges.length, 1);
		assert.equal(result.receipt.definitionChanges.length, 2);
		assert.equal(result.receipt.effectiveFrom, "next_protected_snapshot");
		assert.doesNotThrow(() => assertCustomCheckMutationReceipt(result.receipt));
		assert.throws(
			() =>
				assertCustomCheckMutationReceipt({
					...result.receipt,
					selectedProposalIds: [],
				}),
			/omitted selected Custom Check proposals|id does not match its content/,
		);

		const reviewRequest = createCustomCheckPolicyReviewRequest({
			mutationReceipt: result.receipt,
			proposedConfig: result.state,
		});
		const reviewReceipt = createCustomCheckPolicyReviewReceipt({
			request: reviewRequest,
			status: "pass",
			reviewer: {...authority(), actorId: "policy-reviewer", principalRef: "identity:policy-reviewer"},
			evidenceIds: [fixture.receipt.receiptId],
			summary: "Every selected source-to-Check mapping and unresolved clause was reviewed.",
			reviewedAt: "2026-08-05T11:05:00.000Z",
		});
		assert.equal(reviewRequest.protocolVersion, "3.0.0");
		assert.equal(CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.version, "3.0.0");
		assert.match(reviewReceipt.receiptId, /^custom-check-policy-review:/);

		const replay = await runtime.execute(mutationCommand, authority());
		assert.equal(replay.replayed, true);
		assert.equal(replay.receipt.receiptId, result.receipt.receiptId);
		assert.equal(store.writes(), 1);
	});

	it("allows Standard-only review while rejecting unknown, duplicate, stale, and tampered bundles", async () => {
		const fixture = await createCompletedDistillationFixture();
		const store = memoryStore();
		const protectedBase = createProtectedCustomCheckConfigSnapshot({
			protectedSourceHead: HEAD,
			projectConfigDigest: store.current().projectConfigDigest,
			userStandards: [],
			customChecks: [],
		});
		const runtime = createCustomCheckMutationRuntime({
			store,
			loadProtectedBase: async () => protectedBase,
			authorize: () => true,
			now: () => new Date("2026-08-05T11:00:00.000Z"),
		});
		assert.throws(
			() =>
				parseCustomCheckMutationCommand(
					command(store.current(), protectedBase, fixture.receipt, [
						`custom-check-proposal:${"f".repeat(64)}`,
					]),
				),
			/Unknown distilled Custom Check proposal/,
		);

		const standardOnly = await runtime.execute(
			command(store.current(), protectedBase, fixture.receipt, []),
			authority(),
		);
		assert.equal(standardOnly.changedUserStandards.length, 1);
		assert.equal(standardOnly.changedCustomChecks.length, 0);
		assert.equal(standardOnly.state.customChecks.length, 0);
		assert.equal(standardOnly.receipt.definitionChanges.length, 0);

		await assert.rejects(
			runtime.execute(
				command(store.current(), protectedBase, fixture.receipt, [], {
					idempotencyKey: "duplicate-service-policy-bundle",
				}),
				authority(),
			),
			/User Standard .* already exists/,
		);
		assert.throws(
			() =>
				assertCustomCheckMutationReceipt({
					...standardOnly.receipt,
					standardChanges: [
						{
							...standardOnly.receipt.standardChanges[0],
							after: {
								...standardOnly.receipt.standardChanges[0].after,
								standardDigest: `sha256:${"f".repeat(64)}`,
							},
						},
					],
				}),
			/changed User Standard identity|id does not match its content/,
		);
	});
});
