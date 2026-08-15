import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {it} from "node:test";

import {
	createInitialProjectWorkState,
	synchronizeGitState,
} from "../../../src/changes/trace/index.ts";
import {BACKLOG_TRIAGE_QUERY_PROTOCOL} from "../../../src/changes/triage/contracts.ts";
import {DECISION_ATTENTION_SELECTION_PROTOCOL} from "../../../src/changes/triage/selection.ts";
import {
	PI_NATIVE_DECISION_HOST_PROTOCOL,
	createPiNativeDecisionStartOptions,
	resolvePiDecisionSelectionAuthority,
} from "../../../src/execution/pi/native-decision-host.ts";
import {startPiProjectCoordinatorDaemon} from "../../../src/execution/pi/coordinator-daemon.ts";
import {resolveWikiConfig} from "../../../src/project/config.ts";
import {wikiConfigDigest} from "../../../src/project/config-file.ts";
import {createDecisionGitAdmission} from "../../../src/runtime/admission/git.ts";
import {connectProjectCoordinatorClient} from "../../../src/runtime/coordinator/service.ts";
import {
	allowAllReplayPolicy,
	buildOperationSequence,
	revisionFor,
} from "../../helpers/change-trace-replay-v1.mjs";
import {authorityBinding, digest} from "../../helpers/change-trace-v1.mjs";
import {
	createGitProposal,
	createTwoCloneFixture,
	git,
	pushGitProposal,
} from "../../helpers/git-state-v1.mjs";

const repositoryIdentity = digest("a");

it("rejects ambiguous raw and native Pi Decision host configuration", async () => {
	assert.equal(PI_NATIVE_DECISION_HOST_PROTOCOL.version, "2.0.0");
	assert.throws(
		() =>
			createPiNativeDecisionStartOptions({
				repoRoot: process.cwd(),
				createDecisionGate() {},
				decisionResearch: {},
			}),
		/either createDecisionGate or decisionResearch, not both/,
	);
	await assert.rejects(
		startPiProjectCoordinatorDaemon(process.cwd(), {
			loadSemanticAdapters: async () => undefined,
			decisionStart: {},
			nativeDecision: {},
		}),
		/either decisionStart or nativeDecision, not both/,
	);
});

it("derives selection authority only from approved Pi coordinator callers", () => {
	const caller = {
		clientId: "pi:test-client:session-1",
		clientKind: "pi",
		supervision: "approved",
		connectionId: "private-connection-capability",
		generationId: "coordinator:generation-1",
	};
	const first = resolvePiDecisionSelectionAuthority(caller);
	const reconnected = resolvePiDecisionSelectionAuthority({
		...caller,
		connectionId: "replacement-private-capability",
		generationId: "coordinator:generation-2",
	});
	assert.equal(first.actorId, reconnected.actorId);
	assert.equal(first.authenticatedIdentityRef, reconnected.authenticatedIdentityRef);
	assert.notEqual(
		first.authenticationEvidenceId,
		reconnected.authenticationEvidenceId,
	);
	assert.equal(first.role, "decision-selector");
	const persisted = JSON.stringify(first);
	assert.doesNotMatch(persisted, /test-client|private-connection|generation-1/);

	for (const denied of [
		{...caller, supervision: "observer"},
		{...caller, clientKind: "dashboard"},
	]) {
		assert.throws(
			() => resolvePiDecisionSelectionAuthority(denied),
			(error) => error?.code === "forbidden",
		);
	}
});

