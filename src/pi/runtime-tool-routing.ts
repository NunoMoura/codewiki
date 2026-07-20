import { findCodewikiProjectRoot } from "../project/root.ts";
import {
	releaseRuntimeReactor,
	runtimeReactorFor,
} from "../runtime/project-reactors.ts";
import type { RuntimeReaction, RuntimeTrigger } from "../runtime/reactor.ts";
import type { CodewikiExtensionApi } from "./types.ts";

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
 * Keep semantic candidate adapters registered while exposing only the one
 * selected by runtime. Adapter execution returns judgment or evidence to the
 * runtime executor; the agent never invokes loop facades or sees all choices.
 */
export function registerRuntimeToolRouting(pi: CodewikiExtensionApi): void {
	if (
		typeof pi.on !== "function" ||
		typeof pi.getActiveTools !== "function" ||
		typeof pi.setActiveTools !== "function"
	) {
		return;
	}
	const route = async (
		ctx: { cwd?: string },
		trigger: RuntimeTrigger,
	): Promise<void> => {
		const root = ctx.cwd ? await findCodewikiProjectRoot(ctx.cwd) : undefined;
		if (!root) {
			applyReaction(pi, undefined);
			return;
		}
		try {
			applyReaction(pi, await runtimeReactorFor(root).inspect(trigger));
		} catch {
			applyReaction(pi, undefined);
		}
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
	pi.on("session_shutdown", (_event, ctx) => {
		if (!ctx.cwd) {
			releaseRuntimeReactor();
			return;
		}
		void findCodewikiProjectRoot(ctx.cwd).then((root) => {
			releaseRuntimeReactor(root);
		});
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

function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}
