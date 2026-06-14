import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runDecisionIteration } from "../../src/decision/iteration.ts";
import { createDecisionTable } from "../../src/decision/table.ts";
import { runImplementationIteration } from "../../src/implementation/iteration.ts";
import {
	createRuntimeClaimEvent,
	createRuntimeClaimReleaseEvent,
} from "../../src/runtime/claims.ts";
import {
	contentProofRefs,
	normalizeImplementationChanges,
} from "../../src/implementation/evidence.ts";
import { evaluateImplementationExit } from "../../src/implementation/exit.ts";
import { runPlanningIteration } from "../../src/planning/iteration.ts";
import { decisionQualityFields } from "../helpers/decision-row.mjs";
import { planningQualityFields } from "../helpers/planning-work.mjs";

function planningEvents() {
	const table = createDecisionTable({
		id: "DT-implementation",
		createdAt: "2026-06-11T00:00:00.000Z",
		updatedAt: "2026-06-11T00:00:00.000Z",
		rows: [
			{
				id: "DTR-001",
				question: "How should implementation evidence be represented?",
				currentState: "Implementation iteration files own evidence.",
				desiredState: "Implementation trace events own evidence refs.",
				rationale: "Matches traces-first model.",
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: ["kb:system/traces.md"],
			},
		],
	});
	const decisionTraceEvents = runDecisionIteration({
		traceId: "TRACE-implementation",
		table,
	}).traceEvents;
	const decisionRef = approvedDecisionRef(decisionTraceEvents);
	const plan = runPlanningIteration({
		traceId: "TRACE-implementation",
		decisionEvents: decisionTraceEvents,
		createdAt: "2026-06-11T00:00:00.000Z",
		workItemInputs: [
			{
				id: "WU-001",
				title: "Implement trace-backed evidence",
				decisionRefs: [decisionRef],
				outcome: "Implementation evidence emits trace events.",
				...planningQualityFields(),
				acceptance: ["Changed paths, checks, and proof refs are recorded."],
				componentRefs: ["component.implementation"],
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
	const iteration = events.find(
		(event) => event.event === "decision.iteration",
	);
	const row = iteration?.data?.output?.approvedRows?.[0];
	assert.ok(iteration);
	assert.ok(row);
	return `trace:${iteration.id}#row:${row.id}`;
}

function planningWorkEvent(events, workUnitId = "WU-001") {
	const iteration = events.find(
		(event) => event.event === "planning.iteration",
	);
	const item = iteration?.data?.output?.workItems?.find(
		(candidate) => candidate.id === workUnitId,
	);
	assert.ok(iteration);
	assert.ok(item);
	return {
		...iteration,
		id: `trace:${iteration.id}#work:${item.id}`,
		event: "planning.iteration",
		refs: [...(item.decisionRefs || []), ...(item.pathScopes || [])],
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
		sourceRefs: [".codewiki/kb/system/diagrams/file-structure-map.yaml"],
		components: [
			{
				id: "component.implementation",
				kbRefs: [".codewiki/kb/system/loop-contracts.md"],
				pathPatterns: ["src/implementation/**"],
				testPatterns: ["tests/implementation/**"],
			},
		],
	};
}

describe("implementation iteration runner", () => {
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
				},
			],
		});

		assert.equal(result.readyForClosure, true);
		assert.equal(result.exit.passed, true);
		assert.equal(result.exit.verdict, "pass");
		assert.equal(result.exit.route, "close");
		assert.deepEqual(result.exit.coveredPlanningRefs, [planningEvent.id]);
		assert.deepEqual(result.planningScopes[0].componentRefs, [
			"component.implementation",
		]);
		assert.equal(result.draftTraceEvents.length, 0);
		assert.equal(result.traceEvents.length, 1);
		assert.equal(result.traceEvents[0].event, "implementation.iteration");
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
		assert.equal(result.traceEvents[0].event, "implementation.iteration");
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
			],
		);
		assert.equal(exit.findings.length, 3);
		assert.deepEqual(contentProofRefs(change), []);
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
			},
			{
				id: "IC-dup",
				planningRefs: [planningEvent.id],
				codePaths: ["src/implementation/exit.ts"],
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
				codePaths: ["src/implementation/exit.ts"],
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
				codePaths: ["src/implementation/exit.ts"],
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
					codePaths: ["src/implementation/exit.ts"],
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
					codePaths: ["src/implementation/exit.ts"],
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

	it("aggregates completed worker results into implementation changes", () => {
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
			workerResults: [
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
									summary: "Worker result provides evidence.",
									evidenceRefs: [
										"tests/implementation/implementation-iteration.test.mjs",
									],
								},
							],
							contentProof: { workingTreeDigest: "sha256:abc123" },
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
			result.traceEvents[0].data?.output?.workerResults[0].workerId,
			"worker-1",
		);
		assert.equal(result.traceEvents[0].refs.includes("sha256:abcd1234"), true);
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
			workerResults: [
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
		assert.equal(result.traceEvents[0].event, "implementation.iteration");
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
			workerResults: [
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
		assert.equal(result.traceEvents[0].event, "implementation.iteration");
		assert.equal(result.traceEvents[0].data?.exit.status, "blocked");
		assert.equal(result.workerAggregation.blocked.length, 1);
	});

	it("rejects worker results without an active runtime claim", () => {
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
			workerResults: [
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
			workerResults: [
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
					codePaths: ["src/implementation/exit.ts"],
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
							evidenceRefs: [".codewiki/kb/system/loop-contracts.md"],
						},
					],
					contentProof: { workingTreeDigest: "sha256:def456" },
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
					planning_refs: [planningEvent.id],
					doc_paths: [".codewiki/kb/system/traces.md"],
					checks_run: ["npm test"],
					check_results: [{ command: "npm test", status: "pass" }],
					acceptance_evidence: ["Trace docs updated."],
					acceptance_evidence_items: [
						{
							criterion_id: "AC-001",
							summary: "Trace docs updated.",
							evidence_refs: [".codewiki/kb/system/traces.md"],
						},
					],
					content_proof: { commit: "abc123", tree: "def456" },
				},
			],
		});

		assert.equal(result.readyForClosure, true);
		assert.equal(result.traceEvents[0].refs.includes("abc123"), true);
		assert.equal(result.traceEvents[0].refs.includes("def456"), true);
	});
});
