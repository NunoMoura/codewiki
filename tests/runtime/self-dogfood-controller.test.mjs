import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
	parseSelfDogfoodControllerPin,
	SELF_DOGFOOD_CONTROLLER_SCHEMA,
} from "../../src/project/self-dogfood-controller.ts";

function controllerPin() {
	return {
		schemaVersion: SELF_DOGFOOD_CONTROLLER_SCHEMA,
		tag: "codewiki-self-dogfood-baseline-v0.3.0",
		source: {
			commit: "a".repeat(40),
			tree: "b".repeat(40),
		},
		package: {
			name: "codewiki",
			version: "0.3.0",
			file: "codewiki-0.3.0.tgz",
			bytes: 673696,
			sha256: "c".repeat(64),
		},
		approval: {
			reviewRef: "review:baseline-v0.3.0",
			approvedBy: "release-reviewer",
			approvedAt: "2026-07-10T23:49:00.239Z",
		},
	};
}

describe("self-dogfood controller pin", () => {
	it("accepts the tracked reviewed controller pin", () => {
		const pin = parseSelfDogfoodControllerPin(
			JSON.parse(readFileSync(".pi/codewiki-controller.json", "utf8")),
		);
		assert.equal(pin.tag, "codewiki-self-dogfood-baseline-v0.3.2");
		assert.equal(
			pin.source.commit,
			"ce7d031616a1031329e62a331780b04b34d07fb7",
		);
		assert.equal(
			pin.source.tree,
			"1a1a8d5eec58a14766dae53b916a10971889abb6",
		);
		assert.equal(pin.package.bytes, 680395);
		assert.equal(
			pin.package.sha256,
			"d0a739ab3d76aa0a841ccf010bb2b7638ed729d168b39f59ead92130ff02ff03",
		);
		assert.equal(
			pin.approval.reviewRef,
			"chat:2026-07-12-live-dashboard-requirement",
		);
	});

	it("rejects unknown fields and malformed pins", () => {
		assert.throws(
			() =>
				parseSelfDogfoodControllerPin({ ...controllerPin(), mutable: true }),
			/Unknown controller key: controller\.mutable/,
		);
		const pin = controllerPin();
		pin.package.sha256 = "not-a-digest";
		assert.throws(
			() => parseSelfDogfoodControllerPin(pin),
			/controller\.package\.sha256 has an invalid format/,
		);
	});
});
