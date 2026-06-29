#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { loadLabHoldoutBundle } from "./holdout.ts";
import { loadJudgeCalibrationBundle } from "./judge-calibration.ts";

export type SealedTemplateKind = "all" | "holdout" | "judge-calibration";

export interface SealedTemplateOptions {
	repoRoot?: string;
	outDir?: string;
	kind?: SealedTemplateKind;
	allowRepoLocal?: boolean;
	stdout?: boolean;
}

export interface SealedTemplateFileReport {
	kind: Exclude<SealedTemplateKind, "all">;
	filePath?: string;
	caseCount: number;
	note: string;
}

export interface SealedTemplateReport {
	version: 1;
	status: "pass" | "blocked";
	outDir?: string;
	files: SealedTemplateFileReport[];
	blockers: string[];
}

const HOLDOUT_TEMPLATE_FILE = "holdout.template.json";
const JUDGE_TEMPLATE_FILE = "judge-calibration.template.json";

export function buildHoldoutTemplate() {
	return {
		version: 1,
		suites: [
			{
				id: "private-holdout-suite-1",
				description:
					"Replace placeholder inputs with private, off-repo Decision, Planning, and Implementation cases. Do not commit filled bundles.",
				cases: [
					holdoutCase({
						id: "decision-fluent-but-insufficient",
						loop: "decision",
						expected: "fail",
						description:
							"Private decision case where fields are present but semantic intent or cost tradeoff is weak.",
						expectedFailures: [
							{
								standardId: "decision.replace-with-private-standard-id",
								failureClass: "specificity",
							},
						],
					}),
					holdoutCase({
						id: "planning-non-atomic-work",
						loop: "planning",
						expected: "fail",
						description:
							"Private planning case where a work item passes shape checks but is too broad or untestable.",
						expectedFailures: [
							{
								standardId: "planning.replace-with-private-standard-id",
								failureClass: "scope",
							},
						],
					}),
					holdoutCase({
						id: "implementation-irrelevant-evidence",
						loop: "implementation",
						expected: "fail",
						description:
							"Private implementation case where checks or evidence are generic and do not prove acceptance.",
						expectedFailures: [
							{
								standardId: "implementation.replace-with-private-standard-id",
								failureClass: "evidence",
							},
						],
					}),
				],
			},
		],
	};
}

export function buildJudgeCalibrationTemplate() {
	return {
		version: 1,
		suites: [
			{
				id: "private-judge-calibration-suite-1",
				description:
					"Replace judgeInput with private human-labeled semantic cases. False pass must fail calibration.",
				cases: [
					judgeCase({
						id: "decision-cost-false-pass-trap",
						standardId: "private-decision-cost-trap",
						graphId: "decision.loop",
						standardDescription:
							"Judge whether decision effort and maintainer impact are plausible for the affected scope.",
						expected: "fail",
						judgeInput: {
							loop: "decision",
							note: "Replace with private decision packet.",
						},
					}),
					judgeCase({
						id: "planning-atomicity-false-pass-trap",
						standardId: "private-planning-atomicity-trap",
						graphId: "planning.loop",
						standardDescription:
							"Judge whether the work unit is atomic enough for one implementation worker.",
						expected: "fail",
						judgeInput: {
							loop: "planning",
							note: "Replace with private planning packet.",
						},
					}),
					judgeCase({
						id: "implementation-evidence-pass-control",
						standardId: "private-implementation-evidence-control",
						graphId: "implementation.loop",
						standardDescription:
							"Judge whether implementation evidence supports the claimed changes.",
						expected: "pass",
						judgeInput: {
							loop: "implementation",
							note: "Replace with private implementation packet.",
						},
					}),
				],
			},
		],
	};
}

export function writeSealedTemplates(
	options: SealedTemplateOptions = {},
): SealedTemplateReport {
	const repoRoot = resolve(options.repoRoot || process.cwd());
	const kind = options.kind || "all";
	const selectedKinds = templateKinds(kind);
	if (options.stdout) {
		return {
			version: 1,
			status: "pass",
			files: selectedKinds.map((selectedKind) => fileReport(selectedKind)),
			blockers: [],
		};
	}
	if (!options.outDir) {
		return {
			version: 1,
			status: "blocked",
			files: [],
			blockers: ["Provide --out-dir outside this repository."],
		};
	}
	const outDir = resolve(options.outDir);
	if (!options.allowRepoLocal && isInsideOrEqual(outDir, repoRoot)) {
		return {
			version: 1,
			status: "blocked",
			outDir,
			files: [],
			blockers: [
				"Sealed template output must be outside the repository unless --allow-repo-local is set.",
			],
		};
	}
	mkdirSync(outDir, { recursive: true });
	const files = selectedKinds.map((selectedKind) =>
		writeTemplateFile(selectedKind, outDir, repoRoot, options.allowRepoLocal),
	);
	return {
		version: 1,
		status: "pass",
		outDir,
		files,
		blockers: [],
	};
}

