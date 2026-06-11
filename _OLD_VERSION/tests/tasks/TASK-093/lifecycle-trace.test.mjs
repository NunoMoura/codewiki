#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	assertValidCodewikiLifecycleTraceV1,
	assertValidCodewikiTraceCatalogV1,
	lifecycleTracePath,
	readCodewikiLifecycleTraceFile,
	readCodewikiTraceCatalogFile,
	validateCodewikiLifecycleTraceV1,
	validateCodewikiTraceCatalogV1,
	writeCodewikiLifecycleTraceFile,
	writeCodewikiTraceCatalogFile,
} from "../../../src/telemetry/lifecycle-trace.ts";

function traceFixture() {
	return {
		schema_version: 1,
		trace_id: "TRACE-20260605-task-093",
		title: "Lifecycle trace schema",
		summary: "Ref-first lifecycle trace fixture.",
		lifecycle: {
			status: "active",
			active_loops: [
				{
					loop: "implementation",
					run_id: "RUN-001",
					state: "waiting_gate",
					cursor: "#/implementation",
					next_action: "Run implementation gate.",
				},
			],
			next_safe_actions: ["Run implementation gate."],
			risk: "medium",
		},
		relations: [
			{
				target_trace: "TRACE-20260604-decision",
				rel: "depends_on",
				state: "active",
				rationale: "Planning depends on accepted trace-primary decision.",
			},
		],
		scope: {
			task_refs: ["TASK-093"],
			sprint_refs: ["SPRINT-022"],
			knowledge_refs: [".codewiki/kb/system/trace-graph.md"],
			diagram_refs: [".codewiki/kb/system/diagrams/data-model.yaml"],
			source_refs: ["src/telemetry/lifecycle-trace.ts"],
			test_refs: ["tests/tasks/TASK-093/lifecycle-trace.test.mjs"],
			gate_refs: [".codewiki/validation/trace-schema-pass.json"],
			path_scopes: ["src/telemetry/**"],
		},
		decision: {
			status: "approved",
			decision_table: {
				schema_version: 1,
				id: "DT-TRACE-001",
				title: "Trace schema approval",
				status: "approved",
				scope: { system: ["trace graph"], source: ["src/telemetry/**"] },
				source_refs: [
					{
						ref: ".codewiki/builds/decision/trace-primary.json",
						kind: "decision_output",
						section: "decision",
					},
				],
				rows: [
					{
						id: "ROW-001",
						question: "What is primary trace truth?",
						state_delta: {
							current: "Legacy roots own loop evidence.",
							desired: "Lifecycle trace owns primary trace evidence.",
						},
						proposed_change: "Use lifecycle trace v1.",
						rationale: "Gives one source-backed change journey.",
						impact: { system: ["trace readers"], tests: ["schema tests"] },
						risk: { level: "medium", notes: "Schema is clean-cut v1." },
						options: [{ id: "opt-trace-v1", label: "Lifecycle trace v1" }],
						approval: { status: "approved", actor: "user" },
						evidence_refs: [
							{
								ref: ".codewiki/validation/decision-pass.json",
								kind: "gate_attestation",
								section: "decision",
							},
						],
						expected_outcome: "Trace schema accepted.",
						validated_outcome: "Validation pending.",
					},
				],
			},
			compiler_output_refs: [
				{
					ref: ".codewiki/builds/decision/trace-primary.json",
					kind: "decision_output",
				},
			],
			kb_patch_refs: [
				{ ref: ".codewiki/kb/system/trace-graph.md", kind: "knowledge" },
			],
			gate_history: [
				{
					ref: ".codewiki/validation/decision-pass.json",
					kind: "gate_attestation",
				},
			],
			risk_assessment: ["medium risk: clean-cut schema migration."],
		},
		planning: {
			status: "gate_passed",
			compiler_output_refs: [
				{
					ref: ".codewiki/builds/planning/trace-primary.json",
					kind: "planning_output",
				},
			],
			work_units: [{ task_ref: "TASK-093", sprint_ref: "SPRINT-022" }],
			parallelization: {
				route_back_triggers: ["schema drift"],
				publisher_serialization: ["TASK-094"],
			},
			verification_strategy: ["Run lifecycle trace schema tests."],
			gate_history: [
				{
					ref: ".codewiki/validation/planning-pass.json",
					kind: "gate_attestation",
				},
			],
		},
		implementation: {
			status: "active",
			compiler_output_refs: [
				{
					ref: ".codewiki/builds/implementation/trace-schema.json",
					kind: "implementation_output",
				},
			],
			code_refs: ["src/telemetry/lifecycle-trace.ts"],
			test_refs: ["tests/tasks/TASK-093/lifecycle-trace.test.mjs"],
			gate_evidence: [
				{
					ref: ".codewiki/validation/implementation-pass.json",
					kind: "gate_attestation",
				},
			],
			gate_history: [
				{
					ref: ".codewiki/validation/implementation-pass.json",
					kind: "gate_attestation",
				},
			],
			publication: {
				mode: "off",
				status: "not_configured",
				git_refs: { commit_sha: "abc123", tree_sha: "def456" },
				package_refs: [],
				remote_refs: [],
				restore_refs: [
					"git show abc123:.codewiki/telemetry/TRACE-20260605-task-093.json",
				],
			},
		},
		accountability: {
			user_approval_refs: [
				{
					ref: ".codewiki/builds/decision/trace-primary.json",
					kind: "decision_output",
				},
			],
			pi_session_refs: [{ ref: "pi:session:TASK-093", kind: "source" }],
			agent_summaries: ["Schema model implemented as ref-first v1."],
			content_proofs: [{ ref: "sha256:trace", kind: "content_digest" }],
		},
	};
}

