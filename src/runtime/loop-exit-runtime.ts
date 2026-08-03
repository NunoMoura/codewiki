import { decisionLoopExitDeclaration } from "../decision/exit/index.ts";
import { implementationLoopExitDeclaration } from "../implementation/exit/index.ts";
import { createLoopExitResultCache } from "../loop-exit/cache.ts";
import {createCustomCodeCheckExecutors} from "../loop-exit/custom-checks/code-executor.ts";
import type {CustomCodeCapabilitySnapshot} from "../loop-exit/custom-checks/code-templates.ts";
import type {ProtectedCustomCheckConfigSnapshot} from "../loop-exit/custom-checks/configuration.ts";
import {
	createResourceUsageEvidenceMaterial,
	evaluateRuntimeResourceMeter,
	preflightRuntimeResourceGuards,
	resolveRuntimeResourceGuards,
} from "../loop-exit/custom-checks/resource-guards.ts";
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
	createStandardEvidenceCheckExecutors,
	type StandardEvidenceCheckCapability,
} from "../loop-exit/standard-evidence-executor.ts";
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
	readonly resourceGuards: ReturnType<typeof resolveRuntimeResourceGuards>;
	readonly preflightResourceGuards: typeof preflightRuntimeResourceGuards;
	readonly evaluateResourceMeter: typeof evaluateRuntimeResourceMeter;
	readonly createResourceUsageEvidenceMaterial: typeof createResourceUsageEvidenceMaterial;
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
		readonly customCodeCapabilitySnapshot?: CustomCodeCapabilitySnapshot;
		readonly standardEvidenceCapabilities?: readonly StandardEvidenceCheckCapability[];
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
	const resourceGuards = resolveRuntimeResourceGuards({
		...(protectedConfig ? {protectedConfig} : {}),
		...(input.customCodeCapabilitySnapshot
			? {capabilitySnapshot: input.customCodeCapabilitySnapshot}
			: {}),
	});
	const standardEvidenceExecutors = createStandardEvidenceCheckExecutors({
		catalog,
		capabilities: input.standardEvidenceCapabilities ?? [],
	});
	let customCodeExecutors: ReturnType<typeof createCustomCodeCheckExecutors> = [];
	if (resourceGuards.status === "ready") {
		customCodeExecutors = createCustomCodeCheckExecutors({
			catalog,
			...(input.customCodeCapabilitySnapshot
				? {capabilitySnapshot: input.customCodeCapabilitySnapshot}
				: {}),
		});
	}
	return Object.freeze({
		suite: LOOP_EXIT_SUITE,
		catalog,
		createCheckResult,
		createExitReport,
		createResultCache: createLoopExitResultCache,
		resourceGuards,
		preflightResourceGuards: preflightRuntimeResourceGuards,
		evaluateResourceMeter: evaluateRuntimeResourceMeter,
		createResourceUsageEvidenceMaterial,
		createRunner: (runnerInput: Omit<CreateLoopExitRunnerInput, "catalog">) => {
			if (resourceGuards.status === "blocked") {
				throw new Error(
					`Runtime resource guard admission blocked: ${resourceGuards.findings.join("; ")}`,
				);
			}
			return createLoopExitRunner({
				...runnerInput,
				catalog,
				executors: [
					...runnerInput.executors,
					...standardEvidenceExecutors,
					...customCodeExecutors,
				],
			});
		},
		materializeDecisionResearchCitation,
		evaluateDecisionResearchProvenance:
			createDecisionResearchProvenanceExecutor(catalog),
		prepareDecisionResearchClaimsAssessment: claimsExecutor.prepare,
		completeDecisionResearchClaimsAssessment: claimsExecutor.complete,
	});
}
