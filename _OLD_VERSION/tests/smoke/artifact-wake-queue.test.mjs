import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	claimsFilePath,
	mutateChangeClaims,
	pendingWakeNotificationsForSession,
} from "../../src/session/claims.ts";
import { notifyReadyArtifactWaiters } from "../../src/adapters/pi/artifact-wake.ts";

function project(root) {
	return {
		root,
		label: "artifact-wake-queue-smoke",
		config: { project_name: "artifact-wake-queue-smoke", schema_version: 4 },
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
}

async function readQueue(proj) {
	return JSON.parse(await readFile(claimsFilePath(proj), "utf8"));
}

async function writeQueue(proj, queue) {
	await writeFile(claimsFilePath(proj), JSON.stringify(queue, null, 2) + "\n");
}

async function withProject(fn) {
	const root = await mkdtemp(join(tmpdir(), "codewiki-artifact-wake-"));
	const proj = project(root);
	try {
		await fn(proj);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

await withProject(async (proj) => {
	const holder = await mutateChangeClaims(proj, {
		action: "claim",
		mode: "write",
		role: "builder",
		taskId: "TASK-100",
		summary: "Hold wake queue scope.",
		scopes: [{ layer: "code", path: "src/session/claims.ts" }],
	}, { sessionId: "holder", agentName: "Holder" });
	assert.equal(holder.claim.id, "CLAIM-001");

	const waiting = await mutateChangeClaims(proj, {
		action: "wait",
		mode: "write",
		role: "builder",
		taskId: "TASK-101",
		summary: "Wait for wake queue scope.",
		scopes: [{ layer: "code", path: "src/session/claims.ts" }],
	}, { sessionId: "waiter", agentName: "Waiter" });
	assert.equal(waiting.waiter.status, "pending");
	assert.equal((await readQueue(proj)).wake_notifications.length, 0);

	await assert.rejects(
		() => mutateChangeClaims(proj, {
			action: "claim",
			mode: "write",
			summary: "Conflicting claim.",
			scopes: [{ layer: "code", path: "src/session/claims.ts" }],
		}, { sessionId: "other", agentName: "Other" }),
		/wiki_artifact_status conflict/,
	);

	const heartbeat = await mutateChangeClaims(proj, {
		action: "heartbeat",
		claimId: "CLAIM-001",
		ttl_minutes: 45,
	}, { sessionId: "holder", agentName: "Holder" });
	assert.match(heartbeat.summary, /extended 1 holder/);
	assert.equal(heartbeat.claims[0].id, "CLAIM-001");

	const released = await mutateChangeClaims(proj, {
		action: "release",
		claimId: "CLAIM-001",
	}, { sessionId: "holder", agentName: "Holder" });
	assert.equal(released.waiters[0].status, "ready");
	const queue = await readQueue(proj);
	assert.equal(queue.wake_notifications.length, 1);
	assert.equal(queue.wake_notifications[0].id, "WAKE-001");
	assert.equal(queue.wake_notifications[0].waiter_id, "WAIT-001");
	assert.equal(queue.wake_notifications[0].reason, "release");
	assert.ok(queue.wake_notifications[0].source_refs.includes(".codewiki/roadmap/tasks/TASK-101/task.json"));
	assert.match(queue.wake_notifications[0].next_action_intent, /wiki_resume_context/);

	const sentMessages = [];
	const appendedEntries = [];
	const notified = await notifyReadyArtifactWaiters(
		{
			appendEntry: (type, data) => appendedEntries.push({ type, data }),
			sendUserMessage: (content, options) => sentMessages.push({ content, options }),
		},
		proj,
		{
			sessionManager: { getSessionId: () => "waiter", getBranch: () => [] },
			ui: { setStatus: () => undefined },
		},
		new Set(),
	);
	assert.equal(notified.length, 1);
	assert.equal(appendedEntries[0].data.wake_id, "WAKE-001");
	assert.deepEqual(appendedEntries[0].data.source_refs, queue.wake_notifications[0].source_refs);
	assert.match(sentMessages[0].content, /Resume through wiki_resume_context/);
	assert.equal((await readQueue(proj)).wake_notifications[0].status, "delivered");
});

await withProject(async (proj) => {
	await mutateChangeClaims(proj, {
		action: "claim",
		mode: "write",
		role: "builder",
		taskId: "TASK-200",
		summary: "Stale holder.",
		scopes: [{ layer: "build", ref: ".codewiki/builds/implementation/stale.json" }],
	}, { sessionId: "holder", agentName: "Holder" });
	await mutateChangeClaims(proj, {
		action: "wait",
		mode: "write",
		role: "validator",
		taskId: "TASK-201",
		summary: "Wait for stale holder expiry.",
		scopes: [{ layer: "build", ref: ".codewiki/builds/implementation/stale.json" }],
	}, { sessionId: "waiter", agentName: "Waiter" });
	const queue = await readQueue(proj);
	queue.claims[0].expires_at = new Date(Date.now() - 60_000).toISOString();
	await writeQueue(proj, queue);
	const listed = await mutateChangeClaims(proj, { action: "list" }, { sessionId: "observer", agentName: "Observer" });
	assert.equal(listed.waiters[0].status, "ready");
	const refreshed = await readQueue(proj);
	assert.equal(refreshed.claims[0].status, "expired");
	assert.equal(refreshed.wake_notifications[0].reason, "expiry");
	assert.equal(pendingWakeNotificationsForSession(refreshed, "waiter").length, 1);
});

await withProject(async (proj) => {
	const waiting = await mutateChangeClaims(proj, {
		action: "wait",
		mode: "write",
		role: "builder",
		taskId: "TASK-300",
		summary: "Immediate ready wait to cancel.",
		scopes: [{ layer: "roadmap", task_id: "TASK-300" }],
	}, { sessionId: "waiter", agentName: "Waiter" });
	assert.equal(waiting.waiter.status, "ready");
	assert.equal((await readQueue(proj)).wake_notifications[0].status, "pending");
	await mutateChangeClaims(proj, {
		action: "release",
		claimId: "WAIT-001",
	}, { sessionId: "waiter", agentName: "Waiter" });
	const cancelledQueue = await readQueue(proj);
	assert.equal(cancelledQueue.waiters[0].status, "cancelled");
	assert.equal(cancelledQueue.wake_notifications[0].status, "cancelled");
});

console.log("✓ artifact wake queue smoke passed");
