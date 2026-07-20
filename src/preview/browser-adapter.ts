import { spawn } from "node:child_process";

export type PreviewBrowserAdapterKind = "none" | "system" | "playwright";

export interface PreviewBrowserOpenOptions {
	adapter: PreviewBrowserAdapterKind;
	url: string;
	sessionId?: string;
}

export interface PreviewBrowserHandle {
	adapter: PreviewBrowserAdapterKind;
	opened: boolean;
	close(): Promise<void>;
}

export interface PreviewBrowserCommand {
	command: string;
	args: string[];
	detached: boolean;
	waitForExit: boolean;
}

export type PreviewBrowserCliState =
	| "not_required"
	| "not_checked"
	| "checking"
	| "available"
	| "unavailable";

export type PreviewBrowserSessionState =
	| "not_applicable"
	| "not_open"
	| "ready"
	| "failed";

export interface PreviewBrowserCapability {
	cliState: PreviewBrowserCliState;
	sessionState: PreviewBrowserSessionState;
	captureAvailable: boolean;
	reason?: string;
	installHint?: string;
}

export type PreviewBrowserCommandProbe = (
	command: string,
	args: string[],
) => Promise<boolean>;

export function uncheckedPreviewBrowserCapability(
	adapter: PreviewBrowserAdapterKind,
): PreviewBrowserCapability {
	const capability = checkingPreviewBrowserCapability(adapter);
	if (adapter !== "playwright") return capability;
	return {
		...capability,
		cliState: "not_checked",
		reason: "Playwright capability was not checked for this blocked preview.",
	};
}

export function checkingPreviewBrowserCapability(
	adapter: PreviewBrowserAdapterKind,
): PreviewBrowserCapability {
	if (adapter === "none") {
		return {
			cliState: "not_required",
			sessionState: "not_applicable",
			captureAvailable: false,
		};
	}
	if (adapter === "system") {
		return {
			cliState: "not_required",
			sessionState: "not_open",
			captureAvailable: false,
		};
	}
	return {
		cliState: "checking",
		sessionState: "not_open",
		captureAvailable: false,
	};
}

export async function detectPreviewBrowserCapability(
	adapter: PreviewBrowserAdapterKind,
	probe: PreviewBrowserCommandProbe = probeBrowserCommand,
): Promise<PreviewBrowserCapability> {
	const initial = checkingPreviewBrowserCapability(adapter);
	if (adapter !== "playwright") return initial;
	if (await probe("playwright-cli", ["--version"])) {
		return {
			cliState: "available",
			sessionState: "not_open",
			captureAvailable: false,
			reason: "Open preview to verify the browser and enable Capture.",
		};
	}
	return {
		cliState: "unavailable",
		sessionState: "not_open",
		captureAvailable: false,
		reason: "playwright-cli is not available on PATH.",
		installHint:
			"Install explicitly with npm install -g @playwright/cli@latest, run playwright-cli install-browser, then Restart preview.",
	};
}

export function previewBrowserCommand(
	options: PreviewBrowserOpenOptions,
	platform: NodeJS.Platform = process.platform,
): PreviewBrowserCommand | undefined {
	const url = assertLoopbackPreviewUrl(options.url);
	if (options.adapter === "none") return undefined;
	if (options.adapter === "playwright") {
		return {
			command: "playwright-cli",
			args: [
				`-s=${normalizePreviewSessionId(options.sessionId)}`,
				"open",
				url,
				"--headed",
			],
			detached: false,
			waitForExit: true,
		};
	}
	if (platform === "darwin") {
		return { command: "open", args: [url], detached: true, waitForExit: false };
	}
	if (platform === "win32") {
		return {
			command: "cmd",
			args: ["/c", "start", "", url],
			detached: true,
			waitForExit: false,
		};
	}
	return {
		command: "xdg-open",
		args: [url],
		detached: true,
		waitForExit: false,
	};
}

export async function openPreviewBrowser(
	options: PreviewBrowserOpenOptions,
): Promise<PreviewBrowserHandle> {
	const command = previewBrowserCommand(options);
	if (!command) return inertHandle("none", false);
	await runBrowserCommand(command);
	return {
		adapter: options.adapter,
		opened: true,
		close: async () => {
			if (options.adapter !== "playwright") return;
			await runBrowserCommand({
				command: "playwright-cli",
				args: [`-s=${normalizePreviewSessionId(options.sessionId)}`, "close"],
				detached: false,
				waitForExit: true,
			});
		},
	};
}

export function openSystemBrowser(url: string): boolean {
	const command = previewBrowserCommand({ adapter: "system", url });
	if (!command) return false;
	try {
		const child = spawn(command.command, command.args, {
			detached: command.detached,
			stdio: "ignore",
		});
		child.unref();
		return true;
	} catch {
		return false;
	}
}

export function assertLoopbackPreviewUrl(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error("Preview browser URL must be a valid absolute URL.");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("Preview browser URL must use HTTP or HTTPS.");
	}
	if (!isLoopbackHostname(url.hostname)) {
		throw new Error("Preview browser URL must use a loopback hostname.");
	}
	return url.href;
}

export function normalizePreviewSessionId(value?: string): string {
	const sessionId = value?.trim() || "codewiki-preview";
	if (!/^[a-zA-Z0-9._-]{1,80}$/.test(sessionId)) {
		throw new Error(
			"Preview browser session ID must contain only letters, numbers, dot, underscore, or hyphen.",
		);
	}
	return sessionId;
}

function isLoopbackHostname(hostname: string): boolean {
	return (
		hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
	);
}

async function probeBrowserCommand(
	command: string,
	args: string[],
): Promise<boolean> {
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			detached: false,
			env: { ...process.env, CI: "1", NO_UPDATE_NOTIFIER: "1" },
			stdio: "ignore",
		});
		let settled = false;
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			finish(false);
		}, 3_000);
		child.once("error", () => finish(false));
		child.once("exit", (code) => finish(code === 0));

		function finish(available: boolean): void {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(available);
		}
	});
}

async function runBrowserCommand(
	command: PreviewBrowserCommand,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(command.command, command.args, {
			detached: command.detached,
			stdio: "ignore",
		});
		child.once("error", reject);
		if (command.waitForExit) {
			child.once("exit", (code, signal) => {
				if (code === 0) resolve();
				else {
					reject(
						new Error(
							`${command.command} exited with ${signal ? `signal ${signal}` : `code ${code ?? "unknown"}`}.`,
						),
					);
				}
			});
			return;
		}
		child.once("spawn", () => {
			child.unref();
			resolve();
		});
	});
}

function inertHandle(
	adapter: PreviewBrowserAdapterKind,
	opened: boolean,
): PreviewBrowserHandle {
	return { adapter, opened, close: async () => undefined };
}
