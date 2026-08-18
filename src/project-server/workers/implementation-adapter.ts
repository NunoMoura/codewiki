import { createHash } from "node:crypto";
import type { ImplementationWorkerReportInput } from "../../loops/implementation/workers.ts";
import type { ChangeIntakeContent } from "../../changes/intake/contracts.ts";
import { normalizeChangeIntakeContent } from "../../changes/intake/normalize.ts";
import type { WorktreeRef } from "../../git/worktrees.ts";
import {
	assertProducerSkillReceipt,
	type ProducerSkillReceipt,
	type WorkerExecutionPort,
} from "../../runtime/contracts.ts";
import type { WorkerExecutionPolicySnapshot } from "./execution-policy.ts";

export const IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION = 3 as const;

export interface ImplementationWorkerAssignment {
	schemaVersion: typeof IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION;
	repoRoot: string;
	assignmentId: string;
	workerId: string;
	workUnitId: string;
	claimId: string;
	traceId: string;
	planningRefs: string[];
	traceRefs: string[];
	componentRefs: string[];
	pathScopes: string[];
	workStateDigest: string;
	sourceBaseRef: string;
	contextDigest: string;
	producerSkillReceipt: ProducerSkillReceipt;
	prompt: string;
	reportPath: string;
	isolation:
		| { kind: "worktree"; ref: string }
		| { kind: "container"; ref: string };
	worktree: WorktreeRef;
	executionPolicy?: WorkerExecutionPolicySnapshot;
}

export interface ImplementationWorkerReport {
	assignmentId: string;
	workerId: string;
	workUnitId: string;
	status: "completed" | "blocked" | "failed" | "cancelled";
	reportRef: string;
	producerSkillReceipt: ProducerSkillReceipt;
	implementationEvidence?: ImplementationWorkerReportInput;
	discoveries?: readonly ChangeIntakeContent[];
	sessionId?: string;
	sessionFile?: string;
	outputFile?: string;
	pid?: number;
	error?: string;
}

export interface ImplementationWorkerAdapterAvailability {
	available: boolean;
	reason?: string;
}

export interface ImplementationWorkerAdapter
	extends WorkerExecutionPort<
		ImplementationWorkerAssignment,
		ImplementationWorkerReport,
		ImplementationWorkerAdapterAvailability
	> {
	isolationKinds?: readonly ImplementationWorkerAssignment["isolation"]["kind"][];
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
				workUnitId: assignment.workUnitId,
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
				producerSkillSetDigest: assignment.producerSkillReceipt.skillSetDigest,
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
			"Implementation worker assignment schemaVersion must be 3.",
		);
	}
	for (const [field, value] of Object.entries({
		repoRoot: assignment.repoRoot,
		assignmentId: assignment.assignmentId,
		workerId: assignment.workerId,
		workUnitId: assignment.workUnitId,
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
	assertProducerSkillReceipt(assignment.producerSkillReceipt);
	if (assignment.producerSkillReceipt.stage !== "implementation") {
		throw new Error(
			"Implementation worker assignment requires an Implementation Skill receipt.",
		);
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
	if (!assignment.worktree?.path?.trim()) {
		throw new Error(
			"Implementation worker assignment requires isolated worktree custody.",
		);
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
		report.workUnitId !== assignment.workUnitId
	) {
		throw new Error(
			"Implementation worker report identity does not match assignment.",
		);
	}
	if (!report.reportRef.trim()) {
		throw new Error("Implementation worker report ref is required.");
	}
	assertProducerSkillReceipt(
		report.producerSkillReceipt,
		assignment.producerSkillReceipt,
	);
	if (report.implementationEvidence) {
		if (
			report.implementationEvidence.workerId !== assignment.workerId ||
			report.implementationEvidence.workUnitId !== assignment.workUnitId
		) {
			throw new Error(
				"Implementation worker evidence identity does not match assignment.",
			);
		}
		if (report.implementationEvidence.status !== report.status) {
			throw new Error(
				"Implementation worker evidence status does not match report.",
			);
		}
	}
	if (report.discoveries) {
		if (!Array.isArray(report.discoveries) || report.discoveries.length > 16) {
			throw new Error("Implementation worker report may contain at most 16 discoveries.");
		}
		for (const discovery of report.discoveries) {
			normalizeChangeIntakeContent(discovery);
		}
	}
	if (
		!(["completed", "blocked", "failed", "cancelled"] as const).includes(
			report.status,
		)
	) {
		throw new Error("Implementation worker report status is invalid.");
	}
}
