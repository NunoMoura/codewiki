import { stat } from "node:fs/promises";
import {
	assertImplementationWorkerAssignment,
	type ImplementationWorkerAdapter,
	type ImplementationWorkerAssignment,
	type ImplementationWorkerReport,
} from "../../runtime/workers/implementation-adapter.ts";
import {
	assertImplementationWorkerReportPath,
	implementationWorkerReportStatus,
	persistImplementationWorkerReport,
	recoverImplementationWorkerReport,
} from "../../runtime/workers/implementation-report-store.ts";
import {
	createPiProcessSessionFactory,
	type PiProcessSessionFactoryOptions,
	type WorkerSession,
	type WorkerSessionFactory,
} from "./process-session.ts";
import {
	collectWorkerDiscoveries,
	collectWorkerOutputFiles,
	collectWorkerReports,
	type WorkerCompletionInput,
	type WorkerExecutionObservation,
} from "../../runtime/workers/reports.ts";

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
	const worker = await executePiWorkerSession(
		assignment,
		sessionFactory,
		signal,
		options.promptOptions,
	);
	let completions: WorkerCompletionInput[];
	let implementationEvidence;
	try {
		await assertBoundedFile(outputFile, 2 * 1024 * 1024, "worker output");
		completions = await collectWorkerOutputFiles([worker]);
		implementationEvidence = collectWorkerReports(completions)[0];
	} catch (error) {
		if (worker.status !== "cancelled" || !isNotFound(error)) throw error;
		completions = [{ worker }];
		implementationEvidence = collectWorkerReports(completions)[0];
	}
	if (!implementationEvidence) {
		throw new Error("Pi process worker did not produce a normalized report.");
	}
	const discoveries = collectWorkerDiscoveries(completions);
	const reportWithoutRef = {
		assignmentId: assignment.assignmentId,
		workerId: assignment.workerId,
		workItemId: assignment.workItemId,
		status: implementationWorkerReportStatus(implementationEvidence.status),
		implementationEvidence,
		...(discoveries.length > 0 ? {discoveries} : {}),
		...(worker.sessionId ? { sessionId: worker.sessionId } : {}),
		...(worker.sessionFile ? { sessionFile: worker.sessionFile } : {}),
		...(worker.outputFile ? { outputFile: worker.outputFile } : {}),
		...(worker.pid ? { pid: worker.pid } : {}),
		...(worker.error ? { error: worker.error } : {}),
	} satisfies Omit<ImplementationWorkerReport, "reportRef">;
	return persistImplementationWorkerReport(assignment, reportWithoutRef);
}

function recoverPiProcessWorker(
	assignment: ImplementationWorkerAssignment,
): Promise<ImplementationWorkerReport | undefined> {
	return recoverImplementationWorkerReport(assignment);
}

async function executePiWorkerSession(
	assignment: ImplementationWorkerAssignment,
	sessionFactory: WorkerSessionFactory,
	signal: AbortSignal,
	promptOptions: unknown,
): Promise<WorkerExecutionObservation> {
	let session: WorkerSession | undefined;
	try {
		session = await sessionFactory.create({
			workerId: assignment.workerId,
			workUnitId: assignment.workItemId,
			traceId: assignment.traceId,
			planningRefs: [...assignment.planningRefs],
			pathScopes: [...assignment.pathScopes],
			componentRefs: [...assignment.componentRefs],
			worktree: assignment.worktree,
			prompt: assignment.prompt,
		});
		await session.prompt(assignment.prompt, promptOptions, signal);
		return workerObservation(assignment, session, "started");
	} catch (error) {
		return workerObservation(
			assignment,
			session,
			signal.aborted ? "cancelled" : "failed",
			signal.aborted
				? "Implementation worker assignment cancelled."
				: errorMessage(error),
		);
	}
}

function workerObservation(
	assignment: ImplementationWorkerAssignment,
	session: WorkerSession | undefined,
	status: WorkerExecutionObservation["status"],
	error?: string,
): WorkerExecutionObservation {
	return {
		workUnitId: assignment.workItemId,
		workerId: assignment.workerId,
		traceId: assignment.traceId,
		planningRefs: [...assignment.planningRefs],
		claimId: assignment.claimId,
		...(session?.sessionId ? { sessionId: session.sessionId } : {}),
		...(session?.sessionFile ? { sessionFile: session.sessionFile } : {}),
		...(session?.outputFile ? { outputFile: session.outputFile } : {}),
		...(session?.pid ? { pid: session.pid } : {}),
		status,
		...(error ? { error } : {}),
	};
}

function policySessionFactory(
	factory: WorkerSessionFactory,
	assignment: ImplementationWorkerAssignment,
): WorkerSessionFactory {
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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isNotFound(error: unknown): boolean {
	return Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT",
	);
}
