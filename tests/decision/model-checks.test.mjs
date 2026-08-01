import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {changeContentDigest} from "../../src/changes/digest.ts";
import {createChangeRecord} from "../../src/changes/records.ts";
import {parseDecisionCandidateProposal} from "../../src/decision/candidate-proposal.ts";
import {createDecisionCandidate} from "../../src/decision/exit/candidate.ts";
import {materializeDecisionApprovalReceipt} from "../../src/decision/exit/evidence.ts";
import {
	DECISION_MODEL_CHECK_REQUEST_PROTOCOL,
	createDecisionModelCheckExecutors,
} from "../../src/decision/exit/model-checks.ts";
import {
	createDecisionExitRuntime,
	deriveDecisionRuntimeRoute,
} from "../../src/decision/exit/runtime.ts";
import {materializeDecisionResearchCitation} from "../../src/runtime/decision-research.ts";
import {createCheckCatalog} from "../../src/loop-exit/catalog.ts";
import {createResolvedExitPolicy} from "../../src/loop-exit/contracts.ts";
import {
	activateCustomCheckDefinition,
	createCustomCheckDefinition,
	createProtectedCustomCheckConfigSnapshot,
	customCheckDefinitionCheckId,
} from "../../src/loop-exit/custom-checks/index.ts";
import {resolveExitPolicy} from "../../src/loop-exit/resolve-policy.ts";
import {createLoopExitRunner} from "../../src/loop-exit/runner.ts";
import {acceptedChangeFixture} from "../helpers/accepted-change.mjs";

const WORK_STATE_DIGEST = `sha256:${"a".repeat(64)}`;
const KNOWLEDGE_DIGEST = `sha256:${"b".repeat(64)}`;
const MODEL_CHECK_IDS = ["intention_validated", "recommendation_justified"];
const digest = (character) => `sha256:${character.repeat(64)}`;
const SECURITY_SCANNER_TYPES = [
	"static_analysis",
	"dependency_advisory",
	"secret_detection",
	"configuration",
	"authorization_test",
	"migration_test",
];

function securityScannerConfiguration(scannerFinding = null, onExecute = () => undefined) {
	return {
		sensitivity: "project",
		adapters: SECURITY_SCANNER_TYPES.map((scannerType) => ({
			scannerType,
			scannerId: `scanner.${scannerType}`,
			scannerVersion: "1.0.0",
			configurationDigest: digest("c"),
			async execute(request) {
				onExecute(scannerType, request);
				const findings =
					scannerType === "static_analysis" && scannerFinding
						? [scannerFinding]
						: [];
				return {
					requestDigest: request.requestDigest,
					runId: `run:${scannerType}:decision`,
					startedAt: "2026-07-28T11:58:00.000Z",
					completedAt: "2026-07-28T11:58:01.000Z",
					termination: "exited",
					exitCode: findings.length > 0 ? 1 : 0,
					outcome: findings.length > 0 ? "findings" : "clean",
					coverage: "complete",
					findings,
					limitations: [],
				};
			},
		})),
	};
}

function securityScanContext() {
	return {
		sourceSnapshotDigest: digest("d"),
		sourceTree: "a".repeat(40),
		sourceTreeDigest: digest("e"),
		environmentDigest: digest("f"),
		sourceRefs: ["src/security"],
		knowledgeRefs: ["kb:system/security"],
		ownershipRefs: ["kb:system/security#source"],
		observedAt: "2026-07-28T12:00:00.000Z",
		advisorySnapshots: [
			{
				scannerType: "dependency_advisory",
				snapshotDigest: digest("1"),
				observedAt: "2026-07-27T12:00:00.000Z",
				validUntil: "2026-07-29T12:00:00.000Z",
				sourceRefs: ["advisory:decision:test"],
			},
		],
	};
}

