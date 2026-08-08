import { resolve } from "node:path";
import { pathMatchesPattern } from "../knowledge/source-map.ts";
import { traceTmpPath } from "../runtime/tmp.ts";
import type { WikiConfigWorktreeIsolation } from "../project/config.ts";
import type { RuntimeWorkUnitClaimCandidate } from "../runtime/claims/work-unit-selection.ts";

export interface WorktreeRef {
	path: string;
	branch?: string;
	baseRef?: string;
	baseSha?: string;
}

export interface WorktreeProcessCommand {
	executable: string;
	args: string[];
}

export type WorktreeCommand = string | WorktreeProcessCommand;

export interface WorktreeCommandPlan {
	worktreePrepare: WorktreeCommand[];
	worktreeVerify: WorktreeCommand[];
	worktreeCleanup: WorktreeCommand[];
}

export interface RuntimeWorktreePlan {
	workUnitId: string;
	traceId: string;
	workerId: string;
	required: boolean;
	reason: string;
	pathScopes: string[];
	worktree?: WorktreeRef;
	commands: WorktreeCommandPlan;
}

interface RuntimeWorktreePlanOptions {
	mode: WikiConfigWorktreeIsolation;
	repoRoot?: string;
	projectName?: string;
	worktreeRoot?: string;
	baseRef?: string;
	baseSha?: string;
	dirtyPaths?: string[];
	workerIdPrefix?: string;
	workerIds?: Record<string, string>;
	setupCommands?: string[];
}

export type WorktreeCommandStep =
	| "worktree.prepare"
	| "worktree.verify"
	| "worktree.cleanup";

export interface WorktreeCommandExecutionContext {
	plan: RuntimeWorktreePlan;
	step: WorktreeCommandStep;
	command: string;
	commandIndex: number;
	dryRun: boolean;
	signal?: AbortSignal;
}

export interface WorktreeCommandRunnerResult {
	stdout?: string;
	stderr?: string;
	exitCode?: number;
}

export type WorktreeCommandRunner = (
	command: WorktreeCommand,
	context: WorktreeCommandExecutionContext,
) =>
	| Promise<WorktreeCommandRunnerResult | void>
	| WorktreeCommandRunnerResult
	| void;

export interface ExecuteRuntimeWorktreeCommandsOptions {
	steps?: WorktreeCommandStep[];
	dryRun?: boolean;
	runner?: WorktreeCommandRunner;
}

export interface WorktreeCommandExecutionRecord
	extends WorktreeCommandExecutionContext {
	workUnitId: string;
	traceId: string;
	workerId: string;
	skipped: boolean;
	stdout?: string;
	stderr?: string;
	exitCode?: number;
}

export interface WorktreeCommandExecutionResult {
	dryRun: boolean;
	steps: WorktreeCommandStep[];
	records: WorktreeCommandExecutionRecord[];
}

export class WorktreeCommandExecutionError extends Error {
	readonly record: WorktreeCommandExecutionRecord;

	constructor(record: WorktreeCommandExecutionRecord) {
		super(
			`Worktree command failed for ${record.workUnitId} during ${record.step}: ${record.command}`,
		);
		this.name = "WorktreeCommandExecutionError";
		this.record = record;
	}
}

export function planRuntimeWorkUnitClaimWorktrees(
	items: RuntimeWorkUnitClaimCandidate[],
	options: RuntimeWorktreePlanOptions,
): RuntimeWorktreePlan[] {
	return items.map((item, index) =>
		planRuntimeWorkUnitClaimWorktree(item, index, items, options),
	);
}

export async function executeRuntimeWorktreeCommands(
	plans: RuntimeWorktreePlan | RuntimeWorktreePlan[],
	options: ExecuteRuntimeWorktreeCommandsOptions = {},
): Promise<WorktreeCommandExecutionResult> {
	const dryRun = options.dryRun !== false;
	const steps = options.steps || ["worktree.prepare", "worktree.verify"];
	if (!dryRun && !options.runner) {
		throw new Error(
			"executeRuntimeWorktreeCommands requires a runner when dryRun is false.",
		);
	}
	const records: WorktreeCommandExecutionRecord[] = [];
	for (const plan of Array.isArray(plans) ? plans : [plans]) {
		for (const step of steps) {
			records.push(
				...(await executeWorktreeStep(plan, step, {
					dryRun,
					runner: options.runner,
				})),
			);
		}
	}
	return { dryRun, steps: [...steps], records };
}

