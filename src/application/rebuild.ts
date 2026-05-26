/**
 * application/rebuild.ts
 *
 * "Run a rebuild" use case.
 * Orchestrates the rebuild pipeline via the RebuildRunner port.
 * No knowledge of the concrete rebuild engine implementation.
 */

import type { WikiProject } from "../project/types.ts";
import type { RebuildRunner } from "./ports.ts";
import { withLockedPaths } from "../mutation-queue.ts";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Path helpers (pure — no I/O)
// ---------------------------------------------------------------------------

const GENERATED_METADATA_FILES = ["index_graph.json"];

const GENERATED_VIEW_FILES: string[] = [];

/**
 * Returns all paths that participate in a rebuild lock.
 * Callers acquire this lock before mutating canonical files to prevent races.
 */
export function rebuildTargetPaths(project: WikiProject): string[] {
	return [
		...(project.indexPath ? [resolve(project.root, project.indexPath)] : []),
		...(project.roadmapDocPath
			? [resolve(project.root, project.roadmapDocPath)]
			: []),
		...GENERATED_METADATA_FILES.map((f) =>
			resolve(project.root, project.metaRoot, f),
		),
		...GENERATED_VIEW_FILES.map((f) =>
			resolve(project.root, project.viewsRoot, f),
		),
	];
}

/**
 * Run a rebuild while holding the file lock.
 * Uses the RebuildRunner port — concrete execution lives behind application-local or adapter code.
 */
export async function runRebuild(
	project: WikiProject,
	runner: RebuildRunner,
): Promise<void> {
	return withLockedPaths(rebuildTargetPaths(project), () =>
		runner.run(project),
	);
}

/**
 * Run a rebuild without acquiring the rebuild lock.
 * Caller must already hold the relevant lock.
 */
export async function runRebuildUnlocked(
	project: WikiProject,
	runner: RebuildRunner,
): Promise<void> {
	await runner.run(project);
}
