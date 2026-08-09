import {
	CODEWIKI_COMMAND_MESSAGE_TYPE,
	renderCodewikiCommandMessage,
} from "./rendering/message-renderers.ts";
import type { CodewikiExtensionApi } from "./types.ts";

export function registerCodewikiMessageRenderers(
	pi: CodewikiExtensionApi,
): void {
	pi.registerMessageRenderer?.(
		CODEWIKI_COMMAND_MESSAGE_TYPE,
		renderCodewikiCommandMessage,
	);
}