function planRuntimeWorkUnitClaimWorktree(
	item: RuntimeWorkUnitClaimCandidate,
	index: number,
	items: RuntimeWorkUnitClaimCandidate[],
	options: RuntimeWorktreePlanOptions,
): RuntimeWorktreePlan {
	const workerId = workerIdForItem(item, index, options);
	const reason = worktreeReason(item, items, options);
	const required = reason !== "not_required";
	const worktree = required
		? worktreeRef({ item, workerId, options })
		: undefined;
	return {
		workUnitId: item.workUnitId,
		traceId: item.traceId,
		workerId,
		required,
		reason,
		pathScopes: [...item.pathScopes],
		...(worktree ? { worktree } : {}),
		commands: commandPlan(worktree, options.setupCommands || []),
	};
}

async function executeWorktreeStep(
	plan: RuntimeWorktreePlan,
	step: WorktreeCommandStep,
	options: Pick<ExecuteRuntimeWorktreeCommandsOptions, "runner"> & {
		dryRun: boolean;
	},
): Promise<WorktreeCommandExecutionRecord[]> {
	const records: WorktreeCommandExecutionRecord[] = [];
	for (const [commandIndex, command] of commandsForStep(plan, step).entries()) {
		records.push(
			await executeWorktreeCommand(plan, step, command, commandIndex, options),
		);
	}
	return records;
}

async function executeWorktreeCommand(
	plan: RuntimeWorktreePlan,
	step: WorktreeCommandStep,
	command: WorktreeCommand,
	commandIndex: number,
	options: Pick<ExecuteRuntimeWorktreeCommandsOptions, "runner"> & {
		dryRun: boolean;
	},
): Promise<WorktreeCommandExecutionRecord> {
	const base = executionRecordBase(plan, step, command, commandIndex, {
		dryRun: options.dryRun,
	});
	if (options.dryRun) return { ...base, skipped: true };
	const result = normalizeRunnerResult(await options.runner?.(command, base));
	const record = { ...base, ...result, skipped: false };
	if ((record.exitCode || 0) !== 0)
		throw new WorktreeCommandExecutionError(record);
	return record;
}

function executionRecordBase(
	plan: RuntimeWorktreePlan,
	step: WorktreeCommandStep,
	command: WorktreeCommand,
	commandIndex: number,
	options: { dryRun: boolean },
): WorktreeCommandExecutionContext &
	Pick<WorktreeCommandExecutionRecord, "workUnitId" | "traceId" | "workerId"> {
	return {
		plan,
		step,
		command: worktreeCommandDisplay(command),
		commandIndex,
		dryRun: options.dryRun,
		workUnitId: plan.workUnitId,
		traceId: plan.traceId,
		workerId: plan.workerId,
	};
}

function commandsForStep(
	plan: RuntimeWorktreePlan,
	step: WorktreeCommandStep,
): WorktreeCommand[] {
	return plan.commands[commandKeyForStep(step)];
}

function commandKeyForStep(
	step: WorktreeCommandStep,
): keyof WorktreeCommandPlan {
	switch (step) {
		case "worktree.prepare":
			return "worktreePrepare";
		case "worktree.verify":
			return "worktreeVerify";
		case "worktree.cleanup":
			return "worktreeCleanup";
	}
}

function normalizeRunnerResult(
	result: WorktreeCommandRunnerResult | void,
): WorktreeCommandRunnerResult {
	return {
		...(result?.stdout ? { stdout: result.stdout } : {}),
		...(result?.stderr ? { stderr: result.stderr } : {}),
		...(Number.isInteger(result?.exitCode)
			? { exitCode: result?.exitCode }
			: {}),
	};
}

function worktreeReason(
	item: RuntimeWorkUnitClaimCandidate,
	items: RuntimeWorkUnitClaimCandidate[],
	options: RuntimeWorktreePlanOptions,
): string {
	if (options.mode === "none") return "not_required";
	if (options.mode === "worktree") return "policy_required";
	if (items.length > 1) return "parallel_claims";
	if (dirtyPathsOverlap(item, options.dirtyPaths || [])) {
		return "dirty_working_tree_overlap";
	}
	return "not_required";
}

