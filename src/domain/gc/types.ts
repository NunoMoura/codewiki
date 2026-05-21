export const GC_ARTIFACT_TEMPERATURE_VALUES = ["hot", "warm", "cold", "purgeable"] as const;
export type GcArtifactTemperature = (typeof GC_ARTIFACT_TEMPERATURE_VALUES)[number];

export interface CodewikiGcToolInput {
	repoPath?: string;
	action?: "dry-run" | "purge";
	include?: Array<"tracked" | "runtime">;
	scopes?: string[];
	archive_sha?: string;
	tree_sha?: string;
	archive_ref?: string;
	ledger_path?: string;
	max_deletes?: number;
	refresh?: boolean;
}
