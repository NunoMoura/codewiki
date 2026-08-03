import {canonicalJsonDigest, type Sha256Digest} from "../../utils/canonical-json.ts";
import * as adapterShared from "./shared.ts";
import {
	compareDocumentText as compareText,
	documentArrayValue as arrayValue,
	ingestStructuredDocumentEvidence,
	optionalDocumentObject as optionalObject,
	optionalDocumentText as optionalText,
	parseBoundedJsonObject,
	type ParsedStructuredDocument,
	type StructuredDocumentEvidenceInput,
	type StructuredDocumentEvidenceResult,
} from "./document.ts";

const {boundedText, integerValue, objectValue: object} = adapterShared;

export const CYCLONEDX_EVIDENCE_ADAPTER_PROTOCOL = Object.freeze({
	id: "codewiki.evidence-adapter.cyclonedx",
	version: "1.0.0",
} as const);

const MAX_COMPONENTS = 8_192;
const MAX_SERVICES = 2_048;
const MAX_DEPENDENCY_RELATIONSHIPS = 16_384;
const MAX_VULNERABILITIES = 8_192;

export interface CycloneDxIngestionSummary {
	readonly profile: "CycloneDX 1.7 JSON";
	readonly bomVersion: number;
	readonly componentCount: number;
	readonly serviceCount: number;
	readonly dependencyEntryCount: number;
	readonly dependencyRelationshipCount: number;
	readonly vulnerabilityCount: number;
	readonly affectedComponentCount: number;
	readonly licenseEntryCount: number;
	readonly declaredIncompleteCompositionCount: number;
	readonly unresolvedReferenceCount: number;
	readonly omittedComponentCount: number;
	readonly omittedServiceCount: number;
	readonly omittedDependencyRelationshipCount: number;
	readonly omittedVulnerabilityCount: number;
}

export type CycloneDxEvidenceIngestionInput = StructuredDocumentEvidenceInput;

export type CycloneDxEvidenceIngestionResult = StructuredDocumentEvidenceResult<
	typeof CYCLONEDX_EVIDENCE_ADAPTER_PROTOCOL,
	"cyclonedx",
	CycloneDxIngestionSummary
>;

interface ComponentObservation {
	readonly identityDigest: Sha256Digest;
	readonly reference?: string;
	readonly nested: readonly unknown[];
	readonly licenseEntryCount: number;
}

export function ingestCycloneDx17JsonEvidence(
	input: CycloneDxEvidenceIngestionInput,
): CycloneDxEvidenceIngestionResult {
	return ingestStructuredDocumentEvidence(input, {
		protocol: CYCLONEDX_EVIDENCE_ADAPTER_PROTOCOL,
		format: "cyclonedx",
		label: "CycloneDX",
		mediaType: "application/vnd.cyclonedx+json",
		authorityCeiling: "observed",
		parse: parseCycloneDx17,
	});
}

function parseCycloneDx17(
	bytes: Uint8Array,
): ParsedStructuredDocument<CycloneDxIngestionSummary> {
	const document = parseBoundedJsonObject(bytes, "CycloneDX");
	if (document.bomFormat !== "CycloneDX") {
		throw new Error("CycloneDX document bomFormat must be CycloneDX.");
	}
	if (document.specVersion !== "1.7") {
		throw new Error("CycloneDX document specVersion must be 1.7.");
	}
	const bomVersion = integerValue(document.version, "CycloneDX version", 1);
	const collectedComponents = collectComponents(document);
	const collectedServices = collectServices(document.services);
	const knownReferences = new Set([
		...collectedComponents.references,
		...collectedServices.references,
	]);
	const dependencies = collectDependencies(document.dependencies, knownReferences);
	const vulnerabilities = collectVulnerabilities(
		document.vulnerabilities,
		knownReferences,
	);
	const declaredIncompleteCompositionCount = incompleteCompositionCount(
		document.compositions,
	);
	const unresolvedReferenceCount =
		dependencies.unresolvedReferenceCount +
		vulnerabilities.unresolvedReferenceCount;
	const incompleteReasons = [
		...(collectedComponents.omittedCount > 0 ? ["components_truncated"] : []),
		...(collectedServices.omittedCount > 0 ? ["services_truncated"] : []),
		...(dependencies.omittedRelationshipCount > 0
			? ["dependency_relationships_truncated"]
			: []),
		...(vulnerabilities.omittedCount > 0
			? ["vulnerabilities_truncated"]
			: []),
		...(unresolvedReferenceCount > 0 ? ["unresolved_references"] : []),
		...(declaredIncompleteCompositionCount > 0
			? ["declared_incomplete_composition"]
			: []),
	];
	const identityDigests = [
		...collectedComponents.identities,
		...collectedServices.identities,
		...vulnerabilities.identities,
	];
	const observationRefs = [
		...collectedComponents.identities.map(
			(identity) => `cyclonedx/component/${identity}`,
		),
		...collectedServices.identities.map(
			(identity) => `cyclonedx/service/${identity}`,
		),
		...vulnerabilities.identities.map(
			(identity) => `cyclonedx/vulnerability/${identity}`,
		),
	];
	return Object.freeze({
		summary: Object.freeze({
			profile: "CycloneDX 1.7 JSON" as const,
			bomVersion,
			componentCount: collectedComponents.identities.length,
			serviceCount: collectedServices.identities.length,
			dependencyEntryCount: dependencies.entryCount,
			dependencyRelationshipCount: dependencies.relationshipCount,
			vulnerabilityCount: vulnerabilities.identities.length,
			affectedComponentCount: vulnerabilities.affectedComponentCount,
			licenseEntryCount: collectedComponents.licenseEntryCount,
			declaredIncompleteCompositionCount,
			unresolvedReferenceCount,
			omittedComponentCount: collectedComponents.omittedCount,
			omittedServiceCount: collectedServices.omittedCount,
			omittedDependencyRelationshipCount: dependencies.omittedRelationshipCount,
			omittedVulnerabilityCount: vulnerabilities.omittedCount,
		}),
		identityDigests,
		observationRefs,
		incompleteReasons,
	});
}

