import {realpathSync} from "node:fs";
import {
	authorityBindingSchema,
	type AuthorityBinding,
} from "../change-trace/contracts.ts";
import type {GitCommandRunner} from "../change-trace/git-command.ts";
import type {ReplayAdmissionPolicy} from "../change-trace/reducer.ts";
import type {ProjectWorkState} from "../change-trace/state.ts";
import type {
	ProjectAuthoritySnapshot,
	TeamSnapshot,
} from "../change-trace/synchronization.ts";
import {
	DECISION_ATTENTION_SELECTION_PROTOCOL,
	DecisionAttentionSelectionError,
	type AuthenticatedDecisionSelectionAuthority,
	type DecisionAttentionSelectionAuthorizationRequest,
} from "../changes/triage/selection.ts";
import {createDecisionExitRuntime} from "../decision/exit/runtime.ts";
import type {ProtectedCustomCheckConfigSnapshot} from "../loop-exit/custom-checks/configuration.ts";
import {loadProtectedCustomCheckConfigSnapshot} from "../loop-exit/custom-checks/project-config-store.ts";
import {createDecisionGitAdmission} from "../runtime/decision-git-admission.ts";
import {
	DECISION_CANDIDATE_PRODUCTION_PROTOCOL,
	createNativeDecisionAttemptExecutor,
	type NativeDecisionAttemptExecutorOptions,
} from "../runtime/native-decision-executor.ts";
import type {
	ProjectCoordinatorDecisionAttentionCaller,
	ProjectCoordinatorDecisionStartOptions,
} from "../runtime/project-coordinator-service.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import {assertTypeboxSchema} from "../utils/json.ts";
import {
	createPiSdkNativeDecisionCandidateProducer,
	type PiSdkRuntimeSemanticAdapterOptions,
} from "./sdk-semantic-session.ts";

export const PI_NATIVE_DECISION_HOST_PROTOCOL = Object.freeze({
	id: "codewiki.pi-native-decision-host",
	version: "1.0.0",
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
	readonly currentProject: () =>
		| ProjectAuthoritySnapshot
		| Promise<ProjectAuthoritySnapshot>;
	readonly replayPolicy: ReplayAdmissionPolicy;
	readonly runtimeAuthorityBinding: AuthorityBinding;
	readonly semanticSession?: Omit<PiSdkRuntimeSemanticAdapterOptions, "repoRoot">;
	readonly authorizeSelection?: (
		request: DecisionAttentionSelectionAuthorizationRequest,
	) => boolean | Promise<boolean>;
	readonly createExitRuntime?: (input: {
		readonly state: ProjectWorkState;
		readonly teamSnapshot: TeamSnapshot;
		readonly protectedConfig: ProtectedCustomCheckConfigSnapshot;
		readonly signal: AbortSignal;
	}) =>
		| ReturnType<typeof createDecisionExitRuntime>
		| Promise<ReturnType<typeof createDecisionExitRuntime>>;
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
		async createExitRuntime(input) {
			const protectedConfig = await loadProtectedCustomCheckConfigSnapshot({
				repoRoot,
				protectedSourceHead: input.teamSnapshot.protectedSourceHead,
				runner: options.runner,
				signal: input.signal,
			});
			if (
				protectedConfig.projectConfigDigest !== input.teamSnapshot.configDigest
			) {
				throw new Error(
					"Pi native Decision Exit Runtime config does not match the current team snapshot.",
				);
			}
			const runtime = options.createExitRuntime
				? await options.createExitRuntime({...input, protectedConfig})
				: createDecisionExitRuntime({
						protectedBaseCustomCheckConfig: protectedConfig,
					});
			return {
				protectedSourceHead: protectedConfig.protectedSourceHead,
				projectConfigDigest: protectedConfig.projectConfigDigest,
				runtime,
			};
		},
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
		async authorize(request: DecisionAttentionSelectionAuthorizationRequest) {
			if (!isPiDecisionSelectionAuthority(request.authority)) return false;
			return options.authorizeSelection
				? options.authorizeSelection(request)
				: true;
		},
		appendAttempt: admission.appendAttempt,
		executor,
	});
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
	const principalDigest = canonicalJsonDigest({
		protocol: PI_NATIVE_DECISION_HOST_PROTOCOL,
		clientKind: caller.clientKind,
		clientId: caller.clientId,
	});
	const authenticationDigest = canonicalJsonDigest({
		protocol: PI_NATIVE_DECISION_HOST_PROTOCOL,
		principalDigest,
		connectionId: caller.connectionId,
		generationId: caller.generationId,
	});
	return Object.freeze({
		actorId: `pi-decision-selector:${digestHex(principalDigest)}`,
		principalRef: `principal:pi:${digestHex(principalDigest)}`,
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
		authority.principalRef.startsWith("principal:pi:") &&
		authority.authenticationEvidenceId.startsWith("pi-coordinator-auth:")
	);
}

function digestHex(value: Sha256Digest): string {
	return value.slice("sha256:".length);
}
