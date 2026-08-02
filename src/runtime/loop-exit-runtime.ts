import { decisionLoopExitDeclaration } from "../decision/exit/index.ts";
import { implementationLoopExitDeclaration } from "../implementation/exit/index.ts";
import { createLoopExitResultCache } from "../loop-exit/cache.ts";
import type {ProtectedCustomCheckConfigSnapshot} from "../loop-exit/custom-checks/index.ts";
import { createCheckCatalog } from "../loop-exit/catalog.ts";
import {
	createCheckResult,
	createExitReport,
} from "../loop-exit/results.ts";
import {
	createLoopExitRunner,
	type CreateLoopExitRunnerInput,
} from "../loop-exit/runner.ts";
import {
	createLoopExitSuite,
	type LoopExitSuite,
} from "../loop-exit/suite.ts";
import { planningLoopExitDeclaration } from "../planning/exit/index.ts";
import { createDecisionResearchClaimsExecutor } from "./decision-research-claims.ts";
import {
	createDecisionResearchProvenanceExecutor,
	materializeDecisionResearchCitation,
} from "./decision-research.ts";

interface LoopExitRuntime {
	readonly suite: LoopExitSuite;
	readonly catalog: ReturnType<typeof createCheckCatalog>;
	readonly createCheckResult: typeof createCheckResult;
	readonly createExitReport: typeof createExitReport;
	readonly createResultCache: typeof createLoopExitResultCache;
	readonly createRunner: (
		input: Omit<CreateLoopExitRunnerInput, "catalog">,
	) => ReturnType<typeof createLoopExitRunner>;
	readonly materializeDecisionResearchCitation: typeof materializeDecisionResearchCitation;
	readonly evaluateDecisionResearchProvenance: ReturnType<
		typeof createDecisionResearchProvenanceExecutor
	>;
	readonly prepareDecisionResearchClaimsAssessment: ReturnType<
		typeof createDecisionResearchClaimsExecutor
	>["prepare"];
	readonly completeDecisionResearchClaimsAssessment: ReturnType<
		typeof createDecisionResearchClaimsExecutor
	>["complete"];
}

export const LOOP_EXIT_SUITE = createLoopExitSuite({
	decision: decisionLoopExitDeclaration,
	planning: planningLoopExitDeclaration,
	implementation: implementationLoopExitDeclaration,
});

export function createLoopExitRuntime(
	input: {
		readonly protectedBaseCustomCheckConfig?: ProtectedCustomCheckConfigSnapshot;
	} = {},
): LoopExitRuntime {
	if ("customChecks" in input) {
		throw new Error(
			"Loop Exit Runtime received unsupported field customChecks; use protectedBaseCustomCheckConfig.",
		);
	}
	const protectedConfig = input.protectedBaseCustomCheckConfig;
	const catalog = createCheckCatalog(
		protectedConfig
			? {
					userStandards: protectedConfig.userStandards,
					customChecks: protectedConfig.customChecks,
				}
			: undefined,
	);
	const claimsExecutor = createDecisionResearchClaimsExecutor(catalog);
	return Object.freeze({
		suite: LOOP_EXIT_SUITE,
		catalog,
		createCheckResult,
		createExitReport,
		createResultCache: createLoopExitResultCache,
		createRunner: (input: Omit<CreateLoopExitRunnerInput, "catalog">) =>
			createLoopExitRunner({...input, catalog}),
		materializeDecisionResearchCitation,
		evaluateDecisionResearchProvenance:
			createDecisionResearchProvenanceExecutor(catalog),
		prepareDecisionResearchClaimsAssessment: claimsExecutor.prepare,
		completeDecisionResearchClaimsAssessment: claimsExecutor.complete,
	});
}
