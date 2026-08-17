import { stat } from "node:fs/promises";
import {
	assertImplementationWorkerAssignment,
	type ImplementationWorkerAdapter,
	type ImplementationWorkerAssignment,
	type ImplementationWorkerReport,
} from "../../project-server/workers/implementation-adapter.ts";
import {
	assertImplementationWorkerReportPath,
	implementationWorkerReportStatus,
	persistImplementationWorkerReport,
	recoverImplementationWorkerReport,
} from "../../project-server/workers/implementation-report-store.ts";
import {
	createPiProcessSessionFactory,
	type PiProcessSessionFactoryOptions,
	type WorkerSession,
	type WorkerSessionFactory,
} from "./process-session.ts";
import {loadPackSkillSetSnapshot} from "../../checks/packs/loader.ts";
import {
	assertProducerSkillReceipt,
	bindProducerSkills,
	type ProducerSkillReceipt,
} from "../contracts.ts";
import {materializePiProducerSkills} from "./sdk-semantic-session.ts";
import {
	collectWorkerDiscoveries,
	collectWorkerOutputFiles,
	collectWorkerReports,
	type WorkerCompletionInput,
	type WorkerExecutionObservation,
} from "../../project-server/workers/reports.ts";

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
	const skillSnapshot = await loadPackSkillSetSnapshot({
		repoRoot: assignment.worktree.path,
		stage: "implementation",
	});
	const producerSkills = bindProducerSkills(skillSnapshot, "implementation");
	assertProducerSkillReceipt(
		producerSkills.receipt,
		assignment.producerSkillReceipt,
	);
	const materialization = await materializePiProducerSkills(producerSkills);
	const outputFile = `${assignment.reportPath}.worker-output`;
	const processFactory = createPiProcessSessionFactory({
		...options.process,
		cwd: assignment.worktree.path,
		outputFile,
	});
	const sessionFactory = policySessionFactory(processFactory, assignment);
	let worker: WorkerExecutionObservation;
	try {
		worker = await executePiWorkerSession({
			assignment,
			sessionFactory,
			signal,
			promptOptions: options.promptOptions,
			producerSkillReceipt: producerSkills.receipt,
			skillPaths: materialization.skillPaths,
		});
	} finally {
		await materialization.dispose();
	}
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
		producerSkillReceipt: producerSkills.receipt,
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

async function executePiWorkerSession(input: {
	assignment: ImplementationWorkerAssignment;
	sessionFactory: WorkerSessionFactory;
	signal: AbortSignal;
	promptOptions: unknown;
	producerSkillReceipt: ProducerSkillReceipt;
	skillPaths: readonly string[];
}): Promise<WorkerExecutionObservation> {
	const {assignment, sessionFactory, signal} = input;
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
			resourceIsolation: {
				ambientResourcesDisabled: true,
				skillPaths: input.skillPaths,
			},
			prompt: assignment.prompt,
		});
		await session.prompt(assignment.prompt, input.promptOptions, signal);
		return workerObservation({
			assignment,
			session,
			status: "started",
			producerSkillReceipt: input.producerSkillReceipt,
		});
	} catch (error) {
		return workerObservation({
			assignment,
			session,
			status: signal.aborted ? "cancelled" : "failed",
			producerSkillReceipt: input.producerSkillReceipt,
			error: signal.aborted
				? "Implementation worker assignment cancelled."
				: errorMessage(error),
		});
	}
}

function workerObservation(input: {
	assignment: ImplementationWorkerAssignment;
	session?: WorkerSession;
	status: WorkerExecutionObservation["status"];
	producerSkillReceipt: ProducerSkillReceipt;
	error?: string;
}): WorkerExecutionObservation {
	return {
		workUnitId: input.assignment.workItemId,
		workerId: input.assignment.workerId,
		traceId: input.assignment.traceId,
		planningRefs: [...input.assignment.planningRefs],
		claimId: input.assignment.claimId,
		producerSkillReceipt: input.producerSkillReceipt,
		...(input.session?.sessionId ? {sessionId: input.session.sessionId} : {}),
		...(input.session?.sessionFile
			? {sessionFile: input.session.sessionFile}
			: {}),
		...(input.session?.outputFile
			? {outputFile: input.session.outputFile}
			: {}),
		...(input.session?.pid ? {pid: input.session.pid} : {}),
		status: input.status,
		...(input.error ? {error: input.error} : {}),
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
