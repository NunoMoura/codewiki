import type { SemanticLoop } from "../semantic-loop.ts";
import { canonicalJsonDigest as resolvedExitPolicyDigest } from "./identity.ts";

export { resolvedExitPolicyDigest };

export const LOOP_EXIT_SCHEMA_VERSION = 1;

export type CheckExecutionKind = "code" | "model";
export type CheckMeasurementKind = "qualitative" | "quantitative";
export type CheckMeasurementShape =
	| "boolean"
	| "score"
	| "count"
	| "set"
	| "structured";
export type CheckEnforcement = "observe" | "warn" | "require";
export type CheckResultStatus = "pass" | "fail" | "indeterminate";
export type ExitReportStatus = "pass" | "fail" | "indeterminate";
export type CheckExclusionReason =
	| "not_applicable"
	| "covered_by_invariant"
	| "escalated_elsewhere";

export type CheckJsonValue =
	| null
	| boolean
	| number
	| string
	| CheckJsonValue[]
	| { [key: string]: CheckJsonValue };

export interface CheckExecutionSpec {
	id: string;
	version: string;
	kind: CheckExecutionKind;
}

export interface CheckMeasurementSpec {
	kind: CheckMeasurementKind;
	shape: CheckMeasurementShape;
	minimum?: number;
	maximum?: number;
	schemaRef?: string;
}

export interface CheckDefinition {
	id: string;
	version: string;
	description: string;
	requirement: string;
	requirementDigest: string;
	execution: CheckExecutionSpec;
	measurement: CheckMeasurementSpec;
	evidenceAdapterIds: string[];
	repairTarget: string;
	cost: number;
	timeoutMs: number;
	protected: boolean;
}

export interface CheckBinding {
	checkId: string;
	checkVersion: string;
	requirementDigest: string;
	checkDigest: string;
	enforcement: CheckEnforcement;
	required: boolean;
	parameters: Record<string, CheckJsonValue>;
	dependsOn: string[];
	activatedBy: string[];
	ruleRefs: string[];
}

export type CheckMeasurement =
	| { shape: "boolean"; value: boolean }
	| { shape: "score"; value: number }
	| { shape: "count"; value: number }
	| { shape: "set"; values: string[] }
	| {
			shape: "structured";
			schemaRef: string;
			value: Record<string, CheckJsonValue>;
	  };

export interface CheckExecutionIdentity {
	id: string;
	version: string;
	adapterVersion?: string;
	modelRef?: string;
	configurationDigest?: string;
	trialPolicy?: string;
	aggregationPolicy?: string;
}

export interface CheckResult {
	checkId: string;
	checkVersion: string;
	candidateDigest: string;
	status: CheckResultStatus;
	measurement?: CheckMeasurement;
	evidenceRefs: string[];
	findings: string[];
	feedback?: string;
	execution: CheckExecutionIdentity;
}

export interface ExitReport {
	schemaVersion: typeof LOOP_EXIT_SCHEMA_VERSION;
	loop: SemanticLoop;
	candidateDigest: string;
	policyDigest: string;
	status: ExitReportStatus;
	checkResults: CheckResult[];
}

export interface CheckExclusion {
	checkId: string;
	checkVersion: string;
	requirementDigest: string;
	checkDigest: string;
	reason: CheckExclusionReason;
	refs: string[];
}

export interface ResolvedExitPolicy {
	schemaVersion: typeof LOOP_EXIT_SCHEMA_VERSION;
	loop: SemanticLoop;
	candidateDigest: string;
	catalogDigest: string;
	selectorInputDigest: string;
	bindings: CheckBinding[];
	exclusions: CheckExclusion[];
	protectedCheckIds: string[];
	policyDigest: string;
}

export interface CreateResolvedExitPolicyInput {
	loop: SemanticLoop;
	candidateDigest: string;
	catalogDigest: string;
	selectorInputDigest: string;
	bindings: CheckBinding[];
	exclusions?: CheckExclusion[];
	protectedCheckIds?: string[];
}

export function createResolvedExitPolicy(
	input: CreateResolvedExitPolicyInput,
): ResolvedExitPolicy {
	const policyWithoutDigest = normalizePolicyInput(input);
	assertValidPolicyShape(policyWithoutDigest);
	return {
		...policyWithoutDigest,
		policyDigest: resolvedExitPolicyDigest(policyWithoutDigest),
	};
}

export function assertValidResolvedExitPolicy(
	policy: ResolvedExitPolicy,
): void {
	if (policy.schemaVersion !== LOOP_EXIT_SCHEMA_VERSION) {
		throw new Error(
			`Resolved Exit Policy uses unsupported schema version ${policy.schemaVersion}.`,
		);
	}
	const { policyDigest, ...policyWithoutDigest } = policy;
	assertDigest(policyDigest, "policyDigest");
	assertValidPolicyShape(policyWithoutDigest);
	const expectedDigest = resolvedExitPolicyDigest(policyWithoutDigest);
	if (policyDigest !== expectedDigest) {
		throw new Error(
			`Resolved Exit Policy digest mismatch: expected ${expectedDigest}.`,
		);
	}
}

