export const CODEWIKI_EXTENSION_AVAILABLE = false as const;

export const sourceLayout = {
	loopRoots: ["decision", "planning", "implementation"],
	supportRoots: [
		"telemetry",
		"graph",
		"knowledge",
		"git",
		"pi",
		"project",
		"runtime",
		"agency",
		"shared",
	],
} as const;

export type SourceLayout = typeof sourceLayout;

export * from "./api/index.ts";
