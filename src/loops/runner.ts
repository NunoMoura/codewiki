import type {
	LoopQualityStandardGate,
	LoopQualityStandardMethod,
	LoopQualityStandardResult,
} from "../traces/types.ts";
import {
	assertValidLoopQualityGraph,
	type LoopQualityGraph,
	type LoopQualityGraphNode,
} from "./graph.ts";
import type { LoopQualityJudgeSummary } from "./judge.ts";
import {
	LOOP_QUALITY_PACK_EVALUATOR_IDS,
	LOOP_QUALITY_PACK_EVIDENCE_ADAPTER_IDS,
	type LoopQualityPack,
} from "./quality-pack.ts";

export type LoopGraphNodeStatus = "pass" | "fail" | "block" | "skip";
export type LoopGraphDiagnosticSeverity = "blocking" | "warning" | "info";

export interface LoopGraphDiagnostic {
	standardId: string;
	severity: LoopGraphDiagnosticSeverity;
	message: string;
	refs: string[];
	repair?: string;
	repairTarget?: string;
}

export interface LoopGraphNodeResult {
	status: LoopGraphNodeStatus;
	diagnostics?: LoopGraphDiagnostic[];
	evidenceRefs?: string[];
	score?: number;
	standard?: LoopQualityStandardResult;
	judge?: LoopQualityJudgeSummary;
}

export interface LoopGraphRunnerNode<TContext> {
	id: string;
	description: string;
	method: LoopQualityStandardMethod | string;
	gate: LoopQualityStandardGate | string;
	cost: number;
	timeoutMs?: number;
	dependsOn?: string[];
	repairTarget?: string;
	run: (
		context: TContext,
	) => LoopGraphNodeResult | Promise<LoopGraphNodeResult>;
}

export interface LoopGraphRunnerOptions<TContext> {
	graphId: string;
	graphVersion: string;
	nodes: LoopGraphRunnerNode<TContext>[];
	context: TContext;
	failFastHardGates?: boolean;
}

export interface LoopGraphRunnerNodeReport extends LoopGraphNodeResult {
	id: string;
	method: string;
	gate: string;
	cost: number;
	latencyMs: number;
	repairTarget?: string;
	skippedBy?: string;
}

export interface LoopGraphRunnerReport {
	graphId: string;
	graphVersion: string;
	status: Exclude<LoopGraphNodeStatus, "skip">;
	latencyMs: number;
	nodes: LoopGraphRunnerNodeReport[];
	diagnostics: LoopGraphDiagnostic[];
}

export interface LoopQualityPackRuntimeRegistry {
	evaluatorIds: readonly string[];
	evidenceAdapterIds: readonly string[];
}

export interface ComposeLoopQualityPacksOptions {
	packs: readonly LoopQualityPack[];
	registry?: LoopQualityPackRuntimeRegistry;
}

export interface LoopQualityPackComposition {
	graph: LoopQualityGraph<string>;
	packIds: string[];
}

export const CODEWIKI_QUALITY_PACK_RUNTIME_REGISTRY: LoopQualityPackRuntimeRegistry =
	{
		evaluatorIds: LOOP_QUALITY_PACK_EVALUATOR_IDS,
		evidenceAdapterIds: LOOP_QUALITY_PACK_EVIDENCE_ADAPTER_IDS,
	};

export function composeLoopQualityPacks({
	packs,
	registry = CODEWIKI_QUALITY_PACK_RUNTIME_REGISTRY,
}: ComposeLoopQualityPacksOptions): LoopQualityPackComposition {
	if (packs.length === 0) {
		throw new Error("Quality-pack composition requires at least one pack.");
	}
	const ordered = [...packs].sort((left, right) =>
		left.id.localeCompare(right.id),
	);
	assertUniquePackIds(ordered);
	const graphIds = new Set(ordered.map((pack) => pack.graph.graphId));
	if (graphIds.size !== 1) {
		throw new Error(
			`Quality packs target different graphs: ${[...graphIds].join(", ")}.`,
		);
	}
	const evaluatorIds = new Set(registry.evaluatorIds);
	const evidenceAdapterIds = new Set(registry.evidenceAdapterIds);
	const nodes: LoopQualityGraphNode<string>[] = ordered.flatMap((pack) =>
		pack.standards.map((standard) => {
			if (!evaluatorIds.has(standard.evaluatorId)) {
				throw new Error(
					`Quality pack ${pack.id} standard ${standard.id} evaluator ${standard.evaluatorId} is not registered.`,
				);
			}
			for (const adapterId of standard.evidenceAdapterIds) {
				if (!evidenceAdapterIds.has(adapterId)) {
					throw new Error(
						`Quality pack ${pack.id} standard ${standard.id} evidence adapter ${adapterId} is not registered.`,
					);
				}
			}
			const { issuePredicate: _issuePredicate, ...node } = standard;
			return {
				...node,
				packId: pack.id,
				rollout: pack.rollout,
			};
		}),
	);
	const graph: LoopQualityGraph<string> = {
		graphId: ordered[0].graph.graphId,
		graphVersion: ordered
			.map(
				(pack) =>
					`${pack.id}@${pack.version}:${pack.graph.graphVersion}`,
			)
			.join("+"),
		schemaVersion: ordered[0].graph.schemaVersion,
		layers: [...new Set(ordered.flatMap((pack) => pack.graph.layers))],
		nodes,
	};
	assertValidLoopQualityGraph(graph);
	return { graph, packIds: ordered.map((pack) => pack.id) };
}

