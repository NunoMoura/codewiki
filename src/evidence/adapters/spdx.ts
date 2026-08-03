import {canonicalJsonDigest, type Sha256Digest} from "../../utils/canonical-json.ts";
import * as adapterShared from "./shared.ts";
import {
	compareDocumentText as compareText,
	documentArrayValue as arrayValue,
	ingestStructuredDocumentEvidence,
	optionalDocumentText as optionalText,
	parseBoundedJsonObject,
	type ParsedStructuredDocument,
	type StructuredDocumentEvidenceInput,
	type StructuredDocumentEvidenceResult,
} from "./document.ts";

const {boundedText, integerValue, objectValue: object} = adapterShared;

export const SPDX_EVIDENCE_ADAPTER_PROTOCOL = Object.freeze({
	id: "codewiki.evidence-adapter.spdx",
	version: "1.0.0",
} as const);

const MAX_PACKAGES = 8_192;
const MAX_FILES = 8_192;
const MAX_SNIPPETS = 2_048;
const MAX_RELATIONSHIPS = 16_384;

export interface SpdxIngestionSummary {
	readonly profile: "SPDX 2.3 JSON";
	readonly packageCount: number;
	readonly fileCount: number;
	readonly snippetCount: number;
	readonly relationshipCount: number;
	readonly externalDocumentReferenceCount: number;
	readonly packageExternalReferenceCount: number;
	readonly packageWithoutFileAnalysisCount: number;
	readonly noAssertionLicenseCount: number;
	readonly extractedLicenseCount: number;
	readonly unresolvedReferenceCount: number;
	readonly omittedPackageCount: number;
	readonly omittedFileCount: number;
	readonly omittedSnippetCount: number;
	readonly omittedRelationshipCount: number;
}

export type SpdxEvidenceIngestionInput = StructuredDocumentEvidenceInput;

export type SpdxEvidenceIngestionResult = StructuredDocumentEvidenceResult<
	typeof SPDX_EVIDENCE_ADAPTER_PROTOCOL,
	"spdx",
	SpdxIngestionSummary
>;

interface SpdxElementCollection {
	readonly identities: readonly Sha256Digest[];
	readonly ids: readonly string[];
	readonly referencedIds: readonly string[];
	readonly observationRefs: readonly string[];
	readonly omittedCount: number;
	readonly packageExternalReferenceCount: number;
	readonly packageWithoutFileAnalysisCount: number;
	readonly noAssertionLicenseCount: number;
}

export function ingestSpdx23JsonEvidence(
	input: SpdxEvidenceIngestionInput,
): SpdxEvidenceIngestionResult {
	return ingestStructuredDocumentEvidence(input, {
		protocol: SPDX_EVIDENCE_ADAPTER_PROTOCOL,
		format: "spdx",
		label: "SPDX",
		mediaType: "application/spdx+json",
		authorityCeiling: "observed",
		parse: parseSpdx23,
	});
}

