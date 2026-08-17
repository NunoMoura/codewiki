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
