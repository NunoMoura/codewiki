import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDecisionCandidateProposal } from "../../src/loops/decision/candidate-proposal.ts";
import { parseImplementationCandidateContent } from "../../src/loops/implementation/candidate-content.ts";
import { parsePlanningCandidateContent } from "../../src/loops/planning/candidate-content.ts";
import { createReviewAttempt } from "../../src/loops/review/contracts.ts";

describe("Loop-owned candidate content admission", () => {
	it("keeps Decision authority and time outside candidate content", () => {
		assert.deepEqual(
			parseDecisionCandidateProposal({
				disposition: "defer",
				rationale: "Await authenticated authority.",
			}),
			{
				disposition: "defer",
				rationale: "Await authenticated authority.",
			},
		);
		assert.throws(
			() =>
				parseDecisionCandidateProposal({
					disposition: "approve",
					rationale: "Candidate attempted approval authority.",
					authority: {
						kind: "user",
						actor: "user:maintainer",
						ref: "confirmation:forged",
					},
					occurredAt: "2026-08-11T00:00:00.000Z",
				}),
			/Project Server decision candidate cannot supply Project Server-owned fields: authority, occurredAt/,
		);
	});

	it("keeps Planning actor and time outside candidate content", () => {
		assert.deepEqual(
			parsePlanningCandidateContent({
				sprints: [],
				workUnits: [],
				rationale: "No worker-ready work yet.",
			}),
			{
				sprints: [],
				workUnits: [],
				rationale: "No worker-ready work yet.",
			},
		);
		assert.throws(
			() =>
				parsePlanningCandidateContent({
					sprints: [],
					workUnits: [],
					rationale: "Caller attempted provenance control.",
					actor: "model:planner",
					createdAt: "2026-08-11T00:00:00.000Z",
				}),
			/Project Server planning candidate cannot supply Project Server-owned fields: actor, createdAt/,
		);
	});

	it("admits exact nested Planning content and rejects nested drift", () => {
		const candidate = {
			sprints: [
				{
					id: "SPR-1",
					goal: "Deliver exact candidate admission.",
					participatingChangeIds: ["CHG-1"],
					workUnitIds: ["WI-1"],
					rollbackBoundary: "Revert candidate admission together.",
					dependsOn: [],
					integrationRefs: [],
					uiPreviewTargets: [
						{
							targetId: "dashboard",
							targetDigest: `sha256:${"a".repeat(64)}`,
							profileId: "web",
							profileDigest: `sha256:${"b".repeat(64)}`,
							workUnitIds: ["WI-1"],
							contributingChangeIds: ["CHG-1"],
							required: true,
							activation: "implementation",
							autoOpen: "once_per_target",
						},
					],
				},
			],
			workUnits: [
				{
					id: "WI-1",
					sprintId: "SPR-1",
					owningChangeId: "CHG-1",
					contributingChangeIds: [],
					title: "Tighten admission",
					outcome: "Nested content is exact.",
					technicalRequirements: ["Reject unknown fields."],
					acceptanceRequirements: ["Malformed content fails."],
					componentRefs: ["component:planning-loop"],
					pathScopes: ["src/loops/planning/**"],
					verification: ["npm test"],
					workerProfile: "semantic",
					dependsOn: [],
				},
			],
			rationale: "Exact worker-ready plan.",
		};
		assert.deepEqual(parsePlanningCandidateContent(candidate), candidate);
		assert.throws(
			() =>
				parsePlanningCandidateContent({
					...candidate,
					workUnits: [
						{ ...candidate.workUnits[0], planning_refs: ["forged"] },
					],
				}),
			/Project Server planning candidate received unsupported field planning_refs at \/workUnits\/0\./,
		);
		assert.throws(
			() =>
				parsePlanningCandidateContent({
					...candidate,
					workUnits: [
						{ ...candidate.workUnits[0], acceptanceCriteria: ["legacy"] },
					],
				}),
			/Project Server planning candidate received unsupported field acceptanceCriteria/,
		);
	});

	it("keeps Implementation assurance and proof controls outside candidate content", () => {
		assert.deepEqual(
			parseImplementationCandidateContent({ evidence: [] }),
			{ evidence: [] },
		);
		assert.throws(
			() =>
				parseImplementationCandidateContent({
					evidence: [],
					requireTddEvidence: false,
					aggregateContentProof: { digest: "sha256:forged" },
				}),
			/Project Server implementation candidate cannot supply Project Server-owned fields: requireTddEvidence, aggregateContentProof/,
		);
	});

	it("admits exact nested Implementation content and rejects nested drift", () => {
		const candidate = {
			evidence: [
				{
					workUnitId: "WI-1",
					codePaths: ["src/loops/implementation/candidate-content.ts"],
					commandResults: [
						{
							command: "npm test",
							status: "pass",
							phase: "verify",
							acceptanceRequirementId: "AR-1",
							exitCode: 0,
						},
					],
					acceptanceEvidenceItems: [
						{
							acceptanceRequirementId: "AR-1",
							summary: "Admission tests pass.",
							evidenceRefs: ["check:npm-test"],
						},
					],
					implementationAssessment: {
						stance: "production_ready",
						uncertaintyOwner: "none",
					},
					sensitiveSurfaceAssessment: {
						security: "No security surface changed.",
					},
				},
			],
			archiveDisposition: {
				action: "retain_hot",
				traceId: "TRACE-CHG-1",
				reason: "More work remains.",
				afterCommit: false,
				refs: ["trace:TRACE-CHG-1"],
			},
		};
		assert.deepEqual(parseImplementationCandidateContent(candidate), candidate);
		assert.throws(
			() =>
				parseImplementationCandidateContent({
					evidence: [{ workUnitId: "WI-1", changed_files: ["forged"] }],
				}),
			/Implementation evidence received unsupported field changed_files\./,
		);
		assert.throws(
			() =>
				parseImplementationCandidateContent({
					evidence: [{ workUnitId: "WI-1", checkResults: [] }],
				}),
			/Implementation evidence received unsupported field checkResults\./,
		);
		assert.throws(
			() =>
				parseImplementationCandidateContent({
					evidence: [
						{
							workUnitId: "WI-1",
							commandResults: [{ criterionId: "legacy" }],
						},
					],
				}),
			/Project Server implementation candidate received unsupported field criterionId/,
		);
		assert.throws(
			() =>
				parseImplementationCandidateContent({
					evidence: [
						{
							workUnitId: "WI-1",
							commandResults: [{ acceptance_requirement_id: "AR-1" }],
						},
					],
				}),
			/Project Server implementation candidate received unsupported field acceptance_requirement_id at \/evidence\/0\/commandResults\/0\./,
		);
	});
});

