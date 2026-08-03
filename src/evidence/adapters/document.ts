import {
	isAlias,
	parseDocument,
	visit,
	type Document,
	type ParsedNode,
} from "yaml";

import type {
	EvidenceArtifact,
	EvidenceCoverage,
	EvidenceMaterial,
} from "../contracts.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import * as adapterShared from "./shared.ts";

const {
	admitAdapterArtifact,
	admitStandardAdapterExecution,
	assertOnlyKeys,
	boundedText,
	buildCommandExecutionMaterial,
	buildSourceObservationMaterial,
	digestValue: digest,
	normalizedProjectPath,
	normalizedRefList,
	objectValue: object,
	safeOpaqueRef: safeRef,
	sortedUnique,
} = adapterShared;

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_DOCUMENT_DEPTH = 64;
const MAX_DOCUMENT_NODES = 100_000;
const MAX_SOURCE_PATHS = 256;
const MAX_REQUIRED_IDENTITIES = 512;
const MAX_PROVENANCE_REFS = 240;
const MAX_OBSERVATION_REFS = 240;

export interface StructuredDocumentToolIdentity {
	readonly name: string;
	readonly version: string;
}

export type StructuredDocumentExecutionBinding =
	adapterShared.StandardAdapterExecutionBinding;

export interface StructuredDocumentEvidenceInput {
	readonly artifact: {
		readonly bytes: string | Uint8Array;
		readonly ref: string;
	};
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly scopeDigest: Sha256Digest;
	readonly sourcePaths: readonly string[];
	readonly requiredIdentityDigests?: readonly Sha256Digest[];
	readonly ownershipRefs?: readonly string[];
	readonly tool: StructuredDocumentToolIdentity;
	readonly execution: StructuredDocumentExecutionBinding;
	readonly provenanceRefs?: readonly string[];
}

export interface StructuredDocumentCommonSummary {
	readonly identityCount: number;
	readonly requiredIdentityCount: number;
	readonly missingRequiredIdentityCount: number;
	readonly incompleteReasonCount: number;
	readonly omittedObservationCount: number;
}

export type StructuredDocumentIngestionSummary<TSummary extends object> =
	TSummary & StructuredDocumentCommonSummary;

export interface StructuredDocumentEvidenceResult<
	TProtocol extends Readonly<{id: string; version: string}>,
	TFormat extends string,
	TSummary extends object,
> {
	readonly protocol: TProtocol;
	readonly format: TFormat;
	readonly artifact: EvidenceArtifact;
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly tool: StructuredDocumentToolIdentity;
	readonly authorityCeiling: "observed" | "verified";
	readonly grantsResult: false;
	readonly coverage: EvidenceCoverage;
	readonly summary: StructuredDocumentIngestionSummary<TSummary>;
	readonly bindingDigest: Sha256Digest;
	readonly commandExecution: EvidenceMaterial<"command_execution">;
	readonly sourceObservation: EvidenceMaterial<"source_observation">;
	readonly receiptDigest: Sha256Digest;
}

export interface ParsedStructuredDocument<TSummary extends object> {
	readonly summary: TSummary;
	readonly identityDigests: readonly Sha256Digest[];
	readonly observationRefs: readonly string[];
	readonly incompleteReasons: readonly string[];
}

interface StructuredDocumentAdapterDefinition<
	TProtocol extends Readonly<{id: string; version: string}>,
	TFormat extends string,
	TSummary extends object,
> {
	readonly protocol: TProtocol;
	readonly format: TFormat;
	readonly label: string;
	readonly mediaType: string | ((bytes: string | Uint8Array) => string);
	readonly authorityCeiling: "observed" | "verified";
	readonly parse: (bytes: Uint8Array) => ParsedStructuredDocument<TSummary>;
}

interface AdmittedStructuredDocumentInput {
	readonly artifact: StructuredDocumentEvidenceInput["artifact"];
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly scopeDigest: Sha256Digest;
	readonly sourcePaths: readonly string[];
	readonly requiredIdentityDigests: readonly Sha256Digest[];
	readonly ownershipRefs: readonly string[];
	readonly tool: StructuredDocumentToolIdentity;
	readonly execution: StructuredDocumentExecutionBinding;
	readonly provenanceRefs: readonly string[];
}

export function ingestStructuredDocumentEvidence<
	TProtocol extends Readonly<{id: string; version: string}>,
	TFormat extends string,
	TSummary extends object,
