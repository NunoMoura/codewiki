#!/usr/bin/env node
import assert from "node:assert/strict";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const thisTest = relative(repoRoot, fileURLToPath(import.meta.url)).replaceAll(
	"\\",
	"/",
);
const requiredChangeFiles = [
	"src/change/types.ts",
	"src/change/traceability.ts",
	"src/change/decision-table.ts",
	"src/change/tool.ts",
];
const removedChangeOwnerPaths = [
	"src/domain/change/types.ts",
	"src/domain/change/traceability.ts",
	"src/application/decision-table.ts",
	"src/application/tools/decision-table.ts",
];
const removedChangeOwnerAbsPaths = removedChangeOwnerPaths.map((path) =>
	resolve(repoRoot, path),
);

for (const path of requiredChangeFiles) {
	assert.ok(
		existsSync(resolve(repoRoot, path)),
		`TASK-026 owner path missing: ${path}`,
	);
}
for (const path of removedChangeOwnerPaths) {
	assert.equal(
		existsSync(resolve(repoRoot, path)),
		false,
		`Legacy change/decision-table owner path remains: ${path}`,
	);
}

const changeTypes = await import(
	pathToFileURL(resolve(repoRoot, "src", "change", "types.ts")).href
);
const traceability = await import(
	pathToFileURL(resolve(repoRoot, "src", "change", "traceability.ts")).href
);
const decisionTable = await import(
	pathToFileURL(resolve(repoRoot, "src", "change", "decision-table.ts")).href
);
const decisionTableTool = await import(
	pathToFileURL(resolve(repoRoot, "src", "change", "tool.ts")).href
);

assert.deepEqual(
	changeTypes.CHANGE_TYPE_VALUES,
	["product", "system", "task", "code"],
	"Change type values must stay stable",
);
assert.deepEqual(
	changeTypes.TRACEABILITY_EXEMPTION_VALUES,
	["generated", "runtime", "mechanical"],
	"Traceability exemption values must stay stable",
);
assert.equal(
	traceability.normalizeChangeType("system"),
	"system",
	"Traceability helper should normalize system change type",
);
assert.equal(
	traceability.normalizeChangeType("maintenance"),
	"code",
	"Traceability helper should preserve legacy maintenance alias",
);
assert.equal(
	traceability.normalizeTraceabilityExemption("mechanical"),
	"mechanical",
	"Traceability helper should normalize exemptions",
);
assert.equal(
	traceability.isSemanticTraceability(undefined, undefined),
	true,
	"Missing exemption should remain semantic by default",
);
const changeTypesSource = readFileSync(
	resolve(repoRoot, "src", "change", "types.ts"),
	"utf8",
);
const decisionTableSource = readFileSync(
	resolve(repoRoot, "src", "change", "decision-table.ts"),
	"utf8",
);
assert.match(
	changeTypesSource,
	/interface CodewikiDecisionTableRowInput/,
	"Decision decision-table row type should be owned by src/change/types.ts",
);
assert.doesNotMatch(
	decisionTableSource,
	/\.\.\/build\/types\.ts/,
	"Runtime decision-table use case should not depend on build-owned types",
);
assert.equal(
	typeof decisionTable.executeDecisionTableAction,
	"function",
	"Decision-table mutation use case should be owned by src/change/decision-table.ts",
);
assert.equal(
	typeof decisionTable.readRuntimeDecisionTables,
	"function",
	"Decision-table storage read helper should be owned by src/change/decision-table.ts",
);
assert.equal(
	typeof decisionTableTool.executeCodewikiDecisionTableTool,
	"function",
	"wiki_decision_table tool execution should be owned by src/change/tool.ts",
);

