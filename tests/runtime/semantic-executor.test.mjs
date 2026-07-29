import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { createChangeRecord } from "../../src/changes/records.ts";
import { ChangeTraceStore } from "../../src/changes/trace-store.ts";
import { appendTraceRecords } from "../../src/traces/append.ts";
import { readTraceFileSnapshot } from "../../src/traces/reader.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { runRuntimeSemanticExecutor } from "../../src/runtime/semantic-executor.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";
import { seedRuntimeImplementation } from "../helpers/runtime-implementation.mjs";

const roots = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function decisionFixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-semantic-executor-"));
	roots.push(root);
	const record = createChangeRecord(
		acceptedChangeFixture({ id: "CHG-runtime-semantic" }),
	);
	await new ChangeTraceStore({ repoRoot: root }).write({
		expectedHead: null,
		records: [record],
		message: "Persist runtime-selected Change",
		actor: "user:maintainer",
		createdAt: "2026-08-06T00:00:00.000Z",
	});
	return { root, record };
}

describe("runtime semantic executor", () => {
	it("quiesces without invoking an adapter when no semantic work is eligible", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-semantic-empty-"));
		roots.push(root);
		let calls = 0;
		const result = await runRuntimeSemanticExecutor({
			repoRoot: root,
			trigger: { kind: "manual_resume" },
			mode: "append",
			adapters: {
				decision() {
					calls += 1;
					throw new Error("adapter must not run");
				},
			},
		});

		assert.equal(result.status, "quiescent");
		assert.equal(result.iterations, 0);
		assert.equal(calls, 0);
	});

	it("rejects semantic candidates that claim runtime-owned entity authority", async () => {
		const { root } = await decisionFixture();
		await assert.rejects(
			() =>
				runRuntimeSemanticExecutor({
					repoRoot: root,
					trigger: { kind: "manual_resume" },
					mode: "preview",
					adapters: {
						decision: () => ({
							changeId: "CHG-caller-selected",
							disposition: "approve",
							rationale: "Caller attempted to select authority.",
						}),
					},
				}),
			/Runtime decision candidate cannot supply runtime-owned fields: changeId/,
		);
		await assert.rejects(
			() =>
				runRuntimeSemanticExecutor({
					repoRoot: root,
					trigger: { kind: "manual_resume" },
					mode: "preview",
					adapters: {
						decision: () => ({
							disposition: "approve",
							rationale: "Caller attempted to forge runtime recovery.",
							runtimeJobId: `runtime-reaction:${"0".repeat(64)}`,
						}),
					},
				}),
			/Runtime decision candidate cannot supply runtime-owned fields: runtimeJobId/,
		);
		await assert.rejects(
			() =>
				runRuntimeSemanticExecutor({
					repoRoot: root,
					trigger: { kind: "manual_resume" },
					mode: "preview",
					adapters: {
						decision: () => ({
							disposition: "approve",
							rationale: "No authenticated Runtime context exists.",
						}),
					},
				}),
			/Runtime decision context is required/,
		);
	});

	it("re-observes and reruns selected semantic work after a CAS race", async () => {
		const { root, record } = await decisionFixture();
		let calls = 0;
		const result = await runRuntimeSemanticExecutor({
			repoRoot: root,
			trigger: { kind: "manual_resume" },
			mode: "append",
			maxIterations: 1,
			maxCasRetries: 1,
			context: {
				decision: {
					authority: {
						kind: "user",
						actor: "user:maintainer",
						ref: "confirmation:cas-rerun",
					},
					occurredAt: "2026-08-06T00:00:01.000Z",
				},
			},
			adapters: {
				async decision() {
					calls += 1;
					if (calls === 1) {
						const traceId = `TRACE-${record.change.id}`;
						const path = join(root, traceFilePath(traceId));
						const trace = await readTraceFileSnapshot(path);
						const events = trace.records.filter(
							(entry) => entry.type === "trace_event",
						);
						await appendTraceRecords(
							root,
							[
								{
									type: "trace_event",
									id: `${traceId}:concurrent:${events.length + 1}`,
									traceId,
									sequence:
										Math.max(0, ...events.map((event) => event.sequence)) + 1,
									parentId:
										trace.records.at(-1)?.type === "trace_head"
											? null
											: trace.records.at(-1)?.id || null,
									event: "runtime.concurrent_observation",
									refs: [],
									createdAt: "2026-08-06T00:00:00.500Z",
									data: { source: "test" },
								},
							],
							trace.bytes,
						);
					}
					return {
						disposition: "approve",
						rationale: "Revalidated after concurrent trace movement.",
					};
				},
			},
		});

		assert.equal(calls, 2);
		assert.equal(result.casRetries, 1);
		assert.equal(result.outcomes.length, 1);
		assert.equal(result.outcomes[0].result.report.exit.status, "exit");
	});

	it("adapts non-authoritative command results into the legacy Implementation facade", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-semantic-implementation-"));
		roots.push(root);
		const seeded = await seedRuntimeImplementation(root, {
			suffix: "semantic-command-results",
		});
		const result = await runRuntimeSemanticExecutor({
			repoRoot: root,
			trigger: { kind: "manual_resume" },
			mode: "preview",
			maxIterations: 1,
			adapters: {
				implementation: () => ({
					evidence: [
						{
							workItemId: seeded.workItemId,
							commands: ["npm test"],
							commandResults: [
								{ command: "npm test", status: "pass", exitCode: 0 },
							],
						},
					],
				}),
			},
		});

		assert.equal(result.outcomes[0].loop, "implementation");
		assert.deepEqual(
			result.outcomes[0].result.loopResult.changes[0].checkResults,
			[{ command: "npm test", status: "pass", exitCode: 0 }],
		);
	});

	it("invokes only selected adapter and injects exact Change append authority", async () => {
		const { root, record } = await decisionFixture();
		let planningCalls = 0;
		let implementationCalls = 0;
		const result = await runRuntimeSemanticExecutor({
			repoRoot: root,
			trigger: { kind: "manual_resume" },
			mode: "append",
			maxIterations: 1,
			context: {
				decision: {
					authority: {
						kind: "user",
						actor: "user:maintainer",
						ref: "confirmation:runtime-semantic",
					},
					occurredAt: "2026-08-06T00:00:01.000Z",
				},
			},
			adapters: {
				decision(invocation) {
					assert.equal(invocation.change.id, record.change.id);
					assert.equal(
						invocation.change.record.recordRevision,
						record.recordRevision,
					);
					assert.match(invocation.observedWorkStateDigest, /^sha256:/);
					return {
						disposition: "approve",
						rationale: "Validated runtime-owned exact Change context.",
					};
				},
				planning() {
					planningCalls += 1;
					throw new Error("Planning must not run in Decision iteration");
				},
				implementation() {
					implementationCalls += 1;
					throw new Error("Implementation must not run in Decision iteration");
				},
			},
		});

		assert.equal(result.status, "budget_exhausted");
		assert.equal(result.iterations, 1);
		assert.equal(result.outcomes[0].loop, "decision");
		assert.equal(result.outcomes[0].result.mode, "append");
		assert.equal(result.outcomes[0].result.report.exit.status, "exit");
		assert.equal(planningCalls, 0);
		assert.equal(implementationCalls, 0);
	});
});
