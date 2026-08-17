import {readFileSync} from "node:fs";

import {
	assertSha256Digest,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export const DSH_REVIEWED_SOURCE = Object.freeze({
	repository: "https://github.com/deepseek-ai/deepseek-harness.git",
	commit: "15148dbd9a1d1f1ef1a26e5749b32af0cd663935",
	version: "0.1.0-rc.6",
} as const);

export const CORDIS_VERSION = "4.0.1" as const;

export const DSH_PACKAGE_NAMES = Object.freeze([
	"@deepseek-ai/dsh-agent",
	"@deepseek-ai/dsh-agent-loop",
	"@deepseek-ai/dsh-attachment",
	"@deepseek-ai/dsh-brand",
	"@deepseek-ai/dsh-code-runtime",
	"@deepseek-ai/dsh-commands",
	"@deepseek-ai/dsh-compaction",
	"@deepseek-ai/dsh-invariants",
	"@deepseek-ai/dsh-llm",
	"@deepseek-ai/dsh-llm-replay",
	"@deepseek-ai/dsh-scope",
	"@deepseek-ai/dsh-session",
	"@deepseek-ai/dsh-session-persistence",
	"@deepseek-ai/dsh-session-persistence-jsonl",
	"@deepseek-ai/dsh-settings",
	"@deepseek-ai/dsh-system-prompt",
	"@deepseek-ai/dsh-timeout",
	"@deepseek-ai/dsh-tools",
	"@deepseek-ai/dsh-typert-protocol",
	"@deepseek-ai/dsh-user-approval",
] as const);

export interface DshPackageArtifactProvenance {
	readonly name: string;
	readonly version: string;
	readonly integrity: string;
}

export interface DshRuntimeProvenance {
	readonly reviewedSource: typeof DSH_REVIEWED_SOURCE;
	readonly packageSourceRelationship: "unattested";
	readonly packageSourceAttestation: null;
	readonly dshPackages: readonly DshPackageArtifactProvenance[];
	readonly dshTransitivePackages: readonly DshPackageArtifactProvenance[];
	readonly cordisPackage: DshPackageArtifactProvenance;
	readonly cordisTransitivePackages: readonly DshPackageArtifactProvenance[];
	readonly dshPackageClosureDigest: Sha256Digest;
	readonly cordisClosureDigest: Sha256Digest;
}

interface PackageLockPackage {
	readonly version?: unknown;
	readonly integrity?: unknown;
	readonly dependencies?: unknown;
	readonly optionalDependencies?: unknown;
}

export function readDshRuntimeProvenance(
	packageLockPath: string,
): Readonly<DshRuntimeProvenance> {
	if (typeof packageLockPath !== "string" || packageLockPath.length === 0) {
		throw new Error("DSH provenance requires a package-lock path.");
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(packageLockPath, "utf8"));
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`DSH provenance could not read package-lock: ${reason}`);
	}
	return createDshRuntimeProvenance(parsed);
}

export function createDshRuntimeProvenance(
	value: unknown,
): Readonly<DshRuntimeProvenance> {
	const lock = record(value, "package-lock");
	if (lock.lockfileVersion !== 3) {
		throw new Error("DSH provenance requires package-lock version 3.");
	}
	const packages = record(lock.packages, "package-lock packages");
	const dshPackages = Object.freeze(
		DSH_PACKAGE_NAMES.map((name) =>
			packageArtifact(packages, name, DSH_REVIEWED_SOURCE.version),
		),
	);
	assertNoUnpinnedDshPackages(packages);
	const cordisPackage = packageArtifact(
		packages,
		"@deepseek-ai/cordis",
		CORDIS_VERSION,
	);
	const cordisClosureNames = dependencyClosureNames(
		packages,
		[cordisPackage.name],
	);
	const cordisClosureSet = new Set(cordisClosureNames);
	const cordisTransitivePackages = Object.freeze(
		cordisClosureNames.flatMap((name) =>
			name === cordisPackage.name ? [] : [packageArtifact(packages, name)],
		),
	);
	const directDshSet = new Set<string>(DSH_PACKAGE_NAMES);
	const dshTransitivePackages = Object.freeze(
		dependencyClosureNames(packages, DSH_PACKAGE_NAMES).flatMap((name) =>
			directDshSet.has(name) || cordisClosureSet.has(name)
				? []
				: [packageArtifact(packages, name)],
		),
	);
	const dshPackageClosureDigest = assertSha256Digest(
		canonicalJsonDigest([...dshPackages, ...dshTransitivePackages]),
		"DSH package closure digest",
	);
	const cordisClosureDigest = assertSha256Digest(
		canonicalJsonDigest([cordisPackage, ...cordisTransitivePackages]),
		"Cordis closure digest",
	);
	return Object.freeze({
		reviewedSource: DSH_REVIEWED_SOURCE,
		packageSourceRelationship: "unattested",
		packageSourceAttestation: null,
		dshPackages,
		dshTransitivePackages,
		cordisPackage,
		cordisTransitivePackages,
		dshPackageClosureDigest,
		cordisClosureDigest,
	});
}

function assertNoUnpinnedDshPackages(
	packages: Readonly<Record<string, unknown>>,
): void {
	for (const path of Object.keys(packages)) {
		if (!path.startsWith("node_modules/@deepseek-ai/dsh-")) continue;
		const name = path.slice("node_modules/".length);
		if (!(DSH_PACKAGE_NAMES as readonly string[]).includes(name)) {
			throw new Error(`DSH provenance contains an unpinned package: ${name}.`);
		}
	}
}

function dependencyClosureNames(
	packages: Readonly<Record<string, unknown>>,
	roots: readonly string[],
): readonly string[] {
	const pending = [...roots];
	const names = new Set<string>();
	while (pending.length > 0) {
		const name = pending.shift();
		if (!name || names.has(name)) continue;
		names.add(name);
		const entry = packageEntry(packages, name);
		for (const dependency of dependencyNames(entry)) {
			if (!names.has(dependency)) pending.push(dependency);
		}
	}
	return [...names].sort(compareText);
}

function dependencyNames(entry: PackageLockPackage): readonly string[] {
	const names = new Set<string>();
	for (const value of [entry.dependencies, entry.optionalDependencies]) {
		if (value === undefined) continue;
		for (const name of Object.keys(record(value, "package dependencies"))) {
			names.add(name);
		}
	}
	return [...names].sort(compareText);
}

function packageArtifact(
	packages: Readonly<Record<string, unknown>>,
	name: string,
	expectedVersion?: string,
): Readonly<DshPackageArtifactProvenance> {
	const entry = packageEntry(packages, name);
	if (expectedVersion !== undefined && entry.version !== expectedVersion) {
		throw new Error(`${name} must be pinned to ${expectedVersion}.`);
	}
	if (typeof entry.version !== "string" || entry.version.length === 0) {
		throw new Error(`${name} must have a resolved package version.`);
	}
	if (
		typeof entry.integrity !== "string" ||
		!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity)
	) {
		throw new Error(`${name} must have sha512 package integrity.`);
	}
	return Object.freeze({
		name,
		version: entry.version,
		integrity: entry.integrity,
	});
}

function packageEntry(
	packages: Readonly<Record<string, unknown>>,
	name: string,
): PackageLockPackage {
	return record(
		packages[`node_modules/${name}`],
		`package-lock entry ${name}`,
	) as PackageLockPackage;
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function record(
	value: unknown,
	field: string,
): Readonly<Record<string, unknown>> {
	if (
		value === null ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Object.prototype
	) {
		throw new Error(`${field} must be an object.`);
	}
	return value as Readonly<Record<string, unknown>>;
}
