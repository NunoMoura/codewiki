import type {
	LoopQualityRunnerSummary,
	LoopQualityStandardMethod,
	LoopQualityStandardResult,
} from "../traces/types.ts";
import {
	runLoopGraph,
	type LoopGraphRunnerReport,
	type LoopGraphRunnerNode,
} from "./runner.ts";
import {
	loopQualityJudgeCacheKey,
	loopQualityJudgeInputEvidenceHash,
	type LoopQualityJudge,
	type LoopQualityJudgeCache,
	type LoopQualityJudgeRequest,
	type LoopQualityJudgeResolution,
	type LoopQualityJudgeVerdict,
} from "./judge.ts";
import { uniqueStrings } from "./quality-standards.ts";
import {
	clampQualityScore,
	loopQualityGraphRef,
	loopQualityJudgeSpecForNode,
	loopQualityMethodForMode,
	loopQualityMethodUsesJudge,
	loopQualityScoreThresholdForNode,
	type LoopQualityGraph,
	type LoopQualityGraphNode,
} from "./graph.ts";
import {
	inactiveLoopQualityStandard,
	loopQualityProfileActivationForNode,
	loopQualityProfileNodeIsInactive,
	type LoopQualityProfile,
} from "./quality-profile.ts";

export interface EvaluateLoopQualityGraphOptions<TIssue, TCode extends string> {
	graph: LoopQualityGraph<TCode>;
	issues: TIssue[];
	issueCode: (issue: TIssue) => TCode;
	issueMessage: (issue: TIssue) => string;
	issueRefs: (issue: TIssue) => string[];
	isBlockingIssue?: (issue: TIssue) => boolean;
	nodes?: LoopQualityGraphNode<TCode>[];
	evidenceRefs?: (node: LoopQualityGraphNode<TCode>) => string[] | undefined;
	profile?: LoopQualityProfile;
}

export interface LoopQualityJudgeExecutionOptions {
	judge?: LoopQualityJudge;
	judgeCache?: LoopQualityJudgeCache;
	judgeMethods?: (LoopQualityStandardMethod | string)[];
	judgeInput?: unknown;
}

export interface RunLoopQualityGraphOptions<TIssue, TCode extends string>
	extends EvaluateLoopQualityGraphOptions<TIssue, TCode>,
		LoopQualityJudgeExecutionOptions {
	failFastHardGates?: boolean;
}

interface ResolvedRunLoopQualityGraphOptions<TIssue, TCode extends string>
	extends RunLoopQualityGraphOptions<TIssue, TCode> {
	judgeResolutions?: Map<string, LoopQualityJudgeResolution>;
}

export interface RunLoopQualityGraphResult {
	standards: LoopQualityStandardResult[];
	runner: LoopGraphRunnerReport;
}

export function loopQualityRunnerSummary(
	runner: LoopGraphRunnerReport,
): LoopQualityRunnerSummary {
	return {
		graphId: runner.graphId,
		graphVersion: runner.graphVersion,
		status: runner.status,
		latencyMs: runner.latencyMs,
		nodes: runner.nodes.map((node) => ({
			id: node.id,
			method: node.method,
			gate: node.gate,
			cost: node.cost,
			status: node.status,
			latencyMs: node.latencyMs,
			...(node.score === undefined ? {} : { score: node.score }),
			...(node.judge ? { judge: node.judge } : {}),
			...(node.skippedBy ? { skippedBy: node.skippedBy } : {}),
		})),
	};
}