it("runs and recovers selected native Decision work through the default Pi host bundle", async () => {
	const fixture = await createTwoCloneFixture();
	let daemon;
	let client;
	try {
		await mkdir(join(fixture.cloneA, ".codewiki"), {recursive: true});
		await writeFile(join(fixture.cloneA, ".codewiki", "config.json"), "{}\n");
		await git(fixture.cloneA, ["add", ".codewiki/config.json"]);
		await git(fixture.cloneA, [
			"-c",
			"user.name=CodeWiki Test",
			"-c",
			"user.email=codewiki@example.invalid",
			"commit",
			"--quiet",
			"-m",
			"protected source",
		]);
		const sourceHead = (
			await git(fixture.cloneA, ["rev-parse", "HEAD"])
		).stdout.trim();
		await git(fixture.cloneA, ["push", "--quiet", "origin", "HEAD:main"]);
		await git(fixture.cloneB, [
			"fetch",
			"--quiet",
			"origin",
			"main:refs/remotes/origin/main",
		]);

		const project = {
			sourceHead,
			knowledgeDigest: digest("3"),
			configDigest: wikiConfigDigest(resolveWikiConfig({})),
			policyDigest: digest("5"),
		};
		const changeId = "CHG-pi-native-decision-host";
		const initial = createInitialProjectWorkState();
		const records = buildOperationSequence({
			changeId,
			baseSnapshot: {
				remoteStateHead: null,
				sourceHead: project.sourceHead,
				knowledgeDigest: project.knowledgeDigest,
				configDigest: project.configDigest,
				policyDigest: project.policyDigest,
			},
			specifications: [
				{
					kind: "trace.opened",
					recordedAt: "2026-08-02T09:00:00.000Z",
					payload: {origin: "user", provenanceRefs: ["request:pi-host"]},
				},
				{
					kind: "change.proposed",
					recordedAt: "2026-08-02T09:00:01.000Z",
					payload: {
						revision: revisionFor(changeId),
						provenance: {kind: "user", refs: ["request:pi-host"]},
					},
				},
			],
		}).operations;
		const opened = await createGitProposal(fixture.cloneA, initial, records);
		assert.equal(
			(await pushGitProposal(fixture.cloneA, opened.proposal)).status,
			"accepted",
		);

		const projectionNow = () => new Date("2026-08-02T09:01:00.000Z");
		const admission = createDecisionGitAdmission({
			repoRoot: fixture.cloneB,
			remote: "origin",
			repositoryIdentity,
			currentProject: () => project,
			replayPolicy: allowAllReplayPolicy,
			now: projectionNow,
		});
		const context = await admission.loadCurrentContext();
		const candidate = context.projection.candidates[0];
		assert.equal(candidate.changeId, changeId);
		const command = {
			protocolId: DECISION_ATTENTION_SELECTION_PROTOCOL.id,
			protocolVersion: DECISION_ATTENTION_SELECTION_PROTOCOL.version,
			idempotencyKey: "pi-native-decision-host-1",
			changeId,
			changeRevisionId: candidate.changeRevisionId,
			expectedProjectionDigest: context.projection.projectionDigest,
		};

		let producerRuns = 0;
		const nativeDecision = {
			remote: "origin",
			repositoryIdentity,
			currentProject: () => project,
			replayPolicy: allowAllReplayPolicy,
			runtimeAuthorityBinding: authorityBinding({
				actorId: "runtime-native-decision-host",
			}),
			projectionNow,
			now: () => "2026-08-02T09:01:02.000Z",
			semanticSession: {
				sessionFactory: async (input) => ({
					async prompt(prompt) {
						producerRuns += 1;
						assert.match(prompt, new RegExp(candidate.changeRevisionId));
						input.submitCandidate({
							disposition: "approve",
							rationale:
								"Exact authenticated Change semantics and native checks support approval.",
						});
					},
					dispose() {},
				}),
			},
		};
		const serviceNow = () => "2026-08-02T09:01:01.000Z";
		daemon = await startPiProjectCoordinatorDaemon(fixture.cloneB, {
			loadSemanticAdapters: async () => undefined,
			nativeDecision: {
				...nativeDecision,
				authorizeSelection: () => false,
			},
			now: serviceNow,
		});
		client = await connectProjectCoordinatorClient(fixture.cloneB, {
			clientId: "pi:native-decision-host-test",
			kind: "pi",
			supervision: "approved",
		});
		const attention = await client.decisionAttention();
		assert.deepEqual(attention.protocol, BACKLOG_TRIAGE_QUERY_PROTOCOL);
		assert.equal(attention.projectionDigest, context.projection.projectionDigest);
		assert.equal(attention.coverage.returnedCandidateCount, 1);
		assert.equal(attention.items[0].candidate.changeId, changeId);
		assert.equal(
			attention.items[0].candidate.changeRevisionId,
			candidate.changeRevisionId,
		);
		const exactQuery = await client.decisionAttention({
			protocol: BACKLOG_TRIAGE_QUERY_PROTOCOL,
			projectionDigest: attention.projectionDigest,
			filters: {changeIds: [changeId]},
			limit: 1,
		});
		assert.equal(exactQuery.projectionDigest, attention.projectionDigest);
		assert.equal(exactQuery.items[0].candidate.changeId, changeId);
		assert.notEqual(exactQuery.queryDigest, attention.queryDigest);
		await assert.rejects(
			client.decisionAttention({
				protocol: BACKLOG_TRIAGE_QUERY_PROTOCOL,
				projectionDigest: digest("f"),
			}),
			/projectionDigest does not match current projection/,
		);
		await assert.rejects(
			client.decisionAttention({
				protocol: BACKLOG_TRIAGE_QUERY_PROTOCOL,
				projectionDigest: attention.projectionDigest,
				unexpected: true,
			}),
			/unsupported field unexpected/,
		);
		await assert.rejects(
			client.selectDecision(command),
			/Decision attention selection authority was denied/,
		);
		assert.equal(producerRuns, 0);
		const deniedState = await synchronizeGitState({
			repoRoot: fixture.cloneB,
			remote: "origin",
			repositoryIdentity,
			currentProject: project,
			policy: allowAllReplayPolicy,
		});
		assert.equal(deniedState.workState.changes[0].loopAttempts.length, 0);
		await client.disconnect();
		client = undefined;
		await daemon.close();
		daemon = undefined;

		daemon = await startPiProjectCoordinatorDaemon(fixture.cloneB, {
			loadSemanticAdapters: async () => undefined,
			nativeDecision,
			now: serviceNow,
		});
		client = await connectProjectCoordinatorClient(fixture.cloneB, {
			clientId: "pi:native-decision-host-test",
			kind: "pi",
			supervision: "approved",
		});
		const started = await client.selectDecision(command);
		await waitForCompletedJob(daemon);
		assert.equal(producerRuns, 1);

		await client.disconnect();
		client = undefined;
		await daemon.close();
		daemon = undefined;

		const restarted = await startPiProjectCoordinatorDaemon(fixture.cloneB, {
			loadSemanticAdapters: async () => undefined,
			nativeDecision,
			now: serviceNow,
		});
		daemon = restarted;
		client = await connectProjectCoordinatorClient(fixture.cloneB, {
			clientId: "pi:native-decision-host-test",
			kind: "pi",
			supervision: "approved",
		});
		const recovered = await client.selectDecision(command);
		await waitForCompletedJob(restarted);
		assert.deepEqual(recovered, started);
		assert.equal(producerRuns, 1);

		const synchronized = await synchronizeGitState({
			repoRoot: fixture.cloneB,
			remote: "origin",
			repositoryIdentity,
			currentProject: project,
			policy: allowAllReplayPolicy,
		});
		const attempt = synchronized.workState.changes[0].loopAttempts[0];
		assert.equal(attempt.operationId, started.attemptOperationId);
		assert.notEqual(attempt.status, "active");
		assert.ok(attempt.currentCandidateId);
		assert.ok(attempt.exitReportOperationId);
		assert.ok(attempt.routeOperationId);
		assert.ok(attempt.terminalOperationId);
	} finally {
		await client?.disconnect().catch(() => undefined);
		await daemon?.close().catch(() => undefined);
		await fixture.cleanup();
	}
});

async function waitForCompletedJob(daemon, timeoutMs = 15_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const snapshot = daemon.coordinator.snapshot();
		if (snapshot.completedJobCount > 0) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(
		`Pi native Decision job did not complete: ${JSON.stringify(daemon.coordinator.snapshot())}`,
	);
}
