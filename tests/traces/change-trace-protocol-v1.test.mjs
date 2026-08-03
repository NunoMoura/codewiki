import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
	CHANGE_OPERATION_KINDS,
	CHANGE_TRACE_OPERATION_CATALOG,
	OPERATION_DEFINITIONS,
	PROJECT_OPERATION_KINDS,
	assertValidArchiveManifest,
	assertValidCanonicalChangeOperation,
	assertValidPlanningEpochRecord,
	assertValidStateCommitManifest,
	createCanonicalChangeOperation,
	createChangeRevision,
	createPlanningEpochRecord,
	parseArchiveManifest,
	parseCanonicalChangeOperation,
	parsePlanningEpochRecord,
	parseStateCommitManifest,
	serializeArchiveManifest,
	serializeCanonicalChangeOperation,
	serializePlanningEpochRecord,
	serializeStateCommitManifest,
} from "../../src/change-trace/index.ts";
import {
	CANONICAL_JSON_PROFILE,
	canonicalJson,
	parseCanonicalJson,
	sha256Digest,
} from "../../src/utils/canonical-json.ts";
import {
	archiveManifest,
	authorityBinding,
	baseSnapshot,
	changeRevision,
	digest,
	planningEpoch,
	proposedOperation,
	stateManifest,
} from "../helpers/change-trace-v1.mjs";

const fixtureDirectory = new URL("../fixtures/change-trace-v1/", import.meta.url);

function clone(value) {
	return structuredClone(value);
}

function replaceDigest(value) {
	return `${value.slice(0, -1)}${value.endsWith("0") ? "1" : "0"}`;
}

function operationCatalogFrom(text, start, end) {
	const section = text.split(start, 2)[1]?.split(end, 1)[0] ?? "";
	return section.match(/^[a-z_]+\.[a-z_]+$/gm) ?? [];
}

describe("Change Trace Protocol catalog", () => {
	it("closes exactly 42 operation kinds across two semantic scopes", () => {
		assert.equal(CHANGE_TRACE_OPERATION_CATALOG.length, 42);
		assert.equal(CHANGE_OPERATION_KINDS.length, 41);
		assert.deepEqual(PROJECT_OPERATION_KINDS, ["planning.epoch_recorded"]);
		assert.equal(new Set(CHANGE_TRACE_OPERATION_CATALOG).size, 42);
		assert.equal(Object.keys(OPERATION_DEFINITIONS).length, 42);
		assert.equal(
			OPERATION_DEFINITIONS["planning.epoch_recorded"].capability,
			"planning.bind",
		);
		assert.equal(OPERATION_DEFINITIONS["planning.epoch_recorded"].scope, "project");
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

	it("matches the ratified plan and Knowledge catalogs exactly", async () => {
		const [plan, knowledge] = await Promise.all([
			readFile(new URL("../../REFACTORING_PLAN.md", import.meta.url), "utf8"),
			readFile(
				new URL(
					"../../.codewiki/kb/system/components/traces.md",
					import.meta.url,
				),
				"utf8",
			),
		]);
		assert.deepEqual(
			operationCatalogFrom(
				plan,
				"### Closed v1 catalog",
				"### Explicit non-operations",
			),
			CHANGE_TRACE_OPERATION_CATALOG,
		);
		assert.deepEqual(
			operationCatalogFrom(
				knowledge,
				"## Closed v1 operation catalog",
				"## Executable payload grammar",
			),
			CHANGE_TRACE_OPERATION_CATALOG,
		);
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
	it("derives one normalized Planning epoch and validates graph references", () => {
		const operation = proposedOperation();
		const epoch = planningEpoch(operation);
		assert.match(epoch.operationId, /^sha256:[0-9a-f]{64}$/);
		assert.match(epoch.body.globalWorkItemGraphDigest, /^sha256:[0-9a-f]{64}$/);
		assert.equal(parsePlanningEpochRecord(serializePlanningEpochRecord(epoch)).operationId, epoch.operationId);
		assert.equal(Object.isFrozen(epoch.body.workItems), true);

		const invalid = clone(epoch);
		invalid.body.safeExecutionFrontier = ["unknown-work"];
		invalid.operationId = sha256Digest(canonicalJson(invalid.body));
		assert.throws(
			() => assertValidPlanningEpochRecord(invalid),
			/unknown Work Item/,
		);
	});

	it("rejects cyclic Planning dependencies", () => {
		const operation = proposedOperation();
		const valid = planningEpoch(operation);
		const work = valid.body.workItems[0];
		assert.throws(
			() =>
				createPlanningEpochRecord({
					...valid.body,
					workItems: [
						{...work, id: "work-a", dependsOnWorkItemIds: ["work-b"]},
						{...work, id: "work-b", dependsOnWorkItemIds: ["work-a"]},
					],
					sprints: [
						{...valid.body.sprints[0], workItemIds: ["work-a", "work-b"]},
					],
					safeExecutionFrontier: [],
				}),
			/contains a cycle/,
		);
	});

	it("binds State batches without inferring semantics from Git metadata", () => {
		const operation = proposedOperation();
		const epoch = planningEpoch(operation);
		const manifest = stateManifest(operation, epoch);
		assert.equal(parseStateCommitManifest(serializeStateCommitManifest(manifest)).manifestId, manifest.manifestId);
		assert.deepEqual(manifest.body.operationIds, [operation.operationId, epoch.operationId]);

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
		const epoch = planningEpoch(operation);
		const state = stateManifest(operation, epoch);
		const archive = archiveManifest(operation);
		const documents = {operation, epoch, state, archive};
		const expectedIds = {
			operation: "sha256:5988a731c184675004e7d9e747f0aabdc4050bdf59cb789ca5fa5f5a58b83f5d",
			epoch: "sha256:d6c9d6ea3ff85eac9c06fe3ec630e54dcffd75fea155e6b52d50bd3a4e07369d",
			state: "sha256:3d8369781ec353673058dd03398478fadcb029d0bb301a159d5ca566b755f6f5",
			archive: "sha256:6118efd276f5e5cd0f4619a71b1af215c6315f3b67717ce70445f925b1790faa",
		};
		for (const [name, document] of Object.entries(documents)) {
			const bytes = await readFile(new URL(`${name}.json`, fixtureDirectory), "utf8");
			assert.equal(bytes, canonicalJson(document));
			const actualId = document.operationId ?? document.manifestId;
			assert.equal(actualId, expectedIds[name]);
		}
	});
});
