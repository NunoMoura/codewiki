import type {CheckStage} from "../checks/contracts.ts";
import {
	assertPackSkillSetSnapshot,
	type PackSkillSetSnapshot,
} from "../checks/packs/contracts.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../utils/canonical-json.ts";

export const SECURITY_SCANNER_TYPES = Object.freeze([
	"static_analysis",
	"dependency_advisory",
	"secret_detection",
	"infrastructure_configuration",
	"authorization_test",
	"migration_test",
] as const);

export type SecurityScannerType = (typeof SECURITY_SCANNER_TYPES)[number];

export const EXECUTION_CAPABILITY_NAMES = [
	"candidate_production",
	"model_evaluation",
	"worker_execution",
	"cancellation",
	"usage_reporting",
	"structured_output",
	"repository_read",
	"workbench_mutation",
	"session_isolation",
] as const;

export type ExecutionCapabilityName =
	(typeof EXECUTION_CAPABILITY_NAMES)[number];
export type ExecutionCapabilityStatus =
	| "available"
	| "unavailable"
	| "indeterminate";

export interface ExecutionCapabilityDeclaration {
	readonly capability: ExecutionCapabilityName;
	readonly status: ExecutionCapabilityStatus;
	readonly reason?: string;
}

export type ExecutionCapabilityInput = Partial<
	Record<
		ExecutionCapabilityName,
		ExecutionCapabilityStatus | ExecutionCapabilityDeclaration
	>
>;

export const PRODUCER_SKILL_RECEIPT_SCHEMA_VERSION = "1.0.0" as const;

export interface ProducerSkillReceiptEntry {
	readonly packId: string;
	readonly name: string;
	readonly skillDigest: Sha256Digest;
}

export interface ProducerSkillReceipt {
	readonly schemaVersion: typeof PRODUCER_SKILL_RECEIPT_SCHEMA_VERSION;
	readonly stage: CheckStage;
	readonly skillSetDigest: Sha256Digest;
	readonly skills: readonly ProducerSkillReceiptEntry[];
}

export interface ProducerSkillBinding {
	readonly snapshot: PackSkillSetSnapshot;
	readonly receipt: ProducerSkillReceipt;
}

export type StageSkillSnapshotPort = (input: {
	readonly stage: CheckStage;
	readonly signal?: AbortSignal;
}) => PackSkillSetSnapshot | Promise<PackSkillSetSnapshot>;

export interface ExecutionInvocationOptions {
	readonly signal?: AbortSignal;
	readonly producerSkills?: ProducerSkillBinding;
}

export function bindProducerSkills(
	snapshot: PackSkillSetSnapshot,
	expectedStage?: CheckStage,
): ProducerSkillBinding {
	assertPackSkillSetSnapshot(snapshot, expectedStage);
	const receipt = Object.freeze({
		schemaVersion: PRODUCER_SKILL_RECEIPT_SCHEMA_VERSION,
		stage: snapshot.stage,
		skillSetDigest: snapshot.skillSetDigest,
		skills: Object.freeze(
			snapshot.skills.map((skill) =>
				Object.freeze({
					packId: skill.packId,
					name: skill.name,
					skillDigest: skill.skillDigest,
				}),
			),
		),
	});
	return Object.freeze({snapshot, receipt});
}

export function assertProducerSkillReceipt(
	receipt: ProducerSkillReceipt,
	expected?: ProducerSkillReceipt,
): void {
	if (
		!receipt ||
		typeof receipt !== "object" ||
		!hasExactKeys(receipt, [
			"schemaVersion",
			"stage",
			"skillSetDigest",
			"skills",
		])
	) {
		throw new Error("Producer Skill receipt shape is invalid.");
	}
	if (receipt.schemaVersion !== PRODUCER_SKILL_RECEIPT_SCHEMA_VERSION) {
		throw new Error("Producer Skill receipt schemaVersion is invalid.");
	}
	if (
		!(["decision", "planning", "implementation", "review"] as const).includes(
			receipt.stage,
		) ||
		!Array.isArray(receipt.skills) ||
		receipt.skills.length > 64
	) {
		throw new Error("Producer Skill receipt stage or Skills are invalid.");
	}
	assertSha256Digest(receipt.skillSetDigest, "Producer Skill set digest");
	let previousPackId: string | undefined;
	const names = new Set<string>();
	for (const skill of receipt.skills) {
		if (
			!skill ||
			typeof skill !== "object" ||
			!hasExactKeys(skill, ["packId", "name", "skillDigest"]) ||
			typeof skill.packId !== "string" ||
			!skill.packId ||
			typeof skill.name !== "string" ||
			!skill.name
		) {
			throw new Error("Producer Skill receipt identity is invalid.");
		}
		if (
			(previousPackId !== undefined && skill.packId <= previousPackId) ||
			names.has(skill.name)
		) {
			throw new Error("Producer Skill receipt order or uniqueness is invalid.");
		}
		previousPackId = skill.packId;
		names.add(skill.name);
		assertSha256Digest(skill.skillDigest, "Producer Skill digest");
	}
	if (
		expected &&
		canonicalJsonDigest(receipt) !== canonicalJsonDigest(expected)
	) {
		throw new Error("Producer Skill receipt does not match its execution binding.");
	}
}

export interface TimedExecutionInvocationOptions {
	readonly signal: AbortSignal;
	readonly timeoutMs: number;
}

export type CandidateProducerPort<TInvocation, TCandidate> = (
	invocation: TInvocation,
	options?: ExecutionInvocationOptions,
) => TCandidate | Promise<TCandidate>;

export interface ModelCheckEvaluatorPort<TRequest, TObservation> {
	execute(
		request: TRequest,
		options: TimedExecutionInvocationOptions,
	): Promise<TObservation>;
}

export interface WorkerExecutionPort<TAssignment, TReport, TAvailability> {
	availability?(): Promise<TAvailability>;
	execute(assignment: TAssignment, signal: AbortSignal): Promise<TReport>;
	recover(assignment: TAssignment): Promise<TReport | undefined>;
}

export interface CancellationPort {
	cancel(reason?: string): void | Promise<void>;
}

export interface UsageReportingPort<TUsage> {
	usage(): TUsage | undefined | Promise<TUsage | undefined>;
}

export interface StructuredOutputPort<TOutput> {
	readStructuredOutput(): TOutput | Promise<TOutput>;
}

export type RepositoryReadPort<TRequest, TResult> = (
	request: TRequest,
	options?: ExecutionInvocationOptions,
) => TResult | Promise<TResult>;

export type WorkbenchMutationPort<TRequest, TResult> = (
	request: TRequest,
	options: { readonly signal: AbortSignal },
) => TResult | Promise<TResult>;

export type SessionIsolationKind =
	| "fresh_no_shared_state"
	| "project_scoped_process"
	| "project_scoped_container"
	| "worktree";

export interface SessionIsolationPort {
	readonly sessionIsolation: SessionIsolationKind;
}

export const AGENT_RUNNER_PROTOCOL = Object.freeze({
	id: "codewiki.agent-runner",
	version: "1.0.0",
} as const);

export const RUNNER_BUNDLE_SCHEMA_VERSION = "1.0.0" as const;
export const RUNNER_BUNDLE_REGISTRY_SCHEMA_VERSION = "1.0.0" as const;

