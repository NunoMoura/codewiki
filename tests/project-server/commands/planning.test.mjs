import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { runWikiDecide } from "../../../src/loops/decision/command.ts";
import { runWikiPlan } from "../../../src/project-server/commands/planning.ts";
import { changeTraceId } from "../../../src/changes/trace/change-record.ts";
import { changeContentDigest } from "../../../src/changes/digest.ts";
import {
	createChangeRecord,
	linkChangeRecord,
} from "../../../src/changes/records.ts";
import { ChangeTraceStore } from "../../../src/changes/trace/store.ts";
import { readTrace } from "../../../src/changes/trace/reader.ts";
import { traceFilePath } from "../../../src/changes/trace/schema.ts";
import { selectProjectServerReaction } from "../../../src/project-server/coordinator/reactor.ts";
import { buildProjectWorkState } from "../../../src/work-state/project.ts";
import { acceptedChangeFixture } from "../../helpers/accepted-change.mjs";

const roots = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function setupApprovedPortfolio() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-wiki-plan-v2-"));
	roots.push(root);
	const records = [
		createChangeRecord(
			acceptedChangeFixture({
				id: "CHG-plan-a",
				createdAt: "2026-08-06T00:00:00.000Z",
				targetRefs: ["src/shared.ts"],
			}),
		),
		createChangeRecord(
			acceptedChangeFixture({
				id: "CHG-plan-b",
				createdAt: "2026-08-06T00:00:01.000Z",
				targetRefs: ["src/shared.ts"],
			}),
		),
	];
	const store = new ChangeTraceStore({ repoRoot: root });
	const persisted = await store.write({
		expectedHead: null,
		records,
		message: "Persist Planning portfolio",
		actor: "user",
		createdAt: "2026-08-06T00:00:00.000Z",
	});
	const linked = linkChangeRecord(records[0], {
		relation: "related",
		targetChangeId: records[1].change.id,
		createdBy: "user",
		createdAt: "2026-08-06T00:00:02.000Z",
	});
	await store.write({
		expectedHead: persisted.head,
		records: [linked],
		message: "Relate overlapping Changes",
		actor: "user",
		createdAt: "2026-08-06T00:00:02.000Z",
	});
	records[0] = linked;
	for (let index = 0; index < records.length; index += 1) {
		const workState = await buildProjectWorkState({repoRoot: root});
		const record = records[index];
		const changeId = record.change.id;
		const path = join(root, traceFilePath(changeTraceId(changeId)));
		await runWikiDecide({
			repoRoot: root,
			mode: "append",
			changeId,
			expectedRevision: record.change.revision,
			expectedChangeDigest: changeContentDigest(record.change),
			expectedWorkStateDigest: workState.snapshotDigest,
			expectedBytes: (await stat(path)).size,
			disposition: "approve",
			rationale: `Approve ${changeId} for portfolio Planning.`,
			authority: {
				kind: "user",
				actor: "user",
				ref: `approval:user:${changeId}`,
			},
			occurredAt: `2026-08-06T00:01:0${index}.000Z`,
		});
	}
	return { root, records };
}

async function planningInput(root, overrides = {}) {
	const workState = await buildProjectWorkState({ repoRoot: root });
	const reaction = selectProjectServerReaction(workState, { kind: "manual_resume" });
	assert.equal(reaction.selection.loop, "planning");
	const changeIds = reaction.selection.planningHorizon.map(
		(entry) => entry.changeId,
	);
	const expectedBytesByChangeId = Object.fromEntries(
		await Promise.all(
			changeIds.map(async (changeId) => [
				changeId,
				(await stat(join(root, traceFilePath(changeTraceId(changeId))))).size,
			]),
		),
	);
	return {
		repoRoot: root,
		expectedWorkStateDigest: workState.snapshotDigest,
		expectedChangeIds: changeIds,
		expectedBytesByChangeId,
		actor: "agent:planner",
		rationale:
			"Group overlapping approved Changes under one rollback boundary.",
		createdAt: "2026-08-06T00:02:00.000Z",
		sprints: [
			{
				id: "SPR-shared-runtime",
				goal: "Realize both approved shared-runtime Changes.",
				participatingChangeIds: changeIds,
				workItemIds: ["WI-shared-runtime"],
				rollbackBoundary: "Revert Sprint work as one boundary.",
				dependsOn: [],
				integrationRefs: ["integration:main"],
				uiPreviewTargets: [
					{
						targetId: "shared-runtime-dashboard",
						targetDigest: `sha256:${"a".repeat(64)}`,
						profileId: "web",
						profileDigest: `sha256:${"b".repeat(64)}`,
						workItemIds: ["WI-shared-runtime"],
						contributingChangeIds: changeIds,
						required: true,
						activation: "implementation",
						autoOpen: "once_per_target",
					},
				],
			},
		],
		workItems: [
			{
				id: "WI-shared-runtime",
				sprintId: "SPR-shared-runtime",
				owningChangeId: changeIds[0],
				contributingChangeIds: changeIds.slice(1),
				title: "Implement shared runtime behavior",
				outcome: "Approved shared runtime behavior is realized.",
				technicalRequirements: ["Preserve Change trace authority."],
				acceptanceCriteria: ["Project Server tests pass."],
				componentRefs: ["runtime"],
				pathScopes: ["src/shared.ts"],
				verification: ["node --test tests/project-server/shared.test.mjs"],
				workerProfile: "implementation",
				dependsOn: [],
			},
		],
		...overrides,
	};
}

