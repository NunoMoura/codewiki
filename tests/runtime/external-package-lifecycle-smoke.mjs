import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
	readFileSync,
} from "node:fs";
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
	return result.details.result;
}

async function executeTool(tool, input, ctx, id = tool.name) {
	return await tool.execute(
		`external-lifecycle-${id}`,
		{ input },
		undefined,
		undefined,
		ctx,
	);
}

const root = mkdtempSync(
	join(tmpdir(), "codewiki-external-package-lifecycle-"),
);
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
		`${JSON.stringify({ name: "codewiki-external-lifecycle", type: "module" }, null, "\t")}\n`,
	);
	writeFileSync(
		join(projectRoot, "README.md"),
		"# External Lifecycle Fixture\n\nA fresh project used by CodeWiki package lifecycle.\n",
	);
	writeFileSync(
		join(projectRoot, "src", "external-feature.js"),
		"export const externalLifecycleFeature = 'ready';\n",
	);
	writeFileSync(
		join(projectRoot, "tests", "external-feature.test.mjs"),
		`import assert from "node:assert/strict";\nimport { externalLifecycleFeature } from "../src/external-feature.js";\nassert.equal(externalLifecycleFeature, "ready");\n`,
	);

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

	const { default: codewikiExtension } = await import(
		pathToFileURL(join(packageRoot, "dist", "pi", "extension.js")).href
	);

	const pi = mockPi();
	codewikiExtension(pi.api);
	const bootstrapCommand = commandByName(pi, "wiki-bootstrap");
	const dashboardCommand = commandByName(pi, "wiki-dashboard");
	const stateTool = toolByName(pi, "wiki_state");
	const attentionTool = toolByName(pi, "wiki_attention");
	const changeTool = toolByName(pi, "wiki_change");
	const decideTool = toolByName(pi, "wiki_decide");
	const notifications = [];
	const ctx = {
		cwd: projectRoot,
		mode: "rpc",
		ui: {
			notify(message) {
				notifications.push(message);
			},
		},
	};

	await assert.rejects(
		() =>
			stateTool.execute("pre-bootstrap-state", {}, undefined, undefined, ctx),
		/No CodeWiki project found/,
	);
	const bootstrap = await bootstrapCommand.handler(
		"--allow-non-project-install --json",
		ctx,
	);
	assert.equal(bootstrap.data.created.includes(".codewiki/config.json"), true);
	const emptyState = await stateTool.execute(
		"post-bootstrap-state",
		{ view: "board" },
		undefined,
		undefined,
		ctx,
	);
	assert.equal(emptyState.details.result.data.workQueue.summary.ready, 0);
	const dashboard = await dashboardCommand.handler("--no-open", ctx);
	assert.equal(dashboard.command, "dashboard");
	assert.match(dashboard.url, /^http:\/\/127\.0\.0\.1:/);

	run("git", ["init", "-q"], { cwd: projectRoot });
	const change = acceptedChangeFixture({
		id: "CHG-external-package-lifecycle",
		kind: "harden",
		currentState: "Repo-local self-testing can hide package lifecycle drift.",
		desiredState:
			"A packed install proves guarded lifecycle behavior in a fresh project.",
		rationale:
			"External lifecycle proof is required before broader package use.",
		safetyBoundary:
			"Installed packages mutate only through guarded expected-byte and sequence checks.",
		failureModes: [
			"Install metadata works only inside the source repository.",
			"Bootstrap creates incomplete project-local state.",
		],
		negativeTestPlan:
			"Reject state before bootstrap and require guarded append arguments.",
		sourceRefs: ["README.md", ".codewiki/kb/system/components/runtime.md"],
		proofRefs: ["tests/runtime/external-package-lifecycle-smoke.mjs"],
		acceptedBy: "external-package-lifecycle-smoke",
	});
	assertToolResult(
		await changeTool.execute(
			"external-lifecycle-change-create",
			{
				allowNonProjectInstall: true,
				input: {
					operation: "create",
					expectedHead: null,
					actor: "external-package-lifecycle-smoke",
					createdAt: "2026-06-18T09:00:00.000Z",
					change,
				},
			},
			undefined,
			undefined,
			ctx,
		),
		/wiki_change: completed create operation\./,
	);
	const traceId = `TRACE-${change.id}`;
	const tracePath = join(
		projectRoot,
		".codewiki",
		"traces",
		`${traceId}.jsonl`,
	);
	const initialTrace = readFileSync(tracePath);
	await assert.rejects(
		attentionTool.execute(
			"external-lifecycle-attention",
			{},
			undefined,
			undefined,
			ctx,
		),
		/decision_attention_projection_unavailable/,
	);
	const decisionInput = {
		disposition: "approve",
		rationale: "Unselected external Candidate must not gain Decision authority.",
	};
	for (const mode of ["preview", "append"]) {
		await assert.rejects(
			executeTool(
				decideTool,
				{ ...decisionInput, mode, allowNonProjectInstall: true },
				ctx,
				`decide-${mode}`,
			),
			/decision_attention_selection_required/,
		);
		assert.deepEqual(readFileSync(tracePath), initialTrace);
	}
	console.log(
		JSON.stringify(
			{
				ok: true,
				projectRoot,
				packageRoot,
				traceId,
				guard: "decision_attention_selection_required",
				traceUnchanged: true,
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
		"harnesses",
		"coordinator-entrypoint.js",
	);
	if (existsSync(coordinatorApi)) {
		const { stopProjectCoordinatorService } = await import(
			pathToFileURL(coordinatorApi).href
		);
		await stopProjectCoordinatorService(join(root, "external-project"), {
			timeoutMs: 2_000,
		}).catch(() => undefined);
	}
	rmSync(root, { recursive: true, force: true });
}
