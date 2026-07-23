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
} from "../runtime/project-coordinator-daemon.ts";
import { spawnProjectCoordinatorDaemon } from "../runtime/project-coordinator-process.ts";
import type { ImplementationWorkerAdapter } from "../runtime/implementation-worker-adapter.ts";
import type { RuntimeSemanticAdapters } from "../runtime/semantic-executor.ts";
import { createPiProcessImplementationWorkerAdapter } from "./process-worker-adapter.ts";

export type PiSemanticAdapterLoader = (
	repoRoot: string,
) => Promise<RuntimeSemanticAdapters | undefined>;

export interface PiProjectCoordinatorDaemonOptions {
	loadSemanticAdapters?: PiSemanticAdapterLoader;
	workerAdapter?: ImplementationWorkerAdapter;
	worktreeExecFile?: WorktreeCommandExecFile;
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
	const semanticAdapters = await (
		options.loadSemanticAdapters || loadPiSemanticAdapters
	)(canonicalRoot);
	return startProjectCoordinatorDaemon(canonicalRoot, {
		...(semanticAdapters ? { semanticAdapters } : {}),
		workerAdapter:
			options.workerAdapter || createPiProcessImplementationWorkerAdapter(),
		workerWorktreeRunner: createShellWorktreeCommandRunner({
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