describe("wiki_plan portfolio facade", () => {
	it("previews one deterministic Planning epoch without mutation", async () => {
		const { root } = await setupApprovedPortfolio();
		const input = await planningInput(root);
		const before = await Promise.all(
			input.expectedChangeIds.map((changeId) =>
				readTrace(join(root, traceFilePath(changeTraceId(changeId)))),
			),
		);
		const result = await runWikiPlan({ ...input, mode: "preview" });
		const after = await Promise.all(
			input.expectedChangeIds.map((changeId) =>
				readTrace(join(root, traceFilePath(changeTraceId(changeId)))),
			),
		);

		assert.equal(result.report.exit.status, "exit");
		assert.match(result.report.planningEpochId, /^PE-[a-f0-9]{20}$/);
		assert.deepEqual(
			Object.keys(result.events).sort(),
			[...input.expectedChangeIds].sort(),
		);
		assert.equal(result.append, undefined);
		assert.deepEqual(after, before);
	});

	it("appends one shared epoch to every participating Change Trace", async () => {
		const { root } = await setupApprovedPortfolio();
		const input = await planningInput(root);
		const runtimeJobId = `runtime-reaction:${"1".repeat(64)}`;
		const result = await runWikiPlan({
			...input,
			mode: "append",
			runtimeJobId,
		});
		const workState = await buildProjectWorkState({ repoRoot: root });

		assert.deepEqual(
			Object.keys(result.append).sort(),
			[...input.expectedChangeIds].sort(),
		);
		assert.equal(
			Object.values(result.events).every(
				(event) => event.data?.runtimeJobId === runtimeJobId,
			),
			true,
		);
		assert.equal(workState.sprints.length, 1);
		assert.equal(workState.sprints[0].id, "SPR-shared-runtime");
		assert.deepEqual(
			workState.sprints[0].participatingChangeIds,
			input.expectedChangeIds,
		);
		assert.equal(workState.sprints[0].complete, false);
		assert.deepEqual(workState.sprints[0].uiPreviewTargets, [
			{
				targetId: "shared-runtime-dashboard",
				targetDigest: `sha256:${"a".repeat(64)}`,
				profileId: "web",
				profileDigest: `sha256:${"b".repeat(64)}`,
				workItemIds: ["WI-shared-runtime"],
				contributingChangeIds: [...input.expectedChangeIds].sort(),
				required: true,
				activation: "implementation",
				autoOpen: "once_per_target",
			},
		]);
		assert.equal(workState.workItems.length, 1);
		assert.equal(
			workState.workItems[0].owningChangeId,
			input.expectedChangeIds[0],
		);
		assert.deepEqual(
			workState.workItems[0].contributesToChangeIds,
			input.expectedChangeIds.slice(1),
		);
		assert.equal(workState.blockers.length, 0);
		for (const change of workState.changes) {
			assert.equal(change.planningStatus, "planned");
			assert.equal(change.currentLoop, "implementation");
		}
	});

	it("fails closed on unsafe multi-Change integration", async () => {
		const { root } = await setupApprovedPortfolio();
		const input = await planningInput(root);
		input.sprints[0].integrationRefs = [];
		const preview = await runWikiPlan({ ...input, mode: "preview" });

		assert.equal(preview.report.exit.status, "continue");
		assert.deepEqual(
			preview.report.qualityStandards
				.filter((standard) => standard.status !== "met")
				.map((standard) => standard.id),
			["integration_safe"],
		);
		await assert.rejects(
			runWikiPlan({ ...input, mode: "append" }),
			/Planning quality did not exit/,
		);
	});

	it("rejects UI preview target correlation outside Sprint authority", async () => {
		const { root } = await setupApprovedPortfolio();
		const input = await planningInput(root);
		input.sprints[0].uiPreviewTargets[0].workItemIds = ["WI-other"];
		const preview = await runWikiPlan({ ...input, mode: "preview" });
		assert.equal(preview.report.exit.status, "continue");
		assert.deepEqual(
			preview.report.qualityStandards
				.filter((standard) => standard.status !== "met")
				.map((standard) => standard.id),
			["ui_preview_targets_valid"],
		);
	});

	it("rejects stale horizon, WorkState, and per-trace byte guards", async () => {
		const { root } = await setupApprovedPortfolio();
		const input = await planningInput(root);
		await assert.rejects(
			runWikiPlan({ ...input, expectedChangeIds: ["CHG-plan-a"] }),
			/Planning horizon changed/,
		);
		await assert.rejects(
			runWikiPlan({
				...input,
				expectedWorkStateDigest: `sha256:${"0".repeat(64)}`,
			}),
			/Planning WorkState changed/,
		);
		await assert.rejects(
			runWikiPlan({
				...input,
				mode: "append",
				expectedBytesByChangeId: {
					...input.expectedBytesByChangeId,
					"CHG-plan-b": 0,
				},
			}),
			/Planning trace bytes changed/,
		);
	});
});
