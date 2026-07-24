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

const PRODUCT_PUBLICATION_MANIFEST_SCHEMA_VERSION = 1 as const;

export interface ProductPublicationManifestIdentity {
	jobId: string;
	pushEventId: string;
	targetId: string;
	channel: string;
	destinationRef: string;
	artifactDigest: string;
	adapterId: string;
}

export interface ProductPublicationManifest
	extends ProductPublicationManifestIdentity {
	schemaVersion: typeof PRODUCT_PUBLICATION_MANIFEST_SCHEMA_VERSION;
	phase: "prepared" | "published";
	operationId: string | null;
	revision: string | null;
}

export async function writeProductPublicationManifest(
	repoRoot: string,
	identity: ProductPublicationManifestIdentity,
	phase: ProductPublicationManifest["phase"],
	operation?: { operationId: string; revision: string },
): Promise<void> {
	if ((phase === "published") !== Boolean(operation)) {
		throw new Error("Product publication manifest phase is invalid.");
	}
	const path = publicationManifestPath(repoRoot, identity);
	await assertPrivateManifestPath(repoRoot, path);
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	await assertPrivateManifestPath(repoRoot, path);
	const temporaryPath = `${path}.${process.pid}.tmp`;
	await assertPrivateManifestPath(repoRoot, temporaryPath);
	await writeFile(
		temporaryPath,
		`${JSON.stringify(publicationManifest(identity, phase, operation))}\n`,
		{ encoding: "utf8", mode: 0o600 },
	);
	await rename(temporaryPath, path);
}

export async function readProductPublicationManifest(
	repoRoot: string,
	identity: ProductPublicationManifestIdentity,
): Promise<ProductPublicationManifest | undefined> {
	const path = publicationManifestPath(repoRoot, identity);
	await assertPrivateManifestPath(repoRoot, path);
	let value: unknown;
	try {
		const metadata = await stat(path);
		if (!metadata.isFile() || metadata.size > 16 * 1024) {
			throw new Error("Product publication recovery manifest is invalid.");
		}
		value = JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw new Error("Product publication recovery manifest is invalid.");
	}
	const manifest = value as Partial<ProductPublicationManifest>;
	if (
		(manifest.phase !== "prepared" && manifest.phase !== "published") ||
		(manifest.phase === "prepared" &&
			(manifest.operationId !== null || manifest.revision !== null)) ||
		(manifest.phase === "published" &&
			(!safeEvidence(manifest.operationId) || !safeEvidence(manifest.revision))) ||
		stableJson(manifest) !==
			stableJson(
				publicationManifest(
					identity,
					manifest.phase,
					manifest.phase === "published"
						? {
								operationId: manifest.operationId as string,
								revision: manifest.revision as string,
							}
						: undefined,
				),
			)
	) {
		throw new Error("Product publication recovery manifest does not match job.");
	}
	return manifest as ProductPublicationManifest;
}

export async function removeProductPublicationManifest(
	repoRoot: string,
	identity: ProductPublicationManifestIdentity,
): Promise<void> {
	const path = publicationManifestPath(repoRoot, identity);
	await assertPrivateManifestPath(repoRoot, path);
	await rm(path, { force: true });
}

function publicationManifest(
	identity: ProductPublicationManifestIdentity,
	phase: ProductPublicationManifest["phase"],
	operation?: { operationId: string; revision: string },
): ProductPublicationManifest {
	return {
		schemaVersion: PRODUCT_PUBLICATION_MANIFEST_SCHEMA_VERSION,
		...identity,
		phase,
		operationId: operation?.operationId || null,
		revision: operation?.revision || null,
	};
}

function publicationManifestPath(
	repoRoot: string,
	identity: ProductPublicationManifestIdentity,
): string {
	return join(
		repoRoot,
		".codewiki",
		"runtime",
		"publications",
		"manifests",
		`${identity.jobId.slice(-64)}.json`,
	);
}

async function assertPrivateManifestPath(
	repoRoot: string,
	path: string,
): Promise<void> {
	for (const candidate of [
		join(repoRoot, ".codewiki"),
		join(repoRoot, ".codewiki", "runtime"),
		join(repoRoot, ".codewiki", "runtime", "publications"),
		join(repoRoot, ".codewiki", "runtime", "publications", "manifests"),
		path,
	]) {
		try {
			const metadata = await lstat(candidate);
			if (metadata.isSymbolicLink()) {
				throw new Error("Product publication runtime path cannot be symbolic.");
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
