import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, it} from "node:test";

import {
	createChangeRevision,
	createInitialProjectWorkState,
	projectAlignmentGraph,
} from "../../src/change-trace/index.ts";
import {normalizeChangeDefectProfile} from "../../src/changes/defect-profile.ts";
import {createUserSuggestionMaterial} from "../../src/changes/intake/producers.ts";
import {BACKLOG_TRIAGE_QUERY_PROTOCOL} from "../../src/changes/triage/contracts.ts";
import {compareTriageCandidates} from "../../src/changes/triage/ordering.ts";
import {
	createBacklogTriagePolicy,
	createTriagePreferenceBinding,
} from "../../src/changes/triage/policy.ts";
import {
	assertDecisionAttentionSelectionReceipt,
	createDecisionAttentionSelectionRuntime,
	DECISION_ATTENTION_SELECTION_PROTOCOL,
	DecisionAttentionSelectionError,
	parseDecisionAttentionSelectionCommand,
} from "../../src/changes/triage/selection.ts";
import {buildBacklogTriageProjection as buildBoundBacklogTriageProjection} from "../../src/changes/triage/projection.ts";
import {queryBacklogTriage} from "../../src/changes/triage/query.ts";
import {
	createUserStandardDefinition,
	createUserStandardSourceSnapshot,
} from "../../src/loop-exit/custom-checks/user-standards.ts";
import {
	scheduleDecisionAttentionJob,
	selectAndScheduleDecisionAttentionJob,
} from "../../src/runtime/decision-attention-selection.ts";
import {ProjectCoordinator} from "../../src/runtime/project-coordinator.ts";
import {
	connectProjectCoordinatorClient,
	startProjectCoordinatorService,
} from "../../src/runtime/project-coordinator-service.ts";
import {
	canonicalJson,
	canonicalJsonDigest,
} from "../../src/utils/canonical-json.ts";
import {
	baseSnapshotFor,
	buildOperationSequence,
	createThreeBatchJourney,
	reduceBatch,
} from "../helpers/change-trace-replay-v1.mjs";
import {gitObject} from "../helpers/change-trace-v1.mjs";

function buildBacklogTriageProjection(input) {
	return buildBoundBacklogTriageProjection({
		...input,
		policy:
			input.policy ??
			createBacklogTriagePolicy({
				projectConfigDigest: input.workState.observedBase.configDigest,
				userStandards: [],
				bindings: [],
			}),
	});
}

function protectedPreferencePolicy(state) {
	const passage = "Higher-severity broad-exposure defects receive earlier Decision attention.";
	const standard = createUserStandardDefinition({
		name: "Decision attention policy",
		source: createUserStandardSourceSnapshot({
			kind: "inline",
			mediaType: "text/markdown",
			content: passage,
			observedAt: "2026-09-30T09:00:00.000Z",
		}),
		passages: [{text: passage}],
	});
	const binding = createTriagePreferenceBinding({
		distillationReceiptId: `user-standard-distillation-receipt:${"a".repeat(64)}`,
		clauseId: `user-standard-clause:${"b".repeat(64)}`,
		userStandard: standard,
		passageId: standard.passages[0].passageId,
		dimensions: ["severity", "exposure", "age_fairness"],
	});
	return createBacklogTriagePolicy({
		projectConfigDigest: state.observedBase.configDigest,
		userStandards: [standard],
		bindings: [binding],
	});
}

function selectionAuthority() {
	return {
		actorId: "decision-selector",
		principalRef: "identity:decision-selector",
		role: "maintainer",
		actorPolicyDigest: `sha256:${"c".repeat(64)}`,
		authenticationEvidenceId: "auth:decision-selector",
		runtimeProtocolDigest: `sha256:${"d".repeat(64)}`,
	};
}

function selectionCommand(projection, candidate) {
	return {
		protocolId: DECISION_ATTENTION_SELECTION_PROTOCOL.id,
		protocolVersion: DECISION_ATTENTION_SELECTION_PROTOCOL.version,
		idempotencyKey: `select:${candidate.changeId}:current`,
		changeId: candidate.changeId,
		changeRevisionId: candidate.changeRevisionId,
		expectedTriageCandidateDigest: candidate.candidateDigest,
		expectedWorkStateDigest: projection.binding.workStateDigest,
		expectedProjectionDigest: projection.projectionDigest,
		expectedProjectConfigDigest: projection.binding.configDigest,
		expectedTriagePolicyDigest: projection.binding.triagePolicyDigest,
	};
}

function inlineMaterial(material) {
	const digest = canonicalJsonDigest(material);
	return {
		id: `intake-material:${digest.slice("sha256:".length)}`,
		digest,
		schemaVersion: material.protocolVersion,
		artifact: material,
	};
}

