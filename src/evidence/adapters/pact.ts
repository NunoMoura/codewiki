import {canonicalJsonDigest, type Sha256Digest} from "../../utils/canonical-json.ts";
import * as adapterShared from "./shared.ts";
import type {
	ParsedStructuredDocument,
	StructuredDocumentEvidenceInput,
	StructuredDocumentEvidenceResult,
} from "./document.ts";
import * as structuredDocument from "./document.ts";

const {boundedText, objectValue: object} = adapterShared;
const {
	compareDocumentText: compareText,
	documentArrayValue: arrayValue,
	ingestStructuredDocumentEvidence,
	optionalDocumentObject: optionalObject,
	optionalDocumentText: optionalText,
	parseBoundedJsonObject,
} = structuredDocument;

export const PACT_EVIDENCE_ADAPTER_PROTOCOL = Object.freeze({
	id: "codewiki.evidence-adapter.pact",
	version: "1.0.0",
} as const);

const MAX_INTERACTIONS = 8_192;

export interface PactIngestionSummary {
	readonly profile: "Pact Specification 4.0 JSON";
	readonly interactionCount: number;
	readonly synchronousHttpInteractionCount: number;
	readonly asynchronousMessageInteractionCount: number;
	readonly synchronousMessageInteractionCount: number;
	readonly otherInteractionCount: number;
	readonly pendingInteractionCount: number;
	readonly pluginInteractionCount: number;
	readonly providerStateCount: number;
	readonly matchingRuleSetCount: number;
	readonly omittedInteractionCount: number;
}

export type PactEvidenceIngestionInput = StructuredDocumentEvidenceInput;

export type PactEvidenceIngestionResult = StructuredDocumentEvidenceResult<
	typeof PACT_EVIDENCE_ADAPTER_PROTOCOL,
	"pact",
	PactIngestionSummary
>;

interface PactInteractionObservation {
	readonly identityDigest: Sha256Digest;
	readonly type: string;
	readonly pending: boolean;
	readonly plugin: boolean;
	readonly providerStateCount: number;
	readonly matchingRuleSetCount: number;
	readonly key?: string;
	readonly description: string;
}

export function ingestPactV4JsonEvidence(
	input: PactEvidenceIngestionInput,
): PactEvidenceIngestionResult {
	return ingestStructuredDocumentEvidence(input, {
		protocol: PACT_EVIDENCE_ADAPTER_PROTOCOL,
		format: "pact",
		label: "Pact",
		mediaType: "application/vnd.pactfoundation.pact+json",
		authorityCeiling: "observed",
		parse: parsePactV4,
	});
}

function parsePactV4(
	bytes: Uint8Array,
): ParsedStructuredDocument<PactIngestionSummary> {
	const document = parseBoundedJsonObject(bytes, "Pact");
	const consumer = namedParty(document.consumer, "consumer");
	const provider = namedParty(document.provider, "provider");
	const metadata = object(document.metadata, "Pact metadata");
	const specification = object(
		metadata.pactSpecification,
		"Pact metadata pactSpecification",
	);
	if (specification.version !== "4.0") {
		throw new Error("Pact specification version must be 4.0.");
	}
	const entries = arrayValue(document.interactions, "Pact interactions");
	const observations: PactInteractionObservation[] = [];
	const keys = new Set<string>();
	const descriptions = new Set<string>();
	for (const [index, entry] of entries.entries()) {
		const observation = interactionObservation(
			entry,
			index,
			consumer,
			provider,
		);
		if (descriptions.has(observation.description)) {
			throw new Error("Pact interaction descriptions must be unique.");
		}
		descriptions.add(observation.description);
		if (observation.key) {
			if (keys.has(observation.key)) {
				throw new Error("Pact interaction keys must be unique.");
			}
			keys.add(observation.key);
		}
		if (observations.length < MAX_INTERACTIONS) observations.push(observation);
	}
	const omittedInteractionCount = Math.max(0, entries.length - observations.length);
	const typeCount = (type: string): number =>
		observations.filter((entry) => entry.type === type).length;
	const knownTypeCount =
		typeCount("Synchronous/HTTP") +
		typeCount("Asynchronous/Messages") +
		typeCount("Synchronous/Messages");
	const contractIdentity = canonicalJsonDigest({
		kind: "pact-contract",
		consumer,
		provider,
		specification: "4.0",
	});
	let providerStateCount = 0;
	let matchingRuleSetCount = 0;
	for (const observation of observations) {
		providerStateCount += observation.providerStateCount;
		matchingRuleSetCount += observation.matchingRuleSetCount;
	}
	return Object.freeze({
		summary: Object.freeze({
			profile: "Pact Specification 4.0 JSON" as const,
			interactionCount: observations.length,
			synchronousHttpInteractionCount: typeCount("Synchronous/HTTP"),
			asynchronousMessageInteractionCount: typeCount("Asynchronous/Messages"),
			synchronousMessageInteractionCount: typeCount("Synchronous/Messages"),
			otherInteractionCount: observations.length - knownTypeCount,
			pendingInteractionCount: observations.filter((entry) => entry.pending).length,
			pluginInteractionCount: observations.filter((entry) => entry.plugin).length,
			providerStateCount,
			matchingRuleSetCount,
			omittedInteractionCount,
		}),
		identityDigests: [
			contractIdentity,
			...observations.map((entry) => entry.identityDigest),
		],
		observationRefs: [
			`pact/contract/${contractIdentity}`,
			...observations.map(
				(entry) => `pact/interaction/${entry.identityDigest}`,
			),
		],
		incompleteReasons:
			omittedInteractionCount > 0 ? ["interactions_truncated"] : [],
	});
}

