import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CODEWIKI_EXTENSION_AVAILABLE, sourceLayout } from "../src/index.ts";

describe("fresh scaffold", () => {
	it("keeps the Pi extension disabled", () => {
		assert.equal(CODEWIKI_EXTENSION_AVAILABLE, false);
	});

	it("names the intended source roots", () => {
		assert.deepEqual(sourceLayout.loopRoots, [
			"decision",
			"planning",
			"implementation",
		]);
		assert.ok(sourceLayout.supportRoots.includes("telemetry"));
		assert.ok(sourceLayout.supportRoots.includes("pi"));
	});
});
