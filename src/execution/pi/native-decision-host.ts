import {realpathSync} from "node:fs";
import {
	authorityBindingSchema,
	type AuthorityBinding,
} from "../../changes/trace/contracts.ts";
import type {GitCommandRunner} from "../../changes/trace/git-command.ts";
import type {ReplayAdmissionPolicy} from "../../changes/trace/reducer.ts";
import {
	DECISION_ATTENTION_SELECTION_PROTOCOL,
	DecisionAttentionSelectionError,
	type AuthenticatedDecisionSelectionAuthority,
	type DecisionAttentionSelectionAuthorizationRequest,
} from "../../changes/triage/selection.ts";
import {createDecisionLoopExit} from "../../runtime/loop-exit/decision.ts";
import type {ProtectedCustomCheckConfigSnapshot} from "../../verification/custom-checks/configuration.ts";
import {
	loadProtectedCustomCheckConfigSnapshot,
	loadProtectedProjectCheckPacks,
	type ProjectCheckPackSnapshot,
} from "../../verification/custom-checks/project-config-store.ts";
import {createDecisionGitAdmission} from "../../runtime/admission/git.ts";
import {
	DECISION_CANDIDATE_PRODUCTION_PROTOCOL,
	createNativeDecisionAttemptExecutor,
	type NativeDecisionAttemptExecutorOptions,
} from "../../runtime/coordinator/decision-attempt.ts";
import type {
	ProjectCoordinatorDecisionAttentionCaller,
	ProjectCoordinatorDecisionStartOptions,
} from "../../runtime/coordinator/service.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertTypeboxSchema} from "../../utils/json.ts";
import {
	createPiNativeDecisionResearchRuntimeConfig,
	type PiNativeDecisionResearchOptions,
} from "./native-decision-research.ts";
export type {PiNativeDecisionResearchOptions} from "./native-decision-research.ts";
import {
	createPiSdkNativeDecisionCandidateProducer,
	type PiSdkRuntimeSemanticAdapterOptions,
} from "./sdk-semantic-session.ts";

export const PI_NATIVE_DECISION_HOST_PROTOCOL = Object.freeze({
	id: "codewiki.pi-native-decision-host",
	version: "2.0.0",
} as const);

const PI_DECISION_SELECTION_ACTOR_POLICY_DIGEST = canonicalJsonDigest({
	protocol: PI_NATIVE_DECISION_HOST_PROTOCOL,
	action: "decision:start",
	callerKind: "pi",
	supervision: "approved",
});

const PI_DECISION_RUNTIME_PROTOCOL_DIGEST = canonicalJsonDigest({
	host: PI_NATIVE_DECISION_HOST_PROTOCOL,
	selection: DECISION_ATTENTION_SELECTION_PROTOCOL,
	candidateProduction: DECISION_CANDIDATE_PRODUCTION_PROTOCOL,
});

export interface PiNativeDecisionHostOptions {
	readonly repoRoot: string;
	readonly remote: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly currentProject: NativeDecisionAttemptExecutorOptions["currentProject"];
	readonly replayPolicy: ReplayAdmissionPolicy;
	readonly runtimeAuthorityBinding: AuthorityBinding;
	readonly semanticSession?: Omit<PiSdkRuntimeSemanticAdapterOptions, "repoRoot">;
	readonly decisionResearch?: PiNativeDecisionResearchOptions;
	readonly authorizeSelection?: (
		request: DecisionAttentionSelectionAuthorizationRequest,
	) => boolean | Promise<boolean>;
	readonly createLoopExit?: (
		input: Parameters<NativeDecisionAttemptExecutorOptions["createLoopExit"]>[0] & {
			readonly protectedConfig: ProtectedCustomCheckConfigSnapshot;
			readonly projectCheckPackSnapshot: ProjectCheckPackSnapshot;
		},
	) =>
		| ReturnType<typeof createDecisionLoopExit>
		| Promise<ReturnType<typeof createDecisionLoopExit>>;
	readonly loadEvaluationInput?: NativeDecisionAttemptExecutorOptions["loadEvaluationInput"];
	readonly runner?: GitCommandRunner;
	readonly materializationRoot?: string;
	readonly now?: () => string;
	readonly projectionNow?: () => Date;
	readonly projectionTtlMs?: number;
}

