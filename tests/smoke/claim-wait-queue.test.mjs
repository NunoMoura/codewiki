import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mutateChangeClaims, readyWaitersForSession } from "../../src/application/claims.ts";
import { notifyReadyArtifactWaiters } from "../../src/adapters/pi/artifact-wake.ts";
import { buildGraph } from "../../src/application/graph.ts";

const root = await mkdtemp(join(tmpdir(), "codewiki-claim-wait-"));

const project = {
	root,
	label: "claim-wait-smoke",
	config: {
		project_name: "claim-wait-smoke",
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

const fakeGitCache = { getDirtyPaths: () => [] };

try {
	const holder = await mutateChangeClaims(project, {
		action: "claim",
		mode: "write",
		role: "builder",
		taskId: "TASK-080",
		summary: "Hold claim wait test scope.",
		scopes: [{ layer: "code", path: "src/application/claims.ts" }],
	}, { sessionId: "holder-session", agentName: "Holder" });

	assert.equal(holder.claim.id, "CLAIM-001");
	assert.equal(holder.waiters.length, 0);

	const waiting = await mutateChangeClaims(project, {
		action: "wait",
		mode: "write",
		role: "builder",
		taskId: "TASK-081",
		summary: "Wait for claim wait test scope.",
		scopes: [{ layer: "code", path: "src/application/claims.ts" }],
	}, { sessionId: "waiter-session", agentName: "Waiter" });

	assert.equal(waiting.waiter.id, "WAIT-001");
	assert.equal(waiting.waiter.status, "pending");
	assert.deepEqual(waiting.waiter.blocked_by_claim_ids, [holder.claim.id]);
	assert.equal(waiting.waiters[0].status, "pending");
	assert.match(waiting.summary, /WAIT-001 pending/);

	const heartbeat = await mutateChangeClaims(project, {
		action: "heartbeat",
		claimId: waiting.waiter.id,
		ttl_minutes: 30,
	}, { sessionId: "waiter-session", agentName: "Waiter" });
	assert.match(heartbeat.summary, /1 wait/);
	assert.equal(heartbeat.waiters[0].status, "pending");

	const released = await mutateChangeClaims(project, {
		action: "release",
		claimId: holder.claim.id,
	}, { sessionId: "holder-session", agentName: "Holder" });

	assert.equal(released.claims.length, 0);
	assert.equal(released.waiters[0].id, waiting.waiter.id);
	assert.equal(released.waiters[0].status, "ready");
	assert.deepEqual(released.waiters[0].blocked_by_claim_ids, []);
	assert.match(released.summary, /readied 1 wait/);

	const readyClaim = await mutateChangeClaims(project, {
		action: "claim",
		mode: "write",
		role: "builder",
		taskId: "TASK-081",
		summary: "Claim after wait is ready.",
		scopes: [{ layer: "code", path: "src/application/claims.ts" }],
	}, { sessionId: "waiter-session", agentName: "Waiter" });
	assert.equal(readyClaim.claim.id, "CLAIM-002");

	const claimsFile = JSON.parse(await readFile(join(root, ".codewiki/session/queue.json"), "utf8"));
	const readyForWaiter = readyWaitersForSession(claimsFile, "waiter-session");
	assert.equal(readyForWaiter.length, 1);
	assert.equal(readyForWaiter[0].id, "WAIT-001");
	assert.deepEqual(readyWaitersForSession(claimsFile, "waiter-session", new Set(["WAIT-001"])), []);

	const sentMessages = [];
	const appendedEntries = [];
	const wakeStatuses = [];
	const notified = await notifyReadyArtifactWaiters(
		{
			appendEntry: (type, data) => appendedEntries.push({ type, data }),
			sendUserMessage: (content, options) => sentMessages.push({ content, options }),
		},
		project,
		{
			sessionManager: { getSessionId: () => "waiter-session", getBranch: () => [] },
			ui: { setStatus: (key, value) => wakeStatuses.push({ key, value }) },
		},
		new Set(),
	);
	assert.equal(notified.length, 1);
	assert.equal(appendedEntries[0].type, "codewiki_artifact_wait_wake");
	assert.equal(appendedEntries[0].data.waiter_id, "WAIT-001");
	assert.match(sentMessages[0].content, /CodeWiki artifact wait ready: WAIT-001/);
	assert.deepEqual(sentMessages[0].options, { deliverAs: "followUp" });
	assert.deepEqual(await notifyReadyArtifactWaiters(
		{ appendEntry: () => assert.fail("already notified"), sendUserMessage: () => assert.fail("already notified") },
		project,
		{ sessionManager: { getSessionId: () => "waiter-session", getBranch: () => appendedEntries.map((entry) => ({ type: "custom", customType: entry.type, data: entry.data })) }, ui: { setStatus: () => undefined } },
		new Set(["WAIT-001"]),
	), []);

	const graph = buildGraph({
		project,
		docs: [],
		research: [],
		roadmapEntries: [],
		gitCache: fakeGitCache,
		builds: [],
		validations: [],
		testFiles: [],
		claims: claimsFile,
	});

	const waitNode = graph.nodes.find((node) => node.id === "claim_wait:WAIT-001");
	assert.equal(waitNode.kind, "change_claim_waiter");
	assert.equal(waitNode.status, "ready");
	assert.equal(graph.views.claims.ready_waiter_count, 1);
	assert.equal(graph.views.claims.waiters[0].id, "WAIT-001");
} finally {
	await rm(root, { recursive: true, force: true });
}
