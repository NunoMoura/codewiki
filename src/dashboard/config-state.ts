import { createHash } from "node:crypto";
import {
	previewProfileDigest,
	type PreviewProfile,
} from "../preview/profile.ts";
import {
	uiPreviewTargetDigest,
	type UiPreviewTarget,
} from "../preview/target.ts";
import {
	loadWikiConfigFile,
	WIKI_CONFIG_PATH,
} from "../project/config-file.ts";
import type {
	WikiConfig,
	WikiConfigAgencyLevel,
	WikiConfigAutomationMode,
	WikiConfigWorktreeIsolation,
	WikiRuntimeBudgetConfig,
	WikiModelRoutingConfig,
} from "../project/config.ts";

export interface DashboardEditableConfig {
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

export const DASHBOARD_CONFIG_MAX_WORKERS = 16;
export const DASHBOARD_CONFIG_BUDGET_MAXIMA = {
	maxSeconds: 86_400,
	maxIterations: 100,
	maxChangedFiles: 10_000,
	maxTraceBytes: 1_000_000_000,
	maxTokens: 10_000_000,
	maxCostUsd: 1_000,
	maxLatencyMs: 86_400_000,
} as const satisfies Partial<Record<keyof WikiRuntimeBudgetConfig, number>>;

export const DASHBOARD_CONFIG_MODEL_MAXIMA = {
	maxRoutes: 32,
	maxEscalations: 16,
	maxEstimatedTokens: 10_000_000,
	maxRouteTimeoutMs: 86_400_000,
	maxPricingUsdPerMillion: 1_000_000,
} as const;

export interface DashboardConfigLimits {
	maxWorkers: number;
	budgetMaxima: typeof DASHBOARD_CONFIG_BUDGET_MAXIMA;
	modelMaxima: typeof DASHBOARD_CONFIG_MODEL_MAXIMA;
	automationCeiling: WikiConfigAutomationMode;
	agencyCeiling: WikiConfigAgencyLevel;
	minimumQualityFloor: WikiModelRoutingConfig["qualityFloor"];
	piHostCanEnable: boolean;
	allowedTools: string[];
}

export interface DashboardPreviewProfile extends PreviewProfile {
	digest: string;
}

export interface DashboardUiPreviewTarget extends UiPreviewTarget {
	digest: string;
}

export interface DashboardConfigState {
	generatedAt: string;
	sourcePath: string;
	validation: "valid";
	configDigest: string;
	activeConfigDigest: string;
	stateDigest: string;
	restartRequired: boolean;
	restartReasons: string[];
	restartGuidance: string;
	previewProfiles: DashboardPreviewProfile[];
	uiPreviewTargets: DashboardUiPreviewTarget[];
	editable: DashboardEditableConfig;
	limits: DashboardConfigLimits;
}

export async function loadDashboardConfigState(
	repoRoot: string,
	activeConfig?: WikiConfig,
): Promise<DashboardConfigState> {
	const config = await loadWikiConfigFile(repoRoot);
	const active = activeConfig || config;
	const configDigest = dashboardConfigDigest(config);
	const activeConfigDigest = dashboardConfigDigest(active);
	const restartRequired = configDigest !== activeConfigDigest;
	return {
		generatedAt: new Date().toISOString(),
		sourcePath: WIKI_CONFIG_PATH,
		validation: "valid",
		configDigest,
		activeConfigDigest,
		stateDigest: `sha256:${createHash("sha256")
			.update(JSON.stringify({ configDigest, activeConfigDigest }))
			.digest("hex")}`,
		restartRequired,
		restartReasons: restartRequired
			? [
					"Persisted execution configuration differs from this dashboard runtime baseline.",
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
		editable: editableConfig(config),
		limits: {
			maxWorkers: DASHBOARD_CONFIG_MAX_WORKERS,
			budgetMaxima: { ...DASHBOARD_CONFIG_BUDGET_MAXIMA },
			modelMaxima: { ...DASHBOARD_CONFIG_MODEL_MAXIMA },
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

export function dashboardConfigDigest(config: WikiConfig): string {
	return `sha256:${createHash("sha256")
		.update(JSON.stringify(config))
		.digest("hex")}`;
}

function editableConfig(config: WikiConfig): DashboardEditableConfig {
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
