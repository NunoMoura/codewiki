import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	assertValidCanonicalChangeOperation,
	createInitialProjectWorkState,
	operationPayload,
} from "../../src/change-trace/index.ts";
import {createChangeIntakeRuntime} from "../../src/runtime/change-intake.ts";
import {allowAllReplayPolicy} from "../helpers/change-trace-replay-v1.mjs";
import {
	authorityBinding,
	digest,
} from "../helpers/change-trace-v1.mjs";
import {
	buildOpenChangeRecords,
	createGitProposal,
	createTwoCloneFixture,
	pushGitProposal,
} from "../helpers/git-state-v1.mjs";

const REPOSITORY_IDENTITY = digest("a");
const AUTHENTICATION_EVIDENCE_ID = "EVD-intake-authenticated-source";

function material(submissionId, overrides = {}) {
	return {
		protocolId: "codewiki.change-intake-material",
		protocolVersion: "1.0.0",
		materialType: "user_suggestion",
		binding: {channel: "api", submissionId},
		content: {
			summary: "Checkout reports the wrong total",
			observedBehavior: "Discounted items use the undiscounted subtotal.",
			desiredBehavior: "Checkout uses the discounted subtotal.",
			affectedRefs: ["src/checkout/total.ts", "kb:product/checkout"],
			sourceRefs: ["trace:external-suggestion:01"],
			claimedCategory: "behavior",
			claimedSeverity: "medium",
			claimedConfidence: "high",
			...overrides,
		},
	};
}

function intakeAuthority(overrides = {}) {
	return authorityBinding({
		authenticationEvidenceId: AUTHENTICATION_EVIDENCE_ID,
		...overrides,
	});
}

async function seedRemote(fixture, changeId = "CHG-intake-seed") {
	const initial = createInitialProjectWorkState();
	const seeded = await createGitProposal(
		fixture.cloneA,
		initial,
		buildOpenChangeRecords(initial, changeId),
	);
	assert.equal(
		(await pushGitProposal(fixture.cloneA, seeded.proposal)).status,
		"accepted",
	);
	return seeded;
}

function projectSnapshotFor(state) {
	return {
		sourceHead: state.observedBase.sourceHead,
		knowledgeDigest: state.observedBase.knowledgeDigest,
		configDigest: state.observedBase.configDigest,
		policyDigest: state.observedBase.policyDigest,
	};
}

function runtimeFor(fixture, seeded, overrides = {}) {
	return createChangeIntakeRuntime({
		repoRoot: fixture.cloneB,
		remote: "origin",
		repositoryIdentity: REPOSITORY_IDENTITY,
		currentProject: () => projectSnapshotFor(seeded.projected),
		replayPolicy: allowAllReplayPolicy,
		authenticateSource: ({authorityBinding: authority}) => ({
			authenticated: true,
			authenticationEvidenceId: authority.authenticationEvidenceId,
		}),
		now: () => new Date("2026-08-01T12:00:00.000Z"),
		...overrides,
	});
}

