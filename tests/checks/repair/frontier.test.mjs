import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {projectAlignmentGraph} from "../../../src/alignment/graph.ts";
import {augmentAlignmentGraphWithKnowledge} from "../../../src/alignment/knowledge.ts";
import {
	canonicalJsonDigest,
} from "../../../src/utils/canonical-json.ts";
import {createCheckCatalog} from "../../../src/checks/catalog.ts";
import {createResolvedExitPolicy} from "../../../src/checks/contracts.ts";
import {loopQualifiedCheckDigest} from "../../../src/checks/identity.ts";
import {
	assertValidExitOutcome,
	assertValidRepairBrief,
	assertValidRepairBundle,
	assertValidRepairExecutionInvocation,
	createExitOutcome,
	createRepairBrief,
	createRepairBundle,
	createRepairExecutionInvocation,
} from "../../../src/checks/repair/bundle.ts";
import {
	assertValidRepairFrontier,
	createRepairFrontier,
} from "../../../src/checks/repair/frontier.ts";
import {
	defaultRepairProfiles,
	repairProfileSetDigest,
} from "../../../src/checks/repair/profiles.ts";
import {
	createCheckResult,
	createExitReport,
} from "../../../src/checks/results.ts";
import {createThreeBatchJourney} from "../../helpers/change-trace-replay-v1.mjs";

function readyEvidenceResolution(obligation) {
	const evidenceId = `evidence:${obligation.kinds[0]}:${canonicalJsonDigest({
		obligationId: obligation.id,
	}).slice("sha256:".length)}`;
	const body = {
		obligationId: obligation.id,
		obligationVersion: obligation.version,
		obligationDigest: canonicalJsonDigest(obligation),
		status: "ready",
		inputEvidenceIds: [evidenceId],
		eligibleEvidenceIds: [evidenceId],
		supportingEvidenceIds: [evidenceId],
		contradictoryEvidenceIds: [],
		neutralEvidenceIds: [],
		excludedEvidence: [],
		duplicateEvidenceIds: [],
		missingCount: 0,
	};
	return {...body, resolutionDigest: canonicalJsonDigest(body)};
}

function frontierFixture(options = {}) {
	const changeId = "CHG-repair-frontier";
	const journey = createThreeBatchJourney(changeId);
	const state = journey.states[2];
	const operationGraph = projectAlignmentGraph(state);
	const graph = augmentAlignmentGraphWithKnowledge(operationGraph, {
		knowledgeDigest: state.observedBase.knowledgeDigest,
		concepts: [
			{
				conceptId: "kb:system/traces",
				path: ".codewiki/kb/system/components/change-trace.md",
				authority: "accepted",
				type: "System Responsibility",
				title: "Change Trace",
				status: "stable",
				trustTier: "human-reviewed",
				stale: options.knowledgeStale ?? false,
				markdownReferences: [],
				sourceResources: [],
				relationships: [],
				sourcePatterns: ["src/changes/trace/**"],
				testPatterns: ["tests/changes/trace/**"],
			},
		],
	});
	const catalog = createCheckCatalog();
	const check = catalog.get("api_contract_reviewed", "planning").check;
	const repairProfiles = options.withoutProfiles
		? []
		: defaultRepairProfiles({
				checkId: check.id,
				requirement: check.requirement,
				target: check.repairTarget,
			});
	const profileSetDigest = repairProfileSetDigest(repairProfiles);
	const parameters = {repairProfileSetDigest: profileSetDigest};
	const policy = createResolvedExitPolicy({
		loop: "planning",
		candidateDigest: journey.candidate.artifact.digest,
		catalogDigest: catalog.digest,
		selectorInputDigest: canonicalJsonDigest({fixture: "repair-frontier"}),
		bindings: [
			{
				checkId: check.id,
				checkVersion: check.version,
				requirementDigest: check.requirementDigest,
				checkDigest: loopQualifiedCheckDigest({
					loop: "planning",
					check,
					configuration: parameters,
					catalogDigest: catalog.digest,
				}),
				enforcement: "require",
				required: true,
				parameters,
				repairProfiles,
				repairProfileSetDigest: profileSetDigest,
				dependsOn: [],
				activatedBy: ["test:repair-frontier"],
				ruleRefs: ["test:repair-frontier"],
			},
		],
		protectedCheckIds: [],
	});
	const disposition = options.disposition ?? "unsatisfied";
	const result = createCheckResult({
		loop: "planning",
		policy,
		check,
		disposition,
		...(disposition === "indeterminate"
			? {}
			: {measurement: {shape: "boolean", value: disposition === "satisfied"}}),
		evidenceResolutions: check.evidenceObligations.map(readyEvidenceResolution),
		findings:
			disposition === "satisfied"
				? []
				: [
						{
							code: "api.contract.drift",
							severity: "error",
							message: "Change Trace schema API contract drifted.",
							...(options.withoutLocation
								? {}
								: {
										location: {
											ref: "src/changes/trace/schema.ts",
											startLine: 192,
										},
									}),
							...(options.withoutProposal
								? {}
								: {
										repair: {
											objective: "Restore the Change Trace schema contract.",
											actions: ["Correct the bounded schema response."],
											verification: ["Run the Change Trace schema contract tests."],
										},
									}),
						},
						...(options.extraFinding
							? [
									{
										code: "api.contract.coverage",
										severity: "warning",
										message: "Change Trace schema coverage is incomplete.",
										repair: {
											objective: "Restore Change Trace schema coverage.",
											actions: ["Add the missing bounded context."],
											verification: ["Run the Change Trace schema tests."],
										},
									},
								]
							: []),
					],
		execution: {...check.execution},
	});
	const report = createExitReport({policy, checkResults: [result]});
	const candidate = {
		loop: "planning",
		candidateId: journey.candidate.id,
		candidateDigest: journey.candidate.artifact.digest,
		changeIds: [changeId],
	};
	return {candidate, graph, policy, report, result};
}

