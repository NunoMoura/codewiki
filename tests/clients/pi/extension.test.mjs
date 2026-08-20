import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	access,
	appendFile,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {after, describe, it} from "node:test";
import { registerCodewikiExtension } from "../../../src/clients/pi/extension.ts";
import { CODEWIKI_COMMAND_NAMES } from "../../../src/clients/pi/command-catalog.ts";
import {
	CODEWIKI_PROMPT_MARKER,
	codewikiPromptHooksAvailable,
} from "../../../src/clients/pi/prompt/index.ts";
import {
	closeCodewikiAppServer,
	restoreCodewikiAppServer,
} from "../../../src/project-server/app/server.ts";
import { isActiveAppTrace } from "../../../src/project-server/queries/app-state.ts";
import { CODEWIKI_COMMAND_MESSAGE_TYPE } from "../../../src/clients/pi/rendering/message-renderers.ts";
import { CODEWIKI_TOOL_NAMES } from "../../../src/clients/pi/tools/index.ts";
import { appendDevLogEntry } from "../../../src/project-server/persistence/dev-log.ts";
import {
	CODEWIKI_FOOTER_STATUS_KEY,
	codewikiTuiRenderersAvailable,
	renderBootstrapCommand,
} from "../../../src/clients/pi/tui/index.ts";
import { shouldOpenAutomaticDashboard } from "../../../src/clients/pi/tui/footer.ts";
import {BACKLOG_TRIAGE_QUERY_PROTOCOL} from "../../../src/changes/triage/contracts.ts";
import {DECISION_ATTENTION_SELECTION_PROTOCOL} from "../../../src/changes/triage/selection.ts";
import { createTraceHead, formatTraceText } from "../../../src/changes/trace/writer.ts";
import {
	testPiDashboardService,
	testPiProjectServices,
} from "../../helpers/pi-project-services.mjs";

const testServerStateRoot = join(
	tmpdir(),
	`codewiki-extension-server-state-${process.pid}`,
);
process.env.CODEWIKI_PROJECT_SERVER_STATE_ROOT = testServerStateRoot;
after(() => rm(testServerStateRoot, {recursive: true, force: true}));

function registerTestExtension(pi) {
	const projectServices = testPiProjectServices();
	registerCodewikiExtension(pi, {
		dashboardService: testPiDashboardService(projectServices),
		projectServices,
	});
}

function toolByName(pi, name) {
	return pi.tools.find((candidate) => candidate.name === name);
}

async function readJsonFile(path) {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		throw new Error(`Could not parse JSON file ${path}.`, { cause: error });
	}
}

