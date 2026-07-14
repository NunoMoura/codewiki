import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findFeedbackDuplicate } from "../../src/changes/deduplication.ts";
import { createChangeRecord } from "../../src/changes/records.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";

function record(id, options = {}) {
	const change = acceptedChangeFixture({
		id,
		question: options.question || "Should runtime budget feedback become a Change?",
		currentState: options.currentState || "Budget feedback is retained only in runtime logs.",
		desiredState: options.desiredState || "Budget feedback becomes one reviewable pending Change.",
		targetRefs: options.targetRefs || ["src/runtime/execution-policy.ts"],
		sourceRefs: options.sourceRefs || ["trace:TRACE-budget:implementation:iteration:1"],
	});
	change.status = options.status || "pending";
	return createChangeRecord(change);
}

describe("feedback Change deduplication", () => {
	it("prefers exact source identity and deterministic semantic matches", () => {
		const candidate = record("CHG-candidate").change;
		const exact = findFeedbackDuplicate(
			[record("CHG-zeta"), record("CHG-alpha")],
			candidate,
		);
		assert.equal(exact.record.change.id, "CHG-alpha");
		assert.equal(exact.method, "source_ref");

		candidate.evidence.sourceRefs = ["trace:TRACE-other:implementation:iteration:1"];
		const semantic = findFeedbackDuplicate([record("CHG-existing")], candidate);
		assert.equal(semantic.record.change.id, "CHG-existing");
		assert.equal(semantic.method, "semantic");
		assert.equal(semantic.score >= 0.72, true);
	});

	it("does not reinforce accepted or materially different Changes", () => {
		const candidate = record("CHG-candidate").change;
		const accepted = record("CHG-accepted");
		accepted.change.status = "accepted";
		assert.equal(findFeedbackDuplicate([accepted], candidate), undefined);
		assert.equal(
			findFeedbackDuplicate(
				[record("CHG-unrelated", {
					question: "Should documentation colors change?",
					currentState: "The logo is blue.",
					desiredState: "The logo is green.",
					targetRefs: ["README.md"],
					sourceRefs: ["README.md"],
				})],
				candidate,
			),
			undefined,
		);
	});
});
