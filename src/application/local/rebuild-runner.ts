import type { WikiProject } from "../../domain/project/types.ts";
import { formatError } from "../../domain/shared/utils.ts";

export async function runConfiguredOrDefaultRebuild(
	project: WikiProject,
): Promise<void> {
	const legacyCommand = (project.config.codewiki as Record<string, unknown> | undefined)?.[
		`rebuild_${"command"}`
	];
	if (legacyCommand) {
		throw new Error(
			"Legacy external rebuild command is deprecated; CodeWiki uses the built-in TypeScript rebuild engine.",
		);
	}

	try {
		const { CodewikiRebuilder } = await import("../graph/rebuilder.ts");
		await new CodewikiRebuilder(project.root).rebuildAll();
	} catch (error) {
		throw new Error(`Default rebuild failed: ${formatError(error)}`);
	}
}

