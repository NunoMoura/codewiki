import type { WikiProject } from "../project/types.ts";
import {
	effectiveAgencyPolicy,
	type AgencyBudget,
	type AgencyScope,
	type EffectiveAgencyPolicy,
} from "./types.ts";

export interface AgencyAutoPickupPolicy {
	policy: EffectiveAgencyPolicy;
	autoPickupEnabled: boolean;
	requireSourceBackedKickoff: boolean;
	maxResetsPerRun: number;
}

export function resolveAgencyAutoPickupPolicy(
	project: Pick<WikiProject, "config">,
): AgencyAutoPickupPolicy {
	const policy = effectiveAgencyPolicy(project.config);
	return {
		policy,
		autoPickupEnabled:
			policy.context_reset.enabled && policy.context_reset.auto_pickup,
		requireSourceBackedKickoff:
			policy.context_reset.require_source_backed_kickoff,
		maxResetsPerRun: policy.context_reset.max_resets_per_run,
	};
}

export function configuredAgencyBudget(
	project: Pick<WikiProject, "config">,
	scope: AgencyScope = { kind: "roadmap" },
	overrides: Partial<AgencyBudget> = {},
): AgencyBudget {
	const budgets = project.config.codewiki?.agency?.budgets || {};
	return {
		...((budgets as any).default || {}),
		...((budgets as any)[scope.kind] || {}),
		...overrides,
	};
}
