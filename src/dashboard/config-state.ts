import { createHash } from "node:crypto";
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
	editable: DashboardEditableConfig;
}

export async function loadDashboardConfigState(
	repoRoot: string,
	activeConfig?: WikiConfig,
): Promise<DashboardConfigState> {
	const config = await loadWikiConfigFile(repoRoot);
	const configDigest = dashboardConfigDigest(config);
	const activeConfigDigest = dashboardConfigDigest(activeConfig || config);
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
		editable: editableConfig(config),
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

