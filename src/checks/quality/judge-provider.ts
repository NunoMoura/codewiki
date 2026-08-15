import { loadWikiConfigFile } from "../../project/config-file.ts";
import type { WikiConfig } from "../../project/config.ts";
import {
	LOOP_QUALITY_JUDGE_PROMPT_VERSION,
	buildLoopQualityJudgeBatchPrompt,
	buildLoopQualityJudgePrompt,
} from "./judge-prompts.ts";
import {
	MemoryLoopQualityJudgeCache,
	type LoopQualityJudge,
	type LoopQualityJudgeCache,
	type LoopQualityJudgeRequest,
	type LoopQualityJudgeVerdict,
} from "./judge.ts";
import type { LoopQualityJudgeExecutionOptions } from "./evaluator.ts";

export interface LoopQualityJudgeProviderConfig {
	enabled: boolean;
	provider: "none" | "http";
	endpoint?: string;
	promptVersion: string;
	timeoutMs: number;
}

export interface ResolveLoopQualityJudgeOptionsInput {
	repoRoot?: string;
	env?: NodeJS.ProcessEnv;
	config?: WikiConfig;
}

interface HttpJudgeOptions {
	endpoint: string;
	promptVersion: string;
	timeoutMs: number;
	fetchImpl?: typeof fetch;
}

const DEFAULT_JUDGE_TIMEOUT_MS = 30_000;
const globalJudgeCache = new MemoryLoopQualityJudgeCache();

export async function resolveLoopQualityJudgeExecutionOptions({
	repoRoot,
	env = process.env,
	config,
}: ResolveLoopQualityJudgeOptionsInput = {}): Promise<LoopQualityJudgeExecutionOptions> {
	const resolvedConfig =
		config || (repoRoot ? await loadWikiConfigFile(repoRoot) : undefined);
	const judgeConfig = resolveLoopQualityJudgeProviderConfig({
		config: resolvedConfig,
		env,
	});
	if (!judgeConfig.enabled || judgeConfig.provider === "none") return {};
	return {
		judge: createHttpLoopQualityJudge({
			endpoint: requiredEndpoint(judgeConfig),
			promptVersion: judgeConfig.promptVersion,
			timeoutMs: judgeConfig.timeoutMs,
		}),
		judgeCache: globalJudgeCache,
	};
}

export function resolveLoopQualityJudgeProviderConfig({
	config,
	env = process.env,
}: {
	config?: WikiConfig;
	env?: NodeJS.ProcessEnv;
} = {}): LoopQualityJudgeProviderConfig {
	const configJudge = config?.quality.judge;
	const endpoint =
		text(env.CODEWIKI_LOOP_QUALITY_JUDGE_URL) || configJudge?.endpoint;
	const promptVersion =
		text(env.CODEWIKI_LOOP_QUALITY_JUDGE_PROMPT_VERSION) ||
		configJudge?.promptVersion ||
		LOOP_QUALITY_JUDGE_PROMPT_VERSION;
	const timeoutMs =
		positiveInteger(env.CODEWIKI_LOOP_QUALITY_JUDGE_TIMEOUT_MS) ||
		configJudge?.timeoutMs ||
		DEFAULT_JUDGE_TIMEOUT_MS;
	const enabled =
		truthy(env.CODEWIKI_LOOP_QUALITY_JUDGE_ENABLED) ||
		Boolean(endpoint) ||
		Boolean(configJudge?.enabled);
	const provider =
		endpoint || configJudge?.provider === "http" ? "http" : "none";
	return {
		enabled,
		provider,
		...(endpoint ? { endpoint } : {}),
		promptVersion,
		timeoutMs,
	};
}

export function createHttpLoopQualityJudge({
	endpoint,
	promptVersion,
	timeoutMs,
	fetchImpl = fetch,
}: HttpJudgeOptions): LoopQualityJudge {
	return {
		promptVersion,
		async judge(requests) {
			if (requests.length === 0) return [];
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), timeoutMs);
			try {
				const response = await fetchImpl(endpoint, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						promptVersion,
						prompt: buildLoopQualityJudgeBatchPrompt(requests),
						requests: requests.map(judgeRequestPayload),
					}),
					signal: controller.signal,
				});
				if (!response.ok) {
					throw new Error(
						`Loop quality judge returned HTTP ${response.status}.`,
					);
				}
				const payload = (await response.json()) as unknown;
				return normalizeJudgeVerdicts(payload);
			} finally {
				clearTimeout(timeout);
			}
		},
	};
}

function judgeRequestPayload(request: LoopQualityJudgeRequest) {
	return {
		...request,
		prompt: buildLoopQualityJudgePrompt(request),
	};
}

function normalizeJudgeVerdicts(payload: unknown): LoopQualityJudgeVerdict[] {
	const verdicts = Array.isArray(payload)
		? payload
		: Array.isArray((payload as { verdicts?: unknown })?.verdicts)
			? (payload as { verdicts: unknown[] }).verdicts
			: [];
	return verdicts.map((entry) => {
		const record = entry as Record<string, unknown>;
		const status = String(record.status || "block");
		const normalizedStatus =
			status === "pass" || status === "fail" || status === "block"
				? status
				: status === "uncertain"
					? "fail"
					: "block";
		return {
			standardId: String(record.standardId || ""),
			status: normalizedStatus,
			message: String(
				record.message ||
					(status === "uncertain"
						? "Independent quality judge was uncertain."
						: "Independent quality judge returned no message."),
			),
			...(Array.isArray(record.refs)
				? { refs: record.refs.map((ref) => String(ref)).filter(Boolean) }
				: {}),
			...(typeof record.repair === "string" ? { repair: record.repair } : {}),
			...(typeof record.confidence === "number"
				? { confidence: record.confidence }
				: {}),
			...(typeof record.score === "number"
				? { score: clampScore(record.score) }
				: {}),
		} satisfies LoopQualityJudgeVerdict;
	});
}

function clampScore(score: number): number {
	if (!Number.isFinite(score)) return 0;
	return Math.max(0, Math.min(100, Math.round(score)));
}

function requiredEndpoint(config: LoopQualityJudgeProviderConfig): string {
	if (!config.endpoint) {
		throw new Error("Loop quality judge provider http requires an endpoint.");
	}
	return config.endpoint;
}

function text(value: unknown): string | undefined {
	const trimmed = String(value || "").trim();
	return trimmed || undefined;
}

function truthy(value: unknown): boolean {
	return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function positiveInteger(value: unknown): number | undefined {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export type { LoopQualityJudge, LoopQualityJudgeCache };
