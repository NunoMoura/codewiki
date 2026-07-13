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
	assert.equal(result.details.warnings, undefined);
	return result.details.result;
}

const root = mkdtempSync(join(tmpdir(), "codewiki-project-local-install-"));
try {
	const packRoot = join(root, "pack");
	const projectRoot = join(root, "project");
	const projectPiNpmRoot = join(projectRoot, ".pi", "npm");
	mkdirSync(packRoot, { recursive: true });
	mkdirSync(projectPiNpmRoot, { recursive: true });
	writeFileSync(
		join(projectRoot, "package.json"),
		`${JSON.stringify({ name: "codewiki-project-local-install", type: "module" }, null, "\t")}\n`,
	);

	const pack = run("npm", ["pack", "--pack-destination", packRoot]);
	const tarball = pack.stdout.trim().split(/\r?\n/).at(-1);
	assert.match(tarball, /^codewiki-.*\.tgz$/);
	run("npm", [
		"install",
		"--prefix",
		projectPiNpmRoot,
		join(packRoot, tarball),
	]);
	const packageRoot = join(projectPiNpmRoot, "node_modules", "codewiki");
	assert.equal(
		existsSync(join(packageRoot, "dist", "pi", "extension.js")),
		true,
	);

	const { default: codewikiExtension } = await import(
		pathToFileURL(join(packageRoot, "dist", "pi", "extension.js")).href
	);
	const pi = mockPi();
	codewikiExtension(pi.api);
	const bootstrapCommand = commandByName(pi, "wiki-bootstrap");
	const dashboardCommand = commandByName(pi, "wiki-dashboard");
	const stateTool = toolByName(pi, "wiki_state");
	const changeTool = toolByName(pi, "wiki_change");
	const decideTool = toolByName(pi, "wiki_decide");
	const configTool = toolByName(pi, "wiki_config");
	const notifications = [];
	const ctx = {
		cwd: projectRoot,
		ui: {
			notify(message, level) {
				notifications.push({ message, level });
			},
		},
	};

	await assert.rejects(
		() =>
			toolByName(pi, "wiki_state").execute(
				"pre-state",
				{},
				undefined,
				undefined,
				ctx,
			),
		/No CodeWiki project found/,
	);
	await bootstrapCommand.handler("--json", ctx);
	assert.equal(existsSync(join(projectRoot, ".codewiki", "config.json")), true);
	assert.equal(
		notifications.some((notice) => notice.level === "warning"),
		false,
	);

	const config = assertToolResult(
		await configTool.execute(
			"config-write",
			{ input: { patch: { project: "project-local-install" } }, write: true },
			undefined,
			undefined,
			ctx,
		),
		/wiki_config: resolved CodeWiki configuration\./,
	);
	assert.equal(config.config.project, "project-local-install");

	const traceId = "TRACE-project-local-install-smoke";
	const tracePath = join(
		projectRoot,
		".codewiki",
		"traces",
		`${traceId}.jsonl`,
	);
	run("git", ["init", "-q"], { cwd: projectRoot });
	const change = acceptedChangeFixture({
		id: "CHG-project-local-install-smoke",
		kind: "harden",
		currentState: "Mutation guards require project-local package installs.",
		desiredState:
			"A package under the project's .pi/npm tree can bootstrap and append without override.",
		rationale:
			"This proves normal local installation works without controlled-test bypasses.",
		safetyBoundary:
			"Only project-local package installs may mutate without an explicit controlled-test override.",
		failureModes: [
			"Project-local package install is falsely rejected.",
			"Mutation requires allowNonProjectInstall in normal local installs.",
		],
		negativeTestPlan:
			"Install under .pi/npm and append without allowNonProjectInstall.",
		sourceRefs: ["README.md"],
		createdAt: "2026-06-18T14:00:00.000Z",
	});
	const created = assertToolResult(
		await changeTool.execute(
			"change-create",
			{
				input: {
					operation: "create",
					expectedHead: null,
					actor: "project-local-install-smoke",
					createdAt: "2026-06-18T14:00:00.000Z",
					change,
				},
			},
			undefined,
			undefined,
			ctx,
		),
		/wiki_change: completed create operation\./,
	);
	const changeAcceptance = {
		expectedHead: created.head,
		selections: [
			{
				changeId: change.id,
				revision: change.revision,
				recordRevision: created.record.recordRevision,
				contentDigest: change.validation.validatedDigest,
			},
		],
		acceptedBy: "project-local-install-smoke",
		acceptedAt: "2026-06-18T14:00:01.000Z",
	};
	const preview = assertToolResult(
		await decideTool.execute(
			"decide-preview",
			{
				input: {
					traceId,
					mode: "preview",
					changeAcceptance,
				},
			},
			undefined,
			undefined,
			ctx,
		),
		/wiki_decide: completed preview run\./,
	);
	const decided = assertToolResult(
		await decideTool.execute(
			"decide-append",
			{
				input: {
					traceId,
					mode: "append",
					expectedBytes: 0,
					nextSequence: 1,
					changeAcceptance,
					sprintProposalApproval: {
						approved: true,
						renderedProposalDigest: preview.renderedSprintProposal.digest,
						approvedBy: "project-local-install-smoke",
						approvedAt: "2026-06-18T14:00:01.000Z",
					},
				},
			},
			undefined,
			undefined,
			ctx,
		),
		/wiki_decide: completed append run\./,
	);
	assert.equal(decided.loopResult.exit.passed, true);
	assert.equal(decided.iterationEvent.data.exit.status, "exit");
	assert.equal((await stat(tracePath)).size > 0, true);
	const state = await stateTool.execute(
		"post-decision-state",
		{ view: "board", traceId },
		undefined,
		undefined,
		ctx,
	);
	assert.equal(state.details.result.data.workQueue.summary.ready, 0);
	const dashboard = await dashboardCommand.handler("--no-open", ctx);
	assert.equal(dashboard.command, "dashboard");
	assert.match(dashboard.url, /^http:\/\/127\.0\.0\.1:/);
	assert.equal(
		notifications.some((notice) => notice.level === "warning"),
		false,
	);

	console.log(
		JSON.stringify(
			{
				ok: true,
				packageRoot,
				traceId,
				mutatedWithoutOverride: true,
			},
			null,
			2,
		),
	);
} finally {
	rmSync(root, { recursive: true, force: true });
}
