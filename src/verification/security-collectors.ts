import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {realpath, stat} from "node:fs/promises";
import {isAbsolute, resolve} from "node:path";
import type {ChangeIntakeContent} from "../changes/intake/contracts.ts";
import {normalizeChangeIntakeContent} from "../changes/intake/normalize.ts";
import {ingestSarif21Evidence} from "../evidence/adapters/sarif.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	sha256Digest,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import {assertExactKeys} from "../utils/json.ts";
import type {
	SecurityScannerAdapter,
	SecurityScannerAdapterObservation,
	SecurityScannerAdapterRequest,
	SecurityScannerFindingObservation,
	SecurityScannerSourceBinding,
} from "./security-scanners.ts";

export const PRODUCTION_SECURITY_COLLECTOR_PROTOCOL = Object.freeze({
	id: "codewiki.production-security-collector",
	version: "2.0.0",
	maxOutputBytes: 4_194_304,
	maxFindings: 128,
	probeTimeoutMs: 10_000,
	scanTimeoutMs: 120_000,
	terminationGraceMs: 2_000,
	maxIdentityFileBytes: 536_870_912,
} as const);

export type ProductionSecurityCollectorProfile =
	| "semgrep_sarif"
	| "gitleaks_directory_sarif"
	| "trivy_filesystem_sarif";

export interface ProductionSecurityCollectorCommand {
	readonly executable: string;
	readonly args: readonly string[];
	readonly cwd: string;
	readonly environment: Readonly<Record<string, string>>;
	readonly timeoutMs: number;
	readonly maxOutputBytes: number;
	readonly terminationGraceMs: number;
	readonly signal: AbortSignal;
}

export interface ProductionSecurityCollectorCommandResult {
	readonly startedAt: string;
	readonly completedAt: string;
	readonly termination: "exited" | "timed_out" | "cancelled" | "unavailable";
	readonly exitCode?: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly outputExceeded: boolean;
}

export type ProductionSecurityCollectorCommandRunner = (
	command: ProductionSecurityCollectorCommand,
) => Promise<ProductionSecurityCollectorCommandResult>;

interface ProductionSecurityCollectorInputBase {
	readonly profile: ProductionSecurityCollectorProfile;
	readonly repoRoot: string;
	readonly executablePath: string;
	readonly executableDigest: Sha256Digest;
	readonly scannerVersion: string;
	readonly source: SecurityScannerSourceBinding;
	readonly commandRunner?: ProductionSecurityCollectorCommandRunner;
}

export interface SemgrepSecurityCollectorInput
	extends ProductionSecurityCollectorInputBase {
	readonly profile: "semgrep_sarif";
	readonly configurationPath: string;
	readonly configurationDigest: Sha256Digest;
}

export interface GitleaksSecurityCollectorInput
	extends ProductionSecurityCollectorInputBase {
	readonly profile: "gitleaks_directory_sarif";
	readonly rulesPath: string;
	readonly rulesDigest: Sha256Digest;
	readonly ignorePath: string;
	readonly ignoreDigest: Sha256Digest;
}

export interface TrivySecurityCollectorInput
	extends ProductionSecurityCollectorInputBase {
	readonly profile: "trivy_filesystem_sarif";
	readonly cacheDirectory: string;
	readonly databasePath: string;
	readonly databaseDigest: Sha256Digest;
}

export type ProductionSecurityCollectorInput =
	| SemgrepSecurityCollectorInput
	| GitleaksSecurityCollectorInput
	| TrivySecurityCollectorInput;

export interface ProductionSecurityCollectorIdentity {
	readonly protocol: typeof PRODUCTION_SECURITY_COLLECTOR_PROTOCOL;
	readonly profile: ProductionSecurityCollectorProfile;
	readonly scannerType:
		| "static_analysis"
		| "secret_detection"
		| "dependency_advisory";
	readonly scannerId: string;
	readonly scannerVersion: string;
	readonly executableDigest: Sha256Digest;
	readonly configurationDigest: Sha256Digest;
	readonly rulesDigest?: Sha256Digest;
	readonly ignoreDigest?: Sha256Digest;
	readonly databaseDigest?: Sha256Digest;
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly sourceTree: string;
	readonly sourceTreeDigest: Sha256Digest;
	readonly environmentDigest: Sha256Digest;
	readonly invocationDigest: Sha256Digest;
	readonly grantsResult: false;
	readonly collectorDigest: Sha256Digest;
}