function userMaterial(changeId, sourceRef = `trace:source:${changeId}`) {
	return createUserSuggestionMaterial({
		channel: "api",
		submissionId: `submission:${changeId}`,
		content: {
			summary: `Proposal ${changeId}`,
			observedBehavior: `Current behavior for ${changeId}.`,
			desiredBehavior: `Desired behavior for ${changeId}.`,
			affectedRefs: [sourceRef],
			sourceRefs: [sourceRef],
			claimedCategory: "behavior",
			claimedSeverity: "medium",
			claimedConfidence: "high",
		},
	});
}

function criticalSecurityProfile() {
	return normalizeChangeDefectProfile({
		protocolId: "codewiki.change-defect-profile",
		protocolVersion: "1.0.0",
		category: "security",
		severity: "critical",
		likelihood: "demonstrated",
		exposure: "broad",
		confidence: "high",
		reproducibility: "reproducible",
		regressionStatus: "not_regression",
		affectedVersions: ["1.0.0"],
		affectedTrees: [gitObject("1")],
		affectedComponents: ["kb:system/identity"],
		observedBehavior: "Authentication accepts a verified critical bypass.",
		expectedBehavior: "Authentication rejects the bypass.",
		sourceLocations: ["src/auth/verify.ts"],
		ruleRefs: ["scanner:auth-bypass"],
		security: {
			classification: "suspected_vulnerability",
			identifiers: [],
			cvss: [],
			sarif: [],
			kev: [],
		},
		provenance: {
			authority: "verified",
			evidenceIds: ["evidence:security:verified"],
			sourceRefs: ["trace:scanner:security:run:1"],
		},
	});
}

function revision(changeId, overrides = {}) {
	return createChangeRevision({
		title: `Decide ${changeId}`,
		summary: `Determine exact intent for ${changeId}.`,
		desiredOutcome: `Accepted behavior for ${changeId} is explicit.`,
		acceptanceRequirements: [
			{id: "meaning", statement: "Accepted meaning is explicit and testable."},
		],
		constraints: ["Do not assign execution priority during triage."],
		nonGoals: ["No mutable backlog."],
		knowledgeRefs: [`kb:product/${changeId.toLowerCase()}`],
		sourceRefs: [`src/${changeId.toLowerCase()}.ts`],
		risk: "moderate",
		...overrides,
	});
}

function openChange(state, input) {
	const material = input.material ?? userMaterial(input.changeId);
	const built = buildOperationSequence({
		changeId: input.changeId,
		baseSnapshot: baseSnapshotFor(state),
		specifications: [
			{
				kind: "trace.opened",
				recordedAt: input.recordedAt,
				payload: {
					origin: "user",
					provenanceRefs: material.content.sourceRefs,
				},
			},
			{
				kind: "change.proposed",
				recordedAt: new Date(Date.parse(input.recordedAt) + 1_000).toISOString(),
				payload: {
					revision: input.revision,
					intakeMaterial: inlineMaterial(material),
					provenance: {kind: "user", refs: material.content.sourceRefs},
				},
			},
		],
	});
	return reduceBatch(state, built.operations, input.stateHead);
}

function recordRelationship(state, input) {
	const source = state.changes.find((change) => change.changeId === input.sourceChangeId);
	const target = state.changes.find((change) => change.changeId === input.targetChangeId);
	assert.ok(source?.currentRevision);
	assert.ok(target?.currentRevision);
	const relationship = {
		type: input.type,
		sourceRevisionId: source.currentRevision.revisionId,
		targetChangeId: target.changeId,
		targetRevisionId: target.currentRevision.revisionId,
		rationale: input.rationale,
		provenanceRefs: ["trace:triage:relationship"],
	};
	const built = buildOperationSequence({
		change: source,
		changeId: source.changeId,
		baseSnapshot: baseSnapshotFor(state),
		specifications: [
			{
				kind: "change.relationship_recorded",
				recordedAt: input.recordedAt,
				payload: {
					relationshipId: canonicalJsonDigest(relationship),
					relationship,
				},
			},
		],
	});
	return reduceBatch(state, built.operations, input.stateHead);
}

function supported(value, revisionId, suffix) {
	return {
		value,
		basis: {
			authority: "asserted",
			analysisClass: "inferred_analysis",
			inputProvenanceClasses: ["canonical_binding"],
			canonicalRefs: [revisionId],
			observedRefs: [],
			evidenceRefs: [],
			analysisRefs: [`triage-estimator:${suffix}`],
			assumptions: [],
		},
	};
}

