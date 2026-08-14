import {
	normalizeTriagePreferenceBindings,
	type TriagePreferenceBinding,
} from "../../changes/triage/policy.ts";
import {
	CHANGE_KIND_VALUES,
	CHANGE_TYPE_VALUES,
	type ChangeKind,
	type ChangeType,
} from "../../changes/types.ts";
import type {SemanticLoop} from "../contracts.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import type {CheckEnforcement} from "../contracts.ts";
import {
	normalizeRepairProfileEntries,
	resolveRepairProfiles,
	type RepairProfileEntry,
	type ResolvedRepairProfile,
} from "../repair-profiles.ts";
import {
	customCheckConfigurationDigest,
	normalizeCustomCheckDefinitions,
	type CustomCheckDefinition,
} from "./contracts.ts";
import {
	normalizeUserStandardDefinitions,
	type UserStandardDefinition,
} from "./user-standards.ts";

export const PROTECTED_CUSTOM_CHECK_CONFIG_SCHEMA_VERSION = "3.0.0" as const;
export const CHECK_PACK_CONFIG_PROTOCOL_VERSION = "2.0.0" as const;

const DEVELOPMENT_STAGES: readonly SemanticLoop[] = [
	"decision",
	"planning",
	"implementation",
];
const CHECK_ENFORCEMENTS: readonly CheckEnforcement[] = [
	"observe",
	"warn",
	"require",
];
const CHECK_CAPABILITIES = ["temporary_files", "child_processes"] as const;
const DEFAULT_CHECK_TIMEOUT_MS = 60_000;
const DEFAULT_CHECK_MAX_INPUT_BYTES = 1_048_576;
const DEFAULT_CHECK_MAX_OUTPUT_BYTES = 65_536;
const ABSOLUTE_CHECK_MAXIMUMS = {
	timeoutMs: 3_600_000,
	maxInputBytes: 16_777_216,
	maxOutputBytes: 1_048_576,
	maxTimeoutMs: 3_600_000,
} as const;
const PATH_META_CHARACTERS = /[\\*?[\]{}()^$|]/u;

export type CheckEvaluatorKind = "model" | "node_esm";
export type CheckCapability = (typeof CHECK_CAPABILITIES)[number];

export interface CheckApplicabilityConfiguration {
	readonly stages?: readonly SemanticLoop[];
	readonly paths?: readonly string[];
	readonly languages?: readonly string[];
	readonly changeTypes?: readonly ChangeType[];
	readonly changeKinds?: readonly ChangeKind[];
}

export interface CheckInputConfiguration {
	readonly paths?: readonly string[];
}

export interface CheckExecutionConfiguration {
	readonly modelRoute?: string;
	readonly runtimeProfile?: string;
	readonly capabilities?: readonly CheckCapability[];
	readonly timeoutMs?: number;
	readonly maxInputBytes?: number;
	readonly maxOutputBytes?: number;
}

export interface CheckConfiguration {
	readonly enforcement?: CheckEnforcement;
	readonly applicability?: CheckApplicabilityConfiguration;
	readonly input?: CheckInputConfiguration;
	readonly execution?: CheckExecutionConfiguration;
	readonly repairProfiles?: readonly RepairProfileEntry[];
}

export interface ProtectedCheckFloors {
	readonly minimumEnforcement?: CheckEnforcement;
	readonly allowedModelRoutes?: readonly string[];
	readonly allowedRuntimeProfiles?: readonly string[];
	readonly allowedCapabilities?: readonly CheckCapability[];
	readonly maxTimeoutMs?: number;
	readonly maxInputBytes?: number;
	readonly maxOutputBytes?: number;
}

export interface ProjectChecksConfiguration {
	readonly defaults: CheckConfiguration;
	readonly protectedFloors: ProtectedCheckFloors;
}

export interface CheckPackConfiguration {
	readonly defaults: CheckConfiguration;
}

export interface ResolvedCheckApplicabilityConfiguration {
	readonly stages: readonly SemanticLoop[];
	readonly paths: readonly string[];
	readonly languages: readonly string[];
	readonly changeTypes: readonly ChangeType[];
	readonly changeKinds: readonly [ChangeKind, ...ChangeKind[]];
}

