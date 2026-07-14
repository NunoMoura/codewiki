import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLabChangeFeedback } from "../../lab/runner/change-proposal.ts";

describe("lab Change feedback adapter", () => {
	it("maps bounded candidate findings to data-only pending intake", () => {
		const feedback = createLabChangeFeedback({
			candidateId: "candidate-quality-pack-01",
			loop: "implementation",
			summary: "Candidate catches missing content proof.",
			currentState: "The production pack misses one content-proof failure.",
			desiredState: "The reviewed production pack catches that failure.",
			rationale: "Confirmation evidence shows a bounded improvement.",
			targetRefs: ["src/implementation/review/packs.ts"],
			evidenceRefs: ["lab/runner/quality-pack.ts"],
		});
		assert.equal(feedback.source, "lab");
		assert.equal(feedback.sourceId, "candidate-quality-pack-01");
		assert.equal(feedback.scope, "system");
		assert.equal(feedback.type, "behavior_change");
		assert.deepEqual(feedback.nonGoals, [
			"Do not merge, publish, advance controllers, or grant unattended authority.",
		]);
		assert.equal("status" in feedback, false);
		assert.equal("validation" in feedback, false);
	});
});
