import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runWikiImplement } from "../../src/api/wiki-implement.ts";
import { collectPiWorkerReports } from "../../src/pi/worker-reports.ts";
import { createRuntimeClaimEvent } from "../../src/runtime/claims.ts";
import { createRuntimeWorkerCompletionReleaseEvents } from "../../src/runtime/work-unit-claims.ts";
import { appendTraceRecord } from "../../src/traces/append.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { replayTrace } from "../../src/traces/replay.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { buildProjectWorkState } from "../../src/work-state/project.ts";
import { seedRuntimeImplementation as seedRuntimeImplementationProject } from "../helpers/runtime-implementation.mjs";
import { buildWorkQueueView } from "../../src/views/work-queue.ts";
import { implementationQualityFields } from "../helpers/implementation-change.mjs";

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-wiki-implement-"));
	await mkdir(join(root, "src"), { recursive: true });
	await mkdir(join(root, "tests"), { recursive: true });
	await writeFile(
		join(root, "src", "feature.ts"),
		"export const feature = true;\n",
	);
	await writeFile(
		join(root, "tests", "feature.test.mjs"),
		"assert.ok(true);\n",
	);
	await writeFile(join(root, "package.json"), '{"name":"fixture"}\n');
	return root;
}

async function seedRuntimeImplementation(root, suffix) {
	const seeded = await seedRuntimeImplementationProject(root, { suffix });
	return { ...seeded, events: seeded.planningEvents };
}

function changeInput(planningRef) {
	return {
		id: "CH-implement",
		planningRefs: [planningRef],
		codePaths: ["src/feature.ts"],
		testPaths: ["tests/feature.test.mjs"],
		checks: ["node --test tests/feature.test.mjs"],
		checkResults: [
			{
				command: "node --test tests/feature.test.mjs",
				status: "pass",
				phase: "green",
				criterionId: "AC-WU-implement-1",
				outputRef: "tests/feature.test.mjs",
			},
		],
		acceptanceEvidenceItems: [
			{
				criterionId: "AC-WU-implement-1",
				summary: "Feature test passes.",
				evidenceRefs: ["tests/feature.test.mjs"],
			},
		],
		...implementationQualityFields(),
	};
}

function evidenceInput(overrides = {}) {
	const { id: _id, planningRefs: _planningRefs, ...evidence } = changeInput("");
	return { workItemId: "WU-implement", ...evidence, ...overrides };
}

