import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type {
	CodewikiBuildProducesInput,
	CodewikiBuildRefsInput,
	CodewikiBuildToolInput,
} from "./types.ts";
import { isAcceptedBuildData } from "./lifecycle.ts";
import type { ChangeType } from "../decision/types.ts";
import type { WikiProject } from "../project/types.ts";
import {
	normalizeChangeType,
	normalizeTraceabilityExemption,
	isSemanticTraceability,
} from "../decision/traceability.ts";
import { unique } from "../shared/utils.ts";
export {
	DEFAULT_REQUIRED_AUDIT_PROFILES,
	auditEvidenceGaps,
	auditProfileNamesFromRefs,
	auditRequirement,
	normalizeAuditProfile,
	requiredAuditProfiles,
} from "../policy/gate-policy.ts";

export function buildSlug(value: string, defaultPrefix: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 48) || defaultPrefix
	);
}

export function addDaysIso(baseIso: string, days: number): string {
	const date = new Date(baseIso);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString();
}

export function buildLifecycle(
	input: CodewikiBuildToolInput,
	created: string,
	defaultTtlDays: number,
) {
	const ttlDays = input.lifecycle?.ttl_days ?? defaultTtlDays;
	return {
		state: input.lifecycle?.state ?? "accepted",
		ttl_days: ttlDays,
		archive_after:
			input.lifecycle?.archive_after ?? addDaysIso(created, ttlDays),
		purge_after:
			input.lifecycle?.purge_after ?? addDaysIso(created, ttlDays * 2),
	};
}

export function buildBuildPath(
	project: WikiProject,
	kind: string,
	slug: string,
	day: string,
): string {
	const abs = resolve(
		project.root,
		`.codewiki/builds/${kind}/${day}-${slug}.json`,
	);
	return abs;
}

export function trimList(values?: unknown[]): string[] {
	return (values ?? [])
		.map((value) => String(value || "").trim())
		.filter(Boolean);
}

export function inferChangeTypeForBuild(
	kind: string,
	inputOrBuild: any,
): ChangeType {
	if (kind === "decision_build" || kind === "decision") {
		const paths = [
			...trimList(inputOrBuild.knowledge_changes),
			...trimList(inputOrBuild.produces?.knowledge),
			...trimList(
				inputOrBuild.row_to_kb_mappings?.flatMap(
					(mapping: any) => mapping?.knowledge_refs ?? [],
				),
			),
		];
		const direction = String(inputOrBuild.propagation?.direction || "").trim();
		if (
			direction === "product-first" ||
			paths.some((path) => path.includes("/product/"))
		)
			return "product";
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
		if (
			refs.some(
				(ref) => ref.startsWith(".codewiki/roadmap/") || /^TASK-\d+/.test(ref),
			)
		)
			return "task";
		if (refs.some((ref) => ref.startsWith(".codewiki/kb/product/")))
			return "product";
		if (
			refs.some(
				(ref) =>
					ref.startsWith(".codewiki/kb/system/") ||
					ref.startsWith("skills/codewiki-") ||
					ref.startsWith("src/adapters/pi/prompt-assets/"),
			)
		)
			return "system";
		return "code";
	}
	return "task";
}

