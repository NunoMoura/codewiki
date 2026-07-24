import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { ImplementationWorkerReportInput } from "../implementation/workers.ts";
import {
	assertImplementationWorkerAssignment,
	assertImplementationWorkerReport,
	implementationWorkerJobId,
	type ImplementationWorkerAdapter,
	type ImplementationWorkerAdapterAvailability,
	type ImplementationWorkerAssignment,
	type ImplementationWorkerReport,
} from "./implementation-worker-adapter.ts";
import {
	assertImplementationWorkerReportPath,
	implementationWorkerReportStatus,
	persistImplementationWorkerReport,
	recoverImplementationWorkerReport,
} from "./implementation-worker-report-store.ts";
import {
	resolveContainerGitMount,
	type ContainerGitMount,
} from "./container-worker-git.ts";
import {
	containerRuntimeEnvironment,
	resolveContainerOptions,
	type OciContainerWorkerAdapterOptions,
	type ResolvedContainerOptions,
} from "./container-worker-options.ts";
import type { OciContainerCommandResult } from "./oci-container-command.ts";

export {
	runOciContainerCommand,
	type OciContainerCommandInput,
	type OciContainerCommandResult,
	type OciContainerCommandRunner,
} from "./oci-container-command.ts";
export type { OciContainerWorkerAdapterOptions } from "./container-worker-options.ts";

export const OCI_CONTAINER_WORKER_ENVELOPE_SCHEMA_VERSION = 1 as const;

const MAX_OUTCOME_BYTES = 1024 * 1024;
export interface OciContainerWorkerEnvelope {
	schemaVersion: typeof OCI_CONTAINER_WORKER_ENVELOPE_SCHEMA_VERSION;
	assignment: ImplementationWorkerAssignment;
	outcomePath: string;
}

export interface OciContainerWorkerOutcome {
	status: ImplementationWorkerReport["status"];
	implementationEvidence?: ImplementationWorkerReportInput;
}

export function createOciContainerImplementationWorkerAdapter(
	options: OciContainerWorkerAdapterOptions,
): ImplementationWorkerAdapter {
	const resolved = resolveContainerOptions(options);
	return {
		isolationKinds: ["container"],
		availability: () => inspectContainerRuntime(resolved),
		execute: (assignment, signal) =>
			executeContainerWorker(assignment, signal, resolved),
		recover: recoverImplementationWorkerReport,
	};
}

async function inspectContainerRuntime(
	options: ResolvedContainerOptions,
): Promise<ImplementationWorkerAdapterAvailability> {
	try {
		const result = await options.runner({
			executable: options.runtime,
			args: ["version", "--format", "{{.Server.Version}}"],
			environment: containerRuntimeEnvironment(options.environment),
			timeoutMs: 10_000,
			terminationGraceMs: 1_000,
			maxOutputBytes: 64 * 1024,
		});
		return result.exitCode === 0
			? { available: true }
			: { available: false, reason: "container_runtime_unavailable" };
	} catch {
		return { available: false, reason: "container_runtime_unavailable" };
	}
}

async function executeContainerWorker(
	assignment: ImplementationWorkerAssignment,
	signal: AbortSignal,
	options: ResolvedContainerOptions,
): Promise<ImplementationWorkerReport> {
	assertContainerAssignment(assignment);
	if (signal.aborted) return persistTerminalReport(assignment, "cancelled");
	const availability = await inspectContainerRuntime(options);
	if (!availability.available) {
		throw new Error("Implementation container runtime is unavailable.");
	}
	const worktree = assignment.worktree;
	if (!worktree) {
		throw new Error("Implementation container worktree is missing.");
	}
	const worktreePath = realpathSync(worktree.path);
	const gitMount = await resolveContainerGitMount(
		worktreePath,
		assignment.repoRoot,
	);
	const outcomePath = `${assignment.reportPath}.container-outcome`;
	const containerName = containerWorkerName(assignment);
	await prepareOutcomeFile(assignment, outcomePath);
	const envelope = containerEnvelope(assignment);
	const environment = containerRuntimeEnvironment(options.environment);
	await removeAndVerifyContainer(options, containerName, environment);
	let result: OciContainerCommandResult;
	try {
		result = await options.runner({
			executable: options.runtime,
			args: containerRunArgs({
				assignment,
				options,
				containerName,
				worktreePath,
				gitMount,
				outcomePath,
			}),
			stdin: `${JSON.stringify(envelope)}\n`,
			environment,
			signal,
			timeoutMs: options.timeoutMs,
			terminationGraceMs: options.terminationGraceMs,
			maxOutputBytes: options.maxOutputBytes,
		});
	} catch {
		result = { exitCode: 1 };
	} finally {
		await removeAndVerifyContainer(options, containerName, environment);
	}
	let reportPersisted = false;
	try {
		let report: ImplementationWorkerReport;
		if (signal.aborted || result.cancelled) {
			report = await persistTerminalReport(assignment, "cancelled");
		} else if (
			result.exitCode !== 0 ||
			result.timedOut ||
			result.outputExceeded
		) {
			report = await persistTerminalReport(assignment, "failed");
		} else {
			try {
				const outcome = await readContainerOutcome(outcomePath);
				report = await persistContainerOutcome(assignment, outcome);
			} catch {
				report = await persistTerminalReport(assignment, "failed");
			}
		}
		reportPersisted = true;
		return report;
	} finally {
		if (reportPersisted) await rm(outcomePath, { force: true });
	}
}

