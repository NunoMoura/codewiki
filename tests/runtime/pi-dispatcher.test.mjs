import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	createPiWorkerPrompt,
	dispatchPiRuntimeWorkers,
	dispatchPiWorkers,
} from "../../src/pi/dispatcher.ts";
import { planningQualityStandards } from "../../src/planning/quality-standards.ts";
import { createRuntimeDispatchClaimEvents } from "../../src/runtime/dispatcher.ts";
import { planRuntimeDispatch } from "../../src/runtime/scheduler.ts";
import { appendTraceRecord } from "../../src/traces/append.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { createTraceHead } from "../../src/traces/writer.ts";
import { buildWorkQueueView } from "../../src/views/work-queue.ts";

function planningEvent(traceId, workUnitId, pathScope) {
	const decisionRef = `trace:${traceId}:decision:iteration:1#row:DTR-${workUnitId}`;
	return {
		type: "trace_event",
		id: `${traceId}:planning:iteration:1`,
		parentId: null,
		traceId,
		sequence: 1,
		loop: "planning",
		event: "planning.iteration",
		refs: [decisionRef, pathScope],
		createdAt: "2026-06-11T00:00:01.000Z",
		data: {
			exit: { status: "exit", targetLoop: "implementation" },
			output: {
				qualityStandards: planningQualityStandards([]),
				workItems: [
					{
						id: workUnitId,
						title: `Work ${workUnitId}`,
						decisionRefs: [decisionRef],
						componentRefs: ["component.runtime"],
						pathScopes: [pathScope],
						dependsOn: [],
					},
				],
			},
		},
	};
}

function planningWorkRef(event, workUnitId) {
	return `trace:${event.id}#work:${workUnitId}`;
}

function plannedDispatch() {
	const first = planningEvent("TRACE-pi-a", "WU-a", "src/runtime");
	const second = planningEvent("TRACE-pi-b", "WU-b", "src/views");
	const queue = buildWorkQueueView({ records: [first, second] });
	const plan = planRuntimeDispatch(queue, { maxWorkers: 2 });
	const claimBatch = createRuntimeDispatchClaimEvents(plan, {
		createdAt: "2026-06-11T00:00:02.000Z",
		nextSequenceByTrace: {
			"TRACE-pi-a": 2,
			"TRACE-pi-b": 2,
		},
		workerIdPrefix: "pi-worker",
	});
	return { plan, claimBatch, queue };
}

function workerReportExample(prompt) {
	const match = /```codewiki-worker-report\n([\s\S]*?)\n```/.exec(prompt);
	assert.ok(match?.[1]);
	return JSON.parse(match[1]);
}