describe("wiki_implement core facade", () => {
	it("rejects malformed implementation facade input", async () => {
		await assert.rejects(
			() =>
				runWikiImplement({ repoRoot: "/tmp", traceId: "TRACE-bad", work: [] }),
			/wiki_implement received unsupported input field traceId/,
		);
		await assert.rejects(
			() => runWikiImplement({ repoRoot: "/tmp" }),
			/requires expectedWorkStateDigest/,
		);
	});

	it("routes implementation uncertainty back to decision", async () => {
		const root = await fixture();
		try {
			const prepared = await seedRuntimeImplementation(
				root,
				"wiki-implement-route-back",
			);
			const { expectedWorkStateDigest } = prepared;
			const change = evidenceInput();
			const result = await runWikiImplement({
				repoRoot: root,
				expectedWorkStateDigest,
				mode: "preview",
				createdAt: "2026-06-11T00:00:03.000Z",
				evidence: [
					{
						...change,
						implementationAssessment: {
							...change.implementationAssessment,
							uncertainties: ["Needs user validation before closure."],
							uncertaintyOwner: "user",
							uncertaintyResolution:
								"Route to decision for authority validation before continuing.",
						},
					},
				],
			});

			assert.equal(result.iterationEvent.event, "route_back_requested");
			assert.equal(result.loopResult.exit.route, "decision");
			assert.equal(
				result.iterationEvent.data.exit.routePlan.target,
				"decision",
			);
			assert.equal(
				result.iterationEvent.data.exit.routePlan.kind,
				"clarification",
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("previews implementation with snapshot and automatic content proof", async () => {
		const root = await fixture();
		try {
			const prepared = await seedRuntimeImplementation(
				root,
				"wiki-implement-preview",
			);
			const { expectedWorkStateDigest } = prepared;
			const result = await runWikiImplement({
				repoRoot: root,
				expectedWorkStateDigest,
				mode: "preview",
				createdAt: "2026-06-11T00:00:03.000Z",
				evidence: [evidenceInput()],
			});

			assert.equal(result.mode, "preview");
			assert.equal(result.iterationEvent.event, "evidence_accepted");
			assert.equal(result.loopResult.readyForClosure, true);
			assert.equal(result.append, undefined);
			assert.deepEqual(result.proofPaths, [
				"src/feature.ts",
				"tests/feature.test.mjs",
			]);
			assert.match(
				result.aggregateContentProof?.workingTreeDigest,
				/^sha256:[a-f0-9]{64}$/,
			);
			assert.match(
				result.loopResult.changes[0].contentProof?.workingTreeDigest,
				/^sha256:[a-f0-9]{64}$/,
			);
			assert.equal(result.snapshot.files.includes("src/feature.ts"), true);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("auto-runs TS/JS review evidence during preview", async () => {
		const root = await fixture();
		try {
			await writeFile(
				join(root, "package.json"),
				JSON.stringify({
					name: "fixture",
					scripts: {
						typecheck:
							"node -e \"console.error('src/feature.ts(1,1): error TS9999: Broken type.'); process.exit(1)\"",
					},
				}),
			);
			const prepared = await seedRuntimeImplementation(
				root,
				"wiki-implement-auto-review",
			);
			const { expectedWorkStateDigest } = prepared;
			const result = await runWikiImplement({
				repoRoot: root,
				expectedWorkStateDigest,
				mode: "preview",
				createdAt: "2026-06-11T00:00:03.000Z",
				evidence: [evidenceInput()],
			});

			assert.equal(result.iterationEvent.event, "evidence_rejected");
			assert.equal(result.loopResult.readyForClosure, false);
			assert.equal(
				result.loopResult.exit.issues.some(
					(issue) => issue.code === "review_blocking_diagnostic",
				),
				true,
			);
			assert.equal(
				result.loopResult.exit.issues.some(
					(issue) => issue.code === "review_missing_acceptance_evidence_link",
				),
				false,
			);
			assert.equal(
				result.iterationEvent.data.output.reviewEvidenceReports.some((report) =>
					report.sources?.some((source) => source.id === "tsjs.typescript"),
				),
				true,
			);
			assert.equal(result.reviewEvidence.autoEvidence, true);
			assert.equal(
				result.reviewEvidence.selectedPackIds.includes("tsjs.typescript"),
				true,
			);
			assert.equal(
				result.reviewEvidence.skippedPacks.some(
					(pack) =>
						pack.id === "python.ruff" && pack.reason === "no-matching-files",
				),
				true,
			);
			assert.equal(result.reviewEvidence.summary.diagnostics.error, 1);
			assert.equal(
				result.reviewEvidence.summary.blockingDiagnostics[0].sourceId,
				"tsjs.typescript",
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("honors project config that disables automatic review evidence", async () => {
		const root = await fixture();
		try {
			await mkdir(join(root, ".codewiki"), { recursive: true });
			await writeFile(
				join(root, ".codewiki", "config.json"),
				JSON.stringify({
					quality: { review: { autoEvidence: false } },
				}),
			);
			await writeFile(
				join(root, "package.json"),
				JSON.stringify({
					name: "fixture",
					scripts: {
						typecheck:
							"node -e \"console.error('src/feature.ts(1,1): error TS9999: Broken type.'); process.exit(1)\"",
					},
				}),
			);
			const prepared = await seedRuntimeImplementation(
				root,
				"wiki-implement-auto-review-disabled",
			);
			const { expectedWorkStateDigest } = prepared;
			const result = await runWikiImplement({
				repoRoot: root,
				expectedWorkStateDigest,
				mode: "preview",
				createdAt: "2026-06-11T00:00:03.000Z",
				evidence: [evidenceInput()],
			});

			assert.equal(result.iterationEvent.event, "evidence_accepted");
			assert.equal(result.loopResult.readyForClosure, true);
			assert.deepEqual(
				result.iterationEvent.data.output.reviewEvidenceReports,
				[],
			);
			assert.equal(result.reviewEvidence.enabled, true);
			assert.equal(result.reviewEvidence.autoEvidence, false);
			assert.equal(result.reviewEvidence.summary.reportCount, 0);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("blocks when a required review pack does not run", async () => {
		const root = await fixture();
		try {
			await mkdir(join(root, ".codewiki"), { recursive: true });
			await writeFile(
				join(root, ".codewiki", "config.json"),
				JSON.stringify({
					quality: {
						review: {
							enabledPacks: ["tsjs.typescript"],
							requiredPacks: ["tsjs.typescript"],
						},
					},
				}),
			);
			await writeFile(join(root, "package.json"), '{"name":"fixture"}\n');
			const prepared = await seedRuntimeImplementation(
				root,
				"wiki-implement-required-review-pack",
			);
			const { expectedWorkStateDigest } = prepared;
			const result = await runWikiImplement({
				repoRoot: root,
				expectedWorkStateDigest,
				mode: "preview",
				createdAt: "2026-06-11T00:00:03.000Z",
				evidence: [evidenceInput()],
			});

			assert.equal(result.iterationEvent.event, "evidence_rejected");
			assert.equal(result.loopResult.readyForClosure, false);
			assert.deepEqual(result.reviewEvidence.requiredPackIds, [
				"tsjs.typescript",
			]);
			assert.equal(result.reviewEvidence.summary.packRuns[0].status, "not-run");
			assert.equal(
				result.reviewEvidence.summary.blockingDiagnostics.some((diagnostic) =>
					diagnostic.message.includes(
						"Required review pack tsjs.typescript did not pass",
					),
				),
				true,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("previews implementation from normalized Pi worker completion", async () => {
		const root = await fixture();
		try {
			const prepared = await seedRuntimeImplementation(
				root,
				"wiki-implement-worker",
			);
			const {
				traceId,
				planningRef,
				expectedBytes,
				nextSequence,
				parentId,
				events,
			} = prepared;
			const claim = createRuntimeClaimEvent({
				traceId,
				id: `${traceId}:runtime:claim:WU-implement:${nextSequence}`,
				parentId,
				sequence: nextSequence,
				createdAt: "2026-06-11T00:00:02.500Z",
				claimId: "claim-WU-implement-001",
				workerId: "pi-worker-001",
				workUnitId: "WU-implement",
				planningRefs: [planningRef],
				pathScopes: ["src/feature.ts"],
			});
			await appendTraceRecord(root, claim, expectedBytes);
			const expectedWorkStateDigest = (
				await buildProjectWorkState({ repoRoot: root })
			).snapshotDigest;
			const workerReports = collectPiWorkerReports([
				{
					workerStart: {
						workerId: "pi-worker-001",
						workUnitId: "WU-implement",
						traceId,
						planningRefs: [planningRef],
						claimId: "claim-WU-implement-001",
						sessionId: "session-pi-worker-001",
						sessionFile: "/tmp/pi-worker-001.jsonl",
						status: "started",
					},
					output: {
						status: "completed",
						message: "Worker finished implementation.",
						changed_files: ["src/feature.ts", "tests/feature.test.mjs"],
						checks_run: ["node --test tests/feature.test.mjs"],
						working_tree_digest: "sha256:abc123",
						changes: [changeInput(planningRef)],
					},
				},
			]);
			const result = await runWikiImplement({
				repoRoot: root,
				expectedWorkStateDigest,
				mode: "preview",
				workerReports,
				createdAt: "2026-06-11T00:00:03.000Z",
			});

			assert.equal(result.loopResult.readyForClosure, true);
			assert.equal(result.loopResult.changes[0].workerId, "pi-worker-001");
			assert.equal(
				result.loopResult.changes[0].claimId,
				"claim-WU-implement-001",
			);
			assert.equal(
				result.loopResult.workerAggregation.workerReports[0].sessionId,
				"session-pi-worker-001",
			);
			assert.match(
				result.aggregateContentProof?.workingTreeDigest,
				/^sha256:[a-f0-9]{64}$/,
			);
			const release = createRuntimeWorkerCompletionReleaseEvents(
				workerReports,
				[claim],
				{
					createdAt: "2026-06-11T00:00:04.000Z",
					nextSequenceByTrace: { [traceId]: 10 },
				},
			).events[0];
			const queue = buildWorkQueueView({
				records: [...events, claim, result.iterationEvent, release],
			});
			assert.equal(
				queue.items.find((item) => item.id === "WU-implement")?.status,
				"done",
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("appends implementation iteration with runtime-owned CAS authority", async () => {
		const root = await fixture();
		try {
			const prepared = await seedRuntimeImplementation(
				root,
				"wiki-implement-append",
			);
			const { traceId, expectedWorkStateDigest } = prepared;
			const runtimeJobId = `runtime-reaction:${"2".repeat(64)}`;
			const result = await runWikiImplement({
				repoRoot: root,
				expectedWorkStateDigest,
				mode: "append",
				createdAt: "2026-06-11T00:00:03.000Z",
				evidence: [evidenceInput()],
				runtimeJobId,
			});
			const readBack = await readTrace(join(root, traceFilePath(traceId)));
			const state = replayTrace(readBack.records);

			assert.equal(result.mode, "append");
			assert.equal(result.append?.records.length, 2);
			assert.equal(result.iterationEvent.data?.runtimeJobId, runtimeJobId);
			assert.equal(state.events.at(-1)?.data?.runtimeJobId, runtimeJobId);
			assert.equal(state.events.at(-1)?.event, "evidence_accepted");
			assertQualityGraphIdentity(state.events.at(-1), "implementation.loop");
			assert.equal(state.latestCheckpoint?.parentId, result.iterationEvent.id);
			assertQualityGraphIdentity(state.latestCheckpoint, "implementation.loop");
			await assert.rejects(
				() =>
					runWikiImplement({
						repoRoot: root,
						expectedWorkStateDigest,
						mode: "append",
						evidence: [evidenceInput()],
					}),
				/Implementation WorkState changed/,
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
	assert.equal(graph?.version, "0.3.0.loop.9");
	assert.equal(graph?.schemaVersion, 3);
	assert.match(graph?.hash, /^sha256:/);
	if (outputGraph) assert.deepEqual(outputGraph, exitGraph);
}
