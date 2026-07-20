import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const criterionEvidence = {
	"WU-reconcile-completed-foundations-v1": {
		criteria: ["foundation-evidence", "obsolete-meaning", "remaining-gaps"],
		source: [
			"src/changes/types.ts",
			"src/changes/change-trace.ts",
			"src/changes/trace-store.ts",
			"src/work-state/projector.ts",
			"src/decision/change-quality.ts",
			"src/api/wiki-change.ts",
			"src/api/wiki-decide.ts",
			"src/runtime/execution-policy.ts",
		],
		tests: [
			"tests/changes/change-domain.test.mjs",
			"tests/changes/change-trace-store.test.mjs",
			"tests/work-state/work-state.test.mjs",
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

function filesUnder(root) {
	const result = [];
	for (const name of readdirSync(root).sort()) {
		const path = join(root, name);
		if (statSync(path).isDirectory()) result.push(...filesUnder(path));
		else result.push(path);
	}
	return result;
}

describe("control-center reconciliation integration", () => {
	it("maps every reconciled acceptance area to existing source and tests", () => {
		for (const [workItemId, evidence] of Object.entries(criterionEvidence)) {
			assert.equal(
				new Set(evidence.criteria).size,
				evidence.criteria.length,
				`${workItemId} criteria`,
			);
			assert.equal(
				evidence.source.length > 0,
				true,
				`${workItemId} source proof`,
			);
			assert.equal(evidence.tests.length > 0, true, `${workItemId} test proof`);
			for (const path of [...evidence.source, ...evidence.tests]) {
				assert.equal(existsSync(path), true, `${workItemId}: ${path}`);
			}
		}
	});

	it("keeps dogfood traces out of active source-repository state", () => {
		const traceFiles = filesUnder(".codewiki/traces").filter((path) =>
			/\/TRACE-.*\.jsonl$/.test(path),
		);
		assert.deepEqual(traceFiles, []);
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
		assert.match(readme, /fully (?:exit and )?restart Pi/i);
		assert.match(decision, /Decision is a process.*not a domain entity/i);
		assert.match(decision, /exact approved Change revision/i);
		assert.match(tools, /First explicit persistence creates a Change Trace/i);
		assert.match(tools, /Configuration renders a grouped form/i);
		assert.match(runtime, /WorkState refresh/i);
		assert.match(runtime, /policy snapshot and lease/i);
		assert.match(runtime, /supervised event-driven outer control loop/i);
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
