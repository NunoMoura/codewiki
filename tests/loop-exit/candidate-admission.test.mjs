import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDecisionCandidateContent } from "../../src/decision/candidate-content.ts";
import { parseImplementationCandidateContent } from "../../src/implementation/candidate-content.ts";
import { parsePlanningCandidateContent } from "../../src/planning/candidate-content.ts";

describe("Loop-owned candidate content admission", () => {
	it("keeps Decision authority and time outside candidate content", () => {
		assert.deepEqual(
			parseDecisionCandidateContent({
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
				parseDecisionCandidateContent({
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
});
