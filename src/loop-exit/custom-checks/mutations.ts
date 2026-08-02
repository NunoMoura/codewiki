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
	normalizeCustomCheckProposal,
	updateCustomCheckDefinition,
	type CustomCheckDefinition,
	type CustomCheckLifecycle,
	type CustomCheckProposal,
} from "./contracts.ts";
import {
	assertUserStandardDistillationReceipt,
	isUserStandardDistilledProposalId,
	materializeUserStandardDistillationBundle,
	type UserStandardDistillationReceipt,
} from "./distillation.ts";
import {
	normalizeUserStandardDefinitions,
	type UserStandardDefinition,
} from "./user-standards.ts";
import {
	assertProtectedCustomCheckConfigSnapshot,
	createCustomCheckConfigState,
	type CustomCheckConfigState,
	type ProtectedCustomCheckConfigSnapshot,
} from "./configuration.ts";
import {createSerializedIdempotencyGate} from "./serialized-idempotency.ts";
import {
	canonicalIsoTimestamp,
	compareCanonicalText as compareText,
} from "./validation.ts";

export const CUSTOM_CHECK_MUTATION_PROTOCOL = Object.freeze({
	id: "codewiki.custom-check-mutation",
	version: "3.0.0",
	maxIdempotencyKeyLength: 128,
	maxCompletedCommands: 64,
	maxBundleCustomChecks: 16,
});

export type CustomCheckMutationAction =
	| "create"
	| "update"
	| "activate"
	| "disable"
	| "create_distilled_bundle";

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

export interface CreateDistilledCustomCheckBundleCommand
	extends CustomCheckMutationCommandBase {
	readonly action: "create_distilled_bundle";
	readonly distillationReceipt: Extract<
		UserStandardDistillationReceipt,
		{readonly status: "completed"}
	>;
	readonly selectedProposalIds: readonly string[];
}

export type CustomCheckMutationCommand =
	| CreateCustomCheckCommand
	| UpdateCustomCheckCommand
	| ActivateCustomCheckCommand
	| DisableCustomCheckCommand
	| CreateDistilledCustomCheckBundleCommand;

export type AuthenticatedCustomCheckAuthority = AuthorityBinding & {
	readonly authenticationEvidenceId: string;
};

export interface CustomCheckMutationStore {
	readonly load: () => Promise<CustomCheckConfigState>;
	readonly preview: (input: {
		readonly current: CustomCheckConfigState;
		readonly userStandards: readonly UserStandardDefinition[];
		readonly customChecks: readonly CustomCheckDefinition[];
	}) => Promise<CustomCheckConfigState>;
	readonly compareAndSwap: (input: {
		readonly expectedConfigDigest: Sha256Digest;
		readonly expectedNextConfigDigest: Sha256Digest;
		readonly userStandards: readonly UserStandardDefinition[];
		readonly customChecks: readonly CustomCheckDefinition[];
	}) => Promise<CustomCheckConfigState>;
}

export interface CustomCheckMutationStandardDefinitionChange {
	readonly before: UserStandardDefinition | null;
	readonly after: UserStandardDefinition;
}

export interface CustomCheckMutationDefinitionChangeMaterial {
	readonly before: CustomCheckDefinition | null;
	readonly after: CustomCheckDefinition;
}

export interface CustomCheckAuthorizationRequest {
	readonly protocolId: typeof CUSTOM_CHECK_MUTATION_PROTOCOL.id;
	readonly protocolVersion: typeof CUSTOM_CHECK_MUTATION_PROTOCOL.version;
	readonly command: CustomCheckMutationCommand;
	readonly authority: AuthenticatedCustomCheckAuthority;
	readonly protectedBase: ProtectedCustomCheckConfigSnapshot;
	readonly before: CustomCheckConfigState;
	readonly after: CustomCheckConfigState;
	readonly standardChanges: readonly CustomCheckMutationStandardDefinitionChange[];
	readonly definitionChanges: readonly CustomCheckMutationDefinitionChangeMaterial[];
	readonly authorizationDigest: Sha256Digest;
}

export interface CustomCheckMutationStandardBinding {
	readonly userStandardId: string;
	readonly standardDigest: Sha256Digest;
	readonly sourceContentDigest: Sha256Digest;
}

export interface CustomCheckMutationStandardChange {
	readonly before: CustomCheckMutationStandardBinding | null;
	readonly after: CustomCheckMutationStandardBinding;
}

export interface CustomCheckMutationDefinitionBinding {
	readonly customCheckId: string;
	readonly definitionDigest: Sha256Digest;
	readonly lifecycle: CustomCheckLifecycle;
}