function fixture() {
	const initial = createInitialProjectWorkState();
	const security = revision("CHG-security", {
		knowledgeRefs: ["kb:system/identity"],
		sourceRefs: ["src/shared.ts", "src/auth/verify.ts"],
		defectProfile: criticalSecurityProfile(),
		risk: "critical",
	});
	const feature = revision("CHG-feature", {
		knowledgeRefs: ["kb:product/feature"],
		sourceRefs: ["src/shared.ts"],
		risk: "low",
	});
	const cleanup = revision("CHG-cleanup", {
		knowledgeRefs: ["kb:system/cleanup"],
		sourceRefs: ["src/cleanup.ts"],
		risk: "high",
	});
	let state = openChange(initial, {
		changeId: "CHG-security",
		revision: security,
		recordedAt: "2026-07-01T10:00:00.000Z",
		stateHead: gitObject("a"),
		material: userMaterial("CHG-security", "trace:source:security"),
	});
	state = openChange(state, {
		changeId: "CHG-feature",
		revision: feature,
		recordedAt: "2026-09-20T10:00:00.000Z",
		stateHead: gitObject("b"),
		material: userMaterial("CHG-feature", "trace:source:feature"),
	});
	state = openChange(state, {
		changeId: "CHG-cleanup",
		revision: cleanup,
		recordedAt: "2026-08-01T10:00:00.000Z",
		stateHead: gitObject("c"),
		material: userMaterial("CHG-cleanup", "trace:source:cleanup"),
	});
	const graph = projectAlignmentGraph(state);
	const binding = {
		workStateDigest: state.workStateDigest,
		graphSnapshotDigest: graph.graphSnapshotDigest,
		graphContentDigest: graph.graphContentDigest,
	};
	const estimates = [
		{
			changeId: "CHG-security",
			changeRevisionId: security.revisionId,
			...binding,
			dimensions: {
				urgency: supported("critical", security.revisionId, "security-urgency"),
				expectedImpact: supported("critical", security.revisionId, "security-impact"),
				effort: supported("small", security.revisionId, "security-effort"),
				riskOfInaction: supported("critical", security.revisionId, "security-inaction"),
			},
		},
		{
			changeId: "CHG-feature",
			changeRevisionId: feature.revisionId,
			...binding,
			dimensions: {
				urgency: supported("moderate", feature.revisionId, "feature-urgency"),
				expectedImpact: supported("high", feature.revisionId, "feature-impact"),
				strategicValue: supported("high", feature.revisionId, "feature-strategic"),
				effort: supported("tiny", feature.revisionId, "feature-effort"),
				riskOfInaction: supported("moderate", feature.revisionId, "feature-inaction"),
			},
		},
		{
			changeId: "CHG-cleanup",
			changeRevisionId: cleanup.revisionId,
			...binding,
			dimensions: {
				urgency: supported("low", cleanup.revisionId, "cleanup-urgency"),
				expectedImpact: supported("low", cleanup.revisionId, "cleanup-impact"),
				effort: supported("large", cleanup.revisionId, "cleanup-effort"),
				riskOfInaction: supported("low", cleanup.revisionId, "cleanup-inaction"),
			},
		},
	];
	return {state, graph, estimates, revisions: {security, feature, cleanup}};
}

