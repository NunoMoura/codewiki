import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createImplementationWorkerPrompt } from "../../../src/project-server/workers/prompt.ts";

function promptInput(overrides = {}) {
	return {
		workUnitId: "WU-a",
		traceId: "TRACE-pi-a",
		title: "Implement runtime worker custody",
		planningRefs: ["trace:TRACE-pi-a:planning:iteration:1#work:WU-a"],
		componentRefs: ["component.runtime"],
		pathScopes: ["src/project-server/**"],
		traceRefs: ["trace:TRACE-pi-a"],
		worktree: {
			path: "/tmp/worktrees/WU-a",
			branch: "codewiki/TRACE-pi-a/WU-a/pi-worker-001",
			baseRef: "abc1234",
		},
		...overrides,
	};
}

function workerReportExample(prompt) {
	const match = /```codewiki-worker-report\n([\s\S]*?)\n```/.exec(prompt);
	assert.ok(match?.[1]);
	try {
		return JSON.parse(match[1]);
	} catch (error) {
		assert.fail(
			`Worker report example is invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`,
		);
	}
}

describe("implementation worker prompt", () => {
	it("binds bounded assignment context and isolated worktree custody", () => {
		const prompt = createImplementationWorkerPrompt(promptInput());

		assert.match(prompt, /Work unit: WU-a/);
		assert.match(prompt, /Trace: TRACE-pi-a/);
		assert.match(prompt, /- component\.runtime/);
		assert.match(prompt, /- src\/project-server\/\*\*/);
		assert.match(prompt, /Worktree:\n- path: \/tmp\/worktrees\/WU-a/);
		assert.match(prompt, /- branch: codewiki\/TRACE-pi-a\/WU-a\/pi-worker-001/);
		assert.match(prompt, /Worker owns local TDD/);
		assert.match(prompt, /Worker output is evidence only/);
		const report = workerReportExample(prompt);
		assert.equal(report.status, "completed");
		assert.equal(report.workUnitRef, "trace:<planning-iteration>#work:WU-a");
		assert.equal(report.changes[0].id, "IC-WU-a");
		assert.equal(
			report.changes[0].acceptanceEvidenceItems[0].criterionId,
			"AC-001",
		);
	});

	it("rejects prompt construction without exact worktree path", () => {
		assert.throws(
			() =>
				createImplementationWorkerPrompt(
					promptInput({ worktree: { path: "" } }),
				),
			/Implementation worker prompt requires isolated worktree custody\./,
		);
	});
});
