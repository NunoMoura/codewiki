import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import { runWikiDecide } from "../../src/api/wiki-decide.ts";
import { prepareAcceptedChangeBundle } from "../../src/changes/accepted-bundle.ts";
import { changeContentDigest } from "../../src/changes/digest.ts";
import { GitRefChangeStore } from "../../src/changes/git-ref-store.ts";
import { createChangeRecord } from "../../src/changes/records.ts";
import { CHANGE_SCHEMA_VERSION } from "../../src/changes/types.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { replayTrace } from "../../src/traces/replay.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { decisionQualityFields } from "../helpers/proposed-change.mjs";

const run = promisify(execFile);

function acceptedChange(id = "CHG-accepted-wiki-decide") {
	const change = {
		schemaVersion: CHANGE_SCHEMA_VERSION,
		id,
		revision: 1,
		status: "pending",
		intent: {
			question: "Should this validated Change become trace work?",
			currentState: "Decision input can be mutable.",
			desiredState: "Decision embeds an exact accepted Change bundle.",
			rationale: "Independent traces need immutable input.",
			nonGoals: [],
		},
		classification: {
			kind: "introduce",
			type: "workflow_change",
			scope: "system",
			affectedLayers: ["changes", "decision", "traces"],
			targetRefs: ["src/api/wiki-decide.ts"],
		},
		impact: {
			user: "The main session can continue after acceptance.",
			maintainer: "Trace input is replayable.",
		},
		evidence: {
			sourceRefs: ["kb:system/components/decision-loop.md"],
			proofRefs: ["tests/decision/wiki-decide.test.mjs"],
		},
		safety: {
			risk: "low",
			failureModes: ["A stale revision is accepted."],
		},
		validation: {
			state: "draft",
			issues: [],
			assessments: [],
			recommendations: [],
			successSignal: "Trace event contains the accepted bundle digest.",
			regressionPlan: "Run decision and trace replay tests.",
		},
		estimates: { effort: "low", workScale: "small" },
		provenance: {
			origin: "user",
			createdBy: "user",
			createdAt: "2026-06-11T00:00:01.000Z",
			updatedAt: "2026-06-11T00:00:01.000Z",
		},
	};
	const digest = changeContentDigest(change);
	change.validation = {
		...change.validation,
		state: "valid",
		validatedRevision: change.revision,
		validatedDigest: digest,
		validatorVersion: "test-v1",
	};
	return change;
}

function proposalInput(id = "SP-wiki-decide") {
	return {
		id,
		createdAt: "2026-06-11T00:00:01.000Z",
		updatedAt: "2026-06-11T00:00:01.000Z",
		changes: [
			{
				id: "CHG-wiki-decide",
				currentState: "Decision callers use iteration runner directly.",
				desiredState: "wiki_decide wraps decision output and append safely.",
				rationale: "Avoid split output/exit public workflow.",
				...decisionQualityFields(),
				approval: "approved",
				sourceRefs: ["kb:system/components/decision-loop.md"],
			},
		],
	};
}

