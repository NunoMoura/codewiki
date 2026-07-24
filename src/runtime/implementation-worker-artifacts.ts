import { createHash } from "node:crypto";
import {
	lstat,
	mkdir,
	readFile,
	readdir,
	rename,
	rm,
	unlink,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import {
	executeRuntimeWorktreeCommands,
	type RuntimeWorktreePlan,
	type WorktreeCommandRunner,
} from "../git/worktrees.ts";
import {
	assertImplementationWorkerAssignment,
	type ImplementationWorkerAssignment,
	type ImplementationWorkerReport,
} from "./implementation-worker-adapter.ts";

export const IMPLEMENTATION_WORKER_DISPATCH_PACKET_SCHEMA_VERSION = 1 as const;

const MAX_PACKET_BYTES = 256 * 1024;
const MAX_REPORT_BYTES = 1024 * 1024;
const REPORT_FILE = /^[a-f0-9]{32}\.json$/;
const REPORT_OUTPUT_FILE = /^[a-f0-9]{32}\.json\.worker-output$/;

export interface ImplementationWorkerDispatchPacket {
	schemaVersion: typeof IMPLEMENTATION_WORKER_DISPATCH_PACKET_SCHEMA_VERSION;
	claimEventId: string;
	assignment: ImplementationWorkerAssignment;
	worktreePlan: RuntimeWorktreePlan;
}

interface ImplementationWorkerIntegrationArtifactProof {
	assignmentId: string;
	workerReportRef: string;
}

interface ImplementationWorkerArtifactCleanupInput {
	repoRoot: string;
	activeClaimIds: ReadonlySet<string>;
	canonicalClaimEventIds: ReadonlySet<string>;
	integratedClaims?: ReadonlyMap<
		string,
		ImplementationWorkerIntegrationArtifactProof
	>;
	worktreeRunner?: WorktreeCommandRunner;
}

interface ImplementationWorkerArtifactCleanupResult {
	removedPaths: string[];
	preservedPaths: string[];
	cleanedWorktreePaths: string[];
	blockers: string[];
}

interface PacketFile {
	path: string;
	packet?: ImplementationWorkerDispatchPacket;
	claimId?: string;
	temporary: boolean;
}

export async function writeImplementationWorkerDispatchPacket(
	repoRoot: string,
	packet: ImplementationWorkerDispatchPacket,
): Promise<void> {
	assertPacket(repoRoot, packet);
	const directory = implementationWorkerPacketDirectory(repoRoot);
	await assertNoSymlinkPath(repoRoot, directory);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const path = implementationWorkerPacketPath(
		repoRoot,
		packet.assignment.claimId,
	);
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(packet)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	await rename(temporary, path);
}

export async function readImplementationWorkerDispatchPackets(
	repoRoot: string,
): Promise<ImplementationWorkerDispatchPacket[]> {
	const files = await scanPacketFiles(repoRoot);
	return files.flatMap((file) => (file.packet ? [file.packet] : []));
}

export async function cleanupImplementationWorkerArtifacts(
	input: ImplementationWorkerArtifactCleanupInput,
): Promise<ImplementationWorkerArtifactCleanupResult> {
	const removedPaths = new Set<string>();
	const preservedPaths = new Set<string>();
	const cleanedWorktreePaths = new Set<string>();
	const blockers = new Set<string>();
	const retainedReportPaths = new Set<string>();
	const packetFiles = await scanPacketFiles(input.repoRoot);

	for (const file of packetFiles) {
		if (file.temporary) {
			await removeFile(file.path, removedPaths);
			continue;
		}
		const packet = file.packet;
		if (!packet) {
			if (!file.claimId || input.activeClaimIds.has(file.claimId)) {
				preservedPaths.add(file.path);
			} else {
				await removeFile(file.path, removedPaths);
			}
			continue;
		}
		const claimId = packet.assignment.claimId;
		const reportPath = safeReportPath(input.repoRoot, packet.assignment.reportPath);
		if (input.activeClaimIds.has(claimId)) {
			preservedPaths.add(file.path);
			if (reportPath) retainedReportPaths.add(reportPath);
			continue;
		}
		const report = reportPath ? await readReport(reportPath) : undefined;
		const canonicalClaimExists = input.canonicalClaimEventIds.has(
			packet.claimEventId,
		);
		const integration = input.integratedClaims?.get(claimId);
		const integrationProven =
			integration?.assignmentId === packet.assignment.assignmentId &&
			(!report || integration.workerReportRef === report.reportRef);
		if (
			canonicalClaimExists &&
			(!report || report.status === "completed") &&
			!integrationProven
		) {
			preservedPaths.add(file.path);
			if (reportPath) retainedReportPaths.add(reportPath);
			continue;
		}
		const cleaned = await cleanupPacketWorktree(packet, input, blockers);
		if (!cleaned) {
			preservedPaths.add(file.path);
			if (reportPath) retainedReportPaths.add(reportPath);
			continue;
		}
		if (packet.worktreePlan.worktree?.path) {
			cleanedWorktreePaths.add(packet.worktreePlan.worktree.path);
		}
		if (reportPath) {
			await removeFile(reportPath, removedPaths);
			await removeFile(`${reportPath}.worker-output`, removedPaths);
		}
		await removeFile(file.path, removedPaths);
	}

	await cleanupUnreferencedReports({
		repoRoot: input.repoRoot,
		activeClaimIds: input.activeClaimIds,
		retainedReportPaths,
		removedPaths,
		preservedPaths,
	});

	return {
		removedPaths: [...removedPaths].sort(compareText),
		preservedPaths: [...preservedPaths].sort(compareText),
		cleanedWorktreePaths: [...cleanedWorktreePaths].sort(compareText),
		blockers: [...blockers].sort(compareText),
	};
}

function implementationWorkerPacketDirectory(repoRoot: string): string {
	return join(repoRoot, ".codewiki", "runtime", "worker-assignments");
}

function implementationWorkerPacketPath(
	repoRoot: string,
	claimId: string,
): string {
	if (!claimId.trim()) {
		throw new Error("Implementation worker claim id is required for packet storage.");
	}
	const key = createHash("sha256")
		.update(JSON.stringify(claimId))
		.digest("hex");
	return join(implementationWorkerPacketDirectory(repoRoot), `${key}.json`);
}

async function scanPacketFiles(repoRoot: string): Promise<PacketFile[]> {
	const directory = implementationWorkerPacketDirectory(repoRoot);
	await assertNoSymlinkPath(repoRoot, directory);
	let names: string[];
	try {
		names = await readdir(directory);
	} catch (error) {
		if (isNotFound(error)) return [];
		throw error;
	}
	const files: PacketFile[] = [];
	for (const name of names.sort(compareText)) {
		const path = join(directory, name);
		if (name.endsWith(".tmp")) {
			files.push({ path, temporary: true });
			continue;
		}
		if (!name.endsWith(".json")) continue;
		let source: string;
		try {
			const metadata = await lstat(path);
			if (
				!metadata.isFile() ||
				metadata.isSymbolicLink() ||
				metadata.size > MAX_PACKET_BYTES
			) {
				files.push({ path, temporary: false });
				continue;
			}
			source = await readFile(path, "utf8");
		} catch (error) {
			if (isNotFound(error)) continue;
			throw error;
		}
		let value: unknown;
		try {
			value = JSON.parse(source);
		} catch {
			files.push({ path, temporary: false });
			continue;
		}
		const claimId = looseClaimId(value);
		try {
			const packet = value as ImplementationWorkerDispatchPacket;
			assertPacket(repoRoot, packet);
			if (
				path !==
				implementationWorkerPacketPath(repoRoot, packet.assignment.claimId)
			) {
				throw new Error("Implementation worker packet filename is invalid.");
			}
			files.push({ path, packet, claimId, temporary: false });
		} catch {
			files.push({ path, claimId, temporary: false });
		}
	}
	return files;
}

function assertPacket(
	repoRoot: string,
	packet: ImplementationWorkerDispatchPacket,
): void {
	if (
		packet.schemaVersion !==
		IMPLEMENTATION_WORKER_DISPATCH_PACKET_SCHEMA_VERSION
	) {
		throw new Error("Implementation worker packet schema is invalid.");
	}
	assertImplementationWorkerAssignment(packet.assignment);
	if (
		packet.assignment.repoRoot !== repoRoot ||
		!packet.claimEventId?.trim() ||
		packet.worktreePlan.workUnitId !== packet.assignment.workItemId
	) {
		throw new Error("Implementation worker packet identity is invalid.");
	}
	implementationWorkerPacketPath(repoRoot, packet.assignment.claimId);
}

async function cleanupPacketWorktree(
	packet: ImplementationWorkerDispatchPacket,
	input: ImplementationWorkerArtifactCleanupInput,
	blockers: Set<string>,
): Promise<boolean> {
	const worktreePath = packet.worktreePlan.worktree?.path;
	if (!worktreePath) return true;
	if (!isWithinRuntimeTmp(input.repoRoot, worktreePath)) {
		blockers.add(
			`implementation_worker_cleanup_worktree_outside_runtime:${packet.assignment.claimId}`,
		);
		return false;
	}
	if (!input.worktreeRunner) {
		blockers.add(
			`implementation_worker_cleanup_runner_unavailable:${packet.assignment.claimId}`,
		);
		return false;
	}
	try {
		await assertNoSymlinkPath(input.repoRoot, worktreePath);
		await rm(worktreePath, { recursive: true, force: true });
		await executeRuntimeWorktreeCommands(prunePlan(packet.worktreePlan), {
			dryRun: false,
			runner: input.worktreeRunner,
			steps: ["worktree.cleanup"],
		});
		return true;
	} catch {
		blockers.add(
			`implementation_worker_cleanup_failed:${packet.assignment.claimId}`,
		);
		return false;
	}
}

function prunePlan(plan: RuntimeWorktreePlan): RuntimeWorktreePlan {
	return {
		...plan,
		commands: {
			worktreePrepare: [],
			worktreeVerify: [],
			worktreeCleanup: [
				{ executable: "git", args: ["worktree", "prune"] },
			],
		},
	};
}

async function cleanupUnreferencedReports(input: {
	repoRoot: string;
	activeClaimIds: ReadonlySet<string>;
	retainedReportPaths: Set<string>;
	removedPaths: Set<string>;
	preservedPaths: Set<string>;
}): Promise<void> {
	const directory = workerReportDirectory(input.repoRoot);
	await assertNoSymlinkPath(input.repoRoot, directory);
	let names: string[];
	try {
		names = await readdir(directory);
	} catch (error) {
		if (isNotFound(error)) return;
		throw error;
	}
	const existing = new Set(names);
	for (const name of names.sort(compareText)) {
		const path = join(directory, name);
		if (REPORT_FILE.test(name)) {
			if (input.retainedReportPaths.has(path)) {
				input.preservedPaths.add(path);
				continue;
			}
			const report = await readReport(path);
			if (!report) {
				input.preservedPaths.add(path);
				continue;
			}
			if (
				input.activeClaimIds.has(report.assignmentId) ||
				report.status === "completed"
			) {
				input.preservedPaths.add(path);
				continue;
			}
			await removeFile(path, input.removedPaths);
			await removeFile(`${path}.worker-output`, input.removedPaths);
			continue;
		}
		if (REPORT_OUTPUT_FILE.test(name)) {
			const reportName = name.slice(0, -".worker-output".length);
			const reportPath = join(directory, reportName);
			if (
				input.retainedReportPaths.has(reportPath) ||
				existing.has(reportName)
			) {
				continue;
			}
			await removeFile(path, input.removedPaths);
			continue;
		}
		const temporaryReport = name.match(/^([a-f0-9]{32}\.json)\..+\.tmp$/);
		if (temporaryReport) {
			const reportPath = join(directory, temporaryReport[1]);
			if (input.retainedReportPaths.has(reportPath)) {
				input.preservedPaths.add(path);
			} else {
				await removeFile(path, input.removedPaths);
			}
		}
	}
}

async function readReport(
	path: string,
): Promise<ImplementationWorkerReport | undefined> {
	try {
		const metadata = await lstat(path);
		if (
			!metadata.isFile() ||
			metadata.isSymbolicLink() ||
			metadata.size > MAX_REPORT_BYTES
		) {
			return undefined;
		}
		const value = JSON.parse(await readFile(path, "utf8")) as Partial<ImplementationWorkerReport>;
		if (
			!text(value.assignmentId) ||
			!(["completed", "blocked", "failed", "cancelled"] as unknown[]).includes(
				value.status,
			)
		) {
			return undefined;
		}
		return value as ImplementationWorkerReport;
	} catch (error) {
		if (isNotFound(error) || error instanceof SyntaxError) return undefined;
		throw error;
	}
}

function safeReportPath(repoRoot: string, path: string): string | undefined {
	const resolved = resolve(path);
	const directory = workerReportDirectory(repoRoot);
	return dirname(resolved) === directory && REPORT_FILE.test(basename(resolved))
		? resolved
		: undefined;
}

function workerReportDirectory(repoRoot: string): string {
	return resolve(repoRoot, ".codewiki", "runtime", "workers");
}

function isWithinRuntimeTmp(repoRoot: string, path: string): boolean {
	const root = `${resolve(repoRoot, ".codewiki", "runtime", "tmp")}${sep}`;
	return resolve(path).startsWith(root);
}

async function assertNoSymlinkPath(
	repoRoot: string,
	path: string,
): Promise<void> {
	const root = resolve(repoRoot);
	const target = resolve(path);
	const pathFromRoot = relative(root, target);
	if (
		pathFromRoot === "" ||
		pathFromRoot === ".." ||
		pathFromRoot.startsWith(`..${sep}`)
	) {
		throw new Error("Implementation worker artifact path escapes repository root.");
	}
	let current = root;
	for (const segment of pathFromRoot.split(/[\\/]+/).filter(Boolean)) {
		current = join(current, segment);
		let metadata;
		try {
			metadata = await lstat(current);
		} catch (error) {
			if (isNotFound(error)) return;
			throw error;
		}
		if (metadata.isSymbolicLink()) {
			throw new Error(
				`Implementation worker artifact path traverses symlink ${current}.`,
			);
		}
		if (!metadata.isDirectory() && current !== target) {
			throw new Error(
				`Implementation worker artifact path parent is not a directory: ${current}.`,
			);
		}
	}
}

async function removeFile(path: string, removedPaths: Set<string>): Promise<void> {
	try {
		const metadata = await lstat(path);
		if (metadata.isDirectory() && !metadata.isSymbolicLink()) return;
		await unlink(path);
		removedPaths.add(path);
	} catch (error) {
		if (!isNotFound(error)) throw error;
	}
}

function looseClaimId(value: unknown): string | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const assignment = (value as { assignment?: unknown }).assignment;
	if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) {
		return undefined;
	}
	return text((assignment as { claimId?: unknown }).claimId) || undefined;
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}
