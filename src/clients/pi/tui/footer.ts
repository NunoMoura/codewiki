import type {
	ProjectRuntimeGatewayConnector,
	WikiStateSnapshot,
} from "../../../runtime/index.ts";
import {
	closeInProcessCodewikiAppServer,
	startCodewikiAppServer,
} from "../../../server/app/server.ts";
import { findCodewikiProjectRoot } from "../../../project/root.ts";
import {
	resolveCodewikiExtensionIdentity,
	type CodewikiExtensionIdentity,
} from "../identity.ts";
import { closePiPreviewRuntime, piPreviewControl } from "../preview-runtime.ts";
import type {
	CodewikiExtensionApi,
	CodewikiExtensionContext,
} from "../types.ts";

export const CODEWIKI_FOOTER_STATUS_KEY = "codewiki";
const LEGACY_WIDGET_KEYS = ["codewiki-cards"];

export function registerCodewikiFooter(
	pi: CodewikiExtensionApi,
	connectProjectCoordinator = true,
	projectRuntimeConnector?: ProjectRuntimeGatewayConnector,
): void {
	if (typeof pi.on !== "function") return;
	pi.on("session_shutdown", async (_event, ctx) => {
		const projectRoot = await resolveEventProjectRoot(ctx);
		if (projectRoot) {
			await closeInProcessCodewikiAppServer(projectRoot).catch(
				() => undefined,
			);
			await closePiPreviewRuntime(projectRoot).catch(() => undefined);
		}
	});
	pi.on("session_start", async (event, ctx) => {
		const cwd = typeof ctx.cwd === "string" ? ctx.cwd : process.cwd();
		const projectRoot = await resolveEventProjectRoot(ctx);
		const identity = resolveCodewikiExtensionIdentity(
			import.meta.url,
			projectRoot ?? cwd,
		);
		let dashboardLive = false;
		if (projectRoot) {
			dashboardLive = Boolean(
				await startCodewikiAppServer({
					repoRoot: projectRoot,
					open: shouldOpenAutomaticDashboard(event, ctx),
					keepAlive: ctx.mode === "tui",
					inProcess: true,
					persistent: false,
					previewControl: piPreviewControl(projectRoot),
					connectProjectRuntime: connectProjectCoordinator,
					projectRuntimeConnector,
				}).catch(() => undefined),
			);
		}
		clearLegacyCodewikiWidgets(ctx);
		setCodewikiFooterStatus(
			ctx,
			`CodeWiki ${identity.footerLabel} · dashboard ${dashboardLive ? "live · /wiki-dashboard reopen" : "unavailable · /wiki-dashboard retry"}`,
		);
	});
}

export function shouldOpenAutomaticDashboard(
	event: Record<string, unknown>,
	ctx: CodewikiExtensionContext,
): boolean {
	return ctx.mode === "tui" && event.reason === "startup";
}

async function resolveEventProjectRoot(
	ctx: CodewikiExtensionContext,
): Promise<string | undefined> {
	const cwd = typeof ctx.cwd === "string" ? ctx.cwd : process.cwd();
	return await findCodewikiProjectRoot(cwd).catch(() => undefined);
}

export function clearLegacyCodewikiWidgets(
	ctx: CodewikiExtensionContext,
): void {
	for (const key of LEGACY_WIDGET_KEYS) {
		ctx.ui?.setWidget?.(key, undefined);
	}
}

export function setCodewikiFooterStatus(
	ctx: CodewikiExtensionContext,
	status: string,
): void {
	const ui = ctx.ui as
		| ({
				setStatus?: (key: string, value: string | undefined) => void;
		  } & Record<string, unknown>)
		| undefined;
	ui?.setStatus?.(CODEWIKI_FOOTER_STATUS_KEY, status);
}

export function renderCodewikiStateFooterStatus(
	snapshot: WikiStateSnapshot,
	identity?: CodewikiExtensionIdentity,
): string {
	const queue = snapshot.workQueue.summary;
	const closed = snapshot.resume?.closed ? "closed" : "open";
	const prefix = identity ? `CodeWiki ${identity.footerLabel}` : "CodeWiki";
	return `${prefix}: ${snapshot.traceIds.length} trace(s) · ready ${queue.ready} · blocked ${queue.blocked} · ${closed}`;
}
