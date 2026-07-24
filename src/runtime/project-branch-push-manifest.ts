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

const PUSH_MANIFEST_SCHEMA_VERSION = 1 as const;

interface ProjectBranchPushManifestIdentity {
	jobId: string;
	mergeEventId: string;
	remote: string;
	targetBranch: string;
	expectedRemoteCommit: string | null;
	commit: string;
	tree: string;
}

interface PushManifest {
	schemaVersion: typeof PUSH_MANIFEST_SCHEMA_VERSION;
	jobId: string;
	mergeEventId: string;
	remote: string;
	targetBranch: string;
	expectedRemoteCommit: string | null;
	commit: string;
	tree: string;
	phase: "prepared" | "pushed";
}

export async function writeProjectBranchPushManifest(
	repoRoot: string,
	identity: ProjectBranchPushManifestIdentity,
	phase: PushManifest["phase"],
): Promise<void> {
	const path = pushManifestPath(repoRoot, identity);
	await assertPrivatePushPath(repoRoot, path);
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	await assertPrivatePushPath(repoRoot, path);
	const manifest = pushManifest(identity, phase);
	const temporaryPath = `${path}.${process.pid}.tmp`;
	await assertPrivatePushPath(repoRoot, temporaryPath);
	await writeFile(temporaryPath, `${JSON.stringify(manifest)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	await rename(temporaryPath, path);
}

export async function readProjectBranchPushManifest(
	repoRoot: string,
	identity: ProjectBranchPushManifestIdentity,
): Promise<PushManifest | undefined> {
	const path = pushManifestPath(repoRoot, identity);
	await assertPrivatePushPath(repoRoot, path);
	let parsed: unknown;
	try {
		const metadata = await stat(path);
		if (!metadata.isFile() || metadata.size > 16 * 1024) {
			throw new Error("Project branch push recovery manifest is invalid.");
		}
		parsed = JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw new Error("Project branch push recovery manifest is invalid.");
	}
	const manifest = parsed as Partial<PushManifest>;
	if (
		(manifest.phase !== "prepared" && manifest.phase !== "pushed") ||
		stableJson(manifest) !== stableJson(pushManifest(identity, manifest.phase))
	) {
		throw new Error("Project branch push recovery manifest does not match job.");
	}
	return manifest as PushManifest;
}

export async function removeProjectBranchPushManifest(
	repoRoot: string,
	identity: ProjectBranchPushManifestIdentity,
): Promise<void> {
	const path = pushManifestPath(repoRoot, identity);
	await assertPrivatePushPath(repoRoot, path);
	await rm(path, { force: true });
}

function pushManifest(
	identity: ProjectBranchPushManifestIdentity,
	phase: PushManifest["phase"],
): PushManifest {
	return {
		schemaVersion: PUSH_MANIFEST_SCHEMA_VERSION,
		jobId: identity.jobId,
		mergeEventId: identity.mergeEventId,
		remote: identity.remote,
		targetBranch: identity.targetBranch,
		expectedRemoteCommit: identity.expectedRemoteCommit,
		commit: identity.commit,
		tree: identity.tree,
		phase,
	};
}

function pushManifestPath(
	repoRoot: string,
	identity: ProjectBranchPushManifestIdentity,
): string {
	return join(
		repoRoot,
		".codewiki",
		"runtime",
		"pushes",
		`${identity.jobId.slice(-64)}.json`,
	);
}

async function assertPrivatePushPath(
	repoRoot: string,
	path: string,
): Promise<void> {
	for (const candidate of [
		join(repoRoot, ".codewiki"),
		join(repoRoot, ".codewiki", "runtime"),
		join(repoRoot, ".codewiki", "runtime", "pushes"),
		path,
	]) {
		try {
			const metadata = await lstat(candidate);
			if (metadata.isSymbolicLink()) {
				throw new Error("Project branch push runtime path cannot be symbolic.");
			}
		} catch (error) {
			if (!isNotFound(error)) throw error;
		}
	}
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
