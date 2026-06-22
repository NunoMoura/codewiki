#!/usr/bin/env node
import { createDecisionTable } from "../src/decision/table.ts";
import { evaluateDecisionExit } from "../src/decision/exit.ts";
import { evaluatePlanningExit } from "../src/planning/exit.ts";
import { evaluateImplementationExit } from "../src/implementation/exit.ts";

const LOOP_ORDER = ["decision", "planning", "implementation"];

export function scoreLoopExits() {
	const cases = [
		...decisionCases(),
		...planningCases(),
		...implementationCases(),
	];
	const results = cases.map(runCase);
	const byLoop = Object.fromEntries(
		LOOP_ORDER.map((loop) => [loop, summarizeLoop(loop, results)]),
	);
	const gaps = results.filter((result) => result.status === "gap");
	const regressions = results.filter((result) => result.status === "regression");
	return {
		schemaVersion: 1,
		caseCount: results.length,
		status: gaps.length === 0 && regressions.length === 0 ? "pass" : "fail",
		loops: byLoop,
		results,
		gaps: gaps.map(gapSummary),
		regressions: regressions.map(gapSummary),
		gate: {
			status: gaps.length === 0 && regressions.length === 0 ? "pass" : "fail",
			openGaps: gaps.length,
			regressions: regressions.length,
			blockers: [
				...gaps.map(
					(result) =>
						`${result.loop}/${result.id}: desired ${result.desiredVerdict}, observed ${result.observedVerdict}`,
				),
				...regressions.map(
					(result) =>
						`${result.loop}/${result.id}: regression observed ${result.observedVerdict}, desired ${result.desiredVerdict}`,
				),
			],
		},
	};
}

function runCase(testCase) {
	const exit = testCase.run();
	const observedVerdict = exit.verdict;
	const desiredVerdict = testCase.desiredVerdict;
	const status = resultStatus({ observedVerdict, desiredVerdict });
	return {
		id: testCase.id,
		loop: testCase.loop,
		description: testCase.description,
		desiredVerdict,
		observedVerdict,
		status,
		gap: status === "gap" ? testCase.gap : undefined,
		issueCodes: (exit.issues || []).map((issue) => issue.code),
		qualityStandards: (exit.qualityStandards || []).map((standard) => ({
			id: standard.id,
			mode: standard.mode,
			status: standard.status,
		})),
		modeCounts: modeCounts(exit.qualityStandards || []),
	};
}

function resultStatus({ observedVerdict, desiredVerdict }) {
	if (observedVerdict === desiredVerdict) return "pass";
	if (observedVerdict === "pass" && desiredVerdict !== "pass") return "gap";
	return "regression";
}

function summarizeLoop(loop, results) {
	const loopResults = results.filter((result) => result.loop === loop);
	return {
		cases: loopResults.length,
		passed: loopResults.filter((result) => result.status === "pass").length,
		gaps: loopResults.filter((result) => result.status === "gap").length,
		regressions: loopResults.filter((result) => result.status === "regression")
			.length,
		modeCounts: sumModeCounts(loopResults.map((result) => result.modeCounts)),
	};
}

function gapSummary(result) {
	return {
		loop: result.loop,
		id: result.id,
		desiredVerdict: result.desiredVerdict,
		observedVerdict: result.observedVerdict,
		gap: result.gap,
		issueCodes: result.issueCodes,
	};
}

function modeCounts(standards) {
	return standards.reduce(
		(counts, standard) => {
			counts[standard.mode || "deterministic"] += 1;
			return counts;
		},
		{ deterministic: 0, agent: 0, user: 0 },
	);
}

function sumModeCounts(counts) {
	return counts.reduce(
		(sum, item) => ({
			deterministic: sum.deterministic + item.deterministic,
			agent: sum.agent + item.agent,
			user: sum.user + item.user,
		}),
		{ deterministic: 0, agent: 0, user: 0 },
	);
}

