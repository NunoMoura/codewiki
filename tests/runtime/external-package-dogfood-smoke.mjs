import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	statSync,
	writeFileSync,
	readFileSync,
} from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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
		`external-dogfood-${id}`,
		{ input },
		undefined,
		undefined,
		ctx,
	);
}

function traceHead(traceId, title, createdAt) {
	return `${JSON.stringify({ type: "trace_head", traceId, title, createdAt })}\n`;
}

function readTraceRecords(tracePath) {
	return readFileSync(tracePath, "utf8")
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

async function expectedBytes(tracePath) {
	return (await stat(tracePath)).size;
}

function decisionQuality(overrides = {}) {
	return {
		userImpact:
			"External package users can trust CodeWiki lifecycle behavior outside the CodeWiki repository.",
		maintainerImpact:
			"Maintainers get a package-installed lifecycle smoke before enabling broader dogfooding.",
		effort: "medium",
		risk: "medium",
		recommendation: "approve",
		recommendationRationale:
			"A fresh-project package smoke is the lowest-risk proof before broader self-hosting.",
		agentAssessment: {
			stance: "aligned",
			userAlignment:
				"Matches the request to dogfood CodeWiki while keeping self-hosting supervised.",
			projectBenefit:
				"Exposes package/install lifecycle drift that repo-local tests can hide.",
			rationale:
				"The change validates behavior without granting unattended write authority.",
		},
		...overrides,
	};
}

function planningQuality(overrides = {}) {
	return {
		technicalRequirements: [
			"Install the packed CodeWiki package into an isolated external project.",
			"Drive /wiki bootstrap plus guarded wiki_* lifecycle mutation through the installed extension.",
			"Run runtime host completion through a real worker output file.",
		],
		verification: ["npm run test:external-dogfood"],
		workerProfile: "package-smoke",
		planningAssessment: {
			stance: "worker_ready",
			workUnitSize: "right_sized",
			rightSizing:
				"One smoke covers the package lifecycle without adding unattended automation.",
			independence:
				"The smoke owns its temp project and does not depend on repo-local CodeWiki state.",
			implementationReadiness:
				"Inputs, expected trace guards, and verification command are explicit.",
			uncertainties: [],
			uncertaintyOwner: "none",
			uncertaintyResolution: "No unresolved planning uncertainty remains.",
			rationale:
				"A package-installed dogfood smoke is the next safe readiness gate.",
		},
		...overrides,
	};
}

function implementationQuality(overrides = {}) {
	return {
		implementationAssessment: {
			stance: "production_ready",
			maintainability:
				"The smoke is isolated, deterministic, and uses existing public extension surfaces where possible.",
			simplicity:
				"The script reuses the installed extension and runtime host runner without new abstractions.",
			projectStyle: "The test follows existing runtime smoke script style.",
			errorHandling:
				"Assertions fail closed and temp project cleanup runs in finally.",
			uncertainties: [],
			uncertaintyOwner: "none",
			uncertaintyResolution:
				"No unresolved implementation, planning, decision, or user-authority uncertainty remains.",
			rationale:
				"The smoke passed against a packed external install.",
		},
		sensitiveSurfaceAssessment: {
			security:
				"The smoke uses an isolated local package install and does not broaden runtime authority.",
			privacy: "No private data handling changed.",
			accessibility: "No user interface behavior changed beyond validation coverage.",
			dependencyRisk: "No dependency surface changed.",
			rationale: "The change is validation-only and project-local.",
		},
		...overrides,
	};
}

function decisionTableInput(createdAt) {
	return {
		id: "DT-external-package-dogfood",
		summary: "Add an external package lifecycle dogfood smoke.",
		createdAt,
		updatedAt: createdAt,
		sourceRefs: ["README.md", "src/external-feature.js"],
		rows: [
			{
				id: "DTR-external-package-dogfood",
				decisionKind: "harden",
				currentState:
					"Repo-local dogfooding can hide install, bootstrap, and package-extension lifecycle drift.",
				desiredState:
					"A packed CodeWiki install proves the guarded lifecycle in a fresh external project before broader dogfooding.",
				rationale:
					"External package dogfood is the next safe gate before trusting unattended self-hosting.",
				...decisionQuality({
					safetyBoundary:
						"The installed package may append only through guarded expected-byte and sequence checks in an isolated external project.",
					failureModes: [
						"Package install metadata works only inside the CodeWiki repository.",
						"Bootstrap creates incomplete project-local CodeWiki state.",
						"Runtime worker output files are not collected from an installed package.",
						"Implementation evidence or release events fail after package installation.",
					],
					negativeTestPlan:
						"Reject read-only state before bootstrap and require guarded append arguments for every mutation.",
					compatibilityImpact:
						"The smoke adds validation only; package API and extension behavior stay unchanged.",
				}),
				approval: "approved",
				sourceRefs: ["README.md", ".codewiki/kb/system/runtime.md"],
				proofRefs: ["tests/runtime/external-package-dogfood-smoke.mjs"],
			},
		],
	};
}

function workItemInput(decisionRef) {
	return {
		id: "WU-external-package-dogfood",
		title: "Exercise the installed package lifecycle in a fresh project",
		decisionRefs: [decisionRef],
		outcome:
			"A fresh external project can bootstrap CodeWiki, append guarded lifecycle records, collect a worker output file, release the claim, and close the trace.",
		...planningQuality({
			acceptance: [
				"Installed /wiki state fails before bootstrap and succeeds after bootstrap.",
				"Decision, planning, runtime, implementation, release, and archive writes use expected byte/sequence guards.",
				"Runtime host completion collects a real worker output file under project-local .codewiki/runtime/tmp.",
				"The final trace is closed and the work queue marks the work done before close.",
			],
			componentRefs: ["source"],
			pathScopes: ["src/**"],
			verification: ["tests/external-feature.test.mjs"],
		}),
	};
}

function implementationChange(planningRef, checkCommand) {
	return {
		id: "CHG-external-package-dogfood",
		planningRefs: [planningRef],
		codePaths: ["src/external-feature.js"],
		testPaths: ["tests/external-feature.test.mjs"],
		checks: [checkCommand],
		checkResults: [
			{
				command: checkCommand,
				status: "pass",
				phase: "verify",
				criterionId: "AC-001",
				outputRef: "tests/external-feature.test.mjs",
				summary: "External fixture test passed.",
			},
		],
		acceptanceEvidenceItems: [
			{
				criterionId: "AC-001",
				summary: "Installed state command failed before bootstrap and succeeded after bootstrap.",
				evidenceRefs: ["tests/external-feature.test.mjs"],
			},
			{
				criterionId: "AC-002",
				summary: "All mutation appends used expected bytes and sequence checks.",
				evidenceRefs: ["TRACE-external-package-dogfood"],
			},
			{
				criterionId: "AC-003",
				summary: "Runtime host completion collected the process-session output file.",
				evidenceRefs: ["TRACE-external-package-dogfood"],
			},
			{
				criterionId: "AC-004",
				summary: "Work queue marked the work done before archive close.",
				evidenceRefs: ["TRACE-external-package-dogfood"],
			},
		],
		...implementationQuality(),
	};
}

function approvedDecisionRef(decided) {
	const iteration = decided.loopResult.traceEvents.find(
		(event) => event.event === "decision.iteration",
	);
	const row = iteration?.data?.output?.approvedRows?.[0];
	assert.ok(iteration);
	assert.ok(row);
	return `trace:${iteration.id}#row:${row.id}`;
}

function planningWorkRef(planned) {
	const iteration = planned.loopResult.traceEvents.find(
		(event) => event.event === "planning.iteration",
	);
	const work = iteration?.data?.output?.workItems?.[0];
	assert.ok(iteration);
	assert.ok(work);
	return `trace:${iteration.id}#work:${work.id}`;
}

function fencedWorkerReport(report) {
	return ["```codewiki-worker-report", JSON.stringify(report), "```"].join(
		"\n",
	);
}

const root = mkdtempSync(join(tmpdir(), "codewiki-external-package-dogfood-"));
try {
	const packRoot = join(root, "pack");
	const installRoot = join(root, "install");
	const projectRoot = join(root, "external-project");
	mkdirSync(packRoot);
	mkdirSync(installRoot);
	mkdirSync(projectRoot);
	mkdirSync(join(projectRoot, "src"));
	mkdirSync(join(projectRoot, "tests"));
	writeFileSync(
		join(projectRoot, "package.json"),
		`${JSON.stringify({ name: "codewiki-external-dogfood", type: "module" }, null, "\t")}\n`,
	);
	writeFileSync(
		join(projectRoot, "README.md"),
		"# External Dogfood Fixture\n\nA fresh project used by CodeWiki package dogfood.\n",
	);
	writeFileSync(
		join(projectRoot, "src", "external-feature.js"),
		"export const externalDogfoodFeature = 'ready';\n",
	);
	writeFileSync(
		join(projectRoot, "tests", "external-feature.test.mjs"),
		`import assert from "node:assert/strict";\nimport { externalDogfoodFeature } from "../src/external-feature.js";\nassert.equal(externalDogfoodFeature, "ready");\n`,
	);

	const pack = run("npm", ["pack", "--pack-destination", packRoot]);
	const tarball = pack.stdout.trim().split(/\r?\n/).at(-1);
	assert.match(tarball, /^codewiki-.*\.tgz$/);
	run("npm", ["install", "--prefix", installRoot, join(packRoot, tarball)]);
	const packageRoot = join(installRoot, "node_modules", "codewiki");
	assert.equal(existsSync(join(packageRoot, "dist", "pi", "extension.js")), true);

	const { default: codewikiExtension } = await import(
		pathToFileURL(join(packageRoot, "dist", "pi", "extension.js")).href
	);
	const { createPiProcessSessionFactory } = await import(
		pathToFileURL(join(packageRoot, "dist", "pi", "process-session.js")).href
	);
	const { runRuntimeHostOnce } = await import(
		pathToFileURL(join(packageRoot, "dist", "runtime", "host-runner.js")).href
	);

	const pi = mockPi();
	codewikiExtension(pi.api);
	const wikiCommand = commandByName(pi, "wiki");
	const stateTool = toolByName(pi, "wiki_state");
	const decideTool = toolByName(pi, "wiki_decide");
	const planTool = toolByName(pi, "wiki_plan");
	const archiveTool = toolByName(pi, "wiki_archive");
	const notifications = [];
	const ctx = {
		cwd: projectRoot,
		ui: {
			notify(message) {
				notifications.push(message);
			},
		},
	};

	await assert.rejects(
		() => stateTool.execute("pre-bootstrap-state", {}, undefined, undefined, ctx),
		/No CodeWiki project found/,
	);
	const bootstrap = await wikiCommand.handler(
		"bootstrap --allow-non-project-install --json",
		ctx,
	);
	assert.equal(bootstrap.data.created.includes(".codewiki/config.json"), true);
	const emptyState = await wikiCommand.handler("state --board --json", ctx);
	assert.equal(emptyState.data.workQueue.summary.ready, 0);

	const traceId = "TRACE-external-package-dogfood";
	const tracePath = join(projectRoot, ".codewiki", "traces", `${traceId}.jsonl`);
	await mkdir(join(projectRoot, ".codewiki", "traces"), { recursive: true });
	await writeFile(
		tracePath,
		traceHead(
			traceId,
			"External package dogfood lifecycle",
			"2026-06-18T09:00:00.000Z",
		),
	);

	const decided = assertToolResult(
		await executeTool(
			decideTool,
			{
				traceId,
				mode: "append",
				allowNonProjectInstall: true,
				expectedBytes: await expectedBytes(tracePath),
				nextSequence: 1,
				createdAt: "2026-06-18T09:00:01.000Z",
				tableInput: decisionTableInput("2026-06-18T09:00:01.000Z"),
			},
			ctx,
			"decide",
		),
		/wiki_decide: completed append run\./,
	);
	assert.equal(decided.loopResult.exit.passed, true);
	const decisionRef = approvedDecisionRef(decided);

	const planned = assertToolResult(
		await executeTool(
			planTool,
			{
				traceId,
				mode: "append",
				allowNonProjectInstall: true,
				expectedBytes: await expectedBytes(tracePath),
				nextSequence: 2,
				createdAt: "2026-06-18T09:00:02.000Z",
				decisionEvents: decided.loopResult.traceEvents,
				parentId: `${traceId}:decision:checkpoint:1`,
				workItemInputs: [workItemInput(decisionRef)],
			},
			ctx,
			"plan",
		),
		/wiki_plan: completed append run\./,
	);
	assert.equal(planned.loopResult.exit.passed, true);
	const planningRef = planningWorkRef(planned);

	const board = await wikiCommand.handler(
		`state --board --trace ${traceId} --json`,
		ctx,
	);
	assert.equal(board.data.workQueue.summary.ready, 1);
	const checkCommand = "node tests/external-feature.test.mjs";
	run(process.execPath, [join(projectRoot, "tests", "external-feature.test.mjs")], {
		cwd: projectRoot,
	});
	const workerReport = fencedWorkerReport({
		status: "completed",
		message: "External package worker finished.",
		changed_files: ["src/external-feature.js", "tests/external-feature.test.mjs"],
		checks_run: [checkCommand],
		working_tree_digest:
			"sha256:2222222222222222222222222222222222222222222222222222222222222222",
		changes: [implementationChange(planningRef, checkCommand)],
	});

	const hostResult = await runRuntimeHostOnce({
		runtime: {
			mode: "append",
			repoRoot: projectRoot,
			createdAt: "2026-06-18T09:00:03.000Z",
			config: { runtime: { automation: "assist", maxWorkers: 1 } },
			queue: board.data.workQueue,
			workerIdPrefix: "external-worker",
			nextSequenceByTrace: { [traceId]: 3 },
			expectedBytesByTrace: { [traceId]: await expectedBytes(tracePath) },
		},
		implementationInputs: [
			{
				repoRoot: projectRoot,
				traceId,
				planningEvents: planned.loopResult.traceEvents,
				nextSequence: 4,
				createdAt: "2026-06-18T09:00:04.000Z",
			},
		],
		sessionFactory: createPiProcessSessionFactory({
			cwd: projectRoot,
			command: process.execPath,
			args: ["-e", `process.stdout.write(${JSON.stringify(workerReport)});`],
		}),
		appendImplementation: true,
		appendReleases: true,
		releaseCreatedAt: "2026-06-18T09:00:05.000Z",
		releaseIdPrefix: "external-release",
	});
	assert.equal(hostResult.releaseCheck.reason, "implementation_exit_passed");
	assert.equal(hostResult.workerResults[0].status, "completed");
	assert.equal(hostResult.implementationAppends.length, 1);
	assert.equal(hostResult.releaseAppend.events.length, 1);
	assert.equal(
		hostResult.workers[0].outputFile.startsWith(
			join(
				projectRoot,
				".codewiki/runtime/tmp/TRACE-external-package-dogfood/runtime/pi-workers",
			),
		),
		true,
	);

	const doneBoard = await wikiCommand.handler(
		`state --board --trace ${traceId} --json`,
		ctx,
	);
	assert.equal(doneBoard.data.workQueue.summary.done, 1);
	const recordsBeforeClose = readTraceRecords(tracePath);
	const archived = assertToolResult(
		await executeTool(
			archiveTool,
			{
				action: "close",
				mode: "append",
				allowNonProjectInstall: true,
				records: recordsBeforeClose,
				expectedBytes: await expectedBytes(tracePath),
				gitRestoreRef: "refs/codewiki/archive/TRACE-external-package-dogfood",
				headRef: traceId,
				parentId: `${traceId}:implementation:checkpoint:4`,
				reason: "External package dogfood lifecycle completed.",
				refs: [traceId, decisionRef, planningRef],
				createdAt: "2026-06-18T09:00:06.000Z",
			},
			ctx,
			"archive",
		),
		/wiki_archive: completed append run\./,
	);
	assert.equal(archived.releaseNotes.closed, true);
	const closedState = await wikiCommand.handler(
		`state --all --trace ${traceId} --json`,
		ctx,
	);
	assert.equal(closedState.data.resume.closed, true);
	assert.equal(statSync(tracePath).size > 0, true);
	console.log(
		JSON.stringify(
			{
				ok: true,
				projectRoot,
				packageRoot,
				traceId,
				closed: true,
			},
			null,
			2,
		),
	);
} finally {
	rmSync(root, { recursive: true, force: true });
}
