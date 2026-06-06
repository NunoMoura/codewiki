import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { effectiveAgencyPolicy } from "../../agency/types.ts";
import { maybeLoadProject } from "../../project/context.ts";
import type { WikiProject } from "../../project/types.ts";

export const CODEWIKI_SYSTEM_CONTRACT_MARKER = "## CodeWiki system contract";

export function buildCodewikiSystemPromptContract(
	project?: WikiProject | null,
): string {
	const projectLabel = project?.label ? ` for ${project.label}` : "";
	return `${CODEWIKI_SYSTEM_CONTRACT_MARKER}${projectLabel}

This repository has an active CodeWiki contract. Apply these invariants before semantic work:
- Normal agent workflow tools are wiki_state, wiki_decide, wiki_plan, wiki_implement, wiki_gate, and wiki_runtime.
- Use wiki_state for repo status, roadmap focus, graph health, and next action when CodeWiki state may affect the task.
- Treat .codewiki/kb/** as canonical knowledge, .codewiki/roadmap/queue.json as canonical roadmap truth during migration, and source/tests/Git evidence as implementation truth.
- Do not hand-edit generated views such as .codewiki/index_graph.json or .codewiki/roadmap/tasks/**; rebuild them through CodeWiki tools.
- Treat .codewiki/session/** and .codewiki/runtime/** as operational coordination state, not durable product truth.
- Route semantic changes through decision -> planning -> implementation, with gateway pass/fail/block evidence at loop exits; use focused CodeWiki skills for loop details when needed.
- Use wiki_runtime before non-trivial overlapping edits for leases/wait-wake/session focus and release claims when done.
- Use wiki_state, /wiki resume, or CodeWiki source refs instead of chat-history archaeology for continuation; low-level wiki_* primitives are compatibility/expert aliases, not the normal surface.
${renderAgencyPolicyContract(project)}- Keep detailed loop policy in the CodeWiki skills; this prompt is only the small always-on contract.`;
}

function renderAgencyPolicyContract(project?: WikiProject | null): string {
	if (!project) return "";
	const policy = effectiveAgencyPolicy(project.config);
	const budget = project.config.codewiki?.agency?.budgets?.[policy.level] ||
		project.config.codewiki?.agency?.budgets?.default;
	const budgetText = budget
		? `${policy.level} budget: ${Object.entries(budget)
				.filter(([, value]) => value !== undefined)
				.map(([key, value]) => `${key}=${value}`)
				.join(", ")}`
		: `${policy.level} budget: not configured`;
	const reset = policy.context_reset;
	return `- Agency policy from .codewiki/config.json: level: ${policy.level}; approval cadence: ${policy.approval_cadence}; default scope: ${policy.default_scope.kind}${policy.default_scope.id ? `:${policy.default_scope.id}` : ""}; ${budgetText}; context reset: enabled=${reset.enabled}, auto_pickup=${reset.auto_pickup}, strategy=${reset.strategy}, require_source_backed_kickoff=${reset.require_source_backed_kickoff}, require_idle_boundary=${reset.require_idle_boundary}; stop gates: ${policy.stop_gates.join(", ")}.
- Agency continuation must follow config: execute one roadmap task atomically, then continue to next scoped task after task-close when no configured stop gate is active, budget/context bounds remain safe, and approval cadence/agency level still permit continuation.
`;
}

export function appendCodewikiSystemPromptContract(
	systemPrompt: string,
	project?: WikiProject | null,
): string {
	if (systemPrompt.includes(CODEWIKI_SYSTEM_CONTRACT_MARKER))
		return systemPrompt;
	return `${systemPrompt}\n\n${buildCodewikiSystemPromptContract(project)}`;
}

export function installCodewikiPromptContract(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (event: any, ctx: any) => {
		const cwd =
			event?.systemPromptOptions?.cwd ||
			ctx?.cwd ||
			ctx?.workspaceRoot ||
			process.cwd();
		const project = await maybeLoadProject({
			cwd,
			workspaceRoot: ctx?.workspaceRoot,
			ui: ctx?.ui,
		});
		if (!project) return undefined;
		return {
			systemPrompt: appendCodewikiSystemPromptContract(
				String(event?.systemPrompt || ""),
				project,
			),
		};
	});
}
