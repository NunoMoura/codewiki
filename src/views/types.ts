export interface WorkPlanCard {
	id: string;
	title: string;
	status: "todo" | "blocked" | "active" | "done";
	traceRefs: string[];
}

export interface WorkPlanView {
	cards: WorkPlanCard[];
}
