import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { changeTraceId } from "../../src/changes/trace/change-record.ts";
import {
	acceptChangeRecord,
	createChangeRecord,
} from "../../src/changes/records.ts";
import { ChangeTraceStore } from "../../src/changes/trace/store.ts";
import { createProjectServerClaimEvent } from "../../src/project-server/claims/events.ts";
import { appendTraceRecords } from "../../src/changes/trace/append.ts";
import { readTrace } from "../../src/changes/trace/reader.ts";
import { traceFilePath } from "../../src/changes/trace/schema.ts";
import { buildProjectWorkState } from "../../src/work-state/project.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";

const roots = [];
const CREATED_AT = "2026-08-01T01:00:00.000Z";

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function project() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-work-state-"));
	roots.push(root);
	return root;
}

async function acceptedChanges(root, ids) {
	const store = new ChangeTraceStore({ repoRoot: root });
	const records = ids.map((id) =>
		createChangeRecord(acceptedChangeFixture({ id })),
	);
	const created = await store.write({
		expectedHead: null,
		records,
		message: "Persist Changes",
		actor: "maintainer",
		createdAt: CREATED_AT,
	});
	const accepted = records.map((record) =>
		acceptChangeRecord(record, {
			changedBy: "maintainer",
			changedAt: "2026-08-01T01:01:00.000Z",
			authority: "user",
			ref: changeTraceId(record.change.id),
		}),
	);
	await store.write({
		expectedHead: created.head,
		records: accepted,
		message: "Approve exact Changes",
		actor: "maintainer",
		createdAt: "2026-08-01T01:01:00.000Z",
	});
	return accepted;
}

async function appendEvent(root, changeId, create) {
	const traceId = changeTraceId(changeId);
	const path = join(root, traceFilePath(traceId));
	const trace = await readTrace(path);
	const events = trace.records.filter(
		(record) => record.type === "trace_event",
	);
	const parent = trace.records.at(-1);
	const event = create({
		traceId,
		parentId: parent.type === "trace_head" ? null : parent.id,
		sequence: Math.max(0, ...events.map((candidate) => candidate.sequence)) + 1,
	});
	await appendTraceRecords(root, [event], (await stat(path)).size);
	return event;
}

function planningEvent(changeId, otherChangeId, workUnitId) {
	return ({ traceId, parentId, sequence }) => ({
		type: "trace_event",
		id: `evt-plan-${changeId}`,
		parentId,
		traceId,
		sequence,
		loop: "planning",
		event: "change_planned",
		refs: [`change:${changeId}@1`, `change:${otherChangeId}@1`],
		createdAt: "2026-08-01T01:02:00.000Z",
		data: {
			iteration: 1,
			trigger: "approved_change_portfolio_changed",
			output: {
				planningEpochId: "PE-shared-ui",
				participantChanges: [
					{ changeId, changeRevision: 1 },
					{ changeId: otherChangeId, changeRevision: 1 },
				],
				sprints: [
					{
						id: "SPR-shared-ui",
						digest: "sha256:sprint-plan",
						goal: "Deliver both related UI Changes",
						participatingChangeIds: [changeId, otherChangeId],
						workUnitIds: [workUnitId],
						rollbackBoundary: "Revert shared UI Sprint together.",
					},
				],
				workUnits: [
					{
						id: workUnitId,
						sprintId: "SPR-shared-ui",
						owningChangeId: changeId,
						contributingChangeIds: [],
						title: `Implement ${changeId}`,
						dependsOn: [],
						componentRefs: ["component:dashboard"],
						pathScopes: ["src/dashboard/**"],
						acceptanceCriteria: [{ id: `AC-${workUnitId}` }],
					},
				],
			},
			exit: { status: "exit", conditions: [] },
			progress: {},
		},
	});
}