>(
	...args: [
		StructuredDocumentEvidenceInput,
		StructuredDocumentAdapterDefinition<TProtocol, TFormat, TSummary>,
	]
): StructuredDocumentEvidenceResult<TProtocol, TFormat, TSummary> {
	const [value, definition] = args;
	const admitted = admittedInput(value, definition.label);
	const mediaType =
		typeof definition.mediaType === "function"
			? definition.mediaType(admitted.artifact.bytes)
			: definition.mediaType;
	const admittedArtifact = admitAdapterArtifact(admitted.artifact, {
		label: definition.label,
		maximumBytes: MAX_DOCUMENT_BYTES,
		mediaType,
	});
	const artifact = admittedArtifact.artifact;
	const parsed = definition.parse(admittedArtifact.artifactBytes);
	const identities = sortedUnique(parsed.identityDigests);
	const missingRequiredIdentityCount = admitted.requiredIdentityDigests.filter(
		(identity) => !identities.includes(identity),
	).length;
	const uniqueObservations = sortedUnique(parsed.observationRefs);
	const retainedObservations = uniqueObservations.slice(0, MAX_OBSERVATION_REFS);
	const omittedObservationCount = Math.max(
		0,
		uniqueObservations.length - retainedObservations.length,
	);
	const incompleteReasons = sortedUnique([
		...parsed.incompleteReasons,
		...(missingRequiredIdentityCount > 0
			? ["required_identity_missing"]
			: []),
		...(omittedObservationCount > 0 ? ["observation_refs_truncated"] : []),
	]);
	const summary = Object.freeze({
		...parsed.summary,
		identityCount: identities.length,
		requiredIdentityCount: admitted.requiredIdentityDigests.length,
		missingRequiredIdentityCount,
		incompleteReasonCount: incompleteReasons.length,
		omittedObservationCount,
	}) as StructuredDocumentIngestionSummary<TSummary>;
	let coverage: EvidenceCoverage =
		incompleteReasons.length === 0 ? "complete" : "partial";
	const termination = admitted.execution.termination;
	if (termination === "unavailable") coverage = "unknown";
	if (termination === "timed_out" || termination === "cancelled") {
		coverage = "partial";
	}
	const bindingDigest = canonicalJsonDigest({
		format: definition.format,
		sourceSnapshotDigest: admitted.sourceSnapshotDigest,
		scopeDigest: admitted.scopeDigest,
		sourcePaths: admitted.sourcePaths,
		requiredIdentityDigests: admitted.requiredIdentityDigests,
		ownershipRefs: admitted.ownershipRefs,
		tool: admitted.tool,
		execution: admitted.execution,
	});
	const provenanceRefs = sortedUnique([
		...admitted.provenanceRefs,
		`${definition.format}-artifact:${artifact.digest}`,
		`${definition.format}-binding:${bindingDigest}`,
		`${definition.format}-source-snapshot:${admitted.sourceSnapshotDigest}`,
		`${definition.format}-scope:${admitted.scopeDigest}`,
		`${definition.format}-source-paths:${canonicalJsonDigest(admitted.sourcePaths)}`,
		`${definition.format}-required-identities:${canonicalJsonDigest(admitted.requiredIdentityDigests)}`,
		`${definition.format}-request:${admitted.execution.requestDigest}`,
		`${definition.format}-configuration:${admitted.execution.configurationDigest}`,
		`${definition.format}-tool:${canonicalJsonDigest(admitted.tool)}`,
	]);
	const diagnosticRefs = [
		summaryRef(definition.format, summary),
		...incompleteReasons.map(
			(reason) => `${definition.format}/incomplete/${reason}`,
		),
		...retainedObservations,
	];
	const commandExecution = buildCommandExecutionMaterial({
		artifact,
		provenanceRefs,
		execution: admitted.execution,
		diagnosticRefs,
	});
	const sourceObservation: EvidenceMaterial<"source_observation"> =
		buildSourceObservationMaterial({
			artifact,
			provenanceRefs,
			snapshotDigest: admitted.sourceSnapshotDigest,
			paths: admitted.sourcePaths,
			ownershipRefs: admitted.ownershipRefs,
			observations: diagnosticRefs,
		});
	const body = toCanonicalJsonValue({
		protocol: definition.protocol,
		format: definition.format,
		artifact,
		sourceSnapshotDigest: admitted.sourceSnapshotDigest,
		tool: admitted.tool,
		authorityCeiling: definition.authorityCeiling,
		grantsResult: false,
		coverage,
		summary,
		bindingDigest,
		commandExecution,
		sourceObservation,
	}) as unknown as Omit<
		StructuredDocumentEvidenceResult<TProtocol, TFormat, TSummary>,
		"receiptDigest"
	>;
	return Object.freeze({...body, receiptDigest: canonicalJsonDigest(body)});
}

