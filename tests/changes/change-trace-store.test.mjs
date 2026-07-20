import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
	changeRecordFromTrace,
	changeTraceId,
} from "../../src/changes/change-trace.ts";
import {
	addChangeEvidence,
	createChangeRecord,
	linkChangeRecord,
} from "../../src/changes/records.ts";
import { ChangeStoreConflictError } from "../../src/changes/store.ts";
import { ChangeTraceStore } from "../../src/changes/trace-store.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";

const roots = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function project() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-change-trace-store-"));
	roots.push(root);
	return root;
}

describe("Change Trace Store", () => {
	it("persists first intent as one bound JSONL Change Trace", async () => {
		const root = await project();
		const store = new ChangeTraceStore({ repoRoot: root });
		assert.deepEqual(await store.read(), { head: null, records: [] });

		const record = createChangeRecord(
			acceptedChangeFixture({ id: "CHG-trace-store" }),
		);
		const written = await store.write({
			expectedHead: null,
			records: [record],
			message: "Persist Change intent",
			actor: "maintainer",
			createdAt: record.change.provenance.createdAt,
		});

		assert.match(written.head, /^[a-f0-9]{40}$/);
		const traceId = changeTraceId(record.change.id);
		const trace = await readTrace(join(root, traceFilePath(traceId)));
		assert.equal(trace.head.changeId, record.change.id);
		assert.equal(trace.records.length, 2);
		assert.equal(trace.records[1].loop, "decision");
		assert.equal(trace.records[1].event, "change_received");
		assert.deepEqual(changeRecordFromTrace(trace.records), record);
		await assert.rejects(
			readFile(join(root, ".git", "refs", "codewiki", "changes"), "utf8"),
			/ENOENT/,
		);
	});

	it("appends revisions while retaining the complete Change journey", async () => {
		const root = await project();
		const store = new ChangeTraceStore({ repoRoot: root });
		const initial = createChangeRecord(
			acceptedChangeFixture({ id: "CHG-trace-revision" }),
		);
		const first = await store.write({
			expectedHead: null,
			records: [initial],
			message: "Persist Change",
			actor: "maintainer",
			createdAt: initial.change.provenance.createdAt,
		});
		const revised = addChangeEvidence(initial, {
			sourceRefs: ["src/changes/trace-store.ts"],
			proofRefs: ["tests/changes/change-trace-store.test.mjs"],
			updatedBy: "maintainer",
			updatedAt: "2026-08-01T00:01:00.000Z",
		});
		const second = await store.write({
			expectedHead: first.head,
			records: [revised],
			message: "Add Change evidence",
			actor: "maintainer",
			createdAt: "2026-08-01T00:01:00.000Z",
		});

		assert.notEqual(second.head, first.head);
		assert.deepEqual(await store.get(initial.change.id), revised);
		const trace = await readTrace(
			join(root, traceFilePath(changeTraceId(initial.change.id))),
		);
		assert.deepEqual(
			trace.records
				.filter((record) => record.type === "trace_event")
				.map((event) => event.event),
			["change_received", "change_revised"],
		);
		assert.equal(trace.records[2].parentId, trace.records[1].id);
	});

	it("writes one deterministic batch identity across linked Change traces", async () => {
		const root = await project();
		const store = new ChangeTraceStore({ repoRoot: root });
		const left = createChangeRecord(
			acceptedChangeFixture({ id: "CHG-batch-left" }),
		);
		const right = createChangeRecord(
			acceptedChangeFixture({ id: "CHG-batch-right" }),
		);
		const initial = await store.write({
			expectedHead: null,
			records: [left, right],
			message: "Persist related Changes",
			actor: "maintainer",
			createdAt: left.change.provenance.createdAt,
		});
		const linkedLeft = linkChangeRecord(left, {
			relation: "related",
			targetChangeId: right.change.id,
			createdBy: "maintainer",
			createdAt: "2026-08-01T00:02:00.000Z",
		});
		const linkedRight = linkChangeRecord(right, {
			relation: "related",
			targetChangeId: left.change.id,
			createdBy: "maintainer",
			createdAt: "2026-08-01T00:02:00.000Z",
		});
		await store.write({
			expectedHead: initial.head,
			records: [linkedLeft, linkedRight],
			message: "Link related Changes",
			actor: "maintainer",
			createdAt: "2026-08-01T00:02:00.000Z",
		});

		const events = await Promise.all(
			[left, right].map(async (record) => {
				const trace = await readTrace(
					join(root, traceFilePath(changeTraceId(record.change.id))),
				);
				return trace.records.at(-1);
			}),
		);
		assert.equal(
			events[0].data.output.batch.id,
			events[1].data.output.batch.id,
		);
		assert.equal(
			events[0].data.output.batch.digest,
			events[1].data.output.batch.digest,
		);
		assert.deepEqual(events[0].data.output.batch.changeIds, [
			"CHG-batch-left",
			"CHG-batch-right",
		]);
	});

	it("rejects stale store heads and record revisions", async () => {
		const root = await project();
		const store = new ChangeTraceStore({ repoRoot: root });
		const record = createChangeRecord(
			acceptedChangeFixture({ id: "CHG-trace-cas" }),
		);
		const first = await store.write({
			expectedHead: null,
			records: [record],
			message: "Persist Change",
			actor: "maintainer",
			createdAt: record.change.provenance.createdAt,
		});
		const revised = addChangeEvidence(record, {
			sourceRefs: ["src/changes/trace-store.ts"],
			updatedBy: "maintainer",
			updatedAt: "2026-08-01T00:03:00.000Z",
		});
		await store.write({
			expectedHead: first.head,
			records: [revised],
			message: "Revise Change",
			actor: "maintainer",
			createdAt: "2026-08-01T00:03:00.000Z",
		});
		await assert.rejects(
			store.write({
				expectedHead: first.head,
				records: [revised],
				message: "Stale revision",
				actor: "stale-agent",
				createdAt: "2026-08-01T00:04:00.000Z",
			}),
			ChangeStoreConflictError,
		);
	});
});
