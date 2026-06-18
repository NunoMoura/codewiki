import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runDecisionIteration } from "../../src/decision/iteration.ts";
import { createDecisionTable } from "../../src/decision/table.ts";
import { runPlanningIteration } from "../../src/planning/iteration.ts";
import { planningQualityStandards } from "../../src/planning/quality-standards.ts";
import { createPiProcessSessionFactory } from "../../src/pi/process-session.ts";
import {
	previewRuntimeHostHandoff,
	reviveRuntimeHostWorkerSessions,
	runRuntimeHostOnce,
} from "../../src/runtime/host-runner.ts";
import { appendTraceRecord } from "../../src/traces/append.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { createTraceHead } from "../../src/traces/writer.ts";
import { buildWorkQueueView } from "../../src/views/work-queue.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";
import { implementationQualityFields } from "../helpers/implementation-change.mjs";
import { planningQualityFields } from "../helpers/planning-work.mjs";

function queue(pathScope = "src/runtime/a.ts") {
	return {
		traceIds: ["TRACE-host-runner"],
		summary: {
			backlog: 0,
			waiting: 0,
			ready: 1,
			claimed: 0,
			blocked: 0,
			done: 0,
		},
		items: [
			{
				id: "WU-host-runner",
				kind: "work-unit",
				status: "ready",
				traceId: "TRACE-host-runner",
				title: "Host runner work",
				traceRefs: ["TRACE-host-runner:planning:work:1"],
				decisionRefs: ["TRACE-host-runner:decision:row:1"],
				planningRefs: ["TRACE-host-runner:planning:work:1"],
				componentRefs: ["runtime"],
				pathScopes: [pathScope],
				dependsOn: [],
				blockers: [],
				qualityStandards: planningQualityStandards([]),
				qualityBlockers: [],
				sourceEventId: "TRACE-host-runner:planning:work:1",
			},
		],
	};
}

function gitRunner(calls) {
	return (args, context) => {
		calls.push({ args, context });
		const command = args.join(" ");
		if (command === "rev-parse --show-toplevel") {
			return { stdout: "/tmp/repo/codewiki\n", exitCode: 0 };
		}
		if (command === "rev-parse --verify main") {
			return { stdout: "abc123\n", exitCode: 0 };
		}
		if (command === "status --porcelain=v1 -z") {
			return { stdout: " M src/runtime/a.ts\0", exitCode: 0 };
		}
		return { stderr: `unexpected ${command}`, exitCode: 1 };
	};
}

async function runtimeFixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-host-runner-"));
	await mkdir(join(root, "src"), { recursive: true });
	await mkdir(join(root, "tests"), { recursive: true });
	await writeFile(
		join(root, "src", "feature.ts"),
		"export const feature = true;\n",
	);
	await writeFile(
		join(root, "tests", "feature.test.mjs"),
		"assert.ok(true);\n",
	);
	const traceId = "TRACE-host-once";
	const planningEvents = planningEventsForHostOnce(traceId);
	const planningRef = planningWorkRef(planningEvents);
	const queue = buildWorkQueueView({
		records: planningEvents,
		generatedAt: "2026-06-15T00:00:00.000Z",
	});
	const headAppend = await seedTraceHead(root, traceId);
	return { root, traceId, planningEvents, planningRef, queue, headAppend };
}

async function multiTraceRuntimeFixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-host-runner-multi-"));
	await mkdir(join(root, "src"), { recursive: true });
	await mkdir(join(root, "tests"), { recursive: true });
	await writeFile(
		join(root, "src", "feature-a.ts"),
		"export const featureA = true;\n",
	);
	await writeFile(
		join(root, "src", "feature-b.ts"),
		"export const featureB = true;\n",
	);
	await writeFile(join(root, "tests", "feature-a.test.mjs"), "assert.ok(true);\n");
	await writeFile(join(root, "tests", "feature-b.test.mjs"), "assert.ok(true);\n");
	const firstTraceId = "TRACE-host-multi-a";
	const secondTraceId = "TRACE-host-multi-b";
	const firstPlanningEvents = planningEventsForHostOnce(firstTraceId, {
		workUnitId: "WU-host-a",
		sourcePath: "src/feature-a.ts",
		testPath: "tests/feature-a.test.mjs",
	});
	const secondPlanningEvents = planningEventsForHostOnce(secondTraceId, {
		workUnitId: "WU-host-b",
		sourcePath: "src/feature-b.ts",
		testPath: "tests/feature-b.test.mjs",
	});
	const firstPlanningRef = planningWorkRef(firstPlanningEvents, "WU-host-a");
	const secondPlanningRef = planningWorkRef(secondPlanningEvents, "WU-host-b");
	const queue = buildWorkQueueView({
		records: [...firstPlanningEvents, ...secondPlanningEvents],
		generatedAt: "2026-06-15T00:00:00.000Z",
	});
	const firstHeadAppend = await seedTraceHead(root, firstTraceId);
	const secondHeadAppend = await seedTraceHead(root, secondTraceId);
	return {
		root,
		firstTraceId,
		secondTraceId,
		firstPlanningEvents,
		secondPlanningEvents,
		firstPlanningRef,
		secondPlanningRef,
		queue,
		firstHeadAppend,
		secondHeadAppend,
	};
}

async function seedTraceHead(root, traceId) {
	return await appendTraceRecord(
		root,
		createTraceHead({
			traceId,
			title: "Host runner trace",
			createdAt: "2026-06-15T00:00:00.000Z",
		}),
		0,
	);
}

