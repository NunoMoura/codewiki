import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const packageJson = JSON.parse(
	readFileSync(resolve(repoRoot, "package.json"), "utf8"),
);

assert.deepEqual(
	packageJson.pi?.extensions,
	["./src/index.ts"],
	"Pi extension should load from root src/index.ts",
);
assert.ok(
	packageJson.files?.includes("src"),
	"Package files should include root src/",
);
assert.ok(
	!packageJson.files?.includes("extensions"),
	"Package files should not include deprecated extensions/ wrapper",
);
assert.ok(
	!existsSync(resolve(repoRoot, "extensions", "codewiki")),
	"Deprecated extensions/codewiki wrapper should not exist",
);
assert.ok(
	!existsSync(resolve(repoRoot, "src", "domain")),
	"Domain layer should be removed after concept-root migration",
);
assert.ok(
	!existsSync(resolve(repoRoot, "src", "application")),
	"Application layer should be removed after concept-root migration",
);
assert.ok(
	existsSync(resolve(repoRoot, "src", "api")),
	"API facade should exist under root src/",
);
assert.ok(
	existsSync(resolve(repoRoot, "src", "shared")),
	"Shared primitive facade should exist under root src/",
);
assert.ok(
	existsSync(resolve(repoRoot, "src", "adapters")),
	"Adapters layer should exist under root src/",
);
assert.ok(
	!existsSync(resolve(repoRoot, "src", "infrastructure")),
	"Top-level infrastructure layer should not exist",
);
assert.ok(
	existsSync(resolve(repoRoot, "src", "gateway", "index.ts")),
	"Gateway policy should live under source-root gateway/",
);
assert.ok(
	existsSync(resolve(repoRoot, "src", "build", "writer.ts")),
	"Build writer should live under source-root build/",
);
assert.ok(
	!existsSync(resolve(repoRoot, "src", "validation")),
	"Deprecated validation shim root should not remain after TASK-089",
);
assert.ok(
	existsSync(resolve(repoRoot, "src", "state", "graph", "rebuilder.ts")),
	"Graph rebuilder should live under state/ after TASK-030 state/graph migration",
);

const skillEntries = readdirSync(resolve(repoRoot, "skills"), {
	withFileTypes: true,
})
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();
assert.deepEqual(
	skillEntries,
	["codewiki-decision", "codewiki-implementation", "codewiki-planning"],
	"Public CodeWiki skills should expose only the three normal workflow skills",
);
assert.ok(
	existsSync(
		resolve(
			repoRoot,
			"src",
			"adapters",
			"pi",
			"prompt-assets",
			"references",
			"tool-catalog.md",
		),
	),
	"Package prompt assets should expose package-local tool catalog outside discoverable skills",
);
assert.ok(
	existsSync(resolve(repoRoot, "skills", "codewiki-decision", "SKILL.md")),
	"Decision compiler should have a focused public skill",
);
assert.ok(
	existsSync(
		resolve(repoRoot, "skills", "codewiki-decision", "references", "tools.md"),
	),
	"Decision compiler should document exact tool usage",
);
assert.ok(
	existsSync(resolve(repoRoot, "skills", "codewiki-planning", "SKILL.md")),
	"Planning compiler should have a focused public skill",
);
assert.ok(
	existsSync(
		resolve(repoRoot, "skills", "codewiki-planning", "references", "tools.md"),
	),
	"Planning compiler should document exact tool usage",
);
assert.ok(
	existsSync(
		resolve(repoRoot, "skills", "codewiki-implementation", "SKILL.md"),
	),
	"Implementation compiler should have a focused public skill",
);
assert.ok(
	existsSync(
		resolve(
			repoRoot,
			"skills",
			"codewiki-implementation",
			"references",
			"tools.md",
		),
	),
	"Implementation compiler should document exact tool usage",
);
assert.ok(
	!existsSync(resolve(repoRoot, "skills", "codewiki-validation")),
	"Validation gateway should not remain as a discoverable public skill",
);
assert.ok(
	existsSync(
		resolve(
			repoRoot,
			"src",
			"adapters",
			"pi",
			"prompt-assets",
			"playbooks",
			"research.md",
		),
	),
	"Package playbooks should live under prompt assets, not the generic codewiki skill",
);

const appendSystem = readFileSync(
	resolve(repoRoot, ".pi", "APPEND_SYSTEM.md"),
	"utf8",
);
assert.match(
	appendSystem,
	/dogfood CodeWiki state/,
	"Project system prompt should define .codewiki dogfood boundary",
);
assert.match(
	appendSystem,
	/must not treat `\.codewiki\/` as package source code/,
	"Project system prompt should warn agents not to treat .codewiki as source",
);

assert.ok(
	existsSync(resolve(repoRoot, ".codewiki", "roadmap", "queue.json")),
	"Roadmap queue should live under .codewiki/roadmap/queue.json",
);
assert.ok(
	!existsSync(resolve(repoRoot, ".codewiki", "roadmap.json")),
	"Legacy root .codewiki/roadmap.json should not exist",
);
