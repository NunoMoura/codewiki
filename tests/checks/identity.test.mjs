import test from "node:test";
import assert from "node:assert/strict";
import {
	canonicalJson,
	checkSubjectFromCandidate,
	createCheckSubject,
	createLoopCandidate,
} from "../../src/checks/identity.ts";
import {digest} from "../helpers/checks.mjs";

function candidate(overrides = {}) {
	return createLoopCandidate({
		loop: overrides.loop ?? "decision",
		schemaVersion: "1.0.0",
		content: overrides.content ?? {answer: "approve"},
		observedBase: {
			workStateDigest: digest({work: 1}),
			knowledgeSnapshotDigest: digest({knowledge: 1}),
			canonicalRefs: ["change:one"],
		},
	});
}

test("Loop Candidate identity remains canonical for work-producing Loops", () => {
	const first = candidate();
	const second = candidate();
	assert.equal(first.digest, second.digest);
	assert.equal(first.id, second.id);
	assert.equal(canonicalJson(first), canonicalJson(second));
	assert.match(first.id, /^candidate:decision:[a-f0-9]{64}$/);
	assert.throws(() => candidate({loop: "review"}), /loop review is invalid/);
});

test("Candidate becomes exact Check subject without changing Candidate bytes", () => {
	const value = candidate();
	const before = canonicalJson(value);
	const subject = checkSubjectFromCandidate(value);
	assert.equal(subject.stage, "decision");
	assert.equal(subject.id, value.id);
	assert.equal(subject.digest, value.digest);
	assert.equal(canonicalJson(value), before);
});

test("Review and other Gate subjects use deterministic stage identity", () => {
	const first = createCheckSubject({
		stage: "review",
		id: "review-attempt:one",
		schemaVersion: "1.0.0",
		content: {integratedHead: "a".repeat(40)},
	});
	const second = createCheckSubject({
		stage: "review",
		id: "review-attempt:one",
		schemaVersion: "1.0.0",
		content: {integratedHead: "a".repeat(40)},
	});
	assert.deepEqual(first, second);
	assert.equal(first.stage, "review");
	assert.throws(
		() => createCheckSubject({stage: "verification", id: "x", schemaVersion: "1.0.0", content: {}}),
		/stage is invalid/,
	);
});
