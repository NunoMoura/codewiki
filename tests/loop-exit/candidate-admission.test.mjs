import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDecisionCandidateProposal } from "../../src/decision/candidate-proposal.ts";
import { parseImplementationCandidateContent } from "../../src/implementation/candidate-content.ts";
import { parsePlanningCandidateContent } from "../../src/planning/candidate-content.ts";

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
			/Runtime decision candidate cannot supply runtime-owned fields: authority, occurredAt/,
		);
	});

	it("keeps Planning actor and time outside candidate content", () => {
		assert.deepEqual(
			parsePlanningCandidateContent({
				sprints: [],
				workItems: [],
				rationale: "No worker-ready work yet.",
			}),
			{
				sprints: [],
				workItems: [],
				rationale: "No worker-ready work yet.",
			},
		);
		assert.throws(
			() =>
				parsePlanningCandidateContent({
					sprints: [],
					workItems: [],
					rationale: "Caller attempted provenance control.",
					actor: "model:planner",
					createdAt: "2026-08-11T00:00:00.000Z",
				}),
			/Runtime planning candidate cannot supply runtime-owned fields: actor, createdAt/,
		);
	});

	it("admits exact nested Planning content and rejects nested drift", () => {
		const candidate = {
			sprints: [
				{
					id: "SPR-1",
					goal: "Deliver exact candidate admission.",
					participatingChangeIds: ["CHG-1"],
					workItemIds: ["WI-1"],
					rollbackBoundary: "Revert candidate admission together.",
					dependsOn: [],
					integrationRefs: [],
					uiPreviewTargets: [
						{
							targetId: "dashboard",
							targetDigest: `sha256:${"a".repeat(64)}`,
							profileId: "web",
							profileDigest: `sha256:${"b".repeat(64)}`,
							workItemIds: ["WI-1"],
							contributingChangeIds: ["CHG-1"],
							required: true,
							activation: "implementation",
							autoOpen: "once_per_target",
						},
					],
				},
			],
			workItems: [
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
					pathScopes: ["src/planning/**"],
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
					workItems: [
						{ ...candidate.workItems[0], planning_refs: ["forged"] },
					],
				}),
			/Runtime planning candidate received unsupported field planning_refs at \/workItems\/0\./,
		);
		assert.throws(
			() =>
				parsePlanningCandidateContent({
					...candidate,
					workItems: [
						{ ...candidate.workItems[0], acceptanceCriteria: ["legacy"] },
					],
				}),
			/Runtime planning candidate received unsupported field acceptanceCriteria/,
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
			/Runtime implementation candidate cannot supply runtime-owned fields: requireTddEvidence, aggregateContentProof/,
		);
	});

	it("admits exact nested Implementation content and rejects nested drift", () => {
		const candidate = {
			evidence: [
				{
					workItemId: "WI-1",
					codePaths: ["src/implementation/candidate-content.ts"],
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
					evidence: [{ workItemId: "WI-1", changed_files: ["forged"] }],
				}),
			/Implementation evidence received unsupported field changed_files\./,
		);
		assert.throws(
			() =>
				parseImplementationCandidateContent({
					evidence: [{ workItemId: "WI-1", checkResults: [] }],
				}),
			/Implementation evidence received unsupported field checkResults\./,
		);
		assert.throws(
			() =>
				parseImplementationCandidateContent({
					evidence: [
						{
							workItemId: "WI-1",
							commandResults: [{ criterionId: "legacy" }],
						},
					],
				}),
			/Runtime implementation candidate received unsupported field criterionId/,
		);
		assert.throws(
			() =>
				parseImplementationCandidateContent({
					evidence: [
						{
							workItemId: "WI-1",
							commandResults: [{ acceptance_requirement_id: "AR-1" }],
						},
					],
				}),
			/Runtime implementation candidate received unsupported field acceptance_requirement_id at \/evidence\/0\/commandResults\/0\./,
		);
	});
});