function admittedInput(
	...args: [unknown, string]
): AdmittedStructuredDocumentInput {
	const [value, label] = args;
	const input = object(value, `${label} input`);
	assertOnlyKeys(
		input,
		[
			"artifact",
			"sourceSnapshotDigest",
			"scopeDigest",
			"sourcePaths",
			"requiredIdentityDigests",
			"ownershipRefs",
			"tool",
			"execution",
			"provenanceRefs",
		],
		`${label} ingestion`,
	);
	const artifact = object(input.artifact, `${label} artifact`);
	assertOnlyKeys(artifact, ["bytes", "ref"], `${label} artifact`);
	if (typeof artifact.bytes !== "string" && !(artifact.bytes instanceof Uint8Array)) {
		throw new Error(`${label} artifact bytes must be text or bytes.`);
	}
	const sourcePaths = admittedSourcePaths(input.sourcePaths, label);
	const requiredIdentityDigests = admittedDigestList(
		input.requiredIdentityDigests ?? [],
		`${label} requiredIdentityDigests`,
		MAX_REQUIRED_IDENTITIES,
	);
	const toolValue = object(input.tool, `${label} tool`);
	assertOnlyKeys(toolValue, ["name", "version"], `${label} tool`);
	const tool = Object.freeze({
		name: boundedText(toolValue.name, `${label} tool name`, 256),
		version: boundedText(toolValue.version, `${label} tool version`, 128),
	});
	return Object.freeze({
		artifact: Object.freeze({
			bytes: artifact.bytes,
			ref: safeRef(artifact.ref, `${label} artifact ref`),
		}),
		sourceSnapshotDigest: digest(
			input.sourceSnapshotDigest,
			`${label} sourceSnapshotDigest`,
		),
		scopeDigest: digest(input.scopeDigest, `${label} scopeDigest`),
		sourcePaths,
		requiredIdentityDigests,
		ownershipRefs: normalizedRefList(
			input.ownershipRefs ?? [],
			`${label} ownershipRefs`,
			256,
		),
		tool,
		execution: admitStandardAdapterExecution(input.execution, {
			label,
			errorPrefix: `${label} execution`,
		}),
		provenanceRefs: normalizedRefList(
			input.provenanceRefs ?? [],
			`${label} provenanceRefs`,
			MAX_PROVENANCE_REFS,
		),
	});
}

function admittedSourcePaths(...args: [unknown, string]): readonly string[] {
	const [value, label] = args;
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SOURCE_PATHS) {
		throw new Error(`${label} sourcePaths must contain 1..${MAX_SOURCE_PATHS} paths.`);
	}
	const paths: string[] = [];
	for (const [index, entry] of value.entries()) {
		const normalized = normalizedProjectPath(entry);
		if (normalized.unsafe || !normalized.path) {
			throw new Error(`${label} sourcePaths[${index}] is unsafe.`);
		}
		paths.push(normalized.path);
	}
	if (new Set(paths).size !== paths.length) {
		throw new Error(`${label} sourcePaths must not contain duplicates.`);
	}
	return Object.freeze(paths.sort(compareDocumentText));
}

function admittedDigestList(
	...args: [unknown, string, number]
): readonly Sha256Digest[] {
	const [value, label, maximum] = args;
	if (!Array.isArray(value) || value.length > maximum) {
		throw new Error(`${label} must contain at most ${maximum} digests.`);
	}
	const digests = Array.from(value.entries(), ([index, entry]) =>
		digest(entry, `${label}[${index}]`),
	);
	return Object.freeze(
		sortedUnique(digests) as readonly Sha256Digest[],
	);
}

function summaryRef(
	...args: [string, StructuredDocumentCommonSummary & object]
): string {
	const [format, summary] = args;
	return `${format}/summary/${canonicalJsonDigest(summary)}`;
}

export function parseBoundedJsonObject(
	...args: [Uint8Array, string]
): Record<string, unknown> {
	const [bytes, label] = args;
	const text = strictUtf8(bytes, `${label} JSON`);
	const duplicateCheck = parseYamlDocument(text, `${label} JSON`, "json");
	assertNoYamlFeatures(duplicateCheck, `${label} JSON`);
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error(`${label} artifact is not valid JSON.`);
	}
	assertDocumentBounds(value, label);
	return object(value, `${label} document`);
}

