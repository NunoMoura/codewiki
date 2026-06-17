export type CodewikiToolContent = { type: "text"; text: string };

export interface CodewikiToolResult {
	content: CodewikiToolContent[];
	details: Record<string, unknown>;
}

export interface CodewikiExtensionUi {
	width?: number;
	notify(message: string, level?: "info" | "warning" | "error" | string): void;
	setStatus?(key: string, value: string | undefined): void;
}

export interface CodewikiExtensionContext {
	cwd: string;
	ui?: CodewikiExtensionUi;
}

export type CodewikiToolUpdate = (result: Partial<CodewikiToolResult>) => void;

export type CodewikiToolExecutionMode = "parallel" | "sequential";

export interface CodewikiToolRenderOptions {
	expanded?: boolean;
	isPartial?: boolean;
}

export interface CodewikiRenderComponent {
	render(width: number): string[];
	invalidate(): void;
}

export interface CodewikiToolDefinition {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: unknown;
	executionMode?: CodewikiToolExecutionMode;
	renderCall?: (
		args: unknown,
		theme: unknown,
		context: unknown,
	) => CodewikiRenderComponent;
	renderResult?: (
		result: CodewikiToolResult,
		options: CodewikiToolRenderOptions,
		theme: unknown,
		context: unknown,
	) => CodewikiRenderComponent;
	execute: (
		toolCallId: string,
		params: unknown,
		signal: unknown,
		onUpdate: CodewikiToolUpdate | undefined,
		ctx: CodewikiExtensionContext,
	) => CodewikiToolResult | Promise<CodewikiToolResult>;
}

export interface CodewikiCommandDefinition {
	description: string;
	handler: (
		args: string,
		ctx: CodewikiExtensionContext,
	) => unknown | Promise<unknown>;
}

export type CodewikiExtensionEventHandler = (
	event: Record<string, unknown>,
	ctx: CodewikiExtensionContext,
) => unknown | Promise<unknown>;

export interface CodewikiExtensionApi {
	registerTool(definition: CodewikiToolDefinition): void;
	registerCommand(name: string, definition: CodewikiCommandDefinition): void;
	on?(eventName: string, handler: CodewikiExtensionEventHandler): void;
}