export interface ProductionSecurityCollector {
	readonly identity: ProductionSecurityCollectorIdentity;
	readonly adapter: SecurityScannerAdapter;
}

interface AdmittedCollectorInput {
	readonly profile: ProductionSecurityCollectorProfile;
	readonly repoRoot: string;
	readonly executablePath: string;
	readonly executableDigest: Sha256Digest;
	readonly scannerVersion: string;
	readonly source: SecurityScannerSourceBinding;
	readonly configurationPath?: string;
	readonly configurationDigest?: Sha256Digest;
	readonly rulesPath?: string;
	readonly rulesDigest?: Sha256Digest;
	readonly ignorePath?: string;
	readonly ignoreDigest?: Sha256Digest;
	readonly cacheDirectory?: string;
	readonly databasePath?: string;
	readonly databaseDigest?: Sha256Digest;
	readonly commandRunner: ProductionSecurityCollectorCommandRunner;
}

const BASE_INPUT_FIELDS = [
	"profile",
	"repoRoot",
	"executablePath",
	"executableDigest",
	"scannerVersion",
	"source",
	"commandRunner",
] as const;
const SEMGREP_INPUT_FIELDS = [
	...BASE_INPUT_FIELDS,
	"configurationPath",
	"configurationDigest",
] as const;
const GITLEAKS_INPUT_FIELDS = [
	...BASE_INPUT_FIELDS,
	"rulesPath",
	"rulesDigest",
	"ignorePath",
	"ignoreDigest",
] as const;
const TRIVY_INPUT_FIELDS = [
	...BASE_INPUT_FIELDS,
	"cacheDirectory",
	"databasePath",
	"databaseDigest",
] as const;
const SOURCE_FIELDS = [
	"sourceSnapshotDigest",
	"sourceTree",
	"sourceTreeDigest",
	"environmentDigest",
	"sourceRefs",
	"knowledgeRefs",
	"ownershipRefs",
] as const;
const CLOSED_ENVIRONMENT = Object.freeze({
	CI: "1",
	NO_COLOR: "1",
	SEMGREP_SEND_METRICS: "off",
	TRIVY_DISABLE_VEX_NOTICE: "true",
});

export function createProductionSecurityCollector(
	input: ProductionSecurityCollectorInput,
): ProductionSecurityCollector {
	const admitted = admitCollectorInput(input);
	const profile = collectorProfile(admitted.profile);
	const boundIdentity = {
		protocol: PRODUCTION_SECURITY_COLLECTOR_PROTOCOL,
		profile: admitted.profile,
		executableDigest: admitted.executableDigest,
		configurationDigest: admitted.configurationDigest as Sha256Digest,
		...(admitted.rulesDigest ? {rulesDigest: admitted.rulesDigest} : {}),
		...(admitted.ignoreDigest ? {ignoreDigest: admitted.ignoreDigest} : {}),
		...(admitted.databaseDigest
			? {databaseDigest: admitted.databaseDigest}
			: {}),
		sourceSnapshotDigest: admitted.source.sourceSnapshotDigest,
		sourceTree: admitted.source.sourceTree,
		sourceTreeDigest: admitted.source.sourceTreeDigest,
		environmentDigest: admitted.source.environmentDigest,
	};
	const invocationDigest = canonicalJsonDigest({
		...boundIdentity,
		arguments: scanArguments(admitted),
		commandEnvironmentDigest: canonicalJsonDigest(CLOSED_ENVIRONMENT),
	});
	const identityBody = {
		...boundIdentity,
		scannerType: profile.scannerType,
		scannerId: profile.scannerId,
		scannerVersion: admitted.scannerVersion,
		invocationDigest,
		grantsResult: false as const,
	};
	const identity = Object.freeze({
		...identityBody,
		collectorDigest: canonicalJsonDigest(identityBody),
	});
	const adapter = Object.freeze({
		scannerType: identity.scannerType,
		scannerId: identity.scannerId,
		scannerVersion: identity.scannerVersion,
		configurationDigest: identity.collectorDigest,
		execute: (
			...args: [SecurityScannerAdapterRequest, AbortSignal]
		): Promise<SecurityScannerAdapterObservation> =>
			executeCollector(admitted, identity, ...args),
	});
	return Object.freeze({identity, adapter});
}

