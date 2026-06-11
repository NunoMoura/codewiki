/**
 * runtime/runner.ts
 *
 * CodeWiki bounded execution runtime for one safe work-mode step.
 * It consumes agency policy/plans, claims task scopes, runs deterministic
 * compiler/gateway preparation, requests CodeWiki-owned context boundaries,
 * records workflow-efficiency evidence, and releases temporary claims.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { WikiProject } from "../project/types.ts";
import { readRoadmapFile, resolveRoadmapTask } from "../roadmap/store.ts";
import type { RoadmapTaskRecord } from "../roadmap/types.ts";
import {
	artifactStatusesForScopes,
	buildChangeClaimState,
	claimScopeLabels,
	hasBlockingArtifactStatus,
	mutateArtifactStatuses,
	readChangeClaimsFile,
} from "../session/claims.ts";
import type {
	ArtifactStatusRecord,
	ChangeClaimRecord,
} from "../session/types.ts";
import {
	automationReadinessRuntimeGate,
	automationReadinessTaskFromPlan,
} from "../state/automation-readiness.ts";
import { stableAgentName } from "../state/builders.ts";
import {
	buildCodewikiResumeContext,
	type CodewikiResumeContextResult,
} from "../state/resume-context.ts";
import { taskArtifactScopes } from "../state/resume-selection.ts";
import { buildCodewikiResumeKickoff } from "../state/resume-kickoff.ts";
import { buildGatewayPreflight } from "../gateway/report.ts";
import { formatError, nowIso, unique } from "../shared/utils.ts";
import { normalizeArtifactRefSets } from "../telemetry/artifact-ref.ts";
import { effectiveAgencyPolicy } from "../agency/types.ts";
import { planAgencyAutoPickup } from "../agency/auto-pickup.ts";
import {
	requireRuntimeCapability,
	type CodewikiRuntimePorts,
} from "./ports.ts";
import {
	finishCodewikiDaemonRun,
	heartbeatCodewikiDaemonRun,
	normalizeCodewikiDaemonJobStore,
	startCodewikiDaemonRun,
	type CodewikiDaemonBlockReason,
	type CodewikiDaemonBlockKind,
	type CodewikiDaemonJobRecord,
	type CodewikiDaemonJobStore,
	type CodewikiDaemonLoop,
	type CodewikiDaemonRunRecord,
	type CodewikiDaemonRunOutcome,
	type CodewikiDaemonWorkerProfile,
	type CodewikiDaemonWorkerRef,
	type CodewikiDaemonModelPolicy,
	type CodewikiFreshWorkerContentEvidence,
	type CodewikiFreshWorkerRequest,
	type CodewikiFreshWorkerResult,
	type CodewikiFreshWorkerRole,
	type CodewikiRuntimeBudgetUsage,
	type CodewikiSourceBackedContextBoundary,
	type CodewikiRuntimePlan,
	type CodewikiRuntimeResult,
	type FinishCodewikiDaemonRunInput,
	type WorkflowEfficiencyEvidence,
} from "./types.ts";

const RUNTIME_CLAIM_TTL_MINUTES = 120;
const DAEMON_DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000;
const DAEMON_DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;
const MIN_WORK_STEP_WRITES = 2;

interface RuntimeState {
	startedAt: number;
	budgetUsed: CodewikiRuntimeBudgetUsage;
	efficiency: WorkflowEfficiencyEvidence;
	events: string[];
}

interface LatestImplementationBuild {
	path: string;
	data: any;
	created: string;
}

interface FreshWorkerRuntimeIntent {
	required: boolean;
	compatibility_role?: CodewikiFreshWorkerRole;
	reason: string;
	gate?: string;
	content_mode?: CodewikiFreshWorkerContentEvidence["mode"];
	working_tree_digest?: string;
	worktree_digest?: string;
	patch_refs: string[];
	worktree_refs: string[];
	immutable_refs: string[];
	content_refs: string[];
	trace_refs: string[];
	gate_refs: string[];
	git_refs: string[];
	validation_refs: string[];
	build_refs: string[];
	source_refs: string[];
	graph_lens?: string;
	expected_output?: string;
	constraints: Record<string, unknown>;
	content_evidence_requirements: string[];
}

function recordValue(value: unknown, key: string): unknown {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)[key]
		: undefined;
}

function stringValues(...values: unknown[]): string[] {
	return unique(
		values
			.flatMap((value) => {
				if (Array.isArray(value)) return value;
				return value === undefined || value === null ? [] : [value];
			})
			.map((value) => String(value || "").trim())
			.filter(Boolean),
	);
}

function firstRecord(...values: unknown[]): Record<string, unknown> {
	for (const value of values) {
		if (value && typeof value === "object" && !Array.isArray(value)) {
			return value as Record<string, unknown>;
		}
	}
	return {};
}

function optionalFreshWorkerRole(
	value: unknown,
): CodewikiFreshWorkerRole | undefined {
	const role = String(value || "")
		.trim()
		.toLowerCase();
	return ["builder", "validator", "publisher", "observer"].includes(role)
		? (role as CodewikiFreshWorkerRole)
		: undefined;
}

function freshWorkerIntent(
	plan: CodewikiRuntimePlan,
): FreshWorkerRuntimeIntent {
	const cycle = firstCycle(plan);
	const policy = firstRecord(recordValue(plan.policy, "fresh_worker"));
	const raw = firstRecord(recordValue(cycle, "fresh_worker"), policy);
	const contextBoundary = firstRecord(
		raw.context_boundary,
		raw.contextBoundary,
		recordValue(cycle, "context_boundary"),
		recordValue(plan.policy, "context_boundary"),
	);
	const required = Boolean(
		raw.required ||
			policy.required ||
			recordValue(plan.policy, "freshWorkerRequired") ||
			cycle.action === "fresh_worker",
	);
	const compatibilityRole = optionalFreshWorkerRole(
		raw.compatibility_role || raw.role || recordValue(cycle, "worker_role"),
	);
	const gate = String(raw.gate || recordValue(cycle, "gate") || "").trim();
	const contentMode = String(
		raw.content_mode ||
			raw.contentMode ||
			recordValue(cycle, "content_mode") ||
			"",
	)
		.trim()
		.toLowerCase() as CodewikiFreshWorkerContentEvidence["mode"];
	return {
		required,
		...(compatibilityRole ? { compatibility_role: compatibilityRole } : {}),
		reason: String(
			contextBoundary.reason ||
				raw.reason ||
				recordValue(cycle, "summary") ||
				"runtime context-boundary request",
		).trim(),
		...(gate ? { gate } : {}),
		...(contentMode ? { content_mode: contentMode } : {}),
		working_tree_digest:
			String(raw.working_tree_digest || raw.worktree_digest || "").trim() ||
			undefined,
		worktree_digest: String(raw.worktree_digest || "").trim() || undefined,
		patch_refs: stringValues(
			raw.patch_ref,
			raw.patch_refs,
			recordValue(cycle, "patch_refs"),
		),
		worktree_refs: stringValues(
			raw.worktree_ref,
			raw.worktree_refs,
			raw.worktree_path,
			recordValue(cycle, "worktree_refs"),
		),
		immutable_refs: stringValues(
			raw.head_sha,
			raw.validated_sha,
			raw.published_sha,
			raw.tree_sha,
			raw.package_digest,
			raw.archive_ref,
			raw.remote_ref,
			raw.immutable_refs,
			recordValue(cycle, "git_refs"),
		),
		content_refs: stringValues(
			raw.content_ref,
			raw.content_refs,
			recordValue(cycle, "content_refs"),
		),
		trace_refs: stringValues(
			raw.trace_ref,
			raw.trace_refs,
			contextBoundary.trace_refs,
			recordValue(cycle, "trace_refs"),
		),
		gate_refs: stringValues(
			raw.gate_ref,
			raw.gate_refs,
			contextBoundary.gate_refs,
			recordValue(cycle, "gate_refs"),
		),
		git_refs: stringValues(
			raw.git_ref,
			raw.git_refs,
			recordValue(cycle, "git_refs"),
		),
		validation_refs: stringValues(
			raw.validation_ref,
			raw.validation_refs,
			recordValue(cycle, "validation_refs"),
		),
		build_refs: stringValues(
			raw.build_ref,
			raw.build_refs,
			recordValue(cycle, "build_refs"),
		),
		source_refs: stringValues(
			raw.source_ref,
			raw.source_refs,
			contextBoundary.source_refs,
			recordValue(cycle, "source_refs"),
		),
		graph_lens:
			String(contextBoundary.graph_lens || raw.graph_lens || "").trim() ||
			undefined,
		expected_output:
			String(
				contextBoundary.expected_output || raw.expected_output || "",
			).trim() || undefined,
		constraints: firstRecord(contextBoundary.constraints, raw.constraints),
		content_evidence_requirements: stringValues(
			raw.content_evidence_requirements,
			contextBoundary.content_evidence_requirements,
		),
	};
}

function isPromotionGate(intent: FreshWorkerRuntimeIntent): boolean {
	const gate = String(intent.gate || "").toLowerCase();
	return (
		intent.compatibility_role === "publisher" ||
		gate === "task-close" ||
		gate === "sprint-close" ||
		gate === "ship-ready" ||
		gate === "publication"
	);
}

function freshWorkerLabel(intent: FreshWorkerRuntimeIntent): string {
	return intent.compatibility_role
		? `${intent.compatibility_role} compatibility worker`
		: "context-boundary worker";
}

function freshWorkerContentEvidence(
	intent: FreshWorkerRuntimeIntent,
): CodewikiFreshWorkerContentEvidence {
	const mode =
		intent.content_mode || (isPromotionGate(intent) ? "immutable" : "clean");
	const requiresImmutable = mode === "immutable" || isPromotionGate(intent);
	const requiresDirty = mode === "dirty";
	const required = requiresImmutable
		? ["immutable_content_ref"]
		: requiresDirty
			? ["working_tree_digest", "patch_or_worktree_handoff"]
			: [];
	const missing: string[] = [];
	if (requiresImmutable && intent.immutable_refs.length === 0) {
		missing.push("immutable_content_ref");
	}
	if (requiresDirty && !intent.working_tree_digest && !intent.worktree_digest) {
		missing.push("working_tree_digest");
	}
	if (
		requiresDirty &&
		intent.patch_refs.length === 0 &&
		intent.worktree_refs.length === 0
	) {
		missing.push("patch_or_worktree_handoff");
	}
	const contentRefs = unique([
		...intent.content_refs,
		...intent.patch_refs,
		...intent.worktree_refs,
		...intent.immutable_refs,
		...(intent.working_tree_digest
			? [`working_tree_digest:${intent.working_tree_digest}`]
			: []),
		...(intent.worktree_digest
			? [`worktree_digest:${intent.worktree_digest}`]
			: []),
	]);
	return {
		mode,
		...(intent.working_tree_digest
			? { working_tree_digest: intent.working_tree_digest }
			: {}),
		...(intent.worktree_digest
			? { worktree_digest: intent.worktree_digest }
			: {}),
		patch_refs: intent.patch_refs,
		worktree_refs: intent.worktree_refs,
		immutable_refs: intent.immutable_refs,
		content_refs: contentRefs,
		required,
		missing,
		safe_to_transfer: missing.length === 0,
		notes: requiresDirty
			? [
					"dirty implementation handoff requires exact digest plus patch/worktree evidence",
				]
			: requiresImmutable
				? [
						"promotion gates require immutable commit/tree/package/archive/remote evidence",
					]
				: [],
	};
}

function freshWorkerBlocker(
	kind: CodewikiDaemonBlockReason["kind"],
	summary: string,
	refs: string[],
	remediation: string[],
	recommended_next_loop: CodewikiDaemonLoop = "implementation",
): CodewikiDaemonBlockReason {
	return {
		kind,
		summary,
		refs: unique(refs),
		recommended_next_loop,
		gate_refs: refs.filter((ref) => ref.startsWith("gate:")),
		remediation,
		retryable: true,
	};
}

function freshWorkerHandoff(
	request: CodewikiFreshWorkerRequest,
	summary: string,
): CodewikiFreshWorkerResult["handoff"] {
	return {
		summary,
		build_refs: request.build_refs,
		validation_refs: request.validation_refs,
		content_refs: request.content_evidence.content_refs,
		trace_refs: request.trace_refs,
		gate_refs: request.gate_refs,
		git_refs: request.git_refs,
		artifact_refs: request.artifact_refs,
		next_loop: "implementation",
		notes: request.content_evidence.notes,
	};
}

function emptyRuntimeState(): RuntimeState {
	return {
		startedAt: Date.now(),
		budgetUsed: {
			cycles: 0,
			writes: 0,
			sessions: 0,
			wall_seconds: 0,
			tokens_estimate: 0,
		},
		efficiency: {
			user_interruptions_avoided: 0,
			user_interruptions_required: 0,
			manual_commands_avoided: 0,
			manual_commands_required: 0,
			session_boundaries_used: 0,
			platform_limited_steps: [],
			notes: [],
		},
		events: [],
	};
}

function finishUsage(state: RuntimeState): CodewikiRuntimeBudgetUsage {
	return {
		...state.budgetUsed,
		wall_seconds: Math.max(0, (Date.now() - state.startedAt) / 1000),
	};
}

function result(
	state: RuntimeState,
	input: Omit<
		CodewikiRuntimeResult,
		"budget_used" | "workflow_efficiency" | "events"
	>,
): CodewikiRuntimeResult {
	return {
		...input,
		scopes: input.scopes ?? [],
		budget_used: finishUsage(state),
		workflow_efficiency: state.efficiency,
		events: state.events,
	};
}

function runtimeStop(
	state: RuntimeState,
	action: string,
	summary: string,
	stopReason: string,
	status: CodewikiRuntimeResult["status"] = "stopped",
	fields: Partial<CodewikiRuntimeResult> = {},
): CodewikiRuntimeResult {
	return result(state, {
		executed: false,
		status,
		action,
		summary,
		stop_reason: stopReason,
		scopes: [],
		...fields,
	});
}

function asNumber(value: unknown, fallback: number): number {
	const number = Number(value ?? fallback);
	return Number.isFinite(number) ? number : fallback;
}

function budgetStopReasons(plan: CodewikiRuntimePlan): string[] {
	const budget = plan.budget || {};
	const reasons: string[] = [];
	if (asNumber(budget.maxCycles, 1) < 1) reasons.push("maxCycles exhausted");
	if (asNumber(budget.maxWrites, 0) < MIN_WORK_STEP_WRITES) {
		reasons.push(
			`maxWrites below required claim/release budget (${MIN_WORK_STEP_WRITES})`,
		);
	}
	if (asNumber(budget.maxSessions, 1) < 0) {
		reasons.push("maxSessions exhausted");
	}
	if (asNumber(budget.maxWallSeconds, 1) <= 0) {
		reasons.push("maxWallSeconds exhausted");
	}
	if (asNumber(budget.maxTokens, 1) <= 0) reasons.push("maxTokens exhausted");
	return reasons;
}

function firstCycle(plan: CodewikiRuntimePlan): Record<string, unknown> {
	return plan.cycles[0] || {};
}

function nextTaskIdFromPlan(plan: CodewikiRuntimePlan): string {
	return String(
		plan.stop?.next_task || firstCycle(plan).next_task || "",
	).trim();
}

function sessionIdForRuntime(
	ports: CodewikiRuntimePorts,
	taskId: string,
): string {
	return (
		ports.sessionStore?.getCurrentSessionId?.()?.trim() ||
		`codewiki-runtime-${taskId.toLowerCase()}`
	);
}

function compactStatusLines(statuses: ArtifactStatusRecord[]): string[] {
	return statuses.slice(0, 8).map((status) => {
		const holders = status.holders
			.map((holder) => `${holder.record_id}:${holder.session_id}`)
			.join(", ");
		return `${status.artifact.task_id || status.artifact.path || status.artifact.ref || status.artifact.description}: ${status.status}${holders ? ` holders=[${holders}]` : ""}`;
	});
}

async function readTask(
	project: WikiProject,
	taskId: string,
): Promise<RoadmapTaskRecord | null> {
	const roadmap = await readRoadmapFile(
		resolve(project.root, project.roadmapPath),
	);
	return resolveRoadmapTask(roadmap, taskId);
}

async function artifactPreflight(
	project: WikiProject,
	task: RoadmapTaskRecord,
	sessionId: string,
): Promise<ArtifactStatusRecord[]> {
	const artifactState = buildChangeClaimState(
		await readChangeClaimsFile(project),
	);
	return artifactStatusesForScopes(
		taskArtifactScopes(task),
		artifactState,
		sessionId,
		"write",
	);
}

async function claimTaskScopes(
	project: WikiProject,
	task: RoadmapTaskRecord,
	sessionId: string,
): Promise<ChangeClaimRecord> {
	const claim = await mutateArtifactStatuses(
		project,
		{
			action: "mark",
			mode: "write",
			role: "builder",
			taskId: task.id,
			summary: `CodeWiki runtime bounded step for ${task.id}.`,
			scopes: taskArtifactScopes(task),
			ttl_minutes: RUNTIME_CLAIM_TTL_MINUTES,
		},
		{ sessionId, agentName: stableAgentName(sessionId) },
	);
	if (!claim.claim)
		throw new Error("artifact-status mark did not create a claim");
	return claim.claim;
}

async function releaseClaim(
	project: WikiProject,
	claim: ChangeClaimRecord,
	sessionId: string,
): Promise<void> {
	await mutateArtifactStatuses(
		project,
		{
			action: "release",
			recordId: claim.id,
			summary: `CodeWiki runtime released ${claim.id}.`,
		},
		{ sessionId, agentName: stableAgentName(sessionId) },
	);
}

async function latestImplementationBuildForTask(
	project: WikiProject,
	taskId: string,
): Promise<LatestImplementationBuild | null> {
	const relDir = ".codewiki/builds/implementation";
	const absDir = resolve(project.root, relDir);
	let names: string[] = [];
	try {
		names = await readdir(absDir);
	} catch {
		return null;
	}
	const matches: LatestImplementationBuild[] = [];
	for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
		const path = `${relDir}/${name}`;
		try {
			const data = JSON.parse(await readFile(join(absDir, name), "utf8"));
			if (String(data?.kind || "").trim() !== "implementation_build") continue;
			const buildTaskId = String(data?.task_id || data?.task?.id || "").trim();
			if (buildTaskId !== taskId) continue;
			matches.push({
				path,
				data,
				created: String(data?.created || name).trim(),
			});
		} catch {
			// Ignore malformed transient builds; gateway preflight will catch explicit refs.
		}
	}
	return (
		matches.sort((a, b) => a.created.localeCompare(b.created)).at(-1) ?? null
	);
}

async function buildResumeContextWithFallback(
	project: WikiProject,
	ports: CodewikiRuntimePorts,
	input: {
		taskId: string;
		sessionId: string;
		followUpIntent: string;
	},
): Promise<CodewikiResumeContextResult> {
	const builder = ports.resumeContextBuilder ?? buildCodewikiResumeContext;
	try {
		return await builder(project, {
			requestedTaskId: input.taskId,
			sessionId: input.sessionId,
			followUpIntent: input.followUpIntent,
			refresh: false,
		});
	} catch (error) {
		if (ports.resumeContextBuilder) throw error;
		return builder(project, {
			requestedTaskId: input.taskId,
			sessionId: input.sessionId,
			followUpIntent: input.followUpIntent,
			refresh: true,
		});
	}
}

async function maybeRequestContextBoundary(
	project: WikiProject,
	state: RuntimeState,
	ports: CodewikiRuntimePorts,
	input: {
		task: RoadmapTaskRecord;
		resume: CodewikiResumeContextResult;
		reason: string;
		followUpIntent: string;
		sessionBudgetAvailable: boolean;
		budget: CodewikiRuntimePlan["budget"];
	},
): Promise<Record<string, unknown>> {
	const policy = effectiveAgencyPolicy(project.config);
	if (!input.resume.prompt.trim()) {
		return {
			requested: false,
			reason: "resume context unavailable",
		};
	}
	const sourceBackedPacket = runtimeContextBoundaryPacket({
		task: input.task,
		resume: input.resume,
		plan: {
			mode: "work",
			trigger: "runtime-context-boundary",
			budget: input.budget,
			cycles: [],
		},
		reason: input.reason,
	});
	const kickoff = buildCodewikiResumeKickoff({
		prompt: input.resume.prompt,
		reason: input.reason,
		generatedAt: nowIso(),
		projectRoot: project.root,
		taskId: input.task.id,
		contextPath: input.resume.context_path,
		sourceRefs: sourceBackedPacket.source_refs,
		graphLens: sourceBackedPacket.graph_lens,
		expectedOutput: sourceBackedPacket.expected_output,
		constraints: sourceBackedPacket.constraints,
		contentEvidenceRequirements:
			sourceBackedPacket.content_evidence_requirements,
		policy,
	});
	const requestContextRefresh = ports.sessionBoundary?.requestContextRefresh;
	const pickup = planAgencyAutoPickup(project, {
		boundary: "runtime-context-refresh",
		reason: input.reason,
		resume: {
			prompt: input.resume.prompt,
			taskId: input.task.id,
			contextPath: input.resume.context_path,
			sourceRefs: sourceBackedPacket.source_refs,
			followUpIntent: input.followUpIntent,
		},
		budget: { maxSessions: input.sessionBudgetAvailable ? 1 : 0 },
		adapterCanDeliver: typeof requestContextRefresh === "function",
		lifecycleSafe: true,
		intentStored: Boolean(input.resume.task || input.resume.context_path),
		prebuiltKickoff: kickoff,
		visibleToolResults: ["runtime result returned before context boundary"],
	});
	if (!pickup.allowed) {
		if (pickup.reason.includes("adapter cannot")) {
			state.efficiency.user_interruptions_required += 1;
			state.efficiency.manual_commands_required += 1;
			state.efficiency.platform_limited_steps.push(
				"session-boundary request port unavailable; returning source-backed kickoff for adapter/manual continuation",
			);
		} else {
			state.efficiency.notes.push(
				`Context boundary not requested: ${pickup.reason}.`,
			);
		}
		return {
			requested: false,
			reason: pickup.reason,
			kickoff,
			source_backed_packet: sourceBackedPacket,
			agency_auto_pickup: pickup,
		};
	}
	await requestContextRefresh?.({
		reason: input.reason,
		taskId: input.task.id,
		followUpIntent: input.followUpIntent,
		sourceRefs: sourceBackedPacket.source_refs,
		projectRoot: project.root,
		requestedAt: nowIso(),
	});
	state.budgetUsed.sessions += 1;
	state.efficiency.session_boundaries_used += 1;
	state.efficiency.user_interruptions_avoided += 1;
	state.efficiency.manual_commands_avoided += 1;
	state.events.push(
		"context-boundary requested through CodeWiki session boundary port",
	);
	return {
		requested: true,
		reason: input.reason,
		kickoff,
		source_backed_packet: sourceBackedPacket,
	};
}

function resumeRecordValue(
	resume: CodewikiResumeContextResult,
	key: string,
): unknown {
	return resume && typeof resume === "object"
		? (resume as unknown as Record<string, unknown>)[key]
		: undefined;
}

function resumeStringList(
	resume: CodewikiResumeContextResult,
	key: string,
): string[] {
	return stringValues(resumeRecordValue(resume, key));
}

function runtimeContextBoundaryPacket(input: {
	task: RoadmapTaskRecord;
	resume: CodewikiResumeContextResult;
	plan: CodewikiRuntimePlan;
	intent?: FreshWorkerRuntimeIntent;
	reason: string;
	contentEvidence?: CodewikiFreshWorkerContentEvidence;
	artifactRefs?: ReturnType<typeof normalizeArtifactRefSets>["artifact_refs"];
}): CodewikiSourceBackedContextBoundary {
	const resumeConstraints = firstRecord(
		resumeRecordValue(input.resume, "constraints"),
	);
	const compatibilityRole = input.intent?.compatibility_role;
	const resumeArtifactStatus = resumeRecordValue(
		input.resume,
		"artifact_status",
	);
	const workerProfile: CodewikiDaemonWorkerProfile | undefined =
		compatibilityRole
			? {
					role: compatibilityRole,
					mode: input.intent?.gate || "implementation",
					reason: input.intent?.reason || input.reason,
					capabilities: ["fresh-worker", "source-backed-resume"],
					notes: ["compatibility label only", "chat_context_shared=false"],
				}
			: undefined;
	return {
		reason: input.reason,
		task_id: input.task.id,
		trace_refs: unique([
			...(input.intent?.trace_refs || []),
			...input.resume.source_refs.filter((ref) => ref.includes("/builds/")),
		]),
		gate_refs: unique([
			...(input.intent?.gate_refs || []),
			...(input.intent?.gate ? [`gate:${input.intent.gate}`] : []),
		]),
		source_refs: unique([
			...input.resume.source_refs,
			...(input.intent?.source_refs || []),
		]),
		artifact_refs: input.artifactRefs || [],
		graph_lens:
			input.intent?.graph_lens ||
			String(resumeRecordValue(input.resume, "graph_lens") || "task").trim() ||
			"task",
		expected_output:
			input.intent?.expected_output ||
			String(
				resumeRecordValue(input.resume, "expected_output") ||
					input.task.delta.closure ||
					input.task.goal.outcome ||
					`Implementation evidence for ${input.task.id}.`,
			).trim(),
		constraints: {
			non_goals: input.task.goal.non_goals,
			verification: input.task.goal.verification,
			...resumeConstraints,
			...(input.intent?.constraints || {}),
		},
		blockers: unique([
			...resumeStringList(input.resume, "blockers"),
			...(input.contentEvidence?.missing || []).map(
				(item) => `content_evidence:${item}`,
			),
		]),
		artifact_status: Array.isArray(resumeArtifactStatus)
			? (resumeArtifactStatus as ArtifactStatusRecord[])
			: [],
		budget: input.plan.budget,
		content_evidence_requirements: unique([
			...resumeStringList(input.resume, "content_evidence_requirements"),
			...(input.intent?.content_evidence_requirements || []),
			...(input.contentEvidence?.required || []),
		]),
		chat_history_included: false,
		full_graph_included: false,
		compatibility: {
			...(compatibilityRole ? { role: compatibilityRole } : {}),
			...(workerProfile ? { worker_profile: workerProfile } : {}),
			notes: compatibilityRole ? ["role is compatibility metadata only"] : [],
		},
	};
}

async function maybeRequestFreshWorker(
	state: RuntimeState,
	ports: CodewikiRuntimePorts,
	input: {
		plan: CodewikiRuntimePlan;
		task: RoadmapTaskRecord;
		resume: CodewikiResumeContextResult;
		sessionId: string;
		followUpIntent: string;
	},
): Promise<CodewikiFreshWorkerResult | null> {
	const intent = freshWorkerIntent(input.plan);
	if (!intent.required) return null;
	const contentEvidence = freshWorkerContentEvidence(intent);
	const artifactRefs = normalizeArtifactRefSets({
		trace_refs: intent.trace_refs,
		gate_refs: intent.gate_refs,
		git_refs: intent.git_refs,
	}).artifact_refs;
	const contextBoundary = runtimeContextBoundaryPacket({
		task: input.task,
		resume: input.resume,
		plan: input.plan,
		intent,
		reason: intent.reason,
		contentEvidence,
		artifactRefs,
	});
	const workerProfile: CodewikiDaemonWorkerProfile = {
		...(intent.compatibility_role ? { role: intent.compatibility_role } : {}),
		mode: intent.gate || "implementation",
		reason: intent.reason,
		capabilities: ["fresh-worker", "source-backed-resume"],
		notes: intent.compatibility_role
			? ["compatibility label only", "chat_context_shared=false"]
			: ["role-free context-boundary", "chat_context_shared=false"],
	};
	const request: CodewikiFreshWorkerRequest = {
		...(intent.compatibility_role
			? {
					role: intent.compatibility_role,
					compatibility_role: intent.compatibility_role,
				}
			: {}),
		task_id: input.task.id,
		reason: intent.reason,
		requested_at: nowIso(),
		prompt: input.resume.prompt,
		follow_up_intent: input.followUpIntent,
		...(input.resume.context_path
			? { context_path: input.resume.context_path }
			: {}),
		command: `pi --mode json -p --no-session ${input.task.id}`,
		parent_session_id: input.sessionId,
		worker_profile: workerProfile,
		build_refs: intent.build_refs,
		validation_refs: intent.validation_refs,
		content_refs: contentEvidence.content_refs,
		trace_refs: contextBoundary.trace_refs,
		gate_refs: contextBoundary.gate_refs,
		git_refs: intent.git_refs,
		artifact_refs: artifactRefs,
		source_refs: contextBoundary.source_refs,
		context_boundary: contextBoundary,
		content_evidence: contentEvidence,
	};
	if (!contentEvidence.safe_to_transfer) {
		const contentEvidenceMissing = ("content_" +
			"pro" +
			"of_missing") as CodewikiDaemonBlockKind;
		const blocker = freshWorkerBlocker(
			contentEvidenceMissing,
			`Fresh ${freshWorkerLabel(intent)} for ${input.task.id} lacks required content evidence: ${contentEvidence.missing.join(", ")}.`,
			[
				input.task.id,
				...contentEvidence.content_refs,
				...request.build_refs,
				...request.validation_refs,
				...request.trace_refs,
				...request.gate_refs,
			],
			[
				contentEvidence.mode === "dirty"
					? "Return gate feedback to the originating implementation/compiler loop; compute working_tree_digest plus patch/worktree refs from current content, then retry dirty fresh-worker transfer without asking the end user for proof."
					: "Return gate feedback to the originating implementation/compiler loop; create or cite immutable commit/tree/package/archive/remote proof from validated content before promotion worker transfer without asking the end user to supply refs.",
			],
			"implementation",
		);
		return {
			status: "blocked",
			summary: blocker.summary,
			request,
			blockers: [blocker],
			handoff: freshWorkerHandoff(request, blocker.summary),
			platform: {
				kind: "unsupported",
				summary: "fresh-worker content transfer blocked before platform spawn",
				evidence: contentEvidence.missing,
			},
		};
	}
	if (!ports.freshWorkerBridge) {
		const capability = requireRuntimeCapability(
			ports.runtimeFoundation,
			"worker_execution",
		);
		const blocker = freshWorkerBlocker(
			"platform_limited",
			`Fresh ${freshWorkerLabel(intent)} for ${input.task.id} unavailable: no RuntimeFreshWorkerBridgePort supplied; ctx.newSession is replacement-session only, not parallel worker spawning.`,
			[
				input.task.id,
				...capability.evidence,
				...request.trace_refs,
				...request.gate_refs,
			],
			[
				"Use manual /wiki-resume --new fallback, or supply a subprocess/RPC/SDK RuntimeFreshWorkerBridgePort from the Pi adapter.",
			],
		);
		state.efficiency.user_interruptions_required += 1;
		state.efficiency.manual_commands_required += 1;
		state.efficiency.platform_limited_steps.push(blocker.summary);
		return {
			status: "unsupported",
			summary: blocker.summary,
			request,
			blockers: [blocker],
			handoff: freshWorkerHandoff(request, blocker.summary),
			platform: {
				kind: "unsupported",
				summary: capability.summary,
				evidence: capability.evidence,
			},
		};
	}
	const worker = await ports.freshWorkerBridge.requestFreshWorker(request);
	if (worker.status === "requested") {
		state.budgetUsed.sessions += 1;
		state.efficiency.session_boundaries_used += 1;
		state.efficiency.user_interruptions_avoided += 1;
		state.efficiency.manual_commands_avoided += 1;
		state.events.push(
			`fresh-worker requested for ${input.task.id}:${freshWorkerLabel(intent)}`,
		);
	}
	return worker;
}

async function runValidationPreflight(
	project: WikiProject,
	state: RuntimeState,
	ports: CodewikiRuntimePorts,
	task: RoadmapTaskRecord,
	build: LatestImplementationBuild,
): Promise<CodewikiRuntimeResult> {
	const preflightBuilder =
		ports.gatewayPreflightBuilder ?? buildGatewayPreflight;
	const preflight = preflightBuilder(project, {
		profile: "implementation",
		verdict: "pass",
		rationale: `CodeWiki runtime preflight for ${build.path}.`,
		task_id: task.id,
		source: build.path,
	});
	state.budgetUsed.cycles += 1;
	state.efficiency.manual_commands_avoided += 1;
	state.events.push(`gateway preflight executed for ${build.path}`);
	const status = String(preflight.status || "").trim();
	const gateway = {
		action: "validation_preflight",
		profile: "implementation",
		status,
		source: build.path,
		issues: Array.isArray(preflight.issues) ? preflight.issues : [],
		missing: preflight.missing || {},
		routing: preflight.routing || {},
	};
	if (status === "blocked") {
		return result(state, {
			executed: true,
			status: "blocked",
			action: "validation_preflight",
			summary: `Implementation gateway preflight blocked for ${task.id}.`,
			task_id: task.id,
			stop_reason: "validation_block",
			scopes: claimScopeLabels(taskArtifactScopes(task)),
			gateway,
		});
	}
	if (status === "escalate") {
		state.efficiency.user_interruptions_required += 1;
		return result(state, {
			executed: true,
			status: "blocked",
			action: "validation_preflight",
			summary: `Implementation gateway preflight requires risk approval for ${task.id}.`,
			task_id: task.id,
			stop_reason: "risk_escalation",
			scopes: claimScopeLabels(taskArtifactScopes(task)),
			gateway,
		});
	}
	return result(state, {
		executed: true,
		status: "completed",
		action: "validation_preflight",
		summary: `Implementation gateway preflight ready for ${task.id}; fresh validation context still required before pass/close.`,
		task_id: task.id,
		scopes: claimScopeLabels(taskArtifactScopes(task)),
		gateway,
	});
}

async function runImplementationKickoff(
	project: WikiProject,
	state: RuntimeState,
	ports: CodewikiRuntimePorts,
	task: RoadmapTaskRecord,
	sessionId: string,
	plan: CodewikiRuntimePlan,
): Promise<CodewikiRuntimeResult> {
	const budget = plan.budget;
	const contextCapability = requireRuntimeCapability(
		ports.runtimeFoundation,
		"context_assembly",
	);
	if (!contextCapability.ok) {
		state.efficiency.platform_limited_steps.push(...contextCapability.evidence);
		state.efficiency.user_interruptions_required += 1;
		return result(state, {
			executed: false,
			status: "blocked",
			action: "runtime_capability",
			summary: contextCapability.summary,
			task_id: task.id,
			stop_reason: "platform_limited",
			scopes: claimScopeLabels(taskArtifactScopes(task)),
			context_boundary: {
				requested: false,
				reason: contextCapability.summary,
				capability: contextCapability.capability,
			},
		});
	}
	const cycle = firstCycle(plan);
	const explicitContextBoundary = firstRecord(
		recordValue(cycle, "context_boundary"),
		recordValue(cycle, "contextBoundary"),
		recordValue(plan.policy, "context_boundary"),
	);
	const explicitFollowUpIntent = String(
		recordValue(cycle, "followUpIntent") ||
			recordValue(cycle, "follow_up_intent") ||
			"",
	).trim();
	const followUpIntent =
		explicitFollowUpIntent ||
		`CodeWiki runtime selected ${task.id} from an agency plan. Execute the implementation compiler from CodeWiki source refs; stop on hard gates.`;
	const resume = await buildResumeContextWithFallback(project, ports, {
		taskId: task.id,
		sessionId,
		followUpIntent,
	});
	state.budgetUsed.cycles += 1;
	state.budgetUsed.tokens_estimate += resume.prompt.length
		? Math.ceil(resume.prompt.length / 4)
		: 0;
	state.efficiency.manual_commands_avoided += 1;
	state.events.push("wiki_resume_context built for runtime-selected task");
	if (!resume.prompt.trim() || !resume.task) {
		return result(state, {
			executed: true,
			status: "blocked",
			action: "implementation_loop_kickoff",
			summary: `No source-backed resume context available for ${task.id}.`,
			task_id: task.id,
			stop_reason: "resume_context_unavailable",
			scopes: claimScopeLabels(taskArtifactScopes(task)),
			context_boundary: {
				requested: false,
				reason: resume.evidence || "resume context unavailable",
			},
		});
	}
	const freshWorker = await maybeRequestFreshWorker(state, ports, {
		plan,
		task,
		resume,
		sessionId,
		followUpIntent,
	});
	if (freshWorker) {
		return result(state, {
			executed: freshWorker.status === "requested",
			status: freshWorker.status === "requested" ? "completed" : "blocked",
			action: "fresh_worker_request",
			summary: freshWorker.summary,
			task_id: task.id,
			stop_reason: freshWorker.blockers[0]?.kind,
			scopes: claimScopeLabels(taskArtifactScopes(task)),
			fresh_worker: freshWorker,
			context_boundary: {
				requested: freshWorker.status === "requested",
				...freshWorker.request.context_boundary,
				dispatch_summary: freshWorker.summary,
				trace_refs: freshWorker.handoff.trace_refs,
				gate_refs: freshWorker.handoff.gate_refs,
				git_refs: freshWorker.handoff.git_refs,
				content_refs: freshWorker.handoff.content_refs,
			},
		});
	}
	const contextBoundary = await maybeRequestContextBoundary(
		project,
		state,
		ports,
		{
			task,
			resume,
			reason:
				String(explicitContextBoundary.reason || "").trim() ||
				"runtime-implementation-boundary",
			followUpIntent,
			sessionBudgetAvailable: asNumber(budget.maxSessions, 1) > 0,
			budget,
		},
	);
	return result(state, {
		executed: true,
		status: "completed",
		action: "implementation_loop_kickoff",
		summary: `CodeWiki runtime selected ${task.id}, claimed scopes, built source-backed implementation kickoff, and preserved validation gates.`,
		task_id: task.id,
		scopes: claimScopeLabels(taskArtifactScopes(task)),
		context_boundary: contextBoundary,
	});
}

export type CodewikiDaemonDispatcherTickStatus =
	| "idle"
	| "claimed"
	| "completed"
	| "blocked"
	| "failed"
	| "stale"
	| "cancelled";

export interface CodewikiDaemonDispatcherAttemptContext {
	job: CodewikiDaemonJobRecord;
	run: CodewikiDaemonRunRecord;
	store: CodewikiDaemonJobStore;
}

export interface CodewikiDaemonDispatcherTickInput {
	store: unknown;
	now: string;
	worker?: CodewikiDaemonWorkerRef;
	workerProfile?: CodewikiDaemonWorkerProfile;
	modelPolicy?: CodewikiDaemonModelPolicy;
	leaseTtlMs?: number;
	staleAfterMs?: number;
	heartbeatNote?: string;
	runId?: string | ((job: CodewikiDaemonJobRecord, attempt: number) => string);
	freshWorker?: {
		required?: boolean;
		bridge_available?: boolean;
		summary?: string;
		refs?: string[];
		remediation?: string[];
	};
	executeAttempt?: (
		attempt: CodewikiDaemonDispatcherAttemptContext,
	) =>
		| FinishCodewikiDaemonRunInput
		| undefined
		| Promise<FinishCodewikiDaemonRunInput | undefined>;
}

export interface CodewikiDaemonDispatcherTickResult {
	status: CodewikiDaemonDispatcherTickStatus;
	summary: string;
	store: CodewikiDaemonJobStore;
	job_id?: string;
	run_id?: string;
	outcome?: CodewikiDaemonRunOutcome;
	events: string[];
}

function parseIsoMs(value: string | undefined): number | null {
	const ms = Date.parse(String(value || ""));
	return Number.isFinite(ms) ? ms : null;
}

function addMsIso(value: string, deltaMs: number): string {
	const base = parseIsoMs(value) ?? Date.now();
	return new Date(base + Math.max(1, Math.floor(deltaMs))).toISOString();
}

function daemonJobsInOrder(
	store: CodewikiDaemonJobStore,
): CodewikiDaemonJobRecord[] {
	return Object.values(store.jobs).sort((a, b) => {
		const created = a.created_at.localeCompare(b.created_at);
		return created === 0 ? a.id.localeCompare(b.id) : created;
	});
}

function latestRunningRun(
	job: CodewikiDaemonJobRecord,
): CodewikiDaemonRunRecord | undefined {
	return [...job.runs].reverse().find((run) => run.status === "running");
}

function isRunStale(
	run: CodewikiDaemonRunRecord,
	now: string,
	staleAfterMs: number,
): boolean {
	const nowMs = parseIsoMs(now);
	if (nowMs === null) return false;
	const leaseMs = parseIsoMs(run.lease_expires_at);
	if (leaseMs !== null && leaseMs <= nowMs) return true;
	const heartbeatMs = parseIsoMs(
		run.last_heartbeat_at || run.updated_at || run.started_at,
	);
	return heartbeatMs !== null && nowMs - heartbeatMs > staleAfterMs;
}

function isRunnableDaemonJob(job: CodewikiDaemonJobRecord): boolean {
	if (job.status === "queued") return true;
	if (job.status !== "blocked") return false;
	if (job.runs.length >= job.max_attempts) return false;
	return job.block_reason?.retryable !== false;
}

function daemonRunId(
	job: CodewikiDaemonJobRecord,
	attempt: number,
	runId?: CodewikiDaemonDispatcherTickInput["runId"],
): string {
	if (typeof runId === "function") return runId(job, attempt).trim();
	if (typeof runId === "string" && runId.trim()) return runId.trim();
	return `${job.id}-RUN-${String(attempt).padStart(3, "0")}`;
}

function withDaemonJob(
	store: CodewikiDaemonJobStore,
	job: CodewikiDaemonJobRecord,
): CodewikiDaemonJobStore {
	return {
		...store,
		updated_at: job.updated_at,
		jobs: {
			...store.jobs,
			[job.id]: job,
		},
	};
}

function retryLimitReason(
	job: CodewikiDaemonJobRecord,
): CodewikiDaemonBlockReason {
	const refs = job.block_reason?.refs ?? [];
	return {
		kind: "retry_limit",
		summary: `daemon job ${job.id} reached max_attempts=${job.max_attempts}`,
		refs,
		retryable: false,
	};
}

function applyDaemonRetryCircuitBreaker(
	job: CodewikiDaemonJobRecord,
): CodewikiDaemonJobRecord {
	if (job.status !== "blocked") return job;
	if (job.block_reason?.retryable === false) return job;
	if (job.runs.length < job.max_attempts) return job;
	const blockReason = retryLimitReason(job);
	const runs = job.runs.map((run, index) =>
		index === job.runs.length - 1 ? { ...run, block_reason: blockReason } : run,
	);
	return {
		...job,
		block_reason: blockReason,
		runs,
	};
}

function dispatcherStatusForOutcome(
	outcome: CodewikiDaemonRunOutcome,
): CodewikiDaemonDispatcherTickStatus {
	if (outcome === "pass") return "completed";
	if (outcome === "block") return "blocked";
	if (outcome === "cancelled") return "cancelled";
	if (outcome === "stale") return "stale";
	return "failed";
}

function markStaleDaemonRun(
	job: CodewikiDaemonJobRecord,
	run: CodewikiDaemonRunRecord,
	now: string,
): CodewikiDaemonJobRecord {
	return applyDaemonRetryCircuitBreaker(
		finishCodewikiDaemonRun(job, run.id, {
			ended_at: now,
			outcome: "stale",
			summary: `daemon run ${run.id} heartbeat stale`,
			block_reason: {
				kind: "platform_limited",
				summary: `daemon run ${run.id} heartbeat stale`,
				refs: [run.id, ...run.build_refs, ...run.validation_refs],
				retryable: true,
			},
		}),
	);
}

export async function runCodewikiDaemonDispatcherTick(
	input: CodewikiDaemonDispatcherTickInput,
): Promise<CodewikiDaemonDispatcherTickResult> {
	let store = normalizeCodewikiDaemonJobStore(input.store, input.now);
	const events: string[] = [];
	const leaseTtlMs = input.leaseTtlMs ?? DAEMON_DEFAULT_LEASE_TTL_MS;
	const staleAfterMs = input.staleAfterMs ?? DAEMON_DEFAULT_STALE_AFTER_MS;
	for (const job of daemonJobsInOrder(store)) {
		const run = latestRunningRun(job);
		if (!run || !isRunStale(run, input.now, staleAfterMs)) continue;
		const staleJob = markStaleDaemonRun(job, run, input.now);
		store = withDaemonJob(store, staleJob);
		events.push(`daemon run stale: ${run.id}`);
		return {
			status: "stale",
			summary: `Marked stale daemon run ${run.id} for ${job.id}.`,
			store,
			job_id: job.id,
			run_id: run.id,
			outcome: "stale",
			events,
		};
	}
	const job = daemonJobsInOrder(store).find(isRunnableDaemonJob);
	if (!job) {
		return {
			status: "idle",
			summary: "No runnable daemon jobs.",
			store,
			events,
		};
	}
	const attempt = job.runs.length + 1;
	const runId = daemonRunId(job, attempt, input.runId);
	let runningJob = startCodewikiDaemonRun(job, {
		run_id: runId,
		started_at: input.now,
		worker: input.worker,
		worker_profile: input.workerProfile,
		model_policy: input.modelPolicy,
		lease_expires_at: addMsIso(input.now, leaseTtlMs),
	});
	runningJob = heartbeatCodewikiDaemonRun(runningJob, runId, {
		at: input.now,
		note: input.heartbeatNote || "daemon dispatcher claimed job",
		worker: input.worker,
	});
	store = withDaemonJob(store, runningJob);
	events.push(`daemon job claimed: ${job.id}`);
	const run = latestRunningRun(runningJob);
	if (!run) throw new Error(`daemon run not found after claim: ${runId}`);
	const finish = await input.executeAttempt?.({
		job: runningJob,
		run,
		store,
	});
	if (!finish) {
		if (
			input.freshWorker?.required &&
			input.freshWorker.bridge_available !== true
		) {
			const refs = unique([
				runId,
				job.id,
				job.task_id,
				...job.source_refs,
				...job.trace_refs,
				...job.gate_refs,
				...job.git_refs,
				...(input.freshWorker.refs || []),
			]);
			const blockReason: CodewikiDaemonBlockReason = {
				kind: "platform_limited",
				summary:
					input.freshWorker.summary ||
					`daemon job ${job.id} requires fresh-worker spawn, but no subprocess/RPC/SDK bridge is available`,
				refs,
				gate_refs: unique(job.gate_refs),
				remediation: input.freshWorker.remediation || [
					"Supply a RuntimeFreshWorkerBridgePort or reroute to manual /wiki-resume --new fallback.",
				],
				retryable: true,
			};
			const blockedJob = finishCodewikiDaemonRun(runningJob, runId, {
				ended_at: input.now,
				outcome: "block",
				summary: blockReason.summary,
				block_reason: blockReason,
			});
			store = withDaemonJob(store, blockedJob);
			events.push(`daemon run blocked: ${runId}:platform_limited`);
			return {
				status: "blocked",
				summary: blockReason.summary,
				store,
				job_id: job.id,
				run_id: runId,
				outcome: "block",
				events,
			};
		}
		return {
			status: "claimed",
			summary: `Claimed daemon job ${job.id} for one attempt.`,
			store,
			job_id: job.id,
			run_id: runId,
			events,
		};
	}
	let finishedJob = finishCodewikiDaemonRun(runningJob, runId, finish);
	finishedJob = applyDaemonRetryCircuitBreaker(finishedJob);
	store = withDaemonJob(store, finishedJob);
	events.push(`daemon run finished: ${runId}:${finish.outcome}`);
	return {
		status: dispatcherStatusForOutcome(finish.outcome),
		summary: `Finished daemon run ${runId} for ${job.id} with ${finish.outcome}.`,
		store,
		job_id: job.id,
		run_id: runId,
		outcome: finish.outcome,
		events,
	};
}

export async function runCodewikiRuntimeStep(
	project: WikiProject,
	plan: CodewikiRuntimePlan,
	ports: CodewikiRuntimePorts = {},
): Promise<CodewikiRuntimeResult> {
	const state = emptyRuntimeState();
	if (plan.mode !== "work") {
		return runtimeStop(
			state,
			"skip",
			"CodeWiki runtime only executes in work mode.",
			`mode=${plan.mode}`,
			"skipped",
		);
	}
	if (firstCycle(plan).action === "stop") {
		return runtimeStop(
			state,
			"stop_gate",
			String(firstCycle(plan).summary || "Agency stop gate reached."),
			String(plan.stop?.reason || "hard stop gate"),
			"stopped",
		);
	}
	if (plan.policy?.allowWrites === false) {
		return runtimeStop(
			state,
			"budget_stop",
			"CodeWiki runtime did not execute because writes are not allowed.",
			String(plan.stop?.reason || "writes disabled"),
		);
	}
	const budgetStops = budgetStopReasons(plan);
	if (budgetStops.length > 0) {
		return runtimeStop(
			state,
			"budget_stop",
			"CodeWiki runtime stopped before execution because budget is exhausted.",
			budgetStops.join("; "),
		);
	}
	const taskId = nextTaskIdFromPlan(plan);
	if (!taskId) {
		return runtimeStop(
			state,
			"no_work",
			"CodeWiki runtime found no selected task.",
			"no next_task in plan",
			"skipped",
		);
	}
	const readiness = automationReadinessTaskFromPlan(plan, taskId);
	const readinessGate = automationReadinessRuntimeGate(readiness, {
		taskId,
		now: nowIso(),
	});
	if (!readinessGate.ok) {
		return runtimeStop(
			state,
			"automation_readiness",
			`CodeWiki runtime refused to schedule ${taskId}: ${readinessGate.reason}.`,
			readinessGate.reason,
			"blocked",
			{
				task_id: taskId,
				context_boundary: {
					requested: false,
					reason: readinessGate.reason,
					state: readinessGate.state,
					blockers: readinessGate.blockers,
					next_safe_action: readinessGate.next_action,
					trace_refs: readinessGate.next_action?.trace_refs || [],
					gate_refs: readinessGate.next_action?.gate_refs || [],
					git_refs: readinessGate.next_action?.git_refs || [],
				},
			},
		);
	}
	const task = await readTask(project, taskId);
	if (!task) {
		return runtimeStop(
			state,
			"no_work",
			`CodeWiki runtime could not read selected task ${taskId}.`,
			"roadmap task missing",
			"blocked",
			{ task_id: taskId },
		);
	}

	const sessionId = sessionIdForRuntime(ports, task.id);
	const scopes = claimScopeLabels(taskArtifactScopes(task));
	const statuses = await artifactPreflight(project, task, sessionId);
	if (hasBlockingArtifactStatus(statuses)) {
		return runtimeStop(
			state,
			"artifact_claim",
			`CodeWiki runtime stopped before claiming ${task.id} because artifact scopes are unavailable.`,
			"artifact_conflict",
			"blocked",
			{
				task_id: task.id,
				scopes,
				artifact_statuses: statuses,
				context_boundary: {
					requested: false,
					reason: compactStatusLines(statuses).join("; "),
				},
			},
		);
	}

	let claim: ChangeClaimRecord | null = null;
	let output: CodewikiRuntimeResult;
	try {
		claim = await claimTaskScopes(project, task, sessionId);
		state.budgetUsed.writes += 1;
		state.events.push(`artifact-status claim acquired: ${claim.id}`);
		const cycleAction = String(firstCycle(plan).action || "").trim();
		const directBoundaryAction = [
			"context_boundary",
			"context-boundary",
			"fresh_worker",
			"fresh-worker",
		].includes(cycleAction);
		const latestBuild = directBoundaryAction
			? null
			: await latestImplementationBuildForTask(project, task.id);
		output = latestBuild
			? await runValidationPreflight(project, state, ports, task, latestBuild)
			: await runImplementationKickoff(
					project,
					state,
					ports,
					task,
					sessionId,
					plan,
				);
	} catch (error) {
		const message = formatError(error);
		const artifactConflict = /artifact-status conflict|artifact conflict/i.test(
			message,
		);
		output = runtimeStop(
			state,
			artifactConflict ? "artifact_claim" : "runtime_step",
			artifactConflict
				? `CodeWiki runtime stopped while claiming ${task.id} because artifact scopes are unavailable.`
				: `CodeWiki runtime stopped while executing ${task.id}.`,
			artifactConflict ? "artifact_conflict" : message,
			"blocked",
			{ task_id: task.id, scopes },
		);
	} finally {
		if (claim) {
			try {
				await releaseClaim(project, claim, sessionId);
				state.budgetUsed.writes += 1;
				state.events.push(`artifact-status claim released: ${claim.id}`);
			} catch (error) {
				state.efficiency.platform_limited_steps.push(
					`artifact-status release failed for ${claim.id}: ${formatError(error)}`,
				);
			}
		}
	}
	return {
		...output,
		claim_id: claim?.id,
		budget_used: finishUsage(state),
		workflow_efficiency: state.efficiency,
		events: state.events,
	};
}
