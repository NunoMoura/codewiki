import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {changeContentDigest} from "../../src/changes/digest.ts";
import {createChangeRecord} from "../../src/changes/records.ts";
import {parseDecisionCandidateProposal} from "../../src/decision/candidate-proposal.ts";
import {createDecisionCandidate} from "../../src/decision/exit/candidate.ts";
import {materializeDecisionApprovalReceipt} from "../../src/decision/exit/evidence.ts";
import {
	DECISION_MODEL_CHECK_PROTOCOL,
	createDecisionModelCheckExecutors,
} from "../../src/decision/exit/model-checks.ts";
import {createDecisionExitRuntime} from "../../src/decision/exit/runtime.ts";
import {createCheckCatalog} from "../../src/loop-exit/catalog.ts";
import {createResolvedExitPolicy} from "../../src/loop-exit/contracts.ts";
import {resolveExitPolicy} from "../../src/loop-exit/resolve-policy.ts";
import {createLoopExitRunner} from "../../src/loop-exit/runner.ts";
import {acceptedChangeFixture} from "../helpers/accepted-change.mjs";

const WORK_STATE_DIGEST = `sha256:${"a".repeat(64)}`;
const KNOWLEDGE_DIGEST = `sha256:${"b".repeat(64)}`;
const MODEL_CHECK_IDS = ["intention_validated", "recommendation_justified"];

function fixture() {
	const change = acceptedChangeFixture({id: "CHG-decision-model"});
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
		protocolId: DECISION_MODEL_CHECK_PROTOCOL.id,
		protocolVersion: DECISION_MODEL_CHECK_PROTOCOL.version,
		requestDigest: request.requestDigest,
		checkId: request.check.id,
		checkVersion: request.check.version,
		conclusion,
		findings:
			conclusion === "supported"
				? [`${request.check.id} is supported by Candidate content.`]
				: [`${request.check.id} remains unsupported.`],
		limitations: [],
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
		assert.equal(calls, 2);
		assert.deepEqual(replay.result.producedEvidenceRecords, []);
	});

	it("keeps unsupported, unavailable, and malformed outcomes explicit", async () => {
		for (const scenario of [
			"unsupported",
			"uncertain",
			"unavailable",
			"malformed",
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
								: response(
										request,
										scenario === "uncertain" ? "uncertain" : "unsupported",
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
