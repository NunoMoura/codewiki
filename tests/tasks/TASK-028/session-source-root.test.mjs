#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const thisTest = relative(repoRoot, fileURLToPath(import.meta.url)).replaceAll("\\", "/");
const legacyTextAllowed = new Set([
	thisTest,
	"tests/smoke/package-smoke.test.mjs",
]);
const requiredSessionFiles = [
	"src/session/types.ts",
	"src/session/links.ts",
	"src/session/runtime.ts",
	"src/session/claims.ts",
	"src/session/worktree-isolation.ts",
	"src/session/tool.ts",
	"src/session/artifact-status-tool.ts",
];
const removedSessionOwnerPaths = [
	"src/domain/session/types.ts",
	"src/domain/session/links.ts",
	"src/domain/session/worktree-isolation.ts",
	"src/domain/shared/session.ts",
	"src/application/session.ts",
	"src/application/claims.ts",
	"src/application/worktree-isolation.ts",
	"src/application/tools/session.ts",
	"src/application/tools/artifact-status.ts",
];
const removedSessionOwnerAbsPaths = removedSessionOwnerPaths.map((path) => resolve(repoRoot, path));

for (const path of requiredSessionFiles) {
	assert.ok(existsSync(resolve(repoRoot, path)), `TASK-028 owner path missing: ${path}`);
}
for (const path of removedSessionOwnerPaths) {
	assert.equal(existsSync(resolve(repoRoot, path)), false, `Legacy session owner path remains: ${path}`);
}

const sessionTypes = await import(pathToFileURL(resolve(repoRoot, "src", "session", "types.ts")).href);
const sessionLinks = await import(pathToFileURL(resolve(repoRoot, "src", "session", "links.ts")).href);
const sessionRuntime = await import(pathToFileURL(resolve(repoRoot, "src", "session", "runtime.ts")).href);
const sessionClaims = await import(pathToFileURL(resolve(repoRoot, "src", "session", "claims.ts")).href);
const worktreeIsolation = await import(pathToFileURL(resolve(repoRoot, "src", "session", "worktree-isolation.ts")).href);
const sessionTool = await import(pathToFileURL(resolve(repoRoot, "src", "session", "tool.ts")).href);
const artifactStatusTool = await import(pathToFileURL(resolve(repoRoot, "src", "session", "artifact-status-tool.ts")).href);

assert.deepEqual(sessionTypes.TASK_SESSION_ACTION_VALUES, ["focus", "progress", "blocked", "done", "spawn", "note", "clear"], "session action values must stay stable");
assert.deepEqual(sessionTypes.ARTIFACT_STATUS_ACTION_VALUES, ["mark", "wait", "release", "heartbeat", "list"], "artifact-status action values must stay stable");
assert.deepEqual(sessionTypes.CHANGE_CLAIM_ACTION_VALUES, ["claim", "wait", "release", "heartbeat", "list"], "change-claim action values must stay stable");
assert.deepEqual(sessionTypes.CHANGE_CLAIM_MODE_VALUES, ["read", "write"], "claim modes must stay stable");
assert.deepEqual(sessionTypes.CHANGE_CLAIM_ROLE_VALUES, ["builder", "validator", "publisher", "observer"], "claim roles must stay stable");
assert.deepEqual(sessionTypes.WORKFLOW_LOOP_VALUES, ["decision", "planning", "implementation", "validation", "observe"], "workflow loop values must stay stable");

assert.equal(typeof sessionLinks.normalizeTaskSessionLinkInput, "function", "Task-session normalization should be owned by src/session/links.ts");
assert.equal(typeof sessionRuntime.recordSessionTaskAction, "function", "Session focus/update use cases should be owned by src/session/runtime.ts");
assert.equal(typeof sessionClaims.mutateChangeClaims, "function", "Artifact-status claim file mutation should be owned by src/session/claims.ts");
assert.equal(typeof sessionClaims.mutateArtifactStatuses, "function", "Artifact-status tool mapping should be owned by src/session/claims.ts");
assert.equal(typeof worktreeIsolation.createRoleWorktreePlan, "function", "Worktree-isolation helpers should be owned by src/session/worktree-isolation.ts");
assert.equal(typeof sessionTool.executeCodewikiSessionTool, "function", "codewiki_session execution should be owned by src/session/tool.ts");
assert.equal(typeof artifactStatusTool.executeCodewikiArtifactStatusTool, "function", "codewiki_artifact_status execution should be owned by src/session/artifact-status-tool.ts");