describe("snapshot-bound Backlog Triage Projection", () => {
	it("projects provenance-bearing dimensions, frontier, fairness, and explainable default order", () => {
		const {state, graph, estimates} = fixture();
		const projection = buildBacklogTriageProjection({
			workState: state,
			graph,
			asOf: "2026-09-30T10:00:00.000Z",
			estimates,
		});
		assert.equal(projection.binding.workStateDigest, state.workStateDigest);
		assert.equal(projection.binding.graphSnapshotDigest, graph.graphSnapshotDigest);
		assert.equal(projection.coverage.eligibleChangeCount, 3);
		assert.equal(projection.coverage.projectedCandidateCount, 3);
		assert.equal(projection.coverage.truncated, false);
		assert.deepEqual(
			projection.candidates.map((candidate) => candidate.changeId),
			["CHG-security", "CHG-feature", "CHG-cleanup"],
		);

		const security = projection.candidates[0];
		assert.equal(security.defaultOrdering.tier, 1);
		assert.equal(
			security.defaultOrdering.reasons[0].code,
			"confirmed_protected_escalation",
		);
		assert.equal(security.dimensions.protectedEscalation.value, true);
		assert.equal(security.dimensions.protectedEscalation.basis.authority, "verified");
		assert.equal(security.declaredChangeRisk, "critical");
		assert.equal(security.defect.exposure, "broad");
		assert.equal(security.dimensions.strategicValue.value, "unknown");
		assert.equal(security.dimensions.implementationRisk.value, "unknown");
		assert.equal("overallScore" in security, false);
		assert.equal("priority" in security, false);
		assert.equal(security.overlap.status, "possible");
		assert.deepEqual(security.overlap.changeIds, ["CHG-feature"]);

		const feature = projection.candidates[1];
		assert.equal(feature.frontier.member, true);
		assert.equal(feature.defaultOrdering.tier, 3);
		assert.equal(feature.fairness.band, "established");
		assert.equal(feature.dimensions.expectedImpact.basis.authority, "asserted");
		assert.equal(feature.dimensions.strategicValue.value, "high");
		assert.deepEqual(feature.sourceKinds, ["user_suggestion"]);

		const cleanup = projection.candidates[2];
		assert.equal(cleanup.frontier.member, false);
		assert.equal(cleanup.fairness.ageBoostApplied, true);
		assert.equal(cleanup.defaultOrdering.tier, 5);

		const {projectionDigest, ...body} = projection;
		assert.equal(projectionDigest, canonicalJsonDigest(body));
		for (const candidate of projection.candidates) {
			const {candidateDigest, ...candidateBody} = candidate;
			assert.equal(candidateDigest, canonicalJsonDigest(candidateBody));
		}
		const replay = buildBacklogTriageProjection({
			workState: state,
			graph,
			asOf: "2026-09-30T10:00:00.000Z",
			estimates,
		});
		assert.equal(canonicalJson(replay), canonicalJson(projection));
	});

	it("applies protected source-bound preferences through fixed lexicographic criteria", () => {
		const {state, graph, estimates} = fixture();
		const policy = protectedPreferencePolicy(state);
		const projection = buildBacklogTriageProjection({
			workState: state,
			graph,
			policy,
			asOf: "2026-09-30T10:00:00.000Z",
			estimates,
		});
		assert.equal(projection.binding.triagePolicyDigest, policy.policyDigest);
		assert.equal("rank" in policy, false);
		assert.equal("score" in policy, false);
		assert.deepEqual(
			policy.criteria.map(({dimension, direction}) => ({dimension, direction})),
			[
				{dimension: "severity", direction: "descending"},
				{dimension: "exposure", direction: "descending"},
				{dimension: "age_fairness", direction: "descending"},
			],
		);

		const template = projection.candidates.find(
			(candidate) => candidate.changeId === "CHG-feature",
		);
		const defect = projection.candidates.find(
			(candidate) => candidate.changeId === "CHG-security",
		).defect;
		const lowerSeverity = structuredClone(template);
		lowerSeverity.changeId = "CHG-a-lower-severity";
		lowerSeverity.defect = {...defect, severity: "low"};
		const higherSeverity = structuredClone(template);
		higherSeverity.changeId = "CHG-z-higher-severity";
		higherSeverity.defect = {...defect, severity: "high"};
		assert.ok(compareTriageCandidates(lowerSeverity, higherSeverity) < 0);
		assert.ok(
			compareTriageCandidates(
				higherSeverity,
				lowerSeverity,
				"default",
				policy,
			) < 0,
		);

		const result = queryBacklogTriage(projection, {
			protocol: BACKLOG_TRIAGE_QUERY_PROTOCOL,
			projectionDigest: projection.projectionDigest,
			orderBy: "default",
			limit: 3,
		});
		assert.equal(result.triagePolicyDigest, policy.policyDigest);
		assert.match(
			result.items[0].orderingReasons[1].code,
			/^standard_preference_severity_/,
		);
		assert.ok(
			result.items[0].orderingReasons[1].refs.includes(
				policy.bindings[0].passageId,
			),
		);
		assert.ok(
			result.items[0].orderingReasons[1].refs.includes(
				result.items[0].candidate.defect.profileId,
			),
		);
	});

	it("keeps absence unknown and excludes Changes already routed into execution", () => {
		const journey = createThreeBatchJourney("CHG-active-triage");
		const pending = buildBacklogTriageProjection({
			workState: journey.states[0],
			graph: projectAlignmentGraph(journey.states[0]),
			asOf: "2026-08-01T13:00:00.000Z",
		});
		assert.equal(pending.candidates.length, 1);
		assert.equal(pending.candidates[0].overlap.status, "unknown");
		assert.equal(pending.candidates[0].dimensions.urgency.value, "unknown");
		assert.equal(pending.candidates[0].dimensions.effort.value, "unknown");

		const active = buildBacklogTriageProjection({
			workState: journey.states[1],
			graph: projectAlignmentGraph(journey.states[1]),
			asOf: "2026-08-01T13:00:00.000Z",
		});
		assert.equal(active.candidates.length, 0);
		assert.equal(active.coverage.totalChangeCount, 1);
	});

	it("binds exact graph relationships and elevates pending Changes blocking active work", () => {
		const journey = createThreeBatchJourney("CHG-active-target");
		const blockerRevision = revision("CHG-pending-blocker", {
			knowledgeRefs: ["kb:system/traces"],
			sourceRefs: ["src/change-trace"],
		});
		let state = openChange(journey.states[1], {
			changeId: "CHG-pending-blocker",
			revision: blockerRevision,
			recordedAt: "2026-08-01T12:00:00.000Z",
			stateHead: gitObject("c"),
		});
		state = recordRelationship(state, {
			sourceChangeId: "CHG-pending-blocker",
			targetChangeId: "CHG-active-target",
			type: "blocks",
			rationale: "Pending policy decision blocks exact active implementation.",
			recordedAt: "2026-08-01T12:01:00.000Z",
			stateHead: gitObject("d"),
		});
		const projection = buildBacklogTriageProjection({
			workState: state,
			graph: projectAlignmentGraph(state),
			asOf: "2026-08-02T12:00:00.000Z",
		});
		assert.equal(projection.candidates.length, 1);
		const blocker = projection.candidates[0];
		assert.equal(blocker.changeId, "CHG-pending-blocker");
		assert.equal(blocker.blocksActiveWork, true);
		assert.equal(blocker.dimensions.workUnblocked.value, 1);
		assert.equal(blocker.readiness.value, "suspected_conflict");
		assert.equal(blocker.defaultOrdering.tier, 2);
		assert.equal(blocker.defaultOrdering.reasons[0].code, "active_work_blocked");
		assert.ok(blocker.dimensions.workUnblocked.basis.canonicalRefs.length > 0);
	});

	it("fails closed on stale estimates, tampered graph facts, and noncanonical time", () => {
		const {state, graph, estimates} = fixture();
		const opaqueEstimate = structuredClone(estimates[0]);
		opaqueEstimate.overallScore = 99;
		assert.throws(
			() =>
				buildBacklogTriageProjection({
					workState: state,
					graph,
					asOf: "2026-09-30T10:00:00.000Z",
					estimates: [opaqueEstimate],
				}),
			/unsupported field overallScore/,
		);
		assert.throws(
			() =>
				buildBacklogTriageProjection({
					workState: state,
					graph,
					asOf: "2026-09-30T10:00:00.000Z",
					estimates: [estimates[0], estimates[0]],
				}),
			/received multiple estimates/,
		);
		const staleEstimate = structuredClone(estimates[0]);
		staleEstimate.graphContentDigest = `sha256:${"f".repeat(64)}`;
		assert.throws(
			() =>
				buildBacklogTriageProjection({
					workState: state,
					graph,
					asOf: "2026-09-30T10:00:00.000Z",
					estimates: [staleEstimate],
				}),
			/graphContentDigest does not match/,
		);
		const forgedAuthority = structuredClone(estimates[0]);
		forgedAuthority.dimensions.urgency.basis.authority = "approved";
		forgedAuthority.dimensions.urgency.basis.evidenceRefs = ["evidence:not-present"];
		assert.throws(
			() =>
				buildBacklogTriageProjection({
					workState: state,
					graph,
					asOf: "2026-09-30T10:00:00.000Z",
					estimates: [forgedAuthority],
				}),
			/lacks approved Evidence in the bound graph/,
		);
		const policy = protectedPreferencePolicy(state);
		const tamperedPolicy = structuredClone(policy);
		tamperedPolicy.criteria[0].direction = "ascending";
		assert.throws(
			() =>
				buildBacklogTriageProjection({
					workState: state,
					graph,
					policy: tamperedPolicy,
					asOf: "2026-09-30T10:00:00.000Z",
				}),
			/criteria are invalid/,
		);
		const wrongConfigPolicy = createBacklogTriagePolicy({
			projectConfigDigest: `sha256:${"e".repeat(64)}`,
			userStandards: [],
			bindings: [],
		});
		assert.throws(
			() =>
				buildBacklogTriageProjection({
					workState: state,
					graph,
					policy: wrongConfigPolicy,
					asOf: "2026-09-30T10:00:00.000Z",
				}),
			/does not match the WorkState config digest/,
		);
		const tamperedGraph = structuredClone(graph);
		tamperedGraph.edges[0].type = "tampered";
		assert.throws(
			() =>
				buildBacklogTriageProjection({
					workState: state,
					graph: tamperedGraph,
					asOf: "2026-09-30T10:00:00.000Z",
				}),
			/content digest is invalid/,
		);
		assert.throws(
			() =>
				buildBacklogTriageProjection({
					workState: state,
					graph,
					asOf: "2026-09-30",
				}),
			/canonical ISO timestamp/,
		);
	});
});

