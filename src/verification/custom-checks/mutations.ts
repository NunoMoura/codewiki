import type {AuthorityBinding} from "../../change-trace/contracts.ts";
import {
	createTriagePreferenceBinding,
	normalizeTriagePreferenceBindings,
	type TriagePreferenceBinding,
} from "../../changes/triage/policy.ts";
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
	normalizeCustomCodeTemplateBinding,
	type CustomCodeCapabilitySnapshot,
	type CustomCodeTemplateBinding,
	type CustomCodeTemplateSelection,
} from "./code-templates.ts";
import {
	assertUserStandardDistillationReceipt,
	isUserStandardDistilledCodeProposalId,
	isUserStandardDistilledProposalId,
	materializeUserStandardDistillationBundle,
	materializeUserStandardDistilledCodeCheck,
	type UserStandardDistillationReceipt,
	type UserStandardDistilledCustomCodeProposal,
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
	version: "5.0.0",
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

export interface CustomCheckMutationCodeTemplateSelection {
	readonly proposalId: string;
	readonly templateBinding: CustomCodeTemplateBinding;
}

export interface CreateDistilledCustomCheckBundleCommand
	extends CustomCheckMutationCommandBase {
	readonly action: "create_distilled_bundle";
	readonly distillationReceipt: Extract<
		UserStandardDistillationReceipt,
		{readonly status: "completed"}
	>;
	readonly selectedProposalIds: readonly string[];
	readonly codeTemplateSelections: readonly CustomCheckMutationCodeTemplateSelection[];
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
		readonly triagePreferences: readonly TriagePreferenceBinding[];
		readonly customChecks: readonly CustomCheckDefinition[];
	}) => Promise<CustomCheckConfigState>;
	readonly compareAndSwap: (input: {
		readonly expectedConfigDigest: Sha256Digest;
		readonly expectedNextConfigDigest: Sha256Digest;
		readonly userStandards: readonly UserStandardDefinition[];
		readonly triagePreferences: readonly TriagePreferenceBinding[];
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
	readonly capabilitySnapshot: CustomCodeCapabilitySnapshot | null;
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
	readonly evaluator: "model" | "code";
	readonly templateBindingDigest: Sha256Digest | null;
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
	readonly codeTemplateSelections: readonly CustomCheckMutationCodeTemplateSelection[];
	readonly activationCapabilitySnapshotDigest: Sha256Digest | null;
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
				"codeTemplateSelections",
				"activationCapabilitySnapshotDigest",
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
		const bundleFields = normalizeReceiptBundleFields(value);
		assertReceiptTransition({action, ...bundleFields});
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
			...bundleFields,
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

function normalizeReceiptBundleFields(
	value: CustomCheckMutationReceipt,
): ReceiptTransitionFields {
	const distillationReceipt = normalizedDistillationReceipt(
		value.distillationReceipt,
	);
	const selectedIds = selectedProposalIds(value.selectedProposalIds);
	const receiptBundle = distillationReceipt?.status === "completed"
		? materializeUserStandardDistillationBundle(distillationReceipt)
		: null;
	return {
		distillationReceipt,
		selectedProposalIds: selectedIds,
		codeTemplateSelections: normalizeCodeTemplateSelections({
			value: value.codeTemplateSelections,
			proposals: receiptBundle?.customCodeCheckProposals ?? [],
			selectedProposalIds: selectedIds,
			allowRuntimeFields: true,
		}),
		activationCapabilitySnapshotDigest: nullableDigest(
			value.activationCapabilitySnapshotDigest,
			"receipt.activationCapabilitySnapshotDigest",
		),
		standardChanges: normalizeReceiptStandardChanges(value.standardChanges),
		definitionChanges: normalizeReceiptDefinitionChanges(
			value.definitionChanges,
		),
	};
}

export function createCustomCheckMutationRuntime(options: {
	readonly store: CustomCheckMutationStore;
	readonly loadProtectedBase: () => Promise<ProtectedCustomCheckConfigSnapshot>;
	readonly loadCustomCodeCapabilitySnapshot?: () => Promise<CustomCodeCapabilitySnapshot>;
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
			baseCommandKeys(
				"distillationReceipt",
				"selectedProposalIds",
				"codeTemplateSelections",
			),
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
		const bundle = materializeUserStandardDistillationBundle(distillationReceipt);
		const availableIds = new Set([
			...bundle.customCheckProposals.map((proposal) => proposal.proposalId),
			...bundle.customCodeCheckProposals.map((proposal) => proposal.proposalId),
		]);
		for (const proposalId of selectedIds) {
			if (!availableIds.has(proposalId)) {
				throw new Error(`Unknown distilled Custom Check proposal ${proposalId}.`);
			}
		}
		const codeTemplateSelections = normalizeCodeTemplateSelections({
			value: value.codeTemplateSelections,
			proposals: bundle.customCodeCheckProposals,
			selectedProposalIds: selectedIds,
		});
		return Object.freeze({
			...base,
			action,
			distillationReceipt,
			selectedProposalIds: Object.freeze(selectedIds),
			codeTemplateSelections,
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
	const {capabilitySnapshot, recordedAt} = await activationCapabilityContext({
		options,
		command,
		before,
		now,
	});
	const mutation = applyMutation({
		command,
		definitions: before.customChecks,
		userStandards: before.userStandards,
		triagePreferences: before.triagePreferences,
		capabilitySnapshot,
	});
	const projected = normalizedState(
		await options.store.preview({
			current: before,
			userStandards: mutation.userStandards,
			triagePreferences: mutation.triagePreferences,
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
		capabilitySnapshot,
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
		capabilitySnapshot,
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
			triagePreferences: mutation.triagePreferences,
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
		activationCapabilitySnapshotDigest:
			capabilitySnapshot?.snapshotDigest ?? null,
		recordedAt,
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

async function activationCapabilityContext(input: {
	readonly options: Parameters<typeof createCustomCheckMutationRuntime>[0];
	readonly command: CustomCheckMutationCommand;
	readonly before: CustomCheckConfigState;
	readonly now: () => Date;
}): Promise<{
	readonly capabilitySnapshot: CustomCodeCapabilitySnapshot | null;
	readonly recordedAt: string;
}> {
	const {options, command, before, now} = input;
	const activationDefinition = command.action === "activate"
		? before.customChecks.find(
				(definition) => definition.customCheckId === command.customCheckId,
			)
		: undefined;
	const capabilitySnapshot =
		activationDefinition?.evaluator === "code" &&
		options.loadCustomCodeCapabilitySnapshot
			? await options.loadCustomCodeCapabilitySnapshot()
			: null;
	const recordedAt = now().toISOString();
	if (
		capabilitySnapshot &&
		Date.parse(capabilitySnapshot.observedAt) > Date.parse(recordedAt)
	) {
		throw badRequest(
			"Custom Code capability snapshot cannot postdate its activation mutation.",
		);
	}
	return {capabilitySnapshot, recordedAt};
}

interface AppliedCustomCheckMutation {
	readonly userStandards: readonly UserStandardDefinition[];
	readonly triagePreferences: readonly TriagePreferenceBinding[];
	readonly customChecks: readonly CustomCheckDefinition[];
	readonly customCheckConfigDigest: Sha256Digest;
	readonly standardChanges: readonly CustomCheckMutationStandardDefinitionChange[];
	readonly definitionChanges: readonly CustomCheckMutationDefinitionChangeMaterial[];
}

function applyMutation(input: {
	readonly command: CustomCheckMutationCommand;
	readonly definitions: readonly CustomCheckDefinition[];
	readonly userStandards: readonly UserStandardDefinition[];
	readonly triagePreferences: readonly TriagePreferenceBinding[];
	readonly capabilitySnapshot: CustomCodeCapabilitySnapshot | null;
}): AppliedCustomCheckMutation {
	const {command, definitions, userStandards, triagePreferences} = input;
	if (command.action === "create_distilled_bundle") {
		return applyDistilledBundleMutation({
			command,
			definitions,
			userStandards,
			triagePreferences,
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
					input.capabilitySnapshot ?? undefined,
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
		triagePreferences,
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

function applyDistilledBundleMutation(input: {
	readonly command: CreateDistilledCustomCheckBundleCommand;
	readonly definitions: readonly CustomCheckDefinition[];
	readonly userStandards: readonly UserStandardDefinition[];
	readonly triagePreferences: readonly TriagePreferenceBinding[];
}): AppliedCustomCheckMutation {
	const {command, definitions, userStandards, triagePreferences} = input;
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
	const changedTriagePreferences = bundle.clauses.flatMap((clause) =>
		clause.disposition === "triage_preference"
			? [
					createTriagePreferenceBinding({
						distillationReceiptId: bundle.distillationReceiptId,
						clauseId: clause.clauseId,
						userStandard: bundle.userStandard,
						passageId: clause.passageId,
						dimensions: clause.dimensions,
					}),
				]
			: [],
	);
	const nextTriagePreferences = normalizeTriagePreferenceBindings(
		[...triagePreferences, ...changedTriagePreferences],
		nextUserStandards,
	);
	const selected = new Set(command.selectedProposalIds);
	const changedCustomChecks: CustomCheckDefinition[] = [];
	for (const proposal of bundle.customCheckProposals) {
		if (!selected.has(proposal.proposalId)) continue;
		changedCustomChecks.push(
			createCustomCheckDefinition(proposal.proposal, nextUserStandards),
		);
	}
	for (const selection of command.codeTemplateSelections) {
		const proposal = materializeUserStandardDistilledCodeCheck({
			bundle,
			proposalId: selection.proposalId,
			codeTemplate: {
				templateId: selection.templateBinding.templateId,
				parameters: selection.templateBinding.parameters,
			},
		});
		changedCustomChecks.push(
			createCustomCheckDefinition(proposal, nextUserStandards),
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
		triagePreferences: nextTriagePreferences,
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

function mutationReceipt(input: {
	readonly command: CustomCheckMutationCommand;
	readonly authority: AuthenticatedCustomCheckAuthority;
	readonly authorizationDigest: Sha256Digest;
	readonly protectedBase: ProtectedCustomCheckConfigSnapshot;
	readonly before: CustomCheckConfigState;
	readonly after: CustomCheckConfigState;
	readonly standardChanges: readonly CustomCheckMutationStandardDefinitionChange[];
	readonly definitionChanges: readonly CustomCheckMutationDefinitionChangeMaterial[];
	readonly activationCapabilitySnapshotDigest: Sha256Digest | null;
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
		codeTemplateSelections:
			input.command.action === "create_distilled_bundle"
				? input.command.codeTemplateSelections
				: Object.freeze([]),
		activationCapabilitySnapshotDigest:
			input.activationCapabilitySnapshotDigest,
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
		capabilitySnapshotDigest:
			input.capabilitySnapshot?.snapshotDigest ?? null,
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
		evaluator: definition.evaluator,
		templateBindingDigest: definition.codeTemplate?.bindingDigest ?? null,
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
		triagePreferences: value.triagePreferences,
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

function nullableDigest(...input: [unknown, string]): Sha256Digest | null {
	const [value, field] = input;
	return value === null ? null : assertSha256Digest(value, field);
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

function normalizeCodeTemplateSelections(input: {
	readonly value: unknown;
	readonly proposals: readonly UserStandardDistilledCustomCodeProposal[];
	readonly selectedProposalIds: readonly string[];
	readonly allowRuntimeFields?: boolean;
}): readonly CustomCheckMutationCodeTemplateSelection[] {
	const {
		value,
		proposals,
		selectedProposalIds: selectedProposalIdList,
		allowRuntimeFields = false,
	} = input;
	if (!Array.isArray(value) || value.length > CUSTOM_CHECK_MUTATION_PROTOCOL.maxBundleCustomChecks) {
		throw new Error(
			`codeTemplateSelections cannot exceed ${CUSTOM_CHECK_MUTATION_PROTOCOL.maxBundleCustomChecks} entries.`,
		);
	}
	const proposalById = new Map(
		proposals.map((proposal) => [proposal.proposalId, proposal] as const),
	);
	const selectedIds = new Set(selectedProposalIdList);
	const selections: CustomCheckMutationCodeTemplateSelection[] = [];
	for (let index = 0; index < value.length; index += 1) {
		const entry = value[index];
		if (!isRecord(entry)) {
			throw new Error(`codeTemplateSelections[${index}] must be an object.`);
		}
		assertExactKeys(
			entry,
			["proposalId", "templateBinding"],
			`codeTemplateSelections[${index}]`,
		);
		if (!isUserStandardDistilledCodeProposalId(entry.proposalId)) {
			throw new Error(`codeTemplateSelections[${index}].proposalId is invalid.`);
		}
		const proposal = proposalById.get(entry.proposalId);
		if (!proposal || !selectedIds.has(entry.proposalId)) {
			throw new Error(
				`Code template selection ${entry.proposalId} is not a selected distilled Custom Code Check proposal.`,
			);
		}
		const templateBinding = normalizeCustomCodeTemplateBinding({
			value: entry.templateBinding as CustomCodeTemplateSelection,
			checkTypeId: proposal.proposal.checkTypeId,
			applicabilityLoops: proposal.proposal.appliesWhen.loops ?? [],
			allowRuntimeFields,
		});
		selections.push(
			Object.freeze({proposalId: entry.proposalId, templateBinding}),
		);
	}
	if (new Set(selections.map((selection) => selection.proposalId)).size !== selections.length) {
		throw new Error("codeTemplateSelections cannot contain duplicate proposal ids.");
	}
	const selectedCodeIds = proposals
		.flatMap((proposal) =>
			selectedIds.has(proposal.proposalId) ? [proposal.proposalId] : [],
		)
		.sort(compareText);
	const selectionIds = selections
		.map((selection) => selection.proposalId)
		.sort(compareText);
	if (canonicalJsonDigest(selectedCodeIds) !== canonicalJsonDigest(selectionIds)) {
		throw new Error(
			"Every selected distilled Custom Code Check proposal requires one approved code template selection.",
		);
	}
	return Object.freeze(
		selections.sort((...selectionsToCompare) =>
			compareText(
				selectionsToCompare[0].proposalId,
				selectionsToCompare[1].proposalId,
			),
		),
	);
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
		if (
			!isUserStandardDistilledProposalId(entry) &&
			!isUserStandardDistilledCodeProposalId(entry)
		) {
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
		[
			"customCheckId",
			"definitionDigest",
			"lifecycle",
			"evaluator",
			"templateBindingDigest",
		],
		`Custom Check mutation receipt ${label}`,
	);
	if (!["draft", "active", "disabled"].includes(value.lifecycle)) {
		throw new Error(`Custom Check mutation receipt ${label} lifecycle is invalid.`);
	}
	if (value.evaluator !== "model" && value.evaluator !== "code") {
		throw new Error(`Custom Check mutation receipt ${label} evaluator is invalid.`);
	}
	const templateBindingDigest = nullableDigest(
		value.templateBindingDigest,
		`${label}.templateBindingDigest`,
	);
	if (
		(value.evaluator === "model" && templateBindingDigest !== null) ||
		(value.evaluator === "code" && templateBindingDigest === null)
	) {
		throw new Error(
			`Custom Check mutation receipt ${label} template binding is invalid.`,
		);
	}
	return Object.freeze({
		customCheckId: customCheckId(value.customCheckId),
		definitionDigest: assertSha256Digest(
			value.definitionDigest,
			`${label}.definitionDigest`,
		),
		lifecycle: value.lifecycle,
		evaluator: value.evaluator,
		templateBindingDigest,
	});
}

interface ReceiptTransitionFields {
	readonly distillationReceipt: UserStandardDistillationReceipt | null;
	readonly selectedProposalIds: readonly string[];
	readonly codeTemplateSelections: readonly CustomCheckMutationCodeTemplateSelection[];
	readonly activationCapabilitySnapshotDigest: Sha256Digest | null;
	readonly standardChanges: readonly CustomCheckMutationStandardChange[];
	readonly definitionChanges: readonly CustomCheckMutationDefinitionChange[];
}

type ReceiptTransitionInput = ReceiptTransitionFields & (
	| {readonly action: "create_distilled_bundle"}
	| {
			readonly action: Exclude<
				CustomCheckMutationAction,
				"create_distilled_bundle"
			>;
	  }
);

function assertReceiptTransition(input: ReceiptTransitionInput): void {
	if (input.action === "create_distilled_bundle") {
		assertDistilledBundleReceiptTransition(input);
		return;
	}
	assertSingleCheckReceiptTransition(input);
}

function assertDistilledBundleReceiptTransition(
	input: ReceiptTransitionFields,
): void {
	const bundle = assertedDistilledReceiptBundle(input);
	const expectedDefinitions = expectedDistilledDefinitionBindings({
		transition: input,
		bundle,
	});
	assertDistilledDefinitionChanges({
		changes: input.definitionChanges,
		expectedDefinitions,
	});
}

function assertedDistilledReceiptBundle(input: ReceiptTransitionFields) {
	if (
		!input.distillationReceipt ||
		input.distillationReceipt.status !== "completed" ||
		input.activationCapabilitySnapshotDigest !== null ||
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
	return bundle;
}

function expectedDistilledDefinitionBindings(input: {
	readonly transition: ReceiptTransitionFields;
	readonly bundle: ReturnType<typeof materializeUserStandardDistillationBundle>;
}): Map<string, CustomCheckMutationDefinitionBinding | null> {
	const {transition, bundle} = input;
	const selectedIds = new Set(transition.selectedProposalIds);
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
	for (const selection of transition.codeTemplateSelections) {
		const proposal = materializeUserStandardDistilledCodeCheck({
			bundle,
			proposalId: selection.proposalId,
			codeTemplate: {
				templateId: selection.templateBinding.templateId,
				parameters: selection.templateBinding.parameters,
			},
		});
		const definition = createCustomCheckDefinition(proposal, [
			bundle.userStandard,
		]);
		expectedDefinitions.set(
			definition.customCheckId,
			definitionBinding(definition),
		);
	}
	return expectedDefinitions;
}

function assertDistilledDefinitionChanges(input: {
	readonly changes: readonly CustomCheckMutationDefinitionChange[];
	readonly expectedDefinitions: ReadonlyMap<
		string,
		CustomCheckMutationDefinitionBinding | null
	>;
}): void {
	const {changes, expectedDefinitions} = input;
	if (expectedDefinitions.size !== changes.length) {
		throw new Error("Distilled bundle receipt omitted selected Custom Check proposals.");
	}
	for (const change of changes) {
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

function assertSingleCheckReceiptTransition(
	input: ReceiptTransitionFields & {
		readonly action: Exclude<
			CustomCheckMutationAction,
			"create_distilled_bundle"
		>;
	},
): void {
	assertSingleReceiptEnvelope(input);
	const change = input.definitionChanges[0];
	assertActivationCapabilityBinding({transition: input, after: change.after});
	if (input.action === "create") {
		assertCreateReceiptChange(change);
		return;
	}
	const before = assertedPriorDefinitionBinding(change);
	if (input.action === "update") {
		if (before.lifecycle !== change.after.lifecycle) {
			throw new Error("Custom Check update receipt changed lifecycle.");
		}
		return;
	}
	if (input.action === "activate") {
		assertActivationReceiptChange({before, after: change.after});
		return;
	}
	assertDisableReceiptChange({before, after: change.after});
}

function assertSingleReceiptEnvelope(input: ReceiptTransitionFields): void {
	if (
		input.distillationReceipt ||
		input.selectedProposalIds.length !== 0 ||
		input.codeTemplateSelections.length !== 0 ||
		input.standardChanges.length !== 0 ||
		input.definitionChanges.length !== 1
	) {
		throw new Error("Custom Check mutation receipt has unexpected bundle changes.");
	}
}

function assertActivationCapabilityBinding(input: {
	readonly transition: ReceiptTransitionFields & {
		readonly action: CustomCheckMutationAction;
	};
	readonly after: CustomCheckMutationDefinitionBinding;
}): void {
	const {transition, after} = input;
	const requiresCapability =
		transition.action === "activate" && after.evaluator === "code";
	if (
		(requiresCapability && transition.activationCapabilitySnapshotDigest === null) ||
		(!requiresCapability && transition.activationCapabilitySnapshotDigest !== null)
	) {
		throw new Error(
			"Custom Check mutation receipt activation capability binding is invalid.",
		);
	}
}

function assertCreateReceiptChange(
	change: CustomCheckMutationDefinitionChange,
): void {
	if (change.before || change.after.lifecycle !== "draft") {
		throw new Error("Custom Check create receipt has an invalid lifecycle transition.");
	}
}

function assertedPriorDefinitionBinding(
	change: CustomCheckMutationDefinitionChange,
): CustomCheckMutationDefinitionBinding {
	if (
		!change.before ||
		change.before.customCheckId !== change.after.customCheckId
	) {
		throw new Error("Custom Check mutation receipt changed definition lineage.");
	}
	return change.before;
}

function assertActivationReceiptChange(input: {
	readonly before: CustomCheckMutationDefinitionBinding;
	readonly after: CustomCheckMutationDefinitionBinding;
}): void {
	const {before, after} = input;
	if (before.lifecycle !== "draft" || after.lifecycle !== "active") {
		throw new Error("Custom Check activate receipt has an invalid lifecycle transition.");
	}
	if (before.definitionDigest !== after.definitionDigest) {
		throw new Error("Custom Check activate receipt changed definition semantics.");
	}
}

function assertDisableReceiptChange(input: {
	readonly before: CustomCheckMutationDefinitionBinding;
	readonly after: CustomCheckMutationDefinitionBinding;
}): void {
	const {before, after} = input;
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