function decisionCases() {
	return [
		{
			id: "complete-improve-decision",
			loop: "decision",
			description:
				"A grounded improve decision with source refs, no-KB-impact rationale, and aligned assessment exits.",
			desiredVerdict: "pass",
			run: () => evaluateDecisionExit(decisionTable(decisionRow())),
		},
		{
			id: "vague-docs-decision",
			loop: "decision",
			description:
				"Presence-only decision content uses short generic text while satisfying current fields.",
			desiredVerdict: "fail",
			gap:
				"Decision exit validates field presence but not semantic specificity or usefulness for planning.",
			run: () =>
				evaluateDecisionExit(
					decisionTable(
						decisionRow({
							id: "D-vague",
							decisionKind: "docs",
							currentState: "ok",
							desiredState: "better",
							rationale: "needed",
							userImpact: "good",
							maintainerImpact: "small",
							recommendationRationale: "fine",
							agentAssessment: {
								stance: "aligned",
								userAlignment: "ok",
								projectBenefit: "ok",
								rationale: "ok",
								concerns: [],
							},
						}),
					),
				),
		},
		{
			id: "high-risk-without-approval",
			loop: "decision",
			description:
				"High-risk approved decision without explicit user approval blocks before planning.",
			desiredVerdict: "block",
			run: () =>
				evaluateDecisionExit(
					decisionTable(
						decisionRow({
							id: "D-risk",
							risk: "high",
							affectedLayers: ["api", "runtime"],
							alternatives: ["Defer until explicit user approval."],
							approvalAuthority: "agent",
							approvalRef: undefined,
						}),
					),
				),
		},
	];
}

function planningCases() {
	return [
		{
			id: "complete-work-unit-plan",
			loop: "planning",
			description:
				"A bounded work unit with acceptance, verification, assessment, and no uncertainty exits.",
			desiredVerdict: "pass",
			run: () => evaluatePlanningExit(planningInput(planningWorkItem())),
		},
		{
			id: "vague-work-unit-plan",
			loop: "planning",
			description:
				"Presence-only plan uses generic requirement, acceptance, verification, and assessment text.",
			desiredVerdict: "fail",
			gap:
				"Planning exit validates arrays and stance fields but not testability, specificity, or implementation usefulness.",
			run: () =>
				evaluatePlanningExit(
					planningInput(
						planningWorkItem({
							id: "PW-vague",
							title: "Do it",
							outcome: "done",
							technicalRequirements: ["do it"],
							acceptanceCriteria: [{ id: "AC-vague", text: "works" }],
							acceptance: ["works"],
							verification: ["tests"],
							workerProfile: "worker",
							planningAssessment: {
								stance: "worker_ready",
								workUnitSize: "right_sized",
								rightSizing: "ok",
								independence: "ok",
								implementationReadiness: "ok",
								uncertainties: [],
								uncertaintyOwner: "none",
								uncertaintyResolution: "ok",
								rationale: "ok",
								concerns: [],
							},
						}),
					),
				),
		},
		{
			id: "overlapping-independent-work",
			loop: "planning",
			description:
				"Independent work units with overlapping path scopes fail unless dependency ordering resolves conflict.",
			desiredVerdict: "fail",
			gap:
				"Planning conflict detection does not catch this broad glob versus concrete child path overlap.",
			run: () =>
				evaluatePlanningExit({
					decisionRefs: ["trace:D-1"],
					workItems: [
						planningWorkItem({ id: "PW-a", pathScopes: ["src/runtime/**"] }),
						planningWorkItem({ id: "PW-b", pathScopes: ["src/runtime/host.ts"] }),
					],
					resolutions: [],
				}),
		},
	];
}

function implementationCases() {
	return [
		{
			id: "complete-implementation-evidence",
			loop: "implementation",
			description:
				"A scoped implementation with passing checks, acceptance evidence, and content proof exits.",
			desiredVerdict: "pass",
			run: () => evaluateImplementationExit(implementationInput(implementationChange())),
		},
		{
			id: "shallow-production-assertion",
			loop: "implementation",
			description:
				"Implementation evidence claims production readiness with generic summaries and passing placeholder check.",
			desiredVerdict: "fail",
			gap:
				"Implementation exit relies on structured evidence and agent assessment; it does not yet grade check strength, coverage depth, or assessment specificity.",
			run: () =>
				evaluateImplementationExit(
					implementationInput(
						implementationChange({
							id: "IC-vague",
							checks: ["npm test"],
							checkResults: [
								{
									command: "npm test",
									status: "pass",
									outputRef: "tests/runtime/readiness-checklist.test.mjs",
									summary: "ok",
								},
							],
							acceptanceEvidence: ["done"],
							acceptanceEvidenceItems: [
								{
									criterionId: "AC-1",
									summary: "done",
									evidenceRefs: [
										"tests/runtime/readiness-checklist.test.mjs",
									],
								},
							],
							implementationAssessment: {
								stance: "production_ready",
								maintainability: "ok",
								simplicity: "ok",
								projectStyle: "ok",
								errorHandling: "ok",
								uncertainties: [],
								uncertaintyOwner: "none",
								uncertaintyResolution: "ok",
								rationale: "ok",
								concerns: [],
							},
						}),
					),
				),
		},
		{
			id: "failed-check",
			loop: "implementation",
			description:
				"Implementation with failed recorded check does not exit even if evidence exists.",
			desiredVerdict: "fail",
			run: () =>
				evaluateImplementationExit(
					implementationInput(
						implementationChange({
							id: "IC-failed",
							checkResults: [
								{
									command: "npm test",
									status: "fail",
									exitCode: 1,
									outputRef: "tests/runtime/readiness-checklist.test.mjs",
								},
							],
						}),
					),
				),
		},
	];
}

