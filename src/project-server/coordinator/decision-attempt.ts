import {
	changeRevisionSchema,
	type AuthorityBinding,
	type ChangeRevision,
	type OperationId,
} from "../../changes/trace/contracts.ts";
import type {GitCommandRunner} from "../../changes/trace/git-command.ts";
import type {ReplayAdmissionPolicy} from "../../changes/trace/reducer.ts";
import {
	changeById,
	type ChangeWorkState,
	type LoopAttemptProjection,
	type ProjectWorkState,
} from "../../changes/trace/state.ts";
import {
	createCurrentGitSynchronizer,
	type ProjectAuthoritySnapshot,
	type TeamSnapshot,
} from "../../changes/trace/synchronization.ts";
import {
	assertDecisionActivePortfolioBinding,
	bindDecisionActivePortfolio,
	type DecisionActivePortfolioBinding,
} from "../../loops/decision/active-change-portfolio.ts";
import type {DecisionCandidateProposal} from "../../loops/decision/candidate-proposal.ts";
import {
	assertProducerSkillReceipt,
	bindProducerSkills,
	type ProducerSkillBinding,
} from "../../runtime/contracts.ts";
import {parseDecisionCandidateProposal} from "../../loops/decision/candidate-proposal.ts";
import {
	createDecisionCandidate,
	type DecisionCandidate,
} from "../../loops/decision/candidate.ts";
import type {createDecisionGate} from "../lifecycle/gates.ts";
import type {EvidenceRecord} from "../../evidence/contracts.ts";
import type {ProjectCoordinatorRecovery} from "./project.ts";
import type {DecisionAttemptExecutor} from "../admission/start.ts";
import {
	commitNativeDecisionOperationSequence,
	type NativeDecisionCommitReceipt,
} from "../effects/gate-operations.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertTypeboxSchema} from "../../utils/json.ts";

export const DECISION_CANDIDATE_PRODUCTION_PROTOCOL = Object.freeze({
	id: "codewiki.decision-candidate-production",
	version: "2.0.0",
} as const);

export interface NativeDecisionCandidateProductionRequest {
	readonly protocolId: typeof DECISION_CANDIDATE_PRODUCTION_PROTOCOL.id;
	readonly protocolVersion: typeof DECISION_CANDIDATE_PRODUCTION_PROTOCOL.version;
	readonly attemptOperationId: OperationId;
	readonly changeId: string;
	readonly changeRevisionId: Sha256Digest;
	readonly workStateDigest: Sha256Digest;
	readonly revision: ChangeRevision;
	readonly relationships: ChangeWorkState["relationships"];
	readonly activePortfolio: DecisionActivePortfolioBinding;
}

export function assertNativeDecisionCandidateProductionRequest(
	value: unknown,
): asserts value is NativeDecisionCandidateProductionRequest {
	assertOnlyKeys({
		value,
		allowed: [
			"protocolId",
			"protocolVersion",
			"attemptOperationId",
			"changeId",
			"changeRevisionId",
			"workStateDigest",
			"revision",
			"relationships",
			"activePortfolio",
		],
		label: "Native Decision candidate production request",
	});
	const request = value as NativeDecisionCandidateProductionRequest;
	if (
		request.protocolId !== DECISION_CANDIDATE_PRODUCTION_PROTOCOL.id ||
		request.protocolVersion !== DECISION_CANDIDATE_PRODUCTION_PROTOCOL.version
	) {
		throw new Error("Native Decision candidate production protocol is invalid.");
	}
	assertSha256Digest(request.attemptOperationId, "attemptOperationId");
	assertSha256Digest(request.changeRevisionId, "changeRevisionId");
	assertSha256Digest(request.workStateDigest, "workStateDigest");
	if (
		typeof request.changeId !== "string" ||
		!request.changeId.trim() ||
		request.changeId.length > 132
	) {
		throw new Error("Native Decision candidate production changeId is invalid.");
	}
	assertTypeboxSchema(
		changeRevisionSchema,
		request.revision,
		"Native Decision candidate production revision",
	);
	if (
		request.revision.revisionId !== request.changeRevisionId ||
		canonicalJsonDigest(request.revision.content) !== request.revision.revisionId
	) {
		throw new Error(
			"Native Decision candidate production revision identity is invalid.",
		);
	}
	if (!Array.isArray(request.relationships)) {
		throw new Error(
			"Native Decision candidate production relationships must be an array.",
		);
	}
	for (const relationship of request.relationships) {
		assertProductionRelationship(relationship);
	}
	assertDecisionActivePortfolioBinding(request.activePortfolio);
}

