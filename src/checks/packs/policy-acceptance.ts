import type {GitCommandRunner} from "../../changes/trace/git-command.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import {
	loadWikiConfigFile,
	serializeWikiConfigFile,
	wikiConfigDigest,
} from "../../project/config-file.ts";
import {
	createCustomCheckConfigState,
	type CustomCheckConfigState,
	type ProtectedCustomCheckConfigSnapshot,
} from "./configuration.ts";
import {
	createCustomCheckPolicyCommit,
	customCheckPolicyTargetRef,
	fetchCustomCheckPolicyTarget,
	pushCustomCheckPolicyCommit,
	type CustomCheckPolicyCommitProposal,
} from "./policy-git.ts";
import {
	createCustomCheckPolicyReviewRequest,
	assertCustomCheckPolicyReviewReceipt,
	type CustomCheckPolicyReviewReceipt,
	type CustomCheckPolicyReviewRequest,
} from "./policy-review.ts";
import {
	assertCustomCheckMutationReceipt,
	CustomCheckMutationError,
	normalizeAuthenticatedCustomCheckAuthority,
	type AuthenticatedCustomCheckAuthority,
	type CustomCheckMutationReceipt,
} from "./mutations.ts";
import {
	loadProtectedCustomCheckConfigSnapshot,
	withCustomCheckConfigLock,
} from "./project-config-store.ts";
import {createSerializedIdempotencyGate} from "./serialized-idempotency.ts";

export const CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL = Object.freeze({
	id: "codewiki.custom-check-policy-acceptance",
	version: "5.0.0",
	maxIdempotencyKeyLength: 128,
	maxCompletedCommands: 64,
});

export interface CustomCheckPolicyAcceptanceCommand {
	readonly protocolId: typeof CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.id;
	readonly protocolVersion: typeof CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.version;
	readonly idempotencyKey: string;
	readonly mutationReceipt: CustomCheckMutationReceipt;
	readonly reviewReceipt: CustomCheckPolicyReviewReceipt;
}

export interface CustomCheckPolicyAcceptanceAuthorizationRequest {
	readonly protocolId: typeof CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.id;
	readonly protocolVersion: typeof CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.version;
	readonly repositoryIdentity: Sha256Digest;
	readonly remote: string;
	readonly targetRef: string;
	readonly command: CustomCheckPolicyAcceptanceCommand;
	readonly authority: AuthenticatedCustomCheckAuthority;
	readonly protectedBase: ProtectedCustomCheckConfigSnapshot;
	readonly proposedConfig: CustomCheckConfigState;
	readonly reviewRequest: CustomCheckPolicyReviewRequest;
	readonly proposal: CustomCheckPolicyCommitProposal;
	readonly acceptanceIntentDigest: Sha256Digest;
	readonly authorizationDigest: Sha256Digest;
}

export interface CustomCheckPolicyAcceptanceReceipt {
	readonly receiptId: string;
	readonly protocolId: typeof CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.id;
	readonly protocolVersion: typeof CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.version;
	readonly mutationReceiptId: string;
	readonly reviewReceiptId: string;
	readonly reviewRequestDigest: Sha256Digest;
	readonly repositoryIdentity: Sha256Digest;
	readonly remote: string;
	readonly targetRef: string;
	readonly expectedProtectedSourceHead: string;
	readonly acceptedProtectedSourceHead: string;
	readonly acceptedTree: string;
	readonly configBlob: string;
	readonly configDigest: Sha256Digest;
	readonly customCheckConfigDigest: Sha256Digest;
	readonly authority: AuthenticatedCustomCheckAuthority;
	readonly acceptanceIntentDigest: Sha256Digest;
	readonly authorizationDigest: Sha256Digest;
}

export interface CustomCheckPolicyAcceptanceResult {
	readonly replayed: boolean;
	readonly proposal: CustomCheckPolicyCommitProposal;
	readonly receipt: CustomCheckPolicyAcceptanceReceipt;
	readonly protectedConfig: ProtectedCustomCheckConfigSnapshot;
}

