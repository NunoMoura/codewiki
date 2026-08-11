import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	augmentAlignmentGraphWithKnowledge,
	projectAlignmentGraph,
} from "../../src/change-trace/index.ts";
import {
	canonicalJsonDigest,
} from "../../src/utils/canonical-json.ts";
import {createCheckCatalog} from "../../src/verification/catalog.ts";
import {createResolvedExitPolicy} from "../../src/verification/contracts.ts";
import {loopQualifiedCheckDigest} from "../../src/verification/identity.ts";
import {
	assertValidRepairFrontier,
	createRepairFrontier,
} from "../../src/verification/repair-frontier.ts";
import {
	defaultRepairProfiles,
	repairProfileSetDigest,
} from "../../src/verification/repair-profiles.ts";
import {
	createCheckResult,
	createExitReport,
} from "../../src/verification/results.ts";
import {createThreeBatchJourney} from "../helpers/change-trace-replay-v1.mjs";

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
				path: ".codewiki/kb/system/components/traces.md",
				authority: "accepted",
				type: "System Responsibility",
				title: "Change Traces",
				status: "stable",
				trustTier: "human-reviewed",
				stale: options.knowledgeStale ?? false,
				markdownReferences: [],
				sourceResources: [],
				relationships: [],
				sourcePatterns: ["src/change-trace/**"],
				testPatterns: ["tests/traces/**"],
			},
		],
	});
	const catalog = createCheckCatalog();
	const check = catalog.get("api_contract_reviewed", "planning").check;
	const repairProfiles = defaultRepairProfiles({
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
							message: "Alignment query API contract drifted.",
							...(options.withoutLocation
								? {}
								: {
										location: {
											ref: "src/change-trace/alignment-query.ts",
											startLine: 192,
										},
									}),
						},
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
			"src/change-trace/alignment-query.ts",
		]);
		assert.ok(frontier.references.sourceRefs.includes("src/change-trace/**"));
		assert.ok(frontier.references.testRefs.includes("tests/traces/**"));
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