interface CollectorCommandState {
	readonly command: ProductionSecurityCollectorCommand;
	readonly resolveResult: (value: ProductionSecurityCollectorCommandResult) => void;
	readonly startedAt: string;
	readonly stdout: Buffer[];
	readonly stderr: Buffer[];
	readonly child: ReturnType<typeof spawn>;
	onAbort: () => void;
	timeout?: NodeJS.Timeout;
	killTimer?: NodeJS.Timeout;
	outputBytes: number;
	settled: boolean;
	cancelled: boolean;
	timedOut: boolean;
	unavailable: boolean;
	outputExceeded: boolean;
}

function runProductionSecurityCollectorCommand(
	command: ProductionSecurityCollectorCommand,
): Promise<ProductionSecurityCollectorCommandResult> {
	return new Promise((resolveResult) => startCollectorProcess(command, resolveResult));
}

function startCollectorProcess(
	...args: [
		ProductionSecurityCollectorCommand,
		(value: ProductionSecurityCollectorCommandResult) => void,
	]
): void {
	const [command, resolveResult] = args;
	const child = spawn(command.executable, [...command.args], {
		cwd: command.cwd,
		env: {...command.environment},
		shell: false,
		stdio: ["ignore", "pipe", "pipe"],
		windowsHide: true,
	});
	const state: CollectorCommandState = {
		command,
		resolveResult,
		startedAt: new Date().toISOString(),
		stdout: [],
		stderr: [],
		child,
		onAbort: () => undefined,
		outputBytes: 0,
		settled: false,
		cancelled: false,
		timedOut: false,
		unavailable: false,
		outputExceeded: false,
	};
	state.onAbort = () => {
		state.cancelled = true;
		terminateCollectorProcess(state);
	};
	state.timeout = setTimeout(() => {
		state.timedOut = true;
		terminateCollectorProcess(state);
	}, command.timeoutMs);
	state.timeout.unref?.();
	child.stdout?.on("data", (chunk) => captureCollectorOutput(state, state.stdout, chunk));
	child.stderr?.on("data", (chunk) => captureCollectorOutput(state, state.stderr, chunk));
	child.once("error", () => {
		state.unavailable = true;
		finishCollectorProcess(state);
	});
	child.once("close", (code) => {
		if (code === null) finishCollectorProcess(state);
		else finishCollectorProcess(state, code);
	});
	if (command.signal.aborted) state.onAbort();
	else command.signal.addEventListener("abort", state.onAbort, {once: true});
}

function captureCollectorOutput(
	...args: [CollectorCommandState, Buffer[], Buffer | string]
): void {
	const [state, chunks, chunk] = args;
	const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
	state.outputBytes += bytes.length;
	if (state.outputBytes > state.command.maxOutputBytes) {
		state.outputExceeded = true;
		terminateCollectorProcess(state);
		return;
	}
	chunks.push(bytes);
}

function terminateCollectorProcess(state: CollectorCommandState): void {
	if (state.child.exitCode !== null || state.child.signalCode !== null) return;
	state.child.kill("SIGTERM");
	state.killTimer ??= setTimeout(() => {
		if (state.child.exitCode === null && state.child.signalCode === null) {
			state.child.kill("SIGKILL");
		}
	}, state.command.terminationGraceMs);
	state.killTimer.unref?.();
}

function finishCollectorProcess(
	...args: [CollectorCommandState] | [CollectorCommandState, number]
): void {
	const state = args[0];
	const exitCode = args[1];
	if (state.settled) return;
	state.settled = true;
	if (state.timeout) clearTimeout(state.timeout);
	if (state.killTimer) clearTimeout(state.killTimer);
	state.command.signal.removeEventListener("abort", state.onAbort);
	state.resolveResult({
		startedAt: state.startedAt,
		completedAt: new Date().toISOString(),
		termination: collectorTermination(state),
		...(exitCode === undefined ? {} : {exitCode}),
		stdout: Buffer.concat(state.stdout).toString("utf8"),
		stderr: Buffer.concat(state.stderr).toString("utf8"),
		outputExceeded: state.outputExceeded,
	});
}

function collectorTermination(
	state: CollectorCommandState,
): ProductionSecurityCollectorCommandResult["termination"] {
	if (state.unavailable) return "unavailable";
	if (state.cancelled) return "cancelled";
	if (state.timedOut) return "timed_out";
	return "exited";
}

