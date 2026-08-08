import {
	assertImplementationWorkerAssignment,
	assertImplementationWorkerReport,
	implementationWorkerJobId,
	type ImplementationWorkerAdapter,
	type ImplementationWorkerAssignment,
	type ImplementationWorkerReport,
} from "./implementation-adapter.ts";
import type { ProjectCoordinator } from "../coordinator/project.ts";

export interface ScheduleImplementationWorkerAssignmentsInput {
	coordinator: ProjectCoordinator;
	adapter: ImplementationWorkerAdapter;
	assignments: ImplementationWorkerAssignment[];
}

export interface ImplementationWorkerJobReceipt {
	jobId: string;
	assignmentId: string;
	workItemId: string;
	report: ImplementationWorkerReport;
}

export function scheduleImplementationWorkerAssignments(
	input: ScheduleImplementationWorkerAssignmentsInput,
): Promise<ImplementationWorkerJobReceipt[]> {
	const assignmentIds = new Set<string>();
	const workItemIds = new Set<string>();
	for (const assignment of input.assignments) {
		assertImplementationWorkerAssignment(assignment);
		if (assignmentIds.has(assignment.assignmentId)) {
			throw new Error(
				`Duplicate implementation worker assignment ${assignment.assignmentId}.`,
			);
		}
		if (workItemIds.has(assignment.workItemId)) {
			throw new Error(
				`Implementation worker batch repeats Work Item ${assignment.workItemId}.`,
			);
		}
		assignmentIds.add(assignment.assignmentId);
		workItemIds.add(assignment.workItemId);
	}
	return Promise.all(
		input.assignments.map((assignment) =>
			scheduleImplementationWorkerAssignment({
				coordinator: input.coordinator,
				adapter: input.adapter,
				assignment,
			}),
		),
	);
}

export async function scheduleImplementationWorkerAssignment(input: {
	coordinator: ProjectCoordinator;
	adapter: ImplementationWorkerAdapter;
	assignment: ImplementationWorkerAssignment;
}): Promise<ImplementationWorkerJobReceipt> {
	const { assignment } = input;
	assertImplementationWorkerAssignment(assignment);
	const jobId = implementationWorkerJobId(assignment);
	const report = await input.coordinator.schedule({
		idempotencyKey: jobId,
		lane: { kind: "assignment", workItemId: assignment.workItemId },
		effect: "write",
		conflictRefs: assignmentConflictRefs(assignment),
		recover: async () => {
			const recovered = await input.adapter.recover(assignment);
			if (!recovered) return undefined;
			assertImplementationWorkerReport(assignment, recovered);
			return { status: "completed", result: recovered };
		},
		run: async (signal) => {
			const executed = await input.adapter.execute(assignment, signal);
			assertImplementationWorkerReport(assignment, executed);
			return executed;
		},
	});
	return {
		jobId,
		assignmentId: assignment.assignmentId,
		workItemId: assignment.workItemId,
		report: report,
	};
}

function assignmentConflictRefs(
	assignment: ImplementationWorkerAssignment,
): string[] {
	return [
		`work-item:${assignment.workItemId}`,
		`claim:${assignment.claimId}`,
		...assignment.componentRefs.map((ref) => `component:${ref}`),
		...assignment.pathScopes.map((scope) => `path:${scope}`),
	];
}
