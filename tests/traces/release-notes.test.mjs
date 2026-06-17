import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildTraceCloseReleaseNotes,
	renderTraceCloseReleaseNotes,
} from "../../src/traces/release-notes.ts";
import { createTraceHead, createTailCheckpoint } from "../../src/traces/writer.ts";

function releaseRecords() {
	const traceId = "TRACE-release-notes";
	const implementation = {
		type: "trace_event",
		id: `${traceId}:implementation:iteration:1`,
		parentId: null,
		traceId,
		sequence: 1,
		loop: "implementation",
		event: "implementation.iteration",
		refs: [
			"trace:TRACE-release-notes:planning:iteration:1#work:WU-001",
			"src/traces/release-notes.ts",
			"tests/traces/release-notes.test.mjs",
			"sha256:release",
		],
		createdAt: "2026-06-17T00:00:01.000Z",
		data: {
			output: {
				changes: [
					{
						id: "CHG-001",
						planningRefs: [
							"trace:TRACE-release-notes:planning:iteration:1#work:WU-001",
						],
						workUnitId: "WU-001",
						codePaths: ["src/traces/release-notes.ts"],
						testPaths: ["tests/traces/release-notes.test.mjs"],
						checkResults: [
							{
								command: "npm test",
								status: "pass",
								outputRef: "tests/traces/release-notes.test.mjs",
								summary: "Release note tests passed.",
							},
						],
						acceptanceEvidenceItems: [
							{
								criterionId: "AC-001",
								summary: "Trace-close release notes summarize implementation evidence.",
								evidenceRefs: ["tests/traces/release-notes.test.mjs"],
							},
						],
						contentProof: { workingTreeDigest: "sha256:release" },
						publicationRefs: ["commit:release"],
					},
				],
			},
		},
	};
	const checkpoint = createTailCheckpoint({
		id: `${traceId}:implementation:checkpoint:1`,
		parentId: implementation.id,
		traceId,
		firstKeptRecordId: implementation.id,
		summary: "implementation exit pass; route close.",
		createdAt: "2026-06-17T00:00:02.000Z",
	});
	return [
		createTraceHead({
			traceId,
			title: "Generate trace-close release notes",
			createdAt: "2026-06-17T00:00:00.000Z",
		}),
		implementation,
		checkpoint,
		{
			type: "trace_close",
			id: `${traceId}:archive:close:2`,
			parentId: checkpoint.id,
			traceId,
			reason: "Trace finished and retained.",
			gitRestoreRef: "refs/codewiki/archive/TRACE-release-notes",
			headRef: traceId,
			refs: [traceId, "refs/codewiki/archive/TRACE-release-notes"],
			createdAt: "2026-06-17T00:00:03.000Z",
		},
	];
}

describe("trace-close release notes", () => {
	it("summarizes close metadata and implementation evidence", () => {
		const notes = buildTraceCloseReleaseNotes(releaseRecords());

		assert.equal(notes.traceId, "TRACE-release-notes");
		assert.equal(notes.closed, true);
		assert.equal(notes.closeReason, "Trace finished and retained.");
		assert.deepEqual(notes.changedPaths, [
			"src/traces/release-notes.ts",
			"tests/traces/release-notes.test.mjs",
		]);
		assert.deepEqual(notes.checks, [
			{
				command: "npm test",
				status: "pass",
				outputRef: "tests/traces/release-notes.test.mjs",
				summary: "Release note tests passed.",
			},
		]);
		assert.equal(notes.changes[0].id, "CHG-001");
		assert.equal(
			notes.changes[0].summary,
			"Trace-close release notes summarize implementation evidence.",
		);
		assert.equal(notes.evidenceRefs.includes("sha256:release"), true);
		assert.equal(notes.evidenceRefs.includes("commit:release"), true);
	});

	it("renders compact markdown release notes", () => {
		const markdown = renderTraceCloseReleaseNotes(
			buildTraceCloseReleaseNotes(releaseRecords()),
		);

		assert.match(markdown, /^# Release Notes: Generate trace-close release notes/);
		assert.match(markdown, /- Status: closed/);
		assert.match(markdown, /- \[pass\] npm test/);
		assert.match(markdown, /## Evidence Refs/);
		assert.match(markdown, /sha256:release/);
	});
});
