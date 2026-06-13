import { replayTrace } from "../traces/replay.ts";
import type { TraceViewInput, ResumeView, WorkPlanCard } from "./types.ts";
import { buildStatusView } from "./status.ts";
import { workPlanCardsFromTrace } from "./work-plan.ts";

export function buildResumeView(input: TraceViewInput): ResumeView {
	const state = replayTrace(input.records);
	const status = buildStatusView(input);
	const cards = workPlanCardsFromTrace(input.records);
	const activeCard = selectActiveCard(cards);
	return {
		generatedAt: input.generatedAt,
		traceId: state.head.traceId,
		title: state.head.title,
		nextAction: nextAction(status.blockers, status.currentLoop, activeCard),
		currentLoop: status.currentLoop,
		...(activeCard ? { activeWorkUnitId: activeCard.id } : {}),
		lastEventId: status.lastEventId,
		sourceRefs: status.sourceRefs,
		blockers: status.blockers,
	};
}

function selectActiveCard(cards: WorkPlanCard[]): WorkPlanCard | undefined {
	return (
		cards.find((card) => card.status === "active") ||
		cards.find((card) => card.status === "blocked") ||
		cards.find((card) => card.status === "todo")
	);
}

function nextAction(
	blockers: string[],
	currentLoop: ResumeView["currentLoop"],
	activeCard?: WorkPlanCard,
): string {
	if (blockers.length > 0) return `Resolve blocker: ${blockers[0]}`;
	if (currentLoop === "decision") return "Create or approve decision rows.";
	if (currentLoop === "planning")
		return "Plan approved decision events into work units or explicit resolutions.";
	if (currentLoop === "implementation") {
		return activeCard
			? `Implement planned work unit ${activeCard.id}.`
			: "Implement planned work units.";
	}
	return "Close trace or publish implementation evidence.";
}
