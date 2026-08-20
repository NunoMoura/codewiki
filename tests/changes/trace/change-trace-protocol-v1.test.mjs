import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
	CHANGE_OPERATION_KINDS,
	CHANGE_TRACE_OPERATION_CATALOG,
	OPERATION_DEFINITIONS,
	assertValidArchiveManifest,
	assertValidCanonicalChangeOperation,
	assertValidStateCommitManifest,
	createCanonicalChangeOperation,
	createChangeRevision,
	parseArchiveManifest,
	parseCanonicalChangeOperation,
	parseStateCommitManifest,
	serializeArchiveManifest,
	serializeCanonicalChangeOperation,
	serializeStateCommitManifest,
} from "../../../src/changes/trace/index.ts";
import {
	CANONICAL_JSON_PROFILE,
	canonicalJson,
	parseCanonicalJson,
	sha256Digest,
} from "../../../src/utils/canonical-json.ts";
import {
	archiveManifest,
	authorityBinding,
	baseSnapshot,
	changeRevision,
	digest,
	proposedOperation,
	stateManifest,
} from "../../helpers/change-trace-v1.mjs";

const fixtureDirectory = new URL("../../fixtures/change-trace-v1/", import.meta.url);

function clone(value) {
	return structuredClone(value);
}

function replaceDigest(value) {
	return `${value.slice(0, -1)}${value.endsWith("0") ? "1" : "0"}`;
}

describe("Change Trace Protocol catalog", () => {
	it("closes exactly 40 Change-scoped operation kinds", () => {
		assert.equal(CHANGE_TRACE_OPERATION_CATALOG.length, 40);
		assert.equal(CHANGE_OPERATION_KINDS.length, 40);
		assert.equal(new Set(CHANGE_TRACE_OPERATION_CATALOG).size, 40);
		assert.equal(Object.keys(OPERATION_DEFINITIONS).length, 40);
		for (const kind of CHANGE_OPERATION_KINDS) {
			const definition = OPERATION_DEFINITIONS[kind];
			assert.equal(definition.kind, kind);
			assert.equal(definition.scope, "change");
			assert.equal(definition.kindVersion, "1.0.0");
			assert.ok(definition.capability.length > 0);
			assert.ok(definition.precondition.length > 0);
			assert.equal(definition.reduction, kind);
			assert.ok(definition.graphProjection.length > 0);
		}
	});


});

describe("strict canonical JSON profile", () => {
	it("accepts only exact profile bytes", () => {
		assert.equal(CANONICAL_JSON_PROFILE, "codewiki.canonical-json/1.0.0");
		assert.equal(
			canonicalJson(parseCanonicalJson('{"a":1,"b":[true,null]}')),
			'{"a":1,"b":[true,null]}',
		);
		for (const text of [
			'{"b":2,"a":1}',
			'{"a":1, "b":2}',
			'{"a":1,"a":1}',
			'{"a":-0}',
			'{"a":1}\n',
		]) {
			assert.throws(() => parseCanonicalJson(text), /does not conform/);
		}
	});
});

