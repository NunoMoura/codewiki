import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessDecisionPropagation } from "../../../src/build/decision-propagation.ts";
import { buildGraph } from "../../../src/state/graph.ts";
import { buildLintReport } from "../../../src/state/lint.ts";
import { codePrompt } from "../../../src/state/prompt.ts";
import {
	buildRoadmapState,
	buildStatusState,
} from "../../../src/state/builders.ts";

const root = await mkdtemp(join(tmpdir(), "codewiki-task-072-propagation-"));

const project = {
	root,
	label: "task-072-propagation-smoke",
	config: {
		project_name: "task-072-propagation-smoke",
		schema_version: 4,
		specs_root: ".codewiki/kb",
		generated_files: [".codewiki/index_graph.json"],
	},
	docsRoot: ".codewiki/kb",
	specsRoot: ".codewiki/kb",
	evidenceRoot: ".codewiki/evidence",
	researchRoot: ".codewiki/research",
	indexPath: ".codewiki/index.md",
	roadmapPath: ".codewiki/roadmap/queue.json",
	roadmapDocPath: ".codewiki/roadmap.md",
	roadmapEventsPath: "",
	metaRoot: ".codewiki",
	viewsRoot: ".codewiki/views",
	graphPath: ".codewiki/index_graph.json",
	lintPath: ".codewiki/index_graph.json",
	roadmapStatePath: ".codewiki/index_graph.json",
	statusStatePath: ".codewiki/index_graph.json",
	eventsPath: "",
};

const fakeGitCache = {
	getDirtyPaths: () => [],
	buildAnchor: (paths) => ({
		head: "task-072-head",
		dirty: false,
		dirty_paths: [],
		paths: Object.fromEntries(paths.map((path) => [path, `oid:${path}`])),
	}),
};

const claims = { version: 1, claims: [] };
const decisionPath = ".codewiki/builds/decision/task-072-decision.json";
const deferredPlanningPath = ".codewiki/builds/planning/task-072-deferred.json";
const mappedPlanningPath = ".codewiki/builds/planning/task-072-mapped.json";

const decision = {
	kind: "decision_build",
	status: "accepted",
	lifecycle: { state: "accepted" },
	diff_table: [
		{
			id: "TASK-MAPPED",
			current_state: "Executable work may be planned.",
			desired_state: "Executable work maps to a roadmap task.",
			rationale: "Task mapping pass fixture.",
			affected_layers: ["code"],
			user_action: "approved",
		},
		{
			id: "SPRINT-MAPPED",
			current_state: "Executable cohort may be planned.",
			desired_state: "Executable cohort maps to a sprint.",
			rationale: "Sprint mapping pass fixture.",
			affected_layers: ["runtime", "graph"],
			user_action: "approved",
		},
		{
			id: "KNOWLEDGE-ONLY",
			current_state: "Docs are ambiguous.",
			desired_state: "Docs are updated only with no code work.",
			rationale: "Knowledge-only pass fixture.",
			affected_layers: ["knowledge"],
			user_action: "approved",
		},
		{
			id: "NOT-APPLICABLE",
			current_state: "A row may be explicitly ruled out.",
			desired_state: "Not-applicable rows have durable disposition evidence.",
			rationale: "Not-applicable pass fixture.",
			affected_layers: ["knowledge"],
			user_action: "approved",
		},
		{
			id: "DAEMON-FOLLOWUP",
			current_state:
				"Daemon execution graph / worker scheduling follow-up can hide in build-only deferral after TASK-070.",
			desired_state:
				"Daemon execution graph / worker scheduling follow-up has durable roadmap or sprint work.",
			rationale: "Build-only deferral block fixture.",
			affected_layers: ["runtime", "graph", "code"],
			user_action: "approved",
		},
	],
	approved_diff_rows: [
		"TASK-MAPPED",
		"SPRINT-MAPPED",
		"KNOWLEDGE-ONLY",
		"NOT-APPLICABLE",
		"DAEMON-FOLLOWUP",
	],
	row_to_kb_mappings: [
		{
			row_id: "KNOWLEDGE-ONLY",
			knowledge_refs: [".codewiki/kb/system/compilers.md"],
			evidence: "Knowledge-only durable disposition.",
		},
		{
			row_id: "NOT-APPLICABLE",
			knowledge_refs: [".codewiki/kb/system/compilers.md"],
			evidence: "Not-applicable durable disposition.",
		},
		{
			row_id: "DAEMON-FOLLOWUP",
			knowledge_refs: [".codewiki/kb/system/graph.md"],
			evidence:
				"Graph docs describe daemon follow-up, but roadmap work is still required.",
		},
	],
	propagation: {
		direction: "system-first",
		downstream_planning_questions: [
			"How should DAEMON-FOLLOWUP continue after TASK-070?",
		],
	},
};