export function evaluateLoopQualityGraph<TIssue, TCode extends string>(
	options: EvaluateLoopQualityGraphOptions<TIssue, TCode>,
): LoopQualityStandardResult[] {
	const graphRef = loopQualityGraphRef(options.graph);
	return (options.nodes || options.graph.nodes).map((node) => {
		const activation = loopQualityProfileActivationForNode(
			options.profile,
			node,
		);
		if (activation && loopQualityProfileNodeIsInactive(activation)) {
			return inactiveLoopQualityStandard({
				node,
				activation,
				graphId: graphRef.id,
				graphVersion: graphRef.version,
				graphHash: graphRef.hash,
			});
		}
		const matched = options.issues.filter((issue) =>
			node.codes.includes(options.issueCode(issue)),
		);
		const status = qualityStatus({
			matched,
			isBlockingIssue: options.isBlockingIssue,
		});
		const evidenceRefs = options.evidenceRefs?.(node) || node.evidenceRefs;
		const gate =
			node.gate ||
			(node.hardGate || node.layer === "hard_gate" ? "hard" : "soft");
		const method = node.method || loopQualityMethodForMode(node.mode);
		const score = deterministicQualityScore({
			matchedIssueCount: matched.length,
			matchedCodeCount: uniqueStrings(
				matched.map((issue) => options.issueCode(issue)),
			).length,
			status,
			totalCodeCount: node.codes.length,
		});
		const scoreThreshold = loopQualityScoreThresholdForNode(node);
		return {
			id: node.id,
			status,
			mode: node.mode || "deterministic",
			weight: node.weight,
			description: node.description,
			graphId: graphRef.id,
			graphVersion: graphRef.version,
			graphHash: graphRef.hash,
			layer: node.layer,
			standardType: node.standardType,
			method,
			cost: node.cost,
			gate,
			...(node.timeoutMs ? { timeoutMs: node.timeoutMs } : {}),
			score,
			scoreThreshold,
			repairTarget: node.repairTarget,
			...(matched.length > 0
				? { message: matched.map(options.issueMessage).join(" ") }
				: {}),
			...(matched.length > 0
				? { refs: uniqueStrings(matched.flatMap(options.issueRefs)) }
				: {}),
			...(evidenceRefs && evidenceRefs.length > 0
				? { evidenceRefs: uniqueStrings(evidenceRefs) }
				: {}),
		};
	});
}

export async function runLoopQualityGraphEvaluation<
	TIssue,
	TCode extends string,
>(
	options: RunLoopQualityGraphOptions<TIssue, TCode>,
): Promise<RunLoopQualityGraphResult> {
	const nodes = options.nodes || options.graph.nodes;
	const judgeResolutions = await resolveLoopQualityJudgeResults({
		...options,
		nodes,
	});
	const context: ResolvedRunLoopQualityGraphOptions<TIssue, TCode> = {
		...options,
		nodes,
		...(judgeResolutions ? { judgeResolutions } : {}),
	};
	const activeNodeIds = new Set(nodes.map((node) => node.id));
	const runner = await runLoopGraph({
		graphId: options.graph.graphId,
		graphVersion: options.graph.graphVersion,
		context,
		failFastHardGates: options.failFastHardGates ?? false,
		nodes: nodes.map((node) =>
			runnerNodeForStandard<TIssue, TCode>(node, activeNodeIds),
		),
	});
	return {
		standards: runner.nodes.map(
			(report) =>
				report.standard || standardFromRunnerReport(report, options.graph),
		),
		runner,
	};
}

function runnerNodeForStandard<TIssue, TCode extends string>(
	node: LoopQualityGraphNode<TCode>,
	activeNodeIds: ReadonlySet<string>,
): LoopGraphRunnerNode<ResolvedRunLoopQualityGraphOptions<TIssue, TCode>> {
	const gate =
		node.gate ||
		(node.hardGate || node.layer === "hard_gate" ? "hard" : "soft");
	return {
		id: node.id,
		description: node.description,
		method: node.method || loopQualityMethodForMode(node.mode),
		gate,
		cost: node.cost,
		...(node.timeoutMs ? { timeoutMs: node.timeoutMs } : {}),
		...(node.dependsOn
			? {
					dependsOn: node.dependsOn.filter((dependency) =>
						activeNodeIds.has(dependency),
					),
				}
			: {}),
		repairTarget: node.repairTarget,
		run: (context) => {
			const localStandard = evaluateLoopQualityGraph({
				...context,
				nodes: [node],
			})[0];
			const judgeResolution = context.judgeResolutions?.get(node.id);
			const standard = judgeResolution
				? applyJudgeVerdict(localStandard, judgeResolution.verdict)
				: localStandard;
			return {
				status: standardStatusForRunner(standard),
				standard,
				score: standard.score,
				evidenceRefs: standard.evidenceRefs,
				...(judgeResolution ? { judge: judgeResolution.summary } : {}),
				diagnostics: standardStatusBlocks(standard.status)
					? [diagnosticFromStandard(standard, gate)]
					: [],
			};
		},
	};
}