export interface CustomCheckPolicyAcceptanceRuntime {
	readonly execute: (
		command: unknown,
		authority: AuthenticatedCustomCheckAuthority,
		signal?: AbortSignal,
	) => Promise<CustomCheckPolicyAcceptanceResult>;
}

export type CustomCheckPolicyAcceptanceErrorCode =
	| "bad_request"
	| "conflict"
	| "forbidden";

export class CustomCheckPolicyAcceptanceError extends Error {
	readonly code: CustomCheckPolicyAcceptanceErrorCode;

	constructor(code: CustomCheckPolicyAcceptanceErrorCode, message: string) {
		super(message);
		this.name = "CustomCheckPolicyAcceptanceError";
		this.code = code;
	}
}

export function createCustomCheckPolicyAcceptanceRuntime(options: {
	readonly repoRoot: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly remote: string;
	readonly protectedBranch: string;
	readonly verifyMutationReceipt: (
		receipt: CustomCheckMutationReceipt,
	) => boolean | Promise<boolean>;
	readonly verifyReviewReceipt: (
		receipt: CustomCheckPolicyReviewReceipt,
		request: CustomCheckPolicyReviewRequest,
	) => boolean | Promise<boolean>;
	readonly authorize: (
		request: CustomCheckPolicyAcceptanceAuthorizationRequest,
	) => boolean | Promise<boolean>;
	readonly runner?: GitCommandRunner;
	readonly now?: () => Date;
}): CustomCheckPolicyAcceptanceRuntime {
	const targetRef = customCheckPolicyTargetRef(options.protectedBranch);
	const repositoryIdentity = assertSha256Digest(
		options.repositoryIdentity,
		"repositoryIdentity",
	);
	const now = options.now ?? (() => new Date());
	const idempotency =
		createSerializedIdempotencyGate<CustomCheckPolicyAcceptanceResult>({
			maxCompleted: CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.maxCompletedCommands,
			conflict: (state) =>
				conflict(
					`Custom Check policy acceptance idempotency key already has a different ${state} payload.`,
				),
		});
	return Object.freeze({
		async execute(
			value: unknown,
			suppliedAuthority: AuthenticatedCustomCheckAuthority,
			signal?: AbortSignal,
		) {
			const command = parseCustomCheckPolicyAcceptanceCommand(value);
			const authority = normalizeAcceptanceAuthority(suppliedAuthority);
			return idempotency.run({
				key: command.idempotencyKey,
				payloadDigest: canonicalJsonDigest({command, authority}),
				execute: () =>
					executeAcceptance(
						options,
						command,
						authority,
						repositoryIdentity,
						targetRef,
						now,
						signal,
					),
			});
		},
	});
}

export function parseCustomCheckPolicyAcceptanceCommand(
	value: unknown,
): CustomCheckPolicyAcceptanceCommand {
	try {
		assertExactKeys(
			value,
			[
				"protocolId",
				"protocolVersion",
				"idempotencyKey",
				"mutationReceipt",
				"reviewReceipt",
			],
			"Custom Check policy acceptance command",
		);
		if (!isRecord(value)) {
			throw new Error("Custom Check policy acceptance command must be an object.");
		}
		if (value.protocolId !== CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.id) {
			throw new Error("Custom Check policy acceptance protocolId is invalid.");
		}
		if (value.protocolVersion !== CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.version) {
			throw new Error("Custom Check policy acceptance protocolVersion is invalid.");
		}
		const mutationReceipt = immutableClone<CustomCheckMutationReceipt>(
			value.mutationReceipt,
		);
		const reviewReceipt = immutableClone<CustomCheckPolicyReviewReceipt>(
			value.reviewReceipt,
		);
		assertCustomCheckMutationReceipt(mutationReceipt);
		assertCustomCheckPolicyReviewReceipt(reviewReceipt);
		return Object.freeze({
			protocolId: CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.id,
			protocolVersion: CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.version,
			idempotencyKey: idempotencyKey(value.idempotencyKey),
			mutationReceipt,
			reviewReceipt,
		});
	} catch (error) {
		if (error instanceof CustomCheckPolicyAcceptanceError) throw error;
		throw badRequest(error instanceof Error ? error.message : String(error));
	}
}

