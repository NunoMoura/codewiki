import { watch, type FSWatcher } from "node:fs";
import { dirname, basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WikiProject } from "../../project/types.ts";
import type { ChangeClaimWaiterRecord, ChangeClaimWakeRecord } from "../../session/types.ts";
import {
	claimsFilePath,
	markWakeNotificationsDelivered,
	pendingWakeNotificationsForSession,
	readChangeClaimsFile,
	readyWaitersForSession,
} from "../../session/claims.ts";

const WAKE_ENTRY_TYPE = "codewiki_artifact_wait_wake";

function sessionIdFor(ctx: ExtensionContext): string | null {
	return String(ctx.sessionManager?.getSessionId?.() || "").trim() || null;
}

function notifiedWakeIds(ctx: ExtensionContext): Set<string> {
	const entries = ctx.sessionManager?.getBranch?.() || ctx.sessionManager?.getEntries?.() || [];
	const ids = new Set<string>();
	for (const entry of entries as any[]) {
		if (entry?.type !== "custom" || entry?.customType !== WAKE_ENTRY_TYPE) continue;
		const id = String(entry?.data?.wake_id || entry?.data?.wakeId || entry?.data?.waiter_id || entry?.data?.waiterId || "").trim();
		if (id) ids.add(id);
	}
	return ids;
}

function wakeMessage(wakes: ChangeClaimWakeRecord[], project: WikiProject): string {
	const ids = wakes.map((wake) => `${wake.id}/${wake.waiter_id}`).join(", ");
	const tasks = Array.from(new Set(wakes.map((wake) => wake.task_id).filter(Boolean))).join(", ");
	const scopes = wakes.flatMap((wake) => wake.scopes || [])
		.map((scope) => scope.task_id || scope.path || scope.ref || scope.description || scope.layer)
		.filter(Boolean)
		.slice(0, 8)
		.join(", ");
	const actions = Array.from(new Set(wakes.map((wake) => wake.next_action_intent).filter(Boolean))).join(" | ");
	const sourceRefs = Array.from(new Set(wakes.flatMap((wake) => wake.source_refs || []))).slice(0, 8).join(", ");
	return [
		`CodeWiki artifact wait ready: ${ids}.`,
		`Repo: ${project.root}`,
		tasks ? `Task(s): ${tasks}` : "",
		scopes ? `Scopes: ${scopes}` : "",
		sourceRefs ? `Source refs: ${sourceRefs}` : "",
		actions ? `Next safe action: ${actions}` : "",
		"Resume through codewiki_resume_context, then run codewiki_artifact_status action=list or mark ready scopes before writing. Do not rely on inter-agent chat.",
	].filter(Boolean).join("\n");
}

function legacyWakeFromWaiter(waiter: ChangeClaimWaiterRecord): ChangeClaimWakeRecord {
	const sourceRefs = [
		...(waiter.task_id ? [`.codewiki/roadmap/tasks/${waiter.task_id}/task.json`, `.codewiki/roadmap/tasks/${waiter.task_id}/context.json`] : []),
		...(waiter.build_ref ? [waiter.build_ref] : []),
		".codewiki/session/queue.json",
	];
	const intent = waiter.next_safe_action || "Re-read CodeWiki state and re-mark scopes before writing.";
	return {
		id: `wake:${waiter.id}`,
		waiter_id: waiter.id,
		session_id: waiter.session_id,
		agent_name: waiter.agent_name,
		status: "pending",
		reason: "manual",
		task_id: waiter.task_id,
		build_ref: waiter.build_ref,
		scopes: waiter.scopes,
		source_refs: sourceRefs,
		next_action_intent: intent,
		resume_context: {
			...(waiter.task_id ? { task_id: waiter.task_id } : {}),
			...(waiter.build_ref ? { build_ref: waiter.build_ref } : {}),
			source_refs: sourceRefs,
			follow_up_intent: intent,
		},
		created_at: waiter.ready_at || waiter.updated_at,
		updated_at: waiter.updated_at,
	};
}

export async function notifyReadyArtifactWaiters(
	pi: Pick<ExtensionAPI, "appendEntry" | "sendUserMessage">,
	project: WikiProject,
	ctx: ExtensionContext,
	notified: Set<string> = notifiedWakeIds(ctx),
): Promise<ChangeClaimWakeRecord[]> {
	const sessionId = sessionIdFor(ctx);
	if (!sessionId) return [];
	const file = await readChangeClaimsFile(project);
	let wakes = pendingWakeNotificationsForSession(file, sessionId, notified);
	if (wakes.length === 0) {
		wakes = readyWaitersForSession(file, sessionId, notified).map(legacyWakeFromWaiter);
	}
	if (wakes.length === 0) return [];
	for (const wake of wakes) {
		notified.add(wake.id);
		notified.add(wake.waiter_id);
		pi.appendEntry(WAKE_ENTRY_TYPE, {
			wake_id: wake.id,
			waiter_id: wake.waiter_id,
			task_id: wake.task_id,
			reason: wake.reason,
			source_refs: wake.source_refs,
			resume_context: wake.resume_context,
			next_action_intent: wake.next_action_intent,
			notified_at: new Date().toISOString(),
		});
	}
	await markWakeNotificationsDelivered(project, wakes.filter((wake) => wake.id.startsWith("WAKE-")).map((wake) => wake.id));
	ctx.ui.setStatus?.("codewiki-artifact-wake", `ready: ${wakes.map((wake) => wake.waiter_id).join(",")}`);
	pi.sendUserMessage(wakeMessage(wakes, project), { deliverAs: "followUp" });
	return wakes;
}

export function installArtifactWaiterWake(
	pi: Pick<ExtensionAPI, "appendEntry" | "sendUserMessage">,
	project: WikiProject,
	ctx: ExtensionContext,
): () => void {
	const sessionId = sessionIdFor(ctx);
	if (!sessionId) return () => {};
	const filePath = claimsFilePath(project);
	const fileName = basename(filePath);
	let disposed = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let watcher: FSWatcher | undefined;
	const notified = notifiedWakeIds(ctx);
	const schedule = () => {
		if (disposed) return;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = undefined;
			notifyReadyArtifactWaiters(pi, project, ctx, notified).catch((error) => {
				ctx.ui.setStatus?.("codewiki-artifact-wake", `watch error: ${error instanceof Error ? error.message : String(error)}`);
			});
		}, 100);
	};
	try {
		watcher = watch(dirname(filePath), { persistent: false }, (_event, changedName) => {
			if (!changedName || String(changedName) === fileName) schedule();
		});
	} catch {
		// Queue may not exist yet. The next session_start or turn_start refresh will retry.
	}
	schedule();
	return () => {
		disposed = true;
		if (timer) clearTimeout(timer);
		watcher?.close();
	};
}