function parseSpdx23(
	bytes: Uint8Array,
): ParsedStructuredDocument<SpdxIngestionSummary> {
	const document = parseBoundedJsonObject(bytes, "SPDX");
	if (document.spdxVersion !== "SPDX-2.3") {
		throw new Error("SPDX document spdxVersion must be SPDX-2.3.");
	}
	if (document.dataLicense !== "CC0-1.0") {
		throw new Error("SPDX document dataLicense must be CC0-1.0.");
	}
	if (document.SPDXID !== "SPDXRef-DOCUMENT") {
		throw new Error("SPDX document SPDXID must be SPDXRef-DOCUMENT.");
	}
	const documentName = boundedText(document.name, "SPDX document name", 4_096);
	const documentNamespace = boundedText(
		document.documentNamespace,
		"SPDX documentNamespace",
		8_192,
	);
	if (!/^[A-Za-z][A-Za-z0-9+.-]*:\S+$/.test(documentNamespace)) {
		throw new Error("SPDX documentNamespace must be an absolute URI.");
	}
	assertCreationInfo(document.creationInfo);
	const packages = collectPackages(document.packages);
	const files = collectFiles(document.files);
	const snippets = collectSnippets(document.snippets);
	assertUniqueIds([
		"SPDXRef-DOCUMENT",
		...packages.ids,
		...files.ids,
		...snippets.ids,
	]);
	const externalDocumentIds = collectExternalDocumentIds(
		document.externalDocumentRefs,
	);
	const knownIds = new Set([
		"SPDXRef-DOCUMENT",
		...packages.ids,
		...files.ids,
		...snippets.ids,
	]);
	const relationships = collectRelationships(
		document.relationships,
		knownIds,
		externalDocumentIds,
	);
	const described = collectDocumentDescribes(document.documentDescribes, knownIds);
	const unresolvedReferenceCount =
		relationships.unresolvedReferenceCount +
		described.unresolvedReferenceCount +
		snippets.referencedIds.filter((id) => !files.ids.includes(id)).length;
	const extractedLicenseCount = arrayValue(
		document.hasExtractedLicensingInfos,
		"SPDX hasExtractedLicensingInfos",
	).length;
	const incompleteReasons = [
		...(packages.omittedCount > 0 ? ["packages_truncated"] : []),
		...(files.omittedCount > 0 ? ["files_truncated"] : []),
		...(snippets.omittedCount > 0 ? ["snippets_truncated"] : []),
		...(relationships.omittedCount > 0 ? ["relationships_truncated"] : []),
		...(unresolvedReferenceCount > 0 ? ["unresolved_references"] : []),
		...(externalDocumentIds.size > 0 ? ["external_documents_unresolved"] : []),
	];
	const documentIdentity = canonicalJsonDigest({
		kind: "spdx-document",
		name: documentName,
		namespace: documentNamespace,
	});
	return Object.freeze({
		summary: Object.freeze({
			profile: "SPDX 2.3 JSON" as const,
			packageCount: packages.identities.length,
			fileCount: files.identities.length,
			snippetCount: snippets.identities.length,
			relationshipCount: relationships.count,
			externalDocumentReferenceCount: externalDocumentIds.size,
			packageExternalReferenceCount: packages.packageExternalReferenceCount,
			packageWithoutFileAnalysisCount: packages.packageWithoutFileAnalysisCount,
			noAssertionLicenseCount:
				packages.noAssertionLicenseCount + files.noAssertionLicenseCount,
			extractedLicenseCount,
			unresolvedReferenceCount,
			omittedPackageCount: packages.omittedCount,
			omittedFileCount: files.omittedCount,
			omittedSnippetCount: snippets.omittedCount,
			omittedRelationshipCount: relationships.omittedCount,
		}),
		identityDigests: [
			documentIdentity,
			...packages.identities,
			...files.identities,
			...snippets.identities,
		],
		observationRefs: [
			`spdx/document/${documentIdentity}`,
			...packages.observationRefs,
			...files.observationRefs,
			...snippets.observationRefs,
		],
		incompleteReasons,
	});
}

function assertCreationInfo(value: unknown): void {
	const creationInfo = object(value, "SPDX creationInfo");
	const creators = textArray(creationInfo.creators, "SPDX creationInfo creators", 4_096);
	if (creators.length === 0) {
		throw new Error("SPDX creationInfo creators cannot be empty.");
	}
	const created = boundedText(
		creationInfo.created,
		"SPDX creationInfo created",
		64,
	);
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(created) || !Number.isFinite(Date.parse(created))) {
		throw new Error("SPDX creationInfo created must be an SPDX UTC timestamp.");
	}
}

