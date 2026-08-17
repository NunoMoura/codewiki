import {
	resolveWikiConfig,
	type PartialWikiConfig,
	type WikiConfig,
	type WikiConfigAgencyLevel,
	type WikiConfigAutomationMode,
} from "../../project/config.ts";
import { runtimeAutomationBlockers } from "../admission/automation.ts";

type ProjectServerHeartbeatCyclePolicyMode = "preview" | "append";

interface ProjectServerHeartbeatCyclePolicyInput {
	mode: ProjectServerHeartbeatCyclePolicyMode;
	config?: PartialWikiConfig | WikiConfig;
	repoRoot?: string;
}

export interface ProjectServerHeartbeatCyclePolicyDecision {
	automation: WikiConfigAutomationMode;
	agency: WikiConfigAgencyLevel;
	appendAllowed: boolean;
	blockers: string[];
}

export function evaluateProjectServerHeartbeatCyclePolicy(
	input: ProjectServerHeartbeatCyclePolicyInput,
): ProjectServerHeartbeatCyclePolicyDecision {
	const config = resolveWikiConfig(input.config);
	const blockers = [
		...runtimeAutomationBlockers(config),
		...heartbeatAppendSafetyBlockers(input),
	];
	return {
		automation: config.runtime.automation,
		agency: config.runtime.agency,
		appendAllowed: blockers.length === 0,
		blockers,
	};
}

function heartbeatAppendSafetyBlockers(
	input: ProjectServerHeartbeatCyclePolicyInput,
): string[] {
	if (input.mode !== "append") return [];
	return input.repoRoot ? [] : ["Missing repoRoot for heartbeat cycle append."];
}
