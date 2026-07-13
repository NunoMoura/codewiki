import type {
	TraceHostProcessCompletion,
	TraceHostResult,
} from "../runtime/trace-host-runner.ts";

const RESULT_PREFIX = "CODEWIKI_TRACE_HOST_RESULT ";
const MAX_EVENT_LINE = 262_144;
const MAX_ASSISTANT_TEXT = 32_768;
const MAX_SUMMARY = 500;
const MAX_REF = 240;
const MAX_REFS = 20;
const sensitiveTextPattern =
	/\b(?:bearer|authorization|api[_-]?key|access[_-]?token|password|secret)\b\s*[:=]?\s*\S+|[?&#]token=/i;

interface TraceHostResultCollector {
	acceptLine(line: string): void;
	currentUsage(): TraceHostResult["usage"] | undefined;
	complete(
		exitCode: number | null,
		signal: NodeJS.Signals | string | null,
	): TraceHostProcessCompletion;
}

interface AssistantMetadata {
	model?: string;
	provider?: string;
	stopReason?: string;
	usage?: TraceHostResult["usage"];
}

export function createTraceHostResultCollector(): TraceHostResultCollector {
	let sessionId: string | undefined;
	let result: TraceHostResult | undefined;
	let assistant: AssistantMetadata = {};
	return {
		acceptLine(line) {
			if (!line.trim() || line.length > MAX_EVENT_LINE) return;
			const event = jsonObject(line);
			if (!event) return;
			if (event.type === "session") {
				sessionId = optionalIdentifier(event.id, 160);
				return;
			}
			if (event.type !== "message_end") return;
			const message = object(event.message);
			if (!message || message.role !== "assistant") return;
			const next = assistantMetadata(message);
			assistant = {
				...assistant,
				...next,
				...(next.usage ? { usage: addUsage(assistant.usage, next.usage) } : {}),
			};
			result = resultFromAssistantText(assistantText(message.content));
		},
		currentUsage() {
			return assistant.usage ? { ...assistant.usage } : undefined;
		},
		complete(exitCode, signal) {
			return {
				exitCode,
				signal,
				result: completionResult({
					result,
					sessionId,
					assistant,
					exitCode,
					signal,
				}),
			};
		},
	};
}

function addUsage(
	current: TraceHostResult["usage"] | undefined,
	next: NonNullable<TraceHostResult["usage"]>,
): NonNullable<TraceHostResult["usage"]> {
	return {
		input: (current?.input || 0) + next.input,
		output: (current?.output || 0) + next.output,
		cacheRead: (current?.cacheRead || 0) + next.cacheRead,
		cacheWrite: (current?.cacheWrite || 0) + next.cacheWrite,
		totalTokens: (current?.totalTokens || 0) + next.totalTokens,
		cost: (current?.cost || 0) + next.cost,
	};
}

function completionResult(input: {
	result?: TraceHostResult;
	sessionId?: string;
	assistant: AssistantMetadata;
	exitCode: number | null;
	signal: NodeJS.Signals | string | null;
}): TraceHostResult {
	const failedProcess =
		input.exitCode !== 0 ||
		input.signal !== null ||
		input.assistant.stopReason === "error" ||
		input.assistant.stopReason === "aborted";
	if (failedProcess) {
		return addMetadata(
			{
				version: 1,
				outcome: "failed",
				summary: "Trace host process ended unsuccessfully.",
				refs: [],
			},
			input,
		);
	}
	if (!input.result) {
		return addMetadata(
			{
				version: 1,
				outcome: "failed",
				summary: "Trace host exited without a valid structured result.",
				refs: [],
			},
			input,
		);
	}
	return addMetadata(input.result, input);
}

function addMetadata(
	result: TraceHostResult,
	input: {
		sessionId?: string;
		assistant: AssistantMetadata;
	},
): TraceHostResult {
	return {
		...result,
		...(input.sessionId ? { sessionId: input.sessionId } : {}),
		...(input.assistant.model ? { model: input.assistant.model } : {}),
		...(input.assistant.provider ? { provider: input.assistant.provider } : {}),
		...(input.assistant.usage ? { usage: input.assistant.usage } : {}),
	};
}

function resultFromAssistantText(text: string): TraceHostResult | undefined {
	const lines = text.split(/\r?\n/).map((entry) => entry.trim());
	let line: string | undefined;
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		if (!lines[index].startsWith(RESULT_PREFIX)) continue;
		line = lines[index];
		break;
	}
	if (!line) return undefined;
	const value = jsonObject(line.slice(RESULT_PREFIX.length));
	if (!value || value.version !== 1) return undefined;
	if (!isAgentOutcome(value.outcome)) return undefined;
	const summary = boundedSafeText(value.summary, MAX_SUMMARY);
	const refs = boundedSafeRefs(value.refs);
	if (!summary || !refs) return undefined;
	const approval = approvalRequest(value.approval);
	if (value.outcome === "needs_approval" && !approval) return undefined;
	if (value.outcome !== "needs_approval" && value.approval !== undefined) {
		return undefined;
	}
	return {
		version: 1,
		outcome: value.outcome,
		summary,
		refs,
		...(approval ? { approval } : {}),
	};
}

