import type {EvidenceObligation} from "../../evidence/obligations.ts";
import type {SemanticLoop} from "../../semantic-loop.ts";
import {
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import type {CustomCheckTypeId} from "./check-types.ts";
import {
	canonicalIsoTimestamp,
	compareCanonicalText,
	deepFreezeValue,
} from "./validation.ts";

export const CUSTOM_CODE_TEMPLATE_PROTOCOL = Object.freeze({
	id: "codewiki.custom-code-template",
	version: "1.0.0",
});

export const CUSTOM_CODE_CAPABILITY_PROTOCOL = Object.freeze({
	id: "codewiki.custom-code-capability-snapshot",
	version: "1.0.0",
	maxCapabilities: 16,
});

export const CUSTOM_CODE_TEMPLATE_IDS = ["resource_usage_limit"] as const;
export const RESOURCE_USAGE_METRICS = [
	"model_tokens",
	"cost_usd",
	"latency_ms",
	"changed_files",
	"trace_bytes",
] as const;
export const RESOURCE_USAGE_SCOPES = [
	"decision_attempt",
	"planning_attempt",
	"implementation_assignment",
	"implementation_attempt",
] as const;
export const RESOURCE_GUARD_ENFORCEMENT = [
	"preflight",
	"meter",
	"cancellation",
] as const;

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const CAPABILITY_VERSION = "1.0.0" as const;
const ALLOWED_CHECK_TYPES: readonly CustomCheckTypeId[] = [
	"implementation_quality",
	"delivery_and_release",
	"organization_policy",
];
const INTEGER_METRICS: readonly ResourceUsageMetric[] = [
	"model_tokens",
	"changed_files",
	"trace_bytes",
];

export type CustomCodeTemplateId = (typeof CUSTOM_CODE_TEMPLATE_IDS)[number];
export type ResourceUsageMetric = (typeof RESOURCE_USAGE_METRICS)[number];
export type ResourceUsageScope = (typeof RESOURCE_USAGE_SCOPES)[number];
export type ResourceGuardEnforcement =
	(typeof RESOURCE_GUARD_ENFORCEMENT)[number];

export interface ResourceUsageLimitParameters {
	readonly metric: ResourceUsageMetric;
	readonly scope: ResourceUsageScope;
	readonly maximum: number;
}

export interface CustomCodeTemplateSelection {
	readonly templateId: CustomCodeTemplateId;
	readonly parameters: ResourceUsageLimitParameters;
	readonly templateVersion?: typeof CUSTOM_CODE_TEMPLATE_PROTOCOL.version;
	readonly parametersDigest?: Sha256Digest;
	readonly bindingDigest?: Sha256Digest;
	readonly unit?: string;
	readonly accountingWindow?: string;
	readonly requiredCapabilityId?: string;
	readonly requiredCapabilityVersion?: typeof CAPABILITY_VERSION;
	readonly enforcement?: readonly ResourceGuardEnforcement[];
}

export interface CustomCodeTemplateBinding
	extends CustomCodeTemplateSelection {
	readonly templateVersion: typeof CUSTOM_CODE_TEMPLATE_PROTOCOL.version;
	readonly parametersDigest: Sha256Digest;
	readonly bindingDigest: Sha256Digest;
	readonly unit: string;
	readonly accountingWindow: string;
	readonly requiredCapabilityId: string;
	readonly requiredCapabilityVersion: typeof CAPABILITY_VERSION;
	readonly enforcement: readonly ResourceGuardEnforcement[];
}

export interface CustomCodeCapability {
	readonly id: string;
	readonly version: typeof CAPABILITY_VERSION;
	readonly configurationDigest: Sha256Digest;
	readonly metrics: readonly ResourceUsageMetric[];
	readonly scopes: readonly ResourceUsageScope[];
	readonly enforcement: readonly ResourceGuardEnforcement[];
}

export interface CustomCodeCapabilitySnapshot {
	readonly protocolId: typeof CUSTOM_CODE_CAPABILITY_PROTOCOL.id;
	readonly protocolVersion: typeof CUSTOM_CODE_CAPABILITY_PROTOCOL.version;
	readonly observedAt: string;
	readonly environmentDigest: Sha256Digest;
	readonly capabilities: readonly CustomCodeCapability[];
	readonly snapshotDigest: Sha256Digest;
}

export interface CustomCodeTemplateDescriptor {
	readonly id: CustomCodeTemplateId;
	readonly version: typeof CUSTOM_CODE_TEMPLATE_PROTOCOL.version;
	readonly evaluator: "code";
	readonly allowedCheckTypeIds: readonly CustomCheckTypeId[];
	readonly metrics: readonly ResourceUsageMetric[];
	readonly scopes: readonly ResourceUsageScope[];
	readonly parameterNames: readonly ["metric", "scope", "maximum"];
}

export interface ResourceUsageTemplateSemantics {
	readonly metric: ResourceUsageMetric;
	readonly unit: string;
	readonly scope: ResourceUsageScope;
	readonly loop: SemanticLoop;
	readonly accountingWindow: string;
	readonly maximum: number;
	readonly requiredCapabilityId: string;
	readonly requiredCapabilityVersion: typeof CAPABILITY_VERSION;
	readonly enforcement: readonly ResourceGuardEnforcement[];
}

export function listCustomCodeTemplates(): readonly CustomCodeTemplateDescriptor[] {
	return deepFreezeValue([
		{
			id: "resource_usage_limit",
			version: CUSTOM_CODE_TEMPLATE_PROTOCOL.version,
			evaluator: "code",
			allowedCheckTypeIds: [...ALLOWED_CHECK_TYPES],
			metrics: [...RESOURCE_USAGE_METRICS],
			scopes: [...RESOURCE_USAGE_SCOPES],
			parameterNames: ["metric", "scope", "maximum"],
		},
	]);
}

export function customCodeTemplateEvidenceObligations(
	binding: CustomCodeTemplateBinding,
): readonly EvidenceObligation[] {
	resourceUsageTemplateSemantics(binding.parameters);
	return deepFreezeValue([
		{
			id: "custom_resource_usage_observed",
			version: binding.templateVersion,
			kinds: ["resource_usage"],
			producerKinds: ["runtime", "external_service"],
			authorities: ["observed", "verified"],
			coverages: ["complete"],
			sensitivities: ["project", "private"],
			minimumCount: 1,
			subject: "candidate",
			freshness: "exact_boundary",
			artifact: "optional",
			contradiction: "indeterminate",
		},
	]);
}

export function normalizeCustomCodeTemplateBinding(input: {
	readonly value: CustomCodeTemplateSelection;
	readonly checkTypeId: CustomCheckTypeId;
	readonly applicabilityLoops: readonly SemanticLoop[];
	readonly allowRuntimeFields?: boolean;
}): CustomCodeTemplateBinding {
	const {value, checkTypeId, applicabilityLoops, allowRuntimeFields = false} = input;
	if (!isRecord(value)) {
		throw new Error("Custom Code Check template selection must be an object.");
	}
	assertExactKeys(
		value,
		[
			"templateId",
			"parameters",
			...(allowRuntimeFields
				? [
						"templateVersion",
						"parametersDigest",
						"bindingDigest",
						"unit",
						"accountingWindow",
						"requiredCapabilityId",
						"requiredCapabilityVersion",
						"enforcement",
					]
				: []),
		],
		"Custom Code Check template selection",
	);
	if (value.templateId !== "resource_usage_limit") {
		throw new Error("Custom Code Check templateId is unsupported.");
	}
	if (!ALLOWED_CHECK_TYPES.includes(checkTypeId)) {
		throw new Error(
			`Custom Code template resource_usage_limit is not allowed for ${checkTypeId}.`,
		);
	}
	const parameters = normalizeResourceUsageLimitParameters(value.parameters);
	const semantics = resourceUsageTemplateSemantics(parameters);
	if (
		applicabilityLoops.length !== 1 ||
		applicabilityLoops[0] !== semantics.loop
	) {
		throw new Error(
			`Resource usage scope ${parameters.scope} requires appliesWhen.loops ${semantics.loop}.`,
		);
	}
	const parametersDigest = canonicalJsonDigest(parameters);
	const semanticBinding = {
		templateId: value.templateId,
		templateVersion: CUSTOM_CODE_TEMPLATE_PROTOCOL.version,
		parameters,
		parametersDigest,
		unit: semantics.unit,
		accountingWindow: semantics.accountingWindow,
		requiredCapabilityId: semantics.requiredCapabilityId,
		requiredCapabilityVersion: semantics.requiredCapabilityVersion,
		enforcement: [...semantics.enforcement],
	};
	const bindingDigest = canonicalJsonDigest(semanticBinding);
	if (allowRuntimeFields) {
		assertRuntimeTemplateFields({value, expected: {...semanticBinding, bindingDigest}});
	}
	return deepFreezeValue({...semanticBinding, bindingDigest});
}

export function normalizeResourceUsageLimitParameters(
	value: ResourceUsageLimitParameters,
): ResourceUsageLimitParameters {
	if (!isRecord(value)) {
		throw new Error("Resource usage limit parameters must be an object.");
	}
	assertExactKeys(
		value,
		["metric", "scope", "maximum"],
		"Resource usage limit parameters",
	);
	if (!RESOURCE_USAGE_METRICS.includes(value.metric as ResourceUsageMetric)) {
		throw new Error("Resource usage limit metric is invalid.");
	}
	if (!RESOURCE_USAGE_SCOPES.includes(value.scope as ResourceUsageScope)) {
		throw new Error("Resource usage limit scope is invalid.");
	}
	if (
		typeof value.maximum !== "number" ||
		!Number.isFinite(value.maximum) ||
		value.maximum <= 0 ||
		(INTEGER_METRICS.includes(value.metric as ResourceUsageMetric) &&
			!Number.isSafeInteger(value.maximum))
	) {
		throw new Error("Resource usage limit maximum is invalid.");
	}
	return Object.freeze({
		metric: value.metric as ResourceUsageMetric,
		scope: value.scope as ResourceUsageScope,
		maximum: value.maximum,
	});
}

export function resourceUsageMeasurementShape(
	metric: ResourceUsageMetric,
): "count" | "score" {
	return INTEGER_METRICS.includes(metric) ? "count" : "score";
}

export function resourceUsageTemplateSemantics(
	parameters: ResourceUsageLimitParameters,
): ResourceUsageTemplateSemantics {
	const normalized = normalizeResourceUsageLimitParameters(parameters);
	const metric = metricSemantics(normalized.metric);
	const scope = scopeSemantics(normalized.scope);
	return deepFreezeValue({
		metric: normalized.metric,
		unit: metric.unit,
		scope: normalized.scope,
		loop: scope.loop,
		accountingWindow: scope.accountingWindow,
		maximum: normalized.maximum,
		requiredCapabilityId: metric.capabilityId,
		requiredCapabilityVersion: CAPABILITY_VERSION,
		enforcement: [...RESOURCE_GUARD_ENFORCEMENT],
	});
}

export function customCodeTemplateExecutionIdentity(
	binding: CustomCodeTemplateBinding,
): {readonly id: string; readonly version: string; readonly kind: "code"} {
	const normalized = normalizeCustomCodeTemplateBinding({
		value: binding,
		checkTypeId: "organization_policy",
		applicabilityLoops: [resourceUsageTemplateSemantics(binding.parameters).loop],
		allowRuntimeFields: true,
	});
	return Object.freeze({
		id: `codewiki.custom-code.${normalized.templateId}`,
		version: normalized.templateVersion,
		kind: "code",
	});
}

export function createCustomCodeCapabilitySnapshot(input: {
	readonly observedAt: string;
	readonly environmentDigest: Sha256Digest;
	readonly capabilities: readonly CustomCodeCapability[];
}): CustomCodeCapabilitySnapshot {
	const body = {
		protocolId: CUSTOM_CODE_CAPABILITY_PROTOCOL.id,
		protocolVersion: CUSTOM_CODE_CAPABILITY_PROTOCOL.version,
		observedAt: canonicalIsoTimestamp(
			input.observedAt,
			"Custom Code capability snapshot observedAt",
		),
		environmentDigest: digest(
			input.environmentDigest,
			"Custom Code capability snapshot environmentDigest",
		),
		capabilities: normalizeCapabilities(input.capabilities),
	};
	return deepFreezeValue({...body, snapshotDigest: canonicalJsonDigest(body)});
}

export function assertCustomCodeCapabilitySnapshot(
	value: CustomCodeCapabilitySnapshot,
): void {
	if (!isRecord(value)) {
		throw new Error("Custom Code capability snapshot must be an object.");
	}
	assertExactKeys(
		value,
		[
			"protocolId",
			"protocolVersion",
			"observedAt",
			"environmentDigest",
			"capabilities",
			"snapshotDigest",
		],
		"Custom Code capability snapshot",
	);
	const expected = createCustomCodeCapabilitySnapshot({
		observedAt: value.observedAt,
		environmentDigest: value.environmentDigest,
		capabilities: value.capabilities,
	});
	if (
		value.protocolId !== expected.protocolId ||
		value.protocolVersion !== expected.protocolVersion ||
		value.snapshotDigest !== expected.snapshotDigest
	) {
		throw new Error("Custom Code capability snapshot identity is invalid.");
	}
}

export function assertCustomCodeTemplateCapability(input: {
	readonly binding: CustomCodeTemplateBinding;
	readonly capabilitySnapshot: CustomCodeCapabilitySnapshot;
}): CustomCodeCapability {
	assertCustomCodeCapabilitySnapshot(input.capabilitySnapshot);
	const semantics = resourceUsageTemplateSemantics(input.binding.parameters);
	const capability = input.capabilitySnapshot.capabilities.find(
		(entry) =>
			entry.id === semantics.requiredCapabilityId &&
			entry.version === semantics.requiredCapabilityVersion,
	);
	if (!capability) {
		throw new Error(
			`Custom Code Check requires unavailable capability ${semantics.requiredCapabilityId}@${semantics.requiredCapabilityVersion}.`,
		);
	}
	if (
		!capability.metrics.includes(semantics.metric) ||
		!capability.scopes.includes(semantics.scope) ||
		semantics.enforcement.some(
			(enforcement) => !capability.enforcement.includes(enforcement),
		)
	) {
		throw new Error(
			`Custom Code capability ${capability.id} does not cover exact metric, scope, and enforcement.`,
		);
	}
	return capability;
}

function normalizeCapabilities(
	value: readonly CustomCodeCapability[],
): CustomCodeCapability[] {
	if (
		!Array.isArray(value) ||
		value.length > CUSTOM_CODE_CAPABILITY_PROTOCOL.maxCapabilities
	) {
		throw new Error("Custom Code capabilities are invalid.");
	}
	const normalized = value.map((capability) => normalizeCapability(capability));
	const ids = normalized.map((capability) => capability.id);
	if (new Set(ids).size !== ids.length) {
		throw new Error("Custom Code capabilities cannot contain duplicate ids.");
	}
	return normalized.sort((...values) =>
		compareCanonicalText(values[0].id, values[1].id),
	);
}

function normalizeCapability(value: CustomCodeCapability): CustomCodeCapability {
	if (!isRecord(value)) {
		throw new Error("Custom Code capability must be an object.");
	}
	assertExactKeys(
		value,
		["id", "version", "configurationDigest", "metrics", "scopes", "enforcement"],
		"Custom Code capability",
	);
	const id = capabilityId(value.id);
	const metrics = enumArray(
		value.metrics,
		RESOURCE_USAGE_METRICS,
		"Custom Code capability metrics",
	);
	const scopes = enumArray(
		value.scopes,
		RESOURCE_USAGE_SCOPES,
		"Custom Code capability scopes",
	);
	const enforcement = enumArray(
		value.enforcement,
		RESOURCE_GUARD_ENFORCEMENT,
		"Custom Code capability enforcement",
	);
	if (value.version !== CAPABILITY_VERSION) {
		throw new Error("Custom Code capability version is invalid.");
	}
	for (const metric of metrics) {
		if (metricSemantics(metric).capabilityId !== id) {
			throw new Error(
				`Custom Code capability ${id} cannot claim metric ${metric}.`,
			);
		}
	}
	return deepFreezeValue({
		id,
		version: value.version,
		configurationDigest: digest(
			value.configurationDigest,
			"Custom Code capability configurationDigest",
		),
		metrics,
		scopes,
		enforcement,
	});
}

function assertRuntimeTemplateFields(input: {
	readonly value: CustomCodeTemplateSelection;
	readonly expected: CustomCodeTemplateBinding;
}): void {
	const {value, expected} = input;
	for (const field of [
		"templateVersion",
		"parametersDigest",
		"bindingDigest",
		"unit",
		"accountingWindow",
		"requiredCapabilityId",
		"requiredCapabilityVersion",
	] as const) {
		if (value[field] !== expected[field]) {
			throw new Error(`Custom Code Check ${field} does not match template.`);
		}
	}
	if (
		!Array.isArray(value.enforcement) ||
		value.enforcement.length !== expected.enforcement.length ||
		value.enforcement.some((...entries) => {
			const [entry, index] = entries;
			return entry !== expected.enforcement[index];
		})
	) {
		throw new Error("Custom Code Check enforcement does not match template.");
	}
}

function metricSemantics(metric: ResourceUsageMetric): {
	readonly unit: string;
	readonly capabilityId: string;
} {
	if (metric === "model_tokens") {
		return {unit: "tokens", capabilityId: "codewiki.model-usage-meter"};
	}
	if (metric === "cost_usd") {
		return {unit: "usd", capabilityId: "codewiki.model-usage-meter"};
	}
	if (metric === "latency_ms") {
		return {unit: "milliseconds", capabilityId: "codewiki.model-usage-meter"};
	}
	if (metric === "changed_files") {
		return {unit: "files", capabilityId: "codewiki.git-change-meter"};
	}
	return {unit: "bytes", capabilityId: "codewiki.trace-size-meter"};
}

function scopeSemantics(scope: ResourceUsageScope): {
	readonly loop: SemanticLoop;
	readonly accountingWindow: string;
} {
	if (scope === "decision_attempt") {
		return {loop: "decision", accountingWindow: "one Decision attempt"};
	}
	if (scope === "planning_attempt") {
		return {loop: "planning", accountingWindow: "one Planning attempt"};
	}
	if (scope === "implementation_assignment") {
		return {
			loop: "implementation",
			accountingWindow: "one Implementation Assignment attempt",
		};
	}
	return {
		loop: "implementation",
		accountingWindow: "one integrated Implementation attempt",
	};
}

function enumArray<T extends string>(
	...input: [readonly T[], readonly T[], string]
): T[] {
	const [value, allowed, label] = input;
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(`${label} must contain at least one value.`);
	}
	const normalized = value.map((entry) => {
		if (!allowed.includes(entry)) throw new Error(`${label} contains an invalid value.`);
		return entry;
	});
	if (new Set(normalized).size !== normalized.length) {
		throw new Error(`${label} cannot contain duplicates.`);
	}
	return normalized.sort(compareCanonicalText);
}

function capabilityId(value: unknown): string {
	if (
		typeof value !== "string" ||
		!/^codewiki\.(?:model-usage|git-change|trace-size)-meter$/u.test(value)
	) {
		throw new Error("Custom Code capability id is invalid.");
	}
	return value;
}

function digest(...input: [unknown, string]): Sha256Digest {
	const [value, label] = input;
	if (typeof value !== "string" || !DIGEST.test(value)) {
		throw new Error(`${label} is invalid.`);
	}
	return value as Sha256Digest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
