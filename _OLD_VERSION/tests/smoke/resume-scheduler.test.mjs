#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	resolveImplementationTask,
	resumeCandidates,
} from "../../src/state/resume-selection.ts";
import { agencyHardStopReasons } from "../../src/agency/planning.ts";
import {
	agencyLevelAllowsContinuation,
	effectiveAgencyPolicy,
} from "../../src/agency/types.ts";
import { loadProject } from "../../src/project/context.ts";
import { buildResumeContextForTask } from "../../src/state/resume-context.ts";

function task(id, status, labels = [], codePaths = [], acceptance = []) {
	return {
		id,
		title: `${id} title`,
		status,
		priority: "high",
		kind: "testing",
		summary: labels.includes("umbrella")
			? "Umbrella coordination task."
			: `${id} summary`,
		spec_paths: [],
		code_paths: codePaths,
		research_ids: [],
		labels,
		goal: { outcome: "", acceptance, non_goals: [], verification: [] },
		delta: { desired: "", current: "", closure: "" },
		created: "2026-05-16T00:00:00Z",
		updated: "2026-05-16T00:00:00Z",
	};
}

function roadmap(tasks) {
	return {
		version: 1,
		updated: "2026-05-16T00:00:00Z",
		order: tasks.map((item) => item.id),
		tasks: Object.fromEntries(tasks.map((item) => [item.id, item])),
	};
}

function state(claims = []) {
	return {
		generated_at: "2026-05-16T00:00:00Z",
		active_claim_count: claims.length,
		warning_count: 0,
		conflict_count: 0,
		pending_waiter_count: 0,
		ready_waiter_count: 0,
		claims,
		conflicts: [],
		waiters: [],
	};
}

const umbrella = task(
	"TASK-077",
	"in_progress",
	["umbrella"],
	["src/state/graph.ts"],
);
const delegatedContainer = task(
	"TASK-082",
	"todo",
	[],
	["src/roadmap/store.ts"],
	[
		"TASK-078 is closed with passing checks and evidence.",
		"TASK-079 is closed with passing checks and evidence.",
	],
);
const firstChild = task("TASK-083", "todo", [], ["skills/codewiki-decision"]);
const secondChild = task("TASK-085", "todo", [], ["tests/fixtures"]);
const board = roadmap([umbrella, delegatedContainer, firstChild, secondChild]);

const roadmapOrderSelection = resolveImplementationTask(
	roadmap([firstChild, secondChild]),
	null,
	null,
	null,
	state(),
	"session-helper",
);
assert.equal(
	roadmapOrderSelection.task?.id,
	"TASK-083",
	"shared resolver should fall back to roadmap order when no focus exists",
);
assert.equal(roadmapOrderSelection.source, "roadmap-order");

const sessionFocusSelection = resolveImplementationTask(
	roadmap([firstChild, secondChild]),
	{ taskId: "TASK-085" },
	null,
	null,
	state(),
	"session-helper",
);
assert.equal(
	sessionFocusSelection.task?.id,
	"TASK-085",
	"shared resolver should prefer current session focus before roadmap order",
);
assert.equal(sessionFocusSelection.source, "session-focus");

const persistedFocusSelection = resolveImplementationTask(
	roadmap([firstChild, secondChild]),
	null,
	null,
	"TASK-085",
	state(),
	"session-helper",
);
assert.equal(
	persistedFocusSelection.task?.id,
	"TASK-085",
	"shared resolver should prefer persisted focus before roadmap order",
);
assert.equal(persistedFocusSelection.source, "persisted-focus");

const candidateSources = resumeCandidates(
	board,
	{ taskId: "TASK-083" },
	"TASK-077",
).map((item) => `${item.source}:${item.task.id}`);
assert.deepEqual(
	candidateSources.slice(0, 4),
	[
		"session-focus:TASK-083",
		"persisted-focus:TASK-077",
		"roadmap-order:TASK-082",
		"roadmap-order:TASK-085",
	],
	"shared candidate order should dedupe session focus, then persisted focus, then roadmap order",
);

