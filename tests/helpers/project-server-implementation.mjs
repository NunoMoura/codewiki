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
	const records = specs.map((spec, index) => {
		const record = createChangeRecord(
			acceptedChangeFixture({
				id: spec.changeId,
				targetRefs: spec.targetRefs || [`src/feature-${index + 1}.ts`],
			}),
		);
		record.links = specs
			.filter((candidate) => candidate.changeId !== spec.changeId)
			.map((candidate) => ({
				relation: "related",
				targetChangeId: candidate.changeId,
				createdBy: "runtime:test",
				createdAt: "2026-06-12T00:00:00.000Z",
			}));
		return record;
	});
	await new ChangeTraceStore({ repoRoot: root }).write({
		expectedHead: null,
		records,
		message: "Persist implementation portfolio",
		actor: "user:maintainer",
		createdAt: "2026-06-12T00:00:00.000Z",
	});
	for (const [index, record] of records.entries()) {
		const workState = await buildProjectWorkState({ repoRoot: root });
		const traceId = changeTraceId(record.change.id);
		const trace = await readTraceFileSnapshot(
			join(root, traceFilePath(traceId)),
		);
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
			rationale: "Approve exact portfolio participant.",
			authority: {
				kind: "user",
				actor: "user:maintainer",
				ref: `confirmation:portfolio:${record.change.id}`,
			},
			occurredAt: `2026-06-12T00:00:0${index + 1}.000Z`,
			mode: "append",
			expectedBytes: trace.bytes,
		});
	}
	const workState = await buildProjectWorkState({ repoRoot: root });
	const expectedBytesByChangeId = Object.fromEntries(
		await Promise.all(
			records.map(async (record) => {
				const traceId = changeTraceId(record.change.id);
				const trace = await readTraceFileSnapshot(
					join(root, traceFilePath(traceId)),
				);
				return [record.change.id, trace.bytes];
			}),
		),
	);
	const sprintId = "SPR-runtime-portfolio";
	const planning = await runWikiPlan({
		repoRoot: root,
		expectedWorkStateDigest: workState.snapshotDigest,
		expectedChangeIds: specs.map((spec) => spec.changeId),
		sprints: [
			{
				id: sprintId,
				goal: "Integrate runtime host portfolio work.",
				participatingChangeIds: specs.map((spec) => spec.changeId),
				workUnitIds: specs.map((spec) => spec.workUnitId),
				rollbackBoundary: "Revert portfolio fixture together.",
				dependsOn: [],
				integrationRefs: ["integration:runtime-portfolio-fixture"],
			},
		],
		workUnits: specs.map((spec) => ({
			id: spec.workUnitId,
			sprintId,
			owningChangeId: spec.changeId,
			contributingChangeIds: [],
			title: `Implement ${spec.workUnitId}`,
			outcome: "Runtime host evidence is integrated.",
			technicalRequirements: ["Preserve runtime authority."],
			acceptanceCriteria: [`${spec.workUnitId} evidence passes.`],
			componentRefs: ["api"],
			pathScopes: spec.pathScopes,
			verification: spec.verification,
			workerProfile: "implementation",
			dependsOn: [],
		})),
		actor: "runtime:test",
		rationale: "Plan linked portfolio participants together.",
		createdAt: "2026-06-12T00:00:03.000Z",
		mode: "append",
		expectedBytesByChangeId,
	});
	return await Promise.all(
		specs.map(async (spec) => {
			const traceId = changeTraceId(spec.changeId);
			const trace = await readTraceFileSnapshot(
				join(root, traceFilePath(traceId)),
			);
			const planningEvent = planning.events[spec.changeId];
			return {
				...spec,
				traceId,
				planningEvents: [planningEvent],
				planningRef: `trace:${planningEvent.id}#work:${spec.workUnitId}`,
				records: trace.records,
				expectedBytes: trace.bytes,
				nextSequence:
					Math.max(
						0,
						...trace.records.flatMap((entry) =>
							entry.type === "trace_event" ? [entry.sequence] : [],
						),
					) + 1,
			};
		}),
	);
}

