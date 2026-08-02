import type {EvidenceRecord} from "../../evidence/contracts.ts";
import type {CheckCatalog} from "../catalog.ts";
import type {LoopCheckExecutor, LoopCheckExecutorContext} from "../runner.ts";
import {canonicalJsonDigest} from "../../utils/canonical-json.ts";
import {
	assertCustomCodeTemplateCapability,
	assertCustomCodeCapabilitySnapshot,
	resourceUsageMeasurementShape,
	resourceUsageTemplateSemantics,
	type CustomCodeCapabilitySnapshot,
	type CustomCodeTemplateBinding,
} from "./code-templates.ts";

export function createCustomCodeCheckExecutors(input: {
	readonly catalog: CheckCatalog;
	readonly capabilitySnapshot?: CustomCodeCapabilitySnapshot;
}): readonly LoopCheckExecutor[] {
	if (input.capabilitySnapshot) {
		assertCustomCodeCapabilitySnapshot(input.capabilitySnapshot);
	}
	const executors: LoopCheckExecutor[] = [];
	for (const registration of input.catalog.list()) {
		const definition = registration.customCheck?.definition;
		if (!definition || definition.evaluator !== "code" || !definition.codeTemplate) {
			continue;
		}
		const configurationDigest = canonicalJsonDigest({
			templateBindingDigest: definition.codeTemplate.bindingDigest,
			capabilitySnapshotDigest: input.capabilitySnapshot?.snapshotDigest ?? null,
		});
		for (const loop of registration.loops) {
			executors.push(
				Object.freeze({
					loop,
					checkId: registration.check.id,
					checkVersion: registration.check.version,
					execution: {
						...registration.check.execution,
						configurationDigest,
					},
					cacheable: false,
					execute: (context: LoopCheckExecutorContext) =>
						evaluateResourceUsageLimit({
							context,
							binding: definition.codeTemplate as CustomCodeTemplateBinding,
							definitionDigest: definition.definitionDigest,
							capabilitySnapshot: input.capabilitySnapshot,
						}),
				}),
			);
		}
	}
	return Object.freeze(executors);
}

function evaluateResourceUsageLimit(input: {
	readonly context: LoopCheckExecutorContext;
	readonly binding: CustomCodeTemplateBinding;
	readonly definitionDigest: string;
	readonly capabilitySnapshot?: CustomCodeCapabilitySnapshot;
}) {
	if (!input.capabilitySnapshot) {
		return indeterminate(
			`Custom Code Check requires unavailable capability ${input.binding.requiredCapabilityId}.`,
		);
	}
	let capability;
	try {
		capability = assertCustomCodeTemplateCapability({
			binding: input.binding,
			capabilitySnapshot: input.capabilitySnapshot,
		});
	} catch (error) {
		return indeterminate(error instanceof Error ? error.message : String(error));
	}
	const semantics = resourceUsageTemplateSemantics(input.binding.parameters);
	const protectedConfigSnapshotDigest =
		input.context.binding.parameters.protectedCustomCheckConfigSnapshotDigest;
	if (typeof protectedConfigSnapshotDigest !== "string") {
		return indeterminate(
			"Custom Code Check policy binding has no protected config snapshot.",
		);
	}
	const resolution = input.context.evidenceResolutions.find(
		(entry) => entry.obligationId === "custom_resource_usage_observed",
	);
	if (!resolution || resolution.status !== "ready") {
		return indeterminate(
			"Required exact complete resource usage Evidence is unresolved.",
		);
	}
	const supportingEvidenceIds = new Set(resolution.supportingEvidenceIds);
	const candidates = input.context.evidenceRecords.filter(
		(record): record is EvidenceRecord<"resource_usage"> =>
			record.kind === "resource_usage" &&
			record.subject.candidateDigest === input.context.candidate.digest &&
			supportingEvidenceIds.has(record.evidenceId) &&
			record.payload.customCheckDefinitionDigest === input.definitionDigest,
	);
	const exact = candidates.filter((record) =>
		resourceUsageEvidenceMatches({
			record,
			binding: input.binding,
			protectedConfigSnapshotDigest,
			capabilitySnapshot: input.capabilitySnapshot as CustomCodeCapabilitySnapshot,
			capability,
		}),
	);
	if (exact.length !== 1) {
		return indeterminate(
			exact.length === 0
				? "Required exact complete resource usage Evidence is missing or mismatched."
				: "Resource usage Evidence contains duplicate complete-window observations.",
		);
	}
	const observed = exact[0].payload.value;
	const measurement = {
		shape: resourceUsageMeasurementShape(semantics.metric),
		value: observed,
	};
	if (observed > semantics.maximum) {
		return {
			disposition: "unsatisfied" as const,
			measurement,
			findings: [
				`${semantics.metric} ${observed} ${semantics.unit} exceeds maximum ${semantics.maximum} for ${semantics.accountingWindow}.`,
			],
			issueClass: "resource_limit_exceeded",
			feedback: "Reduce measured usage or revise the accepted User Standard through protected review.",
		};
	}
	return {
		disposition: "satisfied" as const,
		measurement,
		findings: [],
	};
}

function resourceUsageEvidenceMatches(input: {
	readonly record: EvidenceRecord<"resource_usage">;
	readonly binding: CustomCodeTemplateBinding;
	readonly protectedConfigSnapshotDigest: string;
	readonly capabilitySnapshot: CustomCodeCapabilitySnapshot;
	readonly capability: CustomCodeCapabilitySnapshot["capabilities"][number];
}): boolean {
	const semantics = resourceUsageTemplateSemantics(input.binding.parameters);
	const payload = input.record.payload;
	const observedBinding = {
		coverageComplete: input.record.coverage === "complete",
		authorityAccepted: ["observed", "verified"].includes(input.record.authority),
		metric: payload.metric,
		unit: payload.unit,
		scope: payload.scope,
		accountingWindow: payload.accountingWindow,
		aggregation: payload.aggregation,
		meterId: payload.meterId,
		meterVersion: payload.meterVersion,
		meterConfigurationDigest: payload.meterConfigurationDigest,
		environmentDigest: payload.environmentDigest,
		capabilitySnapshotDigest: payload.capabilitySnapshotDigest,
		templateBindingDigest: payload.templateBindingDigest,
		protectedConfigSnapshotDigest:
			payload.protectedCustomCheckConfigSnapshotDigest,
	};
	const expectedBinding = {
		coverageComplete: true,
		authorityAccepted: true,
		metric: semantics.metric,
		unit: semantics.unit,
		scope: semantics.scope,
		accountingWindow: semantics.accountingWindow,
		aggregation: "complete_window",
		meterId: input.capability.id,
		meterVersion: input.capability.version,
		meterConfigurationDigest: input.capability.configurationDigest,
		environmentDigest: input.capabilitySnapshot.environmentDigest,
		capabilitySnapshotDigest: input.capabilitySnapshot.snapshotDigest,
		templateBindingDigest: input.binding.bindingDigest,
		protectedConfigSnapshotDigest: input.protectedConfigSnapshotDigest,
	};
	return canonicalJsonDigest(observedBinding) === canonicalJsonDigest(expectedBinding);
}

function indeterminate(finding: string) {
	return {
		disposition: "indeterminate" as const,
		findings: [finding],
		issueClass: "resource_measurement_unavailable",
		feedback: "Provide fresh complete Runtime-owned usage telemetry from the required capability.",
	};
}
