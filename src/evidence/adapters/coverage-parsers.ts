import {canonicalJsonDigest, type Sha256Digest} from "../../utils/canonical-json.ts";
import * as adapterShared from "./shared.ts";
import {
	parseSafeXmlArtifact,
	xmlElementAttributes as elementAttributes,
	xmlElementObject as elementObject,
	xmlObjectArray as objectArray,
} from "./xml.ts";

const {
	boundedText,
	compareText,
	integerValue,
	normalizedProjectPath,
	objectValue,
} = adapterShared;

const MAX_LCOV_LINE_LENGTH = 8_192;
const MAX_XML_NESTING = 32;
const MAX_MEASUREMENTS_PER_FILE = 262_144;
const MAX_BRANCHES_PER_LINE = 4_096;
const COBERTURA_ARRAY_ELEMENTS = new Set([
	"package",
	"class",
	"line",
	"method",
	"condition",
	"source",
]);

export interface ParsedCoverageFile {
	readonly path: string;
	readonly lineFound: number;
	readonly lineHit: number;
	readonly branchFound: number;
	readonly branchHit: number;
	readonly functionFound: number;
	readonly functionHit: number;
	readonly measurementDigest: Sha256Digest;
}

export interface ParsedCoverageReport {
	readonly reportedFileCount: number;
	readonly unsafePathCount: number;
	readonly declaredCountMismatchCount: number;
	readonly files: readonly ParsedCoverageFile[];
}

interface MutableCoverageMeasurement {
	readonly lines: Map<string, boolean>;
	readonly branches: Map<string, boolean>;
	readonly functions: Map<string, boolean>;
}

interface MutableCoverageFile extends MutableCoverageMeasurement {
	readonly path: string;
}

interface LcovRecord {
	readonly path?: string;
	readonly unsafePath: boolean;
	readonly lines: Map<string, boolean>;
	readonly branches: Map<string, boolean>;
	readonly functions: Map<string, boolean>;
	readonly declarations: Map<string, number>;
}

interface LcovParserState {
	readonly files: Map<string, MutableCoverageFile>;
	record?: LcovRecord;
	reportedFileCount: number;
	unsafePathCount: number;
	declaredCountMismatchCount: number;
}

function parseLcovCoverage(bytes: Uint8Array): ParsedCoverageReport {
	const state: LcovParserState = {
		files: new Map(),
		reportedFileCount: 0,
		unsafePathCount: 0,
		declaredCountMismatchCount: 0,
	};
	for (const [lineIndex, line] of decodedLcov(bytes).split("\n").entries()) {
		processLcovLine(state, line, lineIndex + 1);
	}
	if (state.record) throw new Error("LCOV final source record is missing end_of_record.");
	if (state.reportedFileCount === 0) {
		throw new Error("LCOV artifact contains no source records.");
	}
	return Object.freeze({
		reportedFileCount: state.reportedFileCount,
		unsafePathCount: state.unsafePathCount,
		declaredCountMismatchCount: state.declaredCountMismatchCount,
		files: finalizedFiles(state.files),
	});
}

function processLcovLine(
	...input: [LcovParserState, string, number]
): void {
	const [state, line, lineNumber] = input;
	if (line.length === 0) return;
	if (line.length > MAX_LCOV_LINE_LENGTH) {
		throw new Error(`LCOV line ${lineNumber} exceeds ${MAX_LCOV_LINE_LENGTH} bytes.`);
	}
	if (line === "end_of_record") {
		finishLcovRecord(state, lineNumber);
		return;
	}
	const separator = line.indexOf(":");
	if (separator < 0) throw new Error(`LCOV line ${lineNumber} is malformed.`);
	const tag = line.slice(0, separator);
	const value = line.slice(separator + 1);
	if (tag === "TN") {
		assertOptionalLcovText(value, `LCOV line ${lineNumber} test name`);
		return;
	}
	if (tag === "SF") {
		if (state.record) throw new Error(`LCOV line ${lineNumber} starts a nested record.`);
		const normalized = normalizedProjectPath(value);
		state.record = {
			...(normalized.path ? {path: normalized.path} : {}),
			unsafePath: normalized.unsafe || !normalized.path,
			lines: new Map(),
			branches: new Map(),
			functions: new Map(),
			declarations: new Map(),
		};
		return;
	}
	if (!state.record) {
		throw new Error(`LCOV line ${lineNumber} is outside a source record.`);
	}
	parseLcovRecordLine(state.record, tag, value, lineNumber);
}

