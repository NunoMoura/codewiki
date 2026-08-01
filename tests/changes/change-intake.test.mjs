import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {describe, it} from "node:test";

import {
	CHANGE_INTAKE_MATERIAL_PROTOCOL,
	CHANGE_INTAKE_MATERIAL_TYPES,
} from "../../src/changes/intake/contracts.ts";
import {normalizeChangeIntakeMaterial} from "../../src/changes/intake/normalize.ts";

const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;
const GIT_A = "a".repeat(40);
const GIT_B = "b".repeat(40);

function content(overrides = {}) {
	return {
		summary: "Finding e\u0301 summary\r\nnext line",
		observedBehavior: "Observed behavior",
		desiredBehavior: "Desired behavior",
		affectedRefs: ["src/z.ts", "src/a.ts"],
		sourceRefs: ["trace:TRACE-intake:source:1"],
		reproduction: "Run bounded reproduction",
		claimedCategory: "behavior",
		claimedSeverity: "medium",
		claimedConfidence: "high",
		...overrides,
	};
}

function material(materialType, binding, contentOverrides = {}) {
	return {
		protocolId: CHANGE_INTAKE_MATERIAL_PROTOCOL.id,
		protocolVersion: CHANGE_INTAKE_MATERIAL_PROTOCOL.version,
		materialType,
		binding,
		content: content(contentOverrides),
	};
}

function validMaterials() {
	return [
		material("user_suggestion", {
			channel: "pi",
			submissionId: "suggestion:01",
		}),
		material("pull_request_finding", {
			providerId: "provider:configured-review",
			repositoryId: "project/repository",
			pullRequestId: "pull:42",
			headCommit: GIT_A,
			eventId: "event:100",
			findingId: "finding:7",
		}),
		material("worker_discovery", {
			workerReportId: "report:01",
			assignmentOperationId: SHA_B,
			workItemClaimOperationId: SHA_A,
			baseTree: GIT_A,
			resultTree: GIT_B,
		}),
		material("regression_finding", {
			runId: "run:regression:01",
			traceOperationId: SHA_A,
			baseTree: GIT_A,
			resultTree: GIT_B,
			findingId: "test:checkout:failure",
		}),
		material(
			"security_scanner_finding",
			{
				scannerId: "scanner:dependency",
				scannerVersion: "1.2.3",
				runId: "run:security:01",
				tree: GIT_A,
				findingId: "finding:security:01",
			},
			{claimedCategory: "security", claimedSeverity: "high"},
		),
		material("delivery_observation", {
			observationId: "observation:delivery:01",
			deliveryId: "delivery:01",
			changeRevisionId: SHA_A,
			artifactDigest: SHA_B,
			environmentId: "environment:staging",
		}),
		material("outcome_finding", {
			observationId: "observation:outcome:01",
			changeRevisionId: SHA_A,
			subjectRef: "kb:product/outcomes/checkout",
			sourceEvidenceDigest: SHA_B,
		}),
		material("knowledge_drift", {
			observationId: "observation:knowledge:01",
			previousSnapshotDigest: SHA_A,
			currentSnapshotDigest: SHA_B,
			topicRefs: ["kb:system/runtime", "kb:product/automation"],
		}),
	];
}

describe("closed Change intake material", () => {
	it("removes the legacy single-file intake path without an alias", () => {
		assert.equal(existsSync("src/changes/intake.ts"), false);
	});

	it("normalizes all eight source-specific members without granting authority", () => {
		const inputs = validMaterials();
		const normalized = inputs.map((input) => normalizeChangeIntakeMaterial(input));
		assert.deepEqual(
			normalized.map((entry) => entry.materialType),
			CHANGE_INTAKE_MATERIAL_TYPES,
		);
		for (const entry of normalized) {
			assert.equal(entry.protocolId, "codewiki.change-intake-material");
			assert.equal(entry.protocolVersion, "1.0.0");
			assert.equal(Object.isFrozen(entry), true);
			assert.equal(Object.isFrozen(entry.binding), true);
			assert.equal(Object.isFrozen(entry.content), true);
			assert.equal("priority" in entry, false);
			assert.equal("authority" in entry, false);
		}
		assert.equal(normalized[0].content.summary, "Finding é summary\nnext line");
		assert.deepEqual(normalized[0].content.affectedRefs, [
			"src/a.ts",
			"src/z.ts",
		]);
		assert.equal(inputs[0].content.summary.includes("\r\n"), true);
	});

	it("rejects legacy, unknown, authority-bearing, and incomplete shapes", () => {
		const valid = validMaterials()[0];
		for (const [input, expected] of [
			[
				{source: "runtime", sourceId: "old", summary: "legacy"},
				/unsupported field source/,
			],
			[{...valid, priority: "critical"}, /unsupported field priority/],
			[
				{...valid, content: {...valid.content, route: "implementation"}},
				/unsupported field route/,
			],
			[
				{...valid, binding: {...valid.binding, actor: "maintainer"}},
				/unsupported field actor/,
			],
			[
				{...valid, binding: {channel: "pi"}},
				/missing required field submissionId/,
			],
			[
				{...valid, materialType: "generic_finding"},
				/materialType is invalid/,
			],
			[
				{...valid, protocolVersion: "0.1.0"},
				/protocolVersion is invalid/,
			],
		]) {
			assert.throws(() => normalizeChangeIntakeMaterial(input), expected);
		}
	});

	it("rejects invalid exact bindings, refs, controls, credentials, and bounds", () => {
		const pullRequest = validMaterials()[1];
		const suggestion = validMaterials()[0];
		for (const [input, expected] of [
			[
				{
					...pullRequest,
					binding: {...pullRequest.binding, headCommit: GIT_A.toUpperCase()},
				},
				/lowercase Git object id/,
			],
			[
				{
					...suggestion,
					content: {...suggestion.content, affectedRefs: ["https://example.test"]},
				},
				/canonical CodeWiki ref/,
			],
			[
				{
					...suggestion,
					content: {
						...suggestion.content,
						affectedRefs: ["src/a.ts", "src/a.ts"],
					},
				},
				/must not contain duplicate refs/,
			],
			[
				{
					...suggestion,
					content: {...suggestion.content, observedBehavior: "bad\u0000value"},
				},
				/prohibited control characters/,
			],
			[
				{
					...suggestion,
					content: {
						...suggestion.content,
						reproduction: "Authorization: Bearer abcdefghijklmnop",
					},
				},
				/credential-like private data/,
			],
			[
				{
					...suggestion,
					content: {...suggestion.content, observedBehavior: "x".repeat(20_000)},
				},
				/exceeds 16384 UTF-8 bytes/,
			],
		]) {
			assert.throws(() => normalizeChangeIntakeMaterial(input), expected);
		}
	});

	it("rejects non-JSON object behavior before inspecting material fields", () => {
		const cyclic = validMaterials()[0];
		cyclic.self = cyclic;
		assert.throws(
			() => normalizeChangeIntakeMaterial(cyclic),
			/must be canonical JSON data/,
		);
	});
});
