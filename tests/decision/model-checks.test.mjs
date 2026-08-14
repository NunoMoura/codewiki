import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	materializeDecisionApprovalReceipt,
	materializeDecisionResidualRiskApprovalReceipt,
} from "../../src/decision/exit/evidence.ts";
import {
	DECISION_MODEL_CHECK_REQUEST_PROTOCOL,
	createDecisionModelCheckExecutors,
} from "../../src/decision/exit/model-checks.ts";
import {
	createDecisionLoopExit,
	routeDecisionLoopExit,
} from "../../src/runtime/loop-exit/decision.ts";
import {collectDecisionResearchEvidence} from "../../src/runtime/effects/research-collection.ts";
import {createCheckCatalog} from "../../src/verification/catalog.ts";
import {createResolvedExitPolicy} from "../../src/verification/contracts.ts";
import {
	activateCustomCheckDefinition,
	createCustomCheckDefinition,
	createProtectedCustomCheckConfigSnapshot,
	customCheckDefinitionCheckId,
} from "../../src/verification/custom-checks/index.ts";
import {resolveExitPolicy} from "../../src/verification/resolve-policy.ts";
import {createLoopExitRunner} from "../../src/verification/runner.ts";
import {
	nativeDecisionCandidate,
	nativeDecisionRevision,
	nativeDecisionState,
} from "../helpers/native-decision.mjs";
import {
	createTestUserStandard,
	standardRefsFor,
} from "../verification/custom-checks/user-standard-fixture.mjs";

const USER_STANDARD = createTestUserStandard();
const USER_STANDARDS = [USER_STANDARD];
const MODEL_CHECK_IDS = ["intention_validated", "recommendation_justified"];
const digest = (character) => `sha256:${character.repeat(64)}`;
const SECURITY_SCANNER_TYPES = [
	"static_analysis",
	"dependency_advisory",
	"secret_detection",
	"infrastructure_configuration",
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
		userStandards: USER_STANDARDS,
		triagePreferences: [],
		customChecks,
	});
}

