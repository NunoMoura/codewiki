import {
	previewProfileDigest,
	type PreviewProfile,
} from "../../preview/profile.ts";
import {
	uiPreviewTargetDigest,
	type UiPreviewTarget,
} from "../../preview/target.ts";
import {
	loadWikiConfigFile,
	WIKI_CONFIG_PATH,
	wikiConfigDigest,
} from "../../project/config-file.ts";
import type {
	WikiConfig,
	WikiConfigAgencyLevel,
	WikiConfigAutomationMode,
	WikiConfigWorktreeIsolation,
	WikiRuntimeBudgetConfig,
	WikiModelRoutingConfig,
} from "../../project/config.ts";
import {canonicalJsonDigest} from "../../utils/canonical-json.ts";

export interface ProjectServerEffectiveConfiguration {
	runtime: {
		maxWorkers: number;
		worktreeIsolation: WikiConfigWorktreeIsolation;
		automation: WikiConfigAutomationMode;
		agency: WikiConfigAgencyLevel;
		budgets: WikiRuntimeBudgetConfig;
		modelRouting: WikiModelRoutingConfig;
	};
	hosts: {
		pi: { enabled: boolean };
	};
}

export const RUNTIME_CONFIGURATION_MAX_WORKERS = 16;
export const RUNTIME_CONFIGURATION_BUDGET_MAXIMA = {
	maxSeconds: 86_400,
	maxIterations: 100,
	maxChangedFiles: 10_000,
	maxTraceBytes: 1_000_000_000,
	maxTokens: 10_000_000,
	maxCostUsd: 1_000,
	maxLatencyMs: 86_400_000,
} as const satisfies Partial<Record<keyof WikiRuntimeBudgetConfig, number>>;

export const RUNTIME_CONFIGURATION_MODEL_MAXIMA = {
	maxRoutes: 32,
	maxEscalations: 16,
	maxEstimatedTokens: 10_000_000,
	maxRouteTimeoutMs: 86_400_000,
	maxPricingUsdPerMillion: 1_000_000,
} as const;

export interface ProjectServerConfigurationLimits {
	maxWorkers: number;
	budgetMaxima: typeof RUNTIME_CONFIGURATION_BUDGET_MAXIMA;
	modelMaxima: typeof RUNTIME_CONFIGURATION_MODEL_MAXIMA;
	automationCeiling: WikiConfigAutomationMode;
	agencyCeiling: WikiConfigAgencyLevel;
	minimumQualityFloor: WikiModelRoutingConfig["qualityFloor"];
	piHostCanEnable: boolean;
	allowedTools: string[];
}

export interface ProjectServerPreviewProfile extends PreviewProfile {
	digest: string;
}

export interface ProjectServerUiPreviewTarget extends UiPreviewTarget {
	digest: string;
}

export interface ProjectServerConfigurationState {
	generatedAt: string;
	sourcePath: string;
	validation: "valid";
	configDigest: string;
	activeConfigDigest: string;
	stateDigest: string;
	restartRequired: boolean;
	restartReasons: string[];
	restartGuidance: string;
	previewProfiles: ProjectServerPreviewProfile[];
	uiPreviewTargets: ProjectServerUiPreviewTarget[];
	effective: ProjectServerEffectiveConfiguration;
	limits: ProjectServerConfigurationLimits;
}

export async function loadProjectServerConfigurationState(
	repoRoot: string,
	activeConfig?: WikiConfig,
): Promise<ProjectServerConfigurationState> {
	const config = await loadWikiConfigFile(repoRoot);
	const active = activeConfig || config;
	const configDigest = runtimeConfigurationDigest(config);
	const activeConfigDigest = runtimeConfigurationDigest(active);
	const restartRequired = configDigest !== activeConfigDigest;
	return {
		generatedAt: new Date().toISOString(),
		sourcePath: WIKI_CONFIG_PATH,
		validation: "valid",
		configDigest,
		activeConfigDigest,
		stateDigest: canonicalJsonDigest({configDigest, activeConfigDigest}),
		restartRequired,
		restartReasons: restartRequired
			? [
					"Persisted execution configuration differs from this Project Server baseline.",
				]
			: [],
		restartGuidance: restartRequired
			? "Fully exit and restart Pi; /reload is not sufficient. Running sessions keep their immutable start policy."
			: "No restart required.",
		previewProfiles: config.preview.profiles.map((profile) => ({
			...structuredClone(profile),
			digest: previewProfileDigest(profile),
		})),
		uiPreviewTargets: config.preview.uiPreviewTargets.map((target) => ({
			...structuredClone(target),
			digest: uiPreviewTargetDigest(target),
		})),
		effective: effectiveConfig(config),
		limits: {
			maxWorkers: RUNTIME_CONFIGURATION_MAX_WORKERS,
			budgetMaxima: { ...RUNTIME_CONFIGURATION_BUDGET_MAXIMA },
			modelMaxima: { ...RUNTIME_CONFIGURATION_MODEL_MAXIMA },
			automationCeiling: active.runtime.automation,
			agencyCeiling: active.runtime.agency,
			minimumQualityFloor: active.runtime.modelRouting.qualityFloor,
			piHostCanEnable: active.hosts.pi.enabled,
			allowedTools: [
				...new Set(
					active.runtime.modelRouting.routes.flatMap(
						(route) => route.allowedTools,
					),
				),
			].sort((left, right) => left.localeCompare(right)),
		},
	};
}

export function runtimeConfigurationDigest(config: WikiConfig): string {
	return wikiConfigDigest(config);
}

function effectiveConfig(config: WikiConfig): ProjectServerEffectiveConfiguration {
	return {
		runtime: {
			maxWorkers: config.runtime.maxWorkers,
			worktreeIsolation: config.runtime.worktreeIsolation,
			automation: config.runtime.automation,
			agency: config.runtime.agency,
			budgets: structuredClone(config.runtime.budgets),
			modelRouting: structuredClone(config.runtime.modelRouting),
		},
		hosts: { pi: { enabled: config.hosts.pi.enabled } },
	};
}