function collectPackages(value: unknown): SpdxElementCollection {
	const entries = arrayValue(value, "SPDX packages");
	const identities: Sha256Digest[] = [];
	const ids: string[] = [];
	const observationRefs: string[] = [];
	let packageExternalReferenceCount = 0;
	let packageWithoutFileAnalysisCount = 0;
	let noAssertionLicenseCount = 0;
	for (const [index, entry] of entries.entries()) {
		const pkg = object(entry, `SPDX package ${index}`);
		const id = spdxId(pkg.SPDXID, `SPDX package ${index} SPDXID`);
		const name = boundedText(pkg.name, `SPDX package ${index} name`, 4_096);
		const version = optionalText(pkg.versionInfo, `SPDX package ${index} versionInfo`, 2_048);
		const downloadLocation = boundedText(
			pkg.downloadLocation,
			`SPDX package ${index} downloadLocation`,
			8_192,
		);
		const filesAnalyzed = pkg.filesAnalyzed ?? true;
		if (typeof filesAnalyzed !== "boolean") {
			throw new Error(`SPDX package ${index} filesAnalyzed must be boolean.`);
		}
		if (!filesAnalyzed) packageWithoutFileAnalysisCount += 1;
		const concluded = optionalText(
			pkg.licenseConcluded,
			`SPDX package ${index} licenseConcluded`,
			8_192,
		);
		const declared = optionalText(
			pkg.licenseDeclared,
			`SPDX package ${index} licenseDeclared`,
			8_192,
		);
		optionalText(pkg.copyrightText, `SPDX package ${index} copyrightText`, 16_384);
		noAssertionLicenseCount += assertionCount([concluded, declared]);
		const externalRefs = arrayValue(
			pkg.externalRefs,
			`SPDX package ${index} externalRefs`,
		);
		packageExternalReferenceCount += externalRefs.length;
		const externalReferenceDigests = Array.from(
			externalRefs.entries(),
			([externalIndex, externalEntry]) => {
				const external = object(
					externalEntry,
					`SPDX package ${index} externalRef ${externalIndex}`,
				);
				return canonicalJsonDigest({
					category: boundedText(
						external.referenceCategory,
						`SPDX package ${index} externalRef ${externalIndex} category`,
						256,
					),
					type: boundedText(
						external.referenceType,
						`SPDX package ${index} externalRef ${externalIndex} type`,
						1_024,
					),
					locator: boundedText(
						external.referenceLocator,
						`SPDX package ${index} externalRef ${externalIndex} locator`,
						8_192,
					),
				});
			},
		).sort(compareText);
		ids.push(id);
		if (identities.length < MAX_PACKAGES) {
			const identity = canonicalJsonDigest({
				kind: "package",
				id,
				name,
				version: version ?? null,
				downloadLocation,
				externalReferenceDigests,
			});
			identities.push(identity);
			observationRefs.push(`spdx/package/${identity}`);
		}
	}
	return Object.freeze({
		identities,
		ids,
		referencedIds: [],
		observationRefs,
		omittedCount: Math.max(0, entries.length - identities.length),
		packageExternalReferenceCount,
		packageWithoutFileAnalysisCount,
		noAssertionLicenseCount,
	});
}

function collectFiles(value: unknown): SpdxElementCollection {
	const entries = arrayValue(value, "SPDX files");
	const identities: Sha256Digest[] = [];
	const ids: string[] = [];
	const observationRefs: string[] = [];
	let noAssertionLicenseCount = 0;
	for (const [index, entry] of entries.entries()) {
		const file = object(entry, `SPDX file ${index}`);
		const id = spdxId(file.SPDXID, `SPDX file ${index} SPDXID`);
		const fileName = boundedText(file.fileName, `SPDX file ${index} fileName`, 8_192);
		const concluded = optionalText(
			file.licenseConcluded,
			`SPDX file ${index} licenseConcluded`,
			8_192,
		);
		optionalText(file.copyrightText, `SPDX file ${index} copyrightText`, 16_384);
		noAssertionLicenseCount += assertionCount([concluded]);
		const checksums = arrayValue(file.checksums, `SPDX file ${index} checksums`);
		if (checksums.length === 0) {
			throw new Error(`SPDX file ${index} requires at least one checksum.`);
		}
		const checksumDigests = Array.from(
			checksums.entries(),
			([checksumIndex, checksumEntry]) => {
				const checksum = object(
					checksumEntry,
					`SPDX file ${index} checksum ${checksumIndex}`,
				);
				return canonicalJsonDigest({
					algorithm: boundedText(
						checksum.algorithm,
						`SPDX file ${index} checksum ${checksumIndex} algorithm`,
						64,
					),
					value: boundedText(
						checksum.checksumValue,
						`SPDX file ${index} checksum ${checksumIndex} value`,
						512,
					),
				});
			},
		).sort(compareText);
		ids.push(id);
		if (identities.length < MAX_FILES) {
			const identity = canonicalJsonDigest({
				kind: "file",
				id,
				fileName,
				checksumDigests,
			});
			identities.push(identity);
			observationRefs.push(`spdx/file/${identity}`);
		}
	}
	return Object.freeze({
		identities,
		ids,
		referencedIds: [],
		observationRefs,
		omittedCount: Math.max(0, entries.length - identities.length),
		packageExternalReferenceCount: 0,
		packageWithoutFileAnalysisCount: 0,
		noAssertionLicenseCount,
	});
}

