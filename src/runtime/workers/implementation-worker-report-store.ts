import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
	assertImplementationWorkerAssignment,
	assertImplementationWorkerReport,
	type ImplementationWorkerAssignment,
	type ImplementationWorkerReport,
} from "./implementation-worker-adapter.ts";

const MAX_WORKER_REPORT_BYTES = 1024 * 1024;

export async function persistImplementationWorkerReport(
	assignment: ImplementationWorkerAssignment,
	reportWithoutRef: Omit<ImplementationWorkerReport, "reportRef">,
): Promise<ImplementationWorkerReport> {
	assertImplementationWorkerAssignment(assignment);
	assertImplementationWorkerReportPath(assignment);
	const report: ImplementationWorkerReport = {
		...reportWithoutRef,
		reportRef: implementationWorkerReportRef(reportWithoutRef),
	};
	assertImplementationWorkerReport(assignment, report);
	await mkdir(dirname(assignment.reportPath), { recursive: true, mode: 0o700 });
	assertImplementationWorkerReportPath(assignment);
	const temporaryPath = `${assignment.reportPath}.${process.pid}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(report)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	await rename(temporaryPath, assignment.reportPath);
	return report;
}

export async function recoverImplementationWorkerReport(
	assignment: ImplementationWorkerAssignment,
): Promise<ImplementationWorkerReport | undefined> {
	assertImplementationWorkerAssignment(assignment);
	assertImplementationWorkerReportPath(assignment);
	let source: string;
	try {
		const metadata = await stat(assignment.reportPath);
		if (metadata.size > MAX_WORKER_REPORT_BYTES) {
			throw new Error(
				`Implementation worker recovery report exceeds ${MAX_WORKER_REPORT_BYTES} bytes.`,
			);
		}
		source = await readFile(assignment.reportPath, "utf8");
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw error;
	}
	let report: ImplementationWorkerReport;
	try {
		report = JSON.parse(source) as ImplementationWorkerReport;
	} catch {
		throw new Error("Implementation worker recovery report is invalid JSON.");
	}
	if (!report || typeof report !== "object" || Array.isArray(report)) {
		throw new Error("Implementation worker recovery report is invalid.");
	}
	const { reportRef, ...reportWithoutRef } = report;
	if (reportRef !== implementationWorkerReportRef(reportWithoutRef)) {
		throw new Error("Implementation worker recovery report digest does not match.");
	}
	assertImplementationWorkerReport(assignment, report);
	return report;
}

export function assertImplementationWorkerReportPath(
	assignment: ImplementationWorkerAssignment,
): void {
	const canonicalRoot = realpathSync(assignment.repoRoot);
	const runtimeRoot = resolve(canonicalRoot, ".codewiki", "runtime");
	const target = resolve(assignment.reportPath);
	const child = relative(runtimeRoot, target);
	if (!child || child.startsWith("..") || child.includes("\0")) {
		throw new Error(
			"Implementation worker reportPath must stay below .codewiki/runtime.",
		);
	}
	let current = canonicalRoot;
	for (const segment of [
		".codewiki",
		"runtime",
		...child.split(/[\\/]/).slice(0, -1),
	]) {
		current = resolve(current, segment);
		if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
			throw new Error(
				"Implementation worker reportPath cannot traverse symbolic links.",
			);
		}
	}
	if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
		throw new Error("Implementation worker reportPath cannot be a symbolic link.");
	}
}

export function implementationWorkerReportStatus(
	status: string | undefined,
): ImplementationWorkerReport["status"] {
	if (
		status === "completed" ||
		status === "blocked" ||
		status === "failed" ||
		status === "cancelled"
	) {
		return status;
	}
	return "failed";
}

function implementationWorkerReportRef(
	report: Omit<ImplementationWorkerReport, "reportRef">,
): string {
	return `runtime-worker-report:${createHash("sha256")
		.update(JSON.stringify(report))
		.digest("hex")}`;
}

function isNotFound(error: unknown): boolean {
	return Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT",
	);
}
