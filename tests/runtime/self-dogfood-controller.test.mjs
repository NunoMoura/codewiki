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
		assert.equal(pin.tag, "codewiki-self-dogfood-baseline-v0.3.3");
		assert.equal(pin.source.commit, "a2efca9537261e5ac1bbb1e39e4b7acd656c9804");
		assert.equal(pin.source.tree, "ccbbd2a91bd10066817c9e8656b07e67906128f5");
		assert.equal(pin.package.bytes, 680503);
		assert.equal(
			pin.package.sha256,
			"ffaeefc785a95baf4ceaa387ab02db896caa43879678292eb247d0a0449a4ad4",
		);
		assert.equal(
			pin.approval.reviewRef,
			"chat:2026-07-12-dashboard-lifecycle-fix",
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