export interface NativeDecisionCandidateProducer {
	produce(input: {
		readonly request: NativeDecisionCandidateProductionRequest;
		readonly producerSkills: ProducerSkillBinding;
		readonly signal: AbortSignal;
	}): DecisionCandidateProposal | Promise<DecisionCandidateProposal>;
}

export interface NativeDecisionEvaluationInput {
	readonly evidenceRecords?: readonly EvidenceRecord[];
}

export interface NativeDecisionGateBinding {
	readonly protectedSourceHead: string;
	readonly projectConfigDigest: Sha256Digest;
	readonly producerSkills: ProducerSkillBinding;
	readonly decisionGate: ReturnType<typeof createDecisionGate>;
}

export interface NativeDecisionAttemptResult {
	readonly attemptOperationId: OperationId;
	readonly changeId: string;
	readonly changeRevisionId: Sha256Digest;
	readonly status: "passed" | "failed" | "stopped";
	readonly candidateId: string | null;
	readonly gateReportOperationId: OperationId | null;
	readonly transitionOperationId: OperationId | null;
	readonly terminalOperationId: OperationId | null;
	readonly stateHead: string;
}

export interface NativeDecisionAttemptExecutorOptions {
	readonly repoRoot: string;
	readonly remote: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly currentProject: () =>
		| ProjectAuthoritySnapshot
		| Promise<ProjectAuthoritySnapshot>;
	readonly replayPolicy: ReplayAdmissionPolicy;
	readonly authorityBinding: AuthorityBinding;
	readonly producer: NativeDecisionCandidateProducer;
	readonly createDecisionGate: (input: {
		readonly state: ProjectWorkState;
		readonly teamSnapshot: TeamSnapshot;
		readonly signal: AbortSignal;
	}) =>
		| NativeDecisionGateBinding
		| Promise<NativeDecisionGateBinding>;
	readonly loadEvaluationInput?: (input: {
		readonly candidate: DecisionCandidate;
		readonly state: ProjectWorkState;
		readonly teamSnapshot: TeamSnapshot;
		readonly signal: AbortSignal;
	}) => NativeDecisionEvaluationInput | Promise<NativeDecisionEvaluationInput>;
	readonly now?: () => string;
	readonly runner?: GitCommandRunner;
	readonly materializationRoot?: string;
}

type NativeDecisionAttemptRunInput = Parameters<
	DecisionAttemptExecutor<NativeDecisionAttemptResult>["run"]
>[0];

type NativeDecisionAttemptRecoveryInput = Parameters<
	DecisionAttemptExecutor<NativeDecisionAttemptResult>["recover"]
>[0];

interface CurrentAttempt {
	readonly state: ProjectWorkState;
	readonly teamSnapshot: TeamSnapshot;
	readonly change: ChangeWorkState;
	readonly attempt: LoopAttemptProjection;
}

export function createNativeDecisionAttemptExecutor(
	options: NativeDecisionAttemptExecutorOptions,
): DecisionAttemptExecutor<NativeDecisionAttemptResult> {
	return Object.freeze({
		async run(
			input: NativeDecisionAttemptRunInput,
		): Promise<NativeDecisionAttemptResult> {
			input.signal.throwIfAborted();
			const current = await loadCurrentAttempt({options, input});
			if (current.attempt.status !== "active") {
				return attemptResult(current);
			}
			const gateBinding = await boundDecisionGate({
				options,
				current,
				signal: input.signal,
			});
			const request = candidateProductionRequest({
				current,
				attemptOperationId: input.attemptOperationId,
			});
			const proposal = parseDecisionCandidateProposal(
				await options.producer.produce({
					request,
					producerSkills: gateBinding.producerSkills,
					signal: input.signal,
				}),
			);
			input.signal.throwIfAborted();
			const candidate = createDecisionCandidate({
				state: current.state,
				changeId: input.changeId,
				proposal,
			});
			const evaluationInput = normalizeEvaluationInput(
				(await options.loadEvaluationInput?.({
					candidate,
					state: current.state,
					teamSnapshot: current.teamSnapshot,
					signal: input.signal,
				})) ?? {},
			);
			const gateRun = await gateBinding.decisionGate.run({
				candidate,
				changeRef: `change:${input.changeId}`,
				evidenceRecords: evaluationInput.evidenceRecords,
				signal: input.signal,
			});
			input.signal.throwIfAborted();
			const evidenceRecords = [
				...evaluationInput.evidenceRecords,
				...gateRun.collectedEvidenceRecords,
			];
			const receipt = await commitNativeDecisionOperationSequence({
				repoRoot: options.repoRoot,
				remote: options.remote,
				repositoryIdentity: options.repositoryIdentity,
				currentProject: options.currentProject,
				replayPolicy: options.replayPolicy,
				authorityBinding: options.authorityBinding,
				changeId: input.changeId,
				attemptOperationId: input.attemptOperationId,
				expectedTeamSnapshotDigest: current.teamSnapshot.snapshotDigest,
				expectedWorkStateDigest: current.state.workStateDigest,
				expectedActivePortfolioDigest: candidate.content.activePortfolio.digest,
				recordedAt: (options.now ?? (() => new Date().toISOString()))(),
				candidate,
				packSnapshot: gateRun.packSnapshot,
				evidenceRecords,
				report: gateRun.report,
				transition: gateRun.transition,
				runner: options.runner,
				materializationRoot: options.materializationRoot,
				signal: input.signal,
			});
			return committedAttemptResult({receipt, changeId: input.changeId});
		},
		async recover(
			input: NativeDecisionAttemptRecoveryInput,
		): Promise<
			ProjectCoordinatorRecovery<NativeDecisionAttemptResult> | undefined
		> {
			const current = await loadCurrentAttempt({options, input});
			return current.attempt.status === "active"
				? undefined
				: {status: "completed", result: attemptResult(current)};
		},
	});
}

