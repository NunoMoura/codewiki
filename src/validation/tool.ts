import type { WikiProject } from "../project/types.ts";
import type { CodewikiValidationReportInput } from "./types.ts";
import { buildValidationPreflight, writeValidationReport } from "./report.ts";
import { runRebuild } from "../state/artifacts.ts";

export async function executeCodewikiValidationTool(
	project: WikiProject,
	input: CodewikiValidationReportInput,
) {
	if (input.preflight_only) {
		const preflight = buildValidationPreflight(project, input);
		return {
			summary: `codewiki validation preflight: ${preflight.status} (${preflight.issues.length} issues)`,
			result: { preflight },
		};
	}
	const result = await writeValidationReport(project, input);
	if (input.refresh ?? true) await runRebuild(project);
	const reload = result.data.reload_guidance;
	return {
		summary: [
			`codewiki validation: wrote ${result.path}`,
			reload?.required ? reload.message : "",
		]
			.filter(Boolean)
			.join("\n"),
		result,
	};
}