function templateKinds(
	kind: SealedTemplateKind,
): Exclude<SealedTemplateKind, "all">[] {
	if (kind === "all") return ["holdout", "judge-calibration"];
	return [kind];
}

function writeTemplateFile(
	kind: Exclude<SealedTemplateKind, "all">,
	outDir: string,
	repoRoot: string,
	allowRepoLocal = false,
): SealedTemplateFileReport {
	const fileName =
		kind === "holdout" ? HOLDOUT_TEMPLATE_FILE : JUDGE_TEMPLATE_FILE;
	const filePath = join(outDir, fileName);
	const template =
		kind === "holdout"
			? buildHoldoutTemplate()
			: buildJudgeCalibrationTemplate();
	writeFileSync(filePath, `${JSON.stringify(template, null, 2)}\n`);
	if (kind === "holdout") {
		loadLabHoldoutBundle({ filePath, repoRoot, allowRepoLocal });
	} else {
		loadJudgeCalibrationBundle({ filePath, repoRoot, allowRepoLocal });
	}
	return fileReport(kind, filePath);
}

function fileReport(
	kind: Exclude<SealedTemplateKind, "all">,
	filePath?: string,
): SealedTemplateFileReport {
	return {
		kind,
		...(filePath ? { filePath } : {}),
		caseCount: kind === "holdout" ? 3 : 3,
		note:
			kind === "holdout"
				? "Template validates bundle shape only; replace placeholders with private off-repo cases before scoring."
				: "Template validates calibration shape only; replace placeholders with human-labeled private judge cases.",
	};
}

function holdoutCase(input: {
	id: string;
	loop: "decision" | "planning" | "implementation";
	expected: "pass" | "fail" | "block";
	description: string;
	expectedFailures?: Array<{ standardId: string; failureClass: string }>;
}) {
	return {
		id: input.id,
		loop: input.loop,
		description: input.description,
		input: {
			__replaceWithPrivateInput: true,
			loop: input.loop,
			note: "Replace this object with a real private lab input for this loop.",
		},
		expected: input.expected,
		weight: 1,
		...(input.expectedFailures
			? { expectedFailures: input.expectedFailures }
			: {}),
	};
}

function judgeCase(input: {
	id: string;
	standardId: string;
	graphId: string;
	standardDescription: string;
	expected: "pass" | "fail" | "block";
	judgeInput: Record<string, unknown>;
}) {
	return {
		id: input.id,
		description: input.standardDescription,
		standardId: input.standardId,
		method: "model_judge",
		gate: "soft",
		expected: input.expected,
		weight: 1,
		graphId: input.graphId,
		graphVersion: "replace-with-current-graph-version",
		standardDescription: input.standardDescription,
		message: "Replace with private human label rationale.",
		refs: [],
		evidenceRefs: ["private:replace-with-case-ref"],
		judgeInput: input.judgeInput,
	};
}

function isInsideOrEqual(filePath: string, parentPath: string): boolean {
	const pathFromParent = relative(parentPath, filePath);
	return (
		pathFromParent === "" ||
		(!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent))
	);
}

function parseSealedTemplateArgs(argv: string[]): SealedTemplateOptions & {
	json: boolean;
	gate: boolean;
} {
	return {
		outDir: stringFlag(argv, "--out-dir"),
		kind: kindFlag(stringFlag(argv, "--kind")),
		allowRepoLocal: argv.includes("--allow-repo-local"),
		stdout: argv.includes("--stdout"),
		json: argv.includes("--json"),
		gate: argv.includes("--gate"),
	};
}

function kindFlag(value: string | undefined): SealedTemplateKind | undefined {
	if (!value) return undefined;
	if (value === "all" || value === "holdout" || value === "judge-calibration") {
		return value;
	}
	throw new Error("--kind must be all, holdout, or judge-calibration.");
}

function stringFlag(argv: string[], flag: string): string | undefined {
	const index = argv.indexOf(flag);
	return index >= 0 ? argv[index + 1] : undefined;
}

function printReport(report: SealedTemplateReport): void {
	console.log(`Sealed templates: ${report.status}`);
	if (report.outDir) console.log(`Output: ${report.outDir}`);
	for (const file of report.files) {
		console.log(`${file.kind}: ${file.filePath || "stdout"}`);
		console.log(`  ${file.note}`);
	}
	for (const blocker of report.blockers) console.log(`Blocker: ${blocker}`);
}

function main(argv = process.argv.slice(2)) {
	const args = parseSealedTemplateArgs(argv);
	const report = writeSealedTemplates(args);
	if (args.stdout) {
		const payload =
			args.kind === "judge-calibration"
				? buildJudgeCalibrationTemplate()
				: args.kind === "holdout"
					? buildHoldoutTemplate()
					: {
							holdout: buildHoldoutTemplate(),
							judgeCalibration: buildJudgeCalibrationTemplate(),
						};
		console.log(JSON.stringify(payload, null, 2));
	} else if (args.json) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		printReport(report);
	}
	if (args.gate && report.status !== "pass") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
