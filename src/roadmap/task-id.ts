import { unique } from "../domain/shared/utils.ts";

export function taskIdCandidates(taskId: string): string[] {
	const trimmed = taskId.trim();
	if (!trimmed) return [];
	const upper = trimmed.toUpperCase();
	const sequence = parseTaskIdSequence(upper);
	if (sequence === null) return unique([trimmed, upper]);
	return unique([
		trimmed,
		upper,
		formatTaskId(sequence),
	]);
}

export function parseTaskIdSequence(taskId: string): number | null {
	const match = taskId.match(/^TASK-(\d+)$/i);
	return match ? parseInt(match[1], 10) : null;
}

export function formatTaskId(sequence: number): string {
	return `TASK-${String(sequence).padStart(3, "0")}`;
}

export function isRoadmapTaskToken(value: string): boolean {
	return /^TASK-\d+$/i.test(value);
}
