import {
	EVIDENCE_SCHEMA_VERSION,
	type EvidenceMaterial,
} from "../../evidence/contracts.ts";
import type {SemanticLoop} from "../../semantic-loop.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import {
	assertProtectedCustomCheckConfigSnapshot,
	type ProtectedCustomCheckConfigSnapshot,
} from "./configuration.ts";
import type {CustomCheckDefinition} from "./contracts.ts";
import {
	assertCustomCodeCapabilitySnapshot,
	assertCustomCodeTemplateCapability,
	resourceUsageTemplateSemantics,
	type CustomCodeCapability,
	type CustomCodeCapabilitySnapshot,
	type ResourceUsageMetric,
	type ResourceUsageScope,
} from "./code-templates.ts";
import {compareCanonicalText, deepFreezeValue} from "./validation.ts";

export interface RuntimeResourceGuard {
	readonly guardId: string;
	readonly customCheckId: string;
	readonly definitionDigest: Sha256Digest;
	readonly templateBindingDigest: Sha256Digest;
	readonly protectedConfigSnapshotDigest: Sha256Digest;
	readonly capabilitySnapshotDigest: Sha256Digest;
	readonly capability: CustomCodeCapability;
	readonly loop: SemanticLoop;
	readonly metric: ResourceUsageMetric;
	readonly unit: string;
	readonly scope: ResourceUsageScope;
	readonly accountingWindow: string;
	readonly maximum: number;
	readonly enforcement: readonly ["preflight", "meter", "cancellation"];
}

export interface RuntimeResourceGuardResolution {
	readonly status: "ready" | "blocked";
	readonly protectedConfigSnapshotDigest: Sha256Digest | null;
	readonly capabilitySnapshotDigest: Sha256Digest | null;
	readonly guards: readonly RuntimeResourceGuard[];
	readonly findings: readonly string[];
	readonly resolutionDigest: Sha256Digest;
}

export interface RuntimeResourceEstimate {
	readonly guardId: string;
	readonly capabilitySnapshotDigest: Sha256Digest;
	readonly value: number;
}

export interface RuntimeResourcePreflight {
	readonly status: "ready" | "blocked";
	readonly guardResolutionDigest: Sha256Digest;
	readonly estimateInputDigest: Sha256Digest;
	readonly evaluatedGuardIds: readonly string[];
	readonly findings: readonly string[];
	readonly preflightDigest: Sha256Digest;
}

export interface RuntimeResourceMeterObservation {
	readonly guardId: string;
	readonly value: number;
}

export interface RuntimeResourceMeterDecision {
	readonly action: "continue" | "cancel";
	readonly observationStatus: "measured" | "indeterminate";
	readonly guardId: string;
	readonly observedValue: number | null;
	readonly maximum: number;
	readonly finding: string;
	readonly decisionDigest: Sha256Digest;
}

export function resolveRuntimeResourceGuards(input: {
	readonly protectedConfig?: ProtectedCustomCheckConfigSnapshot;
	readonly capabilitySnapshot?: CustomCodeCapabilitySnapshot;
}): RuntimeResourceGuardResolution {
	if (input.capabilitySnapshot) {
		assertCustomCodeCapabilitySnapshot(input.capabilitySnapshot);
	}
	if (input.protectedConfig) {
		assertProtectedCustomCheckConfigSnapshot(input.protectedConfig);
	}
	const protectedConfigSnapshotDigest = input.protectedConfig?.snapshotDigest;
	const guards: RuntimeResourceGuard[] = [];
	const findings: string[] = [];
	if (input.protectedConfig) {
		for (const definition of input.protectedConfig.customChecks) {
			const outcome = resolveDefinitionResourceGuard({
				definition,
				protectedConfigSnapshotDigest: input.protectedConfig.snapshotDigest,
				capabilitySnapshot: input.capabilitySnapshot,
			});
			if (outcome.guard) guards.push(outcome.guard);
			if (outcome.finding) findings.push(outcome.finding);
		}
	}
	guards.sort((...guardsToCompare) =>
		compareCanonicalText(
			guardsToCompare[0].guardId,
			guardsToCompare[1].guardId,
		),
	);
	findings.sort(compareCanonicalText);
	const body = {
		status: findings.length === 0 ? "ready" as const : "blocked" as const,
		protectedConfigSnapshotDigest:
			protectedConfigSnapshotDigest ?? null,
		capabilitySnapshotDigest: input.capabilitySnapshot?.snapshotDigest ?? null,
		guards,
		findings,
	};
	return deepFreezeValue({...body, resolutionDigest: canonicalJsonDigest(body)}) as RuntimeResourceGuardResolution;
}

