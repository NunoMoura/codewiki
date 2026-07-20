import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { changeContentDigest } from "../../src/changes/digest.ts";
import { normalizeChange } from "../../src/changes/normalize.ts";
import { parseChange } from "../../src/changes/schema.ts";
import { CHANGE_SCHEMA_VERSION } from "../../src/changes/types.ts";

const NOW = "2026-07-13T01:30:00.000Z";

function draftChange() {
	return {
		schemaVersion: CHANGE_SCHEMA_VERSION,
		id: "CHG-change-domain-test",
		revision: 1,
		status: "pending",
		intent: {
			question: "Should the Change domain be canonical?",
			currentState: "Change intent is mixed with Decision fields.",
			desiredState: "Change intent has its own lifecycle schema.",
			rationale: "Loop boundaries become explicit.",
			nonGoals: ["Do not add a fourth semantic loop."],
			alternatives: ["Keep Decision-shaped proposal state."],
		},
		classification: {
			kind: "migrate",
			type: "workflow_change",
			scope: "system",
			affectedLayers: ["change-domain", "decision-loop"],
			targetRefs: ["src/changes/types.ts"],
		},
		impact: {
			user: "Users can validate exact Change revisions.",
			maintainer: "Maintainers get one canonical schema.",
			compatibility: "Active proposal APIs intentionally break.",
		},
		knowledge: {
			topicRefs: ["kb:system/components/decision-loop.md"],
			propagationRefs: ["kb:system/components/decision-loop.md"],
		},
		outcome: {
			successSignals: ["The lifecycle is deterministic."],
			evidenceExpectations: ["Change domain tests pass."],
		},
		delivery: { constraints: [], planningQuestions: [] },
		evidence: {
			sourceRefs: ["kb:system/components/decision-loop.md"],
			proofRefs: ["tests/changes/change-domain.test.mjs"],
			sourceBehavior: "Decision owns mutable proposal shaping.",
			targetBehavior: "Decision consumes accepted Change bundles.",
		},
		safety: {
			risk: "medium",
			invariants: ["Only approved Changes enter Planning."],
			safetyBoundary: "Agents cannot accept Changes.",
			failureModes: ["A stale revision is accepted."],
			rollbackPlan: "Keep the pinned controller active.",
			negativeTestPlan: "Reject stale revisions and invalid transitions.",
			regressionPlan: "Run Change lifecycle tests.",
		},
		validation: {
			state: "draft",
			issues: [],
			assessments: [],
			recommendations: [],
		},
		estimates: {
			effort: "medium",
			workScale: "small",
		},
		provenance: {
			origin: "user",
			createdBy: "maintainer",
			createdAt: NOW,
			updatedAt: NOW,
			discoveredWhile: {
				traceId: "TRACE-change-domain-test",
				taskId: "WU-change-domain-test",
			},
		},
	};
}

function validChange() {
	const change = draftChange();
	change.validation = {
		...change.validation,
		state: "valid",
		validatedRevision: change.revision,
		validatedDigest: changeContentDigest(change),
	};
	return change;
}

function transitionedChange(status, validation = "valid") {
	const change = validation === "valid" ? validChange() : draftChange();
	change.validation.state = validation;
	change.status = status;
	change.lastStatusTransition = {
		changeId: change.id,
		revision: change.revision,
		contentDigest: changeContentDigest(change),
		from: "pending",
		to: status,
		changedBy: "maintainer",
		changedAt: NOW,
		reason: `Move Change to ${status}.`,
		...(status === "accepted"
			? { authority: "user", ref: "sha256:" + "a".repeat(64) }
			: {}),
	};
	return change;
}

describe("Change domain", () => {
	it("parses a closed canonical Change schema", () => {
		const parsed = parseChange(draftChange());
		assert.equal(parsed.id, "CHG-change-domain-test");
		assert.equal(parsed.status, "pending");
		assert.equal(parsed.validation.state, "draft");

		assert.throws(
			() => parseChange({ ...draftChange(), unsupported: true }),
			/change contains unknown field unsupported/,
		);
		assert.throws(
			() =>
				parseChange({
					...draftChange(),
					classification: {
						...draftChange().classification,
						kind: "decide",
					},
				}),
			/unsupported value decide/,
		);
	});

	it("normalizes text and set-like lists deterministically", () => {
		const input = draftChange();
		input.intent.question = "  Should the Change domain be canonical?  ";
		input.intent.nonGoals = [" Keep three loops. ", "Keep three loops."];
		input.evidence.sourceRefs = [
			" kb:system/components/decision-loop.md ",
			"kb:system/components/decision-loop.md",
		];
		const normalized = normalizeChange(input);
		assert.equal(
			normalized.intent.question,
			"Should the Change domain be canonical?",
		);
		assert.deepEqual(normalized.intent.nonGoals, ["Keep three loops."]);
		assert.deepEqual(normalized.evidence.sourceRefs, [
			"kb:system/components/decision-loop.md",
		]);
	});

	it("computes stable content digests independent of lifecycle metadata", () => {
		const draft = draftChange();
		const valid = validChange();
		const deferred = transitionedChange("deferred");
		assert.equal(changeContentDigest(draft), changeContentDigest(valid));
		assert.equal(changeContentDigest(valid), changeContentDigest(deferred));
		assert.match(changeContentDigest(draft), /^sha256:[a-f0-9]{64}$/);
	});

	it("keeps validation readiness independent from Change status", () => {
		assert.equal(parseChange(validChange()).status, "pending");
		assert.equal(
			parseChange(transitionedChange("deferred")).validation.state,
			"valid",
		);
		assert.equal(
			parseChange(transitionedChange("deferred", "stale")).status,
			"deferred",
		);
		assert.equal(
			parseChange(transitionedChange("rejected", "invalid")).status,
			"rejected",
		);
	});

	it("binds status transitions to the exact Change revision and digest", () => {
		const accepted = transitionedChange("accepted");
		assert.equal(parseChange(accepted).status, "accepted");

		assert.throws(
			() =>
				parseChange({
					...accepted,
					lastStatusTransition: {
						...accepted.lastStatusTransition,
						contentDigest: "sha256:" + "0".repeat(64),
					},
				}),
			/must bind the current content digest/,
		);
		assert.throws(
			() =>
				parseChange({
					...accepted,
					validation: { ...accepted.validation, state: "stale" },
				}),
			/accepted Change must be valid/,
		);
	});
});