export interface RunnerBundleManifest {
	readonly schemaVersion: typeof RUNNER_BUNDLE_SCHEMA_VERSION;
	readonly runnerProtocolVersion: string;
	readonly nodeVersion: string;
	readonly dshSourceCommit: string;
	readonly dshPackageClosureDigest: Sha256Digest;
	readonly cordisClosureDigest: Sha256Digest;
	readonly backendPluginClosureDigest: Sha256Digest;
	readonly modelAdapterClosureDigest: Sha256Digest;
	readonly delegateAdapterClosureDigest: Sha256Digest;
	readonly runnerArtifactDigest: Sha256Digest;
}

export interface QualifiedRunnerBundle {
	readonly manifest: RunnerBundleManifest;
	readonly bundleDigest: Sha256Digest;
	readonly qualificationSuiteDigest: Sha256Digest;
	readonly qualificationEvidenceDigest: Sha256Digest;
	readonly qualifiedAt: string;
}

export interface RunnerBundleRegistrySnapshot {
	readonly schemaVersion: typeof RUNNER_BUNDLE_REGISTRY_SCHEMA_VERSION;
	readonly generation: number;
	readonly generatedAt: string;
	readonly activeBundleDigest: Sha256Digest | null;
	readonly bundles: readonly QualifiedRunnerBundle[];
}

export interface RunnerBundleBinding {
	readonly bundleDigest: Sha256Digest;
	readonly runnerProtocolVersion: string;
}

export interface AgentRunnerHandshake {
	readonly runnerProtocolId: typeof AGENT_RUNNER_PROTOCOL.id;
	readonly runnerProtocolVersion: string;
	readonly runnerBundleDigest: Sha256Digest;
}

export function admitAgentRunnerHandshake(
	binding: RunnerBundleBinding,
	value: unknown,
): Readonly<AgentRunnerHandshake> {
	assertRunnerBundleBinding(binding);
	if (
		!value ||
		typeof value !== "object" ||
		!hasExactKeys(value, [
			"runnerProtocolId",
			"runnerProtocolVersion",
			"runnerBundleDigest",
		])
	) {
		throw new Error("Runner process handshake shape is invalid.");
	}
	const handshake = value as Record<string, unknown>;
	if (handshake.runnerProtocolId !== AGENT_RUNNER_PROTOCOL.id) {
		throw new Error("Runner process protocol identity is unsupported.");
	}
	assertVersion(
		handshake.runnerProtocolVersion,
		"Runner process protocol version",
	);
	if (handshake.runnerProtocolVersion !== binding.runnerProtocolVersion) {
		throw new Error(
			"Runner process protocol does not match the bound Runner protocol.",
		);
	}
	const runnerBundleDigest = assertSha256Digest(
		handshake.runnerBundleDigest,
		"Runner process bundle digest",
	);
	if (runnerBundleDigest !== binding.bundleDigest) {
		throw new Error(
			"Runner process bundle does not match the bound Runner Bundle.",
		);
	}
	return Object.freeze({
		runnerProtocolId: AGENT_RUNNER_PROTOCOL.id,
		runnerProtocolVersion: handshake.runnerProtocolVersion,
		runnerBundleDigest,
	});
}

export const AGENT_RUN_SPEC_SCHEMA_VERSION = "1.0.0" as const;

export type AgentRunCustody = "backend-owned" | "backend-delegated";
export type AgentRunRole =
	| "decision-producer"
	| "planning-producer"
	| "implementation-worker"
	| "review-producer"
	| "decision-research"
	| "model-check";
export type AgentRunToolMode = "none" | "admitted";

export interface AgentRunRawLogReference {
	readonly encoding: "jsonl" | "jsonl-zstd";
	readonly formatVersion: number;
	readonly sessionId: string;
	readonly storageId: string;
	readonly byteLength: number;
	readonly digest: Sha256Digest;
	readonly runnerBundleDigest: Sha256Digest;
}

export type AgentRunSessionBinding =
	| {
			readonly mode: "create";
			readonly sessionId: string;
			readonly resumeLog: null;
	  }
	| {
			readonly mode: "resume";
			readonly sessionId: string;
			readonly resumeLog: AgentRunRawLogReference;
	  };

export interface AgentRunModelRouteBinding {
	readonly provider: string;
	readonly model: string;
	readonly optionsDigest: Sha256Digest;
	readonly routeDigest: Sha256Digest;
}

export interface AgentRunInputBindings {
	readonly stageContextDigest: Sha256Digest;
	readonly staticInputManifestDigest: Sha256Digest;
	readonly systemPromptDigest: Sha256Digest;
	readonly promptDigest: Sha256Digest;
	readonly producerSkillSetDigest: Sha256Digest | null;
	readonly toolMode: AgentRunToolMode;
	readonly toolSetDigest: Sha256Digest;
	readonly modelRoute: AgentRunModelRouteBinding;
}

export type AgentRunWorkspaceBinding =
	| {
			readonly kind: "immutable";
			readonly repositorySnapshotDigest: Sha256Digest;
	  }
	| {
			readonly kind: "runtime-workbench";
			readonly repositorySnapshotDigest: Sha256Digest;
			readonly assignmentId: string;
			readonly workbenchRef: string;
	  };

export interface AgentRunBudget {
	readonly timeoutMs: number;
	readonly maxModelRequests: number;
	readonly maxToolCalls: number;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;
}

export interface AgentRunSpecificationInput {
	readonly runId: string;
	readonly operationId: string;
	readonly custody: AgentRunCustody;
	readonly role: AgentRunRole;
	readonly stage: CheckStage;
	readonly subject: {
		readonly id: string;
		readonly digest: Sha256Digest;
	};
	readonly runnerBundle: RunnerBundleBinding;
	readonly session: AgentRunSessionBinding;
	readonly inputs: AgentRunInputBindings;
	readonly workspace: AgentRunWorkspaceBinding;
	readonly budget: AgentRunBudget;
	readonly createdAt: string;
	readonly deadlineAt: string;
}

export interface AgentRunSpecification extends AgentRunSpecificationInput {
	readonly schemaVersion: typeof AGENT_RUN_SPEC_SCHEMA_VERSION;
	readonly specDigest: Sha256Digest;
}

export function createAgentRunRawLogReference(
	value: AgentRunRawLogReference,
): Readonly<AgentRunRawLogReference> {
	if (!hasExactKeys(value, AGENT_RUN_RAW_LOG_KEYS)) {
		throw new Error("Agent Run raw-log reference shape is invalid.");
	}
	if (value.encoding !== "jsonl" && value.encoding !== "jsonl-zstd") {
		throw new Error("Agent Run raw-log encoding is invalid.");
	}
	assertNonNegativeInteger(value.formatVersion, "Agent Run raw-log formatVersion");
	assertIdentifier(value.sessionId, "Agent Run raw-log sessionId");
	assertIdentifier(value.storageId, "Agent Run raw-log storageId");
	assertPositiveInteger(value.byteLength, "Agent Run raw-log byteLength");
	return Object.freeze({
		encoding: value.encoding,
		formatVersion: value.formatVersion,
		sessionId: value.sessionId,
		storageId: value.storageId,
		byteLength: value.byteLength,
		digest: assertSha256Digest(value.digest, "Agent Run raw-log digest"),
		runnerBundleDigest: assertSha256Digest(
			value.runnerBundleDigest,
			"Agent Run raw-log Runner Bundle digest",
		),
	});
}

