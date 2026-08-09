import {createLoopExitResultCache} from "./cache.ts";
import {createCheckCatalog} from "./catalog.ts";
import {createCustomCodeCheckExecutors} from "./custom-checks/code-executor.ts";
import type {CustomCodeCapabilitySnapshot} from "./custom-checks/code-templates.ts";
import type {ProtectedCustomCheckConfigSnapshot} from "./custom-checks/configuration.ts";
import {
	createResourceUsageEvidenceMaterial,
	evaluateRuntimeResourceMeter,
	preflightRuntimeResourceGuards,
	resolveRuntimeResourceGuards,
} from "./custom-checks/resource-guards.ts";
import {createCheckResult, createExitReport} from "./results.ts";
import {
	createLoopExitRunner,
	type CreateLoopExitRunnerInput,
} from "./runner.ts";
import {
	createStandardEvidenceCheckExecutors,
	type StandardEvidenceCheckCapability,
} from "./standard-evidence-executor.ts";

export interface VerificationRuntime {
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
}

export interface CreateVerificationRuntimeInput {
	readonly protectedBaseCustomCheckConfig?: ProtectedCustomCheckConfigSnapshot;
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
	const catalog = createCheckCatalog(
		protectedConfig
			? {
					userStandards: protectedConfig.userStandards,
					customChecks: protectedConfig.customChecks,
				}
			: undefined,
	);
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
	});
}
