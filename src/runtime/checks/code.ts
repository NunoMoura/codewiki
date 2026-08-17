import type {
	CheckExecutionIdentity,
	CheckInvocation,
} from "../../checks/contracts.ts";
import type {PackagedCheck} from "../../checks/packs/contracts.ts";
import type {
	CheckExecutor,
	CheckExecutorContext,
} from "../../checks/runner.ts";
import {assertSha256Digest} from "../../utils/canonical-json.ts";

export interface CodeCheckSandboxAdmission {
	readonly hermetic: true;
	readonly network: "denied";
	readonly credentials: "none";
	readonly bounded: true;
}

export interface CodeCheckSandboxRequest {
	readonly source: string;
	readonly invocation: CheckInvocation;
	readonly timeoutMs: number;
	readonly maximumOutputBytes: number;
	readonly signal: AbortSignal;
}

export interface CodeCheckSandbox {
	readonly admission: CodeCheckSandboxAdmission;
	execute(request: CodeCheckSandboxRequest): unknown | Promise<unknown>;
}

export interface CreateCodeCheckExecutorInput {
	readonly executorId: string;
	readonly executorVersion: string;
	readonly profile: string;
	readonly configurationDigest: CheckExecutionIdentity["configurationDigest"];
	readonly sandbox: CodeCheckSandbox;
	readonly supports?: (check: PackagedCheck) => boolean;
}

export function createCodeCheckExecutor(
	input: CreateCodeCheckExecutorInput,
): CheckExecutor {
	assertSandboxAdmission(input.sandbox.admission);
	assertSha256Digest(
		input.configurationDigest,
		"Code Check executor configuration digest",
	);
	const identity: CheckExecutionIdentity = Object.freeze({
		kind: "code",
		executorId: input.executorId,
		executorVersion: input.executorVersion,
		profile: input.profile,
		configurationDigest: input.configurationDigest,
	});
	return Object.freeze({
		identity,
		supports(check: PackagedCheck): boolean {
			return (
				check.definition.implementation.kind === "code" &&
				check.definition.implementation.profile === input.profile &&
				(input.supports?.(check) ?? true)
			);
		},
		execute(context: CheckExecutorContext): unknown | Promise<unknown> {
			if (context.check.implementation.fileName !== "CHECK.mjs") {
				throw new Error("Code Check requires CHECK.mjs implementation.");
			}
			return input.sandbox.execute({
				source: context.implementation.content,
				invocation: context.invocation,
				timeoutMs: context.check.definition.limits.timeoutMs,
				maximumOutputBytes:
					context.check.definition.limits.maximumOutputBytes,
				signal: context.signal,
			});
		},
	});
}

function assertSandboxAdmission(value: CodeCheckSandboxAdmission): void {
	if (
		value.hermetic !== true ||
		value.network !== "denied" ||
		value.credentials !== "none" ||
		value.bounded !== true
	) {
		throw new Error(
			"Code Check sandbox must be hermetic, bounded, credential-free, and network-denied.",
		);
	}
}