describe("authenticated exact-revision Decision attention selection", () => {
	it("binds one exact current projection and schedules one idempotent Decision job", async () => {
		const {state, graph, estimates} = fixture();
		const policy = protectedPreferencePolicy(state);
		const projection = buildBacklogTriageProjection({
			workState: state,
			graph,
			policy,
			asOf: "2026-09-30T10:00:00.000Z",
			estimates,
		});
		const candidate = projection.candidates.find(
			(entry) => entry.changeId === "CHG-feature",
		);
		const context = {workState: state, projection};
		const authorizationRequests = [];
		const runtime = createDecisionAttentionSelectionRuntime({
			loadCurrentContext: () => context,
			authorize(request) {
				authorizationRequests.push(request);
				return true;
			},
		});
		const command = selectionCommand(projection, candidate);
		const receipt = await runtime.execute({
			command,
			authority: selectionAuthority(),
		});

		assert.equal(receipt.protocolVersion, "1.0.0");
		assert.equal(receipt.binding.changeId, "CHG-feature");
		assert.equal(receipt.binding.changeRevisionId, candidate.changeRevisionId);
		assert.equal(receipt.binding.projectionDigest, projection.projectionDigest);
		assert.equal(receipt.binding.triagePolicyDigest, policy.policyDigest);
		assert.equal(receipt.authority.authenticationEvidenceId, "auth:decision-selector");
		assert.equal(authorizationRequests.length, 1);
		assert.equal(
			authorizationRequests[0].binding.triageCandidateDigest,
			candidate.candidateDigest,
		);
		assert.ok(receipt.conflictRefs.includes("change:CHG-feature"));
		assert.ok(receipt.conflictRefs.includes("source:src/shared.ts"));
		assert.doesNotThrow(() => assertDecisionAttentionSelectionReceipt(receipt));

		const repeated = await runtime.execute({
			command,
			authority: selectionAuthority(),
		});
		assert.equal(repeated.selectionId, receipt.selectionId);
		assert.equal(repeated.decisionJobId, receipt.decisionJobId);
		assert.equal(authorizationRequests.length, 1);

		const coordinator = new ProjectCoordinator(process.cwd(), {
			executionPolicy: "unattended",
			generationId: "decision-selection-test",
		});
		let runs = 0;
		const executor = {
			recover: () => undefined,
			run(input) {
				runs += 1;
				assert.equal(input.candidate.candidateDigest, candidate.candidateDigest);
				assert.equal(input.selection.selectionId, receipt.selectionId);
				return {selectionId: input.selection.selectionId};
			},
		};
		const first = await scheduleDecisionAttentionJob({
			coordinator,
			selection: receipt,
			loadCurrentContext: () => context,
			executor,
		});
		const replay = await scheduleDecisionAttentionJob({
			coordinator,
			selection: repeated,
			loadCurrentContext: () => context,
			executor,
		});
		assert.deepEqual(replay, first);
		assert.equal(runs, 1);
		coordinator.close();

		const restartedCoordinator = new ProjectCoordinator(process.cwd(), {
			executionPolicy: "unattended",
			generationId: "decision-selection-restart-test",
		});
		const recovered = await scheduleDecisionAttentionJob({
			coordinator: restartedCoordinator,
			selection: receipt,
			loadCurrentContext: () => context,
			executor: {
				recover: () => ({status: "completed", result: first}),
				run() {
					throw new Error("recovered Decision job must not rerun");
				},
			},
		});
		assert.deepEqual(recovered, first);
		restartedCoordinator.close();

		const serviceRoot = await mkdtemp(join(tmpdir(), "codewiki-selection-service-"));
		let service;
		let client;
		let remoteRuns = 0;
		try {
			service = await startProjectCoordinatorService(serviceRoot, {
				generationId: "decision-selection-service-test",
				decisionAttentionSelection: {
					async selectAndSchedule(input) {
						if (input.caller.supervision !== "approved") {
							throw new DecisionAttentionSelectionError({
								code: "forbidden",
								message: "Approved user supervision is required.",
							});
						}
						assert.equal(input.caller.clientId, "pi:decision-selector");
						assert.equal(input.caller.clientKind, "pi");
						const started = await selectAndScheduleDecisionAttentionJob({
							selectionRuntime: runtime,
							command: input.command,
							authority: selectionAuthority(),
							coordinator: input.coordinator,
							loadCurrentContext: () => context,
							executor: {
								recover: () => undefined,
								run(execution) {
									remoteRuns += 1;
									return execution.selection.selectionId;
								},
							},
						});
						return started.selection;
					},
				},
			});
			client = await connectProjectCoordinatorClient(serviceRoot, {
				clientId: "pi:decision-selector",
				kind: "pi",
				supervision: "approved",
			});
			const remote = await client.selectDecision(command);
			assert.equal(remote.selectionId, receipt.selectionId);
			assert.equal(remote.decisionJobId, receipt.decisionJobId);
			const remoteReplay = await client.selectDecision(command);
			assert.equal(remoteReplay.selectionId, remote.selectionId);
			assert.equal(remoteRuns, 1);
			await client.disconnect();
			client = await connectProjectCoordinatorClient(serviceRoot, {
				clientId: "dashboard:decision-observer",
				kind: "dashboard",
			});
			await assert.rejects(
				client.selectDecision(command),
				(error) =>
					error.status === 403 &&
					error.message === "Approved user supervision is required.",
			);
			await client.disconnect();
			client = undefined;
			await service.close();
			service = undefined;
		} finally {
			if (client) await client.disconnect().catch(() => undefined);
			if (service) await service.close().catch(() => undefined);
			await rm(serviceRoot, {recursive: true, force: true});
		}
	});

	it("serializes selected Decision jobs whose exact scope conflicts", async () => {
		const {state, graph, estimates} = fixture();
		const policy = protectedPreferencePolicy(state);
		const projection = buildBacklogTriageProjection({
			workState: state,
			graph,
			policy,
			asOf: "2026-09-30T10:00:00.000Z",
			estimates,
		});
		const context = {workState: state, projection};
		const runtime = createDecisionAttentionSelectionRuntime({
			loadCurrentContext: () => context,
			authorize: () => true,
		});
		const selected = await Promise.all(
			["CHG-feature", "CHG-security"].map((changeId) => {
				const candidate = projection.candidates.find(
					(entry) => entry.changeId === changeId,
				);
				return runtime.execute({
					command: selectionCommand(projection, candidate),
					authority: selectionAuthority(),
				});
			}),
		);
		assert.ok(
			selected.every((receipt) =>
				receipt.conflictRefs.includes("source:src/shared.ts"),
			),
		);

		const coordinator = new ProjectCoordinator(process.cwd(), {
			executionPolicy: "unattended",
			generationId: "decision-selection-conflict-test",
			maxConcurrentJobs: 2,
		});
		let releaseFirst;
		const firstGate = new Promise((resolve) => {
			releaseFirst = resolve;
		});
		const starts = [];
		const first = scheduleDecisionAttentionJob({
			coordinator,
			selection: selected[0],
			loadCurrentContext: () => context,
			executor: {
				recover: () => undefined,
				async run(input) {
					starts.push(input.selection.binding.changeId);
					await firstGate;
					return input.selection.selectionId;
				},
			},
		});
		const second = scheduleDecisionAttentionJob({
			coordinator,
			selection: selected[1],
			loadCurrentContext: () => context,
			executor: {
				recover: () => undefined,
				run(input) {
					starts.push(input.selection.binding.changeId);
					return input.selection.selectionId;
				},
			},
		});
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(starts, ["CHG-feature"]);
		releaseFirst();
		await Promise.all([first, second]);
		assert.deepEqual(starts, ["CHG-feature", "CHG-security"]);
		coordinator.close();
	});

	it("rejects stale, unauthenticated, denied, unsupported, and tampered selection", async () => {
		const {state, graph} = fixture();
		const policy = protectedPreferencePolicy(state);
		const projection = buildBacklogTriageProjection({
			workState: state,
			graph,
			policy,
			asOf: "2026-09-30T10:00:00.000Z",
		});
		const candidate = projection.candidates[0];
		const context = {workState: state, projection};
		const runtime = createDecisionAttentionSelectionRuntime({
			loadCurrentContext: () => context,
			authorize: () => true,
		});
		const command = selectionCommand(projection, candidate);

		await assert.rejects(
			runtime.execute({
				command: {
					...command,
					expectedProjectionDigest: `sha256:${"f".repeat(64)}`,
				},
				authority: selectionAuthority(),
			}),
			(error) => error.code === "conflict" && /projection is stale/.test(error.message),
		);
		await assert.rejects(
			runtime.execute({
				command: {
					...command,
					expectedProjectConfigDigest: `sha256:${"e".repeat(64)}`,
				},
				authority: selectionAuthority(),
			}),
			(error) =>
				error.code === "conflict" && /project config is stale/.test(error.message),
		);
		await assert.rejects(
			runtime.execute({
				command: {
					...command,
					expectedTriageCandidateDigest: `sha256:${"d".repeat(64)}`,
				},
				authority: selectionAuthority(),
			}),
			(error) =>
				error.code === "conflict" &&
				/triage candidate digest is stale/.test(error.message),
		);
		const driftedProjection = buildBacklogTriageProjection({
			workState: state,
			graph,
			policy,
			asOf: "2026-09-30T10:00:01.000Z",
		});
		let contextLoads = 0;
		const driftingRuntime = createDecisionAttentionSelectionRuntime({
			loadCurrentContext() {
				contextLoads += 1;
				return contextLoads === 1
					? context
					: {workState: state, projection: driftedProjection};
			},
			authorize: () => true,
		});
		await assert.rejects(
			driftingRuntime.execute({command, authority: selectionAuthority()}),
			(error) => error.code === "conflict" && /projection is stale/.test(error.message),
		);
		await assert.rejects(
			runtime.execute({
				command,
				authority: {...selectionAuthority(), authenticationEvidenceId: ""},
			}),
			/requires authentication Evidence/,
		);
		const denied = createDecisionAttentionSelectionRuntime({
			loadCurrentContext: () => context,
			authorize: () => false,
		});
		await assert.rejects(
			denied.execute({command, authority: selectionAuthority()}),
			(error) => error.code === "forbidden",
		);
		assert.throws(
			() => parseDecisionAttentionSelectionCommand({...command, rank: 1}),
			/unsupported field rank/,
		);

		const receipt = await runtime.execute({
			command,
			authority: selectionAuthority(),
		});
		await assert.rejects(
			runtime.execute({
				command,
				authority: {
					...selectionAuthority(),
					actorId: "different-selector",
					principalRef: "identity:different-selector",
				},
			}),
			(error) =>
				error.code === "conflict" && /idempotencyKey was already used/.test(error.message),
		);
		assert.throws(
			() =>
				assertDecisionAttentionSelectionReceipt({
					...receipt,
					binding: {
						...receipt.binding,
						triageCandidateDigest: `sha256:${"e".repeat(64)}`,
					},
				}),
			/command digest is invalid|id does not match/,
		);
	});
});

