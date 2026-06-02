import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	resolveCommandProject,
	resolveStatusDockProject,
} from "../../../project/context.ts";
import { executeCodewikiAudit, formatAuditReport } from "../../../api/tools.ts";
import type { AuditProfile } from "../../../audit/types.ts";
import { AUDIT_PROFILE_VALUES } from "../../../audit/types.ts";
import { splitCommandArgs } from "../../../shared/utils.ts";
import { currentTaskLink } from "../session.ts";
import { refreshStatusDock, withUiErrorHandling } from "../ui/manager.ts";

interface AuditCommandInput {
	profiles: AuditProfile[];
	layers: string[];
	paths: string[];
	task_id?: string;
	changed?: boolean;
	full?: boolean;
	json?: boolean;
	pathArg: string | null;
}

const AUDIT_PROFILE_SET = new Set<string>(AUDIT_PROFILE_VALUES);

export function parseAuditCommandInput(args: string): AuditCommandInput {
	const tokens = splitCommandArgs(args);
	const profiles: AuditProfile[] = [];
	const layers: string[] = [];
	const paths: string[] = [];
	let task_id: string | undefined;
	let changed = false;
	let full = false;
	let json = false;
	let pathArg: string | null = null;

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		const [flag, inlineValue] = token.split("=", 2);
		const nextValue = () => inlineValue || tokens[++i] || "";
		if (flag === "--json") {
			json = true;
			continue;
		}
		if (flag === "--full") {
			full = true;
			continue;
		}
		if (flag === "--changed") {
			changed = true;
			if (!profiles.includes("changed")) profiles.push("changed");
			continue;
		}
		if (flag === "--task") {
			task_id = nextValue();
			if (!profiles.includes("task")) profiles.push("task");
			continue;
		}
		if (flag === "--layer") {
			layers.push(
				...nextValue()
					.split(",")
					.map((item) => item.trim())
					.filter(Boolean),
			);
			if (!profiles.includes("alignment")) profiles.push("alignment");
			continue;
		}
		if (flag === "--path") {
			paths.push(nextValue());
			continue;
		}
		if (flag.startsWith("--")) {
			const profile = flag.slice(2) as AuditProfile;
			if (AUDIT_PROFILE_SET.has(profile) && !profiles.includes(profile)) {
				profiles.push(profile);
				continue;
			}
		}
		pathArg = token;
	}

	return { profiles, layers, paths, task_id, changed, full, json, pathArg };
}

export function registerAuditCommand(pi: ExtensionAPI): void {
	pi.registerCommand("audit", {
		description:
			"Run CodeWiki linter profiles through the /audit compatibility alias. Usage: /audit [--file-structure|--security|--alignment|--horizontal-alignment|--source-contract|--package|--lexicon|--changed|--task TASK-###|--layer product,system|--json] [repo-path]",
		getArgumentCompletions: (prefix) => {
			const options = [
				"--full",
				"--file-structure",
				"--security",
				"--alignment",
				"--horizontal-alignment",
				"--source-contract",
				"--package",
				"--lexicon",
				"--changed",
				"--task",
				"--layer",
				"--generated-parity",
				"--stale-reference",
				"--json",
			];
			return options
				.filter((item) => item.startsWith(prefix))
				.map((value) => ({ value, label: value }));
		},
		handler: async (args, ctx) => {
			await withUiErrorHandling(ctx, async () => {
				const input = parseAuditCommandInput(args);
				const resolved = input.pathArg
					? {
							project: await resolveCommandProject(ctx, input.pathArg, "audit"),
						}
					: await resolveStatusDockProject(ctx, { allowWhenOff: true });
				const project = resolved?.project;
				if (!project) {
					ctx.ui.notify(
						"No codewiki project resolved. Use /wiki-bootstrap first or pass a repo path.",
						"warning",
					);
					return;
				}
				const report = await executeCodewikiAudit(project, {
					profiles: input.profiles,
					layers: input.layers,
					paths: input.paths,
					task_id: input.task_id,
					changed: input.changed,
					full: input.full,
				});
				await refreshStatusDock(project, ctx, currentTaskLink(ctx));
				ctx.ui.notify(
					input.json
						? JSON.stringify(report, null, 2)
						: formatAuditReport(report),
					report.status === "fail"
						? "error"
						: report.status === "warning"
							? "warning"
							: "info",
				);
			});
		},
	});
}