export interface ResolvedCheckConfiguration {
	readonly enforcement: CheckEnforcement;
	readonly applicability: Readonly<ResolvedCheckApplicabilityConfiguration>;
	readonly input: Readonly<Required<CheckInputConfiguration>>;
	readonly execution: Readonly<{
		modelRoute?: string;
		runtimeProfile?: string;
		capabilities: readonly CheckCapability[];
		timeoutMs: number;
		maxInputBytes: number;
		maxOutputBytes: number;
	}>;
	readonly repairProfiles: readonly ResolvedRepairProfile[];
	readonly digest: Sha256Digest;
}

export const DEFAULT_PROJECT_CHECKS_CONFIGURATION: ProjectChecksConfiguration =
	Object.freeze({
		defaults: Object.freeze({enforcement: "observe"}),
		protectedFloors: Object.freeze({minimumEnforcement: "observe"}),
	});

export interface CustomCheckConfigState {
	readonly projectConfigDigest: Sha256Digest;
	readonly customCheckConfigDigest: Sha256Digest;
	readonly userStandards: readonly UserStandardDefinition[];
	readonly triagePreferences: readonly TriagePreferenceBinding[];
	readonly customChecks: readonly CustomCheckDefinition[];
}

export interface ProtectedCustomCheckConfigSnapshot
	extends CustomCheckConfigState {
	readonly schemaVersion: typeof PROTECTED_CUSTOM_CHECK_CONFIG_SCHEMA_VERSION;
	readonly protectedSourceHead: string;
	readonly snapshotDigest: Sha256Digest;
}

export function createCustomCheckConfigState(input: {
	readonly projectConfigDigest: Sha256Digest;
	readonly userStandards: readonly UserStandardDefinition[];
	readonly triagePreferences: readonly TriagePreferenceBinding[];
	readonly customChecks: readonly CustomCheckDefinition[];
}): CustomCheckConfigState {
	assertSha256Digest(input.projectConfigDigest, "projectConfigDigest");
	const userStandards = normalizeUserStandardDefinitions(input.userStandards);
	const triagePreferences = normalizeTriagePreferenceBindings(
		input.triagePreferences,
		userStandards,
	);
	const customChecks = normalizeCustomCheckDefinitions(
		input.customChecks,
		userStandards,
	);
	return Object.freeze({
		projectConfigDigest: input.projectConfigDigest,
		customCheckConfigDigest: customCheckConfigurationDigest({
			userStandards,
			customChecks,
		}),
		userStandards: Object.freeze(userStandards),
		triagePreferences: Object.freeze(triagePreferences),
		customChecks: Object.freeze(customChecks),
	});
}

export function createProtectedCustomCheckConfigSnapshot(input: {
	readonly protectedSourceHead: string;
	readonly projectConfigDigest: Sha256Digest;
	readonly userStandards: readonly UserStandardDefinition[];
	readonly triagePreferences: readonly TriagePreferenceBinding[];
	readonly customChecks: readonly CustomCheckDefinition[];
}): ProtectedCustomCheckConfigSnapshot {
	const state = createCustomCheckConfigState(input);
	assertGitObjectId(input.protectedSourceHead, "protectedSourceHead");
	const identity = {
		schemaVersion: PROTECTED_CUSTOM_CHECK_CONFIG_SCHEMA_VERSION,
		protectedSourceHead: input.protectedSourceHead,
		projectConfigDigest: state.projectConfigDigest,
		customCheckConfigDigest: state.customCheckConfigDigest,
	};
	return Object.freeze({
		...identity,
		userStandards: state.userStandards,
		triagePreferences: state.triagePreferences,
		customChecks: state.customChecks,
		snapshotDigest: canonicalJsonDigest(identity),
	});
}