function catalogFixture() {
	return {
		schema_version: 1,
		updated_at: "2026-06-05T00:00:00Z",
		entries: [
			{
				trace_id: "TRACE-20260605-task-093",
				title: "Lifecycle trace schema",
				summary: "Cold trace catalog entry.",
				lifecycle_status: "closed",
				active_loops: [
					{ loop: "implementation", run_id: "RUN-001", state: "active" },
				],
				task_refs: ["TASK-093"],
				sprint_refs: ["SPRINT-022"],
				knowledge_refs: [".codewiki/kb/system/trace-graph.md"],
				source_refs: ["src/telemetry/lifecycle-trace.ts"],
				test_refs: ["tests/tasks/TASK-093/lifecycle-trace.test.mjs"],
				path_scopes: ["src/telemetry/**"],
				gate_refs: [".codewiki/validation/task-close-pass.json"],
				relations: [
					{
						target_trace: "TRACE-20260604-decision",
						rel: "follow_up_to",
						state: "satisfied",
					},
				],
				restore: {
					original_path: ".codewiki/telemetry/TRACE-20260605-task-093.json",
					commit_sha: "abc123",
					tree_sha: "def456",
					archive_ref: "refs/codewiki/archive/task/TASK-093",
					content_digest: "sha256:trace",
					restore_command:
						"git show abc123:.codewiki/telemetry/TRACE-20260605-task-093.json",
				},
				cold_archive_reason: "Closed trace moved to cold catalog.",
				deletion_ledger_ref: ".codewiki/gc/restore-ledger.jsonl",
				archived_at: "2026-06-05T00:00:00Z",
				last_seen_at: "2026-06-05T00:00:00Z",
			},
		],
	};
}

try {
	const trace = traceFixture();
	assert.equal(
		lifecycleTracePath(trace.trace_id),
		".codewiki/telemetry/TRACE-20260605-task-093.json",
	);
	assert.deepEqual(assertValidCodewikiLifecycleTraceV1(trace), trace);
	assert.equal(validateCodewikiLifecycleTraceV1(trace).ok, true);
	assert.equal(validateCodewikiTraceCatalogV1(catalogFixture()).ok, true);
	assert.deepEqual(
		assertValidCodewikiTraceCatalogV1(catalogFixture()),
		catalogFixture(),
	);

	const missingDecisionTable = structuredClone(trace);
	delete missingDecisionTable.decision.decision_table.rows[0].state_delta;
	const missingResult = validateCodewikiLifecycleTraceV1(missingDecisionTable);
	assert.equal(missingResult.ok, false);
	assert.ok(
		missingResult.issues.some((issue) =>
			issue.path.endsWith("state_delta.current"),
		),
	);

	const embeddedPayload = structuredClone(trace);
	embeddedPayload.accountability.raw_transcript =
		"Pi transcript must never be embedded.";
	const embeddedResult = validateCodewikiLifecycleTraceV1(embeddedPayload);
	assert.equal(embeddedResult.ok, false);
	assert.ok(
		embeddedResult.issues.some((issue) => issue.message.includes("ref-first")),
	);

	const coldCatalogWithoutGitRefs = catalogFixture();
	delete coldCatalogWithoutGitRefs.entries[0].restore.commit_sha;
	delete coldCatalogWithoutGitRefs.entries[0].restore.tree_sha;
	delete coldCatalogWithoutGitRefs.entries[0].restore.archive_ref;
	delete coldCatalogWithoutGitRefs.entries[0].restore.content_digest;
	const catalogResult = validateCodewikiTraceCatalogV1(
		coldCatalogWithoutGitRefs,
	);
	assert.equal(catalogResult.ok, false);
	assert.ok(
		catalogResult.issues.some((issue) => issue.path.endsWith(".restore")),
	);

	const root = await mkdtemp(join(tmpdir(), "codewiki-lifecycle-trace-"));
	try {
		const tracePath = await writeCodewikiLifecycleTraceFile(root, trace);
		assert.equal(tracePath, ".codewiki/telemetry/TRACE-20260605-task-093.json");
		assert.deepEqual(
			await readCodewikiLifecycleTraceFile(root, tracePath),
			trace,
		);
		assert.match(
			await readFile(join(root, tracePath), "utf8"),
			/"decision_table"/,
		);
		assert.rejects(
			() =>
				readCodewikiLifecycleTraceFile(
					root,
					".codewiki/builds/decision/legacy.json",
				),
			/\.codewiki\/telemetry\/TRACE-\*\.json/,
		);

		const catalogPath = await writeCodewikiTraceCatalogFile(
			root,
			catalogFixture(),
		);
		assert.equal(catalogPath, ".codewiki/telemetry/catalog.json");
		assert.deepEqual(
			await readCodewikiTraceCatalogFile(root),
			catalogFixture(),
		);
		assert.rejects(
			() => readCodewikiTraceCatalogFile(root, ".codewiki/builds/catalog.json"),
			/\.codewiki\/telemetry\/catalog\.json/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}

	console.log("✓ TASK-093 lifecycle trace schema smoke passed");
} catch (error) {
	console.error(error);
	process.exit(1);
}
