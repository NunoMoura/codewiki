import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import type {
	LabCase,
	LabExpectedFailure,
	LabLoop,
	LabVerdict,
} from "./types.ts";

export interface LabHoldoutCase extends LabCase<unknown> {
	suiteId: string;
}

export interface LabHoldoutSuite {
	id: string;
	description?: string;
	cases: LabHoldoutCase[];
}

export interface LabHoldoutBundle {
	version: 1;
	suites: LabHoldoutSuite[];
	filePath: string;
}

export interface LoadLabHoldoutOptions {
	filePath: string;
	repoRoot?: string;
	allowRepoLocal?: boolean;
}

const LAB_LOOPS = new Set<LabLoop>(["decision", "planning", "implementation"]);
const LAB_VERDICTS = new Set<LabVerdict>(["pass", "fail", "block"]);

export function loadLabHoldoutBundle({
	filePath,
	repoRoot = process.cwd(),
	allowRepoLocal = false,
}: LoadLabHoldoutOptions): LabHoldoutBundle {
	const resolvedFilePath = resolve(filePath);
	if (!existsSync(resolvedFilePath)) {
		throw new Error(`Lab holdout file does not exist: ${resolvedFilePath}`);
	}
	if (!allowRepoLocal && isInsidePath(resolvedFilePath, resolve(repoRoot))) {
		throw new Error(
			"Lab holdout files must live outside the repository so candidate agents cannot inspect or edit them.",
		);
	}
	const parsed = JSON.parse(readFileSync(resolvedFilePath, "utf8"));
	return validateHoldoutBundle(parsed, resolvedFilePath);
}

function validateHoldoutBundle(
	value: unknown,
	filePath: string,
): LabHoldoutBundle {
	const record = objectRecord(value, "holdout bundle");
	if (record.version !== 1) {
		throw new Error("Lab holdout bundle version must be 1.");
	}
	const suitesValue = record.suites;
	if (!Array.isArray(suitesValue) || suitesValue.length === 0) {
		throw new Error("Lab holdout bundle must include at least one suite.");
	}
	const suiteIds = new Set<string>();
	const caseIds = new Set<string>();
	const suites = suitesValue.map((suiteValue): LabHoldoutSuite => {
		const suiteRecord = objectRecord(suiteValue, "holdout suite");
		const id = stringValue(suiteRecord.id, "suite.id");
		if (suiteIds.has(id)) throw new Error(`Duplicate holdout suite id: ${id}`);
		suiteIds.add(id);
		const casesValue = suiteRecord.cases;
		if (!Array.isArray(casesValue) || casesValue.length === 0) {
			throw new Error(`Holdout suite ${id} must include at least one case.`);
		}
		const cases = casesValue.map((caseValue): LabHoldoutCase => {
			const testCase = validateHoldoutCase(caseValue, id);
			const uniqueCaseId = `${testCase.loop}/${testCase.id}`;
			if (caseIds.has(uniqueCaseId)) {
				throw new Error(`Duplicate holdout case id: ${uniqueCaseId}`);
			}
			caseIds.add(uniqueCaseId);
			return testCase;
		});
		return {
			id,
			...(typeof suiteRecord.description === "string"
				? { description: suiteRecord.description }
				: {}),
			cases,
		};
	});
	return { version: 1, suites, filePath };
}

function validateHoldoutCase(value: unknown, suiteId: string): LabHoldoutCase {
	const record = objectRecord(value, "holdout case");
	const loop = labLoop(record.loop);
	const expected = labVerdict(record.expected);
	const input = objectRecord(record.input, "holdout case input");
	const weight = positiveNumber(record.weight, "case.weight");
	const expectedFailures = optionalExpectedFailures(record.expectedFailures);
	return {
		suiteId,
		id: stringValue(record.id, "case.id"),
		loop,
		description: stringValue(record.description, "case.description"),
		input,
		expected,
		weight,
		...(expectedFailures ? { expectedFailures } : {}),
	};
}

function optionalExpectedFailures(
	value: unknown,
): LabExpectedFailure[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		throw new Error("Expected case.expectedFailures to be an array.");
	}
	return value.map((failureValue, index): LabExpectedFailure => {
		const failure = objectRecord(
			failureValue,
			`case.expectedFailures[${index}]`,
		);
		return {
			standardId: stringValue(
				failure.standardId,
				`case.expectedFailures[${index}].standardId`,
			),
			failureClass: stringValue(
				failure.failureClass,
				`case.expectedFailures[${index}].failureClass`,
			),
		};
	});
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`Expected ${label} to be an object.`);
	}
	return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Expected ${label} to be a non-empty string.`);
	}
	return value;
}

function positiveNumber(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new Error(`Expected ${label} to be a positive number.`);
	}
	return value;
}

function labLoop(value: unknown): LabLoop {
	if (
		value === "decision" ||
		value === "planning" ||
		value === "implementation"
	) {
		return value;
	}
	throw new Error(
		`Expected case.loop to be one of ${[...LAB_LOOPS].join(", ")}.`,
	);
}

function labVerdict(value: unknown): LabVerdict {
	if (value === "pass" || value === "fail" || value === "block") return value;
	throw new Error(
		`Expected case.expected to be one of ${[...LAB_VERDICTS].join(", ")}.`,
	);
}

function isInsidePath(filePath: string, parentPath: string): boolean {
	const pathFromParent = relative(parentPath, filePath);
	return (
		Boolean(pathFromParent) &&
		!pathFromParent.startsWith("..") &&
		!pathFromParent.startsWith("/")
	);
}
