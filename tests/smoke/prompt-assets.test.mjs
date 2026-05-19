#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { codePrompt } from "../../src/application/prompt.ts";
import { readSkillAsset } from "../../src/application/skill-assets.ts";
import { renderOnboardingPrompt } from "../../src/bootstrap.ts";
import { normalizeCodeArgs } from "../../src/adapters/pi/commands/resume.ts";

const repoRoot = resolve(import.meta.dirname, "..", "..");
for (const asset of [
	"skills/codewiki/SKILL.md",
	"skills/codewiki/prompts/resume-implementation.md",
	"skills/codewiki/bootstrap/onboarding.md",
	"skills/codewiki/bootstrap/starter-taxonomy.md",
	"skills/codewiki/references/tool-catalog.md",
	"skills/codewiki-feedback/SKILL.md",
	"skills/codewiki-feedback/references/tools.md",
	"skills/codewiki-documentation/SKILL.md",
	"skills/codewiki-documentation/references/tools.md",
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
assert.match(mainSkill, /codewiki_setup/, "main skill should list setup tool");
assert.match(mainSkill, /codewiki_state/, "main skill should center state routing");
assert.match(mainSkill, /codewiki_gc/, "main skill should expose post-commit GC tool");
assert.match(mainSkill, /post-commit/i, "main skill should enforce post-commit GC boundary");
assert.match(mainSkill, /codewiki-feedback/, "main skill should route to focused loop skills");
assert.match(mainSkill, /Task and sprint routing/, "main skill should define task and sprint routing rules");
assert.match(mainSkill, /three or more related executable tasks/, "main skill should define sprint creation threshold");
assert.match(mainSkill, /Do not hand-edit sprint metadata/, "main skill should prohibit manual sprint metadata edits");
assert.match(mainSkill, /references\/tool-catalog\.md/, "main skill should route agents to the tool catalog");
assert.doesNotMatch(mainSkill, /(?:\.\.\/)+\.codewiki/, "main skill should not rely on package-relative .codewiki links");

const toolCatalog = readFileSync(resolve(repoRoot, "skills", "codewiki", "references", "tool-catalog.md"), "utf8");
assert.doesNotMatch(toolCatalog, /src\/application\/tools\/catalog\.ts/, "skill tool catalog should not point to removed application catalog source");
assert.match(toolCatalog, /`codewiki_task`/, "skill tool catalog should list codewiki_task");
assert.match(toolCatalog, /`codewiki_gc`/, "skill tool catalog should list codewiki_gc");
assert.match(toolCatalog, /archive_sha/, "skill tool catalog should document GC archive proof fields");
assert.match(toolCatalog, /action="sprint"/, "skill tool catalog should document sprint metadata action");
assert.match(toolCatalog, /Do not create umbrella tasks/, "skill tool catalog should preserve task boundary rule");

const feedbackSkill = readFileSync(resolve(repoRoot, "skills", "codewiki-feedback", "SKILL.md"), "utf8");
assert.match(feedbackSkill, /name: codewiki-feedback/, "feedback skill should define public skill frontmatter");
assert.match(feedbackSkill, /codewiki_diff_table/, "feedback skill should require semantic diff table use");
assert.match(feedbackSkill, /codewiki_build kind="feedback"/, "feedback skill should define feedback build compilation point");
assert.doesNotMatch(feedbackSkill, /ask_user/, "feedback skill should not reference nonexistent ask_user tool");

const feedbackTools = readFileSync(resolve(repoRoot, "skills", "codewiki-feedback", "references", "tools.md"), "utf8");
assert.match(feedbackTools, /action="propose"/, "feedback tool reference should document diff-table proposal");
assert.match(feedbackTools, /kind="feedback"/, "feedback tool reference should document feedback build creation");

const documentationSkill = readFileSync(resolve(repoRoot, "skills", "codewiki-documentation", "SKILL.md"), "utf8");
assert.match(documentationSkill, /name: codewiki-documentation/, "documentation skill should define public skill frontmatter");
assert.match(documentationSkill, /codewiki_build kind="documentation"/, "documentation skill should define documentation build compilation point");
assert.match(documentationSkill, /planning handoff/i, "documentation skill should route executable delta to planning");
assert.match(documentationSkill, /Do not create or refine roadmap tasks/i, "documentation skill should not own routine task shaping");

const documentationTools = readFileSync(resolve(repoRoot, "skills", "codewiki-documentation", "references", "tools.md"), "utf8");
assert.match(documentationTools, /kind="documentation"/, "documentation tool reference should document documentation build creation");
assert.match(documentationTools, /route that to planning mode/, "documentation tool reference should route roadmap work to planning");

const planningSkill = readFileSync(resolve(repoRoot, "skills", "codewiki-planning", "SKILL.md"), "utf8");
assert.match(planningSkill, /name: codewiki-planning/, "planning skill should define public skill frontmatter");
assert.match(planningSkill, /codewiki_task/, "planning skill should define roadmap task mutation tool usage");
assert.match(planningSkill, /codewiki_build kind="planning"/, "planning skill should define planning build compilation point");
assert.match(planningSkill, /Reject coordination-only/, "planning skill should enforce task boundary rules");

const planningTools = readFileSync(resolve(repoRoot, "skills", "codewiki-planning", "references", "tools.md"), "utf8");
assert.match(planningTools, /source_documentation_build/, "planning tool reference should require source documentation build");
assert.match(planningTools, /Do not hand-edit/, "planning tool reference should forbid manual roadmap edits");
assert.match(planningTools, /action="sprint"/, "planning tool reference should document sprint metadata mutation path");

const implementationSkill = readFileSync(resolve(repoRoot, "skills", "codewiki-implementation", "SKILL.md"), "utf8");
assert.match(implementationSkill, /name: codewiki-implementation/, "implementation skill should define public skill frontmatter");
assert.match(implementationSkill, /codewiki_artifact_status/, "implementation skill should define artifact status coordination");
assert.match(implementationSkill, /codewiki_build kind="implementation"/, "implementation skill should define implementation build compilation point");
assert.match(implementationSkill, /before implementation validation/, "implementation skill should place implementation build before validation");
assert.match(implementationSkill, /codewiki_session_handoff/, "implementation skill should request fresh validation handoff");
assert.match(implementationSkill, /codewiki_gc action="dry-run"/, "implementation skill should require post-commit GC review");

const implementationTools = readFileSync(resolve(repoRoot, "skills", "codewiki-implementation", "references", "tools.md"), "utf8");
assert.match(implementationTools, /source_planning_build/, "implementation tool reference should require source planning build");
assert.match(implementationTools, /action="close"` only after/, "implementation tool reference should gate task closure on validation proof");
assert.match(implementationTools, /Do not compile validation before the `implementation_build` exists/, "implementation tool reference should forbid validation-before-build ordering");

const validationSkill = readFileSync(resolve(repoRoot, "skills", "codewiki-validation", "SKILL.md"), "utf8");
assert.match(validationSkill, /name: codewiki-validation/, "validation skill should define public skill frontmatter");
assert.match(validationSkill, /feedback, documentation, planning, or implementation builds/, "validation skill should trigger on all compiler build kinds");
assert.match(validationSkill, /codewiki_state/, "validation skill should define state tool usage");
assert.match(validationSkill, /codewiki_audit/, "validation skill should define audit evidence usage");
assert.match(validationSkill, /codewiki_validation/, "validation skill should define validation report tool usage");
assert.match(validationSkill, /Do not call compiler tools/, "validation skill should forbid compiler work");
assert.match(validationSkill, /fresh_context=true/, "validation skill should require fresh-context proof where applicable");
assert.match(validationSkill, /GC restore ledger/, "validation skill should distinguish GC ledger from validation proof");

const validationTools = readFileSync(resolve(repoRoot, "skills", "codewiki-validation", "references", "tools.md"), "utf8");
assert.match(validationTools, /codewiki_session_handoff/, "validation tool reference should cover fresh validator handoff");
assert.match(validationTools, /Do not call `codewiki_build`/, "validation tool reference should forbid build compilation");
assert.match(validationTools, /Return `block` when/, "validation tool reference should define block criteria");
assert.match(validationTools, /Task-close\/publication\/publish\/release pass requires/, "validation tool reference should define stronger close/publication proof");

const task = {
	id: "TASK-083",
	title: "Move prompt assets into skill boundary",
	status: "in_progress",
	priority: "high",
	kind: "agent-workflow",
	summary: "Prompt prose should live under skills/codewiki.",
	spec_paths: [".codewiki/kb/system/extension.md"],
	code_paths: ["skills/codewiki/prompts/resume-implementation.md", "src/application/prompt.ts"],
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
assert.match(prompt, /codewiki_build kind="implementation"/, "resume prompt should tell implementers to compile implementation build evidence");
assert.match(prompt, /before requesting implementation validation/, "resume prompt should place build before validation");
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
});
assert.deepEqual(normalizeCodeArgs("TASK-083 ./repo -- finish with skill assets"), {
	requestedTaskId: "TASK-083",
	pathArg: "./repo",
	followUpIntent: "finish with skill assets",
});
assert.deepEqual(normalizeCodeArgs("-- finish with current focused task"), {
	requestedTaskId: null,
	pathArg: null,
	followUpIntent: "finish with current focused task",
});

console.log("✓ prompt asset smoke passed");