function protectedConfig(customChecks) {
	return createProtectedCustomCheckConfigSnapshot({
		protectedSourceHead: "f".repeat(40),
		projectConfigDigest: digest("e"),
		customChecks,
	});
}

function fixture(changeOverrides = {}) {
	const change = acceptedChangeFixture({
		id: "CHG-decision-model",
		...changeOverrides,
	});
	const record = createChangeRecord(change);
	const candidate = createDecisionCandidate({
		record,
		workState: {
			schemaVersion: 1,
			snapshotDigest: WORK_STATE_DIGEST,
			changeIds: [change.id],
			sprintIds: [],
			workItemIds: [],
			assignmentIds: [],
			changes: [
				{
					id: change.id,
					traceId: `TRACE-${change.id}`,
					record,
					approval: {status: "pending"},
					planningStatus: "unplanned",
					realizationStatus: "not_started",
					outcomeStatus: "unobserved",
					sprintIds: [],
					workItemIds: [],
					assignmentIds: [],
					blockers: [],
				},
			],
			sprints: [],
			workItems: [],
			assignments: [],
			blockers: [],
			sources: {traceCount: 1, recordCount: 1, changeTraceCount: 1},
		},
		proposal: parseDecisionCandidateProposal({
			disposition: "approve",
			rationale: "Approve grounded exact revision.",
		}),
		observedBase: {
			workStateDigest: WORK_STATE_DIGEST,
			knowledgeSnapshotDigest: KNOWLEDGE_DIGEST,
			canonicalRefs: [
				`change:${change.id}`,
				`change:${change.id}:revision:${change.revision}`,
				changeContentDigest(change),
			],
		},
	});
	const catalog = createCheckCatalog();
	const resolved = resolveExitPolicy({
		loop: "decision",
		candidateDigest: candidate.digest,
		changes: [
			{
				changeId: change.id,
				revision: change.revision,
				digest: changeContentDigest(change),
				kind: change.classification.kind,
				type: change.classification.type,
				risk: change.safety.risk,
				affectedLayers: [...change.classification.affectedLayers],
			},
		],
		projectTraits: [],
		technologies: [],
		paths: [...change.classification.targetRefs],
	});
	const bindings = resolved.bindings.filter((binding) =>
		MODEL_CHECK_IDS.includes(binding.checkId),
	);
	const policy = createResolvedExitPolicy({
		loop: "decision",
		candidateDigest: candidate.digest,
		catalogDigest: resolved.catalogDigest,
		selectorInputDigest: resolved.selectorInputDigest,
		bindings,
		protectedCheckIds: bindings.map((binding) => binding.checkId),
	});
	return {
		candidate,
		catalog,
		policy,
		subject: {
			changeRefs: [`change:${change.id}`],
			changeRevisionDigests: [changeContentDigest(change)],
			candidateDigest: candidate.digest,
			acceptanceRequirementIds: [],
		},
	};
}

function route(overrides = {}) {
	return {
		id: "decision-model",
		provider: "test-provider",
		model: "test-model",
		thinking: "high",
		quality: "high",
		latency: "balanced",
		timeoutMs: 60_000,
		pricing: {
			inputUsdPerMillion: 1,
			outputUsdPerMillion: 2,
			cacheReadUsdPerMillion: 0,
			cacheWriteUsdPerMillion: 0,
		},
		allowedTools: [],
		...overrides,
	};
}

function response(request, conclusion = "supported") {
	return {
		protocolId: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.id,
		protocolVersion: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.version,
		requestDigest: request.requestDigest,
		checkId: request.check.id,
		checkVersion: request.check.version,
		conclusion,
		consideredEvidenceIds: [...request.review.consideredEvidenceIds],
		findings:
			conclusion === "supported"
				? [`${request.check.id} is supported by Candidate content.`]
				: [`${request.check.id} remains unsupported.`],
		limitations: [],
		...(request.review.mode === "security_challenge"
			? {securityFindings: []}
			: {}),
	};
}

