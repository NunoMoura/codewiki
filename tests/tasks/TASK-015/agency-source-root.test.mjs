import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const source = (...parts) => resolve(repoRoot, "src", ...parts);
const removedAgencyShimPaths = [
	"src/domain/agency/types.ts",
	"src/application/agency.ts",
	"src/application/tools/agency.ts",
];
const removedAgencyShimAbsPaths = removedAgencyShimPaths.map((relPath) =>
	resolve(repoRoot, relPath),
);

assert.ok(existsSync(source("agency", "types.ts")), "Agency types should be owned by src/agency/types.ts");
assert.ok(existsSync(source("agency", "planning.ts")), "Agency planning use case should be owned by src/agency/planning.ts");
assert.ok(existsSync(source("agency", "tool.ts")), "Agency tool entrypoint should be owned by src/agency/tool.ts");

for (const relPath of removedAgencyShimPaths) {
	assert.ok(!existsSync(resolve(repoRoot, relPath)), `${relPath} should be removed after TASK-020 cleanup`);
}

const agencyTypes = await import(pathToFileURL(source("agency", "types.ts")).href);
assert.deepEqual(agencyTypes.AGENCY_MODE_VALUES, ["auto", "dry-run", "manual", "observe", "maintain", "work"], "Agency modes should remain source-root owned");
assert.deepEqual(agencyTypes.AGENCY_TRIGGER_VALUES, ["manual", "task_end", "sprint_end", "roadmap_end", "budget_end"], "Agency triggers should remain source-root owned");
assert.deepEqual(agencyTypes.AGENCY_RISK_VALUES, ["low", "medium", "high"], "Agency risks should remain source-root owned");

const agencyPlanning = await import(pathToFileURL(source("agency", "planning.ts")).href);
assert.equal(typeof agencyPlanning.planAgency, "function", "Agency planner should remain exported from source-root owner");

const agencyTool = await import(pathToFileURL(source("agency", "tool.ts")).href);
assert.equal(typeof agencyTool.executeCodewikiAgencyTool, "function", "Agency tool executor should remain exported from source-root owner");
assert.equal(typeof agencyTool.buildThinkCodeContextPlan, "function", "Agency context helper should remain exported from source-root owner");

function* walkCodeFiles(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
		const entryPath = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walkCodeFiles(entryPath);
		} else if (/\.(?:ts|mts|cts|js|mjs|cjs)$/.test(entry.name)) {
			yield entryPath;
		}
	}
}

function importSpecifiers(sourceText) {
	const patterns = [
		/\bimport\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g,
		/\bexport\s+[^"']+?\s+from\s+["']([^"']+)["']/g,
		/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
	];
	return patterns.flatMap((pattern) => [...sourceText.matchAll(pattern)].map((match) => match[1]));
}

function pointsAtRemovedAgencyShim(filePath, specifier) {
	if (specifier.startsWith(".")) {
		const resolved = resolve(dirname(filePath), specifier);
		return removedAgencyShimAbsPaths.some((removedPath) =>
			resolved === removedPath || resolved === removedPath.replace(/\.ts$/, ""),
		);
	}
	return removedAgencyShimPaths.some((removedPath) =>
		specifier === removedPath || specifier.endsWith(`/${removedPath}`),
	);
}

const importViolations = [];
for (const codeRoot of [resolve(repoRoot, "src"), resolve(repoRoot, "tests")]) {
	for (const filePath of walkCodeFiles(codeRoot)) {
		const specs = importSpecifiers(readFileSync(filePath, "utf8"));
		for (const specifier of specs) {
			if (pointsAtRemovedAgencyShim(filePath, specifier)) {
				importViolations.push(`${filePath}: ${specifier}`);
			}
		}
	}
}
assert.deepEqual(importViolations, [], "Source and tests should not import removed agency shim paths");

const adapterSource = readFileSync(source("adapters", "pi", "tools", "agency.ts"), "utf8");
assert.match(adapterSource, /from "\.\.\/\.\.\/\.\.\/agency\/types\.ts"/, "Pi agency adapter should consume source-root agency types");
assert.match(adapterSource, /from "\.\.\/\.\.\/\.\.\/api\/tools\.ts"/, "Pi agency adapter should consume API facade tool executor");
assert.doesNotMatch(adapterSource, /application\/tools\/agency|domain\/agency\/types/, "Pi agency adapter should not call old agency shim paths");

const schemaSource = readFileSync(source("adapters", "pi", "schemas.ts"), "utf8");
assert.match(schemaSource, /from "\.\.\/\.\.\/agency\/types\.ts"/, "Pi schemas should consume source-root agency values");
assert.doesNotMatch(schemaSource, /domain\/agency\/types/, "Pi schemas should not import old agency type path");

const agencyRoot = readFileSync(source("agency", "planning.ts"), "utf8") + readFileSync(source("agency", "tool.ts"), "utf8");
assert.doesNotMatch(agencyRoot, /\.\.\/application\/agency|\.\.\/application\/tools\/agency|\.\.\/domain\/agency\/types/, "Agency root should not import old agency shim paths");
