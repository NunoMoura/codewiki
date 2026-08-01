import type {AuthorityBinding} from "../../change-trace/contracts.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import {
	activateCustomCheckDefinition,
	createCustomCheckDefinition,
	customCheckConfigurationDigest,
	disableCustomCheckDefinition,
	normalizeCustomCheckDefinitions,
	updateCustomCheckDefinition,
	type CustomCheckDefinition,
	type CustomCheckLifecycle,
	type CustomCheckProposal,
} from "./contracts.ts";
import {
	assertProtectedCustomCheckConfigSnapshot,
	createCustomCheckConfigState,
	type CustomCheckConfigState,
	type ProtectedCustomCheckConfigSnapshot,
} from "./configuration.ts";

export const CUSTOM_CHECK_MUTATION_PROTOCOL = Object.freeze({
	id: "codewiki.custom-check-mutation",
	version: "1.0.0",
	maxIdempotencyKeyLength: 128,
	maxCompletedCommands: 64,
});

export type CustomCheckMutationAction =
	| "create"
	| "update"
	| "activate"
	| "disable";

interface CustomCheckMutationCommandBase {
	readonly protocolId: typeof CUSTOM_CHECK_MUTATION_PROTOCOL.id;
	readonly protocolVersion: typeof CUSTOM_CHECK_MUTATION_PROTOCOL.version;
	readonly action: CustomCheckMutationAction;
	readonly idempotencyKey: string;
	readonly expectedConfigDigest: Sha256Digest;
	readonly expectedProtectedSourceHead: string;
	readonly expectedProtectedConfigDigest: Sha256Digest;
}

export interface CreateCustomCheckCommand extends CustomCheckMutationCommandBase {
	readonly action: "create";
	readonly proposal: CustomCheckProposal;
}

export interface UpdateCustomCheckCommand extends CustomCheckMutationCommandBase {
	readonly action: "update";
	readonly customCheckId: string;
	readonly proposal: CustomCheckProposal;
}

export interface ActivateCustomCheckCommand extends CustomCheckMutationCommandBase {
	readonly action: "activate";
	readonly customCheckId: string;
}

export interface DisableCustomCheckCommand extends CustomCheckMutationCommandBase {
	readonly action: "disable";
	readonly customCheckId: string;
}

export type CustomCheckMutationCommand =
	| CreateCustomCheckCommand
	| UpdateCustomCheckCommand
	| ActivateCustomCheckCommand
	| DisableCustomCheckCommand;

export type AuthenticatedCustomCheckAuthority = AuthorityBinding & {
	readonly authenticationEvidenceId: string;
};

export interface CustomCheckMutationStore {
	readonly load: () => Promise<CustomCheckConfigState>;
	readonly preview: (input: {
		readonly current: CustomCheckConfigState;
		readonly customChecks: readonly CustomCheckDefinition[];
	}) => Promise<CustomCheckConfigState>;
	readonly compareAndSwap: (input: {
		readonly expectedConfigDigest: Sha256Digest;
		readonly expectedNextConfigDigest: Sha256Digest;
		readonly customChecks: readonly CustomCheckDefinition[];
	}) => Promise<CustomCheckConfigState>;
}

export interface CustomCheckAuthorizationRequest {
	readonly protocolId: typeof CUSTOM_CHECK_MUTATION_PROTOCOL.id;
	readonly protocolVersion: typeof CUSTOM_CHECK_MUTATION_PROTOCOL.version;
	readonly command: CustomCheckMutationCommand;
	readonly authority: AuthenticatedCustomCheckAuthority;
	readonly protectedBase: ProtectedCustomCheckConfigSnapshot;
	readonly before: CustomCheckConfigState;
	readonly after: CustomCheckConfigState;
	readonly definitionBefore: CustomCheckDefinition | null;
	readonly definitionAfter: CustomCheckDefinition;
	readonly authorizationDigest: Sha256Digest;
}

export interface CustomCheckMutationDefinitionBinding {
	readonly customCheckId: string;
	readonly definitionDigest: Sha256Digest;
	readonly lifecycle: CustomCheckLifecycle;
}