function planningEventsForHostOnce(traceId, options = {}) {
	const workUnitId = options.workUnitId || "WU-host-once";
	const sourcePath = options.sourcePath || "src/feature.ts";
	const testPath = options.testPath || "tests/feature.test.mjs";
	const table = createDecisionTable({
		id: `${traceId}-DT`,
		createdAt: "2026-06-15T00:00:01.000Z",
		updatedAt: "2026-06-15T00:00:01.000Z",
		rows: [
			{
				id: "DTR-host-once",
				currentState: "Runtime handoff is preview-only.",
				desiredState: "Host can run one bounded worker cycle.",
				rationale: "Adapter-owned orchestration needs trace claim safety.",
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: ["kb:system/runtime.md"],
			},
		],
	});
	const decision = runDecisionIteration({
		traceId,
		table,
		createdAt: "2026-06-15T00:00:01.000Z",
	});
	const decisionRef = approvedDecisionRef(decision.traceEvents);
	return runPlanningIteration({
		traceId,
		decisionEvents: decision.traceEvents,
		startSequence: 5,
		createdAt: "2026-06-15T00:00:02.000Z",
		workItemInputs: [
			{
				id: workUnitId,
				title: "Run host once",
				decisionRefs: [decisionRef],
				outcome: "Host one-shot starts worker and previews release readiness.",
				...planningQualityFields(),
				acceptance: [
					"Release check reports ready after implementation preview passes.",
				],
				componentRefs: ["runtime"],
				pathScopes: [sourcePath],
				verification: [testPath],
			},
		],
	}).traceEvents;
}

function approvedDecisionRef(events) {
	const iteration = events.find(
		(event) => event.event === "decision.iteration",
	);
	const row = iteration?.data?.output?.approvedRows?.[0];
	assert.ok(iteration);
	assert.ok(row);
	return `trace:${iteration.id}#row:${row.id}`;
}

function planningWorkRef(events, workUnitId = "WU-host-once") {
	const iteration = events.find(
		(event) => event.event === "planning.iteration",
	);
	const item = iteration?.data?.output?.workItems?.find(
		(candidate) => candidate.id === workUnitId,
	);
	assert.ok(iteration);
	assert.ok(item);
	return `trace:${iteration.id}#work:${item.id}`;
}

function changeInput(planningRef, overrides = {}) {
	return {
		id: "CH-host-once",
		planningRefs: [planningRef],
		codePaths: ["src/feature.ts"],
		testPaths: ["tests/feature.test.mjs"],
		checks: ["node --test tests/feature.test.mjs"],
		checkResults: [
			{
				command: "node --test tests/feature.test.mjs",
				status: "pass",
				phase: "green",
				criterionId: "AC-001",
				outputRef: "tests/feature.test.mjs",
			},
		],
		acceptanceEvidenceItems: [
			{
				criterionId: "AC-001",
				summary: "Feature test passes.",
				evidenceRefs: ["tests/feature.test.mjs"],
			},
		],
		...implementationQualityFields(),
		...overrides,
	};
}

function sessionFactory(created, events = []) {
	return {
		async create(input) {
			created.push(input);
			events.push("worker.start");
			return {
				sessionId: `session-${input.workerId}`,
				sessionFile: `/tmp/${input.workerId}.jsonl`,
				async prompt(text) {
					assert.equal(text, input.prompt);
				},
			};
		},
	};
}

function outputFileSessionFactory(root, reportForInput) {
	return {
		async create(input) {
			const outputRoot = join(root, ".codewiki/runtime/tmp/test-pi-workers");
			await mkdir(outputRoot, { recursive: true });
			const outputFile = join(outputRoot, `${input.workerId}.out`);
			await writeFile(outputFile, reportForInput(input));
			return {
				sessionId: `session-${input.workerId}`,
				sessionFile: join(outputRoot, `${input.workerId}.session.jsonl`),
				outputFile,
				async prompt(text) {
					assert.equal(text, input.prompt);
				},
			};
		},
	};
}

function fencedWorkerReport(report) {
	return ["```codewiki-worker-report", JSON.stringify(report), "```"].join(
		"\n",
	);
}

function completedWorkerOutput(fixture, worker) {
	return {
		dispatch: worker,
		output: {
			status: "completed",
			message: "Worker finished.",
			changed_files: ["src/feature.ts", "tests/feature.test.mjs"],
			checks_run: ["node --test tests/feature.test.mjs"],
			working_tree_digest: "sha256:abc123",
			changes: [changeInput(fixture.planningRef)],
		},
	};
}

function terminalWorkerOutput(worker, status, message) {
	return {
		dispatch: worker,
		output: {
			status,
			message,
			blockers: [{ message }],
		},
	};
}

describe("runtime host handoff preview", () => {
	it("collects read-only git status and produces a disposable handoff manifest", async () => {
		const calls = [];
		const result = await previewRuntimeHostHandoff({
			gitStatus: {
				repoRoot: "/tmp/repo/codewiki",
				baseRef: "main",
				runner: gitRunner(calls),
			},
			runtime: {
				repoRoot: "/tmp/repo/codewiki",
				config: {
					project: "host-runner-fixture",
					runtime: {
						automation: "assist",
						maxWorkers: 1,
						worktreeIsolation: "auto",
					},
				},
				queue: queue(),
				workerIdPrefix: "host-worker",
				nextSequenceByTrace: { "TRACE-host-runner": 1 },
			},
			promptSuffix: "HOST_SUFFIX",
		});

		assert.equal(result.mode, "preview");
		assert.equal(result.gitStatus.isGitRepository, true);
		assert.equal(result.gitStatus.baseSha, "abc123");
		assert.deepEqual(result.gitStatus.dirtyPaths, ["src/runtime/a.ts"]);
		assert.deepEqual(
			calls.map((call) => call.context.purpose),
			["repo_root", "base_sha", "dirty_paths"],
		);
		assert.equal(result.runtime.mode, "preview");
		assert.equal(result.runtime.append, undefined);
		assert.equal(result.runtime.batch.events.length, 1);
		assert.equal(
			result.runtime.policy.worktrees[0].reason,
			"dirty_working_tree_overlap",
		);
		assert.equal(result.handoff.runtime.claimEventCount, 1);
		assert.deepEqual(result.handoff.actions, [
			"runtime.claims",
			"worktree.prepare",
			"worker.start",
			"worker.collect_completion",
			"wiki.implement",
			"runtime.release",
			"worktree.cleanup",
		]);
		assert.equal(result.handoff.workers[0].workerId, "host-worker-001");
		assert.equal(
			result.handoff.workers[0].sessionInput.prompt.endsWith("HOST_SUFFIX"),
			true,
		);
		assert.equal(
			result.handoff.workers[0].worktreeCommands.execute,
			"host_explicit_only",
		);
	});

	it("does not collect git status or append when git status is not requested", async () => {
		const result = await previewRuntimeHostHandoff({
			runtime: {
				config: { runtime: { automation: "assist", maxWorkers: 1 } },
				queue: queue("src/runtime/clean.ts"),
			},
		});

		assert.equal(result.gitStatus, undefined);
		assert.equal(result.runtime.mode, "preview");
		assert.equal(result.runtime.append, undefined);
		assert.equal(result.runtime.batch, undefined);
		assert.equal(
			result.runtime.policy.worktrees.every((plan) => plan.required === false),
			true,
		);
		assert.deepEqual(
			result.runtime.policy.worktrees[0].commands.worktreePrepare,
			[],
		);
		assert.deepEqual(result.handoff.actions, [
			"runtime.claims",
			"worker.start",
			"worker.collect_completion",
			"wiki.implement",
			"runtime.release",
		]);
	});

	it("rejects append mode because the helper is preview-only", async () => {
		await assert.rejects(
			() =>
				previewRuntimeHostHandoff({
					runtime: {
						mode: "append",
						config: { runtime: { automation: "assist" } },
						queue: queue(),
					},
				}),
			/previewRuntimeHostHandoff only supports preview mode/,
		);
	});
});

