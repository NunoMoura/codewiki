#!/usr/bin/env node
import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

function walk(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const path = resolve(dir, name);
		const stat = statSync(path);
		if (stat.isDirectory()) out.push(...walk(path));
		else out.push(path);
	}
	return out;
}

const sourceFiles = walk(resolve(repoRoot, "src")).filter((path) => path.endsWith(".ts"));

assert.ok(!existsSync(resolve(repoRoot, "src", "domain")), "src/domain/** owner paths must be removed");
assert.ok(!existsSync(resolve(repoRoot, "src", "application")), "src/application/** owner paths must be removed");
assert.ok(!existsSync(resolve(repoRoot, "src", "mutation-queue.ts")), "top-level mutation-queue shim must be removed");
assert.ok(existsSync(resolve(repoRoot, "src", "api", "index.ts")), "src/api/index.ts facade must exist");
assert.ok(existsSync(resolve(repoRoot, "src", "api", "tools.ts")), "src/api/tools.ts facade must exist");
assert.ok(existsSync(resolve(repoRoot, "src", "shared", "ports.ts")), "src/shared/ports.ts must hold primitive ports");
assert.ok(existsSync(resolve(repoRoot, "src", "shared", "utils.ts")), "src/shared/utils.ts must hold pure helpers");
assert.ok(existsSync(resolve(repoRoot, "src", "shared", "lock.ts")), "src/shared/lock.ts must hold session-independent mutation queue helper");

const importPattern = /from\s+["'][^"']*(?:application|domain)\//;
for (const file of sourceFiles) {
	const rel = file.slice(repoRoot.length + 1);
	const text = readFileSync(file, "utf8");
	assert.doesNotMatch(text, importPattern, `${rel} imports removed layer-first owner paths`);
}

for (const rel of [
	"src/adapters/pi/index.ts",
	"src/adapters/pi/tools/agency.ts",
	"src/adapters/pi/tools/audit.ts",
	"src/adapters/pi/tools/artifact-status.ts",
	"src/adapters/pi/tools/resume-context.ts",
	"src/adapters/pi/tools/session.ts",
	"src/adapters/pi/tools/state.ts",
	"src/adapters/pi/tools/task.ts",
	"scripts/check-architecture.mjs",
]) {
	const text = readFileSync(resolve(repoRoot, rel), "utf8");
	assert.match(text, /api\/tools\.ts/, `${rel} should use the API facade for tool use cases`);
}

const apiSource = readFileSync(resolve(repoRoot, "src", "api", "tools.ts"), "utf8");
for (const exportedName of [
	"executeCodewikiAgencyTool",
	"executeCodewikiAudit",
	"executeCodewikiBuildTool",
	"executeCodewikiDiffTableTool",
	"executeCodewikiGcTool",
	"executeCodewikiSetupTool",
	"executeCodewikiTaskTool",
	"executeCodewikiArtifactStatusTool",
	"executeCodewikiSessionTool",
	"executeCodewikiResumeContextTool",
	"executeCodewikiStateTool",
	"executeCodewikiValidationTool",
]) {
	assert.match(apiSource, new RegExp(`export \\{[^}]*${exportedName}`), `api/tools.ts missing ${exportedName}`);
}

const packageEntrypoint = await import(resolve(repoRoot, "src", "index.ts"));
assert.equal(typeof packageEntrypoint.default, "function", "package extension default export should still load");
assert.equal(typeof packageEntrypoint.executeCodewikiAudit, "function", "package entrypoint should re-export API facade tools");

console.log("✓ TASK-031 API/shared facade cleanup passed");
