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
const requiredGcFiles = [
	"src/gc/types.ts",
	"src/gc/runtime.ts",
	"src/gc/tool.ts",
];
const removedGcOwnerPaths = [
	"src/domain/gc/types.ts",
	"src/application/gc.ts",
	"src/application/tools/gc.ts",
];
const removedGcOwnerAbsPaths = removedGcOwnerPaths.map((path) => resolve(repoRoot, path));

for (const path of requiredGcFiles) {
	assert.ok(existsSync(resolve(repoRoot, path)), `TASK-027 owner path missing: ${path}`);
}
for (const path of removedGcOwnerPaths) {
	assert.equal(existsSync(resolve(repoRoot, path)), false, `Legacy GC owner path remains: ${path}`);
}

const gcTypes = await import(pathToFileURL(resolve(repoRoot, "src", "gc", "types.ts")).href);
const gcRuntime = await import(pathToFileURL(resolve(repoRoot, "src", "gc", "runtime.ts")).href);
const gcTool = await import(pathToFileURL(resolve(repoRoot, "src", "gc", "tool.ts")).href);

assert.deepEqual(gcTypes.GC_ACTION_VALUES, ["dry-run", "purge"], "GC action values must stay stable");
assert.deepEqual(gcTypes.GC_INCLUDE_VALUES, ["tracked", "runtime"], "GC include values must stay stable");
assert.deepEqual(gcTypes.GC_ARTIFACT_TEMPERATURE_VALUES, ["hot", "warm", "cold", "purgeable"], "GC temperature values must stay stable");
assert.equal(typeof gcRuntime.runCodewikiGc, "function", "GC dry-run/purge use case should be owned by src/gc/runtime.ts");
assert.equal(typeof gcTool.executeCodewikiGcTool, "function", "codewiki_gc tool execution should be owned by src/gc/tool.ts");

const runtimeSource = readFileSync(resolve(repoRoot, "src", "gc", "runtime.ts"), "utf8");
assert.match(runtimeSource, /function collectTrackedCandidates/, "Tracked GC candidate detection should live in src/gc/runtime.ts");
assert.match(runtimeSource, /function collectRuntimeCandidates/, "Runtime GC candidate detection should live in src/gc/runtime.ts");
assert.match(runtimeSource, /async function writeRestoreLedger/, "Restore-ledger writer should live in src/gc/runtime.ts");
assert.match(runtimeSource, /function verifyArchiveProof/, "Archive proof checks should live in src/gc/runtime.ts");
assert.match(runtimeSource, /function restoreCommand/, "Restore command rendering should live in src/gc/runtime.ts");
assert.doesNotMatch(runtimeSource, /domain\/gc|application\/tools\/gc/, "GC runtime should not depend on old GC owner paths");

