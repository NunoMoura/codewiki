import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const skillRoot = ".agents/skills";
const expectedSkills = [
	"codewiki-archive",
	"codewiki-config",
	"codewiki-decision",
	"codewiki-implementation",
	"codewiki-planning",
	"codewiki-runtime",
	"codewiki-state",
];
const bannedSkillTerms = [
	/\bcompiler(s)?\b/i,
	/\bgate(s|way)?\b/i,
	/\bbuild(s)?\b/i,
	/\bcompatibility\b/i,
	/\blegacy\b/i,
	/\balias(es)?\b/i,
	/\bGC\b/,
	/wiki_build/,
	/wiki_gate/,
	/wiki_roadmap/,
	/wiki_gc/,
	/extension is disabled/,
	/while the extension is disabled/,
	/hosts\.cli/,
	/"cli"\s*:\s*\{\s*"enabled"/,
	/decision_build/,
	/planning_build/,
	/implementation_build/,
	/roadmap truth/,
	/graph truth/,
];

function skillText(name) {
	return readFileSync(`${skillRoot}/${name}/SKILL.md`, "utf8");
}

function parseFrontmatter(text) {
	assert.equal(text.startsWith("---\n"), true);
	const end = text.indexOf("\n---\n", 4);
	assert.notEqual(end, -1);
	return text
		.slice(4, end)
		.split("\n")
		.reduce((fields, line) => {
			const [key, ...rest] = line.split(":");
			fields[key.trim()] = rest.join(":").trim();
			return fields;
		}, {});
}

describe("CodeWiki project skills", () => {
	it("provides the target local skill set without packaging skills", () => {
		const actual = readdirSync(skillRoot).sort();
		assert.deepEqual(actual, expectedSkills);
		const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
		assert.deepEqual(packageJson.pi.extensions, ["dist/pi/extension.js"]);
		assert.equal(packageJson.pi.skills, undefined);
	});

	it("uses valid frontmatter and current loop vocabulary", () => {
		for (const name of expectedSkills) {
			const text = skillText(name);
			const frontmatter = parseFrontmatter(text);
			assert.equal(frontmatter.name, name);
			assert.match(frontmatter.description || "", /CodeWiki|codewiki/i);
			for (const banned of bannedSkillTerms) {
				assert.equal(
					banned.test(text),
					false,
					`${name} contains banned term ${banned}`,
				);
			}
		}
	});
});
