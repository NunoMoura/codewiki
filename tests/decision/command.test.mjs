import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { runWikiDecide } from "../../src/decision/command.ts";
import { CodewikiOperationError } from "../../src/error-handling/operation-errors.ts";
import { changeTraceId } from "../../src/changes/change-trace.ts";
import { changeContentDigest } from "../../src/changes/digest.ts";
import { createChangeRecord } from "../../src/changes/records.ts";
import { ChangeTraceStore } from "../../src/changes/trace-store.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { buildProjectWorkState } from "../../src/work-state/project.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";

const roots = [];
const AUTHORITY = {
	kind: "user",
	actor: "user:maintainer",
	ref: "approval:user:decision-v1",
};
const OCCURRED_AT = "2026-08-05T00:01:00.000Z";
const RATIONALE = "Approve exact validated Change revision.";

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function setup(overrides = {}) {
	const root = await mkdtemp(join(tmpdir(), "codewiki-wiki-decide-v2-"));
	roots.push(root);
	const record = createChangeRecord(
		acceptedChangeFixture({ id: "CHG-wiki-decide-v2", ...overrides }),
	);
	const store = new ChangeTraceStore({ repoRoot: root });
	await store.write({
		expectedHead: null,
		records: [record],
		message: "Persist Change",
		actor: "user:maintainer",
		createdAt: "2026-08-05T00:00:00.000Z",
	});
	return { root, record, store };
}

async function decisionInput(root, record, overrides = {}) {
	const traceId = changeTraceId(record.change.id);
	const path = join(root, traceFilePath(traceId));
	const workState = await buildProjectWorkState({ repoRoot: root });
	return {
		repoRoot: root,
		changeId: record.change.id,
		expectedRevision: record.change.revision,
		expectedChangeDigest: changeContentDigest(record.change),
		expectedWorkStateDigest: workState.snapshotDigest,
		expectedBytes: (await stat(path)).size,
		disposition: "approve",
		rationale: RATIONALE,
		authority: AUTHORITY,
		occurredAt: OCCURRED_AT,
		...overrides,
	};
}