function containerEnvelope(
	assignment: ImplementationWorkerAssignment,
): OciContainerWorkerEnvelope {
	return {
		schemaVersion: OCI_CONTAINER_WORKER_ENVELOPE_SCHEMA_VERSION,
		assignment: {
			...assignment,
			repoRoot: "/workspace",
			reportPath: "/codewiki-runtime/outcome.json",
			worktree: assignment.worktree
				? { ...assignment.worktree, path: "/workspace" }
				: undefined,
		},
		outcomePath: "/codewiki-runtime/outcome.json",
	};
}

function containerRunArgs(input: {
	assignment: ImplementationWorkerAssignment;
	options: ResolvedContainerOptions;
	containerName: string;
	worktreePath: string;
	gitMount: ContainerGitMount;
	outcomePath: string;
}): string[] {
	const {
		assignment,
		options,
		containerName,
		worktreePath,
		gitMount,
		outcomePath,
	} = input;
	const args = [
		"run",
		"--rm",
		"--pull",
		"never",
		"--name",
		containerName,
		"--init",
		"--network",
		options.network,
		"--read-only",
		"--cap-drop",
		"ALL",
		"--security-opt",
		"no-new-privileges=true",
		"--pids-limit",
		String(options.pidsLimit),
		"--memory",
		String(options.memoryBytes),
		"--cpus",
		String(options.cpus),
		"--user",
		options.user,
		"--tmpfs",
		`/tmp:rw,noexec,nosuid,nodev,size=${options.tmpfsBytes}`,
		"--mount",
		`type=bind,src=${worktreePath},dst=/workspace,rw`,
		"--mount",
		`type=bind,src=${gitMount.commonDirectory},dst=/codewiki-git,readonly`,
		"--mount",
		`type=bind,src=${outcomePath},dst=/codewiki-runtime/outcome.json,rw`,
		"--env",
		`GIT_DIR=${gitMount.containerGitDirectory}`,
		"--env",
		"GIT_WORK_TREE=/workspace",
		"--env",
		"GIT_OPTIONAL_LOCKS=0",
		"--workdir",
		"/workspace",
	];
	for (const name of Object.keys(options.environment).sort((left, right) =>
		left.localeCompare(right),
	)) {
		args.push("--env", name);
	}
	args.push(
		"--label",
		`codewiki.assignment=${digest(assignment.assignmentId).slice(0, 32)}`,
		options.image,
		...options.workerCommand,
	);
	return args;
}

async function prepareOutcomeFile(
	assignment: ImplementationWorkerAssignment,
	outcomePath: string,
): Promise<void> {
	assertImplementationWorkerReportPath(assignment);
	await mkdir(dirname(assignment.reportPath), { recursive: true, mode: 0o700 });
	await rm(outcomePath, { force: true });
	await writeFile(outcomePath, "", { encoding: "utf8", mode: 0o600, flag: "wx" });
	await chmod(outcomePath, 0o666);
	if (lstatSync(outcomePath).isSymbolicLink()) {
		throw new Error("Implementation container outcome cannot be a symbolic link.");
	}
}

async function readContainerOutcome(
	outcomePath: string,
): Promise<OciContainerWorkerOutcome> {
	const metadata = await stat(outcomePath);
	if (!metadata.isFile() || metadata.size === 0) {
		throw new Error("Implementation container outcome is missing.");
	}
	if (metadata.size > MAX_OUTCOME_BYTES) {
		throw new Error(
			`Implementation container outcome exceeds ${MAX_OUTCOME_BYTES} bytes.`,
		);
	}
	let outcome: OciContainerWorkerOutcome;
	try {
		outcome = JSON.parse(await readFile(outcomePath, "utf8")) as OciContainerWorkerOutcome;
	} catch {
		throw new Error("Implementation container outcome is invalid JSON.");
	}
	if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) {
		throw new Error("Implementation container outcome is invalid.");
	}
	return outcome;
}

