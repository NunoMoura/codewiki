import { createHash } from "node:crypto";
import {
	lstat,
	mkdir,
	readFile,
	realpath,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import type {
	RuntimeWorktreePlan,
	WorktreeCommand,
	WorktreeCommandRunner,
} from "../git/worktrees.ts";
import { readTraceFile } from "../traces/reader.ts";
import { traceFilePath } from "../traces/schema.ts";
import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import { appendRuntimeTraceRecord } from "./trace-writer.ts";
import {
	assertImplementationWorkerAssignment,
	assertImplementationWorkerReport,
	implementationWorkerJobId,
	type ImplementationWorkerReport,
} from "./implementation-worker-adapter.ts";
import {
	IMPLEMENTATION_WORKER_DISPATCH_PACKET_SCHEMA_VERSION,
	type ImplementationWorkerDispatchPacket,
} from "./implementation-worker-artifacts.ts";
import type {
	ProjectCoordinator,
	ProjectCoordinatorJob,
} from "./coordinator/project-coordinator.ts";
import type { RuntimeReactor } from "./reactor.ts";

const MAX_GIT_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_CHANGED_PATHS = 1_024;
const MAX_REPO_PATH_BYTES = 1_024;
const GIT_OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const INTEGRATION_EVENT = "runtime.integration.proven";
const INTEGRATION_SCHEMA_VERSION = 1 as const;

export interface ImplementationWorkerIntegrationInput {
	repoRoot: string;
	coordinator: ProjectCoordinator;
	reactor: RuntimeReactor;
	packet: ImplementationWorkerDispatchPacket;
	report: ImplementationWorkerReport;
	acceptanceEvent: TraceEvent;
	sprintId: string;
	targetRefs: string[];
	createdAt: string;
	runner: WorktreeCommandRunner;
	beforeAppend?: () => void | Promise<void>;
}

export interface ImplementationWorkerIntegrationReceipt {
	jobId: string;
	traceId: string;
	workItemId: string;
	claimId: string;
	targetRef: string;
	commit: string;
	tree: string;
	eventId: string;
}

interface IntegrationIdentity {
	jobId: string;
	targetRef: string;
	targetRefs: string[];
	baseCommit: string;
	branch: string;
	workspacePath: string;
	artifactDirectory: string;
	patchPath: string;
	manifestPath: string;
}

interface IntegrationPatch {
	patch: string;
	patchDigest: string;
	changedPaths: string[];
}

interface IntegrationCommitProof {
	commit: string;
	tree: string;
	parentCommit: string;
	integratedPatchDigest: string;
	changedPaths: string[];
	committedAt: string;
}

interface IntegrationManifest {
	schemaVersion: typeof INTEGRATION_SCHEMA_VERSION;
	jobId: string;
	baseCommit: string;
	preApplyCommit: string;
	workerPatchDigest: string;
	changedPaths: string[];
}

export function scheduleImplementationWorkerIntegration(
	input: ImplementationWorkerIntegrationInput,
): Promise<ImplementationWorkerIntegrationReceipt> {
	return input.coordinator.schedule(implementationWorkerIntegrationJob(input));
}

export function implementationWorkerIntegrationJob(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
): ProjectCoordinatorJob<ImplementationWorkerIntegrationReceipt> {
	assertIntegrationInput(input);
	const identity = integrationIdentity(input);
	return {
		idempotencyKey: identity.jobId,
		lane: {
			kind: "integration",
			targetRef: identity.targetRef,
			baseRef: identity.baseCommit,
		},
		conflictRefs: [
			`trace:${input.packet.assignment.traceId}`,
			`work-item:${input.packet.assignment.workItemId}`,
			`claim:${input.packet.assignment.claimId}`,
			...input.packet.assignment.pathScopes.map((path) => `path:${path}`),
			...identity.targetRefs.map((ref) => `integration-target:${ref}`),
		],
		effect: "write",
		async recover() {
			const event = await persistedIntegrationEvent(
				input.repoRoot,
				input.packet.assignment.traceId,
				identity.jobId,
			);
			if (!event) return undefined;
			const result = integrationReceipt(identity, input, event);
			await removeIntegrationScratch(identity);
			return { status: "completed", result };
		},
		async run(signal) {
			signal.throwIfAborted();
			await assertCanonicalAcceptance(input, identity.jobId);
			const canonical = await persistedIntegrationEvent(
				input.repoRoot,
				input.packet.assignment.traceId,
				identity.jobId,
			);
			if (canonical) {
				const result = integrationReceipt(identity, input, canonical);
				await removeIntegrationScratch(identity);
				return result;
			}

			await assertSafeIntegrationPaths(input.repoRoot, input.packet, identity);
			await prepareIntegrationWorkspace(input, identity, signal);
			const existingCommit = await integrationCommitForJob(
				input,
				identity,
				signal,
			);
			const proof =
				existingCommit || (await integrateWorkerPatch(input, identity, signal));
			signal.throwIfAborted();
			const observation = await assertCanonicalAcceptance(input, identity.jobId);
			const event = integrationEvent(input, identity, proof, observation.records);
			await input.beforeAppend?.();
			await appendRuntimeTraceRecord(
				input.repoRoot,
				event,
				observation.expectedBytesByTrace[input.packet.assignment.traceId] ?? -1,
			);
			input.reactor.invalidate(input.packet.assignment.traceId);
			await removeIntegrationScratch(identity);
			return integrationReceipt(identity, input, event);
		},
	};
}

async function integrateWorkerPatch(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
	identity: IntegrationIdentity,
	signal: AbortSignal,
): Promise<IntegrationCommitProof> {
	const patch = await captureWorkerPatch(input, identity, signal);
	const status = await runGit(
		input,
		identity,
		["-C", identity.workspacePath, "status", "--porcelain=v1"],
		"worktree.verify",
		signal,
	);
	const preApplyCommit = await gitObjectId(
		input,
		identity,
		["-C", identity.workspacePath, "rev-parse", "HEAD"],
		signal,
	);
	const manifest = await readIntegrationManifest(identity.manifestPath);
	if (status.trim()) {
		assertResumableIndex(manifest, identity, patch, preApplyCommit);
		await verifyStagedPatch(input, identity, patch.changedPaths, signal);
	} else {
		await writeIntegrationManifest(identity, {
			schemaVersion: INTEGRATION_SCHEMA_VERSION,
			jobId: identity.jobId,
			baseCommit: identity.baseCommit,
			preApplyCommit,
			workerPatchDigest: patch.patchDigest,
			changedPaths: patch.changedPaths,
		});
		await runGit(
			input,
			identity,
			[
				"-C",
				identity.workspacePath,
				"apply",
				"--index",
				"--3way",
				identity.patchPath,
			],
			"worktree.prepare",
			signal,
		);
		await verifyStagedPatch(input, identity, patch.changedPaths, signal);
	}
	await runGit(
		input,
		identity,
		[
			"-C",
			identity.workspacePath,
			"-c",
			"user.name=CodeWiki Runtime",
			"-c",
			"user.email=codewiki-runtime@localhost",
			"commit",
			"--no-gpg-sign",
			"-m",
			`codewiki: integrate ${input.packet.assignment.workItemId}`,
			"-m",
			commitTrailers(input, identity, patch.patchDigest),
		],
		"worktree.prepare",
		signal,
	);
	const proof = await readIntegrationCommitProof(input, identity, signal);
	if (proof.parentCommit !== preApplyCommit) {
		throw new Error("Implementation integration commit parent changed unexpectedly.");
	}
	if (!samePaths(proof.changedPaths, patch.changedPaths)) {
		throw new Error("Implementation integration commit paths differ from worker patch.");
	}
	const clean = await runGit(
		input,
		identity,
		["-C", identity.workspacePath, "status", "--porcelain=v1"],
		"worktree.verify",
		signal,
	);
	if (clean.trim()) {
		throw new Error("Implementation integration workspace is not clean after commit.");
	}
	return proof;
}

async function captureWorkerPatch(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
	identity: IntegrationIdentity,
	signal: AbortSignal,
): Promise<IntegrationPatch> {
	const workerPath = input.packet.assignment.worktree?.path as string;
	await runGit(
		input,
		identity,
		["-C", workerPath, "merge-base", "--is-ancestor", identity.baseCommit, "HEAD"],
		"worktree.verify",
		signal,
	);
	await runGit(
		input,
		identity,
		["-C", workerPath, "add", "-A"],
		"worktree.prepare",
		signal,
	);
	const changed = await runGit(
		input,
		identity,
		[
			"-C",
			workerPath,
			"diff",
			"--cached",
			"--name-only",
			"-z",
			identity.baseCommit,
			"--",
		],
		"worktree.verify",
		signal,
	);
	const changedPaths = parseNulPaths(changed);
	if (changedPaths.length === 0) {
		throw new Error("Implementation integration worker patch is empty.");
	}
	assertPathsWithinScope(changedPaths, input.packet.assignment.pathScopes);
	const patch = await runGit(
		input,
		identity,
		[
			"-C",
			workerPath,
			"diff",
			"--cached",
			"--binary",
			"--full-index",
			"--no-ext-diff",
			identity.baseCommit,
			"--",
		],
		"worktree.verify",
		signal,
	);
	if (!patch.trim()) {
		throw new Error("Implementation integration worker patch is empty.");
	}
	await writePrivateFile(identity.patchPath, patch);
	return {
		patch,
		patchDigest: sha256Ref(patch),
		changedPaths,
	};
}

async function prepareIntegrationWorkspace(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
	identity: IntegrationIdentity,
	signal: AbortSignal,
): Promise<void> {
	if (!(await pathExists(identity.workspacePath))) {
		await mkdir(dirname(identity.workspacePath), { recursive: true, mode: 0o700 });
		await runGit(
			input,
			identity,
			[
				"-C",
				input.repoRoot,
				"worktree",
				"add",
				"-B",
				identity.branch,
				identity.workspacePath,
				identity.baseCommit,
			],
			"worktree.prepare",
			signal,
		);
	}
	const rootOutput = await runGit(
		input,
		identity,
		["-C", identity.workspacePath, "rev-parse", "--show-toplevel"],
		"worktree.verify",
		signal,
	);
	const root = rootOutput.trim();
	if (resolve(root) !== resolve(identity.workspacePath)) {
		throw new Error("Implementation integration workspace identity is invalid.");
	}
	const branchOutput = await runGit(
		input,
		identity,
		["-C", identity.workspacePath, "symbolic-ref", "--short", "HEAD"],
		"worktree.verify",
		signal,
	);
	if (branchOutput.trim() !== identity.branch) {
		throw new Error("Implementation integration workspace branch is invalid.");
	}
	await runGit(
		input,
		identity,
		[
			"-C",
			identity.workspacePath,
			"merge-base",
			"--is-ancestor",
			identity.baseCommit,
			"HEAD",
		],
		"worktree.verify",
		signal,
	);
}

async function integrationCommitForJob(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
	identity: IntegrationIdentity,
	signal: AbortSignal,
): Promise<IntegrationCommitProof | undefined> {
	const matches = await runGit(
		input,
		identity,
		[
			"-C",
			identity.workspacePath,
			"log",
			"--format=%H",
			"--fixed-strings",
			`--grep=CodeWiki-Integration-Job: ${identity.jobId}`,
			`${identity.baseCommit}..HEAD`,
		],
		"worktree.verify",
		signal,
	);
	for (const candidate of matches.split(/\r?\n/).map((value) => value.trim())) {
		if (!GIT_OBJECT_ID.test(candidate)) continue;
		const message = await runGit(
			input,
			identity,
			["-C", identity.workspacePath, "show", "-s", "--format=%B", candidate],
			"worktree.verify",
			signal,
		);
		if (
			message
				.split(/\r?\n/)
				.includes(`CodeWiki-Integration-Job: ${identity.jobId}`)
		) {
			return readIntegrationCommitProof(input, identity, signal, candidate);
		}
	}
	return undefined;
}

async function readIntegrationCommitProof(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
	identity: IntegrationIdentity,
	signal: AbortSignal,
	commitRef = "HEAD",
): Promise<IntegrationCommitProof> {
	const commit = await gitObjectId(
		input,
		identity,
		["-C", identity.workspacePath, "rev-parse", `${commitRef}^{commit}`],
		signal,
	);
	const tree = await gitObjectId(
		input,
		identity,
		["-C", identity.workspacePath, "rev-parse", `${commit}^{tree}`],
		signal,
	);
	const parentCommit = await gitObjectId(
		input,
		identity,
		["-C", identity.workspacePath, "rev-parse", `${commit}^`],
		signal,
	);
	const changed = await runGit(
		input,
		identity,
		[
			"-C",
			identity.workspacePath,
			"diff-tree",
			"--no-commit-id",
			"--name-only",
			"-r",
			"-z",
			commit,
		],
		"worktree.verify",
		signal,
	);
	await runGit(
		input,
		identity,
		[
			"-C",
			identity.workspacePath,
			"diff",
			"--check",
			parentCommit,
			commit,
			"--",
		],
		"worktree.verify",
		signal,
	);
	const integratedPatch = await runGit(
		input,
		identity,
		[
			"-C",
			identity.workspacePath,
			"diff",
			"--binary",
			"--full-index",
			"--no-ext-diff",
			parentCommit,
			commit,
			"--",
		],
		"worktree.verify",
		signal,
	);
	const committedAtOutput = await runGit(
		input,
		identity,
		["-C", identity.workspacePath, "show", "-s", "--format=%cI", commit],
		"worktree.verify",
		signal,
	);
	const committedAt = committedAtOutput.trim();
	return {
		commit,
		tree,
		parentCommit,
		integratedPatchDigest: sha256Ref(integratedPatch),
		changedPaths: parseNulPaths(changed),
		committedAt,
	};
}

async function verifyStagedPatch(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
	identity: IntegrationIdentity,
	expectedPaths: string[],
	signal: AbortSignal,
): Promise<void> {
	await runGit(
		input,
		identity,
		["-C", identity.workspacePath, "diff", "--cached", "--check"],
		"worktree.verify",
		signal,
	);
	const staged = await runGit(
		input,
		identity,
		[
			"-C",
			identity.workspacePath,
			"diff",
			"--cached",
			"--name-only",
			"-z",
			"HEAD",
			"--",
		],
		"worktree.verify",
		signal,
	);
	if (!samePaths(parseNulPaths(staged), expectedPaths)) {
		throw new Error("Implementation integration staged paths differ from worker patch.");
	}
}

async function assertCanonicalAcceptance(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
	jobId: string,
) {
	input.reactor.invalidate(input.packet.assignment.traceId);
	const observation = await input.reactor.observe({
		kind: "timer_due",
		occurredAt: input.createdAt,
	});
	const assignment = input.packet.assignment;
	const item = observation.workState.workItems.find(
		(candidate) => candidate.id === assignment.workItemId,
	);
	if (!item?.implemented) {
		throw new Error(
			"Implementation integration requires canonical Implementation acceptance.",
		);
	}
	const claim = observation.records.find(
		(record): record is TraceEvent =>
			record.type === "trace_event" &&
			record.id === input.packet.claimEventId,
	);
	if (!claimMatchesPacket(claim, input.packet)) {
		throw new Error("Implementation integration Claim authority is stale.");
	}
	const acceptance = observation.records.find(
		(record): record is TraceEvent =>
			record.type === "trace_event" && record.id === input.acceptanceEvent.id,
	);
	if (
		!acceptance ||
		acceptance.traceId !== assignment.traceId ||
		acceptance.loop !== "implementation" ||
		acceptance.event !== "evidence_accepted" ||
		!eventCoversWorkItem(acceptance, assignment.workItemId)
	) {
		throw new Error("Implementation integration acceptance evidence is stale.");
	}
	const existing = observation.records.find(
		(record): record is TraceEvent =>
			record.type === "trace_event" &&
			record.event === INTEGRATION_EVENT &&
			record.data?.runtimeJobId === jobId,
	);
	if (existing) return observation;
	return observation;
}

function claimMatchesPacket(
	claim: TraceEvent | undefined,
	packet: ImplementationWorkerDispatchPacket,
): boolean {
	const assignment = packet.assignment;
	return Boolean(
		claim &&
			claim.event === "runtime.work_unit.claimed" &&
			claim.traceId === assignment.traceId &&
			claim.data?.claimId === assignment.claimId &&
			claim.data?.workerId === assignment.workerId &&
			claim.data?.workUnitId === assignment.workItemId &&
			claim.data?.runtimeJobId === implementationWorkerJobId(assignment) &&
			claim.data?.runtimeAssignmentDigest === sha256Ref(stableJson(packet)) &&
			[...assignment.planningRefs, ...assignment.pathScopes].every((ref) =>
				claim.refs.includes(ref),
			),
	);
}

function integrationEvent(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
	identity: IntegrationIdentity,
	proof: IntegrationCommitProof,
	records: TraceRecord[],
): TraceEvent {
	const assignment = input.packet.assignment;
	const sequence = nextSequence(records, assignment.traceId);
	return {
		type: "trace_event",
		id: `${assignment.traceId}:runtime:integration:${sequence}:${identity.jobId.slice(-16)}`,
		parentId: input.acceptanceEvent.id,
		traceId: assignment.traceId,
		sequence,
		event: INTEGRATION_EVENT,
		refs: unique([
			...assignment.planningRefs,
			input.report.reportRef,
			`git-commit:${proof.commit}`,
			`git-tree:${proof.tree}`,
			proof.integratedPatchDigest,
		]),
		createdAt: input.createdAt,
		data: {
			schemaVersion: INTEGRATION_SCHEMA_VERSION,
			runtimeJobId: identity.jobId,
			traceId: assignment.traceId,
			sprintId: input.sprintId,
			workItemId: assignment.workItemId,
			claimId: assignment.claimId,
			assignmentId: assignment.assignmentId,
			workerId: assignment.workerId,
			workerReportRef: input.report.reportRef,
			workerReportDigest: sha256Ref(stableJson(input.report)),
			targetRef: identity.targetRef,
			targetRefs: identity.targetRefs,
			baseCommit: identity.baseCommit,
			parentCommit: proof.parentCommit,
			commit: proof.commit,
			tree: proof.tree,
			contentProof: `git-tree:${proof.tree}`,
			integratedPatchDigest: proof.integratedPatchDigest,
			changedPaths: proof.changedPaths,
			checks: [
				{
					id: "git.diff_check",
					status: "passed",
					ref: `git-commit:${proof.commit}`,
				},
			],
			committedAt: proof.committedAt,
		},
	};
}

function integrationIdentity(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
): IntegrationIdentity {
	const assignment = input.packet.assignment;
	const baseCommit = exactSourceBase(assignment.sourceBaseRef);
	const targetRefs = unique(input.targetRefs.map(requiredText));
	const targetRef = integrationTargetRef(targetRefs);
	const jobId = `implementation-integration:${createHash("sha256")
		.update(
			stableJson({
				repoRoot: resolve(input.repoRoot),
				traceId: assignment.traceId,
				sprintId: input.sprintId,
				workItemId: assignment.workItemId,
				claimId: assignment.claimId,
				assignmentId: assignment.assignmentId,
				acceptanceEventId: input.acceptanceEvent.id,
				workerReportRef: input.report.reportRef,
				workerReportDigest: sha256Ref(stableJson(input.report)),
				targetRefs,
				baseCommit,
			}),
		)
		.digest("hex")}`;
	const integrationKey = createHash("sha256")
		.update(stableJson({ targetRef, baseCommit }))
		.digest("hex");
	const jobKey = jobId.slice(-64);
	const artifactDirectory = join(
		input.repoRoot,
		".codewiki",
		"runtime",
		"integrations",
		jobKey,
	);
	return {
		jobId,
		targetRef,
		targetRefs,
		baseCommit,
		branch: `codewiki/integration/${integrationKey.slice(0, 24)}`,
		workspacePath: join(
			input.repoRoot,
			".codewiki",
			"runtime",
			"tmp",
			"integration",
			integrationKey,
			"worktree",
		),
		artifactDirectory,
		patchPath: join(artifactDirectory, "worker.patch"),
		manifestPath: join(artifactDirectory, "in-progress.json"),
	};
}

function assertIntegrationInput(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
): void {
	const assignment = input.packet.assignment;
	assertImplementationWorkerAssignment(assignment);
	assertImplementationWorkerReport(assignment, input.report);
	if (
		input.packet.schemaVersion !==
			IMPLEMENTATION_WORKER_DISPATCH_PACKET_SCHEMA_VERSION ||
		resolve(assignment.repoRoot) !== resolve(input.repoRoot) ||
		input.report.status !== "completed" ||
		input.report.assignmentId !== assignment.assignmentId ||
		input.report.workerId !== assignment.workerId ||
		input.report.workItemId !== assignment.workItemId ||
		!input.packet.claimEventId
	) {
		throw new Error("Implementation integration worker identity is invalid.");
	}
	if (
		assignment.isolation.kind !== "worktree" ||
		!assignment.worktree?.path ||
		input.packet.worktreePlan.worktree?.path !== assignment.worktree.path
	) {
		throw new Error("Implementation integration requires exact worktree isolation.");
	}
	if (!input.sprintId.trim() || !input.createdAt.trim()) {
		throw new Error("Implementation integration Sprint and observation time are required.");
	}
	if (!Array.isArray(input.targetRefs) || input.targetRefs.length > 64) {
		throw new Error("Implementation integration target refs are invalid.");
	}
}

async function assertSafeIntegrationPaths(
	repoRoot: string,
	packet: ImplementationWorkerDispatchPacket,
	identity: IntegrationIdentity,
): Promise<void> {
	const runtimeTmp = resolve(repoRoot, ".codewiki", "runtime", "tmp");
	const workerPath = resolve(packet.assignment.worktree?.path as string);
	if (
		!isInside(runtimeTmp, workerPath) ||
		!isInside(runtimeTmp, identity.workspacePath) ||
		workerPath === resolve(identity.workspacePath)
	) {
		throw new Error("Implementation integration worktree path escapes runtime tmp.");
	}
	await assertNoSymlinkPath(repoRoot, workerPath, true);
	await assertNoSymlinkPath(repoRoot, identity.workspacePath, false);
	await assertNoSymlinkPath(repoRoot, identity.artifactDirectory, false);
}

async function assertNoSymlinkPath(
	repoRoot: string,
	path: string,
	requireLeaf: boolean,
): Promise<void> {
	const root = resolve(repoRoot);
	const target = resolve(path);
	if (!isInside(root, target)) {
		throw new Error("Implementation integration path escapes repository root.");
	}
	const parts = relative(root, target).split(sep).filter(Boolean);
	let current = root;
	for (let index = 0; index < parts.length; index += 1) {
		current = join(current, parts[index] as string);
		try {
			const stat = await lstat(current);
			if (stat.isSymbolicLink()) {
				throw new Error("Implementation integration path traverses a symlink.");
			}
		} catch (error) {
			if (isNotFound(error) && (!requireLeaf || index < parts.length - 1)) return;
			throw error;
		}
	}
	if (requireLeaf) {
		const actual = await realpath(target);
		if (resolve(actual) !== target) {
			throw new Error("Implementation integration worktree identity is invalid.");
		}
	}
}

async function runGit(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
	identity: IntegrationIdentity,
	args: string[],
	step: "worktree.prepare" | "worktree.verify",
	signal: AbortSignal,
): Promise<string> {
	signal.throwIfAborted();
	const command: WorktreeCommand = { executable: "git", args };
	const result = await input.runner(command, {
		plan: integrationRunnerPlan(input, identity),
		step,
		command: `git ${args.join(" ")}`,
		commandIndex: 0,
		dryRun: false,
		signal,
	});
	signal.throwIfAborted();
	if (!result || !Number.isInteger(result.exitCode)) {
		throw new Error("Implementation integration Git runner returned no exit status.");
	}
	const exitCode = result.exitCode as number;
	const stdout = String(result.stdout || "");
	const stderr = String(result.stderr || "");
	if (
		Buffer.byteLength(stdout, "utf8") > MAX_GIT_OUTPUT_BYTES ||
		Buffer.byteLength(stderr, "utf8") > MAX_GIT_OUTPUT_BYTES
	) {
		throw new Error("Implementation integration Git output exceeds 8 MiB.");
	}
	if (exitCode !== 0) {
		throw new Error(
			`Implementation integration Git command failed (${exitCode}): ${stderr.trim().slice(0, 2_000)}`,
		);
	}
	return stdout;
}

function integrationRunnerPlan(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
	identity: IntegrationIdentity,
): RuntimeWorktreePlan {
	return {
		workUnitId: input.packet.assignment.workItemId,
		traceId: input.packet.assignment.traceId,
		workerId: input.packet.assignment.workerId,
		required: true,
		reason: "guarded implementation integration",
		pathScopes: [...input.packet.assignment.pathScopes],
		worktree: {
			path: identity.workspacePath,
			branch: identity.branch,
			baseRef: identity.baseCommit,
			baseSha: identity.baseCommit,
		},
		commands: {
			worktreePrepare: [],
			worktreeVerify: [],
			worktreeCleanup: [],
		},
	};
}

async function gitObjectId(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
	identity: IntegrationIdentity,
	args: string[],
	signal: AbortSignal,
): Promise<string> {
	const output = await runGit(input, identity, args, "worktree.verify", signal);
	const value = output.trim().toLowerCase();
	if (!GIT_OBJECT_ID.test(value)) {
		throw new Error("Implementation integration Git object identity is invalid.");
	}
	return value;
}

function assertPathsWithinScope(paths: string[], scopes: string[]): void {
	const escaped = paths.filter(
		(path) => !scopes.some((scope) => pathMatchesScope(path, scope)),
	);
	if (escaped.length > 0) {
		throw new Error(
			`Implementation integration changed paths escape Planning scope: ${escaped.join(", ")}.`,
		);
	}
}

function pathMatchesScope(path: string, scope: string): boolean {
	const normalizedPath = normalizeRepoPath(path);
	const normalizedScope = normalizeRepoPath(scope);
	if (!normalizedScope.includes("*") && !normalizedScope.includes("?")) {
		return (
			normalizedPath === normalizedScope ||
			normalizedPath.startsWith(`${normalizedScope.replace(/\/+$/u, "")}/`)
		);
	}
	if (normalizedScope.includes("[") || normalizedScope.includes("]")) {
		throw new Error("Implementation integration path scope glob is unsupported.");
	}
	return globPathMatches(
		{
			path: normalizedPath.split("/"),
			scope: normalizedScope.split("/"),
			memo: new Map(),
		},
		0,
		0,
	);
}

function globPathMatches(
	state: { path: string[]; scope: string[]; memo: Map<string, boolean> },
	pathIndex: number,
	scopeIndex: number,
): boolean {
	const key = `${pathIndex}:${scopeIndex}`;
	const cached = state.memo.get(key);
	if (cached !== undefined) return cached;
	let matched: boolean;
	if (scopeIndex === state.scope.length) {
		matched = pathIndex === state.path.length;
	} else if (state.scope[scopeIndex] === "**") {
		matched =
			globPathMatches(state, pathIndex, scopeIndex + 1) ||
			(pathIndex < state.path.length &&
				globPathMatches(state, pathIndex + 1, scopeIndex));
	} else {
		matched =
			pathIndex < state.path.length &&
			globSegmentMatches(
				state.path[pathIndex] as string,
				state.scope[scopeIndex] as string,
			) &&
			globPathMatches(state, pathIndex + 1, scopeIndex + 1);
	}
	state.memo.set(key, matched);
	return matched;
}

function globSegmentMatches(value: string, pattern: string): boolean {
	let valueIndex = 0;
	let patternIndex = 0;
	let starIndex = -1;
	let starValueIndex = -1;
	for (; valueIndex < value.length; ) {
		if (
			patternIndex < pattern.length &&
			(pattern[patternIndex] === "?" || pattern[patternIndex] === value[valueIndex])
		) {
			valueIndex += 1;
			patternIndex += 1;
		} else if (pattern[patternIndex] === "*") {
			starIndex = patternIndex;
			starValueIndex = valueIndex;
			patternIndex += 1;
		} else if (starIndex >= 0) {
			patternIndex = starIndex + 1;
			starValueIndex += 1;
			valueIndex = starValueIndex;
		} else {
			return false;
		}
	}
	while (pattern[patternIndex] === "*") patternIndex += 1;
	return patternIndex === pattern.length;
}

function normalizeRepoPath(value: string): string {
	const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//u, "");
	if (
		!normalized ||
		Buffer.byteLength(normalized, "utf8") > MAX_REPO_PATH_BYTES ||
		normalized.startsWith("/") ||
		/^[A-Za-z]:\//u.test(normalized) ||
		normalized.split("/").includes("..")
	) {
		throw new Error("Implementation integration repository path is invalid.");
	}
	return normalized.replace(/\/{2,}/gu, "/");
}

function assertResumableIndex(
	manifest: IntegrationManifest | undefined,
	identity: IntegrationIdentity,
	patch: IntegrationPatch,
	preApplyCommit: string,
): void {
	if (
		!manifest ||
		manifest.schemaVersion !== INTEGRATION_SCHEMA_VERSION ||
		manifest.jobId !== identity.jobId ||
		manifest.baseCommit !== identity.baseCommit ||
		manifest.preApplyCommit !== preApplyCommit ||
		manifest.workerPatchDigest !== patch.patchDigest ||
		!samePaths(manifest.changedPaths, patch.changedPaths)
	) {
		throw new Error("Implementation integration workspace contains foreign changes.");
	}
}

async function writeIntegrationManifest(
	identity: IntegrationIdentity,
	manifest: IntegrationManifest,
): Promise<void> {
	await writePrivateFile(identity.manifestPath, `${JSON.stringify(manifest)}\n`);
}

async function readIntegrationManifest(
	path: string,
): Promise<IntegrationManifest | undefined> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as IntegrationManifest;
	} catch (error) {
		if (isNotFound(error) || error instanceof SyntaxError) return undefined;
		throw error;
	}
}

