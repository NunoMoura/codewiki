import { unique } from "../shared/utils.ts";

export const DEFAULT_REQUIRED_AUDIT_PROFILES: Record<string, string[]> = {
	decision: ["alignment", "stale-reference"],
	planning: ["alignment"],
	implementation: ["alignment", "changed"],
	"task-close": ["alignment", "changed", "task", "generated-parity"],
	publication: ["alignment", "package", "security"],
	publish: ["alignment", "package", "security"],
	release: ["alignment", "package", "security", "stale-reference"],
	"drift-audit": ["alignment", "generated-parity"],
	"graph-audit": ["alignment", "generated-parity"],
};

export function normalizeAuditProfile(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/^(profile|audit|audit-profile):/, "")
		.replace(/^audit\//, "")
		.replace(/\.json$/, "")
		.trim();
}

export function requiredAuditProfiles(
	profile: string,
	explicit?: string[],
	policyProfile?: string,
): string[] {
	const profileKey = profile.trim().toLowerCase();
	const policyKey = String(policyProfile || "")
		.trim()
		.toLowerCase();
	return unique([
		...(DEFAULT_REQUIRED_AUDIT_PROFILES[profileKey] ?? []),
		...(policyKey && policyKey !== profileKey
			? (DEFAULT_REQUIRED_AUDIT_PROFILES[policyKey] ?? [])
			: []),
		...(explicit ?? []),
	])
		.map(normalizeAuditProfile)
		.filter(Boolean);
}

export function auditRequirement(
	profile: string,
	policyProfile?: string,
	explicit?: string[],
) {
	const profiles = requiredAuditProfiles(profile, explicit, policyProfile);
	return {
		required: profiles.length > 0,
		profiles,
		evidence: profiles.map(
			(auditProfile) => `audit:${auditProfile} or profile:${auditProfile}`,
		),
		reason:
			"Gateway profiles require deterministic audit evidence for their build or boundary context.",
	};
}

export function auditProfileNamesFromRefs(refs: string[]): string[] {
	return unique(
		refs
			.map(normalizeAuditProfile)
			.filter(
				(profile) =>
					DEFAULT_REQUIRED_AUDIT_PROFILES[profile] ||
					/^[a-z0-9-]+$/.test(profile),
			),
	);
}

export function auditEvidenceGaps(
	refs: string[],
	requirement: ReturnType<typeof auditRequirement>,
): string[] {
	if (!requirement.required) return [];
	const present = new Set(auditProfileNamesFromRefs(refs));
	return requirement.profiles.filter((profile) => !present.has(profile));
}