function worktreeRef(input: {
	item: RuntimeWorkUnitClaimCandidate;
	workerId: string;
	options: RuntimeWorktreePlanOptions;
}): WorktreeRef {
	const baseRef = input.options.baseSha || input.options.baseRef || "HEAD";
	const branch = [
		"codewiki",
		safeSegment(input.item.traceId, "trace"),
		safeSegment(input.item.workUnitId, "work"),
		safeSegment(input.workerId, "worker"),
	].join("/");
	return {
		path: worktreePath(input.options, input.item, input.workerId),
		branch,
		baseRef,
		...(input.options.baseSha ? { baseSha: input.options.baseSha } : {}),
	};
}

function worktreePath(
	options: RuntimeWorktreePlanOptions,
	item: RuntimeWorkUnitClaimCandidate,
	workerId: string,
): string {
	if (options.worktreeRoot) {
		return resolve(
			options.worktreeRoot,
			safeSegment(item.traceId, "trace"),
			safeSegment(item.workUnitId, "work"),
			safeSegment(workerId, "worker"),
		);
	}
	return resolve(
		defaultWorktreeRoot(options, item),
		safeSegment(item.workUnitId, "work"),
		safeSegment(workerId, "worker"),
	);
}

function defaultWorktreeRoot(
	options: RuntimeWorktreePlanOptions,
	item: RuntimeWorkUnitClaimCandidate,
): string {
	const repoRoot = resolve(options.repoRoot || ".");
	return resolve(repoRoot, traceTmpPath(item.traceId, "worktree"));
}

function commandPlan(
	worktree: WorktreeRef | undefined,
	setupCommands: string[],
): WorktreeCommandPlan {
	if (!worktree) {
		return { worktreePrepare: [], worktreeVerify: [], worktreeCleanup: [] };
	}
	const baseRef = worktree.baseSha || worktree.baseRef || "HEAD";
	const branch = worktree.branch || "codewiki/worktree";
	return {
		worktreePrepare: [
			processCommand("git", [
				"worktree",
				"add",
				"-B",
				branch,
				worktree.path,
				baseRef,
			]),
			...setupCommands,
		],
		worktreeVerify: [
			processCommand("git", ["-C", worktree.path, "rev-parse", "HEAD"]),
			processCommand("git", ["-C", worktree.path, "status", "--porcelain"]),
		],
		worktreeCleanup: [
			processCommand("git", ["worktree", "remove", worktree.path]),
			processCommand("git", ["worktree", "prune"]),
		],
	};
}

function processCommand(
	executable: string,
	args: string[],
): WorktreeProcessCommand {
	return { executable, args };
}

function worktreeCommandDisplay(command: WorktreeCommand): string {
	if (typeof command === "string") return command;
	return [command.executable, ...command.args]
		.map((argument) =>
			/^[A-Za-z0-9_./:@%+=,-]+$/.test(argument)
				? argument
				: JSON.stringify(argument),
		)
		.join(" ");
}

function dirtyPathsOverlap(
	item: RuntimeWorkUnitClaimCandidate,
	dirtyPaths: string[],
): boolean {
	return item.pathScopes.some((scope) =>
		dirtyPaths.some((path) => pathsOverlap(scope, path)),
	);
}

function pathsOverlap(left: string, right: string): boolean {
	const leftPath = normalizePath(left);
	const rightPath = normalizePath(right);
	if (!leftPath || !rightPath) return false;
	if (leftPath === rightPath) return true;
	if (pathMatchesPattern(leftPath, rightPath)) return true;
	if (pathMatchesPattern(rightPath, leftPath)) return true;
	return rootsOverlap(globRoot(leftPath), globRoot(rightPath));
}

function rootsOverlap(left: string, right: string): boolean {
	if (!left || !right) return false;
	return (
		left === right ||
		left.startsWith(`${right}/`) ||
		right.startsWith(`${left}/`)
	);
}

function globRoot(path: string): string {
	const wildcardIndex = path.indexOf("*");
	if (wildcardIndex === -1) return path;
	const root = path.slice(0, wildcardIndex);
	return root.replace(/\/[^/]*$/, "").replace(/\/$/, "");
}

function normalizePath(path: string): string {
	return String(path || "")
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\.\//, "")
		.replace(/\/+$/, "");
}

function workerIdForItem(
	item: RuntimeWorkUnitClaimCandidate,
	index: number,
	options: RuntimeWorktreePlanOptions,
): string {
	return (
		options.workerIds?.[item.workUnitId] ||
		`${options.workerIdPrefix || "worker"}-${String(index + 1).padStart(3, "0")}`
	);
}

function safeSegment(value: string, fallback: string): string {
	const segment = String(value || "")
		.trim()
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	return segment || fallback;
}
