import { resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { resolveCommandProject } from "../../../project/context.ts";
import {
	withUiErrorHandling,
	refreshStatusDock,
	queueAudit,
} from "../ui/manager.ts";
import {
	maybeReadRoadmapState,
	maybeReadGraph,
	maybeReadStatusState,
	rebuildAndSummarize,
	runRebuild,
} from "../../../state/artifacts.ts";
import {
	readRoadmapFile,
	updateRoadmapTask,
} from "../../../roadmap/store.ts";
import { isRoadmapTaskToken } from "../../../roadmap/task-id.ts";
import { currentTaskLink, piSessionPorts } from "../session.ts";
import { recordSessionTaskAction } from "../../../session/runtime.ts";
import {
	buildChangeClaimState,
	mutateChangeClaims,
	readChangeClaimsFile,
} from "../../../session/claims.ts";
import { stableAgentName } from "../../../state/builders.ts";
import {
	splitCommandArgs,
	joinCommandArgs,
	nowIso,
} from "../../../shared/utils.ts";
import { statusColor, statusLevel } from "../ui/theme.ts";
import { buildResumeContextForTask } from "../../../state/resume-context.ts";
import {
	describeResumeSelection,
	markResumeArtifactsInUse,
	resolveImplementationTask,
	type ResumeSelection,
} from "../../../state/resume-selection.ts";
import { buildCodewikiResumeKickoff } from "../compaction.ts";
import { effectiveAgencyPolicy } from "../../../agency/types.ts";
import { roadmapImplementationReadiness } from "../../../build/shared.ts";
import type { WikiProject } from "../../../project/types.ts";
import type {
	RoadmapTaskRecord,
	RoadmapStatus,
} from "../../../roadmap/types.ts";
import type {
	TaskSessionLinkRecord,
	TaskSessionAction,
} from "../../../session/types.ts";

/**
 * Register the wiki-resume command.
 */
export function registerResumeCommand(pi: ExtensionAPI): void {
	pi.registerCommand(`wiki-resume`, {
		description:
			"Resume roadmap work from current task focus or next open task. Usage: /wiki-resume [--new] [TASK-###] [repo-path] [-- follow-up intent]",
		handler: async (args, ctx) => {
			await withUiErrorHandling(ctx, async () => {
				await runResumeCommand(pi, "wiki-resume", args, ctx);
			});
		},
	});
}

async function runResumeCommand(
	pi: ExtensionAPI,
	commandName: "wiki-resume",
	args: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const { requestedTaskId, pathArg, followUpIntent, newSession } =
		normalizeCodeArgs(args);
	const project = await resolveCommandProject(ctx, pathArg, commandName);
	const summary = await rebuildAndSummarize(project);
	const graph = await maybeReadGraph(project.graphPath);
	const statusState = await maybeReadStatusState(project.statusStatePath);
	const persistedFocusTaskId = requestedTaskId
		? null
		: String(
				statusState?.resume?.task_id ||
					statusState?.roadmap?.focused_task_id ||
					"",
			).trim() || null;
	const roadmap = await readRoadmapFile(
		resolve(project.root, project.roadmapPath),
	);
	const sessionId =
		String(ctx.sessionManager?.getSessionId?.() || "session-unknown").trim() ||
		"session-unknown";
	const artifactState = buildChangeClaimState(
		await readChangeClaimsFile(project),
	);
	const selection = resolveImplementationTask(
		roadmap,
		currentTaskLink(ctx),
		requestedTaskId,
		persistedFocusTaskId,
		artifactState,
		sessionId,
		roadmapImplementationReadiness(project, roadmap),
	);
	if (!selection.task) {
		ctx.ui.notify(
			`${project.label}: no artifact-available roadmap task for /${commandName}. ${selection.skipped.length > 0 ? `Skipped: ${selection.skipped.slice(0, 3).join("; ")}. ` : ""}Open /wiki-status or use Alt+W if you need a different direction.`,
			"warning",
		);
		await refreshStatusDock(project, ctx, currentTaskLink(ctx));
		return;
	}
	const task = selection.task;
	let resumedTask = task;
	const desiredStatus: RoadmapStatus =
		task.status === "todo" || task.status === "blocked"
			? "in_progress"
			: task.status;
	if (desiredStatus !== task.status) {
		resumedTask = (
			await updateRoadmapTask(project, {
				taskId: task.id,
				status: desiredStatus,
			})
		).task;
	}
	const selectionReason = describeResumeSelection(
		requestedTaskId,
		resumedTask,
		selection,
	);
	const action: TaskSessionAction = "progress";
	const sessionSummary = `Resumed roadmap work on ${resumedTask.id} through /${commandName}.`;
	if (newSession) {
		ctx.ui.notify(
			`${project.label}: starting fresh session ${resumedTask.status} for ${resumedTask.id} — ${resumedTask.title}. ${selectionReason} Deterministic preflight is ${statusColor(summary.report)}.`,
			statusLevel(summary.report),
		);
		await startFreshResumeSession(pi, ctx, {
			project,
			resumedTask,
			selection,
			report: summary.report,
			fallbackGraph: graph,
			followUpIntent,
			action,
			sessionSummary,
		});
		return;
	}
	await recordSessionTaskAction(
		project,
		{
			taskId: resumedTask.id,
			action,
			summary: sessionSummary,
			setSessionName: false,
		},
		piSessionPorts(pi, ctx),
	);
	const usageSummary = await markResumeArtifactsInUse(
		project,
		resumedTask,
		sessionId,
	);
	const activeLink: TaskSessionLinkRecord = resumeActiveLink(
		resumedTask.id,
		action,
		sessionSummary,
	);
	await runRebuild(project);
	const refreshedRoadmapState = await maybeReadRoadmapState(
		project.roadmapStatePath,
	);
	const refreshedGraph = (await maybeReadGraph(project.graphPath)) ?? graph;
	const resumeContext = await buildResumeContextForTask(project, {
		task: resumedTask,
		selection,
		report: summary.report,
		roadmapState: refreshedRoadmapState,
		graph: refreshedGraph,
		followUpIntent,
		usageSummary,
	});
	ctx.ui.notify(
		`${project.label}: queued ${resumedTask.status} for ${resumedTask.id} — ${resumedTask.title}. ${selectionReason} ${usageSummary} Deterministic preflight is ${statusColor(summary.report)}.`,
		statusLevel(summary.report),
	);
	await refreshStatusDock(project, ctx, activeLink);
	await queueAudit(pi, ctx, resumeContext.prompt);
}

async function startFreshResumeSession(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	input: {
		project: WikiProject;
		resumedTask: RoadmapTaskRecord;
		selection: ResumeSelection;
		report: any;
		fallbackGraph: any;
		followUpIntent: string;
		action: TaskSessionAction;
		sessionSummary: string;
	},
): Promise<void> {
	if (typeof ctx.newSession !== "function") {
		ctx.ui.notify(
			"Fresh CodeWiki session unavailable in this adapter context; queued resume packet in current session without claiming old-session artifacts.",
			"warning",
		);
		const fallbackContext = await buildResumeContextForTask(input.project, {
			task: input.resumedTask,
			selection: input.selection,
			report: input.report,
			roadmapState: await maybeReadRoadmapState(input.project.roadmapStatePath),
			graph:
				(await maybeReadGraph(input.project.graphPath)) ?? input.fallbackGraph,
			followUpIntent: input.followUpIntent,
			usageSummary:
				"fresh session unavailable; no old-session artifact claim marked",
		});
		await queueAudit(pi, ctx, fallbackContext.prompt);
		return;
	}
	const parentSession = ctx.sessionManager?.getSessionFile?.();
	const oldSessionId = String(
		ctx.sessionManager?.getSessionId?.() || "",
	).trim();
	if (oldSessionId) {
		await mutateChangeClaims(
			input.project,
			{
				action: "release",
				summary: `Transfer resume context for ${input.resumedTask.id} into a fresh replacement session.`,
			},
			{ sessionId: oldSessionId, agentName: stableAgentName(oldSessionId) },
		);
	}
	const result = await ctx.newSession({
		parentSession,
		withSession: async (replacementCtx) => {
			const replacementSessionId =
				String(
					replacementCtx.sessionManager?.getSessionId?.() || "session-unknown",
				).trim() || "session-unknown";
			await recordSessionTaskAction(
				input.project,
				{
					taskId: input.resumedTask.id,
					action: input.action,
					summary: input.sessionSummary,
					setSessionName: false,
				},
				piSessionPorts(pi, replacementCtx),
			);
			const usageSummary = await markResumeArtifactsInUse(
				input.project,
				input.resumedTask,
				replacementSessionId,
			);
			const activeLink = resumeActiveLink(
				input.resumedTask.id,
				input.action,
				input.sessionSummary,
			);
			await runRebuild(input.project);
			const resumeContext = await buildResumeContextForTask(input.project, {
				task: input.resumedTask,
				selection: input.selection,
				report: input.report,
				roadmapState: await maybeReadRoadmapState(
					input.project.roadmapStatePath,
				),
				graph:
					(await maybeReadGraph(input.project.graphPath)) ??
					input.fallbackGraph,
				followUpIntent: input.followUpIntent,
				usageSummary,
			});
			await refreshStatusDock(input.project, replacementCtx, activeLink);
			const kickoff = buildCodewikiResumeKickoff({
				prompt: resumeContext.prompt,
				reason: "fresh-session-resume",
				projectRoot: input.project.root,
				taskId: input.resumedTask.id,
				contextPath: resumeContext.context_path,
				sourceRefs: resumeContext.source_refs,
				policy: effectiveAgencyPolicy(input.project.config),
			});
			if (typeof replacementCtx.sendMessage === "function") {
				await replacementCtx.sendMessage(kickoff, {
					triggerTurn: true,
					deliverAs: "followUp",
				});
			} else {
				await replacementCtx.sendUserMessage(kickoff.content);
			}
		},
	});
	if (result.cancelled) {
		ctx.ui.notify(
			"Fresh CodeWiki session creation cancelled; resume packet was not sent.",
			"warning",
		);
	}
}

function resumeActiveLink(
	taskId: string,
	action: TaskSessionAction,
	summary: string,
): TaskSessionLinkRecord {
	return {
		taskId,
		action,
		summary,
		filesTouched: [],
		spawnedTaskIds: [],
		timestamp: nowIso(),
	};
}

export function normalizeCodeArgs(args: string): {
	requestedTaskId: string | null;
	pathArg: string | null;
	followUpIntent: string;
	newSession: boolean;
} {
	const tokens = splitCommandArgs(args);
	if (tokens.length === 0) {
		return {
			requestedTaskId: null,
			pathArg: null,
			followUpIntent: "",
			newSession: false,
		};
	}

	const delimiterIndex = tokens.indexOf("--");
	const rawCommandTokens =
		delimiterIndex >= 0 ? tokens.slice(0, delimiterIndex) : tokens;
	const explicitIntent =
		delimiterIndex >= 0
			? joinIntentTokens(tokens.slice(delimiterIndex + 1))
			: "";
	const newSession =
		rawCommandTokens.includes("--new") || rawCommandTokens.includes("--fresh");
	const commandTokens = rawCommandTokens.filter(
		(token) => token !== "--new" && token !== "--fresh",
	);
	if (commandTokens.length === 0) {
		return {
			requestedTaskId: null,
			pathArg: null,
			followUpIntent: explicitIntent,
			newSession,
		};
	}

	const first = commandTokens[0];
	const last = commandTokens[commandTokens.length - 1];
	if (isRoadmapTaskToken(first)) {
		const remainderTokens = commandTokens.slice(1);
		const remainder = joinCommandArgs(remainderTokens) ?? "";
		return looksLikePathArg(remainder) || explicitIntent
			? {
					requestedTaskId: first,
					pathArg: remainder || null,
					followUpIntent: explicitIntent,
					newSession,
				}
			: {
					requestedTaskId: first,
					pathArg: null,
					followUpIntent: joinIntentTokens(remainderTokens),
					newSession,
				};
	}
	if (commandTokens.length > 1 && isRoadmapTaskToken(last)) {
		return {
			requestedTaskId: last,
			pathArg: joinCommandArgs(commandTokens.slice(0, -1)) || null,
			followUpIntent: explicitIntent,
			newSession,
		};
	}
	const remainder = joinCommandArgs(commandTokens) ?? "";
	return looksLikePathArg(remainder) || explicitIntent
		? {
				requestedTaskId: null,
				pathArg: remainder || null,
				followUpIntent: explicitIntent,
				newSession,
			}
		: {
				requestedTaskId: null,
				pathArg: null,
				followUpIntent: joinIntentTokens(commandTokens),
				newSession,
			};
}

function joinIntentTokens(tokens: string[]): string {
	return tokens.join(" ").trim();
}

function looksLikePathArg(value: string): boolean {
	const trimmed = value.trim();
	return Boolean(
		trimmed &&
			(trimmed.startsWith(".") ||
				trimmed.startsWith("/") ||
				trimmed.startsWith("~") ||
				/^[A-Za-z]:[\\/]/.test(trimmed) ||
				trimmed.includes("/") ||
				trimmed.includes("\\")),
	);
}
