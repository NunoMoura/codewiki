import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	hasAuthoritativeEvidenceRefs,
	isWorkerObservationRef,
} from "../../src/implementation/worker-observation-authority.ts";

describe("worker observation authority", () => {
	it("classifies runtime observations as non-authoritative", () => {
		assert.equal(isWorkerObservationRef("runtime-observation:worker-001"), true);
		assert.equal(
			hasAuthoritativeEvidenceRefs(["runtime-observation:worker-001"]),
			false,
		);
		assert.equal(
			hasAuthoritativeEvidenceRefs([
				"tests/runtime/worker-observation.test.mjs",
				"runtime-observation:worker-001",
			]),
			false,
		);
	});

	it("preserves ordinary trace and repository evidence refs", () => {
		assert.equal(
			hasAuthoritativeEvidenceRefs([
				"tests/runtime/worker-observation.test.mjs",
			]),
			true,
		);
		assert.equal(
			hasAuthoritativeEvidenceRefs([
				"trace:TRACE-worker:implementation:iteration:1",
			]),
			true,
		);
	});
});