function collectSnippets(value: unknown): SpdxElementCollection {
	const entries = arrayValue(value, "SPDX snippets");
	const identities: Sha256Digest[] = [];
	const ids: string[] = [];
	const referencedIds: string[] = [];
	const observationRefs: string[] = [];
	for (const [index, entry] of entries.entries()) {
		const snippet = object(entry, `SPDX snippet ${index}`);
		const id = spdxId(snippet.SPDXID, `SPDX snippet ${index} SPDXID`);
		const name = boundedText(snippet.name, `SPDX snippet ${index} name`, 4_096);
		const fromFile = spdxId(
			snippet.snippetFromFile,
			`SPDX snippet ${index} snippetFromFile`,
		);
		const rangeDigests = snippetRangeDigests(snippet.ranges, index, fromFile);
		ids.push(id);
		referencedIds.push(fromFile);
		if (identities.length < MAX_SNIPPETS) {
			const identity = canonicalJsonDigest({
				kind: "snippet",
				id,
				name,
				fromFile,
				rangeDigests,
			});
			identities.push(identity);
			observationRefs.push(`spdx/snippet/${identity}`);
		}
	}
	return Object.freeze({
		identities,
		ids,
		referencedIds,
		observationRefs,
		omittedCount: Math.max(0, entries.length - identities.length),
		packageExternalReferenceCount: 0,
		packageWithoutFileAnalysisCount: 0,
		noAssertionLicenseCount: 0,
	});
}

function snippetRangeDigests(
	...args: [unknown, number, string]
): readonly Sha256Digest[] {
	const [value, snippetIndex, fromFile] = args;
	const ranges = arrayValue(value, `SPDX snippet ${snippetIndex} ranges`);
	if (ranges.length === 0) {
		throw new Error(`SPDX snippet ${snippetIndex} ranges cannot be empty.`);
	}
	return Array.from(ranges.entries(), ([rangeIndex, rangeValue]) => {
		const range = object(
			rangeValue,
			`SPDX snippet ${snippetIndex} range ${rangeIndex}`,
		);
		const start = snippetPointer(
			range.startPointer,
			`SPDX snippet ${snippetIndex} range ${rangeIndex} startPointer`,
			fromFile,
		);
		const end = snippetPointer(
			range.endPointer,
			`SPDX snippet ${snippetIndex} range ${rangeIndex} endPointer`,
			fromFile,
		);
		return canonicalJsonDigest({start, end});
	}).sort(compareText);
}

function snippetPointer(
	...args: [unknown, string, string]
): Readonly<{reference: string; offset?: number; lineNumber?: number}> {
	const [value, label, fromFile] = args;
	const pointer = object(value, label);
	const reference = spdxId(pointer.reference, `${label} reference`);
	if (reference !== fromFile) {
		throw new Error(`${label} must reference the snippet source file.`);
	}
	const offset =
		pointer.offset === undefined
			? undefined
			: integerValue(pointer.offset, `${label} offset`, 0);
	const lineNumber =
		pointer.lineNumber === undefined
			? undefined
			: integerValue(pointer.lineNumber, `${label} lineNumber`, 1);
	if ((offset === undefined) === (lineNumber === undefined)) {
		throw new Error(`${label} requires exactly one offset or lineNumber.`);
	}
	return Object.freeze({
		reference,
		...(offset === undefined ? {} : {offset}),
		...(lineNumber === undefined ? {} : {lineNumber}),
	});
}