const runtimeRoot = mkdtempSync(resolve(tmpdir(), "codewiki-task-027-"));
try {
	const buildPath = ".codewiki/builds/implementation/2026-05-12-task-999.json";
	const validationPath = ".codewiki/validation/2026-05-12-task-close-pass-task-999.json";
	const handoffPath = ".codewiki/runtime/session-handoffs/HANDOFF-COMPLETED.json";
	mkdirSync(resolve(runtimeRoot, ".codewiki/builds/implementation"), { recursive: true });
	mkdirSync(resolve(runtimeRoot, ".codewiki/validation"), { recursive: true });
	mkdirSync(resolve(runtimeRoot, ".codewiki/runtime/session-handoffs"), { recursive: true });
	writeFileSync(resolve(runtimeRoot, buildPath), JSON.stringify({ kind: "implementation_build", task_id: "TASK-999" }, null, 2));
	writeFileSync(resolve(runtimeRoot, validationPath), JSON.stringify({ verdict: "pass", source: buildPath }, null, 2));
	writeFileSync(resolve(runtimeRoot, handoffPath), JSON.stringify({ kind: "codewiki_session_handoff", status: "completed" }, null, 2));
	writeFileSync(resolve(runtimeRoot, ".codewiki/index_graph.json"), JSON.stringify({
		views: {
			gc: {
				classes: {
					purgeable: {
						build_paths: [buildPath],
						validation_paths: [validationPath],
					},
				},
			},
		},
	}, null, 2));
	const project = { root: runtimeRoot, graphPath: ".codewiki/index_graph.json", config: {}, roadmapPath: ".codewiki/roadmap/queue.json" };
	const dryRun = await gcRuntime.runCodewikiGc(project, { action: "dry-run", refresh: false });
	assert.equal(dryRun.candidates.tracked.length, 2, "GC dry-run should still report purgeable build and validation files");
	assert.equal(dryRun.candidates.runtime.length, 1, "GC dry-run should still report consumed runtime handoffs");
	assert.match(dryRun.summary, /^tracked=2 \(\d+ bytes\), runtime=1 \(\d+ bytes\)$/, "GC dry-run summary should keep count/byte format");
	assert.equal(dryRun.changed, false, "GC dry-run should not mutate files");
	assert.equal(existsSync(resolve(runtimeRoot, buildPath)), true, "Dry-run should keep tracked build file");
	const blocked = await gcRuntime.runCodewikiGc(project, { action: "purge", include: ["tracked"], refresh: false });
	assert.equal(blocked.status, "blocked", "Tracked purge should still block without archive proof");
	assert.match(blocked.blocked_reasons.join("\n"), /archive_sha/, "Blocked purge should still name missing archive proof");
	const toolDryRun = await gcTool.executeCodewikiGcTool(project, { action: "dry-run", include: ["runtime"], refresh: false });
	assert.match(toolDryRun.summary, /^codewiki gc: dry-run \(tracked=0 \(0 bytes\), runtime=1 \(\d+ bytes\)\)$/, "GC tool summary should keep stable dry-run prefix and count/byte format");
} finally {
	rmSync(runtimeRoot, { recursive: true, force: true });
}

const importViolations = [];
for (const filePath of walkCodeFiles(["src", "scripts", "tests"])) {
	const rel = relative(repoRoot, filePath).replaceAll("\\", "/");
	const source = readFileSync(filePath, "utf8");
	for (const specifier of importSpecifiers(source)) {
		if (pointsAtRemovedGcOwner(filePath, specifier)) {
			importViolations.push(`${rel}: ${specifier}`);
		}
	}
	if (!legacyTextAllowed.has(rel)) {
		assert.equal(source.includes("src/domain/gc/"), false, `${rel} still references legacy GC type path text`);
		assert.equal(source.includes("src/application/gc"), false, `${rel} still references legacy GC runtime path text`);
		assert.equal(source.includes("src/application/tools/gc"), false, `${rel} still references legacy GC tool path text`);
	}
}
assert.deepEqual(importViolations, [], "Source, tests, and scripts should not import removed GC owner paths");

const piIndexSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "index.ts"), "utf8");
const schemaSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "schemas.ts"), "utf8");
const hotRetentionSource = readFileSync(resolve(repoRoot, "tests", "smoke", "hot-retention.test.mjs"), "utf8");
const packageSmokeSource = readFileSync(resolve(repoRoot, "tests", "smoke", "package-smoke.test.mjs"), "utf8");
const toolCatalogSource = readFileSync(resolve(repoRoot, "skills", "codewiki", "references", "tool-catalog.md"), "utf8");

assert.match(piIndexSource, /from "\.\.\/\.\.\/gc\/tool\.ts"/, "Pi adapter should route codewiki_gc through src/gc/tool.ts");
assert.match(schemaSource, /from "\.\.\/\.\.\/gc\/types\.ts"/, "Pi schemas should read GC values from src/gc/types.ts");
assert.match(hotRetentionSource, /src\/gc\/runtime\.ts/, "GC smoke should exercise src/gc/runtime.ts");
assert.match(packageSmokeSource, /GC source-root tool module/, "Package smoke should guard GC source-root tool delegation");
assert.match(toolCatalogSource, /src\/gc\/tool\.ts/, "Skill-facing tool catalog should point codewiki_gc at src/gc/tool.ts");

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

function pointsAtRemovedGcOwner(filePath, specifier) {
	if (specifier.startsWith(".")) {
		const resolved = resolve(dirname(filePath), specifier);
		return removedGcOwnerAbsPaths.some((removedPath) =>
			resolved === removedPath || resolved === removedPath.replace(/\.ts$/, ""),
		);
	}
	return removedGcOwnerPaths.some((removedPath) =>
		specifier === removedPath || specifier.endsWith(`/${removedPath}`),
	);
}
