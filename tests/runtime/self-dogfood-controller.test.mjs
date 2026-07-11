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
		assert.equal(pin.source.commit, "794bba6dfe7b1a902d75cae85b5697dfcf479a67");
		assert.equal(
			pin.package.sha256,
			"1d5f46c72f1a3d5710d2c3e1fd1dfedf46aaa4aded0ad36538b36ee403804628",
		);
	});

	it("rejects unknown fields and malformed pins", () => {
		assert.throws(
			() => parseSelfDogfoodControllerPin({ ...controllerPin(), mutable: true }),
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
