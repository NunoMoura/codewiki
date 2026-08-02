import {compareText} from "../../change-trace/order.ts";
import {
	assertSha256Digest,
	canonicalJson,
	canonicalJsonDigest,
	toCanonicalJsonValue,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import {
	TRIAGE_CONFIDENCE,
	TRIAGE_EFFORTS,
	TRIAGE_LEVELS,
	TRIAGE_REVERSIBILITY,
	type BacklogTriageProjectionBinding,
	type NormalizedTriageEstimate,
	type TriageDimensionBasis,
	type TriageEstimateInput,
	type TriageSupportedValue,
} from "./contracts.ts";

const ESTIMATE_FIELDS = [
	"changeId",
	"changeRevisionId",
	"workStateDigest",
	"graphSnapshotDigest",
	"graphContentDigest",
	"dimensions",
] as const;
const DIMENSION_FIELDS = [
	"urgency",
	"expectedImpact",
	"strategicValue",
	"effort",
	"riskOfInaction",
	"implementationRisk",
	"reversibility",
	"confidence",
	"workUnblocked",
	"protectedEscalation",
] as const;
const BASIS_FIELDS = [
	"authority",
	"analysisClass",
	"inputProvenanceClasses",
	"canonicalRefs",
	"observedRefs",
	"evidenceRefs",
	"analysisRefs",
	"assumptions",
] as const;
const PROVENANCE_CLASSES = [
	"canonical_binding",
	"observed_binding",
	"deterministic_analysis",
	"inferred_analysis",
] as const;
const EVIDENCE_AUTHORITIES = [
	"asserted",
	"observed",
	"verified",
	"approved",
] as const;

export function normalizeTriageEstimates(
	inputs: readonly TriageEstimateInput[],
	binding: BacklogTriageProjectionBinding,
): readonly NormalizedTriageEstimate[] {
	if (!Array.isArray(inputs)) {
		throw new Error("Backlog triage estimates must be an array.");
	}
	if (inputs.length > 500) {
		throw new Error("Backlog triage accepts at most 500 estimates.");
	}
	const estimates = inputs.map((input, index) => normalizeEstimate(input, index, binding));
	const identities = new Set<string>();
	for (const estimate of estimates) {
		const identity = `${estimate.changeId}\u0000${estimate.changeRevisionId}`;
		if (identities.has(identity)) {
			throw new Error(
				`Backlog triage received multiple estimates for ${estimate.changeId} revision ${estimate.changeRevisionId}.`,
			);
		}
		identities.add(identity);
	}
	return Object.freeze(
		[...estimates].sort((left, right) =>
			compareText(
				`${left.changeId}\u0000${left.changeRevisionId}`,
				`${right.changeId}\u0000${right.changeRevisionId}`,
			),
		),
	);
}

function normalizeEstimate(
	input: TriageEstimateInput,
	index: number,
	binding: BacklogTriageProjectionBinding,
): NormalizedTriageEstimate {
	const label = `Backlog triage estimate ${index}`;
	assertExactKeys(input, ESTIMATE_FIELDS, label);
	const changeId = boundedText(input.changeId, `${label} changeId`, 160);
	assertSha256Digest(input.changeRevisionId, `${label} changeRevisionId`);
	assertSha256Digest(input.workStateDigest, `${label} workStateDigest`);
	assertSha256Digest(input.graphSnapshotDigest, `${label} graphSnapshotDigest`);
	assertSha256Digest(input.graphContentDigest, `${label} graphContentDigest`);
	if (input.workStateDigest !== binding.workStateDigest) {
		throw new Error(`${label} workStateDigest does not match the projection binding.`);
	}
	if (input.graphSnapshotDigest !== binding.graphSnapshotDigest) {
		throw new Error(`${label} graphSnapshotDigest does not match the projection binding.`);
	}
	if (input.graphContentDigest !== binding.graphContentDigest) {
		throw new Error(`${label} graphContentDigest does not match the projection binding.`);
	}
	assertExactKeys(input.dimensions, DIMENSION_FIELDS, `${label} dimensions`);
	const entries = Object.entries(input.dimensions);
	if (entries.length === 0) {
		throw new Error(`${label} must provide at least one supported dimension.`);
	}
	const dimensions: Record<string, TriageSupportedValue<unknown>> = {};
	for (const [name, supported] of entries) {
		dimensions[name] = normalizeDimension(name, supported, label);
	}
	const body = {
		changeId,
		changeRevisionId: input.changeRevisionId,
		workStateDigest: input.workStateDigest,
		graphSnapshotDigest: input.graphSnapshotDigest,
		graphContentDigest: input.graphContentDigest,
		dimensions,
	};
	if (Buffer.byteLength(canonicalJson(body), "utf8") > 16_384) {
		throw new Error(`${label} exceeds 16384 canonical UTF-8 bytes.`);
	}
	return toCanonicalJsonValue({
		...body,
		estimateDigest: canonicalJsonDigest(body),
	}) as unknown as NormalizedTriageEstimate;
}

function normalizeDimension(
	name: string,
	input: unknown,
	label: string,
): TriageSupportedValue<unknown> {
	assertExactKeys(input, ["value", "basis"], `${label} ${name}`);
	const record = input as {readonly value: unknown; readonly basis: TriageDimensionBasis};
	const value = normalizeDimensionValue(name, record.value, label);
	const basis = normalizeBasis(record.basis, `${label} ${name} basis`);
	return toCanonicalJsonValue({value, basis}) as unknown as TriageSupportedValue<unknown>;
}

function normalizeDimensionValue(name: string, value: unknown, label: string): unknown {
	if (
		name === "urgency" ||
		name === "expectedImpact" ||
		name === "strategicValue" ||
		name === "riskOfInaction" ||
		name === "implementationRisk"
	) {
		return enumValue(value, TRIAGE_LEVELS.slice(1), `${label} ${name}`);
	}
	if (name === "effort") {
		return enumValue(value, TRIAGE_EFFORTS.slice(1), `${label} ${name}`);
	}
	if (name === "reversibility") {
		return enumValue(value, TRIAGE_REVERSIBILITY.slice(1), `${label} ${name}`);
	}
	if (name === "confidence") {
		return enumValue(value, TRIAGE_CONFIDENCE.slice(1), `${label} ${name}`);
	}
	if (name === "workUnblocked") {
		if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1_000) {
			throw new Error(`${label} workUnblocked must be an integer from 0 to 1000.`);
		}
		return value;
	}
	if (name === "protectedEscalation") {
		if (typeof value !== "boolean") {
			throw new Error(`${label} protectedEscalation must be boolean.`);
		}
		return value;
	}
	throw new Error(`${label} received unsupported dimension ${name}.`);
}

