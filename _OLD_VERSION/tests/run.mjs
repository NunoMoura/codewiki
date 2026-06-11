#!/usr/bin/env node
/**
 * tests/run.mjs — minimal test runner for codewiki feature tests.
 * Runs all *.test.mjs under tests/smoke/ and tests/tasks/, except package smoke
 * because npm run test:smoke owns that heavier package/resource-load check.
 */
import { readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = import.meta.dirname;
const TEST_ROOTS = [resolve(ROOT, "smoke"), resolve(ROOT, "tasks")];
const EXCLUDED_TESTS = new Set(["smoke/package-smoke.test.mjs"]);

function collectTests(dir) {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const path = resolve(dir, entry.name);
		if (entry.isDirectory()) files.push(...collectTests(path));
		else if (entry.isFile() && entry.name.endsWith(".test.mjs")) {
			const label = relative(ROOT, path).replaceAll("\\", "/");
			if (!EXCLUDED_TESTS.has(label)) files.push(path);
		}
	}
	return files;
}

const files = TEST_ROOTS
	.filter((dir) => existsDir(dir))
	.flatMap((dir) => collectTests(dir))
	.sort((a, b) => relative(ROOT, a).localeCompare(relative(ROOT, b)));

function existsDir(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

if (files.length === 0) {
	console.log("No feature tests found in tests/smoke/ or tests/tasks/ (only .test.mjs files are discovered).");
}

let passed = 0;
let failed = 0;
const errors = [];

for (const file of files) {
	const label = relative(ROOT, file);
	try {
		console.log(`\n--- ${label} ---`);
		await import(pathToFileURL(file).href);
		// If no error, assume pass (tests assert internally)
		passed++;
	} catch (err) {
		failed++;
		const message = String(err?.message || err);
		errors.push(`${label}: ${message}`);
		console.error(`✗ ${label}: ${message}`);
	}
}

console.log(`\nTests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
	console.error("Errors:");
	for (const e of errors) console.error(`  ${e}`);
	process.exit(1);
}