export function createAgentRunSpecification(
	value: AgentRunSpecificationInput,
): Readonly<AgentRunSpecification> {
	if (!hasExactKeys(value, AGENT_RUN_SPEC_INPUT_KEYS)) {
		throw new Error("Agent Run Specification shape is invalid.");
	}
	assertIdentifier(value.runId, "Agent Run runId");
	assertIdentifier(value.operationId, "Agent Run operationId");
	if (value.custody !== "backend-owned" && value.custody !== "backend-delegated") {
		throw new Error("Agent Run custody is invalid.");
	}
	assertAgentRunRoleStage(value.role, value.stage);
	if (value.role === "model-check" && value.custody !== "backend-owned") {
		throw new Error("Model Check Agent Runs must use backend-owned custody.");
	}
	const subject = normalizeAgentRunSubject(value.subject);
	assertRunnerBundleBinding(value.runnerBundle);
	const runnerBundle = Object.freeze({...value.runnerBundle});
	const session = normalizeAgentRunSession(value.session, runnerBundle);
	const inputs = normalizeAgentRunInputs(value.inputs, value.role);
	const workspace = normalizeAgentRunWorkspace(value.workspace, value.role);
	const budget = normalizeAgentRunBudget(value.budget, inputs.toolMode);
	const createdAt = assertTimestamp(value.createdAt, "Agent Run createdAt");
	const deadlineAt = assertTimestamp(value.deadlineAt, "Agent Run deadlineAt");
	if (Date.parse(deadlineAt) <= Date.parse(createdAt)) {
		throw new Error("Agent Run deadlineAt must be later than createdAt.");
	}
	const body = Object.freeze({
		schemaVersion: AGENT_RUN_SPEC_SCHEMA_VERSION,
		runId: value.runId,
		operationId: value.operationId,
		custody: value.custody,
		role: value.role,
		stage: value.stage,
		subject,
		runnerBundle,
		session,
		inputs,
		workspace,
		budget,
		createdAt,
		deadlineAt,
	});
	return Object.freeze({...body, specDigest: canonicalJsonDigest(body)});
}

export const AGENT_RUN_RECEIPT_SCHEMA_VERSION = "1.0.0" as const;

export const AGENT_RUN_EVENT_KINDS = Object.freeze([
	"accepted",
	"runner-started",
	"session-event",
	"cancellation-requested",
	"quiescent",
	"receipt-committed",
] as const);

export type AgentRunEventKind = (typeof AGENT_RUN_EVENT_KINDS)[number];
export type AgentRunCancellationReason =
	| "user"
	| "deadline"
	| "runtime-shutdown"
	| "superseded"
	| "policy-stop";
export type AgentRunOutcome = "completed" | "failed" | "cancelled" | "stopped";
export type AgentRunCustodyGap =
	| "delegate-prompts"
	| "delegate-tools"
	| "delegate-model-route"
	| "delegate-usage"
	| "delegate-trace"
	| "delegate-memory"
	| "delegate-settings";
export type AgentRunOperationalGap =
	| "raw-log-unavailable"
	| "execution-ledger-incomplete"
	| "quiescence-unproven";

export interface AgentRunHandle {
	readonly runId: string;
	readonly specDigest: Sha256Digest;
	readonly custody: AgentRunCustody;
	readonly runnerBundle: RunnerBundleBinding;
	readonly sessionId: string;
	readonly acceptedAt: string;
}

export interface AgentRunEvent {
	readonly runId: string;
	readonly specDigest: Sha256Digest;
	readonly sequence: number;
	readonly kind: AgentRunEventKind;
	readonly occurredAt: string;
	readonly payloadDigest: Sha256Digest;
}

export interface AgentRunCancellationRequest {
	readonly runId: string;
	readonly specDigest: Sha256Digest;
	readonly expectedEventSequence: number;
	readonly reason: AgentRunCancellationReason;
	readonly requestedAt: string;
}

export interface AgentRunQuiescence {
	readonly runId: string;
	readonly specDigest: Sha256Digest;
	readonly finalEventSequence: number;
	readonly quiescedAt: string;
	readonly proofDigest: Sha256Digest;
	readonly rawLog: AgentRunRawLogReference | null;
}

export interface AgentRunExecutionReceiptInput {
	readonly handle: AgentRunHandle;
	readonly outcome: AgentRunOutcome;
	readonly finalEventSequence: number;
	readonly startedAt: string;
	readonly finishedAt: string;
	readonly executionLedgerDigest: Sha256Digest | null;
	readonly rawLog: AgentRunRawLogReference | null;
	readonly outputDigest: Sha256Digest | null;
	readonly usageDigest: Sha256Digest | null;
	readonly cancellationDigest: Sha256Digest | null;
	readonly quiescenceDigest: Sha256Digest | null;
	readonly custodyGaps: readonly AgentRunCustodyGap[];
	readonly operationalGaps: readonly AgentRunOperationalGap[];
}

export interface AgentRunExecutionReceipt
	extends Omit<AgentRunExecutionReceiptInput, "handle">,
		AgentRunHandle {
	readonly schemaVersion: typeof AGENT_RUN_RECEIPT_SCHEMA_VERSION;
	readonly receiptDigest: Sha256Digest;
}

export function createAgentRunHandle(
	spec: AgentRunSpecification,
	acceptedAtValue: string,
): Readonly<AgentRunHandle> {
	assertAgentRunSpecification(spec);
	const acceptedAt = assertTimestamp(acceptedAtValue, "Agent Run acceptedAt");
	if (
		Date.parse(acceptedAt) < Date.parse(spec.createdAt) ||
		Date.parse(acceptedAt) >= Date.parse(spec.deadlineAt)
	) {
		throw new Error("Agent Run acceptedAt is outside its Run Specification window.");
	}
	return Object.freeze({
		runId: spec.runId,
		specDigest: spec.specDigest,
		custody: spec.custody,
		runnerBundle: Object.freeze({...spec.runnerBundle}),
		sessionId: spec.session.sessionId,
		acceptedAt,
	});
}

export function createAgentRunEvent(
	handle: AgentRunHandle,
	value: {
		readonly sequence: number;
		readonly kind: AgentRunEventKind;
		readonly occurredAt: string;
		readonly payloadDigest: Sha256Digest;
	},
): Readonly<AgentRunEvent> {
	assertAgentRunHandle(handle);
	assertNonNegativeInteger(value.sequence, "Agent Run event sequence");
	if (!AGENT_RUN_EVENT_KINDS.includes(value.kind)) {
		throw new Error("Agent Run event kind is invalid.");
	}
	const occurredAt = assertTimestamp(value.occurredAt, "Agent Run event occurredAt");
	assertNotBeforeAcceptance(handle, occurredAt, "Agent Run event");
	return Object.freeze({
		runId: handle.runId,
		specDigest: handle.specDigest,
		sequence: value.sequence,
		kind: value.kind,
		occurredAt,
		payloadDigest: assertSha256Digest(
			value.payloadDigest,
			"Agent Run event payload digest",
		),
	});
}

export function createAgentRunCancellationRequest(
	handle: AgentRunHandle,
	value: {
		readonly expectedEventSequence: number;
		readonly reason: AgentRunCancellationReason;
		readonly requestedAt: string;
	},
): Readonly<AgentRunCancellationRequest> {
	assertAgentRunHandle(handle);
	assertNonNegativeInteger(
		value.expectedEventSequence,
		"Agent Run cancellation expectedEventSequence",
	);
	if (!AGENT_RUN_CANCELLATION_REASONS.includes(value.reason)) {
		throw new Error("Agent Run cancellation reason is invalid.");
	}
	const requestedAt = assertTimestamp(
		value.requestedAt,
		"Agent Run cancellation requestedAt",
	);
	assertNotBeforeAcceptance(handle, requestedAt, "Agent Run cancellation");
	return Object.freeze({
		runId: handle.runId,
		specDigest: handle.specDigest,
		expectedEventSequence: value.expectedEventSequence,
		reason: value.reason,
		requestedAt,
	});
}

