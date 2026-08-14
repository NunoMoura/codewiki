import { createHash } from "node:crypto";
import { createCodewikiConfigError } from "../project/config-errors.ts";

export type PreviewEvidenceViewport = "desktop" | "mobile";

export interface UiPreviewTarget {
	id: string;
	uiRef: string;
	profileId: string;
	route: string;
	viewports: PreviewEvidenceViewport[];
	scenario?: string;
}

export function resolveUiPreviewTarget(
	value: unknown,
	path: string,
): UiPreviewTarget {
	const target = objectRecord(value, path);
	assertKnownKeys(target, path, [
		"id",
		"uiRef",
		"profileId",
		"route",
		"viewports",
		"scenario",
	]);
	const scenario = optionalIdentifier(target.scenario, `${path}.scenario`);
	return {
		id: identifier(target.id, `${path}.id`),
		uiRef: boundedRef(target.uiRef, `${path}.uiRef`),
		profileId: identifier(target.profileId, `${path}.profileId`),
		route: originRelativeRoute(target.route, `${path}.route`),
		viewports: previewViewports(target.viewports, `${path}.viewports`),
		...(scenario ? { scenario } : {}),
	};
}

export function uiPreviewTargetDigest(target: UiPreviewTarget): string {
	const canonical = {
		id: target.id,
		uiRef: target.uiRef,
		profileId: target.profileId,
		route: target.route,
		viewports: [...target.viewports],
		...(target.scenario ? { scenario: target.scenario } : {}),
	};
	return `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
}

export function uiPreviewTargetById(
	targets: UiPreviewTarget[],
	id: string,
): UiPreviewTarget | undefined {
	return targets.find((target) => target.id === id);
}

export function previewTargetUrl(
	origin: string,
	target: UiPreviewTarget,
): string {
	let profileOrigin: URL;
	let url: URL;
	try {
		profileOrigin = new URL(origin);
		url = new URL(target.route, `${origin}/`);
	} catch {
		throw new Error(
			`Preview target ${target.id} has an invalid profile origin.`,
		);
	}
	if (url.origin !== profileOrigin.origin) {
		throw new Error(`Preview target ${target.id} escaped its profile origin.`);
	}
	return url.href;
}

function originRelativeRoute(value: unknown, path: string): string {
	if (
		typeof value !== "string" ||
		!value.trim().startsWith("/") ||
		value.trim().startsWith("//") ||
		value.trim().length > 240
	) {
		throw configError(
			path,
			"Preview target route must be a bounded origin-relative path.",
			value,
		);
	}
	let parsed: URL;
	try {
		parsed = new URL(value.trim(), "http://127.0.0.1");
	} catch {
		throw configError(path, "Preview target route must be valid.", value);
	}
	if (
		parsed.origin !== "http://127.0.0.1" ||
		parsed.username ||
		parsed.password ||
		parsed.search ||
		parsed.hash
	) {
		throw configError(
			path,
			"Preview target route cannot contain credentials, query, or fragment.",
			value,
		);
	}
	return parsed.pathname;
}

function previewViewports(
	value: unknown,
	path: string,
): PreviewEvidenceViewport[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw configError(
			path,
			"Preview target viewports must contain desktop or mobile.",
			value,
		);
	}
	const viewports = [...new Set(value)];
	if (
		viewports.some(
			(viewport) => viewport !== "desktop" && viewport !== "mobile",
		)
	) {
		throw configError(
			path,
			"Preview target viewports must contain only desktop or mobile.",
			value,
		);
	}
	return viewports as PreviewEvidenceViewport[];
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

function optionalIdentifier(value: unknown, path: string): string | undefined {
	return value === undefined ? undefined : identifier(value, path);
}

function boundedRef(value: unknown, path: string): string {
	if (
		typeof value !== "string" ||
		!value.trim() ||
		value.trim().length > 240 ||
		/[\u0000-\u001f\u007f]/.test(value)
	) {
		throw configError(path, "Preview UI ref must be bounded text.", value);
	}
	return value.trim();
}

function objectRecord(value: unknown, path: string): Record<string, unknown> {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	throw configError(path, "Preview target must be an object.", value);
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
