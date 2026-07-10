export const CODEWIKI_EXTENSION_AVAILABLE = true as const;

export const sourceLayout = {
	loopRoots: ["decision", "planning", "implementation"],
	supportRoots: [
		"api",
		"loops",
		"dashboard",
		"traces",
		"views",
		"knowledge",
		"git",
		"cli",
		"pi",
		"runtime",
		"error-handling",
		"project",
		"utils",
	],
} as const;

export type SourceLayout = typeof sourceLayout;

export * from "./api/index.ts";
