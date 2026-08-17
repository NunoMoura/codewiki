import {
	CHECK_OUTPUT_PROTOCOL_ID,
	CHECK_OUTPUT_PROTOCOL_VERSION,
	type CheckExecutionIdentity,
	type CheckInvocation,
} from "../../checks/contracts.ts";
import type {PackagedCheck} from "../../checks/packs/contracts.ts";
import type {
	CheckExecutor,
	CheckExecutorContext,
} from "../../checks/runner.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export const MODEL_CHECK_REQUEST_PROTOCOL = Object.freeze({
	id: "codewiki.model-check-request",
	version: "1.0.0",
	maximumResponseBytes: 1_048_576,
} as const);

export interface ModelCheckRequest {
	readonly protocolId: typeof MODEL_CHECK_REQUEST_PROTOCOL.id;
	readonly protocolVersion: typeof MODEL_CHECK_REQUEST_PROTOCOL.version;
	readonly requestDigest: Sha256Digest;
	readonly route: string;
	readonly profile: string;
	readonly maximumTokens: number;
	readonly rubric: string;
	readonly invocation: CheckInvocation;
	readonly outputProtocol: {
		readonly protocolId: typeof CHECK_OUTPUT_PROTOCOL_ID;
		readonly protocolVersion: typeof CHECK_OUTPUT_PROTOCOL_VERSION;
		readonly requiredFields: readonly [
			"protocolId",
			"protocolVersion",
			"invocationDigest",
			"measurement",
			"summary",
			"details",
		];
	};
}

export type ModelCheckTransport = (
	request: ModelCheckRequest,
	signal: AbortSignal,
) => unknown | Promise<unknown>;

export interface CreateModelCheckExecutorInput {
	readonly executorId: string;
	readonly executorVersion: string;
	readonly route: string;
	readonly profile: string;
	readonly configurationDigest: Sha256Digest;
	readonly transport: ModelCheckTransport;
	readonly supports?: (check: PackagedCheck) => boolean;
}

export function createModelCheckExecutor(
	input: CreateModelCheckExecutorInput,
): CheckExecutor {
	assertSha256Digest(
		input.configurationDigest,
		"Model Check executor configuration digest",
	);
	const identity: CheckExecutionIdentity = Object.freeze({
		kind: "model",
		executorId: input.executorId,
		executorVersion: input.executorVersion,
		profile: input.profile,
		route: input.route,
		configurationDigest: input.configurationDigest,
	});
	return Object.freeze({
		identity,
		supports(check: PackagedCheck): boolean {
			const implementation = check.definition.implementation;
			return (
				implementation.kind === "model" &&
				implementation.route === input.route &&
				implementation.profile === input.profile &&
				(input.supports?.(check) ?? true)
			);
		},
		execute(context: CheckExecutorContext): unknown | Promise<unknown> {
			if (context.check.implementation.fileName !== "CHECK.md") {
				throw new Error("Model Check requires CHECK.md implementation.");
			}
			const request = createModelCheckRequest({
				check: context.check,
				invocation: context.invocation,
			});
			return input.transport(request, context.signal);
		},
	});
}

export function createModelCheckRequest(input: {
	readonly check: PackagedCheck;
	readonly invocation: CheckInvocation;
}): ModelCheckRequest {
	const implementation = input.check.definition.implementation;
	if (implementation.kind !== "model") {
		throw new Error("Model Check request requires Model Check Definition.");
	}
	if (input.check.implementation.fileName !== "CHECK.md") {
		throw new Error("Model Check request requires CHECK.md rubric.");
	}
	const body = {
		protocolId: MODEL_CHECK_REQUEST_PROTOCOL.id,
		protocolVersion: MODEL_CHECK_REQUEST_PROTOCOL.version,
		route: implementation.route,
		profile: implementation.profile,
		maximumTokens: implementation.maximumTokens,
		rubric: input.check.implementation.content,
		invocation: input.invocation,
		outputProtocol: {
			protocolId: CHECK_OUTPUT_PROTOCOL_ID,
			protocolVersion: CHECK_OUTPUT_PROTOCOL_VERSION,
			requiredFields: [
				"protocolId",
				"protocolVersion",
				"invocationDigest",
				"measurement",
				"summary",
				"details",
			] as const,
		},
	};
	return toCanonicalJsonValue({
		...body,
		requestDigest: canonicalJsonDigest(body),
	}) as unknown as ModelCheckRequest;
}
