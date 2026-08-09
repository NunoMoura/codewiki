import { findCodewikiProjectRoot } from "../project/root.ts";
import type { RuntimeReaction, RuntimeTrigger } from "../runtime/coordinator/reactor.ts";
import {
	createPiProjectServiceClients,
	type PiProjectServiceClientProvider,
} from "./project-service-client.ts";
import type {
	CodewikiExtensionApi,
	CodewikiExtensionContext,
} from "./types.ts";

const LOOP_TOOL_BY_NAME = {
	decision: "wiki_decide",
	planning: "wiki_plan",
	implementation: "wiki_implement",
} as const;
const RUNTIME_MANAGED_TOOLS = new Set([
	...Object.values(LOOP_TOOL_BY_NAME),
	"wiki_archive",
]);
const REACTION_TOOL_NAMES = new Set([
	"wiki_state",
	"wiki_change",
	...Object.values(LOOP_TOOL_BY_NAME),
]);

/**
 * Prefer coordinator-owned semantic sessions. When optional Pi SDK execution
 * is unavailable, expose only runtime-selected candidate tool as fallback.
 */
export function registerRuntimeToolRouting(
	pi: CodewikiExtensionApi,
	projectServices: PiProjectServiceClientProvider = createPiProjectServiceClients(),
): void {
	if (
		typeof pi.on !== "function" ||
		typeof pi.getActiveTools !== "function" ||
		typeof pi.setActiveTools !== "function"
	) {
		return;
	}
	const route = async (
		ctx: Partial<CodewikiExtensionContext>,
		trigger: RuntimeTrigger,
	): Promise<void> => {
		const root = ctx.cwd ? await findCodewikiProjectRoot(ctx.cwd) : undefined;
		if (!root) {
			applyReaction(pi, undefined);
			return;
		}
		startEventSubscription(root, ctx);
		try {
			const remoteTrigger = {
				kind: trigger.kind,
				...(trigger.refs ? { refs: trigger.refs } : {}),
			};
			const reaction = await projectServices.inspect(root, ctx, remoteTrigger);
			const workerDispatch = projectServices.reconcileWorkers
				? await projectServices
						.reconcileWorkers(root, ctx, remoteTrigger)
						.catch(() => undefined)
				: undefined;
			const implementationSelection =
				reaction.selection?.loop === "implementation"
					? reaction.selection
					: undefined;
			if (
				implementationSelection &&
				workerDispatch?.pendingWorkItemIds.some((workItemId) =>
					implementationSelection.workItemIds.includes(workItemId),
				)
			) {
				applyReaction(pi, undefined);
				return;
			}
			if (
				reaction.selection &&
				(await projectServices.semanticExecution(root, ctx)) === "service"
			) {
				applyReaction(pi, undefined);
				void projectServices
					.react(root, ctx, remoteTrigger)
					.catch(() => undefined);
				return;
			}
			applyReaction(pi, reaction);
		} catch {
			applyReaction(pi, undefined);
		}
	};
	const subscriptions = new Map<
		string,
		{ stopped: boolean; cursor: number; generationId?: string }
	>();
	const startEventSubscription = (
		root: string,
		ctx: Partial<CodewikiExtensionContext>,
	): void => {
		if (subscriptions.has(root)) return;
		const subscription = { stopped: false, cursor: 0 } as {
			stopped: boolean;
			cursor: number;
			generationId?: string;
		};
		subscriptions.set(root, subscription);
		void (async () => {
			while (!subscription.stopped) {
				try {
					const batch = await projectServices.events(
						root,
						ctx,
						subscription.cursor,
						{ maxEvents: 64, waitMs: 2_000 },
					);
					if (subscription.stopped) return;
					const generationChanged =
						subscription.generationId !== undefined &&
						subscription.generationId !== batch.generationId;
					subscription.generationId = batch.generationId;
					if (generationChanged || batch.resetRequired) {
						subscription.cursor = batch.cursor;
						await route(ctx, { kind: "timer_due" });
						continue;
					}
					subscription.cursor = batch.cursor;
					if (
						batch.events.some(
							(event) =>
								event.state === "execution_policy_changed" ||
								((event.state === "job_completed" ||
									event.state === "job_recovered") &&
									!event.idempotencyKey?.startsWith(
										"implementation-worker-release:",
									)),
						)
					) {
						await route(ctx, { kind: "timer_due" });
					}
				} catch {
					if (!subscription.stopped) await delay(100);
				}
			}
		})();
	};

	pi.on("session_start", (_event, ctx) =>
		route(ctx, { kind: "session_started" }),
	);
	pi.on("before_agent_start", (_event, ctx) =>
		route(ctx, { kind: "manual_resume" }),
	);
	pi.on("tool_result", (event, ctx) => {
		const toolName = text(event.toolName);
		if (!REACTION_TOOL_NAMES.has(toolName)) return;
		return route(ctx, {
			kind:
				toolName === "wiki_change"
					? "change_trace_appended"
					: "project_truth_changed",
		});
	});
	pi.on("session_shutdown", async (_event, ctx) => {
		const root = ctx.cwd ? await findCodewikiProjectRoot(ctx.cwd) : undefined;
		if (root) {
			const subscription = subscriptions.get(root);
			if (subscription) subscription.stopped = true;
			subscriptions.delete(root);
		}
		await projectServices.disconnect(root);
	});
}

function applyReaction(
	pi: Pick<CodewikiExtensionApi, "getActiveTools" | "setActiveTools">,
	reaction: RuntimeReaction | undefined,
): void {
	if (!pi.getActiveTools || !pi.setActiveTools) return;
	const selected = reaction?.selection
		? LOOP_TOOL_BY_NAME[reaction.selection.loop]
		: undefined;
	const active = pi
		.getActiveTools()
		.filter((name) => !RUNTIME_MANAGED_TOOLS.has(name));
	if (selected) active.push(selected);
	pi.setActiveTools([...new Set(active)]);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}
