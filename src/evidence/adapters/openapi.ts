import {canonicalJsonDigest, type Sha256Digest} from "../../utils/canonical-json.ts";
import * as adapterShared from "./shared.ts";
import {
	documentArrayValue as arrayValue,
	ingestStructuredDocumentEvidence,
	optionalDocumentObject as optionalObject,
	optionalDocumentText as optionalText,
	parseBoundedYamlOrJsonObject,
	structuredDocumentMediaType,
	type ParsedStructuredDocument,
	type StructuredDocumentEvidenceInput,
	type StructuredDocumentEvidenceResult,
} from "./document.ts";

const {boundedText, objectValue: object} = adapterShared;

export const OPENAPI_EVIDENCE_ADAPTER_PROTOCOL = Object.freeze({
	id: "codewiki.evidence-adapter.openapi",
	version: "1.0.0",
} as const);

const SUPPORTED_VERSIONS = new Set([
	"3.0.0",
	"3.0.1",
	"3.0.2",
	"3.0.3",
	"3.0.4",
	"3.1.0",
	"3.1.1",
]);
const HTTP_METHODS = new Set([
	"get",
	"put",
	"post",
	"delete",
	"options",
	"head",
	"patch",
	"trace",
]);
const MAX_OPERATIONS = 8_192;

export interface OpenApiIngestionSummary {
	readonly profile: string;
	readonly encoding: "json" | "yaml";
	readonly pathItemCount: number;
	readonly operationCount: number;
	readonly webhookOperationCount: number;
	readonly callbackOperationCount: number;
	readonly schemaCount: number;
	readonly securitySchemeCount: number;
	readonly serverCount: number;
	readonly externalReferenceCount: number;
	readonly unresolvedInternalReferenceCount: number;
	readonly omittedOperationCount: number;
}

export type OpenApiEvidenceIngestionInput = StructuredDocumentEvidenceInput;

export type OpenApiEvidenceIngestionResult = StructuredDocumentEvidenceResult<
	typeof OPENAPI_EVIDENCE_ADAPTER_PROTOCOL,
	"openapi",
	OpenApiIngestionSummary
>;

interface PendingPathItem {
	readonly value: unknown;
	readonly location: string;
	readonly kind: "path" | "webhook" | "callback";
}

interface OperationObservation {
	readonly identityDigest: Sha256Digest;
	readonly kind: PendingPathItem["kind"];
	readonly operationId?: string;
}

export function ingestOpenApiEvidence(
	input: OpenApiEvidenceIngestionInput,
): OpenApiEvidenceIngestionResult {
	return ingestStructuredDocumentEvidence(input, {
		protocol: OPENAPI_EVIDENCE_ADAPTER_PROTOCOL,
		format: "openapi",
		label: "OpenAPI",
		mediaType: (bytes) =>
			structuredDocumentMediaType(
				bytes,
				"application/vnd.oai.openapi+json",
				"application/vnd.oai.openapi",
			),
		authorityCeiling: "observed",
		parse: parseOpenApi,
	});
}

function parseOpenApi(
	bytes: Uint8Array,
): ParsedStructuredDocument<OpenApiIngestionSummary> {
	const parsed = parseBoundedYamlOrJsonObject(bytes, "OpenAPI");
	const root = admittedOpenApiRoot(parsed.document);
	const operations = collectOperations(parsed.document, root);
	const references = collectReferences(parsed.document);
	const staticCounts = openApiStaticCounts(parsed.document);
	const incompleteReasons = [
		...(operations.omittedCount > 0 ? ["operations_truncated"] : []),
		...(references.externalCount > 0 ? ["external_references_unresolved"] : []),
		...(references.unresolvedInternalCount > 0
			? ["internal_references_unresolved"]
			: []),
	];
	return Object.freeze({
		summary: Object.freeze({
			profile: `OpenAPI ${root.version}`,
			encoding: parsed.encoding,
			pathItemCount: operations.pathItemCount,
			operationCount: operations.observations.length,
			webhookOperationCount: operations.observations.filter(
				(entry) => entry.kind === "webhook",
			).length,
			callbackOperationCount: operations.observations.filter(
				(entry) => entry.kind === "callback",
			).length,
			...staticCounts,
			externalReferenceCount: references.externalCount,
			unresolvedInternalReferenceCount: references.unresolvedInternalCount,
			omittedOperationCount: operations.omittedCount,
		}),
		identityDigests: [
			root.contractIdentity,
			...operations.observations.map((entry) => entry.identityDigest),
		],
		observationRefs: [
			`openapi/contract/${root.contractIdentity}`,
			...operations.observations.map(
				(entry) => `openapi/operation/${entry.identityDigest}`,
			),
		],
		incompleteReasons,
	});
}

