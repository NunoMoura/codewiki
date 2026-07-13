import { createCodewikiConfigError } from "../error-handling/config-errors.ts";

export type WikiModelQuality = "standard" | "high" | "critical";
export type WikiModelLatency = "fast" | "balanced" | "slow";
export type WikiModelThinking =
	| "off"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh"
	| "max";

export interface WikiModelPricingConfig {
	inputUsdPerMillion: number;
	outputUsdPerMillion: number;
	cacheReadUsdPerMillion: number;
	cacheWriteUsdPerMillion: number;
}

export interface WikiModelRouteConfig {
	id: string;
	provider: string;
	model: string;
	thinking: WikiModelThinking;
	quality: WikiModelQuality;
	latency: WikiModelLatency;
	timeoutMs: number;
	pricing: WikiModelPricingConfig;
	allowedTools: string[];
}

export interface WikiModelRoutingConfig {
	qualityFloor: WikiModelQuality;
	maxEscalations: number;
	estimatedInputTokens: number;
	estimatedOutputTokens: number;
	routes: WikiModelRouteConfig[];
}

export type PartialWikiModelRoutingConfig = Partial<
	Omit<WikiModelRoutingConfig, "routes">
> & {
	routes?: WikiModelRouteConfig[];
};

export const DEFAULT_MODEL_ROUTING_CONFIG: WikiModelRoutingConfig = {
	qualityFloor: "standard",
	maxEscalations: 0,
	estimatedInputTokens: 75_000,
	estimatedOutputTokens: 25_000,
	routes: [],
};

export function resolveWikiModelRoutingConfig(
	input: PartialWikiModelRoutingConfig = {},
): WikiModelRoutingConfig {
	validatePartialWikiModelRoutingKeys(input, "runtime.modelRouting");
	return validateWikiModelRoutingConfig({
		...DEFAULT_MODEL_ROUTING_CONFIG,
		...input,
		routes: (input.routes || DEFAULT_MODEL_ROUTING_CONFIG.routes).map(
			(route) => ({
				...route,
				pricing: { ...route.pricing },
				allowedTools: [...route.allowedTools],
			}),
		),
	});
}

export function validateWikiModelRoutingConfig(
	config: WikiModelRoutingConfig,
): WikiModelRoutingConfig {
	if (!isQuality(config.qualityFloor)) {
		throw configError(
			"runtime.modelRouting.qualityFloor",
			"must be standard, high, or critical.",
			config.qualityFloor,
		);
	}
	if (!Number.isInteger(config.maxEscalations) || config.maxEscalations < 0) {
		throw configError(
			"runtime.modelRouting.maxEscalations",
			"must be a non-negative integer.",
			config.maxEscalations,
		);
	}
	for (const field of [
		"estimatedInputTokens",
		"estimatedOutputTokens",
	] as const) {
		if (!Number.isInteger(config[field]) || config[field] < 0) {
			throw configError(
				`runtime.modelRouting.${field}`,
				"must be a non-negative integer.",
				config[field],
			);
		}
	}
	if (config.estimatedInputTokens + config.estimatedOutputTokens < 1) {
		throw configError(
			"runtime.modelRouting",
			"must estimate at least one token.",
			config,
		);
	}
	if (!Array.isArray(config.routes) || config.routes.length > 32) {
		throw configError(
			"runtime.modelRouting.routes",
			"must contain at most 32 routes.",
			config.routes,
		);
	}
	const routes = config.routes.map(validateRoute);
	const ids = new Set<string>();
	for (const route of routes) {
		if (ids.has(route.id)) {
			throw configError(
				"runtime.modelRouting.routes",
				`contains duplicate route id ${route.id}.`,
				route.id,
			);
		}
		ids.add(route.id);
	}
	return {
		qualityFloor: config.qualityFloor,
		maxEscalations: config.maxEscalations,
		estimatedInputTokens: config.estimatedInputTokens,
		estimatedOutputTokens: config.estimatedOutputTokens,
		routes,
	};
}