export interface CustomCheckMutationDefinitionChange {
	readonly before: CustomCheckMutationDefinitionBinding | null;
	readonly after: CustomCheckMutationDefinitionBinding;
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
	readonly distillationReceipt: UserStandardDistillationReceipt | null;
	readonly selectedProposalIds: readonly string[];
	readonly standardChanges: readonly CustomCheckMutationStandardChange[];
	readonly definitionChanges: readonly CustomCheckMutationDefinitionChange[];
	readonly effectiveFrom: "next_protected_snapshot";
}

export interface CustomCheckMutationResult {
	readonly replayed: boolean;
	readonly changedUserStandards: readonly UserStandardDefinition[];
	readonly changedCustomChecks: readonly CustomCheckDefinition[];
	readonly receipt: CustomCheckMutationReceipt;
	readonly state: CustomCheckConfigState;
}

export interface CustomCheckMutationRuntime {
	readonly execute: (
		...input: [unknown, AuthenticatedCustomCheckAuthority]
	) => Promise<CustomCheckMutationResult>;
}

export type CustomCheckMutationErrorCode =
	| "bad_request"
	| "conflict"
	| "forbidden";

export class CustomCheckMutationError extends Error {
	readonly code: CustomCheckMutationErrorCode;

	constructor(...input: [CustomCheckMutationErrorCode, string]) {
		const [code, message] = input;
		super(message);
		this.name = "CustomCheckMutationError";
		this.code = code;
	}
}

export function assertCustomCheckMutationReceipt(
	value: CustomCheckMutationReceipt,
): void {
	try {
		assertExactKeys(
			value,
			[
				"receiptId",
				"protocolId",
				"protocolVersion",
				"idempotencyKey",
				"action",
				"recordedAt",
				"authority",
				"authorizationDigest",
				"protectedBaseSnapshotDigest",
				"protectedSourceHead",
				"protectedConfigDigest",
				"configDigestBefore",
				"configDigestAfter",
				"customCheckConfigDigestBefore",
				"customCheckConfigDigestAfter",
				"distillationReceipt",
				"selectedProposalIds",
				"standardChanges",
				"definitionChanges",
				"effectiveFrom",
			],
			"Custom Check mutation receipt",
		);
		if (
			value.protocolId !== CUSTOM_CHECK_MUTATION_PROTOCOL.id ||
			value.protocolVersion !== CUSTOM_CHECK_MUTATION_PROTOCOL.version
		) {
			throw new Error("Custom Check mutation receipt protocol identity is invalid.");
		}
		const action = mutationAction(value.action);
		const recordedAt = canonicalIsoTimestamp(
			value.recordedAt,
			"receipt.recordedAt",
		);
		const authority = normalizeAuthenticatedCustomCheckAuthority(value.authority);
		const distillationReceipt = normalizedDistillationReceipt(
			value.distillationReceipt,
		);
		const selectedIds = selectedProposalIds(value.selectedProposalIds);
		const standardChanges = normalizeReceiptStandardChanges(value.standardChanges);
		const definitionChanges = normalizeReceiptDefinitionChanges(
			value.definitionChanges,
		);
		assertReceiptTransition({
			action,
			distillationReceipt,
			selectedProposalIds: selectedIds,
			standardChanges,
			definitionChanges,
		});
		const payload = {
			protocolId: CUSTOM_CHECK_MUTATION_PROTOCOL.id,
			protocolVersion: CUSTOM_CHECK_MUTATION_PROTOCOL.version,
			idempotencyKey: idempotencyKey(value.idempotencyKey),
			action,
			recordedAt,
			authority,
			authorizationDigest: assertSha256Digest(
				value.authorizationDigest,
				"receipt.authorizationDigest",
			),
			protectedBaseSnapshotDigest: assertSha256Digest(
				value.protectedBaseSnapshotDigest,
				"receipt.protectedBaseSnapshotDigest",
			),
			protectedSourceHead: gitObjectId(
				value.protectedSourceHead,
				"receipt.protectedSourceHead",
			),
			protectedConfigDigest: assertSha256Digest(
				value.protectedConfigDigest,
				"receipt.protectedConfigDigest",
			),
			configDigestBefore: assertSha256Digest(
				value.configDigestBefore,
				"receipt.configDigestBefore",
			),
			configDigestAfter: assertSha256Digest(
				value.configDigestAfter,
				"receipt.configDigestAfter",
			),
			customCheckConfigDigestBefore: assertSha256Digest(
				value.customCheckConfigDigestBefore,
				"receipt.customCheckConfigDigestBefore",
			),
			customCheckConfigDigestAfter: assertSha256Digest(
				value.customCheckConfigDigestAfter,
				"receipt.customCheckConfigDigestAfter",
			),
			distillationReceipt,
			selectedProposalIds: selectedIds,
			standardChanges,
			definitionChanges,
			effectiveFrom: value.effectiveFrom,
		};
		if (payload.effectiveFrom !== "next_protected_snapshot") {
			throw new Error("Custom Check mutation receipt effectiveFrom is invalid.");
		}
		if (
			payload.configDigestBefore === payload.configDigestAfter ||
			payload.customCheckConfigDigestBefore === payload.customCheckConfigDigestAfter
		) {
			throw new Error("Custom Check mutation receipt must describe a config change.");
		}
		const {receiptId: _receiptId, ...rawPayload} = value;
		const expectedReceiptId = `custom-check-mutation:${canonicalJsonDigest(payload).slice("sha256:".length)}`;
		const rawReceiptId = `custom-check-mutation:${canonicalJsonDigest(rawPayload).slice("sha256:".length)}`;
		if (
			value.receiptId !== expectedReceiptId ||
			value.receiptId !== rawReceiptId
		) {
			throw new Error("Custom Check mutation receipt id does not match its content.");
		}
	} catch (error) {
		if (error instanceof CustomCheckMutationError) throw error;
		throw badRequest(error instanceof Error ? error.message : String(error));
	}
}