const claimsSource = readFileSync(resolve(repoRoot, "src", "session", "claims.ts"), "utf8");
assert.match(claimsSource, /function normalizeClaimRecord/, "Claim record normalization should live in src/session/claims.ts");
assert.match(claimsSource, /function detectClaimConflicts|export function detectClaimConflicts/, "Claim conflict detection should live in src/session/claims.ts");
assert.match(claimsSource, /function ttlMinutes/, "Artifact-status TTL handling should live in src/session/claims.ts");
assert.match(claimsSource, /function heartbeatClaims/, "Claim heartbeat behavior should live in src/session/claims.ts");
assert.match(claimsSource, /function releaseClaims/, "Claim release behavior should live in src/session/claims.ts");
assert.doesNotMatch(claimsSource, /domain\/session|application\/claims|application\/worktree-isolation/, "Session claims runtime should not depend on old session owner paths");

const link = sessionLinks.normalizeTaskSessionLinkInput({
	taskId: "TASK-999",
	action: "focus",
	summary: "Focus smoke.",
	filesTouched: ["b.ts", "b.ts", "a.ts"],
	spawnedTaskIds: ["TASK-998", "TASK-998"],
	cursor: { active_loop: "implementation", input_refs: ["a", "a"], handoff_refs: ["b", "b"] },
});
assert.equal(link.action, "focus");
assert.deepEqual(link.filesTouched, ["b.ts", "a.ts"]);
assert.deepEqual(link.spawnedTaskIds, ["TASK-998"]);
assert.deepEqual(link.cursor.input_refs, ["a"]);
assert.deepEqual(link.cursor.handoff_refs, ["b"]);
assert.equal(sessionLinks.findLatestTaskSessionLink([
	{ type: "custom", customType: "ignored", data: {} },
	{ type: "custom", customType: "codewiki.task-link", timestamp: "2026-05-26T00:00:00.000Z", data: { taskId: "TASK-999", action: "note", summary: "latest" } },
]).action, "note");

