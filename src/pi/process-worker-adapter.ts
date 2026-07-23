import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
	assertImplementationWorkerAssignment,
	assertImplementationWorkerReport,
	type ImplementationWorkerAdapter,
	type ImplementationWorkerAssignment,
	type ImplementationWorkerReport,
} from "../runtime/implementation-worker-adapter.ts";
import {
	createPiProcessSessionFactory,
	type PiProcessSessionFactoryOptions,
} from "./process-session.ts";
import {
	collectPiWorkerOutputFiles,
	collectPiWorkerReports,
} from "./worker-reports.ts";
import {
	startPiWorkerAssignment,
	type PiWorkerSessionFactory,
} from "./worker-start.ts";

export interface PiProcessImplementationWorkerAdapterOptions {
	process?: PiProcessSessionFactoryOptions;
	promptOptions?: unknown;
}

export function createPiProcessImplementationWorkerAdapter(
	options: PiProcessImplementationWorkerAdapterOptions = {},
): ImplementationWorkerAdapter {
	return {
		isolationKinds: ["worktree"],
		execute: (assignment, signal) =>
			executePiProcessWorker(assignment, signal, options),
		recover: recoverPiProcessWorker,
	};
}

async function executePiProcessWorker(
	assignment: ImplementationWorkerAssignment,
	signal: AbortSignal,
	options: PiProcessImplementationWorkerAdapterOptions,
): Promise<ImplementationWorkerReport> {
	assertImplementationWorkerAssignment(assignment);
	assertReportPath(assignment);
	if (assignment.isolation.kind !== "worktree" || !assignment.worktree?.path) {
		throw new Error("Pi process workers require explicit worktree isolation.");
	}
	if (
		assignment.worktree.baseRef &&
		!assignment.sourceBaseRef.endsWith(assignment.worktree.baseRef)
	) {
		throw new Error("Pi process worker source base does not match worktree.");
	}
	if (signal.aborted)
		throw new Error("Implementation worker assignment aborted.");
	const outputFile = `${assignment.reportPath}.worker-output`;
	const processFactory = createPiProcessSessionFactory({
		...options.process,
		cwd: assignment.worktree.path,
		outputFile,
	});
	const sessionFactory = policySessionFactory(processFactory, assignment);
	const workerStart = await startPiWorkerAssignment({
		item: {
			workUnitId: assignment.workItemId,
			traceId: assignment.traceId,
			title: assignment.workItemId,
			planningRefs: [...assignment.planningRefs],
			componentRefs: [...assignment.componentRefs],
			pathScopes: [...assignment.pathScopes],
			traceRefs: [...assignment.traceRefs],
			...(assignment.worktree ? { worktree: assignment.worktree } : {}),
		},
		workerId: assignment.workerId,
		claimId: assignment.claimId,
		prompt: assignment.prompt,
		options: {
			claimEvents: [],
			sessionFactory,
			promptOptions: options.promptOptions,
		},
	});
	if (signal.aborted)
		throw new Error("Implementation worker assignment aborted.");
	await assertBoundedFile(outputFile, 2 * 1024 * 1024, "worker output");
	const completions = await collectPiWorkerOutputFiles([workerStart]);
	const implementationEvidence = collectPiWorkerReports(completions)[0];
	if (!implementationEvidence) {
		throw new Error("Pi process worker did not produce a normalized report.");
	}
	const reportWithoutRef = {
		assignmentId: assignment.assignmentId,
		workerId: assignment.workerId,
		workItemId: assignment.workItemId,
		status: workerReportStatus(implementationEvidence.status),
		implementationEvidence,
		...(workerStart.sessionId ? { sessionId: workerStart.sessionId } : {}),
		...(workerStart.sessionFile
			? { sessionFile: workerStart.sessionFile }
			: {}),
		...(workerStart.outputFile ? { outputFile: workerStart.outputFile } : {}),
		...(workerStart.pid ? { pid: workerStart.pid } : {}),
		...(workerStart.error ? { error: workerStart.error } : {}),
	} satisfies Omit<ImplementationWorkerReport, "reportRef">;
	const reportRef = workerReportRef(reportWithoutRef);
	const report: ImplementationWorkerReport = {
		...reportWithoutRef,
		reportRef,
	};
	assertImplementationWorkerReport(assignment, report);
	await writeReport(assignment.reportPath, report);
	return report;
}

async function recoverPiProcessWorker(
	assignment: ImplementationWorkerAssignment,
): Promise<ImplementationWorkerReport | undefined> {
	assertImplementationWorkerAssignment(assignment);
	assertReportPath(assignment);
	let source: string;
	try {
		await assertBoundedFile(
			assignment.reportPath,
			1024 * 1024,
			"worker recovery report",
		);
		source = await readFile(assignment.reportPath, "utf8");
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw error;
	}
	let report: ImplementationWorkerReport;
	try {
		report = JSON.parse(source) as ImplementationWorkerReport;
	} catch {
		throw new Error("Implementation worker recovery report is invalid JSON.");
	}
	assertImplementationWorkerReport(assignment, report);
	const { reportRef, ...reportWithoutRef } = report;
	if (reportRef !== workerReportRef(reportWithoutRef)) {
		throw new Error(
			"Implementation worker recovery report digest does not match.",
		);
	}
	return report;
}

function policySessionFactory(
	factory: PiWorkerSessionFactory,
	assignment: ImplementationWorkerAssignment,
): PiWorkerSessionFactory {
	if (!assignment.executionPolicy) return factory;
	return {
		create(input) {
			return factory.create({
				...input,
				executionPolicy: assignment.executionPolicy,
			});
		},
	};
}

async function writeReport(
	path: string,
	report: ImplementationWorkerReport,
): Promise<void> {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temporaryPath = `${path}.${process.pid}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(report)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	await rename(temporaryPath, path);
}

function assertReportPath(assignment: ImplementationWorkerAssignment): void {
	const runtimeRoot = resolve(
		realpathSync(assignment.repoRoot),
		".codewiki",
		"runtime",
	);
	const target = resolve(assignment.reportPath);
	const child = relative(runtimeRoot, target);
	if (!child || child.startsWith("..") || child.includes("\0")) {
		throw new Error(
			"Implementation worker reportPath must stay below .codewiki/runtime.",
		);
	}
	let current = realpathSync(assignment.repoRoot);
	for (const segment of [
		".codewiki",
		"runtime",
		...child.split(/[\\/]/).slice(0, -1),
	]) {
		current = resolve(current, segment);
		if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
			throw new Error(
				"Implementation worker reportPath cannot traverse symbolic links.",
			);
		}
	}
}

function workerReportRef(
	report: Omit<ImplementationWorkerReport, "reportRef">,
): string {
	return `runtime-worker-report:${createHash("sha256")
		.update(JSON.stringify(report))
		.digest("hex")}`;
}

function workerReportStatus(
	status: string | undefined,
): ImplementationWorkerReport["status"] {
	if (status === "completed" || status === "blocked" || status === "failed") {
		return status;
	}
	return "failed";
}

async function assertBoundedFile(
	path: string,
	maxBytes: number,
	label: string,
): Promise<void> {
	try {
		const metadata = await stat(path);
		if (metadata.size > maxBytes) {
			throw new Error(`Implementation ${label} exceeds ${maxBytes} bytes.`);
		}
	} catch (error) {
		if (!isNotFound(error)) throw error;
	}
}

function isNotFound(error: unknown): boolean {
	return Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT",
	);
}
