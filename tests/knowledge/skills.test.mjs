import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import packageJson from "../../package.json" with { type: "json" };

describe("CodeWiki source-repository agent guidance", () => {
	it("keeps project-local CodeWiki skills disabled", () => {
		const localSkills = existsSync(".agents/skills")
			? readdirSync(".agents/skills")
			: [];
		assert.deepEqual(localSkills, []);
		assert.deepEqual(packageJson.pi.extensions, ["dist/pi-extension.js"]);
		assert.equal(packageJson.pi.skills, undefined);
	});

	it("keeps semantic-loop guidance in the packaged Pi prompt", () => {
		const promptSource = readFileSync("src/clients/pi/prompt/index.ts", "utf8");
		assert.match(promptSource, /exactly three semantic loops/i);
		assert.match(
			promptSource,
			/Decision approves.*Planning creates.*Implementation accepts/is,
		);
		assert.match(promptSource, /Runtime is their supervised outer loop/i);
		assert.match(promptSource, /not a fourth semantic loop/i);
	});
});
