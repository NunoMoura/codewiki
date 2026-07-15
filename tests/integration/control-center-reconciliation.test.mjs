import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const TRACE_ID = "TRACE-changes-backlog-control-center-reconciliation-v1";
const HISTORICAL_TRACE =
	".codewiki/traces/TRACE-ideas-workspace-and-control-center-v1.jsonl";
const HISTORICAL_TRACE_SHA256 =
	"154fc8843c5d75c58c607777edaa1a16834a547c6b324739daf31fce51b878fc";

const criterionEvidence = {
	"WU-reconcile-completed-foundations-v1": {
		criteria: ["foundation-evidence", "obsolete-meaning", "remaining-gaps"],
		source: [
			"src/changes/types.ts",
			"src/changes/git-ref-store.ts",
			"src/changes/accepted-bundle.ts",
			"src/api/wiki-change.ts",
			"src/api/wiki-decide.ts",
			"src/runtime/execution-policy.ts",
		],
		tests: [
			"tests/changes/change-domain.test.mjs",
			"tests/changes/git-ref-store.test.mjs",
			"tests/decision/wiki-decide.test.mjs",
			"tests/runtime/execution-policy.test.mjs",
		],
	},
	"WU-change-validation-cards-v1": {
		criteria: ["semantic-sections", "exact-identity", "safe-rendering"],
		source: [
			"src/changes/validation-view.ts",
			"src/pi/rendering/change-validation-card.ts",
			"src/dashboard/change-validation-card.ts",
		],
		tests: [
			"tests/changes/change-validation-view.test.mjs",
			"tests/runtime/pi-change-validation-card.test.mjs",
			"tests/dashboard/change-validation-card.test.mjs",
		],
	},
	"WU-changes-backlog-dashboard-v1": {
		criteria: ["backlog-view", "guarded-mutations", "authority-ceiling"],
		source: [
			"src/dashboard/changes-state.ts",
			"src/dashboard/change-control.ts",
			"src/dashboard/server.ts",
		],
		tests: [
			"tests/dashboard/changes-state.test.mjs",
			"tests/dashboard/change-control.test.mjs",
			"tests/dashboard/dashboard-browser.test.mjs",
		],
	},
	"WU-dashboard-execution-configuration-v1": {
		criteria: ["config-projection", "safe-patch", "authority-invariants"],
		source: [
			"src/dashboard/config-state.ts",
			"src/dashboard/config-control.ts",
			"src/project/config-file.ts",
		],
		tests: [
			"tests/dashboard/config-state.test.mjs",
			"tests/dashboard/config-control.test.mjs",
			"tests/runtime/wiki-config.test.mjs",
		],
	},
	"WU-feedback-change-intake-v1": {
		criteria: ["deduplicated-intake", "pending-only", "privacy-boundary"],
		source: [
			"src/changes/intake.ts",
			"src/changes/deduplication.ts",
			"lab/runner/change-proposal.ts",
		],
		tests: [
			"tests/changes/change-intake.test.mjs",
			"tests/changes/change-deduplication.test.mjs",
			"tests/lab/change-proposal.test.mjs",
		],
	},
	"WU-worker-execution-policy-integration-v1": {
		criteria: ["policy-dispatch", "explicit-propagation", "fail-closed"],
		source: [
			"src/runtime/host-runner.ts",
			"src/runtime/execution-policy.ts",
			"src/pi/process-session.ts",
			"src/runtime/worker-observation.ts",
		],
		tests: [
			"tests/runtime/host-runner.test.mjs",
			"tests/runtime/pi-process-session.test.mjs",
			"tests/runtime/worker-observation.test.mjs",
		],
	},
	"WU-control-center-integration-proof-v1": {
		criteria: ["regression-proof", "clean-vocabulary", "aggregate-evidence"],
		source: [
			"README.md",
			".codewiki/kb/system/components/decision-loop.md",
			".codewiki/kb/system/components/api-tools.md",
			".codewiki/kb/system/components/runtime.md",
		],
		tests: [
			"tests/integration/control-center-reconciliation.test.mjs",
			"tests/runtime/readiness-checklist.test.mjs",
			"tests/runtime/package-install-smoke.mjs",
		],
	},
};

