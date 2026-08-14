import { DECISION_CHANGE_QUALITY_STANDARDS } from "../decision/change-quality.ts";
import { IMPLEMENTATION_LOOP_GRAPH } from "../implementation/loop.ts";
import { implementationQualityStandards } from "../implementation/quality-standards.ts";
import { PLANNING_PORTFOLIO_QUALITY_STANDARDS } from "../planning/portfolio-quality.ts";
import type { LoopQualityGraphNode } from "../verification/quality/graph.ts";
import { loopOutputEvents } from "../changes/trace/queries.ts";
import type {
	LoopQualityStandardResult,
	TraceEvent,
	TraceLoop,
	TraceRecord,
} from "../changes/trace/types.ts";
import type {
	BlockerView,
	LoopQualitySummary,
	QualityIterationSummary,
	QualityStandardSummary,
	QualityView,
	TraceViewInput,
} from "./projection-types.ts";

interface QualityStandardGraphMetadata {
	layer?: string;
	standardType?: string;
	gate?: string;
	scoreThreshold?: number;
}

const QUALITY_GRAPH_METADATA_BY_LOOP = {
	decision: new Map<string, QualityStandardGraphMetadata>(),
	planning: new Map<string, QualityStandardGraphMetadata>(),
	implementation: qualityGraphMetadataById(IMPLEMENTATION_LOOP_GRAPH.nodes),
} satisfies Record<TraceLoop, Map<string, QualityStandardGraphMetadata>>;

const CURRENT_DECISION_STANDARDS = currentStandards(
	DECISION_CHANGE_QUALITY_STANDARDS,
);
const CURRENT_PLANNING_STANDARDS = currentStandards(
	PLANNING_PORTFOLIO_QUALITY_STANDARDS,
);

const REQUIRED_QUALITY_STANDARDS: Record<TraceLoop, QualityStandardSummary[]> =
	{
		decision: CURRENT_DECISION_STANDARDS,
		planning: CURRENT_PLANNING_STANDARDS,
		implementation: normalizeStandards(
			implementationQualityStandards([]),
			QUALITY_GRAPH_METADATA_BY_LOOP.implementation,
		),
	};

function currentStandards(
	definitions: Array<{
		id: string;
		description: string;
		mode: LoopQualityStandardResult["mode"];
	}>,
): QualityStandardSummary[] {
	return definitions.map((definition) => ({
		id: definition.id,
		status: "missing",
		mode: definition.mode,
		description: definition.description,
		gate: "hard",
		scoreThreshold: 100,
		refs: [],
	}));
}

function requiredStandards(
	_event: TraceEvent,
	loop: TraceLoop,
): QualityStandardSummary[] {
	return REQUIRED_QUALITY_STANDARDS[loop];
}

export interface LoopQualityReadiness {
	loop: TraceLoop;
	traceId: string;
	eventId: string;
	exitStatus: string;
	ready: boolean;
	standards: QualityStandardSummary[];
	blockers: string[];
	refs: string[];
	sourceEventId: string;
}

export function buildQualityView(input: TraceViewInput): QualityView {
	const iterations = qualityIterationsFromTrace(input.records);
	return {
		generatedAt: input.generatedAt,
		traceId: input.records[0]?.traceId,
		summary: qualitySummary(iterations),
		iterations,
		blockers: unique(iterations.flatMap((iteration) => iteration.blockers)),
	};
}

export function qualityIterationsFromTrace(
	records: TraceRecord[],
): QualityIterationSummary[] {
	return loopIterationEvents(records).map((event) => {
		const readiness = loopQualityReadiness(event);
		return {
			loop: readiness.loop,
			traceId: readiness.traceId,
			eventId: readiness.eventId,
			exitStatus: readiness.exitStatus,
			ready: readiness.ready,
			standards: readiness.standards,
			blockers: readiness.blockers,
			refs: readiness.refs,
			sourceEventId: readiness.sourceEventId,
		};
	});
}

export function loopIterationQualityComplete(event: TraceEvent): boolean {
	return (
		text(objectRecord(event.data?.exit).status) === "exit" &&
		loopQualityReadiness(event).ready
	);
}

export function planningIterationClaimable(event: TraceEvent): boolean {
	return event.loop === "planning" && loopIterationQualityComplete(event);
}

