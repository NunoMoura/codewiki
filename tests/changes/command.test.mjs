import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, it } from "node:test";

import { runWikiChange } from "../../src/changes/command.ts";
import { CHANGE_SCHEMA_VERSION } from "../../src/changes/types.ts";

const run = promisify(execFile);
const NOW = "2026-07-13T04:00:00.000Z";
const roots = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

function change(id = "CHG-api-test") {
	return {
		schemaVersion: CHANGE_SCHEMA_VERSION,
		id,
		revision: 1,
		status: "pending",
		intent: {
			question: "Should Changes have a guarded API?",
			currentState: "Changes are not available through Pi.",
			desiredState: "Changes have one guarded API.",
			rationale: "Adapters need one semantic contract.",
			nonGoals: ["Do not accept Changes."],
			alternatives: ["Keep Changes conversational only."],
		},
		classification: {
			kind: "introduce",
			type: "workflow_change",
			scope: "system",
			affectedLayers: ["api", "changes"],
			targetRefs: ["src/changes/command.ts"],
		},
		impact: {
			user: "Agents can retain out-of-scope improvements.",
			maintainer: "Mutations use exact revision guards.",
		},
		knowledge: {
			topicRefs: [],
			propagationRefs: [],
			noImpactRationale: "API-only fixture.",
		},
		outcome: {
			successSignals: ["Guarded Change API tests pass."],
			evidenceExpectations: ["Change API test evidence."],
		},
		delivery: { constraints: [], planningQuestions: [] },
		evidence: {
			sourceRefs: ["src/changes/command.ts"],
			proofRefs: [],
		},
		safety: {
			risk: "low",
			invariants: ["Stale records remain immutable."],
			failureModes: ["An agent mutates a stale record."],
			regressionPlan: "Run Change API tests.",
		},
		validation: {
			state: "draft",
			issues: [],
			assessments: [],
			recommendations: [],
		},
		estimates: { effort: "medium", workScale: "small" },
		provenance: {
			origin: "agent",
			createdBy: "test-agent",
			createdAt: NOW,
			updatedAt: NOW,
		},
	};
}

async function repository() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-wiki-change-test-"));
	roots.push(root);
	await run("git", ["init", "-q"], { cwd: root });
	await run("git", ["config", "user.name", "Changes Test"], { cwd: root });
	await run("git", ["config", "user.email", "changes@example.test"], {
		cwd: root,
	});
	await writeFile(join(root, "README.md"), "# Fixture\n");
	await run("git", ["add", "README.md"], { cwd: root });
	await run("git", ["commit", "-q", "-m", "fixture"], { cwd: root });
	return root;
}

describe("wiki_change core facade", () => {
	it("creates, lists, reads, validates, and revises guarded Changes", async () => {
		const repoRoot = await repository();
		const empty = await runWikiChange({ repoRoot, operation: "list" });
		assert.equal(empty.head, null);
		assert.deepEqual(empty.records, []);

		const created = await runWikiChange({
			repoRoot,
			operation: "create",
			expectedHead: null,
			change: change(),
			actor: "test-agent",
			createdAt: NOW,
		});
		assert.equal(created.changed, true);
		assert.deepEqual(created.writtenChangeIds, ["CHG-api-test"]);

		const listed = await runWikiChange({
			repoRoot,
			operation: "list",
			query: { text: "guarded api" },
		});
		assert.equal(listed.records.length, 1);
		assert.equal(listed.records[0].recordRevision, 1);
		assert.equal("change" in listed.records[0], false);

		const read = await runWikiChange({
			repoRoot,
			operation: "get",
			changeId: "CHG-api-test",
		});
		const validation = await runWikiChange({
			repoRoot,
			operation: "validate",
			changeId: "CHG-api-test",
		});
		assert.equal(validation.validation.ready, false);
		assert.deepEqual(validation.validation.issues, [
			"Change validation is not valid.",
		]);

		const revised = await runWikiChange({
			repoRoot,
			operation: "add_evidence",
			expectedHead: read.head,
			expectedRecordRevision: read.record.recordRevision,
			changeId: "CHG-api-test",
			proofRefs: ["tests/changes/command.test.mjs"],
			actor: "test-agent",
			createdAt: "2026-07-13T04:01:00.000Z",
		});
		assert.equal(revised.record.change.revision, 2);
		assert.equal(revised.record.recordRevision, 2);
		assert.deepEqual(revised.record.change.evidence.proofRefs, [
			"tests/changes/command.test.mjs",
		]);
	});

	it("deduplicates matching proposals without advancing the Changes ref", async () => {
		const repoRoot = await repository();
		const first = await runWikiChange({
			repoRoot,
			operation: "create",
			expectedHead: null,
			change: change("CHG-first"),
			actor: "test-agent",
			createdAt: NOW,
		});
		const duplicate = await runWikiChange({
			repoRoot,
			operation: "create",
			expectedHead: first.head,
			change: change("CHG-duplicate"),
			actor: "test-agent",
			createdAt: NOW,
		});
		assert.equal(duplicate.changed, false);
		assert.equal(duplicate.duplicate, true);
		assert.equal(duplicate.head, first.head);
		assert.equal(duplicate.record.change.id, "CHG-first");
	});

	it("rejects stale, unsupported, secret-bearing, and authority-seeking input", async () => {
		const repoRoot = await repository();
		await assert.rejects(
			runWikiChange({ repoRoot, operation: "create", change: change() }),
			/require expectedHead/,
		);
		await assert.rejects(
			runWikiChange({ repoRoot, operation: "accept" }),
			/Unsupported wiki_change operation accept/,
		);
		await assert.rejects(
			runWikiChange({ repoRoot, operation: "list", unsupported: true }),
			/unsupported input field unsupported/,
		);

		const secret = change("CHG-secret");
		secret.intent.rationale =
			"Token sk_testsecretvalue123456789 must never be stored.";
		await assert.rejects(
			runWikiChange({
				repoRoot,
				operation: "create",
				expectedHead: null,
				change: secret,
				actor: "test-agent",
				createdAt: NOW,
			}),
			/rejects secret-shaped Change content/,
		);

		const accepted = change("CHG-accepted");
		accepted.status = "accepted";
		await assert.rejects(
			runWikiChange({
				repoRoot,
				operation: "create",
				expectedHead: null,
				change: accepted,
				actor: "test-agent",
				createdAt: NOW,
			}),
			/accepted Change must be valid|cannot create accepted Changes/,
		);
	});
});
