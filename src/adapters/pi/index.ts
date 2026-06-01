import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerBootstrapFeatures } from "./bootstrap.ts";
import {
	codewikiBuildToolInputSchema,
	codewikiAgencyToolInputSchema,
	codewikiDiffTableToolInputSchema,
	codewikiGcToolInputSchema,
	codewikiSessionToolInputSchema,
	codewikiRoadmapToolInputSchema,
	codewikiValidationReportSchema,
} from "./schemas.ts";
import { registerAuditCommand } from "./commands/audit.ts";
import { registerConfigCommand } from "./commands/config.ts";
import { registerResumeCommand } from "./commands/resume.ts";
import { registerStatusCommand } from "./commands/status.ts";
import { registerUiCommand } from "./commands/ui.ts";
import { currentTaskLink } from "./session.ts";
import { readRoadmapTask } from "../../roadmap/store.ts";
import {
	resolveStatusDockProject,
	resolveToolProject,
} from "../../project/context.ts";
import { executeCodewikiBuildTool } from "../../api/tools.ts";
import { executeCodewikiValidationTool } from "../../api/tools.ts";
import { executeCodewikiDiffTableTool } from "../../api/tools.ts";
import { executeCodewikiGcTool } from "../../api/tools.ts";
import { executeCodewikiAgency } from "./tools/agency.ts";
import { registerCodewikiArtifactStatusTool } from "./tools/artifact-status.ts";
import { registerCodewikiAuditTool } from "./tools/audit.ts";
import { registerCodewikiResumeContextTool } from "./tools/resume-context.ts";
import { executeCodewikiSession } from "./tools/session.ts";
import { installArtifactWaiterWake } from "./artifact-wake.ts";
import { installCodewikiPromptContract } from "./prompt-contract.ts";
import {
	buildPostGatewayContextRefreshRequest,
	installCodewikiCompaction,
	requestCodewikiContextRefresh,
} from "./compaction.ts";
import { registerCodewikiStateTool } from "./tools/state.ts";
import { executeCodewikiRoadmap } from "./tools/task.ts";
import {
	clearStatusDock,
	refreshStatusDock,
	setTaskSessionStatus,
	withUiErrorHandling,
} from "./ui/manager.ts";

interface ProjectToolRegistration {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: unknown;
	execute: (project: any, params: any, ctx: any) => Promise<any>;
	details?: (result: any) => unknown;
	after?: (input: {
		project: any;
		params: any;
		result: any;
		ctx: any;
	}) => Promise<void> | void;
	refreshStatus?: boolean;
}

function registerProjectTool(
	pi: ExtensionAPI,
	registration: ProjectToolRegistration,
): void {
	pi.registerTool({
		name: registration.name,
		label: registration.label,
		description: registration.description,
		promptSnippet: registration.promptSnippet,
		promptGuidelines: registration.promptGuidelines,
		parameters: registration.parameters,
		async execute(
			_toolCallId: string,
			params: any,
			_signal: unknown,
			_onUpdate: unknown,
			ctx: any,
		) {
			const project = await resolveToolProject(
				ctx.cwd,
				params.repoPath,
				registration.name,
			);
			const result = await registration.execute(project, params, ctx);
			await registration.after?.({ project, params, result, ctx });
			if (registration.refreshStatus !== false)
				await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: String(result.summary || "") }],
				details: registration.details ? registration.details(result) : result,
			};
		},
	} as any);
}

function resultPayload(result: any): unknown {
	return result.result;
}