describe("Pi worker dispatcher seam", () => {
	it("creates scoped implementation worker prompts", () => {
		const { plan } = plannedDispatch();
		const prompt = createPiWorkerPrompt(plan.dispatch[0], {
			promptPrefix: "PREFIX",
			promptSuffix: "SUFFIX",
		});

		assert.equal(prompt.startsWith("PREFIX\nYou are a CodeWiki"), true);
		assert.equal(prompt.includes("Work unit: WU-a"), true);
		assert.equal(prompt.includes("Trace: TRACE-pi-a"), true);
		assert.equal(
			prompt.includes(
				`- ${planningWorkRef(planningEvent("TRACE-pi-a", "WU-a", "src/runtime"), "WU-a")}`,
			),
			true,
		);
		assert.equal(prompt.includes("- component.runtime"), true);
		assert.equal(prompt.includes("- src/runtime"), true);
		assert.equal(prompt.includes("Worker owns local TDD"), true);
		assert.equal(prompt.includes("codewiki-worker-report"), true);
		assert.equal(prompt.includes("Worker output is evidence only"), true);
		assert.equal(prompt.endsWith("SUFFIX"), true);
		const report = workerReportExample(prompt);
		assert.equal(report.status, "completed");
		assert.equal(
			report.workUnitRef,
			"trace:<planning-iteration>#work:WU-a",
		);
		assert.deepEqual(report.changedFiles, [
			"src/example.ts",
			"tests/example.test.mjs",
		]);
		assert.deepEqual(report.checksRun, [
			"node --test tests/example.test.mjs",
		]);
		assert.equal(report.changes[0].id, "IC-WU-a");
		assert.equal(report.changes[0].checkResults[0].status, "pass");
		assert.equal(
			report.changes[0].acceptanceEvidenceItems[0].criterionId,
			"AC-001",
		);
	});

	it("includes worktree refs from runtime claims in prompts", async () => {
		const { plan, claimBatch } = plannedDispatch();
		claimBatch.events[0].data.worktree = {
			path: "/tmp/worktrees/WU-a",
			branch: "codewiki/TRACE-pi-a/WU-a/pi-worker-001",
			baseRef: "abc1234",
		};
		const created = [];
		const prompts = [];
		await dispatchPiWorkers(plan, {
			claimEvents: claimBatch.events,
			sessionFactory: {
				async create(input) {
					created.push(input);
					return {
						async prompt(text) {
							prompts.push(text);
						},
					};
				},
			},
		});

		assert.equal(created[0].worktree.path, "/tmp/worktrees/WU-a");
		assert.equal(prompts[0].includes("Worktree:"), true);
		assert.equal(prompts[0].includes("- path: /tmp/worktrees/WU-a"), true);
		assert.equal(prompts[1].includes("Worktree:"), false);
	});

	it("starts one injected Pi session per dispatched work unit", async () => {
		const { plan, claimBatch } = plannedDispatch();
		const created = [];
		const prompts = [];
		const sessionFactory = {
			async create(input) {
				created.push(input);
				return {
					sessionId: `session-${input.workerId}`,
					sessionFile: `/tmp/${input.workerId}.jsonl`,
					outputFile: `/tmp/${input.workerId}.out`,
					pid: input.workerId === "pi-worker-001" ? 101 : 102,
					async prompt(text) {
						prompts.push(text);
					},
				};
			},
		};

		const results = await dispatchPiWorkers(plan, {
			claimEvents: claimBatch.events,
			sessionFactory,
		});

		assert.deepEqual(
			created.map((input) => [input.workUnitId, input.workerId]),
			[
				["WU-a", "pi-worker-001"],
				["WU-b", "pi-worker-002"],
			],
		);
		assert.equal(prompts.length, 2);
		assert.equal(prompts[0].includes("Work unit: WU-a"), true);
		assert.deepEqual(
			results.map((result) => [
				result.workUnitId,
				result.workerId,
				result.claimId,
				result.status,
				result.sessionId,
				result.outputFile,
				result.pid,
			]),
			[
				[
					"WU-a",
					"pi-worker-001",
					"claim-WU-a-001",
					"started",
					"session-pi-worker-001",
					"/tmp/pi-worker-001.out",
					101,
				],
				[
					"WU-b",
					"pi-worker-002",
					"claim-WU-b-002",
					"started",
					"session-pi-worker-002",
					"/tmp/pi-worker-002.out",
					102,
				],
			],
		);
	});

	it("returns failed worker start results without throwing", async () => {
		const { plan, claimBatch } = plannedDispatch();
		const results = await dispatchPiWorkers(plan, {
			claimEvents: claimBatch.events,
			sessionFactory: {
				async create(input) {
					if (input.workUnitId === "WU-b") throw new Error("spawn failed");
					return {
						async prompt() {},
					};
				},
			},
		});

		assert.equal(results[0].status, "started");
		assert.equal(results[1].status, "failed");
		assert.equal(results[1].error, "spawn failed");
	});

	it("keeps session provenance when prompting fails", async () => {
		const { plan, claimBatch } = plannedDispatch();
		const results = await dispatchPiWorkers(plan, {
			claimEvents: claimBatch.events,
			sessionFactory: {
				async create(input) {
					return {
						sessionId: `session-${input.workerId}`,
						sessionFile: `/tmp/${input.workerId}.jsonl`,
						async prompt() {
							if (input.workUnitId === "WU-b") throw new Error("prompt failed");
						},
					};
				},
			},
		});

		assert.equal(results[1].status, "failed");
		assert.equal(results[1].error, "prompt failed");
		assert.equal(results[1].sessionId, "session-pi-worker-002");
		assert.equal(results[1].sessionFile, "/tmp/pi-worker-002.jsonl");
	});

	it("disposes sessions when requested", async () => {
		const { plan, claimBatch } = plannedDispatch();
		let disposed = 0;
		await dispatchPiWorkers(plan, {
			claimEvents: claimBatch.events,
			disposeSessions: true,
			sessionFactory: {
				async create() {
					return {
						async prompt() {},
						dispose() {
							disposed += 1;
						},
					};
				},
			},
		});

		assert.equal(disposed, 2);
	});

	it("appends runtime claims before starting independent sessions", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-pi-runtime-"));
		try {
			const first = await appendTraceRecord(
				root,
				createTraceHead({
					traceId: "TRACE-pi-a",
					title: "Pi runtime A",
					createdAt: "2026-06-11T00:00:00.000Z",
				}),
				0,
			);
			const second = await appendTraceRecord(
				root,
				createTraceHead({
					traceId: "TRACE-pi-b",
					title: "Pi runtime B",
					createdAt: "2026-06-11T00:00:00.000Z",
				}),
				0,
			);
			const { queue } = plannedDispatch();
			const created = [];
			const prompts = [];
			let disposed = 0;
			const result = await dispatchPiRuntimeWorkers({
				runtime: {
					mode: "append",
					repoRoot: root,
					config: {
						project: "runtime-fixture",
						runtime: {
							automation: "assist",
							maxWorkers: 2,
							worktreeIsolation: "auto",
						},
					},
					queue,
					createdAt: "2026-06-11T00:00:02.000Z",
					nextSequenceByTrace: {
						"TRACE-pi-a": 1,
						"TRACE-pi-b": 1,
					},
					expectedBytesByTrace: {
						"TRACE-pi-a": first.nextBytes,
						"TRACE-pi-b": second.nextBytes,
					},
					workerIdPrefix: "pi-worker",
				},
				sessionFactory: {
					async create(input) {
						created.push(input);
						return {
							sessionId: `session-${input.workerId}`,
							sessionFile: `/tmp/${input.workerId}.jsonl`,
							async prompt(text) {
								prompts.push(text);
							},
							dispose() {
								disposed += 1;
							},
						};
					},
				},
			});
			const trace = await readTrace(join(root, traceFilePath("TRACE-pi-a")));

			assert.equal(result.skippedReason, undefined);
			assert.equal(result.runtime.append.events.length, 2);
			assert.equal(result.workers.length, 2);
			assert.equal(trace.records.at(-1).event, "runtime.work.claimed");
			assert.deepEqual(
				created.map((input) => [input.workUnitId, input.workerId]),
				[
					["WU-a", "pi-worker-001"],
					["WU-b", "pi-worker-002"],
				],
			);
			assert.equal(
				created[0].worktree.branch,
				"codewiki/TRACE-pi-a/WU-a/pi-worker-001",
			);
			assert.equal(prompts[0].includes("Worktree:"), true);
			assert.equal(disposed, 0);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("appends failed-start releases after runtime worker start failures", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-pi-release-"));
		try {
			const first = await appendTraceRecord(
				root,
				createTraceHead({
					traceId: "TRACE-pi-a",
					title: "Pi runtime A",
					createdAt: "2026-06-11T00:00:00.000Z",
				}),
				0,
			);
			const second = await appendTraceRecord(
				root,
				createTraceHead({
					traceId: "TRACE-pi-b",
					title: "Pi runtime B",
					createdAt: "2026-06-11T00:00:00.000Z",
				}),
				0,
			);
			const { queue } = plannedDispatch();
			const result = await dispatchPiRuntimeWorkers({
				runtime: {
					mode: "append",
					repoRoot: root,
					config: {
						project: "runtime-fixture",
						runtime: { automation: "assist", maxWorkers: 2 },
					},
					queue,
					createdAt: "2026-06-11T00:00:02.000Z",
					nextSequenceByTrace: {
						"TRACE-pi-a": 1,
						"TRACE-pi-b": 1,
					},
					expectedBytesByTrace: {
						"TRACE-pi-a": first.nextBytes,
						"TRACE-pi-b": second.nextBytes,
					},
					workerIdPrefix: "pi-worker",
				},
				failedStartReleaseCreatedAt: "2026-06-11T00:00:03.000Z",
				sessionFactory: {
					async create(input) {
						if (input.workUnitId === "WU-b") throw new Error("spawn failed");
						return { async prompt() {} };
					},
				},
			});
			const traceB = await readTrace(join(root, traceFilePath("TRACE-pi-b")));
			const events = traceB.records.filter(
				(record) => record.type === "trace_event",
			);
			const queueAfterRelease = buildWorkQueueView({
				records: [planningEvent("TRACE-pi-b", "WU-b", "src/views"), ...events],
			});

			assert.equal(result.workers[1].status, "failed");
			assert.equal(result.failedStartReleaseAppend.events.length, 1);
			assert.equal(events.at(-1).event, "runtime.claim.released");
			assert.equal(events.at(-1).data?.reason, "worker_start_failed");
			assert.equal(events.at(-1).data?.error, "spawn failed");
			assert.equal(queueAfterRelease.items[0].status, "ready");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("does not start sessions from preview-only runtime", async () => {
		const { queue } = plannedDispatch();
		let created = 0;
		const result = await dispatchPiRuntimeWorkers({
			runtime: {
				mode: "preview",
				config: { runtime: { automation: "assist", maxWorkers: 2 } },
				queue,
				nextSequenceByTrace: {
					"TRACE-pi-a": 2,
					"TRACE-pi-b": 2,
				},
			},
			sessionFactory: {
				async create() {
					created += 1;
					return { async prompt() {} };
				},
			},
		});

		assert.equal(result.skippedReason, "runtime_mode_not_append");
		assert.equal(result.workers.length, 0);
		assert.equal(created, 0);
	});
});
