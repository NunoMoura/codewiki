import {
	classifyImplementationArtifact,
	defaultReviewEvidenceCache,
	mergeImplementationEvidenceReports,
	reviewPackSelectionForPolicy,
	runCommonFastFeedback,
	runLanguageReviewPacks,
	type FastFeedbackResult,
	type ImplementationEvidenceReport,
	type LanguageReviewPackSkipSummary,
	type ReviewEvidenceCache,
} from "../../implementation/review/index.ts";
import { loadWikiConfigFile } from "../../project/config-file.ts";
import type {
	CodewikiCustomMessage,
	CodewikiExtensionContext,
	CodewikiExtensionEventHandler,
} from "./types.ts";

export interface CodeWikiReviewHookApi {
	on?: (eventName: string, handler: CodewikiExtensionEventHandler) => void;
	sendMessage?: (message: CodewikiCustomMessage) => void;
}

export interface CodeWikiReviewHookRegistration {
	registered: boolean;
	eventName?: string;
	reason?: string;
}

export interface CodeWikiReviewToolResult {
	changedPaths: string[];
	feedback?: FastFeedbackResult;
	cachedEvidenceId?: string;
	languageReview?: CodeWikiFastLanguageReviewResult;
	skipped?: string;
}

export interface CodeWikiFastLanguageReviewResult {
	selectedPackIds: string[];
	skippedPacks: LanguageReviewPackSkipSummary[];
}

export function registerCodeWikiReviewHooks(
	pi: CodeWikiReviewHookApi,
): CodeWikiReviewHookRegistration {
	if (typeof pi.on !== "function") {
		return { registered: false, reason: "Pi event API is unavailable." };
	}
	pi.on("tool_result", createCodeWikiReviewToolResultHandler(pi));
	return { registered: true, eventName: "tool_result" };
}

export function createCodeWikiReviewToolResultHandler(
	pi?: Pick<CodeWikiReviewHookApi, "sendMessage">,
) {
	return async function codeWikiReviewToolResultHandler(
		event: Record<string, unknown>,
		ctx: CodewikiExtensionContext,
	): Promise<CodeWikiReviewToolResult | undefined> {
		const eventRecord = record(event);
		const toolName = text(eventRecord.toolName || eventRecord.name);
		if (!["write", "edit"].includes(toolName)) return undefined;
		if (eventIndicatesFailure(eventRecord)) return undefined;
		const changedPaths = pathsFromToolEvent(eventRecord);
		if (changedPaths.length === 0) {
			return {
				changedPaths,
				skipped: "No changed path found on edit tool event.",
			};
		}
		const codePaths = changedPaths.filter(
			(path) => classifyImplementationArtifact(path).isCodeBearing,
		);
		if (codePaths.length === 0) {
			return {
				changedPaths,
				skipped: "No code-bearing implementation path changed.",
			};
		}
		const commonFastFeedbackInput = {
			changedPaths: codePaths,
			pathScopes: pathScopesFromToolEventContext(eventRecord, ctx),
			contentByPath: contentByPathFromToolEvent(eventRecord),
		};
		const baselineFeedback = runCommonFastFeedback(commonFastFeedbackInput);
		const cwd = cwdFromContext(ctx);
		const languageReview =
			baselineFeedback.status === "block"
				? undefined
				: await runFastLanguageReview(cwd, codePaths);
		const feedback = languageReview?.evidenceReport
			? runCommonFastFeedback({
					...commonFastFeedbackInput,
					evidenceReport: languageReview.evidenceReport,
				})
			: baselineFeedback;
		const mergedEvidenceReport = languageReview?.evidenceReport
			? mergeImplementationEvidenceReports(
					[languageReview.evidenceReport, feedback.evidenceReport],
					{ phase: "fast", changedPaths: codePaths },
				)
			: feedback.evidenceReport;
		const feedbackWithMergedEvidence = {
			...feedback,
			evidenceReport: mergedEvidenceReport,
		};
		const cachedEvidence = reviewEvidenceCacheFromContext(ctx).record({
			report: mergedEvidenceReport,
			traceId: traceIdFromToolEventContext(eventRecord, ctx),
			sessionId: sessionIdFromToolEventContext(eventRecord, ctx),
		});
		if (feedbackWithMergedEvidence.findings.length > 0) {
			emitReviewFeedback(pi, ctx, feedbackWithMergedEvidence);
		}
		return {
			changedPaths: codePaths,
			feedback: feedbackWithMergedEvidence,
			cachedEvidenceId: cachedEvidence.id,
			...(languageReview
				? {
						languageReview: {
							selectedPackIds: languageReview.selectedPackIds,
							skippedPacks: languageReview.skippedPacks,
						},
					}
				: {}),
		};
	};
}

async function runFastLanguageReview(
	cwd: string,
	changedPaths: string[],
): Promise<
	| (CodeWikiFastLanguageReviewResult & {
			evidenceReport: ImplementationEvidenceReport;
	  })
	| undefined
