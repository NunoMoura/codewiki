import {Type} from "typebox";
import {isCanonicalTraceRef} from "../traces/refs.ts";
import {toCanonicalJsonValue} from "../utils/canonical-json.ts";
import {assertTypeboxSchema} from "../utils/json.ts";

export const CHANGE_DEFECT_PROFILE_PROTOCOL = Object.freeze({
	id: "codewiki.change-defect-profile",
	version: "1.0.0",
} as const);

export const CHANGE_DEFECT_CATEGORIES = [
	"accessibility",
	"behavior",
	"compatibility",
	"configuration",
	"data",
	"delivery",
	"dependency",
	"documentation",
	"knowledge",
	"outcome",
	"performance",
	"privacy",
	"reliability",
	"security",
] as const;

export const CHANGE_DEFECT_SEVERITIES = [
	"unknown",
	"informational",
	"low",
	"medium",
	"high",
	"critical",
] as const;

const CHANGE_DEFECT_LIKELIHOODS = [
	"unknown",
	"unlikely",
	"possible",
	"likely",
	"demonstrated",
] as const;

const CHANGE_DEFECT_EXPOSURES = [
	"unknown",
	"isolated",
	"limited",
	"broad",
	"systemic",
] as const;

export const CHANGE_DEFECT_CONFIDENCES = [
	"unknown",
	"low",
	"medium",
	"high",
] as const;

const CHANGE_DEFECT_REPRODUCIBILITY = [
	"unknown",
	"not_attempted",
	"reported",
	"not_reproduced",
	"intermittent",
	"reproducible",
] as const;

const CHANGE_DEFECT_REGRESSION_STATUSES = [
	"unknown",
	"not_regression",
	"suspected",
	"confirmed",
] as const;

const CHANGE_SECURITY_CLASSIFICATIONS = [
	"unknown",
	"suspected_vulnerability",
	"weakness",
	"misconfiguration",
	"dependency_advisory",
	"secret_exposure",
	"privacy_finding",
] as const;

const CHANGE_SECURITY_IDENTIFIER_SCHEMES = [
	"cwe",
	"cve",
	"ghsa",
	"osv",
] as const;