export function createAgentRunQuiescence(
	handle: AgentRunHandle,
	value: {
		readonly finalEventSequence: number;
		readonly quiescedAt: string;
		readonly proofDigest: Sha256Digest;
		readonly rawLog: AgentRunRawLogReference | null;
	},
): Readonly<AgentRunQuiescence> {
	assertAgentRunHandle(handle);
	assertNonNegativeInteger(
		value.finalEventSequence,
		"Agent Run quiescence finalEventSequence",
	);
	const quiescedAt = assertTimestamp(value.quiescedAt, "Agent Run quiescedAt");
	assertNotBeforeAcceptance(handle, quiescedAt, "Agent Run quiescence");
	return Object.freeze({
		runId: handle.runId,
		specDigest: handle.specDigest,
		finalEventSequence: value.finalEventSequence,
		quiescedAt,
		proofDigest: assertSha256Digest(
			value.proofDigest,
			"Agent Run quiescence proof digest",
		),
		rawLog:
			value.rawLog === null
				? null
				: rawLogForHandle(handle, createAgentRunRawLogReference(value.rawLog)),
	});
}

export function createAgentRunExecutionReceipt(
	value: AgentRunExecutionReceiptInput,
): Readonly<AgentRunExecutionReceipt> {
	if (!hasExactKeys(value, AGENT_RUN_RECEIPT_INPUT_KEYS)) {
		throw new Error("Agent Run Execution Receipt shape is invalid.");
	}
	assertAgentRunHandle(value.handle);
	if (!AGENT_RUN_OUTCOMES.includes(value.outcome)) {
		throw new Error("Agent Run receipt outcome is invalid.");
	}
	assertNonNegativeInteger(
		value.finalEventSequence,
		"Agent Run receipt finalEventSequence",
	);
	const startedAt = assertTimestamp(value.startedAt, "Agent Run receipt startedAt");
	const finishedAt = assertTimestamp(value.finishedAt, "Agent Run receipt finishedAt");
	assertNotBeforeAcceptance(value.handle, startedAt, "Agent Run receipt start");
	if (Date.parse(finishedAt) < Date.parse(startedAt)) {
		throw new Error("Agent Run receipt finishedAt precedes startedAt.");
	}
	const custodyGaps = normalizedAgentRunGapList(
		value.custodyGaps,
		AGENT_RUN_CUSTODY_GAPS,
		"Agent Run custody gaps",
	);
	const operationalGaps = normalizedAgentRunGapList(
		value.operationalGaps,
		AGENT_RUN_OPERATIONAL_GAPS,
		"Agent Run operational gaps",
	);
	assertAgentRunReceiptCustody(value.handle.custody, custodyGaps);
	if (operationalGaps.length > 0 && value.outcome !== "stopped") {
		throw new Error("Operationally incomplete Agent Runs must be stopped.");
	}
	const executionLedgerDigest = optionalSha256Digest(
		value.executionLedgerDigest,
		"Agent Run Execution Ledger digest",
	);
	const rawLog =
		value.rawLog === null
			? null
			: rawLogForHandle(value.handle, createAgentRunRawLogReference(value.rawLog));
	const quiescenceDigest = optionalSha256Digest(
		value.quiescenceDigest,
		"Agent Run quiescence digest",
	);
	assertAgentRunReceiptGapAgreement({
		operationalGaps,
		executionLedgerDigest,
		rawLog,
		quiescenceDigest,
	});
	const outputDigest = optionalSha256Digest(
		value.outputDigest,
		"Agent Run output digest",
	);
	if (value.outcome === "completed" && outputDigest === null) {
		throw new Error("Completed Agent Runs require an output digest.");
	}
	const cancellationDigest = optionalSha256Digest(
		value.cancellationDigest,
		"Agent Run cancellation digest",
	);
	if (value.outcome === "cancelled" && cancellationDigest === null) {
		throw new Error("Cancelled Agent Runs require a cancellation digest.");
	}
	const body = Object.freeze({
		schemaVersion: AGENT_RUN_RECEIPT_SCHEMA_VERSION,
		runId: value.handle.runId,
		specDigest: value.handle.specDigest,
		custody: value.handle.custody,
		runnerBundle: Object.freeze({...value.handle.runnerBundle}),
		sessionId: value.handle.sessionId,
		acceptedAt: value.handle.acceptedAt,
		outcome: value.outcome,
		finalEventSequence: value.finalEventSequence,
		startedAt,
		finishedAt,
		executionLedgerDigest,
		rawLog,
		outputDigest,
		usageDigest: optionalSha256Digest(
			value.usageDigest,
			"Agent Run usage digest",
		),
		cancellationDigest,
		quiescenceDigest,
		custodyGaps,
		operationalGaps,
	});
	return Object.freeze({...body, receiptDigest: canonicalJsonDigest(body)});
}

function assertAgentRunSpecification(
	value: AgentRunSpecification,
): void {
	if (!hasExactKeys(value, AGENT_RUN_SPEC_KEYS)) {
		throw new Error("Agent Run Specification persisted shape is invalid.");
	}
	const {schemaVersion, specDigest, ...input} = value;
	if (schemaVersion !== AGENT_RUN_SPEC_SCHEMA_VERSION) {
		throw new Error("Agent Run Specification schemaVersion is invalid.");
	}
	assertSha256Digest(specDigest, "Agent Run Specification digest");
	const expected = createAgentRunSpecification(input);
	if (specDigest !== expected.specDigest) {
		throw new Error("Agent Run Specification digest does not match its content.");
	}
}

function assertAgentRunHandle(value: AgentRunHandle): void {
	if (!hasExactKeys(value, AGENT_RUN_HANDLE_KEYS)) {
		throw new Error("Agent Run handle shape is invalid.");
	}
	assertIdentifier(value.runId, "Agent Run handle runId");
	assertSha256Digest(value.specDigest, "Agent Run handle spec digest");
	if (value.custody !== "backend-owned" && value.custody !== "backend-delegated") {
		throw new Error("Agent Run handle custody is invalid.");
	}
	assertRunnerBundleBinding(value.runnerBundle);
	assertIdentifier(value.sessionId, "Agent Run handle sessionId");
	assertTimestamp(value.acceptedAt, "Agent Run handle acceptedAt");
}

function rawLogForHandle(
	handle: AgentRunHandle,
	rawLog: AgentRunRawLogReference,
): AgentRunRawLogReference {
	if (rawLog.sessionId !== handle.sessionId) {
		throw new Error("Agent Run raw log does not match the handle session.");
	}
	if (rawLog.runnerBundleDigest !== handle.runnerBundle.bundleDigest) {
		throw new Error("Agent Run raw log does not match the handle Runner Bundle.");
	}
	return rawLog;
}

function assertNotBeforeAcceptance(
	handle: AgentRunHandle,
	timestamp: string,
	label: string,
): void {
	if (Date.parse(timestamp) < Date.parse(handle.acceptedAt)) {
		throw new Error(`${label} precedes acceptance.`);
	}
}