export function validatePartialWikiModelRoutingKeys(
	value: unknown,
	path: string,
): void {
	if (value === undefined) return;
	const config = record(value, path);
	knownKeys(config, path, [
		"qualityFloor",
		"maxEscalations",
		"estimatedInputTokens",
		"estimatedOutputTokens",
		"routes",
	]);
	if (config.routes === undefined) return;
	if (!Array.isArray(config.routes)) {
		throw configError(`${path}.routes`, "must be an array.", config.routes);
	}
	for (const [index, candidate] of config.routes.entries()) {
		const routePath = `${path}.routes[${index}]`;
		const route = record(candidate, routePath);
		knownKeys(route, routePath, [
			"id",
			"provider",
			"model",
			"thinking",
			"quality",
			"latency",
			"timeoutMs",
			"pricing",
			"allowedTools",
		]);
		const pricing = record(route.pricing, `${routePath}.pricing`);
		knownKeys(pricing, `${routePath}.pricing`, [
			"inputUsdPerMillion",
			"outputUsdPerMillion",
			"cacheReadUsdPerMillion",
			"cacheWriteUsdPerMillion",
		]);
	}
}

function validateRoute(
	route: WikiModelRouteConfig,
	index: number,
): WikiModelRouteConfig {
	const path = `runtime.modelRouting.routes[${index}]`;
	const id = identifier(route.id, `${path}.id`);
	const provider = identifier(route.provider, `${path}.provider`);
	const model = modelIdentifier(route.model, `${path}.model`);
	if (!isThinking(route.thinking)) {
		throw configError(`${path}.thinking`, "is invalid.", route.thinking);
	}
	if (!isQuality(route.quality)) {
		throw configError(`${path}.quality`, "is invalid.", route.quality);
	}
	if (!isLatency(route.latency)) {
		throw configError(`${path}.latency`, "is invalid.", route.latency);
	}
	if (!Number.isInteger(route.timeoutMs) || route.timeoutMs < 1) {
		throw configError(`${path}.timeoutMs`, "must be >= 1.", route.timeoutMs);
	}
	const pricing = validatePricing(route.pricing, `${path}.pricing`);
	if (!Array.isArray(route.allowedTools) || route.allowedTools.length > 64) {
		throw configError(
			`${path}.allowedTools`,
			"must contain at most 64 tool ids.",
			route.allowedTools,
		);
	}
	return {
		id,
		provider,
		model,
		thinking: route.thinking,
		quality: route.quality,
		latency: route.latency,
		timeoutMs: route.timeoutMs,
		pricing,
		allowedTools: unique(
			route.allowedTools.map((tool) =>
				identifier(tool, `${path}.allowedTools`),
			),
		),
	};
}

function validatePricing(
	pricing: WikiModelPricingConfig,
	path: string,
): WikiModelPricingConfig {
	return {
		inputUsdPerMillion: price(
			pricing.inputUsdPerMillion,
			`${path}.inputUsdPerMillion`,
		),
		outputUsdPerMillion: price(
			pricing.outputUsdPerMillion,
			`${path}.outputUsdPerMillion`,
		),
		cacheReadUsdPerMillion: price(
			pricing.cacheReadUsdPerMillion,
			`${path}.cacheReadUsdPerMillion`,
		),
		cacheWriteUsdPerMillion: price(
			pricing.cacheWriteUsdPerMillion,
			`${path}.cacheWriteUsdPerMillion`,
		),
	};
}

function price(value: unknown, path: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw configError(path, "must be a finite non-negative number.", value);
	}
	return value;
}

function identifier(value: unknown, path: string): string {
	if (
		typeof value !== "string" ||
		value.length < 1 ||
		value.length > 120 ||
		!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
	) {
		throw configError(path, "contains an invalid identifier.", value);
	}
	return value;
}

function modelIdentifier(value: unknown, path: string): string {
	if (
		typeof value !== "string" ||
		value.length < 1 ||
		value.length > 200 ||
		!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
	) {
		throw configError(path, "contains an invalid model id.", value);
	}
	return value;
}

function isThinking(value: unknown): value is WikiModelThinking {
	return ["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(
		String(value),
	);
}

function isQuality(value: unknown): value is WikiModelQuality {
	return ["standard", "high", "critical"].includes(String(value));
}

function isLatency(value: unknown): value is WikiModelLatency {
	return ["fast", "balanced", "slow"].includes(String(value));
}

function record(value: unknown, path: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw configError(path, "must be an object.", value);
	}
	return value as Record<string, unknown>;
}

function knownKeys(
	value: Record<string, unknown>,
	path: string,
	allowed: readonly string[],
): void {
	const known = new Set(allowed);
	for (const key of Object.keys(value)) {
		if (known.has(key)) continue;
		throw configError(`${path}.${key}`, "is unknown.", value[key]);
	}
}

function unique(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))].sort((left, right) =>
		left.localeCompare(right),
	);
}

function configError(path: string, message: string, value: unknown) {
	return createCodewikiConfigError({
		path,
		message: `wiki_config ${path} ${message}`,
		value,
	});
}
