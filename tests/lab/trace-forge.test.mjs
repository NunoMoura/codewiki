import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { forgeTraceCases } from "../../lab/runner/trace-forge.ts";

const CREATED_AT = "2026-06-24T00:00:00.000Z";

describe("trace-derived case forge", () => {
	it("reduces semantic trace events into human-labeled draft cases", () => {
		const report = forgeTraceCases([
			traceHead(),
			decisionEvent({
				status: "exit",
				event: "changes_approved",
				output: {
					summary:
						"Approve audit after checking /home/nuno/private/project/src/file.ts and preserving trace refs.",
					approvedChanges: [
						{
							id: "D-1",
							currentState: "Uses /tmp/secret-worktree/source.ts.",
							sessionId: "session-secret",
						},
					],
					issueCodes: [],
				},
			}),
		]);

		assert.equal(report.version, 1);
		assert.deepEqual(report.sourceTraces, ["TRACE-forge"]);
		assert.equal(report.draftCount, 1);
		assert.equal(report.drafts[0].loop, "decision");
		assert.equal(report.drafts[0].suggestedExpected, "pass");
		assert.equal(report.drafts[0].labelStatus, "needs_human_label");
		assert.match(report.warnings[0], /Draft labels are suggestions only/);
		const serialized = JSON.stringify(report.drafts[0]);
		assert.doesNotMatch(serialized, /\/home\/nuno/);
		assert.doesNotMatch(serialized, /\/tmp\/secret-worktree/);
		assert.doesNotMatch(serialized, /session-secret/);
		assert.match(serialized, /<abs-path>/);
		assert.match(serialized, /<redacted>/);
		assert.equal(report.drafts[0].sanitization.redactedFields, 1);
		assert.equal(report.drafts[0].sanitization.redactedAbsolutePaths, 2);
	});

	it("suggests block and fail labels from blocked or route-back exits", () => {
		const report = forgeTraceCases([
			traceHead(),
			implementationEvent({
				sequence: 1,
				event: "implementation_blocked",
				status: "blocked",
				issueCodes: ["failed_check"],
			}),
			planningEvent({
				sequence: 2,
				event: "route_back_requested",
				status: "route_back",
				conditions: [{ id: "decision_coverage_complete", status: "unmet" }],
			}),
		]);

		assert.deepEqual(
			report.drafts.map((draft) => [
				draft.loop,
				draft.suggestedExpected,
				draft.downstreamSignals,
			]),
			[
				[
					"implementation",
					"block",
					["exit.status=blocked", "targetLoop=none", "issue=failed_check"],
				],
				[
					"planning",
					"fail",
					[
						"exit.status=route_back",
						"targetLoop=none",
						"condition=decision_coverage_complete:unmet",
					],
				],
			],
		);
	});

	it("warns when a trace has no semantic loop events", () => {
		const report = forgeTraceCases([traceHead()]);

		assert.equal(report.draftCount, 0);
		assert.match(report.warnings[0], /No semantic loop events/);
	});
});

function traceHead() {
	return {
		type: "trace_head",
		traceId: "TRACE-forge",
		title: "Forge test",
		createdAt: CREATED_AT,
	};
}

function decisionEvent({ event, status, output }) {
	return semanticEvent({
		loop: "decision",
		event,
		status,
		output,
	});
}

function planningEvent({ sequence, event, status, conditions = [] }) {
	return semanticEvent({
		loop: "planning",
		event,
		sequence,
		status,
		output: {
			decisionRefs: ["trace:TRACE-forge:decision:iteration:1#change:D-1"],
			workItems: [],
			resolutions: [],
			issueCodes: [],
		},
		conditions,
	});
}

function implementationEvent({ sequence, event, status, issueCodes }) {
	return semanticEvent({
		loop: "implementation",
		event,
		sequence,
		status,
		output: {
			planningRefs: ["trace:TRACE-forge:planning:iteration:1#work:PW-1"],
			changes: [],
			issueCodes,
		},
	});
}

function semanticEvent({
	loop,
	event,
	sequence = 1,
	status,
	output,
	conditions = [],
}) {
	return {
		type: "trace_event",
		id: `TRACE-forge:${loop}:iteration:${sequence}`,
		parentId: null,
		traceId: "TRACE-forge",
		sequence,
		loop,
		event,
		refs: ["src/traces/events.ts"],
		createdAt: CREATED_AT,
		data: {
			iteration: sequence,
			trigger: loop,
			output,
			exit: {
				status,
				conditions,
			},
			progress: {
				changedRefs: [],
				newlyMetConditions: [],
				repeatedFailures: [],
			},
		},
	};
}
