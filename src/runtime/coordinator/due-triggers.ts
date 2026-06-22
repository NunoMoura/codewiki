import type { TriggerView, TriggersView } from "../../views/types.ts";
import type { RuntimeHeartbeatRequest } from "./types.ts";

export interface RuntimeDueTriggerHeartbeatPlan {
	generatedAt?: string;
	heartbeats: RuntimeHeartbeatRequest[];
	skipped: RuntimeDueTriggerSkip[];
}

export interface RuntimeDueTriggerSkip {
	triggerId: string;
	traceId: string;
	reason: string;
	refs: string[];
}

export function planDueTriggerHeartbeats(
	view: TriggersView,
): RuntimeDueTriggerHeartbeatPlan {
	const heartbeats: RuntimeHeartbeatRequest[] = [];
	const skipped: RuntimeDueTriggerSkip[] = [];
	for (const trigger of view.triggers) {
		if (trigger.status !== "due") continue;
		const heartbeat = dueTriggerHeartbeat(trigger);
		if (heartbeat) heartbeats.push(heartbeat);
		else {
			skipped.push({
				triggerId: trigger.id,
				traceId: trigger.traceId,
				reason: trigger.due?.reason || "missing_due_run",
				refs: [...trigger.refs],
			});
		}
	}
	return { generatedAt: view.generatedAt, heartbeats, skipped };
}

function dueTriggerHeartbeat(
	trigger: TriggerView,
): RuntimeHeartbeatRequest | undefined {
	if (!trigger.due?.runKey) return undefined;
	return {
		source: "schedule",
		intent: "scheduled",
		triggerId: trigger.id,
		traceId: trigger.traceId,
		reason: "scheduled_trigger_due",
		refs: unique([
			trigger.traceId,
			trigger.id,
			trigger.planningRef,
			...trigger.refs,
		]),
		data: {
			runKey: trigger.due.runKey,
			...(trigger.due.traceId ? { traceId: trigger.due.traceId } : {}),
			...(trigger.due.scheduledAt
				? { scheduledAt: trigger.due.scheduledAt }
				: {}),
		},
	};
}

function unique(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
