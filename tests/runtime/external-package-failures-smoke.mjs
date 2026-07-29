import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";

const PROJECT_NAMES = [
	"missing-output",
	"malformed-output",
	"blocked-output",
	"mixed-output",
	"worktree-prepare",
	"worktree-cleanup",
];

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		...options,
	});
	assert.equal(
		result.status,
		0,
		`${command} ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
	);
	return result;
}

function mockPi() {
	const tools = [];
	const commands = [];
	return {
		tools,
		commands,
		api: {
			registerTool(tool) {
				tools.push(tool);
			},
			registerCommand(name, command) {
				commands.push({ name, command });
			},
			on() {},
		},
	};
}

function toolByName(pi, name) {
	const tool = pi.tools.find((candidate) => candidate.name === name);
	assert.ok(tool, `missing tool ${name}`);
	return tool;
}

function commandByName(pi, name) {
	const command = pi.commands.find((candidate) => candidate.name === name);
	assert.ok(command, `missing command ${name}`);
	return command.command;
}

function assertToolResult(result, pattern) {
	assert.match(result.content[0].text, pattern);
	assert.ok(result.details.result);
	return result.details.result;
}

async function executeTool(tool, input, ctx, id = tool.name) {
	return await tool.execute(
		`external-failures-${id}`,
		{ input },
		undefined,
		undefined,
		ctx,
	);
}

async function expectedBytes(tracePath) {
	return (await stat(tracePath)).size;
}

function implementationQuality(overrides = {}) {
	return {
		implementationAssessment: {
			stance: "production_ready",
			maintainability:
				"The failure smoke is isolated and uses installed package surfaces directly.",
			simplicity:
				"The script keeps scenario helpers local and avoids product abstractions.",
			projectStyle: "The test follows existing runtime smoke script style.",
			errorHandling:
				"Assertions fail closed and temp project cleanup runs in finally.",
			uncertainties: [],
			uncertaintyOwner: "none",
			uncertaintyResolution:
				"No unresolved implementation, planning, decision, or user-authority uncertainty remains.",
			rationale: "The failure smoke passed against a packed external install.",
		},
		sensitiveSurfaceAssessment: {
			security:
				"The smoke uses isolated local package installs and explicit guarded mutation.",
			privacy: "No private data handling changed.",
			accessibility:
				"No user interface behavior changed beyond validation coverage.",
			dependencyRisk: "No dependency surface changed.",
			rationale: "The change is validation-only and project-local.",
		},
		...overrides,
	};
}

function implementationChange(planningRef, checkCommand, options = {}) {
	const codePath = options.codePath ?? "src/external-feature.js";
	const testPath = options.testPath ?? "tests/external-feature.test.mjs";
	return {
		id: `CHG-${planningRef.split("#work:").at(-1)}`,
		planningRefs: [planningRef],
		codePaths: [codePath],
		testPaths: [testPath],
		checks: [checkCommand],
		checkResults: [
			{
				command: checkCommand,
				status: "pass",
				phase: "verify",
				criterionId: `AC-${planningRef.split("#work:").at(-1)}-1`,
				outputRef: testPath,
				summary: "External fixture test passed.",
			},
		],
		acceptanceEvidenceItems: [
			{
				criterionId: `AC-${planningRef.split("#work:").at(-1)}-1`,
				summary:
					"Completed worker evidence stayed scoped to existing source and test paths.",
				evidenceRefs: [testPath],
			},
		],
		...implementationQuality(),
	};
}

function planningWorkRef(events) {
	const iteration = events.find((event) => event.loop === "planning");
	const work = iteration?.data?.output?.workItems?.[0];
	assert.ok(iteration);
	assert.ok(work);
	return `trace:${iteration.id}#work:${work.id}`;
}

function workerUsageEvent() {
	return JSON.stringify({
		type: "message_end",
		message: {
			usage: {
				input: 2,
				output: 1,
				totalTokens: 3,
				cost: { total: 0.001 },
			},
		},
	});
}

function fencedWorkerReport(report) {
	return [
		workerUsageEvent(),
		"```codewiki-worker-report",
		JSON.stringify(report),
		"```",
	].join("\n");
}