export async function seedProjectServerImplementation(root, options = {}) {
	const suffix = options.suffix || "runtime-implementation";
	const changeId = options.changeId || `CHG-${suffix}`;
	const workUnitId = options.workUnitId || "WU-implement";
	const sprintId = options.sprintId || `SPR-${suffix}`;
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
	let workState = await buildProjectWorkState({ repoRoot: root });
	let trace = await readTraceFileSnapshot(join(root, traceFilePath(traceId)));
	await runWikiDecide({
		repoRoot: root,
		changeId,
		expectedRevision: record.change.revision,
		expectedChangeDigest: workState.changes.find(
			(candidate) => candidate.id === changeId,
		).approval.changeDigest,
		expectedWorkStateDigest: workState.snapshotDigest,
		disposition: "approve",
		rationale: "Approve exact implementation test Change.",
		authority: {
			kind: "user",
			actor: "user:maintainer",
			ref: `confirmation:${suffix}`,
		},
		occurredAt: options.decisionAt || "2026-06-11T00:00:01.000Z",
		mode: "append",
		expectedBytes: trace.bytes,
	});
	workState = await buildProjectWorkState({ repoRoot: root });
	trace = await readTraceFileSnapshot(join(root, traceFilePath(traceId)));
	const planning = await runWikiPlan({
		repoRoot: root,
		expectedWorkStateDigest: workState.snapshotDigest,
		expectedChangeIds: [changeId],
		sprints: [
			{
				id: sprintId,
				goal: options.goal || "Exercise Project Server-owned Implementation context.",
				participatingChangeIds: [changeId],
				workUnitIds: [workUnitId],
				rollbackBoundary: "Revert implementation test changes together.",
				dependsOn: [],
				integrationRefs: [],
				...(options.uiPreviewTargets
					? { uiPreviewTargets: options.uiPreviewTargets }
					: {}),
			},
		],
		workUnits: [
			{
				id: workUnitId,
				sprintId,
				owningChangeId: changeId,
				contributingChangeIds: [],
				title: options.title || "Run Project Server-owned wiki_implement",
				outcome: "Implementation evidence is validated and appended.",
				technicalRequirements: ["Load authority from canonical traces."],
				acceptanceCriteria: [
					options.acceptance ||
						"wiki_implement appends implementation evidence.",
				],
				componentRefs: options.componentRefs || ["api"],
				pathScopes: options.pathScopes || ["src/feature.ts"],
				verification: options.verification || [
					"node --test tests/feature.test.mjs",
				],
				workerProfile: options.workerProfile || "implementation",
				dependsOn: [],
			},
		],
		actor: "runtime:test",
		rationale: "Create one bounded implementation Work Unit.",
		createdAt: options.planningAt || "2026-06-11T00:00:02.000Z",
		mode: "append",
		expectedBytesByChangeId: { [changeId]: trace.bytes },
	});
	workState = await buildProjectWorkState({ repoRoot: root });
	trace = await readTraceFileSnapshot(join(root, traceFilePath(traceId)));
	const planningEvent = planning.events[changeId];
	return {
		changeId,
		traceId,
		sprintId,
		workUnitId,
		planningRef: `trace:${planningEvent.id}#work:${workUnitId}`,
		planningEvents: [planningEvent],
		records: trace.records,
		expectedWorkStateDigest: workState.snapshotDigest,
		expectedBytes: trace.bytes,
		nextSequence:
			Math.max(
				0,
				...trace.records.flatMap((entry) =>
					entry.type === "trace_event" ? [entry.sequence] : [],
				),
			) + 1,
		parentId:
			trace.records.at(-1)?.type === "trace_head"
				? null
				: trace.records.at(-1)?.id || null,
	};
}
