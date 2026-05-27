import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { CodewikiBuildProducesInput, CodewikiBuildRefsInput, CodewikiBuildToolInput } from "./types.ts";
import { isAcceptedBuildData } from "./lifecycle.ts";
import type { ChangeType } from "../change/types.ts";
import type { WikiProject } from "../project/types.ts";
import { normalizeChangeType, normalizeTraceabilityExemption, isSemanticTraceability } from "../change/traceability.ts";
import { unique } from "../shared/utils.ts";

export function buildSlug(value: string, defaultPrefix: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48) || defaultPrefix;
}

export function addDaysIso(baseIso: string, days: number): string {
	const date = new Date(baseIso);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString();
}

export function buildLifecycle(input: CodewikiBuildToolInput, created: string, defaultTtlDays: number) {
	const ttlDays = input.lifecycle?.ttl_days ?? defaultTtlDays;
	return {
		state: input.lifecycle?.state ?? "accepted",
		ttl_days: ttlDays,
		archive_after: input.lifecycle?.archive_after ?? addDaysIso(created, ttlDays),
		purge_after: input.lifecycle?.purge_after ?? addDaysIso(created, ttlDays * 2),
	};
}

export function buildBuildPath(project: WikiProject, kind: string, slug: string, day: string): string {
	const abs = resolve(project.root, `.codewiki/builds/${kind}/${day}-${slug}.json`);
	return abs;
}

export function trimList(values?: unknown[]): string[] {
	return (values ?? []).map((value) => String(value || "").trim()).filter(Boolean);
}

export function inferChangeTypeForBuild(kind: string, inputOrBuild: any): ChangeType {
	if (kind === "decision_build" || kind === "decision") {
		const paths = [
			...trimList(inputOrBuild.knowledge_changes),
			...trimList(inputOrBuild.produces?.knowledge),
			...trimList(inputOrBuild.row_to_kb_mappings?.flatMap((mapping: any) => mapping?.knowledge_refs ?? [])),
		];
		const direction = String(inputOrBuild.propagation?.direction || "").trim();
		if (direction === "product-first" || paths.some((path) => path.includes("/product/"))) return "product";
		return "system";
	}
	if (kind === "planning_build" || kind === "planning") return "task";
	if (kind === "implementation_build" || kind === "implementation") {
		const refs = [
			...trimList(inputOrBuild.code_files),
			...trimList(inputOrBuild.test_files),
			...trimList(inputOrBuild.produces?.code),
			...trimList(inputOrBuild.produces?.tests),
			...trimList(inputOrBuild.produces?.publication),
		];
		if (refs.some((ref) => ref.startsWith(".codewiki/roadmap/") || /^TASK-\d+/.test(ref))) return "task";
		if (refs.some((ref) => ref.startsWith(".codewiki/kb/product/"))) return "product";
		if (refs.some((ref) => ref.startsWith(".codewiki/kb/system/") || ref.startsWith("skills/codewiki/"))) return "system";
		return "code";
	}
	return "task";
}