async function executeCollector(
	...args: [
		AdmittedCollectorInput,
		ProductionSecurityCollectorIdentity,
		SecurityScannerAdapterRequest,
		AbortSignal,
	]
): Promise<SecurityScannerAdapterObservation> {
	const [input, identity, request, signal] = args;
	const mismatch = requestMismatch(identity, request);
	if (mismatch) return errorObservation(request, signal, mismatch);
	if (signal.aborted) {
		return unavailableObservation(request, "cancelled", "Production scanner collection was cancelled.");
	}
	const identityFailure = await verifyIdentityFiles(input);
	if (identityFailure) return errorObservation(request, signal, identityFailure);
	const version = await input.commandRunner(command(input, versionArguments(input.profile), signal, true));
	const versionFailure = commandFailure(version, "version probe");
	if (versionFailure) return observationForCommandFailure(request, version, versionFailure);
	if (!matchesVersion(input.profile, version.stdout, version.stderr, identity.scannerVersion)) {
		return errorObservation(request, signal, "Production scanner reported an unexpected version.");
	}
	const preScanIdentityFailure = await verifyIdentityFiles(input);
	if (preScanIdentityFailure) {
		return errorObservation(request, signal, preScanIdentityFailure);
	}
	const result = await input.commandRunner(command(input, scanArguments(input), signal, false));
	const failure = commandFailure(result, "scan");
	if (failure) return observationForCommandFailure(request, result, failure);
	if (result.exitCode !== 0) {
		return commandErrorObservation(request, result, "Production scanner exited unsuccessfully.");
	}
	const postRunIdentityFailure = await verifyIdentityFiles(input);
	if (postRunIdentityFailure) {
		return commandErrorObservation(request, result, postRunIdentityFailure);
	}
	return sarifObservation(input, identity, request, result);
}

function sarifObservation(
	...args: [
		AdmittedCollectorInput,
		ProductionSecurityCollectorIdentity,
		SecurityScannerAdapterRequest,
		ProductionSecurityCollectorCommandResult,
	]
): SecurityScannerAdapterObservation {
	const [input, identity, request, result] = args;
	try {
		const durationMs = elapsedMilliseconds(result.startedAt, result.completedAt);
		const ingestion = ingestSarif21Evidence({
			artifact: {
				bytes: result.stdout,
				ref: `collector-sarif:${sha256Digest(result.stdout)}`,
			},
			sourceSnapshotDigest: request.sourceSnapshotDigest,
			scannedPaths: ["."],
			expectedTools: [
				{
					name: collectorProfile(input.profile).sarifToolId,
					version: sarifToolVersion(input.profile, identity.scannerVersion),
				},
			],
			execution: {
				adapterId: PRODUCTION_SECURITY_COLLECTOR_PROTOCOL.id,
				adapterVersion: PRODUCTION_SECURITY_COLLECTOR_PROTOCOL.version,
				requestDigest: request.requestDigest,
				invocationDigest: identity.invocationDigest,
				environmentDigest: request.environmentDigest,
				configurationDigest: identity.configurationDigest,
				...(identity.databaseDigest
					? {advisoryDatabaseDigest: identity.databaseDigest}
					: {}),
				termination: "exited",
				exitCode: result.exitCode,
				durationMs,
			},
			provenanceRefs: [
				`collector:${identity.collectorDigest}`,
				`scanner-request:${request.requestDigest}`,
			],
		});
		const observations = ingestion.sourceObservation.payload.observations.slice(1);
		const findingRefs = ingestion.commandExecution.payload.diagnosticRefs;
		const count = Math.min(
			ingestion.summary.admittedFindingCount,
			PRODUCTION_SECURITY_COLLECTOR_PROTOCOL.maxFindings,
		);
		const findings = Array.from(
			{length: count},
			(...args: [unknown, number]) => {
				const index = args[1];
				return collectorFinding({
					profile: input.profile,
					identity,
					request,
					observation: observations[index],
					findingRef: findingRefs[index],
					index,
				});
			},
		);
		const limitations = [
			...(ingestion.coverage === "complete" ? [] : ["SARIF collection coverage was incomplete."]),
			...(ingestion.summary.admittedFindingCount > count
				? ["SARIF findings exceeded the production collector limit."]
				: []),
		];
		return {
			requestDigest: request.requestDigest,
			runId: `collector:${identity.collectorDigest}:${request.requestDigest}`,
			startedAt: result.startedAt,
			completedAt: result.completedAt,
			termination: "exited",
			exitCode: result.exitCode,
			outcome: findings.length > 0 ? "findings" : "clean",
			coverage: limitations.length > 0 ? "partial" : "complete",
			stdoutDigest: sha256Digest(result.stdout),
			...(result.stderr ? {stderrDigest: sha256Digest(result.stderr)} : {}),
			findings,
			limitations,
		};
	} catch {
		return commandErrorObservation(request, result, "Production scanner SARIF was rejected.");
	}
}

