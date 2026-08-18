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
	workUnitId: string;
	report: ImplementationWorkerReport;
}

export function scheduleImplementationWorkerAssignments(
	input: ScheduleImplementationWorkerAssignmentsInput,
): Promise<ImplementationWorkerJobReceipt[]> {
	const assignmentIds = new Set<string>();
	const workUnitIds = new Set<string>();
	for (const assignment of input.assignments) {
		assertImplementationWorkerAssignment(assignment);
		if (assignmentIds.has(assignment.assignmentId)) {
			throw new Error(
				`Duplicate implementation worker assignment ${assignment.assignmentId}.`,
			);
		}
		if (workUnitIds.has(assignment.workUnitId)) {
			throw new Error(
				`Implementation worker batch repeats Work Unit ${assignment.workUnitId}.`,
			);
		}
		assignmentIds.add(assignment.assignmentId);
		workUnitIds.add(assignment.workUnitId);
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
		lane: { kind: "assignment", workUnitId: assignment.workUnitId },
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
		workUnitId: assignment.workUnitId,
		report: report,
	};
}

function assignmentConflictRefs(
	assignment: ImplementationWorkerAssignment,
): string[] {
	return [
		`work-unit:${assignment.workUnitId}`,
		`claim:${assignment.claimId}`,
		...assignment.componentRefs.map((ref) => `component:${ref}`),
		...assignment.pathScopes.map((scope) => `path:${scope}`),
	];
}
