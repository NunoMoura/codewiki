import {
	assertSha256Digest,
	canonicalJson,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";

export const CLIENT_SERVER_PROTOCOL = Object.freeze({
	id: "codewiki.client-server",
	version: "1.0.0",
	maxPayloadBytes: 65_536,
	maxEnvelopeBytes: 131_072,
	maxProvenanceRefs: 128,
	maxQueryItems: 100,
});

export const CLIENT_KINDS = Object.freeze([
	"app",
	"cli",
	"pi",
	"mcp",
	"slack",
	"github",
	"whatsapp",
	"openclaw",
] as const);

export type ClientKind = (typeof CLIENT_KINDS)[number];
export type ClientServerOperationStatus =
	| "accepted"
	| "running"
	| "succeeded"
	| "failed"
	| "cancelled";
export type ClientServerCoverage = "complete" | "partial" | "unavailable";

export interface ClientServerActorContext {
	readonly actorId: string;
	readonly authenticatedIdentityRef: string;
}

export interface ClientServerTransportContext {
	readonly clientKind: ClientKind;
	readonly clientInstanceId: string;
	readonly authenticationRef: string;
}

export interface ClientServerRequestContext {
	readonly actor: ClientServerActorContext;
	readonly client: ClientServerTransportContext;
	readonly delegationRef?: string;
}

export interface ClientServerSnapshotContext {
	readonly snapshotDigest: Sha256Digest;
	readonly provenanceRefs: readonly string[];
	readonly coverage: ClientServerCoverage;
	readonly truncated: boolean;
	readonly stale: boolean;
	readonly redacted: boolean;
}

export interface ClientServerCommandEnvelope extends ClientServerRequestContext {
	readonly protocolId: typeof CLIENT_SERVER_PROTOCOL.id;
	readonly protocolVersion: typeof CLIENT_SERVER_PROTOCOL.version;
	readonly kind: "command";
	readonly transportRequestId: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly commandName: string;
	readonly targetRef: string;
	readonly expectedDigest: Sha256Digest;
	readonly semanticIdempotencyKey: string;
	readonly expiresAt: string;
	readonly requestedCapability: string;
	readonly payload: Readonly<Record<string, CanonicalJsonValue>>;
}

export interface ClientServerQueryEnvelope extends ClientServerRequestContext {
	readonly protocolId: typeof CLIENT_SERVER_PROTOCOL.id;
	readonly protocolVersion: typeof CLIENT_SERVER_PROTOCOL.version;
	readonly kind: "query";
	readonly transportRequestId: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly queryName: string;
	readonly targetRef?: string;
	readonly expectedSnapshotDigest?: Sha256Digest;
	readonly maxItems: number;
	readonly payload: Readonly<Record<string, CanonicalJsonValue>>;
}

export interface ClientServerQueryResultEnvelope {
	readonly protocolId: typeof CLIENT_SERVER_PROTOCOL.id;
	readonly protocolVersion: typeof CLIENT_SERVER_PROTOCOL.version;
	readonly kind: "query_result";
	readonly transportRequestId: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly queryName: string;
	readonly snapshot: ClientServerSnapshotContext;
	readonly payload: Readonly<Record<string, CanonicalJsonValue>>;
}

export interface ClientServerOperationEnvelope {
	readonly protocolId: typeof CLIENT_SERVER_PROTOCOL.id;
	readonly protocolVersion: typeof CLIENT_SERVER_PROTOCOL.version;
	readonly kind: "operation";
	readonly operationId: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly actorId: string;
	readonly commandName: string;
	readonly semanticIdempotencyDigest: Sha256Digest;
	readonly status: ClientServerOperationStatus;
	readonly acceptedAt: string;
	readonly updatedAt: string;
	readonly snapshotDigest: Sha256Digest;
	readonly payload: Readonly<Record<string, CanonicalJsonValue>>;
}

export interface ClientServerEventEnvelope {
	readonly protocolId: typeof CLIENT_SERVER_PROTOCOL.id;
	readonly protocolVersion: typeof CLIENT_SERVER_PROTOCOL.version;
	readonly kind: "event";
	readonly eventId: string;
	readonly cursor: number;
	readonly repositoryIdentity: Sha256Digest;
	readonly eventName: string;
	readonly occurredAt: string;
	readonly snapshot: ClientServerSnapshotContext;
	readonly payload: Readonly<Record<string, CanonicalJsonValue>>;
}

const COMMAND_FIELDS = [
	"protocolId",
	"protocolVersion",
	"kind",
	"transportRequestId",
	"actor",
	"client",
	"delegationRef",
	"repositoryIdentity",
	"commandName",
	"targetRef",
	"expectedDigest",
	"semanticIdempotencyKey",
	"expiresAt",
	"requestedCapability",
	"payload",
] as const;

const QUERY_FIELDS = [
	"protocolId",
	"protocolVersion",
	"kind",
	"transportRequestId",
	"actor",
	"client",
	"delegationRef",
	"repositoryIdentity",
	"queryName",
	"targetRef",
	"expectedSnapshotDigest",
	"maxItems",
	"payload",
] as const;

const QUERY_RESULT_FIELDS = [
	"protocolId",
	"protocolVersion",
	"kind",
	"transportRequestId",
	"repositoryIdentity",
	"queryName",
	"snapshot",
	"payload",
] as const;

const OPERATION_FIELDS = [
	"protocolId",
	"protocolVersion",
	"kind",
	"operationId",
	"repositoryIdentity",
	"actorId",
	"commandName",
	"semanticIdempotencyDigest",
	"status",
	"acceptedAt",
	"updatedAt",
	"snapshotDigest",
	"payload",
] as const;

const EVENT_FIELDS = [
	"protocolId",
	"protocolVersion",
	"kind",
	"eventId",
	"cursor",
	"repositoryIdentity",
	"eventName",
	"occurredAt",
	"snapshot",
	"payload",
] as const;

const RESERVED_COMMAND_PAYLOAD_FIELDS = new Set([
	"acceptedAt",
	"actor",
	"actorId",
	"actorPolicyDigest",
	"authenticatedIdentityRef",
	"authenticationEvidenceId",
	"authenticationRef",
	"authority",
	"authorityBinding",
	"client",
	"clientInstanceId",
	"clientKind",
	"createdAt",
	"delegationRef",
	"effectReceipt",
	"exitReport",
	"occurredAt",
	"recordedAt",
	"role",
	"route",
	"runtimeProtocolDigest",
	"updatedAt",
	"verificationOutcome",
	"verificationResult",
]);

export function normalizeClientServerCommand(
	value: unknown,
	now: Date = new Date(),
): ClientServerCommandEnvelope {
	const input = exactObject(value, COMMAND_FIELDS, "Client/Server command");
	assertProtocol(input, "command");
	const expiresAt = timestamp(input.expiresAt, "Client/Server command expiresAt");
	if (Date.parse(expiresAt) <= now.getTime()) {
		throw new Error("Client/Server command has expired.");
	}
	const payload = payloadObject(input.payload, "Client/Server command payload");
	assertPayloadHasNoReservedFields(payload);
	return envelope<ClientServerCommandEnvelope>({
		protocolId: CLIENT_SERVER_PROTOCOL.id,
		protocolVersion: CLIENT_SERVER_PROTOCOL.version,
		kind: "command",
		transportRequestId: text(input.transportRequestId, "transportRequestId"),
		...requestContext(input),
		repositoryIdentity: assertSha256Digest(input.repositoryIdentity, "repositoryIdentity"),
		commandName: text(input.commandName, "commandName"),
		targetRef: text(input.targetRef, "targetRef", 4_096),
		expectedDigest: assertSha256Digest(input.expectedDigest, "expectedDigest"),
		semanticIdempotencyKey: text(input.semanticIdempotencyKey, "semanticIdempotencyKey"),
		expiresAt,
		requestedCapability: text(input.requestedCapability, "requestedCapability"),
		payload,
	});
}

export function normalizeClientServerRequestContext(
	value: unknown,
): ClientServerRequestContext {
	return requestContext(
		exactObject(
			value,
			["actor", "client", "delegationRef"],
			"Client/Server request context",
		),
	);
}

export function normalizeClientServerQuery(value: unknown): ClientServerQueryEnvelope {
	const input = exactObject(value, QUERY_FIELDS, "Client/Server query");
	assertProtocol(input, "query");
	const maxItems = integer(input.maxItems, "maxItems", 1, CLIENT_SERVER_PROTOCOL.maxQueryItems);
	return envelope<ClientServerQueryEnvelope>({
		protocolId: CLIENT_SERVER_PROTOCOL.id,
		protocolVersion: CLIENT_SERVER_PROTOCOL.version,
		kind: "query",
		transportRequestId: text(input.transportRequestId, "transportRequestId"),
		...requestContext(input),
		repositoryIdentity: assertSha256Digest(input.repositoryIdentity, "repositoryIdentity"),
		queryName: text(input.queryName, "queryName"),
		...(input.targetRef === undefined
			? {}
			: {targetRef: text(input.targetRef, "targetRef", 4_096)}),
		...(input.expectedSnapshotDigest === undefined
			? {}
			: {
					expectedSnapshotDigest: assertSha256Digest(
						input.expectedSnapshotDigest,
						"expectedSnapshotDigest",
					),
				}),
		maxItems,
		payload: payloadObject(input.payload, "Client/Server query payload"),
	});
}

export function normalizeClientServerQueryResult(
	value: unknown,
): ClientServerQueryResultEnvelope {
	const input = exactObject(value, QUERY_RESULT_FIELDS, "Client/Server query result");
	assertProtocol(input, "query_result");
	return envelope<ClientServerQueryResultEnvelope>({
		protocolId: CLIENT_SERVER_PROTOCOL.id,
		protocolVersion: CLIENT_SERVER_PROTOCOL.version,
		kind: "query_result",
		transportRequestId: text(input.transportRequestId, "transportRequestId"),
		repositoryIdentity: assertSha256Digest(input.repositoryIdentity, "repositoryIdentity"),
		queryName: text(input.queryName, "queryName"),
		snapshot: snapshotContext(input.snapshot),
		payload: payloadObject(input.payload, "Client/Server query result payload"),
	});
}

export function normalizeClientServerOperation(
	value: unknown,
): ClientServerOperationEnvelope {
	const input = exactObject(value, OPERATION_FIELDS, "Client/Server operation");
	assertProtocol(input, "operation");
	const acceptedAt = timestamp(input.acceptedAt, "Client/Server operation acceptedAt");
	const updatedAt = timestamp(input.updatedAt, "Client/Server operation updatedAt");
	if (Date.parse(updatedAt) < Date.parse(acceptedAt)) {
		throw new Error("Client/Server operation updatedAt cannot precede acceptedAt.");
	}
	const status = input.status;
	if (!(["accepted", "running", "succeeded", "failed", "cancelled"] as const).includes(status as ClientServerOperationStatus)) {
		throw new Error("Client/Server operation status is unsupported.");
	}
	return envelope<ClientServerOperationEnvelope>({
		protocolId: CLIENT_SERVER_PROTOCOL.id,
		protocolVersion: CLIENT_SERVER_PROTOCOL.version,
		kind: "operation",
		operationId: text(input.operationId, "operationId"),
		repositoryIdentity: assertSha256Digest(input.repositoryIdentity, "repositoryIdentity"),
		actorId: text(input.actorId, "actorId"),
		commandName: text(input.commandName, "commandName"),
		semanticIdempotencyDigest: assertSha256Digest(
			input.semanticIdempotencyDigest,
			"semanticIdempotencyDigest",
		),
		status: status as ClientServerOperationStatus,
		acceptedAt,
		updatedAt,
		snapshotDigest: assertSha256Digest(input.snapshotDigest, "snapshotDigest"),
		payload: payloadObject(input.payload, "Client/Server operation payload"),
	});
}

export function normalizeClientServerEvent(value: unknown): ClientServerEventEnvelope {
	const input = exactObject(value, EVENT_FIELDS, "Client/Server event");
	assertProtocol(input, "event");
	return envelope<ClientServerEventEnvelope>({
		protocolId: CLIENT_SERVER_PROTOCOL.id,
		protocolVersion: CLIENT_SERVER_PROTOCOL.version,
		kind: "event",
		eventId: text(input.eventId, "eventId"),
		cursor: integer(input.cursor, "cursor", 1, Number.MAX_SAFE_INTEGER),
		repositoryIdentity: assertSha256Digest(input.repositoryIdentity, "repositoryIdentity"),
		eventName: text(input.eventName, "eventName"),
		occurredAt: timestamp(input.occurredAt, "Client/Server event occurredAt"),
		snapshot: snapshotContext(input.snapshot),
		payload: payloadObject(input.payload, "Client/Server event payload"),
	});
}

export function serverTransportDeduplicationDigest(
	context: ClientServerRequestContext,
	transportRequestId: string,
): Sha256Digest {
	return canonicalJsonDigest({
		clientKind: context.client.clientKind,
		clientInstanceId: context.client.clientInstanceId,
		transportRequestId: text(transportRequestId, "transportRequestId"),
	});
}

export function runtimeSemanticIdempotencyDigest(
	command: ClientServerCommandEnvelope,
): Sha256Digest {
	return canonicalJsonDigest({
		protocolId: command.protocolId,
		protocolVersion: command.protocolVersion,
		repositoryIdentity: command.repositoryIdentity,
		actorId: command.actor.actorId,
		commandName: command.commandName,
		targetRef: command.targetRef,
		expectedDigest: command.expectedDigest,
		semanticIdempotencyKey: command.semanticIdempotencyKey,
		requestedCapability: command.requestedCapability,
		payload: command.payload,
	});
}

function requestContext(input: Record<string, unknown>): ClientServerRequestContext {
	const actor = exactObject(
		input.actor,
		["actorId", "authenticatedIdentityRef"],
		"Client/Server actor context",
	);
	const client = exactObject(
		input.client,
		["clientKind", "clientInstanceId", "authenticationRef"],
		"Client/Server client context",
	);
	if (!CLIENT_KINDS.includes(client.clientKind as ClientKind)) {
		throw new Error("Client/Server clientKind is unsupported.");
	}
	return {
		actor: {
			actorId: text(actor.actorId, "actor.actorId"),
			authenticatedIdentityRef: text(
				actor.authenticatedIdentityRef,
				"actor.authenticatedIdentityRef",
				4_096,
			),
		},
		client: {
			clientKind: client.clientKind as ClientKind,
			clientInstanceId: text(client.clientInstanceId, "client.clientInstanceId"),
			authenticationRef: text(
				client.authenticationRef,
				"client.authenticationRef",
				4_096,
			),
		},
		...(input.delegationRef === undefined
			? {}
			: {delegationRef: text(input.delegationRef, "delegationRef", 4_096)}),
	};
}

function snapshotContext(value: unknown): ClientServerSnapshotContext {
	const input = exactObject(
		value,
		["snapshotDigest", "provenanceRefs", "coverage", "truncated", "stale", "redacted"],
		"Client/Server snapshot context",
	);
	const coverage = input.coverage;
	if (!(["complete", "partial", "unavailable"] as const).includes(coverage as ClientServerCoverage)) {
		throw new Error("Client/Server snapshot coverage is unsupported.");
	}
	if (!Array.isArray(input.provenanceRefs) || input.provenanceRefs.length > CLIENT_SERVER_PROTOCOL.maxProvenanceRefs) {
		throw new Error("Client/Server snapshot provenanceRefs are invalid or exceed the limit.");
	}
	const provenanceRefs = input.provenanceRefs.map((value, index) =>
		text(value, `snapshot.provenanceRefs[${index}]`, 4_096),
	);
	if (new Set(provenanceRefs).size !== provenanceRefs.length) {
		throw new Error("Client/Server snapshot provenanceRefs must be unique.");
	}
	return {
		snapshotDigest: assertSha256Digest(input.snapshotDigest, "snapshot.snapshotDigest"),
		provenanceRefs: Object.freeze(provenanceRefs),
		coverage: coverage as ClientServerCoverage,
		truncated: boolean(input.truncated, "snapshot.truncated"),
		stale: boolean(input.stale, "snapshot.stale"),
		redacted: boolean(input.redacted, "snapshot.redacted"),
	};
}

function assertProtocol(input: Record<string, unknown>, kind: string): void {
	if (
		input.protocolId !== CLIENT_SERVER_PROTOCOL.id ||
		input.protocolVersion !== CLIENT_SERVER_PROTOCOL.version ||
		input.kind !== kind
	) {
		throw new Error(`Client/Server ${kind} protocol binding is invalid.`);
	}
}

function exactObject(
	value: unknown,
	fields: readonly string[],
	label: string,
): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	const input = toCanonicalJsonValue(value) as Record<string, unknown>;
	const unsupported = Object.keys(input).filter((field) => !fields.includes(field));
	if (unsupported.length > 0) {
		throw new Error(`${label} received unsupported field ${unsupported[0]}.`);
	}
	return input;
}