describe("bounded Backlog Triage query", () => {
	it("filters and orders one shared user/agent projection with exact reasons", () => {
		const {state, graph, estimates} = fixture();
		const projection = buildBacklogTriageProjection({
			workState: state,
			graph,
			asOf: "2026-09-30T10:00:00.000Z",
			estimates,
		});
		const result = queryBacklogTriage(projection, {
			protocol: BACKLOG_TRIAGE_QUERY_PROTOCOL,
			projectionDigest: projection.projectionDigest,
			filters: {
				categories: ["security"],
				efforts: ["small", "tiny"],
			},
			orderBy: "risk_of_inaction",
			limit: 10,
		});
		assert.equal(result.items.length, 1);
		assert.equal(result.items[0].candidate.changeId, "CHG-security");
		assert.equal(result.items[0].rank, 1);
		assert.match(result.items[0].orderingReasons[0].code, /risk_of_inaction/);
		assert.equal(result.workStateDigest, state.workStateDigest);
		assert.equal(result.graphContentDigest, graph.graphContentDigest);
		assert.equal(result.coverage.matchedCandidateCount, 1);
		assert.equal(result.coverage.truncated, false);
		const {resultDigest, ...body} = result;
		assert.equal(resultDigest, canonicalJsonDigest(body));
	});

	it("reports bounded truncation without creating mutable priority", () => {
		const {state, graph, estimates} = fixture();
		const projection = buildBacklogTriageProjection({
			workState: state,
			graph,
			asOf: "2026-09-30T10:00:00.000Z",
			estimates,
		});
		const result = queryBacklogTriage(projection, {
			protocol: BACKLOG_TRIAGE_QUERY_PROTOCOL,
			projectionDigest: projection.projectionDigest,
			orderBy: "oldest",
			limit: 1,
		});
		assert.equal(result.items.length, 1);
		assert.equal(result.items[0].candidate.changeId, "CHG-security");
		assert.equal(result.coverage.matchedCandidateCount, 3);
		assert.equal(result.coverage.truncated, true);
		assert.equal("priority" in result.items[0], false);
	});

	it("rejects stale projection identity, unsupported DSL fields, and unsafe bounds", () => {
		const {state, graph} = fixture();
		const projection = buildBacklogTriageProjection({
			workState: state,
			graph,
			asOf: "2026-09-30T10:00:00.000Z",
		});
		assert.throws(
			() =>
				queryBacklogTriage(projection, {
					protocol: BACKLOG_TRIAGE_QUERY_PROTOCOL,
					projectionDigest: `sha256:${"f".repeat(64)}`,
				}),
			/does not match current projection/,
		);
		assert.throws(
			() =>
				queryBacklogTriage(projection, {
					protocol: BACKLOG_TRIAGE_QUERY_PROTOCOL,
					projectionDigest: projection.projectionDigest,
					filters: {priority: ["critical"]},
				}),
			/unsupported field priority/,
		);
		assert.throws(
			() =>
				queryBacklogTriage(projection, {
					protocol: BACKLOG_TRIAGE_QUERY_PROTOCOL,
					projectionDigest: projection.projectionDigest,
					limit: 101,
				}),
			/limit must be an integer from 1 to 100/,
		);
	});
});
