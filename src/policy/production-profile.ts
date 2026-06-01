import { unique } from "../shared/utils.ts";
import { normalizeValidationGate } from "./gates.ts";

export type ProductionPolicyStatus = "satisfied" | "missing";

export type ProductionPolicyRequirementCategory =
	| "check"
	| "audit"
	| "threshold"
	| "evidence"
	| "proof";

export interface ProductionPolicyWaiver {
	id?: string;
	requirement?: string;
	applies_to?: string[];
	owner?: string;
	reason?: string;
	rationale?: string;
	expires_at?: string;
}

export interface ProductionPolicyInput {
	profile: string;
	policyProfile?: string;
	changeClass?: string;
	riskTier?: string;
	build?: Record<string, unknown> | null;
	checks?: string[];
	auditRefs?: string[];
	auditReports?: string[];
	isolation?: Record<string, unknown>;
	waivers?: ProductionPolicyWaiver[];
}

export interface ProductionPolicyRequirement {
	id: string;
	category: ProductionPolicyRequirementCategory;
	label: string;
	waivable: boolean;
}

export interface ProductionPolicyIssue {
	severity: "high" | "medium" | "low";
	requirement_id: string;
	summary: string;
	waiver?: ProductionPolicyWaiver;
}

export interface ProductionPolicyResult {
	version: 1;
	status: ProductionPolicyStatus;
	profile: string;
	policy_profile?: string;
	change_class: string;
	risk_tier: string;
	package_readiness_required: boolean;
	required_checks: string[];
	required_audits: string[];
	thresholds: { review_blockers: number; review_warnings: number };
	missing: string[];
	waived: Array<{ requirement_id: string; waiver: ProductionPolicyWaiver }>;
	issues: ProductionPolicyIssue[];
	evidence: {
		checks: string[];
		audits: string[];
		content_proof: string[];
		review_findings?: { blockers: number; warnings: number };
	};
}

type ReviewThreshold = { blockers: number; warnings: number };

const REVIEW_THRESHOLDS: Record<string, ReviewThreshold> = {
	low: { blockers: 0, warnings: 20 },
	medium: { blockers: 0, warnings: 10 },
	high: { blockers: 0, warnings: 5 },
	release: { blockers: 0, warnings: 0 },
};

const BASE_REQUIREMENTS: ProductionPolicyRequirement[] = [
	{
		id: "evidence:implementation-build",
		category: "evidence",
		label: "Accepted implementation build evidence",
		waivable: true,
	},
	{
		id: "evidence:acceptance-mapping",
		category: "evidence",
		label: "Acceptance criteria mapped to policy evidence",
		waivable: true,
	},
	{
		id: "check:typecheck",
		category: "check",
		label: "Typecheck command evidence",
		waivable: true,
	},
	{
		id: "check:tests",
		category: "check",
		label: "Task or smoke test evidence",
		waivable: true,
	},
	{
		id: "check:review-tool",
		category: "check",
		label: "Review-tool finding evidence",
		waivable: true,
	},
	{
		id: "threshold:review-findings",
		category: "threshold",
		label: "Review findings within production threshold",
		waivable: true,
	},
	{
		id: "audit:alignment",
		category: "audit",
		label: "Alignment audit evidence",
		waivable: true,
	},
	{
		id: "audit:changed",
		category: "audit",
		label: "Changed-files audit evidence",
		waivable: true,
	},
	{
		id: "proof:fresh-validation",
		category: "proof",
		label: "Fresh validation context evidence",
		waivable: true,
	},
	{
		id: "proof:content",
		category: "proof",
		label: "Checked content proof",
		waivable: true,
	},
];