function collectComponents(document: Record<string, unknown>): {
	readonly identities: readonly Sha256Digest[];
	readonly references: readonly string[];
	readonly licenseEntryCount: number;
	readonly omittedCount: number;
} {
	const pending = [...arrayValue(document.components, "CycloneDX components")];
	const metadata = optionalObject(document.metadata, "CycloneDX metadata");
	if (metadata?.component !== undefined) pending.unshift(metadata.component);
	const identities: Sha256Digest[] = [];
	const references = new Set<string>();
	let licenseEntryCount = 0;
	let observedCount = 0;
	while (pending.length > 0) {
		const value = pending.shift();
		if (value === undefined) break;
		observedCount += 1;
		const component = componentObservation(value, observedCount - 1);
		licenseEntryCount += component.licenseEntryCount;
		if (component.reference) {
			if (references.has(component.reference)) {
				throw new Error("CycloneDX component bom-ref values must be unique.");
			}
			references.add(component.reference);
		}
		if (identities.length < MAX_COMPONENTS) {
			identities.push(component.identityDigest);
		}
		pending.push(...component.nested);
	}
	return Object.freeze({
		identities,
		references: [...references],
		licenseEntryCount,
		omittedCount: Math.max(0, observedCount - identities.length),
	});
}

function componentObservation(
	...args: [unknown, number]
): ComponentObservation {
	const [value, index] = args;
	const component = object(value, `CycloneDX component ${index}`);
	const type = boundedText(component.type, `CycloneDX component ${index} type`, 128);
	const name = boundedText(component.name, `CycloneDX component ${index} name`, 4_096);
	const group = optionalText(component.group, `CycloneDX component ${index} group`, 4_096);
	const version = optionalText(
		component.version,
		`CycloneDX component ${index} version`,
		2_048,
	);
	const purl = optionalText(component.purl, `CycloneDX component ${index} purl`, 4_096);
	const reference = optionalText(
		component["bom-ref"],
		`CycloneDX component ${index} bom-ref`,
		4_096,
	);
	const nested = arrayValue(
		component.components,
		`CycloneDX component ${index} components`,
	);
	const licenses = arrayValue(
		component.licenses,
		`CycloneDX component ${index} licenses`,
	);
	return Object.freeze({
		identityDigest: canonicalJsonDigest({
			kind: "component",
			type,
			group: group ?? null,
			name,
			version: version ?? null,
			purl: purl ?? null,
			reference: reference ?? null,
		}),
		...(reference ? {reference} : {}),
		nested,
		licenseEntryCount: licenses.length,
	});
}

function collectServices(value: unknown): {
	readonly identities: readonly Sha256Digest[];
	readonly references: readonly string[];
	readonly omittedCount: number;
} {
	const services = arrayValue(value, "CycloneDX services");
	const identities: Sha256Digest[] = [];
	const references = new Set<string>();
	for (const [index, entry] of services.entries()) {
		const service = object(entry, `CycloneDX service ${index}`);
		const name = boundedText(service.name, `CycloneDX service ${index} name`, 4_096);
		const version = optionalText(service.version, `CycloneDX service ${index} version`, 2_048);
		const reference = optionalText(
			service["bom-ref"],
			`CycloneDX service ${index} bom-ref`,
			4_096,
		);
		if (reference) {
			if (references.has(reference)) {
				throw new Error("CycloneDX service bom-ref values must be unique.");
			}
			references.add(reference);
		}
		if (identities.length < MAX_SERVICES) {
			identities.push(
				canonicalJsonDigest({
					kind: "service",
					name,
					version: version ?? null,
					reference: reference ?? null,
				}),
			);
		}
	}
	return Object.freeze({
		identities,
		references: [...references],
		omittedCount: Math.max(0, services.length - identities.length),
	});
}

