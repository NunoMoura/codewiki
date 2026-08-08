import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	createShellWorktreeCommandRunner,
	type WorktreeCommandExecFile,
} from "../git/worktree-shell-runner.ts";
import {
	startProjectCoordinatorDaemon,
	type ProjectCoordinatorDaemonHandle,
} from "../runtime/coordinator/project-coordinator-daemon.ts";
import { spawnProjectCoordinatorDaemon } from "../runtime/coordinator/project-coordinator-process.ts";
import type { ProjectCoordinatorDecisionStartOptions } from "../runtime/coordinator/project-coordinator-service.ts";
import type { ImplementationWorkerAdapter } from "../runtime/workers/implementation-worker-adapter.ts";
import type { ProjectBranchMergeAuthority } from "../runtime/effects/project-branch-merge.ts";
import type { ProjectBranchPushAuthority } from "../runtime/effects/project-branch-push.ts";
import type {
	ProductPublicationAdapter,
	ProductPublicationPlan,
} from "../runtime/effects/product-publication-contract.ts";
import type {
	ProductReleaseAdapter,
	ProductReleasePlan,
} from "../runtime/effects/product-release-contract.ts";
import type {
	RuntimeSemanticAdapters,
	RuntimeSemanticContext,
} from "../runtime/semantic-executor.ts";
import {
	createPiNativeDecisionStartOptions,
	type PiNativeDecisionHostOptions,
} from "./native-decision-host.ts";
import { createPiProcessImplementationWorkerAdapter } from "./process-worker-adapter.ts";

export type PiSemanticAdapterLoader = (
	repoRoot: string,
) => Promise<RuntimeSemanticAdapters | undefined>;

export interface PiProjectCoordinatorDaemonOptions {
	loadSemanticAdapters?: PiSemanticAdapterLoader;
	semanticContext?: RuntimeSemanticContext;
	workerAdapter?: ImplementationWorkerAdapter;
	worktreeExecFile?: WorktreeCommandExecFile;
	mergeAuthority?: ProjectBranchMergeAuthority;
	pushAuthority?: ProjectBranchPushAuthority;
	publicationPlan?: ProductPublicationPlan;
	publicationAdapter?: ProductPublicationAdapter;
	releasePlan?: ProductReleasePlan;
	releaseAdapter?: ProductReleaseAdapter;
	decisionStart?: ProjectCoordinatorDecisionStartOptions;
	nativeDecision?: Omit<PiNativeDecisionHostOptions, "repoRoot">;
	now?: () => string;
}

const PI_SDK_MODULE_URL_ENV = "CODEWIKI_PI_SDK_MODULE_URL";

export async function loadPiSemanticAdapters(
	repoRoot: string,
): Promise<RuntimeSemanticAdapters | undefined> {
	try {
		const piSdk = (await import(
			process.env[PI_SDK_MODULE_URL_ENV] ||
				"@earendil-works/pi-coding-agent"
		)) as typeof import("@earendil-works/pi-coding-agent");
		const { createPiSdkRuntimeSemanticAdapters } = await import(
			"./sdk-semantic-session.ts"
		);
		return createPiSdkRuntimeSemanticAdapters({ repoRoot, piSdk });
	} catch (error) {
		if (optionalPiSdkUnavailable(error)) return undefined;
		throw error;
	}
}

export function spawnPiProjectCoordinatorDaemon(repoRoot: string): void {
	const moduleUrl = resolvePiSdkModuleUrl();
	spawnProjectCoordinatorDaemon(repoRoot, {
		...(moduleUrl
			? { env: { [PI_SDK_MODULE_URL_ENV]: moduleUrl } }
			: {}),
	});
}

export async function startPiProjectCoordinatorDaemon(
	repoRoot: string,
	options: PiProjectCoordinatorDaemonOptions = {},
): Promise<ProjectCoordinatorDaemonHandle> {
	const canonicalRoot = realpathSync(repoRoot);
	if (options.decisionStart && options.nativeDecision) {
		throw new Error(
			"Pi coordinator accepts either decisionStart or nativeDecision, not both.",
		);
	}
	const semanticAdapters = await (
		options.loadSemanticAdapters || loadPiSemanticAdapters
	)(canonicalRoot);
	let decisionStart = options.decisionStart;
	if (!decisionStart && options.nativeDecision) {
		decisionStart = createPiNativeDecisionStartOptions({
			...options.nativeDecision,
			repoRoot: canonicalRoot,
		});
	}
	return startProjectCoordinatorDaemon(canonicalRoot, {
		...(semanticAdapters ? { semanticAdapters } : {}),
		...(options.now ? {now: options.now} : {}),
		...(options.semanticContext
			? { semanticContext: options.semanticContext }
			: {}),
		...(options.mergeAuthority
			? { mergeAuthority: options.mergeAuthority }
			: {}),
		...(options.pushAuthority ? { pushAuthority: options.pushAuthority } : {}),
		...(options.publicationPlan
			? { publicationPlan: options.publicationPlan }
			: {}),
		...(options.publicationAdapter
			? { publicationAdapter: options.publicationAdapter }
			: {}),
		...(options.releasePlan ? { releasePlan: options.releasePlan } : {}),
		...(options.releaseAdapter
			? { releaseAdapter: options.releaseAdapter }
			: {}),
		...(decisionStart ? {decisionStart} : {}),
		workerAdapter:
			options.workerAdapter || createPiProcessImplementationWorkerAdapter(),
		workerWorktreeRunner: createShellWorktreeCommandRunner({
			cwd: canonicalRoot,
			timeoutMs: 60_000,
			maxBufferBytes: 8 * 1024 * 1024,
			...(options.worktreeExecFile ? { execFile: options.worktreeExecFile } : {}),
		}),
	});
}

function resolvePiSdkModuleUrl(): string | undefined {
	try {
		return import.meta.resolve("@earendil-works/pi-coding-agent");
	} catch {
		// Packed installs may rely on the Pi host package instead of a local peer.
	}
	if (!process.argv[1]) return undefined;
	let directory = dirname(realpathSync(resolve(process.argv[1])));
	for (let depth = 0; depth < 8; depth += 1) {
		const manifestPath = join(directory, "package.json");
		try {
			const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
				name?: unknown;
				exports?: { "."?: { import?: unknown } };
			};
			const entry = manifest.exports?.["."]?.import;
			if (
				manifest.name === "@earendil-works/pi-coding-agent" &&
				typeof entry === "string"
			) {
				return pathToFileURL(realpathSync(join(directory, entry))).href;
			}
		} catch {
			// Continue toward the filesystem root.
		}
		const parent = dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
	return undefined;
}

function optionalPiSdkUnavailable(error: unknown): boolean {
	if (!error || typeof error !== "object" || !("code" in error)) return false;
	if (String(error.code) !== "ERR_MODULE_NOT_FOUND") return false;
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("@earendil-works/pi-coding-agent");
}

async function run(): Promise<void> {
	const repoRoot = process.argv[2];
	if (!repoRoot) {
		throw new Error(
			"CodeWiki project coordinator daemon requires a repo root argument.",
		);
	}
	const daemon = await startPiProjectCoordinatorDaemon(repoRoot);
	let closing = false;
	const shutdown = async (): Promise<void> => {
		if (closing) return;
		closing = true;
		await daemon.close().catch(() => undefined);
	};
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.once(signal, () => {
			void shutdown().finally(() => process.exit(0));
		});
	}
}

const scriptPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === scriptPath) await run();