export interface CustomCheckMutationReceipt {
	readonly receiptId: string;
	readonly protocolId: typeof CUSTOM_CHECK_MUTATION_PROTOCOL.id;
	readonly protocolVersion: typeof CUSTOM_CHECK_MUTATION_PROTOCOL.version;
	readonly idempotencyKey: string;
	readonly action: CustomCheckMutationAction;
	readonly recordedAt: string;
	readonly authority: AuthenticatedCustomCheckAuthority;
	readonly authorizationDigest: Sha256Digest;
	readonly protectedBaseSnapshotDigest: Sha256Digest;
	readonly protectedSourceHead: string;
	readonly protectedConfigDigest: Sha256Digest;
	readonly configDigestBefore: Sha256Digest;
	readonly configDigestAfter: Sha256Digest;
	readonly customCheckConfigDigestBefore: Sha256Digest;
	readonly customCheckConfigDigestAfter: Sha256Digest;
	readonly definitionBefore: CustomCheckMutationDefinitionBinding | null;
	readonly definitionAfter: CustomCheckMutationDefinitionBinding;
	readonly effectiveFrom: "next_protected_snapshot";
}

export interface CustomCheckMutationResult {
	readonly replayed: boolean;
	readonly definition: CustomCheckDefinition;
	readonly receipt: CustomCheckMutationReceipt;
	readonly state: CustomCheckConfigState;
}

export interface CustomCheckMutationRuntime {
	readonly execute: (
		command: unknown,
		authority: AuthenticatedCustomCheckAuthority,
	) => Promise<CustomCheckMutationResult>;
}

export type CustomCheckMutationErrorCode =
	| "bad_request"
	| "conflict"
	| "forbidden";

export class CustomCheckMutationError extends Error {
	readonly code: CustomCheckMutationErrorCode;

	constructor(code: CustomCheckMutationErrorCode, message: string) {
		super(message);
		this.name = "CustomCheckMutationError";
		this.code = code;
	}
}

interface CompletedMutation {
	readonly payloadDigest: Sha256Digest;
	readonly result: CustomCheckMutationResult;
}

interface PendingMutation {
	readonly payloadDigest: Sha256Digest;
	readonly result: Promise<CustomCheckMutationResult>;
}

export function createCustomCheckMutationRuntime(options: {
	readonly store: CustomCheckMutationStore;
	readonly loadProtectedBase: () => Promise<ProtectedCustomCheckConfigSnapshot>;
	readonly authorize: (
		request: CustomCheckAuthorizationRequest,
	) => boolean | Promise<boolean>;
	readonly now?: () => Date;
}): CustomCheckMutationRuntime {
	const completed = new Map<string, CompletedMutation>();
	const pending = new Map<string, PendingMutation>();
	const now = options.now ?? (() => new Date());
	let sequence: Promise<unknown> = Promise.resolve();
	return Object.freeze({
		async execute(
			value: unknown,
			suppliedAuthority: AuthenticatedCustomCheckAuthority,
		) {
			const command = parseCustomCheckMutationCommand(value);
			const authority = normalizeAuthority(suppliedAuthority);
			const payloadDigest = canonicalJsonDigest({command, authority});
			const existing = completed.get(command.idempotencyKey);
			if (existing) {
				assertIdempotentPayload(existing.payloadDigest, payloadDigest, "completed");
				return Object.freeze({...existing.result, replayed: true});
			}
			const inFlight = pending.get(command.idempotencyKey);
			if (inFlight) {
				assertIdempotentPayload(inFlight.payloadDigest, payloadDigest, "running");
				return Object.freeze({...await inFlight.result, replayed: true});
			}
			const result = sequence.then(() =>
				executeMutation(options, command, authority, now),
			);
			sequence = result.then(
				() => undefined,
				() => undefined,
			);
			pending.set(command.idempotencyKey, {payloadDigest, result});
			try {
				const resolved = await result;
				completed.set(command.idempotencyKey, {payloadDigest, result: resolved});
				trimCompleted(completed);
				return resolved;
			} finally {
				pending.delete(command.idempotencyKey);
			}
		},
	});
}

