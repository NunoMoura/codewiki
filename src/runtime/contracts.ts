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
	assertProducerSkillReceiptShape(receipt);
	assertProducerSkillReceiptHeader(receipt);
	assertProducerSkillReceiptEntries(receipt.skills);
	if (
		expected &&
		canonicalJsonDigest(receipt) !== canonicalJsonDigest(expected)
	) {
		throw new Error("Producer Skill receipt does not match its execution binding.");
	}
}

function assertProducerSkillReceiptShape(receipt: ProducerSkillReceipt): void {
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
}

function assertProducerSkillReceiptHeader(receipt: ProducerSkillReceipt): void {
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
}

function assertProducerSkillReceiptEntries(
	skills: readonly ProducerSkillReceiptEntry[],
): void {
	let previousPackId: string | undefined;
	const names = new Set<string>();
	for (const skill of skills) {
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

export const RUN_PROTOCOL = Object.freeze({
	id: "codewiki.run-process",
	version: "1.0.0",
} as const);

export const RUNTIME_BUILD_SCHEMA_VERSION = "1.0.0" as const;
export const RUNTIME_BUILD_REGISTRY_SCHEMA_VERSION = "1.0.0" as const;

export interface RuntimeBuildManifest {
	readonly schemaVersion: typeof RUNTIME_BUILD_SCHEMA_VERSION;
	readonly runProtocolVersion: string;
	readonly nodeVersion: string;
	readonly dshSourceCommit: string;
	readonly dshPackageClosureDigest: Sha256Digest;
	readonly cordisClosureDigest: Sha256Digest;
	readonly runtimePluginClosureDigest: Sha256Digest;
	readonly modelAdapterClosureDigest: Sha256Digest;
	readonly delegateAdapterClosureDigest: Sha256Digest;
	readonly runtimeArtifactDigest: Sha256Digest;
}

export interface QualifiedRuntimeBuild {
	readonly manifest: RuntimeBuildManifest;
	readonly buildDigest: Sha256Digest;
	readonly qualificationSuiteDigest: Sha256Digest;
	readonly qualificationEvidenceDigest: Sha256Digest;
	readonly qualifiedAt: string;
}

export interface RuntimeBuildRegistrySnapshot {
	readonly schemaVersion: typeof RUNTIME_BUILD_REGISTRY_SCHEMA_VERSION;
	readonly generation: number;
	readonly generatedAt: string;
	readonly activeBuildDigest: Sha256Digest | null;
	readonly builds: readonly QualifiedRuntimeBuild[];
}

export interface RuntimeBuildBinding {
	readonly buildDigest: Sha256Digest;
	readonly runProtocolVersion: string;
}

export interface RunProcessHandshake {
	readonly runProtocolId: typeof RUN_PROTOCOL.id;
	readonly runProtocolVersion: string;
	readonly runtimeBuildDigest: Sha256Digest;
}

export function admitRunProcessHandshake(
	binding: RuntimeBuildBinding,
	value: unknown,
): Readonly<RunProcessHandshake> {
	assertRuntimeBuildBinding(binding);
	if (
		!value ||
		typeof value !== "object" ||
		!hasExactKeys(value, [
			"runProtocolId",
			"runProtocolVersion",
			"runtimeBuildDigest",
		])
	) {
		throw new Error("Run Process handshake shape is invalid.");
	}
	const handshake = value as Record<string, unknown>;
	if (handshake.runProtocolId !== RUN_PROTOCOL.id) {
		throw new Error("Run Process protocol identity is unsupported.");
	}
	assertVersion(
		handshake.runProtocolVersion,
		"Run Process protocol version",
	);
	if (handshake.runProtocolVersion !== binding.runProtocolVersion) {
		throw new Error(
			"Run Process protocol does not match the bound Run protocol.",
		);
	}
	const runtimeBuildDigest = assertSha256Digest(
		handshake.runtimeBuildDigest,
		"Run Process build digest",
	);
	if (runtimeBuildDigest !== binding.buildDigest) {
		throw new Error(
			"Run Process build does not match the bound Runtime Build.",
		);
	}
	return Object.freeze({
		runProtocolId: RUN_PROTOCOL.id,
		runProtocolVersion: handshake.runProtocolVersion,
		runtimeBuildDigest,
	});
}

export const RUN_REQUEST_SCHEMA_VERSION = "1.0.0" as const;

export type RunCustody = "backend-owned" | "backend-delegated";
export type RunRole =
	| "decision-producer"
	| "planning-producer"
	| "implementation-worker"
	| "review-producer"
	| "decision-research"
	| "model-check";
export type RunToolMode = "none" | "admitted";

export interface RunRawLogReference {
	readonly encoding: "jsonl" | "jsonl-zstd";
	readonly formatVersion: number;
	readonly sessionId: string;
	readonly storageId: string;
	readonly byteLength: number;
	readonly digest: Sha256Digest;
	readonly runtimeBuildDigest: Sha256Digest;
}

export type RunSessionBinding =
	| {
			readonly mode: "create";
			readonly sessionId: string;
			readonly resumeLog: null;
	  }
	| {
			readonly mode: "resume";
			readonly sessionId: string;
			readonly resumeLog: RunRawLogReference;
	  };

export interface RunModelRouteBinding {
	readonly provider: string;
	readonly model: string;
	readonly optionsDigest: Sha256Digest;
	readonly routeDigest: Sha256Digest;
}

export interface RunInputBindings {
	readonly stageContextDigest: Sha256Digest;
	readonly staticInputManifestDigest: Sha256Digest;
	readonly systemPromptDigest: Sha256Digest;
	readonly promptDigest: Sha256Digest;
	readonly producerSkillSetDigest: Sha256Digest | null;
	readonly toolMode: RunToolMode;
	readonly toolSetDigest: Sha256Digest;
	readonly modelRoute: RunModelRouteBinding;
}

export type RunWorkspaceBinding =
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

export interface RunBudget {
	readonly timeoutMs: number;
	readonly maxModelRequests: number;
	readonly maxToolCalls: number;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;
}

export interface RunRequestInput {
	readonly runId: string;
	readonly operationId: string;
	readonly custody: RunCustody;
	readonly role: RunRole;
	readonly stage: CheckStage;
	readonly subject: {
		readonly id: string;
		readonly digest: Sha256Digest;
	};
	readonly runtimeBuild: RuntimeBuildBinding;
	readonly session: RunSessionBinding;
	readonly inputs: RunInputBindings;
	readonly workspace: RunWorkspaceBinding;
	readonly budget: RunBudget;
	readonly createdAt: string;
	readonly deadlineAt: string;
}

export interface RunRequest extends RunRequestInput {
	readonly schemaVersion: typeof RUN_REQUEST_SCHEMA_VERSION;
	readonly requestDigest: Sha256Digest;
}

export function createRunRawLogReference(
	value: RunRawLogReference,
): Readonly<RunRawLogReference> {
	if (!hasExactKeys(value, RUN_RAW_LOG_KEYS)) {
		throw new Error("Run raw-log reference shape is invalid.");
	}
	if (value.encoding !== "jsonl" && value.encoding !== "jsonl-zstd") {
		throw new Error("Run raw-log encoding is invalid.");
	}
	assertNonNegativeInteger(value.formatVersion, "Run raw-log formatVersion");
	assertIdentifier(value.sessionId, "Run raw-log sessionId");
	assertIdentifier(value.storageId, "Run raw-log storageId");
	assertPositiveInteger(value.byteLength, "Run raw-log byteLength");
	return Object.freeze({
		encoding: value.encoding,
		formatVersion: value.formatVersion,
		sessionId: value.sessionId,
		storageId: value.storageId,
		byteLength: value.byteLength,
		digest: assertSha256Digest(value.digest, "Run raw-log digest"),
		runtimeBuildDigest: assertSha256Digest(
			value.runtimeBuildDigest,
			"Run raw-log Runtime Build digest",
		),
	});
}

export function createRunRequest(
	value: RunRequestInput,
): Readonly<RunRequest> {
	if (!hasExactKeys(value, RUN_REQUEST_INPUT_KEYS)) {
		throw new Error("Run Request shape is invalid.");
	}
	assertIdentifier(value.runId, "Run runId");
	assertIdentifier(value.operationId, "Run operationId");
	if (value.custody !== "backend-owned" && value.custody !== "backend-delegated") {
		throw new Error("Run custody is invalid.");
	}
	assertRunRoleStage(value.role, value.stage);
	if (value.role === "model-check" && value.custody !== "backend-owned") {
		throw new Error("Model Check Runs must use backend-owned custody.");
	}
	const subject = normalizeRunSubject(value.subject);
	assertRuntimeBuildBinding(value.runtimeBuild);
	const runtimeBuild = Object.freeze({...value.runtimeBuild});
	const session = normalizeRunSession(value.session, runtimeBuild);
	const inputs = normalizeRunInputs(value.inputs, value.role);
	const workspace = normalizeRunWorkspace(value.workspace, value.role);
	const budget = normalizeRunBudget(value.budget, inputs.toolMode);
	const createdAt = assertTimestamp(value.createdAt, "Run createdAt");
	const deadlineAt = assertTimestamp(value.deadlineAt, "Run deadlineAt");
	if (Date.parse(deadlineAt) <= Date.parse(createdAt)) {
		throw new Error("Run deadlineAt must be later than createdAt.");
	}
	const body = Object.freeze({
		schemaVersion: RUN_REQUEST_SCHEMA_VERSION,
		runId: value.runId,
		operationId: value.operationId,
		custody: value.custody,
		role: value.role,
		stage: value.stage,
		subject,
		runtimeBuild,
		session,
		inputs,
		workspace,
		budget,
		createdAt,
		deadlineAt,
	});
	return Object.freeze({...body, requestDigest: canonicalJsonDigest(body)});
}

export const RUN_RECEIPT_SCHEMA_VERSION = "1.0.0" as const;

export const RUN_EVENT_KINDS = Object.freeze([
	"accepted",
	"process-started",
	"session-event",
	"cancellation-requested",
	"quiescent",
	"receipt-committed",
] as const);

export type RunEventKind = (typeof RUN_EVENT_KINDS)[number];
export type RunCancellationReason =
	| "user"
	| "deadline"
	| "runtime-shutdown"
	| "superseded"
	| "policy-stop";
export type RunOutcome = "completed" | "failed" | "cancelled" | "stopped";
export type RunCustodyGap =
	| "delegate-prompts"
	| "delegate-tools"
	| "delegate-model-route"
	| "delegate-usage"
	| "delegate-trace"
	| "delegate-memory"
	| "delegate-settings";
export type RunOperationalGap =
	| "raw-log-unavailable"
	| "execution-ledger-incomplete"
	| "quiescence-unproven";

export interface RunHandle {
	readonly runId: string;
	readonly requestDigest: Sha256Digest;
	readonly custody: RunCustody;
	readonly runtimeBuild: RuntimeBuildBinding;
	readonly sessionId: string;
	readonly acceptedAt: string;
}

export interface RunEvent {
	readonly runId: string;
	readonly requestDigest: Sha256Digest;
	readonly sequence: number;
	readonly kind: RunEventKind;
	readonly occurredAt: string;
	readonly payloadDigest: Sha256Digest;
}

export interface RunCancellationRequest {
	readonly runId: string;
	readonly requestDigest: Sha256Digest;
	readonly expectedEventSequence: number;
	readonly reason: RunCancellationReason;
	readonly requestedAt: string;
}

export interface RunQuiescence {
	readonly runId: string;
	readonly requestDigest: Sha256Digest;
	readonly finalEventSequence: number;
	readonly quiescedAt: string;
	readonly proofDigest: Sha256Digest;
	readonly rawLog: RunRawLogReference | null;
}

export interface RunProcessResultInput {
	readonly runId: string;
	readonly requestDigest: Sha256Digest;
	readonly outcome: Exclude<RunOutcome, "stopped">;
	readonly startedAt: string;
	readonly finishedAt: string;
	readonly executionLedgerDigest: Sha256Digest;
	readonly outputDigest: Sha256Digest | null;
	readonly usageDigest: Sha256Digest | null;
	readonly cancellationDigest: Sha256Digest | null;
	readonly custodyGaps: readonly RunCustodyGap[];
}

export interface RunProcessResult extends RunProcessResultInput {
	readonly resultDigest: Sha256Digest;
}

export interface RunReceiptInput {
	readonly handle: RunHandle;
	readonly outcome: RunOutcome;
	readonly finalEventSequence: number;
	readonly startedAt: string;
	readonly finishedAt: string;
	readonly executionLedgerDigest: Sha256Digest | null;
	readonly rawLog: RunRawLogReference | null;
	readonly outputDigest: Sha256Digest | null;
	readonly usageDigest: Sha256Digest | null;
	readonly cancellationDigest: Sha256Digest | null;
	readonly quiescenceDigest: Sha256Digest | null;
	readonly custodyGaps: readonly RunCustodyGap[];
	readonly operationalGaps: readonly RunOperationalGap[];
}

export interface RunReceipt
	extends Omit<RunReceiptInput, "handle">,
		RunHandle {
	readonly schemaVersion: typeof RUN_RECEIPT_SCHEMA_VERSION;
	readonly receiptDigest: Sha256Digest;
}

export function createRunHandle(
	request: RunRequest,
	acceptedAtValue: string,
): Readonly<RunHandle> {
	assertRunRequest(request);
	const acceptedAt = assertTimestamp(acceptedAtValue, "Run acceptedAt");
	if (
		Date.parse(acceptedAt) < Date.parse(request.createdAt) ||
		Date.parse(acceptedAt) >= Date.parse(request.deadlineAt)
	) {
		throw new Error("Run acceptedAt is outside its Run Request window.");
	}
	return Object.freeze({
		runId: request.runId,
		requestDigest: request.requestDigest,
		custody: request.custody,
		runtimeBuild: Object.freeze({...request.runtimeBuild}),
		sessionId: request.session.sessionId,
		acceptedAt,
	});
}

export function createRunEvent(
	handle: RunHandle,
	value: {
		readonly sequence: number;
		readonly kind: RunEventKind;
		readonly occurredAt: string;
		readonly payloadDigest: Sha256Digest;
	},
): Readonly<RunEvent> {
	assertRunHandle(handle);
	assertNonNegativeInteger(value.sequence, "Run event sequence");
	if (!RUN_EVENT_KINDS.includes(value.kind)) {
		throw new Error("Run event kind is invalid.");
	}
	const occurredAt = assertTimestamp(value.occurredAt, "Run event occurredAt");
	assertNotBeforeAcceptance(handle, occurredAt, "Run event");
	return Object.freeze({
		runId: handle.runId,
		requestDigest: handle.requestDigest,
		sequence: value.sequence,
		kind: value.kind,
		occurredAt,
		payloadDigest: assertSha256Digest(
			value.payloadDigest,
			"Run event payload digest",
		),
	});
}

export function createRunCancellationRequest(
	handle: RunHandle,
	value: {
		readonly expectedEventSequence: number;
		readonly reason: RunCancellationReason;
		readonly requestedAt: string;
	},
): Readonly<RunCancellationRequest> {
	assertRunHandle(handle);
	assertNonNegativeInteger(
		value.expectedEventSequence,
		"Run cancellation expectedEventSequence",
	);
	if (!RUN_CANCELLATION_REASONS.includes(value.reason)) {
		throw new Error("Run cancellation reason is invalid.");
	}
	const requestedAt = assertTimestamp(
		value.requestedAt,
		"Run cancellation requestedAt",
	);
	assertNotBeforeAcceptance(handle, requestedAt, "Run cancellation");
	return Object.freeze({
		runId: handle.runId,
		requestDigest: handle.requestDigest,
		expectedEventSequence: value.expectedEventSequence,
		reason: value.reason,
		requestedAt,
	});
}

export function createRunQuiescence(
	handle: RunHandle,
	value: {
		readonly finalEventSequence: number;
		readonly quiescedAt: string;
		readonly proofDigest: Sha256Digest;
		readonly rawLog: RunRawLogReference | null;
	},
): Readonly<RunQuiescence> {
	assertRunHandle(handle);
	assertNonNegativeInteger(
		value.finalEventSequence,
		"Run quiescence finalEventSequence",
	);
	const quiescedAt = assertTimestamp(value.quiescedAt, "Run quiescedAt");
	assertNotBeforeAcceptance(handle, quiescedAt, "Run quiescence");
	return Object.freeze({
		runId: handle.runId,
		requestDigest: handle.requestDigest,
		finalEventSequence: value.finalEventSequence,
		quiescedAt,
		proofDigest: assertSha256Digest(
			value.proofDigest,
			"Run quiescence proof digest",
		),
		rawLog:
			value.rawLog === null
				? null
				: rawLogForHandle(handle, createRunRawLogReference(value.rawLog)),
	});
}

export function createRunProcessResult(
	handle: RunHandle,
	value: RunProcessResultInput,
): Readonly<RunProcessResult> {
	assertRunHandle(handle);
	if (!hasExactKeys(value, RUN_PROCESS_RESULT_INPUT_KEYS)) {
		throw new Error("Run Process result shape is invalid.");
	}
	if (value.runId !== handle.runId || value.requestDigest !== handle.requestDigest) {
		throw new Error("Run Process result does not match its Run handle.");
	}
	if (!RUN_PROCESS_OUTCOMES.includes(value.outcome)) {
		throw new Error("Run Process result outcome is invalid.");
	}
	const startedAt = assertTimestamp(value.startedAt, "Run Process result startedAt");
	const finishedAt = assertTimestamp(value.finishedAt, "Run Process result finishedAt");
	assertNotBeforeAcceptance(handle, startedAt, "Run Process result start");
	if (Date.parse(finishedAt) < Date.parse(startedAt)) {
		throw new Error("Run Process result finishedAt precedes startedAt.");
	}
	const executionLedgerDigest = assertSha256Digest(
		value.executionLedgerDigest,
		"Run Process Execution Ledger digest",
	);
	const outputDigest = optionalSha256Digest(
		value.outputDigest,
		"Run Process output digest",
	);
	if (value.outcome === "completed" && outputDigest === null) {
		throw new Error("Completed Run Process results require an output digest.");
	}
	const cancellationDigest = optionalSha256Digest(
		value.cancellationDigest,
		"Run Process cancellation digest",
	);
	if (value.outcome === "cancelled" && cancellationDigest === null) {
		throw new Error("Cancelled Run Process results require a cancellation digest.");
	}
	const custodyGaps = normalizedRunGapList(
		value.custodyGaps,
		RUN_CUSTODY_GAPS,
		"Run Process result custody gaps",
	);
	assertRunReceiptCustody(handle.custody, custodyGaps);
	const body = Object.freeze({
		runId: handle.runId,
		requestDigest: handle.requestDigest,
		outcome: value.outcome,
		startedAt,
		finishedAt,
		executionLedgerDigest,
		outputDigest,
		usageDigest: optionalSha256Digest(
			value.usageDigest,
			"Run Process usage digest",
		),
		cancellationDigest,
		custodyGaps,
	});
	return Object.freeze({...body, resultDigest: canonicalJsonDigest(body)});
}

export function createRunReceipt(
	value: RunReceiptInput,
): Readonly<RunReceipt> {
	if (!hasExactKeys(value, RUN_RECEIPT_INPUT_KEYS)) {
		throw new Error("Run Receipt shape is invalid.");
	}
	assertRunHandle(value.handle);
	if (!RUN_OUTCOMES.includes(value.outcome)) {
		throw new Error("Run receipt outcome is invalid.");
	}
	assertNonNegativeInteger(
		value.finalEventSequence,
		"Run receipt finalEventSequence",
	);
	const startedAt = assertTimestamp(value.startedAt, "Run receipt startedAt");
	const finishedAt = assertTimestamp(value.finishedAt, "Run receipt finishedAt");
	assertNotBeforeAcceptance(value.handle, startedAt, "Run receipt start");
	if (Date.parse(finishedAt) < Date.parse(startedAt)) {
		throw new Error("Run receipt finishedAt precedes startedAt.");
	}
	const custodyGaps = normalizedRunGapList(
		value.custodyGaps,
		RUN_CUSTODY_GAPS,
		"Run custody gaps",
	);
	const operationalGaps = normalizedRunGapList(
		value.operationalGaps,
		RUN_OPERATIONAL_GAPS,
		"Run operational gaps",
	);
	assertRunReceiptCustody(value.handle.custody, custodyGaps);
	if (operationalGaps.length > 0 && value.outcome !== "stopped") {
		throw new Error("Operationally incomplete Runs must be stopped.");
	}
	const executionLedgerDigest = optionalSha256Digest(
		value.executionLedgerDigest,
		"Run Execution Ledger digest",
	);
	const rawLog =
		value.rawLog === null
			? null
			: rawLogForHandle(value.handle, createRunRawLogReference(value.rawLog));
	const quiescenceDigest = optionalSha256Digest(
		value.quiescenceDigest,
		"Run quiescence digest",
	);
	assertRunReceiptGapAgreement({
		operationalGaps,
		executionLedgerDigest,
		rawLog,
		quiescenceDigest,
	});
	const outputDigest = optionalSha256Digest(
		value.outputDigest,
		"Run output digest",
	);
	if (value.outcome === "completed" && outputDigest === null) {
		throw new Error("Completed Runs require an output digest.");
	}
	const cancellationDigest = optionalSha256Digest(
		value.cancellationDigest,
		"Run cancellation digest",
	);
	if (value.outcome === "cancelled" && cancellationDigest === null) {
		throw new Error("Cancelled Runs require a cancellation digest.");
	}
	const body = Object.freeze({
		schemaVersion: RUN_RECEIPT_SCHEMA_VERSION,
		runId: value.handle.runId,
		requestDigest: value.handle.requestDigest,
		custody: value.handle.custody,
		runtimeBuild: Object.freeze({...value.handle.runtimeBuild}),
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
			"Run usage digest",
		),
		cancellationDigest,
		quiescenceDigest,
		custodyGaps,
		operationalGaps,
	});
	return Object.freeze({...body, receiptDigest: canonicalJsonDigest(body)});
}

function assertRunRequest(
	value: RunRequest,
): void {
	if (!hasExactKeys(value, RUN_REQUEST_KEYS)) {
		throw new Error("Run Request persisted shape is invalid.");
	}
	const {schemaVersion, requestDigest, ...input} = value;
	if (schemaVersion !== RUN_REQUEST_SCHEMA_VERSION) {
		throw new Error("Run Request schemaVersion is invalid.");
	}
	assertSha256Digest(requestDigest, "Run Request digest");
	const expected = createRunRequest(input);
	if (requestDigest !== expected.requestDigest) {
		throw new Error("Run Request digest does not match its content.");
	}
}

function assertRunHandle(value: RunHandle): void {
	if (!hasExactKeys(value, RUN_HANDLE_KEYS)) {
		throw new Error("Run handle shape is invalid.");
	}
	assertIdentifier(value.runId, "Run handle runId");
	assertSha256Digest(value.requestDigest, "Run handle request digest");
	if (value.custody !== "backend-owned" && value.custody !== "backend-delegated") {
		throw new Error("Run handle custody is invalid.");
	}
	assertRuntimeBuildBinding(value.runtimeBuild);
	assertIdentifier(value.sessionId, "Run handle sessionId");
	assertTimestamp(value.acceptedAt, "Run handle acceptedAt");
}

function rawLogForHandle(
	handle: RunHandle,
	rawLog: RunRawLogReference,
): RunRawLogReference {
	if (rawLog.sessionId !== handle.sessionId) {
		throw new Error("Run raw log does not match the handle session.");
	}
	if (rawLog.runtimeBuildDigest !== handle.runtimeBuild.buildDigest) {
		throw new Error("Run raw log does not match the handle Runtime Build.");
	}
	return rawLog;
}

function assertNotBeforeAcceptance(
	handle: RunHandle,
	timestamp: string,
	label: string,
): void {
	if (Date.parse(timestamp) < Date.parse(handle.acceptedAt)) {
		throw new Error(`${label} precedes acceptance.`);
	}
}

function normalizedRunGapList<T extends string>(
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

function assertRunReceiptCustody(
	custody: RunCustody,
	gaps: readonly RunCustodyGap[],
): void {
	if (custody === "backend-owned" && gaps.length > 0) {
		throw new Error(
			"Backend-owned Run Receipts cannot declare delegated custody gaps.",
		);
	}
	if (custody === "backend-delegated" && gaps.length === 0) {
		throw new Error("Backend-delegated Run Receipts must declare custody gaps.");
	}
}

function assertRunReceiptGapAgreement(input: {
	readonly operationalGaps: readonly RunOperationalGap[];
	readonly executionLedgerDigest: Sha256Digest | null;
	readonly rawLog: RunRawLogReference | null;
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
	gaps: readonly RunOperationalGap[],
	gap: RunOperationalGap,
	value: unknown,
	label: string,
): void {
	if ((value === null) !== gaps.includes(gap)) {
		throw new Error(`Run ${label} availability disagrees with operational gaps.`);
	}
}

function optionalSha256Digest(
	value: Sha256Digest | null,
	field: string,
): Sha256Digest | null {
	return value === null ? null : assertSha256Digest(value, field);
}

const RUN_CANCELLATION_REASONS = Object.freeze([
	"user",
	"deadline",
	"runtime-shutdown",
	"superseded",
	"policy-stop",
] as const);
const RUN_OUTCOMES = Object.freeze([
	"completed",
	"failed",
	"cancelled",
	"stopped",
] as const);
const RUN_PROCESS_OUTCOMES: readonly string[] = Object.freeze([
	"completed",
	"failed",
	"cancelled",
]);
const RUN_CUSTODY_GAPS = Object.freeze([
	"delegate-prompts",
	"delegate-tools",
	"delegate-model-route",
	"delegate-usage",
	"delegate-trace",
	"delegate-memory",
	"delegate-settings",
] as const);
const RUN_OPERATIONAL_GAPS = Object.freeze([
	"raw-log-unavailable",
	"execution-ledger-incomplete",
	"quiescence-unproven",
] as const);

const RUN_REQUEST_KEYS = [
	"schemaVersion",
	"runId",
	"operationId",
	"custody",
	"role",
	"stage",
	"subject",
	"runtimeBuild",
	"session",
	"inputs",
	"workspace",
	"budget",
	"createdAt",
	"deadlineAt",
	"requestDigest",
] as const;
const RUN_HANDLE_KEYS = [
	"runId",
	"requestDigest",
	"custody",
	"runtimeBuild",
	"sessionId",
	"acceptedAt",
] as const;
const RUN_PROCESS_RESULT_INPUT_KEYS = [
	"runId",
	"requestDigest",
	"outcome",
	"startedAt",
	"finishedAt",
	"executionLedgerDigest",
	"outputDigest",
	"usageDigest",
	"cancellationDigest",
	"custodyGaps",
] as const;
const RUN_RECEIPT_INPUT_KEYS = [
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

function normalizeRunSubject(
	value: RunRequestInput["subject"],
): RunRequestInput["subject"] {
	if (!hasExactKeys(value, ["id", "digest"])) {
		throw new Error("Run subject shape is invalid.");
	}
	assertIdentifier(value.id, "Run subject id");
	return Object.freeze({
		id: value.id,
		digest: assertSha256Digest(value.digest, "Run subject digest"),
	});
}

function normalizeRunSession(
	value: RunSessionBinding,
	runtimeBuild: RuntimeBuildBinding,
): RunSessionBinding {
	if (!hasExactKeys(value, ["mode", "sessionId", "resumeLog"])) {
		throw new Error("Run session shape is invalid.");
	}
	assertIdentifier(value.sessionId, "Run sessionId");
	if (value.mode === "create") {
		if (value.resumeLog !== null) {
			throw new Error("New Run sessions cannot carry a resume log.");
		}
		return Object.freeze({mode: "create", sessionId: value.sessionId, resumeLog: null});
	}
	if (value.mode !== "resume" || !value.resumeLog) {
		throw new Error("Run session mode is invalid.");
	}
	const resumeLog = createRunRawLogReference(value.resumeLog);
	if (resumeLog.sessionId !== value.sessionId) {
		throw new Error("Resume log session does not match the Run session.");
	}
	if (resumeLog.runtimeBuildDigest !== runtimeBuild.buildDigest) {
		throw new Error(
			"Resume log Runtime Build does not match the Run binding.",
		);
	}
	return Object.freeze({mode: "resume", sessionId: value.sessionId, resumeLog});
}

function normalizeRunInputs(
	value: RunInputBindings,
	role: RunRole,
): RunInputBindings {
	if (!hasExactKeys(value, RUN_INPUT_KEYS)) {
		throw new Error("Run input bindings shape is invalid.");
	}
	const producerSkillSetDigest =
		value.producerSkillSetDigest === null
			? null
			: assertSha256Digest(
					value.producerSkillSetDigest,
					"Run producer Skill set digest",
				);
	if (value.toolMode !== "none" && value.toolMode !== "admitted") {
		throw new Error("Run toolMode is invalid.");
	}
	if (
		role === "model-check" &&
		(producerSkillSetDigest !== null || value.toolMode !== "none")
	) {
		throw new Error("Model Check Runs cannot receive producer Skills or tools.");
	}
	return Object.freeze({
		stageContextDigest: assertSha256Digest(
			value.stageContextDigest,
			"Run Stage Context digest",
		),
		staticInputManifestDigest: assertSha256Digest(
			value.staticInputManifestDigest,
			"Run static input manifest digest",
		),
		systemPromptDigest: assertSha256Digest(
			value.systemPromptDigest,
			"Run system prompt digest",
		),
		promptDigest: assertSha256Digest(value.promptDigest, "Run prompt digest"),
		producerSkillSetDigest,
		toolMode: value.toolMode,
		toolSetDigest: assertSha256Digest(
			value.toolSetDigest,
			"Run tool set digest",
		),
		modelRoute: normalizeRunModelRoute(value.modelRoute),
	});
}

function normalizeRunModelRoute(
	value: RunModelRouteBinding,
): RunModelRouteBinding {
	if (!hasExactKeys(value, ["provider", "model", "optionsDigest", "routeDigest"])) {
		throw new Error("Run model route shape is invalid.");
	}
	assertBoundedText(value.provider, "Run model provider", 128);
	assertBoundedText(value.model, "Run model", 256);
	const optionsDigest = assertSha256Digest(
		value.optionsDigest,
		"Run model options digest",
	);
	const routeDigest = assertSha256Digest(value.routeDigest, "Run model route digest");
	if (
		routeDigest !==
		canonicalJsonDigest({provider: value.provider, model: value.model, optionsDigest})
	) {
		throw new Error("Run model route digest does not match its route.");
	}
	return Object.freeze({
		provider: value.provider,
		model: value.model,
		optionsDigest,
		routeDigest,
	});
}

function normalizeRunWorkspace(
	value: RunWorkspaceBinding,
	role: RunRole,
): RunWorkspaceBinding {
	if (value.kind === "immutable") {
		if (!hasExactKeys(value, ["kind", "repositorySnapshotDigest"])) {
			throw new Error("Immutable Run workspace shape is invalid.");
		}
		if (role === "implementation-worker") {
			throw new Error(
				"Implementation Worker Runs require Project Server Workbench custody.",
			);
		}
		return Object.freeze({
			kind: "immutable",
			repositorySnapshotDigest: assertSha256Digest(
				value.repositorySnapshotDigest,
				"Run repository snapshot digest",
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
		throw new Error("Run Workbench shape is invalid.");
	}
	if (role !== "implementation-worker") {
		throw new Error("Only Implementation Worker Runs may receive a Project Server Workbench.");
	}
	assertIdentifier(value.assignmentId, "Run Assignment id");
	assertIdentifier(value.workbenchRef, "Run Workbench ref");
	return Object.freeze({
		kind: "runtime-workbench",
		repositorySnapshotDigest: assertSha256Digest(
			value.repositorySnapshotDigest,
			"Run repository snapshot digest",
		),
		assignmentId: value.assignmentId,
		workbenchRef: value.workbenchRef,
	});
}

function normalizeRunBudget(
	value: RunBudget,
	toolMode: RunToolMode,
): RunBudget {
	if (!hasExactKeys(value, RUN_BUDGET_KEYS)) {
		throw new Error("Run budget shape is invalid.");
	}
	assertPositiveInteger(value.timeoutMs, "Run timeoutMs");
	assertPositiveInteger(value.maxModelRequests, "Run maxModelRequests");
	assertNonNegativeInteger(value.maxToolCalls, "Run maxToolCalls");
	assertPositiveInteger(value.maxInputTokens, "Run maxInputTokens");
	assertPositiveInteger(value.maxOutputTokens, "Run maxOutputTokens");
	if (toolMode === "none" && value.maxToolCalls !== 0) {
		throw new Error("Tool-free Runs require maxToolCalls 0.");
	}
	if (toolMode === "admitted" && value.maxToolCalls === 0) {
		throw new Error("Tool-admitted Runs require a positive maxToolCalls budget.");
	}
	return Object.freeze({...value});
}

function assertRunRoleStage(role: RunRole, stage: CheckStage): void {
	const expectedStage: Readonly<Record<Exclude<RunRole, "model-check">, CheckStage>> = {
		"decision-producer": "decision",
		"planning-producer": "planning",
		"implementation-worker": "implementation",
		"review-producer": "review",
		"decision-research": "decision",
	};
	if (role === "model-check") {
		if (!["decision", "planning", "implementation", "review"].includes(stage)) {
			throw new Error("Model Check Run stage is invalid.");
		}
		return;
	}
	if (!(role in expectedStage) || expectedStage[role] !== stage) {
		throw new Error(`Run role ${role} does not match stage ${stage}.`);
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

const RUN_RAW_LOG_KEYS = [
	"encoding",
	"formatVersion",
	"sessionId",
	"storageId",
	"byteLength",
	"digest",
	"runtimeBuildDigest",
] as const;

const RUN_REQUEST_INPUT_KEYS = [
	"runId",
	"operationId",
	"custody",
	"role",
	"stage",
	"subject",
	"runtimeBuild",
	"session",
	"inputs",
	"workspace",
	"budget",
	"createdAt",
	"deadlineAt",
] as const;

const RUN_INPUT_KEYS = [
	"stageContextDigest",
	"staticInputManifestDigest",
	"systemPromptDigest",
	"promptDigest",
	"producerSkillSetDigest",
	"toolMode",
	"toolSetDigest",
	"modelRoute",
] as const;

const RUN_BUDGET_KEYS = [
	"timeoutMs",
	"maxModelRequests",
	"maxToolCalls",
	"maxInputTokens",
	"maxOutputTokens",
] as const;

export function createRuntimeBuildManifest(
	input: RuntimeBuildManifest,
): RuntimeBuildManifest {
	if (!hasExactKeys(input, RUNTIME_BUILD_MANIFEST_KEYS)) {
		throw new Error("Runtime Build manifest shape is invalid.");
	}
	if (input.schemaVersion !== RUNTIME_BUILD_SCHEMA_VERSION) {
		throw new Error("Runtime Build manifest schemaVersion is invalid.");
	}
	assertVersion(input.runProtocolVersion, "Run protocol version");
	assertVersion(input.nodeVersion, "Runtime Build Node version");
	if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.dshSourceCommit)) {
		throw new Error(
			"Runtime Build DSH source commit must be a lowercase full Git object id.",
		);
	}
	for (const field of RUNTIME_BUILD_DIGEST_FIELDS) {
		assertSha256Digest(input[field], `Runtime Build ${field}`);
	}
	return Object.freeze({...input});
}

export function createQualifiedRuntimeBuild(input: {
	readonly manifest: RuntimeBuildManifest;
	readonly qualificationSuiteDigest: Sha256Digest;
	readonly qualificationEvidenceDigest: Sha256Digest;
	readonly qualifiedAt: string;
}): QualifiedRuntimeBuild {
	const manifest = createRuntimeBuildManifest(input.manifest);
	return Object.freeze({
		manifest,
		buildDigest: canonicalJsonDigest(manifest),
		qualificationSuiteDigest: assertSha256Digest(
			input.qualificationSuiteDigest,
			"Runtime Build qualification suite digest",
		),
		qualificationEvidenceDigest: assertSha256Digest(
			input.qualificationEvidenceDigest,
			"Runtime Build qualification Evidence digest",
		),
		qualifiedAt: assertTimestamp(input.qualifiedAt, "Runtime Build qualifiedAt"),
	});
}

export function createRuntimeBuildRegistrySnapshot(input: {
	readonly generatedAt: string;
}): RuntimeBuildRegistrySnapshot {
	return Object.freeze({
		schemaVersion: RUNTIME_BUILD_REGISTRY_SCHEMA_VERSION,
		generation: 0,
		generatedAt: assertTimestamp(
			input.generatedAt,
			"Runtime Build registry generatedAt",
		),
		activeBuildDigest: null,
		builds: Object.freeze([]),
	});
}

export function qualifyRuntimeBuild(input: {
	readonly registry: RuntimeBuildRegistrySnapshot;
	readonly expectedGeneration: number;
	readonly build: QualifiedRuntimeBuild;
	readonly generatedAt: string;
}): RuntimeBuildRegistrySnapshot {
	assertRuntimeBuildRegistrySnapshot(input.registry);
	assertRegistryGeneration(input.registry, input.expectedGeneration);
	assertQualifiedRuntimeBuild(input.build);
	if (
		input.registry.builds.some(
			(build) => build.buildDigest === input.build.buildDigest,
		)
	) {
		throw new Error(`Runtime Build ${input.build.buildDigest} is already qualified.`);
	}
	if (input.registry.builds.length >= 64) {
		throw new Error("Runtime Build registry exceeds its qualified build limit.");
	}
	return nextRuntimeBuildRegistrySnapshot({
		registry: input.registry,
		generatedAt: input.generatedAt,
		activeBuildDigest: input.registry.activeBuildDigest,
		builds: [...input.registry.builds, input.build],
	});
}

export function activateRuntimeBuild(input: {
	readonly registry: RuntimeBuildRegistrySnapshot;
	readonly expectedGeneration: number;
	readonly buildDigest: Sha256Digest;
	readonly generatedAt: string;
}): RuntimeBuildRegistrySnapshot {
	assertRuntimeBuildRegistrySnapshot(input.registry);
	assertRegistryGeneration(input.registry, input.expectedGeneration);
	const buildDigest = assertSha256Digest(
		input.buildDigest,
		"Runtime Build activation digest",
	);
	const build = input.registry.builds.find(
		(entry) => entry.buildDigest === buildDigest,
	);
	if (!build) throw new Error(`Runtime Build ${buildDigest} is not qualified.`);
	if (build.manifest.runProtocolVersion !== RUN_PROTOCOL.version) {
		throw new Error(
			`Runtime Build ${buildDigest} uses unsupported Run protocol ${build.manifest.runProtocolVersion}.`,
		);
	}
	if (input.registry.activeBuildDigest === buildDigest) {
		throw new Error(`Runtime Build ${buildDigest} is already active.`);
	}
	return nextRuntimeBuildRegistrySnapshot({
		registry: input.registry,
		generatedAt: input.generatedAt,
		activeBuildDigest: buildDigest,
		builds: input.registry.builds,
	});
}

export function bindActiveRuntimeBuild(
	registry: RuntimeBuildRegistrySnapshot,
): Readonly<RuntimeBuildBinding> {
	assertRuntimeBuildRegistrySnapshot(registry);
	if (!registry.activeBuildDigest) {
		throw new Error("Runtime Build registry has no active qualified build.");
	}
	const build = registry.builds.find(
		(entry) => entry.buildDigest === registry.activeBuildDigest,
	);
	if (!build) throw new Error("Runtime Build registry active binding is invalid.");
	if (build.manifest.runProtocolVersion !== RUN_PROTOCOL.version) {
		throw new Error(
			`Active Runtime Build uses unsupported Run protocol ${build.manifest.runProtocolVersion}.`,
		);
	}
	return Object.freeze({
		buildDigest: build.buildDigest,
		runProtocolVersion: build.manifest.runProtocolVersion,
	});
}

export function resolveRuntimeBuildForResume(
	registry: RuntimeBuildRegistrySnapshot,
	binding: RuntimeBuildBinding,
): QualifiedRuntimeBuild {
	assertRuntimeBuildRegistrySnapshot(registry);
	assertRuntimeBuildBinding(binding);
	const build = registry.builds.find(
		(entry) => entry.buildDigest === binding.buildDigest,
	);
	if (!build) {
		throw new Error("Exact Runtime Build required for resume is unavailable.");
	}
	if (build.manifest.runProtocolVersion !== binding.runProtocolVersion) {
		throw new Error("Run protocol version does not match the bound build.");
	}
	if (binding.runProtocolVersion !== RUN_PROTOCOL.version) {
		throw new Error(
			`Bound Run protocol ${binding.runProtocolVersion} is unsupported by this Runtime.`,
		);
	}
	return build;
}

export function assertRuntimeBuildRegistrySnapshot(
	value: unknown,
): asserts value is RuntimeBuildRegistrySnapshot {
	if (
		!value ||
		typeof value !== "object" ||
		!hasExactKeys(value, RUNTIME_BUILD_REGISTRY_KEYS)
	) {
		throw new Error("Runtime Build registry snapshot shape is invalid.");
	}
	const registry = value as RuntimeBuildRegistrySnapshot;
	if (registry.schemaVersion !== RUNTIME_BUILD_REGISTRY_SCHEMA_VERSION) {
		throw new Error("Runtime Build registry schemaVersion is invalid.");
	}
	if (!Number.isSafeInteger(registry.generation) || registry.generation < 0) {
		throw new Error(
			"Runtime Build registry generation must be a non-negative safe integer.",
		);
	}
	assertTimestamp(registry.generatedAt, "Runtime Build registry generatedAt");
	if (registry.activeBuildDigest !== null) {
		assertSha256Digest(
			registry.activeBuildDigest,
			"Runtime Build registry active build digest",
		);
	}
	assertRuntimeBuildRegistryBuilds(registry);
}

function assertRuntimeBuildRegistryBuilds(
	registry: RuntimeBuildRegistrySnapshot,
): void {
	if (!Array.isArray(registry.builds) || registry.builds.length > 64) {
		throw new Error("Runtime Build registry builds are invalid.");
	}
	let previous: Sha256Digest | undefined;
	for (const value of registry.builds) {
		assertQualifiedRuntimeBuild(value);
		if (previous && value.buildDigest <= previous) {
			throw new Error("Runtime Build registry order or uniqueness is invalid.");
		}
		previous = value.buildDigest;
	}
	if (
		registry.activeBuildDigest &&
		!registry.builds.some(
			(build) => build.buildDigest === registry.activeBuildDigest,
		)
	) {
		throw new Error("Runtime Build registry active build is not qualified.");
	}
}

function assertQualifiedRuntimeBuild(
	value: unknown,
): asserts value is QualifiedRuntimeBuild {
	if (
		!value ||
		typeof value !== "object" ||
		!hasExactKeys(value, RUNTIME_BUILD_QUALIFICATION_KEYS)
	) {
		throw new Error("Qualified Runtime Build shape is invalid.");
	}
	const build = value as QualifiedRuntimeBuild;
	const manifest = createRuntimeBuildManifest(build.manifest);
	assertSha256Digest(build.buildDigest, "Qualified Runtime Build digest");
	if (build.buildDigest !== canonicalJsonDigest(manifest)) {
		throw new Error("Qualified Runtime Build digest does not match its manifest.");
	}
	assertSha256Digest(
		build.qualificationSuiteDigest,
		"Runtime Build qualification suite digest",
	);
	assertSha256Digest(
		build.qualificationEvidenceDigest,
		"Runtime Build qualification Evidence digest",
	);
	assertTimestamp(build.qualifiedAt, "Runtime Build qualifiedAt");
}

function nextRuntimeBuildRegistrySnapshot(input: {
	readonly registry: RuntimeBuildRegistrySnapshot;
	readonly generatedAt: string;
	readonly activeBuildDigest: Sha256Digest | null;
	readonly builds: readonly QualifiedRuntimeBuild[];
}): RuntimeBuildRegistrySnapshot {
	const generatedAt = assertTimestamp(
		input.generatedAt,
		"Runtime Build registry generatedAt",
	);
	if (Date.parse(generatedAt) < Date.parse(input.registry.generatedAt)) {
		throw new Error("Runtime Build registry time cannot move backward.");
	}
	const builds = Object.freeze(
		[...input.builds].sort((left, right) => {
			if (left.buildDigest < right.buildDigest) return -1;
			if (left.buildDigest > right.buildDigest) return 1;
			return 0;
		}),
	);
	const snapshot = Object.freeze({
		schemaVersion: RUNTIME_BUILD_REGISTRY_SCHEMA_VERSION,
		generation: input.registry.generation + 1,
		generatedAt,
		activeBuildDigest: input.activeBuildDigest,
		builds,
	});
	assertRuntimeBuildRegistrySnapshot(snapshot);
	return snapshot;
}

function assertRuntimeBuildBinding(
	value: unknown,
): asserts value is RuntimeBuildBinding {
	if (
		!value ||
		typeof value !== "object" ||
		!hasExactKeys(value, ["buildDigest", "runProtocolVersion"])
	) {
		throw new Error("Runtime Build binding shape is invalid.");
	}
	const binding = value as RuntimeBuildBinding;
	assertSha256Digest(binding.buildDigest, "Runtime Build binding digest");
	assertVersion(
		binding.runProtocolVersion,
		"Runtime Build binding protocol version",
	);
}

function assertRegistryGeneration(
	registry: RuntimeBuildRegistrySnapshot,
	expectedGeneration: number,
): void {
	if (
		!Number.isSafeInteger(expectedGeneration) ||
		expectedGeneration < 0 ||
		registry.generation !== expectedGeneration
	) {
		throw new Error("Runtime Build registry generation conflict.");
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

const RUNTIME_BUILD_MANIFEST_KEYS = [
	"schemaVersion",
	"runProtocolVersion",
	"nodeVersion",
	"dshSourceCommit",
	"dshPackageClosureDigest",
	"cordisClosureDigest",
	"runtimePluginClosureDigest",
	"modelAdapterClosureDigest",
	"delegateAdapterClosureDigest",
	"runtimeArtifactDigest",
] as const;

const RUNTIME_BUILD_DIGEST_FIELDS = [
	"dshPackageClosureDigest",
	"cordisClosureDigest",
	"runtimePluginClosureDigest",
	"modelAdapterClosureDigest",
	"delegateAdapterClosureDigest",
	"runtimeArtifactDigest",
] as const;

const RUNTIME_BUILD_QUALIFICATION_KEYS = [
	"manifest",
	"buildDigest",
	"qualificationSuiteDigest",
	"qualificationEvidenceDigest",
	"qualifiedAt",
] as const;

const RUNTIME_BUILD_REGISTRY_KEYS = [
	"schemaVersion",
	"generation",
	"generatedAt",
	"activeBuildDigest",
	"builds",
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
	const normalized = {
		capability: declaration.capability,
		status: declaration.status,
	};
	return reason
		? Object.freeze({...normalized, reason})
		: Object.freeze(normalized);
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