function finishLcovRecord(
	...input: [LcovParserState, number]
): void {
	const [state, lineNumber] = input;
	const record = state.record;
	if (!record) throw new Error(`LCOV line ${lineNumber} has no active record.`);
	state.reportedFileCount += 1;
	state.declaredCountMismatchCount += lcovDeclarationMismatches(record);
	if (record.unsafePath || !record.path) state.unsafePathCount += 1;
	else mergeMutableFile(state.files, record.path, record);
	state.record = undefined;
}

function parseCoberturaCoverage(bytes: Uint8Array): ParsedCoverageReport {
	const document = objectValue(
		parseSafeXmlArtifact(bytes, {
			label: "Cobertura",
			arrayElements: COBERTURA_ARRAY_ELEMENTS,
			maximumNesting: MAX_XML_NESTING,
		}),
		"Cobertura document",
	);
	const rootKeys = Object.keys(document);
	if (rootKeys.length !== 1 || rootKeys[0] !== "coverage") {
		throw new Error("Cobertura document must contain exactly one coverage root.");
	}
	const coverage = elementObject(document.coverage, "Cobertura coverage root");
	const packages = elementObject(coverage.packages, "Cobertura packages");
	const packageNodes = objectArray(packages.package, "Cobertura packages");
	const files = new Map<string, MutableCoverageFile>();
	let reportedFileCount = 0;
	let unsafePathCount = 0;
	for (const [packageIndex, packageNode] of packageNodes.entries()) {
		const classes = elementObject(
			packageNode.classes,
			`Cobertura package ${packageIndex} classes`,
		);
		for (const [classIndex, classNode] of objectArray(
			classes.class,
			`Cobertura package ${packageIndex} classes`,
		).entries()) {
			reportedFileCount += 1;
			const label = `Cobertura class ${packageIndex}.${classIndex}`;
			const parsed = parseCoberturaClass(classNode, label);
			if (!parsed.path) unsafePathCount += 1;
			else mergeMutableFile(files, parsed.path, parsed);
		}
	}
	const finalized = finalizedFiles(files);
	return Object.freeze({
		reportedFileCount,
		unsafePathCount,
		declaredCountMismatchCount: coberturaDeclarationMismatches(
			coverage,
			finalized,
		),
		files: finalized,
	});
}

function parseLcovRecordLine(
	...input: [LcovRecord, string, string, number]
): void {
	const [record, tag, value, lineNumber] = input;
	if (tag === "DA" || tag === "BRDA") {
		parseLcovCoveragePoint(record, tag, value, lineNumber);
		return;
	}
	if (tag === "FN" || tag === "FNDA") {
		parseLcovFunction(record, tag, value, lineNumber);
		return;
	}
	if (["LF", "LH", "BRF", "BRH", "FNF", "FNH"].includes(tag)) {
		if (record.declarations.has(tag)) {
			throw new Error(`LCOV line ${lineNumber} repeats ${tag}.`);
		}
		record.declarations.set(
			tag,
			decimalInteger(value, `LCOV line ${lineNumber} ${tag}`),
		);
		return;
	}
	if (tag === "VER") {
		assertOptionalLcovText(value, `LCOV line ${lineNumber} version`);
		return;
	}
	throw new Error(`LCOV line ${lineNumber} has unsupported record ${tag}.`);
}

