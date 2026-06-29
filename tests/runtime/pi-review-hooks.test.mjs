import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { InMemoryReviewEvidenceCache } from "../../src/implementation/review/index.ts";
import codewikiExtension from "../../src/pi/extension.ts";
import {
	createCodeWikiReviewToolResultHandler,
	pathScopesFromToolEventContext,
	pathsFromToolEvent,
	registerCodeWikiReviewHooks,
} from "../../src/pi/review-hooks.ts";

function mockPi() {
	const events = [];
	const messages = [];
	return {
		events,
		messages,
		api: {
			registerTool() {},
			registerCommand() {},
			registerMessageRenderer() {},
			sendMessage(message) {
				messages.push(message);
			},
			on(eventName, handler) {
				events.push({ eventName, handler });
			},
		},
	};
}

describe("CodeWiki Pi review hooks", () => {
	it("registers a guarded tool_result hook when Pi events are available", () => {
		const pi = mockPi();
		const registration = registerCodeWikiReviewHooks(pi.api);

		assert.deepEqual(registration, {
			registered: true,
			eventName: "tool_result",
		});
		assert.equal(pi.events[0].eventName, "tool_result");
	});

	it("does not register when Pi events are unavailable", () => {
		const registration = registerCodeWikiReviewHooks({});
		assert.equal(registration.registered, false);
		assert.match(registration.reason, /unavailable/);
	});

	it("extracts edited paths from common write/edit event shapes", () => {
		assert.deepEqual(pathsFromToolEvent({ args: { path: "src/index.ts" } }), [
			"src/index.ts",
		]);
		assert.deepEqual(
			pathsFromToolEvent({ result: { paths: ["src/a.ts", "src/a.ts"] } }),
			["src/a.ts"],
		);
	});

	it("extracts active path scopes from event and context", () => {
		assert.deepEqual(
			pathScopesFromToolEventContext(
				{ args: { pathScopes: ["src/implementation/"] } },
				{ cwd: process.cwd() },
			),
			["src/implementation/"],
		);
		assert.deepEqual(
			pathScopesFromToolEventContext(
				{},
				{
					cwd: process.cwd(),
					review: { activePathScopes: ["src/pi/"] },
				},
			),
			["src/pi/"],
		);
	});

	it("routes code-bearing write events to common fast feedback", async () => {
		const notifications = [];
		const cache = new InMemoryReviewEvidenceCache();
		const handler = createCodeWikiReviewToolResultHandler();

		const result = await handler(
			{
				toolName: "write",
				args: {
					path: "src/config.ts",
					content: "export const token = 'abc123456789xyz';",
				},
				result: { success: true },
			},
			{
				cwd: process.cwd(),
				ui: { notify: (message) => notifications.push(message) },
				review: { evidenceCache: cache, traceId: "TRACE-hook" },
			},
		);

		assert.deepEqual(result.changedPaths, ["src/config.ts"]);
		assert.equal(result.feedback.status, "block");
		assert.equal(result.feedback.findings[0].kind, "secret-like-content");
		assert.equal(result.cachedEvidenceId, cache.entries()[0].id);
		assert.equal(
			cache.reports({
				traceId: "TRACE-hook",
				changedPaths: ["src/config.ts"],
			})[0].phase,
			"fast",
		);
		assert.equal(notifications.length, 1);
		assert.match(notifications[0], /CodeWiki fast review: block/);
	});

	it("auto-detects edited file language and caches fast language evidence", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-review-hook-"));
		try {
			await mkdir(join(root, "src"), { recursive: true });
			await writeFile(
				join(root, "package.json"),
				JSON.stringify({
					name: "fixture",
					scripts: {
						typecheck:
							"node -e \"console.error('src/config.ts(1,1): error TS9999: Fast broken.'); process.exit(1)\"",
					},
				}),
			);
			const cache = new InMemoryReviewEvidenceCache();
			const handler = createCodeWikiReviewToolResultHandler();

			const result = await handler(
				{
					toolName: "write",
					args: { path: "src/config.ts", content: "export const value = 1;" },
					result: { success: true },
				},
				{
					cwd: root,
					review: { evidenceCache: cache, traceId: "TRACE-hook-language" },
				},
			);

			assert.equal(
				result.languageReview.selectedPackIds.includes("tsjs.typescript"),
				true,
			);
			assert.equal(
				result.languageReview.selectedPackIds.includes("python.ruff"),
				false,
			);
			assert.equal(
				result.feedback.findings.some(
					(finding) =>
						finding.kind === "blocking-diagnostic" &&
						finding.message.includes("TS9999"),
				),
				true,
			);
			const cached = cache.reports({
				traceId: "TRACE-hook-language",
				changedPaths: ["src/config.ts"],
			})[0];
			assert.equal(
				cached.sources.some((source) => source.id === "tsjs.typescript"),
				true,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("uses active path scopes to block out-of-scope code edits", async () => {
		const handler = createCodeWikiReviewToolResultHandler();
		const result = await handler(
			{
				toolName: "edit",
				args: { path: "src/outside.ts" },
				result: { success: true },
			},
			{ cwd: process.cwd(), review: { activePathScopes: ["src/pi/"] } },
		);

		assert.equal(result.feedback.status, "block");
		assert.equal(result.feedback.findings[0].kind, "path-scope");
	});

	it("skips KB/doc-only edits instead of treating them as code review", async () => {
		const handler = createCodeWikiReviewToolResultHandler();
		const result = await handler(
			{
				toolName: "edit",
				args: { path: ".codewiki/kb/system/loop-contracts.md" },
				result: { success: true },
			},
			{ cwd: process.cwd() },
		);

		assert.equal(
			result.skipped,
			"No code-bearing implementation path changed.",
		);
	});

	it("extension registers CodeWiki-owned review hook alongside existing hooks", () => {
		const pi = mockPi();
		codewikiExtension(pi.api);

		assert.equal(
			pi.events.some((event) => event.eventName === "tool_result"),
			true,
		);
	});
});
