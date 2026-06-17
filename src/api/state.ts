import {
	buildBlockersView,
	buildConflictsView,
	buildQualityView,
	buildResumeView,
	buildStatusView,
	buildWorkPlanView,
	buildWorkQueueView,
} from "./views.ts";
import {
	sourceMapOwnerForPath,
	type SourceMapComponent,
	type SourceMapContract,
} from "../knowledge/source-map.ts";
import { foldProjectTraceRecords } from "../traces/project.ts";
import type { TraceRecord } from "../traces/types.ts";
import type {
	BlockersView,
	ConflictsView,
	QualityView,
	ResumeView,
	StatusView,
	WorkPlanView,
	WorkQueueView,
} from "../views/types.ts";

export interface WikiStateInput {
	records: TraceRecord[];
	generatedAt?: string;
	traceId?: string;
	sourceMap?: SourceMapContract;
	sourcePaths?: string[];
}

export interface WikiStateSourceOwner {
	path: string;
	componentId?: string;
	doc?: string;
	sourcePatterns: string[];
	testPatterns: string[];
	generatedViews: string[];
	traceEvents: string[];
	role?: string;
	testPolicy?: string;
	testRationale?: string;
}

export interface WikiStateSnapshot {
	generatedAt?: string;
	traceIds: string[];
	selectedTraceId?: string;
	status?: StatusView;
	resume?: ResumeView;
	workPlan?: WorkPlanView;
	workQueue: WorkQueueView;
	blockers?: BlockersView;
	conflicts?: ConflictsView;
	quality?: QualityView;
	sourceOwners: WikiStateSourceOwner[];
}

export function buildWikiState(input: WikiStateInput): WikiStateSnapshot {
	const fold = foldProjectTraceRecords(input.records);
	const selectedTraceId = selectTraceId(fold.traceIds, input.traceId);
	const selectedRecords = selectedTraceId
		? fold.recordsByTrace[selectedTraceId]
		: undefined;
	const traceViewInput = selectedRecords
		? { records: selectedRecords, generatedAt: input.generatedAt }
		: undefined;
	return {
		generatedAt: input.generatedAt,
		traceIds: fold.traceIds,
		...(selectedTraceId ? { selectedTraceId } : {}),
		...(traceViewInput
			? {
					status: buildStatusView(traceViewInput),
					resume: buildResumeView(traceViewInput),
					workPlan: buildWorkPlanView(traceViewInput),
					blockers: buildBlockersView(traceViewInput),
					conflicts: buildConflictsView(traceViewInput),
					quality: buildQualityView(traceViewInput),
				}
			: {}),
		workQueue: buildWorkQueueView({
			records: input.records,
			generatedAt: input.generatedAt,
		}),
		sourceOwners: sourceOwnersForPaths(
			input.sourceMap,
			input.sourcePaths || [],
		),
	};
}

export function wikiStateSourceOwner(
	sourceMap: SourceMapContract,
	path: string,
): WikiStateSourceOwner {
	return sourceOwnerView(path, sourceMapOwnerForPath(sourceMap, path));
}

function selectTraceId(
	traceIds: string[],
	requestedTraceId?: string,
): string | undefined {
	if (requestedTraceId) {
		if (!traceIds.includes(requestedTraceId)) {
			throw new Error(`Unknown trace id: ${requestedTraceId}`);
		}
		return requestedTraceId;
	}
	return traceIds.length === 1 ? traceIds[0] : undefined;
}

function sourceOwnersForPaths(
	sourceMap: SourceMapContract | undefined,
	paths: string[],
): WikiStateSourceOwner[] {
	if (!sourceMap) return paths.map((path) => sourceOwnerView(path));
	return paths.map((path) => wikiStateSourceOwner(sourceMap, path));
}

function sourceOwnerView(
	path: string,
	component?: SourceMapComponent,
): WikiStateSourceOwner {
	return {
		path,
		...(component
			? {
					componentId: component.id,
					doc: component.doc,
					sourcePatterns: [...component.sourcePatterns],
					testPatterns: [...component.testPatterns],
					generatedViews: [...component.generatedViews],
					traceEvents: [...component.traceEvents],
					...(component.role ? { role: component.role } : {}),
					...(component.testPolicy ? { testPolicy: component.testPolicy } : {}),
					...(component.testRationale
						? { testRationale: component.testRationale }
						: {}),
				}
			: {
					sourcePatterns: [],
					testPatterns: [],
					generatedViews: [],
					traceEvents: [],
				}),
	};
}