function normalizedAgentRunGapList<T extends string>(
	value: readonly T[],
	allowed: readonly T[],
	field: string,
): readonly T[] {
	if (!Array.isArray(value) || value.length > allowed.length) {
		throw new Error(`${field} are invalid.`);
	}
	const gaps = [...value].sort((left, right) => {
		if (left < right) return -1;
		if (left > right) return 1;
		return 0;
	});
	for (let index = 0; index < gaps.length; index += 1) {
		if (!allowed.includes(gaps[index] as T) || gaps[index - 1] === gaps[index]) {
			throw new Error(`${field} are invalid.`);
		}
	}
	return Object.freeze(gaps);
}

function assertAgentRunReceiptCustody(
	custody: AgentRunCustody,
	gaps: readonly AgentRunCustodyGap[],
): void {
	if (custody === "backend-owned" && gaps.length > 0) {
		throw new Error(
			"Backend-owned Agent Run receipts cannot declare delegated custody gaps.",
		);
	}
	if (custody === "backend-delegated" && gaps.length === 0) {
		throw new Error("Backend-delegated Agent Run receipts must declare custody gaps.");
	}
}

function assertAgentRunReceiptGapAgreement(input: {
	readonly operationalGaps: readonly AgentRunOperationalGap[];
	readonly executionLedgerDigest: Sha256Digest | null;
	readonly rawLog: AgentRunRawLogReference | null;
	readonly quiescenceDigest: Sha256Digest | null;
}): void {
	assertGapMatchesNull(
		input.operationalGaps,
		"execution-ledger-incomplete",
		input.executionLedgerDigest,
		"Execution Ledger",
	);
	assertGapMatchesNull(
		input.operationalGaps,
		"raw-log-unavailable",
		input.rawLog,
		"raw log",
	);
	assertGapMatchesNull(
		input.operationalGaps,
		"quiescence-unproven",
		input.quiescenceDigest,
		"quiescence proof",
	);
}

function assertGapMatchesNull(
	gaps: readonly AgentRunOperationalGap[],
	gap: AgentRunOperationalGap,
	value: unknown,
	label: string,
): void {
	if ((value === null) !== gaps.includes(gap)) {
		throw new Error(`Agent Run ${label} availability disagrees with operational gaps.`);
	}
}

function optionalSha256Digest(
	value: Sha256Digest | null,
	field: string,
): Sha256Digest | null {
	return value === null ? null : assertSha256Digest(value, field);
}

const AGENT_RUN_CANCELLATION_REASONS = Object.freeze([
	"user",
	"deadline",
	"runtime-shutdown",
	"superseded",
	"policy-stop",
] as const);
const AGENT_RUN_OUTCOMES = Object.freeze([
	"completed",
	"failed",
	"cancelled",
	"stopped",
] as const);
const AGENT_RUN_CUSTODY_GAPS = Object.freeze([
	"delegate-prompts",
	"delegate-tools",
	"delegate-model-route",
	"delegate-usage",
	"delegate-trace",
	"delegate-memory",
	"delegate-settings",
] as const);
const AGENT_RUN_OPERATIONAL_GAPS = Object.freeze([
	"raw-log-unavailable",
	"execution-ledger-incomplete",
	"quiescence-unproven",
] as const);

const AGENT_RUN_SPEC_KEYS = [
	"schemaVersion",
	"runId",
	"operationId",
	"custody",
	"role",
	"stage",
	"subject",
	"runnerBundle",
	"session",
	"inputs",
	"workspace",
	"budget",
	"createdAt",
	"deadlineAt",
	"specDigest",
] as const;
const AGENT_RUN_HANDLE_KEYS = [
	"runId",
	"specDigest",
	"custody",
	"runnerBundle",
	"sessionId",
	"acceptedAt",
] as const;
const AGENT_RUN_RECEIPT_INPUT_KEYS = [
	"handle",
	"outcome",
	"finalEventSequence",
	"startedAt",
	"finishedAt",
	"executionLedgerDigest",
	"rawLog",
	"outputDigest",
	"usageDigest",
	"cancellationDigest",
	"quiescenceDigest",
	"custodyGaps",
	"operationalGaps",
] as const;

function normalizeAgentRunSubject(
	value: AgentRunSpecificationInput["subject"],
): AgentRunSpecificationInput["subject"] {
	if (!hasExactKeys(value, ["id", "digest"])) {
		throw new Error("Agent Run subject shape is invalid.");
	}
	assertIdentifier(value.id, "Agent Run subject id");
	return Object.freeze({
		id: value.id,
		digest: assertSha256Digest(value.digest, "Agent Run subject digest"),
	});
}

function normalizeAgentRunSession(
	value: AgentRunSessionBinding,
	runnerBundle: RunnerBundleBinding,
): AgentRunSessionBinding {
	if (!hasExactKeys(value, ["mode", "sessionId", "resumeLog"])) {
		throw new Error("Agent Run session shape is invalid.");
	}
	assertIdentifier(value.sessionId, "Agent Run sessionId");
	if (value.mode === "create") {
		if (value.resumeLog !== null) {
			throw new Error("New Agent Run sessions cannot carry a resume log.");
		}
		return Object.freeze({mode: "create", sessionId: value.sessionId, resumeLog: null});
	}
	if (value.mode !== "resume" || !value.resumeLog) {
		throw new Error("Agent Run session mode is invalid.");
	}
	const resumeLog = createAgentRunRawLogReference(value.resumeLog);
	if (resumeLog.sessionId !== value.sessionId) {
		throw new Error("Resume log session does not match the Agent Run session.");
	}
	if (resumeLog.runnerBundleDigest !== runnerBundle.bundleDigest) {
		throw new Error(
			"Resume log Runner Bundle does not match the Agent Run binding.",
		);
	}
	return Object.freeze({mode: "resume", sessionId: value.sessionId, resumeLog});
}

function normalizeAgentRunInputs(
	value: AgentRunInputBindings,
	role: AgentRunRole,
): AgentRunInputBindings {
	if (!hasExactKeys(value, AGENT_RUN_INPUT_KEYS)) {
		throw new Error("Agent Run input bindings shape is invalid.");
	}
	const producerSkillSetDigest =
		value.producerSkillSetDigest === null
			? null
			: assertSha256Digest(
					value.producerSkillSetDigest,
					"Agent Run producer Skill set digest",
				);
	if (value.toolMode !== "none" && value.toolMode !== "admitted") {
		throw new Error("Agent Run toolMode is invalid.");
	}
	if (
		role === "model-check" &&
		(producerSkillSetDigest !== null || value.toolMode !== "none")
	) {
		throw new Error("Model Check Agent Runs cannot receive producer Skills or tools.");
	}
	return Object.freeze({
		stageContextDigest: assertSha256Digest(
			value.stageContextDigest,
			"Agent Run Stage Context digest",
		),
		staticInputManifestDigest: assertSha256Digest(
			value.staticInputManifestDigest,
			"Agent Run static input manifest digest",
		),
		systemPromptDigest: assertSha256Digest(
			value.systemPromptDigest,
			"Agent Run system prompt digest",
		),
		promptDigest: assertSha256Digest(value.promptDigest, "Agent Run prompt digest"),
		producerSkillSetDigest,
		toolMode: value.toolMode,
		toolSetDigest: assertSha256Digest(
			value.toolSetDigest,
			"Agent Run tool set digest",
		),
		modelRoute: normalizeAgentRunModelRoute(value.modelRoute),
	});
}

