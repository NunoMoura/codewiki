import type { WikiProject } from "../project/types.ts";
import type { CodewikiValidationReportInput } from "./types.ts";
import { buildGatewayPreflight, writeGatewayReport } from "./report.ts";
import { runRebuild } from "../state/artifacts.ts";

export async function executeCodewikiValidationTool(
	project: WikiProject,
	input: CodewikiValidationReportInput,
) {
	if (input.preflight_only) {
		const preflight = buildGatewayPreflight(project, input);
		return {
			summary: `codewiki gateway preflight: ${preflight.status} (${preflight.issues.length} issues)`,
			result: { preflight },
		};
	}
	const result = await writeGatewayReport(project, input);
	if (input.refresh ?? true) await runRebuild(project);
	const reload = result.data.reload_guidance;
	return {
		summary: [
			`codewiki gateway: wrote ${result.path}`,
			reload?.required ? reload.message : "",
		]
			.filter(Boolean)
			.join("\n"),
		result,
	};
}