function decisionTable(row) {
	return createDecisionTable({
		id: "DT-loop-debug",
		sourceRefs: ["kb:system/decision-loop.md"],
		rows: [row],
	});
}

function decisionRow(overrides = {}) {
	return {
		id: "D-good",
		question: "Should loop exit standards become measurable?",
		decisionKind: "improve",
		currentState:
			"Loop exit standards exist but need adversarial debug coverage before autonomous optimization.",
		desiredState:
			"Loop exit standards have deterministic regression cases and known semantic gaps.",
		rationale:
			"A loop-level benchmark catches cheap exits before expensive app benchmarks run.",
		currentPain:
			"Production readiness claims can be too coarse without loop-level adversarial checks.",
		desiredOutcome:
			"Decision, planning, and implementation exits expose measurable gaps before closure.",
		successSignal:
			"The loop debug benchmark reports pass/fail/block verdicts and known gap counts.",
		nonGoals: ["Do not run external model judges in the deterministic loop gate."],
		userImpact:
			"Users get safer automation because shallow loop outputs fail before implementation or release.",
		maintainerImpact:
			"Maintainers get cheap deterministic fixtures before using costly agent review.",
		effort: "low",
		workScale: "small",
		planningDepth: "micro",
		affectedLayers: ["system", "benchmarks"],
		risk: "low",
		approval: "approved",
		approvalAuthority: "agent",
		recommendation: "approve",
		recommendationRationale:
			"The change is bounded, traceable, and improves production-readiness evidence.",
		agentAssessment: {
			stance: "aligned",
			userAlignment:
				"Matches the user's request to debug loop exit quality before app benchmarks.",
			projectBenefit:
				"Improves CodeWiki's ability to enforce production-ready semantic loops cheaply.",
			rationale:
				"A deterministic adversarial corpus is lower cost than immediate model-judge loops.",
			concerns: [],
		},
		sourceRefs: ["kb:system/decision-loop.md"],
		proofRefs: [],
		changeType: "code",
		noKbImpactReason: "Fixture decision does not change KB source truth.",
		...overrides,
	};
}

function planningInput(workItem) {
	return {
		decisionRefs: ["trace:D-1"],
		workItems: [workItem],
		resolutions: [],
	};
}

function planningWorkItem(overrides = {}) {
	return {
		id: "PW-good",
		title: "Add deterministic loop-exit adversarial debug coverage",
		decisionRefs: ["trace:D-1"],
		outcome:
			"Loop exit benchmark identifies whether decision, planning, and implementation outputs can exit too cheaply.",
		technicalRequirements: [
			"Add deterministic adversarial fixtures for each loop exit evaluator.",
			"Report observed verdict, desired verdict, issue codes, standard modes, and open gap count.",
		],
		acceptance: [
			"Benchmark reports no regressions for complete pass/fail/block fixtures.",
		],
		acceptanceCriteria: [
			{
				id: "AC-1",
				text: "Loop debug benchmark reports pass, gap, or regression for every fixture.",
			},
		],
		componentRefs: [],
		pathScopes: [
			"src/runtime/types.ts",
			"tests/benchmarks/score-loop-exits.test.mjs",
		],
		planningDepth: "micro",
		verification: ["tests/benchmarks/score-loop-exits.test.mjs"],
		workerProfile: "implementation_worker",
		planningAssessment: {
			stance: "worker_ready",
			workUnitSize: "right_sized",
			rightSizing:
				"One worker can add the benchmark script, fixtures, and tests without broader runtime changes.",
			independence:
				"The work only depends on existing loop exit evaluator APIs and benchmark scripts.",
			implementationReadiness:
				"Acceptance criteria, paths, and verification command are explicit.",
			uncertainties: [],
			uncertaintyOwner: "none",
			uncertaintyResolution:
				"No unresolved planning, decision, or user-authority uncertainty remains.",
			rationale:
				"A deterministic benchmark is the smallest useful next step before agent-judge optimization.",
			concerns: [],
		},
		dependsOn: [],
		...overrides,
	};
}

