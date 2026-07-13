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
import codewikiExtension from "../../src/pi/extension.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { createTraceHead, formatTraceText } from "../../src/traces/writer.ts";
import { buildWorkQueueView } from "../../src/views/work-queue.ts";
import { seedChangeAcceptance } from "../helpers/accepted-change.mjs";
import { implementationQualityFields } from "../helpers/implementation-change.mjs";
import { planningQualityFields } from "../helpers/planning-work.mjs";

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

function approvedDecisionRef(events) {
	const iteration = events.find((event) => event.loop === "decision");
	const change = iteration?.data?.output?.approvedChanges?.[0];
	assert.ok(iteration);
	assert.ok(change);
	return `trace:${iteration.id}#change:${change.id}`;
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

function workItemInput(decisionRef) {
	return {
		id: "WU-pi-mutation-smoke",
		title: "Exercise guarded Pi loop mutation",
		decisionRefs: [decisionRef],
		outcome:
			"Decision, planning, implementation, and archive append through Pi tools are guarded and observable.",
		...planningQualityFields(),
		acceptance: [
			"Preview does not mutate the trace.",
			"Append uses expected byte and sequence checks.",
			"State reflects implementation closure before archive close.",
		],
		componentRefs: ["pi"],
		pathScopes: ["src/pi/**"],
		verification: ["tests/runtime/pi-tool-mutation-smoke.mjs"],
	};
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
				criterionId: "AC-001",
				outputRef: "tests/runtime/pi-tool-mutation-smoke.mjs",
				summary: "Guarded Pi mutation smoke passed in the temp project.",
			},
		],
		acceptanceEvidenceItems: [
			{
				criterionId: "AC-001",
				summary: "Preview did not mutate trace bytes before append.",
				evidenceRefs: ["tests/runtime/pi-tool-mutation-smoke.mjs"],
			},
			{
				criterionId: "AC-002",
				summary: "Append used expected byte and sequence checks.",
				evidenceRefs: ["tests/runtime/pi-tool-mutation-smoke.mjs"],
			},
			{
				criterionId: "AC-003",
				summary: "State reflected implementation closure before archive close.",
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
			"  - decision.changes_approved",
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
	const traceId = "TRACE-pi-tool-mutation-smoke";
	await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
	await mkdir(join(root, ".codewiki", "kb", "system"), { recursive: true });
	await writeFixtureFiles(root);
	const tracePath = join(root, traceFilePath(traceId));
	const headText = formatTraceText([
		createTraceHead({
			traceId,
			title: "Pi tool mutation smoke",
			createdAt: "2026-06-17T00:00:00.000Z",
		}),
	]);
	await writeFile(tracePath, headText);

	const pi = mockPi();
	codewikiExtension(pi.api);
	const decideTool = toolByName(pi, "wiki_decide");
	const planTool = toolByName(pi, "wiki_plan");
	const implementTool = toolByName(pi, "wiki_implement");
	const archiveTool = toolByName(pi, "wiki_archive");
	const stateTool = toolByName(pi, "wiki_state");
	const ctx = { cwd: root, ui: { notify() {} } };
	const { changeAcceptance } = await seedChangeAcceptance(root, {
		id: "CHG-pi-mutation-smoke",
		currentState:
			"Pi tools are mutation-capable but need guarded append smoke coverage.",
		desiredState:
			"Pi tool append proves guarded mutation across semantic loops.",
		rationale:
			"Dogfooding must prove safe trace writes before broader mutation use.",
		sourceRefs: [".codewiki/kb/system/components/api-tools.md"],
		acceptedBy: "pi-tool-mutation-smoke",
		acceptedAt: "2026-06-17T00:00:01.000Z",
	});

	const preview = assertToolResult(
		await decideTool.execute(
			"tool-call-mutation-preview",
			{
				input: {
					traceId,
					mode: "preview",
					nextSequence: 1,
					changeAcceptance,
				},
			},
			undefined,
			undefined,
			ctx,
		),
		/wiki_decide: completed preview run\./,
	);
	assert.equal(preview.append, undefined);
	assert.equal(await readFile(tracePath, "utf8"), headText);

	await assert.rejects(
		() =>
			decideTool.execute(
				"tool-call-mutation-unguarded",
				{
					input: {
						traceId,
						mode: "append",
						nextSequence: 1,
						changeAcceptance,
					},
				},
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
					traceId,
					mode: "append",
					expectedBytes: await expectedBytes(tracePath),
					nextSequence: 1,
					changeAcceptance,
					sprintProposalApproval: {
						approved: true,
						renderedProposalDigest: preview.renderedSprintProposal.digest,
						approvedBy: "pi-tool-mutation-smoke",
						approvedAt: "2026-06-17T00:00:01.000Z",
					},
				},
			},
			undefined,
			undefined,
			ctx,
		),
		/wiki_decide: completed append run\./,
	);
	assert.equal(decided.append.records.length, 2);

	const decisionRef = approvedDecisionRef(decided.loopResult.traceEvents);
	const planned = assertToolResult(
		await planTool.execute(
			"tool-call-mutation-append-plan",
			{
				input: {
					traceId,
					mode: "append",
					expectedBytes: await expectedBytes(tracePath),
					nextSequence: 2,
					createdAt: "2026-06-17T00:00:02.000Z",
					decisionEvents: decided.loopResult.traceEvents,
					parentId: `${traceId}:decision:checkpoint:1`,
					workItemInputs: [workItemInput(decisionRef)],
				},
			},
			undefined,
			undefined,
			ctx,
		),
		/wiki_plan: completed append run\./,
	);
	assert.equal(planned.loopResult.exit.passed, true);

	const afterPlan = await readTrace(tracePath);
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
		nextSequenceByTrace: { [traceId]: 3 },
	});
	assert.equal(runtimePreview.append, undefined);
	assert.equal(runtimePreview.policy.worktrees[0].required, true);
	assert.equal(
		runtimePreview.policy.worktrees[0].reason,
		"dirty_working_tree_overlap",
	);
	assert.equal(
		runtimePreview.batch.events[0].data.worktree.branch,
		"codewiki/TRACE-pi-tool-mutation-smoke/WU-pi-mutation-smoke/mutation-worker-001",
	);
	assert.equal(await readFile(tracePath, "utf8"), beforeRuntimePreview);

	await assert.rejects(
		() =>
			runWikiRuntime({
				mode: "append",
				config: runtimeConfig,
				queue: runtimeQueue,
				nextSequenceByTrace: { [traceId]: 3 },
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
		nextSequenceByTrace: { [traceId]: 3 },
		expectedBytesByTrace: {
			[traceId]: await expectedBytes(tracePath),
		},
		repoRoot: root,
	});
	const claimEvent = runtime.append.events[0];
	assert.equal(claimEvent.event, "runtime.work_unit.claimed");
	assert.equal(claimEvent.sequence, 3);
	assert.equal(runtime.batch.nextSequenceByTrace[traceId], 4);
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

	const planningRef = planningWorkRef(planned.loopResult.traceEvents);
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
					planningEvents: planned.loopResult.traceEvents,
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
					gitRestoreRef: "refs/codewiki/archive/TRACE-pi-tool-mutation-smoke",
					headRef: traceId,
					parentId: `${traceId}:implementation:checkpoint:4`,
					reason: "Pi tool guarded mutation smoke completed.",
					refs: [traceId, decisionRef, planningRef, claimEvent.id],
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
				planningAppendRecords: planned.append.records.length,
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