> {
	const config = await loadWikiConfigFile(cwd);
	const reviewConfig = config.quality.review;
	if (!reviewConfig.enabled) return undefined;
	const selection = reviewPackSelectionForPolicy(reviewConfig, changedPaths, {
		runFastCheck: true,
		fastTimeoutMs: reviewConfig.fastTimeoutMs,
	});
	const evidenceReport = await runLanguageReviewPacks(selection.enabledPacks, {
		cwd,
		phase: "fast",
		changedPaths,
		timeoutMs: reviewConfig.fastTimeoutMs,
	});
	return {
		evidenceReport,
		selectedPackIds: selection.selectedPacks.map((pack) => pack.id),
		skippedPacks: selection.skippedPacks,
	};
}

function cwdFromContext(ctx: CodewikiExtensionContext): string {
	const context = record(ctx);
	return text(context.cwd) || process.cwd();
}

export function reviewEvidenceCacheFromContext(
	ctx: CodewikiExtensionContext,
): ReviewEvidenceCache {
	const context = record(ctx);
	const codewiki = record(context.codewiki);
	const review = record(context.review);
	return (
		cacheLike(review.evidenceCache) ||
		cacheLike(review.reviewEvidenceCache) ||
		cacheLike(codewiki.evidenceCache) ||
		cacheLike(codewiki.reviewEvidenceCache) ||
		defaultReviewEvidenceCache
	);
}

function traceIdFromToolEventContext(
	event: Record<string, unknown>,
	ctx: CodewikiExtensionContext,
): string | undefined {
	const context = record(ctx);
	const codewiki = record(context.codewiki);
	const review = record(context.review);
	return (
		text(event.traceId) ||
		text(codewiki.traceId) ||
		text(review.traceId) ||
		undefined
	);
}

function sessionIdFromToolEventContext(
	event: Record<string, unknown>,
	ctx: CodewikiExtensionContext,
): string | undefined {
	const context = record(ctx);
	const codewiki = record(context.codewiki);
	const review = record(context.review);
	return (
		text(event.sessionId) ||
		text(codewiki.sessionId) ||
		text(review.sessionId) ||
		undefined
	);
}

function cacheLike(value: unknown): ReviewEvidenceCache | undefined {
	const candidate = record(value);
	return typeof candidate.record === "function" &&
		typeof candidate.reports === "function"
		? (candidate as unknown as ReviewEvidenceCache)
		: undefined;
}

export function pathsFromToolEvent(event: Record<string, unknown>): string[] {
	const args = record(event.args || event.input || event.arguments);
	const result = record(event.result || event.output);
	return uniqueStrings([
		...stringList(args.path),
		...stringList(args.filePath),
		...stringList(args.file_path),
		...stringList(args.paths),
		...stringList(result.path),
		...stringList(result.filePath),
		...stringList(result.file_path),
		...stringList(result.paths),
	]);
}

export function pathScopesFromToolEventContext(
	event: Record<string, unknown>,
	ctx: CodewikiExtensionContext,
): string[] {
	const args = record(event.args || event.input || event.arguments);
	const context = record(ctx);
	const codewiki = record(context.codewiki);
	const review = record(context.review);
	return uniqueStrings([
		...stringList(args.pathScopes),
		...stringList(args.path_scopes),
		...stringList(event.pathScopes),
		...stringList(codewiki.activePathScopes),
		...stringList(review.activePathScopes),
		...stringList(review.pathScopes),
	]);
}

function contentByPathFromToolEvent(
	event: Record<string, unknown>,
): Record<string, string> {
	const args = record(event.args || event.input || event.arguments);
	const result: Record<string, string> = {};
	for (const path of pathsFromToolEvent(event)) {
		const content = text(
			args.content || args.newText || args.new_text || args.text,
		);
		if (content) result[path] = content;
	}
	return result;
}

function emitReviewFeedback(
	pi: Pick<CodeWikiReviewHookApi, "sendMessage"> | undefined,
	ctx: unknown,
	feedback: FastFeedbackResult,
): void {
	const text = formatFastFeedback(feedback);
	const context = record(ctx);
	const ui = record(context.ui);
	if (typeof ui.notify === "function") {
		ui.notify(text);
		return;
	}
	if (typeof pi?.sendMessage === "function") {
		pi.sendMessage({
			customType: "codewiki_review_feedback",
			content: [{ type: "text", text }],
		});
	}
}

function formatFastFeedback(feedback: FastFeedbackResult): string {
	return [
		`CodeWiki fast review: ${feedback.status}`,
		...feedback.findings.map((finding) => `- ${finding.message}`),
	].join("\n");
}

function eventIndicatesFailure(event: Record<string, unknown>): boolean {
	if (event.ok === false || event.success === false) return true;
	const result = record(event.result || event.output);
	return result.ok === false || result.success === false;
}

function stringList(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (Array.isArray(value))
		return value.filter((item): item is string => typeof item === "string");
	return [];
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}

function record(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}