const runtimeRoot = mkdtempSync(resolve(tmpdir(), "codewiki-task-028-"));
try {
	mkdirSync(resolve(runtimeRoot, ".codewiki/roadmap"), { recursive: true });
	writeFileSync(resolve(runtimeRoot, ".codewiki/roadmap/queue.json"), JSON.stringify({
		version: 2,
		updated: "2026-05-26T00:00:00.000Z",
		order: ["TASK-999"],
		tasks: {
			"TASK-999": {
				id: "TASK-999",
				title: "Session smoke task",
				status: "in_progress",
				priority: "high",
				kind: "migration",
				summary: "Session smoke task.",
				spec_paths: [],
				code_paths: [],
				research_ids: [],
				labels: [],
			},
		},
	}, null, 2));
	const project = {
		root: runtimeRoot,
		label: "task-028-smoke",
		config: { project_name: "task-028-smoke" },
		metaRoot: ".codewiki",
		roadmapPath: ".codewiki/roadmap/queue.json",
		graphPath: ".codewiki/index_graph.json",
	};
	const entries = [];
	const status = new Map();
	const ports = {
		fileStore: {},
		runtime: {
			setSessionName: (name) => { status.set("session-name", name); },
			appendEntry: (type, data) => entries.push({ type: "custom", customType: type, data, timestamp: new Date().toISOString() }),
		},
		sessionStore: { getSessionBranch: () => entries },
		notifier: { notify: () => undefined, setStatus: (key, value) => status.set(key, value) },
	};

	const focus = await sessionTool.executeCodewikiSessionTool(project, { action: "focus", taskId: "TASK-999", summary: "Focus session.", setSessionName: true }, ports);
	assert.equal(focus.summary, "codewiki session: focus TASK-999");
	assert.equal(focus.renamed, true);
	assert.equal(status.get("codewiki-focus"), "TASK-999 focused: Session smoke task");
	assert.equal(status.get("session-name"), "TASK-999 Session smoke task");
	const note = await sessionTool.executeCodewikiSessionTool(project, { action: "note", summary: "Note active session.", files_touched: ["src/session/tool.ts"] }, ports);
	assert.equal(note.summary, "codewiki session: note TASK-999");
	assert.equal(note.session.focused_task_id, "TASK-999");
	const clear = await sessionTool.executeCodewikiSessionTool(project, { action: "clear", summary: "Clear focus." }, ports);
	assert.equal(clear.summary, "codewiki session: focus cleared");
	assert.equal(clear.session.focused_task_id, null);

	const holder = await artifactStatusTool.executeCodewikiArtifactStatusTool(project, {
		action: "mark",
		taskId: "TASK-999",
		summary: "Hold session owner file.",
		mode: "write",
		role: "builder",
		scopes: [{ layer: "code", path: "src/session/claims.ts" }],
		refresh: false,
	}, { sessionId: "holder-session", agentName: "Holder" });
	assert.equal(holder.claim.id, "CLAIM-001");
	assert.equal(holder.artifact_statuses[0].status, "in-use");
	assert.match(holder.artifact_summary, /in-use=1/);
	await assert.rejects(
		() => artifactStatusTool.executeCodewikiArtifactStatusTool(project, {
			action: "mark",
			taskId: "TASK-998",
			summary: "Conflicting session owner file.",
			mode: "write",
			role: "builder",
			scopes: [{ layer: "code", path: "src/session/claims.ts" }],
			refresh: false,
		}, { sessionId: "other-session", agentName: "Other" }),
		/codewiki_artifact_status conflict/i,
	);
	const waiter = await artifactStatusTool.executeCodewikiArtifactStatusTool(project, {
		action: "wait",
		taskId: "TASK-998",
		summary: "Wait for session owner file.",
		mode: "write",
		role: "validator",
		scopes: [{ layer: "code", path: "src/session/claims.ts" }],
		refresh: false,
	}, { sessionId: "waiter-session", agentName: "Waiter" });
	assert.equal(waiter.waiter.id, "WAIT-001");
	assert.equal(waiter.waiter.status, "pending");
	assert.deepEqual(waiter.waiter.blocked_by_claim_ids, ["CLAIM-001"]);
	const heartbeat = await artifactStatusTool.executeCodewikiArtifactStatusTool(project, { action: "heartbeat", recordId: waiter.waiter.id, ttl_minutes: 30, refresh: false }, { sessionId: "waiter-session", agentName: "Waiter" });
	assert.equal(heartbeat.waiters.find((item) => item.id === waiter.waiter.id).status, "pending");
	assert.match(heartbeat.artifact_summary, /in-use=1/);
	const release = await artifactStatusTool.executeCodewikiArtifactStatusTool(project, { action: "release", recordId: holder.claim.id, refresh: false }, { sessionId: "holder-session", agentName: "Holder" });
	assert.equal(release.waiters.find((item) => item.id === waiter.waiter.id).status, "ready");

	const plan = worktreeIsolation.createRoleWorktreePlan(project, { task_id: "TASK-999", role: "validator", session_id: "validator-session", base_sha: "abc1234" });
	assert.equal(plan.branch, "codewiki/TASK-999/validator/validator-session");
	assert.match(plan.metadata.notes, /factory=role-worktree/);
} finally {
	rmSync(runtimeRoot, { recursive: true, force: true });
}

