import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {changeContentDigest} from "../../src/changes/digest.ts";
import {createChangeRecord} from "../../src/changes/records.ts";
import {parseDecisionCandidateProposal} from "../../src/decision/candidate-proposal.ts";
import {createDecisionCandidate} from "../../src/decision/exit/candidate.ts";
import {createDecisionCodeExecutors} from "../../src/decision/exit/code-executors.ts";
import {
	createDecisionExitRuntime,
	deriveDecisionRuntimeRoute,
} from "../../src/decision/exit/runtime.ts";
import {createCheckCatalog} from "../../src/loop-exit/catalog.ts";
import {createResolvedExitPolicy} from "../../src/loop-exit/contracts.ts";
import {resolveExitPolicy} from "../../src/loop-exit/resolve-policy.ts";
import {createLoopExitRunner} from "../../src/loop-exit/runner.ts";
import {acceptedChangeFixture} from "../helpers/accepted-change.mjs";

const WORK_STATE_DIGEST = `sha256:${"a".repeat(64)}`;
const KNOWLEDGE_DIGEST = `sha256:${"b".repeat(64)}`;
const CODE_CHECK_IDS = [
	"active_change_overlap_accounted",
	"change_kind_classified",
	"change_revision_ready",
	"current_state_grounded",
	"delivery_constraints_safe",
	"evidence_sufficient",
	"improvement_outcome_observable",
	"intention_understood",
	"knowledge_impact_accounted",
	"outcome_contract_complete",
	"risks_and_alternatives_considered",
	"user_value_clear",
];

function workState(records) {
	return {
		schemaVersion: 1,
		snapshotDigest: WORK_STATE_DIGEST,
		changeIds: records.map((record) => record.change.id),
		sprintIds: [],
		workItemIds: [],
		assignmentIds: [],
		changes: records.map((record) => ({
			id: record.change.id,
			traceId: `TRACE-${record.change.id}`,
			record,
			approval: {status: "pending"},
			planningStatus: "unplanned",
			realizationStatus: "not_started",
			outcomeStatus: "unobserved",
			sprintIds: [],
			workItemIds: [],
			assignmentIds: [],
			blockers: [],
		})),
		sprints: [],
		workItems: [],
		assignments: [],
		blockers: [],
		sources: {traceCount: records.length, recordCount: records.length, changeTraceCount: records.length},
	};
}

