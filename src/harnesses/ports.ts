export const HARNESS_CAPABILITY_NAMES = [
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

export type HarnessCapabilityName =
	(typeof HARNESS_CAPABILITY_NAMES)[number];
export type HarnessCapabilityStatus =
	| "available"
	| "unavailable"
	| "indeterminate";

export interface HarnessCapabilityDeclaration {
	readonly capability: HarnessCapabilityName;
	readonly status: HarnessCapabilityStatus;
	readonly reason?: string;
}

export type HarnessCapabilityInput = Partial<
	Record<
		HarnessCapabilityName,
		HarnessCapabilityStatus | HarnessCapabilityDeclaration
	>
>;

export interface HarnessInvocationOptions {
	readonly signal?: AbortSignal;
}

export interface HarnessTimedInvocationOptions {
	readonly signal: AbortSignal;
	readonly timeoutMs: number;
}

export type CandidateProducerPort<TInvocation, TCandidate> = (
	invocation: TInvocation,
	options?: HarnessInvocationOptions,
) => TCandidate | Promise<TCandidate>;

export interface ModelCheckEvaluatorPort<TRequest, TObservation> {
	execute(
		request: TRequest,
		options: HarnessTimedInvocationOptions,
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
	options?: HarnessInvocationOptions,
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

export function resolveHarnessCapabilities(
	input: HarnessCapabilityInput,
): readonly HarnessCapabilityDeclaration[] {
	assertKnownCapabilities(input);
	return Object.freeze(
		HARNESS_CAPABILITY_NAMES.map((capability) => {
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
					`Harness capability declaration key ${capability} does not match ${declaration.capability}.`,
				);
			}
			return normalizedDeclaration(declaration);
		}),
	);
}

function normalizedDeclaration(
	declaration: HarnessCapabilityDeclaration,
): Readonly<HarnessCapabilityDeclaration> {
	if (!HARNESS_CAPABILITY_NAMES.includes(declaration.capability)) {
		throw new Error(
			`Unsupported harness capability: ${declaration.capability}.`,
		);
	}
	if (!HARNESS_CAPABILITY_STATUSES.includes(declaration.status)) {
		throw new Error(
			`Unsupported harness capability status: ${declaration.status}.`,
		);
	}
	const reason = declaration.reason?.trim();
	if (declaration.status !== "available" && !reason) {
		throw new Error(
			`Harness capability ${declaration.capability} requires a reason when ${declaration.status}.`,
		);
	}
	return Object.freeze({
		capability: declaration.capability,
		status: declaration.status,
		...(reason ? { reason } : {}),
	});
}

function assertKnownCapabilities(input: HarnessCapabilityInput): void {
	for (const capability of Object.keys(input)) {
		if (!HARNESS_CAPABILITY_NAMES.includes(capability as HarnessCapabilityName)) {
			throw new Error(`Unsupported harness capability: ${capability}.`);
		}
	}
}

const HARNESS_CAPABILITY_STATUSES: readonly HarnessCapabilityStatus[] = [
	"available",
	"unavailable",
	"indeterminate",
];
