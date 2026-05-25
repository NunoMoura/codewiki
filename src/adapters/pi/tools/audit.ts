import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { WikiProject } from "../../../domain/project/types.ts";
import { executeCodewikiAudit, formatAuditReport } from "../../../audit/tool.ts";
import { resolveToolProject } from "../../../application/project.ts";
import { codewikiAuditToolInputSchema } from "../schemas.ts";
import { currentTaskLink } from "../session.ts";
import { refreshStatusDock } from "../ui/manager.ts";

export async function executeCodewikiAuditTool(project: WikiProject, params: any) {
	const report = await executeCodewikiAudit(project, params);
	return {
		summary: formatAuditReport(report),
		report,
	};
}

export function registerCodewikiAuditTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "codewiki_audit",
		label: "Codewiki Audit",
		description:
			"Run source-owned CodeWiki audit profiles and return machine-readable evidence.",
		promptSnippet:
			"Run full or scoped CodeWiki audits through the shared application API.",
		promptGuidelines: [
			"Use this for deterministic audit evidence before gateways, task close, publication, or architecture changes.",
			"Omit profiles for the default full audit. Select profiles for scoped checks such as file-structure, security, alignment, package, changed, task, or generated-parity.",
			"Audits produce evidence only; validation gateways still decide pass, fail, or block.",
		],
		parameters: codewikiAuditToolInputSchema,
		async execute(_toolCallId: string, params: any, _signal: unknown, _onUpdate: unknown, ctx: any) {
			const project = await resolveToolProject(
				ctx.cwd,
				params.repoPath,
				"codewiki_audit",
			);
			const result = await executeCodewikiAuditTool(project, params);
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.summary }],
				details: result,
			};
		},
	} as any);
}