describe("runtime host worker session revive", () => {
	it("revives worker session refs or marks them detached with remediation", async () => {
		const statuses = [
			{
				workerId: "host-worker-001",
				workUnitId: "WU-host-once",
				traceId: "TRACE-host-once",
				state: "running",
				sessionId: "session-1",
				outputRef: "/tmp/output-1.jsonl",
			},
			{
				workerId: "host-worker-002",
				workUnitId: "WU-host-two",
				traceId: "TRACE-host-once",
				state: "running",
				sessionId: "session-2",
			},
		];

		const revived = await reviveRuntimeHostWorkerSessions({
			workerStatuses: statuses,
			sessionFactory: {
				async create() {
					assert.fail("create should not run during revive");
				},
				resume(input) {
					if (input.workerId === "host-worker-002") {
						throw new Error("session missing");
					}
					return {
						state: "running",
						pid: 123,
						sessionId: input.sessionId,
						outputFile: input.outputFile,
					};
				},
			},
		});

		assert.equal(revived.workerStatuses[0].state, "running");
		assert.equal(revived.workerStatuses[0].pid, 123);
		assert.equal(revived.workerStatuses[0].outputRef, "/tmp/output-1.jsonl");
		assert.equal(revived.workerStatuses[1].state, "detached");
		assert.equal(
			revived.workerStatuses[1].remediation.reason,
			"worker_session_detached",
		);
		assert.equal(revived.workerStatuses[1].remediation.route, "retry_worker");
	});

	it("marks all worker sessions detached when no resume adapter exists", async () => {
		const revived = await reviveRuntimeHostWorkerSessions({
			workerStatuses: [
				{
					workerId: "host-worker-001",
					workUnitId: "WU-host-once",
					traceId: "TRACE-host-once",
					state: "running",
					sessionFile: "/tmp/session.jsonl",
				},
			],
			sessionFactory: {
				async create() {
					assert.fail("create should not run during revive");
				},
			},
		});

		assert.equal(revived.workerStatuses[0].state, "detached");
		assert.equal(
			revived.workerStatuses[0].remediation.blockers[0],
			"WU-host-once: No session resume adapter configured.",
		);
	});
});