function fixture(revisionOptions = {}) {
	const changeId = "CHG-decision-model";
	const revision = nativeDecisionRevision({changeId, ...revisionOptions});
	const candidate = nativeDecisionCandidate({
		state: nativeDecisionState([{changeId, revision}]),
		changeId,
		rationale: "Approve grounded exact revision.",
	});
	const semantic = candidate.content.revision;
	const catalog = createCheckCatalog();
	const resolved = resolveExitPolicy({
		loop: "decision",
		candidateDigest: candidate.digest,
		changes: [
			{
				changeId,
				revision: semantic.ordinal,
				digest: semantic.revisionId,
				kind: semantic.classification.kind,
				type: semantic.classification.type,
				risk:
					semantic.safety.risk === "low"
						? "low"
						: semantic.safety.risk === "moderate"
							? "medium"
							: "high",
				affectedLayers: [...semantic.classification.affectedLayers],
			},
		],
		projectTraits: [],
		technologies: [],
		paths: [...semantic.classification.targetRefs],
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
			changeRefs: [`change:${changeId}`],
			changeRevisionDigests: [semantic.revisionId],
			candidateDigest: candidate.digest,
			acceptanceRequirementIds: semantic.acceptanceRequirements.map(
				(requirement) => requirement.id,
			),
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
		...(request.check.customCheck
			? {
					customCheckAssessment: {
						protocolId: "codewiki.custom-check-evaluator",
						protocolVersion: "1.0.0",
						evaluatorBindingDigest:
							request.check.customCheck.evaluatorBindingDigest,
						customCheckId: request.check.customCheck.customCheckId,
						definitionDigest: request.check.customCheck.definitionDigest,
						checkTypeId: request.check.customCheck.checkTypeId,
						checkTypeVersion: request.check.customCheck.checkTypeVersion,
						evaluatorId: request.check.customCheck.evaluatorId,
						prerequisiteResultDigests:
							request.check.customCheck.prerequisiteResults.map(
								(result) => result.resultDigest,
							),
						evidenceGaps: [],
						counterevidence: [],
						coverage: "complete",
						truncated: false,
						repair:
							conclusion === "supported"
								? null
								: {
										summary: "Add exact Evidence for unsupported requirement.",
										targetRefs: ["candidate:requirement"],
									},
					},
				}
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
				evaluator: "model",
				name: "Document API ownership",
				requirement: "Every changed public API names its owning team.",
				repairGuidance: "Add one accepted owning-team reference.",
				appliesWhen: {loops: ["decision"]},
				standardRefs: standardRefsFor(USER_STANDARD),
				knowledgeRefs: ["knowledge:api-ownership"],
			}, USER_STANDARDS),
			USER_STANDARDS,
		);
		const checkId = customCheckDefinitionCheckId(definition);
		const protectedBase = protectedConfig([definition]);
		const catalog = createCheckCatalog({
			userStandards: USER_STANDARDS,
			customChecks: [definition],
		});
		const revision = setup.candidate.content.revision;
		const resolved = resolveExitPolicy({
			loop: "decision",
			candidateDigest: setup.candidate.digest,
			changes: [
				{
					changeId: setup.subject.changeRefs[0].slice("change:".length),
					revision: revision.ordinal,
					digest: revision.revisionId,
					kind: revision.classification.kind,
					type: revision.classification.type,
					risk:
						revision.safety.risk === "low"
							? "low"
							: revision.safety.risk === "moderate"
								? "medium"
								: "high",
					affectedLayers: [...revision.classification.affectedLayers],
				},
			],
			projectTraits: [],
			technologies: [],
			paths: [...revision.classification.targetRefs],
			protectedBaseCustomCheckConfig: protectedBase,
		});
		const binding = /** @type {(typeof resolved.bindings)[number]} */ (
			resolved.bindings.find((entry) => entry.checkId === checkId)
		);
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
		assert.equal(requests[0].protocolVersion, "5.0.0");
		const evaluator = requests[0].check.customCheck;
		assert.equal(evaluator.protocolId, "codewiki.custom-check-evaluator");
		assert.equal(evaluator.protocolVersion, "1.0.0");
		assert.equal(evaluator.sessionIsolation, "fresh_no_shared_state");
		assert.equal(evaluator.customCheckId, definition.customCheckId);
		assert.equal(evaluator.definitionDigest, definition.definitionDigest);
		assert.equal(evaluator.candidateDigest, setup.candidate.digest);
		assert.equal(evaluator.checkId, checkId);
		assert.equal(evaluator.checkDigest, binding.checkDigest);
		assert.equal(evaluator.protectedSourceHead, protectedBase.protectedSourceHead);
		assert.equal(evaluator.protectedConfigDigest, protectedBase.projectConfigDigest);
		assert.equal(evaluator.customCheckConfigDigest, protectedBase.customCheckConfigDigest);
		assert.equal(evaluator.protectedConfigSnapshotDigest, protectedBase.snapshotDigest);
		assert.equal(evaluator.checkTypeId, "organization_policy");
		assert.equal(evaluator.checkTypeVersion, "1.0.0");
		assert.equal(evaluator.evaluatorId, "codewiki.check-evaluator.organization_policy");
		assert.deepEqual(JSON.parse(JSON.stringify(evaluator.standardBindings)), [{
			userStandardId: USER_STANDARD.userStandardId,
			standardDigest: USER_STANDARD.standardDigest,
			name: USER_STANDARD.name,
			source: {
				kind: USER_STANDARD.source.kind,
				mediaType: USER_STANDARD.source.mediaType,
				contentDigest: USER_STANDARD.source.contentDigest,
				observedAt: USER_STANDARD.source.observedAt,
			},
			passages: USER_STANDARD.passages,
		}]);
		assert.deepEqual(evaluator.knowledgeRefs, ["knowledge:api-ownership"]);
		assert.deepEqual(evaluator.consideredEvidenceIds, []);
		assert.deepEqual(evaluator.prerequisiteResults, []);
		assert.equal(evaluator.repairGuidance, "Add one accepted owning-team reference.");
		assert.match(evaluator.evaluatorBindingDigest, /^sha256:[0-9a-f]{64}$/u);
		const assessment = result.producedEvidenceRecords[0];
		assert.equal(assessment.payload.requestDigest, requests[0].requestDigest);
		assert.match(assessment.payload.assessmentDigest, /^sha256:[0-9a-f]{64}$/u);
		assert.equal(
			assessment.payload.customCheck.evaluatorBindingDigest,
			evaluator.evaluatorBindingDigest,
		);
		assert.deepEqual(assessment.payload.customCheck.standardDigests, [
			USER_STANDARD.standardDigest,
		]);
		assert.deepEqual(result.report.checkResults[0].evidenceRecordIds, [
			assessment.evidenceId,
		]);
		assert.equal(requests[0].review.mode, "balanced");

		for (const scenario of [
			"identity",
			"prerequisite",
			"repair",
			"missing_repair",
			"supported_partial",
		]) {
			const rejected = await createLoopExitRunner({
				catalog,
				executors: createDecisionModelCheckExecutors({
					catalog,
					route: route(),
					subject: setup.subject,
					transport: {
						async execute(request) {
							const output = response(
								request,
								scenario === "supported_partial" ? "supported" : "unsupported",
							);
							if (scenario === "identity") {
								output.customCheckAssessment.definitionDigest = digest("0");
							}
							if (scenario === "prerequisite") {
								output.customCheckAssessment.prerequisiteResultDigests = [
									digest("1"),
								];
							}
							if (scenario === "repair") {
								output.customCheckAssessment.repair.summary = "x".repeat(1_001);
							}
							if (scenario === "missing_repair") {
								output.customCheckAssessment.repair = null;
							}
							if (scenario === "supported_partial") {
								output.customCheckAssessment.coverage = "partial";
								output.customCheckAssessment.evidenceGaps = ["Missing owner mapping."];
							}
							return {
								status: "completed",
								observedAt: "2026-07-28T12:00:00.000Z",
								response: output,
							};
						},
					},
				}),
			}).run({candidate: setup.candidate, policy});
			assert.equal(rejected.report.checkResults[0].status, "indeterminate");
			assert.equal(rejected.report.checkResults[0].issueClass, "model_output");
			assert.deepEqual(rejected.producedEvidenceRecords, []);
		}

		let replayCalls = 0;
		const mismatchedReplay = await createLoopExitRunner({
			catalog,
			executors: createDecisionModelCheckExecutors({
				catalog,
				route: route({model: "different-model"}),
				subject: setup.subject,
				transport: {
					async execute(request) {
						replayCalls += 1;
						return {
							status: "completed",
							observedAt: "2026-07-28T12:00:00.000Z",
							response: response(request),
						};
					},
				},
			}),
		}).run({
			candidate: setup.candidate,
			policy,
			evidenceRecords: [assessment],
			evidenceResolutionsByCheck: {
				[checkId]: result.report.checkResults[0].evidenceResolutions,
			},
		});
		assert.equal(mismatchedReplay.report.checkResults[0].status, "indeterminate");
		assert.equal(mismatchedReplay.report.checkResults[0].issueClass, "model_evidence");
		assert.equal(replayCalls, 0);
	});

	it("runs classified security review as an asserted dependency-bound challenge", async () => {
		const setup = fixture({
			title: "How should authorization protect personal data?",
			currentState: "Authorization boundaries are implicit.",
			desiredState: "Explicit access control protects personal data.",
			rationale: "Prevent authorization bypass.",
			risk: "moderate",
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
		const runtime = createDecisionLoopExit({
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
		const staticAnalysisResult = result.result.report.checkResults.find(
			(check) => check.checkId === "static_analysis_findings_absent",
		);
		const authorizationResult = result.result.report.checkResults.find(
			(check) => check.checkId === "authorization_controls_verified",
		);
		assert.equal(staticAnalysisResult.status, "pass");
		assert.equal(authorizationResult.status, "pass");
		assert.equal(staticAnalysisResult.evidenceRecordIds.length, 2);
		assert.equal(authorizationResult.evidenceRecordIds.length, 2);
		assert.deepEqual(
			staticAnalysisResult.evidenceRecordIds.filter((evidenceId) =>
				authorizationResult.evidenceRecordIds.includes(evidenceId),
			),
			[],
		);
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
		const scannerBlocked = createDecisionLoopExit({
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
		assert.equal(
			scannerBlockedResult.result.report.checkResults.find(
				(check) => check.checkId === "static_analysis_findings_absent",
			).status,
			"fail",
		);
		assert.equal(
			scannerBlockedResult.result.report.checkResults.find(
				(check) => check.checkId === "authorization_controls_verified",
			).status,
			"pass",
		);
		assert.equal(blockedModelCheckIds.includes("security_privacy_reviewed"), true);
		assert.equal(scannerBlockedResult.securityFindingIntakeMaterials.length, 1);
		assert.equal(
			scannerBlockedResult.securityFindingIntakeMaterials[0].content.claimedSeverity,
			"critical",
		);

		const incompleteScannerConfiguration = securityScannerConfiguration();
		incompleteScannerConfiguration.adapters =
			incompleteScannerConfiguration.adapters.filter(
				(adapter) => adapter.scannerType !== "authorization_test",
			);
		const incompleteScannerRuntime = createDecisionLoopExit({
			securityScanners: incompleteScannerConfiguration,
			modelChecks: {
				route: route(),
				transport: {
					async execute(request) {
						return {
							status: "completed",
							observedAt: "2026-07-28T12:01:30.000Z",
							response: response(request),
						};
					},
				},
			},
		});
		const incompleteScannerResult = await incompleteScannerRuntime.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: [approval],
			securityScan: securityScanContext(),
		});
		assert.equal(
			incompleteScannerResult.result.report.checkResults.find(
				(check) => check.checkId === "static_analysis_findings_absent",
			).status,
			"pass",
		);
		assert.equal(
			incompleteScannerResult.result.report.checkResults.find(
				(check) => check.checkId === "authorization_controls_verified",
			).status,
			"indeterminate",
		);

		const challenged = createDecisionLoopExit({
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
		const runtime = createDecisionLoopExit({
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
		let modelCalls = 0;
		let collectionCalls = 0;
		let researchCalls = 0;
		let scannerCalls = 0;
		let researchConclusion = "supported";
		const runtime = createDecisionLoopExit({
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
				independentSecurity: {
					route: route({
						id: "independent-security",
						provider: "independent-provider",
						model: "independent-model",
					}),
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
			},
			researchChecks: {
				route: route({id: "decision-research"}),
				sensitivity: "project",
				collectEvidence: (request) =>
					collectDecisionResearchEvidence({
						...request,
						collector: {
							id: "bounded-research-fetch",
							version: "1.0.0",
							configurationDigest: digest("9"),
							async collect({request: collectionRequest}) {
								collectionCalls += 1;
								return {
									protocol: collectionRequest.protocol,
									requestDigest: collectionRequest.requestDigest,
									status: "available",
									citations: [
										{
											provenanceRefs: [
												"source:https://example.test/runtime",
											],
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
									],
								};
							},
						},
						observedAt: () => "2026-07-28T12:00:00.000Z",
					}),
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
		await assert.rejects(
			runtime.run({
				candidate: setup.candidate,
				changeRef: setup.subject.changeRefs[0],
				evidenceRecords: [approval],
				researchFreshnessBoundary: digest("9"),
				securityScan: securityScanContext(),
			}),
			/Runtime owns research freshness/,
		);
		const first = await runtime.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: [approval],
			securityScan: securityScanContext(),
		});
		assert.equal(first.result.report.status, "indeterminate");
		assert.equal(
			first.result.report.checkResults.find(
				(check) => check.checkId === "security_residual_risk_authorized",
			).status,
			"indeterminate",
		);
		assert.equal(collectionCalls, 1);
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
		const assessments = first.result.producedEvidenceRecords.filter(
			(record) =>
				record.kind === "model_assessment" &&
				[
					"security_privacy_reviewed",
					"security_independent_challenge_reviewed",
				].includes(record.payload.checkId),
		);
		const riskApprovalInput = {
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			actorId: "security-owner-1",
			authenticatedIdentityRef: "identity:test:security-owner-1",
			role: "security_owner",
			channel: "codewiki",
			decidedAt: "2026-07-28T12:02:00.000Z",
			observedAt: "2026-07-28T12:03:00.000Z",
			producer: {kind: "user", id: "security-owner-1", version: "1.0.0"},
			acceptedRisk: "high",
			priorApproval: approval,
			assessmentEvidenceRecords: assessments,
			rationaleDigest: digest("a"),
			findingDigests: [],
		};
		assert.throws(
			() =>
				materializeDecisionResidualRiskApprovalReceipt({
					...riskApprovalInput,
					authenticatedIdentityRef: approval.payload.authenticatedIdentityRef,
				}),
			/independently authenticated/,
		);
		const riskApproval =
			materializeDecisionResidualRiskApprovalReceipt(riskApprovalInput);
		assert.equal(
			materializeDecisionResidualRiskApprovalReceipt({
				...riskApprovalInput,
				assessmentEvidenceRecords: [...assessments].reverse(),
			}).evidenceId,
			riskApproval.evidenceId,
		);
		const authorizedEvidence = [
			approval,
			...first.collectedEvidenceRecords,
			...first.result.producedEvidenceRecords,
			riskApproval,
		];
		const authorized = await runtime.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: authorizedEvidence,
			securityScan: securityScanContext(),
		});
		assert.equal(authorized.result.report.status, "pass");
		assert.deepEqual(
			authorized.result.report.checkResults.find(
				(check) => check.checkId === "security_residual_risk_authorized",
			).evidenceRecordIds,
			[riskApproval.evidenceId],
		);
		const replay = await runtime.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: authorizedEvidence,
			securityScan: securityScanContext(),
		});
		assert.equal(
			replay.result.report.reportDigest,
			authorized.result.report.reportDigest,
		);
		assert.equal(researchCalls, 1);
		assert.equal(modelCalls > 0, true);
		assert.equal(scannerCalls, 1);
		assert.deepEqual(replay.result.producedEvidenceRecords, []);

		const changedEnvironment = await runtime.run({
			candidate: setup.candidate,
			changeRef: setup.subject.changeRefs[0],
			evidenceRecords: [
				approval,
				...first.collectedEvidenceRecords,
				...first.result.producedEvidenceRecords,
			],
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
			evidenceRecords: [approval],
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
				...uncertain.collectedEvidenceRecords,
				...uncertain.result.producedEvidenceRecords,
			],
			securityScan: securityScanContext(),
		});
		assert.equal(
			uncertainReplay.result.report.reportDigest,
			uncertain.result.report.reportDigest,
		);
		assert.equal(collectionCalls, 2);
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
				routeDecisionLoopExit(setup.candidate, result.report).route,
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
		assert.throws(
			() =>
				createDecisionLoopExit({
					modelChecks: {
						route: route(),
						transport: {execute: async () => ({status: "unavailable"})},
						independentSecurity: {
							route: route({id: "renamed-same-model"}),
							transport: {
								execute: async () => ({status: "unavailable"}),
							},
						},
					},
				}),
			/distinct model route and provider\/model identity/,
		);
	});
});
