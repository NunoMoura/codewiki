import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ActiveStatusPanel } from "../../domain/state/types.ts";
import { registerBootstrapFeatures } from "../../bootstrap.ts";
import { codewikiBuildToolInputSchema, codewikiAgencyToolInputSchema, codewikiDiffTableToolInputSchema, codewikiGcToolInputSchema, codewikiSessionToolInputSchema, codewikiTaskToolInputSchema, codewikiValidationReportSchema } from "./schemas.ts";
import { registerAuditCommand } from "./commands/audit.ts";
import { registerConfigCommand } from "./commands/config.ts";
import { registerResumeCommand } from "./commands/resume.ts";
import { registerStatusCommand } from "./commands/status.ts";
import { registerUiCommand } from "./commands/ui.ts";
import { currentTaskLink } from "./session.ts";
import { readRoadmapTask } from "../../application/roadmap.ts";
import { rememberStatusDockProject, resolveStatusDockProject, resolveToolProject } from "../../application/project.ts";
import { executeCodewikiBuildTool } from "../../application/tools/build.ts";
import { executeCodewikiValidationTool } from "../../application/tools/validation.ts";
import { executeCodewikiDiffTableTool } from "../../application/tools/diff-table.ts";
import { executeCodewikiGcTool } from "../../application/tools/gc.ts";
import { executeCodewikiAgency } from "./tools/agency.ts";
import { registerCodewikiArtifactStatusTool } from "./tools/artifact-status.ts";
import { registerCodewikiAuditTool } from "./tools/audit.ts";
import { registerCodewikiResumeContextTool } from "./tools/resume-context.ts";
import { executeCodewikiSession } from "./tools/session.ts";
import { installArtifactWaiterWake } from "./artifact-wake.ts";
import { installCodewikiCompaction, requestCodewikiContextRefresh } from "./compaction.ts";
import { registerCodewikiStateTool } from "./tools/state.ts";
import { executeCodewikiTask } from "./tools/task.ts";
import {
	activeStatusPanelGlobal,
	clearStatusDock,
	openStatusPanel,
	refreshStatusDock,
	setActiveStatusPanelGlobal,
	setTaskSessionStatus,
	withUiErrorHandling,
} from "./ui/manager.ts";

const COMMAND_PREFIX = "wiki";