function normalizeBasis(input: TriageDimensionBasis, label: string): TriageDimensionBasis {
	assertExactKeys(input, BASIS_FIELDS, label);
	const authority = enumValue(input.authority, EVIDENCE_AUTHORITIES, `${label} authority`);
	const analysisClass = enumValue(
		input.analysisClass,
		["deterministic_analysis", "inferred_analysis"],
		`${label} analysisClass`,
	);
	const inputProvenanceClasses = normalizeList(
		input.inputProvenanceClasses,
		`${label} inputProvenanceClasses`,
		4,
		64,
	).map((value) => enumValue(value, PROVENANCE_CLASSES, `${label} inputProvenanceClass`));
	const canonicalRefs = normalizeList(input.canonicalRefs, `${label} canonicalRefs`, 16, 500);
	const observedRefs = normalizeList(input.observedRefs, `${label} observedRefs`, 16, 500);
	const evidenceRefs = normalizeList(input.evidenceRefs, `${label} evidenceRefs`, 16, 500);
	const analysisRefs = normalizeList(input.analysisRefs, `${label} analysisRefs`, 16, 500);
	const assumptions = normalizeList(input.assumptions, `${label} assumptions`, 8, 500);
	if (analysisRefs.length === 0) {
		throw new Error(`${label} requires at least one analysisRef.`);
	}
	if (
		canonicalRefs.length === 0 &&
		observedRefs.length === 0 &&
		evidenceRefs.length === 0
	) {
		throw new Error(`${label} requires exact canonical, observed, or Evidence support.`);
	}
	return toCanonicalJsonValue({
		authority,
		analysisClass,
		inputProvenanceClasses,
		canonicalRefs,
		observedRefs,
		evidenceRefs,
		analysisRefs,
		assumptions,
	}) as unknown as TriageDimensionBasis;
}

function normalizeList(
	input: readonly string[],
	label: string,
	maximum: number,
	maxCodePoints: number,
): string[] {
	if (!Array.isArray(input)) throw new Error(`${label} must be an array.`);
	if (input.length > maximum) throw new Error(`${label} accepts at most ${maximum} values.`);
	const values = input.map((value, index) =>
		boundedText(value, `${label}[${index}]`, maxCodePoints),
	);
	const unique = new Set(values);
	if (unique.size !== values.length) throw new Error(`${label} must not contain duplicates.`);
	return [...values].sort(compareText);
}

function boundedText(input: unknown, label: string, maxCodePoints: number): string {
	if (typeof input !== "string") throw new Error(`${label} must be text.`);
	const value = input.replace(/\r\n?/gu, "\n").normalize("NFC").trim();
	if (!value) throw new Error(`${label} must not be empty.`);
	if ([...value].length > maxCodePoints) {
		throw new Error(`${label} exceeds ${maxCodePoints} Unicode code points.`);
	}
	if (/\p{Cc}/u.test(value)) throw new Error(`${label} contains prohibited controls.`);
	return value;
}

function enumValue<const T extends readonly string[]>(
	input: unknown,
	values: T,
	label: string,
): T[number] {
	if (typeof input !== "string" || !values.includes(input)) {
		throw new Error(`${label} must be one of: ${values.join(", ")}.`);
	}
	return input as T[number];
}
