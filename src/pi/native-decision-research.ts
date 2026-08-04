import type {DecisionResearchRuntimeConfig} from "../decision/exit/runtime.ts";
import type {WikiModelRouteConfig} from "../project/model-routing.ts";
import type {DecisionResearchCollector} from "../runtime/decision-research-collection.ts";
import type {DecisionResearchClaimsTransport} from "../runtime/native-decision-research.ts";
import {createPiDecisionResearchClaimsTransport} from "./decision-research-claims-session.ts";
import type {PiSdkRuntimeSemanticAdapterOptions} from "./sdk-semantic-session.ts";

export interface PiNativeDecisionResearchOptions {
	readonly route: WikiModelRouteConfig;
	readonly sensitivity: "public" | "project" | "private";
	readonly collector: DecisionResearchCollector;
	readonly claimsTransport?: DecisionResearchClaimsTransport;
}

export function createPiNativeDecisionResearchRuntimeConfig(input: {
	readonly repoRoot: string;
	readonly research: PiNativeDecisionResearchOptions;
	readonly semanticSession:
		| Omit<PiSdkRuntimeSemanticAdapterOptions, "repoRoot">
		| undefined;
	readonly now: (() => string) | undefined;
}): DecisionResearchRuntimeConfig {
	return Object.freeze({
		route: input.research.route,
		sensitivity: input.research.sensitivity,
		collector: input.research.collector,
		transport:
			input.research.claimsTransport ??
			createPiDecisionResearchClaimsTransport({
				repoRoot: input.repoRoot,
				...(input.semanticSession?.piSdk
					? {piSdk: input.semanticSession.piSdk}
					: {}),
				...(input.semanticSession?.agentDir
					? {agentDir: input.semanticSession.agentDir}
					: {}),
				...(input.semanticSession?.modelRuntime
					? {modelRuntime: input.semanticSession.modelRuntime}
					: {}),
				...(input.semanticSession?.createAgentSession
					? {
							createAgentSession:
								input.semanticSession.createAgentSession,
						}
					: {}),
			}),
		...(input.now ? {now: input.now} : {}),
	});
}
