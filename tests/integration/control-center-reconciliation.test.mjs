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
			"src/runtime/workers/execution-policy.ts",
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
			"src/clients/pi/rendering/change-validation-card.ts",
			"src/dashboard/change-validation-card.ts",
		],
		tests: [
			"tests/changes/change-validation-view.test.mjs",
			"tests/clients/pi/change-validation-card.test.mjs",
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
	"WU-change-intake-contract-v1": {
		criteria: [
			"closed-source-union",
			"authenticated-admission",
			"deduplicated-routing",
			"qualified-defect-profile",
			"closed-source-producers",
			"snapshot-bound-triage-projection",
			"bounded-shared-triage-query",
			"privacy-boundary",
			"git-cas",
		],
		source: [
			"src/changes/defect-profile.ts",
			"src/changes/intake/contracts.ts",
			"src/changes/intake/normalize.ts",
			"src/changes/intake/producers.ts",
			"src/changes/intake/deduplicate.ts",
			"src/changes/intake/route.ts",
			"src/runtime/admission/change.ts",
			"src/runtime/workers/implementation-adapter.ts",
			"src/runtime/workers/reports.ts",
			"src/harnesses/pi/process-worker-adapter.ts",
			"src/changes/triage/contracts.ts",
			"src/changes/triage/estimates.ts",
			"src/changes/triage/ordering.ts",
			"src/changes/triage/projection.ts",
			"src/changes/triage/query.ts",
		],
		tests: [
			"tests/changes/change-intake.test.mjs",
			"tests/runtime/admission/change.test.mjs",
			"tests/changes/change-intake-producers.test.mjs",
			"tests/changes/defect-profile.test.mjs",
			"tests/changes/backlog-triage.test.mjs",
			"tests/harnesses/pi/process-worker-adapter.test.mjs",
		],
	},
	"WU-worker-execution-policy-integration-v1": {
		criteria: ["policy-dispatch", "explicit-propagation", "fail-closed"],
		source: [
			"src/runtime/workers/start.ts",
			"src/runtime/workers/execution-policy.ts",
			"src/harnesses/pi/process-session.ts",
			"src/runtime/workers/observation.ts",
		],
		tests: [
			"tests/runtime/worker-start.test.mjs",
			"tests/harnesses/pi/process-session.test.mjs",
			"tests/runtime/worker-observation.test.mjs",
		],
	},
	"WU-control-center-integration-proof-v1": {
		criteria: ["regression-proof", "clean-vocabulary", "aggregate-evidence"],
		source: [
			"README.md",
			".codewiki/kb/system/components/decision.md",
			".codewiki/kb/system/components/api.md",
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
			".codewiki/kb/system/components/decision.md",
			"utf8",
		);
		const tools = readFileSync(
			".codewiki/kb/system/components/api.md",
			"utf8",
		);
		const runtime = readFileSync(
			".codewiki/kb/system/components/runtime.md",
			"utf8",
		);
		assert.match(readme, /## Work and project control plane/);
		assert.match(readme, /persisted pending Change revisions/);
		assert.match(readme, /fully (?:exit and )?restart Pi/i);
		assert.match(decision, /one authenticated exact Change revision/i);
		assert.match(decision, /Runtime owns admission, scheduling, identity, persistence/i);
		assert.match(tools, /delegates semantics and authority to their owning packages/i);
		assert.match(tools, /reject unknown fields and caller-supplied Runtime-owned identity/i);
		assert.match(runtime, /project-scoped control plane/i);
		assert.match(runtime, /exact current state and authority/i);
	});

	it("keeps active shipped surfaces on canonical Change vocabulary", () => {
		const activeFiles = [
			...filesUnder("src").filter((path) => path.endsWith(".ts")),
			"README.md",
			".codewiki/kb/system/components/decision.md",
			".codewiki/kb/system/components/api.md",
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
			"Change intake material",
			"execution policy",
		]) {
			assert.match(activeText, new RegExp(required, "i"), required);
		}
	});
});
