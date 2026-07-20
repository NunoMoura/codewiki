import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { TraceRecord } from "../traces/types.ts";
import type { TraceUiPreviewTargetBinding } from "./binding.ts";
import { normalizePreviewSessionId } from "./browser-adapter.ts";
import type { PreviewIntegrationState } from "./integration.ts";
import { previewProfileDigest, type PreviewProfile } from "./profile.ts";
import {
	previewTargetUrl,
	type PreviewEvidenceViewport,
	type UiPreviewTarget,
	uiPreviewTargetDigest,
} from "./target.ts";

export interface PreviewEvidenceObservation {
	count: number;
	lines: string[];
	truncated: boolean;
	digest: string;
}

export interface PreviewEvidenceScreenshot {
	viewport: PreviewEvidenceViewport;
	width: number;
	height: number;
	path: string;
	digest: string;
}

export interface PreviewImplementationCorrelation {
	traceId: string;
	traceEventId?: string;
	implementationIterationId?: string;
	implementationIteration?: number;
}

export interface PreviewEvidenceCapture {
	id: string;
	targetId: string;
	targetDigest: string;
	uiRef: string;
	profileId: string;
	profileDigest: string;
	route: string;
	scenario?: string;
	url: string;
	traceIds: string[];
	changeIds: string[];
	sprintIds: string[];
	workItemIds: string[];
	implementation: PreviewImplementationCorrelation[];
	integration: PreviewIntegrationState;
	capturedAt: string;
	screenshots: PreviewEvidenceScreenshot[];
	console: PreviewEvidenceObservation;
	network: PreviewEvidenceObservation;
	manifestPath: string;
	manifestDigest: string;
}

export interface PreviewEvidenceCaptureInput {
	repoRoot: string;
	profile: PreviewProfile;
	target: UiPreviewTarget;
	binding: TraceUiPreviewTargetBinding;
	integration: PreviewIntegrationState;
	records: TraceRecord[];
	sessionId: string;
	now?: () => Date;
	commandRunner?: PreviewEvidenceCommandRunner;
}

export type PreviewEvidenceCommandRunner = (
	args: string[],
	cwd: string,
) => Promise<{ stdout: string; stderr: string }>;

const VIEWPORTS: Record<
	PreviewEvidenceViewport,
	{ width: number; height: number }
> = {
	desktop: { width: 1440, height: 900 },
	mobile: { width: 390, height: 844 },
};
const MAX_OBSERVATION_LINES = 100;
const MAX_OBSERVATION_LINE_LENGTH = 500;
const MAX_COMMAND_OUTPUT_BYTES = 128 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;

export async function capturePreviewEvidence(
	input: PreviewEvidenceCaptureInput,
): Promise<PreviewEvidenceCapture> {
	if (input.profile.browser !== "playwright") {
		throw new Error(
			"Preview evidence capture requires the Playwright browser adapter.",
		);
	}
	const targetDigest = uiPreviewTargetDigest(input.target);
	if (targetDigest !== input.binding.targetDigest) {
		throw new Error(
			`Preview target ${input.target.id} changed before evidence capture.`,
		);
	}
	const profileDigest = previewProfileDigest(input.profile);
	if (profileDigest !== input.binding.profileDigest) {
		throw new Error(
			`Preview profile ${input.profile.id} changed before evidence capture.`,
		);
	}
	const viewports = uniqueViewports(input.target.viewports);
	if (viewports.length === 0) {
		throw new Error("Preview evidence capture requires at least one viewport.");
	}
	const capturedAt = (input.now || (() => new Date()))().toISOString();
	const id = `capture-${capturedAt.replace(/[^0-9]/g, "").slice(0, 17)}-${randomUUID().slice(0, 8)}`;
	const captureDir = join(
		input.repoRoot,
		".codewiki",
		"runtime",
		"preview-evidence",
		safeSegment(input.target.id),
		safeSegment(input.profile.id),
		id,
	);
	const runner = input.commandRunner || runPlaywrightCli;
	const session = normalizePreviewSessionId(input.sessionId);
	const url = previewTargetUrl(input.profile.url, input.target);
	await mkdir(captureDir, { recursive: true, mode: 0o700 });
	await chmod(captureDir, 0o700);
	try {
		await runner([`-s=${session}`, "goto", url], input.repoRoot);
		const screenshots: PreviewEvidenceScreenshot[] = [];
		for (const viewport of viewports) {
			const dimensions = VIEWPORTS[viewport];
			const screenshotPath = join(captureDir, `${viewport}.png`);
			await runner(
				[
					`-s=${session}`,
					"resize",
					String(dimensions.width),
					String(dimensions.height),
				],
				input.repoRoot,
			);
			await runner(
				[`-s=${session}`, "screenshot", `--filename=${screenshotPath}`],
				input.repoRoot,
			);
			await chmod(screenshotPath, 0o600);
			const screenshot = await readFile(screenshotPath);
			screenshots.push({
				viewport,
				...dimensions,
				path: projectPath(input.repoRoot, screenshotPath),
				digest: sha256(screenshot),
			});
		}
		const consoleResult = await runner(
			[`-s=${session}`, "--raw", "console"],
			input.repoRoot,
		);
		const networkResult = await runner(
			[`-s=${session}`, "--raw", "requests"],
			input.repoRoot,
		);
		const manifestPath = join(captureDir, "manifest.json");
		const manifest = {
			id,
			targetId: input.target.id,
			targetDigest,
			uiRef: input.target.uiRef,
			profileId: input.profile.id,
			profileDigest,
			route: input.target.route,
			...(input.target.scenario ? { scenario: input.target.scenario } : {}),
			url,
			traceIds: [...input.binding.traceIds],
			changeIds: [...input.binding.contributingChangeIds],
			sprintIds: [...input.binding.sprintIds],
			workItemIds: [...input.binding.workItemIds],
			implementation: implementationCorrelations(
				input.records,
				input.binding.traceIds,
			),
			integration: input.integration,
			capturedAt,
			screenshots,
			console: boundedObservation(consoleResult.stdout, input.repoRoot),
			network: boundedObservation(networkResult.stdout, input.repoRoot),
			manifestPath: projectPath(input.repoRoot, manifestPath),
		};
		const manifestDigest = sha256(JSON.stringify(manifest));
		const capture = { ...manifest, manifestDigest };
		await writeFile(manifestPath, `${JSON.stringify(capture, null, 2)}\n`, {
			mode: 0o600,
		});
		return capture;
	} catch (error) {
		await rm(captureDir, { recursive: true, force: true });
		throw error;
	}
}

