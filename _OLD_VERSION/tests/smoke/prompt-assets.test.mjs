#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { codePrompt } from "../../src/state/prompt.ts";
import { readPromptAsset } from "../../src/adapters/pi/prompt-assets.ts";
import { renderOnboardingPrompt } from "../../src/project/bootstrap.ts";
import { normalizeCodeArgs } from "../../src/adapters/pi/commands/resume.ts";

const repoRoot = resolve(import.meta.dirname, "..", "..");
for (const asset of [
	"src/adapters/pi/prompt-assets/prompts/resume-implementation.md",
	"src/adapters/pi/prompt-assets/bootstrap/onboarding.md",
	"src/adapters/pi/prompt-assets/bootstrap/starter-taxonomy.md",
	"src/adapters/pi/prompt-assets/references/tool-catalog.md",
	"skills/codewiki-decision/SKILL.md",
	"skills/codewiki-decision/references/tools.md",
	"skills/codewiki-planning/SKILL.md",
	"skills/codewiki-planning/references/tools.md",
	"skills/codewiki-implementation/SKILL.md",
	"skills/codewiki-implementation/references/tools.md",
]) {
	assert.ok(
		existsSync(resolve(repoRoot, asset)),
		`missing package asset ${asset}`,
	);
}

for (const removedSkill of ["skills/codewiki", "skills/codewiki-validation"]) {
	assert.ok(
		!existsSync(resolve(repoRoot, removedSkill)),
		`deprecated package skill surface should be removed: ${removedSkill}`,
	);
}

const toolCatalog = readPromptAsset("references/tool-catalog.md");
assert.doesNotMatch(
	toolCatalog,
	/src\/application\/tools\/catalog\.ts/,
	"skill tool catalog should not point to removed application catalog source",
);
assert.match(
	toolCatalog,
	/`wiki_plan`/,
	"skill tool catalog should list wiki_plan",
);
assert.match(
	toolCatalog,
	/`wiki_runtime`/,
	"skill tool catalog should list wiki_runtime",
);
assert.match(
	toolCatalog,
	/archive_sha/,
	"skill tool catalog should document GC archive proof fields",
);
assert.match(
	toolCatalog,
	/action="sprint"/,
	"skill tool catalog should document sprint metadata action",
);
assert.match(
	toolCatalog,
	/Do not create umbrella tasks/,
	"skill tool catalog should preserve task boundary rule",
);

const decisionSkill = readFileSync(
	resolve(repoRoot, "skills", "codewiki-decision", "SKILL.md"),
	"utf8",
);
assert.match(
	decisionSkill,
	/name: codewiki-decision/,
	"decision skill should define public skill frontmatter",
);
assert.match(
	decisionSkill,
	/wiki_decide/,
	"decision skill should require normal decision tool use",
);
assert.match(
	decisionSkill,
	/decision build through `wiki_decide`/,
	"decision skill should define decision build compilation point",
);
assert.match(
	decisionSkill,
	/Product-first/,
	"decision skill should define product/system routing",
);
assert.doesNotMatch(
	decisionSkill,
	/ask_user/,
	"decision skill should not reference nonexistent ask_user tool",
);

const decisionTools = readFileSync(
	resolve(repoRoot, "skills", "codewiki-decision", "references", "tools.md"),
	"utf8",
);
assert.match(
	decisionTools,
	/action="propose"/,
	"decision tool reference should document decision-table proposal",
);
assert.match(
	decisionTools,
	/decision_build/,
	"decision tool reference should document decision build creation",
);

const planningSkill = readFileSync(
	resolve(repoRoot, "skills", "codewiki-planning", "SKILL.md"),
	"utf8",
);
assert.match(
	planningSkill,
	/name: codewiki-planning/,
	"planning skill should define public skill frontmatter",
);
assert.match(
	planningSkill,
	/wiki_plan/,
	"planning skill should define roadmap task mutation tool usage",
);
assert.match(
	planningSkill,
	/planning build through `wiki_plan`/,
	"planning skill should define planning build compilation point",
);
assert.match(
	planningSkill,
	/Reject coordination-only/,
	"planning skill should enforce task boundary rules",
);

const planningTools = readFileSync(
	resolve(repoRoot, "skills", "codewiki-planning", "references", "tools.md"),
	"utf8",
);
assert.match(
	planningTools,
	/source_decision_build/,
	"planning tool reference should require source decision build",
);
assert.match(
	planningTools,
	/Do not hand-edit/,
	"planning tool reference should forbid manual roadmap edits",
);
assert.match(
	planningTools,
	/action="sprint"/,
	"planning tool reference should document sprint metadata mutation path",
);

const implementationSkill = readFileSync(
	resolve(repoRoot, "skills", "codewiki-implementation", "SKILL.md"),
	"utf8",
);
assert.match(
	implementationSkill,
	/name: codewiki-implementation/,
	"implementation skill should define public skill frontmatter",
);
assert.match(
	implementationSkill,
	/wiki_runtime/,
	"implementation skill should define runtime coordination",
);
assert.match(
	implementationSkill,
	/wiki_implement/,
	"implementation skill should define implementation build compilation point",
);
assert.match(
	implementationSkill,
	/before implementation validation/,
	"implementation skill should place implementation build before validation",
);
assert.match(
	implementationSkill,
	/\/wiki resume/,
	"implementation skill should request CodeWiki resume context for fresh starts",
);
assert.match(
	implementationSkill,
	/fresh validation/,
	"implementation skill should request fresh validation proof",
);
assert.match(
	implementationSkill,
	/GC dry-run/,
	"implementation skill should require post-commit GC review",
);