const TASK_CLOSE_REQUIREMENTS: ProductionPolicyRequirement[] = [
	{
		id: "audit:generated-parity",
		category: "audit",
		label: "Generated parity audit evidence",
		waivable: true,
	},
	{
		id: "audit:task",
		category: "audit",
		label: "Task audit evidence",
		waivable: true,
	},
	{
		id: "proof:clean-worktree",
		category: "proof",
		label: "Clean worktree evidence",
		waivable: true,
	},
	{
		id: "proof:immutable-content",
		category: "proof",
		label: "Immutable commit/tree/archive proof",
		waivable: true,
	},
	{
		id: "evidence:implementation-validation",
		category: "evidence",
		label: "Implementation validation pass evidence",
		waivable: true,
	},
];

const PACKAGE_REQUIREMENTS: ProductionPolicyRequirement[] = [
	{
		id: "audit:package",
		category: "audit",
		label: "Package audit evidence",
		waivable: true,
	},
	{
		id: "check:package-pack",
		category: "check",
		label: "Package pack/dry-run evidence",
		waivable: true,
	},
];

const SYSTEM_RISK_REQUIREMENTS: ProductionPolicyRequirement[] = [
	{
		id: "audit:file-structure",
		category: "audit",
		label: "File-structure drift audit evidence",
		waivable: true,
	},
	{
		id: "audit:stale-reference",
		category: "audit",
		label: "Stale-reference audit evidence",
		waivable: true,
	},
];

const SECURITY_REQUIREMENTS: ProductionPolicyRequirement[] = [
	{
		id: "audit:security",
		category: "audit",
		label: "Security audit evidence",
		waivable: true,
	},
];

export function productionPolicyProfileEnabled(
	policyProfile?: string,
	build?: Record<string, unknown> | null,
): boolean {
	const values = [policyProfile, build?.policy_profile]
		.map((value) => String(value || "").toLowerCase())
		.join(" ");
	return /\b(production|policy|production-ready)\b/.test(values);
}

export function evaluateProductionPolicyProfile(
	input: ProductionPolicyInput,
): ProductionPolicyResult {
	const profile = normalizeValidationGate(input.profile || "implementation");
	const changeClass = normalizedWord(
		input.changeClass || changeClassFromBuild(input.build) || "code",
	);
	const riskTier = normalizedRiskTier(
		input.riskTier || riskTierFromBuild(input.build),
	);
	const packageReadinessRequired = requiresPackageReadiness(
		profile,
		input.policyProfile,
		input.build,
		changeClass,
	);
	const requirements = productionPolicyRequirements({
		profile,
		changeClass,
		riskTier,
		packageReadinessRequired,
	});
	const evidence = collectProductionPolicyEvidence(input);
	const thresholds = reviewThresholdForRisk(riskTier);
	const waivers = collectProductionPolicyWaivers(input);
	const missing: string[] = [];
	const waived: ProductionPolicyResult["waived"] = [];
	const issues: ProductionPolicyIssue[] = [];

	requirements.forEach((requirement) => {
		if (requirementSatisfied(requirement.id, input, evidence, thresholds))
			return;
		const waiver = findRequirementWaiver(requirement.id, waivers);
		if (waiver?.valid) {
			waived.push({ requirement_id: requirement.id, waiver: waiver.waiver });
			return;
		}
		missing.push(missingRequirementId(requirement.id, waiver));
		issues.push(missingRequirementIssue(requirement, waiver));
	});

	const result: ProductionPolicyResult = {
		version: 1,
		status: productionPolicyStatus(missing),
		profile,
		change_class: changeClass,
		risk_tier: riskTier,
		package_readiness_required: packageReadinessRequired,
		required_checks: requirementIdsByCategory(requirements, "check"),
		required_audits: requirementIdsByCategory(requirements, "audit").map((id) =>
			id.replace(/^audit:/, ""),
		),
		thresholds: {
			review_blockers: thresholds.blockers,
			review_warnings: thresholds.warnings,
		},
		missing: unique(missing),
		waived,
		issues,
		evidence,
	};
	if (input.policyProfile) result.policy_profile = input.policyProfile;
	return result;
}

function missingRequirementId(
	requirementId: string,
	waiver: { waiver: ProductionPolicyWaiver; valid: boolean } | null,
): string {
	if (waiver) return `${requirementId}:waiver_invalid`;
	return requirementId;
}