function decisionCandidate(
	change,
	records = [createChangeRecord(change)],
	disposition = "approve",
) {
	const record = records.find((entry) => entry.change.id === change.id);
	return createDecisionCandidate({
		record,
		workState: workState(records),
		proposal: parseDecisionCandidateProposal({
			disposition,
			rationale: "Apply exact grounded semantic disposition.",
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
}

function policyFor(candidate, checkIds = CODE_CHECK_IDS) {
	const catalog = createCheckCatalog();
	const resolved = resolveExitPolicy({
		loop: "decision",
		candidateDigest: candidate.digest,
		changes: [
			{
				changeId: "CHG-native-decision",
				revision: candidate.content.revision.revision,
				digest: candidate.content.validation.revisionDigest,
				kind: candidate.content.revision.classification.kind,
				type: candidate.content.revision.classification.type,
				risk: candidate.content.revision.safety.risk,
				affectedLayers: [...candidate.content.revision.classification.affectedLayers],
			},
		],
		projectTraits: [],
		technologies: [],
		paths: [...candidate.content.revision.classification.targetRefs],
	});
	const bindings = resolved.bindings.filter((binding) =>
		checkIds.includes(binding.checkId),
	);
	const policy = createResolvedExitPolicy({
		loop: "decision",
		candidateDigest: candidate.digest,
		catalogDigest: resolved.catalogDigest,
		selectorInputDigest: resolved.selectorInputDigest,
		bindings,
		protectedCheckIds: bindings.map((binding) => binding.checkId),
	});
	return {catalog, policy};
}

describe("native Decision Candidate and Code Checks", () => {
	it("materializes complete semantic revision and passes exact Code Checks", async () => {
		const change = acceptedChangeFixture({id: "CHG-native-decision"});
		const candidate = decisionCandidate(change);
		assert.equal(candidate.loop, "decision");
		assert.equal(candidate.content.revision.intent.desiredState, change.intent.desiredState);
		assert.equal(candidate.content.validation.revisionDigest, changeContentDigest(change));
		assert.equal(candidate.content.groundingRefs.includes(change.evidence.sourceRefs[0]), true);
		assert.equal("authority" in candidate.content, false);
		assert.equal("changeId" in candidate.content, false);
		assert.equal(Object.isFrozen(candidate), true);

		const {catalog, policy} = policyFor(candidate);
		const runner = createLoopExitRunner({
			catalog,
			executors: createDecisionCodeExecutors(catalog),
		});
		const result = await runner.run({candidate, policy});
		assert.equal(result.report.status, "pass");
		assert.equal(
			result.report.checkResults.every((check) => check.status === "pass"),
			true,
		);
	});

	it("fails closed through the complete native policy when required assurance is unavailable", async () => {
		const change = acceptedChangeFixture({id: "CHG-native-decision"});
		const candidate = decisionCandidate(change);
		const native = await createDecisionExitRuntime().run({
			candidate,
			changeRef: "change:CHG-native-decision",
		});
		assert.equal(native.result.report.status, "indeterminate");
		assert.equal(
			native.result.report.checkResults.find(
				(check) => check.checkId === "change_revision_ready",
			).status,
			"pass",
		);
		assert.equal(
			native.result.report.checkResults.find(
				(check) => check.checkId === "approval_safety",
			).issueClass,
			"evidence_input",
		);
		assert.equal(native.result.nextAction.kind, "retry_or_wait");
		assert.equal(native.route.route, "waiting");
		assert.equal(native.route.reasonCode, "decision-assurance-indeterminate");
	});

	it("derives terminal and waiting routes only after passing assurance", async () => {
		const change = acceptedChangeFixture({id: "CHG-native-decision"});
		for (const [disposition, expectedRoute] of [
			["defer", "waiting"],
			["reject", "complete"],
			["withdraw", "withdrawn"],
		]) {
			const candidate = decisionCandidate(
				change,
				[createChangeRecord(change)],
				disposition,
			);
			const {catalog, policy} = policyFor(candidate);
			const result = await createLoopExitRunner({
				catalog,
				executors: createDecisionCodeExecutors(catalog),
			}).run({candidate, policy});
			assert.equal(result.report.status, "pass");
			assert.equal(
				deriveDecisionRuntimeRoute(candidate, result.report).route,
				expectedRoute,
			);
		}
	});

	it("retains unaccounted overlap and incomplete Knowledge as native failures", async () => {
		const change = acceptedChangeFixture({
			id: "CHG-native-decision",
			knowledgeTopicRefs: [],
			knowledgePropagationRefs: [],
		});
		change.knowledge.noImpactRationale = undefined;
		change.validation.validatedDigest = changeContentDigest(change);
		const overlapping = createChangeRecord(
			acceptedChangeFixture({
				id: "CHG-overlap",
				targetRefs: [...change.classification.targetRefs],
			}),
		);
		const candidate = decisionCandidate(change, [
			createChangeRecord(change),
			overlapping,
		]);
		assert.equal(candidate.content.activeOverlaps.length, 1);
		assert.equal(candidate.content.activeOverlaps[0].accountedByRelationship, false);
		const {catalog, policy} = policyFor(candidate, [
			"active_change_overlap_accounted",
			"knowledge_impact_accounted",
		]);
		const result = await createLoopExitRunner({
			catalog,
			executors: createDecisionCodeExecutors(catalog),
		}).run({candidate, policy});
		assert.equal(result.report.status, "fail");
		assert.deepEqual(
			result.report.checkResults.map((check) => [check.checkId, check.status]),
			[
				["active_change_overlap_accounted", "fail"],
				["knowledge_impact_accounted", "fail"],
			],
		);
	});

	it("rejects a Candidate built against stale WorkState", () => {
		const change = acceptedChangeFixture({id: "CHG-native-decision"});
		const record = createChangeRecord(change);
		assert.throws(
			() =>
				createDecisionCandidate({
					record,
					workState: workState([record]),
					proposal: {disposition: "defer", rationale: "Await state refresh."},
					observedBase: {
						workStateDigest: `sha256:${"0".repeat(64)}`,
						knowledgeSnapshotDigest: KNOWLEDGE_DIGEST,
						canonicalRefs: ["change:CHG-native-decision:revision:1"],
					},
				}),
			/observed WorkState digest does not match/,
		);
	});
});
