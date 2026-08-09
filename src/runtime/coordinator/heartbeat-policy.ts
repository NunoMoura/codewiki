import {
	resolveWikiConfig,
	type PartialWikiConfig,
	type WikiConfig,
	type WikiConfigAgencyLevel,
	type WikiConfigAutomationMode,
} from "../../project/config.ts";
import { runtimeAutomationBlockers } from "../admission/automation.ts";

type RuntimeHeartbeatCyclePolicyMode = "preview" | "append";

interface RuntimeHeartbeatCyclePolicyInput {
	mode: RuntimeHeartbeatCyclePolicyMode;
	config?: PartialWikiConfig | WikiConfig;
	repoRoot?: string;
}

export interface RuntimeHeartbeatCyclePolicyDecision {
	automation: WikiConfigAutomationMode;
	agency: WikiConfigAgencyLevel;
	appendAllowed: boolean;
	blockers: string[];
}

export function evaluateRuntimeHeartbeatCyclePolicy(
	input: RuntimeHeartbeatCyclePolicyInput,
): RuntimeHeartbeatCyclePolicyDecision {
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
	input: RuntimeHeartbeatCyclePolicyInput,
): string[] {
	if (input.mode !== "append") return [];
	return input.repoRoot ? [] : ["Missing repoRoot for heartbeat cycle append."];
}
