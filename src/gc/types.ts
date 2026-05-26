export const GC_ARTIFACT_TEMPERATURE_VALUES = ["hot", "warm", "cold", "purgeable"] as const;
export const GC_ACTION_VALUES = ["dry-run", "purge"] as const;
export const GC_INCLUDE_VALUES = ["tracked", "runtime"] as const;

export type GcArtifactTemperature = (typeof GC_ARTIFACT_TEMPERATURE_VALUES)[number];
export type CodewikiGcAction = (typeof GC_ACTION_VALUES)[number];
export type CodewikiGcInclude = (typeof GC_INCLUDE_VALUES)[number];

export interface CodewikiGcToolInput {
	repoPath?: string;
	action?: CodewikiGcAction;
	include?: CodewikiGcInclude[];
	scopes?: string[];
	archive_sha?: string;
	tree_sha?: string;
	archive_ref?: string;
	ledger_path?: string;
	max_deletes?: number;
	refresh?: boolean;
}
