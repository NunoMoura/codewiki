import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, it} from "node:test";

import {projectAlignmentGraph} from "../../src/alignment/graph.ts";
import {
	createChangeRevision,
	createInitialProjectWorkState,
} from "../../src/changes/trace/index.ts";
import {normalizeChangeDefectProfile} from "../../src/changes/defect-profile.ts";
import {createUserSuggestionMaterial} from "../../src/changes/intake/producers.ts";
import {BACKLOG_TRIAGE_QUERY_PROTOCOL} from "../../src/changes/triage/contracts.ts";
import {compareTriageCandidates} from "../../src/changes/triage/ordering.ts";
import {
	createBacklogTriagePolicy,
	createTriagePreferenceBinding,
} from "../../src/changes/triage/policy.ts";
import {
	DECISION_ATTENTION_SELECTION_PROTOCOL,
	DecisionAttentionSelectionError,
	parseDecisionAttentionSelectionCommand,
} from "../../src/changes/triage/selection.ts";
import {buildBacklogTriageProjection as buildBoundBacklogTriageProjection} from "../../src/changes/triage/projection.ts";
import {queryBacklogTriage} from "../../src/changes/triage/query.ts";
import {
	createUserStandardDefinition,
	createUserStandardSourceSnapshot,
} from "../../src/changes/triage/standards.ts";
import {createDecisionStartProjectServer} from "../../src/project-server/admission/start.ts";
import {ProjectCoordinator} from "../../src/project-server/coordinator/project.ts";
import {
	connectProjectCoordinatorClient,
	startProjectCoordinatorService,
} from "../../src/project-server/coordinator/service.ts";
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
		authenticatedIdentityRef: "identity:decision-selector",
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
		expectedProjectionDigest: projection.projectionDigest,
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

