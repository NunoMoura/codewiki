import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildSessionHandoffPayload,
	executeSessionHandoffFromTool,
	queueSessionHandoffFollowUp,
	runSessionHandoffCommand,
	stageSessionHandoff,
} from "../../src/adapters/pi/tools/session-handoff.ts";

const root = await mkdtemp(join(tmpdir(), "codewiki-session-handoff-"));

const project = {
	root,
	label: "session-handoff-smoke",
	config: {
		project_name: "session-handoff-smoke",
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
	configPath: ".codewiki/config.json",
};

try {
	const input = {
		mode: "new-session",
		taskId: "TASK-074",
		buildRef: ".codewiki/builds/implementation/task-074.json",
		profile: "implementation",
		reason: "Implementation validation requires fresh context.",
		handoff_refs: [".codewiki/kb/system/adapters.md"],
		expected_output: "fresh validation report",
	};
	const payload = buildSessionHandoffPayload(project, input);
	assert.equal(payload.kind, "codewiki_session_handoff");
	assert.equal(payload.context_boundary, "new_session");
	assert.ok(payload.input_refs.includes("TASK-074"));
	assert.ok(payload.input_refs.includes(input.buildRef));
	assert.match(payload.kickoff_prompt, /Do not rely on previous chat context/);
	assert.match(payload.kickoff_prompt, /codewiki_state/);

	const toolStaged = await stageSessionHandoff(project, input);
	assert.match(toolStaged.relativePath, /^\.codewiki\/runtime\/session-handoffs\/HANDOFF-/);
	assert.match(toolStaged.command, /^\/wiki-session-handoff \.codewiki\/runtime\/session-handoffs\/HANDOFF-/);

	const toolResult = await executeSessionHandoffFromTool(
		toolStaged,
		{ compact: () => assert.fail("new-session handoff should not compact") },
	);
	assert.equal(toolResult.action, "staged");
	assert.equal(toolResult.command, toolStaged.command);
	assert.equal(toolResult.auto_queue, false);
	assert.match(toolResult.reason, /ctx\.newSession/);
	assert.match(toolResult.reason, /sendUserMessage follow-ups do not execute extension commands/);
	const queuedFollowUps = [];
	const queued = queueSessionHandoffFollowUp(
		{ sendUserMessage: (content, options) => queuedFollowUps.push({ content, options }) },
		toolResult.command,
		{ autoQueue: toolResult.auto_queue },
	);
	assert.equal(queued, false);
	assert.deepEqual(queuedFollowUps, []);
	const toolQueued = JSON.parse(await readFile(toolStaged.absolutePath, "utf8"));
	assert.equal(toolQueued.status, "queued");

	const resetToolStaged = await stageSessionHandoff(project, { ...input, mode: "context-refresh", reason: "Context refresh should keep a visible tool result." });
	let toolCompactCalled = false;
	const resetToolResult = await executeSessionHandoffFromTool(
		resetToolStaged,
		{ compact: () => { toolCompactCalled = true; } },
	);
	assert.equal(resetToolResult.action, "staged");
	assert.equal(resetToolResult.command, resetToolStaged.command);
	assert.equal(resetToolResult.auto_queue, false);
	assert.match(resetToolResult.reason, /tool result/);
	assert.match(resetToolResult.reason, /ctx\.compact/);
	assert.equal(toolCompactCalled, false, "tool-context context-reset should not call compact directly");
	const resetQueuedFollowUps = [];
	const resetQueued = queueSessionHandoffFollowUp(
		{ sendUserMessage: (content, options) => resetQueuedFollowUps.push({ content, options }) },
		resetToolResult.command,
		{ autoQueue: resetToolResult.auto_queue },
	);
	assert.equal(resetQueued, false, "context_refresh boundary should not auto-queue because compact can hide the result");
	assert.deepEqual(resetQueuedFollowUps, []);
	const resetToolQueued = JSON.parse(await readFile(resetToolStaged.absolutePath, "utf8"));
	assert.equal(resetToolQueued.status, "queued");

	const commandStaged = await stageSessionHandoff(project, input);
	let waited = false;
	let capturedParentSession;
	let customEntry;
	let replacementPrompt;
	let compactInstructions;
	const commandCtx = {
		cwd: root,
		waitForIdle: async () => { waited = true; },
		sessionManager: { getSessionFile: () => "/tmp/parent-session.jsonl" },
		ui: { notify: () => undefined },
		compact: ({ customInstructions }) => { compactInstructions = customInstructions; },
		newSession: async (options) => {
			capturedParentSession = options.parentSession;
			await options.setup({ appendCustomEntry: (type, data) => { customEntry = { type, data }; } });
			await options.withSession({ sendUserMessage: async (prompt) => { replacementPrompt = prompt; } });
			return { cancelled: false };
		},
	};
	const result = await runSessionHandoffCommand(commandStaged.relativePath, commandCtx);
	assert.equal(result.cancelled, false);
	assert.equal(waited, true);
	assert.equal(capturedParentSession, "/tmp/parent-session.jsonl");
	assert.equal(customEntry.type, "codewiki_session_handoff");
	assert.match(replacementPrompt, /fresh validation report/);

	const commandCompleted = JSON.parse(await readFile(commandStaged.absolutePath, "utf8"));
	assert.equal(commandCompleted.status, "completed");

	const resetCommandStaged = await stageSessionHandoff(project, { ...input, mode: "context-refresh", reason: "Command context refresh should compact." });
	compactInstructions = undefined;
	const resetCommandResult = await runSessionHandoffCommand(resetCommandStaged.relativePath, commandCtx);
	assert.equal(resetCommandResult.cancelled, false);
	assert.match(compactInstructions, /Command context refresh should compact/);
	const resetCommandCompleted = JSON.parse(await readFile(resetCommandStaged.absolutePath, "utf8"));
	assert.equal(resetCommandCompleted.status, "completed");

	const latestStaged = await stageSessionHandoff(project, { ...input, reason: "Latest queued handoff should run without path." });
	replacementPrompt = undefined;
	const latestResult = await runSessionHandoffCommand("", commandCtx);
	assert.equal(latestResult.cancelled, false);
	assert.equal(latestResult.payload.id, latestStaged.payload.id);
	assert.match(replacementPrompt, /Latest queued handoff/);
	const latestCompleted = JSON.parse(await readFile(latestStaged.absolutePath, "utf8"));
	assert.equal(latestCompleted.status, "completed");

	const failingStaged = await stageSessionHandoff(project, { ...input, reason: "New session throws." });
	const failingCtx = {
		...commandCtx,
		newSession: async () => { throw new Error("newSession failed"); },
	};
	await assert.rejects(() => runSessionHandoffCommand(failingStaged.relativePath, failingCtx), /newSession failed/);
	const failed = JSON.parse(await readFile(failingStaged.absolutePath, "utf8"));
	assert.equal(failed.status, "failed");

	assert.equal(queueSessionHandoffFollowUp({ sendUserMessage: () => assert.fail("no command should not queue") }, undefined), false);
	assert.equal(queueSessionHandoffFollowUp({ sendUserMessage: () => assert.fail("disabled autoQueue should not queue") }, toolStaged.command, { autoQueue: false }), false);

	const badRelativePath = ".codewiki/runtime/session-handoffs/bad.json";
	await writeFile(join(root, badRelativePath), JSON.stringify({ kind: "not_codewiki" }) + "\n", "utf8");
	await assert.rejects(() => runSessionHandoffCommand(badRelativePath, commandCtx), /Invalid CodeWiki session boundary/);
} finally {
	await rm(root, { recursive: true, force: true });
}