describe("WorkState", () => {
	it("projects pending Change journeys without creating Sprint truth", async () => {
		const root = await project();
		const store = new ChangeTraceStore({ repoRoot: root });
		const record = createChangeRecord(
			acceptedChangeFixture({ id: "CHG-work-state-pending" }),
		);
		await store.write({
			expectedHead: null,
			records: [record],
			message: "Persist pending Change",
			actor: "maintainer",
			createdAt: CREATED_AT,
		});

		const state = await buildProjectWorkState({ repoRoot: root });
		assert.deepEqual(state.changeIds, [record.change.id]);
		assert.deepEqual(state.sprintIds, []);
		assert.equal(state.changes[0].approval.status, "pending");
		assert.equal(state.changes[0].currentLoop, "decision");
		assert.equal(state.sources.changeTraceCount, 1);
		assert.match(state.snapshotDigest, /^sha256:[a-f0-9]{64}$/);
	});

	it("joins one global Planning epoch across two Change Traces", async () => {
		const root = await project();
		await acceptedChanges(root, ["CHG-work-left", "CHG-work-right"]);
		await appendEvent(
			root,
			"CHG-work-left",
			planningEvent("CHG-work-left", "CHG-work-right", "WI-left"),
		);
		await appendEvent(
			root,
			"CHG-work-right",
			planningEvent("CHG-work-right", "CHG-work-left", "WI-right"),
		);

		const state = await buildProjectWorkState({ repoRoot: root });
		assert.deepEqual(state.sprintIds, ["SPR-shared-ui"]);
		assert.deepEqual(state.sprints[0].participatingChangeIds, [
			"CHG-work-left",
			"CHG-work-right",
		]);
		assert.deepEqual(state.sprints[0].workUnitIds, ["WI-left", "WI-right"]);
		assert.deepEqual(
			state.changes.map((change) => change.planningStatus),
			["planned", "planned"],
		);
		assert.deepEqual(
			state.workUnits.map((item) => item.owningChangeId),
			["CHG-work-left", "CHG-work-right"],
		);
		assert.deepEqual(state.blockers, []);
	});

	it("projects Assignments and accepted realization by owning Change", async () => {
		const root = await project();
		await acceptedChanges(root, ["CHG-assigned", "CHG-contributor"]);
		await appendEvent(
			root,
			"CHG-assigned",
			planningEvent("CHG-assigned", "CHG-contributor", "WI-assigned"),
		);
		await appendEvent(
			root,
			"CHG-contributor",
			planningEvent("CHG-contributor", "CHG-assigned", "WI-contributor"),
		);
		await appendEvent(root, "CHG-assigned", ({ traceId, parentId, sequence }) =>
			createProjectServerClaimEvent({
				traceId,
				id: "evt-claim-assigned",
				parentId,
				sequence,
				createdAt: "2026-08-01T01:03:00.000Z",
				claimId: "ASN-assigned",
				workerId: "worker-1",
				workUnitId: "WI-assigned",
				planningRefs: ["evt-plan-CHG-assigned#work-unit:WI-assigned"],
				pathScopes: ["src/dashboard/**"],
			}),
		);
		await appendEvent(
			root,
			"CHG-assigned",
			({ traceId, parentId, sequence }) => ({
				type: "trace_event",
				id: "evt-implementation-assigned",
				parentId,
				traceId,
				sequence,
				loop: "implementation",
				event: "evidence_accepted",
				refs: ["evt-plan-CHG-assigned#work-unit:WI-assigned"],
				createdAt: "2026-08-01T01:04:00.000Z",
				data: {
					iteration: 1,
					trigger: "worker_results",
					output: {
						coveredWorkUnitRefs: ["WI-assigned"],
					},
					exit: { status: "continue", conditions: [] },
					progress: {},
				},
			}),
		);
		await appendEvent(
			root,
			"CHG-assigned",
			({ traceId, parentId, sequence }) => ({
				type: "trace_event",
				id: "evt-integration-assigned",
				parentId,
				traceId,
				sequence,
				event: "runtime.integration.proven",
				refs: [
					"runtime-worker-report:assignment-1",
					`git-commit:${"a".repeat(40)}`,
					`git-tree:${"b".repeat(40)}`,
				],
				createdAt: "2026-08-01T01:05:00.000Z",
				data: {
					runtimeJobId: `implementation-integration:${"c".repeat(64)}`,
					workUnitId: "WI-assigned",
					targetRef: "project:default",
					targetRefs: [],
					baseCommit: "d".repeat(40),
					commit: "a".repeat(40),
					tree: "b".repeat(40),
					contentProof: `git-tree:${"b".repeat(40)}`,
					changedPaths: ["src/dashboard/state.ts"],
					workerReportRef: "runtime-worker-report:assignment-1",
				},
			}),
		);

		const state = await buildProjectWorkState({ repoRoot: root });
		assert.deepEqual(state.assignmentIds, ["ASN-assigned"]);
		assert.equal(state.assignments[0].owningChangeId, "CHG-assigned");
		assert.equal(
			state.workUnits.find((item) => item.id === "WI-assigned").implemented,
			true,
		);
		assert.equal(
			state.changes.find((change) => change.id === "CHG-assigned")
				.realizationStatus,
			"realized",
		);
		assert.equal(
			state.changes.find((change) => change.id === "CHG-contributor")
				.realizationStatus,
			"active",
		);
		assert.deepEqual(
			state.workUnits.find((item) => item.id === "WI-assigned")
				.integrationProofs,
			[
				{
					eventId: "evt-integration-assigned",
					jobId: `implementation-integration:${"c".repeat(64)}`,
					targetRef: "project:default",
					targetRefs: [],
					baseCommit: "d".repeat(40),
					commit: "a".repeat(40),
					tree: "b".repeat(40),
					contentProof: `git-tree:${"b".repeat(40)}`,
					changedPaths: ["src/dashboard/state.ts"],
					workerReportRef: "runtime-worker-report:assignment-1",
					integratedAt: "2026-08-01T01:05:00.000Z",
				},
			],
		);
	});

	it("fails incomplete multi-Change Planning epochs visibly", async () => {
		const root = await project();
		await acceptedChanges(root, ["CHG-partial-left", "CHG-partial-right"]);
		await appendEvent(
			root,
			"CHG-partial-left",
			planningEvent("CHG-partial-left", "CHG-partial-right", "WI-partial"),
		);

		const state = await buildProjectWorkState({ repoRoot: root });
		assert.equal(state.sprints[0].complete, false);
		assert.match(state.sprints[0].blockers[0], /missing Change Trace append/);
		assert.equal(
			state.changes.find((change) => change.id === "CHG-partial-left")
				.planningStatus,
			"incomplete_commit",
		);
	});

	it("keeps snapshot digest stable across render timestamps", async () => {
		const root = await project();
		await acceptedChanges(root, ["CHG-digest"]);
		const first = await buildProjectWorkState({
			repoRoot: root,
			generatedAt: "2026-08-01T01:05:00.000Z",
		});
		const second = await buildProjectWorkState({
			repoRoot: root,
			generatedAt: "2026-08-01T01:06:00.000Z",
		});
		assert.equal(first.snapshotDigest, second.snapshotDigest);
	});
});
