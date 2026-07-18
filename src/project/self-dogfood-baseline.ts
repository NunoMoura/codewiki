import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export const SELF_DOGFOOD_BASELINE_SCHEMA =
	"codewiki.self-dogfood-baseline.v1" as const;

export interface SelfDogfoodBaselineManifest {
	schemaVersion: typeof SELF_DOGFOOD_BASELINE_SCHEMA;
	createdAt: string;
	source: {
		commit: string;
		tree: string;
		contentProof: string;
	};
	package: {
		name: "@nunomoura/codewiki";
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
	gates: {
		audit: "passed";
		lab: "passed";
		pipeline: "passed";
	};
}

export interface VerifiedSelfDogfoodBaseline {
	manifestPath: string;
	packagePath: string;
	manifest: SelfDogfoodBaselineManifest;
}

const GIT_OBJECT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_PATTERN =
	/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseSelfDogfoodBaselineManifest(
	value: unknown,
): SelfDogfoodBaselineManifest {
	const root = objectAt(value, "baseline");
	assertExactKeys(root, "baseline", [
		"schemaVersion",
		"createdAt",
		"source",
		"package",
		"approval",
		"gates",
	]);
	assertEqual(
		root.schemaVersion,
		SELF_DOGFOOD_BASELINE_SCHEMA,
		"baseline.schemaVersion",
	);
	const createdAt = isoTimestamp(root.createdAt, "baseline.createdAt");

	const source = objectAt(root.source, "baseline.source");
	assertExactKeys(source, "baseline.source", [
		"commit",
		"tree",
		"contentProof",
	]);
	const commit = matchingString(
		source.commit,
		GIT_OBJECT_PATTERN,
		"baseline.source.commit",
	);
	const tree = matchingString(
		source.tree,
		GIT_OBJECT_PATTERN,
		"baseline.source.tree",
	);
	assertEqual(
		source.contentProof,
		`git-tree:${tree}`,
		"baseline.source.contentProof",
	);

	const packageValue = objectAt(root.package, "baseline.package");
	assertExactKeys(packageValue, "baseline.package", [
		"name",
		"version",
		"file",
		"bytes",
		"sha256",
	]);
	assertEqual(
		packageValue.name,
		"@nunomoura/codewiki",
		"baseline.package.name",
	);
	const version = matchingString(
		packageValue.version,
		VERSION_PATTERN,
		"baseline.package.version",
	);
	const file = nonEmptyString(packageValue.file, "baseline.package.file");
	if (basename(file) !== file || !file.endsWith(".tgz")) {
		throw new Error("baseline.package.file must be a local .tgz filename.");
	}
	const bytes = positiveInteger(packageValue.bytes, "baseline.package.bytes");
	const sha256 = matchingString(
		packageValue.sha256,
		SHA256_PATTERN,
		"baseline.package.sha256",
	);

	const approval = objectAt(root.approval, "baseline.approval");
	assertExactKeys(approval, "baseline.approval", [
		"reviewRef",
		"approvedBy",
		"approvedAt",
	]);
	const reviewRef = nonEmptyString(
		approval.reviewRef,
		"baseline.approval.reviewRef",
	);
	const approvedBy = nonEmptyString(
		approval.approvedBy,
		"baseline.approval.approvedBy",
	);
	const approvedAt = isoTimestamp(
		approval.approvedAt,
		"baseline.approval.approvedAt",
	);

	const gates = objectAt(root.gates, "baseline.gates");
	assertExactKeys(gates, "baseline.gates", ["audit", "lab", "pipeline"]);
	assertEqual(gates.audit, "passed", "baseline.gates.audit");
	assertEqual(gates.lab, "passed", "baseline.gates.lab");
	assertEqual(gates.pipeline, "passed", "baseline.gates.pipeline");

	return {
		schemaVersion: SELF_DOGFOOD_BASELINE_SCHEMA,
		createdAt,
		source: {
			commit,
			tree,
			contentProof: `git-tree:${tree}`,
		},
		package: {
			name: "@nunomoura/codewiki",
			version,
			file,
			bytes,
			sha256,
		},
		approval: { reviewRef, approvedBy, approvedAt },
		gates: { audit: "passed", lab: "passed", pipeline: "passed" },
	};
}

export async function readSelfDogfoodBaselineManifest(
	manifestPath: string,
): Promise<SelfDogfoodBaselineManifest> {
	let value: unknown;
	try {
		value = JSON.parse(await readFile(manifestPath, "utf8"));
	} catch (error) {
		throw new Error(
			`Cannot read self-dogfood baseline manifest ${manifestPath}: ${errorMessage(error)}`,
		);
	}
	return parseSelfDogfoodBaselineManifest(value);
}

export async function verifySelfDogfoodBaselineArtifact(
	manifestPath: string,
): Promise<VerifiedSelfDogfoodBaseline> {
	const resolvedManifestPath = resolve(manifestPath);
	const manifest = await readSelfDogfoodBaselineManifest(resolvedManifestPath);
	const packagePath = resolve(
		dirname(resolvedManifestPath),
		manifest.package.file,
	);
	if (dirname(packagePath) !== dirname(resolvedManifestPath)) {
		throw new Error("Baseline package must be beside its manifest.");
	}
	const packageStat = await stat(packagePath);
	if (!packageStat.isFile()) throw new Error("Baseline package is not a file.");
	if (packageStat.size !== manifest.package.bytes) {
		throw new Error(
			`Baseline package byte mismatch: expected ${manifest.package.bytes}, got ${packageStat.size}.`,
		);
	}
	const digest = createHash("sha256")
		.update(await readFile(packagePath))
		.digest("hex");
	if (digest !== manifest.package.sha256) {
		throw new Error(
			`Baseline package SHA-256 mismatch: expected ${manifest.package.sha256}, got ${digest}.`,
		);
	}
	return { manifestPath: resolvedManifestPath, packagePath, manifest };
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
			throw new Error(`Unknown baseline key: ${path}.${key}`);
	}
	for (const key of keys) {
		if (!(key in value))
			throw new Error(`Missing baseline key: ${path}.${key}`);
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

function isoTimestamp(value: unknown, path: string): string {
	const text = nonEmptyString(value, path);
	const timestamp = new Date(text);
	if (Number.isNaN(timestamp.valueOf()) || timestamp.toISOString() !== text) {
		throw new Error(`${path} must be a canonical ISO timestamp.`);
	}
	return text;
}

function positiveInteger(value: unknown, path: string): number {
	if (!Number.isSafeInteger(value) || Number(value) <= 0) {
		throw new Error(`${path} must be a positive integer.`);
	}
	return Number(value);
}

function assertEqual(value: unknown, expected: string, path: string): void {
	if (value !== expected) throw new Error(`${path} must equal ${expected}.`);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
