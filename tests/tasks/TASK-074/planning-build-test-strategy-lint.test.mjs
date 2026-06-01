import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lintEvidenceLinks } from "../../../src/state/lint.ts";

const repoRoot = resolve(fileURLToPath(import.meta.url), "../../../..");
const project = { root: repoRoot, config: {} };
const taskEntries = [
	{ id: "TASK-068", status: "closed" },
	{ id: "TASK-071", status: "closed" },
	{ id: "TASK-074", status: "in_progress" },
];

function issueKindsFor(build) {
	return lintEvidenceLinks(project, taskEntries, {
		builds: [
			{
				path: build.path || ".codewiki/builds/planning/test.json",
				kind: "planning_build",
				data: build,
			},
		],
		archivedTaskIds: ["TASK-068", "TASK-071"],
	}).map((issue) => issue.kind);
}

const strategyFreePlanningBuild = {
	schema_version: 2,
	kind: "planning_build",
	source_decision_build: ".codewiki/builds/decision/example.json",
	consumes: { decision: [".codewiki/builds/decision/example.json"] },
	produces: { roadmap: ["TASK-074"] },
	task_ids: ["TASK-074"],
	task_changes: ["Created TASK-074."],
	tdd_plan: [],
	candidate_test_files: [],
	evidence_mapping: [],
};

assert.ok(
	issueKindsFor(strategyFreePlanningBuild).includes(
		"planning-build-missing-test-strategy",
	),
	"planning builds with no strategy/evidence must still warn",
);

const durableRowEvidencePlanningBuild = {
	...strategyFreePlanningBuild,
	decision_row_resolutions: [
		{
			row_id: "ROW-1",
			resolution: "roadmap-task",
			task_ids: ["TASK-074"],
			evidence: "TASK-074 owns regression coverage for the accepted row.",
		},
	],
	downstream_question_resolutions: [
		{
			question: "How is regression coverage verified?",
			resolution: "deferred",
			owner: "maintainers",
			trigger: "future broader lint hardening",
			rationale: "No wider migration needed in this task.",
			evidence: "Deferral has owner, trigger, rationale, and evidence.",
		},
	],
};

assert.ok(
	!issueKindsFor(durableRowEvidencePlanningBuild).includes(
		"planning-build-missing-test-strategy",
	),
	"durable row/question evidence should satisfy planning strategy lint",
);

for (const path of [
	".codewiki/builds/planning/2026-05-31-planned-pi-distribution-correction-resolved.json",
	".codewiki/builds/planning/2026-05-31-planned-pi-distribution-correction.json",
]) {
	const build = JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
	build.path = path;
	assert.ok(
		!issueKindsFor(build).includes("planning-build-missing-test-strategy"),
		`${path} should be covered by durable planning row/question evidence`,
	);
}

console.log("✓ TASK-074 planning-build test strategy lint smoke passed");