function uniqueViewports(
	values: PreviewEvidenceViewport[],
): PreviewEvidenceViewport[] {
	return [...new Set(values)].filter(
		(value): value is PreviewEvidenceViewport => value in VIEWPORTS,
	);
}

function implementationCorrelations(
	records: TraceRecord[],
	traceIds: string[],
): PreviewImplementationCorrelation[] {
	return traceIds.map((traceId) => {
		const events = records
			.filter(
				(record): record is Extract<TraceRecord, { type: "trace_event" }> =>
					record.type === "trace_event" && record.traceId === traceId,
			)
			.sort((left, right) => left.sequence - right.sequence);
		const latest = events.at(-1);
		const implementation = events
			.filter((event) => event.loop === "implementation")
			.at(-1);
		const dataIteration = implementation?.data?.iteration;
		const idIteration = implementation?.id.match(
			/:iteration:(\d+)(?:$|:)/,
		)?.[1];
		let iteration: number | undefined;
		if (typeof dataIteration === "number" && Number.isInteger(dataIteration)) {
			iteration = dataIteration;
		} else if (idIteration) {
			iteration = Number(idIteration);
		}
		return {
			traceId,
			...(latest ? { traceEventId: latest.id } : {}),
			...(implementation
				? { implementationIterationId: implementation.id }
				: {}),
			...(iteration !== undefined
				? { implementationIteration: iteration }
				: {}),
		};
	});
}

function boundedObservation(
	value: string,
	repoRoot: string,
): PreviewEvidenceObservation {
	const allLines = value
		.split(/\r?\n/)
		.map((line) => redactObservation(line, repoRoot))
		.filter(Boolean);
	const lines = allLines
		.slice(-MAX_OBSERVATION_LINES)
		.map((line) => line.slice(0, MAX_OBSERVATION_LINE_LENGTH));
	return {
		count: allLines.length,
		lines,
		truncated:
			allLines.length > MAX_OBSERVATION_LINES ||
			allLines.some((line) => line.length > MAX_OBSERVATION_LINE_LENGTH),
		digest: sha256(JSON.stringify(lines)),
	};
}

function redactObservation(value: string, repoRoot: string): string {
	return value
		.replaceAll(repoRoot, "<project>")
		.replace(/https?:\/\/[^\s)\]}]+/gi, (candidate) => redactUrl(candidate))
		.replace(
			/\b(authorization|cookie|set-cookie|token|secret|password)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
			"$1=<redacted>",
		)
		.replace(
			/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g,
			"<redacted-jwt>",
		);
}

function redactUrl(value: string): string {
	try {
		const url = new URL(value);
		if (url.search) url.search = "?<redacted>";
		if (url.hash) url.hash = "#<redacted>";
		return url.toString();
	} catch {
		return "<redacted-url>";
	}
}

async function runPlaywrightCli(
	args: string[],
	cwd: string,
): Promise<{ stdout: string; stderr: string }> {
	return runCommand("playwright-cli", args, cwd);
}

async function runCommand(
	command: string,
	args: string[],
	cwd: string,
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let settled = false;
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			finish(new Error(`${command} timed out after ${COMMAND_TIMEOUT_MS}ms.`));
		}, COMMAND_TIMEOUT_MS);
		child.stdout.on("data", (chunk) => {
			stdout = appendBounded(stdout, String(chunk));
		});
		child.stderr.on("data", (chunk) => {
			stderr = appendBounded(stderr, String(chunk));
		});
		child.once("error", finish);
		child.once("close", (code) => {
			if (code === 0) finish(undefined, { stdout, stderr });
			else {
				const detail = redactObservation(
					stderr.trim() || stdout.trim() || "no output",
					cwd,
				).slice(0, 1_000);
				finish(new Error(`${command} failed with exit ${code}: ${detail}`));
			}
		});

		function finish(
			error?: Error,
			result?: { stdout: string; stderr: string },
		): void {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (error) reject(error);
			else resolve(result || { stdout, stderr });
		}
	});
}

function appendBounded(current: string, next: string): string {
	return `${current}${next}`.slice(-MAX_COMMAND_OUTPUT_BYTES);
}

function projectPath(repoRoot: string, path: string): string {
	return relative(repoRoot, path).split("\\").join("/");
}

function safeSegment(value: string): string {
	const readable =
		value.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 48) || "item";
	return `${readable}-${sha256(value).slice("sha256:".length, 12)}`;
}

function sha256(value: string | Buffer): string {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
