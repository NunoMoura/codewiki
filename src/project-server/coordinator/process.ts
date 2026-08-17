import { realpathSync } from "node:fs";
import {
	connectProjectCoordinatorClient,
	requestProjectCoordinatorHealth,
	type ProjectCoordinatorClientRequestOptions,
	type ProjectCoordinatorRemoteClient,
} from "./service.ts";
import {
	readProjectCoordinatorEndpoint,
	type ProjectCoordinatorEndpoint,
} from "./endpoint.ts";
import type { ProjectCoordinatorClientInput } from "./project.ts";

const DEFAULT_START_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 50;

export interface EnsureProjectCoordinatorServiceOptions {
	timeoutMs?: number;
	spawnDaemon?: (repoRoot: string) => void;
}

export async function ensureProjectCoordinatorService(
	repoRoot: string,
	options: EnsureProjectCoordinatorServiceOptions = {},
): Promise<ProjectCoordinatorEndpoint> {
	const canonicalRoot = realpathSync(repoRoot);
	const current = await responsiveEndpoint(canonicalRoot);
	if (current) return current;
	if (!options.spawnDaemon) {
		throw new Error("Project coordinator daemon spawner is required.");
	}
	options.spawnDaemon(canonicalRoot);
	return waitForResponsiveEndpoint(
		canonicalRoot,
		Date.now() + boundedStartTimeout(options.timeoutMs),
	);
}

export async function connectEnsuredProjectCoordinatorClient(
	repoRoot: string,
	input: ProjectCoordinatorClientInput,
	options: EnsureProjectCoordinatorServiceOptions &
		ProjectCoordinatorClientRequestOptions = {},
): Promise<ProjectCoordinatorRemoteClient> {
	await ensureProjectCoordinatorService(repoRoot, options);
	return connectProjectCoordinatorClient(repoRoot, input, {
		timeoutMs: options.timeoutMs,
	});
}

async function responsiveEndpoint(
	repoRoot: string,
): Promise<ProjectCoordinatorEndpoint | undefined> {
	const endpoint = await readProjectCoordinatorEndpoint(repoRoot).catch(
		() => undefined,
	);
	if (!endpoint) return undefined;
	try {
		const health = await requestProjectCoordinatorHealth(endpoint, {
			timeoutMs: 500,
		});
		return health.generationId === endpoint.generationId ? endpoint : undefined;
	} catch {
		return undefined;
	}
}

async function waitForResponsiveEndpoint(
	repoRoot: string,
	deadline: number,
): Promise<ProjectCoordinatorEndpoint> {
	const endpoint = await responsiveEndpoint(repoRoot);
	if (endpoint) return endpoint;
	if (Date.now() >= deadline) {
		throw new Error(
			`Project coordinator service did not become ready for ${repoRoot}.`,
		);
	}
	await delay(POLL_INTERVAL_MS);
	return waitForResponsiveEndpoint(repoRoot, deadline);
}

function boundedStartTimeout(value: number | undefined): number {
	if (value === undefined) return DEFAULT_START_TIMEOUT_MS;
	if (!Number.isInteger(value) || value < 100 || value > 60_000) {
		throw new Error("timeoutMs must be an integer from 100 to 60000.");
	}
	return value;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
