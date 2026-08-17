import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface InstalledCodewikiIdentity {
	commit: string;
	packageSha256: string;
}

interface InstalledCodewikiHealth {
	status: "current" | "mismatch" | "unmanaged";
	loaded?: InstalledCodewikiIdentity;
	installed?: InstalledCodewikiIdentity;
}

export function captureInstalledCodewikiIdentity(
	moduleUrl: string,
): InstalledCodewikiIdentity | undefined {
	const projectRoot = installedProjectRoot(moduleUrl);
	return projectRoot ? readControllerIdentity(projectRoot) : undefined;
}

export function installedCodewikiHealth(
	loaded: InstalledCodewikiIdentity | undefined,
	projectRoot: string,
): InstalledCodewikiHealth {
	if (!loaded) return { status: "unmanaged" };
	const installed = readControllerIdentity(projectRoot);
	if (!installed) return { status: "unmanaged", loaded };
	return {
		status:
			loaded.commit === installed.commit &&
			loaded.packageSha256 === installed.packageSha256
				? "current"
				: "mismatch",
		loaded,
		installed,
	};
}

export function assertInstalledCodewikiCurrent(
	loaded: InstalledCodewikiIdentity | undefined,
	projectRoot: string,
): void {
	const health = installedCodewikiHealth(loaded, projectRoot);
	if (health.status !== "mismatch") return;
	throw new Error(
		`Installed CodeWiki runtime ${short(health.installed?.commit)} differs from loaded runtime ${short(health.loaded?.commit)}. Fully exit and restart Pi; /reload is not sufficient.`,
	);
}

function installedProjectRoot(moduleUrl: string): string | undefined {
	const modulePath = fileURLToPath(moduleUrl);
	const marker = `${join(".pi", "npm", "node_modules", "@nunomoura", "codewiki")}`;
	const index = modulePath.lastIndexOf(marker);
	if (index < 0) return undefined;
	return resolve(modulePath.slice(0, index));
}

function readControllerIdentity(
	projectRoot: string,
): InstalledCodewikiIdentity | undefined {
	try {
		const value = JSON.parse(
			readFileSync(
				join(projectRoot, ".pi", "codewiki-controller.json"),
				"utf8",
			),
		) as Record<string, unknown>;
		const source = record(value.source);
		const packageValue = record(value.package);
		const commit = text(source?.commit);
		const packageSha256 = text(packageValue?.sha256);
		return commit && packageSha256 ? { commit, packageSha256 } : undefined;
	} catch {
		return undefined;
	}
}

function record(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function short(value: string | undefined): string {
	return value ? value.slice(0, 12) : "unknown";
}