function resolveDefinitionResourceGuard(input: {
	readonly definition: CustomCheckDefinition;
	readonly protectedConfigSnapshotDigest: Sha256Digest;
	readonly capabilitySnapshot?: CustomCodeCapabilitySnapshot;
}): {readonly guard: RuntimeResourceGuard | null; readonly finding: string | null} {
	const {definition} = input;
	if (definition.lifecycle !== "active" || definition.evaluator !== "code") {
		return {guard: null, finding: null};
	}
	if (!definition.codeTemplate) {
		return {
			guard: null,
			finding: `Custom Code Check ${definition.customCheckId} has no template.`,
		};
	}
	if (!input.capabilitySnapshot) {
		return {
			guard: null,
			finding: `Custom Code Check ${definition.customCheckId} requires unavailable capability ${definition.codeTemplate.requiredCapabilityId}.`,
		};
	}
	try {
		const capability = assertCustomCodeTemplateCapability({
			binding: definition.codeTemplate,
			capabilitySnapshot: input.capabilitySnapshot,
		});
		const semantics = resourceUsageTemplateSemantics(
			definition.codeTemplate.parameters,
		);
		const identity = {
			customCheckId: definition.customCheckId,
			definitionDigest: definition.definitionDigest,
			templateBindingDigest: definition.codeTemplate.bindingDigest,
			protectedConfigSnapshotDigest: input.protectedConfigSnapshotDigest,
			capabilitySnapshotDigest: input.capabilitySnapshot.snapshotDigest,
			capability,
			loop: semantics.loop,
			metric: semantics.metric,
			unit: semantics.unit,
			scope: semantics.scope,
			accountingWindow: semantics.accountingWindow,
			maximum: semantics.maximum,
			enforcement: ["preflight", "meter", "cancellation"] as const,
		};
		return {
			guard: deepFreezeValue({
				guardId: `runtime-resource-guard:${canonicalJsonDigest(identity).slice("sha256:".length)}`,
				...identity,
			}),
			finding: null,
		};
	} catch (error) {
		return {
			guard: null,
			finding: error instanceof Error ? error.message : String(error),
		};
	}
}

export function preflightRuntimeResourceGuards(input: {
	readonly resolution: RuntimeResourceGuardResolution;
	readonly estimates?: readonly RuntimeResourceEstimate[];
}): RuntimeResourcePreflight {
	const findings = [...input.resolution.findings];
	const evaluatedGuardIds: string[] = [];
	const estimates = normalizeEstimates(input.estimates ?? []);
	const activeGuardIds = new Set(
		input.resolution.guards.map((guard) => guard.guardId),
	);
	for (const estimate of estimates) {
		if (!activeGuardIds.has(estimate.guardId)) {
			findings.push(
				`Preflight estimate ${estimate.guardId} does not bind an active resource guard.`,
			);
		}
	}
	for (const guard of input.resolution.guards) {
		evaluatedGuardIds.push(guard.guardId);
		const estimate = estimates.find((entry) => entry.guardId === guard.guardId);
		if (!estimate) {
			findings.push(
				`Preflight ${guard.metric} estimate is unavailable for ${guard.accountingWindow}.`,
			);
		} else if (
			estimate.capabilitySnapshotDigest !== guard.capabilitySnapshotDigest
		) {
			findings.push(
				`Preflight ${guard.metric} estimate capability snapshot is mismatched.`,
			);
		} else if (
			(guard.metric === "model_tokens" ||
				guard.metric === "changed_files" ||
				guard.metric === "trace_bytes") &&
			!Number.isSafeInteger(estimate.value)
		) {
			findings.push(`Preflight ${guard.metric} estimate is malformed.`);
		} else if (estimate.value > guard.maximum) {
			findings.push(
				`Preflight ${guard.metric} estimate ${estimate.value} exceeds maximum ${guard.maximum} for ${guard.accountingWindow}.`,
			);
		}
	}
	const body = {
		status: findings.length === 0 ? "ready" as const : "blocked" as const,
		guardResolutionDigest: input.resolution.resolutionDigest,
		estimateInputDigest: canonicalJsonDigest(estimates),
		evaluatedGuardIds: evaluatedGuardIds.sort(compareCanonicalText),
		findings: findings.sort(compareCanonicalText),
	};
	return deepFreezeValue({...body, preflightDigest: canonicalJsonDigest(body)});
}