function missingRequirementIssue(
	requirement: ProductionPolicyRequirement,
	waiver: { waiver: ProductionPolicyWaiver; valid: boolean } | null,
): ProductionPolicyIssue {
	const issue: ProductionPolicyIssue = {
		severity: missingRequirementSeverity(requirement),
		requirement_id: requirement.id,
		summary: missingRequirementSummary(requirement, waiver),
	};
	if (waiver) issue.waiver = waiver.waiver;
	return issue;
}

function missingRequirementSeverity(
	requirement: ProductionPolicyRequirement,
): ProductionPolicyIssue["severity"] {
	if (requirement.category === "threshold") return "medium";
	return "high";
}

function missingRequirementSummary(
	requirement: ProductionPolicyRequirement,
	waiver: { waiver: ProductionPolicyWaiver; valid: boolean } | null,
): string {
	if (waiver) {
		return `${requirement.label} is missing and matching waiver lacks owner or rationale.`;
	}
	return `${requirement.label} is missing.`;
}

function productionPolicyStatus(missing: string[]): ProductionPolicyStatus {
	if (missing.length > 0) return "missing";
	return "satisfied";
}

function requirementIdsByCategory(
	requirements: ProductionPolicyRequirement[],
	category: ProductionPolicyRequirementCategory,
): string[] {
	return requirements.flatMap((requirement) => {
		if (requirement.category !== category) return [];
		return [requirement.id];
	});
}

function productionPolicyRequirements(input: {
	profile: string;
	changeClass: string;
	riskTier: string;
	packageReadinessRequired: boolean;
}): ProductionPolicyRequirement[] {
	const requirements = [...BASE_REQUIREMENTS];
	if (["task-close", "sprint-close", "ship-ready"].includes(input.profile))
		requirements.push(...TASK_CLOSE_REQUIREMENTS);
	if (input.packageReadinessRequired)
		requirements.push(...PACKAGE_REQUIREMENTS);
	if (requiresSystemDriftAudits(input.changeClass, input.riskTier)) {
		requirements.push(...SYSTEM_RISK_REQUIREMENTS);
	}
	if (requiresSecurityAudit(input.profile, input.changeClass, input.riskTier)) {
		requirements.push(...SECURITY_REQUIREMENTS);
	}
	return uniqueRequirements(requirements);
}

function uniqueRequirements(
	requirements: ProductionPolicyRequirement[],
): ProductionPolicyRequirement[] {
	const seen = new Set<string>();
	return requirements.filter((requirement) => {
		if (seen.has(requirement.id)) return false;
		seen.add(requirement.id);
		return true;
	});
}

function requirementSatisfied(
	id: string,
	input: ProductionPolicyInput,
	evidence: ProductionPolicyResult["evidence"],
	threshold: ReviewThreshold,
): boolean {
	if (id.startsWith("audit:"))
		return hasAuditEvidence(evidence.audits, id.slice(6));
	switch (id) {
		case "evidence:implementation-build":
			return String(input.build?.kind || "") === "implementation_build";
		case "evidence:acceptance-mapping":
			return (
				Array.isArray(input.build?.acceptance_mapping) &&
				input.build.acceptance_mapping.length > 0
			);
		case "evidence:implementation-validation":
			return hasEvidence(
				evidence.checks,
				/implementation validation (pass|passed)|implementation-pass/i,
			);
		case "check:typecheck":
			return hasEvidence(
				evidence.checks,
				/\b(npm run typecheck|tsc --noEmit|typecheck: pass)\b/i,
			);
		case "check:tests":
			return hasEvidence(
				evidence.checks,
				/\b(npm run test|npm test|test:smoke|node tests\/|vitest|jest|tests?: pass)\b/i,
			);
		case "check:review-tool":
			return (
				Boolean(evidence.review_findings) ||
				hasEvidence(
					evidence.checks,
					/\b(pi-lens|review-tool|review findings|dispatch review)\b/i,
				)
			);
		case "threshold:review-findings":
			return reviewWithinThreshold(evidence.review_findings, threshold);
		case "check:package-pack":
			return hasEvidence(
				evidence.checks,
				/\b(npm run test:pack|npm pack --dry-run|package pack|pack check)\b/i,
			);
		case "proof:fresh-validation":
			return input.isolation?.fresh_context === true;
		case "proof:content":
			return evidence.content_proof.length > 0;
		case "proof:clean-worktree":
			return input.isolation?.clean === true;
		case "proof:immutable-content":
			return hasImmutableContentProof(input.isolation);
		default:
			return false;
	}
}

