#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { codePrompt } from "../../src/state/prompt.ts";
import { readSkillAsset } from "../../src/state/skill-assets.ts";
import { renderOnboardingPrompt } from "../../src/project/bootstrap.ts";
import { normalizeCodeArgs } from "../../src/adapters/pi/commands/resume.ts";

const repoRoot = resolve(import.meta.dirname, "..", "..");
for (const asset of [
	"skills/codewiki/SKILL.md",
	"skills/codewiki/prompts/resume-implementation.md",
	"skills/codewiki/bootstrap/onboarding.md",
	"skills/codewiki/bootstrap/starter-taxonomy.md",
	"skills/codewiki/references/tool-catalog.md",
	"skills/codewiki-decision/SKILL.md",
	"skills/codewiki-decision/references/tools.md",
	"skills/codewiki-planning/SKILL.md",
	"skills/codewiki-planning/references/tools.md",
	"skills/codewiki-implementation/SKILL.md",
	"skills/codewiki-implementation/references/tools.md",
	"skills/codewiki-validation/SKILL.md",
	"skills/codewiki-validation/references/tools.md",
]) {
	assert.ok(existsSync(resolve(repoRoot, asset)), `missing skill asset ${asset}`);
}

const mainSkill = readFileSync(resolve(repoRoot, "skills", "codewiki", "SKILL.md"), "utf8");
assert.match(mainSkill, /name: codewiki/, "main skill should define public skill frontmatter");
assert.match(mainSkill, /First read and bootstrap/, "main skill should own bootstrap and status flow");
assert.match(mainSkill, /wiki_setup/, "main skill should list setup tool");
assert.match(mainSkill, /wiki_state/, "main skill should center state routing");
assert.match(mainSkill, /CodeWiki-owned compaction/, "main skill should define CodeWiki-owned soft context refresh");
assert.match(mainSkill, /wiki_gc/, "main skill should expose post-commit GC tool");
assert.match(mainSkill, /post-commit/i, "main skill should enforce post-commit GC boundary");
assert.match(mainSkill, /codewiki-decision/, "main skill should route to focused loop skills");
assert.match(mainSkill, /Task and sprint routing/, "main skill should define task and sprint routing rules");
assert.match(mainSkill, /three or more related executable tasks/, "main skill should define sprint creation threshold");
assert.match(mainSkill, /Do not hand-edit sprint metadata/, "main skill should prohibit manual sprint metadata edits");
assert.match(mainSkill, /references\/tool-catalog\.md/, "main skill should route agents to the tool catalog");
assert.doesNotMatch(mainSkill, /(?:\.\.\/)+\.codewiki/, "main skill should not rely on package-relative .codewiki links");

const toolCatalog = readFileSync(resolve(repoRoot, "skills", "codewiki", "references", "tool-catalog.md"), "utf8");
assert.doesNotMatch(toolCatalog, /src\/application\/tools\/catalog\.ts/, "skill tool catalog should not point to removed application catalog source");
assert.match(toolCatalog, /`wiki_roadmap`/, "skill tool catalog should list wiki_roadmap");
assert.match(toolCatalog, /`wiki_gc`/, "skill tool catalog should list wiki_gc");
assert.match(toolCatalog, /archive_sha/, "skill tool catalog should document GC archive proof fields");
assert.match(toolCatalog, /action="sprint"/, "skill tool catalog should document sprint metadata action");
assert.match(toolCatalog, /Do not create umbrella tasks/, "skill tool catalog should preserve task boundary rule");

const decisionSkill = readFileSync(resolve(repoRoot, "skills", "codewiki-decision", "SKILL.md"), "utf8");
assert.match(decisionSkill, /name: codewiki-decision/, "decision skill should define public skill frontmatter");
assert.match(decisionSkill, /wiki_diff_table/, "decision skill should require semantic diff table use");
assert.match(decisionSkill, /wiki_build kind="decision"/, "decision skill should define decision build compilation point");
assert.match(decisionSkill, /Product-first/, "decision skill should define product/system routing");
assert.doesNotMatch(decisionSkill, /ask_user/, "decision skill should not reference nonexistent ask_user tool");

