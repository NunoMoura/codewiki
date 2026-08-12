import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runWikiDecide } from "../../src/api/wiki-decide.ts";
import {
	HOST_CLIENT_PROTOCOL,
	hostTransportDeduplicationDigest,
	normalizeHostClientCommand,
	normalizeHostClientEvent,
	normalizeHostClientOperation,
	normalizeHostClientQuery,
	normalizeHostClientQueryResult,
	runtimeSemanticIdempotencyDigest,
} from "../../src/api/protocol.ts";
import {
	appendTraceRecord,
	createTraceHead,
	TraceAppendConflictError,
} from "../../src/api/traces.ts";
import { CodewikiApiError } from "../../src/error-handling/api-errors.ts";
import { CodewikiConfigError } from "../../src/error-handling/config-errors.ts";
import {
	CodewikiError,
	codewikiErrorData,
	isCodewikiError,
} from "../../src/error-handling/codewiki-error.ts";
import { resolveWikiConfig } from "../../src/project/config.ts";
import { loadWikiConfigFile } from "../../src/project/config-file.ts";

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
		protocolId: HOST_CLIENT_PROTOCOL.id,
		protocolVersion: HOST_CLIENT_PROTOCOL.version,
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

describe("Host/Client protocol", () => {
	it("keeps accountable actor separate from client interface and delegation", () => {
		const app = normalizeHostClientCommand(
			command(),
			new Date("2026-08-12T10:00:00.000Z"),
		);
		const mcp = normalizeHostClientCommand(
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
				normalizeHostClientCommand(
					{...command(), payload: {summary: "Different meaning."}},
					new Date("2026-08-12T10:00:00.000Z"),
				),
			),
		);
		assert.notEqual(
			hostTransportDeduplicationDigest(app, app.transportRequestId),
			hostTransportDeduplicationDigest(mcp, mcp.transportRequestId),
		);
	});

	it("rejects self-declared authority, unsupported fields, and expired commands", () => {
		assert.throws(
			() =>
				normalizeHostClientCommand(
					{...command(), principal: "user:nuno"},
					new Date("2026-08-12T10:00:00.000Z"),
				),
			/unsupported field principal/,
		);
		assert.throws(
			() =>
				normalizeHostClientCommand(
					{...command(), payload: {nested: {actorId: "service:forged"}}},
					new Date("2026-08-12T10:00:00.000Z"),
				),
			/payload cannot supply actorId/,
		);
		assert.throws(
			() =>
				normalizeHostClientCommand(
					command(),
					new Date("2026-08-12T11:00:00.000Z"),
				),
			/command has expired/,
		);
		assert.throws(
			() =>
				normalizeHostClientCommand(
					{...command(), protocolVersion: "2.0.0"},
					new Date("2026-08-12T10:00:00.000Z"),
				),
			/protocol binding is invalid/,
		);
	});

	it("normalizes bounded queries, snapshots, durable operations, and events", () => {
		const query = normalizeHostClientQuery({
			protocolId: HOST_CLIENT_PROTOCOL.id,
			protocolVersion: HOST_CLIENT_PROTOCOL.version,
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

		const result = normalizeHostClientQueryResult({
			protocolId: HOST_CLIENT_PROTOCOL.id,
			protocolVersion: HOST_CLIENT_PROTOCOL.version,
			kind: "query_result",
			transportRequestId: query.transportRequestId,
			repositoryIdentity: query.repositoryIdentity,
			queryName: query.queryName,
			snapshot: snapshot(),
			payload: {changes: []},
		});
		assert.equal(result.snapshot.coverage, "complete");

		const operation = normalizeHostClientOperation({
			protocolId: HOST_CLIENT_PROTOCOL.id,
			protocolVersion: HOST_CLIENT_PROTOCOL.version,
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

		const event = normalizeHostClientEvent({
			protocolId: HOST_CLIENT_PROTOCOL.id,
			protocolVersion: HOST_CLIENT_PROTOCOL.version,
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

describe("shared error handling", () => {
	it("normalizes trace append conflicts through CodewikiError", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-error-trace-"));
		try {
			const head = createTraceHead({
				traceId: "TRACE-error-handling",
				title: "Error handling",
				createdAt: "2026-06-19T00:00:00.000Z",
			});
			const first = await appendTraceRecord(root, head, 0);

			await assert.rejects(
				() => appendTraceRecord(root, head, first.previousBytes),
				(error) => {
					assert.equal(error instanceof TraceAppendConflictError, true);
					assert.equal(error instanceof CodewikiError, true);
					assert.equal(isCodewikiError(error), true);
					assert.equal(error.domain, "trace");
					assert.equal(error.code, "append_conflict");
					assert.equal(error.suggestedAction, "refresh_trace");
					assert.equal(error.data.expectedBytes, first.previousBytes);
					assert.equal(error.data.actualBytes, first.nextBytes);
					assert.deepEqual(codewikiErrorData(error)?.refs, [error.path]);
					return true;
				},
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("reports config validation and file parsing as config errors", async () => {
		assert.throws(
			() => resolveWikiConfig({ runtime: { maxWorkers: -1 } }),
			(error) => {
				assert.equal(error instanceof CodewikiConfigError, true);
				assert.equal(error.domain, "config");
				assert.equal(error.code, "invalid_value");
				assert.equal(error.path, "runtime.maxWorkers");
				assert.equal(error.suggestedAction, "fix_input");
				return true;
			},
		);

		const root = await mkdtemp(join(tmpdir(), "codewiki-error-config-"));
		try {
			await mkdir(join(root, ".codewiki"), { recursive: true });
			await writeFile(join(root, ".codewiki", "config.json"), "{bad-json");
			await assert.rejects(
				() => loadWikiConfigFile(root),
				(error) => {
					assert.equal(error instanceof CodewikiConfigError, true);
					assert.equal(error.domain, "config");
					assert.equal(error.path.endsWith(".codewiki/config.json"), true);
					assert.equal(error.cause instanceof SyntaxError, true);
					return true;
				},
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("reports facade input failures as api errors", async () => {
		await assert.rejects(
			() =>
				runWikiDecide({
					changeId: "CHG-api-error",
					expectedRevision: 1,
					expectedChangeDigest: `sha256:${"0".repeat(64)}`,
					expectedWorkStateDigest: `sha256:${"1".repeat(64)}`,
					disposition: "approve",
					rationale: "Test invalid append guard.",
					mode: "append",
					repoRoot: ".",
					expectedBytes: -1,
				}),
			(error) => {
				assert.equal(error instanceof CodewikiApiError, true);
				assert.equal(error.domain, "api");
				assert.equal(error.code, "invalid_input");
				assert.equal(error.operation, "wiki_decide");
				assert.equal(error.field, "expectedBytes");
				assert.equal(error.suggestedAction, "fix_input");
				assert.deepEqual(error.data, {
					operation: "wiki_decide",
					field: "expectedBytes",
					value: -1,
				});
				return true;
			},
		);
	});
});