const deferredPlanning = {
	kind: "planning_build",
	status: "accepted",
	path: deferredPlanningPath,
	source_decision_build: decisionPath,
	decision_row_resolutions: [
		{
			row_id: "TASK-MAPPED",
			resolution: "roadmap-task",
			task_ids: ["TASK-123"],
			evidence: "TASK-123 is durable roadmap work.",
			source_refs: ["TASK-123"],
		},
		{
			row_id: "SPRINT-MAPPED",
			resolution: "sprint",
			sprint_ids: ["SPRINT-123"],
			evidence: "SPRINT-123 is durable sprint work.",
			source_refs: ["SPRINT-123"],
		},
		{
			row_id: "KNOWLEDGE-ONLY",
			resolution: "knowledge-only",
			knowledge_refs: [".codewiki/kb/system/compilers.md"],
			evidence: "Knowledge-only row is complete in KB.",
			source_refs: [decisionPath],
		},
		{
			row_id: "NOT-APPLICABLE",
			resolution: "not-applicable",
			knowledge_refs: [".codewiki/kb/system/compilers.md"],
			evidence:
				"Planner ruled this row not applicable with durable KB evidence.",
			source_refs: [decisionPath],
		},
		{
			row_id: "DAEMON-FOLLOWUP",
			resolution: "deferred",
			owner: "runtime-maintainers",
			trigger: "TASK-070 runtime scheduler foundation validates",
			rationale: "Wait for TASK-070 proof before follow-up.",
			evidence:
				"Build-only deferred daemon execution graph / worker scheduling follow-up after TASK-070.",
			source_refs: [
				"TASK-070",
				".codewiki/builds/implementation/2026-05-31-implemented-task-070-runtime-scheduler-foundatio.json",
			],
		},
	],
	downstream_question_resolutions: [
		{
			question: "How should DAEMON-FOLLOWUP continue after TASK-070?",
			resolution: "deferred",
			owner: "runtime-maintainers",
			trigger: "TASK-070 runtime scheduler foundation validates",
			rationale: "Question remains build-only deferred.",
			evidence: "Question deferral has no durable roadmap/sprint work.",
			source_refs: ["TASK-070"],
		},
	],
};

const mappedPlanning = {
	...deferredPlanning,
	path: mappedPlanningPath,
	decision_row_resolutions: deferredPlanning.decision_row_resolutions.map(
		(row) =>
			row.row_id === "DAEMON-FOLLOWUP"
				? {
						row_id: "DAEMON-FOLLOWUP",
						resolution: "roadmap-task",
						task_ids: ["TASK-070"],
						evidence:
							"TASK-070 is durable daemon execution graph / worker scheduling follow-up work.",
						source_refs: ["TASK-070"],
					}
				: row,
	),
	downstream_question_resolutions: [
		{
			question: "How should DAEMON-FOLLOWUP continue after TASK-070?",
			resolution: "roadmap-task",
			task_ids: ["TASK-070"],
			evidence: "TASK-070 owns the follow-up route.",
			source_refs: ["TASK-070"],
		},
	],
};