const decisionTools = readFileSync(resolve(repoRoot, "skills", "codewiki-decision", "references", "tools.md"), "utf8");
assert.match(decisionTools, /action="propose"/, "decision tool reference should document diff-table proposal");
assert.match(decisionTools, /kind="decision"/, "decision tool reference should document decision build creation");

const planningSkill = readFileSync(resolve(repoRoot, "skills", "codewiki-planning", "SKILL.md"), "utf8");
assert.match(planningSkill, /name: codewiki-planning/, "planning skill should define public skill frontmatter");
assert.match(planningSkill, /wiki_roadmap/, "planning skill should define roadmap task mutation tool usage");
assert.match(planningSkill, /wiki_build kind="planning"/, "planning skill should define planning build compilation point");
assert.match(planningSkill, /Reject coordination-only/, "planning skill should enforce task boundary rules");

const planningTools = readFileSync(resolve(repoRoot, "skills", "codewiki-planning", "references", "tools.md"), "utf8");
assert.match(planningTools, /source_decision_build/, "planning tool reference should require source decision build");
assert.match(planningTools, /Do not hand-edit/, "planning tool reference should forbid manual roadmap edits");
assert.match(planningTools, /action="sprint"/, "planning tool reference should document sprint metadata mutation path");

const implementationSkill = readFileSync(resolve(repoRoot, "skills", "codewiki-implementation", "SKILL.md"), "utf8");
assert.match(implementationSkill, /name: codewiki-implementation/, "implementation skill should define public skill frontmatter");
assert.match(implementationSkill, /wiki_artifact_status/, "implementation skill should define artifact status coordination");
assert.match(implementationSkill, /wiki_build kind="implementation"/, "implementation skill should define implementation build compilation point");
assert.match(implementationSkill, /before implementation validation/, "implementation skill should place implementation build before validation");
assert.match(implementationSkill, /wiki_resume_context/, "implementation skill should request CodeWiki resume context for fresh starts");
assert.match(implementationSkill, /fresh validation/, "implementation skill should request fresh validation proof");
assert.match(implementationSkill, /wiki_gc action="dry-run"/, "implementation skill should require post-commit GC review");

