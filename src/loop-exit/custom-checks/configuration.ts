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

export const PROTECTED_CUSTOM_CHECK_CONFIG_SCHEMA_VERSION = "1.0.0" as const;

export interface CustomCheckConfigState {
	readonly projectConfigDigest: Sha256Digest;
	readonly customCheckConfigDigest: Sha256Digest;
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
	readonly customChecks: readonly CustomCheckDefinition[];
}): CustomCheckConfigState {
	assertSha256Digest(input.projectConfigDigest, "projectConfigDigest");
	const customChecks = normalizeCustomCheckDefinitions(input.customChecks);
	return Object.freeze({
		projectConfigDigest: input.projectConfigDigest,
		customCheckConfigDigest: customCheckConfigurationDigest(customChecks),
		customChecks: Object.freeze(customChecks),
	});
}

export function createProtectedCustomCheckConfigSnapshot(input: {
	readonly protectedSourceHead: string;
	readonly projectConfigDigest: Sha256Digest;
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

function assertGitObjectId(value: unknown, field: string): asserts value is string {
	if (typeof value !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
		throw new Error(`${field} must be a full Git object id.`);
	}
}
