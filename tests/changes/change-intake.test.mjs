import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { intakeChangeFeedback } from "../../src/changes/intake.ts";

function feedback(overrides = {}) {
	return {
		source: "runtime",
		sourceId: "budget-observation-001",
		summary: "Runtime budget attribution needs clearer operator evidence.",
		question: "Should runtime budget attribution become clearer?",
		currentState: "Operators receive a generic budget failure.",
		desiredState: "Operators receive exact bounded budget attribution.",
		rationale: "Exact attribution makes remediation deterministic.",
		nonGoals: ["Do not increase execution authority."],
		kind: "improve",
		type: "behavior_change",
		scope: "runtime",
		affectedLayers: ["runtime", "dashboard"],
		targetRefs: ["src/runtime/execution-policy.ts"],
		sourceRefs: ["trace:TRACE-budget:implementation:iteration:1"],
		proofRefs: ["tests/runtime/execution-policy.test.mjs"],
		userImpact: "Operators understand why execution stopped.",
		maintainerImpact: "Budget regressions have exact evidence.",
		knowledgeTopicRefs: ["kb:system/components/runtime.md"],
		evidenceExpectations: ["Runtime policy and supervisor tests pass."],
		risk: "low",
		failureModes: ["Attribution may identify the wrong exhausted limit."],
		successSignal: "Budget tests report the exact exhausted limit.",
		regressionPlan: "Run execution-policy and supervisor tests.",
		effort: "low",
		workScale: "small",
		...overrides,
	};
}

describe("feedback Change intake", () => {
	it("creates only pending unvalidated Changes and reinforces exact matches", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-change-intake-"));
		try {
			execFileSync("git", ["init", "-q"], { cwd: root });
			const created = await intakeChangeFeedback({
				repoRoot: root,
				expectedHead: null,
				feedback: feedback(),
				now: () => new Date("2026-07-14T10:30:00.000Z"),
			});
			assert.equal(created.action, "created");
			assert.equal(created.record.change.status, "pending");
			assert.equal(created.record.change.validation.state, "draft");
			assert.match(created.record.change.id, /^CHG-feedback-runtime-/);
			assert.equal(created.record.recordRevision, 1);
			const reinforced = await intakeChangeFeedback({
				repoRoot: root,
				expectedHead: created.head,
				feedback: feedback({
					proofRefs: ["tests/runtime/trace-host-supervisor.test.mjs"],
				}),
				now: () => new Date("2026-07-14T10:31:00.000Z"),
			});
			assert.equal(reinforced.action, "reinforced");
			assert.equal(reinforced.record.change.id, created.record.change.id);
			assert.equal(reinforced.record.recordRevision, 2);
			assert.equal(reinforced.record.change.status, "pending");
			assert.equal(reinforced.record.change.validation.state, "draft");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects private, secret-bearing, oversized, and authority-expanding input", async () => {
		const root = await mkdtemp(
			join(tmpdir(), "codewiki-change-intake-private-"),
		);
		try {
			execFileSync("git", ["init", "-q"], { cwd: root });
			for (const invalid of [
				feedback({ prompt: "hidden model prompt" }),
				feedback({ summary: "Use api_key=sk-secret-value-123456789" }),
				feedback({ currentState: "x".repeat(4_001) }),
				feedback({ action: "accept" }),
			]) {
				await assert.rejects(
					intakeChangeFeedback({
						repoRoot: root,
						expectedHead: null,
						feedback: invalid,
					}),
					/unsupported|sensitive|exceed/i,
				);
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
