import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { readPreviewIntegrationState } from "../../src/preview/integration.ts";

const binding = {
	targetId: "dashboard-detail",
	targetDigest: `sha256:${"a".repeat(64)}`,
	profileId: "web",
	profileDigest: `sha256:${"b".repeat(64)}`,
	workUnitIds: ["WU-dashboard"],
	contributingChangeIds: ["CHG-dashboard", "CHG-shared"],
	required: true,
	activation: "implementation",
	autoOpen: "manual",
	traceIds: ["TRACE-dashboard"],
	sprintIds: ["SPR-dashboard"],
};

describe("preview integration checkout state", () => {
	it("binds evidence to exact clean and dirty Git trees while ignoring runtime artifacts", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-preview-integration-"));
		try {
			await writeFile(join(root, "app.ts"), "export const value = 1;\n");
			git(root, "init", "-q");
			git(root, "config", "user.name", "CodeWiki Test");
			git(root, "config", "user.email", "codewiki@example.invalid");
			git(root, "add", "app.ts");
			git(root, "commit", "-qm", "fixture");

			const clean = await readPreviewIntegrationState({
				repoRoot: root,
				binding,
			});
			assert.equal(clean.dirty, false);
			assert.deepEqual(clean.dirtyPaths, []);
			assert.match(clean.gitHead, /^[a-f0-9]{40}$/);
			assert.match(clean.gitTree, /^[a-f0-9]{40}$/);
			assert.match(clean.workingTreeDigest, /^sha256:[a-f0-9]{64}$/);
			assert.deepEqual(clean.visibleChangeIds, ["CHG-dashboard", "CHG-shared"]);

			await mkdir(join(root, ".codewiki", "runtime"), { recursive: true });
			await writeFile(
				join(root, ".codewiki", "runtime", "capture.json"),
				"runtime only\n",
			);
			await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
			await writeFile(
				join(root, ".codewiki", "traces", "TRACE-CHG-dashboard.jsonl"),
				'{"type":"trace_head"}\n',
			);
			const runtimeOnly = await readPreviewIntegrationState({
				repoRoot: root,
				binding,
			});
			assert.equal(runtimeOnly.dirty, false);
			assert.equal(runtimeOnly.workingTreeDigest, clean.workingTreeDigest);

			await writeFile(join(root, "app.ts"), "export const value = 2;\n");
			await writeFile(join(root, "new.ts"), "export const added = true;\n");
			const dirty = await readPreviewIntegrationState({
				repoRoot: root,
				binding,
			});
			assert.equal(dirty.dirty, true);
			assert.deepEqual(dirty.dirtyPaths, ["app.ts", "new.ts"]);
			assert.notEqual(dirty.workingTreeDigest, clean.workingTreeDigest);

			const conflicted = await readPreviewIntegrationState({
				repoRoot: root,
				binding,
				conflictingChangeIds: ["CHG-shared"],
			});
			assert.equal(conflicted.visibility, "conflicted");
			assert.deepEqual(conflicted.visibleChangeIds, ["CHG-dashboard"]);
			assert.deepEqual(conflicted.conflictingChangeIds, ["CHG-shared"]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

function git(root, ...args) {
	execFileSync("git", args, { cwd: root, stdio: "ignore" });
}