export function assertProtectedCustomCheckConfigSnapshot(
	value: ProtectedCustomCheckConfigSnapshot,
): void {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Protected Custom Check configuration must be an object.");
	}
	assertExactKeys(
		value,
		[
			"schemaVersion",
			"protectedSourceHead",
			"projectConfigDigest",
			"customCheckConfigDigest",
			"userStandards",
			"triagePreferences",
			"customChecks",
			"snapshotDigest",
		],
		"Protected Custom Check configuration",
	);
	if (value.schemaVersion !== PROTECTED_CUSTOM_CHECK_CONFIG_SCHEMA_VERSION) {
		throw new Error(
			`Protected Custom Check configuration schema must be ${PROTECTED_CUSTOM_CHECK_CONFIG_SCHEMA_VERSION}.`,
		);
	}
	const expected = createProtectedCustomCheckConfigSnapshot({
		protectedSourceHead: value.protectedSourceHead,
		projectConfigDigest: value.projectConfigDigest,
		userStandards: value.userStandards,
		triagePreferences: value.triagePreferences,
		customChecks: value.customChecks,
	});
	if (value.customCheckConfigDigest !== expected.customCheckConfigDigest) {
		throw new Error(
			"Protected Custom Check configuration digest does not match its definitions.",
		);
	}
	if (value.snapshotDigest !== expected.snapshotDigest) {
		throw new Error(
			"Protected Custom Check configuration snapshot digest does not match its content.",
		);
	}
}

export function normalizeProjectChecksConfiguration(
	value: unknown = {},
): ProjectChecksConfiguration {
	assertExactKeys(value, ["defaults", "protectedFloors"], "Project Checks configuration");
	const record = value as Record<string, unknown>;
	return Object.freeze({
		defaults: normalizeCheckConfiguration(
			record.defaults ?? DEFAULT_PROJECT_CHECKS_CONFIGURATION.defaults,
			"Project Check defaults",
		),
		protectedFloors: normalizeProtectedCheckFloors(
			record.protectedFloors ??
				DEFAULT_PROJECT_CHECKS_CONFIGURATION.protectedFloors,
		),
	});
}

export function normalizeCheckPackConfiguration(
	value: unknown,
): CheckPackConfiguration {
	assertExactKeys(value, ["defaults"], "Check Pack configuration");
	const record = value as Record<string, unknown>;
	return Object.freeze({
		defaults: normalizeCheckConfiguration(
			record.defaults ?? {},
			"Check Pack defaults",
		),
	});
}

export function normalizeCheckOverrideConfiguration(
	value: unknown,
): CheckConfiguration {
	return normalizeCheckConfiguration(value, "Check override");
}

export function resolveCheckConfiguration(input: {
	readonly evaluatorKind: CheckEvaluatorKind;
	readonly project: ProjectChecksConfiguration;
	readonly pack: CheckPackConfiguration;
	readonly check?: CheckConfiguration;
}): ResolvedCheckConfiguration {
	const project = normalizeProjectChecksConfiguration(input.project);
	const pack = normalizeCheckPackConfiguration(input.pack);
	const check = normalizeCheckConfiguration(input.check ?? {}, "Check override");
	const projectDefaults = project.defaults;
	assertNarrowerCheckScopes(projectDefaults, pack.defaults, "Pack");
	const packDefaults = overlayCheckConfiguration(projectDefaults, pack.defaults);
	assertNarrowerCheckScopes(packDefaults, check, "Check");
	const authored = overlayCheckConfiguration(packDefaults, check);
	const floors = project.protectedFloors;
	const enforcement = strongerEnforcement(
		authored.enforcement ?? "observe",
		floors.minimumEnforcement ?? "observe",
	);
	const resolved = {
		enforcement,
		applicability: resolveApplicability(authored.applicability),
		input: Object.freeze({
			paths: Object.freeze([...(authored.input?.paths ?? [])]),
		}),
		execution: resolveExecution(
			authored.execution,
			floors,
			input.evaluatorKind,
		),
		repairProfiles: resolveRepairProfiles([
			{
				layer: "project",
				ref: ".codewiki/config.json#checks.defaults.repairProfiles",
				profiles: project.defaults.repairProfiles ?? [],
			},
			{
				layer: "pack",
				ref: "check-pack:config.json#defaults.repairProfiles",
				profiles: pack.defaults.repairProfiles ?? [],
			},
			{
				layer: "check",
				ref: "check:config.json#repairProfiles",
				profiles: check.repairProfiles ?? [],
			},
		]),
	};
	return Object.freeze({...resolved, digest: canonicalJsonDigest(resolved)});
}

