import type { SessionStore } from "../shared/ports.ts";
import type { buildCodewikiResumeContext } from "../state/resume-context.ts";
import type { buildGatewayPreflight } from "../gateway/report.ts";
import type {
	CodewikiFreshWorkerRequest,
	CodewikiFreshWorkerResult,
} from "./types.ts";

export const CODEWIKI_RUNTIME_CAPABILITIES = [
	"model_loop",
	"session_state",
	"tool_execution",
	"context_assembly",
	"compaction",
	"event_streams",
	"replacement_session",
	"worker_execution",
] as const;

export const CODEWIKI_RUNTIME_SUPPORT_VALUES = [
	"supported",
	"platform_limited",
	"unsupported",
] as const;

export const CODEWIKI_RUNTIME_OWNER_VALUES = [
	"pi_code",
	"codewiki",
	"adapter",
	"future_runtime",
] as const;

export type CodewikiRuntimeCapabilityName =
	(typeof CODEWIKI_RUNTIME_CAPABILITIES)[number];
export type CodewikiRuntimeCapabilitySupport =
	(typeof CODEWIKI_RUNTIME_SUPPORT_VALUES)[number];
export type CodewikiRuntimeCapabilityOwner =
	(typeof CODEWIKI_RUNTIME_OWNER_VALUES)[number];

export interface CodewikiRuntimeCapabilityContract {
	name: CodewikiRuntimeCapabilityName;
	support: CodewikiRuntimeCapabilitySupport;
	owner: CodewikiRuntimeCapabilityOwner;
	summary: string;
	evidence: string[];
	limitations?: string[];
}

export interface CodewikiRuntimeFoundationContract {
	id: string;
	label: string;
	foundation: "pi_code" | "future_runtime";
	primary: boolean;
	capabilities: Record<
		CodewikiRuntimeCapabilityName,
		CodewikiRuntimeCapabilityContract
	>;
}

export interface CodewikiRuntimeCapabilityCheck {
	ok: boolean;
	status: "supported" | "platform_limited";
	capability: CodewikiRuntimeCapabilityContract;
	summary: string;
	evidence: string[];
}

export interface RuntimeSessionBoundaryPort {
	requestContextRefresh?: (request: {
		reason: string;
		taskId?: string | null;
		followUpIntent?: string | null;
		requestedAt?: string;
	}) => void | Promise<void>;
}

export interface RuntimeFreshWorkerBridgePort {
	requestFreshWorker: (
		request: CodewikiFreshWorkerRequest,
	) => Promise<CodewikiFreshWorkerResult> | CodewikiFreshWorkerResult;
}

export interface CodewikiRuntimePorts {
	sessionStore?: SessionStore;
	sessionBoundary?: RuntimeSessionBoundaryPort;
	freshWorkerBridge?: RuntimeFreshWorkerBridgePort;
	runtimeFoundation?: CodewikiRuntimeFoundationContract;
	resumeContextBuilder?: typeof buildCodewikiResumeContext;
	gatewayPreflightBuilder?: typeof buildGatewayPreflight;
}

function capability(
	name: CodewikiRuntimeCapabilityName,
	owner: CodewikiRuntimeCapabilityOwner,
	summary: string,
	evidence: string[],
	overrides?: Partial<CodewikiRuntimeCapabilityContract>,
): CodewikiRuntimeCapabilityContract {
	return {
		name,
		owner,
		support: "supported",
		summary,
		evidence,
		...overrides,
	};
}

