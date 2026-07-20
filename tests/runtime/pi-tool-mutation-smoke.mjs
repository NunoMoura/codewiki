import assert from "node:assert/strict";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWikiRuntime } from "../../src/api/wiki-runtime.ts";
import { changeTraceId } from "../../src/changes/change-trace.ts";
import { changeContentDigest } from "../../src/changes/digest.ts";
import codewikiExtension from "../../src/pi/extension.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { buildWorkQueueView } from "../../src/views/work-queue.ts";
import { buildProjectWorkState } from "../../src/work-state/project.ts";
import { seedChangeAcceptance } from "../helpers/accepted-change.mjs";
import { implementationQualityFields } from "../helpers/implementation-change.mjs";

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

function planningWorkRef(events, workUnitId = "WU-pi-mutation-smoke") {
	const iteration = events.find((event) => event.loop === "planning");
	const item = iteration?.data?.output?.workItems?.find(
		(candidate) => candidate.id === workUnitId,
	);
	assert.ok(iteration);
	assert.ok(item);
	return `trace:${iteration.id}#work:${item.id}`;
}

function changeInput(planningRef) {
	return {
		id: "CHG-pi-mutation-smoke",
		planningRefs: [planningRef],
		codePaths: ["src/pi/tool.ts"],
		docPaths: [".codewiki/kb/system/components/extension.md"],
		testPaths: ["tests/runtime/pi-tool-mutation-smoke.mjs"],
		checks: ["npm run test:pi-mutation"],
		checkResults: [
			{
				command: "npm run test:pi-mutation",
				status: "pass",
				phase: "verify",
				criterionId: "AC-WU-pi-mutation-smoke-1",
				outputRef: "tests/runtime/pi-tool-mutation-smoke.mjs",
				summary: "Guarded Pi mutation smoke passed in the temp project.",
			},
		],
		acceptanceEvidenceItems: [
			{
				criterionId: "AC-WU-pi-mutation-smoke-1",
				summary: "Guarded Pi mutation behavior is verified end to end.",
				evidenceRefs: ["tests/runtime/pi-tool-mutation-smoke.mjs"],
			},
		],
		...implementationQualityFields(),
	};
}

async function writeFixtureFiles(root) {
	await mkdir(join(root, "src", "pi"), { recursive: true });
	await mkdir(join(root, "tests", "runtime"), { recursive: true });
	await writeFile(
		join(root, "src", "pi", "tool.ts"),
		"export const piToolMutationSmoke = true;\n",
	);
	await writeFile(
		join(root, "tests", "runtime", "pi-tool-mutation-smoke.mjs"),
		"export const piToolMutationSmokeTest = true;\n",
	);
	await mkdir(join(root, ".codewiki", "kb", "system", "components"), {
		recursive: true,
	});
	await writeFile(
		join(root, ".codewiki", "kb", "system", "components", "extension.md"),
		[
			"---",
			"type: Concept",
			"title: Extension",
			"description: Mutation smoke fixture.",
			"codewiki_component: pi",
			"codewiki_source_patterns:",
			"  - src/pi/**",
			"codewiki_test_patterns:",
			"  - tests/runtime/pi-*.mjs",
			"codewiki_trace_events:",
			"  - decision.change_approved",
			"  - planning.work_units_created",
			"  - implementation.evidence_accepted",
			"---",
			"# Extension",
			"",
			"Mutation smoke fixture.",
			"",
		].join("\n"),
	);
}

function assertToolResult(result, pattern) {
	assert.match(result.content[0].text, pattern);
	assert.ok(result.details.result);
	return result.details.result;
}

async function expectedBytes(path) {
	return (await stat(path)).size;
}