const selected = resolveImplementationTask(
	board,
	null,
	null,
	"TASK-077",
	state(),
	"session-helper",
);
assert.equal(
	selected.task?.id,
	"TASK-083",
	"implicit /wiki-resume should skip persisted container focus and delegated container tasks",
);
assert.ok(
	selected.skipped.some((item) =>
		/TASK-077: non-executable container task/.test(item),
	),
	"selection should explain skipped container task",
);
assert.ok(
	selected.skipped.some((item) =>
		/TASK-082: non-executable container task/.test(item),
	),
	"selection should explain delegated task-closure criteria",
);

assert.throws(
	() =>
		resolveImplementationTask(
			board,
			null,
			"TASK-077",
			null,
			state(),
			"session-helper",
		),
	/not executable work/i,
	"explicit /wiki-resume TASK-### should reject container tasks",
);

const explicit = resolveImplementationTask(
	board,
	null,
	"TASK-083",
	"TASK-077",
	state(),
	"session-helper",
);
assert.equal(
	explicit.task?.id,
	"TASK-083",
	"explicit /wiki-resume TASK-### should honor requested child task",
);

const conflicting = state([
	{
		id: "CLAIM-999",
		session_id: "other-session",
		agent_name: "Other Agent",
		status: "active",
		mode: "write",
		summary: "Other session using skill artifacts.",
		task_id: "TASK-083",
		scopes: [{ layer: "code", path: "skills/codewiki-decision/**" }],
		created_at: "2026-05-16T00:00:00Z",
		updated_at: "2026-05-16T00:00:00Z",
		expires_at: "2099-01-01T00:00:00Z",
	},
]);
const conflictSelection = resolveImplementationTask(
	board,
	null,
	null,
	"TASK-077",
	conflicting,
	"session-helper",
);
assert.equal(
	conflictSelection.task?.id,
	"TASK-085",
	"implicit /wiki-resume should skip artifacts in use by another session",
);
assert.ok(
	conflictSelection.skipped.some((item) =>
		/TASK-083: Artifact conflict/.test(item),
	),
	"selection should explain artifact conflict",
);

assert.throws(
	() =>
		resolveImplementationTask(
			board,
			null,
			"TASK-083",
			"TASK-077",
			conflicting,
			"session-helper",
		),
	/Artifact conflict/i,
	"explicit /wiki-resume TASK-### should block on real artifact conflict",
);

const readinessSelection = resolveImplementationTask(
	board,
	null,
	null,
	"TASK-083",
	state(),
	"session-helper",
	{
		"TASK-083": [
			"accepted_planning_build_ref:missing_planning_validation_pass",
		],
	},
);
assert.equal(
	readinessSelection.task?.id,
	"TASK-085",
	"implicit /wiki-resume should skip tasks without planning-gateway proof",
);
assert.ok(
	readinessSelection.skipped.some((item) =>
		/TASK-083: not implementation-ready/.test(item),
	),
	"selection should explain missing planning-gateway proof",
);
assert.throws(
	() =>
		resolveImplementationTask(
			board,
			null,
			"TASK-083",
			"TASK-077",
			state(),
			"session-helper",
			{
				"TASK-083": [
					"accepted_planning_build_ref:missing_planning_validation_pass",
				],
			},
		),
	/not implementation-ready/i,
	"explicit /wiki-resume TASK-### should block without planning-gateway proof",
);