function workerRuntimeConfig(config = {}) {
	const runtime = config.runtime || {};
	return {
		...config,
		runtime: {
			...runtime,
			budgets: {
				maxSeconds: 120,
				maxIterations: 1,
				maxTokens: 10_000,
				maxCostUsd: 1,
				maxLatencyMs: 60_000,
				...(runtime.budgets || {}),
			},
			modelRouting: {
				qualityFloor: "high",
				maxEscalations: 1,
				estimatedInputTokens: 1_000,
				estimatedOutputTokens: 500,
				routes: [
					{
						id: "external-worker-high",
						provider: "test-provider",
						model: "test-model-high",
						thinking: "high",
						quality: "high",
						latency: "balanced",
						timeoutMs: 50_000,
						pricing: {
							inputUsdPerMillion: 1,
							outputUsdPerMillion: 2,
							cacheReadUsdPerMillion: 0,
							cacheWriteUsdPerMillion: 0,
						},
						allowedTools: ["bash", "edit", "read", "write"],
					},
				],
			},
		},
	};
}

function runSupervisedHost(installed, input) {
	return installed.runRuntimeHostOnce({
		...input,
		supervision: { attached: true, monitoring: true },
		runtime: {
			...input.runtime,
			config: workerRuntimeConfig(input.runtime.config),
		},
	});
}

function noOutputSessionFactory(created) {
	return {
		async create(input) {
			created.push(input);
			return {
				sessionId: `session-${input.workerId}`,
				async prompt() {},
			};
		},
	};
}

function outputFileSessionFactory(root, reportForInput) {
	return {
		async create(input) {
			const outputRoot = join(root, ".codewiki/runtime/tmp/test-pi-workers");
			mkdirSync(outputRoot, { recursive: true });
			const outputFile = join(outputRoot, `${input.workerId}.out`);
			writeFileSync(outputFile, reportForInput(input));
			return {
				sessionId: `session-${input.workerId}`,
				sessionFile: join(outputRoot, `${input.workerId}.session.jsonl`),
				outputFile,
				async prompt() {},
			};
		},
	};
}

function failingSessionFactory(message) {
	return {
		async create() {
			throw new Error(message);
		},
	};
}

function workerReportForCompletion(
	planningRef,
	message = "Worker finished.",
	options = {},
) {
	const codePath = options.codePath ?? "src/external-feature.js";
	const testPath = options.testPath ?? "tests/external-feature.test.mjs";
	const checkCommand = `node ${testPath}`;
	return fencedWorkerReport({
		status: "completed",
		message,
		changed_files: [codePath, testPath],
		checks_run: [checkCommand],
		working_tree_digest:
			"sha256:3333333333333333333333333333333333333333333333333333333333333333",
		changes: [
			implementationChange(planningRef, checkCommand, { codePath, testPath }),
		],
	});
}

async function installPackage(root) {
	const packRoot = join(root, "pack");
	const installRoot = join(root, "install");
	mkdirSync(packRoot);
	mkdirSync(installRoot);
	const pack = run("npm", ["pack", "--pack-destination", packRoot]);
	const tarball = pack.stdout.trim().split(/\r?\n/).at(-1);
	assert.match(tarball, /^nunomoura-codewiki-.*\.tgz$/);
	run("npm", ["install", "--prefix", installRoot, join(packRoot, tarball)]);
	const packageRoot = join(
		installRoot,
		"node_modules",
		"@nunomoura",
		"codewiki",
	);
	assert.equal(
		existsSync(join(packageRoot, "dist", "pi", "extension.js")),
		true,
	);
	return {
		packageRoot,
		codewikiExtension: (
			await import(
				pathToFileURL(join(packageRoot, "dist/pi/extension.js")).href
			)
		).default,
		createPiProcessSessionFactory: (
			await import(
				pathToFileURL(join(packageRoot, "dist/pi/process-session.js")).href
			)
		).createPiProcessSessionFactory,
		runRuntimeHostOnce: (
			await import(
				pathToFileURL(join(packageRoot, "dist/runtime/host-runner.js")).href
			)
		).runRuntimeHostOnce,
		runRuntimeSemanticExecutor: (
			await import(
				pathToFileURL(join(packageRoot, "dist/runtime/semantic-executor.js"))
					.href
			)
		).runRuntimeSemanticExecutor,
	};
}

