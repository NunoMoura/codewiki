import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	collectProjectSnapshot,
	createWorkingTreeContentProof,
	createWorkingTreeDigest,
	workingTreeDigestFiles,
} from "../../src/api/index.ts";

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-proof-"));
	await mkdir(join(root, "src", "feature"), { recursive: true });
	await mkdir(join(root, "tests"), { recursive: true });
	await mkdir(join(root, "node_modules", "ignored"), { recursive: true });
	await writeFile(
		join(root, "src", "feature", "a.ts"),
		"export const a = 1;\n",
	);
	await writeFile(
		join(root, "src", "feature", "b.ts"),
		"export const b = 2;\n",
	);
	await writeFile(join(root, "tests", "a.test.mjs"), "assert.ok(true);\n");
	await writeFile(join(root, "package.json"), '{"name":"fixture"}\n');
	await writeFile(join(root, "node_modules", "ignored", "x.js"), "ignored\n");
	return root;
}

describe("repo snapshot and content proof helpers", () => {
	it("collects normalized repo path snapshots with excludes", async () => {
		const root = await fixture();
		try {
			const snapshot = await collectProjectSnapshot({
				root,
				roots: ["src", "tests", "package.json", "missing.md", "node_modules"],
				includeDirectories: true,
			});

			assert.deepEqual(snapshot.files, [
				"package.json",
				"src/feature/a.ts",
				"src/feature/b.ts",
				"tests/a.test.mjs",
			]);
			assert.equal(snapshot.directories.includes("src"), true);
			assert.equal(snapshot.directories.includes("src/feature"), true);
			assert.equal(snapshot.paths.includes("node_modules/ignored/x.js"), false);
			assert.deepEqual(snapshot.missingRoots, ["missing.md"]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("creates deterministic working-tree content proofs", async () => {
		const root = await fixture();
		try {
			const files = await workingTreeDigestFiles({
				root,
				paths: ["src/feature", "tests/a.test.mjs", "src/feature/a.ts"],
			});
			const first = await createWorkingTreeDigest({ root, paths: files });
			const second = await createWorkingTreeDigest({
				root,
				paths: [...files].reverse(),
			});
			const proof = await createWorkingTreeContentProof({
				root,
				paths: ["src/feature/a.ts"],
			});

			assert.deepEqual(files, [
				"src/feature/a.ts",
				"src/feature/b.ts",
				"tests/a.test.mjs",
			]);
			assert.match(first, /^sha256:[a-f0-9]{64}$/);
			assert.equal(first, second);
			assert.match(proof.workingTreeDigest, /^sha256:[a-f0-9]{64}$/);

			await writeFile(
				join(root, "src", "feature", "a.ts"),
				"export const a = 3;\n",
			);
			const changed = await createWorkingTreeDigest({ root, paths: files });
			assert.notEqual(changed, first);
			await assert.rejects(
				() => createWorkingTreeDigest({ root, paths: ["missing.ts"] }),
				/Missing working-tree digest path: missing.ts/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