function normalizePolicyInput(
	input: CreateResolvedExitPolicyInput,
): Omit<ResolvedExitPolicy, "policyDigest"> {
	return {
		schemaVersion: LOOP_EXIT_SCHEMA_VERSION,
		loop: input.loop,
		candidateDigest: input.candidateDigest,
		catalogDigest: input.catalogDigest,
		selectorInputDigest: input.selectorInputDigest,
		bindings: [...input.bindings]
			.map((binding) => ({
				...binding,
				parameters: sortObject(binding.parameters),
				dependsOn: sortedUnique(binding.dependsOn),
				activatedBy: sortedUnique(binding.activatedBy),
				ruleRefs: sortedUnique(binding.ruleRefs),
			}))
			.sort((left, right) => left.checkId.localeCompare(right.checkId)),
		exclusions: [...(input.exclusions ?? [])]
			.map((exclusion) => ({
				...exclusion,
				refs: sortedUnique(exclusion.refs),
			}))
			.sort((left, right) => left.checkId.localeCompare(right.checkId)),
		protectedCheckIds: sortedUnique(input.protectedCheckIds ?? []),
	};
}

function assertValidPolicyShape(
	policy: Omit<ResolvedExitPolicy, "policyDigest">,
): void {
	assertDigest(policy.candidateDigest, "candidateDigest");
	assertDigest(policy.catalogDigest, "catalogDigest");
	assertDigest(policy.selectorInputDigest, "selectorInputDigest");
	assertUniqueIds(
		policy.bindings.map((binding) => binding.checkId),
		"binding Check",
	);
	assertUniqueIds(
		policy.exclusions.map((exclusion) => exclusion.checkId),
		"excluded Check",
	);

	const activeIds = new Set(policy.bindings.map((binding) => binding.checkId));
	for (const binding of policy.bindings) {
		assertStableId(binding.checkId, "binding checkId");
		assertVersion(binding.checkVersion, `Check ${binding.checkId}`);
		assertDigest(
			binding.requirementDigest,
			`Check ${binding.checkId} requirementDigest`,
		);
		assertDigest(binding.checkDigest, `Check ${binding.checkId} checkDigest`);
		if (binding.activatedBy.length === 0) {
			throw new Error(`Check binding ${binding.checkId} requires activatedBy.`);
		}
		for (const dependency of binding.dependsOn) {
			if (!activeIds.has(dependency)) {
				throw new Error(
					`Check binding ${binding.checkId} has unknown dependency ${dependency}.`,
				);
			}
		}
	}
	assertAcyclicBindings(policy.bindings);

	for (const exclusion of policy.exclusions) {
		assertStableId(exclusion.checkId, "exclusion checkId");
		assertVersion(exclusion.checkVersion, `Check ${exclusion.checkId}`);
		assertDigest(
			exclusion.requirementDigest,
			`Check ${exclusion.checkId} exclusion requirementDigest`,
		);
		assertDigest(
			exclusion.checkDigest,
			`Check ${exclusion.checkId} exclusion checkDigest`,
		);
		if (activeIds.has(exclusion.checkId)) {
			throw new Error(
				`Check ${exclusion.checkId} cannot be both active and excluded.`,
			);
		}
	}
	for (const protectedId of policy.protectedCheckIds) {
		if (!activeIds.has(protectedId)) {
			throw new Error(`Protected Check ${protectedId} must remain active.`);
		}
	}
}

function assertAcyclicBindings(bindings: CheckBinding[]): void {
	const byId = new Map(bindings.map((binding) => [binding.checkId, binding]));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): void => {
		if (visiting.has(id)) {
			throw new Error(`Check dependency cycle includes ${id}.`);
		}
		if (visited.has(id)) return;
		visiting.add(id);
		for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
		visiting.delete(id);
		visited.add(id);
	};
	for (const binding of bindings) visit(binding.checkId);
}

function assertUniqueIds(values: string[], label: string): void {
	const seen = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) throw new Error(`Duplicate ${label} ${value}.`);
		seen.add(value);
	}
}

function assertStableId(value: string, label: string): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
		throw new Error(`${label} must be a stable id.`);
	}
}

function assertVersion(value: string, label: string): void {
	if (value.trim().length === 0) throw new Error(`${label} requires a version.`);
}

function assertDigest(value: string, label: string): void {
	if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
		throw new Error(`Resolved Exit Policy ${label} must be a sha256 digest.`);
	}
}

function sortedUnique(values: string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sortObject(
	value: Record<string, CheckJsonValue>,
): Record<string, CheckJsonValue> {
	return Object.fromEntries(
		Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
	);
}
