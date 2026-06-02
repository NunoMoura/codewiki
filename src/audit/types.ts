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