function normalizeAgentRunModelRoute(
	value: AgentRunModelRouteBinding,
): AgentRunModelRouteBinding {
	if (!hasExactKeys(value, ["provider", "model", "optionsDigest", "routeDigest"])) {
		throw new Error("Agent Run model route shape is invalid.");
	}
	assertBoundedText(value.provider, "Agent Run model provider", 128);
	assertBoundedText(value.model, "Agent Run model", 256);
	const optionsDigest = assertSha256Digest(
		value.optionsDigest,
		"Agent Run model options digest",
	);
	const routeDigest = assertSha256Digest(value.routeDigest, "Agent Run model route digest");
	if (
		routeDigest !==
		canonicalJsonDigest({provider: value.provider, model: value.model, optionsDigest})
	) {
		throw new Error("Agent Run model route digest does not match its route.");
	}
	return Object.freeze({
		provider: value.provider,
		model: value.model,
		optionsDigest,
		routeDigest,
	});
}

function normalizeAgentRunWorkspace(
	value: AgentRunWorkspaceBinding,
	role: AgentRunRole,
): AgentRunWorkspaceBinding {
	if (value.kind === "immutable") {
		if (!hasExactKeys(value, ["kind", "repositorySnapshotDigest"])) {
			throw new Error("Immutable Agent Run workspace shape is invalid.");
		}
		if (role === "implementation-worker") {
			throw new Error(
				"Implementation Worker Agent Runs require Runtime Workbench custody.",
			);
		}
		return Object.freeze({
			kind: "immutable",
			repositorySnapshotDigest: assertSha256Digest(
				value.repositorySnapshotDigest,
				"Agent Run repository snapshot digest",
			),
		});
	}
	if (
		value.kind !== "runtime-workbench" ||
		!hasExactKeys(value, [
			"kind",
			"repositorySnapshotDigest",
			"assignmentId",
			"workbenchRef",
		])
	) {
		throw new Error("Agent Run Runtime Workbench shape is invalid.");
	}
	if (role !== "implementation-worker") {
		throw new Error("Only Implementation Worker Agent Runs may receive a Runtime Workbench.");
	}
	assertIdentifier(value.assignmentId, "Agent Run Assignment id");
	assertIdentifier(value.workbenchRef, "Agent Run Workbench ref");
	return Object.freeze({
		kind: "runtime-workbench",
		repositorySnapshotDigest: assertSha256Digest(
			value.repositorySnapshotDigest,
			"Agent Run repository snapshot digest",
		),
		assignmentId: value.assignmentId,
		workbenchRef: value.workbenchRef,
	});
}

function normalizeAgentRunBudget(
	value: AgentRunBudget,
	toolMode: AgentRunToolMode,
): AgentRunBudget {
	if (!hasExactKeys(value, AGENT_RUN_BUDGET_KEYS)) {
		throw new Error("Agent Run budget shape is invalid.");
	}
	assertPositiveInteger(value.timeoutMs, "Agent Run timeoutMs");
	assertPositiveInteger(value.maxModelRequests, "Agent Run maxModelRequests");
	assertNonNegativeInteger(value.maxToolCalls, "Agent Run maxToolCalls");
	assertPositiveInteger(value.maxInputTokens, "Agent Run maxInputTokens");
	assertPositiveInteger(value.maxOutputTokens, "Agent Run maxOutputTokens");
	if (toolMode === "none" && value.maxToolCalls !== 0) {
		throw new Error("Tool-free Agent Runs require maxToolCalls 0.");
	}
	if (toolMode === "admitted" && value.maxToolCalls === 0) {
		throw new Error("Tool-admitted Agent Runs require a positive maxToolCalls budget.");
	}
	return Object.freeze({...value});
}

function assertAgentRunRoleStage(role: AgentRunRole, stage: CheckStage): void {
	const expectedStage: Readonly<Record<Exclude<AgentRunRole, "model-check">, CheckStage>> = {
		"decision-producer": "decision",
		"planning-producer": "planning",
		"implementation-worker": "implementation",
		"review-producer": "review",
		"decision-research": "decision",
	};
	if (role === "model-check") {
		if (!["decision", "planning", "implementation", "review"].includes(stage)) {
			throw new Error("Model Check Agent Run stage is invalid.");
		}
		return;
	}
	if (!(role in expectedStage) || expectedStage[role] !== stage) {
		throw new Error(`Agent Run role ${role} does not match stage ${stage}.`);
	}
}

function assertIdentifier(value: unknown, field: string): asserts value is string {
	if (
		typeof value !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)
	) {
		throw new Error(`${field} is invalid.`);
	}
}

function assertBoundedText(value: unknown, field: string, maximum: number): void {
	if (
		typeof value !== "string" ||
		value.length < 1 ||
		value.length > maximum ||
		value.trim() !== value ||
		/[\u0000-\u001f\u007f]/.test(value)
	) {
		throw new Error(`${field} is invalid.`);
	}
}

function assertPositiveInteger(value: unknown, field: string): void {
	if (!Number.isSafeInteger(value) || (value as number) < 1) {
		throw new Error(`${field} must be a positive safe integer.`);
	}
}

function assertNonNegativeInteger(value: unknown, field: string): void {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new Error(`${field} must be a non-negative safe integer.`);
	}
}

const AGENT_RUN_RAW_LOG_KEYS = [
	"encoding",
	"formatVersion",
	"sessionId",
	"storageId",
	"byteLength",
	"digest",
	"runnerBundleDigest",
] as const;

const AGENT_RUN_SPEC_INPUT_KEYS = [
	"runId",
	"operationId",
	"custody",
	"role",
	"stage",
	"subject",
	"runnerBundle",
	"session",
	"inputs",
	"workspace",
	"budget",
	"createdAt",
	"deadlineAt",
] as const;

const AGENT_RUN_INPUT_KEYS = [
	"stageContextDigest",
	"staticInputManifestDigest",
	"systemPromptDigest",
	"promptDigest",
	"producerSkillSetDigest",
	"toolMode",
	"toolSetDigest",
	"modelRoute",
] as const;

const AGENT_RUN_BUDGET_KEYS = [
	"timeoutMs",
	"maxModelRequests",
	"maxToolCalls",
	"maxInputTokens",
	"maxOutputTokens",
] as const;

export function createRunnerBundleManifest(
	input: RunnerBundleManifest,
): RunnerBundleManifest {
	if (!hasExactKeys(input, RUNNER_BUNDLE_MANIFEST_KEYS)) {
		throw new Error("Runner Bundle manifest shape is invalid.");
	}
	if (input.schemaVersion !== RUNNER_BUNDLE_SCHEMA_VERSION) {
		throw new Error("Runner Bundle manifest schemaVersion is invalid.");
	}
	assertVersion(input.runnerProtocolVersion, "Runner protocol version");
	assertVersion(input.nodeVersion, "Runner Bundle Node version");
	if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.dshSourceCommit)) {
		throw new Error(
			"Runner Bundle DSH source commit must be a lowercase full Git object id.",
		);
	}
	for (const field of RUNNER_BUNDLE_DIGEST_FIELDS) {
		assertSha256Digest(input[field], `Runner Bundle ${field}`);
	}
	return Object.freeze({...input});
}