function parseLcovCoveragePoint(
	...input: [LcovRecord, "DA" | "BRDA", string, number]
): void {
	const [record, tag, value, lineNumber] = input;
	const fields = value.split(",");
	if (tag === "DA") {
		if (fields.length < 2 || fields.length > 3) {
			throw new Error(`LCOV line ${lineNumber} has malformed DA data.`);
		}
		const sourceLine = positiveDecimalInteger(
			fields[0],
			`LCOV line ${lineNumber} source line`,
		);
		const hits = decimalInteger(fields[1], `LCOV line ${lineNumber} hit count`);
		mergeBoolean(record.lines, String(sourceLine), hits > 0);
		return;
	}
	if (fields.length !== 4) {
		throw new Error(`LCOV line ${lineNumber} has malformed BRDA data.`);
	}
	const sourceLine = positiveDecimalInteger(
		fields[0],
		`LCOV line ${lineNumber} branch line`,
	);
	const block = boundedText(fields[1], `LCOV line ${lineNumber} branch block`, 256);
	const branch = boundedText(fields[2], `LCOV line ${lineNumber} branch id`, 256);
	const taken =
		fields[3] === "-"
			? 0
			: decimalInteger(fields[3], `LCOV line ${lineNumber} branch count`);
	mergeBoolean(
		record.branches,
		canonicalJsonDigest({sourceLine, block, branch}),
		taken > 0,
	);
}

function parseLcovFunction(
	...input: [LcovRecord, "FN" | "FNDA", string, number]
): void {
	const [record, tag, value, lineNumber] = input;
	const firstComma = value.indexOf(",");
	if (firstComma < 1) {
		throw new Error(`LCOV line ${lineNumber} has malformed ${tag} data.`);
	}
	if (tag === "FNDA") {
		const hits = decimalInteger(
			value.slice(0, firstComma),
			`LCOV line ${lineNumber} function count`,
		);
		const key = lcovFunctionKey(value.slice(firstComma + 1), lineNumber);
		mergeBoolean(record.functions, key, hits > 0);
		return;
	}
	positiveDecimalInteger(
		value.slice(0, firstComma),
		`LCOV line ${lineNumber} function line`,
	);
	const remainder = value.slice(firstComma + 1);
	const secondComma = remainder.indexOf(",");
	let name = remainder;
	if (secondComma > 0 && /^(0|[1-9][0-9]*)$/.test(remainder.slice(0, secondComma))) {
		positiveDecimalInteger(
			remainder.slice(0, secondComma),
			`LCOV line ${lineNumber} function end line`,
		);
		name = remainder.slice(secondComma + 1);
	}
	mergeBoolean(record.functions, lcovFunctionKey(name, lineNumber), false);
}

function lcovFunctionKey(...input: [string, number]): Sha256Digest {
	const [name, lineNumber] = input;
	return canonicalJsonDigest(
		boundedText(name, `LCOV line ${lineNumber} function name`, 2_048),
	);
}

function parseCoberturaClass(
	...input: [Record<string, unknown>, string]
): MutableCoverageMeasurement & {readonly path?: string} {
	const [classNode, label] = input;
	const attributes = elementAttributes(classNode, label);
	const normalized = normalizedProjectPath(attributes.filename);
	const path = normalized.path;
	const className = boundedText(attributes.name, `${label} name`, 2_048);
	const lines = new Map<string, boolean>();
	const branches = new Map<string, boolean>();
	const functions = new Map<string, boolean>();
	const classLines = elementObject(classNode.lines, `${label} lines`);
	for (const lineNode of objectArray(classLines.line, `${label} lines`)) {
		parseCoberturaLine(lineNode, label, lines, branches);
	}
	const methods = elementObject(classNode.methods, `${label} methods`);
	for (const [methodIndex, methodNode] of objectArray(
		methods.method,
		`${label} methods`,
	).entries()) {
		const methodAttributes = elementAttributes(methodNode, `${label} method ${methodIndex}`);
		const name = boundedText(
			methodAttributes.name,
			`${label} method ${methodIndex} name`,
			2_048,
		);
		const signature = optionalText(
			methodAttributes.signature,
			`${label} method ${methodIndex} signature`,
			2_048,
		);
		const methodLines = elementObject(
			methodNode.lines,
			`${label} method ${methodIndex} lines`,
		);
		let hit = false;
		for (const lineNode of objectArray(
			methodLines.line,
			`${label} method ${methodIndex} lines`,
		)) {
			const lineHit = parseCoberturaLine(lineNode, label, lines, branches);
			hit ||= lineHit;
		}
		const key = canonicalJsonDigest({
			className,
			name,
			signature: signature ?? null,
		});
		mergeBoolean(functions, key, hit);
	}
	return {
		...(path ? {path} : {}),
		lines,
		branches,
		functions,
	};
}

