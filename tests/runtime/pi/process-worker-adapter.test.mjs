import assert from "node:assert/strict";
import {
	access,
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {dirname, join} from "node:path";
import test from "node:test";

import {loadPackSkillSetSnapshot} from "../../../src/checks/packs/loader.ts";
import {bindProducerSkills} from "../../../src/runtime/contracts.ts";
import { createPiProcessImplementationWorkerAdapter } from "../../../src/runtime/pi/process-worker-adapter.ts";
import { IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION } from "../../../src/project-server/workers/implementation-adapter.ts";
import {producerSkills} from "../../helpers/checks.mjs";

function assignment(root) {
	return {
		schemaVersion: IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION,
		repoRoot: root,
		assignmentId: "assignment:process-worker",
		workerId: "worker:process-worker",
		workUnitId: "work:process-worker",
		claimId: "claim:process-worker",
		traceId: "TRACE-CHG-process-worker",
		planningRefs: ["trace:TRACE-CHG-process-worker#planning:1"],
		traceRefs: ["TRACE-CHG-process-worker"],
		componentRefs: ["component:runtime"],
		pathScopes: ["src/project-server/**"],
		workStateDigest: "sha256:work-state",
		sourceBaseRef: "git:base:abc123",
		contextDigest: "sha256:context",
		producerSkillReceipt: producerSkills().receipt,
		prompt: "Implement the assigned runtime change.",
		reportPath: join(
			root,
			".codewiki",
			"runtime",
			"workers",
			"process-worker.json",
		),
		isolation: { kind: "worktree", ref: "worktree:process-worker" },
		worktree: {
			path: join(root, ".codewiki", "runtime", "worktrees", "process-worker"),
			branch: "codewiki/process-worker",
			baseRef: "abc123",
		},
	};
}

async function installImplementationSkill(worktree) {
	const root = join(
		worktree,
		".codewiki",
		"check-packs",
		"implementation",
		"quality",
		"skill",
		"implementation-guide",
	);
	await mkdir(join(root, "scripts"), {recursive: true});
	await writeFile(
		join(root, "SKILL.md"),
		[
			"---",
			"name: implementation-guide",
			"description: Follow exact project implementation guidance.",
			"allowed-tools: Bash Write",
			"---",
			"Use scripts/check.sh before reporting completion.",
		].join("\n"),
		"utf8",
	);
	const script = join(root, "scripts", "check.sh");
	await writeFile(script, "#!/bin/sh\nprintf 'checked\\n'\n", "utf8");
	await chmod(script, 0o755);
	return root;
}

function workerReport() {
	return [
		"```codewiki-worker-report",
		JSON.stringify({
			status: "completed",
			workUnitRef:
				"trace:TRACE-CHG-process-worker#planning:1#work:process-worker",
			changedFiles: ["src/project-server/example.ts"],
			checksRun: ["node --test tests/project-server/example.test.mjs"],
			contentProofRefs: ["sha256:content"],
			residualRisks: [],
			blockers: [],
			notes: "Completed in isolated worktree.",
			changes: [],
			discoveries: [
				{
					summary: "Out-of-scope runtime discrepancy",
					observedBehavior: "A neighboring runtime path violates the documented invariant.",
					desiredBehavior: "Runtime paths preserve the documented invariant.",
					affectedRefs: ["src/project-server/neighbor.ts"],
					sourceRefs: ["trace:worker:discovery:1"],
					claimedCategory: "behavior",
					claimedSeverity: "medium",
					claimedConfidence: "high",
				},
			],
		}),
		"```",
	].join("\n");
}

test("Pi process worker adapter persists and recovers normalized Worker reports", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-process-worker-"));
	const input = assignment(root);
	await mkdir(input.worktree.path, { recursive: true });
	const implementationSkillRoot = await installImplementationSkill(
		input.worktree.path,
	);
	const skillSnapshot = await loadPackSkillSetSnapshot({
		repoRoot: input.worktree.path,
		stage: "implementation",
	});
	input.producerSkillReceipt = bindProducerSkills(
		skillSnapshot,
		"implementation",
	).receipt;
	let executions = 0;
	let materializedSkillPath;
	const adapter = createPiProcessImplementationWorkerAdapter({
		process: {
			async runner(command) {
				executions += 1;
				assert.equal(command.cwd, input.worktree.path);
				for (const flag of [
					"--no-extensions",
					"--no-skills",
					"--no-prompt-templates",
					"--no-themes",
					"--no-context-files",
				]) {
					assert.ok(command.args.includes(flag));
				}
				assert.equal(command.args.includes("--tools"), false);
				const skillIndex = command.args.indexOf("--skill");
				assert.ok(skillIndex >= 0);
				materializedSkillPath = command.args[skillIndex + 1];
				assert.match(
					await readFile(materializedSkillPath, "utf8"),
					/name: implementation-guide/,
				);
				assert.equal(command.args.filter((arg) => arg === "--skill").length, 1);
				assert.notEqual(
					(
						await stat(
							join(dirname(materializedSkillPath), "scripts", "check.sh"),
						)
					).mode & 0o111,
					0,
				);
				await mkdir(join(root, ".codewiki", "runtime", "workers"), {
					recursive: true,
				});
				await writeFile(command.outputFile, workerReport(), "utf8");
				return {
					pid: 4242,
					sessionId: "session:process-worker",
					outputFile: command.outputFile,
					exitCode: 0,
				};
			},
		},
	});
	try {
		const result = await adapter.execute(input, new AbortController().signal);
		assert.equal(result.status, "completed");
		assert.equal(result.pid, 4242);
		assert.equal(result.implementationEvidence?.workUnitId, input.workUnitId);
		assert.equal(result.discoveries?.length, 1);
		assert.equal(result.producerSkillReceipt?.stage, "implementation");
		assert.equal(result.producerSkillReceipt?.skills.length, 1);
		assert.equal(
			result.producerSkillReceipt?.skills[0].name,
			"implementation-guide",
		);
		await assert.rejects(access(materializedSkillPath));
		assert.equal(
			result.discoveries?.[0].summary,
			"Out-of-scope runtime discrepancy",
		);
		assert.match(result.reportRef, /^runtime-worker-report:[a-f0-9]{64}$/);
		assert.equal(executions, 1);
		await writeFile(
			join(implementationSkillRoot, "SKILL.md"),
			"---\nname: implementation-guide\ndescription: Changed guidance.\n---\nUse a changed process.\n",
			"utf8",
		);
		await assert.rejects(
			adapter.execute(input, new AbortController().signal),
			/does not match its execution binding/,
		);
		assert.equal(executions, 1);
		const persisted = JSON.parse(await readFile(input.reportPath, "utf8"));
		assert.equal(persisted.reportRef, result.reportRef);
		assert.equal(
			persisted.producerSkillReceipt.skillSetDigest,
			result.producerSkillReceipt?.skillSetDigest,
		);
		const recovered = await adapter.recover(input);
		assert.deepEqual(recovered, result);
		assert.equal(executions, 1);
		await writeFile(
			input.reportPath,
			JSON.stringify({ ...persisted, status: "blocked" }),
			"utf8",
		);
		await assert.rejects(
			adapter.recover(input),
			/report digest does not match/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Pi process worker adapter persists cancelled reports after start", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-process-worker-cancel-"));
	const input = assignment(root);
	await mkdir(input.worktree.path, { recursive: true });
	const started = Promise.withResolvers();
	const controller = new AbortController();
	const adapter = createPiProcessImplementationWorkerAdapter({
		process: {
			async runner(command) {
				started.resolve();
				await new Promise((resolve) =>
					command.signal.addEventListener("abort", resolve, { once: true }),
				);
				return {
					pid: 4343,
					outputFile: command.outputFile,
					exitCode: 1,
					signal: "SIGTERM",
					cancelled: true,
				};
			},
		},
	});
	try {
		const execution = adapter.execute(input, controller.signal);
		await started.promise;
		controller.abort();
		const report = await execution;
		assert.equal(report.status, "cancelled");
		assert.equal(report.implementationEvidence?.status, "cancelled");
		assert.match(report.error, /cancelled/i);
		assert.deepEqual(await adapter.recover(input), report);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Pi process worker adapter requires worktree isolation and runtime report paths", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-process-worker-guard-"));
	const base = assignment(root);
	const adapter = createPiProcessImplementationWorkerAdapter();
	try {
		await assert.rejects(
			adapter.execute(
				{ ...base, isolation: { kind: "container", ref: "container:test" } },
				new AbortController().signal,
			),
			/require explicit worktree isolation/,
		);
		await assert.rejects(
			adapter.recover({ ...base, reportPath: join(root, "outside.json") }),
			/must stay below \.codewiki\/runtime/,
		);
		const outside = join(root, "outside");
		await mkdir(join(root, ".codewiki", "runtime"), { recursive: true });
		await mkdir(outside, { recursive: true });
		await symlink(outside, join(root, ".codewiki", "runtime", "workers"));
		await assert.rejects(
			adapter.recover(base),
			/cannot traverse symbolic links/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
