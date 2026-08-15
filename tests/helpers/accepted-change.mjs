import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { changeContentDigest } from "../../src/changes/digest.ts";
import { ChangeTraceStore } from "../../src/changes/trace/store.ts";
import { createChangeRecord } from "../../src/changes/records.ts";
import { CHANGE_SCHEMA_VERSION } from "../../src/changes/types.ts";

const run = promisify(execFile);

export function acceptedChangeFixture(overrides = {}) {
	const createdAt = overrides.createdAt || "2026-06-25T00:00:01.000Z";
	const change = {
		schemaVersion: CHANGE_SCHEMA_VERSION,
		id: overrides.id || "CHG-accepted-fixture",
		revision: 1,
		status: "pending",
		intent: {
			question:
				overrides.question || "Should this validated Change become trace work?",
			currentState:
				overrides.currentState ||
				"Decision input is mutable before acceptance.",
			desiredState:
				overrides.desiredState ||
				"Decision embeds one exact accepted Change revision.",
			rationale:
				overrides.rationale || "Independent traces require immutable input.",
			nonGoals: overrides.nonGoals || [
				"Do not widen scope beyond this Change.",
			],
			alternatives: overrides.alternatives || ["Keep current behavior."],
		},
		classification: {
			kind: overrides.kind || "introduce",
			type: overrides.type || "workflow_change",
			scope: overrides.scope || "system",
			affectedLayers: overrides.affectedLayers || [
				"changes",
				"decision",
				"traces",
			],
			targetRefs: overrides.targetRefs || ["src/loops/decision/command.ts"],
		},
		impact: {
			user:
				overrides.userImpact ||
				"The main session can continue after acceptance.",
			maintainer:
				overrides.maintainerImpact || "Trace input remains replayable.",
		},
		knowledge: {
			topicRefs: overrides.knowledgeTopicRefs || [
				"kb:system/components/decision-loop.md",
			],
			propagationRefs: overrides.knowledgePropagationRefs || [
				"kb:system/components/decision-loop.md",
			],
			noImpactRationale: overrides.knowledgeNoImpactRationale,
		},
		outcome: {
			successSignals: [
				overrides.successSignal ||
					"Trace event contains the exact approved Change digest.",
			],
			evidenceExpectations: overrides.evidenceExpectations || [
				"Decision and trace replay tests pass.",
			],
		},
		delivery: {
			constraints: overrides.deliveryConstraints || [],
			planningQuestions: overrides.planningQuestions || [],
		},
		evidence: {
			sourceRefs: overrides.sourceRefs || [
				"kb:system/components/decision-loop.md",
			],
			proofRefs: overrides.proofRefs || ["tests/helpers/accepted-change.mjs"],
		},
		safety: {
			risk: overrides.risk || "low",
			invariants: overrides.invariants || ["Keep Change identity stable."],
			safetyBoundary: overrides.safetyBoundary,
			failureModes: overrides.failureModes || [
				"A stale revision could be accepted.",
			],
			negativeTestPlan: overrides.negativeTestPlan,
			rollbackPlan: overrides.rollbackPlan,
			regressionPlan:
				overrides.regressionPlan || "Run Decision and trace replay tests.",
		},
		validation: {
			state: "draft",
			issues: [],
			assessments: overrides.assessments || [
				{
					actor: "agent:test",
					stance: "aligned",
					rationale: "Change serves stated user value.",
					concerns: [],
					evidenceRefs: ["tests/helpers/accepted-change.mjs"],
				},
			],
			recommendations: overrides.recommendations || [
				{
					actor: "agent:test",
					value: "accept",
					rationale: "Validated Change is ready for approval.",
					evidenceRefs: ["tests/helpers/accepted-change.mjs"],
				},
			],
		},
		estimates: {
			effort: overrides.effort || "low",
			workScale: overrides.workScale || "small",
		},
		provenance: {
			origin: overrides.origin || "user",
			createdBy: overrides.createdBy || "user",
			createdAt,
			updatedAt: createdAt,
		},
	};
	const digest = changeContentDigest(change);
	change.validation = {
		...change.validation,
		state: "valid",
		validatedRevision: change.revision,
		validatedDigest: digest,
		validatorVersion: "test-v1",
	};
	return change;
}

export async function seedChangeAcceptance(repoRoot, options = {}) {
	await ensureGitRepository(repoRoot);
	const change = acceptedChangeFixture(options);
	const record = createChangeRecord(change);
	const store = new ChangeTraceStore({ repoRoot });
	const seeded = await store.write({
		expectedHead: null,
		records: [record],
		message: `Seed ${change.id}`,
		actor: options.acceptedBy || "user",
		createdAt: change.provenance.createdAt,
	});
	return { store, record, head: seeded.head };
}

async function ensureGitRepository(repoRoot) {
	try {
		await run("git", ["rev-parse", "--show-toplevel"], { cwd: repoRoot });
	} catch {
		await run("git", ["init", "-q"], { cwd: repoRoot });
	}
}
