import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	EVIDENCE_KINDS,
	EVIDENCE_SCHEMA_VERSION,
} from "../../src/evidence/contracts.ts";
import {
	createEvidenceId,
	evidenceDigestFromId,
} from "../../src/evidence/identity.ts";
import {
	assertValidEvidenceRecord,
	materializeEvidenceRecord,
} from "../../src/evidence/materialize.ts";

const digest = (character) => `sha256:${character.repeat(64)}`;
const gitOid = (character) => character.repeat(40);
const evidenceId = (kind, character) =>
	`evidence:${kind}:${character.repeat(64)}`;

const observedAt = "2026-07-29T10:00:00.000Z";
const subject = {
	changeRefs: ["TRACE-CHG-evidence"],
	changeRevisionDigests: [digest("1")],
	candidateDigest: digest("2"),
	planningRevisionDigest: digest("3"),
	acceptanceRequirementIds: ["REQ-evidence"],
	sourceTreeDigest: digest("4"),
};

function material(kind, payload, overrides = {}) {
	return {
		schemaVersion: EVIDENCE_SCHEMA_VERSION,
		kind,
		provenanceRefs: [`producer:${kind}@1.0.0`],
		payload,
		...overrides,
	};
}

function producerFor(kind) {
	if (kind === "model_assessment") {
		return { kind: "model", id: "model-assessor", version: "1.0.0" };
	}
	if (kind === "worker_report") {
		return { kind: "worker", id: "worker-report", version: "1.0.0" };
	}
	if (kind === "approval_receipt") {
		return { kind: "user", id: "codewiki-review", version: "1.0.0" };
	}
	if (kind === "research_citation" || kind === "outcome_observation") {
		return { kind: "external_service", id: "observed-service", version: "1.0.0" };
	}
	return { kind: "runtime", id: "codewiki-runtime", version: "1.0.0" };
}

function runtimeFor(kind, overrides = {}) {
	return {
		subject,
		observedAt,
		producer: producerFor(kind),
		authority:
			kind === "approval_receipt"
				? "approved"
				: kind === "integration_proof" || kind === "delivery_attestation"
					? "verified"
					: "observed",
		coverage: "complete",
		sensitivity: "project",
		...overrides,
	};
}

