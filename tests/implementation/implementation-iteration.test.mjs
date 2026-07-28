import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runDecisionIteration } from "../helpers/canonical-loop-events.mjs";
import { canonicalChangeInput } from "../helpers/canonical-loop-events.mjs";
import { runImplementationIteration } from "../../src/implementation/iteration.ts";
import {
	createRuntimeClaimEvent,
	createRuntimeClaimReleaseEvent,
} from "../../src/runtime/claims.ts";
import {
	contentProofRefs,
	normalizeImplementationChanges,
} from "../../src/implementation/evidence.ts";
import { evaluateImplementationExit } from "../../src/implementation/loop.ts";
import { runPlanningIteration } from "../helpers/canonical-loop-events.mjs";
import { decisionQualityFields } from "../helpers/proposed-change.mjs";
import { planningQualityFields } from "../helpers/planning-work.mjs";
import { implementationQualityFields } from "../helpers/implementation-change.mjs";

function planningEvents() {
	const changeInput = canonicalChangeInput({
		id: "SP-implementation",
		createdAt: "2026-06-11T00:00:00.000Z",
		updatedAt: "2026-06-11T00:00:00.000Z",
		changes: [
			{
				id: "CHG-001",
				question: "How should implementation evidence be represented?",
				currentState: "Implementation iteration files own evidence.",
				desiredState: "Implementation trace events own evidence refs.",
				rationale: "Matches traces-first model.",
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: ["kb:system/components/traces.md"],
			},
		],
	});
	const decisionTraceEvents = runDecisionIteration({
		traceId: "TRACE-implementation",
		changeInput,
	}).traceEvents;
	const changeRef = approvedDecisionRef(decisionTraceEvents);
	const plan = runPlanningIteration({
		traceId: "TRACE-implementation",
		decisionEvents: decisionTraceEvents,
		createdAt: "2026-06-11T00:00:00.000Z",
		workItemInputs: [
			{
				id: "WU-001",
				title: "Implement trace-backed evidence",
				changeRefs: [changeRef],
				outcome: "Implementation evidence emits trace events.",
				...planningQualityFields(),
				acceptance: ["Changed paths, checks, and proof refs are recorded."],
				componentRefs: ["implementation"],
				pathScopes: ["src/implementation"],
				verification: [
					"tests/implementation/implementation-iteration.test.mjs",
				],
			},
		],
	});
	return plan.traceEvents;
}

function approvedDecisionRef(events) {
	const iteration = events.find((event) => event.loop === "decision");
	const change = iteration?.data?.output?.changeRecord?.change;
	assert.ok(iteration);
	assert.ok(change);
	return `change:${change.id}`;
}

function planningWorkEvent(events, workUnitId = "WU-001") {
	const iteration = events.find((event) => event.loop === "planning");
	const item = iteration?.data?.output?.workItems?.find(
		(candidate) => candidate.id === workUnitId,
	);
	assert.ok(iteration);
	assert.ok(item);
	return {
		...iteration,
		id: `trace:${iteration.id}#work:${item.id}`,
		event: "work_units_created",
		refs: [...(item.changeRefs || []), ...(item.pathScopes || [])],
		data: item,
	};
}

function runtimeClaimEvent(planningEvent, overrides = {}) {
	return createRuntimeClaimEvent({
		traceId: planningEvent.traceId,
		id: `${planningEvent.traceId}:runtime:claim:${overrides.claimId || "claim-WU-001"}`,
		parentId: planningEvent.id,
		sequence: 10,
		createdAt: "2026-06-11T00:00:01.000Z",
		claimId: overrides.claimId || "claim-WU-001",
		workerId: overrides.workerId || "worker-1",
		workUnitId: overrides.workUnitId || "WU-001",
		planningRefs: overrides.planningRefs || [planningEvent.id],
		pathScopes: ["src/implementation"],
		...(overrides.expiresAt ? { expiresAt: overrides.expiresAt } : {}),
	});
}

function componentMap() {
	return {
		sourceRefs: [".codewiki/kb/system/components/source-map.md"],
		defaults: { inheritance: true, excluded: [] },
		components: [
			{
				id: "implementation",
				doc: ".codewiki/kb/system/components/implementation-loop.md",
				sourcePatterns: ["src/implementation/**"],
				testPatterns: ["tests/implementation/**"],
				generatedViews: [],
				traceEvents: ["evidence_accepted"],
			},
		],
	};
}

