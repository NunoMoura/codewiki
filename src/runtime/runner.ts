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
import type { AgencyBudget } from "../agency/types.ts";
import type { WikiProject } from "../project/types.ts";
import { readRoadmapFile, resolveRoadmapTask } from "../roadmap/runtime.ts";
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
import { stableAgentName } from "../state/builders.ts";
import {
	buildCodewikiResumeContext,
	taskArtifactScopes,
	type CodewikiResumeContextResult,
} from "../state/resume-context.ts";
import { buildCodewikiResumeKickoff } from "../state/resume-kickoff.ts";
import { buildValidationPreflight } from "../validation/report.ts";
import { formatError, nowIso } from "../shared/utils.ts";
import { effectiveAgencyPolicy } from "../agency/types.ts";
import type { CodewikiRuntimePorts } from "./ports.ts";
import type {
	CodewikiRuntimeBudgetUsage,
	CodewikiRuntimePlan,
	CodewikiRuntimeResult,
	WorkflowEfficiencyEvidence,
} from "./types.ts";

const RUNTIME_CLAIM_TTL_MINUTES = 120;
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
			// Ignore malformed transient builds; validation preflight will catch explicit refs.
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
	},
): Promise<Record<string, unknown>> {
	const policy = effectiveAgencyPolicy(project.config);
	if (!input.resume.prompt.trim()) {
		return {
			requested: false,
			reason: "resume context unavailable",
		};
	}
	const kickoff = buildCodewikiResumeKickoff({
		prompt: input.resume.prompt,
		reason: input.reason,
		generatedAt: nowIso(),
		projectRoot: project.root,
		taskId: input.task.id,
		contextPath: input.resume.context_path,
		sourceRefs: input.resume.source_refs,
		policy,
	});
	const allowedByPolicy =
		policy.context_reset.enabled &&
		policy.context_reset.auto_pickup &&
		policy.context_reset.max_resets_per_run > 0;
	if (!allowedByPolicy) {
		state.efficiency.notes.push(
			"Context boundary not requested because agency context_reset policy disallows auto-pickup.",
		);
		return {
			requested: false,
			reason: "context reset auto-pickup disabled by policy",
			kickoff,
		};
	}
	if (!input.sessionBudgetAvailable) {
		state.efficiency.notes.push(
			"Context boundary not requested because agency session budget is exhausted.",
		);
		return {
			requested: false,
			reason: "session budget exhausted",
			kickoff,
		};
	}
	if (typeof ports.sessionBoundary?.requestContextRefresh !== "function") {
		state.efficiency.user_interruptions_required += 1;
		state.efficiency.manual_commands_required += 1;
		state.efficiency.platform_limited_steps.push(
			"session-boundary request port unavailable; returning source-backed kickoff for adapter/manual continuation",
		);
		return {
			requested: false,
			reason: "adapter session-boundary capability unavailable",
			kickoff,
		};
	}
	await ports.sessionBoundary.requestContextRefresh({
		reason: input.reason,
		taskId: input.task.id,
		followUpIntent: input.followUpIntent,
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
	};
}

async function runValidationPreflight(
	project: WikiProject,
	state: RuntimeState,
	ports: CodewikiRuntimePorts,
	task: RoadmapTaskRecord,
	build: LatestImplementationBuild,
): Promise<CodewikiRuntimeResult> {
	const preflightBuilder =
		ports.validationPreflightBuilder ?? buildValidationPreflight;
	const preflight = preflightBuilder(project, {
		profile: "implementation",
		verdict: "pass",
		rationale: `CodeWiki runtime preflight for ${build.path}.`,
		task_id: task.id,
		source: build.path,
	});
	state.budgetUsed.cycles += 1;
	state.efficiency.manual_commands_avoided += 1;
	state.events.push(`validation preflight executed for ${build.path}`);
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
			summary: `Implementation validation preflight blocked for ${task.id}.`,
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
			summary: `Implementation validation preflight requires risk approval for ${task.id}.`,
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
		summary: `Implementation validation preflight ready for ${task.id}; fresh validation context still required before pass/close.`,
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
	budget: AgencyBudget,
): Promise<CodewikiRuntimeResult> {
	const followUpIntent = `CodeWiki runtime selected ${task.id} from an agency plan. Execute the implementation compiler from CodeWiki source refs; stop on hard gates.`;
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
	state.events.push("codewiki_resume_context built for runtime-selected task");
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
	const contextBoundary = await maybeRequestContextBoundary(
		project,
		state,
		ports,
		{
			task,
			resume,
			reason: "runtime-implementation-boundary",
			followUpIntent,
			sessionBudgetAvailable: asNumber(budget.maxSessions, 1) > 0,
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
		const latestBuild = await latestImplementationBuildForTask(
			project,
			task.id,
		);
		output = latestBuild
			? await runValidationPreflight(project, state, ports, task, latestBuild)
			: await runImplementationKickoff(
					project,
					state,
					ports,
					task,
					sessionId,
					plan.budget,
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
