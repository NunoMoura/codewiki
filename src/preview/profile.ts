import { createHash } from "node:crypto";
import { createCodewikiConfigError } from "../error-handling/config-errors.ts";
import { assertLoopbackPreviewUrl } from "./browser-adapter.ts";

export type PreviewProfileBrowser = "none" | "system" | "playwright";

export interface PreviewPackageScriptRunner {
	kind: "package_script";
	script: string;
	scriptDigest: string;
}

export interface PreviewProfile {
	id: string;
	runner: PreviewPackageScriptRunner;
	url: string;
	readyPath: string;
	readyTimeoutMs: number;
	browser: PreviewProfileBrowser;
	autoOpen: boolean;
}

export interface WikiPreviewConfig {
	profiles: PreviewProfile[];
}

export interface PartialWikiPreviewConfig {
	profiles?: unknown[];
}

export const DEFAULT_WIKI_PREVIEW_CONFIG: WikiPreviewConfig = { profiles: [] };

export function resolveWikiPreviewConfig(
	input: PartialWikiPreviewConfig | undefined = undefined,
): WikiPreviewConfig {
	const profiles = (input?.profiles || []).map((profile, index) =>
		resolvePreviewProfile(profile, `preview.profiles[${index}]`),
	);
	const ids = new Set<string>();
	for (const profile of profiles) {
		if (ids.has(profile.id)) {
			throw configError(
				"preview.profiles",
				`Preview profile id ${profile.id} is duplicated.`,
				profile.id,
			);
		}
		ids.add(profile.id);
	}
	return { profiles };
}

export function previewProfileDigest(profile: PreviewProfile): string {
	const canonical = {
		id: profile.id,
		runner: {
			kind: profile.runner.kind,
			script: profile.runner.script,
			scriptDigest: profile.runner.scriptDigest,
		},
		url: profile.url,
		readyPath: profile.readyPath,
		readyTimeoutMs: profile.readyTimeoutMs,
		browser: profile.browser,
		autoOpen: profile.autoOpen,
	};
	return `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
}

export function previewProfileById(
	config: WikiPreviewConfig,
	id: string,
): PreviewProfile | undefined {
	return config.profiles.find((profile) => profile.id === id);
}

function resolvePreviewProfile(value: unknown, path: string): PreviewProfile {
	const profile = objectRecord(value, path);
	assertKnownKeys(profile, path, [
		"id",
		"runner",
		"url",
		"readyPath",
		"readyTimeoutMs",
		"browser",
		"autoOpen",
	]);
	const id = identifier(profile.id, `${path}.id`);
	const runner = resolveRunner(profile.runner, `${path}.runner`);
	const url = loopbackUrl(profile.url, `${path}.url`);
	const readyPath = normalizedReadyPath(profile.readyPath, `${path}.readyPath`);
	const readyTimeoutMs = boundedInteger(
		profile.readyTimeoutMs ?? 30_000,
		`${path}.readyTimeoutMs`,
		1_000,
		120_000,
	);
	const browser = previewBrowser(profile.browser, `${path}.browser`);
	const autoOpen = booleanValue(profile.autoOpen, `${path}.autoOpen`, true);
	return { id, runner, url, readyPath, readyTimeoutMs, browser, autoOpen };
}

function resolveRunner(
	value: unknown,
	path: string,
): PreviewPackageScriptRunner {
	const runner = objectRecord(value, path);
	assertKnownKeys(runner, path, ["kind", "script", "scriptDigest"]);
	if (runner.kind !== "package_script") {
		throw configError(
			`${path}.kind`,
			"Preview runner kind must be package_script.",
			runner.kind,
		);
	}
	return {
		kind: "package_script",
		script: identifier(runner.script, `${path}.script`),
		scriptDigest: sha256Digest(runner.scriptDigest, `${path}.scriptDigest`),
	};
}

function loopbackUrl(value: unknown, path: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw configError(path, "Preview profile URL is required.", value);
	}
	let normalized: string;
	try {
		normalized = assertLoopbackPreviewUrl(value.trim());
	} catch (error) {
		throw configError(
			path,
			error instanceof Error ? error.message : String(error),
			value,
		);
	}
	let url: URL;
	try {
		url = new URL(normalized);
	} catch {
		throw configError(path, "Preview profile URL must be valid.", value);
	}
	if (
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.pathname !== "/"
	) {
		throw configError(
			path,
			"Preview profile URL must be a loopback origin without credentials, path, query, or fragment.",
			value,
		);
	}
	return url.origin;
}

function normalizedReadyPath(value: unknown, path: string): string {
	const readyPath =
		typeof value === "string" && value.trim() ? value.trim() : "/";
	if (
		!readyPath.startsWith("/") ||
		readyPath.startsWith("//") ||
		readyPath.length > 240
	) {
		throw configError(
			path,
			"Preview readyPath must be a bounded origin-relative path.",
			value,
		);
	}
	let parsed: URL;
	try {
		parsed = new URL(readyPath, "http://127.0.0.1");
	} catch {
		throw configError(
			path,
			"Preview readyPath must be a valid URL path.",
			value,
		);
	}
	if (parsed.origin !== "http://127.0.0.1" || parsed.hash) {
		throw configError(
			path,
			"Preview readyPath must stay on the preview origin.",
			value,
		);
	}
	return `${parsed.pathname}${parsed.search}`;
}

export function previewPackageScriptDigest(command: string): string {
	return `sha256:${createHash("sha256").update(command).digest("hex")}`;
}

function sha256Digest(value: unknown, path: string): string {
	if (typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value)) {
		return value;
	}
	throw configError(
		path,
		"Preview scriptDigest must be an exact sha256 digest.",
		value,
	);
}

function previewBrowser(value: unknown, path: string): PreviewProfileBrowser {
	const browser = value === undefined ? "system" : value;
	if (browser === "none" || browser === "system" || browser === "playwright") {
		return browser;
	}
	throw configError(
		path,
		"Preview browser must be none, system, or playwright.",
		value,
	);
}

function identifier(value: unknown, path: string): string {
	if (
		typeof value !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(value.trim())
	) {
		throw configError(
			path,
			"Preview identifier must be 1-80 safe identifier characters.",
			value,
		);
	}
	return value.trim();
}

function boundedInteger(
	value: unknown,
	path: string,
	minimum: number,
	maximum: number,
): number {
	if (
		!Number.isInteger(value) ||
		(value as number) < minimum ||
		(value as number) > maximum
	) {
		throw configError(
			path,
			`Preview value must be an integer from ${minimum} to ${maximum}.`,
			value,
		);
	}
	return value as number;
}

function booleanValue(
	value: unknown,
	path: string,
	fallback: boolean,
): boolean {
	if (value === undefined) return fallback;
	if (typeof value === "boolean") return value;
	throw configError(path, "Preview value must be boolean.", value);
}

function objectRecord(value: unknown, path: string): Record<string, unknown> {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	throw configError(path, "Preview value must be an object.", value);
}

function assertKnownKeys(
	value: Record<string, unknown>,
	path: string,
	allowed: readonly string[],
): void {
	for (const key of Object.keys(value)) {
		if (allowed.includes(key)) continue;
		throw configError(
			`${path}.${key}`,
			`${path}.${key} is an unknown config key.`,
			value[key],
		);
	}
}

function configError(path: string, message: string, value: unknown): Error {
	return createCodewikiConfigError({
		path,
		code: "invalid_value",
		message,
		value,
	});
}
