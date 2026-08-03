import {
	EVIDENCE_SCHEMA_VERSION,
	type CommandExecutionPayload,
	type EvidenceArtifact,
	type EvidenceMaterial,
} from "../contracts.ts";
import {sha256Digest, type Sha256Digest} from "../../utils/canonical-json.ts";

interface AdapterArtifactInput {
	readonly bytes: string | Uint8Array;
	readonly ref: string;
}

export interface StandardAdapterExecutionBinding {
	readonly adapterId: string;
	readonly adapterVersion: string;
	readonly requestDigest: Sha256Digest;
	readonly invocationDigest: Sha256Digest;
	readonly environmentDigest: Sha256Digest;
	readonly configurationDigest: Sha256Digest;
	readonly termination: CommandExecutionPayload["termination"];
	readonly exitCode?: number;
	readonly durationMs: number;
}

type AdapterExecutionObservation = Omit<
	StandardAdapterExecutionBinding,
	"requestDigest" | "configurationDigest"
>;

const STANDARD_EXECUTION_KEYS = [
	"adapterId",
	"adapterVersion",
	"requestDigest",
	"invocationDigest",
	"environmentDigest",
	"configurationDigest",
	"termination",
	"exitCode",
	"durationMs",
] as const;

export function admitAdapterArtifact(
	...input: [
		AdapterArtifactInput,
		{readonly label: string; readonly maximumBytes: number; readonly mediaType: string},
	]
): {readonly artifactBytes: Uint8Array; readonly artifact: EvidenceArtifact} {
	const [value, options] = input;
	const artifactBytes = Buffer.from(value.bytes);
	if (
		artifactBytes.byteLength === 0 ||
		artifactBytes.byteLength > options.maximumBytes
	) {
		throw new Error(
			`${options.label} artifact must contain 1..${options.maximumBytes} UTF-8 bytes.`,
		);
	}
	return Object.freeze({
		artifactBytes,
		artifact: Object.freeze({
			digest: sha256Digest(artifactBytes),
			mediaType: options.mediaType,
			ref: value.ref,
			sizeBytes: artifactBytes.byteLength,
		}),
	});
}

export function admitStandardAdapterExecution(
	...input: [
		unknown,
		{
			readonly label: string;
			readonly errorPrefix: string;
			readonly additionalKeys?: readonly string[];
		},
	]
): StandardAdapterExecutionBinding {
	const [value, options] = input;
	const execution = objectValue(value, `${options.label} execution binding`);
	assertOnlyKeys(
		execution,
		[...STANDARD_EXECUTION_KEYS, ...(options.additionalKeys ?? [])],
		options.errorPrefix,
	);
	const termination = enumValue(
		execution.termination,
		["exited", "timed_out", "cancelled", "unavailable"] as const,
		`${options.label} execution termination`,
	);
	const exitCode = optionalIntegerValue(
		execution.exitCode,
		`${options.label} execution exitCode`,
	);
	if (termination === "exited" && exitCode === undefined) {
		throw new Error(`Exited ${options.label} execution requires exitCode.`);
	}
	if (termination !== "exited" && exitCode !== undefined) {
		throw new Error(`Non-exited ${options.label} execution cannot include exitCode.`);
	}
	return Object.freeze({
		adapterId: boundedText(execution.adapterId, `${options.label} execution adapterId`, 256),
		adapterVersion: boundedText(
			execution.adapterVersion,
			`${options.label} execution adapterVersion`,
			128,
		),
		requestDigest: digestValue(
			execution.requestDigest,
			`${options.label} execution requestDigest`,
		),
		invocationDigest: digestValue(
			execution.invocationDigest,
			`${options.label} execution invocationDigest`,
		),
		environmentDigest: digestValue(
			execution.environmentDigest,
			`${options.label} execution environmentDigest`,
		),
		configurationDigest: digestValue(
			execution.configurationDigest,
			`${options.label} execution configurationDigest`,
		),
		termination,
		...(exitCode === undefined ? {} : {exitCode}),
		durationMs: integerValue(
			execution.durationMs,
			`${options.label} execution durationMs`,
			0,
		),
	});
}

export function buildCommandExecutionMaterial(input: {
	readonly artifact: EvidenceArtifact;
	readonly provenanceRefs: readonly string[];
	readonly execution: AdapterExecutionObservation;
	readonly diagnosticRefs: readonly string[];
	readonly stdoutDigest?: Sha256Digest;
}): EvidenceMaterial<"command_execution"> {
	return Object.freeze({
		schemaVersion: EVIDENCE_SCHEMA_VERSION,
		kind: "command_execution",
		artifact: input.artifact,
		provenanceRefs: input.provenanceRefs,
		payload: {
			adapterId: input.execution.adapterId,
			adapterVersion: input.execution.adapterVersion,
			invocationDigest: input.execution.invocationDigest,
			environmentDigest: input.execution.environmentDigest,
			termination: input.execution.termination,
			...(input.execution.exitCode === undefined
				? {}
				: {exitCode: input.execution.exitCode}),
			durationMs: input.execution.durationMs,
			...(input.stdoutDigest === undefined
				? {}
				: {stdoutDigest: input.stdoutDigest}),
			diagnosticRefs: input.diagnosticRefs,
		},
	});
}