async function persistContainerOutcome(
	assignment: ImplementationWorkerAssignment,
	outcome: OciContainerWorkerOutcome,
): Promise<ImplementationWorkerReport> {
	const status = implementationWorkerReportStatus(outcome.status);
	if (status === "completed" && !outcome.implementationEvidence) {
		return persistTerminalReport(assignment, "failed");
	}
	const reportWithoutRef = {
		assignmentId: assignment.assignmentId,
		workerId: assignment.workerId,
		workItemId: assignment.workItemId,
		status,
		...(outcome.implementationEvidence
			? { implementationEvidence: outcome.implementationEvidence }
			: {}),
	} satisfies Omit<ImplementationWorkerReport, "reportRef">;
	try {
		const provisional: ImplementationWorkerReport = {
			...reportWithoutRef,
			reportRef: "container-outcome-validation",
		};
		assertImplementationWorkerReport(assignment, provisional);
	} catch {
		return persistTerminalReport(assignment, "failed");
	}
	return persistImplementationWorkerReport(assignment, reportWithoutRef);
}

function persistTerminalReport(
	assignment: ImplementationWorkerAssignment,
	status: "failed" | "cancelled",
): Promise<ImplementationWorkerReport> {
	return persistImplementationWorkerReport(assignment, {
		assignmentId: assignment.assignmentId,
		workerId: assignment.workerId,
		workItemId: assignment.workItemId,
		status,
		error:
			status === "cancelled"
				? "Implementation container worker was cancelled."
				: "Implementation container worker failed.",
	});
}

async function removeAndVerifyContainer(
	options: ResolvedContainerOptions,
	containerName: string,
	environment: NodeJS.ProcessEnv,
): Promise<void> {
	try {
		await options.runner({
			executable: options.runtime,
			args: ["rm", "--force", containerName],
			environment,
			timeoutMs: 10_000,
			terminationGraceMs: 1_000,
			maxOutputBytes: 64 * 1024,
		});
		const remaining = await options.runner({
			executable: options.runtime,
			args: [
				"container",
				"inspect",
				"--format",
				"{{.Id}}",
				containerName,
			],
			environment,
			timeoutMs: 10_000,
			terminationGraceMs: 1_000,
			maxOutputBytes: 64 * 1024,
		});
		if (remaining.exitCode === 0 || remaining.stdout?.trim()) {
			throw new Error("container still present");
		}
		const runtime = await options.runner({
			executable: options.runtime,
			args: ["version", "--format", "{{.Server.Version}}"],
			environment,
			timeoutMs: 10_000,
			terminationGraceMs: 1_000,
			maxOutputBytes: 64 * 1024,
		});
		if (runtime.exitCode !== 0) {
			throw new Error("container runtime unavailable during cleanup");
		}
	} catch {
		throw new Error(
			"Implementation container cleanup could not prove the exact container stopped.",
		);
	}
}

function assertContainerAssignment(
	assignment: ImplementationWorkerAssignment,
): void {
	assertImplementationWorkerAssignment(assignment);
	assertImplementationWorkerReportPath(assignment);
	if (assignment.isolation.kind !== "container" || !assignment.worktree?.path) {
		throw new Error(
			"OCI container workers require container isolation and an explicit worktree.",
		);
	}
	const canonicalRoot = realpathSync(assignment.repoRoot);
	if (lstatSync(assignment.worktree.path).isSymbolicLink()) {
		throw new Error("Implementation container worktree cannot be a symbolic link.");
	}
	const worktreePath = realpathSync(assignment.worktree.path);
	if (worktreePath === canonicalRoot) {
		throw new Error("Implementation container cannot mount the project checkout.");
	}
	if (/[,\u0000-\u001f]/u.test(worktreePath)) {
		throw new Error("Implementation container worktree path is not mount-safe.");
	}
	if (/[,\u0000-\u001f]/u.test(assignment.reportPath)) {
		throw new Error("Implementation container report path is not mount-safe.");
	}
	const reportDirectory = resolve(dirname(assignment.reportPath));
	const runtimeRoot = resolve(canonicalRoot, ".codewiki", "runtime");
	const reportChild = relative(runtimeRoot, reportDirectory);
	if (!reportChild || reportChild.startsWith("..")) {
		throw new Error("Implementation container report path escaped runtime state.");
	}
}

function containerWorkerName(assignment: ImplementationWorkerAssignment): string {
	return `codewiki-worker-${digest(implementationWorkerJobId(assignment)).slice(0, 32)}`;
}

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}