function create(input, options = {}) {
	return createRepairFrontier({
		candidate: input.candidate,
		policy: input.policy,
		report: input.report,
		alignmentGraph: input.graph,
		synchronizationStatus: options.synchronizationStatus ?? "fresh",
		...(options.limits ? {limits: options.limits} : {}),
	});
}

function guidanceInput(fixture, options = {}) {
	const synchronizationStatus = options.synchronizationStatus ?? "fresh";
	return {
		candidate: fixture.candidate,
		policy: fixture.policy,
		report: fixture.report,
		alignmentGraph: fixture.graph,
		synchronizationStatus,
		frontier: create(fixture, {synchronizationStatus}),
		...(options.limits ? {limits: options.limits} : {}),
	};
}

describe("Candidate-bound Repair Frontier", () => {
	it("derives bounded Change, Check, Evidence, finding, source, test, and Knowledge context", () => {
		const fixture = frontierFixture();
		const frontier = create(fixture, {
			limits: {maxFacts: 200, maxRefsPerKind: 100, depth: 4},
		});
		assert.equal(frontier.protocolVersion, "1.0.0");
		assert.equal(frontier.candidate.candidateDigest, fixture.report.candidateDigest);
		assert.equal(frontier.policyDigest, fixture.policy.policyDigest);
		assert.equal(frontier.exitReportDigest, fixture.report.reportDigest);
		assert.deepEqual(frontier.references.changeIds, ["CHG-repair-frontier"]);
		assert.deepEqual(frontier.references.checkIds, ["api_contract_reviewed"]);
		assert.deepEqual(frontier.references.evidenceRecordIds, fixture.result.evidenceRecordIds);
		assert.deepEqual(frontier.references.findingLocations, [
			"src/changes/trace/schema.ts",
		]);
		assert.ok(frontier.references.sourceRefs.includes("src/changes/trace/**"));
		assert.ok(frontier.references.testRefs.includes("tests/changes/trace/**"));
		assert.ok(frontier.references.knowledgeRefs.includes("kb:system/traces"));
		assert.equal(frontier.coverage.requestedRootCount, 2);
		assert.equal(frontier.coverage.foundRootCount, 2);
		assert.equal(frontier.coverage.alignedFindingLocationCount, 1);
		assert.notEqual(frontier.coverage.status, "unavailable");
		assert.equal(frontier.stale, false);
		assert.equal(frontier.grantsAuthority, false);
		assert.deepEqual(frontier.provenance.staleFactIds, []);
		assert.ok(frontier.provenance.queryResultDigests.length === 2);
		assert.ok(Object.isFrozen(frontier.facts));
		assert.ok(Object.isFrozen(frontier.coverage));
		assertValidRepairFrontier(frontier, {
			candidate: fixture.candidate,
			policy: fixture.policy,
			report: fixture.report,
			alignmentGraph: fixture.graph,
			synchronizationStatus: "fresh",
			limits: {maxFacts: 200, maxRefsPerKind: 100, depth: 4},
		});
	});

	it("reports bounded truncation, stale snapshots, and missing roots without inventing authority", () => {
		const fixture = frontierFixture();
		const bounded = create(fixture, {
			synchronizationStatus: "offline",
			limits: {maxFacts: 1, maxRefsPerKind: 1, depth: 4},
		});
		assert.equal(bounded.stale, true);
		assert.equal(bounded.truncation.truncated, true);
		assert.equal(bounded.truncation.facts, true);
		assert.equal(bounded.facts.length, 1);
		assert.ok(bounded.references.sourceRefs.length <= 1);

		const staleKnowledge = create(frontierFixture({knowledgeStale: true}), {
			limits: {maxFacts: 200, maxRefsPerKind: 100, depth: 4},
		});
		assert.equal(staleKnowledge.stale, true);
		assert.ok(staleKnowledge.provenance.staleFactIds.length > 0);

		const missing = create({
			...fixture,
			candidate: {...fixture.candidate, candidateId: "missing-candidate"},
		});
		assert.equal(missing.coverage.foundRootCount, 1);
		assert.equal(missing.coverage.status, "partial");
		assert.equal(missing.references.findingLocations.length, 1);
	});

	it("rejects passing reports, identity drift, bad bounds, and frontier tampering", () => {
		const passing = frontierFixture({disposition: "satisfied"});
		assert.throws(() => create(passing), /requires at least one failed or indeterminate/);

		const fixture = frontierFixture();
		assert.throws(
			() =>
				create({
					...fixture,
					candidate: {
						...fixture.candidate,
						candidateDigest: canonicalJsonDigest({wrong: true}),
					},
				}),
			/Candidate does not match Exit Report/,
		);
		assert.throws(
			() => create(fixture, {limits: {maxFacts: 201}}),
			/maxFacts must be an integer from 1 to 200/,
		);
		const frontier = create(fixture);
		const tampered = structuredClone(frontier);
		tampered.references.checkIds = ["other-check"];
		const assertionInput = {
			candidate: fixture.candidate,
			policy: fixture.policy,
			report: fixture.report,
			alignmentGraph: fixture.graph,
			synchronizationStatus: "fresh",
		};
		assert.throws(
			() => assertValidRepairFrontier(tampered, assertionInput),
			/Repair Frontier digest does not match content/,
		);
		const {frontierDigest: _oldDigest, ...tamperedBody} = tampered;
		tampered.frontierDigest = canonicalJsonDigest(tamperedBody);
		assert.throws(
			() => assertValidRepairFrontier(tampered, assertionInput),
			/does not match its bound report and Alignment snapshot/,
		);
	});
});