describe("content-addressed Change operations", () => {
	it("normalizes Change revision sets and derives immutable identity", () => {
		const revision = changeRevision();
		assert.deepEqual(
			revision.content.acceptanceRequirements.map((entry) => entry.id),
			["identity", "replay"],
		);
		assert.deepEqual(revision.content.delivery.constraints, [
			"No compatibility parser.",
			"No mutable status operation.",
		]);
		assert.deepEqual(revision.content.knowledge.topicRefs, [
			"kb:system/alignment-model",
			"kb:system/traces",
		]);
		assert.equal(revision.revisionId, sha256Digest(canonicalJson(revision.content)));
		assert.equal(Object.isFrozen(revision), true);
		assert.equal(Object.isFrozen(revision.content), true);
		assert.throws(() =>
			createChangeRevision({
				title: "Legacy skeleton",
				summary: "Legacy summary",
				desiredOutcome: "Legacy outcome",
				acceptanceRequirements: [
					{id: "legacy", statement: "Legacy requirement."},
				],
				constraints: [],
				nonGoals: [],
				knowledgeRefs: [],
				sourceRefs: [],
				risk: "unknown",
			}),
			/Change revision content/,
		);
	});

	it("round-trips exact canonical bytes and rejects non-canonical input", () => {
		const operation = proposedOperation();
		const bytes = serializeCanonicalChangeOperation(operation);
		assert.equal(parseCanonicalChangeOperation(bytes).operationId, operation.operationId);
		assert.deepEqual(
			parseCanonicalChangeOperation(bytes),
			operation,
		);
		assert.throws(
			() => parseCanonicalChangeOperation(`${bytes}\n`),
			/does not conform/,
		);
	});

	it("rejects unknown fields, versions, malformed parents, and identity mismatch", () => {
		const operation = proposedOperation();
		const cases = [
			{...clone(operation), unsupported: true},
			{
				...clone(operation),
				body: {...clone(operation.body), kindVersion: "2.0.0"},
			},
			{
				...clone(operation),
				body: {...clone(operation.body), parents: []},
			},
			{...clone(operation), operationId: replaceDigest(operation.operationId)},
		];
		for (const value of cases) {
			assert.throws(() => assertValidCanonicalChangeOperation(value));
		}
	});

	it("rejects payload identity tampering and unauthenticated takeover", () => {
		const operation = proposedOperation();
		const revisionTamper = clone(operation);
		revisionTamper.body.payload.revision.content.title = "Tampered";
		revisionTamper.operationId = sha256Digest(canonicalJson(revisionTamper.body));
		assert.throws(
			() => assertValidCanonicalChangeOperation(revisionTamper),
			/Change revision identity mismatch/,
		);

		assert.throws(
			() =>
				createCanonicalChangeOperation({
					changeId: operation.body.changeId,
					kind: "change_claim.takeover_recorded",
					parents: [operation.operationId],
					baseSnapshot: baseSnapshot(),
					authorityBinding: authorityBinding(),
					recordedAt: "2026-07-30T12:01:00.000Z",
					preStateDigest: digest("a"),
					postStateDigest: digest("b"),
					payload: {
						priorClaimOperationId: operation.operationId,
						revisionId: operation.body.payload.revision.revisionId,
						purpose: "decision",
						reason: "Authenticated maintainer recovery.",
					},
				}),
			/requires authentication Evidence/,
		);
	});
});

describe("project and structural protocol records", () => {
	it("binds State batches without inferring semantics from Git metadata", () => {
		const operation = proposedOperation();
		const manifest = stateManifest(operation);
		assert.equal(parseStateCommitManifest(serializeStateCommitManifest(manifest)).manifestId, manifest.manifestId);
		assert.deepEqual(manifest.body.operationIds, [operation.operationId]);

		const invalid = clone(manifest);
		invalid.body.batchDigest = digest("f");
		invalid.manifestId = sha256Digest(canonicalJson(invalid.body));
		assert.throws(
			() => assertValidStateCommitManifest(invalid),
			/State commit batch digest mismatch/,
		);
	});

	it("binds archive segments without an impossible self-referential commit ID", () => {
		const manifest = archiveManifest();
		assert.equal("archiveCommit" in manifest.body, false);
		assert.equal(parseArchiveManifest(serializeArchiveManifest(manifest)).manifestId, manifest.manifestId);

		const invalid = clone(manifest);
		invalid.body.closureOperationId = digest("f");
		invalid.manifestId = sha256Digest(canonicalJson(invalid.body));
		assert.throws(
			() => assertValidArchiveManifest(invalid),
			/closure operation must be the archived tail/,
		);
	});
});

describe("frozen protocol fixtures", () => {
	it("matches exact checked-in bytes and identities", async () => {
		const operation = proposedOperation();
		const state = stateManifest(operation);
		const archive = archiveManifest(operation);
		const documents = {operation, state, archive};
		const expectedIds = {
			operation: "sha256:728bbaad498d900e885a56b098b6ed0dc029eacffaf01c86334cc0ebff5a561f",
			state: "sha256:1704d59ce0ddd248561b8db741761681af32b9cbc482fcb59e80424c083a3278",
			archive: "sha256:6ed74f19bfe1604beca56b6cbcfddbd0aa4e471825c9b54c7d8581e89813ce02",
		};
		for (const [name, document] of Object.entries(documents)) {
			const bytes = await readFile(new URL(`${name}.json`, fixtureDirectory), "utf8");
			assert.equal(bytes, canonicalJson(document));
			const actualId = document.operationId ?? document.manifestId;
			assert.equal(actualId, expectedIds[name]);
		}
	});
});
