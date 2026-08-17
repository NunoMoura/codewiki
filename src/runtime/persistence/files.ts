import {
	lstat,
	mkdir,
	open,
	readdir,
	readFile,
	rename,
	rm,
} from "node:fs/promises";
import {dirname, isAbsolute, resolve} from "node:path";
import {randomUUID} from "node:crypto";

export function normalizeRuntimeStateRoot(value: unknown): string {
	if (typeof value !== "string" || value.length === 0 || !isAbsolute(value)) {
		throw new Error("Runtime state root must be an absolute path.");
	}
	return resolve(value);
}

export async function readRegularFileIfPresent(
	path: string,
): Promise<Buffer | null> {
	try {
		const metadata = await lstat(path);
		if (!metadata.isFile() || metadata.isSymbolicLink()) {
			throw new Error(`Runtime state path is not a regular file: ${path}`);
		}
		return await readFile(path);
	} catch (error) {
		if (isNotFound(error)) return null;
		throw error;
	}
}

export async function writeFileAtomic(
	path: string,
	content: string | Uint8Array,
): Promise<void> {
	const parent = dirname(path);
	await mkdir(parent, {recursive: true, mode: 0o700});
	const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
	let handle;
	try {
		handle = await open(temporary, "wx", 0o600);
		await handle.writeFile(content);
		await handle.sync();
		await handle.close();
		handle = undefined;
		await rename(temporary, path);
		await syncDirectory(parent);
	} finally {
		if (handle) await ignoreFailure(handle.close());
		await ignoreFailure(rm(temporary, {force: true}));
	}
}

export async function withFileLock<T>(
	lockPath: string,
	operation: () => Promise<T>,
): Promise<T> {
	await mkdir(dirname(lockPath), {recursive: true, mode: 0o700});
	try {
		await mkdir(lockPath, {mode: 0o700});
	} catch (error) {
		if (isAlreadyExists(error)) {
			throw new Error(`Runtime state is already locked: ${lockPath}`);
		}
		throw error;
	}
	try {
		return await operation();
	} finally {
		await rm(lockPath, {recursive: true, force: true});
		await syncDirectory(dirname(lockPath));
	}
}

export function parseStoredJson(bytes: Uint8Array, field: string): unknown {
	try {
		return JSON.parse(Buffer.from(bytes).toString("utf8"));
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`${field} is invalid JSON: ${reason}`);
	}
}

export async function regularFileNames(path: string): Promise<readonly string[]> {
	try {
		const entries = await readdir(path, {withFileTypes: true});
		return entries
			.flatMap((entry) =>
				entry.isFile() && !entry.isSymbolicLink() ? [entry.name] : [],
			)
			.sort(compareText);
	} catch (error) {
		if (isNotFound(error)) return [];
		throw error;
	}
}

async function ignoreFailure(operation: Promise<unknown>): Promise<void> {
	try {
		await operation;
	} catch {
		// Best-effort cleanup must not hide the primary state write failure.
	}
}

async function syncDirectory(path: string): Promise<void> {
	let handle;
	try {
		handle = await open(path, "r");
		await handle.sync();
	} catch (error) {
		if (!isUnsupportedDirectorySync(error)) throw error;
	} finally {
		await handle?.close();
	}
}

function isUnsupportedDirectorySync(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const code = "code" in error ? error.code : undefined;
	return code === "EINVAL" || code === "ENOTSUP" || code === "EBADF";
}

function isNotFound(error: unknown): boolean {
	if (error === null || typeof error !== "object" || !("code" in error)) {
		return false;
	}
	return error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
	return errorCode(error) === "EEXIST";
}

function errorCode(error: unknown): unknown {
	return error !== null && typeof error === "object" && "code" in error
		? error.code
		: undefined;
}

function compareText(left: string, right: string): number {
	return Number(left > right) - Number(left < right);
}