function collectDependencies(
	...args: [unknown, ReadonlySet<string>]
): {
	readonly entryCount: number;
	readonly relationshipCount: number;
	readonly unresolvedReferenceCount: number;
	readonly omittedRelationshipCount: number;
} {
	const [value, knownReferences] = args;
	const entries = arrayValue(value, "CycloneDX dependencies");
	let relationshipCount = 0;
	let observedRelationshipCount = 0;
	let unresolvedReferenceCount = 0;
	for (const [index, entry] of entries.entries()) {
		const dependency = object(entry, `CycloneDX dependency ${index}`);
		const reference = boundedText(
			dependency.ref,
			`CycloneDX dependency ${index} ref`,
			4_096,
		);
		if (!knownReferences.has(reference)) unresolvedReferenceCount += 1;
		const dependsOn = textArray(
			dependency.dependsOn,
			`CycloneDX dependency ${index} dependsOn`,
		);
		observedRelationshipCount += dependsOn.length;
		for (const target of dependsOn.slice(0, Math.max(0, MAX_DEPENDENCY_RELATIONSHIPS - relationshipCount))) {
			relationshipCount += 1;
			if (!knownReferences.has(target)) unresolvedReferenceCount += 1;
		}
	}
	return Object.freeze({
		entryCount: entries.length,
		relationshipCount,
		unresolvedReferenceCount,
		omittedRelationshipCount: Math.max(
			0,
			observedRelationshipCount - relationshipCount,
		),
	});
}

function collectVulnerabilities(
	...args: [unknown, ReadonlySet<string>]
): {
	readonly identities: readonly Sha256Digest[];
	readonly affectedComponentCount: number;
	readonly unresolvedReferenceCount: number;
	readonly omittedCount: number;
} {
	const [value, knownReferences] = args;
	const entries = arrayValue(value, "CycloneDX vulnerabilities");
	const identities: Sha256Digest[] = [];
	let affectedComponentCount = 0;
	let unresolvedReferenceCount = 0;
	for (const [index, entry] of entries.entries()) {
		const vulnerability = object(entry, `CycloneDX vulnerability ${index}`);
		const id = boundedText(
			vulnerability.id,
			`CycloneDX vulnerability ${index} id`,
			2_048,
		);
		const source = optionalObject(
			vulnerability.source,
			`CycloneDX vulnerability ${index} source`,
		);
		const sourceName = source
			? optionalText(source.name, `CycloneDX vulnerability ${index} source name`, 2_048)
			: undefined;
		const affects = arrayValue(
			vulnerability.affects,
			`CycloneDX vulnerability ${index} affects`,
		);
		const affectedReferences = Array.from(
			affects.entries(),
			([affectedIndex, affected]) => {
				const affectedObject = object(
					affected,
					`CycloneDX vulnerability ${index} affects ${affectedIndex}`,
				);
				return boundedText(
					affectedObject.ref,
					`CycloneDX vulnerability ${index} affects ${affectedIndex} ref`,
					4_096,
				);
			},
		);
		affectedComponentCount += affectedReferences.length;
		unresolvedReferenceCount += affectedReferences.filter(
			(reference) => !knownReferences.has(reference),
		).length;
		if (identities.length < MAX_VULNERABILITIES) {
			identities.push(
				canonicalJsonDigest({
					kind: "vulnerability",
					id,
					sourceName: sourceName ?? null,
					affectedReferences: affectedReferences.sort(compareText),
				}),
			);
		}
	}
	return Object.freeze({
		identities,
		affectedComponentCount,
		unresolvedReferenceCount,
		omittedCount: Math.max(0, entries.length - identities.length),
	});
}

function incompleteCompositionCount(value: unknown): number {
	return Array.from(
		arrayValue(value, "CycloneDX compositions").entries(),
		([index, entry]) => {
			const composition = object(entry, `CycloneDX composition ${index}`);
			return boundedText(
				composition.aggregate,
				`CycloneDX composition ${index} aggregate`,
				128,
			);
		},
	).filter((aggregate) => aggregate !== "complete").length;
}

function textArray(...args: [unknown, string]): readonly string[] {
	const [value, label] = args;
	return Array.from(arrayValue(value, label).entries(), ([index, entry]) =>
		boundedText(entry, `${label}[${index}]`, 4_096),
	);
}
