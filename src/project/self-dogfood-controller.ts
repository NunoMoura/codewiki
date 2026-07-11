export const SELF_DOGFOOD_CONTROLLER_SCHEMA =
	"codewiki.self-dogfood-controller.v1" as const;

export interface SelfDogfoodControllerPin {
	schemaVersion: typeof SELF_DOGFOOD_CONTROLLER_SCHEMA;
	tag: string;
	source: {
		commit: string;
		tree: string;
	};
	package: {
		name: "codewiki";
		version: string;
		file: string;
		bytes: number;
		sha256: string;
	};
	approval: {
		reviewRef: string;
		approvedBy: string;
		approvedAt: string;
	};
}

const GIT_OBJECT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_PATTERN =
	/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseSelfDogfoodControllerPin(
	value: unknown,
): SelfDogfoodControllerPin {
	const root = objectAt(value, "controller");
	assertExactKeys(root, "controller", [
		"schemaVersion",
		"tag",
		"source",
		"package",
		"approval",
	]);
	assertEqual(
		root.schemaVersion,
		SELF_DOGFOOD_CONTROLLER_SCHEMA,
		"controller.schemaVersion",
	);
	const tag = matchingString(
		root.tag,
		/^codewiki-self-dogfood-baseline-v\d+\.\d+\.\d+$/,
		"controller.tag",
	);

	const source = objectAt(root.source, "controller.source");
	assertExactKeys(source, "controller.source", ["commit", "tree"]);
	const commit = matchingString(
		source.commit,
		GIT_OBJECT_PATTERN,
		"controller.source.commit",
	);
	const tree = matchingString(
		source.tree,
		GIT_OBJECT_PATTERN,
		"controller.source.tree",
	);

	const packageValue = objectAt(root.package, "controller.package");
	assertExactKeys(packageValue, "controller.package", [
		"name",
		"version",
		"file",
		"bytes",
		"sha256",
	]);
	assertEqual(packageValue.name, "codewiki", "controller.package.name");
	const version = matchingString(
		packageValue.version,
		VERSION_PATTERN,
		"controller.package.version",
	);
	const file = matchingString(
		packageValue.file,
		/^codewiki-[0-9A-Za-z.+-]+\.tgz$/,
		"controller.package.file",
	);
	const bytes = positiveInteger(packageValue.bytes, "controller.package.bytes");
	const sha256 = matchingString(
		packageValue.sha256,
		SHA256_PATTERN,
		"controller.package.sha256",
	);

	const approval = objectAt(root.approval, "controller.approval");
	assertExactKeys(approval, "controller.approval", [
		"reviewRef",
		"approvedBy",
		"approvedAt",
	]);
	const reviewRef = nonEmptyString(
		approval.reviewRef,
		"controller.approval.reviewRef",
	);
	const approvedBy = nonEmptyString(
		approval.approvedBy,
		"controller.approval.approvedBy",
	);
	const approvedAt = isoTimestamp(
		approval.approvedAt,
		"controller.approval.approvedAt",
	);

	return {
		schemaVersion: SELF_DOGFOOD_CONTROLLER_SCHEMA,
		tag,
		source: { commit, tree },
		package: {
			name: "codewiki",
			version,
			file,
			bytes,
			sha256,
		},
		approval: { reviewRef, approvedBy, approvedAt },
	};
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${path} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function assertExactKeys(
	value: Record<string, unknown>,
	path: string,
	keys: string[],
): void {
	const expected = new Set(keys);
	for (const key of Object.keys(value)) {
		if (!expected.has(key))
			throw new Error(`Unknown controller key: ${path}.${key}`);
	}
	for (const key of keys) {
		if (!(key in value))
			throw new Error(`Missing controller key: ${path}.${key}`);
	}
}

function nonEmptyString(value: unknown, path: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`${path} must be a non-empty string.`);
	}
	return value.trim();
}

function matchingString(value: unknown, pattern: RegExp, path: string): string {
	const text = nonEmptyString(value, path);
	if (!pattern.test(text)) throw new Error(`${path} has an invalid format.`);
	return text;
}

function positiveInteger(value: unknown, path: string): number {
	if (!Number.isSafeInteger(value) || Number(value) <= 0) {
		throw new Error(`${path} must be a positive integer.`);
	}
	return Number(value);
}

function isoTimestamp(value: unknown, path: string): string {
	const text = nonEmptyString(value, path);
	const timestamp = new Date(text);
	if (Number.isNaN(timestamp.valueOf()) || timestamp.toISOString() !== text) {
		throw new Error(`${path} must be a canonical ISO timestamp.`);
	}
	return text;
}

function assertEqual(value: unknown, expected: string, path: string): void {
	if (value !== expected) throw new Error(`${path} must equal ${expected}.`);
}
