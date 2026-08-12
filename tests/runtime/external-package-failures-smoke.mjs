import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function run(command, args, options = {}) {
	return execFileSync(command, args, {
		cwd: options.cwd || process.cwd(),
		encoding: "utf8",
		stdio: options.stdio || "pipe",
	});
}

async function installPackage(root) {
	const packRoot = join(root, "pack");
	const installRoot = join(root, "install");
	await mkdir(packRoot);
	await mkdir(installRoot);
	const pack = run("npm", ["pack", "--pack-destination", packRoot]);
	const tarball = pack.trim().split(/\r?\n/u).at(-1);
	assert.match(tarball, /^nunomoura-codewiki-.*\.tgz$/u);
	run("npm", ["install", "--prefix", installRoot, join(packRoot, tarball)]);
	const packageRoot = join(
		installRoot,
		"node_modules",
		"@nunomoura",
		"codewiki",
	);
	assert.equal(existsSync(join(packageRoot, "dist", "clients", "pi", "extension.js")), true);
	const processAdapter = await import(
		pathToFileURL(
			join(packageRoot, "dist", "execution", "pi", "process-worker-adapter.js"),
		).href
	);
	const workerContracts = await import(
		pathToFileURL(
			join(packageRoot, "dist", "runtime", "workers", "implementation-adapter.js"),
		).href
	);
	const worktrees = await import(
		pathToFileURL(join(packageRoot, "dist", "git", "worktrees.js")).href
	);
	return {
		packageRoot,
		createPiProcessImplementationWorkerAdapter:
			processAdapter.createPiProcessImplementationWorkerAdapter,
		assignmentSchemaVersion:
			workerContracts.IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION,
		executeRuntimeWorktreeCommands: worktrees.executeRuntimeWorktreeCommands,
		WorktreeCommandExecutionError: worktrees.WorktreeCommandExecutionError,
	};
}

function assignment(installed, root, id) {
	const worktreePath = join(root, ".codewiki", "runtime", "worktrees", id);
	return {
		schemaVersion: installed.assignmentSchemaVersion,
		repoRoot: root,
		assignmentId: `assignment:${id}`,
		workerId: `worker:${id}`,
		workItemId: `work:${id}`,
		claimId: `claim:${id}`,
		traceId: `TRACE-CHG-${id}`,
		planningRefs: [`trace:TRACE-CHG-${id}#planning:1`],
		traceRefs: [`TRACE-CHG-${id}`],
		componentRefs: ["component:runtime"],
		pathScopes: ["src/runtime/**"],
		workStateDigest: "sha256:work-state",
		sourceBaseRef: "git:base:abc123",
		contextDigest: `sha256:context:${id}`,
		prompt: "Implement assigned work.",
		reportPath: join(root, ".codewiki", "runtime", "workers", `${id}.json`),
		isolation: { kind: "worktree", ref: `worktree:${id}` },
		worktree: {
			path: worktreePath,
			branch: `codewiki/${id}`,
			baseRef: "abc123",
		},
	};
}

async function executeWorker(installed, root, id, output) {
	const input = assignment(installed, root, id);
	await mkdir(input.worktree.path, { recursive: true });
	const adapter = installed.createPiProcessImplementationWorkerAdapter({
		process: {
			async runner(command) {
				if (output !== undefined) {
					await mkdir(join(root, ".codewiki", "runtime", "workers"), {
						recursive: true,
					});
					await writeFile(command.outputFile, output, "utf8");
				}
				return {
					pid: 4242,
					sessionId: `session:${id}`,
					outputFile: command.outputFile,
					exitCode: 0,
				};
			},
		},
	});
	return adapter.execute(input, new AbortController().signal);
}

function fencedReport(value) {
	return ["```codewiki-worker-report", JSON.stringify(value), "```"].join("\n");
}

async function runMissingOutput(installed, root) {
	const report = await executeWorker(installed, root, "missing-output", undefined);
	assert.equal(report.status, "failed");
	assert.match(report.implementationEvidence?.message, /output file is (?:missing|unreadable)/u);
	return "worker_failed";
}

