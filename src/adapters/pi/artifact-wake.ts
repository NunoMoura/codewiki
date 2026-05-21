import { watch, type FSWatcher } from "node:fs";
import { dirname, basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WikiProject } from "../../domain/project/types.ts";
import type { ChangeClaimWaiterRecord } from "../../domain/session/types.ts";
import { claimsFilePath, readChangeClaimsFile, readyWaitersForSession } from "../../application/claims.ts";

const WAKE_ENTRY_TYPE = "codewiki_artifact_wait_wake";

function sessionIdFor(ctx: ExtensionContext): string | null {
	return String(ctx.sessionManager?.getSessionId?.() || "").trim() || null;
}

function notifiedWaiterIds(ctx: ExtensionContext): Set<string> {
	const entries = ctx.sessionManager?.getBranch?.() || ctx.sessionManager?.getEntries?.() || [];
	const ids = new Set<string>();
	for (const entry of entries as any[]) {
		if (entry?.type !== "custom" || entry?.customType !== WAKE_ENTRY_TYPE) continue;
		const id = String(entry?.data?.waiter_id || entry?.data?.waiterId || "").trim();
		if (id) ids.add(id);
	}
	return ids;
}

function wakeMessage(waiters: ChangeClaimWaiterRecord[], project: WikiProject): string {
	const ids = waiters.map((waiter) => waiter.id).join(", ");
	const tasks = Array.from(new Set(waiters.map((waiter) => waiter.task_id).filter(Boolean))).join(", ");
	const scopes = waiters.flatMap((waiter) => waiter.scopes || [])
		.map((scope) => scope.task_id || scope.path || scope.ref || scope.description || scope.layer)
		.filter(Boolean)
		.slice(0, 8)
		.join(", ");
	const actions = Array.from(new Set(waiters.map((waiter) => waiter.next_safe_action).filter(Boolean))).join(" | ");
	return [
		`CodeWiki artifact wait ready: ${ids}.`,
		`Repo: ${project.root}`,
		tasks ? `Task(s): ${tasks}` : "",
		scopes ? `Scopes: ${scopes}` : "",
		actions ? `Next safe action: ${actions}` : "",
		"Run codewiki_artifact_status action=list or mark the ready scopes before resuming work from current CodeWiki state.",
	].filter(Boolean).join("\n");
}

export async function notifyReadyArtifactWaiters(
	pi: Pick<ExtensionAPI, "appendEntry" | "sendUserMessage">,
	project: WikiProject,
	ctx: ExtensionContext,
	notified: Set<string> = notifiedWaiterIds(ctx),
): Promise<ChangeClaimWaiterRecord[]> {
	const sessionId = sessionIdFor(ctx);
	if (!sessionId) return [];
	const file = await readChangeClaimsFile(project);
	const ready = readyWaitersForSession(file, sessionId, notified);
	if (ready.length === 0) return [];
	for (const waiter of ready) {
		notified.add(waiter.id);
		pi.appendEntry(WAKE_ENTRY_TYPE, {
			waiter_id: waiter.id,
			task_id: waiter.task_id,
			ready_at: waiter.ready_at,
			next_safe_action: waiter.next_safe_action,
			blockers: waiter.blockers || [],
			notified_at: new Date().toISOString(),
		});
	}
	ctx.ui.setStatus?.("codewiki-artifact-wake", `ready: ${ready.map((waiter) => waiter.id).join(",")}`);
	pi.sendUserMessage(wakeMessage(ready, project), { deliverAs: "followUp" });
	return ready;
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
	const notified = notifiedWaiterIds(ctx);
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