export async function runLoopGraph<TContext>({
	graphId,
	graphVersion,
	nodes,
	context,
	failFastHardGates = true,
}: LoopGraphRunnerOptions<TContext>): Promise<LoopGraphRunnerReport> {
	assertUniqueNodeIds(nodes);
	const startedAt = Date.now();
	const pending = new Map(nodes.map((node) => [node.id, node]));
	const reports = new Map<string, LoopGraphRunnerNodeReport>();

	while (pending.size > 0) {
		const ready = [...pending.values()].filter((node) =>
			(node.dependsOn || []).every((dependency) => reports.has(dependency)),
		);
		if (ready.length === 0) {
			throw new Error(
				"Loop graph contains a dependency cycle or unknown dependency.",
			);
		}

		const skipped = ready.filter((node) =>
			(node.dependsOn || []).some((dependency) =>
				isFailedHardGate(reports.get(dependency)),
			),
		);
		for (const node of skipped) {
			const blocker = (node.dependsOn || []).find((dependency) =>
				isFailedHardGate(reports.get(dependency)),
			);
			pending.delete(node.id);
			reports.set(node.id, skippedReport(node, blocker || "hard_gate"));
		}

		const runnable = ready.filter((node) => !reports.has(node.id));
		const layerReports = await Promise.all(
			runnable.map((node) => runNode(node, context)),
		);
		for (const report of layerReports) {
			pending.delete(report.id);
			reports.set(report.id, report);
		}

		if (
			failFastHardGates &&
			layerReports.some((report) => isFailedHardGate(report))
		) {
			for (const node of pending.values()) {
				reports.set(node.id, skippedReport(node, "hard_gate"));
			}
			pending.clear();
		}
	}

	const nodeReports = [...reports.values()];
	const diagnostics = nodeReports.flatMap((report) => report.diagnostics || []);
	return {
		graphId,
		graphVersion,
		status: graphStatus(nodeReports),
		latencyMs: Date.now() - startedAt,
		nodes: nodeReports,
		diagnostics,
	};
}

async function runNode<TContext>(
	node: LoopGraphRunnerNode<TContext>,
	context: TContext,
): Promise<LoopGraphRunnerNodeReport> {
	const startedAt = Date.now();
	try {
		const result = await withTimeout(
			Promise.resolve().then(() => node.run(context)),
			node.timeoutMs,
			node.id,
		);
		return {
			id: node.id,
			method: node.method,
			gate: node.gate,
			cost: node.cost,
			latencyMs: Date.now() - startedAt,
			repairTarget: node.repairTarget,
			...result,
		};
	} catch (error) {
		return {
			id: node.id,
			method: node.method,
			gate: node.gate,
			cost: node.cost,
			latencyMs: Date.now() - startedAt,
			repairTarget: node.repairTarget,
			status: "block",
			diagnostics: [
				{
					standardId: node.id,
					severity: "blocking",
					message: error instanceof Error ? error.message : String(error),
					refs: [],
					repair:
						"Fix the standard runner or reduce the submitted loop input before retrying.",
					repairTarget: node.repairTarget,
				},
			],
		};
	}
}

function skippedReport<TContext>(
	node: LoopGraphRunnerNode<TContext>,
	skippedBy: string,
): LoopGraphRunnerNodeReport {
	return {
		id: node.id,
		method: node.method,
		gate: node.gate,
		cost: node.cost,
		latencyMs: 0,
		repairTarget: node.repairTarget,
		status: "skip",
		skippedBy,
	};
}

function isFailedHardGate(
	report: LoopGraphRunnerNodeReport | undefined,
): boolean {
	return Boolean(
		report &&
			report.gate === "hard" &&
			(report.status === "fail" || report.status === "block"),
	);
}

function graphStatus(
	reports: LoopGraphRunnerNodeReport[],
): Exclude<LoopGraphNodeStatus, "skip"> {
	if (reports.some((report) => report.status === "block")) return "block";
	if (reports.some((report) => report.status === "fail")) return "fail";
	return "pass";
}

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number | undefined,
	standardId: string,
): Promise<T> {
	if (!timeoutMs) return promise;
	let timeout: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error(`Loop standard ${standardId} timed out.`)),
					timeoutMs,
				);
				timeout.unref();
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

function assertUniquePackIds(packs: readonly LoopQualityPack[]): void {
	const seen = new Set<string>();
	for (const pack of packs) {
		if (seen.has(pack.id)) {
			throw new Error(`Quality-pack composition has duplicate pack id ${pack.id}.`);
		}
		seen.add(pack.id);
	}
}

function assertUniqueNodeIds<TContext>(
	nodes: LoopGraphRunnerNode<TContext>[],
): void {
	const seen = new Set<string>();
	for (const node of nodes) {
		if (seen.has(node.id))
			throw new Error(`Duplicate loop graph node ${node.id}.`);
		seen.add(node.id);
		for (const dependency of node.dependsOn || []) {
			if (!nodes.some((candidate) => candidate.id === dependency)) {
				throw new Error(
					`Loop graph node ${node.id} depends on unknown node ${dependency}.`,
				);
			}
		}
	}
}