export function parseCustomCheckMutationCommand(
	value: unknown,
): CustomCheckMutationCommand {
	try {
		if (!isRecord(value)) {
			throw new Error("Custom Check mutation command must be an object.");
		}
		const action = mutationAction(value.action);
		const base = parseCommandBase(value, action);
		switch (action) {
			case "create":
				assertExactKeys(
					value,
					baseCommandKeys("proposal"),
					"Custom Check mutation command",
				);
				return Object.freeze({...base, action, proposal: normalizedProposal(value.proposal)});
			case "update":
				assertExactKeys(
					value,
					baseCommandKeys("customCheckId", "proposal"),
					"Custom Check mutation command",
				);
				return Object.freeze({
					...base,
					action,
					customCheckId: customCheckId(value.customCheckId),
					proposal: normalizedProposal(value.proposal),
				});
			case "activate":
			case "disable":
				assertExactKeys(
					value,
					baseCommandKeys("customCheckId"),
					"Custom Check mutation command",
				);
				return Object.freeze({
					...base,
					action,
					customCheckId: customCheckId(value.customCheckId),
				});
		}
	} catch (error) {
		if (error instanceof CustomCheckMutationError) throw error;
		throw badRequest(error instanceof Error ? error.message : String(error));
	}
}

async function executeMutation(
	options: Parameters<typeof createCustomCheckMutationRuntime>[0],
	command: CustomCheckMutationCommand,
	authority: AuthenticatedCustomCheckAuthority,
	now: () => Date,
): Promise<CustomCheckMutationResult> {
	const [beforeValue, protectedBase] = await Promise.all([
		options.store.load(),
		options.loadProtectedBase(),
	]);
	const before = normalizedState(beforeValue);
	assertProtectedCustomCheckConfigSnapshot(protectedBase);
	assertExpectedState(command, before, protectedBase);
	const mutation = applyMutation(command, before.customChecks);
	const projected = normalizedState(
		await options.store.preview({
			current: before,
			customChecks: mutation.customChecks,
		}),
	);
	if (projected.customCheckConfigDigest !== mutation.customCheckConfigDigest) {
		throw conflict("Custom Check configuration preview changed the requested definitions.");
	}
	if (projected.projectConfigDigest === before.projectConfigDigest) {
		throw badRequest("Custom Check mutation would not change project configuration.");
	}
	const authorizationDigest = authorizationIdentity({
		command,
		authority,
		protectedBase,
		before,
		after: projected,
		definitionBefore: mutation.definitionBefore,
		definitionAfter: mutation.definitionAfter,
	});
	const authorizationRequest: CustomCheckAuthorizationRequest = Object.freeze({
		protocolId: CUSTOM_CHECK_MUTATION_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_MUTATION_PROTOCOL.version,
		command,
		authority,
		protectedBase,
		before,
		after: projected,
		definitionBefore: mutation.definitionBefore,
		definitionAfter: mutation.definitionAfter,
		authorizationDigest,
	});
	if (!await options.authorize(authorizationRequest)) {
		throw forbidden("Authenticated actor is not authorized for this Custom Check mutation.");
	}
	const currentProtectedBase = await options.loadProtectedBase();
	assertProtectedCustomCheckConfigSnapshot(currentProtectedBase);
	if (currentProtectedBase.snapshotDigest !== protectedBase.snapshotDigest) {
		throw conflict("Protected project configuration changed during authorization.");
	}
	const state = normalizedState(
		await options.store.compareAndSwap({
			expectedConfigDigest: before.projectConfigDigest,
			expectedNextConfigDigest: projected.projectConfigDigest,
			customChecks: mutation.customChecks,
		}),
	);
	if (
		state.projectConfigDigest !== projected.projectConfigDigest ||
		state.customCheckConfigDigest !== projected.customCheckConfigDigest
	) {
		throw conflict("Custom Check configuration changed while committing the mutation.");
	}
	const receipt = mutationReceipt({
		command,
		authority,
		authorizationDigest,
		protectedBase,
		before,
		after: state,
		definitionBefore: mutation.definitionBefore,
		definitionAfter: mutation.definitionAfter,
		recordedAt: now().toISOString(),
	});
	return Object.freeze({
		replayed: false,
		definition: mutation.definitionAfter,
		receipt,
		state,
	});
}