export function createQualifiedRunnerBundle(input: {
	readonly manifest: RunnerBundleManifest;
	readonly qualificationSuiteDigest: Sha256Digest;
	readonly qualificationEvidenceDigest: Sha256Digest;
	readonly qualifiedAt: string;
}): QualifiedRunnerBundle {
	const manifest = createRunnerBundleManifest(input.manifest);
	return Object.freeze({
		manifest,
		bundleDigest: canonicalJsonDigest(manifest),
		qualificationSuiteDigest: assertSha256Digest(
			input.qualificationSuiteDigest,
			"Runner Bundle qualification suite digest",
		),
		qualificationEvidenceDigest: assertSha256Digest(
			input.qualificationEvidenceDigest,
			"Runner Bundle qualification Evidence digest",
		),
		qualifiedAt: assertTimestamp(input.qualifiedAt, "Runner Bundle qualifiedAt"),
	});
}

export function createRunnerBundleRegistrySnapshot(input: {
	readonly generatedAt: string;
}): RunnerBundleRegistrySnapshot {
	return Object.freeze({
		schemaVersion: RUNNER_BUNDLE_REGISTRY_SCHEMA_VERSION,
		generation: 0,
		generatedAt: assertTimestamp(
			input.generatedAt,
			"Runner Bundle registry generatedAt",
		),
		activeBundleDigest: null,
		bundles: Object.freeze([]),
	});
}

export function qualifyRunnerBundle(input: {
	readonly registry: RunnerBundleRegistrySnapshot;
	readonly expectedGeneration: number;
	readonly bundle: QualifiedRunnerBundle;
	readonly generatedAt: string;
}): RunnerBundleRegistrySnapshot {
	assertRunnerBundleRegistrySnapshot(input.registry);
	assertRegistryGeneration(input.registry, input.expectedGeneration);
	assertQualifiedRunnerBundle(input.bundle);
	if (
		input.registry.bundles.some(
			(bundle) => bundle.bundleDigest === input.bundle.bundleDigest,
		)
	) {
		throw new Error(`Runner Bundle ${input.bundle.bundleDigest} is already qualified.`);
	}
	if (input.registry.bundles.length >= 64) {
		throw new Error("Runner Bundle registry exceeds its qualified bundle limit.");
	}
	return nextRunnerBundleRegistrySnapshot({
		registry: input.registry,
		generatedAt: input.generatedAt,
		activeBundleDigest: input.registry.activeBundleDigest,
		bundles: [...input.registry.bundles, input.bundle],
	});
}

export function activateRunnerBundle(input: {
	readonly registry: RunnerBundleRegistrySnapshot;
	readonly expectedGeneration: number;
	readonly bundleDigest: Sha256Digest;
	readonly generatedAt: string;
}): RunnerBundleRegistrySnapshot {
	assertRunnerBundleRegistrySnapshot(input.registry);
	assertRegistryGeneration(input.registry, input.expectedGeneration);
	const bundleDigest = assertSha256Digest(
		input.bundleDigest,
		"Runner Bundle activation digest",
	);
	const bundle = input.registry.bundles.find(
		(entry) => entry.bundleDigest === bundleDigest,
	);
	if (!bundle) throw new Error(`Runner Bundle ${bundleDigest} is not qualified.`);
	if (bundle.manifest.runnerProtocolVersion !== AGENT_RUNNER_PROTOCOL.version) {
		throw new Error(
			`Runner Bundle ${bundleDigest} uses unsupported Runner protocol ${bundle.manifest.runnerProtocolVersion}.`,
		);
	}
	if (input.registry.activeBundleDigest === bundleDigest) {
		throw new Error(`Runner Bundle ${bundleDigest} is already active.`);
	}
	return nextRunnerBundleRegistrySnapshot({
		registry: input.registry,
		generatedAt: input.generatedAt,
		activeBundleDigest: bundleDigest,
		bundles: input.registry.bundles,
	});
}

export function bindActiveRunnerBundle(
	registry: RunnerBundleRegistrySnapshot,
): Readonly<RunnerBundleBinding> {
	assertRunnerBundleRegistrySnapshot(registry);
	if (!registry.activeBundleDigest) {
		throw new Error("Runner Bundle registry has no active qualified bundle.");
	}
	const bundle = registry.bundles.find(
		(entry) => entry.bundleDigest === registry.activeBundleDigest,
	);
	if (!bundle) throw new Error("Runner Bundle registry active binding is invalid.");
	if (bundle.manifest.runnerProtocolVersion !== AGENT_RUNNER_PROTOCOL.version) {
		throw new Error(
			`Active Runner Bundle uses unsupported Runner protocol ${bundle.manifest.runnerProtocolVersion}.`,
		);
	}
	return Object.freeze({
		bundleDigest: bundle.bundleDigest,
		runnerProtocolVersion: bundle.manifest.runnerProtocolVersion,
	});
}

export function resolveRunnerBundleForResume(
	registry: RunnerBundleRegistrySnapshot,
	binding: RunnerBundleBinding,
): QualifiedRunnerBundle {
	assertRunnerBundleRegistrySnapshot(registry);
	assertRunnerBundleBinding(binding);
	const bundle = registry.bundles.find(
		(entry) => entry.bundleDigest === binding.bundleDigest,
	);
	if (!bundle) {
		throw new Error("Exact Runner Bundle required for resume is unavailable.");
	}
	if (bundle.manifest.runnerProtocolVersion !== binding.runnerProtocolVersion) {
		throw new Error("Runner protocol version does not match the bound bundle.");
	}
	if (binding.runnerProtocolVersion !== AGENT_RUNNER_PROTOCOL.version) {
		throw new Error(
			`Bound Runner protocol ${binding.runnerProtocolVersion} is unsupported by this Supervisor.`,
		);
	}
	return bundle;
}

export function assertRunnerBundleRegistrySnapshot(
	value: unknown,
): asserts value is RunnerBundleRegistrySnapshot {
	if (
		!value ||
		typeof value !== "object" ||
		!hasExactKeys(value, RUNNER_BUNDLE_REGISTRY_KEYS)
	) {
		throw new Error("Runner Bundle registry snapshot shape is invalid.");
	}
	const registry = value as RunnerBundleRegistrySnapshot;
	if (registry.schemaVersion !== RUNNER_BUNDLE_REGISTRY_SCHEMA_VERSION) {
		throw new Error("Runner Bundle registry schemaVersion is invalid.");
	}
	if (!Number.isSafeInteger(registry.generation) || registry.generation < 0) {
		throw new Error(
			"Runner Bundle registry generation must be a non-negative safe integer.",
		);
	}
	assertTimestamp(registry.generatedAt, "Runner Bundle registry generatedAt");
	if (registry.activeBundleDigest !== null) {
		assertSha256Digest(
			registry.activeBundleDigest,
			"Runner Bundle registry active bundle digest",
		);
	}
	assertRunnerBundleRegistryBundles(registry);
}

function assertRunnerBundleRegistryBundles(
	registry: RunnerBundleRegistrySnapshot,
): void {
	if (!Array.isArray(registry.bundles) || registry.bundles.length > 64) {
		throw new Error("Runner Bundle registry bundles are invalid.");
	}
	let previous: Sha256Digest | undefined;
	for (const value of registry.bundles) {
		assertQualifiedRunnerBundle(value);
		if (previous && value.bundleDigest <= previous) {
			throw new Error("Runner Bundle registry order or uniqueness is invalid.");
		}
		previous = value.bundleDigest;
	}
	if (
		registry.activeBundleDigest &&
		!registry.bundles.some(
			(bundle) => bundle.bundleDigest === registry.activeBundleDigest,
		)
	) {
		throw new Error("Runner Bundle registry active bundle is not qualified.");
	}
}

