export function normalizeRepoPath(path: string): string {
	return path.replaceAll("\\", "/");
}
