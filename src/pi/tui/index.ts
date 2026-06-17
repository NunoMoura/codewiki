export const codewikiTuiRenderersAvailable = true as const;

export {
	CODEWIKI_FOOTER_STATUS_KEY,
	registerCodewikiFooter,
	renderCodewikiStateFooterStatus,
	setCodewikiFooterStatus,
} from "./footer.ts";
export {
	renderBootstrapCommand,
	renderConfigCommand,
	renderExplainCommand,
	renderResumeCommand,
	renderStateCommand,
	type CommandRenderOptions,
	type WikiStateCommandView,
} from "../rendering/command-renderers.ts";
export {
	renderCodewikiToolCall,
	renderCodewikiToolResult,
} from "../rendering/tool-renderers.ts";