async function resolveLoopQualityJudgeResults<TIssue, TCode extends string>(
	options: RunLoopQualityGraphOptions<TIssue, TCode> & {
		nodes: LoopQualityGraphNode<TCode>[];
	},
): Promise<Map<string, LoopQualityJudgeResolution> | undefined> {
	if (!options.judge) return undefined;
	const graphRef = loopQualityGraphRef(options.graph);
	const localStandards = evaluateLoopQualityGraph({
		...options,
		nodes: options.nodes,
	});
	if (hasFailedNonJudgeHardGate(options.nodes, localStandards)) {
		return undefined;
	}
	const judgeMethods = new Set(
		options.judgeMethods || ["agent_self_assessment", "model_judge"],
	);
	const resolutions = new Map<string, LoopQualityJudgeResolution>();
	const misses: LoopQualityJudgeRequest[] = [];
	for (const [index, node] of options.nodes.entries()) {
		const method = node.method || loopQualityMethodForMode(node.mode);
		const gate = node.gate || (node.hardGate ? "hard" : "soft");
		const standard = localStandards[index];
		if (!judgeMethods.has(method) || standard.status !== "met") continue;
		const judgeSpec = node.judge || loopQualityJudgeSpecForNode(node);
		const inputEvidenceHash = loopQualityJudgeInputEvidenceHash({
			node: { ...node, judge: judgeSpec } as LoopQualityGraphNode<string>,
			standard,
			judgeInput: options.judgeInput,
		});
		const cacheKey = loopQualityJudgeCacheKey({
			graphHash: graphRef.hash,
			promptVersion: options.judge.promptVersion,
			inputEvidenceHash,
		});
		const request: LoopQualityJudgeRequest = {
			cacheKey,
			promptVersion: options.judge.promptVersion,
			graphHash: graphRef.hash,
			graphId: graphRef.id,
			graphVersion: graphRef.version,
			standardId: node.id,
			method,
			gate,
			description: node.description,
			standard,
			inputEvidenceHash,
			judge: judgeSpec,
			judgeInput: options.judgeInput,
		};
		const cached = options.judgeCache?.get(cacheKey);
		if (cached) {
			resolutions.set(node.id, judgeResolution(request, cached, true));
		} else {
			misses.push(request);
		}
	}
	if (misses.length === 0)
		return resolutions.size > 0 ? resolutions : undefined;
	const verdicts = await callJudgeOnce(options.judge, misses);
	for (const request of misses) {
		const verdict =
			verdicts.find(
				(candidate) => candidate.standardId === request.standardId,
			) || judgeUnavailableVerdict(request);
		options.judgeCache?.set(request.cacheKey, verdict);
		resolutions.set(
			request.standardId,
			judgeResolution(request, verdict, false),
		);
	}
	return resolutions;
}

function hasFailedNonJudgeHardGate<TCode extends string>(
	nodes: LoopQualityGraphNode<TCode>[],
	standards: LoopQualityStandardResult[],
): boolean {
	return nodes.some((node, index) => {
		const method = node.method || loopQualityMethodForMode(node.mode);
		const gate = node.gate || (node.hardGate ? "hard" : "soft");
		return (
			gate === "hard" &&
			!loopQualityMethodUsesJudge(method) &&
			standardStatusBlocks(standards[index].status)
		);
	});
}

async function callJudgeOnce(
	judge: LoopQualityJudge,
	requests: LoopQualityJudgeRequest[],
): Promise<LoopQualityJudgeVerdict[]> {
	try {
		return await judge.judge(requests);
	} catch (error) {
		return requests.map((request) => ({
			standardId: request.standardId,
			status: "block",
			message:
				error instanceof Error
					? error.message
					: `Independent quality judge failed: ${String(error)}`,
			repair: "Repair the independent quality judge worker and retry.",
		}));
	}
}

function judgeUnavailableVerdict(
	request: LoopQualityJudgeRequest,
): LoopQualityJudgeVerdict {
	return {
		standardId: request.standardId,
		status: "block",
		message: `Independent quality judge did not return a verdict for ${request.standardId}.`,
		repair: "Repair the independent quality judge worker and retry.",
	};
}

function judgeResolution(
	request: LoopQualityJudgeRequest,
	verdict: LoopQualityJudgeVerdict,
	cached: boolean,
): LoopQualityJudgeResolution {
	return {
		request,
		verdict,
		summary: {
			status: verdict.status,
			promptVersion: request.promptVersion,
			cached,
			cacheKey: request.cacheKey,
			...(verdict.confidence === undefined
				? {}
				: { confidence: verdict.confidence }),
			...(verdict.score === undefined
				? {}
				: { score: clampQualityScore(verdict.score) }),
		},
	};
}