function collectorFinding(input: {
	readonly profile: ProductionSecurityCollectorProfile;
	readonly identity: ProductionSecurityCollectorIdentity;
	readonly request: SecurityScannerAdapterRequest;
	readonly observation?: string;
	readonly findingRef?: string;
	readonly index: number;
}): SecurityScannerFindingObservation {
	const {profile, identity, request, observation, findingRef, index} = input;
	const findingId = canonicalJsonDigest({
		collectorDigest: identity.collectorDigest,
		requestDigest: request.requestDigest,
		findingRef: findingRef ?? "unreferenced",
		index,
	});
	const path = observationField(observation, "path");
	const ruleId = observationField(observation, "rule") ?? "unknown-rule";
	const level = observationField(observation, "level") ?? "none";
	const sourceRef = `trace:scanner:${profile}:${findingId.slice(7)}`;
	const content: ChangeIntakeContent = normalizeChangeIntakeContent({
		summary: `${collectorProfile(profile).label} reported a security-relevant finding`,
		observedBehavior: `The exact bounded SARIF observation ${findingId} reported rule ${ruleId}.`,
		desiredBehavior: "Review the reported condition and repair or explicitly account for it under the applicable Check.",
		affectedRefs: path && path !== "excluded" && path !== "unlocated" ? [path] : [request.sourceTree],
		sourceRefs: [sourceRef],
		claimedCategory: "security",
		claimedSeverity: claimedSeverity(level),
		claimedConfidence: "unknown",
		claimedSecurity: {
			classification: findingClassification(profile),
			identifiers: [],
			cvss: [],
			sarif: [
				{
					version: "2.1.0",
					toolId: collectorProfile(profile).sarifToolId,
					ruleId,
					resultRef: sourceRef,
				},
			],
			kev: [],
		},
	});
	return Object.freeze({findingId, content});
}

function admitCollectorInput(
	value: ProductionSecurityCollectorInput,
): AdmittedCollectorInput {
	if (!value || typeof value !== "object") {
		throw new Error("Production security collector input must be an object.");
	}
	if (value.profile === "semgrep_sarif") {
		assertExactKeys(value, SEMGREP_INPUT_FIELDS, "Semgrep production collector input");
	} else if (value.profile === "gitleaks_directory_sarif") {
		assertExactKeys(value, GITLEAKS_INPUT_FIELDS, "Gitleaks production collector input");
	} else if (value.profile === "trivy_filesystem_sarif") {
		assertExactKeys(value, TRIVY_INPUT_FIELDS, "Trivy production collector input");
	} else {
		throw new Error("Production security collector profile is unsupported.");
	}
	assertExactKeys(value.source, SOURCE_FIELDS, "Production security collector source binding");
	assertSource(value.source);
	const repoRoot = absolutePath(value.repoRoot, "repoRoot");
	const executablePath = absolutePath(value.executablePath, "executablePath");
	assertSha256Digest(value.executableDigest, "Production collector executableDigest");
	const scannerVersion = boundedToken(value.scannerVersion, "scannerVersion");
	if (value.commandRunner !== undefined && typeof value.commandRunner !== "function") {
		throw new Error("Production collector commandRunner must be a function.");
	}
	if (value.profile === "semgrep_sarif") {
		assertSha256Digest(value.configurationDigest, "Semgrep configurationDigest");
		return Object.freeze({
			...value,
			repoRoot,
			executablePath,
			scannerVersion,
			configurationPath: absolutePath(value.configurationPath, "configurationPath"),
			commandRunner: value.commandRunner ?? runProductionSecurityCollectorCommand,
		});
	}
	if (value.profile === "gitleaks_directory_sarif") {
		assertSha256Digest(value.rulesDigest, "Gitleaks rulesDigest");
		assertSha256Digest(value.ignoreDigest, "Gitleaks ignoreDigest");
		return Object.freeze({
			...value,
			repoRoot,
			executablePath,
			scannerVersion,
			configurationDigest: canonicalJsonDigest({
				profile: value.profile,
				rulesDigest: value.rulesDigest,
				ignoreDigest: value.ignoreDigest,
			}),
			rulesPath: absolutePath(value.rulesPath, "rulesPath"),
			ignorePath: absolutePath(value.ignorePath, "ignorePath"),
			commandRunner: value.commandRunner ?? runProductionSecurityCollectorCommand,
		});
	}
	assertSha256Digest(value.databaseDigest, "Trivy databaseDigest");
	return Object.freeze({
		...value,
		repoRoot,
		executablePath,
		scannerVersion,
		configurationDigest: canonicalJsonDigest({
			profile: value.profile,
			cacheDirectoryDigest: sha256Digest(resolve(value.cacheDirectory)),
			databaseDigest: value.databaseDigest,
		}),
		cacheDirectory: absolutePath(value.cacheDirectory, "cacheDirectory"),
		databasePath: absolutePath(value.databasePath, "databasePath"),
		commandRunner: value.commandRunner ?? runProductionSecurityCollectorCommand,
	});
}