function applyMutation(
	command: CustomCheckMutationCommand,
	definitions: readonly CustomCheckDefinition[],
): {
	readonly customChecks: readonly CustomCheckDefinition[];
	readonly customCheckConfigDigest: Sha256Digest;
	readonly definitionBefore: CustomCheckDefinition | null;
	readonly definitionAfter: CustomCheckDefinition;
} {
	let definitionBefore: CustomCheckDefinition | null = null;
	let definitionAfter: CustomCheckDefinition;
	if (command.action === "create") {
		definitionAfter = createCustomCheckDefinition(command.proposal);
		if (definitions.some((entry) => entry.customCheckId === definitionAfter.customCheckId)) {
			throw conflict(`Custom Check ${definitionAfter.customCheckId} already exists.`);
		}
	} else {
		definitionBefore = requireDefinition(definitions, command.customCheckId);
		try {
			switch (command.action) {
				case "update":
					if (definitionBefore.lifecycle === "disabled") {
						throw new Error("Disabled Custom Checks cannot be edited.");
					}
					definitionAfter = updateCustomCheckDefinition(
						definitionBefore,
						command.proposal,
					);
					break;
				case "activate":
					definitionAfter = activateCustomCheckDefinition(definitionBefore);
					break;
				case "disable":
					definitionAfter = disableCustomCheckDefinition(definitionBefore);
					break;
			}
		} catch (error) {
			throw badRequest(error instanceof Error ? error.message : String(error));
		}
	}
	const customChecks = normalizeCustomCheckDefinitions([
		...definitions.filter(
			(entry) => entry.customCheckId !== definitionAfter.customCheckId,
		),
		definitionAfter,
	]);
	return {
		customChecks,
		customCheckConfigDigest: customCheckConfigurationDigest(customChecks),
		definitionBefore,
		definitionAfter,
	};
}

function mutationReceipt(input: {
	readonly command: CustomCheckMutationCommand;
	readonly authority: AuthenticatedCustomCheckAuthority;
	readonly authorizationDigest: Sha256Digest;
	readonly protectedBase: ProtectedCustomCheckConfigSnapshot;
	readonly before: CustomCheckConfigState;
	readonly after: CustomCheckConfigState;
	readonly definitionBefore: CustomCheckDefinition | null;
	readonly definitionAfter: CustomCheckDefinition;
	readonly recordedAt: string;
}): CustomCheckMutationReceipt {
	const payload = {
		protocolId: CUSTOM_CHECK_MUTATION_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_MUTATION_PROTOCOL.version,
		idempotencyKey: input.command.idempotencyKey,
		action: input.command.action,
		recordedAt: input.recordedAt,
		authority: input.authority,
		authorizationDigest: input.authorizationDigest,
		protectedBaseSnapshotDigest: input.protectedBase.snapshotDigest,
		protectedSourceHead: input.protectedBase.protectedSourceHead,
		protectedConfigDigest: input.protectedBase.projectConfigDigest,
		configDigestBefore: input.before.projectConfigDigest,
		configDigestAfter: input.after.projectConfigDigest,
		customCheckConfigDigestBefore: input.before.customCheckConfigDigest,
		customCheckConfigDigestAfter: input.after.customCheckConfigDigest,
		definitionBefore: definitionBinding(input.definitionBefore),
		definitionAfter: definitionBinding(input.definitionAfter)!,
		effectiveFrom: "next_protected_snapshot" as const,
	};
	const receiptDigest = canonicalJsonDigest(payload);
	return Object.freeze({
		receiptId: `custom-check-mutation:${receiptDigest.slice("sha256:".length)}`,
		...payload,
	});
}

