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
	lossThreshold?: number;
}

export function runLabExit<TInput>({
	input,
	standards,
	threshold = 1,
	lossThreshold = 0,
}: RunLabExitInput<TInput>): LabExitResult {
	const results = standards.map((standard) => normalizeResult(standard, input));
	const totalWeight = results.reduce((sum, result) => sum + result.weight, 0);
	const metWeight = results
		.filter((result) => result.passed)
		.reduce((sum, result) => sum + result.weight, 0);
	const weightedScore = totalWeight === 0 ? 0 : metWeight / totalWeight;
	const loss = results.reduce((sum, result) => sum + (result.loss || 0), 0);
	const maxLoss = results.reduce(
		(sum, result) => sum + (result.cost || result.weight),
		0,
	);
	const normalizedLoss = maxLoss === 0 ? 0 : loss / maxLoss;
	const failed = results.filter((result) => !result.passed);
	const hasBlockingFailure = failed.some((result) => result.route === "block");
	const hasHardGateFailure = failed.some(
		(result) => result.hardGate || result.layer === "hard_gate",
	);
	const verdict = hasBlockingFailure
		? "block"
		: hasHardGateFailure
			? "fail"
			: weightedScore >= threshold && normalizedLoss <= lossThreshold
				? "pass"
				: "fail";
	return {
		verdict,
		weightedScore,
		metWeight,
		totalWeight,
		loss,
		maxLoss,
		normalizedLoss,
		lossThreshold,
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
	return typeof result === "boolean"
		? normalizeBooleanResult(standard, { passed: result })
		: normalizeObjectResult(standard, result);
}

function normalizeBooleanResult<TInput>(
	standard: LabStandard<TInput>,
	{ passed }: { passed: boolean },
): LabStandardResult {
	const cost = positiveNumber(standard.cost) || standard.weight;
	const score = passed ? 0 : 1;
	return withOptionalResultFields(
		{
			id: standard.id,
			mode: standard.mode,
			weight: standard.weight,
			passed,
			route: "fail",
			description: standard.description,
			score,
			cost,
			loss: score * cost,
		},
		{
			method: standard.method,
			standardType: standard.standardType,
			layer: standard.layer,
			hardGate: standard.hardGate,
			repairTarget: standard.repairTarget,
		},
	);
}

function normalizeObjectResult<TInput>(
	standard: LabStandard<TInput>,
	result: LabStandardResult,
): LabStandardResult {
	const weight = positiveNumber(result.weight) || standard.weight;
	const cost =
		positiveNumber(result.cost) || positiveNumber(standard.cost) || weight;
	const score = boundedScore(
		typeof result.score === "number" ? result.score : result.passed ? 0 : 1,
	);
	return withOptionalResultFields(
		{
			id: result.id || standard.id,
			mode: result.mode || standard.mode,
			weight,
			passed: result.passed,
			route: route(result.route),
			description: result.description || standard.description,
			score,
			cost,
			loss: score * cost,
		},
		{
			method: result.method || standard.method,
			standardType: result.standardType || standard.standardType,
			layer: result.layer || standard.layer,
			hardGate: result.hardGate || standard.hardGate,
			repairTarget: result.repairTarget || standard.repairTarget,
			evidence: result.evidence,
			message: result.message,
		},
	);
}

function withOptionalResultFields(
	base: LabStandardResult,
	fields: Partial<LabStandardResult>,
): LabStandardResult {
	return {
		...base,
		...(fields.method ? { method: fields.method } : {}),
		...(fields.standardType ? { standardType: fields.standardType } : {}),
		...(fields.layer ? { layer: fields.layer } : {}),
		...(fields.hardGate ? { hardGate: true } : {}),
		...(fields.repairTarget ? { repairTarget: fields.repairTarget } : {}),
		...(fields.evidence ? { evidence: fields.evidence } : {}),
		...(fields.message ? { message: fields.message } : {}),
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

function boundedScore(value: number): number {
	if (!Number.isFinite(value)) return 1;
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}
