#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const thisTest = relative(repoRoot, fileURLToPath(import.meta.url)).replaceAll(
	"\\",
	"/",
);
const requiredKnowledgeFiles = [
	"src/knowledge/doc-parser.ts",
	"src/knowledge/diagram-parser.ts",
];
const removedKnowledgeOwnerPaths = [
	"src/application/knowledge/doc-parser.ts",
	"src/application/knowledge/diagram-parser.ts",
];
const removedKnowledgeOwnerAbsPaths = removedKnowledgeOwnerPaths.map((path) =>
	resolve(repoRoot, path),
);

for (const path of requiredKnowledgeFiles) {
	assert.ok(
		existsSync(resolve(repoRoot, path)),
		`TASK-025 owner path missing: ${path}`,
	);
}
for (const path of removedKnowledgeOwnerPaths) {
	assert.equal(
		existsSync(resolve(repoRoot, path)),
		false,
		`Legacy knowledge parser owner path remains: ${path}`,
	);
}

const docParser = await import(
	pathToFileURL(resolve(repoRoot, "src", "knowledge", "doc-parser.ts")).href
);
const diagramParser = await import(
	pathToFileURL(resolve(repoRoot, "src", "knowledge", "diagram-parser.ts")).href
);
assert.equal(
	typeof docParser.parseDoc,
	"function",
	"parseDoc should be owned by src/knowledge/doc-parser.ts",
);
assert.equal(
	typeof docParser.splitFrontmatter,
	"function",
	"frontmatter parsing should be owned by src/knowledge/doc-parser.ts",
);
assert.equal(
	typeof docParser.extractLinks,
	"function",
	"link parsing should be owned by src/knowledge/doc-parser.ts",
);
assert.equal(
	typeof diagramParser.parseSystemDiagrams,
	"function",
	"diagram parsing should be owned by src/knowledge/diagram-parser.ts",
);
assert.equal(
	typeof diagramParser.validateSystemDiagramRefs,
	"function",
	"diagram-ref validation should be owned by src/knowledge/diagram-parser.ts",
);
assert.equal(
	typeof diagramParser.parseFileStructureMap,
	"function",
	"file-structure map parsing should be owned by src/knowledge/diagram-parser.ts",
);
assert.equal(
	typeof diagramParser.buildFileStructureDriftReport,
	"function",
	"file-structure drift helpers should be owned by src/knowledge/diagram-parser.ts",
);

const importViolations = [];
for (const filePath of walkCodeFiles(["src", "scripts", "tests"])) {
	const rel = relative(repoRoot, filePath).replaceAll("\\", "/");
	if (rel === thisTest) continue;
	const source = readFileSync(filePath, "utf8");
	for (const specifier of importSpecifiers(source)) {
		if (pointsAtRemovedKnowledgeOwner(filePath, specifier)) {
			importViolations.push(`${rel}: ${specifier}`);
		}
	}
	assert.equal(
		source.includes("src/application/knowledge/"),
		false,
		`${rel} still references legacy knowledge parser path text`,
	);
}
assert.deepEqual(
	importViolations,
	[],
	"Source, tests, and scripts should not import removed knowledge parser owner paths",
);

const graphSource = readFileSync(
	resolve(repoRoot, "src", "state", "graph.ts"),
	"utf8",
);
assert.match(
	graphSource,
	/from "\.\.\/knowledge\/doc-parser\.ts"/,
	"Graph builder should consume ParsedDoc from src/knowledge/doc-parser.ts",
);
assert.match(
	graphSource,
	/from "\.\.\/knowledge\/diagram-parser\.ts"/,
	"Graph builder should consume diagram helpers from src/knowledge/diagram-parser.ts",
);

const rebuilderSource = readFileSync(
	resolve(repoRoot, "src", "state", "graph", "rebuilder.ts"),
	"utf8",
);
assert.match(
	rebuilderSource,
	/from "\.\.\/\.\.\/knowledge\/doc-parser\.ts"/,
	"Graph rebuilder should consume parseDoc from src/knowledge/doc-parser.ts",
);

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
	return patterns.flatMap((pattern) =>
		[...sourceText.matchAll(pattern)].map((match) => match[1]),
	);
}

function pointsAtRemovedKnowledgeOwner(filePath, specifier) {
	if (specifier.startsWith(".")) {
		const resolved = resolve(dirname(filePath), specifier);
		return removedKnowledgeOwnerAbsPaths.some(
			(removedPath) =>
				resolved === removedPath ||
				resolved === removedPath.replace(/\.ts$/, ""),
		);
	}
	return removedKnowledgeOwnerPaths.some(
		(removedPath) =>
			specifier === removedPath || specifier.endsWith(`/${removedPath}`),
	);
}
