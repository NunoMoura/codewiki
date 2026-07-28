import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	createPiSdkRuntimeSemanticAdapters,
	validatePiSdkReadOnlyToolCall,
} from "../../src/pi/sdk-semantic-session.ts";

function decisionInvocation(extra = {}) {
	return {
		loop: "decision",
		observedWorkStateDigest: "sha256:work-state",
		change: {
			id: "CHG-sdk-session",
			traceId: "TRACE-CHG-sdk-session",
			revision: 1,
			digest: "sha256:change",
			...extra,
		},
	};
}

function planningInvocation() {
	return {
		loop: "planning",
		observedWorkStateDigest: "sha256:work-state",
		changes: [decisionInvocation().change],
	};
}

test("Pi SDK semantic adapter runs one bounded role session and returns its candidate", async () => {
	const observations = [];
	const sessions = [];
	const candidate = {
		disposition: "defer",
		rationale: "Keep runtime authority outside session.",
	};
	const adapters = createPiSdkRuntimeSemanticAdapters({
		repoRoot: process.cwd(),
		onObservation: (observation) => observations.push(observation),
		sessionFactory: async (input) => {
			sessions.push(input);
			let disposed = false;
			return {
				sessionId: "pi-sdk:test-session",
				async prompt(prompt) {
					assert.match(prompt, /<codewiki_invocation>/);
					assert.match(prompt, /CHG-sdk-session/);
					input.submitCandidate(candidate);
				},
				dispose() {
					disposed = true;
					sessions.push({ disposed });
				},
			};
		},
	});

	assert.deepEqual(await adapters.decision(decisionInvocation()), candidate);
	assert.equal(sessions[0].role, "decision");
	assert.equal(
		sessions[0].candidateToolName,
		"codewiki_submit_decision_candidate",
	);
	assert.match(sessions[0].systemPrompt, /read-only|read, grep, find, and ls/i);
	assert.deepEqual(
		observations.map((entry) => entry.state),
		["starting", "running", "completed"],
	);
	assert.deepEqual(sessions.at(-1), { disposed: true });
});

test("default Pi SDK factory enables only read tools and one closed candidate tool", async () => {
	let sdkOptions;
	const adapters = createPiSdkRuntimeSemanticAdapters({
		repoRoot: process.cwd(),
		createAgentSession: async (options) => {
			sdkOptions = options;
			return {
				session: {
					sessionId: "pi-sdk:default-factory",
					async prompt() {
						const candidateTool = sdkOptions.customTools[0];
						await candidateTool.execute(
							"candidate-call",
							{
								candidate: {
									disposition: "defer",
									rationale: "Await trusted authority.",
								},
							},
							undefined,
							undefined,
							{},
						);
					},
					dispose() {},
				},
				extensionsResult: { extensions: [], errors: [], runtime: undefined },
			};
		},
	});

	assert.deepEqual(await adapters.decision(decisionInvocation()), {
		disposition: "defer",
		rationale: "Await trusted authority.",
	});
	assert.deepEqual(sdkOptions.tools, [
		"read",
		"grep",
		"find",
		"ls",
		"codewiki_submit_decision_candidate",
	]);
	assert.equal(sdkOptions.tools.includes("bash"), false);
	assert.equal(sdkOptions.tools.includes("edit"), false);
	assert.equal(sdkOptions.tools.includes("write"), false);
	assert.equal(sdkOptions.customTools.length, 1);
	assert.equal(
		sdkOptions.customTools[0].name,
		"codewiki_submit_decision_candidate",
	);
	assert.deepEqual(sdkOptions.resourceLoader.getSkills().skills, []);
	assert.deepEqual(sdkOptions.resourceLoader.getPrompts().prompts, []);
	assert.deepEqual(sdkOptions.resourceLoader.getAgentsFiles().agentsFiles, []);
});

test("Pi SDK semantic adapter maps implementation to a review role", async () => {
	let observedRole;
	const adapters = createPiSdkRuntimeSemanticAdapters({
		repoRoot: process.cwd(),
		sessionFactory: async (input) => ({
			async prompt() {
				observedRole = input.role;
				input.submitCandidate({ evidence: [] });
			},
			dispose() {},
		}),
	});

	assert.deepEqual(
		await adapters.implementation({
			loop: "implementation",
			observedWorkStateDigest: "sha256:work-state",
			sprint: { id: "SPR-sdk" },
			workItems: [],
			assignments: [],
			workerReports: [
				{
					workerId: "worker:sdk",
					workUnitId: "WU-sdk",
					status: "completed",
				},
			],
		}),
		{ evidence: [] },
	);
	assert.equal(observedRole, "implementation_review");
});