export function evaluateRuntimeResourceMeter(input: {
	readonly guard: RuntimeResourceGuard;
	readonly observation?: RuntimeResourceMeterObservation;
}): RuntimeResourceMeterDecision {
	let action: RuntimeResourceMeterDecision["action"] = "cancel";
	let observationStatus: RuntimeResourceMeterDecision["observationStatus"] =
		"indeterminate";
	let observedValue: number | null = null;
	let finding = "Required Runtime resource meter observation is unavailable.";
	if (input.observation) {
		let observationShapeValid = true;
		try {
			assertExactKeys(
				input.observation,
				["guardId", "value"],
				"Runtime resource meter observation",
			);
		} catch {
			observationShapeValid = false;
		}
		if (
			!observationShapeValid ||
			input.observation.guardId !== input.guard.guardId ||
			!Number.isFinite(input.observation.value) ||
			input.observation.value < 0 ||
			((input.guard.metric === "model_tokens" ||
				input.guard.metric === "changed_files" ||
				input.guard.metric === "trace_bytes") &&
				!Number.isSafeInteger(input.observation.value))
		) {
			finding = "Runtime resource meter observation is malformed or mismatched.";
		} else {
			observedValue = input.observation.value;
			observationStatus = "measured";
			action = observedValue > input.guard.maximum ? "cancel" : "continue";
			finding = action === "cancel"
				? `${input.guard.metric} ${observedValue} exceeds maximum ${input.guard.maximum}; cancel exact scope.`
				: `${input.guard.metric} ${observedValue} remains within maximum ${input.guard.maximum}.`;
		}
	}
	const body = {
		action,
		observationStatus,
		guardId: input.guard.guardId,
		observedValue,
		maximum: input.guard.maximum,
		finding,
	};
	return deepFreezeValue({...body, decisionDigest: canonicalJsonDigest(body)});
}

export function createResourceUsageEvidenceMaterial(input: {
	readonly guard: RuntimeResourceGuard;
	readonly capabilitySnapshot: CustomCodeCapabilitySnapshot;
	readonly value: number;
}): EvidenceMaterial<"resource_usage"> {
	assertCustomCodeCapabilitySnapshot(input.capabilitySnapshot);
	if (
		input.guard.capabilitySnapshotDigest !== input.capabilitySnapshot.snapshotDigest ||
		!Number.isFinite(input.value) ||
		input.value < 0 ||
		((input.guard.metric === "model_tokens" ||
			input.guard.metric === "changed_files" ||
			input.guard.metric === "trace_bytes") &&
			!Number.isSafeInteger(input.value))
	) {
		throw new Error("Resource usage Evidence input is invalid.");
	}
	return deepFreezeValue({
		schemaVersion: EVIDENCE_SCHEMA_VERSION,
		kind: "resource_usage",
		provenanceRefs: [input.guard.guardId],
		payload: {
			metric: input.guard.metric,
			unit: input.guard.unit as
				| "tokens"
				| "usd"
				| "milliseconds"
				| "files"
				| "bytes",
			scope: input.guard.scope,
			accountingWindow: input.guard.accountingWindow,
			value: input.value,
			aggregation: "complete_window",
			meterId: input.guard.capability.id,
			meterVersion: input.guard.capability.version,
			meterConfigurationDigest: input.guard.capability.configurationDigest,
			environmentDigest: input.capabilitySnapshot.environmentDigest,
			capabilitySnapshotDigest: input.capabilitySnapshot.snapshotDigest,
			templateBindingDigest: input.guard.templateBindingDigest,
			customCheckDefinitionDigest: input.guard.definitionDigest,
			protectedCustomCheckConfigSnapshotDigest:
				input.guard.protectedConfigSnapshotDigest,
		},
	});
}

function normalizeEstimates(
	value: readonly RuntimeResourceEstimate[],
): RuntimeResourceEstimate[] {
	if (!Array.isArray(value) || value.length > 32) {
		throw new Error("Runtime resource estimates are invalid.");
	}
	const estimates = value.map((estimate) => {
		assertExactKeys(
			estimate,
			["guardId", "capabilitySnapshotDigest", "value"],
			"Runtime resource estimate",
		);
		if (
			typeof estimate.guardId !== "string" ||
			!/^runtime-resource-guard:[0-9a-f]{64}$/.test(estimate.guardId) ||
			!Number.isFinite(estimate.value) ||
			estimate.value < 0
		) {
			throw new Error("Runtime resource estimate is invalid.");
		}
		return Object.freeze({
			guardId: estimate.guardId,
			capabilitySnapshotDigest: assertSha256Digest(
				estimate.capabilitySnapshotDigest,
				"Runtime resource estimate capabilitySnapshotDigest",
			),
			value: estimate.value,
		});
	});
	if (new Set(estimates.map((estimate) => estimate.guardId)).size !== estimates.length) {
		throw new Error("Runtime resource estimates contain duplicate guard ids.");
	}
	return estimates;
}
