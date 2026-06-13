export const CODEWIKI_EXTENSION_AVAILABLE = false as const;

export const sourceLayout = {
	loopRoots: ["decision", "planning", "implementation"],
	supportRoots: [
		"traces",
		"views",
		"knowledge",
		"git",
		"cli",
		"pi",
		"runtime",
		"project",
		"utils",
	],
} as const;

export type SourceLayout = typeof sourceLayout;

export * from "./api/index.ts";
