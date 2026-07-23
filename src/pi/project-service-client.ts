import { randomUUID } from "node:crypto";
import {
	connectEnsuredProjectCoordinatorClient,
	type EnsureProjectCoordinatorServiceOptions,
} from "../runtime/project-coordinator-process.ts";
import type {
	ProjectCoordinatorCandidateResult,
	ProjectCoordinatorRemoteClient,
	ProjectCoordinatorSemanticExecution,
	RuntimeCandidateLoop,
} from "../runtime/project-coordinator-service.ts";
import type { RuntimeReaction, RuntimeTrigger } from "../runtime/reactor.ts";
import type { RuntimeReactionJobReceipt } from "../runtime/runtime-reaction-jobs.ts";
import type { RuntimeSemanticMode } from "../runtime/semantic-executor.ts";
import { spawnPiProjectCoordinatorDaemon } from "./project-coordinator-daemon.ts";
import type { CodewikiExtensionContext } from "./types.ts";

const HEARTBEAT_INTERVAL_MS = 10_000;

type RemoteTrigger = Omit<RuntimeTrigger, "occurredAt">;

export interface PiProjectServiceClientProvider {
	connect(
		repoRoot: string,
		ctx: Pick<CodewikiExtensionContext, "mode" | "sessionManager">,
	): Promise<void>;
	inspect(
		repoRoot: string,
		ctx: Pick<CodewikiExtensionContext, "mode" | "sessionManager">,
		trigger: RemoteTrigger,
	): Promise<RuntimeReaction>;
	semanticExecution(
		repoRoot: string,
		ctx: Pick<CodewikiExtensionContext, "mode" | "sessionManager">,
	): Promise<ProjectCoordinatorSemanticExecution>;
	react(
		repoRoot: string,
		ctx: Pick<CodewikiExtensionContext, "mode" | "sessionManager">,
		trigger: RemoteTrigger,
		mode?: RuntimeSemanticMode,
	): Promise<RuntimeReactionJobReceipt[]>;
	submitCandidate(
		repoRoot: string,
		ctx: Pick<CodewikiExtensionContext, "mode" | "sessionManager">,
		trigger: RemoteTrigger,
		loop: RuntimeCandidateLoop,
		candidate: Record<string, unknown>,
		mode: RuntimeSemanticMode,
	): Promise<ProjectCoordinatorCandidateResult>;
	disconnect(repoRoot?: string): Promise<void>;
}

interface ClientEntry {
	client: ProjectCoordinatorRemoteClient;
	heartbeat: ReturnType<typeof setInterval>;
}

export function createPiProjectServiceClients(
	options: EnsureProjectCoordinatorServiceOptions = {},
): PiProjectServiceClientProvider {
	const serviceOptions = options.spawnDaemon
		? options
		: { ...options, spawnDaemon: spawnPiProjectCoordinatorDaemon };
	const instanceId = randomUUID();
	const clients = new Map<string, ClientEntry>();

	const remove = async (
		repoRoot: string,
		entry: ClientEntry,
	): Promise<void> => {
		if (clients.get(repoRoot) !== entry) return;
		clients.delete(repoRoot);
		clearInterval(entry.heartbeat);
		await entry.client.disconnect().catch(() => undefined);
	};

	const clientFor = async (
		repoRoot: string,
		ctx: Pick<CodewikiExtensionContext, "mode" | "sessionManager">,
	): Promise<ProjectCoordinatorRemoteClient> => {
		const current = clients.get(repoRoot);
		if (current) return current.client;
		const sessionId = ctx.sessionManager?.getSessionId?.() || "ephemeral";
		const client = await connectEnsuredProjectCoordinatorClient(
			repoRoot,
			{
				clientId: `pi:${process.pid}:${instanceId}:${sessionId}`,
				kind: "pi",
				supervision:
					ctx.mode === "tui" || ctx.mode === "rpc" ? "approved" : "observer",
			},
			serviceOptions,
		);
		const entry = {
			client,
			heartbeat: setInterval(() => {
				void client.heartbeat().catch(() => remove(repoRoot, entry));
			}, HEARTBEAT_INTERVAL_MS),
		};
		entry.heartbeat.unref();
		clients.set(repoRoot, entry);
		return client;
	};

	const invoke = async <T>(
		repoRoot: string,
		ctx: Pick<CodewikiExtensionContext, "mode" | "sessionManager">,
		run: (client: ProjectCoordinatorRemoteClient) => Promise<T>,
	): Promise<T> => {
		let client = await clientFor(repoRoot, ctx);
		try {
			return await run(client);
		} catch (error) {
			const entry = clients.get(repoRoot);
			if (!entry || entry.client !== client || !retryableClientError(error)) {
				throw error;
			}
			await remove(repoRoot, entry);
			client = await clientFor(repoRoot, ctx);
			return run(client);
		}
	};

	return {
		async connect(repoRoot, ctx) {
			await clientFor(repoRoot, ctx);
		},
		inspect(repoRoot, ctx, trigger) {
			return invoke(repoRoot, ctx, (client) => client.inspect(trigger));
		},
		semanticExecution(repoRoot, ctx) {
			return invoke(repoRoot, ctx, async (client) => client.semanticExecution);
		},
		react(repoRoot, ctx, trigger, mode = "append") {
			return invoke(repoRoot, ctx, (client) => client.react(trigger, mode));
		},
		submitCandidate(repoRoot, ctx, trigger, loop, candidate, mode) {
			return invoke(repoRoot, ctx, (client) =>
				client.submitCandidate(trigger, loop, candidate, mode),
			);
		},
		async disconnect(repoRoot) {
			if (repoRoot) {
				const entry = clients.get(repoRoot);
				if (entry) await remove(repoRoot, entry);
				return;
			}
			await Promise.all(
				[...clients].map(([root, entry]) => remove(root, entry)),
			);
		},
	};
}

function retryableClientError(error: unknown): boolean {
	if (!error || typeof error !== "object") return true;
	const status = "status" in error ? Number(error.status) : 0;
	return status === 0 || status === 404 || status === 409 || status >= 500;
}
