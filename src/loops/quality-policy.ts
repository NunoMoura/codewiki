import { createHash } from "node:crypto";
import type { TraceLoop } from "../traces/types.ts";

export const QUALITY_POLICY_SCHEMA_VERSION = 1;

export type QualityVerifierKind =
	| "deterministic"
	| "model"
	| "external"
	| "human";
export type QualityMeasurementShape =
	| "boolean"
	| "score"
	| "count"
	| "set"
	| "structured";
export type QualityEnforcementMode = "observe" | "warn" | "enforce";
export type QualityAssessmentStatus = "met" | "unmet" | "indeterminate";
export type QualityGateStatus = "pass" | "fail" | "indeterminate";
export type QualityReportStatus = "pass" | "fail" | "indeterminate";
export type QualityGateFailureRoute = "repair" | "route_back" | "block";
export type QualityPolicyExclusionReason =
	| "not_applicable"
	| "covered_by_invariant"
	| "escalated_elsewhere";

export type QualityJsonValue =
	| null
	| boolean
	| number
	| string
	| QualityJsonValue[]
	| { [key: string]: QualityJsonValue };

export interface QualityVerifierSpec {
	id: string;
	version: string;
	kind: QualityVerifierKind;
}

export interface QualityMeasurementSpec {
	shape: QualityMeasurementShape;
	minimum?: number;
	maximum?: number;
	schemaRef?: string;
}

export interface QualityStandard {
	id: string;
	version: string;
	description: string;
	assessmentCriteria: string[];
	verifier: QualityVerifierSpec;
	measurement: QualityMeasurementSpec;
	evidenceAdapterIds: string[];
	repairTarget: string;
	cost: number;
	timeoutMs: number;
	protected: boolean;
}

export interface QualityStandardBinding {
	standardId: string;
	standardVersion: string;
	enforcement: QualityEnforcementMode;
	required: boolean;
	parameters: Record<string, QualityJsonValue>;
	evaluationDependsOn: string[];
	activatedBy: string[];
	ruleRefs: string[];
}

export type QualityMeasurement =
	| { shape: "boolean"; value: boolean }
	| { shape: "score"; value: number }
	| { shape: "count"; value: number }
	| { shape: "set"; values: string[] }
	| {
			shape: "structured";
			schemaRef: string;
			value: Record<string, QualityJsonValue>;
	  };

export interface QualityAssessmentVerifierIdentity {
	id: string;
	version: string;
	adapterVersion?: string;
	modelRef?: string;
	configurationDigest?: string;
	trialPolicy?: string;
	aggregationPolicy?: string;
}

export interface QualityAssessment {
	standardId: string;
	standardVersion: string;
	candidateDigest: string;
	status: QualityAssessmentStatus;
	measurement?: QualityMeasurement;
	evidenceRefs: string[];
	findings: string[];
	feedback?: string;
	verifier: QualityAssessmentVerifierIdentity;
}

export interface QualityDeterministicGate {
	id: string;
	version: string;
	kind: "all_required" | "threshold" | "authority";
	standardIds: string[];
	threshold?: number;
	onFailure: QualityGateFailureRoute;
}

export interface QualityDeterministicGateResult {
	gateId: string;
	gateVersion: string;
	status: QualityGateStatus;
	assessmentStandardIds: string[];
	route?: QualityGateFailureRoute;
	message?: string;
}

export interface QualityReport {
	schemaVersion: typeof QUALITY_POLICY_SCHEMA_VERSION;
	stage: TraceLoop;
	candidateDigest: string;
	policyDigest: string;
	status: QualityReportStatus;
	assessments: QualityAssessment[];
	gateResults: QualityDeterministicGateResult[];
}

export interface QualityPolicyExclusion {
	standardId: string;
	standardVersion: string;
	reason: QualityPolicyExclusionReason;
	refs: string[];
}

export interface QualityPolicyResolution {
	schemaVersion: typeof QUALITY_POLICY_SCHEMA_VERSION;
	stage: TraceLoop;
	candidateDigest: string;
	selectorInputDigest: string;
	bindings: QualityStandardBinding[];
	exclusions: QualityPolicyExclusion[];
	gates: QualityDeterministicGate[];
	protectedStandardIds: string[];
	policyDigest: string;
}

export interface CreateQualityPolicyResolutionInput {
	stage: TraceLoop;
	candidateDigest: string;
	selectorInputDigest: string;
	bindings: QualityStandardBinding[];
	exclusions?: QualityPolicyExclusion[];
	gates: QualityDeterministicGate[];
	protectedStandardIds?: string[];
}

export function createQualityPolicyResolution(
	input: CreateQualityPolicyResolutionInput,
): QualityPolicyResolution {
	const resolutionWithoutDigest = normalizeResolutionInput(input);
	assertValidResolutionShape(resolutionWithoutDigest);
	return {
		...resolutionWithoutDigest,
		policyDigest: qualityPolicyDigest(resolutionWithoutDigest),
	};
}

export function assertValidQualityPolicyResolution(
	resolution: QualityPolicyResolution,
): void {
	if (resolution.schemaVersion !== QUALITY_POLICY_SCHEMA_VERSION) {
		throw new Error(
			`Quality Policy resolution uses unsupported schema version ${resolution.schemaVersion}.`,
		);
	}
	const { policyDigest, ...resolutionWithoutDigest } = resolution;
	assertDigest(policyDigest, "policyDigest");
	assertValidResolutionShape(resolutionWithoutDigest);
	const expectedDigest = qualityPolicyDigest(resolutionWithoutDigest);
	if (policyDigest !== expectedDigest) {
		throw new Error(
			`Quality Policy resolution digest mismatch: expected ${expectedDigest}.`,
		);
	}
}