function collectProductionPolicyEvidence(
	input: ProductionPolicyInput,
): ProductionPolicyResult["evidence"] {
	const checks = unique([
		...stringList(input.checks),
		...stringList(input.build?.checks_run),
		...stringList(
			(input.build?.closure_brief as Record<string, unknown> | undefined)
				?.checks,
		),
		...stringList(input.build?.test_design_evidence),
		...stringList(input.build?.code_change_evidence),
	]);
	const audits = unique([
		...stringList(input.auditRefs),
		...stringList(input.auditReports),
		...stringList(input.build?.audit_refs),
		...stringList(input.build?.audit_reports),
	]);
	const evidence: ProductionPolicyResult["evidence"] = {
		checks,
		audits,
		content_proof: contentProofRefs(input.isolation),
	};
	const findings = parseReviewFindings(checks) ?? parseReviewFindings(audits);
	if (findings) evidence.review_findings = findings;
	return evidence;
}

function collectProductionPolicyWaivers(
	input: ProductionPolicyInput,
): ProductionPolicyWaiver[] {
	return [
		...objectList(input.waivers),
		...objectList(input.build?.policy_waivers),
		...objectList(input.build?.waivers),
		...objectList(
			(input.build?.policy as Record<string, unknown> | undefined)?.waivers,
		),
	] as ProductionPolicyWaiver[];
}

function findRequirementWaiver(
	requirementId: string,
	waivers: ProductionPolicyWaiver[],
): { waiver: ProductionPolicyWaiver; valid: boolean } | null {
	const normalizedRequirement = normalizeRequirementId(requirementId);
	const waiver = waivers.find((candidate) =>
		waiverAppliesTo(candidate, normalizedRequirement),
	);
	if (!waiver) return null;
	return {
		waiver,
		valid: Boolean(
			String(waiver.owner || "").trim() &&
				String(waiver.rationale || waiver.reason || "").trim(),
		),
	};
}

function waiverAppliesTo(
	waiver: ProductionPolicyWaiver,
	normalizedRequirement: string,
): boolean {
	const values = [
		waiver.id,
		waiver.requirement,
		...stringList(waiver.applies_to),
	];
	return values.some(
		(value) => normalizeRequirementId(value) === normalizedRequirement,
	);
}

function parseReviewFindings(
	values: string[],
): { blockers: number; warnings: number } | undefined {
	const text = values.join("\n").toLowerCase();
	const blockerMatch = /([0-9]+)\s*(?:blocker|blockers|errors?)/i.exec(text);
	const warningMatch = /([0-9]+)\s*(?:warning|warnings)/i.exec(text);
	if (!blockerMatch && !warningMatch) return undefined;
	return {
		blockers: matchNumber(blockerMatch),
		warnings: matchNumber(warningMatch),
	};
}

function matchNumber(match: RegExpExecArray | null): number {
	if (!match) return 0;
	return Number(match[1]);
}

function reviewWithinThreshold(
	findings: { blockers: number; warnings: number } | undefined,
	threshold: ReviewThreshold,
): boolean {
	if (!findings) return false;
	return (
		findings.blockers <= threshold.blockers &&
		findings.warnings <= threshold.warnings
	);
}

function reviewThresholdForRisk(riskTier: string): ReviewThreshold {
	return REVIEW_THRESHOLDS[riskTier] ?? REVIEW_THRESHOLDS.medium;
}