function admittedOpenApiRoot(document: Record<string, unknown>): {
	readonly version: string;
	readonly title: string;
	readonly apiVersion: string;
	readonly contractIdentity: Sha256Digest;
} {
	const version = boundedText(document.openapi, "OpenAPI version", 16);
	if (!SUPPORTED_VERSIONS.has(version)) {
		throw new Error("OpenAPI version must be supported 3.0.x or 3.1.x.");
	}
	const info = object(document.info, "OpenAPI info");
	const title = boundedText(info.title, "OpenAPI info title", 4_096);
	const apiVersion = boundedText(info.version, "OpenAPI info version", 2_048);
	return Object.freeze({
		version,
		title,
		apiVersion,
		contractIdentity: canonicalJsonDigest({
			kind: "openapi-contract",
			openapi: version,
			title,
			apiVersion,
		}),
	});
}

function collectOperations(
	...args: [
		Record<string, unknown>,
		{readonly title: string; readonly apiVersion: string},
	]
): {
	readonly observations: readonly OperationObservation[];
	readonly pathItemCount: number;
	readonly omittedCount: number;
} {
	const [document, root] = args;
	const pathItems = initialPathItems(document);
	const observations: OperationObservation[] = [];
	const operationIds = new Set<string>();
	let observedOperationCount = 0;
	let pathItemCount = 0;
	while (pathItems.length > 0) {
		const pending = pathItems.shift();
		if (!pending) break;
		pathItemCount += 1;
		const pathItem = object(pending.value, `OpenAPI ${pending.kind} path item`);
		for (const [method, operationValue] of Object.entries(pathItem)) {
			if (!HTTP_METHODS.has(method.toLowerCase())) continue;
			observedOperationCount += 1;
			const observation = operationObservation(
				operationValue,
				pending,
				method.toLowerCase(),
				root.title,
				root.apiVersion,
			);
			if (observation.operationId) {
				if (operationIds.has(observation.operationId)) {
					throw new Error("OpenAPI operationId values must be unique.");
				}
				operationIds.add(observation.operationId);
			}
			if (observations.length < MAX_OPERATIONS) observations.push(observation);
			pathItems.push(
				...callbackPathItems(operationValue, pending.location, method),
			);
		}
	}
	return Object.freeze({
		observations,
		pathItemCount,
		omittedCount: Math.max(0, observedOperationCount - observations.length),
	});
}

function openApiStaticCounts(document: Record<string, unknown>): {
	readonly schemaCount: number;
	readonly securitySchemeCount: number;
	readonly serverCount: number;
} {
	const components = optionalObject(document.components, "OpenAPI components");
	return Object.freeze({
		schemaCount: components
			? objectKeyCount(components.schemas, "OpenAPI component schemas")
			: 0,
		securitySchemeCount: components
			? objectKeyCount(
					components.securitySchemes,
					"OpenAPI component securitySchemes",
				)
			: 0,
		serverCount: arrayValue(document.servers, "OpenAPI servers").length,
	});
}

