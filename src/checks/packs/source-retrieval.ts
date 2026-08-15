import {
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import {
	createUserStandardSourceSnapshot,
	normalizeUserStandardHttpsUri,
	type UserStandardMediaType,
	type UserStandardSourceSnapshot,
} from "./user-standards.ts";
import {canonicalIsoTimestamp} from "./validation.ts";

export const USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL = Object.freeze({
	id: "codewiki.user-standard-source-retrieval",
	version: "1.0.0",
	maxRequestBytes: 131_072,
	maxSourceBytes: 131_072,
});

const RECEIPT_ID = /^user-standard-source-receipt:[0-9a-f]{64}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MEDIA_TYPES: readonly UserStandardMediaType[] = [
	"text/plain",
	"text/markdown",
];
const RETRIEVER_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/u;
const RETRIEVER_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;
const UNAVAILABLE_REASONS = [
	"not_found",
	"unauthorized",
	"unsupported_media_type",
	"temporarily_unavailable",
	"provider_failure",
	"malformed_response",
	"cancelled",
] as const;

export type UserStandardSourceUnavailableReason =
	(typeof UNAVAILABLE_REASONS)[number];

export type UserStandardSourceSelection =
	| {
			readonly kind: "inline";
			readonly mediaType: UserStandardMediaType;
			readonly content: string;
	  }
	| {
			readonly kind: "url";
			readonly uri: string;
	  };

export interface UserStandardSourceRequest {
	readonly protocolId: typeof USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.id;
	readonly protocolVersion: typeof USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.version;
	readonly selection: UserStandardSourceSelection;
	readonly requestDigest: Sha256Digest;
}

export interface UserStandardSourceRetrieverBinding {
	readonly id: string;
	readonly version: string;
	readonly configurationDigest: Sha256Digest;
}

export type UserStandardUrlRetrievalObservation =
	| {
			readonly status: "retrieved";
			readonly mediaType: UserStandardMediaType;
			readonly content: string;
			readonly uri: string;
	  }
	| {
			readonly status: "unavailable";
			readonly reason: Exclude<
				UserStandardSourceUnavailableReason,
				"provider_failure" | "malformed_response" | "cancelled"
			>;
	  };

export interface UserStandardUrlRetriever {
	readonly binding: UserStandardSourceRetrieverBinding;
	readonly retrieve: (input: {
		readonly uri: string;
		readonly maxBytes: number;
		readonly signal?: AbortSignal;
	}) => Promise<UserStandardUrlRetrievalObservation>;
}

interface UserStandardSourceReceiptBase {
	readonly receiptId: string;
	readonly protocolId: typeof USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.id;
	readonly protocolVersion: typeof USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.version;
	readonly request: UserStandardSourceRequest;
	readonly retriever: UserStandardSourceRetrieverBinding;
	readonly recordedAt: string;
}

export type UserStandardSourceReceipt =
	| (UserStandardSourceReceiptBase & {
			readonly status: "retrieved";
			readonly source: UserStandardSourceSnapshot;
			readonly reason: null;
	  })
	| (UserStandardSourceReceiptBase & {
			readonly status: "unavailable";
			readonly source: null;
			readonly reason: UserStandardSourceUnavailableReason;
	  });

const INLINE_RETRIEVER = Object.freeze({
	id: "codewiki.inline-user-standard-source",
	version: "1.0.0",
	configurationDigest: canonicalJsonDigest({kind: "inline"}),
});

export function createUserStandardSourceRequest(
	selection: UserStandardSourceSelection,
): UserStandardSourceRequest {
	const normalized = normalizeSelection(selection);
	const body = {
		protocolId: USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.id,
		protocolVersion: USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.version,
		selection: normalized,
	};
	const request = Object.freeze({
		...body,
		requestDigest: canonicalJsonDigest(body),
	});
	assertRequestSize(request);
	return request;
}

export function assertUserStandardSourceRequest(
	value: UserStandardSourceRequest,
): void {
	assertExactKeys(
		value,
		["protocolId", "protocolVersion", "selection", "requestDigest"],
		"User Standard source request",
	);
	if (
		value.protocolId !== USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.id ||
		value.protocolVersion !== USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.version
	) {
		throw new Error("User Standard source request protocol identity is invalid.");
	}
	const selection = normalizeSelection(value.selection);
	const expected = createUserStandardSourceRequest(selection);
	if (value.requestDigest !== expected.requestDigest) {
		throw new Error("User Standard source request digest is invalid.");
	}
	assertRequestSize(value);
}

export async function retrieveUserStandardSource(input: {
	readonly request: UserStandardSourceRequest;
	readonly urlRetriever?: UserStandardUrlRetriever;
	readonly now?: () => Date;
	readonly signal?: AbortSignal;
}): Promise<UserStandardSourceReceipt> {
	assertUserStandardSourceRequest(input.request);
	const recordedAt = canonicalIsoTimestamp(
		(input.now ?? (() => new Date()))().toISOString(),
		"User Standard source receipt recordedAt",
	);
	if (input.request.selection.kind === "inline") {
		return sourceReceipt({
			request: input.request,
			retriever: INLINE_RETRIEVER,
			recordedAt,
			status: "retrieved",
			source: createUserStandardSourceSnapshot({
				kind: "inline",
				mediaType: input.request.selection.mediaType,
				content: input.request.selection.content,
				observedAt: recordedAt,
			}),
			reason: null,
		});
	}
	if (input.signal?.aborted) {
		return unavailableReceipt({
			request: input.request,
			retriever: input.urlRetriever?.binding ?? unavailableRetrieverBinding(),
			recordedAt,
			reason: "cancelled",
		});
	}
	if (!input.urlRetriever) {
		return unavailableReceipt({
			request: input.request,
			retriever: unavailableRetrieverBinding(),
			recordedAt,
			reason: "temporarily_unavailable",
		});
	}
	const retriever = normalizeRetrieverBinding(input.urlRetriever.binding);
	let observation: UserStandardUrlRetrievalObservation;
	try {
		observation = await input.urlRetriever.retrieve({
			uri: input.request.selection.uri,
			maxBytes: USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.maxSourceBytes,
			...(input.signal ? {signal: input.signal} : {}),
		});
	} catch {
		return unavailableReceipt({
			request: input.request,
			retriever,
			recordedAt,
			reason: input.signal?.aborted ? "cancelled" : "provider_failure",
		});
	}
	try {
		return receiptFromObservation({
			request: input.request,
			retriever,
			recordedAt,
			observation,
		});
	} catch {
		return unavailableReceipt({
			request: input.request,
			retriever,
			recordedAt,
			reason: "malformed_response",
		});
	}
}

export function assertUserStandardSourceReceipt(
	value: UserStandardSourceReceipt,
): void {
	assertExactKeys(
		value,
		[
			"receiptId",
			"protocolId",
			"protocolVersion",
			"request",
			"retriever",
			"recordedAt",
			"status",
			"source",
			"reason",
		],
		"User Standard source receipt",
	);
	if (
		value.protocolId !== USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.id ||
		value.protocolVersion !== USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.version
	) {
		throw new Error("User Standard source receipt protocol identity is invalid.");
	}
	if (!RECEIPT_ID.test(value.receiptId)) {
		throw new Error("User Standard source receipt id is invalid.");
	}
	assertUserStandardSourceRequest(value.request);
	const retriever = normalizeRetrieverBinding(value.retriever);
	const recordedAt = canonicalIsoTimestamp(
		value.recordedAt,
		"User Standard source receipt recordedAt",
	);
	assertRetrieverMatchesRequest({
		request: value.request,
		retriever,
		status: value.status,
	});
	if (value.status === "retrieved") {
		if (value.reason !== null || value.source === null) {
			throw new Error("Retrieved User Standard source receipt is incomplete.");
		}
		const {contentDigest, ...sourceMaterial} = value.source;
		const source = createUserStandardSourceSnapshot(sourceMaterial);
		if (
			source.contentDigest !== contentDigest ||
			source.observedAt !== recordedAt
		) {
			throw new Error("User Standard source receipt snapshot is invalid.");
		}
		assertSourceMatchesRequest({request: value.request, source});
		assertReceiptIdentity({...value, retriever, recordedAt, source});
		return;
	}
	if (value.status !== "unavailable" || value.source !== null) {
		throw new Error("User Standard source receipt status is invalid.");
	}
	const reason = unavailableReason(value.reason);
	assertReceiptIdentity({...value, retriever, recordedAt, reason});
}

function receiptFromObservation(input: {
	readonly request: UserStandardSourceRequest;
	readonly retriever: UserStandardSourceRetrieverBinding;
	readonly recordedAt: string;
	readonly observation: UserStandardUrlRetrievalObservation;
}): UserStandardSourceReceipt {
	if (!isRecord(input.observation)) {
		throw new Error("User Standard source observation must be an object.");
	}
	if (input.observation.status === "unavailable") {
		assertExactKeys(
			input.observation,
			["status", "reason"],
			"User Standard source observation",
		);
		return unavailableReceipt({
			request: input.request,
			retriever: input.retriever,
			recordedAt: input.recordedAt,
			reason: adapterUnavailableReason(input.observation.reason),
		});
	}
	assertExactKeys(
		input.observation,
		["status", "mediaType", "content", "uri"],
		"User Standard source observation",
	);
	if (input.observation.status !== "retrieved") {
		throw new Error("User Standard source observation status is invalid.");
	}
	const uri = normalizeUserStandardHttpsUri(input.observation.uri);
	if (
		input.request.selection.kind !== "url" ||
		uri !== input.request.selection.uri
	) {
		throw new Error("User Standard source observation changed selected URI.");
	}
	if (!MEDIA_TYPES.includes(input.observation.mediaType)) {
		throw new Error("User Standard source observation mediaType is invalid.");
	}
	if (
		typeof input.observation.content !== "string" ||
		Buffer.byteLength(input.observation.content, "utf8") >
			USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.maxSourceBytes
	) {
		throw new Error("User Standard source observation content is invalid.");
	}
	return sourceReceipt({
		request: input.request,
		retriever: input.retriever,
		recordedAt: input.recordedAt,
		status: "retrieved",
		source: createUserStandardSourceSnapshot({
			kind: "url",
			mediaType: input.observation.mediaType,
			content: input.observation.content,
			observedAt: input.recordedAt,
			uri,
		}),
		reason: null,
	});
}

function sourceReceipt(input: Omit<
	Extract<UserStandardSourceReceipt, {readonly status: "retrieved"}>,
	"receiptId" | "protocolId" | "protocolVersion"
>): UserStandardSourceReceipt {
	assertSourceMatchesRequest({request: input.request, source: input.source});
	return receiptWithIdentity(input);
}

function unavailableReceipt(input: {
	readonly request: UserStandardSourceRequest;
	readonly retriever: UserStandardSourceRetrieverBinding;
	readonly recordedAt: string;
	readonly reason: UserStandardSourceUnavailableReason;
}): UserStandardSourceReceipt {
	return receiptWithIdentity({
		...input,
		status: "unavailable" as const,
		source: null,
	});
}

function receiptWithIdentity(input: Omit<
	UserStandardSourceReceipt,
	"receiptId" | "protocolId" | "protocolVersion"
>): UserStandardSourceReceipt {
	const payload = {
		protocolId: USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.id,
		protocolVersion: USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.version,
		...input,
	};
	return Object.freeze({
		receiptId: `user-standard-source-receipt:${canonicalJsonDigest(payload).slice("sha256:".length)}`,
		...payload,
	}) as UserStandardSourceReceipt;
}

function assertReceiptIdentity(value: UserStandardSourceReceipt): void {
	const {receiptId, ...payload} = value;
	const expected = `user-standard-source-receipt:${canonicalJsonDigest(payload).slice("sha256:".length)}`;
	if (receiptId !== expected) {
		throw new Error("User Standard source receipt identity is invalid.");
	}
}

function assertRetrieverMatchesRequest(input: {
	readonly request: UserStandardSourceRequest;
	readonly retriever: UserStandardSourceRetrieverBinding;
	readonly status: UserStandardSourceReceipt["status"];
}): void {
	if (input.request.selection.kind !== "inline") return;
	if (
		input.status !== "retrieved" ||
		input.retriever.id !== INLINE_RETRIEVER.id ||
		input.retriever.version !== INLINE_RETRIEVER.version ||
		input.retriever.configurationDigest !== INLINE_RETRIEVER.configurationDigest
	) {
		throw new Error("Inline User Standard source retriever binding is invalid.");
	}
}

function assertSourceMatchesRequest(input: {
	readonly request: UserStandardSourceRequest;
	readonly source: UserStandardSourceSnapshot;
}): void {
	const selection = input.request.selection;
	if (selection.kind !== input.source.kind) {
		throw new Error("User Standard source does not match requested kind.");
	}
	if (selection.kind === "inline") {
		if (
			input.source.mediaType !== selection.mediaType ||
			input.source.content !== selection.content.trim().normalize("NFC")
		) {
			throw new Error("Inline User Standard source does not match request.");
		}
		return;
	}
	if (input.source.uri !== selection.uri) {
		throw new Error("URL User Standard source does not match request.");
	}
}

function normalizeSelection(value: UserStandardSourceSelection): UserStandardSourceSelection {
	if (!isRecord(value)) {
		throw new Error("User Standard source selection must be an object.");
	}
	if (value.kind === "inline") {
		assertExactKeys(
			value,
			["kind", "mediaType", "content"],
			"Inline User Standard source selection",
		);
		if (!MEDIA_TYPES.includes(value.mediaType as UserStandardMediaType)) {
			throw new Error("Inline User Standard source mediaType is invalid.");
		}
		if (typeof value.content !== "string") {
			throw new Error("Inline User Standard source content must be text.");
		}
		const source = createUserStandardSourceSnapshot({
			kind: "inline",
			mediaType: value.mediaType as UserStandardMediaType,
			content: value.content,
			observedAt: "1970-01-01T00:00:00.000Z",
		});
		return Object.freeze({
			kind: "inline",
			mediaType: source.mediaType,
			content: source.content,
		});
	}
	assertExactKeys(value, ["kind", "uri"], "URL User Standard source selection");
	if (value.kind !== "url") {
		throw new Error("User Standard source selection kind is invalid.");
	}
	return Object.freeze({
		kind: "url",
		uri: normalizeUserStandardHttpsUri(value.uri),
	});
}

function normalizeRetrieverBinding(
	value: UserStandardSourceRetrieverBinding,
): UserStandardSourceRetrieverBinding {
	if (!isRecord(value)) {
		throw new Error("User Standard source retriever binding must be an object.");
	}
	assertExactKeys(
		value,
		["id", "version", "configurationDigest"],
		"User Standard source retriever binding",
	);
	if (typeof value.id !== "string" || !RETRIEVER_ID.test(value.id)) {
		throw new Error("User Standard source retriever id is invalid.");
	}
	if (typeof value.version !== "string" || !RETRIEVER_VERSION.test(value.version)) {
		throw new Error("User Standard source retriever version is invalid.");
	}
	if (
		typeof value.configurationDigest !== "string" ||
		!DIGEST.test(value.configurationDigest)
	) {
		throw new Error(
			"User Standard source retriever configurationDigest is invalid.",
		);
	}
	return Object.freeze({...value});
}

function unavailableRetrieverBinding(): UserStandardSourceRetrieverBinding {
	return Object.freeze({
		id: "codewiki.unavailable-user-standard-source",
		version: "1.0.0",
		configurationDigest: canonicalJsonDigest({available: false}),
	});
}

function adapterUnavailableReason(
	value: unknown,
): Exclude<
	UserStandardSourceUnavailableReason,
	"provider_failure" | "malformed_response" | "cancelled"
> {
	if (
		value === "not_found" ||
		value === "unauthorized" ||
		value === "unsupported_media_type" ||
		value === "temporarily_unavailable"
	) {
		return value;
	}
	throw new Error("User Standard source unavailable reason is invalid.");
}

function unavailableReason(value: unknown): UserStandardSourceUnavailableReason {
	if (
		typeof value !== "string" ||
		!(UNAVAILABLE_REASONS as readonly string[]).includes(value)
	) {
		throw new Error("User Standard source receipt reason is invalid.");
	}
	return value as UserStandardSourceUnavailableReason;
}

function assertRequestSize(value: UserStandardSourceRequest): void {
	if (
		Buffer.byteLength(JSON.stringify(value), "utf8") >
		USER_STANDARD_SOURCE_RETRIEVAL_PROTOCOL.maxRequestBytes
	) {
		throw new Error("User Standard source request exceeds protocol limit.");
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