async function runMalformedOutput(installed, root) {
	const report = await executeWorker(
		installed,
		root,
		"malformed-output",
		"```codewiki-worker-report\nnot-json\n```",
	);
	assert.equal(report.status, "failed");
	assert.match(report.implementationEvidence?.message, /valid JSON|structured/u);
	return "worker_failed";
}

async function runBlockedOutput(installed, root) {
	const report = await executeWorker(
		installed,
		root,
		"blocked-output",
		fencedReport({
			status: "blocked",
			message: "Planning scope must change.",
			blockers: [
				{
					message: "Needs planning scope change.",
					refs: ["trace:TRACE-CHG-blocked-output#planning:1"],
				},
			],
		}),
	);
	assert.equal(report.status, "blocked");
	assert.equal(report.implementationEvidence?.status, "blocked");
	return "worker_blocked";
}

async function runMixedOutputs(installed, root) {
	const [completed, failed] = await Promise.all([
		executeWorker(
			installed,
			root,
			"mixed-completed",
			fencedReport({
				status: "completed",
				workUnitRef: "trace:TRACE-CHG-mixed-completed#planning:1",
				changedFiles: ["src/runtime/example.ts"],
				checksRun: ["node --test tests/runtime/example.test.mjs"],
				contentProofRefs: ["sha256:content"],
				changes: [],
			}),
		),
		executeWorker(
			installed,
			root,
			"mixed-failed",
			fencedReport({ status: "failed", message: "Worker check failed." }),
		),
	]);
	assert.equal(completed.status, "completed");
	assert.equal(failed.status, "failed");
	return "worker_failed";
}

function worktreePlan(root, id) {
	const command = { executable: "git", args: ["status", "--short"] };
	return {
		workUnitId: `work:${id}`,
		workerId: `worker:${id}`,
		reason: "isolated execution",
		worktree: {
			path: join(root, ".codewiki", "runtime", "worktrees", id),
			branch: `codewiki/${id}`,
			baseRef: "abc123",
		},
		commands: {
			worktreePrepare: [command],
			worktreeVerify: [],
			worktreeCleanup: [command],
		},
	};
}

async function runWorktreeFailure(installed, root, step, reason) {
	await assert.rejects(
		installed.executeRuntimeWorktreeCommands(worktreePlan(root, reason), {
			steps: [step],
			dryRun: false,
			runner() {
				return { stderr: `cannot execute ${step}`, exitCode: 2 };
			},
		}),
		(error) => {
			assert.equal(error instanceof installed.WorktreeCommandExecutionError, true);
			assert.equal(error.record.step, step);
			assert.equal(error.record.exitCode, 2);
			return true;
		},
	);
	return reason;
}

const root = await mkdtemp(join(tmpdir(), "codewiki-external-failures-"));
try {
	const installed = await installPackage(root);
	const results = {
		missingOutput: await runMissingOutput(installed, root),
		malformedOutput: await runMalformedOutput(installed, root),
		blockedOutput: await runBlockedOutput(installed, root),
		mixedOutputs: await runMixedOutputs(installed, root),
		worktreePrepare: await runWorktreeFailure(
			installed,
			root,
			"worktree.prepare",
			"worktree_prepare_failed",
		),
		worktreeCleanup: await runWorktreeFailure(
			installed,
			root,
			"worktree.cleanup",
			"worktree_cleanup_failed",
		),
	};
	assert.deepEqual(results, {
		missingOutput: "worker_failed",
		malformedOutput: "worker_failed",
		blockedOutput: "worker_blocked",
		mixedOutputs: "worker_failed",
		worktreePrepare: "worktree_prepare_failed",
		worktreeCleanup: "worktree_cleanup_failed",
	});
	console.log(JSON.stringify({ ok: true, packageRoot: installed.packageRoot, results }, null, 2));
} finally {
	await rm(root, { recursive: true, force: true });
}