const PROHIBITED_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const PRIVATE_DATA_PATTERNS = [
	/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/iu,
	/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/iu,
	/\b(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/iu,
] as const;

export type ChangeDefectCategory = (typeof CHANGE_DEFECT_CATEGORIES)[number];
export type ChangeDefectSeverity = (typeof CHANGE_DEFECT_SEVERITIES)[number];
export type ChangeDefectLikelihood =
	(typeof CHANGE_DEFECT_LIKELIHOODS)[number];
export type ChangeDefectExposure = (typeof CHANGE_DEFECT_EXPOSURES)[number];
export type ChangeDefectConfidence =
	(typeof CHANGE_DEFECT_CONFIDENCES)[number];
export type ChangeDefectReproducibility =
	(typeof CHANGE_DEFECT_REPRODUCIBILITY)[number];
export type ChangeDefectRegressionStatus =
	(typeof CHANGE_DEFECT_REGRESSION_STATUSES)[number];
export type ChangeSecurityClassification =
	(typeof CHANGE_SECURITY_CLASSIFICATIONS)[number];
export type ChangeSecurityIdentifierScheme =
	(typeof CHANGE_SECURITY_IDENTIFIER_SCHEMES)[number];

export interface ChangeSecurityIdentifier {
	readonly scheme: ChangeSecurityIdentifierScheme;
	readonly value: string;
	readonly sourceRef: string;
}

export interface ChangeCvssReference {
	readonly version: "2.0" | "3.0" | "3.1" | "4.0";
	readonly vector: string;
	readonly score: number;
	readonly sourceRef: string;
}

export interface ChangeSarifReference {
	readonly version: "2.1.0";
	readonly toolId: string;
	readonly ruleId: string;
	readonly resultRef: string;
}

export interface ChangeKevReference {
	readonly cveId: string;
	readonly catalogRef: string;
}

export interface ChangeSecurityProfile {
	readonly classification: ChangeSecurityClassification;
	readonly identifiers: readonly ChangeSecurityIdentifier[];
	readonly cvss: readonly ChangeCvssReference[];
	readonly sarif: readonly ChangeSarifReference[];
	readonly kev: readonly ChangeKevReference[];
}

export interface ChangeDefectProfileProvenance {
	readonly authority: "asserted" | "observed" | "verified" | "approved";
	readonly evidenceIds: readonly string[];
	readonly sourceRefs: readonly string[];
}

export interface ChangeDefectProfile {
	readonly protocolId: typeof CHANGE_DEFECT_PROFILE_PROTOCOL.id;
	readonly protocolVersion: typeof CHANGE_DEFECT_PROFILE_PROTOCOL.version;
	readonly category: ChangeDefectCategory;
	readonly severity: ChangeDefectSeverity;
	readonly likelihood: ChangeDefectLikelihood;
	readonly exposure: ChangeDefectExposure;
	readonly confidence: ChangeDefectConfidence;
	readonly reproducibility: ChangeDefectReproducibility;
	readonly regressionStatus: ChangeDefectRegressionStatus;
	readonly affectedVersions: readonly string[];
	readonly affectedTrees: readonly string[];
	readonly affectedComponents: readonly string[];
	readonly observedBehavior: string;
	readonly expectedBehavior?: string;
	readonly sourceLocations: readonly string[];
	readonly ruleRefs: readonly string[];
	readonly security?: ChangeSecurityProfile;
	readonly provenance: ChangeDefectProfileProvenance;
}

const text = Type.String({minLength: 1, maxLength: 4_000, pattern: "\\S"});
const shortText = Type.String({minLength: 1, maxLength: 500, pattern: "\\S"});
const id = Type.String({
	minLength: 1,
	maxLength: 256,
	pattern: "^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$",
});
const ref = Type.String({minLength: 1, maxLength: 2_048, pattern: "\\S"});
const gitObject = Type.String({pattern: "^[0-9a-f]{40}([0-9a-f]{24})?$"});

function closedString<T extends string>(values: readonly T[]) {
	return Type.Unsafe<T>({type: "string", enum: [...values]});
}

const securityIdentifierSchema = Type.Object(
	{
		scheme: closedString(CHANGE_SECURITY_IDENTIFIER_SCHEMES),
		value: id,
		sourceRef: ref,
	},
	{additionalProperties: false},
);

const cvssReferenceSchema = Type.Object(
	{
		version: Type.Union([
			Type.Literal("2.0"),
			Type.Literal("3.0"),
			Type.Literal("3.1"),
			Type.Literal("4.0"),
		]),
		vector: Type.String({minLength: 3, maxLength: 256, pattern: "\\S"}),
		score: Type.Number({minimum: 0, maximum: 10}),
		sourceRef: ref,
	},
	{additionalProperties: false},
);

const sarifReferenceSchema = Type.Object(
	{
		version: Type.Literal("2.1.0"),
		toolId: id,
		ruleId: id,
		resultRef: ref,
	},
	{additionalProperties: false},
);

const kevReferenceSchema = Type.Object(
	{cveId: id, catalogRef: ref},
	{additionalProperties: false},
);

const securityProfileSchema = Type.Object(
	{
		classification: closedString(CHANGE_SECURITY_CLASSIFICATIONS),
		identifiers: Type.Array(securityIdentifierSchema, {maxItems: 32}),
		cvss: Type.Array(cvssReferenceSchema, {maxItems: 8}),
		sarif: Type.Array(sarifReferenceSchema, {maxItems: 16}),
		kev: Type.Array(kevReferenceSchema, {maxItems: 16}),
	},
	{additionalProperties: false},
);

const provenanceSchema = Type.Object(
	{
		authority: Type.Union([
			Type.Literal("asserted"),
			Type.Literal("observed"),
			Type.Literal("verified"),
			Type.Literal("approved"),
		]),
		evidenceIds: Type.Array(id, {maxItems: 16}),
		sourceRefs: Type.Array(ref, {maxItems: 16}),
	},
	{additionalProperties: false},
);

export const changeDefectProfileSchema = Type.Object(
	{
		protocolId: Type.Literal(CHANGE_DEFECT_PROFILE_PROTOCOL.id),
		protocolVersion: Type.Literal(CHANGE_DEFECT_PROFILE_PROTOCOL.version),
		category: closedString(CHANGE_DEFECT_CATEGORIES),
		severity: closedString(CHANGE_DEFECT_SEVERITIES),
		likelihood: closedString(CHANGE_DEFECT_LIKELIHOODS),
		exposure: closedString(CHANGE_DEFECT_EXPOSURES),
		confidence: closedString(CHANGE_DEFECT_CONFIDENCES),
		reproducibility: closedString(CHANGE_DEFECT_REPRODUCIBILITY),
		regressionStatus: closedString(CHANGE_DEFECT_REGRESSION_STATUSES),
		affectedVersions: Type.Array(shortText, {maxItems: 32}),
		affectedTrees: Type.Array(gitObject, {maxItems: 16}),
		affectedComponents: Type.Array(ref, {maxItems: 32}),
		observedBehavior: text,
		expectedBehavior: Type.Optional(text),
		sourceLocations: Type.Array(ref, {maxItems: 32}),
		ruleRefs: Type.Array(id, {maxItems: 32}),
		security: Type.Optional(securityProfileSchema),
		provenance: provenanceSchema,
	},
	{additionalProperties: false},
);

export function normalizeChangeDefectProfile(value: unknown): ChangeDefectProfile {
	assertTypeboxSchema(changeDefectProfileSchema, value, "Change defect profile");
	const input = value as ChangeDefectProfile;
	if (
		input.provenance.authority !== "asserted" &&
		input.provenance.evidenceIds.length === 0
	) {
		throw new Error(
			"Observed, verified, or approved defect profiles require Evidence ids.",
		);
	}
	const normalized = {
		...input,
		affectedVersions: normalizedTextSet(input.affectedVersions),
		affectedTrees: sortedUnique(input.affectedTrees),
		affectedComponents: normalizedRefSet(
			input.affectedComponents,
			"affectedComponents",
		),
		observedBehavior: normalizedText(input.observedBehavior),
		...(input.expectedBehavior
			? {expectedBehavior: normalizedText(input.expectedBehavior)}
			: {}),
		sourceLocations: normalizedRefSet(input.sourceLocations, "sourceLocations"),
		ruleRefs: normalizedIdentifierSet(input.ruleRefs, "ruleRefs"),
		...(input.security ? {security: normalizeSecurityProfile(input.security)} : {}),
		provenance: {
			authority: input.provenance.authority,
			evidenceIds: normalizedIdentifierSet(
				input.provenance.evidenceIds,
				"provenance.evidenceIds",
			),
			sourceRefs: normalizedRefSet(
				input.provenance.sourceRefs,
				"provenance.sourceRefs",
			),
		},
	};
	return toCanonicalJsonValue(normalized) as unknown as ChangeDefectProfile;
}

function normalizeSecurityProfile(value: ChangeSecurityProfile): ChangeSecurityProfile {
	const identifiers = value.identifiers.map((entry) => {
		const identifierValue = normalizedSecurityIdentifierValue(entry);
		assertSecurityIdentifier(entry.scheme, identifierValue);
		return {
			scheme: entry.scheme,
			value: identifierValue,
			sourceRef: canonicalRef(entry.sourceRef, "security identifier sourceRef"),
		};
	});
	const cvss = value.cvss.map((entry) => {
		assertCvss(entry);
		return {
			version: entry.version,
			vector: normalizedText(entry.vector),
			score: entry.score,
			sourceRef: canonicalRef(entry.sourceRef, "CVSS sourceRef"),
		};
	});
	const sarif = value.sarif.map((entry) => ({
		version: entry.version,
		toolId: identifier(entry.toolId, "SARIF toolId"),
		ruleId: identifier(entry.ruleId, "SARIF ruleId"),
		resultRef: canonicalRef(entry.resultRef, "SARIF resultRef"),
	}));
	const kev = value.kev.map((entry) => {
		if (!/^CVE-\d{4}-\d{4,}$/u.test(entry.cveId)) {
			throw new Error("KEV cveId must be a qualified CVE identifier.");
		}
		return {
			cveId: entry.cveId,
			catalogRef: canonicalRef(entry.catalogRef, "KEV catalogRef"),
		};
	});
	return toCanonicalJsonValue({
		classification: value.classification,
		identifiers: sortedObjects(identifiers, securityIdentifierKey),
		cvss: sortedObjects(cvss, cvssKey),
		sarif: sortedObjects(sarif, sarifKey),
		kev: sortedObjects(kev, kevKey),
	}) as unknown as ChangeSecurityProfile;
}

function normalizedSecurityIdentifierValue(
	value: ChangeSecurityIdentifier,
): string {
	const normalized = normalizedText(value.value);
	if (value.scheme === "cwe" || value.scheme === "cve") {
		return normalized.toUpperCase();
	}
	if (value.scheme === "ghsa") {
		return `GHSA-${normalized.slice(5).toLowerCase()}`;
	}
	return normalized;
}

function assertSecurityIdentifier(
	scheme: ChangeSecurityIdentifierScheme,
	value: string,
): void {
	const patterns: Readonly<Record<ChangeSecurityIdentifierScheme, RegExp>> = {
		cwe: /^CWE-\d{1,6}$/u,
		cve: /^CVE-\d{4}-\d{4,}$/u,
		ghsa: /^GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}$/u,
		osv: /^[A-Za-z][A-Za-z0-9._-]{1,127}$/u,
	};
	if (!patterns[scheme].test(value)) {
		throw new Error(`Security identifier ${value} is invalid for ${scheme}.`);
	}
}

