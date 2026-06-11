import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
	CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE,
	buildPostGatewayContextRefreshRequest,
	contextRefreshObserverPercentAfterCompaction,
	shouldTriggerCodewikiThresholdRefresh,
} from "../../../src/adapters/pi/compaction.ts";
import {
	findLastStableCheckpointIndex,
	projectCodewikiContextMessages,
	sourceBackedProjectionMessage,
} from "../../../src/adapters/pi/context-projection.ts";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

function readPackageJson() {
	return JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
}

function sourceFilePaths(root) {
	const out = [];
	for (const name of readdirSync(root)) {
		const path = resolve(root, name);
		const stat = statSync(path);
		if (stat.isDirectory()) out.push(...sourceFilePaths(path));
		else if (/\.(ts|mts|cts|js|mjs|cjs)$/.test(name)) out.push(path);
	}
	return out;
}

function resumeFixture(taskId = "TASK-127") {
	return {
		project_label: "task-127-fixture",
		repo_root: "/repo",
		prompt: "Implement TASK-127 from bounded source refs.",
		task: {
			id: taskId,
			title: "Materialize context-boundary constraints",
		},
		selection: {},
		preflight: { color: "green", errors: 0, warnings: 0, total: 0 },
		evidence: "source-backed evidence",
		follow_up_intent: "",
		context_path: `.codewiki/roadmap/tasks/${taskId}/context.json`,
		source_refs: [
			`.codewiki/roadmap/tasks/${taskId}/context.json`,
			".codewiki/builds/implementation/impl.json",
			".codewiki/validation/impl-block.json",
		],
		graph_lens: `task:${taskId}`,
		expected_output: "Keep task context through refresh boundaries.",
		constraints: {
			non_goals: ["Do not weaken fresh validation independence."],
			runtime_constraints: [
				"Do not compact again every turn while already over threshold.",
				"Return gate feedback to originating compiler context.",
			],
		},
		blockers: [],
		artifact_status: [
			{
				status: "in-use",
				artifact: { task_id: taskId },
			},
		],
		content_evidence_requirements: ["source_refs", "artifact_status"],
	};
}

const projection = sourceBackedProjectionMessage(resumeFixture());
assert.match(
	projection.content,
	/Active runtime constraints: Do not compact again every turn/,
	"source-backed projection should carry bounded active runtime constraints",
);
const activeTurnMessages = [
	{ role: "user", content: "Start TASK-127 implementation." },
	projection,
	{ role: "assistant", content: "I found the refresh bug." },
	{ role: "user", content: "Proceed without losing task state." },
];
assert.equal(
	findLastStableCheckpointIndex(activeTurnMessages),
	null,
	"hidden source-backed projections are not durable checkpoints that prune live chat",
);
const projected = projectCodewikiContextMessages(
	activeTurnMessages,
	sourceBackedProjectionMessage(resumeFixture()),
);
assert.equal(projected.pruned, false);
assert.ok(
	projected.messages.some(
		(message) =>
			message.role === "user" && /Start TASK-127/.test(message.content),
	),
	"context projection must preserve uncheckpointed compiler-loop intent below the projection",
);
assert.equal(
	projected.messages.filter(
		(message) => message.customType === projection.customType,
	).length,
	1,
	"context projection should replace older projection copies with one bounded source-backed packet",
);

const kickoff = {
	role: "custom",
	customType: CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE,
	content:
		"## CodeWiki Auto-Pickup Kickoff\nSource refs:\n- .codewiki/builds/implementation/impl.json",
};
const checkpointedMessages = [
	{ role: "user", content: "Old pre-boundary discussion." },
	kickoff,
	{ role: "assistant", content: "Resumed from source refs." },
	{ role: "user", content: "Continue compiler loop." },
];
assert.equal(
	findLastStableCheckpointIndex(checkpointedMessages),
	1,
	"visible CodeWiki kickoff remains a durable boundary after source refs are externalized",
);
const checkpointProjection = projectCodewikiContextMessages(
	checkpointedMessages,
	sourceBackedProjectionMessage(resumeFixture()),
);
assert.equal(checkpointProjection.pruned, true);
assert.equal(
	checkpointProjection.messages.some((message) =>
		/Old pre-boundary/.test(message.content),
	),
	false,
	"projection may prune only content before a real durable source-backed kickoff boundary",
);

const postCompactionObserver = contextRefreshObserverPercentAfterCompaction(
	86,
	null,
);
assert.equal(
	shouldTriggerCodewikiThresholdRefresh(
		{ percent: 87 },
		postCompactionObserver,
		80,
	),
	false,
	"CodeWiki compaction must not re-enter threshold refresh once per turn while usage remains above threshold",
);
assert.equal(
	shouldTriggerCodewikiThresholdRefresh(
		{ percent: 87 },
		contextRefreshObserverPercentAfterCompaction(86, 42),
		80,
	),
	true,
	"after usage drops below threshold, a later crossing can request refresh again",
);

const failedGateFeedback = buildPostGatewayContextRefreshRequest({
	profile: "implementation",
	verdict: "fail",
	taskId: "TASK-127",
	source: ".codewiki/builds/implementation/task-127.json",
	validationRef: ".codewiki/validation/task-127-fail.json",
});
assert.equal(
	failedGateFeedback.reason,
	"implementation-gateway-fail-feedback-boundary",
);
assert.deepEqual(failedGateFeedback.sourceRefs, [
	".codewiki/builds/implementation/task-127.json",
	".codewiki/validation/task-127-fail.json",
]);
assert.match(failedGateFeedback.followUpIntent, /Gate feedback source refs/);
assert.match(
	failedGateFeedback.followUpIntent,
	/Resume originating compiler loop/,
	"fail/block feedback must route back to the spawning compiler context rather than detach into validator chat",
);

const packageJson = readPackageJson();
for (const dependencyField of [
	"dependencies",
	"devDependencies",
	"peerDependencies",
]) {
	assert.equal(
		Object.hasOwn(packageJson[dependencyField] ?? {}, "pi-lens"),
		false,
		`CodeWiki package must not require pi-lens through ${dependencyField}`,
	);
}
for (const sourcePath of sourceFilePaths(resolve(repoRoot, "src"))) {
	const source = readFileSync(sourcePath, "utf8");
	assert.doesNotMatch(
		source,
		/from\s+["'][^"']*pi-lens|require\(["'][^"']*pi-lens|\.pi-lens|node_modules\/pi-lens/,
		`${sourcePath} must not import or treat PiLens files as package source`,
	);
}

console.log("✓ TASK-127 context-boundary refresh regression passed");