function parseCoberturaLine(
	...input: [
		Record<string, unknown>,
		string,
		Map<string, boolean>,
		Map<string, boolean>,
	]
): boolean {
	const [lineNode, label, lines, branches] = input;
	const attributes = elementAttributes(lineNode, `${label} line`);
	const lineNumber = positiveDecimalInteger(
		attributes.number,
		`${label} line number`,
	);
	const hits = decimalInteger(
		attributes.hits,
		`${label} line ${lineNumber} hits`,
	);
	mergeBoolean(lines, String(lineNumber), hits > 0);
	const branch = attributes.branch;
	if (branch !== undefined && branch !== "true" && branch !== "false") {
		throw new Error(`${label} line ${lineNumber} branch must be true or false.`);
	}
	if (branch === "true") {
		const coverage = boundedText(
			attributes["condition-coverage"],
			`${label} line ${lineNumber} condition coverage`,
			128,
		);
		const match = /^([0-9]+(?:\.[0-9]+)?)%\s*\(([0-9]+)\/([0-9]+)\)$/.exec(
			coverage,
		);
		if (!match) throw new Error(`${label} line ${lineNumber} condition coverage is malformed.`);
		const covered = decimalInteger(match[2], `${label} line ${lineNumber} covered branches`);
		const total = positiveDecimalInteger(
			match[3],
			`${label} line ${lineNumber} total branches`,
		);
		if (total > MAX_BRANCHES_PER_LINE) {
			throw new Error(
				`${label} line ${lineNumber} exceeds ${MAX_BRANCHES_PER_LINE} branches.`,
			);
		}
		if (covered > total) {
			throw new Error(`${label} line ${lineNumber} covered branches exceed total branches.`);
		}
		const declaredPercent = Number(match[1]);
		const observedPercent = (covered / total) * 100;
		if (!Number.isFinite(declaredPercent) || Math.abs(declaredPercent - observedPercent) > 0.51) {
			throw new Error(`${label} line ${lineNumber} condition coverage percentage mismatches counts.`);
		}
		for (let index = 0; index < total; index += 1) {
			mergeBoolean(branches, `${lineNumber}:${index}`, index < covered);
		}
	}
	return hits > 0;
}

function lcovDeclarationMismatches(record: LcovRecord): number {
	const facts = [
		["LF", record.lines.size],
		["LH", countHits(record.lines)],
		["BRF", record.branches.size],
		["BRH", countHits(record.branches)],
		["FNF", record.functions.size],
		["FNH", countHits(record.functions)],
	] as const;
	return facts.filter(
		([name, observed]) =>
			record.declarations.has(name) && record.declarations.get(name) !== observed,
	).length;
}

function coberturaDeclarationMismatches(
	...input: [Record<string, unknown>, readonly ParsedCoverageFile[]]
): number {
	const [coverage, files] = input;
	const attributes = elementAttributes(coverage, "Cobertura coverage root");
	const totals = aggregateCoverageFiles(files);
	const facts = [
		["lines-valid", totals.lineFound],
		["lines-covered", totals.lineHit],
		["branches-valid", totals.branchFound],
		["branches-covered", totals.branchHit],
	] as const;
	return facts.filter(([name, observed]) => {
		if (attributes[name] === undefined) return false;
		return decimalInteger(attributes[name], `Cobertura ${name}`) !== observed;
	}).length;
}

function mergeMutableFile(
	...input: [
		Map<string, MutableCoverageFile>,
		string,
		MutableCoverageMeasurement,
	]
): void {
	const [files, path, source] = input;
	let target = files.get(path);
	if (!target) {
		target = {path, lines: new Map(), branches: new Map(), functions: new Map()};
		files.set(path, target);
	}
	mergeMaps(target.lines, source.lines);
	mergeMaps(target.branches, source.branches);
	mergeMaps(target.functions, source.functions);
}