function namedParty(...args: [unknown, string]): string {
	const [value, label] = args;
	const party = object(value, `Pact ${label}`);
	return boundedText(party.name, `Pact ${label} name`, 4_096);
}

function interactionObservation(
	...args: [unknown, number, string, string]
): PactInteractionObservation {
	const [value, index, consumer, provider] = args;
	const interaction = object(value, `Pact interaction ${index}`);
	const type = boundedText(interaction.type, `Pact interaction ${index} type`, 256);
	const description = boundedText(
		interaction.description,
		`Pact interaction ${index} description`,
		8_192,
	);
	const key = optionalText(interaction.key, `Pact interaction ${index} key`, 4_096);
	const providerStates = arrayValue(
		interaction.providerStates,
		`Pact interaction ${index} providerStates`,
	);
	const providerStateDigests = Array.from(
		providerStates.entries(),
		([stateIndex, stateValue]) => {
			const state = object(
				stateValue,
				`Pact interaction ${index} providerState ${stateIndex}`,
			);
			return canonicalJsonDigest({
				name: boundedText(
					state.name,
					`Pact interaction ${index} providerState ${stateIndex} name`,
					4_096,
				),
				paramsDigest:
					state.params === undefined
						? null
						: canonicalJsonDigest(state.params),
			});
		},
	).sort(compareText);
	if (interaction.pending !== undefined && typeof interaction.pending !== "boolean") {
		throw new Error(`Pact interaction ${index} pending must be boolean.`);
	}
	assertCoreInteractionShape(type, interaction, index);
	const plugin = interaction.pluginConfiguration !== undefined;
	if (plugin) object(interaction.pluginConfiguration, `Pact interaction ${index} pluginConfiguration`);
	const matchingRuleSetCount = countMatchingRuleSets(interaction);
	return Object.freeze({
		identityDigest: canonicalJsonDigest({
			kind: "pact-interaction",
			consumer,
			provider,
			type,
			description,
			key: key ?? null,
			providerStateDigests,
		}),
		type,
		pending: interaction.pending === true,
		plugin,
		providerStateCount: providerStates.length,
		matchingRuleSetCount,
		...(key ? {key} : {}),
		description,
	});
}

function assertCoreInteractionShape(
	...args: [string, Record<string, unknown>, number]
): void {
	const [type, interaction, index] = args;
	if (type === "Synchronous/HTTP") {
		const request = object(interaction.request, `Pact interaction ${index} request`);
		const response = object(interaction.response, `Pact interaction ${index} response`);
		boundedText(request.method, `Pact interaction ${index} request method`, 32);
		boundedText(request.path, `Pact interaction ${index} request path`, 8_192);
		if (!Number.isInteger(response.status) || (response.status as number) < 100 || (response.status as number) > 599) {
			throw new Error(`Pact interaction ${index} response status is invalid.`);
		}
		return;
	}
	if (type === "Asynchronous/Messages" && interaction.contents === undefined) {
		throw new Error(`Pact interaction ${index} asynchronous message requires contents.`);
	}
}

function countMatchingRuleSets(interaction: Record<string, unknown>): number {
	const locations = [
		interaction.matchingRules,
		optionalObject(interaction.request, "Pact nested request")?.matchingRules,
		optionalObject(interaction.response, "Pact nested response")?.matchingRules,
		optionalObject(interaction.contents, "Pact nested contents")?.matchingRules,
	];
	return locations.filter((value) => value !== undefined).length;
}
