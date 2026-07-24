import { lstatSync, realpathSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

export interface ContainerGitMount {
	commonDirectory: string;
	containerGitDirectory: string;
}

export async function resolveContainerGitMount(
	worktreePath: string,
	repoRoot: string,
): Promise<ContainerGitMount> {
	const gitFile = join(worktreePath, ".git");
	const adminDirectory = await resolveGitDirectoryFile(gitFile);
	const commonDirectory = await resolveCommonGitDirectory(adminDirectory);
	const expectedCommonDirectory = await resolveRepositoryCommonGitDirectory(
		repoRoot,
	);
	if (commonDirectory !== expectedCommonDirectory) {
		throw new Error(
			"Implementation container worktree Git metadata does not belong to repository.",
		);
	}
	const adminChild = relative(commonDirectory, adminDirectory).replaceAll(
		"\\",
		"/",
	);
	if (
		!adminChild ||
		adminChild.startsWith("..") ||
		/[,\u0000-\u001f]/u.test(commonDirectory) ||
		/[,\u0000-\u001f]/u.test(adminChild)
	) {
		throw new Error("Implementation container Git metadata escaped common dir.");
	}
	return {
		commonDirectory,
		containerGitDirectory: `/codewiki-git/${adminChild}`,
	};
}

async function resolveRepositoryCommonGitDirectory(
	repoRoot: string,
): Promise<string> {
	const gitPath = join(realpathSync(repoRoot), ".git");
	if (lstatSync(gitPath).isSymbolicLink()) {
		throw new Error("Implementation container repository Git path is symbolic.");
	}
	if (lstatSync(gitPath).isDirectory()) return realpathSync(gitPath);
	const adminDirectory = await resolveGitDirectoryFile(gitPath);
	return resolveCommonGitDirectory(adminDirectory);
}

async function resolveGitDirectoryFile(gitFile: string): Promise<string> {
	if (lstatSync(gitFile).isSymbolicLink()) {
		throw new Error("Implementation container Git file cannot be a symbolic link.");
	}
	const metadata = await stat(gitFile);
	if (!metadata.isFile() || metadata.size > 4096) {
		throw new Error("Implementation container requires linked-worktree Git metadata.");
	}
	const gitFileSource = await readFile(gitFile, "utf8");
	const match = /^gitdir:\s*(.+)\s*$/u.exec(gitFileSource.trim());
	if (!match) {
		throw new Error("Implementation container linked-worktree Git file is invalid.");
	}
	return realpathSync(resolve(dirname(gitFile), match[1]));
}

async function resolveCommonGitDirectory(
	adminDirectory: string,
): Promise<string> {
	const commonFile = join(adminDirectory, "commondir");
	if (lstatSync(commonFile).isSymbolicLink()) {
		throw new Error(
			"Implementation container Git common-dir file cannot be a symbolic link.",
		);
	}
	const metadata = await stat(commonFile);
	if (!metadata.isFile() || metadata.size > 4096) {
		throw new Error("Implementation container Git common-dir metadata is invalid.");
	}
	const commonFileSource = await readFile(commonFile, "utf8");
	return realpathSync(resolve(adminDirectory, commonFileSource.trim()));
}
