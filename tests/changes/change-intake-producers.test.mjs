import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {EVIDENCE_SCHEMA_VERSION} from "../../src/evidence/contracts.ts";
import {materializeEvidenceRecord} from "../../src/evidence/materialize.ts";
import {
	createDeliveryObservationMaterial,
	createDeliveryObservationMaterialFromEvidence,
	createKnowledgeDriftMaterial,
	createKnowledgeDriftMaterialFromIssue,
	createOutcomeFindingMaterial,
	createOutcomeFindingMaterialFromEvidence,
	createPullRequestFindingMaterial,
	createRegressionFindingMaterial,
	createSecurityScannerFindingMaterial,
	createUserSuggestionMaterial,
	createWorkerDiscoveryMaterial,
	createWorkerReportDiscoveryMaterials,
} from "../../src/changes/intake/producers.ts";

const digest = (character) => `sha256:${character.repeat(64)}`;
const gitObject = (character) => character.repeat(40);

function content(overrides = {}) {
	return {
		summary: "Bounded source finding",
		observedBehavior: "Observed behavior differs from accepted intent.",
		desiredBehavior: "Behavior matches accepted intent.",
		affectedRefs: ["src/project-server/example.ts"],
		sourceRefs: ["trace:intake-producer:source:1"],
		claimedCategory: "behavior",
		claimedSeverity: "medium",
		claimedConfidence: "high",
		...overrides,
	};
}

function evidence(kind, payload) {
	return materializeEvidenceRecord(
		{
			schemaVersion: EVIDENCE_SCHEMA_VERSION,
			kind,
			provenanceRefs: [`trace:evidence-producer:${kind}`],
			payload,
		},
		{
			subject: {
				changeRefs: ["change:producer-test"],
				changeRevisionDigests: [digest("1")],
				candidateDigest: digest("2"),
				sourceTreeDigest: digest("3"),
				acceptanceRequirementIds: [],
			},
			observedAt: "2026-08-01T13:00:00.000Z",
			producer: {
				kind: kind === "outcome_observation" ? "external_service" : "runtime",
				id: "intake-producer-test",
				version: "1.0.0",
			},
			authority: kind === "delivery_attestation" ? "verified" : "observed",
			coverage: "complete",
			sensitivity: "project",
		},
	);
}

