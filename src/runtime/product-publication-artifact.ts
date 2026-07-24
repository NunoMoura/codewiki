import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { ProductPublicationArtifact } from "./product-publication-contract.ts";

const MAX_PUBLICATION_ARTIFACT_BYTES = 128 * 1024 * 1024;

export async function verifyProductPublicationArtifact(
	repoRoot: string,
	artifact: ProductPublicationArtifact,
	signal: AbortSignal,
): Promise<string> {
	signal.throwIfAborted();
	assertArtifactShape(artifact);
	const artifactRoot = resolve(
		repoRoot,
		".codewiki",
		"runtime",
		"publications",
		"artifacts",
	);
	const artifactPath = resolve(repoRoot, artifact.path);
	if (
		isAbsolute(artifact.path) ||
		!isWithin(artifactRoot, artifactPath) ||
		artifactPath === artifactRoot
	) {
		throw new Error(
			"Product publication artifact must be a file under .codewiki/runtime/publications/artifacts/.",
		);
	}
	await assertNonSymbolicPath(repoRoot, artifactPath);
	const canonicalRoot = await realpath(artifactRoot);
	const canonicalPath = await realpath(artifactPath);
	if (!isWithin(canonicalRoot, canonicalPath)) {
		throw new Error("Product publication artifact escapes its private root.");
	}
	const before = await stat(canonicalPath);
	if (
		!before.isFile() ||
		before.size !== artifact.sizeBytes ||
		before.size > MAX_PUBLICATION_ARTIFACT_BYTES
	) {
		throw new Error("Product publication artifact size does not match proof.");
	}
	const digest = await sha256File(canonicalPath, signal);
	const after = await stat(canonicalPath);
	if (
		digest !== artifact.digest ||
		after.size !== before.size ||
		after.mtimeMs !== before.mtimeMs
	) {
		throw new Error("Product publication artifact digest does not match proof.");
	}
	return canonicalPath;
}

function assertArtifactShape(artifact: ProductPublicationArtifact): void {
	if (!safeId(artifact.artifactId)) {
		throw new Error("Product publication artifact id is invalid.");
	}
	if (!/^sha256:[a-f0-9]{64}$/u.test(artifact.digest)) {
		throw new Error("Product publication artifact digest is invalid.");
	}
	if (
		!Number.isSafeInteger(artifact.sizeBytes) ||
		artifact.sizeBytes < 0 ||
		artifact.sizeBytes > MAX_PUBLICATION_ARTIFACT_BYTES
	) {
		throw new Error("Product publication artifact size is invalid.");
	}
	if (!safeText(artifact.mediaType, 128) || !safeText(artifact.version, 128)) {
		throw new Error("Product publication artifact metadata is invalid.");
	}
	if (!gitObjectId(artifact.sourceCommit) || !gitObjectId(artifact.sourceTree)) {
		throw new Error("Product publication artifact source proof is invalid.");
	}
}

async function assertNonSymbolicPath(
	repoRoot: string,
	artifactPath: string,
): Promise<void> {
	const artifactRoot = join(
		repoRoot,
		".codewiki",
		"runtime",
		"publications",
		"artifacts",
	);
	const candidates = [
		join(repoRoot, ".codewiki"),
		join(repoRoot, ".codewiki", "runtime"),
		join(repoRoot, ".codewiki", "runtime", "publications"),
		artifactRoot,
	];
	let current = artifactPath;
	while (isWithin(artifactRoot, current) && current !== artifactRoot) {
		candidates.push(current);
		current = dirname(current);
	}
	for (const candidate of candidates) {
		const metadata = await lstat(candidate);
		if (metadata.isSymbolicLink()) {
			throw new Error("Product publication artifact path cannot be symbolic.");
		}
	}
}

function sha256File(path: string, signal: AbortSignal): Promise<string> {
	return new Promise((resolveDigest, reject) => {
		const hash = createHash("sha256");
		const stream = createReadStream(path);
		const abort = () => stream.destroy(signal.reason as Error | undefined);
		signal.addEventListener("abort", abort, { once: true });
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolveDigest(`sha256:${hash.digest("hex")}`));
		stream.on("close", () => signal.removeEventListener("abort", abort));
	});
}

function isWithin(root: string, candidate: string): boolean {
	const path = relative(root, candidate);
	return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function safeId(value: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,255}$/u.test(value);
}

function safeText(value: string, maximum: number): boolean {
	return (
		value.length > 0 &&
		value.length <= maximum &&
		!/[\u0000-\u001f\u007f]/u.test(value)
	);
}

function gitObjectId(value: string): boolean {
	return /^[a-f0-9]{40,64}$/u.test(value);
}
