import {
	normalizeTriagePreferenceBindings,
	type TriagePreferenceBinding,
} from "../../changes/triage/policy.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
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

function assertGitObjectId(...input: [unknown, string]): void {
	const [value, field] = input;
	if (typeof value !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
		throw new Error(`${field} must be a full Git object id.`);
	}
}
