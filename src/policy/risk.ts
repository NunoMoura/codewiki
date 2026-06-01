import {
	isSemanticTraceability,
	normalizeChangeType,
	normalizeTraceabilityExemption,
} from "../change/traceability.ts";
import { unique } from "../shared/utils.ts";
import { normalizeValidationGate } from "./gates.ts";

export const HIGH_RISK_VALIDATION_TIERS = new Set([
	"semantic-system",
	"security-migration-publication",
	"destructive",
]);

export interface ValidationRiskPolicyInput {
	profile: string;
	policy_profile?: string;
	source?: string;
	checks?: string[];
	audit_refs?: string[];
	audit_reports?: string[];
}

export interface ValidationRiskPolicyResult {
	tier: string;
	reason: string;
	approval_required: boolean;
}

function trimList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeRepoPath(value: string): string {
	return value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function validationPathRefs(
	build: Record<string, any> | null | undefined,
): string[] {
	return unique([
		...trimList(build?.knowledge_changes),
		...trimList(build?.roadmap_changes),
		...trimList(build?.code_files),
		...trimList(build?.test_files),
		...trimList(build?.produces?.knowledge),
		...trimList(build?.produces?.roadmap),
		...trimList(build?.produces?.code),
		...trimList(build?.produces?.tests),
		...trimList(build?.produces?.publication),
	]);
}

function isDocsOrMechanicalRef(ref: string): boolean {
	const normalized = normalizeRepoPath(ref);
	return (
		normalized.startsWith(".codewiki/kb/") ||
		normalized.endsWith(".md") ||
		normalized.endsWith(".mdx") ||
		normalized.endsWith(".rst") ||
		normalized.endsWith(".adoc") ||
		normalized.endsWith(".txt")
	);
}

export function classifyValidationRisk(
	input: ValidationRiskPolicyInput,
	build: Record<string, any> | null | undefined,
): ValidationRiskPolicyResult {
	const profile = normalizeValidationGate(input.profile);
	const policyProfile = String(input.policy_profile || "")
		.trim()
		.toLowerCase();
	const exemption = normalizeTraceabilityExemption(
		build?.traceability?.exemption ??
			build?.traceability?.change_class ??
			build?.change_class,
	);
	const changeType = normalizeChangeType(
		build?.traceability?.change_type ??
			build?.change_type ??
			build?.traceability?.change_class ??
			build?.change_class,
		"code",
	);
	const semantic = isSemanticTraceability(
		build?.traceability?.semantic,
		exemption,
	);
	const pathRefs = validationPathRefs(build);
	const docsOnly = pathRefs.length > 0 && pathRefs.every(isDocsOrMechanicalRef);
	const haystack = [
		profile,
		policyProfile,
		input.source,
		...(input.checks ?? []),
		...(input.audit_refs ?? []),
		...(input.audit_reports ?? []),
		build?.summary,
		build?.change_type,
		build?.change_class,
		build?.traceability?.change_type,
		build?.traceability?.exemption,
		...pathRefs,
	]
		.map((value) => String(value || "").toLowerCase())
		.join(" ");
	let tier = "code-local";
	let reason =
		"Code-local change; gateway audits and content proof still required.";
	if (
		/\b(destructive|irreversible|drop\s+table|delete\s+all|rm\s+-rf|force[- ]push|wipe|destroy)\b/.test(
			haystack,
		)
	) {
		tier = "destructive";
		reason =
			"Destructive or irreversible wording requires explicit user approval before promotion.";
	} else if (
		profile === "ship-ready" ||
		/\b(security|migration|publication|publish|release|secret|credential|remote|breaking[- ]api)\b/.test(
			haystack,
		)
	) {
		tier = "security-migration-publication";
		reason =
			"Security, migration, publication, or release work requires explicit user approval before promotion.";
	} else if (
		exemption ||
		docsOnly ||
		/\b(mechanical|generated|runtime|docs[- ]cleanup|documentation[- ]cleanup)\b/.test(
			haystack,
		)
	) {
		tier = "mechanical-docs";
		reason =
			"Mechanical, generated, runtime, or docs-only cleanup can use the low-risk fast path when gateway evidence is complete.";
	} else if (
		semantic &&
		["product", "system", "task"].includes(String(changeType))
	) {
		tier = "semantic-system";
		reason =
			"Semantic product/system/task change must trace to accepted user semantics before lower-layer promotion.";
	}
	return {
		tier,
		reason,
		approval_required: HIGH_RISK_VALIDATION_TIERS.has(tier),
	};
}

export function validationApprovalEvidence(
	input: ValidationRiskPolicyInput,
	build: Record<string, any> | null | undefined,
	tier: string,
): string[] {
	const refs = trimList([
		...(input.audit_refs ?? []),
		...(input.audit_reports ?? []),
		...(input.checks ?? []),
	]);
	const explicit = refs.filter((ref) =>
		/\b(approval:user|user[-_ ]approval|explicit[-_ ]approval|approved[-_ ]by[-_ ]user|semantic[-_ ]approval)\b/i.test(
			ref,
		),
	);
	if (explicit.length > 0) return unique(explicit);
	if (tier === "semantic-system") {
		const acceptedRefs = trimList(build?.traceability?.accepted_build_refs);
		if (acceptedRefs.length > 0)
			return acceptedRefs.map((ref) => `accepted_semantics:${ref}`);
		const rows = trimList(build?.approved_diff_rows);
		if (rows.length > 0) return rows.map((row) => `approved_diff_row:${row}`);
	}
	return [];
}