function implementationInput(change) {
	return {
		planningRefs: ["trace:PW-1"],
		changes: [change],
		acceptanceRequirements: [
			{
				planningRef: "trace:PW-1",
				criterionId: "AC-1",
				text: "Loop debug benchmark reports pass, gap, or regression for every fixture.",
			},
		],
	};
}

function implementationChange(overrides = {}) {
	return {
		id: "IC-good",
		planningRefs: ["trace:PW-1"],
		codePaths: ["src/runtime/types.ts"],
		docPaths: [],
		testPaths: ["tests/benchmarks/score-loop-exits.test.mjs"],
		checks: ["node --experimental-strip-types --test tests/benchmarks/*.test.mjs"],
		checkResults: [
			{
				command:
					"node --experimental-strip-types --test tests/benchmarks/*.test.mjs",
				status: "pass",
				outputRef: "tests/benchmarks/score-loop-exits.test.mjs",
				summary: "Loop exit benchmark tests pass.",
			},
		],
		acceptanceEvidence: [
			"Loop exit benchmark reports pass, gap, and regression statuses for fixtures.",
		],
		acceptanceEvidenceItems: [
			{
				criterionId: "AC-1",
				summary:
					"Loop exit benchmark reports pass, gap, or regression for every fixture.",
				evidenceRefs: ["tests/benchmarks/score-loop-exits.test.mjs"],
			},
		],
		contentProof: { workingTreeDigest: "sha256:abcdef" },
		implementationAssessment: {
			stance: "production_ready",
			maintainability:
				"Benchmark fixture code is small, deterministic, and isolated under benchmarks.",
			simplicity:
				"The script reuses existing loop evaluators instead of adding a second standards engine.",
			projectStyle:
				"The benchmark follows existing package script and node:test conventions.",
			errorHandling:
				"The gate reports blockers and exits non-zero instead of hiding gaps.",
			uncertainties: [],
			uncertaintyOwner: "none",
			uncertaintyResolution:
				"No unresolved implementation, planning, decision, or user-authority uncertainty remains.",
			rationale:
				"Evidence is sufficient for a deterministic debug harness, not for closing all known loop-quality gaps.",
			concerns: [],
		},
		sensitiveSurfaceAssessment: {
			security: "No security-sensitive behavior changed.",
			privacy: "No private data handling changed.",
			accessibility: "No UI or page behavior changed.",
			dependencyRisk: "No dependency surface changed.",
			rationale: "Touched benchmark-only code and tests.",
		},
		approvalAuthority: "agent",
		publicationRefs: [],
		...overrides,
	};
}

function parseArgs(argv) {
	return {
		json: argv.includes("--json"),
		gate: argv.includes("--gate"),
	};
}

function printText(summary) {
	console.log("CodeWiki loop exit debug summary");
	console.log(`Status: ${summary.status}`);
	console.log(`Cases: ${summary.caseCount}`);
	for (const loop of LOOP_ORDER) {
		const item = summary.loops[loop];
		console.log(
			`${loop}: ${item.passed}/${item.cases} pass, ${item.gaps} gaps, ${item.regressions} regressions, standards modes d/a/u=${item.modeCounts.deterministic}/${item.modeCounts.agent}/${item.modeCounts.user}`,
		);
	}
	if (summary.gaps.length > 0) {
		console.log("\nOpen gaps:");
		for (const gap of summary.gaps) {
			console.log(
				`- ${gap.loop}/${gap.id}: desired ${gap.desiredVerdict}, observed ${gap.observedVerdict}`,
			);
			console.log(`  ${gap.gap}`);
		}
	}
	if (summary.regressions.length > 0) {
		console.log("\nRegressions:");
		for (const regression of summary.regressions) {
			console.log(
				`- ${regression.loop}/${regression.id}: desired ${regression.desiredVerdict}, observed ${regression.observedVerdict}`,
			);
		}
	}
}

async function main(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);
	const summary = scoreLoopExits();
	if (options.json) {
		console.log(JSON.stringify(summary, null, 2));
	} else {
		printText(summary);
	}
	if (options.gate && summary.gate.status !== "pass") {
		process.exitCode = 1;
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
