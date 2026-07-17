import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("CodeWiki source-repository agent guidance", () => {
	it("keeps project-local CodeWiki skills disabled", () => {
		const localSkills = existsSync(".agents/skills")
			? readdirSync(".agents/skills")
			: [];
		assert.deepEqual(localSkills, []);
		const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
		assert.deepEqual(packageJson.pi.extensions, ["dist/pi/extension.js"]);
		assert.equal(packageJson.pi.skills, undefined);
	});

	it("keeps semantic-loop guidance in the packaged Pi prompt", () => {
		const promptSource = readFileSync("src/pi/prompt/index.ts", "utf8");
		assert.match(promptSource, /exactly three semantic loops/i);
		assert.match(promptSource, /decision, planning, and implementation/i);
		assert.match(promptSource, /Runtime is backend\/host coordination only/i);
	});
});
