import {createHash, randomUUID} from "node:crypto";
import {constants as fsConstants} from "node:fs";
import {
	chmod,
	lstat,
	mkdir,
	open,
	realpath,
	rename,
	rm,
} from "node:fs/promises";
import {dirname, isAbsolute, join, resolve} from "node:path";

import {
	canonicalJson,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {
	activateRuntimeBuild,
	assertRuntimeBuildRegistrySnapshot,
	bindActiveRuntimeBuild,
	createRuntimeBuildRegistrySnapshot,
	qualifyRuntimeBuild,
	resolveRuntimeBuildForResume,
	type QualifiedRuntimeBuild,
	type RuntimeBuildBinding,
	type RuntimeBuildRegistrySnapshot,
} from "../contracts.ts";
import type {RunProcessChallenge} from "../processes/protocol.ts";
import type {
	NodeRuntimeBuildResolver,
	NodeRunProcessArtifact,
} from "../processes/node-process-manager.ts";

const STORE_DIRECTORY = "runtime-builds";
const ARTIFACTS_DIRECTORY = "artifacts";
const ARTIFACT_FILE = "runtime.mjs";
const REGISTRY_FILE = "registry.json";
const REGISTRY_LOCK_FILE = "registry.lock";
const MAX_REGISTRY_BYTES = 512 * 1024;
const MAX_ARTIFACT_BYTES = 128 * 1024 * 1024;

export interface RuntimeBuildStoreOptions {
	readonly stateRoot: string;
}

export async function readStoredRuntimeBuildRegistry(
	options: RuntimeBuildStoreOptions,
): Promise<RuntimeBuildRegistrySnapshot | undefined> {
	const stateRoot = normalizeStateRoot(options);
	return readRegistry(stateRoot);
}

export async function qualifyStoredRuntimeBuild(input: {
	readonly stateRoot: string;
	readonly expectedGeneration: number;
	readonly build: QualifiedRuntimeBuild;
	readonly artifactPath: string;
	readonly generatedAt: string;
}): Promise<RuntimeBuildRegistrySnapshot> {
	const stateRoot = normalizeStateRoot(input);
	assertExpectedGeneration(input.expectedGeneration);
	return withRegistryLock(stateRoot, async () => {
		const current = await readRegistry(stateRoot);
		if ((current?.generation ?? 0) !== input.expectedGeneration) {
			throw new Error("Runtime Build registry generation conflict.");
		}
		await installArtifact(stateRoot, input.build, input.artifactPath);
		const registry =
			current ?? createRuntimeBuildRegistrySnapshot({generatedAt: input.generatedAt});
		const next = qualifyRuntimeBuild({
			registry,
			expectedGeneration: input.expectedGeneration,
			build: input.build,
			generatedAt: input.generatedAt,
		});
		await persistRegistry(stateRoot, next);
		return next;
	});
}

export async function activateStoredRuntimeBuild(input: {
	readonly stateRoot: string;
	readonly expectedGeneration: number;
	readonly buildDigest: Sha256Digest;
	readonly generatedAt: string;
}): Promise<RuntimeBuildRegistrySnapshot> {
	const stateRoot = normalizeStateRoot(input);
	assertExpectedGeneration(input.expectedGeneration);
	return withRegistryLock(stateRoot, async () => {
		const current = await readRegistry(stateRoot);
		if (!current || current.generation !== input.expectedGeneration) {
			throw new Error("Runtime Build registry generation conflict.");
		}
		const qualified = current.builds.find(
			(entry) => entry.buildDigest === input.buildDigest,
		);
		if (!qualified) {
			throw new Error(`Runtime Build ${input.buildDigest} is not qualified.`);
		}
		assertRuntimeNodeVersion(qualified);
		await verifyStoredArtifact(stateRoot, qualified);
		const next = activateRuntimeBuild({
			registry: current,
			expectedGeneration: input.expectedGeneration,
			buildDigest: input.buildDigest,
			generatedAt: input.generatedAt,
		});
		await persistRegistry(stateRoot, next);
		return next;
	});
}

export async function bindActiveStoredRuntimeBuild(
	options: RuntimeBuildStoreOptions,
): Promise<Readonly<RuntimeBuildBinding>> {
	const stateRoot = normalizeStateRoot(options);
	const registry = await requiredRegistry(stateRoot);
	const binding = bindActiveRuntimeBuild(registry);
	const build = resolveRuntimeBuildForResume(registry, binding);
	assertRuntimeNodeVersion(build);
	await verifyStoredArtifact(stateRoot, build);
	return binding;
}

export function createStoredNodeRuntimeBuildResolver(
	options: RuntimeBuildStoreOptions,
): NodeRuntimeBuildResolver {
	const stateRoot = normalizeStateRoot(options);
	return async (
		challenge: RunProcessChallenge,
	): Promise<NodeRunProcessArtifact> => {
		const registry = await requiredRegistry(stateRoot);
		const build = resolveRuntimeBuildForResume(registry, {
			buildDigest: challenge.runtimeBuildDigest,
			runProtocolVersion: challenge.runProtocolVersion,
		});
		assertRuntimeNodeVersion(build);
		const artifactPath = await verifyStoredArtifact(stateRoot, build);
		const executable = await realpath(process.execPath);
		const metadata = await lstat(executable);
		if (!metadata.isFile()) {
			throw new Error("Backend Node executable is not a regular file.");
		}
		return Object.freeze({
			runtimeBuildDigest: build.buildDigest,
			runProtocolVersion: build.manifest.runProtocolVersion,
			executable,
			args: Object.freeze([artifactPath]),
			cwd: dirname(artifactPath),
		});
	};
}

async function requiredRegistry(
	stateRoot: string,
): Promise<RuntimeBuildRegistrySnapshot> {
	const registry = await readRegistry(stateRoot);
	if (!registry) throw new Error("Runtime Build registry is unavailable.");
	return registry;
}

async function readRegistry(
	stateRoot: string,
): Promise<RuntimeBuildRegistrySnapshot | undefined> {
	const path = registryPath(stateRoot);
	let handle;
	try {
		handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw error;
	}
	try {
		const metadata = await handle.stat();
		if (
			!metadata.isFile() ||
			metadata.size > MAX_REGISTRY_BYTES ||
			(process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
		) {
			throw new Error(
				"Runtime Build registry file is invalid, non-private, or exceeds its byte limit.",
			);
		}
		const bytes = await handle.readFile("utf8");
		let parsed: unknown;
		try {
			parsed = JSON.parse(bytes);
		} catch (error) {
			throw new Error(`Runtime Build registry JSON is invalid: ${asError(error).message}`);
		}
		assertRuntimeBuildRegistrySnapshot(parsed);
		if (canonicalJson(parsed) !== bytes) {
			throw new Error("Runtime Build registry file is not canonical JSON.");
		}
		return freezeRegistry(parsed);
	} finally {
		await handle.close();
	}
}

async function persistRegistry(
	stateRoot: string,
	snapshot: RuntimeBuildRegistrySnapshot,
): Promise<void> {
	assertRuntimeBuildRegistrySnapshot(snapshot);
	const path = registryPath(stateRoot);
	const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
	const bytes = canonicalJson(snapshot);
	if (Buffer.byteLength(bytes) > MAX_REGISTRY_BYTES) {
		throw new Error("Runtime Build registry file exceeds its byte limit.");
	}
	await mkdir(dirname(path), {recursive: true, mode: 0o700});
	let handle;
	try {
		handle = await open(temporary, "wx", 0o600);
		await handle.writeFile(bytes, "utf8");
		await handle.sync();
		await handle.close();
		handle = undefined;
		await rename(temporary, path);
		if (process.platform !== "win32") await chmod(path, 0o600);
		await syncDirectory(dirname(path));
	} finally {
		await handle?.close();
		await rm(temporary, {force: true});
	}
}

async function withRegistryLock<T>(
	stateRoot: string,
	run: () => Promise<T>,
): Promise<T> {
	const directory = storeRoot(stateRoot);
	await mkdir(directory, {recursive: true, mode: 0o700});
	const path = join(directory, REGISTRY_LOCK_FILE);
	let handle;
	try {
		handle = await open(path, "wx", 0o600);
	} catch (error) {
		if (isAlreadyExists(error)) {
			throw new Error("Another Runtime Build registry write is in progress.");
		}
		throw error;
	}
	try {
		return await run();
	} finally {
		await handle.close();
		await rm(path, {force: true});
	}
}

async function installArtifact(
	stateRoot: string,
	build: QualifiedRuntimeBuild,
	sourcePathValue: string,
): Promise<string> {
	assertRuntimeBuildRegistrySnapshot(
		qualifyRuntimeBuild({
			registry: createRuntimeBuildRegistrySnapshot({generatedAt: build.qualifiedAt}),
			expectedGeneration: 0,
			build,
			generatedAt: build.qualifiedAt,
		}),
	);
	const sourcePath = normalizeAbsolutePath(sourcePathValue, "Runtime Build source artifact");
	const destination = artifactPath(stateRoot, build.buildDigest);
	const existing = await existingArtifact(destination);
	if (existing) {
		await verifyArtifactFile(existing, build.manifest.runtimeArtifactDigest);
		return existing;
	}
	await mkdir(dirname(destination), {recursive: true, mode: 0o700});
	const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
	let source;
	let target;
	try {
		source = await open(
			sourcePath,
			fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
		);
		const metadata = await source.stat();
		assertArtifactMetadata(metadata.size, metadata.isFile());
		target = await open(temporary, "wx", 0o600);
		const digest = createHash("sha256");
		const buffer = Buffer.allocUnsafe(64 * 1024);
		let byteLength = 0;
		for (;;) {
			const {bytesRead} = await source.read(buffer, 0, buffer.length, null);
			if (bytesRead === 0) break;
			byteLength += bytesRead;
			if (byteLength > MAX_ARTIFACT_BYTES) {
				throw new Error("Runtime Build artifact exceeds its byte limit.");
			}
			const chunk = buffer.subarray(0, bytesRead);
			digest.update(chunk);
			await target.writeFile(chunk);
		}
		const actualDigest = `sha256:${digest.digest("hex")}` as Sha256Digest;
		if (actualDigest !== build.manifest.runtimeArtifactDigest) {
			throw new Error("Runtime Build artifact digest does not match its manifest.");
		}
		await target.sync();
		await target.close();
		target = undefined;
		if (process.platform !== "win32") await chmod(temporary, 0o500);
		await rename(temporary, destination);
		await syncDirectory(dirname(destination));
		return destination;
	} finally {
		await source?.close();
		await target?.close();
		await rm(temporary, {force: true});
	}
}

async function verifyStoredArtifact(
	stateRoot: string,
	build: QualifiedRuntimeBuild,
): Promise<string> {
	const path = artifactPath(stateRoot, build.buildDigest);
	await verifyArtifactFile(path, build.manifest.runtimeArtifactDigest);
	return path;
}

async function verifyArtifactFile(
	path: string,
	expectedDigest: Sha256Digest,
): Promise<void> {
	let handle;
	try {
		handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
	} catch (error) {
		if (isNotFound(error)) {
			throw new Error("Exact Runtime Build artifact is unavailable.");
		}
		throw error;
	}
	try {
		const metadata = await handle.stat();
		assertArtifactMetadata(metadata.size, metadata.isFile());
		if (process.platform !== "win32" && (metadata.mode & 0o777) !== 0o500) {
			throw new Error("Stored Runtime Build artifact permissions are not immutable.");
		}
		const digest = createHash("sha256");
		const buffer = Buffer.allocUnsafe(64 * 1024);
		for (;;) {
			const {bytesRead} = await handle.read(buffer, 0, buffer.length, null);
			if (bytesRead === 0) break;
			digest.update(buffer.subarray(0, bytesRead));
		}
		const actualDigest = `sha256:${digest.digest("hex")}`;
		if (actualDigest !== expectedDigest) {
			throw new Error("Stored Runtime Build artifact digest does not match its manifest.");
		}
	} finally {
		await handle.close();
	}
}

async function existingArtifact(path: string): Promise<string | undefined> {
	try {
		const metadata = await lstat(path);
		if (!metadata.isFile() || metadata.isSymbolicLink()) {
			throw new Error("Stored Runtime Build artifact is not a regular file.");
		}
		return path;
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw error;
	}
}

function assertArtifactMetadata(size: number, isFile: boolean): void {
	if (!isFile || size <= 0 || size > MAX_ARTIFACT_BYTES) {
		throw new Error("Runtime Build artifact is invalid or exceeds its byte limit.");
	}
}

function assertRuntimeNodeVersion(build: QualifiedRuntimeBuild): void {
	if (build.manifest.nodeVersion !== process.versions.node) {
		throw new Error(
			`Runtime Build requires Node ${build.manifest.nodeVersion}; CodeWiki runs ${process.versions.node}.`,
		);
	}
}

function artifactPath(stateRoot: string, buildDigest: Sha256Digest): string {
	return join(
		storeRoot(stateRoot),
		ARTIFACTS_DIRECTORY,
		buildDigest.slice("sha256:".length),
		ARTIFACT_FILE,
	);
}

function registryPath(stateRoot: string): string {
	return join(storeRoot(stateRoot), REGISTRY_FILE);
}

function storeRoot(stateRoot: string): string {
	return join(stateRoot, STORE_DIRECTORY);
}

function normalizeStateRoot(options: RuntimeBuildStoreOptions): string {
	if (!options || typeof options !== "object") {
		throw new Error("Runtime Build store options are required.");
	}
	return normalizeAbsolutePath(options.stateRoot, "Runtime Build state root");
}

function normalizeAbsolutePath(value: unknown, field: string): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > 4096 ||
		!isAbsolute(value) ||
		resolve(value) !== value
	) {
		throw new Error(`${field} must be a normalized absolute path.`);
	}
	return value;
}

function assertExpectedGeneration(value: number): void {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(
			"Runtime Build expected generation must be a non-negative safe integer.",
		);
	}
}

function freezeRegistry(
	registry: RuntimeBuildRegistrySnapshot,
): RuntimeBuildRegistrySnapshot {
	return Object.freeze({
		...registry,
		builds: Object.freeze(
			registry.builds.map((build) =>
				Object.freeze({
					...build,
					manifest: Object.freeze({...build.manifest}),
				}),
			),
		),
	});
}

async function syncDirectory(path: string): Promise<void> {
	if (process.platform === "win32") return;
	const directory = await open(path, "r");
	try {
		await directory.sync();
	} finally {
		await directory.close();
	}
}

function isNotFound(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}

function isAlreadyExists(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "EEXIST"
	);
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