function assertSource(source: SecurityScannerSourceBinding): void {
	assertSha256Digest(source.sourceSnapshotDigest, "Production collector sourceSnapshotDigest");
	assertSha256Digest(source.sourceTreeDigest, "Production collector sourceTreeDigest");
	assertSha256Digest(source.environmentDigest, "Production collector environmentDigest");
	boundedToken(source.sourceTree, "sourceTree");
	for (const [field, refs] of [
		["sourceRefs", source.sourceRefs],
		["knowledgeRefs", source.knowledgeRefs],
		["ownershipRefs", source.ownershipRefs],
	] as const) {
		if (!Array.isArray(refs) || refs.length > 128 || new Set(refs).size !== refs.length) {
			throw new Error(`Production collector ${field} must contain at most 128 unique refs.`);
		}
		refs.forEach((ref) => boundedText(ref, field, 512));
	}
}

function collectorProfile(profile: ProductionSecurityCollectorProfile): {
	readonly scannerType:
		| "static_analysis"
		| "secret_detection"
		| "dependency_advisory";
	readonly scannerId: string;
	readonly sarifToolId: string;
	readonly label: string;
} {
	if (profile === "semgrep_sarif") {
		return {
			scannerType: "static_analysis",
			scannerId: "codewiki.collector.semgrep-sarif",
			sarifToolId: "semgrep",
			label: "Semgrep",
		};
	}
	if (profile === "gitleaks_directory_sarif") {
		return {
			scannerType: "secret_detection",
			scannerId: "codewiki.collector.gitleaks-directory-sarif",
			sarifToolId: "gitleaks",
			label: "Gitleaks",
		};
	}
	return {
		scannerType: "dependency_advisory",
		scannerId: "codewiki.collector.trivy-filesystem-sarif",
		sarifToolId: "Trivy",
		label: "Trivy",
	};
}

function versionArguments(profile: ProductionSecurityCollectorProfile): readonly string[] {
	return profile === "gitleaks_directory_sarif" ? ["version"] : ["--version"];
}

function scanArguments(input: AdmittedCollectorInput): readonly string[] {
	if (input.profile === "semgrep_sarif") {
		return [
			"scan",
			"--config",
			input.configurationPath as string,
			"--sarif",
			"--metrics=off",
			"--disable-version-check",
			"--no-autofix",
			"--timeout",
			"30",
			input.repoRoot,
		];
	}
	if (input.profile === "gitleaks_directory_sarif") {
		return [
			"dir",
			"--config",
			input.rulesPath as string,
			"--gitleaks-ignore-path",
			input.ignorePath as string,
			"--report-format",
			"sarif",
			"--report-path",
			"-",
			"--exit-code",
			"0",
			"--no-banner",
			"--no-color",
			"--redact=100",
			"--max-archive-depth",
			"0",
			"--max-decode-depth",
			"0",
			".",
		];
	}
	return [
		"fs",
		"--scanners",
		"vuln",
		"--format",
		"sarif",
		"--exit-code",
		"0",
		"--offline-scan",
		"--skip-db-update",
		"--skip-java-db-update",
		"--cache-dir",
		input.cacheDirectory as string,
		"--no-progress",
		input.repoRoot,
	];
}

function command(
	...args: [AdmittedCollectorInput, readonly string[], AbortSignal, boolean]
): ProductionSecurityCollectorCommand {
	const [input, commandArgs, signal, probe] = args;
	return {
		executable: input.executablePath,
		args: commandArgs,
		cwd: input.repoRoot,
		environment: CLOSED_ENVIRONMENT,
		timeoutMs: probe
			? PRODUCTION_SECURITY_COLLECTOR_PROTOCOL.probeTimeoutMs
			: PRODUCTION_SECURITY_COLLECTOR_PROTOCOL.scanTimeoutMs,
		maxOutputBytes: PRODUCTION_SECURITY_COLLECTOR_PROTOCOL.maxOutputBytes,
		terminationGraceMs: PRODUCTION_SECURITY_COLLECTOR_PROTOCOL.terminationGraceMs,
		signal,
	};
}