export function createCustomCheckMutationRuntime(options: {
	readonly store: CustomCheckMutationStore;
	readonly loadProtectedBase: () => Promise<ProtectedCustomCheckConfigSnapshot>;
	readonly authorize: (
		request: CustomCheckAuthorizationRequest,
	) => boolean | Promise<boolean>;
	readonly now?: () => Date;
}): CustomCheckMutationRuntime {
	const now = options.now ?? (() => new Date());
	const idempotency = createSerializedIdempotencyGate<CustomCheckMutationResult>({
		maxCompleted: CUSTOM_CHECK_MUTATION_PROTOCOL.maxCompletedCommands,
		conflict: (state) =>
			conflict(`Idempotency key is ${state} with different input.`),
	});
	return Object.freeze({
		async execute(
			...input: [unknown, AuthenticatedCustomCheckAuthority]
		) {
			const [value, suppliedAuthority] = input;
			const command = parseCustomCheckMutationCommand(value);
			const authority = normalizeAuthenticatedCustomCheckAuthority(suppliedAuthority);
			return idempotency.run({
				key: command.idempotencyKey,
				payloadDigest: canonicalJsonDigest({command, authority}),
				execute: () =>
					executeMutation({options, command, authority, now}),
			});
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
		if (action === "create") {
			assertExactKeys(
				value,
				baseCommandKeys("proposal"),
				"Custom Check mutation command",
			);
			return Object.freeze({...base, action, proposal: normalizedProposal(value.proposal)});
		}
		if (action === "update") {
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
		}
		if (action === "activate" || action === "disable") {
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
		assertExactKeys(
			value,
			baseCommandKeys("distillationReceipt", "selectedProposalIds"),
			"Custom Check mutation command",
		);
		const distillationReceipt = normalizedDistillationReceipt(
			value.distillationReceipt,
		);
		if (!distillationReceipt || distillationReceipt.status !== "completed") {
			throw new Error(
				"Distilled bundle mutation requires one completed distillation receipt.",
			);
		}
		const selectedIds = selectedProposalIds(value.selectedProposalIds);
		const availableIds = new Set(
			materializeUserStandardDistillationBundle(distillationReceipt)
				.customCheckProposals.map((proposal) => proposal.proposalId),
		);
		for (const proposalId of selectedIds) {
			if (!availableIds.has(proposalId)) {
				throw new Error(`Unknown distilled Custom Check proposal ${proposalId}.`);
			}
		}
		return Object.freeze({
			...base,
			action,
			distillationReceipt,
			selectedProposalIds: Object.freeze(selectedIds),
		});
	} catch (error) {
		if (error instanceof CustomCheckMutationError) throw error;
		throw badRequest(error instanceof Error ? error.message : String(error));
	}
}

async function executeMutation(input: {
	readonly options: Parameters<typeof createCustomCheckMutationRuntime>[0];
	readonly command: CustomCheckMutationCommand;
	readonly authority: AuthenticatedCustomCheckAuthority;
	readonly now: () => Date;
}): Promise<CustomCheckMutationResult> {
	const {options, command, authority, now} = input;
	const [beforeValue, protectedBase] = await Promise.all([
		options.store.load(),
		options.loadProtectedBase(),
	]);
	const before = normalizedState(beforeValue);
	assertProtectedCustomCheckConfigSnapshot(protectedBase);
	assertExpectedState({command, before, protectedBase});
	const mutation = applyMutation({
		command,
		definitions: before.customChecks,
		userStandards: before.userStandards,
	});
	const projected = normalizedState(
		await options.store.preview({
			current: before,
			userStandards: mutation.userStandards,
			customChecks: mutation.customChecks,
		}),
	);
	if (projected.customCheckConfigDigest !== mutation.customCheckConfigDigest) {
		throw conflict("Custom Check configuration preview changed the requested policy bundle.");
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
		standardChanges: mutation.standardChanges,
		definitionChanges: mutation.definitionChanges,
	});
	const authorizationRequest: CustomCheckAuthorizationRequest = Object.freeze({
		protocolId: CUSTOM_CHECK_MUTATION_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_MUTATION_PROTOCOL.version,
		command,
		authority,
		protectedBase,
		before,
		after: projected,
		standardChanges: mutation.standardChanges,
		definitionChanges: mutation.definitionChanges,
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
			userStandards: mutation.userStandards,
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
		standardChanges: mutation.standardChanges,
		definitionChanges: mutation.definitionChanges,
		recordedAt: now().toISOString(),
	});
	return Object.freeze({
		replayed: false,
		changedUserStandards: Object.freeze(
			mutation.standardChanges.map((change) => change.after),
		),
		changedCustomChecks: Object.freeze(
			mutation.definitionChanges.map((change) => change.after),
		),
		receipt,
		state,
	});
}

function applyMutation(input: {
	readonly command: CustomCheckMutationCommand;
	readonly definitions: readonly CustomCheckDefinition[];
	readonly userStandards: readonly UserStandardDefinition[];
}): {
	readonly userStandards: readonly UserStandardDefinition[];
	readonly customChecks: readonly CustomCheckDefinition[];
	readonly customCheckConfigDigest: Sha256Digest;
	readonly standardChanges: readonly CustomCheckMutationStandardDefinitionChange[];
	readonly definitionChanges: readonly CustomCheckMutationDefinitionChangeMaterial[];
} {
	const {command, definitions, userStandards} = input;
	if (command.action === "create_distilled_bundle") {
		const bundle = materializeUserStandardDistillationBundle(
			command.distillationReceipt,
		);
		if (
			userStandards.some(
				(standard) =>
					standard.userStandardId === bundle.userStandard.userStandardId,
			)
		) {
			throw conflict(
				`User Standard ${bundle.userStandard.userStandardId} already exists.`,
			);
		}
		const nextUserStandards = normalizeUserStandardDefinitions([
			...userStandards,
			bundle.userStandard,
		]);
		const selected = new Set(command.selectedProposalIds);
		const changedCustomChecks: CustomCheckDefinition[] = [];
		for (const proposal of bundle.customCheckProposals) {
			if (!selected.has(proposal.proposalId)) continue;
			changedCustomChecks.push(
				createCustomCheckDefinition(proposal.proposal, nextUserStandards),
			);
		}
		const existingIds = new Set(
			definitions.map((definition) => definition.customCheckId),
		);
		for (const definition of changedCustomChecks) {
			if (existingIds.has(definition.customCheckId)) {
				throw conflict(`Custom Check ${definition.customCheckId} already exists.`);
			}
			existingIds.add(definition.customCheckId);
		}
		const customChecks = normalizeCustomCheckDefinitions(
			[...definitions, ...changedCustomChecks],
			nextUserStandards,
		);
		return Object.freeze({
			userStandards: nextUserStandards,
			customChecks,
			customCheckConfigDigest: customCheckConfigurationDigest({
				userStandards: nextUserStandards,
				customChecks,
			}),
			standardChanges: Object.freeze([
				Object.freeze({before: null, after: bundle.userStandard}),
			]),
			definitionChanges: Object.freeze(
				changedCustomChecks.map((definition) =>
					Object.freeze({before: null, after: definition}),
				),
			),
		});
	}
	let definitionBefore: CustomCheckDefinition | null = null;
	let definitionAfter: CustomCheckDefinition;
	if (command.action === "create") {
		definitionAfter = createCustomCheckDefinition(command.proposal, userStandards);
		if (definitions.some((entry) => entry.customCheckId === definitionAfter.customCheckId)) {
			throw conflict(`Custom Check ${definitionAfter.customCheckId} already exists.`);
		}
	} else {
		definitionBefore = requireDefinition(definitions, command.customCheckId);
		try {
			if (command.action === "update") {
				if (definitionBefore.lifecycle === "disabled") {
					throw new Error("Disabled Custom Checks cannot be edited.");
				}
				definitionAfter = updateCustomCheckDefinition(
					definitionBefore,
					command.proposal,
					userStandards,
				);
			} else if (command.action === "activate") {
				definitionAfter = activateCustomCheckDefinition(
					definitionBefore,
					userStandards,
				);
			} else {
				definitionAfter = disableCustomCheckDefinition(
					definitionBefore,
					userStandards,
				);
			}
		} catch (error) {
			throw badRequest(error instanceof Error ? error.message : String(error));
		}
	}
	const customChecks = normalizeCustomCheckDefinitions(
		[
			...definitions.filter(
				(entry) => entry.customCheckId !== definitionAfter.customCheckId,
			),
			definitionAfter,
		],
		userStandards,
	);
	return Object.freeze({
		userStandards,
		customChecks,
		customCheckConfigDigest: customCheckConfigurationDigest({
			userStandards,
			customChecks,
		}),
		standardChanges: Object.freeze([]),
		definitionChanges: Object.freeze([
			Object.freeze({before: definitionBefore, after: definitionAfter}),
		]),
	});
}

function mutationReceipt(input: {
	readonly command: CustomCheckMutationCommand;
	readonly authority: AuthenticatedCustomCheckAuthority;
	readonly authorizationDigest: Sha256Digest;
	readonly protectedBase: ProtectedCustomCheckConfigSnapshot;
	readonly before: CustomCheckConfigState;
	readonly after: CustomCheckConfigState;
	readonly standardChanges: readonly CustomCheckMutationStandardDefinitionChange[];
	readonly definitionChanges: readonly CustomCheckMutationDefinitionChangeMaterial[];
	readonly recordedAt: string;
}): CustomCheckMutationReceipt {
	const standardChanges = Object.freeze(
		input.standardChanges
			.map(standardChangeBinding)
			.sort((...values) =>
				compareText(values[0].after.userStandardId, values[1].after.userStandardId),
			),
	);
	const definitionChanges = Object.freeze(
		input.definitionChanges
			.map(definitionChangeBinding)
			.sort((...values) =>
				compareText(values[0].after.customCheckId, values[1].after.customCheckId),
			),
	);
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
		distillationReceipt:
			input.command.action === "create_distilled_bundle"
				? input.command.distillationReceipt
				: null,
		selectedProposalIds:
			input.command.action === "create_distilled_bundle"
				? input.command.selectedProposalIds
				: Object.freeze([]),
		standardChanges,
		definitionChanges,
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
		standardChanges: input.standardChanges.map(standardChangeBinding),
		definitionChanges: input.definitionChanges.map(definitionChangeBinding),
		effectiveFrom: "next_protected_snapshot",
	});
}