function applyJudgeVerdict(
	standard: LoopQualityStandardResult,
	verdict: LoopQualityJudgeVerdict,
): LoopQualityStandardResult {
	const score =
		verdict.score === undefined ? undefined : clampQualityScore(verdict.score);
	if (verdict.status === "pass") {
		if (score === undefined) {
			return {
				...standard,
				status: "blocked",
				score: 0,
				message: `Independent quality judge omitted required 0-100 score for ${standard.id}.`,
			};
		}
		if (score < (standard.scoreThreshold ?? 0)) {
			return {
				...standard,
				status: "unmet",
				score,
				message: `Independent quality judge score ${score} is below threshold ${standard.scoreThreshold ?? 0} for ${standard.id}.`,
				refs: uniqueStrings([
					...(standard.refs || []),
					...(verdict.refs || []),
				]),
			};
		}
		return { ...standard, score };
	}
	return {
		...standard,
		status: verdict.status === "block" ? "blocked" : "unmet",
		score: score ?? 0,
		message: verdict.message,
		refs: uniqueStrings([...(standard.refs || []), ...(verdict.refs || [])]),
	};
}

function deterministicQualityScore({
	matchedIssueCount,
	matchedCodeCount,
	status,
	totalCodeCount,
}: {
	matchedIssueCount: number;
	matchedCodeCount: number;
	status: LoopQualityStandardResult["status"];
	totalCodeCount: number;
}): number {
	if (status === "met") return 100;
	if (status === "not_applicable" || status === "escalated") return 0;
	if (status === "blocked") return 0;
	const codePenalty =
		totalCodeCount === 0 ? 100 : (matchedCodeCount / totalCodeCount) * 100;
	const repeatPenalty = Math.max(0, matchedIssueCount - matchedCodeCount) * 10;
	return clampQualityScore(100 - Math.min(100, codePenalty + repeatPenalty));
}

function standardStatusBlocks(
	status: LoopQualityStandardResult["status"],
): boolean {
	return status === "unmet" || status === "blocked";
}

function standardStatusForRunner(
	standard: LoopQualityStandardResult,
): "pass" | "fail" | "block" {
	if (
		standard.status === "met" ||
		standard.status === "not_applicable" ||
		standard.status === "escalated"
	) {
		return "pass";
	}
	if (standard.status === "blocked") return "block";
	return "fail";
}

function diagnosticFromStandard(
	standard: LoopQualityStandardResult,
	gate: string,
) {
	return {
		standardId: standard.id,
		severity:
			standard.status === "blocked" || gate === "hard"
				? ("blocking" as const)
				: ("warning" as const),
		message: standard.message || standard.description,
		refs: standard.refs || [],
		...(standard.score === undefined ? {} : { score: standard.score }),
		...(standard.scoreThreshold === undefined
			? {}
			: { scoreThreshold: standard.scoreThreshold }),
		repair: `Repair ${standard.id}: ${standard.description}`,
		repairTarget: standard.repairTarget,
	};
}

function standardFromRunnerReport(
	report: LoopGraphRunnerReport["nodes"][number],
	graph: LoopQualityGraph<string>,
): LoopQualityStandardResult {
	const graphRef = loopQualityGraphRef(graph);
	return {
		id: report.id,
		status: report.status === "pass" ? "met" : "blocked",
		mode: "deterministic",
		description: report.diagnostics?.[0]?.message || report.id,
		graphId: graphRef.id,
		graphVersion: graphRef.version,
		graphHash: graphRef.hash,
		method: report.method,
		gate: report.gate,
		cost: report.cost,
		...(report.score === undefined ? {} : { score: report.score }),
		repairTarget: report.repairTarget,
		message: report.diagnostics?.[0]?.message,
		refs: report.diagnostics?.flatMap((diagnostic) => diagnostic.refs),
	};
}

function qualityStatus<TIssue>({
	matched,
	isBlockingIssue,
}: {
	matched: TIssue[];
	isBlockingIssue?: (issue: TIssue) => boolean;
}): LoopQualityStandardResult["status"] {
	if (matched.length === 0) return "met";
	if (matched.some((issue) => isBlockingIssue?.(issue) || false)) {
		return "blocked";
	}
	return "unmet";
}

export type ExitQualityGraphOptions<
	TIssue,
	TCode extends string,
> = EvaluateLoopQualityGraphOptions<TIssue, TCode>;
export const evaluateExitQualityGraph = evaluateLoopQualityGraph;