export function assertCheckPackIdentifier(value: string, label: string): string {
	const normalized = value.trim();
	if (
		!normalized ||
		normalized !== value ||
		!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/u.test(normalized)
	) {
		throw new Error(`${label} must be one lowercase path-safe identifier.`);
	}
	return normalized;
}

export function assertGitRelativeCheckScope(value: string, label: string): string {
	const normalized = value.trim().replaceAll("//", "/");
	if (
		!normalized ||
		normalized !== value ||
		normalized.startsWith("/") ||
		normalized.endsWith("/") ||
		normalized.length > 256 ||
		normalized === "." ||
		normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ||
		PATH_META_CHARACTERS.test(normalized) ||
		normalized.includes("\u0000")
	) {
		throw new Error(
			`${label} must be a Git-relative exact file or directory-prefix path without traversal, globs, or regular expressions.`,
		);
	}
	return normalized;
}

function normalizeCheckConfiguration(
	value: unknown,
	label: string,
): CheckConfiguration {
	assertExactKeys(
		value,
		["enforcement", "applicability", "input", "execution", "repairProfiles"],
		label,
	);
	const record = value as Record<string, unknown>;
	const enforcement = optionalEnum(
		record.enforcement,
		CHECK_ENFORCEMENTS,
		`${label}.enforcement`,
	);
	const applicability = normalizeApplicabilityConfiguration(
		record.applicability,
		`${label}.applicability`,
	);
	const checkInput = normalizeInputConfiguration(record.input, `${label}.input`);
	const execution = normalizeExecutionConfiguration(
		record.execution,
		`${label}.execution`,
	);
	const repairProfiles = record.repairProfiles === undefined
		? undefined
		: normalizeRepairProfileEntries(record.repairProfiles, `${label}.repairProfiles`);
	return Object.freeze({
		...(enforcement ? {enforcement} : {}),
		...(applicability ? {applicability} : {}),
		...(checkInput ? {input: checkInput} : {}),
		...(execution ? {execution} : {}),
		...(repairProfiles ? {repairProfiles} : {}),
	});
}

function normalizeApplicabilityConfiguration(
	value: unknown,
	label: string,
): CheckApplicabilityConfiguration | undefined {
	if (value === undefined) return undefined;
	assertExactKeys(value, ["stages", "paths", "languages", "changeTypes", "changeKinds"], label);
	const record = value as Record<string, unknown>;
	return Object.freeze({
		...optionalList(
			record.stages,
			DEVELOPMENT_STAGES,
			`${label}.stages`,
			(entry) => entry,
		),
		...optionalPathList(record.paths, `${label}.paths`),
		...optionalLanguageList(record.languages, `${label}.languages`),
		...optionalList(
			record.changeTypes,
			CHANGE_TYPE_VALUES,
			`${label}.changeTypes`,
			(entry) => entry,
		),
		...optionalList(
			record.changeKinds,
			CHANGE_KIND_VALUES,
			`${label}.changeKinds`,
			(entry) => entry,
		),
	});
}

function normalizeInputConfiguration(
	value: unknown,
	label: string,
): CheckInputConfiguration | undefined {
	if (value === undefined) return undefined;
	assertExactKeys(value, ["paths"], label);
	const record = value as Record<string, unknown>;
	return Object.freeze({...optionalPathList(record.paths, `${label}.paths`)});
}

