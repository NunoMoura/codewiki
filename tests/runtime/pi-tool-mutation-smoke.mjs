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
import codewikiExtension from "../../src/pi/extension.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { createTraceHead, formatTraceText } from "../../src/traces/writer.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";
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

function commandByName(pi, name) {
	const command = pi.commands.find((candidate) => candidate.name === name);
	assert.ok(command, `missing command ${name}`);
	return command.command;
}

function decisionTableInput() {
	return {
		id: "DT-pi-mutation-smoke",
		createdAt: "2026-06-17T00:00:01.000Z",
		updatedAt: "2026-06-17T00:00:01.000Z",
		rows: [
			{
				id: "DTR-pi-mutation-smoke",
				currentState:
					"Pi tools are mutation-capable but need guarded append smoke coverage.",
				desiredState:
					"Pi tool append proves expected-byte and sequence guarded mutation across loops.",
				rationale:
					"Dogfooding must prove safe trace writes before broader mutation use.",
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: [".codewiki/kb/system/api-tools.md"],
			},
		],
	};
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

function planningWorkRef(events, workUnitId = "WU-pi-mutation-smoke") {
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
		docPaths: [".codewiki/kb/system/extension.md"],
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
	await writeFile(
		join(root, ".codewiki", "kb", "system", "extension.md"),
		"# Extension\n\nMutation smoke fixture.\n",
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
	await writeFile(
		join(root, ".codewiki", "kb", "system", "source-map.yaml"),
		[
			"id: mutation-smoke-source-map",
			"source_docs:",
			"  - .codewiki/kb/system/source-map.md",
			"defaults:",
			"  inheritance: true",
			"  excluded: []",
			"components:",
			"  pi:",
			"    doc: .codewiki/kb/system/extension.md",
			"    source_patterns:",
			"      - src/pi/**",
			"    test_patterns:",
			"      - tests/runtime/pi-*.mjs",
			"    trace_events:",
			"      - decision.iteration",
			"      - planning.iteration",
			"      - implementation.iteration",
			"",
		].join("\n"),
	);
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
	const wikiCommand = commandByName(pi, "wiki");
	const ctx = { cwd: root, ui: { notify() {} } };

	const preview = assertToolResult(
		await decideTool.execute(
			"tool-call-mutation-preview",
			{
				input: {
					traceId,
					mode: "preview",
					nextSequence: 1,
					createdAt: "2026-06-17T00:00:01.000Z",
					tableInput: decisionTableInput(),
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
						tableInput: decisionTableInput(),
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
					createdAt: "2026-06-17T00:00:01.000Z",
					tableInput: decisionTableInput(),
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

	const planningRef = planningWorkRef(planned.loopResult.traceEvents);
	const implemented = assertToolResult(
		await implementTool.execute(
			"tool-call-mutation-append-implement",
			{
				input: {
					traceId,
					mode: "append",
					expectedBytes: await expectedBytes(tracePath),
					nextSequence: 3,
					createdAt: "2026-06-17T00:00:03.000Z",
					planningEvents: planned.loopResult.traceEvents,
					parentId: `${traceId}:planning:checkpoint:2`,
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
	assert.equal(implemented.aggregateContentProof?.workingTreeDigest?.startsWith("sha256:"), true);

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
					parentId: `${traceId}:implementation:checkpoint:3`,
					reason: "Pi tool guarded mutation smoke completed.",
					refs: [traceId, decisionRef, planningRef],
					createdAt: "2026-06-17T00:00:04.000Z",
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
				record.event === "implementation.iteration",
		),
		true,
	);
	assert.equal(readBack.records.at(-1)?.type, "trace_close");

	const state = await wikiCommand.handler(
		`state --all --trace ${traceId} --json`,
		ctx,
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
