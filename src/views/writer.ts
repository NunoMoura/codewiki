import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type ViewName =
	| "status"
	| "resume"
	| "work-plan"
	| "work-queue"
	| "blockers"
	| "conflicts";

export const VIEW_FILE_PATHS: Record<ViewName, string> = {
	status: ".codewiki/views/status.json",
	resume: ".codewiki/views/resume.json",
	"work-plan": ".codewiki/views/work-plan.json",
	"work-queue": ".codewiki/views/work-queue.json",
	blockers: ".codewiki/views/blockers.json",
	conflicts: ".codewiki/views/conflicts.json",
};

export function viewFilePath(name: ViewName): string {
	return VIEW_FILE_PATHS[name];
}

export function formatViewJson(view: unknown): string {
	return `${JSON.stringify(view, null, 2)}\n`;
}

export async function writeViewJson(
	path: string,
	view: unknown,
): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, formatViewJson(view), "utf8");
}

export async function writeNamedView(
	repoRoot: string,
	name: ViewName,
	view: unknown,
): Promise<string> {
	const path = resolve(repoRoot, viewFilePath(name));
	await writeViewJson(path, view);
	return path;
}
