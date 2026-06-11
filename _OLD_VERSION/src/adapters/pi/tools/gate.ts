import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { executeCodewikiGateTool } from "../../../api/tools.ts";
import { resolveToolProject } from "../../../project/context.ts";
import {
	buildPostGatewayContextRefreshRequest,
	requestCodewikiContextRefresh,
} from "../compaction.ts";
import { codewikiGateToolInputSchema } from "../schemas.ts";
import { currentTaskLink } from "../session.ts";
import { refreshStatusDock } from "../ui/manager.ts";
import { codewikiToolMetadata } from "./surface.ts";

function gatewayParams(params: any): any {
	return params.gateway || params.validation || params.gate || params;
}

export function registerCodewikiGateTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "wiki_gate",
		label: "CodeWiki Gate",
		description:
			"Normal CodeWiki gate workflow tool for linters, gateway preflight, validation reports, and evidence routing.",
		promptSnippet:
			"Use wiki_gate for linter evidence, gateway preflight, validation reports, and linter/test routing.",
		promptGuidelines: [
			"Use this as the normal validation/gate tool after running required linters, tests, or source-contract profiles.",
			"Run linter profiles through the compatibility input field and pass test/linter evidence through checks_run or gateway.checks.",
			"Use action='preflight' before writing validation reports when source refs, linters, or content evidence may be incomplete.",
			"Do not call low-level wiki_audit or wiki_gateway for normal gate work unless expert compatibility behavior is explicitly required.",
		],
		parameters: codewikiGateToolInputSchema,
		...codewikiToolMetadata("wiki_gate"),
		async execute(
			_toolCallId: string,
			params: any,
			_signal: unknown,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const project = await resolveToolProject(
				ctx.cwd,
				params.repoPath,
				"wiki_gate",
			);
			const result = await executeCodewikiGateTool(project, params);
			const gateway = gatewayParams(params);
			const gatewayResult = result.operations.find(
				(operation) => operation.primitive === "wiki_gateway",
			)?.result as any;
			const data = gatewayResult?.result?.data;
			const request = buildPostGatewayContextRefreshRequest({
				profile: gateway.profile,
				verdict: String(data?.verdict || gateway.verdict || ""),
				taskId: gateway.task_id || data?.task_id || null,
				source: gateway.source || data?.source || null,
				validationRef: gatewayResult?.result?.path || null,
			});
			if (request) requestCodewikiContextRefresh(request);
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.summary }],
				details: result,
			};
		},
	} as any);
}