function mockPi(options = {}) {
	const tools = [];
	const commands = [];
	const events = [];
	const messages = [];
	const userMessages = [];
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
	if (options.sendUserMessage) {
		api.sendUserMessage = (message, sendOptions) =>
			userMessages.push({ message, options: sendOptions });
	}
	return {
		tools,
		commands,
		events,
		messages,
		userMessages,
		messageRenderers,
		api,
	};
}

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-pi-extension-"));
	await mkdir(join(root, ".codewiki", "traces"), { recursive: true });
	await mkdir(join(root, ".codewiki", "kb", "system", "components"), {
		recursive: true,
	});
	await mkdir(join(root, "src", "project-server"), { recursive: true });
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
		join(root, ".codewiki", "kb", "system", "components", "project-server.md"),
		[
			"---",
			"type: Concept",
			"title: Project Server",
			"description: Project Server fixture.",
			"codewiki_component: project-server",
			"codewiki_source_patterns:",
			"  - src/project-server/**",
			"codewiki_test_patterns:",
			"  - tests/project-server/**",
			"codewiki_generated_views:",
			"  - .codewiki/views/status.json",
			"codewiki_trace_events:",
			"  - decision.change_approved",
			"---",
			"# Project Server",
			"",
		].join("\n"),
	);
	return root;
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
	it("treats active and blocked App traces as orthogonal facets", () => {
		assert.equal(
			isActiveAppTrace({ closed: false, loop: "blocked" }),
			true,
		);
		assert.equal(
			isActiveAppTrace({ closed: false, loop: "implementation" }),
			true,
		);
		assert.equal(
			isActiveAppTrace({ closed: false, loop: "waiting" }),
			false,
		);
		assert.equal(
			isActiveAppTrace({ closed: true, loop: "implementation" }),
			false,
		);
	});

	it("registers the intended Pi-native tools and command without package install", async () => {
		const pi = mockPi();

		registerTestExtension(pi.api);

		assert.deepEqual(
			pi.tools.map((tool) => tool.name),
			[...CODEWIKI_TOOL_NAMES],
		);
		for (const name of ["wiki_decide", "wiki_plan", "wiki_implement"]) {
			assert.equal(toolByName(pi, name), undefined, name);
		}
		assert.deepEqual(
			pi.commands.map((command) => command.name),
			[...CODEWIKI_COMMAND_NAMES],
		);
		assert.deepEqual(
			pi.events.map((event) => event.eventName),
			[
				"before_agent_start",
				"tool_result",
				"session_shutdown",
				"session_start",
				"session_shutdown",
			],
		);
		assert.deepEqual(
			pi.messageRenderers.map((renderer) => renderer.customType),
			[CODEWIKI_COMMAND_MESSAGE_TYPE],
		);
		assert.equal(codewikiPromptHooksAvailable, true);
		assert.equal(codewikiTuiRenderersAvailable, true);
		for (const name of ["wiki_state", "wiki_attention"]) {
			assert.equal(toolByName(pi, name).executionMode, "parallel");
		}
		for (const name of CODEWIKI_TOOL_NAMES.filter(
			(candidate) => !["wiki_state", "wiki_attention"].includes(candidate),
		)) {
			assert.equal(toolByName(pi, name).executionMode, "sequential");
		}
		for (const name of CODEWIKI_TOOL_NAMES) {
			assert.equal(toolByName(pi, name).renderCall, undefined);
			assert.equal(toolByName(pi, name).renderResult, undefined);
		}
		const packageJson = await readJsonFile("package.json");
		assert.deepEqual(packageJson.pi, {
			extensions: ["dist/pi-extension.js"],
		});
		assert.equal(packageJson.pi.skills, undefined);
	});

	it("browses bound Decision attention read-only and selects only through an explicit exact-revision command", async () => {
		const root = await fixture();
		try {
			const pi = mockPi();
			const projectionDigest = `sha256:${"b".repeat(64)}`;
			const revisionId = `sha256:${"a".repeat(64)}`;
			const attentionResult = {
				protocol: BACKLOG_TRIAGE_QUERY_PROTOCOL,
				projectionDigest,
				workStateDigest: `sha256:${"c".repeat(64)}`,
				graphSnapshotDigest: `sha256:${"d".repeat(64)}`,
				graphContentDigest: `sha256:${"e".repeat(64)}`,
				triagePolicyDigest: `sha256:${"f".repeat(64)}`,
				orderBy: "default",
				queryDigest: `sha256:${"1".repeat(64)}`,
				items: [
					{
						rank: 1,
						candidate: {
							changeId: "CHG-explicit-user-selection",
							changeRevisionId: revisionId,
							title: "Require explicit user selection",
							status: "pending",
							readiness: {value: "ready"},
						},
						orderingReasons: [
							{
								code: "protected-tier",
								detail: "Eligible exact revision.",
								refs: ["change:CHG-explicit-user-selection"],
							},
						],
					},
				],
				coverage: {
					projectedCandidateCount: 1,
					matchedCandidateCount: 1,
					returnedCandidateCount: 1,
					truncated: false,
				},
				resultDigest: `sha256:${"2".repeat(64)}`,
			};
			const selections = [];
			const projectServices = {
				...testPiProjectServices(),
				async decisionAttention() {
					return attentionResult;
				},
				async selectDecision(input) {
					selections.push(input);
					return {attemptOperationId: "op:decision-attempt:test"};
				},
			};
			registerCodewikiExtension(pi.api, {
				dashboardService: testPiDashboardService(projectServices),
				projectServices,
			});
			const context = {
				cwd: root,
				mode: "rpc",
				sessionManager: {getSessionId: () => "session:selection-test"},
			};
			const attentionTool = toolByName(pi, "wiki_attention");
			const attention = assertToolResult(
				await attentionTool.execute(
					"tool-call-attention",
					{},
					undefined,
					undefined,
					context,
				),
				/wiki_attention: 1 of 1 matched exact Change revision/,
			);
			assert.equal(attention.projectionDigest, projectionDigest);
			await assert.rejects(
				attentionTool.execute(
					"tool-call-attention-extra",
					{select: true},
					undefined,
					undefined,
					context,
				),
				/wiki_attention received unsupported parameter select/,
			);

			const attentionCommand = pi.commands.find(
				(candidate) => candidate.name === "wiki-attention",
			).command;
			const attentionCommandResult = await attentionCommand.handler(
				"--json",
				context,
			);
			assert.equal(attentionCommandResult.result.projectionDigest, projectionDigest);

			const selectCommand = pi.commands.find(
				(candidate) => candidate.name === "wiki-select",
			).command;
			const selected = await selectCommand.handler(
				`CHG-explicit-user-selection --revision ${revisionId} --projection ${projectionDigest} --allow-non-project-install`,
				context,
			);
			assert.equal(selected.attemptOperationId, "op:decision-attempt:test");
			assert.equal(selections.length, 1);
			assert.deepEqual(selections[0].command.protocolId, DECISION_ATTENTION_SELECTION_PROTOCOL.id);
			assert.deepEqual(Object.keys(selections[0].command).sort(), [
				"changeId",
				"changeRevisionId",
				"expectedProjectionDigest",
				"idempotencyKey",
				"protocolId",
				"protocolVersion",
			]);
			assert.match(selections[0].command.idempotencyKey, /^pi-selection:/);
			await assert.rejects(
				selectCommand.handler(
					`CHG-explicit-user-selection --revision ${revisionId} --projection ${projectionDigest} --authority admin`,
					context,
				),
				/Unsupported \/wiki-select option: --authority/,
			);
			assert.equal(selections.length, 1);
		} finally {
			await rm(root, {recursive: true, force: true});
		}
	});

	it("exposes guarded Change reads through the registered Pi tool", async () => {
		const root = await fixture();
		try {
			execFileSync("git", ["init", "-q"], { cwd: root });
			const pi = mockPi();
			registerTestExtension(pi.api);
			const tool = toolByName(pi, "wiki_change");
			const result = assertToolResult(
				await tool.execute(
					"tool-call-changes-list",
					{ input: { operation: "list" } },
					undefined,
					undefined,
					{ cwd: root },
				),
				/wiki_change: completed list operation\./,
			);
			assert.equal(result.operation, "list");
			assert.equal(result.head, null);
			assert.deepEqual(result.records, []);
			await assert.rejects(
				tool.execute(
					"tool-call-changes-accept",
					{ input: { operation: "accept" } },
					undefined,
					undefined,
					{ cwd: root },
				),
				/Unsupported wiki_change operation accept/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("renders rich read commands as plain custom messages in TUI mode", async () => {
		const root = await fixture();
		try {
			const pi = mockPi({ sendMessage: true });
			registerTestExtension(pi.api);
			const command = pi.commands.find(
				(candidate) => candidate.name === "wiki-resume",
			).command;

			await command.handler("", {
				cwd: root,
				mode: "tui",
				ui: { notify: () => assert.fail("notify fallback should not be used") },
			});

			assert.equal(pi.messages.length, 1);
			assert.equal(pi.messages[0].customType, CODEWIKI_COMMAND_MESSAGE_TYPE);
			const renderer = pi.messageRenderers.find(
				(candidate) => candidate.customType === CODEWIKI_COMMAND_MESSAGE_TYPE,
			).renderer;
			assert.equal(
				renderer(pi.messages[0], {}, {}).render(80)[0],
				"CodeWiki Resume",
			);
			assert.ok(
				renderer({ details: { lines: ["x".repeat(1100)] } }, {}, {})
					.render(80)
					.every((line) => line.length <= 80),
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("opens the dashboard only for initial TUI startup", () => {
		assert.equal(
			shouldOpenAutomaticDashboard({ reason: "startup" }, { mode: "tui" }),
			true,
		);
		assert.equal(
			shouldOpenAutomaticDashboard({ reason: "reload" }, { mode: "tui" }),
			false,
		);
		assert.equal(
			shouldOpenAutomaticDashboard({ reason: "startup" }, { mode: "rpc" }),
			false,
		);
	});

	it("sets a CodeWiki footer status and starts its dashboard when Pi event hooks exist", async () => {
		const root = await fixture();
		try {
			const pi = mockPi();
			registerTestExtension(pi.api);
			const hook = pi.events.find(
				(event) => event.eventName === "session_start",
			);
			assert.ok(hook);
			const statuses = [];

			await hook.handler(
				{ reason: "startup" },
				{
					cwd: root,
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
			assert.match(
				statuses[0].value,
				/^CodeWiki \S+ \S+ · dashboard live · \/wiki-dashboard reopen$/,
			);
			assert.ok(await restoreCodewikiAppServer(root));
		} finally {
			await closeCodewikiAppServer(root);
			await rm(root, { recursive: true, force: true });
		}
	});

	it("does not install persistent Pi widgets for CodeWiki state", async () => {
		const root = await fixture();
		try {
			const pi = mockPi();
			registerTestExtension(pi.api);
			const widgets = [];

			for (const hook of pi.events.filter(
				(event) => event.eventName === "session_start",
			)) {
				await hook.handler(
					{ reason: "startup" },
					{
						cwd: root,
						mode: "tui",
						ui: {
							notify() {},
							setStatus() {},
							setWidget(key, value, options) {
								widgets.push({ key, value, options });
							},
						},
					},
				);
			}

			assert.deepEqual(widgets, [
				{ key: "codewiki-cards", value: undefined, options: undefined },
			]);
		} finally {
			await closeCodewikiAppServer(root);
			await rm(root, { recursive: true, force: true });
		}
	});

	it("injects CodeWiki prompt guidance once when Pi event hooks exist", async () => {
		const pi = mockPi();
		registerTestExtension(pi.api);
		const hook = pi.events.find(
			(event) => event.eventName === "before_agent_start",
		);
		assert.ok(hook);

		const result = await hook.handler({ systemPrompt: "base prompt" }, {});
		assert.match(result.systemPrompt, /base prompt/);
		assert.match(result.systemPrompt, /CodeWiki Pi guidance/);
		assert.match(result.systemPrompt, /wiki_state/);
		assert.match(result.systemPrompt, /runtimeReaction/);
		assert.doesNotMatch(
			result.systemPrompt,
			/wiki_decide|wiki_plan|wiki_implement/,
		);
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
			registerTestExtension(pi.api);

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
						{ sourcePaths: ["src/project-server/index.ts"] },
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

	it("rejects incomplete direct archive append", async () => {
		const root = await fixture();
		try {
			const pi = mockPi();
			registerTestExtension(pi.api);
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

	it("reads config without writing and writes only when requested", async () => {
		const root = await fixture();
		try {
			const configPath = join(root, ".codewiki", "config.json");
			const pi = mockPi();
			registerTestExtension(pi.api);
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
			const stored = await readJsonFile(configPath);
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
			registerTestExtension(pi.api);
			const dashboardCommand = pi.commands.find(
				(candidate) => candidate.name === "wiki-dashboard",
			).command;
			const resumeCommand = pi.commands.find(
				(candidate) => candidate.name === "wiki-resume",
			).command;

			const dashboard = await dashboardCommand.handler("--no-open", {
				cwd: root,
				ui: { notify: (message) => notifications.push(message) },
			});
			assert.equal(dashboard.command, "dashboard");
			assert.match(dashboard.url, /^http:\/\/127\.0\.0\.1:/);
			assert.match(notifications.at(-1), /Click to open CodeWiki dashboard/);

			const resume = await resumeCommand.handler("", {
				cwd: root,
				ui: { notify: (message) => notifications.push(message) },
			});
			assert.equal(resume.command, "resume");
		} finally {
			await closeCodewikiAppServer(root);
			await rm(root, { recursive: true, force: true });
		}
	});

	it("/wiki-dashboard recreates private endpoint metadata without a daemon", async () => {
		const root = await fixture();
		const tempRoot = await mkdtemp(join(tmpdir(), "codewiki-dashboard-test-"));
		const dashboardTmp = join(tempRoot, "missing-tmp");
		const previousTmp = process.env.CODEWIKI_APP_SERVER_TMPDIR;
		process.env.CODEWIKI_APP_SERVER_TMPDIR = dashboardTmp;
		await rm(dashboardTmp, { recursive: true, force: true });
		try {
			const notifications = [];
			const pi = mockPi();
			registerTestExtension(pi.api);
			const dashboardCommand = pi.commands.find(
				(candidate) => candidate.name === "wiki-dashboard",
			).command;

			const dashboard = await dashboardCommand.handler("--no-open", {
				cwd: root,
				ui: { notify: (message) => notifications.push(message) },
			});

			assert.equal(dashboard.command, "dashboard");
			assert.match(dashboard.url, /^http:\/\/127\.0\.0\.1:/);
			assert.equal((await fetch(dashboard.url)).status, 200);
			assert.match(notifications.at(-1), /Click to open CodeWiki dashboard/);
			if (process.platform !== "win32") {
				const endpointDirectory = join(dashboardTmp, "codewiki-dashboard");
				assert.equal((await stat(endpointDirectory)).mode & 0o777, 0o700);
				const endpointFiles = await readdir(endpointDirectory);
				assert.ok(endpointFiles.length >= 1);
				for (const path of endpointFiles) {
					assert.equal(
						(await stat(join(endpointDirectory, path))).mode & 0o777,
						0o600,
					);
				}
			}
		} finally {
			await closeCodewikiAppServer(root);
			if (previousTmp === undefined)
				delete process.env.CODEWIKI_APP_SERVER_TMPDIR;
			else process.env.CODEWIKI_APP_SERVER_TMPDIR = previousTmp;
			await rm(root, { recursive: true, force: true });
			await rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("/wiki-dashboard serves the Work Pipeline, supports stop/reopen, and /wiki-resume returns focused views", async () => {
		const root = await fixture();
		try {
			const notifications = [];
			const widgets = [];
			const pi = mockPi({ sendUserMessage: true });
			registerTestExtension(pi.api);
			const dashboardCommand = pi.commands.find(
				(candidate) => candidate.name === "wiki-dashboard",
			).command;
			const resumeCommand = pi.commands.find(
				(candidate) => candidate.name === "wiki-resume",
			).command;
			const ctx = {
				cwd: root,
				mode: "tui",
				isIdle: () => false,
				ui: {
					width: 80,
					notify: (message) => notifications.push(message),
					setWidget: (key, value) => widgets.push({ key, value }),
				},
			};
			await appendDevLogEntry(root, {
				id: "dev-dashboard-1",
				timestamp: "2026-06-17T00:00:00.500Z",
				traceId: "TRACE-pi",
				workUnitId: "WU-pi",
				workerId: "worker-001",
				attemptId: "claim-001",
				category: "worker",
				action: "worker.started",
				status: "success",
			});

			const opened = await dashboardCommand.handler("--no-open", ctx);
			assert.equal(opened.command, "dashboard");
			assert.equal(opened.opened, false);
			assert.equal(opened.rendered.length, 1);
			assert.match(opened.rendered[0], /Click to open CodeWiki dashboard/);
			assert.doesNotMatch(opened.rendered[0], /\u001B/);
			assert.equal(widgets.length, 0);

			const dashboardUrl = new URL(opened.url);
			const dashboardSession = new URLSearchParams(
				dashboardUrl.hash.slice(1),
			).get("session");
			assert.ok(dashboardSession);
			const dashboardAuthorization = `Bearer ${dashboardSession}`;
			assert.equal(dashboardUrl.search, "");
			assert.match(dashboardUrl.hash, /^#session=/);
			const htmlResponse = await fetch(opened.url);
			const html = await htmlResponse.text();
			assert.equal(htmlResponse.headers.get("referrer-policy"), "no-referrer");
			assert.equal(
				htmlResponse.headers.get("x-content-type-options"),
				"nosniff",
			);
			assert.match(
				htmlResponse.headers.get("content-security-policy"),
				/default-src 'none'/,
			);
			assert.doesNotMatch(html, new RegExp(dashboardSession));
			assert.doesNotMatch(html, /codewiki\.dashboard\.token/);
			assert.match(html, /HttpOnly|\/api\/session/);
			assert.match(html, /id="search"/);
			assert.match(html, /id="search-filter"/);
			assert.match(html, /codewiki-logo/);
			assert.match(html, /data:image\/png;base64,/);
			assert.doesNotMatch(html, /src="\/assets\/codewiki-logo\.png/);
			assert.match(html, /Repo:/);
			assert.match(html, /header-dashboard/);
			assert.match(html, /class="pipeline-search"/);
			assert.match(html, /class="search-filter"/);
			assert.match(html, /Changes Backlog/);
			assert.doesNotMatch(html, />Add Change<\/button>/);
			assert.match(html, /Observation only/);
			assert.match(html, /aria-expanded/);
			assert.match(html, /isInteractiveDashboardTarget/);
			assert.match(html, /focusSelectedPipelineCard/);
			assert.match(html, /function pipelineEntries/);
			assert.match(html, /state\.summary\.backlog/);
			assert.match(html, /state\.summary\.committed/);
			assert.match(html, /setInterval\(load, 1000\)/);
			assert.match(html, /eventStream\.onerror/);
			assert.doesNotMatch(html, /function stopDashboard/);
			assert.doesNotMatch(html, /Close Dashboard/);
			assert.doesNotMatch(html, /<label for="search">/);
			assert.doesNotMatch(html, /mission-title/);
			assert.doesNotMatch(html, /CodeWiki \/ local observability/);
			assert.doesNotMatch(html, /trace-ribbon/);
			assert.doesNotMatch(html, /trace-decision/);
			assert.doesNotMatch(html, /quality-strip/);
			assert.doesNotMatch(html, /--check-color/);
			assert.doesNotMatch(html, /ready-checks/);
			assert.match(html, /pipeline-rail/);
			assert.match(html, /--progress-inactive/);
			assert.match(html, /--stage-change/);
			assert.match(html, /--stage-decision/);
			assert.match(html, /--stage-planning/);
			assert.match(html, /--stage-implementation/);
			assert.match(html, /--stage-committed/);
			assert.doesNotMatch(html, /--progress-blocked/);
			assert.match(html, /card-options/);
			assert.match(html, /configuration-dialog/);
			assert.doesNotMatch(html, /class="search-wrap"/);
			assert.match(html, /quality-layer/);
			assert.match(html, /quality-type/);
			assert.doesNotMatch(html, /quality-bundle/);
			assert.match(html, /qualityAggregateStatusText/);
			assert.match(html, /QUALITY_LAYER_ORDER/);
			assert.match(html, /QUALITY_STANDARD_FALLBACKS/);
			assert.match(html, /canonicalQualityText/);
			assert.doesNotMatch(html, /trace-feed/);
			assert.match(html, /detail-tabs/);
			assert.match(html, /border: 0;/);
			assert.match(html, /terminal-block/);
			assert.match(html, /loop-panel/);
			assert.match(html, /loop-section/);
			assert.match(html, /quality-meta/);
			assert.doesNotMatch(html, /renderLoopOverview/);
			assert.doesNotMatch(html, /loop-overview/);
			assert.doesNotMatch(html, /loop-subsection/);
			assert.doesNotMatch(html, /report-metrics/);
			assert.match(html, /knowledge base refs/);
			assert.match(html, /touched files/);
			assert.doesNotMatch(html, /System Summary/);
			assert.doesNotMatch(html, /Trace Detail/);

			const logoUrl = new URL(opened.url);
			logoUrl.pathname = "/assets/codewiki-logo.png";
			const logoResponse = await fetch(logoUrl);
			assert.equal(logoResponse.status, 200);
			assert.equal(logoResponse.headers.get("content-type"), "image/png");
			const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
			assert.deepEqual(
				Array.from(logoBytes.slice(0, 8)),
				[137, 80, 78, 71, 13, 10, 26, 10],
			);
			assert.equal(logoBytes[25], 6);

			const staleApiUrl = new URL(opened.url);
			staleApiUrl.hash = "";
			staleApiUrl.pathname = "/api/state";
			staleApiUrl.searchParams.set("token", "stale");
			assert.equal((await fetch(staleApiUrl)).status, 403);

			const url = new URL(opened.url);
			url.hash = "";
			url.pathname = "/api/state";
			const stateResponse = await fetch(url, {
				headers: {Authorization: dashboardAuthorization},
			});
			const state = await stateResponse.json();
			assert.equal(state.projectName, root.split("/").at(-1));
			assert.equal(state.summary.committed, 0);
			assert.equal(state.summary.decision, 1);
			assert.equal(Object.hasOwn(state.summary, "archived"), false);
			assert.equal(state.pipelineQueue[0].traceId, "TRACE-pi");
			assert.equal(state.pipelineQueue[0].stage, "decision");
			assert.equal(state.pipelineQueue[0].committed, false);
			assert.deepEqual(
				state.pipelineQueue[0].segments.map((segment) => segment.phase),
				["change", "decision", "planning", "implementation", "committed"],
			);
			assert.ok(
				state.pipelineQueue[0].segments.every(
					(segment) =>
						typeof segment.progress === "number" &&
						segment.progress >= 0 &&
						segment.progress <= 1,
				),
			);
			assert.equal(state.pipelineQueue[0].devLog.available, true);
			assert.equal(state.changes.available, true);
			assert.equal(typeof state.configuration.effective.runtime.maxWorkers, "number");
			assert.equal(Object.hasOwn(state, "sessionActions"), false);
			for (const pathname of [
				"/api/session-actions/commands",
				"/api/changes/commands",
				"/api/configuration/commands",
			]) {
				const removedCommandUrl = new URL(opened.url);
				removedCommandUrl.hash = "";
				removedCommandUrl.pathname = pathname;
				const response = await fetch(removedCommandUrl, {
					method: "POST",
					headers: {
						Authorization: dashboardAuthorization,
						Origin: removedCommandUrl.origin,
						"Content-Type": "application/json",
					},
					body: "{}",
				});
				assert.equal(response.status, 404, pathname);
			}
			assert.equal(pi.userMessages.length, 0);
			assert.equal(state.pipelineQueue[0].devLog.entryCount, 1);
			assert.equal(
				state.pipelineQueue[0].devLog.items[0].action,
				"worker.started",
			);
			assert.ok(state.pipelineQueue[0].qualityChecks.length > 0);
			assert.equal(
				typeof state.pipelineQueue[0].qualityChecks[0].standardType,
				"string",
			);
			assert.equal(
				typeof state.pipelineQueue[0].qualityChecks[0].layer,
				"string",
			);
			assert.ok(state.pipelineQueue[0].primaryQualityChecks.length > 0);
			assert.ok(state.pipelineQueue[0].activities.length > 0);
			assert.equal(state.pipelineQueue[0].loopSections.length, 3);
			const decisionSection = state.pipelineQueue[0].loopSections.find(
				(section) => section.loop === "decision",
			);
			assert.ok(decisionSection);
			assert.equal(decisionSection.report.summary, "");
			assert.deepEqual(decisionSection.report.bullets, []);
			assert.match(
				decisionSection.report.metrics.join("\n"),
				/^iterations: \d+$/m,
			);
			assert.match(
				decisionSection.report.metrics.join("\n"),
				/^tokens: not recorded$/m,
			);
			assert.ok(Object.hasOwn(state.pipelineQueue[0].touchedFiles, "tests"));
			assert.equal(typeof state.pipelineQueue[0].qualityCaption, "string");
			assert.match(state.pipelineQueue[0].currentAction, /proposed changes/i);

			const eventsUrl = new URL(opened.url);
			eventsUrl.hash = "";
			eventsUrl.pathname = "/api/events";
			const eventsResponse = await fetch(eventsUrl, {
				headers: {Authorization: dashboardAuthorization},
			});
			assert.equal(eventsResponse.status, 200);
			const reader = eventsResponse.body.getReader();
			const decoder = new TextDecoder();
			let streamBuffer = "";
			async function nextEventState() {
				while (!streamBuffer.includes("\n\n")) {
					const chunk = await reader.read();
					assert.equal(chunk.done, false);
					streamBuffer += decoder.decode(chunk.value, { stream: true });
				}
				const boundary = streamBuffer.indexOf("\n\n");
				const message = streamBuffer.slice(0, boundary);
				streamBuffer = streamBuffer.slice(boundary + 2);
				return JSON.parse(message.replace(/^data: /, ""));
			}
			const initialEventState = await nextEventState();
			await appendFile(
				join(root, ".codewiki", "traces", "TRACE-pi.jsonl"),
				formatTraceText([
					{
						type: "trace_event",
						id: "TRACE-pi:decision:iteration:1",
						parentId: null,
						traceId: "TRACE-pi",
						sequence: 1,
						loop: "decision",
						event: "change_approved",
						refs: ["src/project-server/index.ts"],
						createdAt: "2026-06-17T00:00:01.000Z",
						data: {
							output: {
								changeRecord: {
									change: {
										id: "CHG-live-dashboard",
										intent: { desiredState: "Refresh dashboard state." },
									},
								},
								decision: { disposition: "approve" },
							},
							exit: { status: "exit" },
						},
					},
				]),
			);
			const updatedEventState = await Promise.race([
				nextEventState(),
				new Promise((_, reject) =>
					setTimeout(
						() => reject(new Error("Dashboard SSE update timed out.")),
						3_000,
					),
				),
			]);
			assert.ok(
				updatedEventState.pipelineQueue[0].activities.length >
					initialEventState.pipelineQueue[0].activities.length,
			);
			assert.deepEqual(updatedEventState.pipelineQueue[0].changeIds, [
				"CHG-live-dashboard",
			]);
			await reader.cancel();

			const blockedUrl = new URL(opened.url);
			blockedUrl.hash = "";
			blockedUrl.pathname = "/api/state";
			blockedUrl.search = "";
			assert.equal((await fetch(blockedUrl)).status, 403);
			assert.equal((await fetch(url, { method: "POST" })).status, 404);

			for (const hook of pi.events.filter(
				(event) => event.eventName === "session_shutdown",
			)) {
				await hook.handler({ reason: "reload" }, ctx);
			}
			await assert.rejects(() => fetch(opened.url));
			for (const hook of pi.events.filter(
				(event) => event.eventName === "session_start",
			)) {
				await hook.handler({ reason: "reload" }, ctx);
			}
			const reopened = await dashboardCommand.handler("--no-open", ctx);
			const reopenedUrl = new URL(reopened.url);
			const reopenedSession = new URLSearchParams(
				reopenedUrl.hash.slice(1),
			).get("session");
			assert.ok(reopenedSession);
			assert.notEqual(reopenedSession, dashboardSession);
			assert.equal(reopenedUrl.origin, dashboardUrl.origin);
			reopenedUrl.hash = "";
			reopenedUrl.pathname = "/api/state";
			const recoveredResponse = await fetch(reopenedUrl, {
				headers: {Authorization: `Bearer ${reopenedSession}`},
			});
			assert.equal(recoveredResponse.status, 200);
			const recoveredState = await recoveredResponse.json();
			assert.equal(recoveredState.pipelineQueue[0].traceId, "TRACE-pi");
			assert.equal(typeof recoveredState.summary.decision, "number");

			const resume = await resumeCommand.handler("", {
				cwd: root,
				ui: { notify: (message) => notifications.push(message) },
			});
			assert.equal(resume.command, "resume");
			assert.equal(resume.data.traceId, "TRACE-pi");
			assert.match(notifications.at(-1), /CodeWiki Resume/);
			assert.match(resume.rendered.join("\n"), /Next\s+│ Loop\s+│ Active work/);

			const stopped = await dashboardCommand.handler("--stop", ctx);
			assert.equal(stopped.stopped, true);
			assert.match(stopped.rendered[0], /dashboard stopped/i);
			await assert.rejects(() => fetch(opened.url));
			const restarted = await dashboardCommand.handler("--no-open", ctx);
			assert.equal(restarted.stopped, false);
			assert.equal((await fetch(restarted.url)).status, 200);
		} finally {
			await closeCodewikiAppServer(root);
			await rm(root, { recursive: true, force: true });
		}
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
			registerTestExtension(pi.api);
			const command = pi.commands.find(
				(candidate) => candidate.name === "wiki-explain",
			).command;

			const project = await command.handler("", {
				cwd: root,
				ui: { notify: (message) => notifications.push(message) },
			});
			assert.equal(project.data.kind, "project");
			assert.match(project.data.title, /CodeWiki project/);

			const path = await command.handler("src/project-server/index.ts", {
				cwd: root,
				ui: { notify: (message) => notifications.push(message) },
			});
			assert.equal(path.data.kind, "path");
			assert.equal(path.data.sections[0].items[0], "project-server");
			assert.match(
				notifications.at(-1),
				/CodeWiki Explain — Path: src\/project-server\/index\.ts/,
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
			registerTestExtension(pi.api);
			const tool = toolByName(pi, "wiki_state");

			const result = await tool.execute(
				"tool-call-1",
				{},
				undefined,
				undefined,
				{ cwd: join(root, "src", "runtime") },
			);

			assert.match(result.content[0].text, /wiki_state: all view/);
			assert.match(result.content[0].text, /active work unit/);
			assert.deepEqual(result.details.result.traceIds, ["TRACE-pi"]);
			assert.equal(result.details.result.runtimeReaction.status, "quiescent");
			assert.equal(result.details.result.sourceOwners, undefined);

			const focused = await tool.execute(
				"tool-call-focused",
				{ view: "summary", traceId: "TRACE-pi" },
				undefined,
				undefined,
				{ cwd: root },
			);
			const focusedPayload = JSON.parse(
				focused.content[0].text.split("\n").at(-1),
			);
			assert.equal(focusedPayload.runtimeReaction.status, "quiescent");
			assert.equal(focusedPayload.traceId, "TRACE-pi");
			assert.equal(focusedPayload.trace.traceId, "TRACE-pi");
			assert.equal(typeof focusedPayload.append.expectedBytes, "number");
			assert.ok(focused.content[0].text.length < 32_000);

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
			registerTestExtension(pi.api);
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
			assert.match(result.rendered.join("\n"), /\/wiki-dashboard/);
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
					version: "0.3.0",
					loadMode: "local checkout",
					sourceLabel: "local checkout ✓",
					footerLabel: "0.3.0 local",
					entry: "dist/clients/pi/commands/index.js",
					packageRoot:
						"/tmp/codewiki-bootstrap-renderer-wide-path-with-extra-text",
					loadedFromProject: true,
				},
			},
		);
		assert.match(rendered.join("\n"), /✓ CodeWiki ready/);
		assert.match(rendered.join("\n"), /local checkout ✓/);
		assert.match(
			rendered.join("\n"),
			/dist\/clients\/pi\/commands\/index\.js/,
		);
		assert.match(rendered.join("\n"), /Action\s+│ Count\s+│ Meaning/);
		assert.match(rendered.join("\n"), /Next\n• You are ready/);
		assert.match(rendered.join("\n"), /\/wiki-bootstrap/);
		assert.doesNotMatch(rendered.join("\n"), /│ Agent work │/);
		for (const line of rendered.filter((line) => line.includes("│"))) {
			assert.ok(line.length <= 78, line);
		}
	});
});
