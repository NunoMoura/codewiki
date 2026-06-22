import assert from "node:assert/strict";
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import codewikiExtension from "../../src/pi/extension.ts";
import { CODEWIKI_COMMAND_NAMES } from "../../src/pi/command-catalog.ts";
import {
	CODEWIKI_PROMPT_MARKER,
	codewikiPromptHooksAvailable,
} from "../../src/pi/prompt/index.ts";
import { CODEWIKI_COMMAND_MESSAGE_TYPE } from "../../src/pi/rendering/message-renderers.ts";
import { CODEWIKI_TOOL_NAMES } from "../../src/pi/tools/index.ts";
import {
	CODEWIKI_FOOTER_STATUS_KEY,
	codewikiTuiRenderersAvailable,
	renderBootstrapCommand,
	renderStateCommand,
} from "../../src/pi/tui/index.ts";
import { createTraceHead, formatTraceText } from "../../src/traces/writer.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";
import { implementationQualityFields } from "../helpers/implementation-change.mjs";
import { planningQualityFields } from "../helpers/planning-work.mjs";

function toolByName(pi, name) {
	return pi.tools.find((candidate) => candidate.name === name);
}

function mockPi(options = {}) {
	const tools = [];
	const commands = [];
	const events = [];
	const messages = [];
	const messageRenderers = [];
	const api = {
		registerTool(tool) {
			tools.push(tool);
		},
		registerCommand(name, command) {
			commands.push({ name, command });
		},
		registerMessageRenderer(customType, renderer) {
			messageRenderers.push({ customType, renderer });
		},
		on(eventName, handler) {
			events.push({ eventName, handler });
		},
	};
	if (options.sendMessage) {
		api.sendMessage = (message) => messages.push(message);
	}
	return {
		tools,
		commands,
		events,
		messages,
		messageRenderers,
		api,
	};
}

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-pi-extension-"));
	await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
	await mkdir(join(root, ".codewiki", "kb", "system"), { recursive: true });
	await mkdir(join(root, "src", "api"), { recursive: true });
	await writeFile(
		join(root, ".codewiki", "traces", "TRACE-pi.jsonl"),
		formatTraceText([
			createTraceHead({
				traceId: "TRACE-pi",
				title: "Pi extension fixture",
				createdAt: "2026-06-17T00:00:00.000Z",
			}),
		]),
	);
	await writeFile(
		join(root, ".codewiki", "kb", "system", "source-map.yaml"),
		[
			"id: test-source-map",
			"source_docs:",
			"  - kb:system/source-map.md",
			"defaults:",
			"  inheritance: true",
			"  excluded: []",
			"components:",
			"  api:",
			"    doc: kb:system/api.md",
			"    source_patterns:",
			"      - src/api/**",
			"    test_patterns:",
			"      - tests/api/**",
			"    generated_views:",
			"      - .codewiki/views/status.json",
			"    trace_events:",
			"      - decision.rows_approved",
			"",
		].join("\n"),
	);
	return root;
}

async function writeImplementationFixtureFiles(root) {
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
}

function decisionTableInput(traceId) {
	return {
		id: `${traceId}-DT`,
		createdAt: "2026-06-17T00:00:01.000Z",
		updatedAt: "2026-06-17T00:00:01.000Z",
		rows: [
			{
				id: "DTR-pi-preview",
				currentState: "Pi extension adapter lacks preview coverage.",
				desiredState: "Pi extension adapter previews CodeWiki loop facades.",
				rationale: "Mocked Pi tests prevent unsafe CLI fallback.",
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: ["kb:system/api-tools.md"],
			},
		],
	};
}

function nextSequence(events) {
	return Math.max(0, ...events.map((event) => event.sequence || 0)) + 1;
}

function approvedDecisionRef(events) {
	const iteration = events.find((event) => event.loop === "decision");
	const row = iteration?.data?.output?.approvedRows?.[0];
	assert.ok(iteration);
	assert.ok(row);
	return `trace:${iteration.id}#row:${row.id}`;
}