async function newProject(root, installed, name) {
	const projectRoot = join(root, name);
	mkdirSync(projectRoot);
	mkdirSync(join(projectRoot, "src"));
	mkdirSync(join(projectRoot, "tests"));
	writeFileSync(
		join(projectRoot, "package.json"),
		`${JSON.stringify({ name, type: "module" }, null, "\t")}\n`,
	);
	writeFileSync(
		join(projectRoot, "README.md"),
		`# ${name}\n\nExternal failure lifecycle fixture.\n`,
	);
	writeFileSync(
		join(projectRoot, "src", "external-feature.js"),
		"export const externalLifecycleFeature = 'ready';\n",
	);
	writeFileSync(
		join(projectRoot, "tests", "external-feature.test.mjs"),
		`import assert from "node:assert/strict";\nimport { externalLifecycleFeature } from "../src/external-feature.js";\nassert.equal(externalLifecycleFeature, "ready");\n`,
	);
	const pi = mockPi();
	installed.codewikiExtension(pi.api);
	const commands = {
		bootstrap: commandByName(pi, "wiki-bootstrap"),
		dashboard: commandByName(pi, "wiki-dashboard"),
	};
	const tools = {
		state: toolByName(pi, "wiki_state"),
		change: toolByName(pi, "wiki_change"),
		decide: toolByName(pi, "wiki_decide"),
		plan: toolByName(pi, "wiki_plan"),
	};
	const ctx = { cwd: projectRoot, mode: "rpc", ui: { notify() {} } };
	await commands.bootstrap.handler("--allow-non-project-install --json", ctx);
	run("git", ["init", "-q"], { cwd: projectRoot });
	return {
		projectRoot,
		ctx,
		commands,
		tools,
		runRuntimeSemanticExecutor: installed.runRuntimeSemanticExecutor,
	};
}

function writeExternalFeature(projectRoot, suffix) {
	const codePath = `src/external-feature-${suffix}.js`;
	const testPath = `tests/external-feature-${suffix}.test.mjs`;
	writeFileSync(
		join(projectRoot, codePath),
		`export const externalLifecycleFeature${suffix.toUpperCase()} = "ready-${suffix}";\n`,
	);
	writeFileSync(
		join(projectRoot, testPath),
		`import assert from "node:assert/strict";\nimport { externalLifecycleFeature${suffix.toUpperCase()} } from "../src/external-feature-${suffix}.js";\nassert.equal(externalLifecycleFeature${suffix.toUpperCase()}, "ready-${suffix}");\n`,
	);
	return { codePath, testPath };
}

