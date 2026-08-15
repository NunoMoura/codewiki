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

export interface ExecutionInvocationOptions {
	readonly signal?: AbortSignal;
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
