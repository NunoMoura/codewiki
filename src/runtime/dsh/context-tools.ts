import type {Context} from "@deepseek-ai/cordis";
import {defineTool, type JsonValue} from "@deepseek-ai/dsh-tools";

import {
	createStageContextFacade,
	type StageContextBundle,
	type StageContextFacade,
} from "../context/bundle.ts";
import type {StageContextOwner, StageContextQueryInput} from "../context/contracts.ts";
import type {ExecutionLedgerEntryInput} from "../evidence/execution-ledger.ts";
import {
	canonicalJson,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export const DSH_STAGE_CONTEXT_QUERY_TOOL = "query_stage_context" as const;
export const DSH_STAGE_CONTEXT_BATCH_QUERY_TOOL = "query_stage_context_batch" as const;
export const DSH_STAGE_CONTEXT_TOOL_SET_VERSION = "1.0.0" as const;
export const DSH_STAGE_CONTEXT_TOOL_OUTPUT_MAX_BYTES = 4 * 1_024 * 1_024;

const OWNER_VALUES = [
	"work-state",
	"knowledge",
	"alignment",
	"repository",
	"change-trace",
	"evidence",
	"check-result",
] as const;

const QUERY_PARAMETERS = Object.freeze({
	owner: {
		type: "string" as const,
		enum: OWNER_VALUES,
		required: true as const,
		description: "Canonical owner of requested Stage Context data.",
	},
	operation: {
		type: "string" as const,
		required: true as const,
		description: "Admitted declarative query operation.",
	},
	arguments: {
		type: "json" as const,
		required: true as const,
		description: "Lossless JSON arguments selecting one pre-admitted route.",
	},
	limit: {
		type: "integer" as const,
		required: true as const,
		description: "Maximum returned items, from 1 through 1000.",
	},
	cursor: {
		type: "string" as const,
		description: "Opaque next cursor from a previous matching result.",
	},
});

const BATCH_QUERY_PARAMETERS = Object.freeze({
	queries: {
		type: "array" as const,
		required: true as const,
		description: "One through 64 distinct admitted Stage Context queries.",
		items: {
			type: "object" as const,
			additionalProperties: false,
			properties: QUERY_PARAMETERS,
		},
	},
});

const QUERY_OUTPUT = Object.freeze({
	schema: {type: "json" as const},
	render: (_arguments: unknown, value: unknown) => [
		{type: "text" as const, text: canonicalJson(value)},
	],
});

const DIRECT_DESCRIPTION = "Query one immutable, pre-admitted Stage Context route. Returns bounded canonical items, source references, coverage, staleness, and an opaque next cursor. No live project access occurs.";
const BATCH_DESCRIPTION = "Execute one through 64 distinct immutable Stage Context queries as one bounded call. Every query and result remains independently digest-bound and source-attributed.";

export const DSH_STAGE_CONTEXT_TOOL_SET_DIGEST: Sha256Digest = canonicalJsonDigest({
	version: DSH_STAGE_CONTEXT_TOOL_SET_VERSION,
	limits: {
		maximumOutputBytes: DSH_STAGE_CONTEXT_TOOL_OUTPUT_MAX_BYTES,
		maximumBatchQueries: 64,
		maximumItemsPerQuery: 1_000,
	},
	tools: [
		{
			name: DSH_STAGE_CONTEXT_QUERY_TOOL,
			description: DIRECT_DESCRIPTION,
			parameters: QUERY_PARAMETERS,
			output: {schema: QUERY_OUTPUT.schema, rendering: "canonical-json-text"},
		},
		{
			name: DSH_STAGE_CONTEXT_BATCH_QUERY_TOOL,
			description: BATCH_DESCRIPTION,
			parameters: BATCH_QUERY_PARAMETERS,
			output: {schema: QUERY_OUTPUT.schema, rendering: "canonical-json-text"},
		},
	],
});

export interface DshStageContextToolRegistrationOptions {
	readonly context: Context;
	readonly bundle: StageContextBundle;
	readonly maxToolCalls: number;
	readonly record: (entry: ExecutionLedgerEntryInput) => void;
	readonly now?: () => string;
}

export interface DshStageContextToolRegistration {
	readonly toolSetDigest: Sha256Digest;
	readonly facade: StageContextFacade;
	readonly calls: () => number;
	dispose(): void;
}

export function registerDshStageContextTools(
	options: DshStageContextToolRegistrationOptions,
): Readonly<DshStageContextToolRegistration> {
	if (!Number.isSafeInteger(options.maxToolCalls) || options.maxToolCalls < 1) {
		throw new Error("DSH Stage Context tools require a positive tool-call budget.");
	}
	const facade = createStageContextFacade(options.bundle);
	const now = options.now ?? (() => new Date().toISOString());
	let calls = 0;
	const admit = (): void => {
		calls += 1;
		if (calls > options.maxToolCalls) {
			throw new Error("DSH Stage Context tool-call budget is exhausted.");
		}
	};
	const record = (
		kind: ExecutionLedgerEntryInput["kind"],
		modelVisible: boolean,
		payload: unknown,
	): void => options.record({kind, occurredAt: now(), modelVisible, payload});
	const executeQuery = (
		name: string,
		callId: string,
		argumentsValue: unknown,
		run: () => unknown,
	): JsonValue => {
		record("tool-call", true, {callId, name, arguments: argumentsValue});
		try {
			admit();
			const outcome = run();
			record("stage-context-query", false, outcome);
			const output = toolOutput(outcome);
			record("tool-result", true, {callId, name, output});
			return output;
		} catch (error) {
			record("tool-result", true, {
				callId,
				name,
				error: error instanceof Error ? error.message : "Unknown Stage Context tool failure.",
			});
			throw error;
		}
	};

	const disposeDirect = options.context.tools.register(defineTool({
		name: DSH_STAGE_CONTEXT_QUERY_TOOL,
		description: DIRECT_DESCRIPTION,
		parameters: QUERY_PARAMETERS,
		output: QUERY_OUTPUT,
		async execute(argumentsValue, execution) {
			const input = queryInput(argumentsValue);
			return executeQuery(
				DSH_STAGE_CONTEXT_QUERY_TOOL,
				execution.callId,
				input,
				() => facade.query(input),
			);
		},
	}));
	const disposeBatch = options.context.tools.register(defineTool({
		name: DSH_STAGE_CONTEXT_BATCH_QUERY_TOOL,
		description: BATCH_DESCRIPTION,
		parameters: BATCH_QUERY_PARAMETERS,
		output: QUERY_OUTPUT,
		async execute(argumentsValue, execution) {
			const inputs = argumentsValue.queries.map(queryInput);
			return executeQuery(
				DSH_STAGE_CONTEXT_BATCH_QUERY_TOOL,
				execution.callId,
				{queries: inputs},
				() => facade.batch(inputs),
			);
		},
	}));
	let disposed = false;
	return Object.freeze({
		toolSetDigest: DSH_STAGE_CONTEXT_TOOL_SET_DIGEST,
		facade,
		calls: () => calls,
		dispose: () => {
			if (disposed) return;
			disposed = true;
			disposeBatch();
			disposeDirect();
		},
	});
}

function toolOutput(value: unknown): JsonValue {
	const canonical = toCanonicalJsonValue(value);
	if (Buffer.byteLength(canonicalJson(canonical)) > DSH_STAGE_CONTEXT_TOOL_OUTPUT_MAX_BYTES) {
		throw new Error("DSH Stage Context tool result exceeds its byte limit.");
	}
	return structuredClone(canonical) as JsonValue;
}

function queryInput(value: {
	readonly owner: string;
	readonly operation: string;
	readonly arguments: unknown;
	readonly limit: number;
	readonly cursor?: string;
}): StageContextQueryInput {
	return Object.freeze({
		owner: value.owner as StageContextOwner,
		operation: value.operation,
		arguments: value.arguments,
		limit: value.limit,
		cursor: value.cursor ?? null,
	});
}