async function createReadyTrace(
	project,
	requestedTraceId,
	workUnitId,
	options = {},
) {
	const suffix = requestedTraceId.replace(/^TRACE-(?:CHG-)?/, "");
	const changeId = `CHG-${suffix}`;
	const traceId = `TRACE-${changeId}`;
	const tracePath = join(
		project.projectRoot,
		".codewiki",
		"traces",
		`${traceId}.jsonl`,
	);
	const snapshot = assertToolResult(
		await project.tools.change.execute(
			`${traceId}-change-list`,
			{ input: { operation: "list" } },
			undefined,
			undefined,
			project.ctx,
		),
		/wiki_change: completed list operation\./,
	);
	const change = acceptedChangeFixture({
		id: changeId,
		kind: "harden",
		currentState: "Installed-package failure behavior needs proof.",
		desiredState: "Runtime failures produce deterministic remediation.",
		rationale: "Unattended automation stays gated until failures are safe.",
		safetyBoundary:
			"Failed, blocked, malformed, and worktree-failed workers cannot become success evidence.",
		failureModes: [
			"Worker output is missing or malformed.",
			"Worktree prepare or cleanup fails.",
		],
		negativeTestPlan:
			"Exercise every terminal scenario through the installed runtime.",
		sourceRefs: ["README.md", ".codewiki/kb/system/components/runtime.md"],
		targetRefs: [`src/${suffix}`],
		proofRefs: ["tests/external-feature.test.mjs"],
	});
	assertToolResult(
		await project.tools.change.execute(
			`${traceId}-change-create`,
			{
				allowNonProjectInstall: true,
				input: {
					operation: "create",
					expectedHead: snapshot.head,
					actor: "external-package-failures-smoke",
					createdAt: "2026-06-18T11:00:00.000Z",
					change,
				},
			},
			undefined,
			undefined,
			project.ctx,
		),
		/wiki_change: completed create operation\./,
	);
	const decisionInput = {
		disposition: "approve",
		rationale: "Approve exact failure-handling Change.",
	};
	const decisionContext = {
		authority: {
			kind: "user",
			actor: "external-package-failures-smoke",
			ref: "approval:user:external-package-failures-smoke",
		},
		occurredAt: "2026-06-18T11:00:01.000Z",
	};
	const trigger = {
		kind: "manual_resume",
		refs: [changeId, `change:${changeId}`],
	};
	await project.runRuntimeSemanticExecutor({
		repoRoot: project.projectRoot,
		trigger,
		mode: "preview",
		maxIterations: 1,
		context: { decision: decisionContext },
		adapters: { decision: () => decisionInput },
	});
	await project.runRuntimeSemanticExecutor({
		repoRoot: project.projectRoot,
		trigger,
		mode: "append",
		maxIterations: 1,
		context: { decision: decisionContext },
		adapters: { decision: () => decisionInput },
	});
	const sprintId = `SPR-${suffix}`;
	const pathScope = options.pathScope ?? "src/**";
	const verification =
		options.verification ?? "tests/external-feature.test.mjs";
	const plannedExecution = await project.runRuntimeSemanticExecutor({
		repoRoot: project.projectRoot,
		trigger,
		mode: "append",
		maxIterations: 1,
		context: {
			planning: {
				actor: "agent:external-package-failures-smoke",
				createdAt: "2026-06-18T11:00:02.000Z",
			},
		},
		adapters: {
			planning: () => ({
				rationale: "Plan exact approved failure-handling Change.",
				sprints: [
					{
						id: sprintId,
						goal: "Exercise installed package runtime failure handling.",
						participatingChangeIds: [changeId],
						workItemIds: [workUnitId],
						rollbackBoundary: "Revert Sprint work as one boundary.",
						dependsOn: [],
						integrationRefs: [],
					},
				],
				workItems: [
					{
						id: workUnitId,
						sprintId,
						owningChangeId: changeId,
						contributingChangeIds: [],
						title: "Exercise installed package runtime failure handling",
						outcome: "Runtime failures produce deterministic remediation.",
						technicalRequirements: ["Preserve Change Trace authority."],
						acceptanceCriteria: ["Failure routes remain deterministic."],
						componentRefs: ["source"],
						pathScopes: [pathScope],
						verification: [verification],
						workerProfile: "implementation",
						dependsOn: [],
					},
				],
			}),
		},
	});
	const planned = plannedExecution.outcomes[0].result;
	const planningEvents = Object.values(planned.events);
	return {
		traceId,
		workUnitId,
		tracePath,
		planningEvents,
		planningRef: planningWorkRef(planningEvents),
	};
}

async function board(project, traceId) {
	const result = await project.tools.state.execute(
		traceId ? `${traceId}-state` : "all-state",
		{ view: "board", ...(traceId ? { traceId } : {}) },
		undefined,
		undefined,
		project.ctx,
	);
	return result.details.result.data.workQueue;
}

function mergeQueues(...queues) {
	const itemsByKey = new Map();
	for (const queue of queues) {
		for (const item of queue.items) {
			itemsByKey.set(`${item.traceId}:${item.id}`, item);
		}
	}
	const items = [...itemsByKey.values()].sort((left, right) =>
		`${left.traceId}:${left.id}`.localeCompare(`${right.traceId}:${right.id}`),
	);
	const summary = {
		backlog: 0,
		waiting: 0,
		ready: 0,
		claimed: 0,
		blocked: 0,
		done: 0,
	};
	for (const item of items) summary[item.status] += 1;
	return {
		traceIds: [...new Set(items.map((item) => item.traceId))].sort(),
		summary,
		items,
	};
}