export function createPiNativeDecisionStartOptions(
	options: PiNativeDecisionHostOptions,
): ProjectCoordinatorDecisionStartOptions {
	const repoRoot = realpathSync(options.repoRoot);
	if (options.createLoopExit && options.decisionResearch) {
		throw new Error(
			"Pi native Decision host accepts either createLoopExit or decisionResearch, not both.",
		);
	}
	assertTypeboxSchema(
		authorityBindingSchema,
		options.runtimeAuthorityBinding,
		"Pi native Decision Runtime authority",
	);
	const runtimeAuthorityBinding = toCanonicalJsonValue(
		options.runtimeAuthorityBinding,
	) as unknown as AuthorityBinding;
	const admission = createDecisionGitAdmission({
		repoRoot,
		remote: options.remote,
		repositoryIdentity: options.repositoryIdentity,
		currentProject: options.currentProject,
		replayPolicy: options.replayPolicy,
		runner: options.runner,
		materializationRoot: options.materializationRoot,
		now: options.projectionNow,
		projectionTtlMs: options.projectionTtlMs,
	});
	const producer = createPiSdkNativeDecisionCandidateProducer({
		...options.semanticSession,
		repoRoot,
	});
	const executor = createNativeDecisionAttemptExecutor({
		repoRoot,
		remote: options.remote,
		repositoryIdentity: options.repositoryIdentity,
		currentProject: options.currentProject,
		replayPolicy: options.replayPolicy,
		authorityBinding: runtimeAuthorityBinding,
		producer,
		createLoopExit: (input) =>
			loadPiNativeDecisionLoopExit({repoRoot, options, input}),
		...(options.loadEvaluationInput
			? {loadEvaluationInput: options.loadEvaluationInput}
			: {}),
		...(options.now ? {now: options.now} : {}),
		...(options.runner ? {runner: options.runner} : {}),
		...(options.materializationRoot
			? {materializationRoot: options.materializationRoot}
			: {}),
	});
	return Object.freeze({
		resolveAuthority: resolvePiDecisionSelectionAuthority,
		loadCurrentContext: admission.loadCurrentContext,
		authorize(request: DecisionAttentionSelectionAuthorizationRequest) {
			if (!isPiDecisionSelectionAuthority(request.authority)) return false;
			return options.authorizeSelection
				? options.authorizeSelection(request)
				: true;
		},
		appendAttempt: admission.appendAttempt,
		executor,
	});
}

async function loadPiNativeDecisionLoopExit(input: {
	readonly repoRoot: string;
	readonly options: PiNativeDecisionHostOptions;
	readonly input: Parameters<
		NativeDecisionAttemptExecutorOptions["createLoopExit"]
	>[0];
}) {
	const [protectedConfig, projectCheckPackSnapshot] = await Promise.all([
		loadProtectedCustomCheckConfigSnapshot({
			repoRoot: input.repoRoot,
			protectedSourceHead: input.input.teamSnapshot.protectedSourceHead,
			runner: input.options.runner,
			signal: input.input.signal,
		}),
		loadProtectedProjectCheckPacks({
			repoRoot: input.repoRoot,
			protectedSourceHead: input.input.teamSnapshot.protectedSourceHead,
			runner: input.options.runner,
			signal: input.input.signal,
		}),
	]);
	if (
		protectedConfig.projectConfigDigest !== input.input.teamSnapshot.configDigest
	) {
		throw new Error(
			"Pi native Decision Loop Exit config does not match the current team snapshot.",
		);
	}
	let loopExit: ReturnType<typeof createDecisionLoopExit>;
	if (input.options.createLoopExit) {
		loopExit = await input.options.createLoopExit({
			...input.input,
			protectedConfig,
			projectCheckPackSnapshot,
		});
	} else {
		const researchChecks = input.options.decisionResearch
			? createPiNativeDecisionResearchRuntimeConfig({
					repoRoot: input.repoRoot,
					research: input.options.decisionResearch,
					semanticSession: input.options.semanticSession,
					now: input.options.now,
				})
			: undefined;
		loopExit = createDecisionLoopExit({
			protectedBaseCustomCheckConfig: protectedConfig,
			projectCheckPackSnapshot,
			...(researchChecks ? {researchChecks} : {}),
		});
	}
	return {
		protectedSourceHead: protectedConfig.protectedSourceHead,
		projectConfigDigest: protectedConfig.projectConfigDigest,
		loopExit,
	};
}

export function resolvePiDecisionSelectionAuthority(
	caller: ProjectCoordinatorDecisionAttentionCaller,
): AuthenticatedDecisionSelectionAuthority {
	if (caller.clientKind !== "pi" || caller.supervision !== "approved") {
		throw new DecisionAttentionSelectionError({
			code: "forbidden",
			message:
				"Decision attention selection requires an approved Pi coordinator connection.",
		});
	}
	const actorIdentityDigest = canonicalJsonDigest({
		protocol: PI_NATIVE_DECISION_HOST_PROTOCOL,
		clientKind: caller.clientKind,
		clientId: caller.clientId,
	});
	const authenticationDigest = canonicalJsonDigest({
		protocol: PI_NATIVE_DECISION_HOST_PROTOCOL,
		actorIdentityDigest,
		connectionId: caller.connectionId,
		generationId: caller.generationId,
	});
	return Object.freeze({
		actorId: `pi-decision-selector:${digestHex(actorIdentityDigest)}`,
		authenticatedIdentityRef: `identity:pi:${digestHex(actorIdentityDigest)}`,
		role: "decision-selector",
		actorPolicyDigest: PI_DECISION_SELECTION_ACTOR_POLICY_DIGEST,
		authenticationEvidenceId: `pi-coordinator-auth:${digestHex(authenticationDigest)}`,
		runtimeProtocolDigest: PI_DECISION_RUNTIME_PROTOCOL_DIGEST,
	});
}

function isPiDecisionSelectionAuthority(
	authority: AuthenticatedDecisionSelectionAuthority,
): boolean {
	return (
		authority.role === "decision-selector" &&
		authority.actorPolicyDigest === PI_DECISION_SELECTION_ACTOR_POLICY_DIGEST &&
		authority.runtimeProtocolDigest === PI_DECISION_RUNTIME_PROTOCOL_DIGEST &&
		authority.actorId.startsWith("pi-decision-selector:") &&
		authority.authenticatedIdentityRef.startsWith("identity:pi:") &&
		authority.authenticationEvidenceId.startsWith("pi-coordinator-auth:")
	);
}

function digestHex(value: Sha256Digest): string {
	return value.slice("sha256:".length);
}