describe("wiki_decide core facade", () => {
	it("rejects natural-language shortcut input instead of silently producing empty output", async () => {
		await assert.rejects(
			() =>
				runWikiDecide({
					intent: "Build a benchmark app",
					decision: "Proceed",
				}),
			/wiki_decide received unsupported input field intent/,
		);
		await assert.rejects(
			() => runWikiDecide({ proposalInput: proposalInput() }),
			/wiki_decide requires traceId/,
		);
	});

	it("previews decision loop iterations", async () => {
		const result = await runWikiDecide({
			mode: "preview",
			traceId: "TRACE-wiki-decide-preview",
			nextSequence: 2,
			createdAt: "2026-06-11T00:00:01.000Z",
			proposalInput: proposalInput(),
		});

		assert.equal(result.mode, "preview");
		assert.equal(result.iterationEvent.event, "changes_approved");
		assert.equal(result.iterationEvent.sequence, 2);
		assert.equal(result.loopResult.readyForPlanning, true);
		assert.equal(result.append, undefined);
		assert.match(
			result.renderedSprintProposal.markdown,
			/### Proposed Change: CHG-wiki-decide/,
		);
		assert.match(
			result.renderedSprintProposal.markdown,
			/\*\*Current state\*\*/,
		);
		assert.match(
			result.renderedSprintProposal.markdown,
			/\*\*Proposed change\*\*/,
		);
		assert.match(
			result.renderedSprintProposal.markdown,
			/\*\*Agent opinion\*\*/,
		);
		assert.match(result.renderedSprintProposal.digest, /^sha256:/);
	});

	it("routes low-risk scoped decisions directly to implementation", async () => {
		const result = await runWikiDecide({
			mode: "preview",
			traceId: "TRACE-wiki-decide-direct-implementation",
			nextSequence: 2,
			createdAt: "2026-06-11T00:00:01.000Z",
			proposalInput: proposalInput("SP-wiki-decide-direct"),
		});
		const change = result.iterationEvent.data.output.approvedChanges[0];

		assert.equal(result.loopResult.exit.route, "planning");
		assert.equal(change.routeTarget, "planning");

		const direct = await runWikiDecide({
			mode: "preview",
			traceId: "TRACE-wiki-decide-direct-implementation",
			nextSequence: 2,
			createdAt: "2026-06-11T00:00:01.000Z",
			proposalInput: {
				...proposalInput("SP-wiki-decide-direct"),
				changes: [
					{
						...proposalInput("SP-wiki-decide-direct").changes[0],
						routeTarget: "implementation",
						routeRationale:
							"The change is low-risk, scoped, and has targeted validation.",
						implementationMode: "targeted_checks",
						directImplementationScope: {
							pathScopes: ["src/pi/tools/index.ts"],
							verification: ["npm run typecheck"],
							acceptanceCriteria: [
								{
									id: "AC-DIRECT",
									text: "The small fix is validated without a planning loop.",
								},
							],
						},
					},
				],
			},
		});

		assert.equal(direct.loopResult.readyForPlanning, false);
		assert.equal(direct.loopResult.exit.route, "implementation");
		assert.equal(
			direct.iterationEvent.data.exit.routePlan.target,
			"implementation",
		);
		assert.equal(
			direct.iterationEvent.data.exit.routePlan.kind,
			"direct_implementation",
		);
		assert.equal(
			direct.iterationEvent.data.output.approvedChanges[0].implementationMode,
			"targeted_checks",
		);
	});

	it("binds accepted Change records into a recoverable trace input", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-wiki-decide-change-"));
		try {
			await run("git", ["init", "-q"], { cwd: root });
			const store = new GitRefChangeStore({ repoRoot: root });
			const record = createChangeRecord(acceptedChange());
			const seeded = await store.write({
				expectedHead: null,
				records: [record],
				message: "Seed validated Change",
				actor: "user",
				createdAt: "2026-06-11T00:00:01.000Z",
			});
			const traceId = "TRACE-wiki-decide-accepted-change";
			const changeAcceptance = {
				expectedHead: seeded.head,
				selections: [
					{
						changeId: record.change.id,
						revision: record.change.revision,
						recordRevision: record.recordRevision,
						contentDigest: changeContentDigest(record.change),
					},
				],
				acceptedBy: "user",
				acceptedAt: "2026-06-11T00:00:02.000Z",
			};
			const preview = await runWikiDecide({
				repoRoot: root,
				mode: "preview",
				traceId,
				nextSequence: 1,
				changeAcceptance,
			});
			assert.equal(
				preview.iterationEvent.data.output.acceptedChangeBundle.digest,
				preview.changeAcceptance.bundle.digest,
			);
			assert.match(
				preview.renderedSprintProposal.markdown,
				new RegExp(preview.changeAcceptance.bundle.digest),
			);
			assert.equal((await store.get(record.change.id)).change.status, "pending");

			const appendInput = {
				repoRoot: root,
				mode: "append",
				expectedBytes: 0,
				traceId,
				nextSequence: 1,
				changeAcceptance,
				sprintProposalApproval: {
					approved: true,
					renderedProposalDigest: preview.renderedSprintProposal.digest,
					approvedBy: changeAcceptance.acceptedBy,
					approvedAt: changeAcceptance.acceptedAt,
				},
			};
			await assert.rejects(
				() =>
					runWikiDecide({
						...appendInput,
						sprintProposalApproval: {
							...appendInput.sprintProposalApproval,
							approvedBy: "other-user",
						},
					}),
				/authority and timestamp/,
			);
			await assert.rejects(
				() =>
					runWikiDecide({
						...appendInput,
						expectedTraceId: "TRACE-wrong-boundary",
					}),
				/expected trace .* got/,
			);
			assert.equal((await store.get(record.change.id)).change.status, "pending");
			const interrupted = prepareAcceptedChangeBundle({
				traceId,
				expectedHead: seeded.head,
				snapshot: await store.read(),
				selections: changeAcceptance.selections,
				acceptedBy: changeAcceptance.acceptedBy,
				acceptedAt: changeAcceptance.acceptedAt,
			});
			await store.write({
				expectedHead: seeded.head,
				records: interrupted.records,
				message: "Simulate acceptance before interrupted trace append",
				actor: changeAcceptance.acceptedBy,
				createdAt: changeAcceptance.acceptedAt,
			});

			const result = await runWikiDecide(appendInput);
			assert.equal(result.changeAcceptance.recoveredAcceptance, true);
			const trace = await readTrace(join(root, traceFilePath(traceId)));
			assert.equal(
				trace.records[1].data.output.acceptedChangeBundle.digest,
				preview.changeAcceptance.bundle.digest,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("appends decision loop iterations atomically", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-wiki-decide-"));
		try {
			const traceId = "TRACE-wiki-decide-append";
			const preview = await runWikiDecide({
				mode: "preview",
				traceId,
				nextSequence: 1,
				createdAt: "2026-06-11T00:00:01.000Z",
				proposalInput: proposalInput(),
			});
			await assert.rejects(
				() =>
					runWikiDecide({
						repoRoot: root,
						mode: "append",
						expectedBytes: 0,
						traceId,
						nextSequence: 1,
						createdAt: "2026-06-11T00:00:01.000Z",
						proposalInput: proposalInput(),
					}),
				/rendered Sprint Proposal/,
			);
			await assert.rejects(
				() =>
					runWikiDecide({
						repoRoot: root,
						mode: "append",
						expectedBytes: 0,
						traceId,
						nextSequence: 1,
						createdAt: "2026-06-11T00:00:01.000Z",
						proposalInput: {
							...proposalInput(),
							changes: [
								{
									...proposalInput().changes[0],
									desiredState: "A changed proposal must need new approval.",
								},
							],
						},
						sprintProposalApproval: {
							approved: true,
							renderedProposalDigest: preview.renderedSprintProposal.digest,
						},
					}),
				/does not match the current rendered proposal/,
			);
			const result = await runWikiDecide({
				repoRoot: root,
				mode: "append",
				expectedBytes: 0,
				traceId,
				nextSequence: 1,
				createdAt: "2026-06-11T00:00:01.000Z",
				proposalInput: proposalInput(),
				sprintProposalApproval: {
					approved: true,
					renderedProposalDigest: preview.renderedSprintProposal.digest,
				},
			});
			const readBack = await readTrace(join(root, traceFilePath(traceId)));
			const state = replayTrace(readBack.records);

			assert.equal(result.mode, "append");
			assert.equal(result.append?.records.length, 3);
			assert.equal(readBack.records[0]?.type, "trace_head");
			assert.equal(readBack.records[0]?.traceId, traceId);
			assert.equal(state.events.at(-1)?.event, "changes_approved");
			assertQualityGraphIdentity(state.events.at(-1), "decision.loop");
			assert.equal(state.latestCheckpoint?.parentId, result.iterationEvent.id);
			assertQualityGraphIdentity(state.latestCheckpoint, "decision.loop");
			await assert.rejects(
				() =>
					runWikiDecide({
						repoRoot: root,
						mode: "append",
						traceId,
						proposalInput: proposalInput(),
						sprintProposalApproval: {
							approved: true,
							renderedProposalDigest: preview.renderedSprintProposal.digest,
						},
					}),
				/expectedBytes/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

function assertQualityGraphIdentity(record, graphId) {
	const outputGraph = record?.data?.output?.qualityGraph;
	const exitGraph = record?.data?.exit?.qualityGraph;
	const checkpointGraph = record?.data?.qualityGraph;
	const graph = outputGraph || exitGraph || checkpointGraph;
	assert.equal(graph?.id, graphId);
	assert.equal(graph?.version, "0.3.0.loop.6");
	assert.equal(graph?.schemaVersion, 3);
	assert.match(graph?.hash, /^sha256:/);
	if (outputGraph) assert.deepEqual(outputGraph, exitGraph);
}