export function buildSourceObservationMaterial(input: {
	readonly artifact: EvidenceArtifact;
	readonly provenanceRefs: readonly string[];
	readonly snapshotDigest: Sha256Digest;
	readonly paths: readonly string[];
	readonly ownershipRefs: readonly string[];
	readonly observations: readonly string[];
}): EvidenceMaterial<"source_observation"> {
	return Object.freeze({
		schemaVersion: EVIDENCE_SCHEMA_VERSION,
		kind: "source_observation",
		artifact: input.artifact,
		provenanceRefs: input.provenanceRefs,
		payload: {
			sourceType: "source" as const,
			snapshotDigest: input.snapshotDigest,
			paths: input.paths,
			symbols: [],
			ownershipRefs: input.ownershipRefs,
			observations: input.observations,
		},
	});
}

export function normalizedProjectPath(value: unknown): {
	readonly path?: string;
	readonly unsafe: boolean;
} {
	if (value === undefined) return {unsafe: false};
	if (typeof value !== "string") return {unsafe: true};
	const trimmed = value.trim().replaceAll("\\", "/");
	if (
		trimmed.length === 0 ||
		trimmed.length > 1_024 ||
		trimmed.startsWith("/") ||
		trimmed.includes("%") ||
		trimmed.includes("?") ||
		trimmed.includes("#") ||
		/^[A-Za-z]:\//.test(trimmed) ||
		/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed) ||
		trimmed.split("/").some((part) => part === "..") ||
		/[\u0000-\u001f\u007f]/u.test(trimmed)
	) {
		return {unsafe: true};
	}
	return {path: trimmed.replace(/^\.\//, ""), unsafe: false};
}

function normalizedTextList(
	...input: [unknown, string, number]
): string[] {
	const [value, label, maximum] = input;
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > maximum) {
		throw new Error(`${label} must contain 0..${maximum} entries.`);
	}
	const values = Array.from(value.entries(), ([index, entry]) =>
		boundedText(entry, `${label}[${index}]`, 1_024),
	);
	if (sortedUnique(values).length !== values.length) {
		throw new Error(`${label} must not contain duplicates.`);
	}
	return values;
}

export function normalizedRefList(
	...input: [unknown, string, number]
): string[] {
	const [value, label, maximum] = input;
	return normalizedTextList(value, label, maximum).map((entry) =>
		safeOpaqueRef(entry, label),
	);
}

export function safeOpaqueRef(...input: [unknown, string]): string {
	const [value, label] = input;
	const ref = boundedText(value, label, 1_024);
	if (!/^[A-Za-z][A-Za-z0-9._-]*:[A-Za-z0-9._:/-]+$/.test(ref)) {
		throw new Error(`${label} must be an opaque credential-free ref.`);
	}
	return ref;
}

export function objectValue(
	...input: [unknown, string]
): Record<string, unknown> {
	const [value, label] = input;
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

export function assertOnlyKeys(
	...input: [Record<string, unknown>, readonly string[], string]
): void {
	const [value, allowed, errorPrefix] = input;
	const allowedKeys = new Set(allowed);
	for (const key of Object.keys(value)) {
		if (!allowedKeys.has(key)) {
			throw new Error(`${errorPrefix} received unsupported field ${key}.`);
		}
	}
}

export function boundedText(...input: [unknown, string, number]): string {
	const [value, label, maximum] = input;
	if (typeof value !== "string") throw new Error(`${label} must be text.`);
	const normalized = value.trim();
	if (
		normalized.length === 0 ||
		[...normalized].length > maximum ||
		/[\u0000-\u001f\u007f]/u.test(normalized)
	) {
		throw new Error(`${label} is invalid or exceeds ${maximum} code points.`);
	}
	return normalized;
}

export function digestValue(...input: [unknown, string]): Sha256Digest {
	const [value, label] = input;
	if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
		throw new Error(`${label} must be a lowercase sha256 digest.`);
	}
	return value as Sha256Digest;
}

export function integerValue(...input: [unknown, string, number]): number {
	const [value, label, minimum] = input;
	if (!Number.isSafeInteger(value) || (value as number) < minimum) {
		throw new Error(`${label} must be an integer >= ${minimum}.`);
	}
	return value as number;
}

function optionalIntegerValue(
	...input: [unknown, string]
): number | undefined {
	const [value, label] = input;
	if (value === undefined) return undefined;
	if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an integer.`);
	return value as number;
}

export function enumValue<const T extends readonly string[]>(
	...input: [unknown, T, string]
): T[number] {
	const [value, values, label] = input;
	if (typeof value !== "string" || !values.includes(value)) {
		throw new Error(`${label} is unsupported.`);
	}
	return value as T[number];
}

export function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort(compareText);
}

export function compareText(...values: [string, string]): number {
	const [left, right] = values;
	if (left === right) return 0;
	return left < right ? -1 : 1;
}