function assertPayloadHasNoReservedFields(
	value: CanonicalJsonValue,
): void {
	if (Array.isArray(value)) {
		for (const child of value) assertPayloadHasNoReservedFields(child);
		return;
	}
	if (!value || typeof value !== "object") return;
	for (const [field, child] of Object.entries(value)) {
		if (RESERVED_COMMAND_PAYLOAD_FIELDS.has(field)) {
			throw new Error(`Client/Server command payload cannot supply ${field}.`);
		}
		assertPayloadHasNoReservedFields(child);
	}
}

function payloadObject(
	value: unknown,
	label: string,
): Readonly<Record<string, CanonicalJsonValue>> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	const payload = toCanonicalJsonValue(value);
	if (Buffer.byteLength(canonicalJson(payload), "utf8") > CLIENT_SERVER_PROTOCOL.maxPayloadBytes) {
		throw new Error(`${label} exceeds ${CLIENT_SERVER_PROTOCOL.maxPayloadBytes} canonical UTF-8 bytes.`);
	}
	return payload as Readonly<Record<string, CanonicalJsonValue>>;
}

function envelope<T>(value: object): T {
	const normalized = toCanonicalJsonValue(value);
	if (Buffer.byteLength(canonicalJson(normalized), "utf8") > CLIENT_SERVER_PROTOCOL.maxEnvelopeBytes) {
		throw new Error(`Client/Server envelope exceeds ${CLIENT_SERVER_PROTOCOL.maxEnvelopeBytes} canonical UTF-8 bytes.`);
	}
	return normalized as T;
}

function text(value: unknown, field: string, maximum = 512): string {
	if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.trim() !== value) {
		throw new Error(`${field} must be non-empty bounded text without surrounding whitespace.`);
	}
	return value;
}

function timestamp(value: unknown, field: string): string {
	const input = text(value, field, 64);
	const parsed = new Date(input);
	if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== input) {
		throw new Error(`${field} must be an exact UTC timestamp with milliseconds.`);
	}
	return input;
}

function integer(value: unknown, field: string, minimum: number, maximum: number): number {
	if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
		throw new Error(`${field} must be an integer from ${minimum} through ${maximum}.`);
	}
	return value as number;
}

function boolean(value: unknown, field: string): boolean {
	if (typeof value !== "boolean") throw new Error(`${field} must be boolean.`);
	return value;
}