async function writePrivateFile(path: string, value: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, value, { encoding: "utf8", mode: 0o600 });
	await rename(temporary, path);
}

async function removeIntegrationScratch(
	identity: IntegrationIdentity,
): Promise<void> {
	await rm(identity.artifactDirectory, { recursive: true, force: true });
}

async function persistedIntegrationEvent(
	repoRoot: string,
	traceId: string,
	jobId: string,
): Promise<TraceEvent | undefined> {
	try {
		const records = await readTraceFile(join(repoRoot, traceFilePath(traceId)));
		return records.find(
			(record): record is TraceEvent =>
				record.type === "trace_event" &&
				record.event === INTEGRATION_EVENT &&
				record.data?.runtimeJobId === jobId,
		);
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw error;
	}
}

function integrationReceipt(
	identity: IntegrationIdentity,
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
	event: TraceEvent,
): ImplementationWorkerIntegrationReceipt {
	const commit = String(event.data?.commit || "").toLowerCase();
	const tree = String(event.data?.tree || "").toLowerCase();
	if (
		event.data?.claimId !== input.packet.assignment.claimId ||
		event.data?.assignmentId !== input.packet.assignment.assignmentId ||
		event.data?.workerReportRef !== input.report.reportRef ||
		!GIT_OBJECT_ID.test(commit) ||
		!GIT_OBJECT_ID.test(tree)
	) {
		throw new Error("Persisted implementation integration proof is invalid.");
	}
	return {
		jobId: identity.jobId,
		traceId: input.packet.assignment.traceId,
		workItemId: input.packet.assignment.workItemId,
		claimId: input.packet.assignment.claimId,
		targetRef: identity.targetRef,
		commit,
		tree,
		eventId: event.id,
	};
}