describe("report-bound Repair Brief and Repair Bundle", () => {
	it("compiles only matched profiles with structured signals and bounded frontier context", () => {
		const fixture = frontierFixture();
		const input = guidanceInput(fixture);
		const brief = createRepairBrief(input);
		const bundle = createRepairBundle(input);

		assert.equal(brief.protocolVersion, "1.0.0");
		assert.equal(bundle.protocolVersion, "1.0.0");
		assert.equal(brief.exitReportDigest, fixture.report.reportDigest);
		assert.equal(brief.context.frontierDigest, input.frontier.frontierDigest);
		assert.equal(brief.resultSignals.length, 1);
		assert.equal(brief.resultSignals[0].findings[0].code, "api.contract.drift");
		assert.match(
			brief.resultSignals[0].findings[0].repairProposalDigest,
			/^sha256:[a-f0-9]{64}$/,
		);
		assert.equal(brief.guidance.length, 1);
		assert.equal(
			brief.guidance.length < fixture.policy.bindings[0].repairProfiles.length,
			true,
		);
		assert.equal(brief.guidance[0].profile.match.outcome, "fail");
		assert.equal(bundle.matchedProfiles.length, 1);
		assert.deepEqual(bundle.guidanceDigests.profileDigests, [
			brief.guidance[0].profile.profileDigest,
		]);
		assert.equal(bundle.grantsAuthority, false);
		assert.equal(brief.grantsAuthority, false);
		assert.ok(Object.isFrozen(bundle));
		assert.ok(Object.isFrozen(bundle.brief.resultSignals[0].findings));
		assertValidRepairBrief(brief, input);
		assertValidRepairBundle(bundle, input);

		const routeBody = {
			candidateDigest: fixture.report.candidateDigest,
			exitReportDigest: fixture.report.reportDigest,
			route: "repair",
			reasonCode: "required_check_failed",
		};
		const outcomeInput = {
			policy: fixture.policy,
			report: fixture.report,
			repairGuidance: input,
			runtimeRoute: {...routeBody, routeDigest: canonicalJsonDigest(routeBody)},
		};
		const outcome = createExitOutcome(outcomeInput);
		assert.equal(outcome.exitReport.reportDigest, fixture.report.reportDigest);
		assert.equal(outcome.repairBundle.bundleDigest, bundle.bundleDigest);
		assert.equal(outcome.runtimeRoute.route, "repair");
		assertValidExitOutcome(outcome, outcomeInput);

		const invocation = createRepairExecutionInvocation(input);
		assert.equal(invocation.repairBundleDigest, bundle.bundleDigest);
		assert.equal(invocation.brief.guidance.length, 1);
		assert.equal("frontier" in invocation, false);
		assert.equal("matchedProfiles" in invocation, false);
		assert.equal(invocation.grantsAuthority, false);
		assertValidRepairExecutionInvocation(invocation, input);
	});

	it("reports truncation, stale context, and unavailable authored guidance without losing signals", () => {
		const boundedFixture = frontierFixture({extraFinding: true});
		const boundedInput = guidanceInput(boundedFixture, {
			synchronizationStatus: "offline",
			limits: {maxResults: 1, maxFindings: 1, maxProfileMatches: 1},
		});
		const bounded = createRepairBundle(boundedInput);
		assert.equal(bounded.stale, true);
		assert.equal(bounded.brief.truncation.truncated, true);
		assert.equal(bounded.brief.truncation.findings, true);
		assert.equal(bounded.coverage.findingCount, 2);
		assert.equal(bounded.coverage.selectedFindingCount, 1);
		assert.equal(bounded.coverage.status, "partial");

		const unguidedFixture = frontierFixture({
			withoutProfiles: true,
			withoutProposal: true,
		});
		const unguided = createRepairBundle(guidanceInput(unguidedFixture));
		assert.equal(unguided.coverage.status, "unavailable");
		assert.equal(unguided.matchedProfiles.length, 0);
		assert.equal(unguided.brief.resultSignals.length, 1);
		assert.equal(unguided.brief.resultSignals[0].findings.length, 1);
		const reportOnly = createExitOutcome({
			policy: unguidedFixture.policy,
			report: unguidedFixture.report,
		});
		assert.equal(reportOnly.repairBundle, null);
		assert.equal(reportOnly.runtimeRoute, null);
	});

	it("rejects invalid bounds, content tampering, and recomputed digest rebinding", () => {
		const fixture = frontierFixture();
		assert.throws(
			() => createRepairBundle(guidanceInput(fixture, {limits: {maxResults: 513}})),
			/maxResults must be an integer from 1 to 512/,
		);
		const input = guidanceInput(fixture);
		const brief = structuredClone(createRepairBrief(input));
		brief.context.references.checkIds = ["other-check"];
		assert.throws(
			() => assertValidRepairBrief(brief, input),
			/Repair Brief digest does not match content/,
		);

		const bundle = structuredClone(createRepairBundle(input));
		bundle.brief.resultSignals[0].repairTarget = "other-target";
		const {bundleDigest: _oldDigest, ...body} = bundle;
		bundle.bundleDigest = canonicalJsonDigest(body);
		assert.throws(
			() => assertValidRepairBundle(bundle, input),
			/does not match its bound report and Repair Frontier/,
		);
		assert.throws(
			() =>
				createExitOutcome({
					policy: fixture.policy,
					report: fixture.report,
					runtimeRoute: {
						candidateDigest: canonicalJsonDigest({other: "candidate"}),
						exitReportDigest: fixture.report.reportDigest,
						route: "repair",
						reasonCode: "required_check_failed",
						routeDigest: canonicalJsonDigest({route: "other"}),
					},
				}),
			/references another Candidate or Exit Report/,
		);
	});
});