async function verifyIdentityFiles(input: AdmittedCollectorInput): Promise<string | undefined> {
	const executableFailure = await verifyFile(
		input.executablePath,
		input.executableDigest,
		"executable",
	);
	if (executableFailure) return executableFailure;
	if (input.profile === "semgrep_sarif") {
		return verifyFile(
			input.configurationPath as string,
			input.configurationDigest as Sha256Digest,
			"configuration",
		);
	}
	if (input.profile === "gitleaks_directory_sarif") {
		const rulesFailure = await verifyFile(
			input.rulesPath as string,
			input.rulesDigest as Sha256Digest,
			"rules configuration",
		);
		if (rulesFailure) return rulesFailure;
		return verifyFile(
			input.ignorePath as string,
			input.ignoreDigest as Sha256Digest,
			"ignore configuration",
		);
	}
	return verifyFile(
		input.databasePath as string,
		input.databaseDigest as Sha256Digest,
		"advisory database",
	);
}

async function verifyFile(
	...args: [string, Sha256Digest, string]
): Promise<string | undefined> {
	const [path, expectedDigest, label] = args;
	try {
		const resolvedPath = await realpath(path);
		const metadata = await stat(resolvedPath);
		if (!metadata.isFile()) return `Production scanner ${label} is not a regular file.`;
		if (metadata.size < 1 || metadata.size > PRODUCTION_SECURITY_COLLECTOR_PROTOCOL.maxIdentityFileBytes) {
			return `Production scanner ${label} size is unsupported.`;
		}
		const actualDigest = await digestFile(resolvedPath);
		return actualDigest === expectedDigest
			? undefined
			: `Production scanner ${label} identity changed.`;
	} catch {
		return `Production scanner ${label} is unavailable.`;
	}
}

function digestFile(path: string): Promise<Sha256Digest> {
	return new Promise((...args: [
		(value: Sha256Digest | PromiseLike<Sha256Digest>) => void,
		(reason?: unknown) => void,
	]) => {
		const [resolveDigest, reject] = args;
		const hash = createHash("sha256");
		const stream = createReadStream(path);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.once("error", reject);
		stream.once("end", () =>
			resolveDigest(`sha256:${hash.digest("hex")}` as Sha256Digest),
		);
	});
}

function requestMismatch(
	...args: [ProductionSecurityCollectorIdentity, SecurityScannerAdapterRequest]
): string | undefined {
	const [identity, request] = args;
	if (
		request.scannerType !== identity.scannerType ||
		request.scannerId !== identity.scannerId ||
		request.scannerVersion !== identity.scannerVersion ||
		request.configurationDigest !== identity.collectorDigest
	) {
		return "Production scanner request does not match collector identity.";
	}
	if (
		request.sourceSnapshotDigest !== identity.sourceSnapshotDigest ||
		request.sourceTree !== identity.sourceTree ||
		request.sourceTreeDigest !== identity.sourceTreeDigest ||
		request.environmentDigest !== identity.environmentDigest
	) {
		return "Production scanner request does not match exact source or environment identity.";
	}
	if (
		identity.scannerType === "dependency_advisory" &&
		request.advisorySnapshot?.snapshotDigest !== identity.databaseDigest
	) {
		return "Production dependency scanner request does not match the advisory database identity.";
	}
	return undefined;
}

function matchesVersion(
	...args: [ProductionSecurityCollectorProfile, string, string, string]
): boolean {
	const [profile, stdout, stderr, expected] = args;
	const output = `${stdout}\n${stderr}`.trim();
	if (profile === "trivy_filesystem_sarif") {
		return output.split(/\r?\n/u).some((line) => line.trim() === `Version: ${expected}`);
	}
	return output.split(/\s+/u).some((token) => token === expected || token === `v${expected}`);
}

function sarifToolVersion(
	...args: [ProductionSecurityCollectorProfile, string]
): string {
	const [profile, scannerVersion] = args;
	return profile === "gitleaks_directory_sarif"
		? `v${scannerVersion.replace(/^v/u, "")}`
		: scannerVersion;
}

function findingClassification(
	profile: ProductionSecurityCollectorProfile,
): "suspected_vulnerability" | "dependency_advisory" | "secret_exposure" {
	if (profile === "trivy_filesystem_sarif") return "dependency_advisory";
	if (profile === "gitleaks_directory_sarif") return "secret_exposure";
	return "suspected_vulnerability";
}

