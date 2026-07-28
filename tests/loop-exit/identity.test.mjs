import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	assertSha256Digest,
	canonicalJson,
	canonicalJsonDigest,
	createLoopCandidate,
	toCanonicalJsonValue,
} from "../../src/loop-exit/identity.ts";

describe("canonical Loop-exit identity", () => {
	it("sorts object keys recursively while preserving array order", () => {
		const left = {
			z: [{ b: 2, a: 1 }, "second"],
			a: { y: true, x: null },
		};
		const right = {
			a: { x: null, y: true },
			z: [{ a: 1, b: 2 }, "second"],
		};

		assert.equal(
			canonicalJson(left),
			'{"a":{"x":null,"y":true},"z":[{"a":1,"b":2},"second"]}',
		);
		assert.equal(canonicalJson(left), canonicalJson(right));
		assert.equal(canonicalJsonDigest(left), canonicalJsonDigest(right));
	});

	it("returns detached deeply frozen canonical values", () => {
		const source = { nested: { value: "before" }, list: [1, 2] };
		const canonical = toCanonicalJsonValue(source);
		source.nested.value = "after";
		source.list.push(3);

		assert.equal(
			JSON.stringify(canonical),
			'{"list":[1,2],"nested":{"value":"before"}}',
		);
		assert.equal(Object.isFrozen(canonical), true);
		assert.equal(Object.isFrozen(canonical.nested), true);
		assert.equal(Object.isFrozen(canonical.list), true);
		assert.throws(() => {
			canonical.nested.value = "mutated";
		}, TypeError);
	});

	it("produces lowercase sha256 identities and validates them", () => {
		const digest = canonicalJsonDigest({ candidate: "exact" });
		assert.match(digest, /^sha256:[0-9a-f]{64}$/);
		assert.equal(assertSha256Digest(digest, "candidateDigest"), digest);
		assert.throws(
			() => assertSha256Digest("sha256:ABC", "candidateDigest"),
			/candidateDigest must be a lowercase sha256 digest\./,
		);
	});

	it("rejects values JSON would silently omit or rewrite", () => {
		const cyclic = {};
		cyclic.self = cyclic;
		const sparse = [];
		sparse[1] = "value";
		const accessor = {};
		Object.defineProperty(accessor, "value", {
			enumerable: true,
			get: () => "computed",
		});

		for (const value of [
			undefined,
			{ omitted: undefined },
			[undefined],
			Number.NaN,
			Number.POSITIVE_INFINITY,
			1n,
			new Date("2026-01-01T00:00:00.000Z"),
			cyclic,
			sparse,
			accessor,
		]) {
			assert.throws(() => canonicalJson(value), /Cannot canonicalize JSON/);
		}
	});

	it("permits repeated non-cyclic references", () => {
		const shared = { value: 1 };
		assert.equal(
			canonicalJson({ left: shared, right: shared }),
			'{"left":{"value":1},"right":{"value":1}}',
		);
	});
});

const WORK_STATE_DIGEST = `sha256:${"a".repeat(64)}`;
const KNOWLEDGE_DIGEST = `sha256:${"b".repeat(64)}`;
const SOURCE_DIGEST = `sha256:${"c".repeat(64)}`;

describe("runtime-owned Loop candidate identity", () => {
	function candidateInput() {
		return {
			loop: "decision",
			schemaVersion: "1.0.0",
			content: {
				dispositionRequest: "approve",
				rationale: ["Intent is complete."],
			},
			observedBase: {
				workStateDigest: WORK_STATE_DIGEST,
				knowledgeSnapshotDigest: KNOWLEDGE_DIGEST,
				sourceSnapshotDigest: SOURCE_DIGEST,
				canonicalRefs: ["change:CHG-2@3", "change:CHG-1@2", "change:CHG-2@3"],
			},
		};
	}

	it("creates deterministic immutable identity from content and observed base", () => {
		const input = candidateInput();
		const candidate = createLoopCandidate(input);
		const equivalent = createLoopCandidate({
			...input,
			content: {
				rationale: ["Intent is complete."],
				dispositionRequest: "approve",
			},
			observedBase: {
				...input.observedBase,
				canonicalRefs: ["change:CHG-1@2", "change:CHG-2@3"],
			},
		});

		assert.match(candidate.id, /^candidate:decision:[0-9a-f]{64}$/);
		assert.match(candidate.digest, /^sha256:[0-9a-f]{64}$/);
		assert.equal(candidate.id, equivalent.id);
		assert.equal(candidate.digest, equivalent.digest);
		assert.deepEqual(candidate.observedBase.canonicalRefs, [
			"change:CHG-1@2",
			"change:CHG-2@3",
		]);
		assert.equal(Object.isFrozen(candidate), true);
		assert.equal(Object.isFrozen(candidate.content), true);
		assert.equal(Object.isFrozen(candidate.observedBase), true);
	});

	it("changes identity when content or guarded base changes", () => {
		const input = candidateInput();
		const original = createLoopCandidate(input);
		const changedContent = createLoopCandidate({
			...input,
			content: { ...input.content, dispositionRequest: "defer" },
		});
		const changedBase = createLoopCandidate({
			...input,
			observedBase: {
				...input.observedBase,
				workStateDigest: `sha256:${"d".repeat(64)}`,
			},
		});

		assert.notEqual(original.digest, changedContent.digest);
		assert.notEqual(original.digest, changedBase.digest);
	});

	it("rejects caller identity and unsupported observed-base authority", () => {
		assert.throws(
			() => createLoopCandidate({ ...candidateInput(), id: "candidate:forged" }),
			/Candidate input contains unsupported field id/,
		);
		assert.throws(
			() =>
				createLoopCandidate({
					...candidateInput(),
					observedBase: {
						...candidateInput().observedBase,
						actor: "caller",
					},
				}),
			/Candidate observedBase contains unsupported field actor/,
		);
		assert.throws(
			() =>
				createLoopCandidate({
					...candidateInput(),
					observedBase: {
						...candidateInput().observedBase,
						workStateDigest: "sha256:forged",
					},
				}),
			/must be a lowercase sha256 digest/,
		);
	});
});
