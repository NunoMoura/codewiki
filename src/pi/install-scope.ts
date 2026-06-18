import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { CodewikiExtensionContext } from "./types.ts";

export const NON_PROJECT_INSTALL_OVERRIDE_FIELD = "allowNonProjectInstall";

export const PROJECT_LOCAL_INSTALL_REQUIRED_MESSAGE =
	"CodeWiki mutation requires a project-local Pi package installation. Install in this repository with: pi install -l npm:codewiki";

export const PROJECT_LOCAL_INSTALL_WARNING_MESSAGE =
	"CodeWiki is not loaded from this project's local Pi package install. Read-only commands are allowed, but mutation is disabled until you install in this repository with: pi install -l npm:codewiki";

export interface ProjectLocalInstallGuardInput {
	toolName: string;
	ctx: CodewikiExtensionContext;
	input?: Record<string, unknown>;
	projectRoot?: string;
	moduleUrl: string;
}

export function assertProjectLocalMutationAllowed(
	input: ProjectLocalInstallGuardInput,
): void {
	if (input.input?.[NON_PROJECT_INSTALL_OVERRIDE_FIELD] === true) return;
	if (isProjectLocalCodewikiInstall(input.moduleUrl, input.projectRoot ?? input.ctx.cwd)) {
		return;
	}
	throw new Error(
		`${input.toolName}: ${PROJECT_LOCAL_INSTALL_REQUIRED_MESSAGE}. ` +
			`For controlled tests only, set ${NON_PROJECT_INSTALL_OVERRIDE_FIELD}: true.`,
	);
}

export function stripNonProjectInstallOverride<T extends Record<string, unknown>>(
	input: T,
): T {
	if (!(NON_PROJECT_INSTALL_OVERRIDE_FIELD in input)) return input;
	const cleaned = { ...input };
	delete cleaned[NON_PROJECT_INSTALL_OVERRIDE_FIELD];
	return cleaned as T;
}

export function isProjectLocalCodewikiInstall(
	moduleUrl: string,
	projectRoot: string,
): boolean {
	const modulePath = modulePathFromUrl(moduleUrl);
	const root = withTrailingSeparator(resolve(projectRoot));
	const projectPiRoot = withTrailingSeparator(resolve(projectRoot, ".pi"));
	if (modulePath.startsWith(projectPiRoot)) return true;
	if (isSourceCheckoutPath(modulePath)) return true;
	return modulePath.startsWith(root) && !isNodeModulesPackagePath(modulePath);
}

export function projectLocalInstallWarning(
	moduleUrl: string,
	projectRoot: string | undefined,
): string | undefined {
	if (!projectRoot) return undefined;
	return isProjectLocalCodewikiInstall(moduleUrl, projectRoot)
		? undefined
		: PROJECT_LOCAL_INSTALL_WARNING_MESSAGE;
}

function modulePathFromUrl(moduleUrl: string): string {
	const path = moduleUrl.startsWith("file:") ? fileURLToPath(moduleUrl) : moduleUrl;
	return resolve(path);
}

function isSourceCheckoutPath(modulePath: string): boolean {
	return !isNodeModulesPackagePath(modulePath);
}

function isNodeModulesPackagePath(modulePath: string): boolean {
	return modulePath.includes(`${sep}node_modules${sep}codewiki${sep}`);
}

function withTrailingSeparator(path: string): string {
	return path.endsWith(sep) ? path : `${path}${sep}`;
}
