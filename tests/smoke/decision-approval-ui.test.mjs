import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeDecisionTableAction } from "../../src/change/decision-table.ts";
import {
	applyDecisionApprovalAction,
	buildTaskCandidateApprovalModel,
	readDecisionApprovalModel,
	renderDecisionApprovalCards,
	renderTaskCandidateApprovalCards,
} from "../../src/adapters/pi/ui/decision-approval.ts";
import { readDecisionTablePanelData } from "../../src/adapters/pi/ui/manager.ts";

const root = await mkdtemp(join(tmpdir(), "codewiki-decision-approval-"));
const project = {
	root,
	label: "decision-approval-smoke",
	config: { project_name: "decision-approval-smoke" },
	roadmapPath: ".codewiki/roadmap/queue.json",
	graphPath: ".codewiki/index_graph.json",
};

try {
	await executeDecisionTableAction(project, {
		action: "propose",
		table_id: "DT-APPROVAL",
		summary: "Approve decision rows",
		rows: [
			{
				id: "ROW-APPROVE",
				current_state: "Approval happens in chat.",
				current_project_state: "Approval happens in chat and is not durable.",
				desired_state: "Approval is row-level and machine-readable.",
				agreed_change: "Capture row-level approval as durable input.",
				expected_final_state: "Decision build includes approved row refs.",
				validated_final_state: "Gateway pass validates approved row refs.",
				status: "pending",
				proof_refs: ["approval:fixture"],
				rationale: "Decision builds need exact approved rows.",
				affected_layers: ["knowledge", "roadmap"],
				risk: "medium",
			},
			{
				id: "ROW-REJECT",
				current_state: "Rejected rows can leak downstream.",
				desired_state: "Rejected rows stay out of builds.",
				rationale: "Only approved rows become requirements.",
				affected_layers: ["build"],
				risk: "low",
			},
			{
				id: "ROW-DEFER",
				current_state: "Deferred work is ambiguous.",
				desired_state: "Deferred rows stay explicit.",
				rationale: "Planning needs owner/trigger later.",
				affected_layers: ["roadmap"],
				risk: "high",
			},
			{
				id: "ROW-EDIT",
				current_state: "Alternative not captured.",
				desired_state: "Alternative can be attached inline.",
				rationale: "Edit action must preserve evidence.",
				affected_layers: ["knowledge"],
				risk: "medium",
			},
		],
	});

	let model = readDecisionApprovalModel(project);
	assert.equal(model.rows.length, 4);
	assert.equal(model.pendingCount, 4);
	assert.equal(model.decisionBuildEligible, false);
	assert.match(model.fallbackInstruction, /APPROVE DT-APPROVAL\/ROW-APPROVE/);
	assert.equal(model.rows[0].affectedLayers.includes("knowledge"), true);
	assert.equal(
		model.rows[0].currentProjectState,
		"Approval happens in chat and is not durable.",
	);
	assert.equal(
		model.rows[0].agreedChange,
		"Capture row-level approval as durable input.",
	);
	assert.equal(
		model.rows[0].expectedFinalState,
		"Decision build includes approved row refs.",
	);
	assert.equal(
		model.rows[0].validatedFinalState,
		"Gateway pass validates approved row refs.",
	);
	assert.deepEqual(model.rows[0].proofRefs, ["approval:fixture"]);
	assert.equal(model.rows[0].buildEligible, false);
	const rendered = renderDecisionApprovalCards(model, 96).join("\n");
	assert.match(rendered, /Approval is row-level/);
	assert.match(rendered, /layers=knowledge,roadmap/);
	assert.match(rendered, /a approve/);

	const approve = await applyDecisionApprovalAction(project, {
		tableId: "DT-APPROVAL",
		rowId: "ROW-APPROVE",
		action: "approve",
	});
	assert.equal(approve.evidence.capability, "codewiki.decision_table");
	assert.equal(approve.evidence.action, "accept");
	await applyDecisionApprovalAction(project, {
		tableId: "DT-APPROVAL",
		rowId: "ROW-REJECT",
		action: "reject",
	});
	await applyDecisionApprovalAction(project, {
		tableId: "DT-APPROVAL",
		rowId: "ROW-DEFER",
		action: "defer",
	});
	await applyDecisionApprovalAction(project, {
		tableId: "DT-APPROVAL",
		rowId: "ROW-EDIT",
		action: "edit",
		alternative: "Alternative desired state from inline edit.",
	});

	model = readDecisionApprovalModel(project);
	const byId = Object.fromEntries(model.rows.map((row) => [row.rowId, row]));
	assert.equal(byId["ROW-APPROVE"].status, "approved");
	assert.equal(byId["ROW-APPROVE"].lifecycleStatus, "approved");
	assert.equal(
		byId["ROW-APPROVE"].expectedFinalState,
		"Decision build includes approved row refs.",
	);
	assert.deepEqual(byId["ROW-APPROVE"].proofRefs, ["approval:fixture"]);
	assert.equal(byId["ROW-APPROVE"].buildEligible, true);
	assert.equal(byId["ROW-REJECT"].status, "rejected");
	assert.equal(byId["ROW-REJECT"].buildEligible, false);
	assert.equal(byId["ROW-DEFER"].status, "deferred");
	assert.equal(byId["ROW-EDIT"].status, "edited");
	assert.deepEqual(byId["ROW-EDIT"].alternatives, [
		"Alternative desired state from inline edit.",
	]);
	assert.deepEqual(model.approvedRowIds, ["ROW-APPROVE"]);
	assert.equal(
		model.decisionBuildEligible,
		false,
		"edited rows must block full-table build eligibility until resolved",
	);

	const panel = readDecisionTablePanelData(project);
	assert.equal(
		panel.rows.find((row) => row.rowId === "ROW-APPROVE")?.buildEligible,
		true,
	);
	assert.equal(
		panel.rows.find((row) => row.rowId === "ROW-REJECT")?.buildEligible,
		false,
	);
	assert.match(panel.fallbackInstruction, /EDIT DT-APPROVAL\/ROW-EDIT/);

	const stored = JSON.parse(
		await readFile(join(root, ".codewiki/runtime/decision-tables.json"), "utf8"),
	);
	assert.equal(
		stored.tables[0].rows.find((row) => row.id === "ROW-APPROVE").user_action,
		"approved",
	);
	assert.equal(
		stored.tables[0].rows.find((row) => row.id === "ROW-APPROVE").status,
		"approved",
	);
	assert.deepEqual(
		stored.tables[0].rows.find((row) => row.id === "ROW-APPROVE").proof_refs,
		["approval:fixture"],
	);
	assert.equal(
		stored.tables[0].rows.find((row) => row.id === "ROW-REJECT").user_action,
		"rejected",
	);
	assert.equal(
		stored.tables[0].rows.find((row) => row.id === "ROW-DEFER").user_action,
		"deferred",
	);

	const candidates = buildTaskCandidateApprovalModel([
		{
			id: "TASK-CANDIDATE",
			title: "Approve task",
			summary: "Candidate task",
			status: "pending",
			priority: "high",
			kind: "feature",
		},
		{
			id: "TASK-APPROVED",
			title: "Approved task",
			summary: "Ready task",
			status: "approved",
			sprint_id: "SPRINT-001",
		},
	]);
	assert.equal(candidates.toolContract, "wiki_roadmap");
	assert.equal(candidates.candidates[0].buildEligible, false);
	assert.equal(candidates.candidates[1].buildEligible, true);
	assert.match(candidates.fallbackInstruction, /APPROVE TASK-CANDIDATE/);
	const candidateCards = renderTaskCandidateApprovalCards(candidates, 88).join(
		"\n",
	);
	assert.match(candidateCards, /Task\/sprint candidates pending approval/);
	assert.match(candidateCards, /TASK-APPROVED/);
	assert.match(candidateCards, /sprint=SPRINT-001/);
} finally {
	await rm(root, { recursive: true, force: true });
}