function authorizationIdentity(
	input: Omit<CustomCheckAuthorizationRequest, "protocolId" | "protocolVersion" | "authorizationDigest">,
): Sha256Digest {
	return canonicalJsonDigest({
		protocolId: CUSTOM_CHECK_MUTATION_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_MUTATION_PROTOCOL.version,
		command: input.command,
		authority: input.authority,
		protectedBaseSnapshotDigest: input.protectedBase.snapshotDigest,
		configDigestBefore: input.before.projectConfigDigest,
		configDigestAfter: input.after.projectConfigDigest,
		definitionBefore: definitionBinding(input.definitionBefore),
		definitionAfter: definitionBinding(input.definitionAfter),
		effectiveFrom: "next_protected_snapshot",
	});
}

function definitionBinding(
	definition: CustomCheckDefinition | null,
): CustomCheckMutationDefinitionBinding | null {
	if (!definition) return null;
	return Object.freeze({
		customCheckId: definition.customCheckId,
		definitionDigest: definition.definitionDigest,
		lifecycle: definition.lifecycle,
	});
}

function normalizedState(value: CustomCheckConfigState): CustomCheckConfigState {
	const normalized = createCustomCheckConfigState({
		projectConfigDigest: value.projectConfigDigest,
		customChecks: value.customChecks,
	});
	if (normalized.customCheckConfigDigest !== value.customCheckConfigDigest) {
		throw conflict("Custom Check configuration state digest does not match its definitions.");
	}
	return normalized;
}

function assertExpectedState(
	command: CustomCheckMutationCommand,
	before: CustomCheckConfigState,
	protectedBase: ProtectedCustomCheckConfigSnapshot,
): void {
	if (command.expectedConfigDigest !== before.projectConfigDigest) {
		throw conflict("Project configuration changed; refresh before retrying.");
	}
	if (command.expectedProtectedSourceHead !== protectedBase.protectedSourceHead) {
		throw conflict("Protected source head changed; refresh before retrying.");
	}
	if (command.expectedProtectedConfigDigest !== protectedBase.projectConfigDigest) {
		throw conflict("Protected project configuration changed; refresh before retrying.");
	}
}

function parseCommandBase(
	value: Record<string, unknown>,
	action: CustomCheckMutationAction,
): CustomCheckMutationCommandBase {
	if (value.protocolId !== CUSTOM_CHECK_MUTATION_PROTOCOL.id) {
		throw new Error("Custom Check mutation protocolId is invalid.");
	}
	if (value.protocolVersion !== CUSTOM_CHECK_MUTATION_PROTOCOL.version) {
		throw new Error("Custom Check mutation protocolVersion is invalid.");
	}
	return {
		protocolId: CUSTOM_CHECK_MUTATION_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_MUTATION_PROTOCOL.version,
		action,
		idempotencyKey: idempotencyKey(value.idempotencyKey),
		expectedConfigDigest: sha256Digest(value.expectedConfigDigest, "expectedConfigDigest"),
		expectedProtectedSourceHead: gitObjectId(
			value.expectedProtectedSourceHead,
			"expectedProtectedSourceHead",
		),
		expectedProtectedConfigDigest: sha256Digest(
			value.expectedProtectedConfigDigest,
			"expectedProtectedConfigDigest",
		),
	};
}

function normalizedProposal(value: unknown): CustomCheckProposal {
	const definition = createCustomCheckDefinition(value as CustomCheckProposal);
	return Object.freeze({
		checkTypeId: definition.checkTypeId,
		name: definition.name,
		requirement: definition.requirement,
		...(definition.repairGuidance
			? {repairGuidance: definition.repairGuidance}
			: {}),
		appliesWhen: Object.freeze({
			...(definition.appliesWhen.loops
				? {loops: Object.freeze([...definition.appliesWhen.loops])}
				: {}),
			...(definition.appliesWhen.changeKinds
				? {changeKinds: Object.freeze([...definition.appliesWhen.changeKinds])}
				: {}),
			...(definition.appliesWhen.affectedLayers
				? {affectedLayers: Object.freeze([...definition.appliesWhen.affectedLayers])}
				: {}),
			...(definition.appliesWhen.pathScopes
				? {pathScopes: Object.freeze([...definition.appliesWhen.pathScopes])}
				: {}),
		}),
		...(definition.knowledgeRefs
			? {knowledgeRefs: Object.freeze([...definition.knowledgeRefs])}
			: {}),
	});
}

