import { join } from "node:path";
import { runWikiDecide } from "../../src/loops/decision/command.ts";
import { runWikiPlan } from "../../src/project-server/commands/planning.ts";
import { changeTraceId } from "../../src/changes/trace/change-record.ts";
import { createChangeRecord } from "../../src/changes/records.ts";
import { ChangeTraceStore } from "../../src/changes/trace/store.ts";
import { readTraceFileSnapshot } from "../../src/changes/trace/reader.ts";
import { traceFilePath } from "../../src/changes/trace/schema.ts";
import { buildProjectWorkState } from "../../src/work-state/project.ts";
import { acceptedChangeFixture } from "./accepted-change.mjs";

export async function seedProjectServerImplementationPortfolio(root, specs) {
	const records = specs.map((spec, index) =>
		createChangeRecord(
			acceptedChangeFixture({
				id: spec.changeId,
				targetRefs: spec.targetRefs || [`src/feature-${index + 1}.ts`],
			}),
		),
	);
	await new ChangeTraceStore({ repoRoot: root }).write({
		expectedHead: null,
		records,
		message: "Persist implementation portfolio",
		actor: "user:maintainer",
		createdAt: "2026-06-12T00:00:00.000Z",
	});
	for (const [index, record] of records.entries()) {
		await approveChange(root, record, {
			ref: `confirmation:portfolio:${record.change.id}`,
			occurredAt: `2026-06-12T00:00:0${index + 1}.000Z`,
		});
	}
	const planningByChangeId = new Map();
	for (const spec of specs) {
		planningByChangeId.set(
			spec.changeId,
			await planChange(root, {
				changeId: spec.changeId,
				workUnitId: spec.workUnitId,
				title: `Implement ${spec.workUnitId}`,
				acceptance: `${spec.workUnitId} evidence passes.`,
				pathScopes: spec.pathScopes,
				verification: spec.verification,
				integrationRequirements: ["integration:runtime-portfolio-fixture"],
				createdAt: "2026-06-12T00:00:03.000Z",
			}),
		);
	}
	return Promise.all(
		specs.map(async (spec) => {
			const traceId = changeTraceId(spec.changeId);
			const trace = await traceSnapshot(root, traceId);
			const planning = planningByChangeId.get(spec.changeId);
			const planningEvent = planning.events[spec.changeId];
			return {
				...spec,
				traceId,
				workGraphDeltaId: planning.report.workGraphDeltaId,
				planningEvents: [planningEvent],
				planningRef: `trace:${planningEvent.id}#work:${spec.workUnitId}`,
				records: trace.records,
				expectedBytes: trace.bytes,
				nextSequence: nextSequence(trace.records),
			};
		}),
	);
}

export async function seedProjectServerImplementation(root, options = {}) {
	const suffix = options.suffix || "runtime-implementation";
	const changeId = options.changeId || `CHG-${suffix}`;
	const workUnitId = options.workUnitId || "WU-implement";
	const traceId = changeTraceId(changeId);
	const record = createChangeRecord(
		acceptedChangeFixture({ id: changeId, ...(options.change || {}) }),
	);
	await new ChangeTraceStore({ repoRoot: root }).write({
		expectedHead: null,
		records: [record],
		message: "Persist implementation Change",
		actor: "user:maintainer",
		createdAt: options.createdAt || "2026-06-11T00:00:00.000Z",
	});
	await approveChange(root, record, {
		ref: `confirmation:${suffix}`,
		occurredAt: options.decisionAt || "2026-06-11T00:00:01.000Z",
	});
	const planning = await planChange(root, {
		changeId,
		workUnitId,
		title: options.title || "Run Project Server-owned wiki_implement",
		acceptance:
			options.acceptance || "wiki_implement appends implementation evidence.",
		pathScopes: options.pathScopes || ["src/feature.ts"],
		componentRefs: options.componentRefs || ["api"],
		verification: options.verification || ["node --test tests/feature.test.mjs"],
		budgetClass: options.workerProfile || "implementation",
		uiPreviewTargets: [],
		integrationRequirements: ["Integrate into exact Change lineage."],
		createdAt: options.planningAt || "2026-06-11T00:00:02.000Z",
	});
	const workState = await buildProjectWorkState({ repoRoot: root });
	const trace = await traceSnapshot(root, traceId);
	const planningEvent = planning.events[changeId];
	return {
		changeId,
		traceId,
		workGraphDeltaId: planning.report.workGraphDeltaId,
		workUnitId,
		planningRef: `trace:${planningEvent.id}#work:${workUnitId}`,
		planningEvents: [planningEvent],
		records: trace.records,
		expectedWorkStateDigest: workState.snapshotDigest,
		expectedBytes: trace.bytes,
		nextSequence: nextSequence(trace.records),
		parentId:
			trace.records.at(-1)?.type === "trace_head"
				? null
				: trace.records.at(-1)?.id || null,
	};
}

