import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EVIDENCE_SCHEMA_VERSION } from "../../src/evidence/contracts.ts";
import { materializeEvidenceRecord } from "../../src/evidence/materialize.ts";
import {
	createEvidenceObligation,
	reduceEvidenceObligation,
} from "../../src/evidence/obligations.ts";

function digest(character) {
	return `sha256:${character.repeat(64)}`;
}

const expectedSubject = {
	changeRefs: ["CHG-evidence-obligation"],
	changeRevisionDigests: [digest("1")],
	candidateDigest: digest("2"),
	planningRevisionDigest: digest("3"),
	acceptanceRequirementIds: ["REQ-1"],
	sourceTreeDigest: digest("4"),
};

function sourceEvidence({ material = {}, runtime = {} } = {}) {
	return materializeEvidenceRecord(
		{
			schemaVersion: EVIDENCE_SCHEMA_VERSION,
			kind: "source_observation",
			provenanceRefs: ["runtime:source-observer@1.0.0"],
			payload: {
				sourceType: "source",
				snapshotDigest: digest("5"),
				paths: ["src/evidence/obligations.ts"],
				symbols: ["reduceEvidenceObligation"],
				ownershipRefs: ["component:evidence"],
				observations: ["Reducer source observed."],
			},
			...material,
		},
		{
			subject: expectedSubject,
			observedAt: "2026-07-29T12:00:00.000Z",
			producer: {
				kind: "runtime",
				id: "source-observer",
				version: "1.0.0",
			},
			authority: "verified",
			coverage: "complete",
			freshnessBoundary: "snapshot:current",
			sensitivity: "project",
			...runtime,
		},
	);
}

function sourceObligation(overrides = {}) {
	return createEvidenceObligation({
		id: "source-proof",
		version: "1.0.0",
		kinds: ["source_observation"],
		producerKinds: ["runtime"],
		authorities: ["verified"],
		coverages: ["complete"],
		sensitivities: ["project"],
		minimumCount: 1,
		subject: "candidate_source_tree",
		freshness: "exact_boundary",
		artifact: "optional",
		contradiction: "indeterminate",
		...overrides,
	});
}

function reduce(obligation, evidence, overrides = {}) {
	return reduceEvidenceObligation({
		obligation,
		evidence,
		expectedSubject,
		expectedFreshnessBoundary: "snapshot:current",
		...overrides,
	});
}

