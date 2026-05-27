import type { RoadmapStatus } from "./types.ts";

export const OPEN_ROADMAP_STATUSES = ["todo", "in_progress", "blocked"] as const;
const OPEN_ROADMAP_STATUS_SET = new Set<string>(OPEN_ROADMAP_STATUSES);

export function isOpenRoadmapStatus(status: RoadmapStatus | string | undefined): boolean {
	return OPEN_ROADMAP_STATUS_SET.has(String(status || "").trim());
}
