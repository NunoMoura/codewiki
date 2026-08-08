import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {it} from "node:test";

import {
	createInitialProjectWorkState,
	synchronizeGitState,
} from "../../src/change-trace/index.ts";
import {resolveWikiConfig} from "../../src/project/config.ts";
import {wikiConfigDigest} from "../../src/project/config-digest.ts";
import {DECISION_ATTENTION_SELECTION_PROTOCOL} from "../../src/changes/triage/selection.ts";
import {createDecisionGitAdmission} from "../../src/runtime/decision-git-admission.ts";
import {createDecisionStartRuntime} from "../../src/runtime/decision-attention-selection.ts";
import {ProjectCoordinator} from "../../src/runtime/coordinator/project.ts";
import {
	allowAllReplayPolicy,
	buildOperationSequence,
	revisionFor,
} from "../helpers/change-trace-replay-v1.mjs";
import {authorityBinding, digest} from "../helpers/change-trace-v1.mjs";
import {
	createGitProposal,
	createTwoCloneFixture,
	git,
	pushGitProposal,
} from "../helpers/git-state-v1.mjs";

const repositoryIdentity = digest("a");

it("loads a protected bound triage context and appends one selected Decision attempt through Git CAS", async () => {
	const fixture = await createTwoCloneFixture();
	const coordinator = new ProjectCoordinator(fixture.cloneB, {
		generationId: "decision-git-admission-test",
		executionPolicy: "unattended",
	});
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
		const changeId = "CHG-decision-git-admission";
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
					recordedAt: "2026-08-02T08:00:00.000Z",
					payload: {origin: "user", provenanceRefs: ["request:git-admission"]},
				},
				{
					kind: "change.proposed",
					recordedAt: "2026-08-02T08:00:01.000Z",
					payload: {
						revision: revisionFor(changeId),
						provenance: {kind: "user", refs: ["request:git-admission"]},
					},
				},
			],
		}).operations;
		const opened = await createGitProposal(fixture.cloneA, initial, records);
		assert.equal(
			(await pushGitProposal(fixture.cloneA, opened.proposal)).status,
			"accepted",
		);

		let clock = Date.parse("2026-08-02T08:01:00.000Z");
		const admission = createDecisionGitAdmission({
			repoRoot: fixture.cloneB,
			remote: "origin",
			repositoryIdentity,
			currentProject: () => project,
			replayPolicy: allowAllReplayPolicy,
			now: () => new Date(clock),
			projectionTtlMs: 10_000,
		});
		const first = await admission.loadCurrentContext();
		clock += 1_000;
		const second = await admission.loadCurrentContext();
		assert.strictEqual(second, first);
		assert.equal(first.projection.binding.configDigest, project.configDigest);
		assert.equal(first.projection.candidates.length, 1);
		const candidate = first.projection.candidates[0];
		assert.equal(candidate.changeId, changeId);

		let runs = 0;
		let markRun;
		const ran = new Promise((resolve) => {
			markRun = resolve;
		});
		const runtime = createDecisionStartRuntime({
			coordinator,
			loadCurrentContext: admission.loadCurrentContext,
			authorize: () => true,
			appendAttempt: admission.appendAttempt,
			now: () => "2026-08-02T08:01:02.000Z",
			executor: {
				recover: () => undefined,
				run() {
					runs += 1;
					markRun();
				},
			},
		});
		const command = {
			protocolId: DECISION_ATTENTION_SELECTION_PROTOCOL.id,
			protocolVersion: DECISION_ATTENTION_SELECTION_PROTOCOL.version,
			idempotencyKey: "decision-git-admission-1",
			changeId,
			changeRevisionId: candidate.changeRevisionId,
			expectedProjectionDigest: first.projection.projectionDigest,
		};
		const authority = authorityBinding({
			authenticationEvidenceId: "auth:decision-git-admission",
		});
		const started = await runtime.start({command, authority});
		await ran;
		const replayed = await runtime.start({command, authority});
		assert.deepEqual(replayed, started);
		assert.equal(runs, 1);

		const synchronized = await synchronizeGitState({
			repoRoot: fixture.cloneB,
			remote: "origin",
			repositoryIdentity,
			currentProject: project,
			policy: allowAllReplayPolicy,
		});
		const acceptedAttempt = synchronized.workState.changes[0].loopAttempts[0];
		assert.equal(acceptedAttempt.operationId, started.attemptOperationId);
		assert.equal(acceptedAttempt.status, "active");
		assert.ok(acceptedAttempt.privateAttemptDigest);
	} finally {
		coordinator.close();
		await fixture.cleanup();
	}
});
