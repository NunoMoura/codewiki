import { decisionLoopExitDeclaration } from "../decision/exit/index.ts";
import { implementationLoopExitDeclaration } from "../implementation/exit/index.ts";
import { createCheckCatalog } from "../loop-exit/catalog.ts";
import {
	createCheckResult,
	createExitReport,
} from "../loop-exit/results.ts";
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

export function createLoopExitRuntime(): LoopExitRuntime {
	const catalog = createCheckCatalog();
	const claimsExecutor = createDecisionResearchClaimsExecutor(catalog);
	return Object.freeze({
		suite: LOOP_EXIT_SUITE,
		catalog,
		createCheckResult,
		createExitReport,
		materializeDecisionResearchCitation,
		evaluateDecisionResearchProvenance:
			createDecisionResearchProvenanceExecutor(catalog),
		prepareDecisionResearchClaimsAssessment: claimsExecutor.prepare,
		completeDecisionResearchClaimsAssessment: claimsExecutor.complete,
	});
}
