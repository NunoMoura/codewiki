import {
	createDashboardSessionActionControl,
	type DashboardSessionActionControl,
} from "../dashboard/session-actions.ts";
import type {
	CodewikiExtensionApi,
	CodewikiExtensionContext,
} from "./types.ts";

export function createPiDashboardSessionActionControl(
	pi: CodewikiExtensionApi,
	ctx: CodewikiExtensionContext,
	isCurrentSession: () => boolean = () => true,
): DashboardSessionActionControl {
	return createDashboardSessionActionControl({
		bridge: {
			isAvailable: () =>
				isCurrentSession() && typeof pi.sendUserMessage === "function",
			isIdle: () => ctx.isIdle?.() ?? true,
			sendUserMessage: (message, options) => {
				if (!isCurrentSession() || typeof pi.sendUserMessage !== "function") {
					throw new Error("Active Pi session bridge is no longer available.");
				}
				pi.sendUserMessage(message, options);
			},
		},
		unavailableReason:
			"Sprint actions require an active in-process Pi session with sendUserMessage support.",
	});
}
