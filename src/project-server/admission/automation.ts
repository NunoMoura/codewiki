import type { WikiConfig } from "../../project/config.ts";

export function runtimeAutomationBlockers(config: WikiConfig): string[] {
	const blockers: string[] = [];
	if (config.runtime.automation === "manual") {
		blockers.push("runtime.automation is manual.");
	}
	if (config.runtime.agency === "observe") {
		blockers.push("runtime.agency is observe.");
	}
	return blockers;
}
