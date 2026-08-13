import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	CLIENT_PAIRING_PROTOCOL,
	normalizeClientPairingIssueCommand,
	normalizeClientPairingRevokeCommand,
} from "../../src/protocol/client-pairing.ts";
import {
	CLIENT_SERVER_PROTOCOL,
	serverTransportDeduplicationDigest,
	normalizeClientServerCommand,
	normalizeClientServerEvent,
	normalizeClientServerOperation,
	normalizeClientServerRequestContext,
	normalizeClientServerQuery,
	normalizeClientServerQueryResult,
	runtimeSemanticIdempotencyDigest,
} from "../../src/protocol/client-server.ts";
const digest = (character) => `sha256:${character.repeat(64)}`;
const actor = {
	actorId: "user:nuno",
	authenticatedIdentityRef: "identity:local:nuno",
};
const appClient = {
	clientKind: "app",
	clientInstanceId: "app:laptop",
	authenticationRef: "auth:pairing:app-laptop",
};
const mcpClient = {
	clientKind: "mcp",
	clientInstanceId: "claude-code:laptop",
	authenticationRef: "auth:pairing:claude-code-laptop",
};

function command(client = appClient) {
	return {
		protocolId: CLIENT_SERVER_PROTOCOL.id,
		protocolVersion: CLIENT_SERVER_PROTOCOL.version,
		kind: "command",
		transportRequestId: "request:01",
		actor,
		client,
		...(client.clientKind === "mcp" ? {delegationRef: "delegation:change-intake"} : {}),
		repositoryIdentity: digest("1"),
		commandName: "change.create",
		targetRef: "project:current",
		expectedDigest: digest("2"),
		semanticIdempotencyKey: "create-change:01",
		expiresAt: "2026-08-12T11:00:00.000Z",
		requestedCapability: "change:create",
		payload: {summary: "Add typed Runtime command."},
	};
}

function snapshot() {
	return {
		snapshotDigest: digest("3"),
		provenanceRefs: ["work-state:current"],
		coverage: "complete",
		truncated: false,
		stale: false,
		redacted: false,
	};
}

describe("Client pairing protocol", () => {
	it("normalizes strict issue and revoke messages without the retired ID", () => {
		assert.deepEqual(
			normalizeClientPairingIssueCommand({
				protocolId: CLIENT_PAIRING_PROTOCOL.id,
				protocolVersion: CLIENT_PAIRING_PROTOCOL.version,
				kind: "issue",
				expectedRegistryGeneration: 7,
				pairingId: "pairing:cli-laptop",
				clientKind: "cli",
				clientInstanceId: "cli:laptop",
				expiresInSeconds: 3_600,
			}),
			{
				protocolId: CLIENT_PAIRING_PROTOCOL.id,
				protocolVersion: CLIENT_PAIRING_PROTOCOL.version,
				kind: "issue",
				expectedRegistryGeneration: 7,
				pairingId: "pairing:cli-laptop",
				clientKind: "cli",
				clientInstanceId: "cli:laptop",
				expiresInSeconds: 3_600,
			},
		);
		assert.equal(
			normalizeClientPairingRevokeCommand({
				protocolId: CLIENT_PAIRING_PROTOCOL.id,
				protocolVersion: CLIENT_PAIRING_PROTOCOL.version,
				kind: "revoke",
				expectedRegistryGeneration: 8,
				pairingId: "pairing:cli-laptop",
				expectedAuthenticationRef: "auth:pairing:cli-laptop",
			}).kind,
			"revoke",
		);
		assert.throws(
			() =>
				normalizeClientPairingIssueCommand({
					protocolId: "codewiki.host-pairing",
					protocolVersion: CLIENT_PAIRING_PROTOCOL.version,
					kind: "issue",
					expectedRegistryGeneration: 7,
					pairingId: "pairing:cli-laptop",
					clientKind: "cli",
					clientInstanceId: "cli:laptop",
				}),
			/protocol binding is invalid/,
		);
	});
});