function normalizeExecutionConfiguration(
	value: unknown,
	label: string,
): CheckExecutionConfiguration | undefined {
	if (value === undefined) return undefined;
	assertExactKeys(
		value,
		["modelRoute", "runtimeProfile", "capabilities", "timeoutMs", "maxInputBytes", "maxOutputBytes"],
		label,
	);
	const record = value as Record<string, unknown>;
	const modelRoute = optionalIdentifier(record.modelRoute, `${label}.modelRoute`);
	const runtimeProfile = optionalIdentifier(
		record.runtimeProfile,
		`${label}.runtimeProfile`,
	);
	const capabilities = optionalList(
		record.capabilities,
		CHECK_CAPABILITIES,
		`${label}.capabilities`,
		(entry) => entry,
	);
	return Object.freeze({
		...(modelRoute ? {modelRoute} : {}),
		...(runtimeProfile ? {runtimeProfile} : {}),
		...(capabilities ?? {}),
		...optionalPositiveInteger(record.timeoutMs, "timeoutMs", label),
		...optionalPositiveInteger(record.maxInputBytes, "maxInputBytes", label),
		...optionalPositiveInteger(record.maxOutputBytes, "maxOutputBytes", label),
	});
}

function normalizeProtectedCheckFloors(value: unknown): ProtectedCheckFloors {
	const label = "Protected Check floors";
	assertExactKeys(
		value,
		["minimumEnforcement", "allowedModelRoutes", "allowedRuntimeProfiles", "allowedCapabilities", "maxTimeoutMs", "maxInputBytes", "maxOutputBytes"],
		label,
	);
	const record = value as Record<string, unknown>;
	const minimumEnforcement = optionalEnum(
		record.minimumEnforcement,
		CHECK_ENFORCEMENTS,
		`${label}.minimumEnforcement`,
	);
	return Object.freeze({
		...(minimumEnforcement ? {minimumEnforcement} : {}),
		...optionalIdentifierList(record.allowedModelRoutes, "allowedModelRoutes", label),
		...optionalIdentifierList(record.allowedRuntimeProfiles, "allowedRuntimeProfiles", label),
		...optionalList(record.allowedCapabilities, CHECK_CAPABILITIES, `${label}.allowedCapabilities`, (entry) => entry),
		...optionalPositiveInteger(record.maxTimeoutMs, "maxTimeoutMs", label),
		...optionalPositiveInteger(record.maxInputBytes, "maxInputBytes", label),
		...optionalPositiveInteger(record.maxOutputBytes, "maxOutputBytes", label),
	});
}

function overlayCheckConfiguration(
	base: CheckConfiguration,
	override: CheckConfiguration,
): CheckConfiguration {
	return Object.freeze({
		enforcement: override.enforcement ?? base.enforcement,
		applicability: overlayObject(base.applicability, override.applicability),
		input: overlayObject(base.input, override.input),
		execution: overlayObject(base.execution, override.execution),
		repairProfiles: override.repairProfiles ?? base.repairProfiles,
	});
}

function overlayObject<T extends object>(base?: T, override?: T): T | undefined {
	if (!base && !override) return undefined;
	return {...base, ...override} as T;
}

function assertNarrowerCheckScopes(
	outer: CheckConfiguration,
	inner: CheckConfiguration,
	innerLabel: "Pack" | "Check",
): void {
	assertNarrowerList(
		outer.applicability?.stages,
		inner.applicability?.stages,
		`${innerLabel} applicability stages`,
	);
	assertNarrowerPaths(
		outer.applicability?.paths,
		inner.applicability?.paths,
		`${innerLabel} applicability paths`,
	);
	assertNarrowerList(
		outer.applicability?.languages,
		inner.applicability?.languages,
		`${innerLabel} applicability languages`,
	);
	assertNarrowerList(
		outer.applicability?.changeTypes,
		inner.applicability?.changeTypes,
		`${innerLabel} applicability change types`,
	);
	assertNarrowerList(
		outer.applicability?.changeKinds,
		inner.applicability?.changeKinds,
		`${innerLabel} applicability change kinds`,
	);
	assertNarrowerPaths(
		outer.input?.paths,
		inner.input?.paths,
		`${innerLabel} input paths`,
	);
}

function assertNarrowerList<T>(
	outer: readonly T[] | undefined,
	inner: readonly T[] | undefined,
	label: string,
): void {
	if (!outer || !inner) return;
	const allowed = new Set(outer);
	if (inner.some((entry) => !allowed.has(entry))) {
		throw new Error(`${label} cannot widen inherited defaults.`);
	}
}

