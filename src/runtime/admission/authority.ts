export interface RuntimeDecisionAuthority {
	readonly kind: "user" | "policy";
	readonly actor: string;
	readonly ref: string;
}