export function registerPiAdapter(pi: ExtensionAPI): void {
	registerBootstrapFeatures(pi);
	installCodewikiCompaction(pi);
	installCodewikiPromptContract(pi);
	let disposeArtifactWake: (() => void) | null = null;

	pi.on("session_shutdown", () => {
		disposeArtifactWake?.();
		disposeArtifactWake = null;
	});

	pi.on("turn_start", async (_event, ctx) => {
		const resolved = await resolveStatusDockProject(ctx);
		if (!resolved) {
			clearStatusDock(ctx);
			return;
		}
		await withUiErrorHandling(ctx, async () => {
			await refreshStatusDock(
				resolved.project,
				ctx,
				currentTaskLink(ctx),
				resolved,
			);
		});
	});

	pi.on("session_start", async (_event, ctx) => {
		disposeArtifactWake?.();
		disposeArtifactWake = null;
		const resolved = await resolveStatusDockProject(ctx);
		if (!resolved) {
			ctx.ui.setStatus("codewiki-focus", undefined);
			clearStatusDock(ctx);
			return;
		}
		disposeArtifactWake = installArtifactWaiterWake(pi, resolved.project, ctx);

		await withUiErrorHandling(ctx, async () => {
			const active = currentTaskLink(ctx);
			if (!active) {
				ctx.ui.setStatus("codewiki-focus", undefined);
				await refreshStatusDock(resolved.project, ctx, active, resolved);
				return;
			}
			const task = await readRoadmapTask(resolved.project, active.taskId);
			if (task) setTaskSessionStatus(ctx, task.id, task.title, active.action);
			await refreshStatusDock(resolved.project, ctx, active, resolved);
		});
	});

	registerAuditCommand(pi);
	registerConfigCommand(pi);
	registerStatusCommand(pi);
	registerUiCommand(pi);
	registerResumeCommand(pi);

	registerCodewikiStateTool(pi);
	registerCodewikiResumeContextTool(pi);
	registerCodewikiArtifactStatusTool(pi);
	registerCodewikiAuditTool(pi);

	registerProjectTool(pi, {
		name: "wiki_gc",
		label: "Codewiki GC",
		description:
			"Dry-run or purge eligible CodeWiki artifacts after archive commit proof and restore-ledger emission.",
		promptSnippet:
			"Run post-commit CodeWiki garbage collection with archive proof and restore ledger.",
		promptGuidelines: [
			"Use after task-close, sprint-close, publication, or roadmap-end commits to keep .codewiki hot state small.",
			"Run action='dry-run' before destructive purge to inspect tracked and runtime candidates.",
			"Tracked purge requires archive_sha and tree_sha for the commit that still contains deleted artifacts; GC writes a restore ledger before deletion.",
			"Do not use GC ledger proof as validation/content proof; fail/block/current-policy reports remain hot until policy permits archival.",
		],
		parameters: codewikiGcToolInputSchema,
		execute: (project, params) => executeCodewikiGcTool(project, params as any),
		details: resultPayload,
	});

	registerProjectTool(pi, {
		name: "wiki_build",
		label: "Codewiki Build",
		description:
			"Create transient compiler build artifacts (decision_build, planning_build, implementation_build) with cycle and lifecycle metadata.",
		promptSnippet:
			"Write accepted compiler handoff builds with lifecycle metadata",
		promptGuidelines: [
			"Use kind='decision' after the user accepts semantic rows and KB changes are mapped; use kind='planning' for roadmap alignment; use kind='implementation' to record test/code/check evidence for a task.",
			"Builds are transient payloads, not long-term truth; canonical truth belongs in knowledge, roadmap, tests, and code.",
			"Build policy records loop_start, validation, and next_loop isolation requirements so downstream loops can start fresh from artifacts instead of chat memory.",
			"Decision builds replace the old split intent/knowledge handoff: record approved rows, row-to-KB mappings, product/system propagation, risks, non-goals, and downstream planning questions.",
		],
		parameters: codewikiBuildToolInputSchema,
		execute: (project, params) =>
			executeCodewikiBuildTool(project, params as any),
		details: resultPayload,
	});

	registerProjectTool(pi, {
		name: "wiki_gateway",
		label: "Codewiki Validation",
		description:
			"Preflight or write a validation report (pass, fail, or block) for a compiler handoff or task close.",
		promptSnippet:
			"Preflight gateway metadata/risk and write validation reports with verdict and rationale",
		promptGuidelines: [
			"Use preflight_only=true before expensive fresh validation to surface missing upstream builds, audits, task ids, content proof, stale refs, close/publication blockers, and risk approval gaps.",
			"Use after running a validation gateway. Passing validation can be transient; fail/block/policy-required reports should persist under .codewiki/validation/.",
			"Profile must match a known validation gateway profile: decision, planning, implementation, task-close, drift-audit, or graph-audit.",
			"Pass reports must cite required audit evidence through audit_refs/audit_reports for the profile.",
			"Implementation profile requires fresh_context=true, clean state, and checked content proof (SHA/tree or working_tree_digest). Task-close/publication/publish/release require clean=true plus immutable commit/tree/package/archive/remote proof.",
			"High-risk tiers such as semantic-system, security/migration/publication, and destructive changes require explicit user approval evidence before lower-layer promotion.",
		],
		parameters: codewikiValidationReportSchema,
		execute: (project, params) =>
			executeCodewikiValidationTool(project, params as any),
		details: resultPayload,
		after: ({ params, result }) => {
			const data = result?.result?.data;
			const request = buildPostGatewayContextRefreshRequest({
				profile: params.profile,
				verdict: String(data?.verdict || params.verdict || ""),
				taskId: params.task_id || data?.task_id || null,
				source: params.source || data?.source || null,
				validationRef: result?.result?.path || null,
			});
			if (request) requestCodewikiContextRefresh(request);
		},
	});

	registerProjectTool(pi, {
		name: "wiki_roadmap",
		label: "Codewiki Roadmap",
		description:
			"Create, update, close, cancel roadmap tasks, or update sprint metadata through one canonical roadmap mutation tool",
		promptSnippet:
			"Mutate canonical roadmap task truth and sprint metadata through one safe entrypoint",
		promptGuidelines: [
			"Use this for all canonical roadmap task mutation: create tasks, update metadata, append evidence, close work, cancel work, or maintain sprint metadata.",
			"Before creating roadmap work, check active tasks/sprints for related intent; prefer refining existing task metadata, docs, and sprint scope over creating duplicates.",
			"Use action='sprint' with sprint input when accepted intent forms a related executable cohort; never hand-edit sprint metadata.",
			"Create actions automatically reuse/refine related active tasks when spec paths, code paths, labels, or intent text overlap; pass an explicit taskId/update when you already know the target.",
			"Prefer evidence.result='pass'|'fail'|'block' when advancing lifecycle with structured execution evidence.",
			"Use action='close' or action='cancel' instead of patching status directly when intent is final closure.",
			"Set refresh=false when you need a minimal canonical write and can defer generated graph/status/roadmap view rebuilds.",
		],
		parameters: codewikiRoadmapToolInputSchema,
		execute: (project, params, ctx) =>
			executeCodewikiRoadmap(pi, project, ctx, params),
		after: ({ params, result }) => {
			if (params.action !== "close" && params.action !== "cancel") return;
			requestCodewikiContextRefresh({
				reason: `task-${params.action}`,
				taskId: params.taskId || result.canonical_task_ids?.[0] || null,
				followUpIntent: `Continue after task ${params.action}`,
			});
		},
	});

	registerProjectTool(pi, {
		name: "wiki_diff_table",
		label: "Codewiki Diff Table",
		description:
			"Create or update pending decision diff tables before accepted decision builds are compiled.",
		promptSnippet:
			"Use pending diff tables for interactive decision approval before writing accepted decision builds.",
		parameters: codewikiDiffTableToolInputSchema,
		execute: (project, params) => executeCodewikiDiffTableTool(project, params),
		details: resultPayload,
		refreshStatus: false,
	});

	registerProjectTool(pi, {
		name: "wiki_session",
		label: "Codewiki Session",
		description:
			"Manage runtime session focus and notes for codewiki without mutating canonical roadmap truth",
		promptSnippet:
			"Manage runtime codewiki session focus and notes separately from canonical roadmap task state",
		promptGuidelines: [
			"Use this when current Pi session focus changes or when you need runtime notes linked to current work.",
			"This tool should not be used to close, cancel, or otherwise mutate canonical roadmap truth.",
		],
		parameters: codewikiSessionToolInputSchema,
		execute: (project, params, ctx) =>
			executeCodewikiSession(pi, project, ctx, params),
	});

	registerProjectTool(pi, {
		name: "wiki_agency",
		label: "Codewiki Agency",
		description:
			"Plan one bounded CodeWiki agency run in observe, maintain, or work mode",
		promptSnippet:
			"Run bounded CodeWiki agency planning without unbounded autonomous edits",
		promptGuidelines: [
			"Use observe for read-only status and next-action selection.",
			"Use maintain for safe generated-view refresh and audit planning under write budget.",
			"Use work only when user intent allows bounded implementation; stop on risk, ambiguity, or budget.",
			"Parent agent remains responsible for any canonical writes, commits, pushes, or version bumps.",
		],
		parameters: codewikiAgencyToolInputSchema,
		execute: (project, params, ctx) =>
			executeCodewikiAgency(project, ctx, params),
	});
}