describe("closed Change intake producers", () => {
	it("constructs all eight source members without caller-owned canonical fields", () => {
		const materials = [
			createUserSuggestionMaterial({
				channel: "api",
				submissionId: "suggestion:01",
				content: content(),
			}),
			createPullRequestFindingMaterial({
				providerId: "configured-provider",
				repositoryId: "project/repository",
				pullRequestId: "pull:42",
				headCommit: gitObject("a"),
				eventId: "event:100",
				findingId: "finding:7",
				content: content(),
			}),
			createWorkerDiscoveryMaterial({
				workerReportId: "runtime-worker-report:01",
				assignmentOperationId: digest("2"),
				workItemClaimOperationId: digest("3"),
				baseTree: gitObject("a"),
				resultTree: gitObject("b"),
				content: content(),
			}),
			createRegressionFindingMaterial({
				runId: "run:regression:01",
				traceOperationId: digest("4"),
				baseTree: gitObject("a"),
				resultTree: gitObject("b"),
				findingId: "test:runtime:failure",
				content: content({claimedCategory: "reliability"}),
			}),
			createSecurityScannerFindingMaterial({
				scannerId: "scanner:dependency",
				scannerVersion: "1.2.3",
				runId: "run:scanner:01",
				tree: gitObject("b"),
				findingId: "rule:dependency:01",
				content: content({
					claimedCategory: "security",
					claimedSecurity: {
						classification: "dependency_advisory",
						identifiers: [
							{
								scheme: "cve",
								value: "cve-2026-12345",
								sourceRef: "trace:scanner:cve:1",
							},
						],
						cvss: [],
						sarif: [],
						kev: [],
					},
				}),
			}),
			createDeliveryObservationMaterial({
				observationId: "observation:delivery:01",
				deliveryId: "delivery:01",
				changeRevisionId: digest("5"),
				artifactDigest: digest("6"),
				environmentId: "environment:staging",
				content: content({claimedCategory: "delivery"}),
			}),
			createOutcomeFindingMaterial({
				observationId: "observation:outcome:01",
				changeRevisionId: digest("5"),
				subjectRef: "kb:product/outcomes/runtime",
				sourceEvidenceDigest: digest("7"),
				content: content({claimedCategory: "outcome"}),
			}),
			createKnowledgeDriftMaterial({
				observationId: "observation:knowledge:01",
				previousSnapshotDigest: digest("8"),
				currentSnapshotDigest: digest("9"),
				topicRefs: ["kb:system/runtime"],
				content: content({claimedCategory: "knowledge"}),
			}),
		];
		assert.deepEqual(
			materials.map((material) => material.materialType),
			[
				"user_suggestion",
				"pull_request_finding",
				"worker_discovery",
				"regression_finding",
				"security_scanner_finding",
				"delivery_observation",
				"outcome_finding",
				"knowledge_drift",
			],
		);
		for (const material of materials) {
			assert.equal("changeId" in material, false);
			assert.equal("authority" in material, false);
			assert.equal("priority" in material, false);
		}
		assert.equal(
			materials[4].content.claimedSecurity.identifiers[0].value,
			"CVE-2026-12345",
		);
	});

	it("maps bounded Worker Report discoveries through exact Runtime bindings", () => {
		const materials = createWorkerReportDiscoveryMaterials({
			workerReportId: "runtime-worker-report:batch",
			assignmentOperationId: digest("a"),
			workItemClaimOperationId: digest("b"),
			baseTree: gitObject("c"),
			resultTree: gitObject("d"),
			discoveries: [content(), content({summary: "Second discrepancy"})],
		});
		assert.equal(materials.length, 2);
		assert.equal(materials[0].binding.assignmentOperationId, digest("a"));
		assert.equal(materials[1].binding.workerReportId, "runtime-worker-report:batch");
		assert.throws(
			() =>
				createWorkerReportDiscoveryMaterials({
					workerReportId: "runtime-worker-report:too-many",
					assignmentOperationId: digest("a"),
					workItemClaimOperationId: digest("b"),
					baseTree: gitObject("c"),
					resultTree: gitObject("d"),
					discoveries: Array.from({length: 17}, () => content()),
				}),
			/at most 16 discoveries/,
		);
	});

	it("adapts exact delivery/outcome Evidence and Knowledge drift issues", () => {
		const deliveryEvidence = evidence("delivery_attestation", {
			effect: "deployment",
			targetRef: "deployment:staging",
			operationId: "delivery:operation:01",
			outcome: "failed",
			remoteStateDigest: digest("c"),
			artifactDigest: digest("d"),
		});
		const delivery = createDeliveryObservationMaterialFromEvidence({
			evidence: deliveryEvidence,
			changeRevisionId: digest("e"),
			environmentId: "environment:staging",
			content: content({claimedCategory: "delivery"}),
		});
		assert.equal(delivery.binding.observationId, deliveryEvidence.evidenceId);
		assert.equal(delivery.binding.artifactDigest, digest("d"));

		const outcomeEvidence = evidence("outcome_observation", {
			outcomeId: "outcome:latency:01",
			observationType: "metric",
			measurement: {kind: "count", value: 450},
			summary: "Latency exceeded the accepted outcome.",
			window: {
				startedAt: "2026-08-01T12:00:00.000Z",
				endedAt: "2026-08-01T13:00:00.000Z",
			},
			sourceRef: "trace:metrics:latency:01",
			limitations: [],
		});
		const outcome = createOutcomeFindingMaterialFromEvidence({
			evidence: outcomeEvidence,
			changeRevisionId: digest("e"),
			content: content({claimedCategory: "outcome"}),
		});
		assert.equal(outcome.binding.observationId, "outcome:latency:01");
		assert.match(outcome.binding.sourceEvidenceDigest, /^sha256:[0-9a-f]{64}$/u);

		const drift = createKnowledgeDriftMaterialFromIssue({
			issue: {
				ruleId: "public_command_namespace",
				path: "README.md",
				message: "Public docs use a retired command namespace.",
				match: "/codewiki state",
			},
			observationId: "knowledge-drift:README:01",
			previousSnapshotDigest: digest("1"),
			currentSnapshotDigest: digest("2"),
			topicRefs: ["kb:product/terminal"],
			sourceRef: "trace:knowledge-linter:run:01",
		});
		assert.equal(drift.content.claimedCategory, "knowledge");
		assert.deepEqual(drift.content.affectedRefs, ["README.md"]);
	});

	it("rejects producer-level authority expansion and malformed source binding", () => {
		assert.throws(
			() =>
				createUserSuggestionMaterial({
					channel: "api",
					submissionId: "suggestion:bad",
					content: content(),
					priority: "critical",
				}),
			/User suggestion producer received unsupported field priority/,
		);
		assert.throws(
			() =>
				createPullRequestFindingMaterial({
					providerId: "provider",
					repositoryId: "project/repository",
					pullRequestId: "pull:1",
					headCommit: "not-a-git-object",
					eventId: "event:1",
					findingId: "finding:1",
					content: content(),
				}),
			/lowercase Git object id/,
		);
	});
});
