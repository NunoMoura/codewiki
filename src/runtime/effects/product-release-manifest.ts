import {
	lstat,
	mkdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

const PRODUCT_RELEASE_MANIFEST_SCHEMA_VERSION = 1 as const;

export interface ProductReleaseManifestIdentity {
	jobId: string;
	publicationEventId: string;
	targetId: string;
	channel: string;
	destinationRef: string;
	artifactDigest: string;
	adapterId: string;
}

export interface ProductReleaseManifest extends ProductReleaseManifestIdentity {
	schemaVersion: typeof PRODUCT_RELEASE_MANIFEST_SCHEMA_VERSION;
	phase: "prepared" | "released";
	operationId: string | null;
	revision: string | null;
}

export async function writeProductReleaseManifest(
	repoRoot: string,
	identity: ProductReleaseManifestIdentity,
	phase: ProductReleaseManifest["phase"],
	operation?: { operationId: string; revision: string },
): Promise<void> {
	if ((phase === "released") !== Boolean(operation)) {
		throw new Error("Product release manifest phase is invalid.");
	}
	const path = releaseManifestPath(repoRoot, identity);
	await assertPrivateReleasePath(repoRoot, path);
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	await assertPrivateReleasePath(repoRoot, path);
	const temporaryPath = `${path}.${process.pid}.tmp`;
	await assertPrivateReleasePath(repoRoot, temporaryPath);
	await writeFile(
		temporaryPath,
		`${JSON.stringify(releaseManifest(identity, phase, operation))}\n`,
		{ encoding: "utf8", mode: 0o600 },
	);
	await rename(temporaryPath, path);
}

export async function readProductReleaseManifest(
	repoRoot: string,
	identity: ProductReleaseManifestIdentity,
): Promise<ProductReleaseManifest | undefined> {
	const path = releaseManifestPath(repoRoot, identity);
	await assertPrivateReleasePath(repoRoot, path);
	let value: unknown;
	try {
		const metadata = await stat(path);
		if (!metadata.isFile() || metadata.size > 16 * 1024) {
			throw new Error("Product release recovery manifest is invalid.");
		}
		value = JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw new Error("Product release recovery manifest is invalid.");
	}
	const manifest = value as Partial<ProductReleaseManifest>;
	if (
		(manifest.phase !== "prepared" && manifest.phase !== "released") ||
		(manifest.phase === "prepared" &&
			(manifest.operationId !== null || manifest.revision !== null)) ||
		(manifest.phase === "released" &&
			(!safeEvidence(manifest.operationId) || !safeEvidence(manifest.revision))) ||
		stableJson(manifest) !==
			stableJson(
				releaseManifest(
					identity,
					manifest.phase,
					manifest.phase === "released"
						? {
								operationId: manifest.operationId as string,
								revision: manifest.revision as string,
							}
						: undefined,
				),
			)
	) {
		throw new Error("Product release recovery manifest does not match job.");
	}
	return manifest as ProductReleaseManifest;
}

export async function removeProductReleaseManifest(
	repoRoot: string,
	identity: ProductReleaseManifestIdentity,
): Promise<void> {
	const path = releaseManifestPath(repoRoot, identity);
	await assertPrivateReleasePath(repoRoot, path);
	await rm(path, { force: true });
}

function releaseManifest(
	identity: ProductReleaseManifestIdentity,
	phase: ProductReleaseManifest["phase"],
	operation?: { operationId: string; revision: string },
): ProductReleaseManifest {
	return {
		schemaVersion: PRODUCT_RELEASE_MANIFEST_SCHEMA_VERSION,
		...identity,
		phase,
		operationId: operation?.operationId || null,
		revision: operation?.revision || null,
	};
}

function releaseManifestPath(
	repoRoot: string,
	identity: ProductReleaseManifestIdentity,
): string {
	return join(
		repoRoot,
		".codewiki",
		"runtime",
		"releases",
		"manifests",
		`${identity.jobId.slice(-64)}.json`,
	);
}

async function assertPrivateReleasePath(
	repoRoot: string,
	path: string,
): Promise<void> {
	for (const candidate of [
		join(repoRoot, ".codewiki"),
		join(repoRoot, ".codewiki", "runtime"),
		join(repoRoot, ".codewiki", "runtime", "releases"),
		join(repoRoot, ".codewiki", "runtime", "releases", "manifests"),
		path,
	]) {
		try {
			const metadata = await lstat(candidate);
			if (metadata.isSymbolicLink()) {
				throw new Error("Product release runtime path cannot be symbolic.");
			}
		} catch (error) {
			if (!isNotFound(error)) throw error;
		}
	}
}

function safeEvidence(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.length <= 512 &&
		!/[\u0000-\u001f\u007f]/u.test(value)
	);
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: string }).code === "ENOENT"
	);
}