describe("Evidence obligations", () => {
	it("normalizes one closed versioned obligation", () => {
		const obligation = createEvidenceObligation({
			...sourceObligation(),
			kinds: ["source_observation", "integration_proof"],
			producerKinds: ["runtime", "external_service"],
			authorities: ["verified", "observed"],
			sensitivities: ["private", "project"],
		});
		assert.deepEqual(obligation.kinds, ["integration_proof", "source_observation"]);
		assert.deepEqual(obligation.authorities, ["observed", "verified"]);
		assert.ok(Object.isFrozen(obligation));
		assert.ok(Object.isFrozen(obligation.kinds));
		assert.throws(
			() => createEvidenceObligation({ ...obligation, adapterId: "forged" }),
			/Evidence obligation received unsupported field adapterId/,
		);
		assert.throws(
			() =>
				createEvidenceObligation({
					...obligation,
					producerKinds: ["runtime", "runtime"],
				}),
			/Evidence obligation producer kind values must be unique\./,
		);
	});

	it("deterministically resolves exact supporting Evidence", () => {
		const first = sourceEvidence();
		const second = sourceEvidence({
			material: {
				provenanceRefs: ["runtime:source-observer@1.0.0", "source:second"],
			},
		});
		const obligation = sourceObligation({ minimumCount: 1 });
		const left = reduce(obligation, [
			{ evidence: second, relation: "neutral" },
			{ evidence: first, relation: "supporting" },
		]);
		const right = reduce(obligation, [
			{ evidence: first, relation: "supporting" },
			{ evidence: second, relation: "neutral" },
		]);
		assert.deepEqual(left, right);
		assert.equal(left.status, "ready");
		assert.equal(left.missingCount, 0);
		assert.deepEqual(left.supportingEvidenceIds, [first.evidenceId]);
		assert.deepEqual(left.neutralEvidenceIds, [second.evidenceId]);
		assert.match(left.obligationDigest, /^sha256:[0-9a-f]{64}$/);
		assert.match(left.resolutionDigest, /^sha256:[0-9a-f]{64}$/);
		assert.ok(Object.isFrozen(left));
		assert.ok(Object.isFrozen(left.inputEvidenceIds));
	});

	it("distinguishes missing Evidence from present but unusable Evidence", () => {
		const obligation = sourceObligation();
		const missing = reduce(obligation, []);
		assert.equal(missing.status, "missing");
		assert.equal(missing.missingCount, 1);

		const unusable = sourceEvidence({
			material: {
				artifact: {
					digest: digest("6"),
					mediaType: "application/json",
					ref: "artifact:source-proof",
				},
			},
			runtime: {
				coverage: "partial",
				freshnessBoundary: "snapshot:stale",
				sensitivity: "private",
			},
		});
		const indeterminate = reduce(
			sourceObligation({ artifact: "available" }),
			[{ evidence: unusable, relation: "supporting" }],
			{ availableArtifactDigests: [] },
		);
		assert.equal(indeterminate.status, "indeterminate");
		assert.equal(indeterminate.excludedEvidence.length, 1);
		assert.equal(
			indeterminate.excludedEvidence[0].evidenceId,
			unusable.evidenceId,
		);
		assert.deepEqual([...indeterminate.excludedEvidence[0].reasons], [
			"artifact_unavailable",
			"coverage",
			"freshness",
			"sensitivity",
		]);
	});

	it("requires exact subject and artifact availability", () => {
		const artifactDigest = digest("7");
		const record = sourceEvidence({
			material: {
				artifact: {
					digest: artifactDigest,
					mediaType: "application/json",
					ref: "artifact:available-proof",
				},
			},
		});
		const obligation = sourceObligation({ artifact: "available" });
		const ready = reduce(
			obligation,
			[{ evidence: record, relation: "supporting" }],
			{ availableArtifactDigests: [artifactDigest] },
		);
		assert.equal(ready.status, "ready");

		const wrongSubject = reduce(
			obligation,
			[{ evidence: record, relation: "supporting" }],
			{
				expectedSubject: {
					...expectedSubject,
					candidateDigest: digest("8"),
				},
				availableArtifactDigests: [artifactDigest],
			},
		);
		assert.equal(wrongSubject.status, "missing");
		assert.deepEqual(wrongSubject.excludedEvidence[0].reasons, ["subject"]);
	});

	it("retains contradictions and blocks only when policy requires it", () => {
		const supporting = sourceEvidence();
		const contradictory = sourceEvidence({
			material: { provenanceRefs: ["runtime:contradiction@1.0.0"] },
		});
		const uses = [
			{ evidence: supporting, relation: "supporting" },
			{ evidence: contradictory, relation: "contradictory" },
		];
		const blocked = reduce(sourceObligation(), uses);
		assert.equal(blocked.status, "indeterminate");
		assert.deepEqual(blocked.contradictoryEvidenceIds, [
			contradictory.evidenceId,
		]);

		const retained = reduce(
			sourceObligation({ contradiction: "retain" }),
			uses,
		);
		assert.equal(retained.status, "ready");
		assert.deepEqual(retained.contradictoryEvidenceIds, [
			contradictory.evidenceId,
		]);
	});

	it("makes duplicate Evidence input indeterminate", () => {
		const record = sourceEvidence();
		const resolution = reduce(sourceObligation(), [
			{ evidence: record, relation: "supporting" },
			{ evidence: record, relation: "supporting" },
		]);
		assert.equal(resolution.status, "indeterminate");
		assert.deepEqual(resolution.duplicateEvidenceIds, [record.evidenceId]);
		assert.equal(resolution.missingCount, 1);
	});

	it("rejects missing dynamic subject and freshness bindings", () => {
		assert.throws(
			() =>
				reduceEvidenceObligation({
					obligation: sourceObligation(),
					evidence: [],
					expectedSubject: {
						...expectedSubject,
						sourceTreeDigest: undefined,
					},
					expectedFreshnessBoundary: "snapshot:current",
				}),
			/Evidence obligation subject candidate_source_tree requires sourceTreeDigest\./,
		);
		assert.throws(
			() =>
				reduceEvidenceObligation({
					obligation: sourceObligation(),
					evidence: [],
					expectedSubject,
				}),
			/Evidence obligation source-proof requires expectedFreshnessBoundary\./,
		);
	});
});
