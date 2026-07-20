import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	previewPackageScriptDigest,
	previewProfileById,
	previewProfileDigest,
	resolveWikiPreviewConfig,
} from "../../src/preview/profile.ts";

function profile(overrides = {}) {
	return {
		id: "web",
		runner: {
			kind: "package_script",
			script: "dev",
			scriptDigest: previewPackageScriptDigest("vite"),
		},
		url: "http://127.0.0.1:4173",
		readyPath: "/health",
		readyTimeoutMs: 20_000,
		browser: "system",
		autoOpen: true,
		...overrides,
	};
}

describe("preview profiles", () => {
	it("normalizes bounded structured package-script profiles", () => {
		const config = resolveWikiPreviewConfig({ profiles: [profile()] });
		assert.deepEqual(config, { profiles: [profile()] });
		assert.equal(previewProfileById(config, "web")?.runner.script, "dev");
		assert.match(
			previewProfileDigest(config.profiles[0]),
			/^sha256:[a-f0-9]{64}$/,
		);
	});

	it("applies safe profile defaults", () => {
		const config = resolveWikiPreviewConfig({
			profiles: [
				{
					id: "app",
					runner: {
						kind: "package_script",
						script: "start:dev",
						scriptDigest: previewPackageScriptDigest("vite --host 127.0.0.1"),
					},
					url: "http://localhost:3000",
				},
			],
		});
		assert.deepEqual(config.profiles[0], {
			id: "app",
			runner: {
				kind: "package_script",
				script: "start:dev",
				scriptDigest: previewPackageScriptDigest("vite --host 127.0.0.1"),
			},
			url: "http://localhost:3000",
			readyPath: "/",
			readyTimeoutMs: 30_000,
			browser: "system",
			autoOpen: true,
		});
	});

	it("rejects shell strings, remote targets, duplicates, and unknown keys", () => {
		assert.throws(
			() =>
				resolveWikiPreviewConfig({
					profiles: [profile({ command: "npm run dev" })],
				}),
			/unknown config key/,
		);
		assert.throws(
			() =>
				resolveWikiPreviewConfig({
					profiles: [profile({ runner: { kind: "shell", script: "dev" } })],
				}),
			/package_script/,
		);
		assert.throws(
			() =>
				resolveWikiPreviewConfig({
					profiles: [profile({ url: "https://example.com" })],
				}),
			/loopback/,
		);
		assert.throws(
			() => resolveWikiPreviewConfig({ profiles: [profile(), profile()] }),
			/duplicated/,
		);
		assert.throws(
			() =>
				resolveWikiPreviewConfig({
					profiles: [profile({ readyPath: "//evil.test" })],
				}),
			/origin-relative path/,
		);
	});

	it("changes the digest for every execution-relevant field", () => {
		const base = resolveWikiPreviewConfig({ profiles: [profile()] })
			.profiles[0];
		const changed = resolveWikiPreviewConfig({
			profiles: [profile({ readyPath: "/ready" })],
		}).profiles[0];
		assert.notEqual(previewProfileDigest(base), previewProfileDigest(changed));
	});
});
