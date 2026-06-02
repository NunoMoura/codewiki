import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const source = (...parts) => resolve(repoRoot, "src", ...parts);
const removedAuditShimPaths = [
	"src/domain/audit/types.ts",
	"src/application/tools/audit.ts",
];
const removedAuditShimAbsPaths = removedAuditShimPaths.map((relPath) =>
	resolve(repoRoot, relPath),
);

assert.ok(
	existsSync(source("audit", "types.ts")),
	"Audit types should be owned by src/audit/types.ts",
);
assert.ok(
	existsSync(source("audit", "tool.ts")),
	"Audit tool/use-case execution should be owned by src/audit/tool.ts",
);

for (const relPath of removedAuditShimPaths) {
	assert.ok(
		!existsSync(resolve(repoRoot, relPath)),
		`${relPath} should be removed after TASK-021 migration`,
	);
}

const auditTypes = await import(
	pathToFileURL(source("audit", "types.ts")).href
);
assert.deepEqual(
	auditTypes.AUDIT_PROFILE_VALUES,
	[
		"alignment",
		"horizontal-alignment",
		"source-contract",
		"file-structure",
		"stale-reference",
		"package",
		"security",
		"generated-parity",
		"lexicon",
		"changed",
		"task",
	],
	"Audit profiles should remain source-root owned",
);
assert.deepEqual(
	auditTypes.AUDIT_STATUS_VALUES,
	["pass", "warning", "fail"],
	"Audit statuses should remain source-root owned",
);

const auditTool = await import(pathToFileURL(source("audit", "tool.ts")).href);
assert.equal(
	typeof auditTool.executeCodewikiAudit,
	"function",
	"Audit executor should remain exported from source-root owner",
);
assert.equal(
	typeof auditTool.formatAuditReport,
	"function",
	"Audit formatter should remain exported from source-root owner",
);
assert.equal(
	typeof auditTool.normalizeAuditProfiles,
	"function",
	"Audit profile normalization should remain exported from source-root owner",
);

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
	return patterns.flatMap((pattern) =>
		[...sourceText.matchAll(pattern)].map((match) => match[1]),
	);
}

function pointsAtRemovedAuditShim(filePath, specifier) {
	if (specifier.startsWith(".")) {
		const resolved = resolve(dirname(filePath), specifier);
		return removedAuditShimAbsPaths.some(
			(removedPath) =>
				resolved === removedPath ||
				resolved === removedPath.replace(/\.ts$/, ""),
		);
	}
	return removedAuditShimPaths.some(
		(removedPath) =>
			specifier === removedPath || specifier.endsWith(`/${removedPath}`),
	);
}

const importViolations = [];
for (const codeRoot of [
	resolve(repoRoot, "src"),
	resolve(repoRoot, "tests"),
	resolve(repoRoot, "scripts"),
]) {
	for (const filePath of walkCodeFiles(codeRoot)) {
		const specs = importSpecifiers(readFileSync(filePath, "utf8"));
		for (const specifier of specs) {
			if (pointsAtRemovedAuditShim(filePath, specifier)) {
				importViolations.push(`${filePath}: ${specifier}`);
			}
		}
	}
}
assert.deepEqual(
	importViolations,
	[],
	"Source, tests, and scripts should not import removed audit shim paths",
);

const commandSource = readFileSync(
	source("adapters", "pi", "commands", "audit.ts"),
	"utf8",
);
assert.match(
	commandSource,
	/from "\.\.\/\.\.\/\.\.\/api\/tools\.ts"/,
	"Pi audit command should consume API facade audit tool",
);
assert.match(
	commandSource,
	/from "\.\.\/\.\.\/\.\.\/audit\/types\.ts"/,
	"Pi audit command should consume source-root audit types",
);
assert.doesNotMatch(
	commandSource,
	/application\/tools\/audit|domain\/audit\/types/,
	"Pi audit command should not call old audit paths",
);

const adapterToolSource = readFileSync(
	source("adapters", "pi", "tools", "audit.ts"),
	"utf8",
);
assert.match(
	adapterToolSource,
	/from "\.\.\/\.\.\/\.\.\/api\/tools\.ts"/,
	"Pi audit tool should consume API facade audit executor",
);
assert.doesNotMatch(
	adapterToolSource,
	/application\/tools\/audit|domain\/audit\/types/,
	"Pi audit tool should not call old audit paths",
);

const schemaSource = readFileSync(
	source("adapters", "pi", "schemas.ts"),
	"utf8",
);
assert.match(
	schemaSource,
	/from "\.\.\/\.\.\/audit\/types\.ts"/,
	"Pi schemas should consume source-root audit values",
);
assert.doesNotMatch(
	schemaSource,
	/domain\/audit\/types/,
	"Pi schemas should not import old audit type path",
);

const architectureScript = readFileSync(
	resolve(repoRoot, "scripts", "check-architecture.mjs"),
	"utf8",
);
assert.match(
	architectureScript,
	/src\/api\/tools\.ts/,
	"Architecture wrapper should delegate through API facade",
);
assert.doesNotMatch(
	architectureScript,
	/application\/tools\/audit/,
	"Architecture wrapper should not import old audit tool path",
);

const auditRoot = readFileSync(source("audit", "tool.ts"), "utf8");
assert.doesNotMatch(
	auditRoot,
	/\.\.\/application\/tools\/audit|\.\.\/domain\/audit\/types/,
	"Audit source root should not import old audit shim paths",
);
