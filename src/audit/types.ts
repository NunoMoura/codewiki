export const AUDIT_PROFILE_VALUES = [
	"alignment",
	"horizontal-alignment",
	"source-contract",
	"file-structure",
	"stale-reference",
	"package",
	"security",
	"generated-parity",
	"lexicon",
	"changed",
	"task",
] as const;
export const AUDIT_SEVERITY_VALUES = ["info", "warning", "error"] as const;
export const AUDIT_STATUS_VALUES = ["pass", "warning", "fail"] as const;

export type AuditProfile = (typeof AUDIT_PROFILE_VALUES)[number];
export type AuditSeverity = (typeof AUDIT_SEVERITY_VALUES)[number];
export type AuditStatus = (typeof AUDIT_STATUS_VALUES)[number];

export interface AuditIssue {
	profile: AuditProfile;
	severity: AuditSeverity;
	kind: string;
	message: string;
	path?: string;
	rationale?: string;
	refs?: string[];
}

export const RESIDUAL_ISSUE_COVERAGE_CLASSIFICATIONS = [
	"fixed",
	"covered_by_task",
	"covered_by_sprint",
	"deferred_by_decision",
	"archive_candidate",
	"accepted_compatibility",
	"false_positive",
] as const;

export type ResidualIssueCoverageClassification =
	(typeof RESIDUAL_ISSUE_COVERAGE_CLASSIFICATIONS)[number];

export interface ResidualIssueCoverageInput {
	issue_key?: string;
	issue_kind?: string;
	path?: string;
	paths?: string[];
	classification: ResidualIssueCoverageClassification | string;
	task_id?: string;
	task_ids?: string[];
	sprint_id?: string;
	sprint_ids?: string[];
	decision_build_ref?: string;
	refs?: string[];
	trigger?: string;
	expires_at?: string;
	owner?: string;
	evidence: string;
}

export interface AuditFingerprint {
	path: string;
	digest: string;
	bytes: number;
}

export interface AuditScope {
	root?: string;
	files?: string[];
	layers?: string[];
	task_id?: string;
	changed?: boolean;
}

export interface AuditProfileResult {
	profile: AuditProfile;
	status: AuditStatus;
	summary: string;
	checked_scopes: AuditScope;
	issues: AuditIssue[];
	evidence_refs: string[];
	fingerprints: AuditFingerprint[];
	details?: Record<string, unknown>;
}

export interface AuditReport {
	kind: "audit_report";
	version: number;
	generated_at: string;
	project: string;
	status: AuditStatus;
	profiles: AuditProfile[];
	checked_scopes: AuditScope;
	issues: AuditIssue[];
	evidence_refs: string[];
	fingerprints: AuditFingerprint[];
	profile_results: AuditProfileResult[];
}
