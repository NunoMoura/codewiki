import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
	maybeLoadProject,
	resolveToolProject,
} from "../../src/project/context.ts";

const root = mkdtempSync(join(tmpdir(), "codewiki-project-resolution-"));
try {
	mkdirSync(resolve(root, ".codewiki"), { recursive: true });
	mkdirSync(resolve(root, "src", "nested"), { recursive: true });
	writeFileSync(
		resolve(root, ".codewiki", "config.json"),
		JSON.stringify({ project_name: "Resolution Smoke", version: 1 }, null, 2),
	);

	const nested = resolve(root, "src", "nested");
	const maybe = await maybeLoadProject(nested);
	assert.equal(maybe?.root, root, "maybeLoadProject should climb from nested repo paths");

	process.env.PI_CODEWIKI_STATUS_PREFS_PATH = resolve(root, ".pi", "prefs.json");
	const resolved = await resolveToolProject("/", nested, "codewiki_state");
	assert.equal(resolved.root, root, "resolveToolProject should accept repoPath inside a repo");
} finally {
	rmSync(root, { recursive: true, force: true });
}
