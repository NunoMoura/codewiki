import type { WikiStateSnapshot } from "../../api/state.ts";
import {
	resolveCodewikiExtensionIdentity,
	type CodewikiExtensionIdentity,
} from "../identity.ts";
import type {
	CodewikiExtensionApi,
	CodewikiExtensionContext,
} from "../types.ts";

export const CODEWIKI_FOOTER_STATUS_KEY = "codewiki";

export function registerCodewikiFooter(pi: CodewikiExtensionApi): void {
	if (typeof pi.on !== "function") return;
	pi.on("session_start", (_event, ctx) => {
		const projectRoot = typeof ctx.cwd === "string" ? ctx.cwd : undefined;
		const identity = resolveCodewikiExtensionIdentity(
			import.meta.url,
			projectRoot,
		);
		setCodewikiFooterStatus(
			ctx,
			`CodeWiki ${identity.footerLabel} · /wiki-state`,
		);
	});
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