try {
	await mkdir(join(root, ".codewiki/kb/system"), { recursive: true });

	const deferredAssessment = assessDecisionPropagation(
		decision,
		[deferredPlanning],
		{
			knownTaskIds: ["TASK-070", "TASK-123"],
			knownSprintIds: ["SPRINT-123"],
		},
	);
	const byId = Object.fromEntries(
		deferredAssessment.rows.map((row) => [row.id, row]),
	);
	assert.equal(byId["TASK-MAPPED"].classification, "executable-task-mapped");
	assert.equal(
		byId["SPRINT-MAPPED"].classification,
		"executable-sprint-mapped",
	);
	assert.equal(byId["KNOWLEDGE-ONLY"].classification, "knowledge-only");
	assert.equal(byId["NOT-APPLICABLE"].classification, "not-applicable");
	assert.equal(byId["DAEMON-FOLLOWUP"].classification, "unplanned-gap");
	assert.ok(
		byId["DAEMON-FOLLOWUP"].gaps.some((gap) =>
			gap.includes("executable_requires_task_or_sprint"),
		),
	);

	const mappedAssessment = assessDecisionPropagation(
		decision,
		[mappedPlanning],
		{
			knownTaskIds: ["TASK-070", "TASK-123"],
			knownSprintIds: ["SPRINT-123"],
		},
	);
	assert.deepEqual(mappedAssessment.gaps, []);

	const unrelatedTask = {
		id: "TASK-999",
		title: "Unrelated implementation",
		status: "todo",
		priority: "medium",
		kind: "feature",
		summary: "Unrelated work must not hide accepted decision gaps.",
		spec_paths: [],
		code_paths: ["src/unrelated.ts"],
		research_ids: [],
		labels: [],
		goal: { outcome: "", acceptance: [], non_goals: [], verification: [] },
		delta: { desired: "", current: "", closure: "" },
	};
	const lint = buildLintReport(root, project, [], [], []);
	const graph = buildGraph({
		project,
		docs: [],
		research: [],
		roadmapEntries: [unrelatedTask],
		roadmapSprints: [
			{
				id: "SPRINT-123",
				title: "Mapped sprint",
				status: "active",
				outcome: "Fixture sprint.",
				task_ids: ["TASK-123"],
			},
		],
		gitCache: fakeGitCache,
		builds: [
			{
				path: decisionPath,
				kind: "decision_build",
				status: "accepted",
				data: decision,
			},
			{
				path: deferredPlanningPath,
				kind: "planning_build",
				status: "accepted",
				data: deferredPlanning,
			},
		],
		validations: [],
		testFiles: [],
		claims,
		lintReport: lint,
	});
	assert.equal(graph.views.decision_propagation.residual_count, 2);
	assert.ok(
		graph.views.decision_propagation.residuals.some(
			(row) => row.id === "DAEMON-FOLLOWUP",
		),
	);
	assert.equal(graph.views.reconciliation.next_action.loop, "planning");

	const roadmapState = buildRoadmapState(
		project,
		[unrelatedTask],
		graph,
		lint,
		[],
		[],
	);
	const status = buildStatusState(
		project,
		root,
		fakeGitCache,
		[],
		graph,
		[],
		lint,
		roadmapState,
		[],
		{},
		claims,
	);
	assert.equal(status.next_step.kind, "reconciliation:planning");
	assert.equal(status.decision_propagation.residual_count, 2);
	assert.ok(
		status.direction.some((line) => line.includes("Decision propagation gaps")),
	);

	const prompt = codePrompt(
		project,
		graph,
		lint,
		unrelatedTask,
		"No closure evidence.",
		null,
		"Proceed with unrelated task.",
	);
	assert.match(prompt, /Decision propagation blockers/);
	assert.match(prompt, /DAEMON-FOLLOWUP/);
} finally {
	await rm(root, { recursive: true, force: true });
}

console.log("✓ TASK-072 decision propagation gaps smoke passed");