async function executeAcceptance(
	options: Parameters<typeof createCustomCheckPolicyAcceptanceRuntime>[0],
	command: CustomCheckPolicyAcceptanceCommand,
	authority: AuthenticatedCustomCheckAuthority,
	repositoryIdentity: Sha256Digest,
	targetRef: string,
	now: () => Date,
	signal?: AbortSignal,
): Promise<CustomCheckPolicyAcceptanceResult> {
	signal?.throwIfAborted();
	if (!await options.verifyMutationReceipt(command.mutationReceipt)) {
		throw forbidden("Custom Check mutation receipt could not be authenticated.");
	}
	const initialRemoteHead = await fetchCustomCheckPolicyTarget({
		repoRoot: options.repoRoot,
		remote: options.remote,
		protectedBranch: options.protectedBranch,
		runner: options.runner,
		...(signal ? {signal} : {}),
	});
	const protectedBase = await loadProtectedCustomCheckConfigSnapshot({
		repoRoot: options.repoRoot,
		protectedSourceHead: command.mutationReceipt.protectedSourceHead,
		runner: options.runner,
		...(signal ? {signal} : {}),
	});
	assertProtectedBase(command.mutationReceipt, protectedBase);
	const config = await loadWikiConfigFile(options.repoRoot);
	const proposedConfig = createCustomCheckConfigState({
		projectConfigDigest: wikiConfigDigest(config),
		userStandards: config.userStandards,
		triagePreferences: config.triagePreferences,
		customChecks: config.customChecks,
	});
	assertProposedConfig(command.mutationReceipt, proposedConfig);
	const reviewRequest = createCustomCheckPolicyReviewRequest({
		mutationReceipt: command.mutationReceipt,
		proposedConfig,
	});
	assertReviewBinding(command.reviewReceipt, reviewRequest, now());
	if (
		!await options.verifyReviewReceipt(command.reviewReceipt, reviewRequest)
	) {
		throw forbidden("Custom Check policy review receipt could not be authenticated.");
	}
	if (command.reviewReceipt.status !== "pass") {
		throw forbidden(
			`Custom Check policy review did not pass (${command.reviewReceipt.status}).`,
		);
	}
	const acceptanceIntentDigest = canonicalJsonDigest({
		protocolId: CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.version,
		repositoryIdentity,
		targetRef,
		expectedProtectedSourceHead: command.mutationReceipt.protectedSourceHead,
		configDigest: proposedConfig.projectConfigDigest,
		customCheckConfigDigest: proposedConfig.customCheckConfigDigest,
		mutationReceiptId: command.mutationReceipt.receiptId,
		reviewReceiptId: command.reviewReceipt.receiptId,
		authority,
	});
	const proposal = await createCustomCheckPolicyCommit({
		repoRoot: options.repoRoot,
		protectedBranch: options.protectedBranch,
		expectedProtectedSourceHead: command.mutationReceipt.protectedSourceHead,
		configBytes: serializeWikiConfigFile(config),
		configDigest: proposedConfig.projectConfigDigest,
		mutationReceiptId: command.mutationReceipt.receiptId,
		reviewReceiptId: command.reviewReceipt.receiptId,
		acceptanceIntentDigest,
		reviewedAt: command.reviewReceipt.reviewedAt,
		runner: options.runner,
		...(signal ? {signal} : {}),
	});
	if (
		initialRemoteHead !== proposal.expectedProtectedSourceHead &&
		initialRemoteHead !== proposal.acceptedProtectedSourceHead
	) {
		throw conflict("Protected project branch changed; refresh and review again.");
	}
	const authorizationDigest = canonicalJsonDigest({
		protocolId: CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.version,
		repositoryIdentity,
		remote: options.remote,
		targetRef,
		command,
		authority,
		protectedBase,
		proposedConfig,
		reviewRequestDigest: reviewRequest.requestDigest,
		proposal,
		acceptanceIntentDigest,
	});
	const authorizationRequest: CustomCheckPolicyAcceptanceAuthorizationRequest =
		Object.freeze({
			protocolId: CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.id,
			protocolVersion: CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.version,
			repositoryIdentity,
			remote: options.remote,
			targetRef,
			command,
			authority,
			protectedBase,
			proposedConfig,
			reviewRequest,
			proposal,
			acceptanceIntentDigest,
			authorizationDigest,
		});
	if (!await options.authorize(authorizationRequest)) {
		throw forbidden(
			"Authenticated actor is not authorized to accept Custom Check policy.",
		);
	}
	signal?.throwIfAborted();
	let pushResult: Awaited<ReturnType<typeof pushCustomCheckPolicyCommit>>;
	try {
		pushResult = await withCustomCheckConfigLock(
			options.repoRoot,
			async () => {
				await assertWorkingConfigUnchanged(options.repoRoot, proposedConfig);
				await fetchCustomCheckPolicyTarget({
					repoRoot: options.repoRoot,
					remote: options.remote,
					protectedBranch: options.protectedBranch,
					runner: options.runner,
					...(signal ? {signal} : {}),
				});
				return pushCustomCheckPolicyCommit({
					repoRoot: options.repoRoot,
					remote: options.remote,
					proposal,
					runner: options.runner,
					...(signal ? {signal} : {}),
				});
			},
		);
	} catch (error) {
		if (error instanceof CustomCheckMutationError && error.code === "conflict") {
			throw conflict(error.message);
		}
		throw error;
	}
	if (pushResult.status === "stale") {
		throw conflict("Protected project branch changed during policy acceptance.");
	}
	const acceptedConfig = await loadProtectedCustomCheckConfigSnapshot({
		repoRoot: options.repoRoot,
		protectedSourceHead: pushResult.acceptedProtectedSourceHead,
		runner: options.runner,
		...(signal ? {signal} : {}),
	});
	if (
		acceptedConfig.projectConfigDigest !== proposedConfig.projectConfigDigest ||
		acceptedConfig.customCheckConfigDigest !== proposedConfig.customCheckConfigDigest
	) {
		throw conflict("Accepted protected Custom Check config does not match proposal.");
	}
	const receipt = acceptanceReceipt({
		command,
		authority,
		repositoryIdentity,
		remote: options.remote,
		targetRef,
		proposal,
		proposedConfig,
		acceptanceIntentDigest,
		authorizationDigest,
	});
	return Object.freeze({
		replayed: pushResult.replayed,
		proposal,
		receipt,
		protectedConfig: acceptedConfig,
	});
}