function standardBinding(
	standard: UserStandardDefinition | null,
): CustomCheckMutationStandardBinding | null {
	if (!standard) return null;
	return Object.freeze({
		userStandardId: standard.userStandardId,
		standardDigest: standard.standardDigest,
		sourceContentDigest: standard.source.contentDigest,
	});
}

function standardChangeBinding(
	change: CustomCheckMutationStandardDefinitionChange,
): CustomCheckMutationStandardChange {
	const after = standardBinding(change.after);
	if (!after) throw new Error("User Standard mutation requires an after binding.");
	return Object.freeze({before: standardBinding(change.before), after});
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

function definitionChangeBinding(
	change: CustomCheckMutationDefinitionChangeMaterial,
): CustomCheckMutationDefinitionChange {
	const after = definitionBinding(change.after);
	if (!after) throw new Error("Custom Check mutation requires an after binding.");
	return Object.freeze({before: definitionBinding(change.before), after});
}

function normalizedState(value: CustomCheckConfigState): CustomCheckConfigState {
	const normalized = createCustomCheckConfigState({
		projectConfigDigest: value.projectConfigDigest,
		userStandards: value.userStandards,
		customChecks: value.customChecks,
	});
	if (normalized.customCheckConfigDigest !== value.customCheckConfigDigest) {
		throw conflict("Custom Check configuration state digest does not match its definitions.");
	}
	return normalized;
}

function assertExpectedState(input: {
	readonly command: CustomCheckMutationCommand;
	readonly before: CustomCheckConfigState;
	readonly protectedBase: ProtectedCustomCheckConfigSnapshot;
}): void {
	const {command, before, protectedBase} = input;
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
	...input: [Record<string, unknown>, CustomCheckMutationAction]
): CustomCheckMutationCommandBase {
	const [value, action] = input;
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
		expectedConfigDigest: assertSha256Digest(value.expectedConfigDigest, "expectedConfigDigest"),
		expectedProtectedSourceHead: gitObjectId(
			value.expectedProtectedSourceHead,
			"expectedProtectedSourceHead",
		),
		expectedProtectedConfigDigest: assertSha256Digest(
			value.expectedProtectedConfigDigest,
			"expectedProtectedConfigDigest",
		),
	};
}