async function runMissingOutput(installed, root) {
	const project = await newProject(root, installed, "missing-output");
	const ready = await createReadyTrace(
		project,
		"TRACE-external-missing-output",
		"WU-missing-output",
	);
	const created = [];
	const result = await runSupervisedHost(installed, {
		runtime: {
			mode: "append",
			repoRoot: project.projectRoot,
			config: { runtime: { automation: "assist", maxWorkers: 1 } },
			queue: await board(project, ready.traceId),
			workerIdPrefix: "external-worker",
			nextSequenceByTrace: { [ready.traceId]: 4 },
			expectedBytesByTrace: {
				[ready.traceId]: await expectedBytes(ready.tracePath),
			},
		},
		sessionFactory: noOutputSessionFactory(created),
		appendReleases: true,
		releaseCreatedAt: "2026-06-18T11:00:03.000Z",
		releaseIdPrefix: "missing-output-release",
	});
	assert.equal(created.length, 1);
	assert.equal(result.workerReports[0].status, "failed");
	assert.equal(
		result.workerReports[0].message,
		"Worker completion output file is missing for worker external-worker-001.",
	);
	assert.equal(result.releaseCheck.reason, "worker_failed");
	assert.equal(result.remediation.route, "retry_worker");
	assert.equal(result.releaseAppend.events.length, 1);
	return result.releaseCheck.reason;
}

async function runMalformedOutput(installed, root) {
	const project = await newProject(root, installed, "malformed-output");
	const ready = await createReadyTrace(
		project,
		"TRACE-external-malformed-output",
		"WU-malformed-output",
	);
	const result = await runSupervisedHost(installed, {
		runtime: {
			mode: "append",
			repoRoot: project.projectRoot,
			config: { runtime: { automation: "assist", maxWorkers: 1 } },
			queue: await board(project, ready.traceId),
			workerIdPrefix: "external-worker",
			nextSequenceByTrace: { [ready.traceId]: 4 },
			expectedBytesByTrace: {
				[ready.traceId]: await expectedBytes(ready.tracePath),
			},
		},
		sessionFactory: installed.createPiProcessSessionFactory({
			cwd: project.projectRoot,
			command: process.execPath,
			args: [
				"-e",
				`process.stdout.write(${JSON.stringify(
					`${workerUsageEvent()}\nnot a worker report`,
				)});`,
				"--",
			],
		}),
		appendReleases: true,
		releaseCreatedAt: "2026-06-18T11:00:03.000Z",
		releaseIdPrefix: "malformed-output-release",
	});
	assert.equal(result.workerReports[0].status, "failed");
	assert.match(
		result.workerReports[0].message,
		/missing a codewiki-worker-report/,
	);
	assert.equal(result.releaseCheck.reason, "worker_failed");
	assert.equal(result.remediation.route, "retry_worker");
	assert.equal(
		result.workers[0].outputFile.startsWith(
			join(
				project.projectRoot,
				`.codewiki/runtime/tmp/${ready.traceId}/runtime/pi-workers`,
			),
		),
		true,
	);
	return result.releaseCheck.reason;
}

async function runBlockedOutput(installed, root) {
	const project = await newProject(root, installed, "blocked-output");
	const ready = await createReadyTrace(
		project,
		"TRACE-external-blocked-output",
		"WU-blocked-output",
	);
	const report = fencedWorkerReport({
		status: "blocked",
		message: "Need clarified planning scope.",
		blockers: [{ message: "Need clarified planning scope." }],
	});
	const result = await runSupervisedHost(installed, {
		runtime: {
			mode: "append",
			repoRoot: project.projectRoot,
			config: { runtime: { automation: "assist", maxWorkers: 1 } },
			queue: await board(project, ready.traceId),
			workerIdPrefix: "external-worker",
			nextSequenceByTrace: { [ready.traceId]: 4 },
			expectedBytesByTrace: {
				[ready.traceId]: await expectedBytes(ready.tracePath),
			},
		},
		sessionFactory: installed.createPiProcessSessionFactory({
			cwd: project.projectRoot,
			command: process.execPath,
			args: ["-e", `process.stdout.write(${JSON.stringify(report)});`, "--"],
		}),
		appendReleases: true,
		releaseCreatedAt: "2026-06-18T11:00:03.000Z",
		releaseIdPrefix: "blocked-output-release",
	});
	assert.equal(result.workerReports[0].status, "blocked");
	assert.equal(result.releaseCheck.reason, "worker_blocked");
	assert.equal(result.remediation.route, "planning");
	assert.match(result.remediation.blockers[0], /Need clarified/);
	assert.equal(result.releaseAppend.events.length, 1);
	return result.releaseCheck.reason;
}