describe("implementation iteration runner", () => {
	it("rejects deprecated nested Implementation change aliases", () => {
		assert.throws(
			() =>
				normalizeImplementationChanges([
					{
						id: "IC-deprecated",
						planning_refs: ["trace:deprecated"],
					},
				]),
			/Implementation change input 0 received unsupported field planning_refs/,
		);
	});

	it("records implementation evidence as trace events", () => {
		const planning = planningEvents();
		const planningEvent = planningWorkEvent(planning);
		const result = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			componentMap: componentMap(),
			createdAt: "2026-06-11T00:00:00.000Z",
			changeInputs: [
				{
					id: "IC-001",
					planningRefs: [planningEvent.id],
					codePaths: ["src/implementation/iteration.ts"],
					testPaths: ["tests/implementation/implementation-iteration.test.mjs"],
					checks: ["npm test"],
					checkResults: [
						{
							command: "npm test",
							status: "pass",
							outputRef:
								"tests/implementation/implementation-iteration.test.mjs",
						},
					],
					acceptanceEvidence: ["Implementation iteration runner test passed."],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "Implementation iteration runner test passed.",
							evidenceRefs: [
								"tests/implementation/implementation-iteration.test.mjs",
							],
						},
					],
					contentProof: { workingTreeDigest: "sha256:abcdef" },
					...implementationQualityFields(),
				},
			],
		});

		assert.equal(result.readyForClosure, true);
		assert.equal(result.exit.passed, true);
		assert.equal(result.exit.verdict, "pass");
		assert.equal(result.exit.route, "close");
		assert.deepEqual(result.exit.coveredPlanningRefs, [planningEvent.id]);
		assert.deepEqual(result.planningScopes[0].componentRefs, [
			"implementation",
		]);
		assert.equal(result.draftTraceEvents.length, 0);
		assert.equal(result.traceEvents.length, 1);
		assert.equal(result.traceEvents[0].event, "evidence_accepted");
		assert.equal(result.traceEvents[0].data?.exit.status, "exit");
		assert.equal(result.traceEvents[0].data?.exit.targetLoop, null);
		assert.equal(result.checkpoint.type, "tail_checkpoint");
		assert.equal(result.traceRecords.at(-1)?.type, "tail_checkpoint");
		assert.equal(result.traceEvents[0].refs.includes("sha256:abcdef"), true);
		assert.equal(result.traceEvents[0].refs.includes("npm test"), false);
		assert.equal(
			result.traceEvents[0].refs.includes(
				"Implementation iteration runner test passed.",
			),
			false,
		);
		assert.deepEqual(
			result.traceEvents[0].data?.output?.qualityStandards?.map(
				(standard) => standard.id,
			),
			[
				"planning_coverage_complete",
				"scope_controlled",
				"acceptance_evidence_complete",
				"verification_passed",
				"tdd_evidence_valid",
				"content_proof_recorded",
				"worker_claims_correlated",
				"source_ownership_aligned",
				"production_quality_reviewed",
				"archive_disposition_ready",
				"implementation_review_evidence_clean",
				"evidence_matches_claims_judged",
				"checks_relevant_judged",
				"implementation_readiness_judged",
				"uncertainty_resolved",
				"security_privacy_reviewed",
				"accessibility_ui_reviewed",
				"dependency_risk_controlled",
				"release_safety_approved",
				"traceability_refs_canonical",
			],
		);
		assert.equal(
			result.exit.qualityStandards.every(
				(standard) => standard.status === "met",
			),
			true,
		);
	});

	it("enforces archive disposition when implementation policy requires cleanup", () => {
		const planning = planningEvents();
		const planningEvent = planningWorkEvent(planning);
		const changeInput = {
			id: "IC-archive",
			planningRefs: [planningEvent.id],
			codePaths: ["src/implementation/iteration.ts"],
			testPaths: ["tests/implementation/implementation-iteration.test.mjs"],
			checks: ["npm test"],
			checkResults: [
				{
					command: "npm test",
					status: "pass",
					outputRef: "tests/implementation/implementation-iteration.test.mjs",
				},
			],
			acceptanceEvidenceItems: [
				{
					criterionId: "AC-001",
					summary: "Archive disposition is enforced.",
					evidenceRefs: [
						"tests/implementation/implementation-iteration.test.mjs",
					],
				},
			],
			contentProof: { workingTreeDigest: "sha256:abcdef" },
			...implementationQualityFields(),
		};

		const missing = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			componentMap: componentMap(),
			requireArchiveDisposition: true,
			changeInputs: [changeInput],
		});
		assert.equal(missing.exit.passed, false);
		assert.equal(
			missing.exit.issues.some(
				(issue) => issue.code === "missing_archive_disposition",
			),
			true,
		);

		const planned = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			componentMap: componentMap(),
			requireArchiveDisposition: true,
			archiveDisposition: {
				action: "post_commit_compact",
				traceId: "TRACE-implementation",
				afterCommit: true,
				reason: "Implementation trace will compact after commit.",
				refs: ["trace:TRACE-implementation"],
			},
			changeInputs: [changeInput],
		});

		assert.equal(planned.exit.passed, true);
		assert.equal(planned.archiveDisposition?.action, "post_commit_compact");
		assert.equal(
			planned.traceEvents[0].data.output.archiveDisposition.reason,
			"Implementation trace will compact after commit.",
		);
	});

	it("blocks planning work without implementation coverage", () => {
		const planning = planningEvents();
		const result = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
		});

		assert.equal(result.readyForClosure, false);
		assert.equal(result.exit.verdict, "fail");
		assert.equal(result.exit.route, "implementation");
		assert.deepEqual(
			result.exit.issues.map((issue) => issue.code),
			["missing_planning_coverage", "missing_acceptance_criterion_coverage"],
		);
		assert.equal(result.traceEvents.length, 1);
		assert.equal(result.traceEvents[0].event, "evidence_rejected");
		assert.equal(result.traceEvents[0].data?.exit.status, "continue");
	});

	it("requires changed paths, checks, acceptance evidence, and content proof", () => {
		const planningEvent = planningWorkEvent(planningEvents());
		const [change] = normalizeImplementationChanges([
			{
				id: "IC-001",
				planningRefs: [planningEvent.id],
				codePaths: ["src/implementation/iteration.ts"],
				checks: ["npm test"],
			},
		]);
		const exit = evaluateImplementationExit({
			planningRefs: [planningEvent.id],
			changes: [change],
		});

		assert.equal(exit.passed, false);
		assert.equal(exit.verdict, "fail");
		assert.deepEqual(
			exit.issues.map((issue) => issue.code),
			[
				"missing_check_results",
				"missing_acceptance_evidence",
				"missing_content_proof",
				"missing_implementation_assessment",
				"missing_implementation_uncertainty_resolution",
			],
		);
		assert.equal(exit.findings.length, 5);
		assert.deepEqual(contentProofRefs(change), []);
	});

	it("routes unresolved implementation user uncertainty to decision authority", () => {
		const planningEvent = planningWorkEvent(planningEvents());
		const changes = normalizeImplementationChanges([
			{
				id: "IC-uncertain",
				planningRefs: [planningEvent.id],
				codePaths: ["src/implementation/loop.ts"],
				checkResults: [{ command: "npm test", status: "pass" }],
				acceptanceEvidenceItems: [
					{
						criterionId: "AC-001",
						summary: "Evidence exists.",
						evidenceRefs: [
							"tests/implementation/implementation-iteration.test.mjs",
						],
					},
				],
				contentProof: { workingTreeDigest: "sha256:abc123" },
				...implementationQualityFields({
					implementationAssessment: {
						stance: "concerns",
						maintainability: "Change is local.",
						simplicity: "Change is simple.",
						projectStyle: "Style matches.",
						errorHandling: "Error handling is acceptable.",
						uncertainties: ["User-facing behavior needs clarification."],
						uncertaintyOwner: "user",
						uncertaintyResolution:
							"Block for user clarification before closure.",
						rationale:
							"Project should not ship unresolved user-facing ambiguity.",
					},
				}),
			},
		]);
		const exit = evaluateImplementationExit({
			planningRefs: [planningEvent.id],
			changes,
		});

		assert.equal(exit.passed, false);
		assert.equal(exit.verdict, "fail");
		assert.equal(exit.route, "decision");
		const standards = Object.fromEntries(
			exit.qualityStandards.map((standard) => [standard.id, standard]),
		);
		assert.equal(standards.production_quality_reviewed.status, "unmet");
		assert.equal(standards.uncertainty_resolved.status, "unmet");
	});

	it("routes release/publication without user approval to decision", () => {
		const planningEvent = planningWorkEvent(planningEvents());
		const changes = normalizeImplementationChanges([
			{
				id: "IC-release",
				planningRefs: [planningEvent.id],
				docPaths: ["README.md"],
				checkResults: [{ command: "npm test", status: "pass" }],
				acceptanceEvidenceItems: [
					{
						criterionId: "AC-001",
						summary: "Release notes updated.",
						evidenceRefs: ["README.md"],
					},
				],
				contentProof: { workingTreeDigest: "sha256:abc123" },
				publicationRefs: ["git:release/v1"],
				...implementationQualityFields(),
			},
		]);
		const exit = evaluateImplementationExit({
			planningRefs: [planningEvent.id],
			changes,
		});

		assert.equal(exit.passed, false);
		assert.equal(exit.verdict, "fail");
		assert.equal(exit.route, "decision");
		assert.equal(
			exit.issues.some((issue) => issue.code === "missing_release_approval"),
			true,
		);
		assert.equal(
			exit.remediation.find((item) => item.action.includes("approval"))?.route,
			"decision",
		);
	});

	it("requires implementation evidence to cover planned verification", () => {
		const planning = planningEvents();
		const planningEvent = planningWorkEvent(planning);
		const result = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			changeInputs: [
				{
					id: "IC-missing-planned-verification",
					planningRefs: [planningEvent.id],
					codePaths: ["src/implementation/loop.ts"],
					checkResults: [{ command: "npm run typecheck", status: "pass" }],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary:
								"Implementation evidence exists but omits planned verification.",
							evidenceRefs: ["src/implementation/loop.ts"],
						},
					],
					contentProof: { workingTreeDigest: "sha256:abc123" },
					...implementationQualityFields(),
				},
			],
		});

		assert.equal(result.readyForClosure, false);
		assert.equal(
			result.exit.issues.some(
				(issue) => issue.code === "missing_planned_verification",
			),
			true,
		);
		assert.equal(
			result.exit.qualityStandards.find(
				(standard) => standard.id === "verification_passed",
			)?.status,
			"unmet",
		);
	});

	it("requires package pack verification for package changes", () => {
		const planningEvent = planningWorkEvent(planningEvents());
		const baseChange = {
			id: "IC-package",
			planningRefs: [planningEvent.id],
			codePaths: ["package.json"],
			checkResults: [{ command: "npm test", status: "pass" }],
			acceptanceEvidenceItems: [
				{
					criterionId: "AC-001",
					summary: "Package metadata updated.",
					evidenceRefs: ["package.json"],
				},
			],
			contentProof: { workingTreeDigest: "sha256:abc123" },
			...implementationQualityFields(),
		};
		const [missingPack] = normalizeImplementationChanges([baseChange]);
		const missingExit = evaluateImplementationExit({
			planningRefs: [planningEvent.id],
			changes: [missingPack],
		});

		assert.equal(missingExit.passed, false);
		assert.equal(
			missingExit.issues.some(
				(issue) => issue.code === "missing_package_pack_check",
			),
			true,
		);
		assert.equal(
			missingExit.qualityStandards.find(
				(standard) => standard.id === "verification_passed",
			)?.status,
			"unmet",
		);

		const [withPack] = normalizeImplementationChanges([
			{
				...baseChange,
				checkResults: [
					{ command: "npm test", status: "pass" },
					{ command: "npm run test:pack", status: "pass" },
				],
			},
		]);
		const passingExit = evaluateImplementationExit({
			planningRefs: [planningEvent.id],
			changes: [withPack],
		});

		assert.equal(passingExit.passed, true);
	});

	it("blocks duplicate implementation change ids", () => {
		const planningEvent = planningWorkEvent(planningEvents());
		const changes = normalizeImplementationChanges([
			{
				id: "IC-dup",
				planningRefs: [planningEvent.id],
				codePaths: ["src/implementation/iteration.ts"],
				checks: ["npm test"],
				checkResults: [{ command: "npm test", status: "pass" }],
				acceptanceEvidence: ["Evidence"],
				acceptanceEvidenceItems: [
					{
						criterionId: "AC-001",
						summary: "Evidence",
						evidenceRefs: [
							"tests/implementation/implementation-iteration.test.mjs",
						],
					},
				],
				contentProof: { workingTreeDigest: "sha256:a" },
				...implementationQualityFields(),
			},
			{
				id: "IC-dup",
				planningRefs: [planningEvent.id],
				codePaths: ["src/implementation/loop.ts"],
				checks: ["npm test"],
				checkResults: [{ command: "npm test", status: "pass" }],
				acceptanceEvidence: ["Evidence"],
				acceptanceEvidenceItems: [
					{
						criterionId: "AC-001",
						summary: "Evidence",
						evidenceRefs: [
							"tests/implementation/implementation-iteration.test.mjs",
						],
					},
				],
				contentProof: { workingTreeDigest: "sha256:b" },
				...implementationQualityFields(),
			},
		]);
		const exit = evaluateImplementationExit({
			planningRefs: [planningEvent.id],
			changes,
		});

		assert.equal(exit.passed, false);
		assert.equal(exit.issues[0].code, "duplicate_change_id");
	});

	it("blocks failed checks and incomplete acceptance evidence", () => {
		const planningEvent = planningWorkEvent(planningEvents());
		const changes = normalizeImplementationChanges([
			{
				id: "IC-proof",
				planningRefs: [planningEvent.id],
				codePaths: ["src/implementation/loop.ts"],
				checkResults: [
					{
						command: "npm test",
						status: "fail",
						outputRef: "tests/implementation/implementation-iteration.test.mjs",
					},
				],
				acceptanceEvidenceItems: [
					{
						criterionId: "AC-001",
						summary: "",
						evidenceRefs: [],
					},
				],
				contentProof: { workingTreeDigest: "sha256:abc123" },
				...implementationQualityFields(),
			},
		]);
		const exit = evaluateImplementationExit({
			planningRefs: [planningEvent.id],
			changes,
		});

		assert.equal(exit.passed, false);
		assert.deepEqual(
			exit.issues.map((issue) => issue.code),
			["failed_check", "invalid_acceptance_evidence"],
		);
	});

	it("blocks unknown acceptance criterion ids", () => {
		const planningEvent = planningWorkEvent(planningEvents());
		const changes = normalizeImplementationChanges([
			{
				id: "IC-unknown-criterion",
				planningRefs: [planningEvent.id],
				codePaths: ["src/implementation/loop.ts"],
				checkResults: [{ command: "npm test", status: "pass" }],
				acceptanceEvidenceItems: [
					{
						criterionId: "AC-999",
						summary: "Unknown criterion evidence.",
						evidenceRefs: [
							"tests/implementation/implementation-iteration.test.mjs",
						],
					},
				],
				contentProof: { workingTreeDigest: "sha256:abc123" },
				...implementationQualityFields(),
			},
		]);
		const exit = evaluateImplementationExit({
			planningRefs: [planningEvent.id],
			acceptanceRequirements: [
				{
					planningRef: planningEvent.id,
					criterionId: "AC-001",
					text: "Changed paths, checks, and proof refs are recorded.",
				},
			],
			changes,
		});

		assert.equal(exit.passed, false);
		assert.deepEqual(exit.issues.map((issue) => issue.code).sort(), [
			"missing_acceptance_criterion_coverage",
			"unknown_acceptance_criterion",
		]);
	});

	it("accepts AC-mapped red-green TDD evidence when required", () => {
		const planning = planningEvents();
		const planningEvent = planningWorkEvent(planning);
		const result = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			requireTddEvidence: true,
			changeInputs: [
				{
					id: "IC-tdd",
					planningRefs: [planningEvent.id],
					codePaths: ["src/implementation/loop.ts"],
					testPaths: ["tests/implementation/implementation-iteration.test.mjs"],
					checkResults: [
						{
							command:
								"node --test tests/implementation/implementation-iteration.test.mjs",
							status: "fail",
							phase: "red",
							criterionId: "AC-001",
							outputRef:
								"tests/implementation/implementation-iteration.test.mjs",
						},
						{
							command:
								"node --test tests/implementation/implementation-iteration.test.mjs",
							status: "pass",
							tddPhase: "green",
							criterion_id: "AC-001",
							outputRef:
								"tests/implementation/implementation-iteration.test.mjs",
						},
					],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "Red then green checks prove criterion coverage.",
							evidenceRefs: [
								"tests/implementation/implementation-iteration.test.mjs",
							],
						},
					],
					contentProof: { workingTreeDigest: "sha256:abc123" },
					...implementationQualityFields(),
				},
			],
		});

		assert.equal(result.exit.passed, true);
		assert.equal(result.changes[0].checkResults[0].phase, "red");
		assert.equal(result.changes[0].checkResults[1].phase, "green");
		assert.equal(
			result.traceEvents[0].data?.output?.changes?.[0]?.checkResults[0].phase,
			"red",
		);
	});

	it("blocks missing or invalid red-green TDD evidence when required", () => {
		const planning = planningEvents();
		const planningEvent = planningWorkEvent(planning);
		const result = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			requireTddEvidence: true,
			changeInputs: [
				{
					id: "IC-missing-tdd",
					planningRefs: [planningEvent.id],
					codePaths: ["src/implementation/loop.ts"],
					checkResults: [
						{
							command: "npm test",
							status: "pass",
							phase: "red",
							criterionId: "AC-001",
						},
						{
							command: "npm test",
							status: "pass",
							phase: "green",
							criterionId: "AC-001",
						},
					],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "Green check exists but red did not fail.",
							evidenceRefs: [
								"tests/implementation/implementation-iteration.test.mjs",
							],
						},
					],
					contentProof: { workingTreeDigest: "sha256:abc123" },
					...implementationQualityFields(),
				},
			],
		});

		assert.equal(result.exit.passed, false);
		assert.equal(
			result.exit.issues.some((issue) => issue.code === "invalid_tdd_evidence"),
			true,
		);
		assert.equal(
			result.exit.issues.some(
				(issue) => issue.code === "missing_tdd_red_evidence",
			),
			true,
		);
	});

	it("aggregates completed worker reports into implementation changes", () => {
		const planning = planningEvents();
		const planningEvent = planningWorkEvent(planning);
		const claim = runtimeClaimEvent(planningEvent, {
			claimId: "claim-WU-001",
			workerId: "worker-1",
		});
		const result = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			claimEvents: [claim],
			aggregateContentProof: { workingTreeDigest: "sha256:abcd1234" },
			workerReports: [
				{
					workerId: "worker-1",
					workUnitId: "WU-001",
					claimId: "claim-WU-001",
					planningRefs: [planningEvent.id],
					sessionId: "pi-session-1",
					changeInputs: [
						{
							id: "IC-worker",
							codePaths: ["src/implementation/workers.ts"],
							testPaths: [
								"tests/implementation/implementation-iteration.test.mjs",
							],
							checkResults: [{ command: "npm test", status: "pass" }],
							acceptanceEvidenceItems: [
								{
									criterionId: "AC-001",
									summary: "Worker report provides evidence.",
									evidenceRefs: [
										"tests/implementation/implementation-iteration.test.mjs",
									],
								},
							],
							contentProof: { workingTreeDigest: "sha256:abc123" },
							...implementationQualityFields(),
						},
					],
				},
			],
		});

		assert.equal(result.exit.passed, true);
		assert.equal(result.workerAggregation.completed.length, 1);
		assert.equal(result.changes[0].workerId, "worker-1");
		assert.equal(result.changes[0].workUnitId, "WU-001");
		assert.equal(result.changes[0].claimId, "claim-WU-001");
		assert.equal(result.changes[0].sessionId, "pi-session-1");
		assert.deepEqual(result.changes[0].planningRefs, [planningEvent.id]);
		assert.deepEqual(result.aggregateContentProof, {
			workingTreeDigest: "sha256:abcd1234",
		});
		assert.equal(result.workerClaims[0].status, "active");
		assert.equal(
			result.traceEvents[0].data?.output?.aggregateContentProof
				.workingTreeDigest,
			"sha256:abcd1234",
		);
		assert.equal(
			result.traceEvents[0].data?.output?.changes?.[0]?.workerId,
			"worker-1",
		);
		assert.equal(
			result.traceEvents[0].data?.output?.changes?.[0]?.claimId,
			"claim-WU-001",
		);
		assert.equal(
			result.traceEvents[0].data?.output?.workerReports[0].workerId,
			"worker-1",
		);
		assert.match(
			result.workerAggregation.workerProofs[0].digest,
			/^sha256:[a-f0-9]{64}$/,
		);
		assert.equal(
			result.traceEvents[0].data?.output?.workerProofs[0].workerId,
			"worker-1",
		);
		assert.equal(result.traceEvents[0].refs.includes("sha256:abcd1234"), true);
	});

	it("fills worker change content proof from normalized worker proof", () => {
		const planning = planningEvents();
		const planningEvent = planningWorkEvent(planning);
		const claim = runtimeClaimEvent(planningEvent, {
			claimId: "claim-proof-fill",
			workerId: "worker-proof-fill",
		});
		const result = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			claimEvents: [claim],
			aggregateContentProof: { workingTreeDigest: "sha256:abcdef" },
			workerReports: [
				{
					workerId: "worker-proof-fill",
					workUnitId: "WU-001",
					claimId: "claim-proof-fill",
					planningRefs: [planningEvent.id],
					headSha: "abc1234",
					treeSha: "def5678",
					changedFiles: ["src/implementation/workers.ts"],
					checksRun: ["npm test"],
					changeInputs: [
						{
							id: "IC-worker-proof-fill",
							testPaths: [
								"tests/implementation/implementation-iteration.test.mjs",
							],
							checkResults: [{ command: "npm test", status: "pass" }],
							acceptanceEvidenceItems: [
								{
									criterionId: "AC-001",
									summary: "Worker proof supplies content proof.",
									evidenceRefs: [
										"tests/implementation/implementation-iteration.test.mjs",
									],
								},
							],
							...implementationQualityFields(),
						},
					],
				},
			],
		});

		assert.equal(result.exit.passed, true);
		assert.deepEqual(result.changes[0].codePaths, [
			"src/implementation/workers.ts",
		]);
		assert.deepEqual(result.changes[0].contentProof, {
			commit: "abc1234",
			tree: "def5678",
		});
		assert.equal(result.workerAggregation.workerProofs[0].headSha, "abc1234");
	});

	it("blocks overlapping worker proof conflicts before aggregate closure", () => {
		const planningEvent = planningWorkEvent(planningEvents());
		const result = evaluateImplementationExit({
			planningRefs: [
				"trace:TRACE-implementation:planning:iteration:1#work:WU-a",
				"trace:TRACE-implementation:planning:iteration:1#work:WU-b",
			],
			aggregateContentProof: { workingTreeDigest: "sha256:abcdef" },
			changes: normalizeImplementationChanges([
				{
					id: "IC-worker-a",
					planningRefs: [
						"trace:TRACE-implementation:planning:iteration:1#work:WU-a",
					],
					codePaths: ["src/implementation/workers.ts"],
					checkResults: [{ command: "npm test", status: "pass" }],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "Worker A evidence.",
							evidenceRefs: [
								"tests/implementation/implementation-iteration.test.mjs",
							],
						},
					],
					contentProof: { workingTreeDigest: "sha256:aaa111" },
					...implementationQualityFields(),
				},
				{
					id: "IC-worker-b",
					planningRefs: [
						"trace:TRACE-implementation:planning:iteration:1#work:WU-b",
					],
					codePaths: ["src/implementation/workers.ts"],
					checkResults: [{ command: "npm test", status: "pass" }],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "Worker B evidence.",
							evidenceRefs: [
								"tests/implementation/implementation-iteration.test.mjs",
							],
						},
					],
					contentProof: { workingTreeDigest: "sha256:bbb222" },
					...implementationQualityFields(),
				},
			]),
			workerProofs: [
				{
					workerId: "worker-a",
					workUnitId: "WU-a",
					planningRefs: [planningEvent.id],
					changedPaths: ["src/implementation/workers.ts"],
					checks: ["npm test"],
					validationVerdict: "pass",
					clean: true,
					digest: "sha256:aaaa",
				},
				{
					workerId: "worker-b",
					workUnitId: "WU-b",
					planningRefs: [planningEvent.id],
					changedPaths: ["src/implementation/workers.ts"],
					checks: ["npm test"],
					validationVerdict: "pass",
					clean: true,
					digest: "sha256:bbbb",
				},
			],
		});

		assert.equal(result.passed, false);
		assert.deepEqual(
			result.issues.map((issue) => issue.code),
			["worker_proof_conflict"],
		);
	});

	it("requires final aggregate proof for worker-produced evidence", () => {
		const planning = planningEvents();
		const planningEvent = planningWorkEvent(planning);
		const claim = runtimeClaimEvent(planningEvent, {
			claimId: "claim-needs-merge-proof",
			workerId: "worker-merge-proof",
		});
		const result = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			claimEvents: [claim],
			workerReports: [
				{
					workerId: "worker-merge-proof",
					workUnitId: "WU-001",
					claimId: "claim-needs-merge-proof",
					planningRefs: [planningEvent.id],
					changeInputs: [
						{
							id: "IC-worker-local-proof-only",
							codePaths: ["src/implementation/iteration.ts"],
							checkResults: [{ command: "npm test", status: "pass" }],
							acceptanceEvidenceItems: [
								{
									criterionId: "AC-001",
									summary: "Worker local proof exists only.",
									evidenceRefs: [
										"tests/implementation/implementation-iteration.test.mjs",
									],
								},
							],
							contentProof: { workingTreeDigest: "sha256:workerlocal" },
							...implementationQualityFields(),
						},
					],
				},
			],
		});

		assert.equal(result.exit.passed, false);
		assert.equal(
			result.exit.issues.some(
				(issue) => issue.code === "missing_aggregate_content_proof",
			),
			true,
		);
		assert.equal(result.traceEvents[0].event, "evidence_rejected");
		assert.equal(result.traceEvents[0].data?.exit.status, "continue");
	});

	it("blocks aggregate closure when a worker reports blocked work", () => {
		const planning = planningEvents();
		const planningEvent = planningWorkEvent(planning);
		const claim = runtimeClaimEvent(planningEvent, {
			claimId: "claim-blocked",
			workerId: "worker-blocked",
		});
		const result = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			claimEvents: [claim],
			workerReports: [
				{
					workerId: "worker-blocked",
					workUnitId: "WU-001",
					claimId: "claim-blocked",
					planningRefs: [planningEvent.id],
					status: "blocked",
					message: "Needs product decision before code can continue.",
					refs: [planningEvent.id],
				},
			],
		});

		assert.equal(result.exit.passed, false);
		assert.equal(result.exit.verdict, "block");
		assert.equal(
			result.exit.issues.some((issue) => issue.code === "worker_blocked"),
			true,
		);
		assert.equal(result.traceEvents[0].event, "implementation_blocked");
		assert.equal(result.traceEvents[0].data?.exit.status, "blocked");
		assert.equal(result.workerAggregation.blocked.length, 1);
	});

	it("rejects worker reports without an active runtime claim", () => {
		const planning = planningEvents();
		const planningEvent = planningWorkEvent(planning);
		const claim = runtimeClaimEvent(planningEvent, {
			claimId: "claim-released",
			workerId: "worker-released",
		});
		const release = createRuntimeClaimReleaseEvent({
			traceId: planningEvent.traceId,
			id: "TRACE-implementation:runtime:release:claim-released",
			parentId: claim.id,
			sequence: 11,
			createdAt: "2026-06-11T00:00:02.000Z",
			claimId: "claim-released",
			workerId: "worker-released",
			workUnitId: "WU-001",
			planningRefs: [planningEvent.id],
			pathScopes: ["src/implementation"],
		});
		const result = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			claimEvents: [claim, release],
			workerReports: [
				{
					workerId: "worker-released",
					workUnitId: "WU-001",
					claimId: "claim-released",
					planningRefs: [planningEvent.id],
					changeInputs: [
						{
							id: "IC-released-claim",
							codePaths: ["src/implementation/workers.ts"],
							checkResults: [{ command: "npm test", status: "pass" }],
							acceptanceEvidenceItems: [
								{
									criterionId: "AC-001",
									summary: "Evidence arrived after claim release.",
									evidenceRefs: [
										"tests/implementation/implementation-iteration.test.mjs",
									],
								},
							],
							contentProof: { workingTreeDigest: "sha256:abc123" },
							...implementationQualityFields(),
						},
					],
				},
			],
		});

		assert.equal(result.exit.passed, false);
		assert.equal(
			result.exit.issues.some(
				(issue) => issue.code === "inactive_worker_claim",
			),
			true,
		);
		assert.equal(result.workerClaims[0].status, "released");

		const unknown = evaluateImplementationExit({
			planningRefs: [planningEvent.id],
			changes: [],
			workerReports: [
				{
					workerId: "worker-unknown",
					workUnitId: "WU-001",
					claimId: "claim-missing",
					planningRefs: [planningEvent.id],
					status: "completed",
					refs: [],
				},
			],
		});
		assert.equal(
			unknown.issues.some((issue) => issue.code === "unknown_worker_claim"),
			true,
		);
	});

	it("blocks implementation drift outside declared components", () => {
		const planning = planningEvents();
		const planningEvent = planningWorkEvent(planning);
		const result = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			componentMap: componentMap(),
			changeInputs: [
				{
					id: "IC-component-drift",
					planningRefs: [planningEvent.id],
					codePaths: ["src/views/work-plan.ts"],
					checkResults: [
						{
							command: "npm test",
							status: "pass",
							outputRef:
								"tests/implementation/implementation-iteration.test.mjs",
						},
					],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "Evidence exists.",
							evidenceRefs: [
								"tests/implementation/implementation-iteration.test.mjs",
							],
						},
					],
					contentProof: { workingTreeDigest: "sha256:abc123" },
					...implementationQualityFields(),
				},
			],
		});

		assert.equal(result.exit.passed, false);
		assert.equal(
			result.exit.issues.some(
				(issue) => issue.code === "path_outside_component_scope",
			),
			true,
		);
	});

	it("blocks component code changes without matching test evidence", () => {
		const planning = planningEvents();
		const planningEvent = planningWorkEvent(planning);
		const result = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			componentMap: componentMap(),
			changeInputs: [
				{
					id: "IC-missing-component-tests",
					planningRefs: [planningEvent.id],
					codePaths: ["src/implementation/loop.ts"],
					checkResults: [
						{
							command: "npm test",
							status: "pass",
							outputRef: "sha256:abc123",
						},
					],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "Evidence exists but is not a component test ref.",
							evidenceRefs: [
								".codewiki/kb/system/components/loop-contracts.md",
							],
						},
					],
					contentProof: { workingTreeDigest: "sha256:def456" },
					...implementationQualityFields(),
				},
			],
		});

		assert.equal(result.exit.passed, false);
		assert.equal(
			result.exit.issues.some(
				(issue) => issue.code === "missing_component_test_coverage",
			),
			true,
		);
	});

	it("blocks changed and evidence paths absent from repo snapshot", () => {
		const planning = planningEvents();
		const planningEvent = planningWorkEvent(planning);
		const result = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			existingPaths: ["tests/implementation/implementation-iteration.test.mjs"],
			changeInputs: [
				{
					id: "IC-missing-paths",
					planningRefs: [planningEvent.id],
					codePaths: ["src/implementation/missing.ts"],
					checkResults: [
						{
							command: "npm test",
							status: "pass",
							outputRef: "tests/implementation/missing.test.mjs",
						},
					],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "Evidence path is missing from snapshot.",
							evidenceRefs: [
								"tests/implementation/implementation-iteration.test.mjs",
							],
						},
					],
					contentProof: { workingTreeDigest: "sha256:abcdef" },
					...implementationQualityFields(),
				},
			],
		});

		assert.equal(result.exit.passed, false);
		assert.equal(
			result.exit.issues.some((issue) => issue.code === "missing_changed_path"),
			true,
		);
		assert.equal(
			result.exit.issues.some(
				(issue) => issue.code === "missing_evidence_path",
			),
			true,
		);
	});

	it("blocks non-canonical implementation refs", () => {
		const planningEvent = planningWorkEvent(planningEvents());
		const changes = normalizeImplementationChanges([
			{
				id: "IC-ref",
				planningRefs: [planningEvent.id],
				codePaths: ["weak/path"],
				checks: ["npm test"],
				checkResults: [{ command: "npm test", status: "pass" }],
				acceptanceEvidence: ["Evidence"],
				acceptanceEvidenceItems: [
					{
						criterionId: "AC-001",
						summary: "Evidence",
						evidenceRefs: [
							"tests/implementation/implementation-iteration.test.mjs",
						],
					},
				],
				contentProof: { workingTreeDigest: "sha256:abc123" },
				...implementationQualityFields(),
			},
		]);
		const exit = evaluateImplementationExit({
			planningRefs: [planningEvent.id],
			changes,
		});

		assert.equal(exit.passed, false);
		assert.equal(
			exit.issues.some((issue) => issue.code === "invalid_traceability_ref"),
			true,
		);
	});

	it("accepts documentation-only changes when proof and checks exist", () => {
		const planning = planningEvents();
		const planningEvent = planningWorkEvent(planning);
		const result = runImplementationIteration({
			traceId: "TRACE-implementation",
			planningEvents: planning,
			changeInputs: [
				{
					id: "IC-docs",
					planningRefs: [planningEvent.id],
					docPaths: [".codewiki/kb/system/components/traces.md"],
					checks: ["npm test"],
					checkResults: [{ command: "npm test", status: "pass" }],
					acceptanceEvidence: ["Trace docs updated."],
					acceptanceEvidenceItems: [
						{
							criterion_id: "AC-001",
							summary: "Trace docs updated.",
							evidence_refs: [".codewiki/kb/system/components/traces.md"],
						},
					],
					contentProof: { commit: "abc123", tree: "def456" },
					...implementationQualityFields(),
				},
			],
		});

		assert.equal(result.readyForClosure, true);
		assert.equal(result.traceEvents[0].refs.includes("abc123"), true);
		assert.equal(result.traceEvents[0].refs.includes("def456"), true);
	});
});
