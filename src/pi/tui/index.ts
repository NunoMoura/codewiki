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
	type CommandRenderOptions,
} from "../rendering/command-renderers.ts";