export function normalizeBuildPath(ref: string): string {
	return normalizeRepoPath(ref).replace(/^\.\//, "");
}

export function readBuildRef(
	project: WikiProject,
	ref: string,
): { ok: true; data: any } | { ok: false; reason: string } {
	const normalized = normalizeBuildPath(ref);
	if (!normalized.startsWith(".codewiki/builds/"))
		return { ok: false, reason: "not-build-ref" };
	try {
		return {
			ok: true,
			data: JSON.parse(readFileSync(resolve(project.root, normalized), "utf8")),
		};
	} catch {
		return { ok: false, reason: "unreadable" };
	}
}

export function acceptedBuildRefGaps(
	project: WikiProject,
	refs: string[],
	gapName: string,
): string[] {
	if (refs.length === 0) return [gapName];
	const gaps: string[] = [];
	for (const ref of refs) {
		const result = readBuildRef(project, ref);
		if (!result.ok) {
			gaps.push(`${gapName}:${ref}:${result.reason}`);
			continue;
		}
		if (!isAcceptedBuildData(result.data))
			gaps.push(`${gapName}:${ref}:not_accepted`);
	}
	return unique(gaps);
}

function validationSourceBuildRefs(data: any): string[] {
	const source = String(data?.source || "").trim();
	const refs =
		source.match(/(?:\.\/)?\.codewiki\/builds\/[A-Za-z0-9/_-]+\.json/g) || [];
	return refs.length
		? unique(refs.map(normalizeBuildPath))
		: source
			? [normalizeBuildPath(source)]
			: [];
}

function readValidationReports(project: WikiProject): any[] {
	const root = resolve(project.root, ".codewiki/validation");
	if (!existsSync(root)) return [];
	const reports: any[] = [];
	const walk = (dir: string) => {
		for (const name of readdirSync(dir)) {
			const path = resolve(dir, name);
			try {
				if (statSync(path).isDirectory()) {
					walk(path);
					continue;
				}
				if (!name.endsWith(".json")) continue;
				const data = JSON.parse(readFileSync(path, "utf8"));
				reports.push({
					...data,
					path: path
						.replace(project.root, "")
						.replace(/^\//, "")
						.replace(/\\/g, "/"),
				});
			} catch (error) {
				void error;
			}
		}
	};
	walk(root);
	return reports.sort((a, b) =>
		String(a?.created || "").localeCompare(String(b?.created || "")),
	);
}

export function validationReportsForBuild(
	project: WikiProject,
	ref: string,
	profile?: string,
): any[] {
	const normalizedRef = normalizeBuildPath(ref);
	const normalizedProfile = String(profile || "")
		.trim()
		.toLowerCase();
	return readValidationReports(project).filter((report) => {
		if (String(report?.kind || "validation_report") !== "validation_report")
			return false;
		if (
			normalizedProfile &&
			String(report?.profile || "")
				.trim()
				.toLowerCase() !== normalizedProfile
		)
			return false;
		return validationSourceBuildRefs(report).includes(normalizedRef);
	});
}

export function passingGatewayValidationRefs(
	project: WikiProject,
	ref: string,
	profile: string,
): string[] {
	return validationReportsForBuild(project, ref, profile)
		.filter(
			(report) =>
				String(report?.verdict || "")
					.trim()
					.toLowerCase() === "pass",
		)
		.map(
			(report) =>
				String(
					report?.path || report?.source || report?.created || "",
				).trim() || `${profile}:pass`,
		);
}

export function acceptedGatewayBuildRefGaps(
	project: WikiProject,
	refs: string[],
	gapName: string,
	profile: string,
): string[] {
	if (refs.length === 0) return [gapName];
	const gaps: string[] = [];
	for (const ref of refs) {
		const result = readBuildRef(project, ref);
		if (!result.ok) {
			gaps.push(`${gapName}:${ref}:${result.reason}`);
			continue;
		}
		if (!isAcceptedBuildData(result.data)) {
			gaps.push(`${gapName}:${ref}:not_accepted`);
			continue;
		}
		const reports = validationReportsForBuild(project, ref, profile);
		if (
			reports.some(
				(report) =>
					String(report?.verdict || "")
						.trim()
						.toLowerCase() === "pass",
			)
		)
			continue;
		const latest = reports.at(-1);
		const latestVerdict = String(latest?.verdict || "")
			.trim()
			.toLowerCase();
		gaps.push(
			`${gapName}:${ref}:${latestVerdict ? `gateway_verdict=${latestVerdict}` : `missing_${profile}_validation_pass`}`,
		);
	}
	return unique(gaps);
}

export function buildRefsByKind(
	build: any,
	loop: "decision" | "planning" | "implementation",
): string[] {
	const field =
		loop === "decision"
			? "source_decision_build"
			: loop === "planning"
				? "source_planning_build"
				: "source_implementation_build";
	return unique([
		...trimList([build?.[field]]),
		...trimList(build?.consumes?.[loop]),
		...trimList(build?.traceability?.accepted_build_refs).filter((ref) =>
			ref.includes(`/builds/${loop}/`),
		),
		...trimList(build?.accepted_build_refs).filter((ref) =>
			ref.includes(`/builds/${loop}/`),
		),
	]);
}

function planningBuildTaskIds(build: any): string[] {
	return unique([
		...trimList(build?.task_ids),
		...trimList(build?.consumes?.roadmap),
		...trimList(build?.produces?.roadmap),
		...trimList(
			build?.decision_row_resolutions?.flatMap(
				(entry: any) => entry?.task_ids ?? [],
			),
		),
		...trimList(
			build?.downstream_question_resolutions?.flatMap(
				(entry: any) => entry?.task_ids ?? [],
			),
		),
	]);
}

function readBuildsInDir(
	project: WikiProject,
	kind: "planning",
): Array<{ path: string; data: any }> {
	const dir = `.codewiki/builds/${kind}`;
	const absDir = resolve(project.root, dir);
	if (!existsSync(absDir)) return [];
	return readdirSync(absDir)
		.filter((name) => name.endsWith(".json"))
		.sort()
		.flatMap((name) => {
			const path = `${dir}/${name}`;
			try {
				return [
					{
						path,
						data: JSON.parse(readFileSync(resolve(project.root, path), "utf8")),
					},
				];
			} catch {
				return [];
			}
		});
}

export function implementationReadinessGapsForTask(
	project: WikiProject,
	taskId: string,
): string[] {
	const normalizedTaskId = String(taskId || "").trim();
	if (!normalizedTaskId) return ["task_id"];
	const planningBuilds = readBuildsInDir(project, "planning")
		.filter((entry) => String(entry.data?.kind || "") === "planning_build")
		.filter((entry) =>
			planningBuildTaskIds(entry.data).includes(normalizedTaskId),
		);
	if (planningBuilds.length === 0)
		return [`${normalizedTaskId}:source_planning_build_missing`];
	const passing = planningBuilds.find(
		(entry) =>
			acceptedGatewayBuildRefGaps(
				project,
				[entry.path],
				"accepted_planning_build_ref",
				"planning",
			).length === 0,
	);
	if (passing) return [];
	return unique(
		planningBuilds.flatMap((entry) =>
			acceptedGatewayBuildRefGaps(
				project,
				[entry.path],
				"accepted_planning_build_ref",
				"planning",
			),
		),
	);
}

export function roadmapImplementationReadiness(
	project: WikiProject,
	roadmap: any,
): Record<string, string[]> {
	const taskIds = unique([
		...Object.keys(roadmap?.tasks || {}),
		...trimList(roadmap?.order),
	]);
	return Object.fromEntries(
		taskIds
			.map(
				(taskId) =>
					[
						taskId,
						implementationReadinessGapsForTask(project, taskId),
					] as const,
			)
			.filter(([, gaps]) => gaps.length > 0),
	);
}

export function requiredUpstreamLoop(
	kind: string,
): "decision" | "planning" | null {
	if (kind === "planning_build") return "decision";
	if (kind === "implementation_build") return "planning";
	return null;
}

export function semanticTraceabilityGaps(
	project: WikiProject,
	build: any,
): string[] {
	const kind = String(build?.kind || "").trim();
	const exemption = normalizeTraceabilityExemption(
		build?.traceability?.exemption ??
			build?.traceability?.change_class ??
			build?.change_class,
	);
	const semantic = isSemanticTraceability(
		build?.traceability?.semantic,
		exemption,
	);
	const requires =
		build?.traceability?.requires_accepted_build ??
		(semantic && requiredUpstreamLoop(kind) !== null);
	if (!requires) return [];
	const upstream = requiredUpstreamLoop(kind);
	if (!upstream) return [];
	return acceptedBuildRefGaps(
		project,
		buildRefsByKind(build, upstream),
		`accepted_${upstream}_build_ref`,
	);
}

export function isolationBoundary(
	required: boolean,
	mode: string,
	reason: string,
	evidence: string[],
	handoff: string,
	profiles: string[] = [],
) {
	return { required, mode, reason, evidence, handoff, profiles };
}

export function buildTraceability(
	kind: string,
	input: CodewikiBuildToolInput,
	consumes: CodewikiBuildRefsInput,
	produces: CodewikiBuildProducesInput,
) {
	const exemption = normalizeTraceabilityExemption(
		input.traceability?.exemption ??
			input.traceability?.change_class ??
			input.change_class,
	);
	const changeType = normalizeChangeType(
		input.traceability?.change_type ??
			input.change_type ??
			input.traceability?.change_class ??
			input.change_class,
		inferChangeTypeForBuild(kind, { ...input, consumes, produces }),
	);
	const semantic = isSemanticTraceability(
		input.traceability?.semantic,
		exemption,
	);
	const upstreamLoop = requiredUpstreamLoop(`${kind}_build`);
	const upstreamBuildRefs = unique([
		...trimList(input.upstream_build_refs),
		...trimList(input.traceability?.upstream_build_refs),
		...(upstreamLoop
			? buildRefsByKind({ ...input, consumes }, upstreamLoop)
			: []),
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
		requires_accepted_build:
			input.traceability?.requires_accepted_build ??
			(semantic && upstreamLoop !== null),
		upstream_loop: upstreamLoop,
		upstream_build_refs: upstreamBuildRefs,
		accepted_build_refs: acceptedBuildRefs,
	};
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

export function buildArtifactDigests(
	project: WikiProject,
	refs: Array<{ path: string; role: string }>,
) {
	const files: Array<{
		path: string;
		role: string;
		sha256: string;
		bytes: number;
	}> = [];
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
			files.push({
				path,
				role: ref.role,
				sha256: sha256Buffer(readFileSync(absPath)),
				bytes: stats.size,
			});
		} catch {
			skipped.push({ path, role: ref.role, reason: "unreadable" });
		}
	}
	return { algorithm: "sha256", files, skipped };
}