function commandFailure(
	...args: [ProductionSecurityCollectorCommandResult, string]
): string | undefined {
	const [result, phase] = args;
	if (result.outputExceeded) return `Production scanner ${phase} exceeded the output limit.`;
	if (result.termination === "unavailable") return `Production scanner ${phase} was unavailable.`;
	if (result.termination === "timed_out") return `Production scanner ${phase} timed out.`;
	if (result.termination === "cancelled") return `Production scanner ${phase} was cancelled.`;
	if (result.exitCode !== 0) return `Production scanner ${phase} exited unsuccessfully.`;
	return undefined;
}

function observationForCommandFailure(
	...args: [
		SecurityScannerAdapterRequest,
		ProductionSecurityCollectorCommandResult,
		string,
	]
): SecurityScannerAdapterObservation {
	const [request, result, limitation] = args;
	return {
		requestDigest: request.requestDigest,
		runId: `collector-failure:${request.requestDigest}`,
		startedAt: result.startedAt,
		completedAt: result.completedAt,
		termination: result.termination,
		...(result.exitCode === undefined ? {} : {exitCode: result.exitCode}),
		outcome: "error",
		coverage: result.termination === "unavailable" ? "unknown" : "partial",
		...(result.stdout ? {stdoutDigest: sha256Digest(result.stdout)} : {}),
		...(result.stderr ? {stderrDigest: sha256Digest(result.stderr)} : {}),
		findings: [],
		limitations: [limitation],
	};
}

function commandErrorObservation(
	...args: [
		SecurityScannerAdapterRequest,
		ProductionSecurityCollectorCommandResult,
		string,
	]
): SecurityScannerAdapterObservation {
	const [request, result, limitation] = args;
	return observationForCommandFailure(
		request,
		{...result, termination: "exited"},
		limitation,
	);
}

function errorObservation(
	...args: [SecurityScannerAdapterRequest, AbortSignal, string]
): SecurityScannerAdapterObservation {
	const [request, signal, limitation] = args;
	return unavailableObservation(
		request,
		signal.aborted ? "cancelled" : "unavailable",
		limitation,
	);
}

function unavailableObservation(
	...args: [
		SecurityScannerAdapterRequest,
		"cancelled" | "unavailable",
		string,
	]
): SecurityScannerAdapterObservation {
	const [request, termination, limitation] = args;
	const observedAt = new Date().toISOString();
	return {
		requestDigest: request.requestDigest,
		runId: `collector-unavailable:${request.requestDigest}`,
		startedAt: observedAt,
		completedAt: observedAt,
		termination,
		outcome: "error",
		coverage: "unknown",
		findings: [],
		limitations: [limitation],
	};
}

function elapsedMilliseconds(...args: [string, string]): number {
	const elapsed = Date.parse(args[1]) - Date.parse(args[0]);
	if (!Number.isSafeInteger(elapsed) || elapsed < 0) {
		throw new Error("Production scanner command timestamps are invalid.");
	}
	return elapsed;
}

function observationField(
	...args: [string | undefined, "level" | "rule" | "path"]
): string | undefined {
	const [observation, field] = args;
	if (!observation) return undefined;
	const prefix = `${field}=`;
	return observation
		.split(" ")
		.find((part) => part.startsWith(prefix))
		?.slice(prefix.length);
}

function claimedSeverity(level: string): "unknown" | "low" | "medium" | "high" {
	if (level === "error") return "high";
	if (level === "warning") return "medium";
	if (level === "note") return "low";
	return "unknown";
}

function absolutePath(...args: [unknown, string]): string {
	const path = boundedText(args[0], args[1], 4_096);
	const field = args[1];
	if (!isAbsolute(path)) throw new Error(`Production collector ${field} must be absolute.`);
	return resolve(path);
}

function boundedToken(...args: [unknown, string]): string {
	const [value, field] = args;
	const token = boundedText(value, field, 128);
	if (!/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/u.test(token)) {
		throw new Error(`Production collector ${field} is invalid.`);
	}
	return token;
}

function boundedText(...args: [unknown, string, number]): string {
	const [value, field, maximum] = args;
	if (typeof value !== "string") throw new Error(`Production collector ${field} must be text.`);
	const text = value.normalize("NFC").trim();
	if (!text || text.length > maximum || /[\u0000-\u001f\u007f-\u009f]/u.test(text)) {
		throw new Error(`Production collector ${field} is invalid.`);
	}
	return text;
}
