import {createLoopExitResultCache} from "./cache.ts";
import {createCheckCatalog} from "./catalog.ts";
import {createCustomCodeCheckExecutors} from "./custom-checks/code-executor.ts";
import type {CustomCodeCapabilitySnapshot} from "./custom-checks/code-templates.ts";
import type {ProtectedCustomCheckConfigSnapshot} from "./custom-checks/configuration.ts";
import {
	assertProjectCheckPackSnapshot,
	type ProjectCheckPackSnapshot,
} from "./custom-checks/project-config-store.ts";
import {
	createResourceUsageEvidenceMaterial,
	evaluateRuntimeResourceMeter,
	preflightRuntimeResourceGuards,
	resolveRuntimeResourceGuards,
} from "./custom-checks/resource-guards.ts";
import {projectVerificationState} from "./projection.ts";
import {
	assertValidExitOutcome,
	assertValidRepairBrief,
	assertValidRepairBundle,
	assertValidRepairExecutionInvocation,
	createExitOutcome,
	createRepairBrief,
	createRepairBundle,
	createRepairExecutionInvocation,
} from "./repair-bundle.ts";
import {
	assertValidRepairFrontier,
	createRepairFrontier,
} from "./repair-frontier.ts";
import {createCheckResult, createExitReport} from "./results.ts";
import {
	createLoopExitRunner,
	type CreateLoopExitRunnerInput,
} from "./runner.ts";
import {
	createStandardEvidenceCheckExecutors,
	type StandardEvidenceCheckCapability,
} from "./standard-evidence-executor.ts";

interface VerificationRuntime {
	readonly catalog: ReturnType<typeof createCheckCatalog>;
	readonly createCheckResult: typeof createCheckResult;
	readonly createExitReport: typeof createExitReport;
	readonly createRepairFrontier: typeof createRepairFrontier;
	readonly assertValidRepairFrontier: typeof assertValidRepairFrontier;
	readonly createRepairBrief: typeof createRepairBrief;
	readonly assertValidRepairBrief: typeof assertValidRepairBrief;
	readonly createRepairBundle: typeof createRepairBundle;
	readonly assertValidRepairBundle: typeof assertValidRepairBundle;
	readonly createExitOutcome: typeof createExitOutcome;
	readonly assertValidExitOutcome: typeof assertValidExitOutcome;
	readonly createRepairExecutionInvocation: typeof createRepairExecutionInvocation;
	readonly assertValidRepairExecutionInvocation: typeof assertValidRepairExecutionInvocation;
	readonly createResultCache: typeof createLoopExitResultCache;
	readonly projectState: typeof projectVerificationState;
	readonly resourceGuards: ReturnType<typeof resolveRuntimeResourceGuards>;
	readonly preflightResourceGuards: typeof preflightRuntimeResourceGuards;
	readonly evaluateResourceMeter: typeof evaluateRuntimeResourceMeter;
	readonly createResourceUsageEvidenceMaterial: typeof createResourceUsageEvidenceMaterial;
	readonly createRunner: (
		input: Omit<CreateLoopExitRunnerInput, "catalog">,
	) => ReturnType<typeof createLoopExitRunner>;
}

interface CreateVerificationRuntimeInput {
	readonly protectedBaseCustomCheckConfig?: ProtectedCustomCheckConfigSnapshot;
	readonly projectCheckPackSnapshot?: ProjectCheckPackSnapshot;
	readonly customCodeCapabilitySnapshot?: CustomCodeCapabilitySnapshot;
	readonly standardEvidenceCapabilities?: readonly StandardEvidenceCheckCapability[];
}

export function createVerificationRuntime(
	input: CreateVerificationRuntimeInput = {},
): VerificationRuntime {
	if ("customChecks" in input) {
		throw new Error(
			"Verification Runtime received unsupported field customChecks; use protectedBaseCustomCheckConfig.",
		);
	}
	const protectedConfig = input.protectedBaseCustomCheckConfig;
	if (input.projectCheckPackSnapshot) {
		assertProjectCheckPackSnapshot(input.projectCheckPackSnapshot);
	}
	const catalog = createCheckCatalog({
		userStandards: protectedConfig?.userStandards ?? [],
		customChecks: protectedConfig?.customChecks ?? [],
		checkPacks: input.projectCheckPackSnapshot?.packs ?? [],
	});
	if (
		input.projectCheckPackSnapshot &&
		catalog.checkPackSnapshotDigest !== input.projectCheckPackSnapshot.digest
	) {
		throw new Error("Check Pack snapshot does not match the Verification Catalog.");
	}
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
		catalog,
		createCheckResult,
		createExitReport,
		createRepairFrontier,
		assertValidRepairFrontier,
		createRepairBrief,
		assertValidRepairBrief,
		createRepairBundle,
		assertValidRepairBundle,
		createExitOutcome,
		assertValidExitOutcome,
		createRepairExecutionInvocation,
		assertValidRepairExecutionInvocation,
		createResultCache: createLoopExitResultCache,
		projectState: projectVerificationState,
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
	});
}
