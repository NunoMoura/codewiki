import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { runWikiDecide } from "../../../src/decision/command.ts";
import { changeTraceId } from "../../../src/changes/trace/change-record.ts";
import { changeContentDigest } from "../../../src/changes/digest.ts";
import { traceFilePath } from "../../../src/changes/trace/schema.ts";
import { buildProjectWorkState } from "../../../src/work-state/project.ts";
import {
	LOOP_QUALITY_JUDGE_PROMPT_VERSION,
	buildLoopQualityJudgePrompt,
} from "../../../src/verification/quality/judge-prompts.ts";
import { resolveLoopQualityJudgeProviderConfig } from "../../../src/verification/quality/judge-provider.ts";
import { seedChangeAcceptance } from "../../helpers/accepted-change.mjs";

const ENV_KEYS = [
	"CODEWIKI_LOOP_QUALITY_JUDGE_URL",
	"CODEWIKI_LOOP_QUALITY_JUDGE_PROMPT_VERSION",
	"CODEWIKI_LOOP_QUALITY_JUDGE_TIMEOUT_MS",
	"CODEWIKI_LOOP_QUALITY_JUDGE_ENABLED",
];

const originalEnv = Object.fromEntries(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
	for (const key of ENV_KEYS) {
		if (originalEnv[key] === undefined) delete process.env[key];
		else process.env[key] = originalEnv[key];
	}
});

async function withJudgeServer(handler, run) {
	const calls = [];
	const server = createServer((request, response) => {
		let body = "";
		request.setEncoding("utf8");
		request.on("data", (chunk) => {
			body += chunk;
		});
		request.on("end", () => {
			let payload;
			try {
				payload = JSON.parse(body || "{}");
			} catch {
				response.writeHead(400, { "content-type": "application/json" });
				response.end(JSON.stringify({ error: "invalid JSON" }));
				return;
			}
			calls.push(payload);
			const result = handler(payload);
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify(result));
		});
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const address = server.address();
		const endpoint = `http://127.0.0.1:${address.port}/judge`;
		return await run({ endpoint, calls });
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
}

describe("loop quality judge provider", () => {
	it("is disabled unless config or env opts in", () => {
		for (const key of ENV_KEYS) delete process.env[key];
		const config = resolveLoopQualityJudgeProviderConfig({ env: process.env });

		assert.equal(config.enabled, false);
		assert.equal(config.provider, "none");
		assert.equal(config.promptVersion, LOOP_QUALITY_JUDGE_PROMPT_VERSION);
	});

	it("resolves http judge config from env", () => {
		process.env.CODEWIKI_LOOP_QUALITY_JUDGE_URL = "http://127.0.0.1:9/judge";
		process.env.CODEWIKI_LOOP_QUALITY_JUDGE_PROMPT_VERSION = "judge.test.v1";
		process.env.CODEWIKI_LOOP_QUALITY_JUDGE_TIMEOUT_MS = "1234";

		const config = resolveLoopQualityJudgeProviderConfig({ env: process.env });

		assert.equal(config.enabled, true);
		assert.equal(config.provider, "http");
		assert.equal(config.endpoint, "http://127.0.0.1:9/judge");
		assert.equal(config.promptVersion, "judge.test.v1");
		assert.equal(config.timeoutMs, 1234);
	});

	it("builds versioned prompts for judge requests", () => {
		const prompt = buildLoopQualityJudgePrompt({
			cacheKey: "sha256:test",
			promptVersion: LOOP_QUALITY_JUDGE_PROMPT_VERSION,
			graphHash: "sha256:graph",
			graphId: "decision.loop",
			graphVersion: "test",
			standardId: "intention_validated",
			method: "agent_self_assessment",
			gate: "soft",
			description: "Agent assessment must be independently plausible.",
			standard: {
				id: "intention_validated",
				status: "met",
				mode: "agent",
				description: "Agent assessment present.",
			},
			inputEvidenceHash: "sha256:evidence",
			judge: {
				id: "intention_validated.judge",
				role: "agent assessment judge",
				rubric: ["Judge one standard only."],
				scoreThreshold: 80,
			},
		});

		assert.match(prompt.system, /independent CodeWiki quality-network judge/);
		assert.match(prompt.system, /False pass/);
		assert.match(prompt.user, /intention_validated/);
		assert.match(prompt.user, /standards/);
		assert.match(prompt.user, /scoreThreshold/);
	});

	it("keeps exact Change approval deterministic without a judge transport call", async () => {
		await withJudgeServer(
			() => ({ verdicts: [] }),
			async ({ endpoint, calls }) => {
				process.env.CODEWIKI_LOOP_QUALITY_JUDGE_URL = endpoint;
				const root = await mkdtemp(join(tmpdir(), "codewiki-judge-provider-"));
				const { record } = await seedChangeAcceptance(root, {
					id: "CHG-judge-provider",
					currentState:
						"Decision approval could require a redundant judge call.",
					desiredState:
						"Exact Change evidence drives deterministic approval quality.",
					rationale:
						"Avoiding redundant judge calls reduces latency and token use.",
					sourceRefs: ["kb:system/components/loop-contracts.md"],
				});
				const workState = await buildProjectWorkState({ repoRoot: root });
				const result = await runWikiDecide({
					repoRoot: root,
					mode: "preview",
					changeId: record.change.id,
					expectedRevision: record.change.revision,
					expectedChangeDigest: changeContentDigest(record.change),
					expectedWorkStateDigest: workState.snapshotDigest,
					expectedBytes: (
						await stat(
							join(root, traceFilePath(changeTraceId(record.change.id))),
						)
					).size,
					disposition: "approve",
					rationale: "Approve exact validated Change revision.",
					authority: {
						kind: "user",
						actor: "user",
						ref: "approval:user:judge-provider",
					},
				});

				assert.equal(calls.length, 0);
				assert.equal(result.report.exit.status, "exit");
				await rm(root, { recursive: true, force: true });
			},
		);
	});
});
