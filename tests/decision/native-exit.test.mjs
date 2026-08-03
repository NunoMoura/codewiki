import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {createInitialProjectWorkState} from "../../src/change-trace/index.ts";
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
import {
	nativeDecisionCandidate,
	nativeDecisionRevision,
	nativeDecisionState,
} from "../helpers/native-decision.mjs";

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

function stateWithRevision(changeId, revision = nativeDecisionRevision({changeId})) {
	return nativeDecisionState([{changeId, revision}]);
}

function policyFor(candidate, checkIds = CODE_CHECK_IDS) {
	const catalog = createCheckCatalog();
	const revision = candidate.content.revision;
	const resolved = resolveExitPolicy({
		loop: "decision",
		candidateDigest: candidate.digest,
		changes: [
			{
				changeId: candidate.content.changeId,
				revision: revision.ordinal,
				digest: revision.revisionId,
				kind: revision.classification.kind === "unknown" ? "harden" : revision.classification.kind,
				type:
					revision.classification.type === "unknown"
						? "security_change"
						: revision.classification.type,
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
	it("materializes the exact native semantic revision and passes Code Checks", async () => {
		const changeId = "CHG-native-decision";
		const revision = nativeDecisionRevision({changeId});
		const state = stateWithRevision(changeId, revision);
		const candidate = nativeDecisionCandidate({state, changeId});

		assert.equal(candidate.loop, "decision");
		assert.equal(candidate.schemaVersion, "2.0.0");
		assert.equal(candidate.content.changeId, changeId);
		assert.equal(
			candidate.content.revision.intent.desiredState,
			revision.content.intent.desiredState,
		);
		assert.equal(candidate.content.revision.revisionId, revision.revisionId);
		assert.equal(candidate.observedBase.workStateDigest, state.workStateDigest);
		assert.equal(
			candidate.observedBase.canonicalRefs.includes(revision.revisionId),
			true,
		);
		assert.equal("authority" in candidate.content, false);
		assert.equal(Object.isFrozen(candidate), true);

		const {catalog, policy} = policyFor(candidate);
		const result = await createLoopExitRunner({
			catalog,
			executors: createDecisionCodeExecutors(catalog),
		}).run({candidate, policy});
		assert.equal(result.report.status, "pass");
		assert.equal(
			result.report.checkResults.every((check) => check.status === "pass"),
			true,
		);
	});

	it("fails closed through the complete native policy when assurance is unavailable", async () => {
		const changeId = "CHG-native-decision";
		const candidate = nativeDecisionCandidate({
			state: stateWithRevision(changeId),
			changeId,
		});
		const native = await createDecisionExitRuntime().run({
			candidate,
			changeRef: `change:${changeId}`,
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
		const changeId = "CHG-native-decision";
		const state = stateWithRevision(changeId);
		for (const [disposition, expectedRoute] of [
			["defer", "waiting"],
			["reject", "complete"],
			["withdraw", "withdrawn"],
		]) {
			const candidate = nativeDecisionCandidate({state, changeId, disposition});
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
		const targetRefs = ["src/shared.ts"];
		const state = nativeDecisionState([
			{
				changeId: "CHG-native-decision",
				revision: nativeDecisionRevision({
					changeId: "CHG-native-decision",
					targetRefs,
					topicRefs: [],
					propagationRefs: [],
				}),
			},
			{
				changeId: "CHG-overlap",
				revision: nativeDecisionRevision({
					changeId: "CHG-overlap",
					targetRefs,
				}),
			},
		]);
		const candidate = nativeDecisionCandidate({
			state,
			changeId: "CHG-native-decision",
		});
		assert.equal(candidate.content.activeOverlaps.length, 1);
		assert.equal(
			candidate.content.activeOverlaps[0].accountedByRelationship,
			false,
		);
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

	it("preserves unknown intake classification and routes failed classification to repair", async () => {
		const changeId = "CHG-native-unknown";
		const revision = nativeDecisionRevision({
			changeId,
			kind: "unknown",
			type: "unknown",
			scope: "unknown",
			risk: "unknown",
		});
		const candidate = nativeDecisionCandidate({
			state: stateWithRevision(changeId, revision),
			changeId,
		});
		assert.equal(candidate.content.revision.classification.kind, "unknown");
		assert.equal(candidate.content.revision.safety.risk, "unknown");
		const result = await createDecisionExitRuntime().run({
			candidate,
			changeRef: `change:${changeId}`,
		});
		assert.equal(
			result.result.report.checkResults.find(
				(check) => check.checkId === "change_kind_classified",
			).status,
			"fail",
		);
		assert.equal(result.result.report.status, "fail");
		assert.equal(result.route.route, "repair");
	});

	it("rejects absent Changes and caller-owned Candidate bindings", () => {
		assert.throws(
			() =>
				createDecisionCandidate({
					state: createInitialProjectWorkState(),
					changeId: "CHG-native-decision",
					proposal: {
						disposition: "defer",
						rationale: "Await exact project state.",
					},
				}),
			/requires current non-withdrawn Change/,
		);
		const changeId = "CHG-native-decision";
		assert.throws(
			() =>
				createDecisionCandidate({
					state: stateWithRevision(changeId),
					changeId,
					proposal: {
						disposition: "defer",
						rationale: "Await exact project state.",
						workStateDigest: `sha256:${"0".repeat(64)}`,
					},
				}),
			/unsupported fields: workStateDigest/,
		);
	});
});
