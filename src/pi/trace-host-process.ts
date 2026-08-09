import { spawn, type ChildProcess } from "node:child_process";
import { open } from "node:fs/promises";
import type { TraceHostSessionController } from "../runtime/trace-host-runner.ts";
import type {
	PiProcessCommandResult,
	PiProcessCommandRunnerInput,
} from "../harnesses/pi/process-session.ts";
import { createTraceHostResultCollector } from "./trace-host-result.ts";

const MAX_EVENT_LINE = 262_144;

export async function runDetachedTraceHostCommand(
	input: PiProcessCommandRunnerInput,
): Promise<PiProcessCommandResult> {
	const output = await open(input.outputFile, "w", 0o600);
	await output.chmod(0o600);
	const collector = createTraceHostResultCollector();
	let buffered = "";
	let droppingOversizedLine = false;
	let resolveCompletion: (
		value: Awaited<
			ReturnType<NonNullable<TraceHostSessionController["completion"]>>
		>,
	) => void;
	const completion = new Promise<
		Awaited<ReturnType<NonNullable<TraceHostSessionController["completion"]>>>
	>((resolve) => {
		resolveCompletion = resolve;
	});
	try {
		return await new Promise((resolve, reject) => {
			const child = spawn(input.command, input.args, {
				cwd: input.cwd,
				env: input.env,
				detached: true,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let spawned = false;
			child.stdout?.setEncoding("utf8");
			child.stdout?.on("data", (chunk) => {
				const consumed = consumeEventChunk(
					buffered,
					droppingOversizedLine,
					String(chunk),
					collector.acceptLine,
				);
				buffered = consumed.buffered;
				droppingOversizedLine = consumed.droppingOversizedLine;
			});
			child.stderr?.resume();
			child.once("error", (error) => {
				if (!spawned) reject(error);
			});
			child.once("close", (exitCode, signal) => {
				if (!droppingOversizedLine && buffered.trim()) {
					collector.acceptLine(buffered);
				}
				const value = collector.complete(exitCode, signal);
				void writeSanitizedCompletion(output, value)
					.catch(() => undefined)
					.finally(() => resolveCompletion(value));
			});
			child.once("spawn", () => {
				spawned = true;
				child.unref();
				resolve({
					pid: child.pid,
					outputFile: input.outputFile,
					controller: traceHostController(
						child,
						completion,
						collector.currentUsage,
					),
				});
			});
		});
	} catch (error) {
		await output.close().catch(() => undefined);
		throw error;
	}
}

interface EventChunkState {
	buffered: string;
	droppingOversizedLine: boolean;
}

function consumeEventChunk(
	buffered: string,
	droppingOversizedLine: boolean,
	chunk: string,
	acceptLine: (line: string) => void,
): EventChunkState {
	let remaining = chunk;
	if (droppingOversizedLine) {
		const newline = remaining.indexOf("\n");
		if (newline < 0) return { buffered: "", droppingOversizedLine: true };
		remaining = remaining.slice(newline + 1);
		droppingOversizedLine = false;
	}
	buffered += remaining;
	let newline = buffered.indexOf("\n");
	while (newline >= 0) {
		const line = buffered.slice(0, newline);
		buffered = buffered.slice(newline + 1);
		if (line.length <= MAX_EVENT_LINE) acceptLine(line);
		newline = buffered.indexOf("\n");
	}
	if (buffered.length > MAX_EVENT_LINE) {
		return { buffered: "", droppingOversizedLine: true };
	}
	return { buffered, droppingOversizedLine };
}

function traceHostController(
	child: ChildProcess,
	completion: Promise<
		Awaited<ReturnType<NonNullable<TraceHostSessionController["completion"]>>>
	>,
	currentUsage: () => ReturnType<
		NonNullable<TraceHostSessionController["currentUsage"]>
	>,
): TraceHostSessionController {
	return {
		isRunning: () => processIsRunning(child),
		currentUsage,
		completion() {
			if (processIsRunning(child)) return Promise.resolve(undefined);
			return completion;
		},
		async stop() {
			if (!processIsRunning(child)) return;
			child.kill("SIGTERM");
			if (await waitForProcessExit(child, 2_000)) return;
			child.kill("SIGKILL");
			if (!(await waitForProcessExit(child, 2_000))) {
				throw new Error("Trace host process did not exit after SIGKILL.");
			}
		},
	};
}

async function writeSanitizedCompletion(
	output: Awaited<ReturnType<typeof open>>,
	completion: Exclude<
		Awaited<ReturnType<NonNullable<TraceHostSessionController["completion"]>>>,
		undefined
	>,
): Promise<void> {
	try {
		await output.writeFile(
			`${JSON.stringify({ type: "trace_host_result", ...completion })}\n`,
			"utf8",
		);
	} finally {
		await output.close().catch(() => undefined);
	}
}

function processIsRunning(child: ChildProcess): boolean {
	return child.exitCode === null && child.signalCode === null;
}

function waitForProcessExit(
	child: ChildProcess,
	timeoutMs: number,
): Promise<boolean> {
	if (!processIsRunning(child)) return Promise.resolve(true);
	return new Promise((resolve) => {
		const done = (exited: boolean) => {
			clearTimeout(timer);
			child.off("exit", onExit);
			resolve(exited);
		};
		const onExit = () => done(true);
		const timer = setTimeout(() => done(!processIsRunning(child)), timeoutMs);
		child.once("exit", onExit);
	});
}