function assertNarrowerPaths(
	outer: readonly string[] | undefined,
	inner: readonly string[] | undefined,
	label: string,
): void {
	if (!outer || !inner) return;
	if (
		inner.some(
			(path) => !outer.some((scope) => path === scope || path.startsWith(`${scope}/`)),
		)
	) {
		throw new Error(`${label} cannot widen inherited defaults.`);
	}
}

function resolveApplicability(
	value: CheckApplicabilityConfiguration | undefined,
): Readonly<ResolvedCheckApplicabilityConfiguration> {
	if (!value?.changeKinds?.length) {
		throw new Error(
			"Resolved Check applicability must select at least one Change kind.",
		);
	}
	return Object.freeze({
		stages: Object.freeze([...(value.stages ?? DEVELOPMENT_STAGES)]),
		paths: Object.freeze([...(value.paths ?? [])]),
		languages: Object.freeze([...(value.languages ?? [])]),
		changeTypes: Object.freeze([...(value.changeTypes ?? [])]),
		changeKinds: Object.freeze([...value.changeKinds]) as readonly [
			ChangeKind,
			...ChangeKind[],
		],
	});
}

function resolveExecution(
	value: CheckExecutionConfiguration | undefined,
	floors: ProtectedCheckFloors,
	evaluatorKind: CheckEvaluatorKind,
): ResolvedCheckConfiguration["execution"] {
	const execution = value ?? {};
	assertExecutionWithinFloors(execution, floors, evaluatorKind);
	return Object.freeze({
		...(execution.modelRoute ? {modelRoute: execution.modelRoute} : {}),
		...(execution.runtimeProfile
			? {runtimeProfile: execution.runtimeProfile}
			: {}),
		capabilities: Object.freeze([...(execution.capabilities ?? [])]),
		timeoutMs: execution.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS,
		maxInputBytes: execution.maxInputBytes ?? DEFAULT_CHECK_MAX_INPUT_BYTES,
		maxOutputBytes: execution.maxOutputBytes ?? DEFAULT_CHECK_MAX_OUTPUT_BYTES,
	});
}

function assertExecutionWithinFloors(
	execution: CheckExecutionConfiguration,
	floors: ProtectedCheckFloors,
	evaluatorKind: CheckEvaluatorKind,
): void {
	if (evaluatorKind === "model") {
		if (execution.runtimeProfile) throw new Error("Model Checks cannot select a code runtime profile.");
		if ((execution.capabilities?.length ?? 0) > 0) throw new Error("Model Checks cannot request execution capabilities.");
	} else if (execution.modelRoute) {
		throw new Error("Code Checks cannot select a model route.");
	}
	assertAllowed(execution.modelRoute, floors.allowedModelRoutes, "model route");
	assertAllowed(execution.runtimeProfile, floors.allowedRuntimeProfiles, "runtime profile");
	if (
		execution.capabilities &&
		floors.allowedCapabilities &&
		execution.capabilities.some((entry) => !floors.allowedCapabilities?.includes(entry))
	) {
		throw new Error("Check execution capabilities exceed protected floors.");
	}
	assertMaximum(execution.timeoutMs, floors.maxTimeoutMs, "timeoutMs");
	assertMaximum(execution.maxInputBytes, floors.maxInputBytes, "maxInputBytes");
	assertMaximum(execution.maxOutputBytes, floors.maxOutputBytes, "maxOutputBytes");
}

function assertAllowed(
	value: string | undefined,
	allowed: readonly string[] | undefined,
	label: string,
): void {
	if (value && allowed && !allowed.includes(value)) {
		throw new Error(`Check ${label} is outside protected allowlist.`);
	}
}

function assertMaximum(
	value: number | undefined,
	maximum: number | undefined,
	label: string,
): void {
	if (value !== undefined && maximum !== undefined && value > maximum) {
		throw new Error(`Check ${label} exceeds protected maximum ${maximum}.`);
	}
}

