export interface StatusView {
	health: "green" | "yellow" | "red";
	blockers: string[];
}