function assertCvss(value: ChangeCvssReference): void {
	if (!Number.isInteger(value.score * 10)) {
		throw new Error("CVSS score must use at most one decimal place.");
	}
	const vector = normalizedText(value.vector);
	if (value.version !== "2.0" && !vector.startsWith(`CVSS:${value.version}/`)) {
		throw new Error(`CVSS ${value.version} vector has an invalid version prefix.`);
	}
	if (value.version === "2.0" && vector.startsWith("CVSS:") && !vector.startsWith("CVSS:2.0/")) {
		throw new Error("CVSS 2.0 vector has an invalid version prefix.");
	}
}

function normalizedTextSet(values: readonly string[]): readonly string[] {
	return sortedUnique(values.map(normalizedText));
}

function normalizedIdentifierSet(
	values: readonly string[],
	field: string,
): readonly string[] {
	return sortedUnique(values.map((value) => identifier(value, field)));
}

function normalizedRefSet(
	values: readonly string[],
	field: string,
): readonly string[] {
	return sortedUnique(values.map((value) => canonicalRef(value, field)));
}

function normalizedText(value: string): string {
	const normalized = value.replace(/\r\n?/gu, "\n").normalize("NFC").trim();
	if (PROHIBITED_CONTROLS.test(normalized)) {
		throw new Error("Change defect profile contains prohibited control characters.");
	}
	if (PRIVATE_DATA_PATTERNS.some((pattern) => pattern.test(normalized))) {
		throw new Error("Change defect profile contains credential-like private data.");
	}
	return normalized;
}

