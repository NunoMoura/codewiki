#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const requiredProjectFiles = [
	"src/project/bootstrap.ts",
	"src/project/context.ts",
	"src/project/root.ts",
	"src/project/templates.ts",
	"src/project/tool.ts",
	"src/project/types.ts",
	"src/project/local/filesystem.ts",
	"src/project/local/file-store.ts",
	"src/project/local/git-cache.ts",
];
const removedOwnerFiles = [
	"src/application/project.ts",
	"src/application/tools/bootstrap.ts",
	"src/application/local/filesystem.ts",
	"src/application/local/file-store.ts",
	"src/application/local/git-cache.ts",
	"src/domain/project/types.ts",
	"src/bootstrap.ts",
	"src/project-root.ts",
	"src/templates.ts",
];

for (const file of requiredProjectFiles) {
	assert.ok(existsSync(resolve(repoRoot, file)), `${file} should exist under src/project/**`);
}
for (const file of removedOwnerFiles) {
	assert.ok(!existsSync(resolve(repoRoot, file)), `${file} should not remain as an old project/bootstrap owner path`);
}

const sourceFiles = collectFiles(["src", "scripts", "tests"], [".ts", ".mjs", ".md"])
	.filter((file) => !file.endsWith("tests/tasks/TASK-024/project-source-root.test.mjs"));
const staleImportPattern = /(?:from\s+|import\(\s*)["'][^"']*(?:application\/project|application\/local\/(?:filesystem|file-store|git-cache)|application\/tools\/bootstrap|domain\/project\/types)[^"']*["']/;
const staleTopLevelPathPattern = /src\/(?:bootstrap|project-root|templates)\.ts|project-root\.ts/;
const staleMatches = [];
for (const file of sourceFiles) {
	const text = readFileSync(resolve(repoRoot, file), "utf8");
	if (staleImportPattern.test(text) || staleTopLevelPathPattern.test(text)) staleMatches.push(file);
}
assert.deepEqual(staleMatches, [], "old project/bootstrap owner imports and direct path references should be gone");

const bootstrap = await import(resolve(repoRoot, "src", "project", "bootstrap.ts"));
const context = await import(resolve(repoRoot, "src", "project", "context.ts"));
const root = await import(resolve(repoRoot, "src", "project", "root.ts"));
const templates = await import(resolve(repoRoot, "src", "project", "templates.ts"));
const local = await import(resolve(repoRoot, "src", "project", "local", "file-store.ts"));
assert.equal(typeof bootstrap.bootstrapCodewiki, "function", "bootstrapCodewiki should be owned by src/project/bootstrap.ts");
assert.equal(typeof bootstrap.setupCodewiki, "function", "setupCodewiki should be owned by src/project/bootstrap.ts");
assert.equal(typeof context.loadProject, "function", "loadProject should be owned by src/project/context.ts");
assert.equal(typeof root.resolveSetupRoot, "function", "root resolution should be owned by src/project/root.ts");
assert.equal(typeof templates.starterFiles, "function", "starter templates should be owned by src/project/templates.ts");
assert.equal(typeof local.nodeFileStore, "function", "local file store should be owned by src/project/local/file-store.ts");

function collectFiles(roots, extensions) {
	const files = [];
	for (const root of roots) visit(resolve(repoRoot, root));
	return files.sort();

	function visit(dir) {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (["node_modules", ".git", ".codewiki"].includes(entry.name)) continue;
			const absolute = resolve(dir, entry.name);
			if (entry.isDirectory()) visit(absolute);
			else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
				files.push(relative(repoRoot, absolute).replaceAll("\\\\", "/"));
			}
		}
	}
}
