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

async function waitForLength(values, length, deadline) {
	if (values.length >= length) return;
	if (Date.now() >= deadline) throw new Error("Timed out waiting for routed event.");
	await new Promise((resolve) => setTimeout(resolve, 10));
	return waitForLength(values, length, deadline);
}

function projectServices() {
	return {
		async connect() {},
		inspect(root, _ctx, trigger) {
			return new RuntimeReactor(root).inspect(trigger);
		},
		async semanticExecution() {
			return "client_candidate";
		},
		async react() {
			throw new Error("autonomous semantic execution is not expected");
		},
		events() {
			return new Promise(() => undefined);
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

	it("delegates selected work to service semantic execution without exposing candidate tools", async () => {
		const root = await project();
		const store = new ChangeTraceStore({ repoRoot: root });
		await store.write({
			expectedHead: null,
			records: [
				createChangeRecord(
					acceptedChangeFixture({ id: "CHG-service-semantic-routing" }),
				),
			],
			message: "Persist Change",
			actor: "maintainer",
			createdAt: "2026-08-04T00:00:00.000Z",
		});
		const handlers = new Map();
		let activeTools = ["read", "wiki_state", "wiki_change", "wiki_decide"];
		const triggers = [];
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
			{
				async connect() {},
				inspect(root, _ctx, trigger) {
					return new RuntimeReactor(root).inspect(trigger);
				},
				async semanticExecution() {
					return "service";
				},
				async react(_root, _ctx, trigger) {
					triggers.push(trigger);
					return [];
				},
				events() {
					return new Promise(() => undefined);
				},
				async submitCandidate() {
					throw new Error("candidate submission is not expected");
				},
				async disconnect() {},
			},
		);

		await handlers.get("before_agent_start")({}, { cwd: root });
		assert.deepEqual(activeTools, ["read", "wiki_state", "wiki_change"]);
		assert.deepEqual(triggers, [{ kind: "manual_resume" }]);
	});

	it("refreshes routing after event replay reset without trusting event payloads", async () => {
		const root = await project();
		const handlers = new Map();
		const inspected = [];
		let releaseEvents;
		const firstEvents = new Promise((resolve) => {
			releaseEvents = resolve;
		});
		let eventCalls = 0;
		registerRuntimeToolRouting(
			{
				on(name, handler) {
					handlers.set(name, handler);
				},
				getActiveTools() {
					return ["read", "wiki_state"];
				},
				setActiveTools() {},
			},
			{
				async connect() {},
				async inspect(_root, _ctx, trigger) {
					inspected.push(trigger.kind);
					return {
						schemaVersion: 1,
						status: "quiescent",
						trigger,
						observedWorkStateDigest: "digest:event-refresh",
					};
				},
				async semanticExecution() {
					return "service";
				},
				async react() {
					return [];
				},
				events() {
					eventCalls += 1;
					if (eventCalls === 1) return firstEvents;
					return new Promise(() => undefined);
				},
				async submitCandidate() {
					throw new Error("candidate submission is not expected");
				},
				async disconnect() {},
			},
		);
		await handlers.get("session_start")({}, { cwd: root });
		releaseEvents({
			schemaVersion: 1,
			generationId: "generation:replacement",
			latestCursor: 7,
			cursor: 7,
			resetRequired: true,
			events: [],
		});
		await waitForLength(inspected, 2, Date.now() + 1_000);
		assert.deepEqual(inspected, ["session_started", "timer_due"]);
		await handlers.get("session_shutdown")({}, { cwd: root });
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
