import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, it } from "node:test";

import { GitRefChangeStore } from "../../src/changes/git-ref-store.ts";
import {
	addChangeEvidence,
	createChangeRecord,
	linkChangeRecord,
	mergeChangeRecords,
	parseChangeRecord,
	splitChangeRecord,
	transitionChangeStatus,
} from "../../src/changes/records.ts";
import { ChangeStoreConflictError } from "../../src/changes/store.ts";
import { CHANGE_SCHEMA_VERSION } from "../../src/changes/types.ts";

const run = promisify(execFile);
const NOW = "2026-07-13T03:00:00.000Z";
const roots = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

function change(id, overrides = {}) {
	return {
		schemaVersion: CHANGE_SCHEMA_VERSION,
		id,
		revision: 1,
		status: "pending",
		intent: {
			question: `Should ${id} be implemented?`,
			currentState: "The capability does not exist.",
			desiredState: "The capability exists.",
			rationale: "Users need it.",
			nonGoals: [],
		},
		classification: {
			kind: "introduce",
			type: "workflow_change",
			scope: "system",
			affectedLayers: ["changes"],
			targetRefs: ["src/changes/store.ts"],
		},
		impact: {
			user: "Changes remain available.",
			maintainer: "Changes have deterministic revisions.",
		},
		evidence: { sourceRefs: [], proofRefs: [] },
		safety: { risk: "low", failureModes: ["An update is lost."] },
		validation: {
			state: "draft",
			issues: [],
			assessments: [],
			recommendations: [],
		},
		estimates: {},
		provenance: {
			origin: "agent",
			createdBy: "test-agent",
			createdAt: NOW,
			updatedAt: NOW,
		},
		...overrides,
	};
}

async function repository() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-changes-store-test-"));
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

async function status(root) {
	return (await run("git", ["status", "--porcelain=v1"], { cwd: root })).stdout;
}

describe("Git-ref Change Store", () => {
	it("writes revisioned records without touching the active checkout", async () => {
		const root = await repository();
		const store = new GitRefChangeStore({ repoRoot: root });
		assert.deepEqual(await store.read(), { head: null, records: [] });
		assert.equal(await status(root), "");

		const firstRecord = createChangeRecord(change("CHG-first"));
		const first = await store.write({
			expectedHead: null,
			records: [firstRecord],
			message: "Create first idea",
			actor: "test-agent",
			createdAt: NOW,
		});
		assert.match(first.head, /^[a-f0-9]{40}$/);
		assert.equal(await status(root), "");
		assert.equal((await store.get("CHG-first")).recordRevision, 1);

		const revised = addChangeEvidence(firstRecord, {
			sourceRefs: ["src/changes/store.ts"],
			proofRefs: ["tests/changes/git-ref-store.test.mjs"],
			updatedBy: "test-agent",
			updatedAt: "2026-07-13T03:01:00.000Z",
		});
		const second = await store.write({
			expectedHead: first.head,
			records: [revised],
			message: "Add evidence",
			actor: "test-agent",
			createdAt: "2026-07-13T03:01:00.000Z",
		});
		assert.notEqual(second.head, first.head);
		assert.equal((await store.get("CHG-first")).change.revision, 2);
		assert.equal(await status(root), "");

		const oldBody = (
			await run("git", ["show", `${first.head}:changes/CHG-first.json`], {
				cwd: root,
			})
		).stdout;
		assert.equal(JSON.parse(oldBody).change.revision, 1);
		assert.equal(
			(
				await run("git", ["rev-list", "--count", "refs/codewiki/changes"], {
					cwd: root,
				})
			).stdout.trim(),
			"2",
		);
	});

	it("queries records and rejects stale compare-and-swap writes", async () => {
		const root = await repository();
		const store = new GitRefChangeStore({ repoRoot: root });
		const initial = await store.write({
			expectedHead: null,
			records: [
				createChangeRecord(change("CHG-routing")),
				createChangeRecord(
					change("CHG-security", {
						classification: {
							...change("CHG-security").classification,
							type: "security_change",
						},
					}),
				),
			],
			message: "Create changes",
			actor: "test-agent",
			createdAt: NOW,
		});
		assert.deepEqual(
			(await store.query({ type: "security_change" })).map(
				(record) => record.change.id,
			),
			["CHG-security"],
		);
		assert.deepEqual(
			(await store.query({ text: "routing" })).map(
				(record) => record.change.id,
			),
			["CHG-routing"],
		);

		const routing = await store.get("CHG-routing");
		const updated = addChangeEvidence(routing, {
			sourceRefs: ["src/runtime/handoff.ts"],
			updatedBy: "test-agent",
			updatedAt: "2026-07-13T03:02:00.000Z",
		});
		await store.write({
			expectedHead: initial.head,
			records: [updated],
			message: "Update routing",
			actor: "test-agent",
			createdAt: "2026-07-13T03:02:00.000Z",
		});
		await assert.rejects(
			store.write({
				expectedHead: initial.head,
				records: [updated],
				message: "Stale update",
				actor: "stale-agent",
				createdAt: "2026-07-13T03:03:00.000Z",
			}),
			ChangeStoreConflictError,
		);

		const reopened = new GitRefChangeStore({ repoRoot: root });
		assert.equal((await reopened.get("CHG-routing")).change.revision, 2);
		assert.equal(await status(root), "");
	});

	it("supports links, merge, split, and status transitions as record revisions", () => {
		const first = createChangeRecord(change("CHG-first"));
		const second = createChangeRecord(change("CHG-second"));
		const linked = linkChangeRecord(first, {
			relation: "related",
			targetChangeId: second.change.id,
			createdBy: "test-agent",
			createdAt: NOW,
		});
		assert.equal(linked.recordRevision, 2);
		assert.equal(parseChangeRecord(linked).links[0].relation, "related");

		const [mergedTarget, mergedSource] = mergeChangeRecords({
			target: linked,
			sources: [second],
			changedBy: "test-agent",
			changedAt: NOW,
		});
		assert.equal(mergedTarget.links.at(-1).relation, "merged_from");
		assert.equal(mergedSource.change.status, "withdrawn");
		assert.equal(mergedSource.links[0].relation, "merged_into");

		const [splitParent, childA, childB] = splitChangeRecord({
			parent: first,
			children: [change("CHG-child-a"), change("CHG-child-b")],
			changedBy: "test-agent",
			changedAt: NOW,
		});
		assert.equal(splitParent.links.length, 2);
		assert.equal(childA.recordRevision, 1);
		assert.equal(childB.links[0].targetChangeId, first.change.id);

		const deferred = transitionChangeStatus(first, {
			status: "deferred",
			changedBy: "test-agent",
			changedAt: NOW,
			reason: "Wait for evidence.",
		});
		assert.equal(deferred.change.status, "deferred");
		assert.equal(deferred.change.lastStatusTransition.to, "deferred");
		assert.equal(deferred.change.revision, 2);
	});
});