export function loopQualityReadiness(event: TraceEvent): LoopQualityReadiness {
	const loop = semanticLoop(event);
	const provided = qualityStandardsFromEvent(event);
	const byId = new Map(provided.map((standard) => [standard.id, standard]));
	const required = requiredStandards(event, loop).map((requiredStandard) => {
		const standard = byId.get(requiredStandard.id);
		if (!standard) {
			return {
				id: requiredStandard.id,
				status: "missing" as const,
				mode: requiredStandard.mode,
				weight: requiredStandard.weight,
				description: requiredStandard.description,
				standardType: requiredStandard.standardType,
				layer: requiredStandard.layer,
				gate: requiredStandard.gate,
				score: requiredStandard.score,
				scoreThreshold: requiredStandard.scoreThreshold,
				message: `${loop} quality standard ${requiredStandard.id} is missing.`,
				refs: [event.id],
			};
		}
		return mergeRequiredQualityMetadata(requiredStandard, standard);
	});
	const requiredIds = new Set(required.map((standard) => standard.id));
	const extras = provided.filter((standard) => !requiredIds.has(standard.id));
	const standards = [...required, ...extras];
	const unmet = standards.filter((standard) =>
		qualityStatusBlocks(standard.status),
	);
	return {
		loop,
		traceId: event.traceId,
		eventId: event.id,
		exitStatus: text(objectRecord(event.data?.exit).status),
		ready: unmet.length === 0,
		standards,
		blockers: unmet.map((standard) => standardBlockerMessage(event, standard)),
		refs: unique([
			event.id,
			...event.refs,
			...unmet.flatMap((standard) => standard.refs),
		]),
		sourceEventId: event.id,
	};
}

export function qualityBlockersFromTrace(
	records: TraceRecord[],
): BlockerView[] {
	return loopIterationEvents(records).flatMap((event) => {
		if (supersededByLaterLoopIteration(event, records)) return [];
		const readiness = loopQualityReadiness(event);
		if (readiness.ready) return [];
		return [
			{
				id: `${event.id}:quality`,
				ownerRef: readiness.loop,
				routeBack: readiness.loop,
				kind: "exit" as const,
				message: readiness.blockers.join(" "),
				traceRefs: readiness.refs,
				sourceEventId: event.id,
			},
		];
	});
}

function supersededByLaterLoopIteration(
	event: TraceEvent,
	records: TraceRecord[],
): boolean {
	return records.some(
		(record) =>
			record.type === "trace_event" &&
			record.traceId === event.traceId &&
			record.loop === event.loop &&
			record.sequence > event.sequence,
	);
}

function loopIterationEvents(records: TraceRecord[]): TraceEvent[] {
	return [
		...loopOutputEvents(records, "decision"),
		...loopOutputEvents(records, "planning"),
		...loopOutputEvents(records, "implementation"),
	].sort((left, right) => left.sequence - right.sequence);
}

function semanticLoop(event: TraceEvent): TraceLoop {
	if (event.loop) return event.loop;
	throw new Error(`Trace event ${event.id} is not a semantic loop event.`);
}

function qualitySummary(
	iterations: QualityIterationSummary[],
): Record<TraceLoop, LoopQualitySummary> {
	return {
		decision: loopQualitySummary(iterations, "decision"),
		planning: loopQualitySummary(iterations, "planning"),
		implementation: loopQualitySummary(iterations, "implementation"),
	};
}

function loopQualitySummary(
	iterations: QualityIterationSummary[],
	loop: TraceLoop,
): LoopQualitySummary {
	const standards = iterations
		.filter((iteration) => iteration.loop === loop)
		.flatMap((iteration) => iteration.standards);
	return {
		total: standards.length,
		met: standards.filter((standard) => standard.status === "met").length,
		unmet: standards.filter((standard) => standard.status === "unmet").length,
		blocked: standards.filter((standard) => standard.status === "blocked")
			.length,
		missing: standards.filter((standard) => standard.status === "missing")
			.length,
		notApplicable: standards.filter(
			(standard) => standard.status === "not_applicable",
		).length,
		escalated: standards.filter((standard) => standard.status === "escalated")
			.length,
	};
}

function qualityStandardsFromEvent(
	event: TraceEvent,
): QualityStandardSummary[] {
	return objectList(objectRecord(event.data?.output).qualityStandards).map(
		(standard) => qualityStandardSummary(standard),
	);
}

function mergeRequiredQualityMetadata(
	required: QualityStandardSummary,
	provided: QualityStandardSummary,
): QualityStandardSummary {
	return {
		...provided,
		mode: provided.mode || required.mode,
		weight: provided.weight ?? required.weight,
		description: required.description || provided.description,
		standardType: provided.standardType || required.standardType,
		layer: provided.layer || required.layer,
		gate: provided.gate || required.gate,
		scoreThreshold: provided.scoreThreshold ?? required.scoreThreshold,
	};
}

