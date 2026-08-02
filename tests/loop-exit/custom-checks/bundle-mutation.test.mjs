import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	assertCustomCheckMutationReceipt,
	CUSTOM_CHECK_MUTATION_PROTOCOL,
	CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL,
	createCustomCodeCapabilitySnapshot,
	createCustomCheckConfigState,
	createCustomCheckMutationRuntime,
	createCustomCheckPolicyReviewReceipt,
	createCustomCheckPolicyReviewRequest,
	createProtectedCustomCheckConfigSnapshot,
	parseCustomCheckMutationCommand,
} from "../../../src/loop-exit/custom-checks/index.ts";
import {canonicalJsonDigest} from "../../../src/utils/canonical-json.ts";
import {
	createCompletedDistillationFixture,
	createCompletedResourceDistillationFixture,
} from "./distillation-fixture.mjs";

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
		codeTemplateSelections: [],
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

		assert.equal(CUSTOM_CHECK_MUTATION_PROTOCOL.version, "4.0.0");
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
		assert.equal(reviewRequest.protocolVersion, "4.0.0");
		assert.equal(CUSTOM_CHECK_POLICY_REVIEW_PROTOCOL.version, "4.0.0");
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

	it("binds approved Custom Code templates and exact activation capability", async () => {
		const fixture = await createCompletedResourceDistillationFixture();
		const proposal = fixture.bundle.customCodeCheckProposals[0];
		const store = memoryStore();
		const protectedBase = createProtectedCustomCheckConfigSnapshot({
			protectedSourceHead: HEAD,
			projectConfigDigest: store.current().projectConfigDigest,
			userStandards: [],
			customChecks: [],
		});
		const createRuntime = createCustomCheckMutationRuntime({
			store,
			loadProtectedBase: async () => protectedBase,
			authorize: () => true,
			now: () => new Date("2026-08-05T11:00:00.000Z"),
		});
		const selectedProposalIds = [proposal.proposalId];
		const codeTemplateSelections = [
			{
				proposalId: proposal.proposalId,
				templateBinding: {
					templateId: "resource_usage_limit",
					parameters: {
						metric: "model_tokens",
						scope: "decision_attempt",
						maximum: 1_000,
					},
				},
			},
		];
		const createCommand = command(
			store.current(),
			protectedBase,
			fixture.receipt,
			selectedProposalIds,
			{codeTemplateSelections},
		);
		const parsed = parseCustomCheckMutationCommand(createCommand);
		assert.match(
			parsed.codeTemplateSelections[0].templateBinding.bindingDigest,
			/^sha256:[0-9a-f]{64}$/,
		);
		const created = await createRuntime.execute(createCommand, authority());
		assert.equal(created.changedCustomChecks.length, 1);
		assert.equal(created.changedCustomChecks[0].evaluator, "code");
		assert.equal(
			created.changedCustomChecks[0].repairGuidance,
			"Reduce bounded Decision context before retrying.",
		);
		assert.deepEqual(created.changedCustomChecks[0].knowledgeRefs, [
			"knowledge:runtime-resource-policy",
		]);
		assert.equal(created.changedCustomChecks[0].lifecycle, "draft");
		assert.equal(created.receipt.codeTemplateSelections.length, 1);
		assert.equal(created.receipt.activationCapabilitySnapshotDigest, null);
		assert.doesNotThrow(() => assertCustomCheckMutationReceipt(created.receipt));

		assert.throws(
			() =>
				parseCustomCheckMutationCommand({
					...createCommand,
					codeTemplateSelections: [],
				}),
			/Every selected distilled Custom Code Check proposal requires one approved code template selection/,
		);
		assert.throws(
			() =>
				parseCustomCheckMutationCommand({
					...createCommand,
					codeTemplateSelections: [
						{
							...codeTemplateSelections[0],
							templateBinding: {
								templateId: "resource_usage_limit",
								parameters: {
									metric: "model_tokens",
									scope: "planning_attempt",
									maximum: 1_000,
								},
							},
						},
					],
				}),
			/Resource usage scope planning_attempt requires appliesWhen.loops planning/,
		);

		const activationCommand = {
			protocolId: CUSTOM_CHECK_MUTATION_PROTOCOL.id,
			protocolVersion: CUSTOM_CHECK_MUTATION_PROTOCOL.version,
			action: "activate",
			idempotencyKey: "activate-resource-policy",
			expectedConfigDigest: store.current().projectConfigDigest,
			expectedProtectedSourceHead: protectedBase.protectedSourceHead,
			expectedProtectedConfigDigest: protectedBase.projectConfigDigest,
			customCheckId: created.changedCustomChecks[0].customCheckId,
		};
		await assert.rejects(
			createRuntime.execute(activationCommand, authority()),
			/requires an executor capability snapshot before activation/,
		);
		const capabilitySnapshot = createCustomCodeCapabilitySnapshot({
			observedAt: "2026-08-05T11:01:00.000Z",
			environmentDigest: `sha256:${"3".repeat(64)}`,
			capabilities: [
				{
					id: "codewiki.model-usage-meter",
					version: "1.0.0",
					configurationDigest: `sha256:${"4".repeat(64)}`,
					metrics: ["model_tokens"],
					scopes: ["decision_attempt"],
					enforcement: ["preflight", "meter", "cancellation"],
				},
			],
		});
		const activationRuntime = createCustomCheckMutationRuntime({
			store,
			loadProtectedBase: async () => protectedBase,
			loadCustomCodeCapabilitySnapshot: async () => capabilitySnapshot,
			authorize(request) {
				assert.equal(
					request.capabilitySnapshot.snapshotDigest,
					capabilitySnapshot.snapshotDigest,
				);
				return true;
			},
			now: () => new Date("2026-08-05T11:02:00.000Z"),
		});
		const activated = await activationRuntime.execute(
			activationCommand,
			authority(),
		);
		assert.equal(activated.changedCustomChecks[0].lifecycle, "active");
		assert.equal(
			activated.receipt.activationCapabilitySnapshotDigest,
			capabilitySnapshot.snapshotDigest,
		);
		assert.doesNotThrow(() => assertCustomCheckMutationReceipt(activated.receipt));
		const reviewRequest = createCustomCheckPolicyReviewRequest({
			mutationReceipt: activated.receipt,
			proposedConfig: activated.state,
		});
		assert.equal(reviewRequest.protocolVersion, "4.0.0");
		assert.equal(
			reviewRequest.mutationReceipt.activationCapabilitySnapshotDigest,
			capabilitySnapshot.snapshotDigest,
		);
		const reviewReceipt = createCustomCheckPolicyReviewReceipt({
			request: reviewRequest,
			status: "pass",
			reviewer: authority(),
			evidenceIds: ["evidence:policy-review:resource-limit"],
			summary: "Exact resource template and capability binding are approved.",
			reviewedAt: "2026-08-05T11:03:00.000Z",
		});
		assert.equal(reviewReceipt.requestDigest, reviewRequest.requestDigest);
	});
});
