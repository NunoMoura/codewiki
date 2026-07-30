import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function createTwoCloneFixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-git-state-"));
	const remote = join(root, "remote.git");
	const cloneA = join(root, "clone-a");
	const cloneB = join(root, "clone-b");
	await git(root, ["init", "--bare", "--quiet", remote]);
	for (const clone of [cloneA, cloneB]) {
		await mkdir(clone);
		await git(clone, ["init", "--quiet"]);
		await git(clone, ["remote", "add", "origin", remote]);
	}
	return {
		root,
		remote,
		cloneA,
		cloneB,
		cleanup: () => rm(root, {recursive: true, force: true}),
	};
}

export async function git(repoRoot, args, options = {}) {
	const result = await execFileAsync("git", args, {
		cwd: repoRoot,
		encoding: "utf8",
		maxBuffer: 4 * 1024 * 1024,
		...options,
	});
	return {stdout: result.stdout, stderr: result.stderr};
}
