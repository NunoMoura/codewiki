import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CODEWIKI_EXTENSION_AVAILABLE, sourceLayout } from "../src/index.ts";
import * as publicApi from "../src/api/index.ts";
import { traceTmpPath } from "../src/runtime/tmp.ts";

const expectedSupportRoots = [
	"traces",
	"views",
	"knowledge",
	"git",
	"cli",
	"pi",
	"runtime",
	"project",
	"utils",
];

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
		assert.deepEqual(sourceLayout.supportRoots, expectedSupportRoots);
		assert.equal(sourceLayout.supportRoots.includes("graph"), false);
		assert.equal(sourceLayout.supportRoots.includes("telemetry"), false);
		assert.equal(sourceLayout.supportRoots.includes("agency"), false);
	});

	it("keeps the package API surface facade-only", () => {
		assert.deepEqual(Object.keys(publicApi).sort(), [
			"CODEWIKI_EXTENSION_AVAILABLE",
			"DEFAULT_WIKI_CONFIG",
			"buildWikiState",
			"resolveWikiConfig",
			"runWikiArchive",
			"runWikiConfig",
			"runWikiDecide",
			"runWikiImplement",
			"runWikiPlan",
			"runWikiRuntime",
			"sourceLayout",
			"validateWikiConfig",
			"wikiStateSourceOwner",
		]);
	});

	it("keeps temporary trace scratch under runtime tmp", () => {
		assert.equal(
			traceTmpPath("TRACE-20260611-example", "planning"),
			".codewiki/runtime/tmp/TRACE-20260611-example/planning",
		);
	});
});
