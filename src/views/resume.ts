import { replayTrace } from "../traces/replay.ts";
import type { TraceViewInput, ResumeView, WorkPlanCard } from "./types.ts";
import { buildStatusView } from "./status.ts";
import { workPlanCardsFromTrace } from "./work-plan.ts";

export function buildResumeView(input: TraceViewInput): ResumeView {
	const state = replayTrace(input.records);
	const status = buildStatusView(input);
	const cards = workPlanCardsFromTrace(input.records);
	const activeCard = status.closed ? undefined : selectActiveCard(cards);
	return {
		generatedAt: input.generatedAt,
		traceId: state.head.traceId,
		title: state.head.title,
		nextAction: status.closed
			? "Trace is closed."
			: nextAction(status.blockers, status.currentLoop, activeCard),
		currentLoop: status.currentLoop,
		...(status.closed
			? {
					closed: true,
					closedAt: status.closedAt,
					closeReason: status.closeReason,
				}
			: {}),
		...(activeCard ? { activeWorkUnitId: activeCard.id } : {}),
		lastEventId: status.lastEventId,
		sourceRefs: status.sourceRefs,
		blockers: status.blockers,
		qualityBlockers: status.qualityBlockers,
		...(status.quality ? { quality: status.quality } : {}),
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
	if (currentLoop === "decision") return "Create or approve proposed changes.";
	if (currentLoop === "planning")
		return "Plan approved decision events into work units or explicit resolutions.";
	if (currentLoop === "implementation") {
		return activeCard
			? `Implement planned work unit ${activeCard.id}.`
			: "Implement planned work units.";
	}
	return "Close trace or publish implementation evidence.";
}
