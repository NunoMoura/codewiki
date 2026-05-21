import { appendFile, readFile, writeFile } from "node:fs/promises";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WikiProject } from "../../../domain/project/types.ts";
import type { TaskMutationPorts } from "../../../application/task.ts";
import { piSessionPorts, piSessionStore } from "../session.ts";

export function piFileStore() {
	return {
		readJson: async (path: string) => JSON.parse(await readFile(path, "utf8")),
		maybeReadJson: async (path: string) => {
			try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
		},
		writeJson: async (path: string, data: unknown) => writeFile(path, JSON.stringify(data, null, 2), "utf8"),
		appendJsonl: async (path: string, record: unknown) => appendFile(path, JSON.stringify(record) + "\n", "utf8"),
	};
}

export function piRebuildRunner() {
	return {
		run: async (project: WikiProject) => {
			const { runConfiguredOrDefaultRebuild } = await import("../../../application/local/rebuild-runner.ts");
			await runConfiguredOrDefaultRebuild(project);
		},
	};
}

export function piStatePorts(ctx: ExtensionContext) {
	return {
		fileStore: piFileStore(),
		rebuildRunner: piRebuildRunner(),
		sessionStore: piSessionStore(ctx),
	};
}

export function piAgencyPorts(ctx: ExtensionContext) {
	return piStatePorts(ctx);
}

export function piTaskPorts(): TaskMutationPorts {
	return {
		fileStore: piFileStore(),
		rebuildRunner: piRebuildRunner(),
		messageBus: {
			send: (_message: string) => { /* Pi adapter silences task output to caller */ },
		},
	};
}

export function piSessionToolPorts(pi: ExtensionAPI, ctx: ExtensionContext) {
	return piSessionPorts(pi, ctx);
}
