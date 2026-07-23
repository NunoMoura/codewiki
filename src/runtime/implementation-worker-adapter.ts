import { createHash } from "node:crypto";
import type { ImplementationWorkerReportInput } from "../implementation/workers.ts";
import type { WorktreeRef } from "../git/worktrees.ts";
import type { WorkerExecutionPolicySnapshot } from "./execution-policy.ts";

export const IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION = 1 as const;

export interface ImplementationWorkerAssignment {
	schemaVersion: typeof IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION;
	repoRoot: string;
	assignmentId: string;
	workerId: string;
	workItemId: string;
	claimId: string;
	traceId: string;
	planningRefs: string[];
	traceRefs: string[];
	componentRefs: string[];
	pathScopes: string[];
	workStateDigest: string;
	sourceBaseRef: string;
	contextDigest: string;
	prompt: string;
	reportPath: string;
	isolation:
		| { kind: "worktree"; ref: string }
		| { kind: "container"; ref: string };
	worktree?: WorktreeRef;
	executionPolicy?: WorkerExecutionPolicySnapshot;
}

export interface ImplementationWorkerReport {
	assignmentId: string;
	workerId: string;
	workItemId: string;
	status: "completed" | "blocked" | "failed";
	reportRef: string;
	implementationEvidence?: ImplementationWorkerReportInput;
	sessionId?: string;
	sessionFile?: string;
	outputFile?: string;
	pid?: number;
	error?: string;
}

export interface ImplementationWorkerAdapter {
	isolationKinds?: readonly ImplementationWorkerAssignment["isolation"]["kind"][];
	execute(
		assignment: ImplementationWorkerAssignment,
		signal: AbortSignal,
	): Promise<ImplementationWorkerReport>;
	recover(
		assignment: ImplementationWorkerAssignment,
	): Promise<ImplementationWorkerReport | undefined>;
}

export function implementationWorkerJobId(
	assignment: ImplementationWorkerAssignment,
): string {
	assertImplementationWorkerAssignment(assignment);
	return `implementation-worker:${createHash("sha256")
		.update(
			JSON.stringify({
				schemaVersion: assignment.schemaVersion,
				repoRoot: assignment.repoRoot,
				assignmentId: assignment.assignmentId,
				workerId: assignment.workerId,
				workItemId: assignment.workItemId,
				claimId: assignment.claimId,
				traceId: assignment.traceId,
				planningRefs: [...assignment.planningRefs].sort(compareText),
				traceRefs: [...assignment.traceRefs].sort(compareText),
				componentRefs: [...assignment.componentRefs].sort(compareText),
				pathScopes: [...assignment.pathScopes].sort(compareText),
				workStateDigest: assignment.workStateDigest,
				sourceBaseRef: assignment.sourceBaseRef,
				contextDigest: assignment.contextDigest,
				promptDigest: createHash("sha256")
					.update(assignment.prompt)
					.digest("hex"),
				reportPath: assignment.reportPath,
				isolation: assignment.isolation,
				worktree: assignment.worktree,
				executionPolicyDigest: assignment.executionPolicy?.digest,
			}),
		)
		.digest("hex")}`;
}

export function assertImplementationWorkerAssignment(
	assignment: ImplementationWorkerAssignment,
): void {
	if (
		assignment.schemaVersion !== IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION
	) {
		throw new Error(
			"Implementation worker assignment schemaVersion must be 1.",
		);
	}
	for (const [field, value] of Object.entries({
		repoRoot: assignment.repoRoot,
		assignmentId: assignment.assignmentId,
		workerId: assignment.workerId,
		workItemId: assignment.workItemId,
		claimId: assignment.claimId,
		traceId: assignment.traceId,
		workStateDigest: assignment.workStateDigest,
		sourceBaseRef: assignment.sourceBaseRef,
		contextDigest: assignment.contextDigest,
		prompt: assignment.prompt,
		reportPath: assignment.reportPath,
	})) {
		if (typeof value !== "string" || !value.trim()) {
			throw new Error(`Implementation worker assignment ${field} is required.`);
		}
	}
	if (Buffer.byteLength(assignment.prompt, "utf8") > 64 * 1024) {
		throw new Error("Implementation worker assignment prompt exceeds 64 KiB.");
	}
	for (const [field, values] of Object.entries({
		planningRefs: assignment.planningRefs,
		traceRefs: assignment.traceRefs,
		componentRefs: assignment.componentRefs,
		pathScopes: assignment.pathScopes,
	})) {
		if (
			!Array.isArray(values) ||
			values.length > 256 ||
			values.some((value) => typeof value !== "string" || !value.trim())
		) {
			throw new Error(`Implementation worker assignment ${field} is invalid.`);
		}
	}
	if (
		!assignment.isolation ||
		!(["worktree", "container"] as const).includes(assignment.isolation.kind) ||
		!assignment.isolation.ref?.trim()
	) {
		throw new Error("Implementation worker assignment isolation is invalid.");
	}
	if (
		assignment.planningRefs.length === 0 ||
		assignment.pathScopes.length === 0
	) {
		throw new Error(
			"Implementation worker assignment requires planningRefs and pathScopes.",
		);
	}
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

export function assertImplementationWorkerReport(
	assignment: ImplementationWorkerAssignment,
	report: ImplementationWorkerReport,
): void {
	if (
		report.assignmentId !== assignment.assignmentId ||
		report.workerId !== assignment.workerId ||
		report.workItemId !== assignment.workItemId
	) {
		throw new Error(
			"Implementation worker report identity does not match assignment.",
		);
	}
	if (!report.reportRef.trim()) {
		throw new Error("Implementation worker report ref is required.");
	}
	if (
		report.implementationEvidence &&
		(report.implementationEvidence.workerId !== assignment.workerId ||
			report.implementationEvidence.workUnitId !== assignment.workItemId)
	) {
		throw new Error(
			"Implementation worker evidence identity does not match assignment.",
		);
	}
	if (!(["completed", "blocked", "failed"] as const).includes(report.status)) {
		throw new Error("Implementation worker report status is invalid.");
	}
}
