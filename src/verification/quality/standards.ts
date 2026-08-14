import type {
	ExitCriterionResult,
	LoopQualityStandardMode,
	LoopQualityStandardResult,
} from "../../changes/trace/types.ts";

export interface LoopQualityStandardDefinition<TCode extends string> {
	id: string;
	description: string;
	codes: TCode[];
	mode?: LoopQualityStandardMode;
	weight?: number;
	evidenceRefs?: string[];
}

export interface BuildLoopQualityStandardOptions<TIssue, TCode extends string> {
	definition: LoopQualityStandardDefinition<TCode>;
	issues: TIssue[];
	issueCode: (issue: TIssue) => TCode;
	issueMessage: (issue: TIssue) => string;
	issueRefs: (issue: TIssue) => string[];
	isBlockingIssue?: (issue: TIssue) => boolean;
}

export function buildLoopQualityStandard<TIssue, TCode extends string>(
	options: BuildLoopQualityStandardOptions<TIssue, TCode>,
): LoopQualityStandardResult {
	const matched = options.issues.filter((issue) =>
		options.definition.codes.includes(options.issueCode(issue)),
	);
	return {
		id: options.definition.id,
		status:
			matched.length > 0 &&
			matched.some((issue) => options.isBlockingIssue?.(issue) || false)
				? "blocked"
				: matched.length > 0
					? "unmet"
					: "met",
		mode: options.definition.mode || "deterministic",
		weight: options.definition.weight,
		description: options.definition.description,
		...(matched.length > 0
			? { message: matched.map(options.issueMessage).join(" ") }
			: {}),
		...(matched.length > 0
			? { refs: uniqueStrings(matched.flatMap(options.issueRefs)) }
			: {}),
		...(options.definition.evidenceRefs &&
		options.definition.evidenceRefs.length > 0
			? { evidenceRefs: uniqueStrings(options.definition.evidenceRefs) }
			: {}),
	};
}

export function criteriaFromQualityStandards(
	standards: LoopQualityStandardResult[],
): ExitCriterionResult[] {
	return standards.map((standardResult) => ({
		id: standardResult.id,
		status: loopQualityStandardSatisfied(standardResult)
			? "pass"
			: standardResult.status === "blocked"
				? "block"
				: "fail",
		...(standardResult.message ? { message: standardResult.message } : {}),
		...(standardResult.refs ? { refs: standardResult.refs } : {}),
	}));
}

export function loopQualityStandardSatisfied(
	standard: Pick<LoopQualityStandardResult, "status">,
): boolean {
	return (
		standard.status === "met" ||
		standard.status === "not_applicable" ||
		standard.status === "escalated"
	);
}

export function uniqueStrings(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
