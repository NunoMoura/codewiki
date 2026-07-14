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
		assert.equal(pin.tag, "codewiki-self-dogfood-baseline-v0.3.7");
		assert.equal(pin.source.commit, "f3955ec3caa09206459e91507fc6622fb1e392cf");
		assert.equal(pin.source.tree, "120326cceeabbfef3cc542043db083586b741829");
		assert.equal(pin.package.bytes, 736158);
		assert.equal(
			pin.package.sha256,
			"83698ea3fe491bdab6220bbda237809a7897f9ffdff95ccdacaa4cbe09948c2b",
		);
		assert.equal(
			pin.approval.reviewRef,
			"chat:2026-07-14-controller-v0.3.7-approved",
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
