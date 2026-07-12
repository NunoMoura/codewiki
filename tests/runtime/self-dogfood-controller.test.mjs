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
		assert.equal(pin.tag, "codewiki-self-dogfood-baseline-v0.3.4");
		assert.equal(pin.source.commit, "6c7d77ebd5c2fdcc83bb26dcf5ca616969dbe65f");
		assert.equal(pin.source.tree, "de82d060cd0a6bade47d77c00b3fe2f68e3f6f57");
		assert.equal(pin.package.bytes, 692298);
		assert.equal(
			pin.package.sha256,
			"0114a16df6426ccea97858b6d284698ceb4f0ba7102e3d235965948ef9153336",
		);
		assert.equal(
			pin.approval.reviewRef,
			"chat:2026-07-12-dashboard-observability-approved",
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
