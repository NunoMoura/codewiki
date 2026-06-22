import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type CodewikiExtensionLoadMode =
	| "project-local package"
	| "local checkout"
	| "non-project package"
	| "local path";

export interface CodewikiExtensionIdentity {
	version: string;
	loadMode: CodewikiExtensionLoadMode;
	sourceLabel: string;
	footerLabel: string;
	entry: string;
	packageRoot: string | undefined;
	loadedFromProject: boolean;
}

export function resolveCodewikiExtensionIdentity(
	moduleUrl: string,
	projectRoot?: string,
): CodewikiExtensionIdentity {
	const modulePath = modulePathFromUrl(moduleUrl);
	const packageRoot = findPackageRoot(modulePath);
	const version = packageRoot ? packageVersion(packageRoot) : "unknown";
	const mode = extensionLoadMode(modulePath, projectRoot);
	return {
		version,
		loadMode: mode,
		sourceLabel: sourceLabel(mode),
		footerLabel: footerLabel(version, mode),
		entry: packageRoot ? relativePath(packageRoot, modulePath) : modulePath,
		packageRoot,
		loadedFromProject:
			mode === "project-local package" || mode === "local checkout",
	};
}

function extensionLoadMode(
	modulePath: string,
	projectRoot?: string,
): CodewikiExtensionLoadMode {
	if (projectRoot) {
		const project = withTrailingSeparator(resolve(projectRoot));
		const projectPi = withTrailingSeparator(resolve(projectRoot, ".pi"));
		if (modulePath.startsWith(projectPi)) return "project-local package";
		if (modulePath.startsWith(project) && !isCodewikiNodeModule(modulePath)) {
			return "local checkout";
		}
	}
	if (isCodewikiNodeModule(modulePath)) return "non-project package";
	return "local path";
}

function sourceLabel(mode: CodewikiExtensionLoadMode): string {
	if (mode === "project-local package") return "project-local Pi package ✓";
	if (mode === "local checkout") return "local checkout ✓";
	if (mode === "non-project package") return "non-project package ⚠";
	return "local path";
}

function footerLabel(version: string, mode: CodewikiExtensionLoadMode): string {
	const shortMode =
		mode === "project-local package"
			? "project-local"
			: mode === "local checkout"
				? "local"
				: mode === "non-project package"
					? "non-project"
					: "path";
	return `${version} ${shortMode}`;
}

function findPackageRoot(modulePath: string): string | undefined {
	let current = dirname(modulePath);
	while (true) {
		if (existsSync(resolve(current, "package.json"))) return current;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function packageVersion(packageRoot: string): string {
	try {
		const packageJson = JSON.parse(
			readFileSync(resolve(packageRoot, "package.json"), "utf8"),
		) as { version?: unknown };
		return typeof packageJson.version === "string"
			? packageJson.version
			: "unknown";
	} catch {
		return "unknown";
	}
}

function modulePathFromUrl(moduleUrl: string): string {
	const path = moduleUrl.startsWith("file:")
		? fileURLToPath(moduleUrl)
		: moduleUrl;
	return resolve(path);
}

function relativePath(from: string, to: string): string {
	const path = relative(from, to);
	return path || ".";
}

function isCodewikiNodeModule(modulePath: string): boolean {
	return modulePath.includes(`${sep}node_modules${sep}codewiki${sep}`);
}

function withTrailingSeparator(path: string): string {
	return path.endsWith(sep) ? path : `${path}${sep}`;
}