describe("Client/Server protocol", () => {
	it("keeps accountable actor separate from client interface and delegation", () => {
		assert.deepEqual(normalizeClientServerRequestContext({actor, client: appClient}), {
			actor,
			client: appClient,
		});
		assert.throws(
			() => normalizeClientServerRequestContext({actor, client: appClient, authority: "admin"}),
			/unsupported field authority/,
		);
		const app = normalizeClientServerCommand(
			command(),
			new Date("2026-08-12T10:00:00.000Z"),
		);
		const mcp = normalizeClientServerCommand(
			command(mcpClient),
			new Date("2026-08-12T10:00:00.000Z"),
		);

		assert.deepEqual(app.actor, mcp.actor);
		assert.equal(app.client.clientKind, "app");
		assert.equal(mcp.client.clientKind, "mcp");
		assert.equal("delegationRef" in app, false);
		assert.equal(mcp.delegationRef, "delegation:change-intake");
		assert.equal(runtimeSemanticIdempotencyDigest(app), runtimeSemanticIdempotencyDigest(mcp));
		assert.notEqual(
			runtimeSemanticIdempotencyDigest(app),
			runtimeSemanticIdempotencyDigest(
				normalizeClientServerCommand(
					{...command(), payload: {summary: "Different meaning."}},
					new Date("2026-08-12T10:00:00.000Z"),
				),
			),
		);
		assert.notEqual(
			serverTransportDeduplicationDigest(app, app.transportRequestId),
			serverTransportDeduplicationDigest(mcp, mcp.transportRequestId),
		);
	});

	it("rejects self-declared authority, unsupported fields, and expired commands", () => {
		assert.throws(
			() =>
				normalizeClientServerCommand(
					{...command(), principal: "user:nuno"},
					new Date("2026-08-12T10:00:00.000Z"),
				),
			/unsupported field principal/,
		);
		assert.throws(
			() =>
				normalizeClientServerCommand(
					{...command(), payload: {nested: {actorId: "service:forged"}}},
					new Date("2026-08-12T10:00:00.000Z"),
				),
			/payload cannot supply actorId/,
		);
		assert.throws(
			() =>
				normalizeClientServerCommand(
					command(),
					new Date("2026-08-12T11:00:00.000Z"),
				),
			/command has expired/,
		);
		assert.throws(
			() =>
				normalizeClientServerCommand(
					{...command(), protocolId: "codewiki.host-client"},
					new Date("2026-08-12T10:00:00.000Z"),
				),
			/protocol binding is invalid/,
		);
		assert.throws(
			() =>
				normalizeClientServerCommand(
					{...command(), protocolVersion: "2.0.0"},
					new Date("2026-08-12T10:00:00.000Z"),
				),
			/protocol binding is invalid/,
		);
	});

	it("normalizes bounded queries, snapshots, durable operations, and events", () => {
		const query = normalizeClientServerQuery({
			protocolId: CLIENT_SERVER_PROTOCOL.id,
			protocolVersion: CLIENT_SERVER_PROTOCOL.version,
			kind: "query",
			transportRequestId: "query:01",
			actor,
			client: appClient,
			repositoryIdentity: digest("1"),
			queryName: "changes.list",
			expectedSnapshotDigest: digest("3"),
			maxItems: 25,
			payload: {status: "pending"},
		});
		assert.equal(query.maxItems, 25);

		const result = normalizeClientServerQueryResult({
			protocolId: CLIENT_SERVER_PROTOCOL.id,
			protocolVersion: CLIENT_SERVER_PROTOCOL.version,
			kind: "query_result",
			transportRequestId: query.transportRequestId,
			repositoryIdentity: query.repositoryIdentity,
			queryName: query.queryName,
			snapshot: snapshot(),
			payload: {changes: []},
		});
		assert.equal(result.snapshot.coverage, "complete");

		const operation = normalizeClientServerOperation({
			protocolId: CLIENT_SERVER_PROTOCOL.id,
			protocolVersion: CLIENT_SERVER_PROTOCOL.version,
			kind: "operation",
			operationId: "operation:01",
			repositoryIdentity: digest("1"),
			actorId: actor.actorId,
			commandName: "change.create",
			semanticIdempotencyDigest: digest("4"),
			status: "accepted",
			acceptedAt: "2026-08-12T10:00:00.000Z",
			updatedAt: "2026-08-12T10:00:00.000Z",
			snapshotDigest: digest("3"),
			payload: {},
		});
		assert.equal(operation.status, "accepted");

		const event = normalizeClientServerEvent({
			protocolId: CLIENT_SERVER_PROTOCOL.id,
			protocolVersion: CLIENT_SERVER_PROTOCOL.version,
			kind: "event",
			eventId: "event:01",
			cursor: 1,
			repositoryIdentity: digest("1"),
			eventName: "operation.accepted",
			occurredAt: "2026-08-12T10:00:00.000Z",
			snapshot: snapshot(),
			payload: {operationId: operation.operationId},
		});
		assert.equal(event.cursor, 1);
		assert.equal(Object.isFrozen(event), true);
	});
});
