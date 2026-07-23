import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { changeTraceId } from "../../src/changes/change-trace.ts";
import {
	acceptChangeRecord,
	createChangeRecord,
} from "../../src/changes/records.ts";
import { ChangeTraceStore } from "../../src/changes/trace-store.ts";
import { registerRuntimeToolRouting } from "../../src/pi/runtime-tool-routing.ts";
import { RuntimeReactor } from "../../src/runtime/reactor.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";

const roots = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function project() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-runtime-tools-"));
	roots.push(root);
	await mkdir(join(root, ".codewiki", "kb"), { recursive: true });
	return root;
}

function projectServices() {
	return {
		async connect() {},
		inspect(root, _ctx, trigger) {
			return new RuntimeReactor(root).inspect(trigger);
		},
		async submitCandidate() {
			throw new Error("candidate submission is not expected");
		},
		async disconnect() {},
	};
}

describe("runtime tool routing", () => {
	it("keeps only the runtime-selected semantic loop active", async () => {
		const root = await project();
		const store = new ChangeTraceStore({ repoRoot: root });
		const record = createChangeRecord(
			acceptedChangeFixture({ id: "CHG-runtime-routing" }),
		);
		const persisted = await store.write({
			expectedHead: null,
			records: [record],
			message: "Persist Change",
			actor: "maintainer",
			createdAt: "2026-08-04T00:00:00.000Z",
		});
		const handlers = new Map();
		let activeTools = [
			"read",
			"bash",
			"wiki_state",
			"wiki_change",
			"wiki_decide",
			"wiki_plan",
			"wiki_implement",
			"wiki_archive",
		];
		registerRuntimeToolRouting(
			{
				on(name, handler) {
					handlers.set(name, handler);
				},
				getActiveTools() {
					return [...activeTools];
				},
				setActiveTools(names) {
					activeTools = [...names];
				},
			},
			projectServices(),
		);

		await handlers.get("before_agent_start")({}, { cwd: root });
		assert.deepEqual(activeTools, [
			"read",
			"bash",
			"wiki_state",
			"wiki_change",
			"wiki_decide",
		]);

		const accepted = acceptChangeRecord(record, {
			changedBy: "maintainer",
			changedAt: "2026-08-04T00:01:00.000Z",
			authority: "user",
			ref: changeTraceId(record.change.id),
		});
		await store.write({
			expectedHead: persisted.head,
			records: [accepted],
			message: "Approve Change",
			actor: "maintainer",
			createdAt: "2026-08-04T00:01:00.000Z",
		});
		await handlers.get("tool_result")(
			{ toolName: "wiki_decide" },
			{ cwd: root },
		);
		assert.deepEqual(activeTools, [
			"read",
			"bash",
			"wiki_state",
			"wiki_change",
			"wiki_plan",
		]);
	});

	it("fails closed outside a CodeWiki project", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-runtime-tools-none-"));
		roots.push(root);
		const handlers = new Map();
		let activeTools = ["read", "wiki_decide", "wiki_plan", "wiki_archive"];
		registerRuntimeToolRouting(
			{
				on(name, handler) {
					handlers.set(name, handler);
				},
				getActiveTools() {
					return [...activeTools];
				},
				setActiveTools(names) {
					activeTools = [...names];
				},
			},
			projectServices(),
		);

		await handlers.get("session_start")({}, { cwd: root });
		assert.deepEqual(activeTools, ["read"]);
	});
});
