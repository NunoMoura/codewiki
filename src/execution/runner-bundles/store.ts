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
	activateRunnerBundle,
	assertRunnerBundleRegistrySnapshot,
	bindActiveRunnerBundle,
	createRunnerBundleRegistrySnapshot,
	qualifyRunnerBundle,
	resolveRunnerBundleForResume,
	type QualifiedRunnerBundle,
	type RunnerBundleBinding,
	type RunnerBundleRegistrySnapshot,
} from "../ports.ts";
import type {AgentRunnerProcessChallenge} from "../supervisor/process-protocol.ts";
import type {
	NodeAgentRunnerArtifactResolver,
	NodeAgentRunnerProcessArtifact,
} from "../supervisor/node-process-launcher.ts";

const STORE_DIRECTORY = "runner-bundles";
const ARTIFACTS_DIRECTORY = "artifacts";
const ARTIFACT_FILE = "runner.mjs";
const REGISTRY_FILE = "registry.json";
const REGISTRY_LOCK_FILE = "registry.lock";
const MAX_REGISTRY_BYTES = 512 * 1024;
const MAX_ARTIFACT_BYTES = 128 * 1024 * 1024;

export interface RunnerBundleStoreOptions {
	readonly stateRoot: string;
}

export async function readStoredRunnerBundleRegistry(
	options: RunnerBundleStoreOptions,
): Promise<RunnerBundleRegistrySnapshot | undefined> {
	const stateRoot = normalizeStateRoot(options);
	return readRegistry(stateRoot);
}

export async function qualifyStoredRunnerBundle(input: {
	readonly stateRoot: string;
	readonly expectedGeneration: number;
	readonly bundle: QualifiedRunnerBundle;
	readonly artifactPath: string;
	readonly generatedAt: string;
}): Promise<RunnerBundleRegistrySnapshot> {
	const stateRoot = normalizeStateRoot(input);
	assertExpectedGeneration(input.expectedGeneration);
	return withRegistryLock(stateRoot, async () => {
		const current = await readRegistry(stateRoot);
		if ((current?.generation ?? 0) !== input.expectedGeneration) {
			throw new Error("Runner Bundle registry generation conflict.");
		}
		await installArtifact(stateRoot, input.bundle, input.artifactPath);
		const registry =
			current ?? createRunnerBundleRegistrySnapshot({generatedAt: input.generatedAt});
		const next = qualifyRunnerBundle({
			registry,
			expectedGeneration: input.expectedGeneration,
			bundle: input.bundle,
			generatedAt: input.generatedAt,
		});
		await persistRegistry(stateRoot, next);
		return next;
	});
}

export async function activateStoredRunnerBundle(input: {
	readonly stateRoot: string;
	readonly expectedGeneration: number;
	readonly bundleDigest: Sha256Digest;
	readonly generatedAt: string;
}): Promise<RunnerBundleRegistrySnapshot> {
	const stateRoot = normalizeStateRoot(input);
	assertExpectedGeneration(input.expectedGeneration);
	return withRegistryLock(stateRoot, async () => {
		const current = await readRegistry(stateRoot);
		if (!current || current.generation !== input.expectedGeneration) {
			throw new Error("Runner Bundle registry generation conflict.");
		}
		const qualified = current.bundles.find(
			(entry) => entry.bundleDigest === input.bundleDigest,
		);
		if (!qualified) {
			throw new Error(`Runner Bundle ${input.bundleDigest} is not qualified.`);
		}
		assertBackendNodeVersion(qualified);
		await verifyStoredArtifact(stateRoot, qualified);
		const next = activateRunnerBundle({
			registry: current,
			expectedGeneration: input.expectedGeneration,
			bundleDigest: input.bundleDigest,
			generatedAt: input.generatedAt,
		});
		await persistRegistry(stateRoot, next);
		return next;
	});
}

export async function bindActiveStoredRunnerBundle(
	options: RunnerBundleStoreOptions,
): Promise<Readonly<RunnerBundleBinding>> {
	const stateRoot = normalizeStateRoot(options);
	const registry = await requiredRegistry(stateRoot);
	const binding = bindActiveRunnerBundle(registry);
	const bundle = resolveRunnerBundleForResume(registry, binding);
	assertBackendNodeVersion(bundle);
	await verifyStoredArtifact(stateRoot, bundle);
	return binding;
}

export function createStoredNodeAgentRunnerArtifactResolver(
	options: RunnerBundleStoreOptions,
): NodeAgentRunnerArtifactResolver {
	const stateRoot = normalizeStateRoot(options);
	return async (
		challenge: AgentRunnerProcessChallenge,
	): Promise<NodeAgentRunnerProcessArtifact> => {
		const registry = await requiredRegistry(stateRoot);
		const bundle = resolveRunnerBundleForResume(registry, {
			bundleDigest: challenge.runnerBundleDigest,
			runnerProtocolVersion: challenge.runnerProtocolVersion,
		});
		assertBackendNodeVersion(bundle);
		const artifactPath = await verifyStoredArtifact(stateRoot, bundle);
		const executable = await realpath(process.execPath);
		const metadata = await lstat(executable);
		if (!metadata.isFile()) {
			throw new Error("Backend Node executable is not a regular file.");
		}
		return Object.freeze({
			runnerBundleDigest: bundle.bundleDigest,
			runnerProtocolVersion: bundle.manifest.runnerProtocolVersion,
			executable,
			args: Object.freeze([artifactPath]),
			cwd: dirname(artifactPath),
		});
	};
}

