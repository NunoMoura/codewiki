import type { AgencyBudget, AgencyScope, AgencyScopeKind } from "../agency/types.ts";

export interface ScopeConfig {
	include: string[];
	exclude?: string[];
}

export interface CodeDriftScopeConfig {
	include: string[];
	exclude?: string[];
	docs?: string[];
	repo_docs?: string[];
	code?: string[];
}

export interface DocsConfig {
	project_name?: string;
	schema_version?: number;
	wiki_root?: string;
	docs_root?: string;
	specs_root?: string;
	evidence_root?: string;
	research_root?: string;
	index_path?: string;
	roadmap_path?: string;
	roadmap_doc_path?: string;
	roadmap_events_path?: string;
	meta_root?: string;
	views_root?: string;
	generated_files?: string[];
	roadmap_retention?: {
		compress_archive?: boolean;
		archive_path?: string;
		closed_task_limit?: number;
	};
	lint?: {
		repo_markdown?: string[];
		forbidden_headings?: string[];
		word_count_warn?: number;
		word_count_exempt?: string[];
		diagram_refs_mode?: "off" | "warn" | "warning" | "migration" | "error" | "enforce" | "required" | "hard";
	};
	codewiki?: {
		system_diagrams?: {
			diagram_refs?: {
				mode?: "off" | "warn" | "warning" | "migration" | "error" | "enforce" | "required" | "hard";
			};
		};
		diagram_refs?: {
			mode?: "off" | "warn" | "warning" | "migration" | "error" | "enforce" | "required" | "hard";
		};
		self_drift_scope?: ScopeConfig;
		code_drift_scope?: CodeDriftScopeConfig;
		rebuild?: {
			quiet?: boolean;
			freshness_check?: boolean;
			debounce_ms?: number;
		};
		agency?: {
			default_scope?: AgencyScope;
			budgets?: Partial<Record<AgencyScopeKind | "default", AgencyBudget>>;
			parallelism?: {
				max_sessions?: number;
				session_per_sprint?: boolean;
				require_claims?: boolean;
			};
		};
		gc?: {
			hot_days?: number;
			warm_days?: number;
			cold_days?: number;
			purge_days?: number;
			sprint_close_hook?: boolean;
		};
		gateway?: {
			generated_readonly_paths?: string[];
			write_paths?: string[];
		};
	};
}

export interface WikiProject {
	root: string;
	label: string;
	config: DocsConfig;
	docsRoot: string;
	specsRoot: string;
	evidenceRoot: string;
	researchRoot: string;
	indexPath: string;
	roadmapPath: string;
	roadmapDocPath: string;
	roadmapEventsPath: string;
	metaRoot: string;
	viewsRoot: string;
	generatedFiles?: string[];
	graphPath: string;
	lintPath: string;
	roadmapStatePath: string;
	statusStatePath: string;
	eventsPath: string;
	configPath: string;
}

export interface DriftContext {
	selfInclude: string[];
	selfExclude: string[];
	docsScope: string[];
	docsExclude: string[];
	repoDocs: string[];
	codeScope: string[];
}
