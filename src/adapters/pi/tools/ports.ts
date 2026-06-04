import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { basename, delimiter, isAbsolute, join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { WikiProject } from "../../../project/types.ts";
import type { TaskMutationPorts } from "../../../roadmap/task.ts";
import {
	createPiCodeRuntimeFoundationContract,
	type RuntimeFreshWorkerBridgePort,
} from "../../../runtime/ports.ts";
import type {
	CodewikiDaemonBlockReason,
	CodewikiFreshWorkerRequest,
	CodewikiFreshWorkerResult,
} from "../../../runtime/types.ts";
import { piSessionPorts, piSessionStore } from "../session.ts";
import { requestCodewikiContextRefresh } from "../compaction.ts";

export function piFileStore() {
	return {
		readJson: async (path: string) => JSON.parse(await readFile(path, "utf8")),
		maybeReadJson: async (path: string) => {
			try {
				return JSON.parse(await readFile(path, "utf8"));
			} catch {
				return null;
			}
		},
		writeJson: async (path: string, data: unknown) =>
			writeFile(path, JSON.stringify(data, null, 2), "utf8"),
		appendJsonl: async (path: string, record: unknown) =>
			appendFile(path, JSON.stringify(record) + "\n", "utf8"),
	};
}

export function piRebuildRunner() {
	return {
		run: async (project: WikiProject) => {
			const { runConfiguredOrDefaultRebuild } = await import(
				"../../../state/local/rebuild-runner.ts"
			);
			await runConfiguredOrDefaultRebuild(project);
		},
	};
}

export function piStatePorts(ctx: ExtensionContext) {
	return {
		fileStore: piFileStore(),
		rebuildRunner: piRebuildRunner(),
		sessionStore: piSessionStore(ctx),
	};
}

export interface PiFreshWorkerBridgeOptions {
	invocation?: {
		command: string;
		args?: string[];
		evidence?: string[];
	};
	spawnProcess?: typeof spawn;
}

interface PiWorkerInvocation {
	command: string;
	args: string[];
	evidence: string[];
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function executableExists(command: string): boolean {
	const candidates =
		process.platform === "win32"
			? [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`]
			: [command];
	if (isAbsolute(command) || command.includes("/") || command.includes("\\")) {
		try {
			accessSync(command, constants.X_OK);
			return true;
		} catch {
			return false;
		}
	}
	for (const directory of (process.env.PATH || "").split(delimiter)) {
		if (!directory) continue;
		for (const candidate of candidates) {
			try {
				accessSync(join(directory, candidate), constants.X_OK);
				return true;
			} catch {
				/* try next PATH candidate */
			}
		}
	}
	return false;
}

function getPiInvocation(
	args: string[],
	options: PiFreshWorkerBridgeOptions = {},
): PiWorkerInvocation {
	if (options.invocation?.command) {
		return {
			command: options.invocation.command,
			args: [...(options.invocation.args || []), ...args],
			evidence: options.invocation.evidence || [
				`subprocess:${options.invocation.command}`,
			],
		};
	}
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript) {
		return {
			command: process.execPath,
			args: [currentScript, ...args],
			evidence: ["subprocess:current-pi-entrypoint"],
		};
	}
	const execName = basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	return isGenericRuntime
		? {
				command: "pi",
				args,
				evidence: ["subprocess:pi --mode json -p --no-session"],
			}
		: {
				command: process.execPath,
				args,
				evidence: ["subprocess:current-pi-binary"],
			};
}

function formatSpawnError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function platformLimitedFreshWorker(
	request: CodewikiFreshWorkerRequest,
	summary: string,
	evidence: string[],
	remediation: string[],
): CodewikiFreshWorkerResult {
	const refs = uniqueStrings([
		request.task_id,
		...request.trace_refs,
		...request.gate_refs,
		...request.git_refs,
		...request.content_evidence.content_refs,
		...evidence,
	]);
	const blocker: CodewikiDaemonBlockReason = {
		kind: "platform_limited",
		summary,
		refs,
		gate_refs: request.gate_refs,
		remediation,
		retryable: true,
	};
	return {
		status: "unsupported",
		summary,
		request,
		blockers: [blocker],
		handoff: {
			summary,
			build_refs: request.build_refs,
			validation_refs: request.validation_refs,
			content_refs: request.content_evidence.content_refs,
			trace_refs: request.trace_refs,
			gate_refs: request.gate_refs,
			git_refs: request.git_refs,
			artifact_refs: request.artifact_refs,
			next_loop: "implementation",
			notes: [
				"fresh-worker subprocess bridge unavailable; parent chat context was not shared",
				...request.content_evidence.notes,
			],
		},
		platform: {
			kind: "unsupported",
			summary,
			evidence,
		},
	};
}

export function piFreshWorkerBridge(
	ctx: ExtensionContext,
	options: PiFreshWorkerBridgeOptions = {},
): RuntimeFreshWorkerBridgePort {
	return {
		requestFreshWorker: (request) => {
			const args = ["--mode", "json", "-p", "--no-session", request.prompt];
			const invocation = getPiInvocation(args, options);
			if (!executableExists(invocation.command)) {
				return platformLimitedFreshWorker(
					request,
					`Fresh ${request.role} worker for ${request.task_id} unavailable: Pi subprocess command ${invocation.command} is not executable.`,
					[...invocation.evidence, `missing_executable:${invocation.command}`],
					[
						"Install or expose the Pi CLI/package entrypoint on PATH, or use manual /wiki-resume --new fallback.",
					],
				);
			}
			const spawnProcess = options.spawnProcess || spawn;
			let child;
			try {
				child = spawnProcess(invocation.command, invocation.args, {
					cwd: request.cwd || ctx.cwd || process.cwd(),
					detached: true,
					shell: false,
					stdio: "ignore",
				});
			} catch (error) {
				return platformLimitedFreshWorker(
					request,
					`Fresh ${request.role} worker for ${request.task_id} unavailable: Pi subprocess spawn failed (${formatSpawnError(error)}).`,
					[...invocation.evidence, `spawn_error:${formatSpawnError(error)}`],
					[
						"Fix the local Pi subprocess invocation or use manual /wiki-resume --new fallback.",
					],
				);
			}
			child.once("error", () => {
				/* Keep late subprocess errors from crashing the parent process. */
			});
			if (!child.pid) {
				return platformLimitedFreshWorker(
					request,
					`Fresh ${request.role} worker for ${request.task_id} unavailable: Pi subprocess did not provide a worker pid.`,
					[...invocation.evidence, "spawn_pid:missing"],
					[
						"Check Pi subprocess permissions/entrypoint or use manual /wiki-resume --new fallback.",
					],
				);
			}
			child.unref();
			return {
				status: "requested",
				summary: `Requested fresh ${request.role} worker for ${request.task_id} through Pi subprocess bridge.`,
				request,
				worker: {
					session_id: `pi-subprocess-${child.pid}`,
					agent_name: `CodeWiki ${request.role}`,
					pid: child.pid,
					invocation: [
						invocation.command,
						...invocation.args.slice(0, 4),
						"<prompt>",
					],
				},
				blockers: [],
				handoff: {
					summary: `Fresh ${request.role} worker requested for ${request.task_id}.`,
					build_refs: request.build_refs,
					validation_refs: request.validation_refs,
					content_refs: request.content_evidence.content_refs,
					trace_refs: request.trace_refs,
					gate_refs: request.gate_refs,
					git_refs: request.git_refs,
					artifact_refs: request.artifact_refs,
					next_loop: "implementation",
					notes: [
						"Pi subprocess bridge uses --mode json -p --no-session; parent chat context is not shared.",
						...request.content_evidence.notes,
					],
				},
				platform: {
					kind: "subprocess",
					summary: "Pi subprocess bridge requested isolated worker execution.",
					evidence: [...invocation.evidence, "chat_context_shared=false"],
				},
			};
		},
	};
}

export function piCodeRuntimeFoundation() {
	return createPiCodeRuntimeFoundationContract({
		id: "pi-code-extension",
		label: "Pi Code extension runtime foundation",
		capabilities: {
			worker_execution: {
				name: "worker_execution",
				owner: "adapter",
				support: "supported",
				summary:
					"Pi Code extension can request fresh CodeWiki workers through an explicit subprocess bridge; command-context newSession remains replacement-session only.",
				evidence: [
					"piFreshWorkerBridge uses subprocess spawn for pi --mode json -p --no-session with chat_context_shared=false",
					"ExtensionCommandContext newSession is not used as parallel spawning evidence",
				],
				limitations: [
					"Bridge requests worker processes but final promotion still requires validation gates and immutable content proof.",
				],
			},
		},
	});
}

export function piAgencyPorts(ctx: ExtensionContext) {
	return {
		...piStatePorts(ctx),
		runtimeFoundation: piCodeRuntimeFoundation(),
		freshWorkerBridge: piFreshWorkerBridge(ctx),
		sessionBoundary: {
			requestContextRefresh: requestCodewikiContextRefresh,
		},
	};
}

export function piTaskPorts(): TaskMutationPorts {
	return {
		fileStore: piFileStore(),
		rebuildRunner: piRebuildRunner(),
		messageBus: {
			send: (_message: string) => {
				/* Pi adapter silences task output to caller */
			},
		},
	};
}

export function piSessionToolPorts(pi: ExtensionAPI, ctx: ExtensionContext) {
	return piSessionPorts(pi, ctx);
}