async function requiredRegistry(
	stateRoot: string,
): Promise<RunnerBundleRegistrySnapshot> {
	const registry = await readRegistry(stateRoot);
	if (!registry) throw new Error("Runner Bundle registry is unavailable.");
	return registry;
}

async function readRegistry(
	stateRoot: string,
): Promise<RunnerBundleRegistrySnapshot | undefined> {
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
				"Runner Bundle registry file is invalid, non-private, or exceeds its byte limit.",
			);
		}
		const bytes = await handle.readFile("utf8");
		let parsed: unknown;
		try {
			parsed = JSON.parse(bytes);
		} catch (error) {
			throw new Error(`Runner Bundle registry JSON is invalid: ${asError(error).message}`);
		}
		assertRunnerBundleRegistrySnapshot(parsed);
		if (canonicalJson(parsed) !== bytes) {
			throw new Error("Runner Bundle registry file is not canonical JSON.");
		}
		return freezeRegistry(parsed);
	} finally {
		await handle.close();
	}
}

async function persistRegistry(
	stateRoot: string,
	snapshot: RunnerBundleRegistrySnapshot,
): Promise<void> {
	assertRunnerBundleRegistrySnapshot(snapshot);
	const path = registryPath(stateRoot);
	const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
	const bytes = canonicalJson(snapshot);
	if (Buffer.byteLength(bytes) > MAX_REGISTRY_BYTES) {
		throw new Error("Runner Bundle registry file exceeds its byte limit.");
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
			throw new Error("Another Runner Bundle registry write is in progress.");
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
	bundle: QualifiedRunnerBundle,
	sourcePathValue: string,
): Promise<string> {
	assertRunnerBundleRegistrySnapshot(
		qualifyRunnerBundle({
			registry: createRunnerBundleRegistrySnapshot({generatedAt: bundle.qualifiedAt}),
			expectedGeneration: 0,
			bundle,
			generatedAt: bundle.qualifiedAt,
		}),
	);
	const sourcePath = normalizeAbsolutePath(sourcePathValue, "Runner Bundle source artifact");
	const destination = artifactPath(stateRoot, bundle.bundleDigest);
	const existing = await existingArtifact(destination);
	if (existing) {
		await verifyArtifactFile(existing, bundle.manifest.runnerArtifactDigest);
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
				throw new Error("Runner Bundle artifact exceeds its byte limit.");
			}
			const chunk = buffer.subarray(0, bytesRead);
			digest.update(chunk);
			await target.writeFile(chunk);
		}
		const actualDigest = `sha256:${digest.digest("hex")}` as Sha256Digest;
		if (actualDigest !== bundle.manifest.runnerArtifactDigest) {
			throw new Error("Runner Bundle artifact digest does not match its manifest.");
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
	bundle: QualifiedRunnerBundle,
): Promise<string> {
	const path = artifactPath(stateRoot, bundle.bundleDigest);
	await verifyArtifactFile(path, bundle.manifest.runnerArtifactDigest);
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
			throw new Error("Exact Runner Bundle artifact is unavailable.");
		}
		throw error;
	}
	try {
		const metadata = await handle.stat();
		assertArtifactMetadata(metadata.size, metadata.isFile());
		if (process.platform !== "win32" && (metadata.mode & 0o777) !== 0o500) {
			throw new Error("Stored Runner Bundle artifact permissions are not immutable.");
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
			throw new Error("Stored Runner Bundle artifact digest does not match its manifest.");
		}
	} finally {
		await handle.close();
	}
}

async function existingArtifact(path: string): Promise<string | undefined> {
	try {
		const metadata = await lstat(path);
		if (!metadata.isFile() || metadata.isSymbolicLink()) {
			throw new Error("Stored Runner Bundle artifact is not a regular file.");
		}
		return path;
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw error;
	}
}

function assertArtifactMetadata(size: number, isFile: boolean): void {
	if (!isFile || size <= 0 || size > MAX_ARTIFACT_BYTES) {
		throw new Error("Runner Bundle artifact is invalid or exceeds its byte limit.");
	}
}

function assertBackendNodeVersion(bundle: QualifiedRunnerBundle): void {
	if (bundle.manifest.nodeVersion !== process.versions.node) {
		throw new Error(
			`Runner Bundle requires Node ${bundle.manifest.nodeVersion}; Backend runs ${process.versions.node}.`,
		);
	}
}

function artifactPath(stateRoot: string, bundleDigest: Sha256Digest): string {
	return join(
		storeRoot(stateRoot),
		ARTIFACTS_DIRECTORY,
		bundleDigest.slice("sha256:".length),
		ARTIFACT_FILE,
	);
}

function registryPath(stateRoot: string): string {
	return join(storeRoot(stateRoot), REGISTRY_FILE);
}

function storeRoot(stateRoot: string): string {
	return join(stateRoot, STORE_DIRECTORY);
}

function normalizeStateRoot(options: RunnerBundleStoreOptions): string {
	if (!options || typeof options !== "object") {
		throw new Error("Runner Bundle store options are required.");
	}
	return normalizeAbsolutePath(options.stateRoot, "Runner Bundle state root");
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
			"Runner Bundle expected generation must be a non-negative safe integer.",
		);
	}
}

function freezeRegistry(
	registry: RunnerBundleRegistrySnapshot,
): RunnerBundleRegistrySnapshot {
	return Object.freeze({
		...registry,
		bundles: Object.freeze(
			registry.bundles.map((bundle) =>
				Object.freeze({
					...bundle,
					manifest: Object.freeze({...bundle.manifest}),
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