const payloads = {
	research_citation: {
		claim: "Provider API supports immutable review event identifiers.",
		classification: "primary",
		publisher: "Example Provider",
		uri: "https://example.test/review-events",
		title: "Review events",
		publicationDate: "2026-07-01",
		passageDigest: digest("5"),
		passageLocator: "section:review-events",
		stance: "supports",
		limitations: ["Example fixture, not production provider evidence."],
	},
	source_observation: {
		sourceType: "source",
		snapshotDigest: digest("6"),
		paths: ["src/evidence/contracts.ts"],
		symbols: ["EvidenceRecord"],
		ownershipRefs: ["component:evidence"],
		observations: ["Evidence contract is closed and versioned."],
	},
	command_execution: {
		adapterId: "node-test",
		adapterVersion: "1.0.0",
		invocationDigest: digest("7"),
		environmentDigest: digest("8"),
		termination: "exited",
		exitCode: 0,
		durationMs: 42,
		stdoutDigest: digest("9"),
		diagnosticRefs: ["test:unit"],
	},
	ui_capture: {
		previewTargetId: "web",
		previewProfileId: "desktop",
		captureManifestDigest: digest("a"),
		route: "/changes/TRACE-CHG-evidence",
		scenario: "approval-open",
		state: "ready",
		viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
		captures: [
			{
				role: "screenshot",
				digest: digest("b"),
				mediaType: "image/png",
				ref: ".codewiki/runtime/evidence/screenshot.png",
				sizeBytes: 1024,
			},
			{
				role: "video",
				digest: digest("c"),
				mediaType: "video/webm",
				ref: ".codewiki/runtime/evidence/interaction.webm",
				sizeBytes: 2048,
				durationMs: 1200,
			},
		],
		livePreviewRef: "http://127.0.0.1:4173/",
		console: { errors: 0, warnings: 1, summaryDigest: digest("d") },
		network: { failedRequests: 0, summaryDigest: digest("e") },
		observations: ["Approval controls remain visible at desktop width."],
	},
	model_assessment: {
		checkId: "ui-experience-reviewed",
		checkVersion: "1.0.0",
		protocolId: "implementation-ui-review",
		protocolVersion: "1.0.0",
		routeId: "implementation-model",
		configurationDigest: digest("f"),
		measurement: { kind: "score", value: 0.8, minimum: 0, maximum: 1 },
		consideredEvidenceIds: [],
		findings: ["Hierarchy is clear."],
		limitations: ["Model cannot grant user approval."],
	},
	worker_report: {
		assignmentId: "ASN-evidence",
		claimId: "CLM-evidence",
		workbenchId: "WB-evidence",
		baseTreeDigest: digest("0"),
		reportDigest: digest("1"),
		completion: "completed",
		changedPaths: ["src/evidence/contracts.ts"],
		proofRefs: ["worker-report:ASN-evidence"],
		summary: "Added Evidence contracts.",
	},
	integration_proof: {
		operation: "merge",
		targetRef: "refs/codewiki/integration/evidence",
		baseCommit: gitOid("1"),
		sourceCommit: gitOid("2"),
		resultCommit: gitOid("3"),
		resultTreeDigest: digest("2"),
		patchDigest: digest("3"),
		changedPaths: ["src/evidence/contracts.ts"],
		verificationEvidenceIds: [evidenceId("command_execution", "4")],
	},
	approval_receipt: {
		actorId: "user-42",
		authenticatedIdentityRef: "codewiki:user:user-42",
		role: "intent_owner",
		decision: "approved",
		channel: "codewiki",
		decidedAt: "2026-07-29T09:59:00.000Z",
		evidenceBundleDigest: digest("5"),
		captureDigests: [digest("b"), digest("c")],
	},
	delivery_attestation: {
		effect: "push",
		targetRef: "refs/heads/main",
		operationId: "push-evidence",
		outcome: "completed",
		remoteStateDigest: digest("6"),
		commitSha: gitOid("7"),
		providerEventId: "event-42",
	},
	outcome_observation: {
		outcomeId: "approval-latency",
		observationType: "metric",
		measurement: { kind: "count", value: 3 },
		summary: "Three minutes from review request to authenticated approval.",
		window: {
			startedAt: "2026-07-29T09:55:00.000Z",
			endedAt: "2026-07-29T09:58:00.000Z",
		},
		sourceRef: "metric:approval-latency",
		limitations: [],
	},
};