describe("wiki_decide Change-revision facade", () => {
	it("previews one exact approval without mutating its Change Trace", async () => {
		const { root, record } = await setup();
		const traceId = changeTraceId(record.change.id);
		const path = join(root, traceFilePath(traceId));
		const before = await readTrace(path);
		const result = await runWikiDecide({
			...(await decisionInput(root, record)),
			mode: "preview",
		});
		const after = await readTrace(path);

		assert.equal(result.mode, "preview");
		assert.equal(result.traceId, traceId);
		assert.equal(result.report.exit.status, "exit");
		assert.equal(result.report.exit.nextLoop, "planning");
		assert.equal(result.report.approval.changeRevision, record.change.revision);
		assert.equal(
			result.report.approval.changeDigest,
			changeContentDigest(record.change),
		);
		assert.equal(result.report.approval.authorityRef, AUTHORITY.ref);
		assert.equal(result.event.event, "change_approved");
		assert.equal(result.append, undefined);
		assert.deepEqual(after.records, before.records);
		assert.equal(
			result.report.qualityStandards.every(
				(standard) => standard.status === "met",
			),
			true,
		);
	});

	it("appends approval and quality to the same Change Trace", async () => {
		const { root, record, store } = await setup();
		const result = await runWikiDecide({
			...(await decisionInput(root, record)),
			mode: "append",
		});
		const trace = await readTrace(
			join(root, traceFilePath(changeTraceId(record.change.id))),
		);
		const snapshot = await store.read();
		const workState = await buildProjectWorkState({ repoRoot: root });

		assert.equal(result.append.records.length, 1);
		assert.equal(result.record.change.status, "accepted");
		assert.equal(trace.records.length, 3);
		assert.equal(trace.records.at(-1).id, result.event.id);
		assert.equal(
			trace.records.at(-1).data.output.decision.approval.approvalRef,
			result.event.id,
		);
		assert.equal(
			trace.records.at(-1).data.output.acceptedChangeBundle,
			undefined,
		);
		assert.equal(snapshot.records[0].change.status, "accepted");
		assert.equal(workState.changes[0].approval.status, "approved");
		assert.equal(workState.changes[0].currentLoop, "planning");
		assert.deepEqual(
			(await readdir(join(root, ".codewiki", "traces"))).filter((file) =>
				file.endsWith(".jsonl"),
			),
			[`${changeTraceId(record.change.id)}.jsonl`],
		);
	});

	it("fails closed when Decision quality is incomplete", async () => {
		const { root, record } = await setup({
			knowledgeTopicRefs: [],
			knowledgePropagationRefs: [],
			knowledgeNoImpactRationale: undefined,
			recommendations: [],
		});
		const input = await decisionInput(root, record);
		const preview = await runWikiDecide({ ...input, mode: "preview" });

		assert.equal(preview.report.exit.status, "continue");
		assert.deepEqual(
			preview.report.qualityStandards
				.filter((standard) => standard.status !== "met")
				.map((standard) => standard.id),
			["recommendation_justified", "knowledge_impact_accounted"],
		);
		await assert.rejects(
			runWikiDecide({ ...input, mode: "append" }),
			/Decision quality did not exit/,
		);
	});

	it("rejects malformed command input with a structured operation error", async () => {
		await assert.rejects(
			() =>
				runWikiDecide({
					changeId: "CHG-operation-error",
					expectedRevision: 1,
					expectedChangeDigest: `sha256:${"0".repeat(64)}`,
					expectedWorkStateDigest: `sha256:${"1".repeat(64)}`,
					disposition: "approve",
					rationale: "Test invalid append guard.",
					mode: "append",
					repoRoot: ".",
					expectedBytes: -1,
				}),
			(error) => {
				assert.equal(error instanceof CodewikiOperationError, true);
				assert.equal(error.domain, "operation");
				assert.equal(error.code, "invalid_input");
				assert.equal(error.operation, "wiki_decide");
				assert.equal(error.field, "expectedBytes");
				assert.equal(error.suggestedAction, "fix_input");
				assert.deepEqual(error.data, {
					operation: "wiki_decide",
					field: "expectedBytes",
					value: -1,
				});
				return true;
			},
		);
	});

	it("rejects stale Change, WorkState, and trace-tail guards", async () => {
		const { root, record } = await setup();
		const input = await decisionInput(root, record);
		await assert.rejects(
			runWikiDecide({ ...input, expectedRevision: 2 }),
			/Change revision changed/,
		);
		await assert.rejects(
			runWikiDecide({
				...input,
				expectedChangeDigest: `sha256:${"0".repeat(64)}`,
			}),
			/Change digest changed/,
		);
		await assert.rejects(
			runWikiDecide({
				...input,
				expectedWorkStateDigest: `sha256:${"1".repeat(64)}`,
			}),
			/WorkState changed/,
		);
		await assert.rejects(
			runWikiDecide({ ...input, mode: "append", expectedBytes: 0 }),
			/trace bytes changed/,
		);
	});

	it("recovers an already-appended exact approval idempotently", async () => {
		const { root, record } = await setup();
		await runWikiDecide({
			...(await decisionInput(root, record)),
			mode: "append",
		});
		const store = new ChangeTraceStore({ repoRoot: root });
		const accepted = (await store.read()).records[0];
		const retry = await runWikiDecide({
			...(await decisionInput(root, accepted)),
			mode: "append",
		});

		assert.equal(retry.recovered, true);
		assert.equal(retry.append, undefined);
		assert.equal(retry.record.change.status, "accepted");
		assert.equal(retry.report.approval.approvalRef, retry.event.id);
	});

	it("records terminal rejection without creating Planning eligibility", async () => {
		const { root, record } = await setup({
			recommendations: [
				{
					actor: "agent:test",
					value: "reject",
					rationale: "Outcome does not justify implementation.",
					evidenceRefs: ["tests/decision/command.test.mjs"],
				},
			],
		});
		const result = await runWikiDecide({
			...(await decisionInput(root, record)),
			disposition: "reject",
			rationale: "Reject exact Change revision.",
			mode: "append",
		});
		const workState = await buildProjectWorkState({ repoRoot: root });

		assert.equal(result.record.change.status, "rejected");
		assert.equal(result.report.terminalDisposition.kind, "reject");
		assert.equal(result.event.event, "change_rejected");
		assert.equal(workState.changes[0].approval.status, "rejected");
		assert.equal(workState.changes[0].currentLoop, undefined);
	});
});