function traceRecords(path) {
	return readFileSync(path, "utf8")
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line, index) => {
			try {
				return JSON.parse(line);
			} catch (error) {
				throw new Error(`Invalid trace JSON at ${path}:${index + 1}.`, {
					cause: error,
				});
			}
		});
}

function filesUnder(root) {
	const result = [];
	for (const name of readdirSync(root).sort()) {
		const path = join(root, name);
		if (statSync(path).isDirectory()) result.push(...filesUnder(path));
		else result.push(path);
	}
	return result;
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

describe("control-center reconciliation integration", () => {
	it("maps every planned criterion to existing source and tests", () => {
		const records = traceRecords(`.codewiki/traces/${TRACE_ID}.jsonl`);
		const planning = records.find(
			(record) =>
				record.loop === "planning" && record.event === "work_units_created",
		);
		assert.ok(planning, "reconciliation Planning iteration is missing");
		const workItems = planning.data.output.workItems;
		assert.deepEqual(
			workItems.map((item) => item.id).sort(),
			Object.keys(criterionEvidence).sort(),
		);
		for (const item of workItems) {
			const evidence = criterionEvidence[item.id];
			assert.deepEqual(
				item.acceptanceCriteria.map((criterion) => criterion.id),
				evidence.criteria,
				item.id,
			);
			assert.equal(evidence.source.length > 0, true, `${item.id} source proof`);
			assert.equal(evidence.tests.length > 0, true, `${item.id} test proof`);
			for (const path of [...evidence.source, ...evidence.tests]) {
				assert.equal(existsSync(path), true, `${item.id}: ${path}`);
			}
		}
	});

	it("keeps historical trace bytes immutable while current truth supersedes it", () => {
		const historical = readFileSync(HISTORICAL_TRACE);
		assert.equal(sha256(historical), HISTORICAL_TRACE_SHA256);
		const current = traceRecords(`.codewiki/traces/${TRACE_ID}.jsonl`);
		assert.equal(current[0].type, "trace_head");
		assert.equal(
			current[0].origin.refs.includes(
				"trace:TRACE-ideas-workspace-and-control-center-v1:planning:iteration:2",
			),
			true,
		);
	});

	it("documents delivered control-center boundaries on canonical surfaces", () => {
		const readme = readFileSync("README.md", "utf8");
		const decision = readFileSync(
			".codewiki/kb/system/components/decision-loop.md",
			"utf8",
		);
		const tools = readFileSync(
			".codewiki/kb/system/components/api-tools.md",
			"utf8",
		);
		const runtime = readFileSync(
			".codewiki/kb/system/components/runtime.md",
			"utf8",
		);
		assert.match(readme, /## Changes Backlog and control center/);
		assert.match(readme, /pending unvalidated Change/);
		assert.match(readme, /fully exit and restart Pi/i);
		assert.match(decision, /shared validation card projection/);
		assert.match(decision, /cannot accept Changes/);
		assert.match(tools, /feedback intake/);
		assert.match(tools, /pending unvalidated Change/);
		assert.match(tools, /configuration control/i);
		assert.match(runtime, /resolves worker policy before claim append/);
		assert.match(runtime, /policy digest/);
		assert.match(runtime, /usage telemetry/);
	});

	it("keeps active shipped surfaces on canonical Change vocabulary", () => {
		const activeFiles = [
			...filesUnder("src").filter((path) => path.endsWith(".ts")),
			"README.md",
			".codewiki/kb/system/components/decision-loop.md",
			".codewiki/kb/system/components/api-tools.md",
			".codewiki/kb/system/components/runtime.md",
		];
		const activeText = activeFiles
			.map((path) => `${path}\n${readFileSync(path, "utf8")}`)
			.join("\n---\n");
		for (const forbidden of [
			"wiki_ideas",
			"refs/codewiki/ideas",
			"ProposedChange",
			"src/ideas/",
		]) {
			assert.equal(activeText.includes(forbidden), false, forbidden);
		}
		for (const path of [
			"src/ideas",
			"src/api/wiki-ideas.ts",
			"src/ideas/git-ref-store.ts",
		]) {
			assert.equal(existsSync(path), false, path);
		}
		for (const required of [
			"Changes Backlog",
			"exact validated Change",
			"pending unvalidated Change",
			"execution policy",
		]) {
			assert.match(activeText, new RegExp(required, "i"), required);
		}
	});
});