const importViolations = [];
for (const filePath of walkCodeFiles(["src", "scripts", "tests"])) {
	const rel = relative(repoRoot, filePath).replaceAll("\\", "/");
	const source = readFileSync(filePath, "utf8");
	for (const specifier of importSpecifiers(source)) {
		if (pointsAtRemovedSessionOwner(filePath, specifier)) {
			importViolations.push(`${rel}: ${specifier}`);
		}
	}
	if (!legacyTextAllowed.has(rel)) {
		assert.equal(source.includes("src/domain/session/"), false, `${rel} still references legacy session domain path text`);
		assert.equal(source.includes("src/domain/shared/session.ts"), false, `${rel} still references legacy shared session path text`);
		assert.equal(source.includes("src/application/session.ts"), false, `${rel} still references legacy session runtime path text`);
		assert.equal(source.includes("src/application/claims.ts"), false, `${rel} still references legacy claims runtime path text`);
		assert.equal(source.includes("src/application/worktree-isolation.ts"), false, `${rel} still references legacy worktree isolation path text`);
		assert.equal(source.includes("src/application/tools/session.ts"), false, `${rel} still references legacy session tool path text`);
		assert.equal(source.includes("src/application/tools/artifact-status.ts"), false, `${rel} still references legacy artifact-status tool path text`);
	}
}
assert.deepEqual(importViolations, [], "Source, tests, and scripts should not import removed session owner paths");

const sessionAdapterSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "tools", "session.ts"), "utf8");
const artifactAdapterSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "tools", "artifact-status.ts"), "utf8");
const schemaSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "schemas.ts"), "utf8");
const resumeCommandSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "commands", "resume.ts"), "utf8");
const packageSmokeSource = readFileSync(resolve(repoRoot, "tests", "smoke", "package-smoke.test.mjs"), "utf8");
const toolCatalogSource = readFileSync(resolve(repoRoot, "skills", "codewiki", "references", "tool-catalog.md"), "utf8");

assert.match(sessionAdapterSource, /session\/tool\.ts/, "Pi session tool should route codewiki_session through src/session/tool.ts");
assert.match(artifactAdapterSource, /session\/artifact-status-tool\.ts/, "Pi artifact-status tool should route codewiki_artifact_status through src/session/artifact-status-tool.ts");
assert.match(schemaSource, /session\/types\.ts/, "Pi schemas should read session values from src/session/types.ts");
assert.match(resumeCommandSource, /session\/claims\.ts/, "Resume command should read artifact status behavior from src/session/claims.ts");
assert.match(packageSmokeSource, /session source-root tool module/, "Package smoke should guard session source-root delegation");
assert.match(toolCatalogSource, /src\/session\/tool\.ts/, "Skill-facing tool catalog should point codewiki_session at src/session/tool.ts");
assert.match(toolCatalogSource, /src\/session\/artifact-status-tool\.ts/, "Skill-facing tool catalog should point codewiki_artifact_status at src/session/artifact-status-tool.ts");

function walkCodeFiles(roots) {
	return roots.flatMap((root) => {
		const abs = resolve(repoRoot, root);
		return existsSync(abs) ? walk(abs) : [];
	});
}

function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const abs = resolve(dir, entry);
		const stats = statSync(abs);
		if (stats.isDirectory()) {
			if (["node_modules", ".git", "dist"].includes(entry)) continue;
			out.push(...walk(abs));
		} else if (/\.(?:ts|mts|cts|js|mjs|cjs)$/.test(entry)) {
			out.push(abs);
		}
	}
	return out;
}

function importSpecifiers(sourceText) {
	const patterns = [
		/\bimport\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g,
		/\bexport\s+[^"']+?\s+from\s+["']([^"']+)["']/g,
		/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
	];
	return patterns.flatMap((pattern) => [...sourceText.matchAll(pattern)].map((match) => match[1]));
}

function pointsAtRemovedSessionOwner(filePath, specifier) {
	if (specifier.startsWith(".")) {
		const resolved = resolve(dirname(filePath), specifier);
		return removedSessionOwnerAbsPaths.some((removedPath) =>
			resolved === removedPath || resolved === removedPath.replace(/\.ts$/, ""),
		);
	}
	return removedSessionOwnerPaths.some((removedPath) =>
		specifier === removedPath || specifier.endsWith(`/${removedPath}`),
	);
}