function collectExternalDocumentIds(value: unknown): ReadonlySet<string> {
	const ids = new Set<string>();
	for (const [index, entry] of arrayValue(value, "SPDX externalDocumentRefs").entries()) {
		const reference = object(entry, `SPDX externalDocumentRef ${index}`);
		const id = boundedText(
			reference.externalDocumentId,
			`SPDX externalDocumentRef ${index} externalDocumentId`,
			256,
		);
		if (!/^DocumentRef-[A-Za-z0-9.-]+$/.test(id) || ids.has(id)) {
			throw new Error("SPDX externalDocumentId values must be valid and unique.");
		}
		ids.add(id);
	}
	return ids;
}

function collectRelationships(
	...args: [unknown, ReadonlySet<string>, ReadonlySet<string>]
): {
	readonly count: number;
	readonly unresolvedReferenceCount: number;
	readonly omittedCount: number;
} {
	const [value, knownIds, externalDocumentIds] = args;
	const entries = arrayValue(value, "SPDX relationships");
	let count = 0;
	let unresolvedReferenceCount = 0;
	for (const [index, entry] of entries.entries()) {
		const relationship = object(entry, `SPDX relationship ${index}`);
		const source = boundedText(
			relationship.spdxElementId,
			`SPDX relationship ${index} spdxElementId`,
			512,
		);
		boundedText(
			relationship.relationshipType,
			`SPDX relationship ${index} relationshipType`,
			256,
		);
		const target = boundedText(
			relationship.relatedSpdxElement,
			`SPDX relationship ${index} relatedSpdxElement`,
			512,
		);
		if (!resolvesSpdxReference(source, knownIds, externalDocumentIds)) {
			unresolvedReferenceCount += 1;
		}
		if (!resolvesSpdxReference(target, knownIds, externalDocumentIds)) {
			unresolvedReferenceCount += 1;
		}
		if (count < MAX_RELATIONSHIPS) count += 1;
	}
	return Object.freeze({
		count,
		unresolvedReferenceCount,
		omittedCount: Math.max(0, entries.length - count),
	});
}

function collectDocumentDescribes(
	...args: [unknown, ReadonlySet<string>]
): {readonly unresolvedReferenceCount: number} {
	const [value, knownIds] = args;
	const references = textArray(value, "SPDX documentDescribes", 512);
	return Object.freeze({
		unresolvedReferenceCount: references.filter(
			(reference) => !knownIds.has(reference),
		).length,
	});
}

function resolvesSpdxReference(
	...args: [string, ReadonlySet<string>, ReadonlySet<string>]
): boolean {
	const [value, knownIds, externalDocumentIds] = args;
	if (knownIds.has(value) || value === "NONE" || value === "NOASSERTION") {
		return true;
	}
	const separator = value.indexOf(":");
	return separator > 0 && externalDocumentIds.has(value.slice(0, separator));
}

function assertUniqueIds(ids: readonly string[]): void {
	if (new Set(ids).size !== ids.length) {
		throw new Error("SPDX element SPDXID values must be unique.");
	}
}

function spdxId(...args: [unknown, string]): string {
	const [value, label] = args;
	const id = boundedText(value, label, 512);
	if (!/^SPDXRef-[A-Za-z0-9.-]+$/.test(id)) {
		throw new Error(`${label} is invalid.`);
	}
	return id;
}

function assertionCount(values: readonly (string | undefined)[]): number {
	return values.filter((value) => value === "NOASSERTION" || value === "NONE").length;
}

function textArray(
	...args: [unknown, string, number]
): readonly string[] {
	const [value, label, maximum] = args;
	return Array.from(arrayValue(value, label).entries(), ([index, entry]) =>
		boundedText(entry, `${label}[${index}]`, maximum),
	);
}