function approvalRequest(
	value: unknown,
): TraceHostResult["approval"] | undefined {
	if (value === undefined) return undefined;
	const approval = object(value);
	if (!approval) return undefined;
	const allowed = new Set(["kind", "proposalDigest", "proposalRef"]);
	if (Object.keys(approval).some((key) => !allowed.has(key))) return undefined;
	if (
		approval.kind !== "planning" &&
		approval.kind !== "implementation" &&
		approval.kind !== "archive"
	) {
		return undefined;
	}
	if (
		typeof approval.proposalDigest !== "string" ||
		!/^sha256:[a-f0-9]{64}$/.test(approval.proposalDigest)
	) {
		return undefined;
	}
	const proposalRef =
		approval.proposalRef === undefined
			? undefined
			: boundedSafeRef(approval.proposalRef);
	if (approval.proposalRef !== undefined && !proposalRef) return undefined;
	return {
		kind: approval.kind,
		proposalDigest: approval.proposalDigest,
		...(proposalRef ? { proposalRef } : {}),
	};
}

function assistantMetadata(
	message: Record<string, unknown>,
): AssistantMetadata {
	const usage = usageMetadata(message.usage);
	return {
		...(optionalIdentifier(message.model, 160)
			? { model: optionalIdentifier(message.model, 160) }
			: {}),
		...(optionalIdentifier(message.provider, 120)
			? { provider: optionalIdentifier(message.provider, 120) }
			: {}),
		...(typeof message.stopReason === "string"
			? { stopReason: message.stopReason }
			: {}),
		...(usage ? { usage } : {}),
	};
}

function assistantText(value: unknown): string {
	if (typeof value === "string") return value.slice(-MAX_ASSISTANT_TEXT);
	if (!Array.isArray(value)) return "";
	const text = value
		.map((part) => object(part))
		.filter((part) => part?.type === "text" && typeof part.text === "string")
		.map((part) => part?.text as string)
		.join("\n");
	return text.slice(-MAX_ASSISTANT_TEXT);
}

function boundedSafeRefs(value: unknown): string[] | undefined {
	if (!Array.isArray(value) || value.length > MAX_REFS) return undefined;
	const refs: string[] = [];
	for (const entry of value) {
		const ref = boundedSafeRef(entry);
		if (!ref) return undefined;
		refs.push(ref);
	}
	return [...new Set(refs)];
}

function boundedSafeRef(value: unknown): string | undefined {
	const ref = boundedSafeText(value, MAX_REF);
	if (!ref || !/^[A-Za-z0-9][A-Za-z0-9._:/#@+*=-]*$/.test(ref)) {
		return undefined;
	}
	return ref;
}

function boundedSafeText(value: unknown, max: number): string | undefined {
	if (typeof value !== "string") return undefined;
	const text = value.trim();
	if (!text || text.length > max || sensitiveTextPattern.test(text)) {
		return undefined;
	}
	return text;
}

function optionalIdentifier(value: unknown, max: number): string | undefined {
	if (typeof value !== "string" || value.length < 1 || value.length > max) {
		return undefined;
	}
	return /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value) ? value : undefined;
}

function usageMetadata(value: unknown): TraceHostResult["usage"] | undefined {
	const usage = object(value);
	const cost = object(usage?.cost)?.total;
	if (!usage) return undefined;
	const cacheRead = usage.cacheRead ?? 0;
	const cacheWrite = usage.cacheWrite ?? 0;
	const values = [
		usage.input,
		usage.output,
		cacheRead,
		cacheWrite,
		usage.totalTokens,
		cost,
	];
	if (
		values.some(
			(entry) =>
				typeof entry !== "number" ||
				!Number.isFinite(entry) ||
				entry < 0 ||
				entry > 1_000_000_000_000,
		)
	) {
		return undefined;
	}
	return {
		input: Number(usage.input),
		output: Number(usage.output),
		cacheRead: Number(cacheRead),
		cacheWrite: Number(cacheWrite),
		totalTokens: Number(usage.totalTokens),
		cost: Number(cost),
	};
}

function isAgentOutcome(
	value: unknown,
): value is "completed" | "needs_approval" | "blocked" | "failed" {
	return ["completed", "needs_approval", "blocked", "failed"].includes(
		String(value),
	);
}

function jsonObject(value: string): Record<string, unknown> | undefined {
	try {
		return object(JSON.parse(value));
	} catch {
		return undefined;
	}
}

function object(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}