function normalizeAuthority(
	value: AuthenticatedCustomCheckAuthority,
): AuthenticatedCustomCheckAuthority {
	try {
		assertExactKeys(
			value,
			[
				"actorId",
				"principalRef",
				"role",
				"actorPolicyDigest",
				"authenticationEvidenceId",
				"runtimeProtocolDigest",
			],
			"Custom Check mutation authority",
		);
		return Object.freeze({
			actorId: boundedText(value.actorId, "authority.actorId", 200),
			principalRef: boundedText(value.principalRef, "authority.principalRef", 512),
			role: boundedText(value.role, "authority.role", 100),
			actorPolicyDigest: sha256Digest(
				value.actorPolicyDigest,
				"authority.actorPolicyDigest",
			),
			authenticationEvidenceId: boundedText(
				value.authenticationEvidenceId,
				"authority.authenticationEvidenceId",
				512,
			),
			runtimeProtocolDigest: sha256Digest(
				value.runtimeProtocolDigest,
				"authority.runtimeProtocolDigest",
			),
		});
	} catch (error) {
		throw badRequest(error instanceof Error ? error.message : String(error));
	}
}

function mutationAction(value: unknown): CustomCheckMutationAction {
	if (value === "create" || value === "update" || value === "activate" || value === "disable") {
		return value;
	}
	throw new Error("Custom Check mutation action must be create, update, activate, or disable.");
}

function baseCommandKeys(...additional: string[]): string[] {
	return [
		"protocolId",
		"protocolVersion",
		"action",
		"idempotencyKey",
		"expectedConfigDigest",
		"expectedProtectedSourceHead",
		"expectedProtectedConfigDigest",
		...additional,
	];
}

function requireDefinition(
	definitions: readonly CustomCheckDefinition[],
	customCheckIdValue: string,
): CustomCheckDefinition {
	const definition = definitions.find(
		(entry) => entry.customCheckId === customCheckIdValue,
	);
	if (!definition) throw conflict(`Custom Check ${customCheckIdValue} does not exist.`);
	return definition;
}

function customCheckId(value: unknown): string {
	if (typeof value !== "string" || !/^custom-check:[0-9a-f]{64}$/u.test(value)) {
		throw new Error("customCheckId must be a Runtime-owned Custom Check id.");
	}
	return value;
}

function idempotencyKey(value: unknown): string {
	const normalized = boundedText(
		value,
		"idempotencyKey",
		CUSTOM_CHECK_MUTATION_PROTOCOL.maxIdempotencyKeyLength,
	);
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)) {
		throw new Error("idempotencyKey contains unsupported characters.");
	}
	return normalized;
}

function gitObjectId(value: unknown, field: string): string {
	if (typeof value !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
		throw new Error(`${field} must be a full Git object id.`);
	}
	return value;
}

function sha256Digest(value: unknown, field: string): Sha256Digest {
	return assertSha256Digest(value, field);
}

function boundedText(value: unknown, field: string, max: number): string {
	if (typeof value !== "string" || !value.trim() || value.length > max) {
		throw new Error(`${field} must be non-empty text no longer than ${max} characters.`);
	}
	return value.trim();
}

function assertIdempotentPayload(
	previous: Sha256Digest,
	current: Sha256Digest,
	state: "completed" | "running",
): void {
	if (previous !== current) {
		throw conflict(`Idempotency key is ${state} with different input.`);
	}
}

function trimCompleted(entries: Map<string, CompletedMutation>): void {
	while (entries.size > CUSTOM_CHECK_MUTATION_PROTOCOL.maxCompletedCommands) {
		const first = entries.keys().next().value;
		if (first === undefined) return;
		entries.delete(first);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function badRequest(message: string): CustomCheckMutationError {
	return new CustomCheckMutationError("bad_request", message);
}

function conflict(message: string): CustomCheckMutationError {
	return new CustomCheckMutationError("conflict", message);
}

function forbidden(message: string): CustomCheckMutationError {
	return new CustomCheckMutationError("forbidden", message);
}
