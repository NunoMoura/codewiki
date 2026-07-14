import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
	parseSelfDogfoodControllerPin,
	SELF_DOGFOOD_CONTROLLER_SCHEMA,
} from "../../src/project/self-dogfood-controller.ts";

function readTrackedControllerPin() {
	try {
		return JSON.parse(readFileSync(".pi/codewiki-controller.json", "utf8"));
	} catch (error) {
		throw new Error("Tracked self-dogfood controller pin is not valid JSON.", {
			cause: error,
		});
	}
}

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
		const pin = parseSelfDogfoodControllerPin(readTrackedControllerPin());
		assert.equal(pin.tag, "codewiki-self-dogfood-baseline-v0.3.8");
		assert.equal(pin.source.commit, "0c003d9600a3bae2a1f74dd1200b4186acbbc280");
		assert.equal(pin.source.tree, "ab95eb9a9c173babbe64d5cea0ec0b3c16e3f877");
		assert.equal(pin.package.bytes, 736863);
		assert.equal(
			pin.package.sha256,
			"48a07c29b86c759d63745cdab58ed54bac18944e8f588d7ffc5cc2665c342d29",
		);
		assert.equal(
			pin.approval.reviewRef,
			"chat:2026-07-14-controller-v0.3.8-and-closure-budget-approved",
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