function eventCoversWorkItem(event: TraceEvent, workItemId: string): boolean {
	const output = objectValue(event.data?.output);
	return [
		...stringList(output?.coveredWorkItemRefs),
		...objectList(output?.changes).flatMap((change) =>
			stringList(change.planningRefs),
		),
	].some(
		(ref) =>
			ref === workItemId ||
			ref.endsWith(`#work:${workItemId}`) ||
			ref.endsWith(`#work-item:${workItemId}`),
	);
}

function commitTrailers(
	input: Omit<ImplementationWorkerIntegrationInput, "coordinator">,
	identity: IntegrationIdentity,
	workerPatchDigest: string,
): string {
	return [
		`CodeWiki-Integration-Job: ${identity.jobId}`,
		`CodeWiki-Work-Item: ${input.packet.assignment.workItemId}`,
		`CodeWiki-Claim: ${input.packet.assignment.claimId}`,
		`CodeWiki-Worker-Patch: ${workerPatchDigest}`,
	].join("\n");
}

function integrationTargetRef(targetRefs: string[]): string {
	if (targetRefs.length === 0) return "project:default";
	if (targetRefs.length === 1) return targetRefs[0] as string;
	return `integration-set:${createHash("sha256").update(stableJson(targetRefs)).digest("hex")}`;
}