export function normalizeBuildPath(ref: string): string {
	return normalizeRepoPath(ref).replace(/^\.\//, "");
}

export function readBuildRef(project: WikiProject, ref: string): { ok: true; data: any } | { ok: false; reason: string } {
	const normalized = normalizeBuildPath(ref);
	if (!normalized.startsWith(".codewiki/builds/")) return { ok: false, reason: "not-build-ref" };
	try {
		return { ok: true, data: JSON.parse(readFileSync(resolve(project.root, normalized), "utf8")) };
	} catch {
		return { ok: false, reason: "unreadable" };
	}
}

export function acceptedBuildRefGaps(project: WikiProject, refs: string[], gapName: string): string[] {
	if (refs.length === 0) return [gapName];
	const gaps: string[] = [];
	for (const ref of refs) {
		const result = readBuildRef(project, ref);
		if (!result.ok) {
			gaps.push(`${gapName}:${ref}:${result.reason}`);
			continue;
		}
		if (!isAcceptedBuildData(result.data)) gaps.push(`${gapName}:${ref}:not_accepted`);
	}
	return unique(gaps);
}

export function buildRefsByKind(build: any, loop: "decision" | "planning" | "implementation"): string[] {
	const field = loop === "decision"
		? "source_decision_build"
		: loop === "planning"
			? "source_planning_build"
			: "source_implementation_build";
	return unique([
		...trimList([build?.[field]]),
		...trimList(build?.consumes?.[loop]),
		...trimList(build?.traceability?.accepted_build_refs).filter((ref) => ref.includes(`/builds/${loop}/`)),
		...trimList(build?.accepted_build_refs).filter((ref) => ref.includes(`/builds/${loop}/`)),
	]);
}

export function requiredUpstreamLoop(kind: string): "decision" | "planning" | null {
	if (kind === "planning_build") return "decision";
	if (kind === "implementation_build") return "planning";
	return null;
}

export function semanticTraceabilityGaps(project: WikiProject, build: any): string[] {
	const kind = String(build?.kind || "").trim();
	const exemption = normalizeTraceabilityExemption(build?.traceability?.exemption ?? build?.traceability?.change_class ?? build?.change_class);
	const semantic = isSemanticTraceability(build?.traceability?.semantic, exemption);
	const requires = build?.traceability?.requires_accepted_build ?? (semantic && requiredUpstreamLoop(kind) !== null);
	if (!requires) return [];
	const upstream = requiredUpstreamLoop(kind);
	if (!upstream) return [];
	return acceptedBuildRefGaps(project, buildRefsByKind(build, upstream), `accepted_${upstream}_build_ref`);
}

export function isolationBoundary(required: boolean, mode: string, reason: string, evidence: string[], handoff: string, profiles: string[] = []) {
	return { required, mode, reason, evidence, handoff, profiles };
}

export function buildTraceability(kind: string, input: CodewikiBuildToolInput, consumes: CodewikiBuildRefsInput, produces: CodewikiBuildProducesInput) {
	const exemption = normalizeTraceabilityExemption(input.traceability?.exemption ?? input.traceability?.change_class ?? input.change_class);
	const changeType = normalizeChangeType(
		input.traceability?.change_type ?? input.change_type ?? input.traceability?.change_class ?? input.change_class,
		inferChangeTypeForBuild(kind, { ...input, consumes, produces }),
	);
	const semantic = isSemanticTraceability(input.traceability?.semantic, exemption);
	const upstreamLoop = requiredUpstreamLoop(`${kind}_build`);
	const upstreamBuildRefs = unique([
		...trimList(input.upstream_build_refs),
		...trimList(input.traceability?.upstream_build_refs),
		...(upstreamLoop ? buildRefsByKind({ ...input, consumes }, upstreamLoop) : []),
	]);
	const acceptedBuildRefs = unique([
		...trimList(input.accepted_build_refs),
		...trimList(input.traceability?.accepted_build_refs),
		...upstreamBuildRefs,
	]);
	return {
		change_type: changeType,
		exemption,
		semantic,
		requires_accepted_build: input.traceability?.requires_accepted_build ?? (semantic && upstreamLoop !== null),
		upstream_loop: upstreamLoop,
		upstream_build_refs: upstreamBuildRefs,
		accepted_build_refs: acceptedBuildRefs,
	};
}

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

export function requiredAuditProfiles(profile: string, explicit?: string[], policyProfile?: string): string[] {
	const profileKey = profile.trim().toLowerCase();
	const policyKey = String(policyProfile || "").trim().toLowerCase();
	return unique([
		...(DEFAULT_REQUIRED_AUDIT_PROFILES[profileKey] ?? []),
		...(policyKey && policyKey !== profileKey ? DEFAULT_REQUIRED_AUDIT_PROFILES[policyKey] ?? [] : []),
		...trimList(explicit),
	]).map(normalizeAuditProfile).filter(Boolean);
}

export function auditRequirement(profile: string, policyProfile?: string, explicit?: string[]) {
	const profiles = requiredAuditProfiles(profile, explicit, policyProfile);
	return {
		required: profiles.length > 0,
		profiles,
		evidence: profiles.map((auditProfile) => `audit:${auditProfile} or profile:${auditProfile}`),
		reason: "Gateway profiles require deterministic audit evidence for their build or boundary context.",
	};
}

export function auditProfileNamesFromRefs(refs: string[]): string[] {
	return unique(refs.map(normalizeAuditProfile).filter((profile) => DEFAULT_REQUIRED_AUDIT_PROFILES[profile] || /^[a-z0-9-]+$/.test(profile)));
}

export function auditEvidenceGaps(refs: string[], requirement: ReturnType<typeof auditRequirement>): string[] {
	if (!requirement.required) return [];
	const present = new Set(auditProfileNamesFromRefs(refs));
	return requirement.profiles.filter((profile) => !present.has(profile));
}

export function sha256Text(value: string): string {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function sha256Buffer(value: Buffer): string {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function normalizeRepoPath(value: string): string {
	return value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

export function buildArtifactDigests(project: WikiProject, refs: Array<{ path: string; role: string }>) {
	const files: Array<{ path: string; role: string; sha256: string; bytes: number }> = [];
	const skipped: Array<{ path: string; role: string; reason: string }> = [];
	for (const ref of refs) {
		const path = normalizeRepoPath(ref.path);
		if (!path) continue;
		const absPath = resolve(project.root, path);
		try {
			if (!existsSync(absPath)) {
				skipped.push({ path, role: ref.role, reason: "missing" });
				continue;
			}
			const stats = statSync(absPath);
			if (!stats.isFile()) {
				skipped.push({ path, role: ref.role, reason: "not-file" });
				continue;
			}
			if (stats.size > 1_000_000) {
				skipped.push({ path, role: ref.role, reason: "too-large" });
				continue;
			}
			files.push({ path, role: ref.role, sha256: sha256Buffer(readFileSync(absPath)), bytes: stats.size });
		} catch {
			skipped.push({ path, role: ref.role, reason: "unreadable" });
		}
	}
	return { algorithm: "sha256", files, skipped };
}