async function boundDecisionGate(input: {
	readonly options: NativeDecisionAttemptExecutorOptions;
	readonly current: CurrentAttempt;
	readonly signal: AbortSignal;
}): Promise<NativeDecisionGateBinding> {
	const binding = await input.options.createDecisionGate({
		state: input.current.state,
		teamSnapshot: input.current.teamSnapshot,
		signal: input.signal,
	});
	assertOnlyKeys({
		value: binding,
		allowed: [
			"protectedSourceHead",
			"projectConfigDigest",
			"producerSkills",
			"decisionGate",
		],
		label: "Native Decision Gate binding",
	});
	const expectedSkills = bindProducerSkills(
		binding.producerSkills.snapshot,
		"decision",
	);
	assertProducerSkillReceipt(
		binding.producerSkills.receipt,
		expectedSkills.receipt,
	);
	if (
		binding.protectedSourceHead !== input.current.teamSnapshot.protectedSourceHead ||
		binding.projectConfigDigest !== input.current.teamSnapshot.configDigest ||
		typeof binding.decisionGate?.run !== "function"
	) {
		throw new Error(
			"Native Decision Gate is not bound to the current protected project snapshot.",
		);
	}
	return {...binding, producerSkills: expectedSkills};
}

function candidateProductionRequest(input: {
	readonly current: CurrentAttempt;
	readonly attemptOperationId: OperationId;
}): NativeDecisionCandidateProductionRequest {
	const revision = input.current.change.currentRevision;
	if (!revision) {
		throw new Error("Native Decision candidate production requires a current revision.");
	}
	const request = toCanonicalJsonValue({
		protocolId: DECISION_CANDIDATE_PRODUCTION_PROTOCOL.id,
		protocolVersion: DECISION_CANDIDATE_PRODUCTION_PROTOCOL.version,
		attemptOperationId: input.attemptOperationId,
		changeId: input.current.change.changeId,
		changeRevisionId: revision.revisionId,
		workStateDigest: input.current.state.workStateDigest,
		revision,
		relationships: input.current.change.relationships,
		activePortfolio: bindDecisionActivePortfolio({
			state: input.current.state,
			subjectChangeId: input.current.change.changeId,
		}),
	});
	assertNativeDecisionCandidateProductionRequest(request);
	return request;
}

async function loadCurrentAttempt(input: {
	readonly options: NativeDecisionAttemptExecutorOptions;
	readonly input: {
		readonly attemptOperationId: OperationId;
		readonly changeId: string;
		readonly changeRevisionId: Sha256Digest;
		readonly signal?: AbortSignal;
	};
}): Promise<CurrentAttempt> {
	const synchronize = createCurrentGitSynchronizer({
		repoRoot: input.options.repoRoot,
		remote: input.options.remote,
		repositoryIdentity: input.options.repositoryIdentity,
		currentProject: input.options.currentProject,
		policy: input.options.replayPolicy,
		runner: input.options.runner,
		materializationRoot: input.options.materializationRoot,
		signal: input.input.signal,
	});
	const {observation} = await synchronize();
	if (
		observation.status !== "fresh" ||
		!observation.workState ||
		!observation.teamSnapshot
	) {
		throw new Error(
			`Native Decision execution requires fresh synchronization; current status is ${observation.status}.`,
		);
	}
	const change = changeById(observation.workState, input.input.changeId);
	const attempt = change?.loopAttempts.find(
		(entry) => entry.operationId === input.input.attemptOperationId,
	);
	const attemptOperation = change?.operations.find(
		(operation) => operation.operationId === input.input.attemptOperationId,
	);
	if (
		!change?.currentRevision ||
		change.withdrawn ||
		change.currentRevision.revisionId !== input.input.changeRevisionId ||
		!attempt ||
		attempt.loop !== "decision" ||
		attempt.changeRevisionId !== input.input.changeRevisionId ||
		!attempt.privateAttemptDigest ||
		attemptOperation?.body.kind !== "loop.attempt_started" ||
		!attemptOperation.body.authorityBinding.authenticationEvidenceId
	) {
		throw new Error(
			"Native Decision execution requires the exact authenticated current Decision attempt.",
		);
	}
	return {
		state: observation.workState,
		teamSnapshot: observation.teamSnapshot,
		change,
		attempt,
	};
}