function exactSourceBase(value: string): string {
	const base = value.startsWith("git:") ? value.slice(4) : "";
	if (!GIT_OBJECT_ID.test(base)) {
		throw new Error("Implementation integration source base must be an exact Git commit.");
	}
	return base;
}

function parseNulPaths(value: string): string[] {
	const paths = unique(
		value.split("\0").flatMap((path) => {
			const trimmed = path.trim();
			return trimmed ? [normalizeRepoPath(trimmed)] : [];
		}),
	);
	if (paths.length > MAX_CHANGED_PATHS) {
		throw new Error(
			`Implementation integration exceeds ${MAX_CHANGED_PATHS} changed paths.`,
		);
	}
	return paths;
}

function nextSequence(records: TraceRecord[], traceId: string): number {
	return (
		Math.max(
			0,
			...records.flatMap((record) =>
				record.type === "trace_event" && record.traceId === traceId
					? [record.sequence]
					: [],
			),
		) + 1
	);
}

function samePaths(left: string[], right: string[]): boolean {
	return stableJson(unique(left)) === stableJson(unique(right));
}

function sha256Ref(value: string): string {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.filter(([, entry]) => entry !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function requiredText(value: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error("Implementation integration target ref is invalid.");
	}
	return value.trim();
}

function unique(values: string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
}

function objectList(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		const object = objectValue(entry);
		return object ? [object] : [];
	});
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

function isInside(root: string, path: string): boolean {
	const normalizedRoot = `${resolve(root)}${sep}`;
	return resolve(path).startsWith(normalizedRoot);
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if (isNotFound(error)) return false;
		throw error;
	}
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}
