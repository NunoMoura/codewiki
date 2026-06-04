import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { WikiProject } from "../../../project/types.ts";
import { resolveCommandProject } from "../../../project/context.ts";
import { splitCommandArgs } from "../../../shared/utils.ts";
import {
	readSystemDiagramCatalog,
	renderSystemDiagramDetailLines,
} from "../ui/manager.ts";

function normalizeSelector(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/^\/+|\/+$/g, "")
		.replace(/\.ya?ml$/i, "")
		.replace(/[^a-z0-9_.:-]+/g, "-");
}

function selectedSystemDiagramIndex(
	project: WikiProject,
	selector: string | null,
): number {
	if (!selector) return 0;
	const wanted = normalizeSelector(selector);
	const diagrams = readSystemDiagramCatalog(project);
	const index = diagrams.findIndex((diagram) => {
		const candidates = [
			diagram.kind,
			diagram.slug,
			diagram.id,
			diagram.title,
			diagram.path.split("/").at(-1) ?? diagram.path,
		].map(normalizeSelector);
		return candidates.some(
			(candidate) =>
				candidate === wanted ||
				candidate.includes(wanted) ||
				wanted.includes(candidate),
		);
	});
	return Math.max(0, index);
}

export async function runSystemCommand(
	_pi: ExtensionAPI,
	args: string,
	ctx: any,
	commandName = "wiki system",
): Promise<void> {
	const [selector] = splitCommandArgs(args);
	const project = await resolveCommandProject(ctx, null, commandName);
	const rowIndex = selectedSystemDiagramIndex(project, selector || null);
	const diagram = readSystemDiagramCatalog(project)[rowIndex];
	ctx.ui.notify(
		diagram
			? renderSystemDiagramDetailLines(diagram, 12).join("\n")
			: "No system diagram YAML found under .codewiki/kb/system/diagrams.",
		"info",
	);
}