describe("Runtime-owned Change intake admission", () => {
	it("creates, verifies, replays, and deterministically deduplicates material", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const seeded = await seedRemote(fixture);
			const runtime = runtimeFor(fixture, seeded);
			const authority = intakeAuthority();
			const created = await runtime.execute({
				material: material("suggestion:01"),
				authorityBinding: authority,
				expectedStateHead: seeded.proposal.stateCommit,
			});
			assert.equal(created.action, "created");
			assert.equal(created.routeKind, "new_change");
			assert.equal(created.routeReason, "independent_material");
			assert.equal(created.replayed, false);
			assert.match(created.changeId, /^CHG-intake-user-suggestion-/u);
			const acceptedChange = created.observation.workState.changes.find(
				(change) => change.changeId === created.changeId,
			);
			assert.ok(acceptedChange);
			assert.deepEqual(
				acceptedChange.operations.map((operation) => operation.body.kind),
				["trace.opened", "change.proposed"],
			);
			assert.equal(acceptedChange.currentRevision.content.risk, "unknown");
			assert.equal(
				acceptedChange.currentRevision.content.defectProfile.severity,
				"medium",
			);
			assert.equal(
				acceptedChange.currentRevision.content.defectProfile.likelihood,
				"unknown",
			);
			assert.equal(
				acceptedChange.currentRevision.content.defectProfile.exposure,
				"unknown",
			);
			assert.equal(
				acceptedChange.currentRevision.content.defectProfile.provenance.authority,
				"asserted",
			);
			assert.equal(
				"priority" in acceptedChange.currentRevision.content.defectProfile,
				false,
			);
			assert.match(
				acceptedChange.currentRevision.content.constraints.join("\n"),
				/Source claimed severity: medium/,
			);
			const proposedOperation = acceptedChange.operations.find(
				(operation) => operation.body.kind === "change.proposed",
			);
			const proposedPayload = operationPayload(
				proposedOperation,
				"change.proposed",
			);
			assert.equal(proposedOperation.body.protocol.version, "1.2.0");
			assert.equal(
				proposedPayload.intakeMaterial.digest,
				created.materialDigest,
			);
			assert.equal(
				proposedPayload.intakeMaterial.artifact.materialType,
				"user_suggestion",
			);
			const tampered = structuredClone(proposedOperation);
			tampered.body.payload.intakeMaterial.artifact.content.summary = "Tampered";
			assert.throws(
				() => assertValidCanonicalChangeOperation(tampered),
				/inline material is not canonically normalized|inline material digest mismatch/,
			);

			const replayed = await runtime.execute({
				material: material("suggestion:01"),
				authorityBinding: authority,
				expectedStateHead: seeded.proposal.stateCommit,
			});
			assert.equal(replayed.replayed, true);
			assert.equal(replayed.intakeOperationId, created.intakeOperationId);
			assert.equal(replayed.stateHead, created.stateHead);

			const semanticDuplicate = await runtime.execute({
				material: material("suggestion:02"),
				authorityBinding: authority,
				expectedStateHead: created.stateHead,
			});
			assert.equal(semanticDuplicate.action, "reinforced");
			assert.equal(semanticDuplicate.changeId, created.changeId);
			assert.equal(semanticDuplicate.routeReason, "semantic_duplicate");

			const sourceDuplicate = await runtime.execute({
				material: material("suggestion:01", {
					summary: "Checkout total remains incorrect",
					observedBehavior: "A second observation confirms the subtotal drift.",
				}),
				authorityBinding: authority,
				expectedStateHead: semanticDuplicate.stateHead,
			});
			assert.equal(sourceDuplicate.action, "reinforced");
			assert.equal(sourceDuplicate.changeId, created.changeId);
			assert.equal(sourceDuplicate.routeReason, "source_identity");
			assert.equal(
				sourceDuplicate.observation.workState.acceptedOperationIds.includes(
					sourceDuplicate.intakeOperationId,
				),
				true,
			);
		} finally {
			await fixture.cleanup();
		}
	});

	it("routes authenticated current-scope feedback and linked independent discovery", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const seeded = await seedRemote(fixture, "CHG-intake-correlation-parent");
			const parent = seeded.projected.changes[0];
			let scope = "independent_change";
			const runtime = runtimeFor(fixture, seeded, {
				correlateSource: () => ({
					scope,
					changeId: parent.changeId,
					revisionId: parent.currentRevision.revisionId,
				}),
			});
			const authority = intakeAuthority();
			const independent = await runtime.execute({
				material: material("suggestion:independent", {
					summary: "Independent tax display discrepancy",
					observedBehavior: "Receipt display omits jurisdiction detail.",
					desiredBehavior: "Receipt displays jurisdiction detail.",
				}),
				authorityBinding: authority,
				expectedStateHead: seeded.proposal.stateCommit,
			});
			assert.equal(independent.routeReason, "independent_discovery");
			assert.ok(independent.relationshipOperationId);
			const discovered = independent.observation.workState.changes.find(
				(change) => change.changeId === independent.changeId,
			);
			const relationshipOperation = discovered.operations.find(
				(operation) =>
					operation.operationId === independent.relationshipOperationId,
			);
			const relationship = operationPayload(
				relationshipOperation,
				"change.relationship_recorded",
			).relationship;
			assert.equal(relationship.type, "discovered_from");
			assert.equal(relationship.targetChangeId, parent.changeId);
			const replayed = await runtime.execute({
				material: material("suggestion:independent", {
					summary: "Independent tax display discrepancy",
					observedBehavior: "Receipt display omits jurisdiction detail.",
					desiredBehavior: "Receipt displays jurisdiction detail.",
				}),
				authorityBinding: authority,
				expectedStateHead: seeded.proposal.stateCommit,
			});
			assert.equal(replayed.replayed, true);
			assert.equal(
				replayed.relationshipOperationId,
				independent.relationshipOperationId,
			);

			scope = "current_change";
			const current = await runtime.execute({
				material: material("suggestion:current", {
					summary: "Current Change requires clarification",
					observedBehavior: "Accepted wording leaves one outcome ambiguous.",
					desiredBehavior: "Decision clarifies the current revision.",
				}),
				authorityBinding: authority,
				expectedStateHead: independent.stateHead,
			});
			assert.equal(current.action, "reinforced");
			assert.equal(current.changeId, parent.changeId);
			assert.equal(current.routeReason, "authenticated_correlation");
		} finally {
			await fixture.cleanup();
		}
	});

	it("fails closed on authentication, correlation, and expected-head drift", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const seeded = await seedRemote(fixture, "CHG-intake-guards");
			const authority = intakeAuthority();
			const unauthenticated = runtimeFor(fixture, seeded, {
				authenticateSource: () => ({
					authenticated: false,
					authenticationEvidenceId: AUTHENTICATION_EVIDENCE_ID,
				}),
			});
			await assert.rejects(
				unauthenticated.execute({
					material: material("suggestion:unauthenticated"),
					authorityBinding: authority,
					expectedStateHead: seeded.proposal.stateCommit,
				}),
				/source authentication failed/,
			);

			const runtime = runtimeFor(fixture, seeded);
			const accepted = await runtime.execute({
				material: material("suggestion:accepted"),
				authorityBinding: authority,
				expectedStateHead: seeded.proposal.stateCommit,
			});
			await assert.rejects(
				runtime.execute({
					material: material("suggestion:stale", {
						summary: "A distinct stale request",
						observedBehavior: "State changed before admission.",
					}),
					authorityBinding: authority,
					expectedStateHead: seeded.proposal.stateCommit,
				}),
				/state head is stale/,
			);

			const badCorrelation = runtimeFor(fixture, seeded, {
				correlateSource: () => ({
					scope: "current_change",
					changeId: "CHG-absent",
					revisionId: digest("f"),
				}),
			});
			await assert.rejects(
				badCorrelation.execute({
					material: material("suggestion:bad-correlation", {
						summary: "Correlation must resolve",
						observedBehavior: "Provider correlation names absent state.",
					}),
					authorityBinding: authority,
					expectedStateHead: accepted.stateHead,
				}),
				/does not identify an accepted Change revision/,
			);
			await assert.rejects(
				runtime.execute({
					material: material("suggestion:authority-expansion"),
					authorityBinding: authority,
					expectedStateHead: accepted.stateHead,
					priority: "critical",
				}),
				/Change intake command received unsupported field priority/,
			);
			await assert.rejects(
				runtime.execute({
					material: {
						source: "runtime",
						sourceId: "legacy",
						summary: "Legacy feedback",
					},
					authorityBinding: authority,
					expectedStateHead: accepted.stateHead,
				}),
				/unsupported field source/,
			);
		} finally {
			await fixture.cleanup();
		}
	});
});