function normalizeResolutionInput(
	input: CreateQualityPolicyResolutionInput,
): Omit<QualityPolicyResolution, "policyDigest"> {
	return {
		schemaVersion: QUALITY_POLICY_SCHEMA_VERSION,
		stage: input.stage,
		candidateDigest: input.candidateDigest,
		selectorInputDigest: input.selectorInputDigest,
		bindings: [...input.bindings]
			.map((binding) => ({
				...binding,
				parameters: sortObject(binding.parameters),
				evaluationDependsOn: sortedUnique(binding.evaluationDependsOn),
				activatedBy: sortedUnique(binding.activatedBy),
				ruleRefs: sortedUnique(binding.ruleRefs),
			}))
			.sort((left, right) => left.standardId.localeCompare(right.standardId)),
		exclusions: [...(input.exclusions ?? [])]
			.map((exclusion) => ({
				...exclusion,
				refs: sortedUnique(exclusion.refs),
			}))
			.sort((left, right) => left.standardId.localeCompare(right.standardId)),
		gates: [...input.gates]
			.map((gate) => ({
				...gate,
				standardIds: sortedUnique(gate.standardIds),
			}))
			.sort((left, right) => left.id.localeCompare(right.id)),
		protectedStandardIds: sortedUnique(input.protectedStandardIds ?? []),
	};
}

function assertValidResolutionShape(
	resolution: Omit<QualityPolicyResolution, "policyDigest">,
): void {
	assertDigest(resolution.candidateDigest, "candidateDigest");
	assertDigest(resolution.selectorInputDigest, "selectorInputDigest");
	assertUniqueIds(
		resolution.bindings.map((binding) => binding.standardId),
		"binding standard",
	);
	assertUniqueIds(
		resolution.exclusions.map((exclusion) => exclusion.standardId),
		"excluded standard",
	);
	assertUniqueIds(
		resolution.gates.map((gate) => gate.id),
		"gate",
	);

	const activeIds = new Set(
		resolution.bindings.map((binding) => binding.standardId),
	);
	for (const binding of resolution.bindings) {
		assertStableId(binding.standardId, "binding standardId");
		assertVersion(binding.standardVersion, `Standard ${binding.standardId}`);
		if (binding.activatedBy.length === 0) {
			throw new Error(
				`Quality Standard binding ${binding.standardId} requires activatedBy.`,
			);
		}
		for (const dependency of binding.evaluationDependsOn) {
			if (!activeIds.has(dependency)) {
				throw new Error(
					`Quality Standard binding ${binding.standardId} has unknown evaluation dependency ${dependency}.`,
				);
			}
		}
	}
	assertAcyclicBindings(resolution.bindings);

	for (const exclusion of resolution.exclusions) {
		assertStableId(exclusion.standardId, "exclusion standardId");
		assertVersion(
			exclusion.standardVersion,
			`Standard ${exclusion.standardId}`,
		);
		if (activeIds.has(exclusion.standardId)) {
			throw new Error(
				`Quality Standard ${exclusion.standardId} cannot be both active and excluded.`,
			);
		}
	}
	for (const protectedId of resolution.protectedStandardIds) {
		if (!activeIds.has(protectedId)) {
			throw new Error(
				`Protected Quality Standard ${protectedId} must remain active.`,
			);
		}
	}
	for (const gate of resolution.gates) {
		assertStableId(gate.id, "gate id");
		assertVersion(gate.version, `Gate ${gate.id}`);
		if (gate.standardIds.length === 0) {
			throw new Error(`Quality gate ${gate.id} requires Standard refs.`);
		}
		for (const standardId of gate.standardIds) {
			if (!activeIds.has(standardId)) {
				throw new Error(
					`Quality gate ${gate.id} references inactive Standard ${standardId}.`,
				);
			}
		}
		if (gate.kind === "threshold" && gate.threshold === undefined) {
			throw new Error(`Threshold Quality gate ${gate.id} requires threshold.`);
		}
	}
}

function assertAcyclicBindings(bindings: QualityStandardBinding[]): void {
	const byId = new Map(
		bindings.map((binding) => [binding.standardId, binding]),
	);
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): void => {
		if (visiting.has(id)) {
			throw new Error(
				`Quality Standard evaluation dependency cycle includes ${id}.`,
			);
		}
		if (visited.has(id)) return;
		visiting.add(id);
		for (const dependency of byId.get(id)?.evaluationDependsOn ?? []) {
			visit(dependency);
		}
		visiting.delete(id);
		visited.add(id);
	};
	for (const binding of bindings) visit(binding.standardId);
}

function assertUniqueIds(values: string[], label: string): void {
	const seen = new Set<string>();
	for (const value of values) {
		if (seen.has(value))
			throw new Error(`Duplicate Quality ${label} ${value}.`);
		seen.add(value);
	}
}

function assertStableId(value: string, label: string): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
		throw new Error(`Quality ${label} must be a stable id.`);
	}
}

function assertVersion(value: string, label: string): void {
	if (value.trim().length === 0)
		throw new Error(`${label} requires a version.`);
}

function assertDigest(value: string, label: string): void {
	if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
		throw new Error(`Quality Policy ${label} must be a sha256 digest.`);
	}
}

function sortedUnique(values: string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sortObject(
	value: Record<string, QualityJsonValue>,
): Record<string, QualityJsonValue> {
	return Object.fromEntries(
		Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
	);
}

export function qualityPolicyDigest(value: unknown): string {
	return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}