function mergeMaps(
	...input: [Map<string, boolean>, ReadonlyMap<string, boolean>]
): void {
	const [target, source] = input;
	for (const [key, hit] of source) mergeBoolean(target, key, hit);
}

function mergeBoolean(
	...input: [Map<string, boolean>, string, boolean]
): void {
	const [values, key, hit] = input;
	if (!values.has(key) && values.size >= MAX_MEASUREMENTS_PER_FILE) {
		throw new Error(
			`Coverage file exceeds ${MAX_MEASUREMENTS_PER_FILE} measurements.`,
		);
	}
	values.set(key, (values.get(key) ?? false) || hit);
}

function finalizedFiles(
	files: ReadonlyMap<string, MutableCoverageFile>,
): ParsedCoverageFile[] {
	return Array.from(files.values(), (file) => {
		const lines = sortedMapEntries(file.lines);
		const branches = sortedMapEntries(file.branches);
		const functions = sortedMapEntries(file.functions);
		return Object.freeze({
			path: file.path,
			lineFound: lines.length,
			lineHit: countEntryHits(lines),
			branchFound: branches.length,
			branchHit: countEntryHits(branches),
			functionFound: functions.length,
			functionHit: countEntryHits(functions),
			measurementDigest: canonicalJsonDigest({lines, branches, functions}),
		});
	}).sort(compareCoverageFiles);
}

function compareCoverageFiles(
	...files: [ParsedCoverageFile, ParsedCoverageFile]
): number {
	const [left, right] = files;
	return compareText(left.path, right.path);
}

function aggregateCoverageFiles(files: readonly ParsedCoverageFile[]): {
	readonly lineFound: number;
	readonly lineHit: number;
	readonly branchFound: number;
	readonly branchHit: number;
	readonly functionFound: number;
	readonly functionHit: number;
} {
	const totals = {
		lineFound: 0,
		lineHit: 0,
		branchFound: 0,
		branchHit: 0,
		functionFound: 0,
		functionHit: 0,
	};
	for (const file of files) {
		totals.lineFound += file.lineFound;
		totals.lineHit += file.lineHit;
		totals.branchFound += file.branchFound;
		totals.branchHit += file.branchHit;
		totals.functionFound += file.functionFound;
		totals.functionHit += file.functionHit;
	}
	return totals;
}

function sortedMapEntries(
	values: ReadonlyMap<string, boolean>,
): readonly (readonly [string, boolean])[] {
	return Array.from(values.entries()).sort(([left], [right]) => compareText(left, right));
}

function countEntryHits(values: readonly (readonly [string, boolean])[]): number {
	return values.filter(([, hit]) => hit).length;
}

function countHits(values: ReadonlyMap<string, boolean>): number {
	let count = 0;
	for (const hit of values.values()) if (hit) count += 1;
	return count;
}

function decodedLcov(bytes: Uint8Array): string {
	let text: string;
	try {
		text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
	} catch {
		throw new Error("LCOV artifact must be valid UTF-8 text.");
	}
	const normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
	if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)) {
		throw new Error("LCOV artifact contains unsupported control characters.");
	}
	return normalized;
}

function decimalInteger(...input: [unknown, string]): number {
	const [value, label] = input;
	if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
		throw new Error(`${label} must be a non-negative integer.`);
	}
	return integerValue(Number(value), label, 0);
}

function positiveDecimalInteger(...input: [unknown, string]): number {
	const [value, label] = input;
	const parsed = decimalInteger(value, label);
	if (parsed === 0) throw new Error(`${label} must be positive.`);
	return parsed;
}

function assertOptionalLcovText(...input: [string, string]): void {
	const [value, label] = input;
	if (value.length === 0) return;
	boundedText(value, label, 2_048);
}

function optionalText(
	...input: [unknown, string, number]
): string | undefined {
	const [value, label, maximum] = input;
	return value === undefined ? undefined : boundedText(value, label, maximum);
}

export const coverageParsers = Object.freeze({
	lcov: parseLcovCoverage,
	cobertura: parseCoberturaCoverage,
	aggregate: aggregateCoverageFiles,
});