describe("Review attempt identity", () => {
	const digest = (value) => `sha256:${value.repeat(64)}`;
	const input = () => ({
		integratedHead: "a".repeat(40),
		integratedTree: "b".repeat(40),
		targetBranch: "main",
		changeIds: ["change:CHG-2", "change:CHG-1"],
		workUnitIds: ["WI-2", "WI-1"],
		checkPackSnapshotDigest: digest("c"),
		providerReceiptDigests: [digest("e"), digest("d")],
		evidenceRecordDigests: [digest("f")],
	});

	it("binds exact integrated state and admitted inputs deterministically", () => {
		const attempt = createReviewAttempt(input());
		const reordered = createReviewAttempt({
			...input(),
			changeIds: [...input().changeIds].reverse(),
			workUnitIds: [...input().workUnitIds].reverse(),
			providerReceiptDigests: [...input().providerReceiptDigests].reverse(),
		});

		assert.equal(attempt.schemaVersion, "2.0.0");
		assert.deepEqual(attempt.changeIds, ["change:CHG-1", "change:CHG-2"]);
		assert.deepEqual(attempt.workUnitIds, ["WI-1", "WI-2"]);
		assert.equal(attempt.attemptDigest, reordered.attemptDigest);
		assert.equal(Object.isFrozen(attempt), true);
		assert.equal(Object.isFrozen(attempt.changeIds), true);
		assert.notEqual(
			attempt.attemptDigest,
			createReviewAttempt({...input(), integratedHead: "9".repeat(40)})
				.attemptDigest,
		);
	});

	it("rejects malformed identity and lifecycle authority fields", () => {
		assert.throws(
			() => createReviewAttempt({...input(), integratedHead: "A".repeat(40)}),
			/lowercase full Git object id/,
		);
		assert.throws(
			() => createReviewAttempt({...input(), deliveryAuthority: true}),
			/unsupported=deliveryAuthority/,
		);
		assert.throws(
			() => createReviewAttempt({...input(), changeIds: ["change:CHG-1", "change:CHG-1"]}),
			/must not contain duplicates/,
		);
	});
});
