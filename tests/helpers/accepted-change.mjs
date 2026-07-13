import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { changeContentDigest } from "../../src/changes/digest.ts";
import { GitRefChangeStore } from "../../src/changes/git-ref-store.ts";
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
			question: overrides.question || "Should this validated Change become trace work?",
			currentState: overrides.currentState || "Decision input is mutable before acceptance.",
			desiredState: overrides.desiredState || "Decision embeds one exact accepted Change revision.",
			rationale: overrides.rationale || "Independent traces require immutable input.",
			nonGoals: overrides.nonGoals || ["Do not widen scope beyond this Change."],
		},
		classification: {
			kind: overrides.kind || "introduce",
			type: overrides.type || "workflow_change",
			scope: overrides.scope || "system",
			affectedLayers: overrides.affectedLayers || ["changes", "decision", "traces"],
			targetRefs: overrides.targetRefs || ["src/api/wiki-decide.ts"],
		},
		impact: {
			user: overrides.userImpact || "The main session can continue after acceptance.",
			maintainer: overrides.maintainerImpact || "Trace input remains replayable.",
		},
		evidence: {
			sourceRefs: overrides.sourceRefs || ["kb:system/components/decision-loop.md"],
			proofRefs: overrides.proofRefs || ["tests/helpers/accepted-change.mjs"],
		},
		safety: {
			risk: overrides.risk || "low",
			safetyBoundary: overrides.safetyBoundary,
			failureModes: overrides.failureModes || ["A stale revision could be accepted."],
			negativeTestPlan: overrides.negativeTestPlan,
			rollbackPlan: overrides.rollbackPlan,
		},
		validation: {
			state: "draft",
			issues: [],
			assessments: [],
			recommendations: [],
			successSignal: overrides.successSignal || "Trace event contains the accepted bundle digest.",
			regressionPlan: overrides.regressionPlan || "Run Decision and trace replay tests.",
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
	const store = new GitRefChangeStore({ repoRoot });
	const seeded = await store.write({
		expectedHead: null,
		records: [record],
		message: `Seed ${change.id}`,
		actor: options.acceptedBy || "user",
		createdAt: change.provenance.createdAt,
	});
	return {
		store,
		record,
		changeAcceptance: {
			expectedHead: seeded.head,
			selections: [
				{
					changeId: change.id,
					revision: change.revision,
					recordRevision: record.recordRevision,
					contentDigest: changeContentDigest(change),
				},
			],
			acceptedBy: options.acceptedBy || "user",
			acceptedAt: options.acceptedAt || "2026-06-25T00:00:02.000Z",
		},
	};
}

async function ensureGitRepository(repoRoot) {
	try {
		await run("git", ["rev-parse", "--show-toplevel"], { cwd: repoRoot });
	} catch {
		await run("git", ["init", "-q"], { cwd: repoRoot });
	}
}