const implementationTools = readFileSync(resolve(repoRoot, "skills", "codewiki-implementation", "references", "tools.md"), "utf8");
assert.match(implementationTools, /source_planning_build/, "implementation tool reference should require source planning build");
assert.match(implementationTools, /action="close"` only after/, "implementation tool reference should gate task closure on validation proof");
assert.match(implementationTools, /Do not compile validation before the `implementation_build` exists/, "implementation tool reference should forbid validation-before-build ordering");

const validationSkill = readFileSync(resolve(repoRoot, "skills", "codewiki-validation", "SKILL.md"), "utf8");
assert.match(validationSkill, /name: codewiki-validation/, "validation skill should define public skill frontmatter");
assert.match(validationSkill, /decision, planning, or implementation builds/, "validation skill should trigger on all compiler build kinds");
assert.match(validationSkill, /wiki_state/, "validation skill should define state tool usage");
assert.match(validationSkill, /wiki_audit/, "validation skill should define audit evidence usage");
assert.match(validationSkill, /wiki_gateway/, "validation skill should define validation report tool usage");
assert.match(validationSkill, /Do not call compiler tools/, "validation skill should forbid compiler work");
assert.match(validationSkill, /fresh_context=true/, "validation skill should require fresh-context proof where applicable");
assert.match(validationSkill, /GC restore ledger/, "validation skill should distinguish GC ledger from validation proof");

const validationTools = readFileSync(resolve(repoRoot, "skills", "codewiki-validation", "references", "tools.md"), "utf8");
assert.match(validationTools, /restart validation from the source\/build refs/, "validation tool reference should cover fresh validator restart");
assert.match(validationTools, /Do not call `wiki_build`/, "validation tool reference should forbid build compilation");
assert.match(validationTools, /Return `block` when/, "validation tool reference should define block criteria");
assert.match(validationTools, /Task-close, sprint-close, and ship-ready pass require/, "validation tool reference should define stronger close/ship-ready proof");

const task = {
	id: "TASK-083",
	title: "Move prompt assets into skill boundary",
	status: "in_progress",
	priority: "high",
	kind: "agent-workflow",
	summary: "Prompt prose should live under skills/codewiki.",
	spec_paths: [".codewiki/kb/system/extension.md"],
	code_paths: ["skills/codewiki/prompts/resume-implementation.md", "src/state/prompt.ts"],
	research_ids: [],
	labels: ["prompts"],
	goal: {
		outcome: "Resume prompts render from skill-owned templates.",
		acceptance: ["Prompt contains selected task and artifact status context."],
		non_goals: ["Do not move runtime scheduler logic into skills."],
		verification: ["Run prompt asset smoke test."],
	},
	delta: {
		desired: "Skill owns prompt text.",
		current: "Source owns prompt text.",
		closure: "Source renders skill templates with runtime data.",
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
assert.match(prompt, /Selected task:/, "resume prompt should expose selected task section");
assert.match(prompt, /TASK-083/, "resume prompt should include selected task id");
assert.match(prompt, /Temporary session usage record/, "resume prompt should include artifact/session usage context");
assert.match(prompt, /Helper-safe next steps:/, "resume prompt should include helper-safe instructions from skill asset");
assert.match(prompt, /wiki_build kind="implementation"/, "resume prompt should tell implementers to compile implementation build evidence");
assert.match(prompt, /before requesting implementation validation/, "resume prompt should place build before validation");
assert.match(prompt, /CodeWiki-owned compaction/, "resume prompt should prefer CodeWiki-owned compaction over generic chat compaction");
assert.match(prompt, /User follow-up intent:\nPreserve user follow-up intent/, "resume prompt should preserve trailing user intent");
assert.doesNotMatch(prompt, /\{\{/, "rendered prompt should not leak unresolved template placeholders");

const onboardingPrompt = renderOnboardingPrompt({
	projectName: "SmokeProject",
	root: "/tmp/smoke-project",
	inferredProjectState: "brownfield",
	inferredBoundaries: ["src", "skills/codewiki"],
});
assert.match(onboardingPrompt, /canonical\/generated\/runtime path classes/i, "onboarding prompt should carry starter boundary guidance from skill asset");
assert.match(onboardingPrompt, /sprint metadata for related task cohorts/i, "onboarding prompt should carry sprint-aware routing guidance");
assert.doesNotMatch(onboardingPrompt, /\{\{/, "onboarding prompt should not leak unresolved placeholders");

const taxonomy = readSkillAsset("bootstrap/starter-taxonomy.md");
assert.match(taxonomy, /Generated state\/views/, "starter taxonomy asset should define generated-view boundary");
assert.match(taxonomy, /Sprint metadata/, "starter taxonomy asset should define sprint metadata boundary");
assert.match(taxonomy, /Product\/package source/, "starter taxonomy asset should distinguish package source from .codewiki state");

assert.deepEqual(normalizeCodeArgs("TASK-083 finish with skill assets"), {
	requestedTaskId: "TASK-083",
	pathArg: null,
	followUpIntent: "finish with skill assets",
	newSession: false,
});
assert.deepEqual(normalizeCodeArgs("TASK-083 ./repo -- finish with skill assets"), {
	requestedTaskId: "TASK-083",
	pathArg: "./repo",
	followUpIntent: "finish with skill assets",
	newSession: false,
});
assert.deepEqual(normalizeCodeArgs("--new TASK-083 ./repo -- finish with skill assets"), {
	requestedTaskId: "TASK-083",
	pathArg: "./repo",
	followUpIntent: "finish with skill assets",
	newSession: true,
});
assert.deepEqual(normalizeCodeArgs("-- finish with current focused task"), {
	requestedTaskId: null,
	pathArg: null,
	followUpIntent: "finish with current focused task",
	newSession: false,
});

console.log("✓ prompt asset smoke passed");