async function approveChange(root, record, input) {
	const workState = await buildProjectWorkState({ repoRoot: root });
	const traceId = changeTraceId(record.change.id);
	const trace = await traceSnapshot(root, traceId);
	const change = workState.changes.find(
		(candidate) => candidate.id === record.change.id,
	);
	await runWikiDecide({
		repoRoot: root,
		changeId: record.change.id,
		expectedRevision: record.change.revision,
		expectedChangeDigest: change.approval.changeDigest,
		expectedWorkStateDigest: workState.snapshotDigest,
		disposition: "approve",
		rationale: "Approve exact implementation test Change.",
		authority: {
			kind: "user",
			actor: "user:maintainer",
			ref: input.ref,
		},
		occurredAt: input.occurredAt,
		mode: "append",
		expectedBytes: trace.bytes,
	});
}

async function planChange(root, input) {
	const workState = await buildProjectWorkState({ repoRoot: root });
	const traceId = changeTraceId(input.changeId);
	const trace = await traceSnapshot(root, traceId);
	const change = workState.changes.find(
		(candidate) => candidate.id === input.changeId,
	);
	return runWikiPlan({
		repoRoot: root,
		expectedWorkStateDigest: workState.snapshotDigest,
		expectedChangeId: input.changeId,
		changeId: input.changeId,
		changeRevisionId: change.approval.changeDigest,
		observedWorkGraphDigest: workState.workGraphDigest,
		workUnits: [
			{
				id: input.workUnitId,
				owningChangeId: input.changeId,
				title: input.title,
				outcome: "Implementation evidence is validated and appended.",
				technicalRequirements: ["Load authority from canonical traces."],
				acceptanceRequirements: [input.acceptance],
				componentRefs: input.componentRefs || ["api"],
				pathScopes: input.pathScopes,
				verification: input.verification,
				resourceRequirements: {
					capabilityIds: ["source.edit"],
					toolIds: ["node-test"],
					skillIds: [],
					custodyRequirements: ["private-workbench"],
					budgetClass: input.budgetClass || "standard",
				},
			},
		],
		dependencyEdges: [],
		acceptanceCoverage: [
			{ acceptanceRequirement: input.acceptance, workUnitIds: [input.workUnitId] },
		],
		uiPreviewTargets: [],
		integrationRequirements: input.integrationRequirements,
		actor: "runtime:test",
		rationale: "Create one bounded implementation Work Unit.",
		createdAt: input.createdAt,
		mode: "append",
		expectedBytes: trace.bytes,
	});
}

function traceSnapshot(root, traceId) {
	return readTraceFileSnapshot(join(root, traceFilePath(traceId)));
}

function nextSequence(records) {
	return (
		Math.max(
			0,
			...records.flatMap((entry) =>
				entry.type === "trace_event" ? [entry.sequence] : [],
			),
		) + 1
	);
}
