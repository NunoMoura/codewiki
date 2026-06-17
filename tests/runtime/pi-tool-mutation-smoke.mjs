import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import codewikiExtension from "../../src/pi/extension.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { createTraceHead, formatTraceText } from "../../src/traces/writer.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";

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
				currentState: "Pi tools are mutation-capable but need guarded append smoke coverage.",
				desiredState: "Pi tool append proves expected-byte and sequence guarded mutation.",
				rationale: "Dogfooding must prove safe trace writes before broader mutation use.",
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: [".codewiki/kb/system/api-tools.md"],
			},
		],
	};
}

function assertToolResult(result, pattern) {
	assert.match(result.content[0].text, pattern);
	assert.ok(result.details.result);
	return result.details.result;
}

const root = await mkdtemp(join(tmpdir(), "codewiki-pi-tool-mutation-"));
try {
	const traceId = "TRACE-pi-tool-mutation-smoke";
	await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
	await mkdir(join(root, ".codewiki", "kb", "system"), { recursive: true });
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
	const expectedBytes = Buffer.byteLength(headText);

	const pi = mockPi();
	codewikiExtension(pi.api);
	const decideTool = toolByName(pi, "wiki_decide");
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

	const appended = assertToolResult(
		await decideTool.execute(
			"tool-call-mutation-append",
			{
				input: {
					traceId,
					mode: "append",
					expectedBytes,
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
	assert.equal(appended.append.records.length, 2);

	const readBack = await readTrace(tracePath);
	assert.equal(
		readBack.records.some(
			(record) => record.type === "trace_event" && record.event === "decision.iteration",
		),
		true,
	);

	const state = await wikiCommand.handler(
		`state --all --trace ${traceId} --json`,
		ctx,
	);
	assert.equal(state.data.status.traceId, traceId);
	assert.equal(state.data.status.summary.decisionEvents, 1);
	assert.equal(state.data.status.currentLoop, "planning");
	assert.equal(state.data.quality.summary.decision.met > 0, true);

	console.log(
		JSON.stringify(
			{
				ok: true,
				traceId,
				appendedRecords: appended.append.records.length,
				stateLoop: state.data.status.currentLoop,
			},
			null,
			2,
		),
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