const runtimeRoot = mkdtempSync(resolve(tmpdir(), "codewiki-task-026-"));
try {
	const project = {
		root: runtimeRoot,
		graphPath: resolve(runtimeRoot, ".codewiki/index_graph.json"),
		config: {},
		roadmapPath: ".codewiki/roadmap/queue.json",
	};
	const proposed = await decisionTable.executeDecisionTableAction(project, {
		action: "propose",
		table_id: "DT-TASK-026",
		summary: "Approve migration guard",
		rows: [
			{
				id: "DTR-001",
				current_state: "Legacy path",
				desired_state: "src/change path",
				rationale: "Owner root migration",
				affected_layers: ["code"],
				risk: "low",
				user_action: "pending",
			},
		],
	});
	assert.equal(
		proposed.changed,
		true,
		"Decision-table propose should still report changed=true",
	);
	assert.equal(
		proposed.table.rows[0].user_action,
		"pending",
		"Decision-table propose should preserve pending action",
	);
	const accepted = await decisionTableTool.executeCodewikiDecisionTableTool(
		project,
		{
			action: "accept",
			table_id: "DT-TASK-026",
			row_id: "DTR-001",
		},
	);
	assert.equal(
		accepted.summary,
		"codewiki decision_table: accept",
		"Tool summary should stay stable",
	);
	assert.equal(
		accepted.result.table.rows[0].user_action,
		"approved",
		"Tool execution should preserve accept semantics",
	);
	const runtime = await decisionTable.readRuntimeDecisionTables(project);
	assert.equal(
		runtime.tables[0].rows[0].user_action,
		"approved",
		"Runtime decision-table storage should persist approved row",
	);
} finally {
	rmSync(runtimeRoot, { recursive: true, force: true });
}

const importViolations = [];
for (const filePath of walkCodeFiles(["src", "scripts", "tests"])) {
	const rel = relative(repoRoot, filePath).replaceAll("\\", "/");
	if (rel === thisTest) continue;
	const source = readFileSync(filePath, "utf8");
	for (const specifier of importSpecifiers(source)) {
		if (pointsAtRemovedChangeOwner(filePath, specifier)) {
			importViolations.push(`${rel}: ${specifier}`);
		}
	}
	assert.equal(
		source.includes("src/domain/change/"),
		false,
		`${rel} still references legacy change type path text`,
	);
	assert.equal(
		source.includes("src/application/decision-table"),
		false,
		`${rel} still references legacy decision-table path text`,
	);
	assert.equal(
		source.includes("src/application/tools/decision-table"),
		false,
		`${rel} still references legacy decision-table tool path text`,
	);
}
assert.deepEqual(
	importViolations,
	[],
	"Source, tests, and scripts should not import removed change/decision-table owner paths",
);

const piIndexSource = readFileSync(
	resolve(repoRoot, "src", "adapters", "pi", "index.ts"),
	"utf8",
);
const schemaSource = readFileSync(
	resolve(repoRoot, "src", "adapters", "pi", "schemas.ts"),
	"utf8",
);
const graphSource = readFileSync(
	resolve(repoRoot, "src", "state", "graph.ts"),
	"utf8",
);
const buildSharedSource = readFileSync(
	resolve(repoRoot, "src", "build", "shared.ts"),
	"utf8",
);
const gatewayReportSource = readFileSync(
	resolve(repoRoot, "src", "gateway", "report.ts"),
	"utf8",
);

assert.match(
	piIndexSource,
	/from "\.\.\/\.\.\/api\/tools\.ts"/,
	"Pi adapter should route wiki_decision_table through src/api/tools.ts",
);
const apiFacadeSource = readFileSync(
	resolve(repoRoot, "src", "api", "tools.ts"),
	"utf8",
);
assert.match(
	apiFacadeSource,
	/from "\.\.\/change\/tool\.ts"/,
	"API facade should expose wiki_decision_table from src/change/tool.ts",
);
assert.match(
	schemaSource,
	/from "\.\.\/\.\.\/change\/types\.ts"/,
	"Pi schemas should read change values from src/change/types.ts",
);
assert.match(
	graphSource,
	/from "\.\.\/change\/traceability\.ts"/,
	"Graph builder should read traceability helpers from src/change/traceability.ts",
);
assert.match(
	buildSharedSource,
	/from "\.\.\/change\/traceability\.ts"/,
	"Build shared helpers should read traceability helpers from src/change/traceability.ts",
);
assert.match(
	gatewayReportSource,
	/from "\.\.\/change\/traceability\.ts"/,
	"Gateway report should read traceability helpers from src/change/traceability.ts",
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

function pointsAtRemovedChangeOwner(filePath, specifier) {
	if (specifier.startsWith(".")) {
		const resolved = resolve(dirname(filePath), specifier);
		return removedChangeOwnerAbsPaths.some(
			(removedPath) =>
				resolved === removedPath ||
				resolved === removedPath.replace(/\.ts$/, ""),
		);
	}
	return removedChangeOwnerPaths.some(
		(removedPath) =>
			specifier === removedPath || specifier.endsWith(`/${removedPath}`),
	);
}