describe("Evidence Record foundation", () => {
	it("materializes every closed evidence kind as immutable content-addressed data", () => {
		assert.deepEqual(Object.keys(payloads), [...EVIDENCE_KINDS]);
		for (const kind of EVIDENCE_KINDS) {
			const record = materializeEvidenceRecord(
				material(kind, payloads[kind]),
				runtimeFor(kind),
			);
			assert.match(record.evidenceId, new RegExp(`^evidence:${kind}:[0-9a-f]{64}$`));
			assert.equal(record.kind, kind);
			assert.equal(record.observedAt, observedAt);
			assert.equal("status" in record, false);
			assert.equal("route" in record, false);
			assert.equal(Object.isFrozen(record), true);
			assert.equal(Object.isFrozen(record.subject), true);
			assert.equal(Object.isFrozen(record.payload), true);
			assert.doesNotThrow(() => assertValidEvidenceRecord(record));
		}
	});

	it("normalizes unordered bindings before deriving deterministic identity", () => {
		const first = material(
			"source_observation",
			{
				...payloads.source_observation,
				paths: ["src/z.ts", "src/a.ts", "src/z.ts"],
			},
			{ provenanceRefs: ["source:z", "source:a", "source:z"] },
		);
		const second = material(
			"source_observation",
			{
				...payloads.source_observation,
				paths: ["src/a.ts", "src/z.ts"],
			},
			{ provenanceRefs: ["source:a", "source:z"] },
		);
		const firstRuntime = runtimeFor("source_observation", {
			subject: {
				...subject,
				changeRefs: ["TRACE-CHG-z", "TRACE-CHG-a", "TRACE-CHG-z"],
				acceptanceRequirementIds: ["REQ-z", "REQ-a", "REQ-z"],
			},
		});
		const secondRuntime = runtimeFor("source_observation", {
			subject: {
				...subject,
				changeRefs: ["TRACE-CHG-a", "TRACE-CHG-z"],
				acceptanceRequirementIds: ["REQ-a", "REQ-z"],
			},
		});
		const left = materializeEvidenceRecord(first, firstRuntime);
		const right = materializeEvidenceRecord(second, secondRuntime);
		assert.equal(left.evidenceId, right.evidenceId);
		assert.deepEqual(left.subject.changeRefs, ["TRACE-CHG-a", "TRACE-CHG-z"]);
		assert.deepEqual(left.payload.paths, ["src/a.ts", "src/z.ts"]);
		assert.deepEqual(left.provenanceRefs, ["source:a", "source:z"]);

		const changed = materializeEvidenceRecord(
			material(
				"source_observation",
				{
					...second.payload,
					observations: ["Different exact observation."],
				},
				{ provenanceRefs: second.provenanceRefs },
			),
			secondRuntime,
		);
		assert.notEqual(changed.evidenceId, left.evidenceId);

		const later = materializeEvidenceRecord(second, {
			...secondRuntime,
			observedAt: "2026-07-29T10:01:00.000Z",
			freshnessBoundary: "snapshot:next",
		});
		assert.notEqual(later.evidenceId, right.evidenceId);
		assert.equal(later.freshnessBoundary, "snapshot:next");
	});

	it("keeps failed, contradictory, and request-changes observations", () => {
		const failedCommand = materializeEvidenceRecord(
			material("command_execution", {
				...payloads.command_execution,
				exitCode: 1,
			}),
			runtimeFor("command_execution"),
		);
		assert.equal(failedCommand.payload.exitCode, 1);

		const contradiction = materializeEvidenceRecord(
			material("research_citation", {
				...payloads.research_citation,
				stance: "contradicts",
			}),
			runtimeFor("research_citation", { coverage: "partial" }),
		);
		assert.equal(contradiction.payload.stance, "contradicts");

		const requestChanges = materializeEvidenceRecord(
			material("approval_receipt", {
				...payloads.approval_receipt,
				decision: "changes_requested",
			}),
			runtimeFor("approval_receipt"),
		);
		assert.equal(requestChanges.payload.decision, "changes_requested");
	});

	it("rejects identity outside the closed Evidence kind set", () => {
		assert.throws(
			() => createEvidenceId("unknown_kind", digest("1")),
			/Evidence kind unknown_kind is invalid\./,
		);
		assert.throws(
			() => evidenceDigestFromId(evidenceId("unknown_kind", "1")),
			/Evidence kind unknown_kind is invalid\./,
		);
	});

	it("rejects claims to Runtime-owned identity, subject, producer, and assurance", () => {
		assert.throws(
			() =>
				materializeEvidenceRecord(
					{
						...material("source_observation", payloads.source_observation),
						evidenceId: evidenceId("source_observation", "1"),
						subject,
						producer: { kind: "runtime", id: "forged-runtime" },
						authority: "verified",
						freshnessBoundary: "snapshot:forged",
						sensitivity: "public",
					},
					runtimeFor("source_observation"),
				),
			/Evidence material cannot supply runtime-owned fields: evidenceId, subject, producer, authority, freshnessBoundary, sensitivity\./,
		);
		assert.throws(
			() =>
				materializeEvidenceRecord(
					material("source_observation", payloads.source_observation),
					{ ...runtimeFor("source_observation"), route: "implementation" },
				),
			/Evidence runtime context received unsupported field route\./,
		);
	});

	it("rejects unknown nested fields and raw command output", () => {
		assert.throws(
			() =>
				materializeEvidenceRecord(
					material("command_execution", {
						...payloads.command_execution,
						stdout: "raw output must remain private",
					}),
					runtimeFor("command_execution"),
				),
			/unsupported field stdout/,
		);
		assert.throws(
			() =>
				materializeEvidenceRecord(
					material("source_observation", payloads.source_observation),
					runtimeFor("source_observation", {
						subject: { ...subject, verdict: "pass" },
					}),
				),
			/unsupported field verdict/,
		);
	});

	it("enforces candidate, source-tree, producer, and approval bindings", () => {
		const withoutCandidate = { ...subject };
		delete withoutCandidate.candidateDigest;
		assert.throws(
			() =>
				materializeEvidenceRecord(
					material("ui_capture", payloads.ui_capture),
					runtimeFor("ui_capture", { subject: withoutCandidate }),
				),
			/Evidence kind ui_capture requires subject\.candidateDigest\./,
		);
		const withoutSource = { ...subject };
		delete withoutSource.sourceTreeDigest;
		assert.throws(
			() =>
				materializeEvidenceRecord(
					material("delivery_attestation", payloads.delivery_attestation),
					runtimeFor("delivery_attestation", { subject: withoutSource }),
				),
			/Evidence kind delivery_attestation requires subject\.sourceTreeDigest\./,
		);
		assert.throws(
			() =>
				materializeEvidenceRecord(
					material("approval_receipt", payloads.approval_receipt),
					runtimeFor("approval_receipt", { authority: "observed" }),
				),
			/Approval receipt Evidence requires approved authority\./,
		);
		assert.throws(
			() =>
				materializeEvidenceRecord(
					material("model_assessment", payloads.model_assessment),
					runtimeFor("model_assessment", {
						producer: { kind: "runtime", id: "wrong-producer", version: "1.0.0" },
					}),
				),
			/Model assessment Evidence producer must be model\./,
		);
		assert.throws(
			() =>
				materializeEvidenceRecord(
					material("research_citation", payloads.research_citation),
					runtimeFor("research_citation", {
						producer: { kind: "model", id: "research-model", version: "1.0.0" },
					}),
				),
			/Research citation Evidence producer must be runtime or external_service\./,
		);
		assert.throws(
			() =>
				materializeEvidenceRecord(
					material("source_observation", payloads.source_observation),
					runtimeFor("source_observation", {
						producer: { kind: "runtime", id: "source-observer" },
					}),
				),
			/Evidence runtime context is invalid.*version/,
		);
	});

	it("requires exact provider correlation for provider approval receipts", () => {
		const providerPayload = {
			...payloads.approval_receipt,
			channel: "git_provider",
			provider: {
				id: "github",
				repository: "example/codewiki",
				pullRequestNumber: 42,
				eventId: "review-42",
				headSha: gitOid("8"),
			},
		};
		const record = materializeEvidenceRecord(
			material("approval_receipt", providerPayload),
			runtimeFor("approval_receipt", {
				producer: { kind: "external_service", id: "github", version: "1.0.0" },
			}),
		);
		assert.equal(record.payload.provider.headSha, gitOid("8"));
		assert.throws(
			() =>
				materializeEvidenceRecord(
					material(
						"approval_receipt",
						{ ...payloads.approval_receipt, channel: "git_provider" },
					),
					runtimeFor("approval_receipt", {
						producer: { kind: "external_service", id: "github", version: "1.0.0" },
					}),
				),
			/Git-provider approval Evidence requires provider binding\./,
		);
	});

	it("detects identity tampering and malformed measurements", () => {
		const record = materializeEvidenceRecord(
			material("source_observation", payloads.source_observation),
			runtimeFor("source_observation"),
		);
		assert.throws(
			() =>
				assertValidEvidenceRecord({
					...record,
					coverage: "partial",
				}),
			/Evidence Record identity mismatch/,
		);
		assert.throws(
			() =>
				materializeEvidenceRecord(
					material("model_assessment", {
						...payloads.model_assessment,
						measurement: { kind: "score", value: 4, minimum: 0, maximum: 1 },
					}),
					runtimeFor("model_assessment"),
				),
			/measurement value must be within its declared range/,
		);
	});
});