function identifier(value: string, field: string): string {
	const normalized = normalizedText(value);
	if (!/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/u.test(normalized)) {
		throw new Error(`${field} must be a qualified identifier.`);
	}
	return normalized;
}

function canonicalRef(value: string, field: string): string {
	const normalized = normalizedText(value);
	if (!isCanonicalTraceRef(normalized)) {
		throw new Error(`${field} must be a canonical CodeWiki ref.`);
	}
	return normalized;
}

function sortedUnique(values: readonly string[]): readonly string[] {
	return Object.freeze([...new Set(values)].sort(compareText));
}

function sortedObjects<T>(values: readonly T[], key: (value: T) => string): readonly T[] {
	const entries = [...values].sort((left, right) => compareText(key(left), key(right)));
	const keys = entries.map(key);
	if (new Set(keys).size !== keys.length) {
		throw new Error("Change defect profile contains duplicate qualified references.");
	}
	return entries;
}

function securityIdentifierKey(value: ChangeSecurityIdentifier): string {
	return `${value.scheme}:${value.value}:${value.sourceRef}`;
}

function cvssKey(value: ChangeCvssReference): string {
	return `${value.version}:${value.vector}:${value.sourceRef}`;
}

function sarifKey(value: ChangeSarifReference): string {
	return `${value.toolId}:${value.ruleId}:${value.resultRef}`;
}

function kevKey(value: ChangeKevReference): string {
	return `${value.cveId}:${value.catalogRef}`;
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