function assertQualifiedRunnerBundle(
	value: unknown,
): asserts value is QualifiedRunnerBundle {
	if (
		!value ||
		typeof value !== "object" ||
		!hasExactKeys(value, RUNNER_BUNDLE_QUALIFICATION_KEYS)
	) {
		throw new Error("Qualified Runner Bundle shape is invalid.");
	}
	const bundle = value as QualifiedRunnerBundle;
	const manifest = createRunnerBundleManifest(bundle.manifest);
	assertSha256Digest(bundle.bundleDigest, "Qualified Runner Bundle digest");
	if (bundle.bundleDigest !== canonicalJsonDigest(manifest)) {
		throw new Error("Qualified Runner Bundle digest does not match its manifest.");
	}
	assertSha256Digest(
		bundle.qualificationSuiteDigest,
		"Runner Bundle qualification suite digest",
	);
	assertSha256Digest(
		bundle.qualificationEvidenceDigest,
		"Runner Bundle qualification Evidence digest",
	);
	assertTimestamp(bundle.qualifiedAt, "Runner Bundle qualifiedAt");
}

function nextRunnerBundleRegistrySnapshot(input: {
	readonly registry: RunnerBundleRegistrySnapshot;
	readonly generatedAt: string;
	readonly activeBundleDigest: Sha256Digest | null;
	readonly bundles: readonly QualifiedRunnerBundle[];
}): RunnerBundleRegistrySnapshot {
	const generatedAt = assertTimestamp(
		input.generatedAt,
		"Runner Bundle registry generatedAt",
	);
	if (Date.parse(generatedAt) < Date.parse(input.registry.generatedAt)) {
		throw new Error("Runner Bundle registry time cannot move backward.");
	}
	const bundles = Object.freeze(
		[...input.bundles].sort((left, right) => {
			if (left.bundleDigest < right.bundleDigest) return -1;
			if (left.bundleDigest > right.bundleDigest) return 1;
			return 0;
		}),
	);
	const snapshot = Object.freeze({
		schemaVersion: RUNNER_BUNDLE_REGISTRY_SCHEMA_VERSION,
		generation: input.registry.generation + 1,
		generatedAt,
		activeBundleDigest: input.activeBundleDigest,
		bundles,
	});
	assertRunnerBundleRegistrySnapshot(snapshot);
	return snapshot;
}

function assertRunnerBundleBinding(
	value: unknown,
): asserts value is RunnerBundleBinding {
	if (
		!value ||
		typeof value !== "object" ||
		!hasExactKeys(value, ["bundleDigest", "runnerProtocolVersion"])
	) {
		throw new Error("Runner Bundle binding shape is invalid.");
	}
	const binding = value as RunnerBundleBinding;
	assertSha256Digest(binding.bundleDigest, "Runner Bundle binding digest");
	assertVersion(
		binding.runnerProtocolVersion,
		"Runner Bundle binding protocol version",
	);
}

function assertRegistryGeneration(
	registry: RunnerBundleRegistrySnapshot,
	expectedGeneration: number,
): void {
	if (
		!Number.isSafeInteger(expectedGeneration) ||
		expectedGeneration < 0 ||
		registry.generation !== expectedGeneration
	) {
		throw new Error("Runner Bundle registry generation conflict.");
	}
}

function assertTimestamp(value: string, field: string): string {
	if (
		typeof value !== "string" ||
		Number.isNaN(Date.parse(value)) ||
		new Date(value).toISOString() !== value
	) {
		throw new Error(`${field} must be an exact UTC ISO timestamp.`);
	}
	return value;
}

function assertVersion(value: unknown, field: string): asserts value is string {
	if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) {
		throw new Error(`${field} must be an exact semantic version.`);
	}
}

const RUNNER_BUNDLE_MANIFEST_KEYS = [
	"schemaVersion",
	"runnerProtocolVersion",
	"nodeVersion",
	"dshSourceCommit",
	"dshPackageClosureDigest",
	"cordisClosureDigest",
	"backendPluginClosureDigest",
	"modelAdapterClosureDigest",
	"delegateAdapterClosureDigest",
	"runnerArtifactDigest",
] as const;

const RUNNER_BUNDLE_DIGEST_FIELDS = [
	"dshPackageClosureDigest",
	"cordisClosureDigest",
	"backendPluginClosureDigest",
	"modelAdapterClosureDigest",
	"delegateAdapterClosureDigest",
	"runnerArtifactDigest",
] as const;

const RUNNER_BUNDLE_QUALIFICATION_KEYS = [
	"manifest",
	"bundleDigest",
	"qualificationSuiteDigest",
	"qualificationEvidenceDigest",
	"qualifiedAt",
] as const;

const RUNNER_BUNDLE_REGISTRY_KEYS = [
	"schemaVersion",
	"generation",
	"generatedAt",
	"activeBundleDigest",
	"bundles",
] as const;

export function resolveExecutionCapabilities(
	input: ExecutionCapabilityInput,
): readonly ExecutionCapabilityDeclaration[] {
	assertKnownCapabilities(input);
	return Object.freeze(
		EXECUTION_CAPABILITY_NAMES.map((capability) => {
			const declaration = input[capability];
			if (declaration === undefined) {
				return Object.freeze({
					capability,
					status: "unavailable" as const,
					reason: "capability_not_declared",
				});
			}
			if (typeof declaration === "string") {
				return normalizedDeclaration({ capability, status: declaration });
			}
			if (declaration.capability !== capability) {
				throw new Error(
					`Execution capability declaration key ${capability} does not match ${declaration.capability}.`,
				);
			}
			return normalizedDeclaration(declaration);
		}),
	);
}

function normalizedDeclaration(
	declaration: ExecutionCapabilityDeclaration,
): Readonly<ExecutionCapabilityDeclaration> {
	if (!EXECUTION_CAPABILITY_NAMES.includes(declaration.capability)) {
		throw new Error(
			`Unsupported execution capability: ${declaration.capability}.`,
		);
	}
	if (!EXECUTION_CAPABILITY_STATUSES.includes(declaration.status)) {
		throw new Error(
			`Unsupported execution capability status: ${declaration.status}.`,
		);
	}
	const reason = declaration.reason?.trim();
	if (declaration.status !== "available" && !reason) {
		throw new Error(
			`Execution capability ${declaration.capability} requires a reason when ${declaration.status}.`,
		);
	}
	return Object.freeze({
		capability: declaration.capability,
		status: declaration.status,
		...(reason ? { reason } : {}),
	});
}

function hasExactKeys(
	value: object,
	expected: readonly string[],
): boolean {
	const keys = Object.keys(value);
	return (
		keys.length === expected.length &&
		expected.every((key) => Object.hasOwn(value, key))
	);
}

function assertKnownCapabilities(input: ExecutionCapabilityInput): void {
	for (const capability of Object.keys(input)) {
		if (
			!EXECUTION_CAPABILITY_NAMES.includes(
				capability as ExecutionCapabilityName,
			)
		) {
			throw new Error(`Unsupported execution capability: ${capability}.`);
		}
	}
}

const EXECUTION_CAPABILITY_STATUSES: readonly ExecutionCapabilityStatus[] = [
	"available",
	"unavailable",
	"indeterminate",
];