export function createPiCodeRuntimeFoundationContract(
	overrides: Omit<
		Partial<CodewikiRuntimeFoundationContract>,
		"capabilities"
	> & {
		capabilities?: Partial<
			Record<
				CodewikiRuntimeCapabilityName,
				Partial<CodewikiRuntimeCapabilityContract>
			>
		>;
	} = {},
): CodewikiRuntimeFoundationContract {
	const base: Record<
		CodewikiRuntimeCapabilityName,
		CodewikiRuntimeCapabilityContract
	> = {
		model_loop: capability(
			"model_loop",
			"pi_code",
			"Pi Code owns model turns, provider calls, streaming, retry, and abort mechanics.",
			[
				"Pi SDK AgentSession.prompt/steer/followUp and event stream own model-loop execution.",
			],
			overrides.capabilities?.model_loop,
		),
		session_state: capability(
			"session_state",
			"pi_code",
			"Pi Code owns canonical session/thread state, session tree entries, and replacement-session lifecycle.",
			[
				"Pi SessionManager and AgentSessionRuntime own persisted session files and session replacement.",
			],
			overrides.capabilities?.session_state,
		),
		tool_execution: capability(
			"tool_execution",
			"pi_code",
			"Pi Code owns built-in and extension tool execution, validation, rendering, and tool-event ordering.",
			[
				"Pi ExtensionAPI registerTool plus tool_call/tool_result events define tool execution behavior.",
			],
			overrides.capabilities?.tool_execution,
		),
		context_assembly: capability(
			"context_assembly",
			"pi_code",
			"Pi Code owns system prompt, skills, prompts, context files, tool snippets, and provider payload assembly.",
			[
				"Pi ResourceLoader and before_agent_start/context hooks expose context assembly boundaries.",
			],
			overrides.capabilities?.context_assembly,
		),
		compaction: capability(
			"compaction",
			"pi_code",
			"Pi Code owns compaction execution while CodeWiki supplies source-backed resume packets at compaction boundaries.",
			[
				"Pi session_before_compact/session_compact and ctx.compact provide compaction lifecycle hooks.",
			],
			overrides.capabilities?.compaction,
		),
		event_streams: capability(
			"event_streams",
			"pi_code",
			"Pi Code owns lifecycle, model, message, turn, tool, and session event streams.",
			[
				"Pi extension events and AgentSession.subscribe expose runtime event streams.",
			],
			overrides.capabilities?.event_streams,
		),
		replacement_session: capability(
			"replacement_session",
			"pi_code",
			"Pi Code owns hard replacement-session mechanics through command-context newSession/switchSession/fork with withSession.",
			[
				"Pi ExtensionCommandContext newSession/switchSession/fork provide replacement-session APIs.",
			],
			{
				limitations: [
					"LLM-callable tools cannot call command-only replacement APIs directly; adapters must route through command context or return visible fallback.",
				],
				...overrides.capabilities?.replacement_session,
			},
		),
		worker_execution: capability(
			"worker_execution",
			"codewiki",
			"CodeWiki owns daemon job semantics; Pi subprocess/RPC/SDK bridges are supported only when an adapter supplies an explicit freshWorkerBridge port.",
			[
				"Pi command-context newSession is replacement-session support, not parallel worker spawning.",
				"A RuntimeFreshWorkerBridgePort must provide subprocess/RPC/SDK worker execution before daemon jobs may spawn fresh workers.",
			],
			{
				support: "platform_limited",
				limitations: [
					"Without freshWorkerBridge, runtime must return exact platform blockers and manual /wiki-resume --new remains fallback.",
				],
				...overrides.capabilities?.worker_execution,
			},
		),
	};
	return {
		id: overrides.id || "pi-code",
		label: overrides.label || "Pi Code foundation runtime",
		foundation: overrides.foundation || "pi_code",
		primary: overrides.primary ?? true,
		capabilities: base,
	};
}

export function createUnsupportedRuntimeFoundationContract(
	id = "unsupported-runtime",
	label = "Unsupported runtime",
): CodewikiRuntimeFoundationContract {
	const pi = createPiCodeRuntimeFoundationContract();
	const capabilities = Object.fromEntries(
		CODEWIKI_RUNTIME_CAPABILITIES.map((name) => [
			name,
			{
				...pi.capabilities[name],
				owner: "future_runtime" as const,
				support: "unsupported" as const,
				summary: `Runtime ${label} does not advertise required capability ${name}.`,
				evidence: [`${id}:${name}:unsupported`],
				limitations: [
					"Future runtimes must satisfy the CodeWiki capability contract before operating CodeWiki jobs.",
				],
			},
		]),
	) as Record<CodewikiRuntimeCapabilityName, CodewikiRuntimeCapabilityContract>;
	return {
		id,
		label,
		foundation: "future_runtime",
		primary: false,
		capabilities,
	};
}

export function requireRuntimeCapability(
	foundation: CodewikiRuntimeFoundationContract | undefined,
	name: CodewikiRuntimeCapabilityName,
): CodewikiRuntimeCapabilityCheck {
	const resolved = foundation ?? createPiCodeRuntimeFoundationContract();
	const advertised = resolved.capabilities[name];
	const capability = advertised ?? {
		name,
		owner: "future_runtime" as const,
		support: "unsupported" as const,
		summary: `Runtime ${resolved.label} does not advertise required capability ${name}.`,
		evidence: [`${resolved.id}:${name}:missing`],
		limitations: [
			"Missing capability contracts fail closed for CodeWiki runtime execution.",
		],
	};
	if (capability.support === "supported") {
		return {
			ok: true,
			status: "supported",
			capability,
			summary: capability.summary,
			evidence: capability.evidence,
		};
	}
	return {
		ok: false,
		status: "platform_limited",
		capability,
		summary: `${resolved.label} cannot satisfy ${name}: ${capability.summary}`,
		evidence: [
			`${resolved.id}:${name}:${capability.support}`,
			...capability.evidence,
			...(capability.limitations ?? []),
		],
	};
}
