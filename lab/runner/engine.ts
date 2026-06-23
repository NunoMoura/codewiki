import type {
	LabExitResult,
	LabStandard,
	LabStandardMode,
	LabStandardResult,
	LabVerdict,
} from "./types.ts";

export interface RunLabExitInput<TInput> {
	input: TInput;
	standards: LabStandard<TInput>[];
	threshold?: number;
}

export function runLabExit<TInput>({
	input,
	standards,
	threshold = 1,
}: RunLabExitInput<TInput>): LabExitResult {
	const results = standards.map((standard) => normalizeResult(standard, input));
	const totalWeight = results.reduce((sum, result) => sum + result.weight, 0);
	const metWeight = results
		.filter((result) => result.passed)
		.reduce((sum, result) => sum + result.weight, 0);
	const weightedScore = totalWeight === 0 ? 0 : metWeight / totalWeight;
	const failed = results.filter((result) => !result.passed);
	const verdict = failed.some((result) => result.route === "block")
		? "block"
		: weightedScore >= threshold
			? "pass"
			: "fail";
	return {
		verdict,
		weightedScore,
		metWeight,
		totalWeight,
		standards: results,
	};
}

export function countStandardModes<TInput>(
	standards: LabStandard<TInput>[],
): Record<LabStandardMode, number> {
	return standards.reduce(
		(counts, standard) => {
			counts[standard.mode] += 1;
			return counts;
		},
		{ deterministic: 0, agent: 0, user: 0 },
	);
}

function normalizeResult<TInput>(
	standard: LabStandard<TInput>,
	input: TInput,
): LabStandardResult {
	const result = standard.evaluate(input);
	if (typeof result === "boolean") {
		return {
			id: standard.id,
			mode: standard.mode,
			weight: standard.weight,
			passed: result,
			route: "fail",
			description: standard.description,
		};
	}
	return {
		id: result.id || standard.id,
		mode: result.mode || standard.mode,
		weight: positiveNumber(result.weight) || standard.weight,
		passed: result.passed,
		route: route(result.route),
		description: result.description || standard.description,
		...(result.message ? { message: result.message } : {}),
	};
}

function route(value: string): LabVerdict {
	return value === "pass" || value === "fail" || value === "block"
		? value
		: "fail";
}

function positiveNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: 0;
}