async function runMixedOutputs(installed, root) {
	const project = await newProject(root, installed, "mixed-output");
	const firstPaths = writeExternalFeature(project.projectRoot, "a");
	const secondPaths = writeExternalFeature(project.projectRoot, "b");
	const first = await createReadyTrace(
		project,
		"TRACE-external-mixed-a",
		"WU-mixed-a",
		{
			pathScope: firstPaths.codePath,
			verification: firstPaths.testPath,
		},
	);
	const second = await createReadyTrace(
		project,
		"TRACE-external-mixed-b",
		"WU-mixed-b",
		{
			pathScope: secondPaths.codePath,
			verification: secondPaths.testPath,
		},
	);
	const result = await runSupervisedHost(installed, {
		runtime: {
			mode: "append",
			repoRoot: project.projectRoot,
			createdAt: "2026-06-18T11:00:03.000Z",
			config: { runtime: { automation: "assist", maxWorkers: 2 } },
			queue: mergeQueues(
				await board(project, first.traceId),
				await board(project, second.traceId),
			),
			workerIdPrefix: "external-worker",
			nextSequenceByTrace: {
				[first.traceId]: 4,
				[second.traceId]: 4,
			},
			expectedBytesByTrace: {
				[first.traceId]: await expectedBytes(first.tracePath),
				[second.traceId]: await expectedBytes(second.tracePath),
			},
		},
		implementation: {
			createdAt: "2026-06-18T11:00:04.000Z",
		},
		sessionFactory: outputFileSessionFactory(project.projectRoot, (input) =>
			input.workUnitId === first.workUnitId
				? workerReportForCompletion(
						first.planningRef,
						"First worker finished.",
						firstPaths,
					)
				: fencedWorkerReport({
						status: "failed",
						message: "Second worker crashed.",
					}),
		),
		appendImplementation: true,
		appendReleases: true,
		releaseCreatedAt: "2026-06-18T11:00:05.000Z",
		releaseIdPrefix: "mixed-output-release",
	});
	if (result.releaseCheck.reason !== "worker_failed") {
		console.log(
			JSON.stringify(
				{
					releaseCheck: result.releaseCheck,
					workers: result.workerReports.map((worker) => ({
						workUnitId: worker.workUnitId,
						status: worker.status,
						message: worker.message,
					})),
					releaseReasons: result.releaseBatch.events.map(
						(event) => event.data.reason,
					),
				},
				null,
				2,
			),
		);
	}
	assert.equal(result.releaseCheck.reason, "worker_failed");
	assert.equal(result.workerReports[0].status, "completed");
	assert.equal(result.workerReports[1].status, "failed");
	assert.equal(result.implementationAppends.length, 1);
	assert.equal(result.releaseAppend.events.length, 2);
	assert.equal(result.releaseBatch.events[0].data.reason, "worker_completed");
	assert.equal(result.releaseBatch.events[1].data.reason, "worker_failed");
	return result.releaseCheck.reason;
}

async function runWorktreePrepareFailure(installed, root) {
	const project = await newProject(root, installed, "worktree-prepare");
	const ready = await createReadyTrace(
		project,
		"TRACE-external-worktree-prepare",
		"WU-worktree-prepare",
	);
	const result = await runSupervisedHost(installed, {
		runtime: {
			mode: "append",
			repoRoot: project.projectRoot,
			config: {
				runtime: {
					automation: "assist",
					maxWorkers: 1,
					worktreeIsolation: "worktree",
				},
			},
			queue: await board(project, ready.traceId),
			nextSequenceByTrace: { [ready.traceId]: 4 },
			expectedBytesByTrace: {
				[ready.traceId]: await expectedBytes(ready.tracePath),
			},
		},
		sessionFactory: failingSessionFactory("worker should not start"),
		worktreeCommandMode: "execute",
		worktreeRunner(_command, context) {
			return context.step === "worktree.prepare"
				? { stderr: "cannot prepare external worktree", exitCode: 2 }
				: { exitCode: 0 };
		},
	});
	assert.equal(result.releaseCheck.reason, "worktree_prepare_failed");
	assert.equal(result.remediation.route, "user");
	assert.match(result.remediation.blockers[0], /cannot prepare/);
	return result.releaseCheck.reason;
}

