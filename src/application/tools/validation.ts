import type { WikiProject } from "../../domain/project/types.ts";
import type { CodewikiValidationReportInput } from "../../domain/validation/types.ts";
import { buildValidationPreflight, writeValidationReport } from "../builds.ts";
import { runRebuild } from "../state-artifacts.ts";

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
	return {
		summary: `codewiki validation: wrote ${result.path}`,
		result,
	};
}