function initialPathItems(document: Record<string, unknown>): PendingPathItem[] {
	const pending: PendingPathItem[] = [];
	const paths = optionalObject(document.paths, "OpenAPI paths");
	if (paths) {
		for (const [path, value] of Object.entries(paths)) {
			if (!path.startsWith("/")) {
				throw new Error("OpenAPI path keys must begin with slash.");
			}
			pending.push({value, location: path, kind: "path"});
		}
	}
	const webhooks = optionalObject(document.webhooks, "OpenAPI webhooks");
	if (webhooks) {
		for (const [name, value] of Object.entries(webhooks)) {
			pending.push({value, location: name, kind: "webhook"});
		}
	}
	if (pending.length === 0) {
		throw new Error("OpenAPI document must contain paths or webhooks.");
	}
	return pending;
}

function operationObservation(
	...args: [unknown, PendingPathItem, string, string, string]
): OperationObservation {
	const [value, pending, method, title, apiVersion] = args;
	const operation = object(value, `OpenAPI ${method} operation`);
	object(operation.responses, `OpenAPI ${method} operation responses`);
	const operationId = optionalText(
		operation.operationId,
		`OpenAPI ${method} operationId`,
		4_096,
	);
	return Object.freeze({
		identityDigest: canonicalJsonDigest({
			kind: "openapi-operation",
			title,
			apiVersion,
			locationKind: pending.kind,
			location: pending.location,
			method,
			operationId: operationId ?? null,
		}),
		kind: pending.kind,
		...(operationId ? {operationId} : {}),
	});
}

function callbackPathItems(
	...args: [unknown, string, string]
): PendingPathItem[] {
	const [operationValue, parentLocation, method] = args;
	const operation = object(operationValue, `OpenAPI ${method} operation`);
	const callbacks = optionalObject(operation.callbacks, "OpenAPI callbacks");
	if (!callbacks) return [];
	const pending: PendingPathItem[] = [];
	for (const [callbackName, callbackValue] of Object.entries(callbacks)) {
		const callback = object(callbackValue, `OpenAPI callback ${callbackName}`);
		if (callback.$ref !== undefined) continue;
		for (const [expression, pathItem] of Object.entries(callback)) {
			pending.push({
				value: pathItem,
				location: `${parentLocation}:${method}:${callbackName}:${expression}`,
				kind: "callback",
			});
		}
	}
	return pending;
}

function collectReferences(document: Record<string, unknown>): {
	readonly externalCount: number;
	readonly unresolvedInternalCount: number;
} {
	const pending: unknown[] = [document];
	let externalCount = 0;
	let unresolvedInternalCount = 0;
	while (pending.length > 0) {
		const value = pending.pop();
		if (Array.isArray(value)) {
			pending.push(...value);
			continue;
		}
		if (!value || typeof value !== "object") continue;
		for (const [key, nested] of Object.entries(value)) {
			if (key === "$ref") {
				const reference = boundedText(nested, "OpenAPI $ref", 8_192);
				if (!reference.startsWith("#")) externalCount += 1;
				else if (!resolvesInternalReference(document, reference)) {
					unresolvedInternalCount += 1;
				}
			} else {
				pending.push(nested);
			}
		}
	}
	return Object.freeze({externalCount, unresolvedInternalCount});
}

function resolvesInternalReference(
	...args: [Record<string, unknown>, string]
): boolean {
	const [document, reference] = args;
	if (reference === "#") return true;
	if (!reference.startsWith("#/")) return false;
	let current: unknown = document;
	for (const encodedPart of reference.slice(2).split("/")) {
		const part = encodedPart.replaceAll("~1", "/").replaceAll("~0", "~");
		if (Array.isArray(current)) {
			if (!/^(0|[1-9][0-9]*)$/.test(part)) return false;
			current = current[Number(part)];
			continue;
		}
		if (!current || typeof current !== "object" || !Object.hasOwn(current, part)) {
			return false;
		}
		current = (current as Record<string, unknown>)[part];
	}
	return current !== undefined;
}

function objectKeyCount(...args: [unknown, string]): number {
	const [value, label] = args;
	return value === undefined ? 0 : Object.keys(object(value, label)).length;
}
