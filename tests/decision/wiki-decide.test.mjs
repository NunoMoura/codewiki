import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { traceFilePath } from "../../src/traces/schema.ts";

const run = promisify(execFile);

function acceptedChange(
	id = "CHG-accepted-wiki-decide",
	parentTraceId,
) {
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
			nonGoals: ["Do not widen scope beyond this Change."],
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
			...(parentTraceId
				? { discoveredWhile: { traceId: parentTraceId } }
				: {}),
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
			() =>
				runWikiDecide({
					traceId: "TRACE-legacy-proposal-input",
					proposalInput: { changes: [] },
				}),
			/unsupported input field proposalInput/,
		);
	});

	it("binds accepted Change records into a recoverable trace input", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-wiki-decide-change-"));
		try {
			await run("git", ["init", "-q"], { cwd: root });
			await mkdir(join(root, ".codewiki", "kb", "system", "components"), {
				recursive: true,
			});
			await writeFile(
				join(
					root,
					".codewiki",
					"kb",
					"system",
					"components",
					"decision-loop.md",
				),
				"# Decision Loop\n",
				"utf8",
			);
			const store = new GitRefChangeStore({ repoRoot: root });
			const record = createChangeRecord(
				acceptedChange(
					"CHG-accepted-wiki-decide",
					"TRACE-parent-sprint",
				),
			);
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
			const sprintBoundary = {
				accountableGoal: "Freeze one accepted Change into one Sprint.",
				knowledgeTopics: [".codewiki/kb/system/components/decision-loop.md"],
				dependencies: [],
				rollbackBoundary: "Revert Decision contract and trace input together.",
				assessment: {
					stance: "coherent",
					rationale: "One Change serves one trace-backed lifecycle goal.",
				},
			};
			await assert.rejects(
				() =>
					runWikiDecide({
						repoRoot: root,
						mode: "preview",
						traceId,
						nextSequence: 1,
						changeAcceptance,
					}),
				/requires sprintBoundary input/,
			);
			await assert.rejects(
				() =>
					runWikiDecide({
						repoRoot: root,
						mode: "preview",
						traceId,
						nextSequence: 1,
						changeAcceptance,
						sprintBoundary: { ...sprintBoundary, workItems: [] },
					}),
				/unsupported input field workItems/,
			);
			const preview = await runWikiDecide({
				repoRoot: root,
				mode: "preview",
				traceId,
				nextSequence: 1,
				changeAcceptance,
				sprintBoundary,
			});
			assert.equal(
				preview.iterationEvent.data.output.acceptedChangeBundle.digest,
				preview.changeAcceptance.bundle.digest,
			);
			assert.match(
				preview.renderedSprintProposal.markdown,
				new RegExp(preview.changeAcceptance.bundle.digest),
			);
			assert.equal(
				preview.loopResult.output.sprintBoundary.accountableGoal,
				sprintBoundary.accountableGoal,
			);
			assert.deepEqual(
				preview.loopResult.output.knowledgeAlignmentBaseline.topics.map(
					(topic) => topic.ref,
				),
				sprintBoundary.knowledgeTopics,
			);
			assert.match(
				preview.loopResult.output.knowledgeAlignmentBaseline.topics[0].digest,
				/^sha256:[a-f0-9]{64}$/,
			);
			assert.match(
				preview.renderedSprintProposal.markdown,
				/Knowledge topics:/,
			);
			assert.equal(
				(await store.get(record.change.id)).change.status,
				"pending",
			);

			const appendInput = {
				repoRoot: root,
				mode: "append",
				expectedBytes: 0,
				traceId,
				nextSequence: 1,
				changeAcceptance,
				sprintBoundary,
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
			assert.equal(
				(await store.get(record.change.id)).change.status,
				"pending",
			);
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
			assert.equal(trace.records[0].origin.kind, "amendment");
			assert.equal(
				trace.records[0].origin.parentTraceId,
				"TRACE-parent-sprint",
			);
			assert.equal(
				trace.records[1].data.output.acceptedChangeBundle.digest,
				preview.changeAcceptance.bundle.digest,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