function hasAuditEvidence(audits: string[], profile: string): boolean {
	const expected = normalizeRequirementId(profile);
	return audits.some((audit) => {
		const normalized = normalizeRequirementId(audit);
		return (
			normalized === expected ||
			normalized.includes(`audit:${expected}`) ||
			normalized.includes(`profile:${expected}`) ||
			normalized.includes(expected)
		);
	});
}

function hasEvidence(values: string[], pattern: RegExp): boolean {
	return values.some((value) => pattern.test(value));
}

function contentProofRefs(
	isolation: Record<string, unknown> | undefined,
): string[] {
	if (!isolation) return [];
	return unique(
		[
			isolation.validated_sha,
			isolation.head_sha,
			isolation.published_sha,
			isolation.tree_sha,
			isolation.working_tree_digest,
			isolation.worktree_digest,
			isolation.package_digest,
			isolation.archive_ref,
			isolation.remote_ref,
		]
			.map((value) => String(value || "").trim())
			.filter(Boolean),
	);
}

function hasImmutableContentProof(
	isolation: Record<string, unknown> | undefined,
): boolean {
	return Boolean(
		isolation?.validated_sha ||
			isolation?.head_sha ||
			isolation?.published_sha ||
			isolation?.tree_sha ||
			isolation?.package_digest ||
			isolation?.archive_ref ||
			isolation?.remote_ref,
	);
}

function requiresPackageReadiness(
	profile: string,
	policyProfile: string | undefined,
	build: Record<string, unknown> | null | undefined,
	changeClass: string,
): boolean {
	const text = [profile, policyProfile, changeClass, ...buildPathRefs(build)]
		.map((value) => String(value || "").toLowerCase())
		.join(" ");
	return /\b(package|ship-ready|publication|publish|release|pack|package\.json|package-lock\.json|npm)\b/.test(
		text,
	);
}

function requiresSystemDriftAudits(
	changeClass: string,
	riskTier: string,
): boolean {
	return (
		changeClass === "system" || riskTier === "high" || riskTier === "release"
	);
}

function requiresSecurityAudit(
	profile: string,
	changeClass: string,
	riskTier: string,
): boolean {
	return (
		profile === "ship-ready" ||
		changeClass === "security" ||
		riskTier === "release"
	);
}

function buildPathRefs(
	build: Record<string, unknown> | null | undefined,
): string[] {
	if (!build) return [];
	return unique([
		...stringList(build.code_files),
		...stringList(build.test_files),
		...stringList(
			(build.produces as Record<string, unknown> | undefined)?.code,
		),
		...stringList(
			(build.produces as Record<string, unknown> | undefined)?.tests,
		),
		...stringList(
			(build.produces as Record<string, unknown> | undefined)?.publication,
		),
	]);
}

function changeClassFromBuild(
	build: Record<string, unknown> | null | undefined,
): string {
	return String(
		build?.change_class ||
			build?.change_type ||
			(build?.traceability as Record<string, unknown> | undefined)
				?.change_class ||
			(build?.traceability as Record<string, unknown> | undefined)
				?.change_type ||
			"",
	);
}

function riskTierFromBuild(
	build: Record<string, unknown> | null | undefined,
): string {
	return String(
		build?.risk_tier ||
			(build?.policy as Record<string, unknown> | undefined)?.risk_tier ||
			"",
	);
}

function normalizedRiskTier(value: unknown): string {
	const normalized = normalizedWord(value || "medium");
	if (["low", "medium", "high", "release"].includes(normalized))
		return normalized;
	if (["publication", "publish", "security", "migration"].includes(normalized))
		return "release";
	return "medium";
}

function normalizedWord(value: unknown): string {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/_/g, "-");
}

function normalizeRequirementId(value: unknown): string {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/_/g, "-");
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function objectList(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(item): item is Record<string, unknown> =>
			Boolean(item) && typeof item === "object" && !Array.isArray(item),
	);
}