function normalizedProposal(value: unknown): CustomCheckProposal {
	const proposal = normalizeCustomCheckProposal(value as CustomCheckProposal);
	return Object.freeze({
		...proposal,
		appliesWhen: Object.freeze({...proposal.appliesWhen}),
		standardRefs: Object.freeze(
			proposal.standardRefs.map((reference) =>
				Object.freeze({
					...reference,
					passageIds: Object.freeze([...reference.passageIds]),
				}),
			),
		),
		...(proposal.knowledgeRefs
			? {knowledgeRefs: Object.freeze([...proposal.knowledgeRefs])}
			: {}),
	});
}

export function normalizeAuthenticatedCustomCheckAuthority(
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
			"Custom Check authenticated authority",
		);
		return Object.freeze({
			actorId: boundedText(value.actorId, "authority.actorId", 200),
			principalRef: boundedText(value.principalRef, "authority.principalRef", 512),
			role: boundedText(value.role, "authority.role", 100),
			actorPolicyDigest: assertSha256Digest(
				value.actorPolicyDigest,
				"authority.actorPolicyDigest",
			),
			authenticationEvidenceId: boundedText(
				value.authenticationEvidenceId,
				"authority.authenticationEvidenceId",
				512,
			),
			runtimeProtocolDigest: assertSha256Digest(
				value.runtimeProtocolDigest,
				"authority.runtimeProtocolDigest",
			),
		});
	} catch (error) {
		throw badRequest(error instanceof Error ? error.message : String(error));
	}
}

