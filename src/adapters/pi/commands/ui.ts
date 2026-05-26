import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveCommandProject } from "../../../project/context.ts";
import { startControlRoomServer, type ControlRoomServerHandle } from "../../../ui/web/control-room.ts";
import { withUiErrorHandling } from "../ui/manager.ts";

const activeControlRooms = new Map<string, ControlRoomServerHandle>();

export interface BrowserOpenCommand {
	command: string;
	args: string[];
}

export interface BrowserOpenResult {
	opened: boolean;
	command?: string;
	error?: string;
}

export function registerUiCommand(pi: ExtensionAPI): void {
	pi.registerCommand("wiki-ui", {
		description: "Start the standalone local CodeWiki UI. Usage: /wiki-ui [repo-path] [port]",
		handler: async (args, ctx) => {
			await withUiErrorHandling(ctx, async () => {
				const parsed = parseUiArgs(args);
				const project = await resolveCommandProject(ctx, parsed.pathArg, "wiki-ui");
				const existing = activeControlRooms.get(project.root);
				if (existing) {
					const opened = await tryOpenUrlInBrowser(existing.url);
					ctx.ui.notify(formatControlRoomLaunchMessage(project.label, existing.url, opened, true), opened.opened ? "info" : "warning");
					return;
				}
				const server = await startControlRoomServer(project, { port: parsed.port });
				activeControlRooms.set(project.root, server);
				const opened = await tryOpenUrlInBrowser(server.url);
				ctx.ui.notify(formatControlRoomLaunchMessage(project.label, server.url, opened, false), opened.opened ? "info" : "warning");
			});
		},
	});
}

export function parseUiArgs(args: string): { pathArg: string | null; port?: number } {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	let port: number | undefined;
	const remaining: string[] = [];
	for (const part of parts) {
		if (/^\d+$/.test(part) && port === undefined) {
			const parsed = Number(part);
			if (parsed > 0 && parsed <= 65535) {
				port = parsed;
				continue;
			}
		}
		remaining.push(part);
	}
	return { pathArg: remaining.join(" ") || null, port };
}

export function buildBrowserOpenCommand(
	url: string,
	platform: NodeJS.Platform = process.platform,
): BrowserOpenCommand | null {
	if (platform === "darwin") return { command: "open", args: [url] };
	if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", url] };
	if (["linux", "freebsd", "openbsd", "netbsd"].includes(platform)) {
		return { command: "xdg-open", args: [url] };
	}
	return null;
}

export async function tryOpenUrlInBrowser(url: string): Promise<BrowserOpenResult> {
	const browserCommand = buildBrowserOpenCommand(url);
	if (!browserCommand) {
		return { opened: false, error: `No browser opener configured for ${process.platform}.` };
	}
	return new Promise<BrowserOpenResult>((resolve) => {
		let settled = false;
		const settle = (result: BrowserOpenResult) => {
			if (settled) return;
			settled = true;
			resolve(result);
		};
		try {
			const child = spawn(browserCommand.command, browserCommand.args, {
				detached: true,
				stdio: "ignore",
				windowsHide: true,
			});
			const commandText = [browserCommand.command, ...browserCommand.args].join(" ");
			child.once("error", (error) => settle({ opened: false, command: commandText, error: error.message }));
			child.once("spawn", () => {
				child.unref();
				settle({ opened: true, command: commandText });
			});
		} catch (error) {
			settle({ opened: false, command: browserCommand.command, error: error instanceof Error ? error.message : String(error) });
		}
	});
}

export function formatControlRoomLaunchMessage(
	projectLabel: string,
	url: string,
	result: BrowserOpenResult,
	alreadyRunning: boolean,
): string {
	const prefix = alreadyRunning ? `${projectLabel} CodeWiki UI already running` : `${projectLabel} CodeWiki UI started`;
	if (result.opened) {
		return `${prefix}; opened browser. URL: ${url}`;
	}
	return `${prefix}; browser open failed${result.error ? ` (${result.error})` : ""}. Open: ${url}`;
}