function normalizeStandards(
	standards: LoopQualityStandardResult[],
	metadataById?: Map<string, QualityStandardGraphMetadata>,
): QualityStandardSummary[] {
	return standards.map((standard) =>
		qualityStandardSummary(standard, metadataById?.get(standard.id)),
	);
}

function qualityGraphMetadataById(
	nodes: LoopQualityGraphNode<string>[],
): Map<string, QualityStandardGraphMetadata> {
	return new Map(
		nodes.map((node) => [
			node.id,
			{
				layer: node.layer,
				standardType: node.standardType,
				gate: node.gate,
				scoreThreshold: node.scoreThreshold,
			},
		]),
	);
}

function qualityStandardSummary(
	standard: Record<string, unknown> | LoopQualityStandardResult,
	metadata?: QualityStandardGraphMetadata,
): QualityStandardSummary {
	const evidenceRefs = stringList(standard.evidenceRefs);
	const score = finiteNumber(standard.score);
	const scoreThreshold = finiteNumber(standard.scoreThreshold);
	return {
		id: text(standard.id),
		status: qualityStatus(standard.status),
		mode: qualityMode(standard.mode),
		...(number(standard.weight) ? { weight: number(standard.weight) } : {}),
		description: canonicalQualityStandardDescription(
			text(standard.description),
		),
		...(text(standard.message)
			? { message: canonicalQualityStandardDescription(text(standard.message)) }
			: {}),
		...(text(standard.standardType) || metadata?.standardType
			? { standardType: text(standard.standardType) || metadata?.standardType }
			: {}),
		...(text(standard.layer) || metadata?.layer
			? { layer: text(standard.layer) || metadata?.layer }
			: {}),
		...(text(standard.gate) || metadata?.gate
			? { gate: text(standard.gate) || metadata?.gate }
			: {}),
		...(score !== undefined ? { score } : {}),
		...(scoreThreshold !== undefined || metadata?.scoreThreshold !== undefined
			? { scoreThreshold: scoreThreshold ?? metadata?.scoreThreshold }
			: {}),
		refs: stringList(standard.refs),
		...(evidenceRefs.length > 0 ? { evidenceRefs } : {}),
	};
}

function canonicalQualityStandardDescription(value: string): string {
	return value
		.replace(
			/Sprint Proposal has at least one approved (?:row|change) and stable (?:row|change) ids\./gi,
			"Decision loop output has at least one Decision and stable Decision ids.",
		)
		.replace(/Approved rows\b/g, "Decisions")
		.replace(/approved rows\b/g, "Decisions")
		.replace(/Approved changes\b/g, "Decisions")
		.replace(/approved changes\b/g, "Decisions")
		.replace(/approved row\b/g, "Decision")
		.replace(/approved change\b/g, "Decision")
		.replace(/High-risk changes\b/g, "High-risk Decisions")
		.replace(/high-risk changes\b/g, "high-risk Decisions")
		.replace(/\brow ids\b/g, "Decision ids")
		.replace(/\bchange ids\b/g, "Decision ids")
		.replace(/\brows\b/g, "Decisions")
		.replace(/\bRows\b/g, "Decisions")
		.replace(/\brow\b/g, "Decision")
		.replace(/\bRow\b/g, "Decision")
		.replace(/\btables\b/g, "decision lists")
		.replace(/\bTables\b/g, "Decision lists")
		.replace(/\btable\b/g, "decision list")
		.replace(/\bTable\b/g, "Decision list");
}

function standardBlockerMessage(
	event: TraceEvent,
	standard: QualityStandardSummary,
): string {
	return (
		standard.message ||
		`${event.loop} quality standard ${standard.id} is ${standard.status}.`
	);
}

function qualityStatus(value: unknown): QualityStandardSummary["status"] {
	const status = text(value);
	if (
		status === "met" ||
		status === "unmet" ||
		status === "blocked" ||
		status === "not_applicable" ||
		status === "escalated"
	) {
		return status;
	}
	return "missing";
}

function qualityStatusBlocks(
	status: QualityStandardSummary["status"],
): boolean {
	return status === "unmet" || status === "blocked" || status === "missing";
}

function qualityMode(value: unknown): QualityStandardSummary["mode"] {
	const mode = text(value);
	if (mode === "deterministic" || mode === "agent" || mode === "user") {
		return mode;
	}
	return "deterministic";
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function objectList(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
		: [];
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function number(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: 0;
}

function finiteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