function planningWorkRef(events, workUnitId = "WU-pi-preview") {
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
		id: "WU-pi-preview",
		title: "Preview Pi tool facade",
		decisionRefs: [decisionRef],
		outcome: "Pi tools preview semantic loop facades safely.",
		...planningQualityFields(),
		acceptance: ["Mocked Pi preview tests pass."],
		componentRefs: ["pi"],
		pathScopes: ["src/feature.ts"],
		verification: ["tests/feature.test.mjs"],
	};
}

function changeInput(planningRef) {
	return {
		id: "CH-pi-preview",
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
	};
}

function assertToolResult(result, messagePattern) {
	assert.match(result.content[0].text, messagePattern);
	assert.ok(result.details.result);
	return result.details.result;
}

async function fileExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

describe("Pi extension adapter", () => {
	it("registers the intended Pi-native tools and command without package install", async () => {
		const pi = mockPi();

		codewikiExtension(pi.api);

		assert.deepEqual(
			pi.tools.map((tool) => tool.name),
			[...CODEWIKI_TOOL_NAMES],
		);
		assert.deepEqual(
			pi.commands.map((command) => command.name),
			[...CODEWIKI_COMMAND_NAMES],
		);
		assert.deepEqual(
			pi.events.map((event) => event.eventName),
			["before_agent_start", "session_start"],
		);
		assert.deepEqual(
			pi.messageRenderers.map((renderer) => renderer.customType),
			[CODEWIKI_COMMAND_MESSAGE_TYPE],
		);
		assert.equal(codewikiPromptHooksAvailable, true);
		assert.equal(codewikiTuiRenderersAvailable, true);
		assert.equal(toolByName(pi, "wiki_state").executionMode, "parallel");
		for (const name of CODEWIKI_TOOL_NAMES.filter(
			(candidate) => candidate !== "wiki_state",
		)) {
			assert.equal(toolByName(pi, name).executionMode, "sequential");
		}
		for (const name of CODEWIKI_TOOL_NAMES) {
			assert.equal(toolByName(pi, name).renderCall, undefined);
			assert.equal(toolByName(pi, name).renderResult, undefined);
		}
		const packageJson = JSON.parse(await readFile("package.json", "utf8"));
		assert.deepEqual(packageJson.pi, {
			extensions: ["dist/pi/extension.js"],
		});
		assert.equal(packageJson.pi.skills, undefined);
	});

	it("renders direct command output as a plain custom message in TUI mode", async () => {
		const root = await fixture();
		try {
			const pi = mockPi({ sendMessage: true });
			codewikiExtension(pi.api);
			const command = pi.commands.find(
				(candidate) => candidate.name === "wiki-state",
			).command;

			await command.handler("--board", {
				cwd: root,
				mode: "tui",
				ui: { notify: () => assert.fail("notify fallback should not be used") },
			});

			assert.equal(pi.messages.length, 1);
			assert.equal(pi.messages[0].customType, CODEWIKI_COMMAND_MESSAGE_TYPE);
			const renderer = pi.messageRenderers.find(
				(candidate) => candidate.customType === CODEWIKI_COMMAND_MESSAGE_TYPE,
			).renderer;
			assert.deepEqual(
				renderer(pi.messages[0], {}, {}).render(80).slice(0, 3),
				["CodeWiki Board", "", "┌───────┬───────┬──────┐"],
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("sets a CodeWiki footer status when Pi event hooks exist", async () => {
		const pi = mockPi();
		codewikiExtension(pi.api);
		const hook = pi.events.find((event) => event.eventName === "session_start");
		assert.ok(hook);
		const statuses = [];

		await hook.handler(
			{ reason: "startup" },
			{
				cwd: process.cwd(),
				ui: {
					notify() {},
					setStatus(key, value) {
						statuses.push({ key, value });
					},
				},
			},
		);

		assert.equal(statuses.length, 1);
		assert.equal(statuses[0].key, CODEWIKI_FOOTER_STATUS_KEY);
		assert.match(statuses[0].value, /^CodeWiki \S+ local · \/wiki-state$/);
	});

	it("injects CodeWiki prompt guidance once when Pi event hooks exist", async () => {
		const pi = mockPi();
		codewikiExtension(pi.api);
		const hook = pi.events.find(
			(event) => event.eventName === "before_agent_start",
		);
		assert.ok(hook);

		const result = await hook.handler({ systemPrompt: "base prompt" }, {});
		assert.match(result.systemPrompt, /base prompt/);
		assert.match(result.systemPrompt, /CodeWiki Pi guidance/);
		assert.match(result.systemPrompt, /wiki_state/);
		assert.match(result.systemPrompt, /wiki_decide/);
		assert.match(result.systemPrompt, /\/wiki/);
		assert.match(result.systemPrompt, new RegExp(CODEWIKI_PROMPT_MARKER));

		const duplicate = await hook.handler(
			{ systemPrompt: result.systemPrompt },
			{},
		);
		assert.deepEqual(duplicate, {});
	});

	it("rejects invalid tool parameters before running core facades", async () => {
		const root = await fixture();
		try {
			const pi = mockPi();
			codewikiExtension(pi.api);

			await assert.rejects(
				() =>
					toolByName(pi, "wiki_state").execute(
						"tool-call-invalid-state",
						{ repo: root },
						undefined,
						undefined,
						{ cwd: root },
					),
				/wiki_state received unsupported parameter repo\./,
			);
			await assert.rejects(
				() =>
					toolByName(pi, "wiki_state").execute(
						"tool-call-invalid-paths",
						{ sourcePaths: ["src/api/index.ts"] },
						undefined,
						undefined,
						{ cwd: root },
					),
				/wiki_state received unsupported parameter sourcePaths\./,
			);
			await assert.rejects(
				() =>
					toolByName(pi, "wiki_state").execute(
						"tool-call-invalid-view",
						{ view: "queue" },
						undefined,
						undefined,
						{ cwd: root },
					),
				/wiki_state view must be one of summary, board, quality, blockers, all\./,
			);
			await assert.rejects(
				() =>
					toolByName(pi, "wiki_decide").execute(
						"tool-call-missing-input",
						{},
						undefined,
						undefined,
						{ cwd: root },
					),
				/wiki_decide requires input object\./,
			);
			await assert.rejects(
				() =>
					toolByName(pi, "wiki_config").execute(
						"tool-call-invalid-config",
						{ write: "yes" },
						undefined,
						undefined,
						{ cwd: root },
					),
				/wiki_config write must be a boolean\./,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("requires expected byte checks for append-capable Pi tools", async () => {
		const root = await fixture();
		try {
			const pi = mockPi();
			codewikiExtension(pi.api);

			await assert.rejects(
				() =>
					toolByName(pi, "wiki_decide").execute(
						"tool-call-decide-append",
						{
							input: {
								traceId: "TRACE-pi",
								mode: "append",
								nextSequence: 1,
							},
						},
						undefined,
						undefined,
						{ cwd: root },
					),
				/wiki_decide append mode requires expectedBytes >= 0\./,
			);
			await assert.rejects(
				() =>
					toolByName(pi, "wiki_plan").execute(
						"tool-call-plan-append",
						{
							input: {
								traceId: "TRACE-pi",
								mode: "append",
								expectedBytes: 0,
							},
						},
						undefined,
						undefined,
						{ cwd: root },
					),
				/wiki_plan append mode requires nextSequence >= 1\./,
			);
			await assert.rejects(
				() =>
					toolByName(pi, "wiki_archive").execute(
						"tool-call-archive-append",
						{ input: { action: "close", mode: "append" } },
						undefined,
						undefined,
						{ cwd: root },
					),
				/wiki_archive append mode requires expectedBytes >= 0\./,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("runs valid Pi tool previews without mutating trace files", async () => {
		const root = await fixture();
		try {
			await writeImplementationFixtureFiles(root);
			const tracePath = join(root, ".codewiki", "traces", "TRACE-pi.jsonl");
			const before = await readFile(tracePath, "utf8");
			const pi = mockPi();
			codewikiExtension(pi.api);
			const ctx = { cwd: join(root, "src") };

			const decideTool = toolByName(pi, "wiki_decide");
			const decidedResult = await decideTool.execute(
				"tool-call-decide-preview",
				{
					input: {
						traceId: "TRACE-pi-preview",
						mode: "preview",
						nextSequence: 1,
						createdAt: "2026-06-17T00:00:01.000Z",
						tableInput: decisionTableInput("TRACE-pi-preview"),
					},
				},
				undefined,
				undefined,
				ctx,
			);
			const decided = assertToolResult(
				decidedResult,
				/wiki_decide: completed preview run\./,
			);
			assert.equal(decided.iterationEvent.event, "rows_approved");
			assert.equal(decided.append, undefined);

			const decisionRef = approvedDecisionRef(decided.loopResult.traceEvents);
			const planTool = toolByName(pi, "wiki_plan");
			const plannedResult = await planTool.execute(
				"tool-call-plan-preview",
				{
					input: {
						traceId: "TRACE-pi-preview",
						mode: "preview",
						decisionEvents: decided.loopResult.traceEvents,
						nextSequence: nextSequence(decided.loopResult.traceEvents),
						createdAt: "2026-06-17T00:00:02.000Z",
						workItemInputs: [workItemInput(decisionRef)],
					},
				},
				undefined,
				undefined,
				ctx,
			);
			const planned = assertToolResult(
				plannedResult,
				/wiki_plan: completed preview run\./,
			);
			assert.equal(planned.iterationEvent.event, "work_units_created");
			assert.equal(planned.append, undefined);

			const resolvedPlanResult = await planTool.execute(
				"tool-call-plan-resolution-preview",
				{
					input: {
						traceId: "TRACE-pi-preview",
						mode: "preview",
						decisionEvents: decided.loopResult.traceEvents,
						nextSequence: nextSequence(decided.loopResult.traceEvents),
						createdAt: "2026-06-17T00:00:02.000Z",
						resolutionInputs: [
							{
								decisionRef,
								kind: "non-executable",
								evidenceRefs: [decisionRef, "tests/feature.test.mjs"],
								rationale: "Preview-only UX validation needs no work unit.",
							},
						],
					},
				},
				undefined,
				undefined,
				ctx,
			);
			const resolvedPlan = assertToolResult(
				resolvedPlanResult,
				/wiki_plan: completed preview run\./,
			);
			assert.equal(resolvedPlan.loopResult.exit.route, "close");

			const planningRef = planningWorkRef(planned.loopResult.traceEvents);
			const implementTool = toolByName(pi, "wiki_implement");
			const implementedResult = await implementTool.execute(
				"tool-call-implement-preview",
				{
					input: {
						traceId: "TRACE-pi-preview",
						mode: "preview",
						planningEvents: planned.loopResult.traceEvents,
						nextSequence: nextSequence(planned.loopResult.traceEvents),
						createdAt: "2026-06-17T00:00:03.000Z",
						changeInputs: [changeInput(planningRef)],
					},
				},
				undefined,
				undefined,
				ctx,
			);
			const implemented = assertToolResult(
				implementedResult,
				/wiki_implement: completed preview run\./,
			);
			assert.equal(implemented.iterationEvent.event, "evidence_accepted");
			assert.equal(implemented.append, undefined);
			assert.equal(implemented.snapshot.root, root);

			const archiveTool = toolByName(pi, "wiki_archive");
			const archiveResult = await archiveTool.execute(
				"tool-call-archive-preview",
				{
					input: {
						records: [
							createTraceHead({
								traceId: "TRACE-pi-preview",
								title: "Pi preview trace",
								createdAt: "2026-06-17T00:00:00.000Z",
							}),
							...decided.loopResult.traceRecords,
						],
						gitRestoreRef: "refs/codewiki/archive/TRACE-pi-preview",
					},
				},
				undefined,
				undefined,
				ctx,
			);
			const archive = assertToolResult(
				archiveResult,
				/wiki_archive: completed preview run\./,
			);
			assert.equal(archive.stub.traceId, "TRACE-pi-preview");
			assert.equal(archive.append, undefined);
			assert.equal(await readFile(tracePath, "utf8"), before);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("reads config without writing and writes only when requested", async () => {
		const root = await fixture();
		try {
			const configPath = join(root, ".codewiki", "config.json");
			const pi = mockPi();
			codewikiExtension(pi.api);
			const tool = toolByName(pi, "wiki_config");

			const read = assertToolResult(
				await tool.execute("tool-call-config-read", {}, undefined, undefined, {
					cwd: root,
				}),
				/wiki_config: resolved CodeWiki configuration\./,
			);
			assert.equal(read.written, false);
			assert.equal(await fileExists(configPath), false);

			const written = assertToolResult(
				await tool.execute(
					"tool-call-config-write",
					{ input: { patch: { project: "pi-config" } }, write: true },
					undefined,
					undefined,
					{ cwd: root },
				),
				/wiki_config: resolved CodeWiki configuration\./,
			);
			assert.equal(written.written, true);
			assert.equal(written.config.project, "pi-config");
			const stored = JSON.parse(await readFile(configPath, "utf8"));
			assert.equal(stored.project, "pi-config");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("direct /wiki-* commands dispatch the same command handlers", async () => {
		const root = await fixture();
		try {
			const notifications = [];
			const pi = mockPi();
			codewikiExtension(pi.api);
			const stateCommand = pi.commands.find(
				(candidate) => candidate.name === "wiki-state",
			).command;
			const resumeCommand = pi.commands.find(
				(candidate) => candidate.name === "wiki-resume",
			).command;

			const board = await stateCommand.handler("--board", {
				cwd: root,
				ui: { notify: (message) => notifications.push(message) },
			});
			assert.equal(board.command, "state");
			assert.equal(board.view, "board");
			assert.match(notifications.at(-1), /CodeWiki Board/);

			const resume = await resumeCommand.handler("", {
				cwd: root,
				ui: { notify: (message) => notifications.push(message) },
			});
			assert.equal(resume.command, "resume");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("/wiki-state flags and /wiki-resume return focused views", async () => {
		const root = await fixture();
		try {
			const notifications = [];
			const statuses = [];
			const pi = mockPi();
			codewikiExtension(pi.api);
			const stateCommand = pi.commands.find(
				(candidate) => candidate.name === "wiki-state",
			).command;
			const resumeCommand = pi.commands.find(
				(candidate) => candidate.name === "wiki-resume",
			).command;

			const board = await stateCommand.handler("--board", {
				cwd: root,
				ui: {
					notify: (message) => notifications.push(message),
					setStatus: (key, value) => statuses.push({ key, value }),
				},
			});
			assert.equal(board.command, "state");
			assert.equal(board.view, "board");
			assert.equal(board.json, false);
			assert.ok(board.data.workQueue);
			assert.ok(board.data.runtimeBoard);
			assert.equal(board.data.runtimeBoard.summary.readyWorkUnits, 0);
			assert.equal(board.data.next.action, "decide");
			assert.equal(board.data.append.byTrace["TRACE-pi"].nextSequence, 1);
			assert.deepEqual(board.rendered.slice(0, 3), [
				"CodeWiki Board",
				"",
				"┌───────┬───────┬──────┐",
			]);
			assert.match(notifications.at(-1), /CodeWiki Board/);
			assert.match(notifications.at(-1), /├/);
			assert.equal(statuses.length, 1);
			assert.equal(statuses[0].key, CODEWIKI_FOOTER_STATUS_KEY);
			assert.match(
				statuses[0].value,
				/^CodeWiki \S+ path: 1 trace\(s\) · ready 0 · blocked 0 · open$/,
			);

			const narrow = await stateCommand.handler("--board", {
				cwd: root,
				ui: { width: 20, notify: (message) => notifications.push(message) },
			});
			assert.ok(
				narrow.rendered.every((line) => line.length <= 20),
				"narrow command render should fit the requested width",
			);

			const quality = await stateCommand.handler("--quality --json", {
				cwd: root,
				ui: { notify: (message) => notifications.push(message) },
			});
			assert.equal(quality.view, "quality");
			assert.equal(quality.json, true);
			assert.match(notifications.at(-1), /JSON returned/);

			const resume = await resumeCommand.handler("", {
				cwd: root,
				ui: { notify: (message) => notifications.push(message) },
			});
			assert.equal(resume.command, "resume");
			assert.equal(resume.data.traceId, "TRACE-pi");
			assert.match(notifications.at(-1), /CodeWiki Resume/);
			assert.match(resume.rendered.join("\n"), /Next\s+│ Loop\s+│ Active work/);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("command renderers truncate long board cells for narrow widths", () => {
		const lines = renderStateCommand(
			{
				workQueue: {
					items: [
						{
							id: "WU-long",
							title:
								"Render a very long board item without breaking table width",
							status: "ready",
						},
					],
				},
			},
			"board",
			{ width: 42 },
		);

		assert.ok(lines.every((line) => line.length <= 42));
		assert.match(lines.join("\n"), /…/);
		assert.match(lines.join("\n"), /├/);
	});

	it("/wiki-explain describes projects, flows, and owned paths", async () => {
		const root = await fixture();
		try {
			await mkdir(join(root, ".codewiki", "kb", "system", "flows"), {
				recursive: true,
			});
			await writeFile(
				join(
					root,
					".codewiki",
					"kb",
					"system",
					"flows",
					"planning-to-implementation.md",
				),
				"# Planning to Implementation\n\nPlan work becomes implementation evidence.\n",
			);
			const notifications = [];
			const pi = mockPi();
			codewikiExtension(pi.api);
			const command = pi.commands.find(
				(candidate) => candidate.name === "wiki-explain",
			).command;

			const project = await command.handler("", {
				cwd: root,
				ui: { notify: (message) => notifications.push(message) },
			});
			assert.equal(project.data.kind, "project");
			assert.match(project.data.title, /CodeWiki project/);

			const path = await command.handler("src/api/index.ts", {
				cwd: root,
				ui: { notify: (message) => notifications.push(message) },
			});
			assert.equal(path.data.kind, "path");
			assert.equal(path.data.sections[0].items[0], "api");
			assert.match(
				notifications.at(-1),
				/CodeWiki Explain — Path: src\/api\/index\.ts/,
			);
			assert.match(path.rendered.join("\n"), /Owner|Component/);

			const flow = await command.handler("planning-to-implementation --json", {
				cwd: root,
				ui: { notify: (message) => notifications.push(message) },
			});
			assert.equal(flow.json, true);
			assert.equal(flow.data.kind, "flow");
			assert.equal(flow.data.target, "planning-to-implementation");
			assert.match(notifications.at(-1), /JSON returned/);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("wiki_state reads traces from the current Pi cwd", async () => {
		const root = await fixture();
		try {
			const pi = mockPi();
			codewikiExtension(pi.api);
			const tool = toolByName(pi, "wiki_state");

			const result = await tool.execute(
				"tool-call-1",
				{},
				undefined,
				undefined,
				{ cwd: join(root, "src", "api") },
			);

			assert.match(result.content[0].text, /wiki_state: all view/);
			assert.deepEqual(result.details.result.traceIds, ["TRACE-pi"]);
			assert.equal(result.details.result.sourceOwners, undefined);

			const board = await tool.execute(
				"tool-call-board",
				{ view: "board" },
				undefined,
				undefined,
				{ cwd: root },
			);
			assert.equal(board.details.result.view, "board");
			assert.ok(board.details.result.data.workQueue);
			assert.ok(board.details.result.data.runtimeBoard);
			assert.equal(board.details.result.data.traceIds, undefined);
			assert.equal(tool.renderResult, undefined);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("/wiki-bootstrap is explicit and reports preserved/stale state", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-pi-bootstrap-"));
		try {
			await mkdir(join(root, ".codewiki", "kb"), { recursive: true });
			await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
			await mkdir(join(root, ".codewiki", "roadmap"), { recursive: true });
			await writeFile(join(root, "package.json"), '{"name":"pi-bootstrap"}\n');
			const notifications = [];
			const pi = mockPi();
			codewikiExtension(pi.api);
			const command = pi.commands.find(
				(candidate) => candidate.name === "wiki-bootstrap",
			).command;

			const result = await command.handler("", {
				cwd: root,
				ui: { width: 80, notify: (message) => notifications.push(message) },
			});

			assert.equal(result.data.project, "pi-bootstrap");
			assert.deepEqual(result.data.audit.staleRoots, [".codewiki/roadmap"]);
			assert.ok(result.data.preserved.includes(".codewiki/kb"));
			assert.ok(result.data.preserved.includes(".codewiki/traces"));
			assert.match(notifications.at(-1), /✓ CodeWiki ready/);
			assert.match(notifications.at(-1), /Extension/);
			assert.match(notifications.at(-1), /local path/);
			assert.match(notifications.at(-1), /Version/);
			assert.match(notifications.at(-1), /Entry/);
			assert.match(notifications.at(-1), /Mutation/);
			assert.match(notifications.at(-1), /\.codewiki\/roadmap/);
			assert.match(result.rendered.join("\n"), /Action\s+│ Count\s+│ Meaning/);
			assert.match(result.rendered.join("\n"), /Next\n• You are ready/);
			assert.match(result.rendered.join("\n"), /\/wiki-state/);
			for (const line of result.rendered.filter((line) => line.includes("│"))) {
				assert.ok(line.length <= 78, line);
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("bootstrap renderer keeps next steps as plain text", () => {
		const rendered = renderBootstrapCommand(
			{
				repoRoot: "/tmp/codewiki-bootstrap-renderer-wide-path-with-extra-text",
				project: "bootstrap-renderer",
				created: [".codewiki/config.json"],
				updated: [],
				skipped: [".codewiki/kb/lexicon.md"],
				preserved: [".codewiki/kb"],
				brownfield: true,
				audit: {
					projectKind: "brownfield",
					existing: {
						codewiki: true,
						config: false,
						kb: true,
						traces: false,
						views: false,
					},
					staleRoots: [],
				},
				boundaries: [],
			},
			{
				width: 80,
				extensionIdentity: {
					version: "0.1.2",
					loadMode: "local checkout",
					sourceLabel: "local checkout ✓",
					footerLabel: "0.1.2 local",
					entry: "dist/pi/commands/index.js",
					packageRoot:
						"/tmp/codewiki-bootstrap-renderer-wide-path-with-extra-text",
					loadedFromProject: true,
				},
			},
		);
		assert.match(rendered.join("\n"), /✓ CodeWiki ready/);
		assert.match(rendered.join("\n"), /local checkout ✓/);
		assert.match(rendered.join("\n"), /dist\/pi\/commands\/index\.js/);
		assert.match(rendered.join("\n"), /Action\s+│ Count\s+│ Meaning/);
		assert.match(rendered.join("\n"), /Next\n• You are ready/);
		assert.match(rendered.join("\n"), /\/wiki-bootstrap/);
		assert.doesNotMatch(rendered.join("\n"), /│ Agent work │/);
		for (const line of rendered.filter((line) => line.includes("│"))) {
			assert.ok(line.length <= 78, line);
		}
	});
});
