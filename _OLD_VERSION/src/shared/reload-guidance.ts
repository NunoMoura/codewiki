import { unique } from "./utils.ts";

export interface CodewikiReloadGuidance {
	required: boolean;
	command: "/reload";
	paths: string[];
	reasons: string[];
	message: string;
}

function normalizePath(value: string): string {
	return value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function reloadReasonForPath(path: string): string | null {
	const normalized = normalizePath(path);
	if (!normalized) return null;
	if (normalized === "src/index.ts") return "Pi extension entrypoint changed";
	if (normalized === "package.json")
		return "Pi package extension or skill metadata changed";
	if (normalized.startsWith("skills/"))
		return "packaged CodeWiki skill prompt changed";
	if (normalized.startsWith("src/adapters/"))
		return "Pi or harness adapter code changed";
	if (normalized.startsWith("src/api/")) return "CodeWiki API facade changed";
	if (normalized.startsWith("src/runtime/"))
		return "CodeWiki runtime orchestration changed";
	if (normalized.startsWith("src/session/"))
		return "CodeWiki session/runtime boundary code changed";
	if (normalized.startsWith("src/"))
		return "CodeWiki extension package source changed";
	return null;
}

export function codewikiReloadTargetsForPaths(paths: string[] = []): string[] {
	return unique(
		paths
			.map(normalizePath)
			.filter((path) => Boolean(path && reloadReasonForPath(path))),
	);
}

export function buildCodewikiReloadGuidance(
	paths: string[] = [],
): CodewikiReloadGuidance {
	const targets = codewikiReloadTargetsForPaths(paths);
	const reasons = unique(
		targets
			.map((path) => reloadReasonForPath(path))
			.filter((reason): reason is string => Boolean(reason)),
	);
	const required = targets.length > 0;
	return {
		required,
		command: "/reload",
		paths: targets,
		reasons,
		message: required
			? "Pi extension, skill, runtime, or API files changed. Run `/reload` in Pi before relying on live extension behavior; CodeWiki compaction does not reload extension code and never restarts Pi automatically."
			: "No Pi reload needed for changed paths.",
	};
}