function mutationAction(value: unknown): CustomCheckMutationAction {
	if (
		value === "create" ||
		value === "update" ||
		value === "activate" ||
		value === "disable" ||
		value === "create_distilled_bundle"
	) {
		return value;
	}
	throw new Error(
		"Custom Check mutation action must be create, update, activate, disable, or create_distilled_bundle.",
	);
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
	...input: [readonly CustomCheckDefinition[], string]
): CustomCheckDefinition {
	const [definitions, customCheckIdValue] = input;
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

function gitObjectId(...input: [unknown, string]): string {
	const [value, field] = input;
	if (typeof value !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
		throw new Error(`${field} must be a full Git object id.`);
	}
	return value;
}

function boundedText(...input: [unknown, string, number]): string {
	const [value, field, max] = input;
	if (typeof value !== "string" || !value.trim() || value.length > max) {
		throw new Error(`${field} must be non-empty text no longer than ${max} characters.`);
	}
	return value.trim();
}

function normalizedDistillationReceipt(
	value: UserStandardDistillationReceipt | null | unknown,
): UserStandardDistillationReceipt | null {
	if (value === null) return null;
	if (!isRecord(value)) {
		throw new Error("Custom Check mutation distillationReceipt must be an object or null.");
	}
	const receipt = value as unknown as UserStandardDistillationReceipt;
	assertUserStandardDistillationReceipt(receipt);
	return receipt;
}

function selectedProposalIds(value: unknown): string[] {
	if (
		!Array.isArray(value) ||
		value.length > CUSTOM_CHECK_MUTATION_PROTOCOL.maxBundleCustomChecks
	) {
		throw new Error(
			`selectedProposalIds cannot exceed ${CUSTOM_CHECK_MUTATION_PROTOCOL.maxBundleCustomChecks} entries.`,
		);
	}
	const ids = value.map((entry) => {
		if (!isUserStandardDistilledProposalId(entry)) {
			throw new Error("selectedProposalIds contains an invalid proposal id.");
		}
		return entry;
	});
	if (new Set(ids).size !== ids.length) {
		throw new Error("selectedProposalIds cannot contain duplicates.");
	}
	return ids.sort(compareText);
}

function normalizeReceiptStandardChanges(
	value: readonly CustomCheckMutationStandardChange[],
): CustomCheckMutationStandardChange[] {
	if (!Array.isArray(value) || value.length > 1) {
		throw new Error("Custom Check mutation receipt standardChanges are invalid.");
	}
	const changes = value.map((...entries) => {
		const [change, index] = entries;
		if (!isRecord(change)) {
			throw new Error(`Custom Check mutation standardChanges[${index}] is invalid.`);
		}
		assertExactKeys(
			change,
			["before", "after"],
			`Custom Check mutation standardChanges[${index}]`,
		);
		return Object.freeze({
			before:
				change.before === null
					? null
					: normalizeReceiptStandardBinding(
							change.before as CustomCheckMutationStandardBinding,
							`standardChanges[${index}].before`,
						),
			after: normalizeReceiptStandardBinding(
				change.after as CustomCheckMutationStandardBinding,
				`standardChanges[${index}].after`,
			),
		});
	});
	return changes.sort((...values) =>
		compareText(values[0].after.userStandardId, values[1].after.userStandardId),
	);
}

function normalizeReceiptStandardBinding(
	...input: [CustomCheckMutationStandardBinding, string]
): CustomCheckMutationStandardBinding {
	const [value, label] = input;
	if (!isRecord(value)) {
		throw new Error(`Custom Check mutation receipt ${label} is invalid.`);
	}
	assertExactKeys(
		value,
		["userStandardId", "standardDigest", "sourceContentDigest"],
		`Custom Check mutation receipt ${label}`,
	);
	if (
		typeof value.userStandardId !== "string" ||
		!/^user-standard:[0-9a-f]{64}$/u.test(value.userStandardId)
	) {
		throw new Error(`Custom Check mutation receipt ${label} id is invalid.`);
	}
	return Object.freeze({
		userStandardId: value.userStandardId,
		standardDigest: assertSha256Digest(value.standardDigest, `${label}.standardDigest`),
		sourceContentDigest: assertSha256Digest(
			value.sourceContentDigest,
			`${label}.sourceContentDigest`,
		),
	});
}

function normalizeReceiptDefinitionChanges(
	value: readonly CustomCheckMutationDefinitionChange[],
): CustomCheckMutationDefinitionChange[] {
	if (
		!Array.isArray(value) ||
		value.length > CUSTOM_CHECK_MUTATION_PROTOCOL.maxBundleCustomChecks
	) {
		throw new Error("Custom Check mutation receipt definitionChanges are invalid.");
	}
	const changes = value.map((...entries) => {
		const [change, index] = entries;
		if (!isRecord(change)) {
			throw new Error(`Custom Check mutation definitionChanges[${index}] is invalid.`);
		}
		assertExactKeys(
			change,
			["before", "after"],
			`Custom Check mutation definitionChanges[${index}]`,
		);
		return Object.freeze({
			before:
				change.before === null
					? null
					: normalizeReceiptDefinitionBinding(
							change.before as CustomCheckMutationDefinitionBinding,
							`definitionChanges[${index}].before`,
						),
			after: normalizeReceiptDefinitionBinding(
				change.after as CustomCheckMutationDefinitionBinding,
				`definitionChanges[${index}].after`,
			),
		});
	});
	const ids = changes.map((change) => change.after.customCheckId);
	if (new Set(ids).size !== ids.length) {
		throw new Error("Custom Check mutation definitionChanges cannot contain duplicates.");
	}
	return changes.sort((...values) =>
		compareText(values[0].after.customCheckId, values[1].after.customCheckId),
	);
}

function normalizeReceiptDefinitionBinding(
	...input: [CustomCheckMutationDefinitionBinding, string]
): CustomCheckMutationDefinitionBinding {
	const [value, label] = input;
	if (!isRecord(value)) {
		throw new Error(`Custom Check mutation receipt ${label} is invalid.`);
	}
	assertExactKeys(
		value,
		["customCheckId", "definitionDigest", "lifecycle"],
		`Custom Check mutation receipt ${label}`,
	);
	if (!["draft", "active", "disabled"].includes(value.lifecycle)) {
		throw new Error(`Custom Check mutation receipt ${label} lifecycle is invalid.`);
	}
	return Object.freeze({
		customCheckId: customCheckId(value.customCheckId),
		definitionDigest: assertSha256Digest(
			value.definitionDigest,
			`${label}.definitionDigest`,
		),
		lifecycle: value.lifecycle,
	});
}

function assertReceiptTransition(input: {
	readonly action: CustomCheckMutationAction;
	readonly distillationReceipt: UserStandardDistillationReceipt | null;
	readonly selectedProposalIds: readonly string[];
	readonly standardChanges: readonly CustomCheckMutationStandardChange[];
	readonly definitionChanges: readonly CustomCheckMutationDefinitionChange[];
}): void {
	if (input.action === "create_distilled_bundle") {
		assertDistilledBundleReceiptTransition(input);
		return;
	}
	assertSingleCheckReceiptTransition({
		action: input.action,
		distillationReceipt: input.distillationReceipt,
		selectedProposalIds: input.selectedProposalIds,
		standardChanges: input.standardChanges,
		definitionChanges: input.definitionChanges,
	});
}

function assertDistilledBundleReceiptTransition(input: {
	readonly distillationReceipt: UserStandardDistillationReceipt | null;
	readonly selectedProposalIds: readonly string[];
	readonly standardChanges: readonly CustomCheckMutationStandardChange[];
	readonly definitionChanges: readonly CustomCheckMutationDefinitionChange[];
}): void {
	if (
		!input.distillationReceipt ||
		input.distillationReceipt.status !== "completed" ||
		input.standardChanges.length !== 1 ||
		input.standardChanges[0].before !== null
	) {
		throw new Error("Distilled bundle receipt has an invalid Standard transition.");
	}
	const bundle = materializeUserStandardDistillationBundle(
		input.distillationReceipt,
	);
	const expectedStandard = standardBinding(bundle.userStandard);
	if (
		!expectedStandard ||
		canonicalJsonDigest(expectedStandard) !==
			canonicalJsonDigest(input.standardChanges[0].after)
	) {
		throw new Error("Distilled bundle receipt changed User Standard identity.");
	}
	const selectedIds = new Set(input.selectedProposalIds);
	const expectedDefinitions = new Map<
		string,
		CustomCheckMutationDefinitionBinding | null
	>();
	for (const proposal of bundle.customCheckProposals) {
		if (!selectedIds.has(proposal.proposalId)) continue;
		const definition = createCustomCheckDefinition(proposal.proposal, [
			bundle.userStandard,
		]);
		expectedDefinitions.set(
			definition.customCheckId,
			definitionBinding(definition),
		);
	}
	if (expectedDefinitions.size !== input.definitionChanges.length) {
		throw new Error("Distilled bundle receipt omitted selected Custom Check proposals.");
	}
	for (const change of input.definitionChanges) {
		const expected = expectedDefinitions.get(change.after.customCheckId);
		if (
			change.before !== null ||
			change.after.lifecycle !== "draft" ||
			!expected ||
			canonicalJsonDigest(expected) !== canonicalJsonDigest(change.after)
		) {
			throw new Error("Distilled bundle receipt changed Custom Check proposal semantics.");
		}
	}
}

function assertSingleCheckReceiptTransition(input: {
	readonly action: Exclude<CustomCheckMutationAction, "create_distilled_bundle">;
	readonly distillationReceipt: UserStandardDistillationReceipt | null;
	readonly selectedProposalIds: readonly string[];
	readonly standardChanges: readonly CustomCheckMutationStandardChange[];
	readonly definitionChanges: readonly CustomCheckMutationDefinitionChange[];
}): void {
	const {
		action,
		distillationReceipt,
		selectedProposalIds: selectedIds,
		standardChanges,
		definitionChanges,
	} = input;
	if (
		distillationReceipt ||
		selectedIds.length !== 0 ||
		standardChanges.length !== 0 ||
		definitionChanges.length !== 1
	) {
		throw new Error("Custom Check mutation receipt has unexpected bundle changes.");
	}
	const {before, after} = definitionChanges[0];
	if (action === "create") {
		if (before || after.lifecycle !== "draft") {
			throw new Error("Custom Check create receipt has an invalid lifecycle transition.");
		}
		return;
	}
	if (!before || before.customCheckId !== after.customCheckId) {
		throw new Error("Custom Check mutation receipt changed definition lineage.");
	}
	if (action === "update") {
		if (before.lifecycle !== after.lifecycle) {
			throw new Error("Custom Check update receipt changed lifecycle.");
		}
		return;
	}
	if (action === "activate") {
		if (before.lifecycle !== "draft" || after.lifecycle !== "active") {
			throw new Error("Custom Check activate receipt has an invalid lifecycle transition.");
		}
		if (before.definitionDigest !== after.definitionDigest) {
			throw new Error("Custom Check activate receipt changed definition semantics.");
		}
		return;
	}
	if (before.lifecycle === "disabled" || after.lifecycle !== "disabled") {
		throw new Error("Custom Check disable receipt has an invalid lifecycle transition.");
	}
	if (before.definitionDigest !== after.definitionDigest) {
		throw new Error("Custom Check disable receipt changed definition semantics.");
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