const implementationTools = readFileSync(
	resolve(
		repoRoot,
		"skills",
		"codewiki-implementation",
		"references",
		"tools.md",
	),
	"utf8",
);
assert.match(
	implementationTools,
	/source_planning_build/,
	"implementation tool reference should require source planning build",
);
assert.match(
	implementationTools,
	/wiki_plan action="close"/,
	"implementation tool reference should gate task closure on validation proof",
);
assert.match(
	implementationTools,
	/Do not compile validation before the `implementation_build` exists/,
	"implementation tool reference should forbid validation-before-build ordering",
);

const task = {
	id: "TASK-083",
	title: "Move prompt assets into skill boundary",
	status: "in_progress",
	priority: "high",
	kind: "agent-workflow",
	summary: "Prompt prose should live under package-owned CodeWiki assets.",
	spec_paths: [".codewiki/kb/system/extension.md"],
	code_paths: [
		"src/adapters/pi/prompt-assets/prompts/resume-implementation.md",
		"src/state/prompt.ts",
	],
	research_ids: [],
	labels: ["prompts"],
	goal: {
		outcome: "Resume prompts render from skill-owned templates.",
		acceptance: ["Prompt contains selected task and artifact status context."],
		non_goals: ["Do not move runtime scheduler logic into skills."],
		verification: ["Run prompt asset smoke test."],
	},
	delta: {
		desired: "Package assets own prompt text.",
		current: "Source renders prompt text through package assets.",
		closure: "Source renders package asset templates with runtime data.",
	},
};

const prompt = codePrompt(
	{
		label: "codewiki",
		root: repoRoot,
		docsRoot: ".codewiki/kb",
		roadmapPath: ".codewiki/roadmap/queue.json",
		config: { codewiki: {} },
	},
	null,
	{ counts: { error: 0, warning: 0 } },
	task,
	"Artifact status preflight:\n- Temporary session usage record: 1 in-use artifact held by this session",
	null,
	"Preserve user follow-up intent after /wiki-resume.",
);
assert.match(
	prompt,
	/Selected task:/,
	"resume prompt should expose selected task section",
);
assert.match(
	prompt,
	/TASK-083/,
	"resume prompt should include selected task id",
);
assert.match(
	prompt,
	/Temporary session usage record/,
	"resume prompt should include artifact/session usage context",
);
assert.match(
	prompt,
	/Helper-safe next steps:/,
	"resume prompt should include helper-safe instructions from skill asset",
);
assert.match(
	prompt,
	/wiki_implement/,
	"resume prompt should tell implementers to compile implementation build evidence",
);
assert.match(
	prompt,
	/before requesting implementation validation/,
	"resume prompt should place build before validation",
);
assert.match(
	prompt,
	/CodeWiki-owned compaction/,
	"resume prompt should prefer CodeWiki-owned compaction over generic chat compaction",
);
assert.match(
	prompt,
	/User follow-up intent:\nPreserve user follow-up intent/,
	"resume prompt should preserve trailing user intent",
);
assert.doesNotMatch(
	prompt,
	/\{\{/,
	"rendered prompt should not leak unresolved template placeholders",
);

const onboardingPrompt = renderOnboardingPrompt({
	projectName: "SmokeProject",
	root: "/tmp/smoke-project",
	inferredProjectState: "brownfield",
	inferredBoundaries: ["src", "skills/codewiki-decision"],
});
assert.match(
	onboardingPrompt,
	/canonical\/generated\/runtime path classes/i,
	"onboarding prompt should carry starter boundary guidance from skill asset",
);
assert.match(
	onboardingPrompt,
	/sprint metadata for related task cohorts/i,
	"onboarding prompt should carry sprint-aware routing guidance",
);
assert.doesNotMatch(
	onboardingPrompt,
	/\{\{/,
	"onboarding prompt should not leak unresolved placeholders",
);

const taxonomy = readPromptAsset("bootstrap/starter-taxonomy.md");
assert.match(
	taxonomy,
	/Generated state\/views/,
	"starter taxonomy asset should define generated-view boundary",
);
assert.match(
	taxonomy,
	/Sprint metadata/,
	"starter taxonomy asset should define sprint metadata boundary",
);
assert.match(
	taxonomy,
	/Product\/package source/,
	"starter taxonomy asset should distinguish package source from .codewiki state",
);

assert.deepEqual(normalizeCodeArgs("TASK-083 finish with skill assets"), {
	requestedTaskId: "TASK-083",
	pathArg: null,
	followUpIntent: "finish with skill assets",
	newSession: false,
});
assert.deepEqual(
	normalizeCodeArgs("TASK-083 ./repo -- finish with skill assets"),
	{
		requestedTaskId: "TASK-083",
		pathArg: "./repo",
		followUpIntent: "finish with skill assets",
		newSession: false,
	},
);
assert.deepEqual(
	normalizeCodeArgs("--new TASK-083 ./repo -- finish with skill assets"),
	{
		requestedTaskId: "TASK-083",
		pathArg: "./repo",
		followUpIntent: "finish with skill assets",
		newSession: true,
	},
);
assert.deepEqual(normalizeCodeArgs("-- finish with current focused task"), {
	requestedTaskId: null,
	pathArg: null,
	followUpIntent: "finish with current focused task",
	newSession: false,
});

console.log("✓ prompt asset smoke passed");