export function parseBoundedYamlOrJsonObject(
	...args: [Uint8Array, string]
): {readonly document: Record<string, unknown>; readonly encoding: "json" | "yaml"} {
	const [bytes, label] = args;
	const text = strictUtf8(bytes, label);
	if (looksLikeJson(text)) {
		return Object.freeze({
			document: parseBoundedJsonObject(bytes, label),
			encoding: "json" as const,
		});
	}
	const parsed = parseYamlDocument(text, `${label} YAML`, "core");
	assertNoYamlFeatures(parsed, `${label} YAML`);
	let value: unknown;
	try {
		value = parsed.toJS({maxAliasCount: 0, mapAsMap: false});
	} catch {
		throw new Error(`${label} artifact could not be parsed safely.`);
	}
	assertDocumentBounds(value, label);
	return Object.freeze({
		document: object(value, `${label} document`),
		encoding: "yaml" as const,
	});
}

export function structuredDocumentMediaType(
	...args: [string | Uint8Array, string, string]
): string {
	const [bytes, jsonMediaType, yamlMediaType] = args;
	const text =
		typeof bytes === "string"
			? bytes
			: new TextDecoder("utf-8", {fatal: false}).decode(bytes);
	return looksLikeJson(text) ? jsonMediaType : yamlMediaType;
}

function parseYamlDocument(
	...args: [string, string, "json" | "core"]
): Document.Parsed<ParsedNode, true> {
	const [text, label, schema] = args;
	const document = parseDocument(text, {
		strict: true,
		uniqueKeys: true,
		schema,
	});
	if (document.errors.length > 0 || document.warnings.length > 0) {
		throw new Error(`${label} artifact has malformed or duplicate-key syntax.`);
	}
	return document;
}

function assertNoYamlFeatures(
	...args: [Document.Parsed<ParsedNode, true>, string]
): void {
	const [document, label] = args;
	let unsafe = false;
	visit(document, (...visitArgs) => {
		const node = visitArgs[1];
		if (
			isAlias(node) ||
			(node !== null &&
				typeof node === "object" &&
				(("anchor" in node && typeof node.anchor === "string") ||
					("tag" in node && typeof node.tag === "string")))
		) {
			unsafe = true;
		}
	});
	if (unsafe) {
		throw new Error(`${label} artifact cannot contain aliases, anchors, or tags.`);
	}
}

function assertDocumentBounds(...args: [unknown, string]): void {
	const [value, label] = args;
	const pending: Array<{readonly value: unknown; readonly depth: number}> = [
		{value, depth: 0},
	];
	let nodeCount = 0;
	while (pending.length > 0) {
		const current = pending.pop();
		if (!current) break;
		nodeCount += 1;
		if (nodeCount > MAX_DOCUMENT_NODES) {
			throw new Error(`${label} artifact exceeds ${MAX_DOCUMENT_NODES} JSON nodes.`);
		}
		if (current.depth > MAX_DOCUMENT_DEPTH) {
			throw new Error(`${label} artifact exceeds ${MAX_DOCUMENT_DEPTH} nesting levels.`);
		}
		if (Array.isArray(current.value)) {
			for (const item of current.value) {
				pending.push({value: item, depth: current.depth + 1});
			}
			continue;
		}
		if (current.value && typeof current.value === "object") {
			for (const item of Object.values(current.value)) {
				pending.push({value: item, depth: current.depth + 1});
			}
		}
	}
	toCanonicalJsonValue(value);
}

export function documentArrayValue(
	...args: [unknown, string]
): readonly unknown[] {
	const [value, label] = args;
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	return value;
}

export function optionalDocumentObject(
	...args: [unknown, string]
): Record<string, unknown> | undefined {
	const [value, label] = args;
	return value === undefined ? undefined : object(value, label);
}

export function optionalDocumentText(
	...args: [unknown, string, number]
): string | undefined {
	const [value, label, maximum] = args;
	return value === undefined ? undefined : boundedText(value, label, maximum);
}

export function compareDocumentText(...values: [string, string]): number {
	const [left, right] = values;
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function strictUtf8(...args: [Uint8Array, string]): string {
	const [bytes, label] = args;
	try {
		return new TextDecoder("utf-8", {fatal: true}).decode(bytes);
	} catch {
		throw new Error(`${label} artifact must be valid UTF-8.`);
	}
}

function looksLikeJson(text: string): boolean {
	return text.trimStart().startsWith("{");
}
