import type { WorkPlanCard, WorkPlanView } from "./types.ts";

export function buildWorkPlanView(cards: WorkPlanCard[]): WorkPlanView {
	return { cards: cards.map((card) => ({ ...card, traceRefs: [...card.traceRefs] })) };
}