async function runWorktreeCleanupFailure(installed, root) {
	const project = await newProject(root, installed, "worktree-cleanup");
	const ready = await createReadyTrace(
		project,
		"TRACE-external-worktree-cleanup",
		"WU-worktree-cleanup",
	);
	const result = await runSupervisedHost(installed, {
		runtime: {
			mode: "append",
			repoRoot: project.projectRoot,
			createdAt: "2026-06-18T11:00:03.000Z",
			config: {
				runtime: {
					automation: "assist",
					maxWorkers: 1,
					worktreeIsolation: "worktree",
				},
			},
			queue: await board(project, ready.traceId),
			workerIdPrefix: "external-worker",
			nextSequenceByTrace: { [ready.traceId]: 4 },
			expectedBytesByTrace: {
				[ready.traceId]: await expectedBytes(ready.tracePath),
			},
		},
		implementation: {
			createdAt: "2026-06-18T11:00:04.000Z",
		},
		sessionFactory: outputFileSessionFactory(project.projectRoot, () =>
			workerReportForCompletion(ready.planningRef, "Cleanup worker finished."),
		),
		worktreeCommandMode: "execute",
		worktreeCleanupMode: "execute",
		worktreeRunner(_command, context) {
			return context.step === "worktree.cleanup"
				? { stderr: "cleanup refused", exitCode: 2 }
				: { exitCode: 0, stdout: context.step };
		},
		appendReleases: true,
		releaseCreatedAt: "2026-06-18T11:00:05.000Z",
		releaseIdPrefix: "cleanup-failure-release",
	});
	assert.equal(result.releaseCheck.reason, "implementation_exit_passed");
	assert.equal(result.releaseAppend.events.length, 1);
	assert.equal(result.remediation.route, "user");
	assert.equal(result.remediation.reason, "worktree_cleanup_failed");
	assert.match(result.remediation.blockers[0], /cleanup refused/);
	return result.remediation.reason;
}

const root = mkdtempSync(join(tmpdir(), "codewiki-external-failures-"));
try {
	const installed = await installPackage(root);
	const results = {
		missingOutput: await runMissingOutput(installed, root),
		malformedOutput: await runMalformedOutput(installed, root),
		blockedOutput: await runBlockedOutput(installed, root),
		mixedOutputs: await runMixedOutputs(installed, root),
		worktreePrepare: await runWorktreePrepareFailure(installed, root),
		worktreeCleanup: await runWorktreeCleanupFailure(installed, root),
	};
	assert.deepEqual(results, {
		missingOutput: "worker_failed",
		malformedOutput: "worker_failed",
		blockedOutput: "worker_blocked",
		mixedOutputs: "worker_failed",
		worktreePrepare: "worktree_prepare_failed",
		worktreeCleanup: "worktree_cleanup_failed",
	});
	console.log(
		JSON.stringify(
			{
				ok: true,
				packageRoot: installed.packageRoot,
				results,
			},
			null,
			2,
		),
	);
} finally {
	const coordinatorApi = join(
		root,
		"install",
		"node_modules",
		"@nunomoura",
		"codewiki",
		"dist",
		"runtime",
		"coordinator-entrypoint.js",
	);
	if (existsSync(coordinatorApi)) {
		const { stopProjectCoordinatorService } = await import(
			pathToFileURL(coordinatorApi).href
		);
		await Promise.all(
			PROJECT_NAMES.map((name) =>
				stopProjectCoordinatorService(join(root, name), {
					timeoutMs: 2_000,
				}).catch(() => undefined),
			),
		);
	}
	rmSync(root, { recursive: true, force: true });
}