describe("runtime host one-shot execution", () => {
	it("appends claims, starts workers, previews implementation, and returns release check", async () => {
		const fixture = await runtimeFixture();
		try {
			const created = [];
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: {
						runtime: {
							automation: "assist",
							maxWorkers: 1,
						},
					},
					queue: fixture.queue,
					workerIdPrefix: "host-worker",
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [
					{
						repoRoot: fixture.root,
						traceId: fixture.traceId,
						planningEvents: fixture.planningEvents,
						nextSequence: 9,
						createdAt: "2026-06-15T00:00:03.000Z",
					},
				],
				sessionFactory: sessionFactory(created),
				completionCollector({ workers }) {
					assert.equal(workers.length, 1);
					assert.equal(workers[0].status, "started");
					return [
						{
							dispatch: workers[0],
							output: {
								status: "completed",
								message: "Worker finished.",
								changed_files: ["src/feature.ts", "tests/feature.test.mjs"],
								checks_run: ["node --test tests/feature.test.mjs"],
								working_tree_digest: "sha256:abc123",
								changes: [changeInput(fixture.planningRef)],
							},
						},
					];
				},
				releaseCreatedAt: "2026-06-15T00:00:04.000Z",
				releaseIdPrefix: "release",
			});

			assert.equal(result.mode, "append");
			assert.equal(result.runtime.append.events.length, 1);
			assert.equal(result.workers[0].workerId, "host-worker-001");
			assert.equal(result.workers[0].sessionId, "session-host-worker-001");
			assert.equal(created[0].workerId, "host-worker-001");
			assert.equal(result.completions.length, 1);
			assert.equal(result.workerResults[0].status, "completed");
			assert.deepEqual(result.workerStatuses[0], {
				workerId: "host-worker-001",
				workUnitId: "WU-host-once",
				traceId: fixture.traceId,
				state: "completed",
				claimId: "claim-WU-host-once-001",
				sessionId: "session-host-worker-001",
				sessionFile: "/tmp/host-worker-001.jsonl",
			});
			assert.equal(
				result.implementationPreviews[0].loopResult.readyForClosure,
				true,
			);
			assert.deepEqual(result.releaseCheck, {
				status: "ready",
				reason: "implementation_exit_passed",
				blockers: [],
			});
			assert.equal(result.releaseBatch.events.length, 1);
			assert.equal(
				result.releaseBatch.events[0].event,
				"runtime.claim.released",
			);
			assert.equal(result.releaseBatch.events[0].sequence, 2);
			assert.equal(
				result.releaseBatch.events[0].data.reason,
				"worker_completed",
			);
			assert.equal(result.implementationPreviews[0].append, undefined);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("collects Pi process-session output files by default", async () => {
		const fixture = await runtimeFixture();
		try {
			const workerReport = fencedWorkerReport({
				status: "completed",
				message: "Process session worker finished.",
				changed_files: ["src/feature.ts", "tests/feature.test.mjs"],
				checks_run: ["node --test tests/feature.test.mjs"],
				working_tree_digest: "sha256:abc123",
				changes: [changeInput(fixture.planningRef)],
			});
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: { runtime: { automation: "assist", maxWorkers: 1 } },
					queue: fixture.queue,
					workerIdPrefix: "host-worker",
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [
					{
						repoRoot: fixture.root,
						traceId: fixture.traceId,
						planningEvents: fixture.planningEvents,
						nextSequence: 9,
						createdAt: "2026-06-15T00:00:03.000Z",
					},
				],
				sessionFactory: createPiProcessSessionFactory({
					cwd: fixture.root,
					command: process.execPath,
					args: [
						"-e",
						`process.stdout.write(${JSON.stringify(workerReport)});`,
					],
				}),
				releaseCreatedAt: "2026-06-15T00:00:04.000Z",
				releaseIdPrefix: "release",
			});

			assert.equal(result.completions.length, 1);
			assert.equal(
				result.completions[0].output.includes("codewiki-worker-report"),
				true,
			);
			assert.equal(
				result.workers[0].outputFile.startsWith(
					join(
						fixture.root,
						".codewiki/runtime/tmp/TRACE-host-once/runtime/pi-workers",
					),
				),
				true,
			);
			assert.equal(result.workerResults[0].status, "completed");
			assert.equal(
				result.implementationPreviews[0].loopResult.readyForClosure,
				true,
			);
			assert.deepEqual(result.releaseCheck, {
				status: "ready",
				reason: "implementation_exit_passed",
				blockers: [],
			});
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("routes missing default worker output files to retry remediation", async () => {
		const fixture = await runtimeFixture();
		try {
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: { runtime: { automation: "assist", maxWorkers: 1 } },
					queue: fixture.queue,
					workerIdPrefix: "host-worker",
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [],
				sessionFactory: sessionFactory([]),
				appendReleases: true,
				releaseCreatedAt: "2026-06-15T00:00:04.000Z",
				releaseIdPrefix: "missing-output-release",
			});

			assert.equal(result.workerResults[0].status, "failed");
			assert.equal(
				result.workerResults[0].message,
				"Worker completion output file is missing for worker host-worker-001.",
			);
			assert.deepEqual(result.releaseCheck, {
				status: "ready",
				reason: "worker_failed",
				blockers: [],
			});
			assert.equal(result.remediation.route, "retry_worker");
			assert.equal(result.releaseBatch.events[0].data.reason, "worker_failed");
			assert.equal(result.releaseAppend.events.length, 1);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("routes malformed real output files to retry remediation", async () => {
		const fixture = await runtimeFixture();
		try {
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: { runtime: { automation: "assist", maxWorkers: 1 } },
					queue: fixture.queue,
					workerIdPrefix: "host-worker",
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [],
				sessionFactory: createPiProcessSessionFactory({
					cwd: fixture.root,
					command: process.execPath,
					args: ["-e", "process.stdout.write('not a worker report');"],
				}),
				appendReleases: true,
				releaseCreatedAt: "2026-06-15T00:00:04.000Z",
				releaseIdPrefix: "malformed-output-release",
			});

			assert.equal(result.workerResults[0].status, "failed");
			assert.equal(
				result.workerResults[0].message,
				"Worker completion output is missing a codewiki-worker-report block. not a worker report",
			);
			assert.equal(result.releaseCheck.reason, "worker_failed");
			assert.equal(result.remediation.route, "retry_worker");
			assert.equal(result.releaseAppend.events.length, 1);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("routes blocked reports from real output files back to planning", async () => {
		const fixture = await runtimeFixture();
		try {
			const workerReport = fencedWorkerReport({
				status: "blocked",
				message: "Need clarified planning scope.",
				blockers: [{ message: "Need clarified planning scope." }],
			});
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: { runtime: { automation: "assist", maxWorkers: 1 } },
					queue: fixture.queue,
					workerIdPrefix: "host-worker",
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [],
				sessionFactory: createPiProcessSessionFactory({
					cwd: fixture.root,
					command: process.execPath,
					args: [
						"-e",
						`process.stdout.write(${JSON.stringify(workerReport)});`,
					],
				}),
				appendReleases: true,
				releaseCreatedAt: "2026-06-15T00:00:04.000Z",
				releaseIdPrefix: "blocked-output-release",
			});

			assert.equal(result.workerResults[0].status, "blocked");
			assert.equal(result.releaseCheck.reason, "worker_blocked");
			assert.equal(result.remediation.route, "planning");
			assert.match(result.remediation.blockers[0], /Need clarified/);
			assert.equal(result.releaseAppend.events.length, 1);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("preserves completed evidence from mixed real output files", async () => {
		const fixture = await multiTraceRuntimeFixture();
		try {
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					createdAt: "2026-06-15T00:00:03.000Z",
					config: { runtime: { automation: "assist", maxWorkers: 2 } },
					queue: fixture.queue,
					workerIdPrefix: "host-worker",
					nextSequenceByTrace: {
						[fixture.firstTraceId]: 1,
						[fixture.secondTraceId]: 1,
					},
					expectedBytesByTrace: {
						[fixture.firstTraceId]: fixture.firstHeadAppend.nextBytes,
						[fixture.secondTraceId]: fixture.secondHeadAppend.nextBytes,
					},
				},
				implementationInputs: [
					{
						repoRoot: fixture.root,
						traceId: fixture.firstTraceId,
						planningEvents: fixture.firstPlanningEvents,
						nextSequence: 2,
						createdAt: "2026-06-15T00:00:04.000Z",
					},
				],
				sessionFactory: outputFileSessionFactory(fixture.root, (input) =>
					input.workUnitId === "WU-host-a"
						? fencedWorkerReport({
								status: "completed",
								message: "First worker finished.",
								changed_files: [
									"src/feature-a.ts",
									"tests/feature-a.test.mjs",
								],
								checks_run: ["node --test tests/feature-a.test.mjs"],
								working_tree_digest:
									"sha256:1111111111111111111111111111111111111111111111111111111111111111",
								changes: [
									changeInput(fixture.firstPlanningRef, {
										codePaths: ["src/feature-a.ts"],
										testPaths: ["tests/feature-a.test.mjs"],
										checkResults: [
											{
												command: "node --test tests/feature-a.test.mjs",
												status: "pass",
												phase: "green",
												criterionId: "AC-001",
												outputRef: "tests/feature-a.test.mjs",
											},
										],
										acceptanceEvidenceItems: [
											{
												criterionId: "AC-001",
												summary: "Feature A test passes.",
												evidenceRefs: ["tests/feature-a.test.mjs"],
											},
										],
									}),
								],
							})
						: fencedWorkerReport({
								status: "failed",
								message: "Second worker crashed.",
							}),
				),
				appendImplementation: true,
				appendReleases: true,
				releaseCreatedAt: "2026-06-15T00:00:05.000Z",
				releaseIdPrefix: "mixed-output-release",
			});

			assert.equal(result.releaseCheck.reason, "worker_failed");
			assert.equal(result.workerResults[0].status, "completed");
			assert.equal(result.workerResults[1].status, "failed");
			assert.equal(result.implementationAppends.length, 1);
			assert.equal(result.releaseAppend.events.length, 2);
			assert.equal(
				result.releaseBatch.events[0].data.reason,
				"worker_completed",
			);
			assert.equal(result.releaseBatch.events[1].data.reason, "worker_failed");
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("appends completed trace evidence while failed trace is released for retry", async () => {
		const fixture = await multiTraceRuntimeFixture();
		try {
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					createdAt: "2026-06-15T00:00:03.000Z",
					config: { runtime: { automation: "assist", maxWorkers: 2 } },
					queue: fixture.queue,
					workerIdPrefix: "host-worker",
					nextSequenceByTrace: {
						[fixture.firstTraceId]: 1,
						[fixture.secondTraceId]: 1,
					},
					expectedBytesByTrace: {
						[fixture.firstTraceId]: fixture.firstHeadAppend.nextBytes,
						[fixture.secondTraceId]: fixture.secondHeadAppend.nextBytes,
					},
				},
				implementationInputs: [
					{
						repoRoot: fixture.root,
						traceId: fixture.firstTraceId,
						planningEvents: fixture.firstPlanningEvents,
						nextSequence: 2,
						createdAt: "2026-06-15T00:00:04.000Z",
					},
				],
				sessionFactory: sessionFactory([]),
				completionCollector({ workers }) {
					assert.deepEqual(
						workers.map((worker) => worker.workUnitId),
						["WU-host-a", "WU-host-b"],
					);
					return [
						{
							dispatch: workers[0],
							output: {
								status: "completed",
								message: "First worker finished.",
								changed_files: [
									"src/feature-a.ts",
									"tests/feature-a.test.mjs",
								],
								checks_run: ["node --test tests/feature-a.test.mjs"],
								working_tree_digest:
									"sha256:1111111111111111111111111111111111111111111111111111111111111111",
								changes: [
									changeInput(fixture.firstPlanningRef, {
										codePaths: ["src/feature-a.ts"],
										testPaths: ["tests/feature-a.test.mjs"],
										checkResults: [
											{
												command: "node --test tests/feature-a.test.mjs",
												status: "pass",
												phase: "green",
												criterionId: "AC-001",
												outputRef: "tests/feature-a.test.mjs",
											},
										],
										acceptanceEvidenceItems: [
											{
												criterionId: "AC-001",
												summary: "Feature A test passes.",
												evidenceRefs: ["tests/feature-a.test.mjs"],
											},
										],
									}),
								],
							},
						},
						terminalWorkerOutput(workers[1], "failed", "Second worker crashed."),
					];
				},
				appendImplementation: true,
				appendReleases: true,
				releaseCreatedAt: "2026-06-15T00:00:05.000Z",
				releaseIdPrefix: "mixed-release",
			});
			const firstTrace = await readTrace(
				join(fixture.root, traceFilePath(fixture.firstTraceId)),
			);
			const secondTrace = await readTrace(
				join(fixture.root, traceFilePath(fixture.secondTraceId)),
			);
			const firstEvents = firstTrace.records.filter(
				(record) => record.type === "trace_event",
			);
			const secondEvents = secondTrace.records.filter(
				(record) => record.type === "trace_event",
			);
			const queue = buildWorkQueueView({
				records: [
					...fixture.firstPlanningEvents,
					...fixture.secondPlanningEvents,
					...firstEvents,
					...secondEvents,
				],
				generatedAt: "2026-06-15T00:00:06.000Z",
			});

			assert.equal(result.releaseCheck.reason, "worker_failed");
			assert.equal(result.implementationAppends.length, 1);
			assert.equal(result.releaseAppend.events.length, 2);
			assert.deepEqual(
				firstEvents.map((event) => event.event),
				[
					"runtime.work.claimed",
					"implementation.iteration",
					"runtime.claim.released",
				],
			);
			assert.deepEqual(
				secondEvents.map((event) => event.event),
				["runtime.work.claimed", "runtime.claim.released"],
			);
			assert.equal(
				queue.items.find((item) => item.id === "WU-host-a")?.status,
				"done",
			);
			assert.equal(
				queue.items.find((item) => item.id === "WU-host-b")?.status,
				"ready",
			);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("returns remediation when worker start fails", async () => {
		const fixture = await runtimeFixture();
		try {
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: { runtime: { automation: "assist", maxWorkers: 1 } },
					queue: fixture.queue,
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [],
				sessionFactory: {
					async create() {
						throw new Error("session factory down");
					},
				},
				completionCollector() {
					assert.fail("completion collector should not run after failed start");
				},
				releaseCreatedAt: "2026-06-15T00:00:04.000Z",
			});

			assert.equal(result.releaseCheck.status, "blocked");
			assert.equal(result.releaseCheck.reason, "worker_start_failed");
			assert.equal(result.remediation.route, "retry_worker");
			assert.equal(
				result.remediation.suggestedActions.some((action) =>
					action.includes("Retry the worker"),
				),
				true,
			);
			assert.equal(result.workerStatuses[0].state, "failed");
			assert.equal(result.workerStatuses[0].remediation.route, "retry_worker");
			assert.equal(result.failedStartReleaseBatch.events.length, 1);
			assert.equal(
				result.failedStartReleaseBatch.events[0].data.reason,
				"worker_start_failed",
			);
			assert.equal(result.releaseAppend, undefined);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("optionally appends failed-start releases so claims return ready", async () => {
		const fixture = await runtimeFixture();
		try {
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					createdAt: "2026-06-15T00:00:03.000Z",
					config: { runtime: { automation: "assist", maxWorkers: 1 } },
					queue: fixture.queue,
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [],
				sessionFactory: {
					async create() {
						throw new Error("session factory down");
					},
				},
				completionCollector() {
					assert.fail("completion collector should not run after failed start");
				},
				appendReleases: true,
				releaseCreatedAt: "2026-06-15T00:00:04.000Z",
				releaseIdPrefix: "failed-start-release",
			});
			const trace = await readTrace(
				join(fixture.root, traceFilePath(fixture.traceId)),
			);
			const events = trace.records.filter(
				(record) => record.type === "trace_event",
			);
			const queue = buildWorkQueueView({
				records: [...fixture.planningEvents, ...events],
				generatedAt: "2026-06-15T00:00:05.000Z",
			});

			assert.equal(result.releaseCheck.status, "blocked");
			assert.equal(result.releaseCheck.reason, "worker_start_failed");
			assert.equal(result.failedStartReleaseBatch.events[0].sequence, 2);
			assert.equal(result.releaseAppend.events.length, 1);
			assert.equal(
				result.releaseAppend.events[0].data.reason,
				"worker_start_failed",
			);
			assert.deepEqual(
				events.map((event) => event.event),
				["runtime.work.claimed", "runtime.claim.released"],
			);
			assert.equal(
				queue.items.find((item) => item.id === "WU-host-once")?.status,
				"ready",
			);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("returns remediation when worktree prepare fails before worker start", async () => {
		const fixture = await runtimeFixture();
		try {
			const created = [];
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: {
						runtime: {
							automation: "assist",
							maxWorkers: 1,
							worktreeIsolation: "worktree",
						},
					},
					queue: fixture.queue,
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [],
				sessionFactory: sessionFactory(created),
				completionCollector() {
					assert.fail(
						"completion collector should not run after worktree failure",
					);
				},
				worktreeCommandMode: "execute",
				worktreeRunner(_command, context) {
					return context.step === "worktree.prepare"
						? { stderr: "cannot prepare", exitCode: 2 }
						: { exitCode: 0 };
				},
			});

			assert.equal(result.runtime.append.events.length, 1);
			assert.equal(created.length, 0);
			assert.equal(result.releaseCheck.status, "blocked");
			assert.equal(result.releaseCheck.reason, "worktree_prepare_failed");
			assert.equal(result.remediation.route, "user");
			assert.equal(
				result.remediation.blockers[0].includes("cannot prepare"),
				true,
			);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("blocks worker start when optional worktree setup command fails", async () => {
		const fixture = await runtimeFixture();
		try {
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: {
						runtime: {
							automation: "assist",
							worktreeIsolation: "worktree",
							worktreeSetupCommands: ["npm install"],
							maxWorkers: 1,
						},
					},
					queue: fixture.queue,
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				worktreeCommandMode: "execute",
				worktreeRunner(command, context) {
					return context.step === "worktree.prepare" &&
						context.commandIndex === 1
						? { stderr: `setup failed: ${command}`, exitCode: 2 }
						: { exitCode: 0 };
				},
				implementationInputs: [
					{
						repoRoot: fixture.root,
						traceId: fixture.traceId,
						planningEvents: fixture.planningEvents,
						nextSequence: 9,
					},
				],
				sessionFactory: sessionFactory([]),
				completionCollector() {
					return [];
				},
			});

			assert.equal(result.workers.length, 0);
			assert.equal(result.remediation.route, "user");
			assert.match(result.remediation.reason, /worktree_prepare_failed/);
			assert.match(result.remediation.blockers[0], /npm install/);
			assert.match(result.remediation.blockers[0], /setup failed/);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("dry-runs worktree prepare and cleanup by default", async () => {
		const fixture = await runtimeFixture();
		try {
			const created = [];
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: {
						project: "host-runner-fixture",
						runtime: {
							automation: "assist",
							maxWorkers: 1,
							worktreeIsolation: "worktree",
						},
					},
					queue: fixture.queue,
					workerIdPrefix: "host-worker",
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [
					{
						repoRoot: fixture.root,
						traceId: fixture.traceId,
						planningEvents: fixture.planningEvents,
						nextSequence: 9,
					},
				],
				sessionFactory: sessionFactory(created),
				completionCollector({ workers }) {
					return [completedWorkerOutput(fixture, workers[0])];
				},
			});

			assert.equal(result.worktreePrepare.dryRun, true);
			assert.deepEqual(result.worktreePrepare.steps, [
				"worktree.prepare",
				"worktree.verify",
			]);
			assert.deepEqual(
				result.worktreePrepare.records.map((record) => [
					record.step,
					record.skipped,
				]),
				[
					["worktree.prepare", true],
					["worktree.verify", true],
					["worktree.verify", true],
				],
			);
			assert.equal(created[0].worktree.path.includes("host-worker-001"), true);
			assert.equal(result.worktreeCleanup.dryRun, true);
			assert.deepEqual(result.worktreeCleanup.steps, ["worktree.cleanup"]);
			assert.equal(result.worktreeCleanup.records.length, 2);
			assert.equal(
				result.worktreeCleanup.records.every((record) => record.skipped),
				true,
			);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("executes worktree commands only when host opts into execute mode", async () => {
		const fixture = await runtimeFixture();
		try {
			const created = [];
			const events = [];
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: {
						project: "host-runner-fixture",
						runtime: {
							automation: "assist",
							maxWorkers: 1,
							worktreeIsolation: "worktree",
						},
					},
					queue: fixture.queue,
					workerIdPrefix: "host-worker",
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [
					{
						repoRoot: fixture.root,
						traceId: fixture.traceId,
						planningEvents: fixture.planningEvents,
						nextSequence: 9,
					},
				],
				sessionFactory: sessionFactory(created, events),
				completionCollector({ workers }) {
					events.push("worker.collect_completion");
					return [completedWorkerOutput(fixture, workers[0])];
				},
				worktreeCommandMode: "execute",
				worktreeCleanupMode: "execute",
				worktreeRunner(_command, context) {
					events.push(context.step);
					return { exitCode: 0, stdout: context.step };
				},
			});

			assert.equal(result.worktreePrepare.dryRun, false);
			assert.equal(result.worktreeCleanup.dryRun, false);
			assert.equal(
				result.worktreePrepare.records.every((record) => !record.skipped),
				true,
			);
			assert.deepEqual(events, [
				"worktree.prepare",
				"worktree.verify",
				"worktree.verify",
				"worker.start",
				"worker.collect_completion",
				"worktree.cleanup",
				"worktree.cleanup",
			]);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("reports cleanup failure after appending a completed-worker release", async () => {
		const fixture = await runtimeFixture();
		try {
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					createdAt: "2026-06-15T00:00:03.000Z",
					config: {
						project: "host-runner-fixture",
						runtime: {
							automation: "assist",
							maxWorkers: 1,
							worktreeIsolation: "worktree",
						},
					},
					queue: fixture.queue,
					workerIdPrefix: "host-worker",
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [
					{
						repoRoot: fixture.root,
						traceId: fixture.traceId,
						planningEvents: fixture.planningEvents,
						nextSequence: 9,
					},
				],
				sessionFactory: sessionFactory([]),
				completionCollector({ workers }) {
					return [completedWorkerOutput(fixture, workers[0])];
				},
				worktreeCommandMode: "execute",
				worktreeCleanupMode: "execute",
				worktreeRunner(_command, context) {
					return context.step === "worktree.cleanup"
						? { stderr: "cleanup refused", exitCode: 2 }
						: { exitCode: 0, stdout: context.step };
				},
				appendReleases: true,
				releaseCreatedAt: "2026-06-15T00:00:04.000Z",
				releaseIdPrefix: "cleanup-failure-release",
			});
			const trace = await readTrace(
				join(fixture.root, traceFilePath(fixture.traceId)),
			);
			const events = trace.records.filter(
				(record) => record.type === "trace_event",
			);

			assert.equal(result.releaseCheck.reason, "implementation_exit_passed");
			assert.equal(result.releaseAppend.events.length, 1);
			assert.equal(
				result.releaseAppend.events[0].data.reason,
				"worker_completed",
			);
			assert.equal(result.worktreeCleanup, undefined);
			assert.equal(result.remediation.route, "user");
			assert.equal(result.remediation.reason, "worktree_cleanup_failed");
			assert.match(result.remediation.blockers[0], /cleanup refused/);
			assert.deepEqual(
				events.map((event) => event.event),
				["runtime.work.claimed", "runtime.claim.released"],
			);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("blocks completed worker release when implementation preview is missing", async () => {
		const fixture = await runtimeFixture();
		try {
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: { runtime: { automation: "assist", maxWorkers: 1 } },
					queue: fixture.queue,
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [],
				sessionFactory: sessionFactory([]),
				completionCollector({ workers }) {
					return [completedWorkerOutput(fixture, workers[0])];
				},
				appendReleases: true,
			});

			assert.deepEqual(result.releaseCheck, {
				status: "blocked",
				reason: "implementation_preview_missing",
				blockers: [
					"No implementation preview was produced for worker completion.",
				],
			});
			assert.equal(result.releaseBatch, undefined);
			assert.equal(result.releaseAppend, undefined);
			assert.equal(result.remediation.route, "user");
			assert.equal(
				result.remediation.suggestedActions.some((action) =>
					action.includes("Provide implementationInputs"),
				),
				true,
			);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("prepares and can append release for blocked worker without implementation append", async () => {
		const fixture = await runtimeFixture();
		try {
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					createdAt: "2026-06-15T00:00:03.000Z",
					config: { runtime: { automation: "assist", maxWorkers: 1 } },
					queue: fixture.queue,
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [
					{
						repoRoot: fixture.root,
						traceId: fixture.traceId,
						planningEvents: fixture.planningEvents,
						nextSequence: 2,
					},
				],
				sessionFactory: sessionFactory([]),
				completionCollector({ workers }) {
					return [
						terminalWorkerOutput(
							workers[0],
							"blocked",
							"Need clarified planning scope.",
						),
					];
				},
				appendImplementation: true,
				appendReleases: true,
				releaseCreatedAt: "2026-06-15T00:00:04.000Z",
			});
			const trace = await readTrace(
				join(fixture.root, traceFilePath(fixture.traceId)),
			);
			const events = trace.records.filter(
				(record) => record.type === "trace_event",
			);
			const queue = buildWorkQueueView({
				records: [...fixture.planningEvents, ...events],
			});

			assert.equal(
				result.implementationPreviews[0].loopResult.readyForClosure,
				false,
			);
			assert.equal(result.releaseCheck.status, "ready");
			assert.equal(result.releaseCheck.reason, "worker_blocked");
			assert.equal(result.remediation.route, "planning");
			assert.equal(result.implementationAppends, undefined);
			assert.equal(result.releaseBatch.events[0].data.reason, "worker_blocked");
			assert.equal(result.releaseAppend.events.length, 1);
			assert.deepEqual(
				events.map((event) => event.event),
				["runtime.work.claimed", "runtime.claim.released"],
			);
			assert.equal(
				queue.items.find((item) => item.id === "WU-host-once")?.status,
				"ready",
			);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("prepares failed worker release with retry remediation", async () => {
		const fixture = await runtimeFixture();
		try {
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: { runtime: { automation: "assist", maxWorkers: 1 } },
					queue: fixture.queue,
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [
					{
						repoRoot: fixture.root,
						traceId: fixture.traceId,
						planningEvents: fixture.planningEvents,
						nextSequence: 9,
					},
				],
				sessionFactory: sessionFactory([]),
				completionCollector({ workers }) {
					return [terminalWorkerOutput(workers[0], "failed", "Tests crashed.")];
				},
			});

			assert.equal(result.releaseCheck.status, "ready");
			assert.equal(result.releaseCheck.reason, "worker_failed");
			assert.equal(result.remediation.route, "retry_worker");
			assert.equal(result.releaseBatch.events[0].data.reason, "worker_failed");
			assert.equal(result.releaseAppend, undefined);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("routes guarded empty completions to retry remediation without implementation append", async () => {
		const fixture = await runtimeFixture();
		try {
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: { runtime: { automation: "assist", maxWorkers: 1 } },
					queue: fixture.queue,
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [
					{
						repoRoot: fixture.root,
						traceId: fixture.traceId,
						planningEvents: fixture.planningEvents,
						nextSequence: 9,
					},
				],
				sessionFactory: sessionFactory([]),
				completionCollector({ workers }) {
					return [
						{
							dispatch: workers[0],
							output: {
								status: "completed",
								message: "No files needed.",
							},
						},
					];
				},
				appendImplementation: true,
			});

			assert.equal(result.workerResults[0].status, "failed");
			assert.match(result.workerResults[0].message, /completion_guard/);
			assert.equal(result.workerStatuses[0].state, "failed");
			assert.equal(result.workerStatuses[0].remediation.route, "retry_worker");
			assert.equal(result.releaseCheck.status, "ready");
			assert.equal(result.releaseCheck.reason, "worker_failed");
			assert.equal(result.remediation.route, "retry_worker");
			assert.equal(result.implementationAppends, undefined);
			assert.equal(result.releaseBatch.events[0].data.reason, "worker_failed");
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("optionally appends implementation and release events after release check passes", async () => {
		const fixture = await runtimeFixture();
		try {
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: { runtime: { automation: "assist", maxWorkers: 1 } },
					queue: fixture.queue,
					workerIdPrefix: "host-worker",
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [
					{
						repoRoot: fixture.root,
						traceId: fixture.traceId,
						planningEvents: fixture.planningEvents,
						nextSequence: 2,
						createdAt: "2026-06-15T00:00:03.000Z",
					},
				],
				sessionFactory: sessionFactory([]),
				completionCollector({ workers }) {
					return [
						{
							dispatch: workers[0],
							output: {
								status: "completed",
								message: "Worker finished.",
								changed_files: ["src/feature.ts", "tests/feature.test.mjs"],
								checks_run: ["node --test tests/feature.test.mjs"],
								working_tree_digest: "sha256:abc123",
								changes: [changeInput(fixture.planningRef)],
							},
						},
					];
				},
				appendImplementation: true,
				appendReleases: true,
				releaseCreatedAt: "2026-06-15T00:00:04.000Z",
				releaseIdPrefix: "release",
			});
			const trace = await readTrace(
				join(fixture.root, traceFilePath(fixture.traceId)),
			);
			const events = trace.records.filter(
				(record) => record.type === "trace_event",
			);
			const queue = buildWorkQueueView({
				records: [...fixture.planningEvents, ...events],
			});

			assert.equal(result.releaseCheck.status, "ready");
			assert.equal(result.implementationAppends.length, 1);
			assert.equal(result.implementationAppends[0].append.records.length, 2);
			assert.equal(result.releaseBatch.events[0].sequence, 3);
			assert.equal(result.releaseAppend.events.length, 1);
			assert.deepEqual(
				events.map((event) => event.event),
				[
					"runtime.work.claimed",
					"implementation.iteration",
					"runtime.claim.released",
				],
			);
			assert.equal(
				queue.items.find((item) => item.id === "WU-host-once")?.status,
				"done",
			);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("blocks release when implementation preview does not pass", async () => {
		const fixture = await runtimeFixture();
		try {
			const result = await runRuntimeHostOnce({
				runtime: {
					mode: "append",
					repoRoot: fixture.root,
					config: { runtime: { automation: "assist", maxWorkers: 1 } },
					queue: fixture.queue,
					nextSequenceByTrace: { [fixture.traceId]: 1 },
					expectedBytesByTrace: {
						[fixture.traceId]: fixture.headAppend.nextBytes,
					},
				},
				implementationInputs: [
					{
						repoRoot: fixture.root,
						traceId: fixture.traceId,
						planningEvents: fixture.planningEvents,
						nextSequence: 9,
					},
				],
				sessionFactory: sessionFactory([]),
				completionCollector({ workers }) {
					return [
						{
							dispatch: workers[0],
							output: {
								status: "completed",
								changed_files: ["src/feature.ts"],
								changes: [
									changeInput(fixture.planningRef, {
										acceptanceEvidenceItems: [],
									}),
								],
							},
						},
					];
				},
			});

			assert.equal(result.releaseCheck.status, "blocked");
			assert.equal(
				result.releaseCheck.reason,
				"implementation_preview_blocked",
			);
			assert.equal(result.releaseCheck.blockers.length > 0, true);
			assert.equal(result.remediation.route, "retry_worker");
			assert.equal(result.remediation.blockers.length > 0, true);
			assert.equal(result.releaseBatch, undefined);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("requires append mode because one-shot mutates trace claims", async () => {
		await assert.rejects(
			() =>
				runRuntimeHostOnce({
					runtime: {
						mode: "preview",
						config: { runtime: { automation: "assist" } },
						queue: queue(),
					},
					implementationInputs: [],
					sessionFactory: sessionFactory([]),
					completionCollector: () => [],
				}),
			/runRuntimeHostOnce requires runtime append mode/,
		);
	});
});