const root = await mkdtemp(join(tmpdir(), "codewiki-pi-tool-mutation-"));
try {
	await mkdir(join(root, ".codewiki", "kb", "system"), { recursive: true });
	await writeFixtureFiles(root);
	const { record } = await seedChangeAcceptance(root, {
		id: "CHG-pi-mutation-smoke",
		currentState:
			"Pi tools are mutation-capable but need guarded append smoke coverage.",
		desiredState:
			"Pi tool append proves guarded mutation across semantic loops.",
		rationale: "External smoke must prove safe Change Trace writes.",
		sourceRefs: [".codewiki/kb/system/components/api-tools.md"],
	});
	const traceId = changeTraceId(record.change.id);
	const tracePath = join(root, traceFilePath(traceId));
	const initialText = await readFile(tracePath, "utf8");
	const pi = mockPi();
	codewikiExtension(pi.api);
	const decideTool = toolByName(pi, "wiki_decide");
	const planTool = toolByName(pi, "wiki_plan");
	const implementTool = toolByName(pi, "wiki_implement");
	const archiveTool = toolByName(pi, "wiki_archive");
	const stateTool = toolByName(pi, "wiki_state");
	const ctx = { cwd: root, ui: { notify() {} } };
	const decisionState = await buildProjectWorkState({ repoRoot: root });
	const decisionInput = {
		repoRoot: root,
		changeId: record.change.id,
		expectedRevision: record.change.revision,
		expectedChangeDigest: changeContentDigest(record.change),
		expectedWorkStateDigest: decisionState.snapshotDigest,
		disposition: "approve",
		rationale: "Approve exact Pi mutation Change.",
		authority: {
			kind: "user",
			actor: "pi-tool-mutation-smoke",
			ref: "approval:user:pi-tool-mutation-smoke",
		},
		occurredAt: "2026-06-17T00:00:01.000Z",
	};
	const preview = assertToolResult(
		await decideTool.execute(
			"tool-call-mutation-preview",
			{ input: { ...decisionInput, mode: "preview" } },
			undefined,
			undefined,
			ctx,
		),
		/wiki_decide: completed preview run\./,
	);
	assert.equal(preview.append, undefined);
	assert.equal(await readFile(tracePath, "utf8"), initialText);
	await assert.rejects(
		() =>
			decideTool.execute(
				"tool-call-mutation-unguarded",
				{ input: { ...decisionInput, mode: "append" } },
				undefined,
				undefined,
				ctx,
			),
		/wiki_decide append mode requires expectedBytes >= 0\./,
	);
	const decided = assertToolResult(
		await decideTool.execute(
			"tool-call-mutation-append-decision",
			{
				input: {
					...decisionInput,
					mode: "append",
					expectedBytes: await expectedBytes(tracePath),
				},
			},
			undefined,
			undefined,
			ctx,
		),
		/wiki_decide: completed append run\./,
	);
	assert.equal(decided.append.records.length, 1);
	const planningState = await buildProjectWorkState({ repoRoot: root });
	const planned = assertToolResult(
		await planTool.execute(
			"tool-call-mutation-append-plan",
			{
				input: {
					repoRoot: root,
					mode: "append",
					expectedWorkStateDigest: planningState.snapshotDigest,
					expectedChangeIds: [record.change.id],
					expectedBytesByChangeId: {
						[record.change.id]: await expectedBytes(tracePath),
					},
					actor: "agent:planner",
					rationale: "Plan exact approved Pi mutation Change.",
					createdAt: "2026-06-17T00:00:02.000Z",
					sprints: [
						{
							id: "SPR-pi-mutation-smoke",
							goal: "Exercise guarded Pi loop mutation.",
							participatingChangeIds: [record.change.id],
							workItemIds: ["WU-pi-mutation-smoke"],
							rollbackBoundary: "Revert Sprint work as one boundary.",
							dependsOn: [],
							integrationRefs: [],
						},
					],
					workItems: [
						{
							id: "WU-pi-mutation-smoke",
							sprintId: "SPR-pi-mutation-smoke",
							owningChangeId: record.change.id,
							contributingChangeIds: [],
							title: "Exercise guarded Pi loop mutation",
							outcome: "Pi semantic loop writes are guarded and observable.",
							technicalRequirements: ["Preserve Change Trace authority."],
							acceptanceCriteria: ["Pi mutation smoke passes."],
							componentRefs: ["pi"],
							pathScopes: ["src/pi"],
							verification: ["tests/runtime/pi-tool-mutation-smoke.mjs"],
							workerProfile: "implementation",
							dependsOn: [],
						},
					],
				},
			},
			undefined,
			undefined,
			ctx,
		),
		/wiki_plan: completed append run\./,
	);
	assert.equal(planned.report.exit.status, "exit");
	const planningEvents = Object.values(planned.events);
	const afterPlan = await readTrace(tracePath);
	const runtimeNextSequence =
		Math.max(
			0,
			...afterPlan.records
				.filter((entry) => entry.type === "trace_event")
				.map((entry) => entry.sequence),
		) + 1;
	const runtimeQueue = buildWorkQueueView({
		records: afterPlan.records,
		generatedAt: "2026-06-17T00:00:02.500Z",
	});
	const runtimeConfig = {
		runtime: {
			automation: "assist",
			maxWorkers: 1,
			worktreeIsolation: "auto",
		},
	};
	const beforeRuntimePreview = await readFile(tracePath, "utf8");
	assert.equal(runtimeQueue.summary.ready, 1);
	const runtimePreview = await runWikiRuntime({
		mode: "preview",
		config: runtimeConfig,
		queue: runtimeQueue,
		workerIdPrefix: "mutation-worker",
		dirtyPaths: ["src/pi/tool.ts"],
		nextSequenceByTrace: { [traceId]: runtimeNextSequence },
	});
	assert.equal(runtimePreview.append, undefined);
	assert.equal(runtimePreview.policy.worktrees[0].required, true);
	assert.equal(
		runtimePreview.policy.worktrees[0].reason,
		"dirty_working_tree_overlap",
	);
	assert.equal(
		runtimePreview.batch.events[0].data.worktree.branch,
		`codewiki/${traceId}/WU-pi-mutation-smoke/mutation-worker-001`,
	);
	assert.equal(await readFile(tracePath, "utf8"), beforeRuntimePreview);

	await assert.rejects(
		() =>
			runWikiRuntime({
				mode: "append",
				config: runtimeConfig,
				queue: runtimeQueue,
				nextSequenceByTrace: { [traceId]: runtimeNextSequence },
				repoRoot: root,
			}),
		/wiki_runtime append blocked by policy: Missing expected trace bytes/i,
	);

	const runtime = await runWikiRuntime({
		mode: "append",
		config: runtimeConfig,
		queue: runtimeQueue,
		createdAt: "2026-06-17T00:00:03.000Z",
		workerIdPrefix: "mutation-worker",
		dirtyPaths: ["src/pi/tool.ts"],
		nextSequenceByTrace: { [traceId]: runtimeNextSequence },
		expectedBytesByTrace: {
			[traceId]: await expectedBytes(tracePath),
		},
		repoRoot: root,
	});
	const claimEvent = runtime.append.events[0];
	assert.equal(claimEvent.event, "runtime.work_unit.claimed");
	assert.equal(claimEvent.sequence, runtimeNextSequence);
	assert.equal(
		runtime.batch.nextSequenceByTrace[traceId],
		runtimeNextSequence + 1,
	);
	const claimedState = assertToolResult(
		await stateTool.execute(
			"tool-call-mutation-state-claimed",
			{ view: "board", traceId },
			undefined,
			undefined,
			ctx,
		),
		/wiki_state:/,
	);
	assert.equal(claimedState.data.workQueue.summary.claimed, 1);

	const planningRef = planningWorkRef(planningEvents);
	const implemented = assertToolResult(
		await implementTool.execute(
			"tool-call-mutation-append-implement",
			{
				input: {
					traceId,
					mode: "append",
					expectedBytes: await expectedBytes(tracePath),
					nextSequence: runtime.batch.nextSequenceByTrace[traceId],
					createdAt: "2026-06-17T00:00:04.000Z",
					planningEvents,
					claimEvents: runtime.append.events,
					parentId: claimEvent.id,
					changeInputs: [changeInput(planningRef)],
				},
			},
			undefined,
			undefined,
			ctx,
		),
		/wiki_implement: completed append run\./,
	);
	assert.equal(implemented.loopResult.readyForClosure, true);
	assert.equal(
		implemented.aggregateContentProof?.workingTreeDigest?.startsWith("sha256:"),
		true,
	);
	const implementedState = assertToolResult(
		await stateTool.execute(
			"tool-call-mutation-state-implemented",
			{ view: "board", traceId },
			undefined,
			undefined,
			ctx,
		),
		/wiki_state:/,
	);
	assert.equal(implementedState.data.workQueue.summary.done, 1);

	const beforeClose = await readTrace(tracePath);
	const closed = assertToolResult(
		await archiveTool.execute(
			"tool-call-mutation-append-close",
			{
				input: {
					action: "close",
					mode: "append",
					records: beforeClose.records,
					expectedBytes: await expectedBytes(tracePath),
					gitRestoreRef: `refs/codewiki/archive/${traceId}`,
					headRef: traceId,
					parentId: beforeClose.records.at(-1)?.id,
					reason: "Pi tool guarded mutation smoke completed.",
					refs: [traceId, decided.event.id, planningRef, claimEvent.id],
					createdAt: "2026-06-17T00:00:05.000Z",
				},
			},
			undefined,
			undefined,
			ctx,
		),
		/wiki_archive: completed append run\./,
	);
	assert.equal(closed.closeRecord.type, "trace_close");

	const readBack = await readTrace(tracePath);
	assert.equal(
		readBack.records.some(
			(record) =>
				record.type === "trace_event" &&
				record.event === "runtime.work_unit.claimed",
		),
		true,
	);
	assert.equal(
		readBack.records.some(
			(record) =>
				record.type === "trace_event" && record.loop === "implementation",
		),
		true,
	);
	assert.equal(readBack.records.at(-1)?.type, "trace_close");

	const state = assertToolResult(
		await stateTool.execute(
			"tool-call-mutation-state-final",
			{ view: "all", traceId },
			undefined,
			undefined,
			ctx,
		),
		/wiki_state:/,
	);
	assert.equal(state.data.status.traceId, traceId);
	assert.equal(state.data.status.summary.decisionEvents, 1);
	assert.equal(state.data.status.summary.workUnits, 1);
	assert.equal(state.data.status.summary.implementationChanges, 1);
	assert.equal(state.data.status.health, "green");
	assert.equal(state.data.resume.closed, true);
	assert.equal(state.data.quality.summary.implementation.met > 0, true);

	console.log(
		JSON.stringify(
			{
				ok: true,
				traceId,
				decisionAppendRecords: decided.append.records.length,
				planningAppendRecords: Object.values(planned.append).reduce(
					(total, entry) => total + entry.records.length,
					0,
				),
				runtimeAppendRecords: runtime.append.events.length,
				implementationAppendRecords: implemented.append.records.length,
				closed: state.data.resume.closed,
			},
			null,
			2,
		),
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
