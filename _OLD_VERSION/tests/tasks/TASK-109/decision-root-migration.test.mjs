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
const requiredDecisionFiles = [
	"src/decision/types.ts",
	"src/decision/traceability.ts",
	"src/decision/table.ts",
	"src/decision/tool.ts",
];
const removedDecisionOwnerPaths = [
	"src/change/types.ts",
	"src/change/traceability.ts",
	"src/change/decision-table.ts",
	"src/change/tool.ts",
	"src/domain/change/types.ts",
	"src/domain/change/traceability.ts",
	"src/application/decision-table.ts",
	"src/application/tools/decision-table.ts",
];
const removedDecisionOwnerAbsPaths = removedDecisionOwnerPaths.map((path) =>
	resolve(repoRoot, path),
);

for (const path of requiredDecisionFiles) {
	assert.ok(
		existsSync(resolve(repoRoot, path)),
		`TASK-109 decision owner path missing: ${path}`,
	);
}
for (const path of removedDecisionOwnerPaths) {
	assert.equal(
		existsSync(resolve(repoRoot, path)),
		false,
		`Retired decision/change owner path remains: ${path}`,
	);
}

const decisionTypes = await import(
	pathToFileURL(resolve(repoRoot, "src", "decision", "types.ts")).href
);
const traceability = await import(
	pathToFileURL(resolve(repoRoot, "src", "decision", "traceability.ts")).href
);
const decisionTable = await import(
	pathToFileURL(resolve(repoRoot, "src", "decision", "table.ts")).href
);
const decisionTableTool = await import(
	pathToFileURL(resolve(repoRoot, "src", "decision", "tool.ts")).href
);

assert.deepEqual(
	decisionTypes.CHANGE_TYPE_VALUES,
	["product", "system", "task", "code"],
	"Change type values must stay stable",
);
assert.deepEqual(
	decisionTypes.TRACEABILITY_EXEMPTION_VALUES,
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
const decisionTypesSource = readFileSync(
	resolve(repoRoot, "src", "decision", "types.ts"),
	"utf8",
);
const decisionTableSource = readFileSync(
	resolve(repoRoot, "src", "decision", "table.ts"),
	"utf8",
);
assert.match(
	decisionTypesSource,
	/interface CodewikiDecisionTableRowInput/,
	"Decision-table row input should be owned by src/decision/types.ts",
);
assert.doesNotMatch(
	decisionTableSource,
	/\.\.\/build\/types\.ts/,
	"Runtime decision-table use case should not depend on build-owned types",
);
assert.equal(
	typeof decisionTable.executeDecisionTableAction,
	"function",
	"Decision-table mutation use case should be owned by src/decision/table.ts",
);
assert.equal(
	typeof decisionTable.readRuntimeDecisionTables,
	"function",
	"Decision-table storage read helper should be owned by src/decision/table.ts",
);
assert.equal(
	typeof decisionTableTool.executeCodewikiDecisionTableTool,
	"function",
	"wiki_decision_table tool execution should be owned by src/decision/tool.ts",
);

const runtimeRoot = mkdtempSync(resolve(tmpdir(), "codewiki-task-109-"));
try {
	const project = {
		root: runtimeRoot,
		graphPath: resolve(runtimeRoot, ".codewiki/index_graph.json"),
		config: {},
		roadmapPath: ".codewiki/roadmap/queue.json",
	};
	const proposed = await decisionTable.executeDecisionTableAction(project, {
		action: "propose",
		table_id: "DT-TASK-109",
		summary: "Approve decision root migration guard",
		rows: [
			{
				id: "DTR-001",
				current_state: "Decision code lived under src/change.",
				desired_state: "Decision code lives under src/decision.",
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
			table_id: "DT-TASK-109",
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
const retiredPathTextAllowlist = new Set([
	thisTest,
	"tests/smoke/package-smoke.test.mjs",
]);
for (const filePath of walkCodeFiles(["src", "scripts", "tests"])) {
	const rel = relative(repoRoot, filePath).replaceAll("\\", "/");
	if (rel === thisTest) continue;
	const source = readFileSync(filePath, "utf8");
	for (const specifier of importSpecifiers(source)) {
		if (pointsAtRemovedDecisionOwner(filePath, specifier)) {
			importViolations.push(`${rel}: ${specifier}`);
		}
	}
	if (!retiredPathTextAllowlist.has(rel)) {
		assert.equal(
			source.includes("src/change/"),
			false,
			`${rel} still references retired src/change path text`,
		);
	}
	if (!retiredPathTextAllowlist.has(rel)) {
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
}
assert.deepEqual(
	importViolations,
	[],
	"Source, tests, and scripts should not import retired decision/change owner paths",
);

const apiFacadeSource = readFileSync(
	resolve(repoRoot, "src", "api", "tools.ts"),
	"utf8",
);
const schemaSource = readFileSync(
	resolve(repoRoot, "src", "adapters", "pi", "schemas.ts"),
	"utf8",
);
const decisionApprovalSource = readFileSync(
	resolve(repoRoot, "src", "adapters", "pi", "ui", "decision-approval.ts"),
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
	apiFacadeSource,
	/from "\.\.\/decision\/tool\.ts"/,
	"API facade should expose wiki_decision_table from src/decision/tool.ts",
);
assert.match(
	schemaSource,
	/from "\.\.\/\.\.\/decision\/types\.ts"/,
	"Pi schemas should read decision values from src/decision/types.ts",
);
assert.match(
	decisionApprovalSource,
	/from "\.\.\/\.\.\/\.\.\/decision\/table\.ts"/,
	"Decision approval UI should use src/decision/table.ts",
);
assert.match(
	graphSource,
	/from "\.\.\/decision\/traceability\.ts"/,
	"Graph builder should read traceability helpers from src/decision/traceability.ts",
);
assert.match(
	buildSharedSource,
	/from "\.\.\/decision\/traceability\.ts"/,
	"Build shared helpers should read traceability helpers from src/decision/traceability.ts",
);
assert.match(
	gatewayReportSource,
	/from "\.\.\/decision\/traceability\.ts"/,
	"Gateway report should read traceability helpers from src/decision/traceability.ts",
);

console.log("✓ TASK-109 decision root migration test passed");

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

function pointsAtRemovedDecisionOwner(filePath, specifier) {
	if (specifier.startsWith(".")) {
		const resolved = resolve(dirname(filePath), specifier);
		return removedDecisionOwnerAbsPaths.some(
			(removedPath) =>
				resolved === removedPath ||
				resolved === removedPath.replace(/\.ts$/, ""),
		);
	}
	return removedDecisionOwnerPaths.some(
		(removedPath) =>
			specifier === removedPath || specifier.endsWith(`/${removedPath}`),
	);
}
