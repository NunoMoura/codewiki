import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

describe("lab program contract", () => {
	it("provides one optimizer-facing instruction file and objective command", () => {
		assert.equal(existsSync("lab/program.md"), true);
		assert.equal(
			packageJson.scripts["lab:objective"],
			"node --experimental-strip-types lab/runner/objective.ts",
		);
	});

	it("describes the quality network, candidate surface, and trace-derived case path", () => {
		const program = readFileSync("lab/program.md", "utf8");

		assert.match(program, /quality network/i);
		assert.match(program, /lab\/decision\/loop\.ts/);
		assert.match(program, /lab\/planning\/loop\.ts/);
		assert.match(program, /lab\/implementation\/loop\.ts/);
		assert.match(program, /npm run lab:objective/);
		assert.match(program, /trace-derived training material/i);
		assert.match(
			program,
			/Raw CodeWiki traces are evidence, not automatic truth/i,
		);
		assert.match(program, /expected standard\s+failures/i);
		assert.match(program, /wrong-reason loss/i);
		assert.match(program, /frozen production quality network/i);
		assert.match(program, /`src\/\*\*` must not import `lab\/\*\*`/);
	});
});