function normalizeEvaluationInput(
	value: NativeDecisionEvaluationInput,
): Required<NativeDecisionEvaluationInput> {
	assertOnlyKeys({
		value,
		allowed: ["evidenceRecords"],
		label: "Native Decision evaluation input",
	});
	return Object.freeze({
		evidenceRecords: Object.freeze([...(value.evidenceRecords ?? [])]),
	});
}

function assertProductionRelationship(value: unknown): void {
	assertOnlyKeys({
		value,
		allowed: [
			"operationId",
			"relationshipId",
			"type",
			"sourceRevisionId",
			"targetChangeId",
			"targetRevisionId",
			"supersededByOperationId",
		],
		label: "Native Decision candidate production relationship",
	});
	const relationship = value as Record<string, unknown>;
	for (const field of [
		"operationId",
		"relationshipId",
		"sourceRevisionId",
		"targetRevisionId",
	] as const) {
		assertSha256Digest(relationship[field], `relationship.${field}`);
	}
	if (
		typeof relationship.type !== "string" ||
		!relationship.type.trim() ||
		relationship.type.length > 128 ||
		typeof relationship.targetChangeId !== "string" ||
		!relationship.targetChangeId.trim() ||
		relationship.targetChangeId.length > 132
	) {
		throw new Error(
			"Native Decision candidate production relationship identity is invalid.",
		);
	}
	if (relationship.supersededByOperationId !== null) {
		assertSha256Digest(
			relationship.supersededByOperationId,
			"relationship.supersededByOperationId",
		);
	}
}

function committedAttemptResult(input: {
	readonly receipt: NativeDecisionCommitReceipt;
	readonly changeId: string;
}): NativeDecisionAttemptResult {
	const {receipt, changeId} = input;
	const {workState, teamSnapshot} = receipt.observation;
	if (!workState || !teamSnapshot) {
		throw new Error("Committed native Decision synchronization is incomplete.");
	}
	const change = changeById(workState, changeId);
	const attempt = change?.loopAttempts.find(
		(entry) => entry.operationId === receipt.attemptOperationId,
	);
	if (!change || !attempt || attempt.status === "active") {
		throw new Error("Committed native Decision attempt could not be projected.");
	}
	return attemptResult({
		state: workState,
		teamSnapshot,
		change,
		attempt,
	});
}

function attemptResult(current: CurrentAttempt): NativeDecisionAttemptResult {
	if (current.attempt.status === "active" || !current.state.stateHead) {
		throw new Error("Native Decision attempt is not durably complete.");
	}
	return Object.freeze({
		attemptOperationId: current.attempt.operationId,
		changeId: current.change.changeId,
		changeRevisionId: current.attempt.changeRevisionId,
		status:
			current.attempt.status === "passed" || current.attempt.status === "failed"
				? current.attempt.status
				: "stopped",
		candidateId: current.attempt.currentCandidateId,
		gateReportOperationId: current.attempt.exitReportOperationId,
		transitionOperationId: current.attempt.routeOperationId,
		terminalOperationId: current.attempt.terminalOperationId,
		stateHead: current.state.stateHead,
	});
}

function assertOnlyKeys(input: {
	readonly value: unknown;
	readonly allowed: readonly string[];
	readonly label: string;
}): void {
	if (!input.value || typeof input.value !== "object" || Array.isArray(input.value)) {
		throw new Error(`${input.label} must be an object.`);
	}
	const extras = Object.keys(input.value).filter(
		(key) => !input.allowed.includes(key),
	);
	if (extras.length > 0) {
		throw new Error(
			`${input.label} received unsupported fields: ${extras.sort(compareText).join(", ")}.`,
		);
	}
}

function compareText(...values: [string, string]): number {
	return values[0].localeCompare(values[1]);
}