export function registerPiAdapter(pi: ExtensionAPI): void {
	registerBootstrapFeatures(pi);
	installCodewikiCompaction(pi);
	let activeStatusPanel: ActiveStatusPanel | null = activeStatusPanelGlobal;
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

	pi.registerShortcut("alt+w", {
		description: "Toggle Codewiki status panel",
		handler: async (ctx) => {
			await withUiErrorHandling(ctx, async () => {
				if (activeStatusPanel?.close) {
					activeStatusPanel.close();
					activeStatusPanel = activeStatusPanelGlobal;
					return;
				}
				const resolved = await resolveStatusDockProject(ctx, {
					allowWhenOff: true,
				});
				if (!resolved) {
					ctx.ui.notify(
						`No codewiki project resolved. Use /${COMMAND_PREFIX}-bootstrap first or work inside a repo with .codewiki/config.json.`,
						"warning",
					);
					return;
				}
				await rememberStatusDockProject(resolved.project);
				await refreshStatusDock(
					resolved.project,
					ctx,
					currentTaskLink(ctx),
					resolved,
				);
				const opened = await openStatusPanel(
					pi,
					resolved.project,
					ctx,
					"both",
					currentTaskLink(ctx),
					resolved.source,
					(activeStatusPanelRef) => {
						activeStatusPanel = activeStatusPanelRef;
						setActiveStatusPanelGlobal(activeStatusPanelRef);
					},
				);
				if (!opened) {
					ctx.ui.notify(
						"Custom UI unavailable. Use codewiki_state output or configure Pi UI mode.",
						"warning",
					);
				}
			});
		},
	});

	registerCodewikiStateTool(pi);
	registerCodewikiResumeContextTool(pi);
	registerCodewikiArtifactStatusTool(pi);
	registerCodewikiAuditTool(pi);

	pi.registerTool({
		name: "codewiki_gc",
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
		async execute(_toolCallId: string, params: any, _signal: unknown, _onUpdate: unknown, ctx: any) {
			const project = await resolveToolProject(ctx.cwd, params.repoPath, "codewiki_gc");
			const result = await executeCodewikiGcTool(project, params as any);
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.summary }],
				details: result.result,
			};
		},
	} as any);

	pi.registerTool({
		name: "codewiki_build",
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
		async execute(_toolCallId: string, params: any, _signal: unknown, _onUpdate: unknown, ctx: any) {
			const project = await resolveToolProject(ctx.cwd, params.repoPath, "codewiki_build");
			const result = await executeCodewikiBuildTool(project, params as any);
			requestCodewikiContextRefresh({
				reason: `${params.kind}-build-boundary`,
				taskId: params.task_id || params.task_ids?.[0] || null,
				followUpIntent: `Continue after ${params.kind}_build ${result.result?.path ?? ""}`.trim(),
			});
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.summary }],
				details: result.result,
			};
		},
	} as any);

	pi.registerTool({
		name: "codewiki_validation",
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
			"High-risk tiers such as semantic-system, security/migration/publication, and destructive changes require explicit user approval evidence before lower-layer promotion."
		],
		parameters: codewikiValidationReportSchema,
		async execute(_toolCallId: string, params: any, _signal: unknown, _onUpdate: unknown, ctx: any) {
			const project = await resolveToolProject(ctx.cwd, params.repoPath, "codewiki_validation");
			const result = await executeCodewikiValidationTool(project, params as any);
			requestCodewikiContextRefresh({
				reason: `validation-${params.verdict}`,
				taskId: params.task_id || null,
				followUpIntent: `Continue after ${params.profile} validation ${params.verdict}`,
			});
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.summary }],
				details: result.result,
			};
		},
	} as any);

	pi.registerTool({
		name: "codewiki_task",
		label: "Codewiki Task",
		description:
			"Create, update, close, cancel roadmap tasks, or update sprint metadata through one canonical roadmap mutation tool",
		promptSnippet:
			"Mutate canonical roadmap task truth and sprint metadata through one safe entrypoint",
		promptGuidelines: [
			"Use this for all canonical roadmap task mutation: create tasks, update metadata, append evidence, close work, cancel work, or maintain sprint metadata.",
			"Before creating roadmap work, check active tasks/sprints for related intent; prefer refining existing task metadata, docs, and sprint scope over creating duplicates.",
			"Use action='sprint' with sprint input when accepted intent forms a related executable cohort; never hand-edit roadmap sprint metadata.",
			"Create actions automatically reuse/refine related active tasks when spec paths, code paths, labels, or intent text overlap; pass an explicit taskId/update when you already know the target.",
			"Prefer evidence.result='pass'|'fail'|'block' when advancing lifecycle with structured execution evidence.",
			"Use action='close' or action='cancel' instead of patching status directly when intent is final closure.",
			"Set refresh=false when you need a minimal canonical write and can defer generated graph/status/roadmap view rebuilds.",
		],
		parameters: codewikiTaskToolInputSchema,
		async execute(_toolCallId: string, params: any, _signal: unknown, _onUpdate: unknown, ctx: any) {
			const project = await resolveToolProject(
				ctx.cwd,
				params.repoPath,
				"codewiki_task",
			);
			const result = await executeCodewikiTask(pi, project, ctx, params);
			if (params.action === "close" || params.action === "cancel") {
				requestCodewikiContextRefresh({
					reason: `task-${params.action}`,
					taskId: params.taskId || result.canonical_task_ids?.[0] || null,
					followUpIntent: `Continue after task ${params.action}`,
				});
			}
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.summary }],
				details: result,
			};
		},
	} as any);


	pi.registerTool({
		name: "codewiki_diff_table",
		label: "Codewiki Diff Table",
		description: "Create or update pending decision diff tables before accepted decision builds are compiled.",
		promptSnippet: "Use pending diff tables for interactive decision approval before writing accepted decision builds.",
		parameters: codewikiDiffTableToolInputSchema,
		execute: async (_id: string, params: any, _notify: any, _progress: any, ctx: any) => {
			const project = await resolveToolProject(ctx.cwd, params.repoPath, "codewiki_diff_table");
			const result = await executeCodewikiDiffTableTool(project, params);
			return {
				content: [{ type: "text", text: result.summary }],
				details: result.result,
			};
		},
	} as any);

	pi.registerTool({
		name: "codewiki_session",
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
		async execute(_toolCallId: string, params: any, _signal: unknown, _onUpdate: unknown, ctx: any) {
			const project = await resolveToolProject(
				ctx.cwd,
				params.repoPath,
				"codewiki_session",
			);
			const result = await executeCodewikiSession(pi, project, ctx, params);
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.summary }],
				details: result,
			};
		},
	} as any);

	pi.registerTool({
		name: "codewiki_agency",
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
		async execute(_toolCallId: string, params: any, _signal: unknown, _onUpdate: unknown, ctx: any) {
			const project = await resolveToolProject(
				ctx.cwd,
				params.repoPath,
				"codewiki_agency",
			);
			const result = await executeCodewikiAgency(project, ctx, params);
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.summary }],
				details: result,
			};
		},
	} as any);
}