function acceptanceReceipt(input: {
	readonly command: CustomCheckPolicyAcceptanceCommand;
	readonly authority: AuthenticatedCustomCheckAuthority;
	readonly repositoryIdentity: Sha256Digest;
	readonly remote: string;
	readonly targetRef: string;
	readonly proposal: CustomCheckPolicyCommitProposal;
	readonly proposedConfig: CustomCheckConfigState;
	readonly acceptanceIntentDigest: Sha256Digest;
	readonly authorizationDigest: Sha256Digest;
}): CustomCheckPolicyAcceptanceReceipt {
	const payload = {
		protocolId: CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.version,
		mutationReceiptId: input.command.mutationReceipt.receiptId,
		reviewReceiptId: input.command.reviewReceipt.receiptId,
		reviewRequestDigest: input.command.reviewReceipt.requestDigest,
		repositoryIdentity: input.repositoryIdentity,
		remote: input.remote,
		targetRef: input.targetRef,
		expectedProtectedSourceHead:
			input.proposal.expectedProtectedSourceHead,
		acceptedProtectedSourceHead:
			input.proposal.acceptedProtectedSourceHead,
		acceptedTree: input.proposal.acceptedTree,
		configBlob: input.proposal.configBlob,
		configDigest: input.proposedConfig.projectConfigDigest,
		customCheckConfigDigest: input.proposedConfig.customCheckConfigDigest,
		authority: input.authority,
		acceptanceIntentDigest: input.acceptanceIntentDigest,
		authorizationDigest: input.authorizationDigest,
	};
	return Object.freeze({
		receiptId: `custom-check-policy-acceptance:${canonicalJsonDigest(payload).slice("sha256:".length)}`,
		...payload,
	});
}