const defaultAgency = effectiveAgencyPolicy({ codewiki: { agency: {} } });
assert.equal(
	defaultAgency.level,
	"task",
	"agency should default to task-level approval cadence",
);
assert.equal(
	defaultAgency.approval_cadence,
	"task",
	"approval cadence should default from agency level",
);
assert.equal(
	defaultAgency.context_reset.auto_pickup,
	true,
	"context reset auto-pickup should default on",
);
assert.ok(
	defaultAgency.stop_gates.includes("unsafe_reset_boundary"),
	"unsafe reset boundary should be a hard stop gate",
);
assert.equal(
	agencyLevelAllowsContinuation("task", "sprint"),
	false,
	"task-level agency must stop before next task/sprint continuation",
);
assert.equal(
	agencyLevelAllowsContinuation("sprint", "sprint"),
	true,
	"sprint-level agency may continue task-by-task inside a sprint",
);
assert.equal(
	agencyLevelAllowsContinuation("roadmap", "roadmap"),
	true,
	"roadmap-level agency may continue across roadmap work until a hard gate fires",
);
const roadmapAgency = effectiveAgencyPolicy({
	codewiki: { agency: { level: "roadmap" } },
});
const agencyGateInput = {
	policy: roadmapAgency,
	trigger: "task_end",
	health: { errors: 0 },
	claims: { conflict_count: 0 },
	budget: { risk: "medium" },
};
assert.ok(
	agencyHardStopReasons({
		...agencyGateInput,
		nextStep: { kind: "publication", command: "git push origin HEAD" },
	}).includes("publication gate active"),
	"roadmap agency should stop before publication or remote push actions",
);
assert.ok(
	agencyHardStopReasons({
		...agencyGateInput,
		nextStep: { kind: "gc:purge", reason: "destructive purge requested" },
	}).includes("destructive action gate active"),
	"roadmap agency should stop before destructive actions",
);
assert.ok(
	agencyHardStopReasons({
		...agencyGateInput,
		nextStep: {
			kind: "context_reset",
			reason: "pending messages would break reset boundary",
		},
	}).includes("unsafe reset boundary gate active"),
	"roadmap agency should stop at unsafe reset boundaries",
);

