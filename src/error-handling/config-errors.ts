import { CodewikiError } from "./codewiki-error.ts";

export type CodewikiConfigErrorCode =
	| "missing_required"
	| "invalid_value"
	| "invalid_type";

export interface CodewikiConfigErrorInput {
	path: string;
	code?: CodewikiConfigErrorCode;
	message: string;
	value?: unknown;
	data?: Record<string, unknown>;
	cause?: unknown;
}

export class CodewikiConfigError extends CodewikiError {
	readonly path: string;

	constructor(input: CodewikiConfigErrorInput) {
		super({
			domain: "config",
			code: input.code || "invalid_value",
			message: input.message,
			recoverable: true,
			retryable: false,
			suggestedAction: "fix_input",
			refs: [input.path],
			data: {
				path: input.path,
				...(input.value === undefined ? {} : { value: input.value }),
				...(input.data || {}),
			},
			cause: input.cause,
		});
		this.name = "CodewikiConfigError";
		this.path = input.path;
	}
}

export function createCodewikiConfigError(
	input: CodewikiConfigErrorInput,
): CodewikiConfigError {
	return new CodewikiConfigError(input);
}