function assertProtectedBase(
	receipt: CustomCheckMutationReceipt,
	protectedBase: ProtectedCustomCheckConfigSnapshot,
): void {
	if (
		protectedBase.snapshotDigest !== receipt.protectedBaseSnapshotDigest ||
		protectedBase.protectedSourceHead !== receipt.protectedSourceHead ||
		protectedBase.projectConfigDigest !== receipt.protectedConfigDigest ||
		receipt.configDigestBefore !== protectedBase.projectConfigDigest
	) {
		throw conflict(
			"Custom Check mutation receipt does not start from the exact protected base.",
		);
	}
}

function assertProposedConfig(
	receipt: CustomCheckMutationReceipt,
	proposedConfig: CustomCheckConfigState,
): void {
	if (
		proposedConfig.projectConfigDigest !== receipt.configDigestAfter ||
		proposedConfig.customCheckConfigDigest !==
			receipt.customCheckConfigDigestAfter
	) {
		throw conflict("Working Custom Check config changed after guarded mutation.");
	}
}

function assertReviewBinding(
	receipt: CustomCheckPolicyReviewReceipt,
	request: CustomCheckPolicyReviewRequest,
	now: Date,
): void {
	if (
		receipt.requestDigest !== request.requestDigest ||
		receipt.mutationReceiptId !== request.mutationReceipt.receiptId ||
		receipt.protectedSourceHead !==
			request.mutationReceipt.protectedSourceHead ||
		receipt.configDigestAfter !== request.proposedConfig.projectConfigDigest ||
		receipt.customCheckConfigDigestAfter !==
			request.proposedConfig.customCheckConfigDigest
	) {
		throw conflict("Custom Check policy review does not bind the exact proposal.");
	}
	if (
		Date.parse(receipt.reviewedAt) <
		Date.parse(request.mutationReceipt.recordedAt)
	) {
		throw badRequest("Custom Check policy review cannot predate its mutation receipt.");
	}
	if (Date.parse(receipt.reviewedAt) > now.getTime()) {
		throw badRequest("Custom Check policy review timestamp cannot be in the future.");
	}
}

async function assertWorkingConfigUnchanged(
	repoRoot: string,
	expected: CustomCheckConfigState,
): Promise<void> {
	const current = await loadWikiConfigFile(repoRoot);
	const currentState = createCustomCheckConfigState({
		projectConfigDigest: wikiConfigDigest(current),
		userStandards: current.userStandards,
		triagePreferences: current.triagePreferences,
		customChecks: current.customChecks,
	});
	if (
		currentState.projectConfigDigest !== expected.projectConfigDigest ||
		currentState.customCheckConfigDigest !== expected.customCheckConfigDigest
	) {
		throw conflict("Working Custom Check config changed during policy acceptance.");
	}
}

function normalizeAcceptanceAuthority(
	value: AuthenticatedCustomCheckAuthority,
): AuthenticatedCustomCheckAuthority {
	try {
		return normalizeAuthenticatedCustomCheckAuthority(value);
	} catch (error) {
		throw badRequest(error instanceof Error ? error.message : String(error));
	}
}

function immutableClone<T>(value: unknown): T {
	if (!isRecord(value)) {
		throw new Error("Custom Check policy acceptance receipt must be an object.");
	}
	return deepFreeze(structuredClone(value)) as T;
}

function deepFreeze<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	for (const entry of Object.values(value)) deepFreeze(entry);
	return Object.freeze(value);
}

function idempotencyKey(value: unknown): string {
	if (
		typeof value !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value) ||
		value.length > CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.maxIdempotencyKeyLength
	) {
		throw new Error(
			`Custom Check policy acceptance idempotencyKey must be 1..${CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.maxIdempotencyKeyLength} safe characters.`,
		);
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function badRequest(message: string): CustomCheckPolicyAcceptanceError {
	return new CustomCheckPolicyAcceptanceError("bad_request", message);
}

function conflict(message: string): CustomCheckPolicyAcceptanceError {
	return new CustomCheckPolicyAcceptanceError("conflict", message);
}

function forbidden(message: string): CustomCheckPolicyAcceptanceError {
	return new CustomCheckPolicyAcceptanceError("forbidden", message);
}