test("Pi SDK semantic adapter requires exactly one object candidate", async () => {
	const noCandidate = createPiSdkRuntimeSemanticAdapters({
		repoRoot: process.cwd(),
		sessionFactory: async () => ({
			async prompt() {},
			dispose() {},
		}),
	});
	await assert.rejects(
		noCandidate.planning(planningInvocation()),
		/did not submit exactly one candidate/,
	);

	const duplicate = createPiSdkRuntimeSemanticAdapters({
		repoRoot: process.cwd(),
		sessionFactory: async (input) => ({
			async prompt() {
				input.submitCandidate({ candidateId: "first" });
				input.submitCandidate({ candidateId: "second" });
			},
			dispose() {},
		}),
	});
	await assert.rejects(
		duplicate.decision(decisionInvocation()),
		/submitted more than one candidate/,
	);

	const nonObject = createPiSdkRuntimeSemanticAdapters({
		repoRoot: process.cwd(),
		sessionFactory: async (input) => ({
			async prompt() {
				input.submitCandidate(["not", "an", "object"]);
			},
			dispose() {},
		}),
	});
	await assert.rejects(
		nonObject.decision(decisionInvocation()),
		/candidate must be an object/,
	);

	const wrongRoleShape = createPiSdkRuntimeSemanticAdapters({
		repoRoot: process.cwd(),
		sessionFactory: async (input) => ({
			async prompt() {
				input.submitCandidate({ sprints: [], workItems: [] });
			},
			dispose() {},
		}),
	});
	await assert.rejects(
		wrongRoleShape.decision(decisionInvocation()),
		/Runtime decision candidate received unsupported fields: sprints, workItems/,
	);
});

test("Pi SDK semantic adapter fails closed on oversized invocation context", async () => {
	let started = false;
	const adapters = createPiSdkRuntimeSemanticAdapters({
		repoRoot: process.cwd(),
		maxInvocationBytes: 1_024,
		sessionFactory: async () => {
			started = true;
			throw new Error("must not start");
		},
	});

	await assert.rejects(
		adapters.decision(decisionInvocation({ description: "x".repeat(2_000) })),
		/exceeds 1024 bytes/,
	);
	assert.equal(started, false);
});

test("Pi SDK semantic adapter enforces its deadline when abort does not settle prompt", async () => {
	const observations = [];
	let aborts = 0;
	let disposals = 0;
	const adapters = createPiSdkRuntimeSemanticAdapters({
		repoRoot: process.cwd(),
		timeoutMs: 1_000,
		onObservation: (observation) => observations.push(observation),
		sessionFactory: async () => ({
			prompt: () => new Promise(() => undefined),
			abort() {
				aborts += 1;
			},
			dispose() {
				disposals += 1;
			},
		}),
	});
	const startedAt = Date.now();

	await assert.rejects(
		adapters.decision(decisionInvocation()),
		/exceeded 1000ms/,
	);
	assert.equal(Date.now() - startedAt < 5_000, true);
	assert.equal(aborts, 1);
	assert.equal(disposals, 1);
	assert.equal(observations.at(-1).state, "cancelled");
});

test("Pi SDK read-only tool guard contains paths and symlinks to project root", async () => {
	const base = await mkdtemp(join(tmpdir(), "codewiki-pi-sdk-boundary-"));
	const repoRoot = join(base, "repo");
	const outside = join(base, "outside.txt");
	await mkdir(repoRoot);
	await writeFile(join(repoRoot, "inside.txt"), "inside");
	await writeFile(outside, "outside");
	await symlink(outside, join(repoRoot, "outside-link"));

	try {
		assert.equal(
			await validatePiSdkReadOnlyToolCall(repoRoot, {
				toolName: "read",
				input: { path: "inside.txt" },
			}),
			undefined,
		);
		assert.match(
			await validatePiSdkReadOnlyToolCall(repoRoot, {
				toolName: "read",
				input: { path: outside },
			}),
			/outside the project root/,
		);
		assert.match(
			await validatePiSdkReadOnlyToolCall(repoRoot, {
				toolName: "read",
				input: { path: "outside-link" },
			}),
			/outside the project root/,
		);
		assert.match(
			await validatePiSdkReadOnlyToolCall(repoRoot, {
				toolName: "find",
				input: { path: ".", pattern: "../*" },
			}),
			/cannot traverse outside/,
		);
		assert.equal(
			await validatePiSdkReadOnlyToolCall(repoRoot, {
				toolName: "codewiki_submit_decision_candidate",
				input: { candidate: {} },
			}),
			undefined,
		);
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});
