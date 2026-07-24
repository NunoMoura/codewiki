import { stat } from "node:fs/promises";
import {
	assertImplementationWorkerAssignment,
	type ImplementationWorkerAdapter,
	type ImplementationWorkerAssignment,
	type ImplementationWorkerReport,
} from "../runtime/implementation-worker-adapter.ts";
import {
	assertImplementationWorkerReportPath,
	implementationWorkerReportStatus,
	persistImplementationWorkerReport,
	recoverImplementationWorkerReport,
} from "../runtime/implementation-worker-report-store.ts";
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
	assertImplementationWorkerReportPath(assignment);
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
		signal,
		options: {
			claimEvents: [],
			sessionFactory,
			promptOptions: options.promptOptions,
		},
	});
	let implementationEvidence;
	try {
		await assertBoundedFile(outputFile, 2 * 1024 * 1024, "worker output");
		const completions = await collectPiWorkerOutputFiles([workerStart]);
		implementationEvidence = collectPiWorkerReports(completions)[0];
	} catch (error) {
		if (workerStart.status !== "cancelled" || !isNotFound(error)) throw error;
		implementationEvidence = collectPiWorkerReports([{ workerStart }])[0];
	}
	if (!implementationEvidence) {
		throw new Error("Pi process worker did not produce a normalized report.");
	}
	const reportWithoutRef = {
		assignmentId: assignment.assignmentId,
		workerId: assignment.workerId,
		workItemId: assignment.workItemId,
		status: implementationWorkerReportStatus(implementationEvidence.status),
		implementationEvidence,
		...(workerStart.sessionId ? { sessionId: workerStart.sessionId } : {}),
		...(workerStart.sessionFile
			? { sessionFile: workerStart.sessionFile }
			: {}),
		...(workerStart.outputFile ? { outputFile: workerStart.outputFile } : {}),
		...(workerStart.pid ? { pid: workerStart.pid } : {}),
		...(workerStart.error ? { error: workerStart.error } : {}),
	} satisfies Omit<ImplementationWorkerReport, "reportRef">;
	return persistImplementationWorkerReport(assignment, reportWithoutRef);
}

function recoverPiProcessWorker(
	assignment: ImplementationWorkerAssignment,
): Promise<ImplementationWorkerReport | undefined> {
	return recoverImplementationWorkerReport(assignment);
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