function revision(changeId, options = {}) {
	const topicRefs = options.topicRefs ?? [`kb:product/${changeId.toLowerCase()}`];
	const targetRefs = options.targetRefs ?? [`src/${changeId.toLowerCase()}.ts`];
	return createChangeRevision({
		title: `Decide ${changeId}`,
		intent: {
			currentState: `Determine exact intent for ${changeId}.`,
			desiredState: `Accepted behavior for ${changeId} is explicit.`,
			rationale: `Decision must preserve ${changeId} meaning.`,
			nonGoals: ["No mutable backlog."],
			alternatives: ["Leave intent unresolved."],
		},
		classification: {
			kind: "improve",
			type: "workflow_change",
			scope: "system",
			affectedLayers: ["runtime"],
			targetRefs,
		},
		impact: {user: `Accepted ${changeId} behavior is explicit.`},
		knowledge: {topicRefs, propagationRefs: []},
		outcome: {
			successSignals: [`Accepted behavior for ${changeId} is explicit.`],
			evidenceExpectations: ["Accepted meaning is explicit and testable."],
		},
		delivery: {
			constraints: ["Do not assign execution priority during triage."],
			planningQuestions: [],
		},
		evidence: {sourceRefs: targetRefs, proofRefs: ["tests:backlog-triage"]},
		safety: {
			risk: options.risk ?? "moderate",
			invariants: ["Triage grants no disposition authority."],
			failureModes: ["Stale intent is selected."],
		},
		acceptanceRequirements: [
			{id: "meaning", statement: "Accepted meaning is explicit and testable."},
		],
		...(options.defectProfile ? {defectProfile: options.defectProfile} : {}),
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
		topicRefs: ["kb:system/identity"],
		targetRefs: ["src/shared.ts", "src/auth/verify.ts"],
		defectProfile: criticalSecurityProfile(),
		risk: "critical",
	});
	const feature = revision("CHG-feature", {
		topicRefs: ["kb:product/feature"],
		targetRefs: ["src/shared.ts"],
		risk: "low",
	});
	const cleanup = revision("CHG-cleanup", {
		topicRefs: ["kb:system/cleanup"],
		targetRefs: ["src/cleanup.ts"],
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
			topicRefs: ["kb:system/traces"],
			targetRefs: ["src/changes/trace"],
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

function mutableDecisionSelectionContext(state, policy) {
	let currentState = state;
	let currentProjection = buildBacklogTriageProjection({
		workState: currentState,
		graph: projectAlignmentGraph(currentState),
		policy,
		asOf: "2026-09-30T10:00:00.000Z",
	});
	const appended = [];
	const stateHeads = ["d", "e", "f", "1", "2", "3"];
	return {
		appended,
		load() {
			return {workState: currentState, projection: currentProjection};
		},
		candidate(changeId) {
			return currentProjection.candidates.find(
				(candidate) => candidate.changeId === changeId,
			);
		},
		command(changeId) {
			const candidate = this.candidate(changeId);
			assert.ok(candidate, `missing triage candidate ${changeId}`);
			return selectionCommand(currentProjection, candidate);
		},
		appendAttempt(input) {
			assert.equal(input.expectedWorkStateDigest, currentState.workStateDigest);
			appended.push(input.operation);
			const nextHead = stateHeads.shift();
			assert.ok(nextHead, "selection test exhausted state heads");
			currentState = reduceBatch(
				currentState,
				[input.operation],
				gitObject(nextHead),
			);
			currentProjection = buildBacklogTriageProjection({
				workState: currentState,
				graph: projectAlignmentGraph(currentState),
				policy,
				asOf: "2026-09-30T10:00:00.000Z",
			});
			return input.operation.operationId;
		},
	};
}

describe("authenticated exact-revision Decision attention selection", () => {
	it("records one canonical attempt start and schedules it idempotently", async () => {
		const {state} = fixture();
		const policy = protectedPreferencePolicy(state);
		const context = mutableDecisionSelectionContext(state, policy);
		const command = context.command("CHG-feature");
		const authorizationRequests = [];
		const coordinator = new ProjectCoordinator(process.cwd(), {
			executionPolicy: "unattended",
			generationId: "decision-start-test",
		});
		let runs = 0;
		let markRun;
		const ran = new Promise((resolve) => {
			markRun = resolve;
		});
		const runtime = createDecisionStartProjectServer({
			coordinator,
			loadCurrentContext: context.load,
			authorize(request) {
				authorizationRequests.push(request);
				return true;
			},
			appendAttempt: context.appendAttempt,
			now: () => "2026-09-30T10:00:01.000Z",
			executor: {
				recover: () => undefined,
				run(input) {
					runs += 1;
					const persisted = context.load().workState.changes
						.find((change) => change.changeId === input.changeId)
						?.loopAttempts.some(
							(attempt) => attempt.operationId === input.attemptOperationId,
						);
					assert.equal(persisted, true);
					markRun(input);
					return input.attemptOperationId;
				},
			},
		});
		const [started, concurrentReplay] = await Promise.all([
			runtime.start({command, authority: selectionAuthority()}),
			runtime.start({command, authority: selectionAuthority()}),
		]);
		assert.deepEqual(concurrentReplay, started);
		const execution = await ran;
		assert.deepEqual(Object.keys(started), ["attemptOperationId"]);
		assert.equal(execution.attemptOperationId, started.attemptOperationId);
		assert.equal(execution.changeId, "CHG-feature");
		assert.equal(context.appended.length, 1);
		const attempt = context.appended[0];
		assert.equal(attempt.operationId, started.attemptOperationId);
		assert.equal(attempt.body.kind, "loop.attempt_started");
		assert.equal(attempt.body.payload.loop, "decision");
		assert.equal(attempt.body.payload.changeRevisionId, command.changeRevisionId);
		assert.match(attempt.body.payload.privateAttemptDigest, /^sha256:[0-9a-f]{64}$/u);
		assert.equal(
			attempt.body.authorityBinding.authenticationEvidenceId,
			"auth:decision-selector",
		);
		assert.ok(
			authorizationRequests.length >= 1 && authorizationRequests.length <= 2,
		);
		const authorizationCount = authorizationRequests.length;
		assert.deepEqual(Object.keys(authorizationRequests[0]).sort(), [
			"action",
			"authority",
			"changeId",
			"changeRevisionId",
			"commandDigest",
			"projectionDigest",
		]);
		assert.equal(
			authorizationRequests[0].projectionDigest,
			command.expectedProjectionDigest,
		);

		const replay = await runtime.start({
			command,
			authority: selectionAuthority(),
		});
		assert.deepEqual(replay, started);
		assert.equal(context.appended.length, 1);
		assert.equal(authorizationRequests.length, authorizationCount);
		assert.equal(runs, 1);
		coordinator.close();

		const restartedCoordinator = new ProjectCoordinator(process.cwd(), {
			executionPolicy: "unattended",
			generationId: "decision-start-recovery-test",
		});
		let markRecovered;
		const recovered = new Promise((resolve) => {
			markRecovered = resolve;
		});
		const restarted = createDecisionStartProjectServer({
			coordinator: restartedCoordinator,
			loadCurrentContext: context.load,
			authorize: () => {
				throw new Error("canonical replay must not reauthorize");
			},
			appendAttempt: () => {
				throw new Error("canonical replay must not append");
			},
			executor: {
				recover(input) {
					markRecovered(input);
					return {status: "completed", result: input.attemptOperationId};
				},
				run() {
					throw new Error("recovered Decision attempt must not rerun");
				},
			},
		});
		assert.deepEqual(
			await restarted.start({command, authority: selectionAuthority()}),
			started,
		);
		assert.equal((await recovered).attemptOperationId, started.attemptOperationId);
		restartedCoordinator.close();
	});

	it("resolves trusted caller authority before starting through remote service", async () => {
		const {state} = fixture();
		const policy = protectedPreferencePolicy(state);
		const context = mutableDecisionSelectionContext(state, policy);
		const command = context.command("CHG-feature");
		const serviceRoot = await mkdtemp(join(tmpdir(), "codewiki-decision-start-"));
		let service;
		let client;
		let remoteRuns = 0;
		let markRun;
		const ran = new Promise((resolve) => {
			markRun = resolve;
		});
		try {
			service = await startProjectCoordinatorService(serviceRoot, {
				generationId: "decision-start-service-test",
				decisionStart: {
					resolveAuthority(caller) {
						if (caller.supervision !== "approved") {
							throw new DecisionAttentionSelectionError({
								code: "forbidden",
								message: "Approved user supervision is required.",
							});
						}
						assert.equal(caller.clientId, "pi:decision-selector");
						assert.equal(caller.clientKind, "pi");
						return selectionAuthority();
					},
					loadCurrentContext: context.load,
					authorize: () => true,
					appendAttempt: context.appendAttempt,
					executor: {
						recover: () => undefined,
						run(input) {
							remoteRuns += 1;
							markRun(input);
							return input.attemptOperationId;
						},
					},
				},
			});
			client = await connectProjectCoordinatorClient(serviceRoot, {
				clientId: "pi:decision-selector",
				kind: "pi",
				supervision: "approved",
			});
			const started = await client.selectDecision(command);
			assert.equal((await ran).attemptOperationId, started.attemptOperationId);
			assert.deepEqual(await client.selectDecision(command), started);
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

	it("fails closed when canonical Decision start capabilities are unavailable", async () => {
		const {state} = fixture();
		const policy = protectedPreferencePolicy(state);
		const context = mutableDecisionSelectionContext(state, policy);
		const serviceRoot = await mkdtemp(join(tmpdir(), "codewiki-decision-unavailable-"));
		const service = await startProjectCoordinatorService(serviceRoot, {
			generationId: "decision-start-unavailable-test",
		});
		const client = await connectProjectCoordinatorClient(serviceRoot, {
			clientId: "pi:decision-selector",
			kind: "pi",
			supervision: "approved",
		});
		try {
			await assert.rejects(
				client.selectDecision(context.command("CHG-feature")),
				(error) =>
					error.status === 503 &&
					error.message === "decision_attention_selection_unavailable",
			);
		} finally {
			await client.disconnect().catch(() => undefined);
			await service.close().catch(() => undefined);
			await rm(serviceRoot, {recursive: true, force: true});
		}
	});

	it("serializes canonical Decision attempts whose revision scopes conflict", async () => {
		const {state} = fixture();
		const policy = protectedPreferencePolicy(state);
		const context = mutableDecisionSelectionContext(state, policy);
		const coordinator = new ProjectCoordinator(process.cwd(), {
			executionPolicy: "unattended",
			generationId: "decision-start-conflict-test",
			maxConcurrentJobs: 2,
		});
		let releaseFirst;
		const firstGate = new Promise((resolve) => {
			releaseFirst = resolve;
		});
		let finishAll;
		const finished = new Promise((resolve) => {
			finishAll = resolve;
		});
		const starts = [];
		let completions = 0;
		const runtime = createDecisionStartProjectServer({
			coordinator,
			loadCurrentContext: context.load,
			authorize: () => true,
			appendAttempt: context.appendAttempt,
			executor: {
				recover: () => undefined,
				async run(input) {
					starts.push(input.changeId);
					if (input.changeId === "CHG-feature") await firstGate;
					completions += 1;
					if (completions === 2) finishAll();
					return input.attemptOperationId;
				},
			},
		});
		await runtime.start({
			command: context.command("CHG-feature"),
			authority: selectionAuthority(),
		});
		await runtime.start({
			command: context.command("CHG-security"),
			authority: {
				...selectionAuthority(),
				authenticationEvidenceId: "auth:decision-selector:second",
			},
		});
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(starts, ["CHG-feature"]);
		releaseFirst();
		await finished;
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(starts, ["CHG-feature", "CHG-security"]);
		coordinator.close();
	});

	it("rejects stale, unauthenticated, denied, conflicting, and extra input", async () => {
		const {state} = fixture();
		const policy = protectedPreferencePolicy(state);
		const context = mutableDecisionSelectionContext(state, policy);
		const coordinator = new ProjectCoordinator(process.cwd(), {
			executionPolicy: "unattended",
			generationId: "decision-start-rejection-test",
		});
		const runtime = createDecisionStartProjectServer({
			coordinator,
			loadCurrentContext: context.load,
			authorize: () => true,
			appendAttempt: context.appendAttempt,
			executor: {recover: () => undefined, run: () => undefined},
		});
		const command = context.command("CHG-feature");
		await assert.rejects(
			runtime.start({
				command: {
					...command,
					expectedProjectionDigest: `sha256:${"f".repeat(64)}`,
				},
				authority: selectionAuthority(),
			}),
			(error) => error.code === "conflict" && /projection is stale/.test(error.message),
		);
		await assert.rejects(
			runtime.start({
				command,
				authority: {...selectionAuthority(), authenticationEvidenceId: ""},
			}),
			/requires authentication Evidence/,
		);
		const beforeAuthorization = context.load();
		const driftedProjection = buildBacklogTriageProjection({
			workState: beforeAuthorization.workState,
			graph: projectAlignmentGraph(beforeAuthorization.workState),
			policy,
			asOf: "2026-09-30T10:00:01.000Z",
		});
		let contextLoads = 0;
		const drifting = createDecisionStartProjectServer({
			coordinator,
			loadCurrentContext() {
				contextLoads += 1;
				return contextLoads === 1
					? beforeAuthorization
					: {
							workState: beforeAuthorization.workState,
							projection: driftedProjection,
						};
			},
			authorize: () => true,
			appendAttempt: () => {
				throw new Error("drifted selection must not append");
			},
			executor: {recover: () => undefined, run: () => undefined},
		});
		await assert.rejects(
			drifting.start({command, authority: selectionAuthority()}),
			(error) => error.code === "conflict" && /projection is stale/.test(error.message),
		);
		const denied = createDecisionStartProjectServer({
			coordinator,
			loadCurrentContext: context.load,
			authorize: () => false,
			appendAttempt: context.appendAttempt,
			executor: {recover: () => undefined, run: () => undefined},
		});
		await assert.rejects(
			denied.start({command, authority: selectionAuthority()}),
			(error) => error.code === "forbidden",
		);
		assert.throws(
			() => parseDecisionAttentionSelectionCommand({...command, rank: 1}),
			/unsupported field rank/,
		);
		assert.throws(
			() =>
				parseDecisionAttentionSelectionCommand({
					...command,
					expectedWorkStateDigest: state.workStateDigest,
				}),
			/unsupported field expectedWorkStateDigest/,
		);

		const started = await runtime.start({command, authority: selectionAuthority()});
		const otherCandidate = context.candidate("CHG-security");
		assert.ok(otherCandidate);
		await assert.rejects(
			runtime.start({
				command: {
					...selectionCommand(context.load().projection, otherCandidate),
					idempotencyKey: command.idempotencyKey,
				},
				authority: selectionAuthority(),
			}),
			(error) =>
				error.code === "conflict" &&
				/idempotencyKey was already used/.test(error.message),
		);
		assert.equal(context.appended[0].operationId, started.attemptOperationId);
		coordinator.close();
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
