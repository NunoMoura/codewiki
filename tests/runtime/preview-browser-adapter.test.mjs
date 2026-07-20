import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	assertLoopbackPreviewUrl,
	detectPreviewBrowserCapability,
	normalizePreviewSessionId,
	previewBrowserCommand,
} from "../../src/preview/browser-adapter.ts";

describe("preview browser adapter", () => {
	it("builds structured system browser commands for supported platforms", () => {
		const url = "http://127.0.0.1:4312/#token=test";
		assert.deepEqual(
			previewBrowserCommand({ adapter: "system", url }, "linux"),
			{
				command: "xdg-open",
				args: [url],
				detached: true,
				waitForExit: false,
			},
		);
		assert.deepEqual(
			previewBrowserCommand({ adapter: "system", url }, "darwin"),
			{
				command: "open",
				args: [url],
				detached: true,
				waitForExit: false,
			},
		);
		assert.deepEqual(
			previewBrowserCommand({ adapter: "system", url }, "win32"),
			{
				command: "cmd",
				args: ["/c", "start", "", url],
				detached: true,
				waitForExit: false,
			},
		);
	});

	it("builds an isolated Playwright CLI session without a shell command", () => {
		assert.deepEqual(
			previewBrowserCommand({
				adapter: "playwright",
				url: "http://localhost:5173/app",
				sessionId: "codewiki-dashboard-test",
			}),
			{
				command: "playwright-cli",
				args: [
					"-s=codewiki-dashboard-test",
					"open",
					"http://localhost:5173/app",
					"--headed",
				],
				detached: false,
				waitForExit: true,
			},
		);
	});

	it("allows only bounded loopback preview URLs and session IDs", () => {
		assert.equal(
			assertLoopbackPreviewUrl("https://[::1]:7443"),
			"https://[::1]:7443/",
		);
		assert.equal(normalizePreviewSessionId(), "codewiki-preview");
		assert.throws(
			() => assertLoopbackPreviewUrl("not a URL"),
			/valid absolute URL/,
		);
		assert.throws(
			() => assertLoopbackPreviewUrl("file:///tmp/index.html"),
			/HTTP or HTTPS/,
		);
		assert.throws(
			() => assertLoopbackPreviewUrl("https://example.com"),
			/loopback hostname/,
		);
		assert.throws(
			() => normalizePreviewSessionId("bad session; rm -rf"),
			/session ID/,
		);
	});

	it("preflights optional Playwright CLI without installing anything", async () => {
		const available = await detectPreviewBrowserCapability(
			"playwright",
			async (command, args) => {
				assert.equal(command, "playwright-cli");
				assert.deepEqual(args, ["--version"]);
				return true;
			},
		);
		assert.deepEqual(available, {
			cliState: "available",
			sessionState: "not_open",
			captureAvailable: false,
			reason: "Open preview to verify the browser and enable Capture.",
		});
		const unavailable = await detectPreviewBrowserCapability(
			"playwright",
			async () => false,
		);
		assert.equal(unavailable.cliState, "unavailable");
		assert.equal(unavailable.captureAvailable, false);
		assert.match(unavailable.installHint, /npm install -g @playwright\/cli/);
		assert.deepEqual(await detectPreviewBrowserCapability("system"), {
			cliState: "not_required",
			sessionState: "not_open",
			captureAvailable: false,
		});
	});

	it("does not create a command for the disabled adapter", () => {
		assert.equal(
			previewBrowserCommand({ adapter: "none", url: "http://127.0.0.1:3000" }),
			undefined,
		);
	});
});
