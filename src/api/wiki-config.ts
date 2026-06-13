export type WikiConfigWorktreeIsolation = "none" | "worktree" | "auto";
export type WikiConfigAutomationMode = "manual" | "assist" | "auto";

export interface WikiRuntimeConfig {
	maxWorkers: number;
	worktreeIsolation: WikiConfigWorktreeIsolation;
	automation: WikiConfigAutomationMode;
}

export interface WikiRetentionConfig {
	enabled: boolean;
	archiveRefPrefix: string;
}

export interface WikiConfig {
	project: string;
	runtime: WikiRuntimeConfig;
	retention: WikiRetentionConfig;
}

export interface RunWikiConfigInput {
	current?: PartialWikiConfig;
	patch?: PartialWikiConfig;
}

export interface RunWikiConfigResult {
	config: WikiConfig;
	changed: boolean;
}

export type PartialWikiConfig = {
	project?: string;
	runtime?: Partial<WikiRuntimeConfig>;
	retention?: Partial<WikiRetentionConfig>;
};

export const DEFAULT_WIKI_CONFIG: WikiConfig = {
	project: "codewiki",
	runtime: {
		maxWorkers: 1,
		worktreeIsolation: "none",
		automation: "manual",
	},
	retention: {
		enabled: true,
		archiveRefPrefix: "refs/codewiki/archive/",
	},
};

export function runWikiConfig(
	input: RunWikiConfigInput = {},
): RunWikiConfigResult {
	const current = resolveWikiConfig(input.current);
	const config = resolveWikiConfig(mergeWikiConfigPatch(current, input.patch));
	return {
		config,
		changed: JSON.stringify(current) !== JSON.stringify(config),
	};
}

export function resolveWikiConfig(input: PartialWikiConfig = {}): WikiConfig {
	const config: WikiConfig = {
		project: text(input.project) || DEFAULT_WIKI_CONFIG.project,
		runtime: {
			...DEFAULT_WIKI_CONFIG.runtime,
			...(input.runtime || {}),
		},
		retention: {
			...DEFAULT_WIKI_CONFIG.retention,
			...(input.retention || {}),
		},
	};
	return validateWikiConfig(config);
}

export function validateWikiConfig(config: WikiConfig): WikiConfig {
	if (!config.project.trim())
		throw new Error("wiki_config project is required.");
	if (
		!Number.isInteger(config.runtime.maxWorkers) ||
		config.runtime.maxWorkers < 0
	) {
		throw new Error("wiki_config runtime.maxWorkers must be >= 0.");
	}
	if (!isWorktreeIsolation(config.runtime.worktreeIsolation)) {
		throw new Error("wiki_config runtime.worktreeIsolation is invalid.");
	}
	if (!isAutomation(config.runtime.automation)) {
		throw new Error("wiki_config runtime.automation is invalid.");
	}
	if (!config.retention.archiveRefPrefix.trim()) {
		throw new Error("wiki_config retention.archiveRefPrefix is required.");
	}
	return {
		project: config.project.trim(),
		runtime: { ...config.runtime },
		retention: {
			...config.retention,
			archiveRefPrefix: config.retention.archiveRefPrefix.trim(),
		},
	};
}

function mergeWikiConfigPatch(
	current: WikiConfig,
	patch: PartialWikiConfig = {},
): PartialWikiConfig {
	return {
		project: patch.project ?? current.project,
		runtime: { ...current.runtime, ...(patch.runtime || {}) },
		retention: { ...current.retention, ...(patch.retention || {}) },
	};
}

function isWorktreeIsolation(
	value: unknown,
): value is WikiConfigWorktreeIsolation {
	return value === "none" || value === "worktree" || value === "auto";
}

function isAutomation(value: unknown): value is WikiConfigAutomationMode {
	return value === "manual" || value === "assist" || value === "auto";
}

function text(value: unknown): string {
	return String(value || "").trim();
}