function securityFinding() {
	return {
		threatGoal: "Read another user's protected record.",
		preconditions: ["Attacker has a valid account."],
		attackPath: "Supply another user's record identifier without an ownership check.",
		violatedInvariants: ["Unauthorized actors cannot read personal data."],
		candidateRefs: ["revision.safety.invariants"],
		evidenceIds: [],
		claimedSeverity: "high",
		confidence: "medium",
		mitigations: ["Require object-level authorization."],
		limitations: ["No integrated source tree was supplied."],
	};
}

function scannerFinding() {
	return {
		findingId: "authorization-bypass",
		content: {
			summary: "Authorization check can be bypassed",
			observedBehavior: "Protected data can reach a handler without object authorization.",
			desiredBehavior: "Protected data requires object authorization before handler execution.",
			affectedRefs: ["src/security/authorization.ts"],
			sourceRefs: ["trace:scanner:authorization-bypass"],
			claimedCategory: "security",
			claimedSeverity: "critical",
			claimedConfidence: "high",
		},
	};
}

describe("native Decision Model Checks", () => {
	it("runs independent bounded requests and binds produced model Evidence", async () => {
		const setup = fixture();
		const requests = [];
		let active = 0;
		let maximumActive = 0;
		const transport = {
			async execute(request) {
				requests.push(request);
				active += 1;
				maximumActive = Math.max(maximumActive, active);
				await new Promise((resolve) => setTimeout(resolve, 5));
				active -= 1;
				return {
					status: "completed",
					observedAt: "2026-07-28T12:00:00.000Z",
					response: response(request),
				};
			},
		};
		const executors = createDecisionModelCheckExecutors({
			catalog: setup.catalog,
			route: route(),
			subject: setup.subject,
			transport,
		});
		const runner = createLoopExitRunner({
			catalog: setup.catalog,
			executors,
			limits: {codeConcurrency: 1, modelConcurrency: 2},
		});
		const first = await runner.run({
			candidate: setup.candidate,
			policy: setup.policy,
		});
		assert.equal(first.report.status, "pass");
		assert.equal(requests.length, 2);
		assert.equal(maximumActive, 2);
		assert.equal(first.producedEvidenceRecords.length, 2);
		assert.deepEqual(
			first.producedEvidenceRecords.map((record) => record.payload.checkId).sort(),
			[...MODEL_CHECK_IDS].sort(),
		);
		for (const request of requests) {
			assert.equal(request.candidate.digest, setup.candidate.digest);
			assert.equal(request.route.provider, "test-provider");
			assert.equal("actorId" in request, false);
			assert.equal("approval" in request, false);
		}

		const resolutions = Object.fromEntries(
			first.report.checkResults.map((result) => [
				result.checkId,
				result.evidenceResolutions,
			]),
		);
		const replay = await runner.run({
			candidate: setup.candidate,
			policy: setup.policy,
			evidenceRecords: first.producedEvidenceRecords,
			evidenceResolutionsByCheck: resolutions,
		});
		assert.equal(replay.report.reportDigest, first.report.reportDigest);
		assert.equal(requests.length, 2);
		assert.deepEqual(replay.producedEvidenceRecords, []);
	});

	it("binds exact Custom Check metadata into one independent Model Check request", async () => {
		const setup = fixture();
		const definition = activateCustomCheckDefinition(
			createCustomCheckDefinition({
				checkTypeId: "organization_policy",
				name: "Document API ownership",
				requirement: "Every changed public API names its owning team.",
				repairGuidance: "Add one accepted owning-team reference.",
				appliesWhen: {loops: ["decision"]},
				knowledgeRefs: ["knowledge:api-ownership"],
			}),
		);
		const checkId = customCheckDefinitionCheckId(definition);
		const protectedBase = protectedConfig([definition]);
		const catalog = createCheckCatalog([definition]);
		const revision = setup.candidate.content.revision;
		const resolved = resolveExitPolicy({
			loop: "decision",
			candidateDigest: setup.candidate.digest,
			changes: [
				{
					changeId: setup.subject.changeRefs[0].slice("change:".length),
					revision: revision.revision,
					digest: setup.candidate.content.validation.revisionDigest,
					kind: revision.classification.kind,
					type: revision.classification.type,
					risk: revision.safety.risk,
					affectedLayers: [...revision.classification.affectedLayers],
				},
			],
			projectTraits: [],
			technologies: [],
			paths: [...revision.classification.targetRefs],
			protectedBaseCustomCheckConfig: protectedBase,
		});
		const binding = resolved.bindings.find((entry) => entry.checkId === checkId);
		const policy = createResolvedExitPolicy({
			loop: "decision",
			candidateDigest: setup.candidate.digest,
			catalogDigest: resolved.catalogDigest,
			selectorInputDigest: resolved.selectorInputDigest,
			bindings: [binding],
			protectedCheckIds: [],
		});
		const requests = [];
		const runner = createLoopExitRunner({
			catalog,
			executors: createDecisionModelCheckExecutors({
				catalog,
				route: route(),
				subject: setup.subject,
				transport: {
					async execute(request) {
						requests.push(request);
						return {
							status: "completed",
							observedAt: "2026-07-28T12:00:00.000Z",
							response: response(request),
						};
					},
				},
			}),
		});
		const result = await runner.run({candidate: setup.candidate, policy});

		assert.equal(result.report.checkResults[0].status, "pass");
		assert.equal(requests.length, 1);
		assert.equal(
			requests[0].protocolId,
			"codewiki.decision.model-check-request",
		);
		assert.equal(requests[0].protocolVersion, "3.0.0");
		assert.deepEqual({...requests[0].check.customCheck}, {
			customCheckId: definition.customCheckId,
			definitionDigest: definition.definitionDigest,
			protectedSourceHead: protectedBase.protectedSourceHead,
			protectedConfigDigest: protectedBase.projectConfigDigest,
			customCheckConfigDigest: protectedBase.customCheckConfigDigest,
			protectedConfigSnapshotDigest: protectedBase.snapshotDigest,
			checkTypeId: "organization_policy",
			checkTypeVersion: "1.0.0",
			evaluatorId: "codewiki.check-evaluator.organization_policy",
			knowledgeRefs: ["knowledge:api-ownership"],
			repairGuidance: "Add one accepted owning-team reference.",
		});
		assert.equal(requests[0].review.mode, "balanced");
	});

	it("runs classified security review as an asserted dependency-bound challenge", async () => {
		const setup = fixture({
			question: "How should authorization protect personal data?",
			currentState: "Authorization boundaries are implicit.",
			desiredState: "Explicit access control protects personal data.",
			rationale: "Prevent authorization bypass.",
			risk: "medium",
			invariants: ["Unauthorized actors cannot read personal data."],
			failureModes: ["An authorization bypass exposes personal data."],
			safetyBoundary: "Authenticated actor to protected record boundary.",
			negativeTestPlan: "Attempt cross-user record access.",
			rollbackPlan: "Restore previous authorization policy.",
		});
		const approval = materializeDecisionApprovalReceipt({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			actorId: "maintainer-security",
			authenticatedIdentityRef: "identity:test:maintainer-security",
			role: "maintainer",
			channel: "codewiki",
			decidedAt: "2026-07-28T11:59:00.000Z",
			observedAt: "2026-07-28T12:00:00.000Z",
			producer: {kind: "user", id: "maintainer-security", version: "1.0.0"},
		});
		const requests = [];
		const runtime = createDecisionExitRuntime({
			securityScanners: securityScannerConfiguration(),
			modelChecks: {
				route: route(),
				transport: {
					async execute(request) {
						requests.push(request);
						return {
							status: "completed",
							observedAt: "2026-07-28T12:00:00.000Z",
							response: response(request),
						};
					},
				},
			},
		});
		const result = await runtime.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: [approval],
			securityScan: securityScanContext(),
		});

		assert.equal(result.result.report.status, "pass");
		const securityRequest = requests.find(
			(request) => request.check.id === "security_privacy_reviewed",
		);
		assert.equal(securityRequest.review.mode, "security_challenge");
		assert.ok(
			securityRequest.review.securitySurfaceClassification.surfaces.includes(
				"authentication_authorization",
			),
		);
		assert.deepEqual(
			securityRequest.review.dependencyResults.map((entry) => [
				entry.checkId,
				entry.status,
			]),
			[
				["security_scanners_valid", "pass"],
				["security_surface_requirements_complete", "pass"],
			],
		);
		assert.ok(
			securityRequest.review.evidenceRecords.some(
				(record) => record.kind === "command_execution",
			),
		);
		assert.ok(
			securityRequest.review.evidenceRecords.some(
				(record) => record.kind === "source_observation",
			),
		);
		const assessment = result.result.producedEvidenceRecords.find(
			(record) => record.payload.checkId === "security_privacy_reviewed",
		);
		assert.equal(assessment.authority, "asserted");
		assert.deepEqual(assessment.payload.securityFindings, []);
		assert.deepEqual(result.securityFindingIntakeMaterials, []);

		const blockedModelCheckIds = [];
		const scannerBlocked = createDecisionExitRuntime({
			securityScanners: securityScannerConfiguration(scannerFinding()),
			modelChecks: {
				route: route(),
				transport: {
					async execute(request) {
						blockedModelCheckIds.push(request.check.id);
						return {
							status: "completed",
							observedAt: "2026-07-28T12:01:00.000Z",
							response: response(request),
						};
					},
				},
			},
		});
		const scannerBlockedResult = await scannerBlocked.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: [approval],
			securityScan: securityScanContext(),
		});
		assert.equal(scannerBlockedResult.result.report.status, "fail");
		assert.equal(
			scannerBlockedResult.result.report.checkResults.find(
				(check) => check.checkId === "security_scanners_valid",
			).status,
			"fail",
		);
		assert.equal(blockedModelCheckIds.includes("security_privacy_reviewed"), true);
		assert.equal(scannerBlockedResult.securityFindingIntakeMaterials.length, 1);
		assert.equal(
			scannerBlockedResult.securityFindingIntakeMaterials[0].content.claimedSeverity,
			"critical",
		);

		const challenged = createDecisionExitRuntime({
			securityScanners: securityScannerConfiguration(),
			modelChecks: {
				route: route(),
				transport: {
					async execute(request) {
						const base = response(request);
						return request.review.mode !== "security_challenge"
							? {status: "completed", observedAt: "2026-07-28T12:02:00.000Z", response: base}
							: {
									status: "completed",
									observedAt: "2026-07-28T12:02:00.000Z",
									response: {
										...response(request, "unsupported"),
										securityFindings: [securityFinding()],
									},
								};
					},
				},
			},
		});
		const challengedResult = await challenged.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: [approval],
			securityScan: securityScanContext(),
		});
		assert.equal(challengedResult.result.report.status, "fail");
		const challengeEvidence = challengedResult.result.producedEvidenceRecords.find(
			(record) => record.payload.checkId === "security_privacy_reviewed",
		);
		assert.equal(
			challengeEvidence.payload.securityFindings[0].claimedSeverity,
			"high",
		);
	});

	it("wires model Evidence into complete native Decision execution", async () => {
		const setup = fixture();
		let calls = 0;
		const runtime = createDecisionExitRuntime({
			modelChecks: {
				route: route(),
				transport: {
					async execute(request) {
						calls += 1;
						return {
							status: "completed",
							observedAt: "2026-07-28T12:00:00.000Z",
							response: response(request),
						};
					},
				},
			},
		});
		const approvalInput = {
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			actorId: "maintainer-1",
			authenticatedIdentityRef: "identity:test:maintainer-1",
			role: "maintainer",
			channel: "codewiki",
			decidedAt: "2026-07-28T11:59:00.000Z",
			observedAt: "2026-07-28T12:00:00.000Z",
			producer: {kind: "user", id: "maintainer-1", version: "1.0.0"},
		};
		const approval = materializeDecisionApprovalReceipt(approvalInput);
		assert.equal(
			materializeDecisionApprovalReceipt(approvalInput).evidenceId,
			approval.evidenceId,
		);
		assert.equal(Object.isFrozen(approval), true);
		assert.throws(
			() =>
				materializeDecisionApprovalReceipt({
					...approvalInput,
					runtimeJobId: "forbidden",
				}),
			/Decision approval input received unsupported field runtimeJobId/,
		);
		const result = await runtime.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: [approval],
		});
		assert.equal(result.result.report.status, "pass");
		assert.equal(result.route.route, "planning");
		assert.equal(result.route.reasonCode, "decision-approved");
		assert.match(result.route.routeDigest, /^sha256:[0-9a-f]{64}$/);
		assert.equal(calls, 2);
		assert.equal(result.result.producedEvidenceRecords.length, 2);
		assert.equal(
			result.result.report.checkResults.find(
				(check) => check.checkId === "intention_validated",
			).status,
			"pass",
		);
		assert.equal(
			result.result.report.checkResults.find(
				(check) => check.checkId === "approval_safety",
			).status,
			"pass",
		);
		assert.deepEqual(
			result.result.report.checkResults.find(
				(check) => check.checkId === "approval_safety",
			).evidenceRecordIds,
			[approval.evidenceId],
		);
		const replay = await runtime.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: [
				approval,
				...result.result.producedEvidenceRecords,
			],
		});
		assert.equal(replay.result.report.reportDigest, result.result.report.reportDigest);
		assert.equal(replay.route.routeDigest, result.route.routeDigest);
		assert.equal(calls, 2);
		assert.deepEqual(replay.result.producedEvidenceRecords, []);
	});

	it("runs high-risk research Checks and replays their exact Evidence", async () => {
		const setup = fixture({
			risk: "high",
			proofRefs: ["tests/decision/a.test.mjs", "tests/decision/b.test.mjs"],
			rollbackPlan: "Revert the exact accepted revision.",
			safetyBoundary: "Do not mutate provider or delivery state.",
			negativeTestPlan: "Reject stale and contradictory research Evidence.",
		});
		const approval = materializeDecisionApprovalReceipt({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			actorId: "maintainer-1",
			authenticatedIdentityRef: "identity:test:maintainer-1",
			role: "maintainer",
			channel: "codewiki",
			decidedAt: "2026-07-28T11:59:00.000Z",
			observedAt: "2026-07-28T12:00:00.000Z",
			producer: {kind: "user", id: "maintainer-1", version: "1.0.0"},
		});
		const freshnessBoundary = digest("9");
		const citation = materializeDecisionResearchCitation(
			{
				provenanceRefs: ["source:https://example.test/runtime"],
				payload: {
					claim: "The provider supports bounded retries.",
					classification: "primary",
					publisher: "Example Provider",
					uri: "https://example.test/runtime",
					title: "Runtime limits",
					publicationDate: "2026-07-01",
					passageDigest: digest("8"),
					passageLocator: "section:retries",
					stance: "supports",
					limitations: [],
				},
			},
			{
				subject: {
					changeRefs: setup.subject.changeRefs,
					changeRevisionDigests: setup.subject.changeRevisionDigests,
					acceptanceRequirementIds: [],
				},
				observedAt: "2026-07-28T12:00:00.000Z",
				producer: {
					kind: "external_service",
					id: "bounded-research-fetch",
					version: "1.0.0",
				},
				coverage: "complete",
				sensitivity: "project",
				freshnessBoundary,
			},
		);
		let modelCalls = 0;
		let researchCalls = 0;
		let scannerCalls = 0;
		let researchConclusion = "supported";
		const runtime = createDecisionExitRuntime({
			securityScanners: securityScannerConfiguration(null, () => {
				scannerCalls += 1;
			}),
			modelChecks: {
				route: route(),
				transport: {
					async execute(request) {
						modelCalls += 1;
						return {
							status: "completed",
							observedAt: "2026-07-28T12:01:00.000Z",
							response: response(request),
						};
					},
				},
			},
			researchChecks: {
				route: route({id: "decision-research"}),
				sensitivity: "project",
				transport: {
					async execute(request) {
						researchCalls += 1;
						return {
							status: "completed",
							requestDigest: request.requestDigest,
							observedAt: "2026-07-28T12:01:00.000Z",
							response: {
								claimAssessments: request.claims.map((claim) => ({
									claimDigest: claim.claimDigest,
									evidenceIds: claim.citations.map(
										(citation) => citation.evidenceId,
									),
									conclusion: researchConclusion,
									findings:
										researchConclusion === "supported"
											? []
											: ["Citation coverage remains uncertain."],
									limitations: [],
								})),
							},
						};
					},
				},
			},
		});
		const first = await runtime.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: [approval, citation],
			researchFreshnessBoundary: freshnessBoundary,
			securityScan: securityScanContext(),
		});
		assert.equal(
			first.result.report.status,
			"pass",
			JSON.stringify(
				first.result.report.checkResults.filter((check) => check.status !== "pass"),
			),
		);
		assert.equal(researchCalls, 1);
		assert.equal(scannerCalls, 1);
		assert.equal(
			first.result.report.checkResults.find(
				(check) => check.checkId === "research_provenance_valid",
			).status,
			"pass",
		);
		assert.equal(
			first.result.report.checkResults.find(
				(check) => check.checkId === "research_claims_supported",
			).status,
			"pass",
		);
		const replay = await runtime.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: [
				approval,
				citation,
				...first.result.producedEvidenceRecords,
			],
			researchFreshnessBoundary: freshnessBoundary,
			securityScan: securityScanContext(),
		});
		assert.equal(replay.result.report.reportDigest, first.result.report.reportDigest);
		assert.equal(researchCalls, 1);
		assert.equal(modelCalls > 0, true);
		assert.equal(scannerCalls, 1);
		assert.deepEqual(replay.result.producedEvidenceRecords, []);

		const changedEnvironment = await runtime.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: [
				approval,
				citation,
				...first.result.producedEvidenceRecords,
			],
			researchFreshnessBoundary: freshnessBoundary,
			securityScan: {
				...securityScanContext(),
				environmentDigest: digest("d"),
			},
		});
		assert.equal(scannerCalls, 2);
		assert.notEqual(
			changedEnvironment.result.report.reportDigest,
			first.result.report.reportDigest,
		);
		const priorScannerEvidenceIds = first.result.producedEvidenceRecords
			.filter(
				(record) =>
					record.kind === "command_execution" ||
					record.kind === "source_observation",
			)
			.map((record) => record.evidenceId);
		const changedScannerResult = changedEnvironment.result.report.checkResults.find(
			(check) => check.checkId === "security_scanners_valid",
		);
		assert.equal(
			priorScannerEvidenceIds.some((evidenceId) =>
				changedScannerResult.evidenceRecordIds.includes(evidenceId),
			),
			false,
		);

		researchConclusion = "uncertain";
		const uncertain = await runtime.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: [approval, citation],
			researchFreshnessBoundary: freshnessBoundary,
			securityScan: securityScanContext(),
		});
		assert.equal(uncertain.result.report.status, "indeterminate");
		assert.equal(researchCalls, 2);
		assert.equal(scannerCalls, 3);
		const uncertainAssessment = uncertain.result.producedEvidenceRecords.find(
			(record) =>
				record.kind === "model_assessment" &&
				record.payload.checkId === "research_claims_supported",
		);
		assert.ok(
			uncertainAssessment,
			JSON.stringify({
				records: uncertain.result.producedEvidenceRecords,
				check: uncertain.result.report.checkResults.find(
					(result) => result.checkId === "research_claims_supported",
				),
			}),
		);
		assert.equal(uncertainAssessment.payload.measurement.kind, "label");
		const uncertainReplay = await runtime.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: [
				approval,
				citation,
				...uncertain.result.producedEvidenceRecords,
			],
			researchFreshnessBoundary: freshnessBoundary,
			securityScan: securityScanContext(),
		});
		assert.equal(
			uncertainReplay.result.report.reportDigest,
			uncertain.result.report.reportDigest,
		);
		assert.equal(researchCalls, 2);
		assert.equal(scannerCalls, 3);
	});

	it("keeps unsupported, unavailable, and malformed outcomes explicit", async () => {
		for (const scenario of [
			"unsupported",
			"uncertain",
			"unavailable",
			"malformed",
			"evidence_mismatch",
			"missing_basis",
		]) {
			const setup = fixture();
			const transport = {
				async execute(request) {
					if (scenario === "unavailable") {
						return {
							status: "unavailable",
							observedAt: "2026-07-28T12:00:00.000Z",
						};
					}
					return {
						status: "completed",
						observedAt: "2026-07-28T12:00:00.000Z",
						response:
							scenario === "malformed"
								? {...response(request), requestDigest: `sha256:${"0".repeat(64)}`}
								: scenario === "evidence_mismatch"
									? {
											...response(request),
											consideredEvidenceIds: [
												`evidence:source_observation:${"1".repeat(64)}`,
											],
										}
									: scenario === "missing_basis"
										? {...response(request), findings: []}
										: response(
												request,
												scenario === "uncertain"
													? "uncertain"
													: "unsupported",
											),
					};
				},
			};
			const runner = createLoopExitRunner({
				catalog: setup.catalog,
				executors: createDecisionModelCheckExecutors({
					catalog: setup.catalog,
					route: route(),
					subject: setup.subject,
					transport,
				}),
			});
			const result = await runner.run({
				candidate: setup.candidate,
				policy: setup.policy,
			});
			assert.equal(
				result.report.status,
				scenario === "unsupported" ? "fail" : "indeterminate",
			);
			assert.equal(
				deriveDecisionRuntimeRoute(setup.candidate, result.report).route,
				scenario === "unsupported" ? "repair" : "waiting",
			);
			assert.equal(
				result.producedEvidenceRecords.length,
				scenario === "unsupported" || scenario === "uncertain" ? 2 : 0,
				`${scenario}: ${JSON.stringify(result.report.checkResults)}`,
			);
			if (scenario === "uncertain") {
				assert.equal(
					result.producedEvidenceRecords[0].payload.measurement.kind,
					"label",
				);
				const replay = await runner.run({
					candidate: setup.candidate,
					policy: setup.policy,
					evidenceRecords: result.producedEvidenceRecords,
					evidenceResolutionsByCheck: Object.fromEntries(
						result.report.checkResults.map((check) => [
							check.checkId,
							check.evidenceResolutions,
						]),
					),
				});
				assert.equal(replay.report.status, "indeterminate");
				assert.deepEqual(replay.producedEvidenceRecords, []);
			}
		}
	});

	it("rejects model routes that can share tool state", () => {
		const setup = fixture();
		assert.throws(
			() =>
				createDecisionModelCheckExecutors({
					catalog: setup.catalog,
					route: route({allowedTools: ["read"]}),
					subject: setup.subject,
					transport: {execute: async () => ({status: "unavailable"})},
				}),
			/must disable all tools/,
		);
	});
});
