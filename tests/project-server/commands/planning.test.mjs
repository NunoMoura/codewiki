import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { runWikiDecide } from "../../../src/loops/decision/command.ts";
import { runWikiPlan } from "../../../src/project-server/commands/planning.ts";
import { changeTraceId } from "../../../src/changes/trace/change-record.ts";
import { changeContentDigest } from "../../../src/changes/digest.ts";
import { createChangeRecord } from "../../../src/changes/records.ts";
import { ChangeTraceStore } from "../../../src/changes/trace/store.ts";
import { readTrace } from "../../../src/changes/trace/reader.ts";
import { traceFilePath } from "../../../src/changes/trace/schema.ts";
import { selectProjectServerReaction } from "../../../src/project-server/coordinator/reactor.ts";
import { buildProjectWorkState } from "../../../src/work-state/project.ts";
import { acceptedChangeFixture } from "../../helpers/accepted-change.mjs";

const roots = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setupApprovedChange() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-wiki-plan-v3-"));
	roots.push(root);
	const record = createChangeRecord(
		acceptedChangeFixture({
			id: "CHG-plan-a",
			createdAt: "2026-08-06T00:00:00.000Z",
			targetRefs: ["src/shared.ts"],
		}),
	);
	await new ChangeTraceStore({ repoRoot: root }).write({
		expectedHead: null,
		records: [record],
		message: "Persist Planning Change",
		actor: "user",
		createdAt: "2026-08-06T00:00:00.000Z",
	});
	const workState = await buildProjectWorkState({ repoRoot: root });
	const path = join(root, traceFilePath(changeTraceId(record.change.id)));
	await runWikiDecide({
		repoRoot: root,
		mode: "append",
		changeId: record.change.id,
		expectedRevision: record.change.revision,
		expectedChangeDigest: changeContentDigest(record.change),
		expectedWorkStateDigest: workState.snapshotDigest,
		expectedBytes: (await stat(path)).size,
		disposition: "approve",
		rationale: "Approve exact Change for Planning.",
		authority: { kind: "user", actor: "user", ref: "approval:user:CHG-plan-a" },
		occurredAt: "2026-08-06T00:01:00.000Z",
	});
	return { root, record };
}

async function planningInput(root, overrides = {}) {
	const workState = await buildProjectWorkState({ repoRoot: root });
	const reaction = selectProjectServerReaction(workState, { kind: "manual_resume" });
	assert.equal(reaction.selection.loop, "planning");
	const changeId = reaction.selection.change.changeId;
	const change = workState.changes.find((candidate) => candidate.id === changeId);
	const path = join(root, traceFilePath(changeTraceId(changeId)));
	const acceptanceRequirement = "Project Server graph-delta tests pass.";
	return {
		repoRoot: root,
		expectedWorkStateDigest: workState.snapshotDigest,
		expectedChangeId: changeId,
		changeId,
		changeRevisionId: change.approval.changeDigest,
		observedWorkGraphDigest: workState.workGraphDigest,
		expectedBytes: (await stat(path)).size,
		actor: "agent:planner",
		rationale: "Decompose one ratified Change into owned Work Units.",
		createdAt: "2026-08-06T00:02:00.000Z",
		workUnits: [
			{
				id: "WU-shared-runtime",
				owningChangeId: changeId,
				title: "Implement shared runtime behavior",
				outcome: "Approved runtime behavior is realized.",
				technicalRequirements: ["Preserve Change Trace authority."],
				acceptanceRequirements: [acceptanceRequirement],
				componentRefs: ["runtime"],
				pathScopes: ["src/shared.ts"],
				verification: ["node --test tests/project-server/shared.test.mjs"],
				resourceRequirements: {
					capabilityIds: ["source.edit"],
					toolIds: ["node-test"],
					skillIds: [],
					custodyRequirements: ["private-workbench"],
					budgetClass: "standard",
				},
			},
		],
		dependencyEdges: [],
		acceptanceCoverage: [
			{ acceptanceRequirement, workUnitIds: ["WU-shared-runtime"] },
		],
		uiPreviewTargets: [],
		integrationRequirements: ["Integrate into private Change lineage."],
		...overrides,
	};
}

describe("wiki_plan Change-scoped graph-delta facade", () => {
	it("previews one deterministic Work Graph delta without mutation", async () => {
		const { root } = await setupApprovedChange();
		const input = await planningInput(root);
		const path = join(root, traceFilePath(changeTraceId(input.changeId)));
		const before = await readTrace(path);
		const result = await runWikiPlan({ ...input, mode: "preview" });
		assert.equal(result.report.exit.status, "exit");
		assert.match(result.report.workGraphDeltaId, /^WGD-[a-f0-9]{20}$/);
		assert.deepEqual(Object.keys(result.events), [input.changeId]);
		assert.equal(result.append, undefined);
		assert.deepEqual(await readTrace(path), before);
	});

	it("appends one Change-owned delta and projects its Work Units", async () => {
		const { root } = await setupApprovedChange();
		const input = await planningInput(root);
		const runtimeJobId = `runtime-reaction:${"1".repeat(64)}`;
		const result = await runWikiPlan({ ...input, mode: "append", runtimeJobId });
		const workState = await buildProjectWorkState({ repoRoot: root });
		assert.ok(result.append[input.changeId]);
		assert.equal(result.events[input.changeId].data.runtimeJobId, runtimeJobId);
		assert.equal(workState.workGraphDeltas.length, 1);
		assert.equal(workState.workGraphDeltas[0].owningChangeId, input.changeId);
		assert.equal(workState.workUnits[0].owningChangeId, input.changeId);
		assert.equal(workState.workUnits[0].workGraphDeltaId, result.report.workGraphDeltaId);
		assert.equal(workState.changes[0].planningStatus, "planned");
		assert.equal(workState.changes[0].currentLoop, "implementation");
		assert.equal(workState.blockers.length, 0);
	});

	it("rejects cross-Change ownership and uncovered acceptance", async () => {
		const { root } = await setupApprovedChange();
		const input = await planningInput(root);
		const invalid = {
			...input,
			workUnits: [{ ...input.workUnits[0], owningChangeId: "CHG-other" }],
			acceptanceCoverage: [
				{ acceptanceRequirement: "missing", workUnitIds: ["WU-other"] },
			],
		};
		const preview = await runWikiPlan({ ...invalid, mode: "preview" });
		assert.equal(preview.report.exit.status, "continue");
		assert.deepEqual(
			preview.report.qualityStandards
				.filter((standard) => standard.status !== "met")
				.map((standard) => standard.id),
			["single_change_ownership", "acceptance_coverage"],
		);
		await assert.rejects(runWikiPlan({ ...invalid, mode: "append" }), /Planning quality did not exit/);
	});

	it("rejects stale Change, Work Graph, WorkState, and trace byte guards", async () => {
		const { root } = await setupApprovedChange();
		const input = await planningInput(root);
		await assert.rejects(runWikiPlan({ ...input, expectedChangeId: "CHG-other" }), /Planning Change changed/);
		await assert.rejects(runWikiPlan({ ...input, observedWorkGraphDigest: `sha256:${"0".repeat(64)}` }), /stale Work Graph/);
		await assert.rejects(runWikiPlan({ ...input, expectedWorkStateDigest: `sha256:${"0".repeat(64)}` }), /Planning WorkState changed/);
		await assert.rejects(runWikiPlan({ ...input, mode: "append", expectedBytes: 0 }), /Planning trace bytes changed/);
	});
});