function strongerEnforcement(
	value: CheckEnforcement,
	floor: CheckEnforcement,
): CheckEnforcement {
	return CHECK_ENFORCEMENTS.indexOf(value) >= CHECK_ENFORCEMENTS.indexOf(floor)
		? value
		: floor;
}

function optionalPathList(
	value: unknown,
	label: string,
): {readonly paths: readonly string[]} | {} {
	if (value === undefined) return {};
	return {
		paths: normalizeNonEmptyArray(value, label, (entry) => {
			if (typeof entry !== "string") {
				throw new Error(`${label} must contain path strings.`);
			}
			return assertGitRelativeCheckScope(entry, label);
		}),
	};
}

function optionalLanguageList(
	value: unknown,
	label: string,
): {readonly languages: readonly string[]} | {} {
	if (value === undefined) return {};
	return {
		languages: normalizeNonEmptyArray(value, label, (entry) => {
			if (typeof entry !== "string" || !/^[a-z][a-z0-9_+-]{0,31}$/u.test(entry)) {
				throw new Error(`${label} must contain lowercase language identifiers.`);
			}
			return entry;
		}),
	};
}

function optionalIdentifierList(
	value: unknown,
	field: "allowedModelRoutes" | "allowedRuntimeProfiles",
	label: string,
): Partial<Record<typeof field, readonly string[]>> {
	if (value === undefined) return {};
	return {
		[field]: normalizeNonEmptyArray(value, `${label}.${field}`, (entry) => {
			if (typeof entry !== "string") {
				throw new Error(`${label}.${field} must contain route identifiers.`);
			}
			return requiredIdentifier(entry, `${label}.${field}`);
		}),
	};
}

function optionalList<T extends string>(
	value: unknown,
	allowed: readonly T[],
	label: string,
	map: (entry: T) => T,
): {readonly [key: string]: readonly T[]} | {} {
	if (value === undefined) return {};
	const field = label.slice(label.lastIndexOf(".") + 1);
	return {
		[field]: normalizeNonEmptyArray(value, label, (entry) => {
			if (typeof entry !== "string" || !allowed.includes(entry as T)) {
				throw new Error(`${label} contains unsupported value ${String(entry)}.`);
			}
			return map(entry as T);
		}),
	};
}

function normalizeNonEmptyArray<T>(
	value: unknown,
	label: string,
	normalize: (entry: unknown) => T,
): readonly T[] {
	if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
		throw new Error(`${label} must contain between 1 and 64 items when set.`);
	}
	const normalized = [...new Set(value.map(normalize))].sort(compareText);
	return Object.freeze(normalized);
}

function optionalEnum<T extends string>(
	value: unknown,
	allowed: readonly T[],
	label: string,
): T | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || !allowed.includes(value as T)) {
		throw new Error(`${label} is invalid.`);
	}
	return value as T;
}

function optionalIdentifier(value: unknown, label: string): string | undefined {
	return value === undefined ? undefined : requiredIdentifier(value, label);
}

function requiredIdentifier(value: unknown, label: string): string {
	if (
		typeof value !== "string" ||
		!/^[a-z0-9][a-z0-9._:/-]{0,127}$/u.test(value)
	) {
		throw new Error(`${label} must be a bounded route identifier.`);
	}
	return value;
}

function optionalPositiveInteger(
	value: unknown,
	field: "timeoutMs" | "maxInputBytes" | "maxOutputBytes" | "maxTimeoutMs",
	label: string,
): Partial<Record<typeof field, number>> {
	if (value === undefined) return {};
	if (
		!Number.isSafeInteger(value) ||
		Number(value) < 1 ||
		Number(value) > ABSOLUTE_CHECK_MAXIMUMS[field]
	) {
		throw new Error(
			`${label}.${field} must be a positive safe integer no greater than ${ABSOLUTE_CHECK_MAXIMUMS[field]}.`,
		);
	}
	return {[field]: Number(value)};
}

function compareText(left: unknown, right: unknown): number {
	return String(left).localeCompare(String(right));
}

function assertGitObjectId(...input: [unknown, string]): void {
	const [value, field] = input;
	if (typeof value !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
		throw new Error(`${field} must be a full Git object id.`);
	}
}
