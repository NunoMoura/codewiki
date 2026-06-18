import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import {
	assertProjectLocalMutationAllowed,
	isProjectLocalCodewikiInstall,
	PROJECT_LOCAL_INSTALL_REQUIRED_MESSAGE,
	stripNonProjectInstallOverride,
} from "../../src/pi/install-scope.ts";

function fileUrl(path) {
	return pathToFileURL(path).href;
}

describe("Pi project-local install guard", () => {
	it("allows package code loaded from the current project's .pi tree", () => {
		const projectRoot = "/repo/app";
		const moduleUrl = fileUrl(
			join(
				projectRoot,
				".pi/npm/node_modules/codewiki/dist/pi/extension.js",
			),
		);

		assert.equal(isProjectLocalCodewikiInstall(moduleUrl, projectRoot), true);
		assert.doesNotThrow(() =>
			assertProjectLocalMutationAllowed({
				toolName: "wiki_decide",
				ctx: { cwd: projectRoot },
				projectRoot,
				moduleUrl,
			}),
		);
	});

	it("allows source-checkout execution for repo-local development", () => {
		const projectRoot = "/repo/codewiki";
		const moduleUrl = fileUrl(join(projectRoot, "dist/pi/extension.js"));

		assert.equal(isProjectLocalCodewikiInstall(moduleUrl, projectRoot), true);
	});

	it("rejects non-project package installs for mutation", () => {
		const projectRoot = "/repo/app";
		const moduleUrl = fileUrl(
			"/home/user/.pi/agent/npm/node_modules/codewiki/dist/pi/extension.js",
		);

		assert.equal(isProjectLocalCodewikiInstall(moduleUrl, projectRoot), false);
		assert.throws(
			() =>
				assertProjectLocalMutationAllowed({
					toolName: "wiki_plan",
					ctx: { cwd: projectRoot },
					projectRoot,
					moduleUrl,
				}),
			new RegExp(PROJECT_LOCAL_INSTALL_REQUIRED_MESSAGE),
		);
	});

	it("allows explicit non-project install overrides and strips them before core calls", () => {
		const projectRoot = "/repo/app";
		const moduleUrl = fileUrl(
			"/tmp/package/node_modules/codewiki/dist/pi/extension.js",
		);
		const input = {
			mode: "append",
			allowNonProjectInstall: true,
			expectedBytes: 0,
			nextSequence: 1,
		};

		assert.doesNotThrow(() =>
			assertProjectLocalMutationAllowed({
				toolName: "wiki_decide",
				ctx: { cwd: projectRoot },
				projectRoot,
				moduleUrl,
				input,
			}),
		);
		assert.deepEqual(stripNonProjectInstallOverride(input), {
			mode: "append",
			expectedBytes: 0,
			nextSequence: 1,
		});
	});
});