const resumeSource = readFileSync(
	new URL("../../src/adapters/pi/commands/resume.ts", import.meta.url),
	"utf8",
);
assert.match(
	resumeSource,
	/buildCodewikiResumeKickoff/,
	"fresh-session resume should reuse the CodeWiki kickoff builder",
);
assert.match(
	resumeSource,
	/replacementCtx\.sendMessage\(\s*kickoff,\s*\{[\s\S]*triggerTurn:\s*true,[\s\S]*deliverAs:\s*"followUp"[\s\S]*\}\s*\)/,
	"fresh-session resume should trigger from a custom kickoff follow-up boundary",
);
assert.doesNotMatch(
	resumeSource,
	/deliverAs:\s*"nextTurn"[\s\S]*triggerTurn:\s*true|triggerTurn:\s*true[\s\S]*deliverAs:\s*"nextTurn"/,
	"fresh-session resume must not rely on nextTurn because pi ignores triggerTurn for that mode",
);
assert.doesNotMatch(
	resumeSource,
	/sendUserMessage\(\s*[`'"]\/wiki-resume/,
	"fresh-session resume must not inject slash commands as chat text",
);

const agencyPlanningSource = readFileSync(
	new URL("../../src/agency/planning.ts", import.meta.url),
	"utf8",
);
assert.match(
	agencyPlanningSource,
	/approval cadence boundary reached/,
	"agency planner should stop at configured approval boundaries",
);
assert.match(
	agencyPlanningSource,
	/hard_stop_gates/,
	"agency planner should expose mandatory hard stop gates",
);
assert.match(
	agencyPlanningSource,
	/context_reset/,
	"agency planner should expose reset auto-pickup policy",
);

const traceRoot = await mkdtemp(join(tmpdir(), "codewiki-resume-trace-"));
try {
	await mkdir(join(traceRoot, ".codewiki/builds/decision"), {
		recursive: true,
	});
	await mkdir(join(traceRoot, ".codewiki/builds/planning"), {
		recursive: true,
	});
	await mkdir(join(traceRoot, ".codewiki/validation"), { recursive: true });
	await mkdir(join(traceRoot, ".codewiki/roadmap/tasks/TASK-092"), {
		recursive: true,
	});
	await writeFile(
		join(traceRoot, ".codewiki/config.json"),
		JSON.stringify(
			{
				project_name: "resume-trace-smoke",
				schema_version: 4,
				docs_root: ".codewiki/kb",
			},
			null,
			2,
		),
	);
	await writeFile(
		join(traceRoot, ".codewiki/builds/decision/accepted-trace.json"),
		JSON.stringify(
			{
				kind: "decision_build",
				status: "accepted",
				summary: "Accepted trace-primary architecture.",
				approved_decision_rows: ["ROW-001", "ROW-002"],
				knowledge_changes: [".codewiki/kb/system/trace-graph.md"],
				row_to_kb_mappings: [
					{
						row_id: "ROW-001",
						knowledge_refs: [".codewiki/kb/system/runtime.md"],
						diagram_refs: [".codewiki/kb/system/diagrams/key-flow.yaml"],
					},
				],
				propagation: {
					product_impact: ["Users keep safe resume context."],
					system_impact: ["Agents recover trace refs."],
					downstream_planning_questions: ["Where does resume bootstrap land?"],
				},
				non_goals: [
					"Do not implement trace storage in resume scheduler fixture.",
				],
				risks: ["Trace storage not implemented yet."],
			},
			null,
			2,
		),
	);
	await writeFile(
		join(traceRoot, ".codewiki/builds/planning/planned-trace.json"),
		JSON.stringify(
			{
				kind: "planning_build",
				status: "accepted",
				summary: "Plan trace resume bootstrap.",
				task_ids: ["TASK-092"],
				source_decision_build: ".codewiki/builds/decision/accepted-trace.json",
				downstream_question_resolutions: [
					{
						question: "Where does resume bootstrap land?",
						resolution: "roadmap-task",
						task_ids: ["TASK-092"],
					},
				],
				requirements: [
					{
						id: "REQ-RESUME-FIRST",
						text: "Implement resume bootstrap first.",
					},
				],
				risks: ["Block deep migration until resume is safe."],
			},
			null,
			2,
		),
	);
	await writeFile(
		join(traceRoot, ".codewiki/validation/decision-pass.json"),
		JSON.stringify(
			{
				profile: "decision",
				verdict: "pass",
				source: ".codewiki/builds/decision/accepted-trace.json",
			},
			null,
			2,
		),
	);
	await writeFile(
		join(traceRoot, ".codewiki/validation/planning-pass.json"),
		JSON.stringify(
			{
				profile: "planning",
				verdict: "pass",
				source: ".codewiki/builds/planning/planned-trace.json",
			},
			null,
			2,
		),
	);
	const traceProject = await loadProject(traceRoot);
	const traceTask = task(
		"TASK-092",
		"in_progress",
		[],
		["src/state/resume-context.ts"],
	);
	const report = {
		counts: { error: 0, warning: 0, information: 0, hint: 0 },
		issues: [],
	};
	const resumeContext = await buildResumeContextForTask(traceProject, {
		task: traceTask,
		selection: {
			task: traceTask,
			source: "explicit",
			artifact_statuses: [],
			skipped: [],
		},
		report,
		roadmapState: null,
		graph: null,
		followUpIntent: "continue trace resume bootstrap",
	});
	assert.match(resumeContext.prompt, /Trace-primary handoff:/);
	assert.match(
		resumeContext.prompt,
		/Source decision build: \.codewiki\/builds\/decision\/accepted-trace\.json/,
	);
	assert.match(
		resumeContext.prompt,
		/Decision gate refs: .*decision-pass\.json/,
	);
	assert.match(
		resumeContext.prompt,
		/Planning gate refs: .*planning-pass\.json/,
	);
	assert.match(resumeContext.prompt, /Approved rows: ROW-001, ROW-002/);
	assert.match(resumeContext.prompt, /KB\/diagram refs: .*trace-graph\.md/);
	assert.match(
		resumeContext.prompt,
		/Risk\/impact summary: .*safe resume context/,
	);
	assert.match(resumeContext.prompt, /Downstream planning resolutions:/);
	assert.match(resumeContext.prompt, /Blockers\/risks:/);
	assert.match(
		resumeContext.prompt,
		/REQ-RESUME-FIRST: Implement resume bootstrap first/,
	);
	assert.match(
		resumeContext.prompt,
		/Bootstrap mode: current Pi extension\/tools remain authoritative/,
	);
	assert.ok(
		resumeContext.source_refs.includes(
			".codewiki/builds/decision/accepted-trace.json",
		),
		"resume source refs should include accepted decision build",
	);
	assert.ok(
		resumeContext.source_refs.includes(
			".codewiki/validation/decision-pass.json",
		),
		"resume source refs should include decision gateway ref",
	);
} finally {
	await rm(traceRoot, { recursive: true, force: true });
}

console.log("✓ resume scheduler smoke passed");
