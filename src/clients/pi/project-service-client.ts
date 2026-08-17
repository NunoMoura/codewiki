import { randomUUID } from "node:crypto";
import type {
	BacklogTriageQueryRequest,
	BacklogTriageQueryResult,
} from "../../changes/triage/contracts.ts";
import type { DecisionAttentionSelectionCommand } from "../../changes/triage/selection.ts";
import type { DecisionStartResult } from "../../project-server/admission/start.ts";
import type { ProjectCoordinatorClientInput } from "../../project-server/coordinator/project.ts";
import type { ProjectServerReaction, ProjectServerTrigger } from "../../project-server/coordinator/reactor.ts";
import type { ProjectCoordinatorRemoteClient } from "../../project-server/coordinator/service.ts";
import type { CodewikiExtensionContext } from "./types.ts";

const HEARTBEAT_INTERVAL_MS = 10_000;

type RemoteTrigger = Omit<ProjectServerTrigger, "occurredAt">;

export interface PiProjectServiceClientProvider {
	inspect(
		repoRoot: string,
		ctx: Pick<CodewikiExtensionContext, "mode" | "sessionManager">,
		trigger: RemoteTrigger,
	): Promise<ProjectServerReaction>;
	decisionAttention(input: {
		readonly repoRoot: string;
		readonly context: Pick<
			CodewikiExtensionContext,
			"mode" | "sessionManager"
		>;
		readonly request?: BacklogTriageQueryRequest;
	}): Promise<BacklogTriageQueryResult>;
	selectDecision(input: {
		readonly repoRoot: string;
		readonly context: Pick<
			CodewikiExtensionContext,
			"mode" | "sessionManager"
		>;
		readonly command: DecisionAttentionSelectionCommand;
	}): Promise<DecisionStartResult>;
	stop(repoRoot: string): Promise<void>;
	disconnect(repoRoot?: string): Promise<void>;
}

interface ClientEntry {
	client: ProjectCoordinatorRemoteClient;
	heartbeat: ReturnType<typeof setInterval>;
}

export interface CreatePiProjectServiceClientsOptions {
	connect(
		repoRoot: string,
		input: ProjectCoordinatorClientInput,
	): Promise<ProjectCoordinatorRemoteClient>;
	stop(repoRoot: string): Promise<void>;
}

export function createPiProjectServiceClients(
	options: CreatePiProjectServiceClientsOptions,
): PiProjectServiceClientProvider {
	const instanceId = randomUUID();
	const clients = new Map<string, ClientEntry>();

	const detach = (
		repoRoot: string,
		entry: ClientEntry,
	): Promise<void> | undefined => {
		if (clients.get(repoRoot) !== entry) return undefined;
		clients.delete(repoRoot);
		clearInterval(entry.heartbeat);
		return entry.client.disconnect().catch(() => undefined);
	};
	const remove = async (
		repoRoot: string,
		entry: ClientEntry,
	): Promise<void> => {
		await detach(repoRoot, entry);
	};

	const clientFor = async (
		repoRoot: string,
		ctx: Pick<CodewikiExtensionContext, "mode" | "sessionManager">,
	): Promise<ProjectCoordinatorRemoteClient> => {
		const current = clients.get(repoRoot);
		if (current) return current.client;
		const sessionId = ctx.sessionManager?.getSessionId?.() || "ephemeral";
		const client = await options.connect(repoRoot, {
			clientId: `pi:${process.pid}:${instanceId}:${sessionId}`,
			kind: "pi",
			supervision:
				ctx.mode === "tui" || ctx.mode === "rpc" ? "approved" : "observer",
		});
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
			void detach(repoRoot, entry);
			client = await clientFor(repoRoot, ctx);
			return run(client);
		}
	};

	const disconnect = async (repoRoot?: string): Promise<void> => {
		if (repoRoot) {
			const entry = clients.get(repoRoot);
			if (entry) await remove(repoRoot, entry);
			return;
		}
		await Promise.all(
			[...clients].map(([root, entry]) => remove(root, entry)),
		);
	};

	return {
		inspect(repoRoot, ctx, trigger) {
			return invoke(repoRoot, ctx, (client) => client.inspect(trigger));
		},
		decisionAttention(input) {
			return invoke(input.repoRoot, input.context, (client) =>
				client.decisionAttention(input.request),
			);
		},
		selectDecision(input) {
			return invoke(input.repoRoot, input.context, (client) =>
				client.selectDecision(input.command),
			);
		},
		async stop(repoRoot) {
			await disconnect(repoRoot);
			await options.stop(repoRoot);
		},
		disconnect,
	};
}

function retryableClientError(error: unknown): boolean {
	if (!error || typeof error !== "object") return true;
	const status = "status" in error ? Number(error.status) : 0;
	return status === 0 || status === 404 || status === 409 || status >= 500;
}
