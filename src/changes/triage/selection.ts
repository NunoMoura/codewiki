import {
	authorityBindingSchema,
	type AuthorityBinding,
} from "../../change-trace/contracts.ts";
import type {ProjectWorkState} from "../../change-trace/state.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {
	assertExactKeys,
	assertTypeboxSchema,
} from "../../utils/json.ts";
import type {
	BacklogTriageCandidate,
	BacklogTriageProjection,
} from "./contracts.ts";
import {assertBacklogTriageProjection} from "./query.ts";

export const DECISION_ATTENTION_SELECTION_PROTOCOL = Object.freeze({
	id: "codewiki.decision-attention-selection",
	version: "1.0.0",
	maxConflictRefs: 512,
	maxCompletedIdempotencyEntries: 1_024,
} as const);

export interface DecisionAttentionSelectionCommand {
	readonly protocolId: typeof DECISION_ATTENTION_SELECTION_PROTOCOL.id;
	readonly protocolVersion: typeof DECISION_ATTENTION_SELECTION_PROTOCOL.version;
	readonly idempotencyKey: string;
	readonly changeId: string;
	readonly changeRevisionId: Sha256Digest;
	readonly expectedTriageCandidateDigest: Sha256Digest;
	readonly expectedWorkStateDigest: Sha256Digest;
	readonly expectedProjectionDigest: Sha256Digest;
	readonly expectedProjectConfigDigest: Sha256Digest;
	readonly expectedTriagePolicyDigest: Sha256Digest;
}

export interface AuthenticatedDecisionSelectionAuthority
	extends AuthorityBinding {
	readonly authenticationEvidenceId: string;
}

export interface DecisionAttentionSelectionBinding {
	readonly changeId: string;
	readonly changeRevisionId: Sha256Digest;
	readonly triageCandidateDigest: Sha256Digest;
	readonly remoteStateHead: string;
	readonly sourceHead: string;
	readonly knowledgeDigest: Sha256Digest;
	readonly projectConfigDigest: Sha256Digest;
	readonly loopPolicyDigest: Sha256Digest;
	readonly workStateDigest: Sha256Digest;
	readonly graphSnapshotDigest: Sha256Digest;
	readonly graphContentDigest: Sha256Digest;
	readonly triagePolicyDigest: Sha256Digest;
	readonly projectionDigest: Sha256Digest;
}

export interface DecisionAttentionSelectionAuthorizationRequest {
	readonly protocolId: typeof DECISION_ATTENTION_SELECTION_PROTOCOL.id;
	readonly protocolVersion: typeof DECISION_ATTENTION_SELECTION_PROTOCOL.version;
	readonly idempotencyKey: string;
	readonly commandDigest: Sha256Digest;
	readonly authority: AuthenticatedDecisionSelectionAuthority;
	readonly binding: DecisionAttentionSelectionBinding;
	readonly conflictRefs: readonly string[];
	readonly authorizationDigest: Sha256Digest;
}

export interface DecisionAttentionSelectionReceipt {
	readonly selectionId: string;
	readonly protocolId: typeof DECISION_ATTENTION_SELECTION_PROTOCOL.id;
	readonly protocolVersion: typeof DECISION_ATTENTION_SELECTION_PROTOCOL.version;
	readonly idempotencyKey: string;
	readonly commandDigest: Sha256Digest;
	readonly authority: AuthenticatedDecisionSelectionAuthority;
	readonly authorizationDigest: Sha256Digest;
	readonly binding: DecisionAttentionSelectionBinding;
	readonly conflictRefs: readonly string[];
	readonly decisionJobId: string;
}

export interface DecisionAttentionSelectionContext {
	readonly workState: ProjectWorkState;
	readonly projection: BacklogTriageProjection;
}

export interface DecisionAttentionSelectionRuntime {
	execute(input: {
		readonly command: DecisionAttentionSelectionCommand;
		readonly authority: AuthenticatedDecisionSelectionAuthority;
	}): Promise<DecisionAttentionSelectionReceipt>;
}

export type DecisionAttentionSelectionErrorCode =
	| "bad_request"
	| "conflict"
	| "forbidden";

export class DecisionAttentionSelectionError extends Error {
	readonly code: DecisionAttentionSelectionErrorCode;

	constructor(input: {
		readonly code: DecisionAttentionSelectionErrorCode;
		readonly message: string;
	}) {
		super(input.message);
		this.name = "DecisionAttentionSelectionError";
		this.code = input.code;
	}
}

const CHANGE_ID = /^CHG-[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{7,127}$/u;
const SELECTION_ID = /^decision-attention-selection:[0-9a-f]{64}$/u;
const JOB_ID = /^decision-attention-job:[0-9a-f]{64}$/u;

export function createDecisionAttentionSelectionRuntime(options: {
	readonly loadCurrentContext: () =>
		| DecisionAttentionSelectionContext
		| Promise<DecisionAttentionSelectionContext>;
	readonly authorize: (
		request: DecisionAttentionSelectionAuthorizationRequest,
	) => boolean | Promise<boolean>;
}): DecisionAttentionSelectionRuntime {
	const completed = new Map<
		string,
		{
			readonly payloadDigest: Sha256Digest;
			readonly receipt: DecisionAttentionSelectionReceipt;
		}
	>();
	const pending = new Map<
		string,
		{
			readonly payloadDigest: Sha256Digest;
			readonly result: Promise<DecisionAttentionSelectionReceipt>;
		}
	>();
	return Object.freeze({
		async execute(input: {
			readonly command: DecisionAttentionSelectionCommand;
			readonly authority: AuthenticatedDecisionSelectionAuthority;
		}) {
			const command = parseDecisionAttentionSelectionCommand(input.command);
			const authority = normalizeAuthority(input.authority);
			const payloadDigest = canonicalJsonDigest({command, authority});
			const replay = completed.get(command.idempotencyKey);
			if (replay) {
				assertSameIdempotentSelection({
					previous: replay.payloadDigest,
					current: payloadDigest,
				});
				return replay.receipt;
			}
			const inFlight = pending.get(command.idempotencyKey);
			if (inFlight) {
				assertSameIdempotentSelection({
					previous: inFlight.payloadDigest,
					current: payloadDigest,
				});
				return inFlight.result;
			}
			const result = executeDecisionAttentionSelection({
				command,
				authority,
				options,
			});
			pending.set(command.idempotencyKey, {payloadDigest, result});
			try {
				const receipt = await result;
				completed.set(command.idempotencyKey, {payloadDigest, receipt});
				trimCompletedSelections(completed);
				return receipt;
			} finally {
				pending.delete(command.idempotencyKey);
			}
		},
	});
}

async function executeDecisionAttentionSelection(input: {
	readonly command: DecisionAttentionSelectionCommand;
	readonly authority: AuthenticatedDecisionSelectionAuthority;
	readonly options: {
		readonly loadCurrentContext: () =>
			| DecisionAttentionSelectionContext
			| Promise<DecisionAttentionSelectionContext>;
		readonly authorize: (
			request: DecisionAttentionSelectionAuthorizationRequest,
		) => boolean | Promise<boolean>;
	};
}): Promise<DecisionAttentionSelectionReceipt> {
	const before = await input.options.loadCurrentContext();
	const selectedBefore = selectedContext({
		context: before,
		command: input.command,
	});
	const request = authorizationRequest({
		command: input.command,
		authority: input.authority,
		selected: selectedBefore,
	});
	if (!(await input.options.authorize(request))) {
		throw forbidden("Decision attention selection authority was denied.");
	}
	const after = await input.options.loadCurrentContext();
	const selectedAfter = selectedContext({
		context: after,
		command: input.command,
	});
	if (
		selectedAfter.binding.workStateDigest !==
			selectedBefore.binding.workStateDigest ||
		selectedAfter.binding.projectionDigest !==
			selectedBefore.binding.projectionDigest ||
		selectedAfter.binding.triagePolicyDigest !==
			selectedBefore.binding.triagePolicyDigest ||
		selectedAfter.binding.triageCandidateDigest !==
			selectedBefore.binding.triageCandidateDigest
	) {
		throw conflict(
			"Decision attention selection context changed during authorization.",
		);
	}
	return selectionReceipt({
		command: input.command,
		authority: input.authority,
		authorizationDigest: request.authorizationDigest,
		selected: selectedAfter,
	});
}

function assertSameIdempotentSelection(input: {
	readonly previous: Sha256Digest;
	readonly current: Sha256Digest;
}): void {
	if (input.previous !== input.current) {
		throw conflict(
			"Decision attention selection idempotencyKey was already used with different authenticated input.",
		);
	}
}

function trimCompletedSelections(
	entries: Map<
		string,
		{
			readonly payloadDigest: Sha256Digest;
			readonly receipt: DecisionAttentionSelectionReceipt;
		}
	>,
): void {
	while (
		entries.size >
		DECISION_ATTENTION_SELECTION_PROTOCOL.maxCompletedIdempotencyEntries
	) {
		const oldest = entries.keys().next().value;
		if (oldest === undefined) return;
		entries.delete(oldest);
	}
}

export function parseDecisionAttentionSelectionCommand(
	value: unknown,
): DecisionAttentionSelectionCommand {
	try {
		assertExactKeys(
			value,
			[
				"protocolId",
				"protocolVersion",
				"idempotencyKey",
				"changeId",
				"changeRevisionId",
				"expectedTriageCandidateDigest",
				"expectedWorkStateDigest",
				"expectedProjectionDigest",
				"expectedProjectConfigDigest",
				"expectedTriagePolicyDigest",
			],
			"Decision attention selection command",
		);
	} catch (error) {
		throw badRequest(errorMessage(error));
	}
	const command = value as DecisionAttentionSelectionCommand;
	if (
		command.protocolId !== DECISION_ATTENTION_SELECTION_PROTOCOL.id ||
		command.protocolVersion !== DECISION_ATTENTION_SELECTION_PROTOCOL.version
	) {
		throw badRequest("Decision attention selection protocol identity is invalid.");
	}
	if (
		typeof command.idempotencyKey !== "string" ||
		!IDEMPOTENCY_KEY.test(command.idempotencyKey)
	) {
		throw badRequest("Decision attention selection idempotencyKey is invalid.");
	}
	if (
		typeof command.changeId !== "string" ||
		!CHANGE_ID.test(command.changeId) ||
		command.changeId.length > 132
	) {
		throw badRequest("Decision attention selection changeId is invalid.");
	}
	for (const [field, digest] of [
		["changeRevisionId", command.changeRevisionId],
		[
			"expectedTriageCandidateDigest",
			command.expectedTriageCandidateDigest,
		],
		["expectedWorkStateDigest", command.expectedWorkStateDigest],
		["expectedProjectionDigest", command.expectedProjectionDigest],
		["expectedProjectConfigDigest", command.expectedProjectConfigDigest],
		["expectedTriagePolicyDigest", command.expectedTriagePolicyDigest],
	] as const) {
		try {
			assertSha256Digest(digest, `decisionSelection.${field}`);
		} catch (error) {
			throw badRequest(errorMessage(error));
		}
	}
	return deepFreeze(
		toCanonicalJsonValue(command),
	) as unknown as DecisionAttentionSelectionCommand;
}

export function assertDecisionAttentionSelectionReceipt(
	value: DecisionAttentionSelectionReceipt,
): void {
	assertExactKeys(
		value,
		[
			"selectionId",
			"protocolId",
			"protocolVersion",
			"idempotencyKey",
			"commandDigest",
			"authority",
			"authorizationDigest",
			"binding",
			"conflictRefs",
			"decisionJobId",
		],
		"Decision attention selection receipt",
	);
	if (
		value.protocolId !== DECISION_ATTENTION_SELECTION_PROTOCOL.id ||
		value.protocolVersion !== DECISION_ATTENTION_SELECTION_PROTOCOL.version ||
		!SELECTION_ID.test(value.selectionId) ||
		!JOB_ID.test(value.decisionJobId)
	) {
		throw new Error("Decision attention selection receipt identity is invalid.");
	}
	const authority = normalizeAuthority(value.authority);
	const binding = normalizeBinding(value.binding);
	const conflictRefs = normalizeConflictRefs(value.conflictRefs);
	const command = parseDecisionAttentionSelectionCommand({
		protocolId: value.protocolId,
		protocolVersion: value.protocolVersion,
		idempotencyKey: value.idempotencyKey,
		changeId: binding.changeId,
		changeRevisionId: binding.changeRevisionId,
		expectedTriageCandidateDigest: binding.triageCandidateDigest,
		expectedWorkStateDigest: binding.workStateDigest,
		expectedProjectionDigest: binding.projectionDigest,
		expectedProjectConfigDigest: binding.projectConfigDigest,
		expectedTriagePolicyDigest: binding.triagePolicyDigest,
	});
	const commandDigest = canonicalJsonDigest(command);
	if (value.commandDigest !== commandDigest) {
		throw new Error("Decision attention selection command digest is invalid.");
	}
	if (
		canonicalJsonDigest(value.conflictRefs) !== canonicalJsonDigest(conflictRefs)
	) {
		throw new Error("Decision attention selection conflict refs are not canonical.");
	}
	const expectedAuthorizationDigest = canonicalJsonDigest({
		protocolId: value.protocolId,
		protocolVersion: value.protocolVersion,
		idempotencyKey: value.idempotencyKey,
		commandDigest,
		authority,
		binding,
		conflictRefs,
	});
	if (value.authorizationDigest !== expectedAuthorizationDigest) {
		throw new Error("Decision attention selection authorization digest is invalid.");
	}
	const expectedSelectionId = selectionIdentity({
		command,
		authority,
		authorizationDigest: value.authorizationDigest,
		binding,
		conflictRefs,
	});
	if (value.selectionId !== expectedSelectionId) {
		throw new Error("Decision attention selection id does not match its content.");
	}
	if (
		value.decisionJobId !==
		decisionJobId({selectionId: expectedSelectionId, binding})
	) {
		throw new Error("Decision attention job id does not match its selection.");
	}
}

export function assertDecisionAttentionSelectionCurrent(input: {
	readonly receipt: DecisionAttentionSelectionReceipt;
	readonly context: DecisionAttentionSelectionContext;
}): BacklogTriageCandidate {
	const {receipt, context} = input;
	assertDecisionAttentionSelectionReceipt(receipt);
	const candidate = selectedContext({
		context,
		command: {
		protocolId: receipt.protocolId,
		protocolVersion: receipt.protocolVersion,
		idempotencyKey: receipt.idempotencyKey,
		changeId: receipt.binding.changeId,
		changeRevisionId: receipt.binding.changeRevisionId,
		expectedTriageCandidateDigest: receipt.binding.triageCandidateDigest,
			expectedWorkStateDigest: receipt.binding.workStateDigest,
			expectedProjectionDigest: receipt.binding.projectionDigest,
			expectedProjectConfigDigest: receipt.binding.projectConfigDigest,
			expectedTriagePolicyDigest: receipt.binding.triagePolicyDigest,
		},
	}).candidate;
	return deepFreeze(
		toCanonicalJsonValue(candidate),
	) as unknown as BacklogTriageCandidate;
}

function selectedContext(input: {
	readonly context: DecisionAttentionSelectionContext;
	readonly command: DecisionAttentionSelectionCommand;
}): {
	readonly candidate: BacklogTriageCandidate;
	readonly binding: DecisionAttentionSelectionBinding;
	readonly conflictRefs: readonly string[];
} {
	const {context, command} = input;
	assertCurrentContext(context);
	if (context.workState.workStateDigest !== command.expectedWorkStateDigest) {
		throw conflict("Decision attention selection WorkState is stale.");
	}
	if (context.projection.projectionDigest !== command.expectedProjectionDigest) {
		throw conflict("Decision attention selection projection is stale.");
	}
	if (
		context.projection.binding.configDigest !==
		command.expectedProjectConfigDigest
	) {
		throw conflict("Decision attention selection project config is stale.");
	}
	if (
		context.projection.policy.policyDigest !== command.expectedTriagePolicyDigest
	) {
		throw conflict("Decision attention selection triage policy is stale.");
	}
	const candidates = context.projection.candidates.filter(
		(candidate) =>
			candidate.changeId === command.changeId &&
			candidate.changeRevisionId === command.changeRevisionId,
	);
	if (candidates.length !== 1) {
		throw conflict(
			"Decision attention selection requires one eligible exact Change revision in the current projection.",
		);
	}
	const candidate = candidates[0];
	if (
		candidate.candidateDigest !== command.expectedTriageCandidateDigest
	) {
		throw conflict("Decision attention selection triage candidate digest is stale.");
	}
	const change = context.workState.changes.find(
		(entry) => entry.changeId === command.changeId,
	);
	if (
		!change?.currentRevision ||
		change.currentRevision.revisionId !== command.changeRevisionId ||
		change.withdrawn
	) {
		throw conflict("Decision attention selection Change revision is not current.");
	}
	const binding = selectionBinding({projection: context.projection, candidate});
	return {
		candidate,
		binding,
		conflictRefs: selectionConflictRefs(candidate),
	};
}

function assertCurrentContext(context: DecisionAttentionSelectionContext): void {
	if (!context || typeof context !== "object") {
		throw conflict("Decision attention selection context is unavailable.");
	}
	const {workStateDigest, ...stateBody} = context.workState;
	if (canonicalJsonDigest(stateBody) !== workStateDigest) {
		throw conflict("Decision attention selection WorkState digest is invalid.");
	}
	assertBacklogTriageProjection(context.projection);
	if (
		context.projection.binding.workStateDigest !== workStateDigest ||
		context.projection.binding.remoteStateHead !== context.workState.stateHead ||
		context.projection.binding.sourceHead !==
			context.workState.observedBase?.sourceHead ||
		context.projection.binding.knowledgeDigest !==
			context.workState.observedBase?.knowledgeDigest ||
		context.projection.binding.configDigest !==
			context.workState.observedBase?.configDigest ||
		context.projection.binding.policyDigest !==
			context.workState.observedBase?.policyDigest
	) {
		throw conflict(
			"Decision attention selection projection does not match current WorkState.",
		);
	}
}

function authorizationRequest(input: {
	readonly command: DecisionAttentionSelectionCommand;
	readonly authority: AuthenticatedDecisionSelectionAuthority;
	readonly selected: ReturnType<typeof selectedContext>;
}): DecisionAttentionSelectionAuthorizationRequest {
	const commandDigest = canonicalJsonDigest(input.command);
	const body = {
		protocolId: DECISION_ATTENTION_SELECTION_PROTOCOL.id,
		protocolVersion: DECISION_ATTENTION_SELECTION_PROTOCOL.version,
		idempotencyKey: input.command.idempotencyKey,
		commandDigest,
		authority: input.authority,
		binding: input.selected.binding,
		conflictRefs: input.selected.conflictRefs,
	};
	return Object.freeze({
		...body,
		authorizationDigest: canonicalJsonDigest(body),
	});
}

function selectionReceipt(input: {
	readonly command: DecisionAttentionSelectionCommand;
	readonly authority: AuthenticatedDecisionSelectionAuthority;
	readonly authorizationDigest: Sha256Digest;
	readonly selected: ReturnType<typeof selectedContext>;
}): DecisionAttentionSelectionReceipt {
	const commandDigest = canonicalJsonDigest(input.command);
	const selectionId = selectionIdentity({
		command: input.command,
		authority: input.authority,
		authorizationDigest: input.authorizationDigest,
		binding: input.selected.binding,
		conflictRefs: input.selected.conflictRefs,
	});
	const receipt = deepFreeze({
		selectionId,
		protocolId: DECISION_ATTENTION_SELECTION_PROTOCOL.id,
		protocolVersion: DECISION_ATTENTION_SELECTION_PROTOCOL.version,
		idempotencyKey: input.command.idempotencyKey,
		commandDigest,
		authority: input.authority,
		authorizationDigest: input.authorizationDigest,
		binding: input.selected.binding,
		conflictRefs: input.selected.conflictRefs,
		decisionJobId: decisionJobId({
			selectionId,
			binding: input.selected.binding,
		}),
	});
	assertDecisionAttentionSelectionReceipt(receipt);
	return receipt;
}

function selectionIdentity(input: {
	readonly command: DecisionAttentionSelectionCommand;
	readonly authority: AuthenticatedDecisionSelectionAuthority;
	readonly authorizationDigest: Sha256Digest;
	readonly binding: DecisionAttentionSelectionBinding;
	readonly conflictRefs: readonly string[];
}): string {
	const digest = canonicalJsonDigest({
		protocolId: DECISION_ATTENTION_SELECTION_PROTOCOL.id,
		protocolVersion: DECISION_ATTENTION_SELECTION_PROTOCOL.version,
		idempotencyKey: input.command.idempotencyKey,
		commandDigest: canonicalJsonDigest(input.command),
		authority: input.authority,
		authorizationDigest: input.authorizationDigest,
		binding: input.binding,
		conflictRefs: input.conflictRefs,
	});
	return `decision-attention-selection:${digest.slice("sha256:".length)}`;
}

function decisionJobId(input: {
	readonly selectionId: string;
	readonly binding: DecisionAttentionSelectionBinding;
}): string {
	const {selectionId, binding} = input;
	const digest = canonicalJsonDigest({
		selectionId,
		loop: "decision",
		changeId: binding.changeId,
		changeRevisionId: binding.changeRevisionId,
		workStateDigest: binding.workStateDigest,
		projectionDigest: binding.projectionDigest,
		triagePolicyDigest: binding.triagePolicyDigest,
	});
	return `decision-attention-job:${digest.slice("sha256:".length)}`;
}

function selectionBinding(input: {
	readonly projection: BacklogTriageProjection;
	readonly candidate: BacklogTriageCandidate;
}): DecisionAttentionSelectionBinding {
	const {projection, candidate} = input;
	return Object.freeze({
		changeId: candidate.changeId,
		changeRevisionId: candidate.changeRevisionId,
		triageCandidateDigest: candidate.candidateDigest,
		remoteStateHead: projection.binding.remoteStateHead,
		sourceHead: projection.binding.sourceHead,
		knowledgeDigest: projection.binding.knowledgeDigest,
		projectConfigDigest: projection.binding.configDigest,
		loopPolicyDigest: projection.binding.policyDigest,
		workStateDigest: projection.binding.workStateDigest,
		graphSnapshotDigest: projection.binding.graphSnapshotDigest,
		graphContentDigest: projection.binding.graphContentDigest,
		triagePolicyDigest: projection.binding.triagePolicyDigest,
		projectionDigest: projection.projectionDigest,
	});
}

function normalizeBinding(
	value: DecisionAttentionSelectionBinding,
): DecisionAttentionSelectionBinding {
	assertExactKeys(
		value,
		[
			"changeId",
			"changeRevisionId",
			"triageCandidateDigest",
			"remoteStateHead",
			"sourceHead",
			"knowledgeDigest",
			"projectConfigDigest",
			"loopPolicyDigest",
			"workStateDigest",
			"graphSnapshotDigest",
			"graphContentDigest",
			"triagePolicyDigest",
			"projectionDigest",
		],
		"Decision attention selection binding",
	);
	if (!CHANGE_ID.test(value.changeId)) {
		throw new Error("Decision attention selection binding changeId is invalid.");
	}
	for (const [field, digest] of Object.entries(value).filter(([field]) =>
		field.toLowerCase().includes("digest") || field === "changeRevisionId",
	)) {
		assertSha256Digest(digest, `decisionSelection.binding.${field}`);
	}
	if (
		typeof value.remoteStateHead !== "string" ||
		!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value.remoteStateHead) ||
		typeof value.sourceHead !== "string" ||
		!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value.sourceHead)
	) {
		throw new Error("Decision attention selection Git binding is invalid.");
	}
	return deepFreeze(
		toCanonicalJsonValue(value),
	) as unknown as DecisionAttentionSelectionBinding;
}

function normalizeAuthority(
	value: AuthenticatedDecisionSelectionAuthority,
): AuthenticatedDecisionSelectionAuthority {
	if (!value?.authenticationEvidenceId) {
		throw badRequest("Decision selection authority requires authentication Evidence.");
	}
	try {
		assertTypeboxSchema(authorityBindingSchema, value, "Decision selection authority");
	} catch (error) {
		throw badRequest(errorMessage(error));
	}
	return deepFreeze(
		toCanonicalJsonValue(value),
	) as unknown as AuthenticatedDecisionSelectionAuthority;
}

function selectionConflictRefs(
	candidate: BacklogTriageCandidate,
): readonly string[] {
	return normalizeConflictRefs([
		`change:${candidate.changeId}`,
		...candidate.affectedScope.knowledgeRefs.map((ref) => `knowledge:${ref}`),
		...candidate.affectedScope.sourceRefs.map((ref) => `source:${ref}`),
		...candidate.affectedScope.components.map((ref) => `component:${ref}`),
	]);
}

function normalizeConflictRefs(input: readonly string[]): readonly string[] {
	if (!Array.isArray(input)) {
		throw new Error("Decision attention selection conflictRefs must be an array.");
	}
	const refs = [...new Set(input.map((ref) => boundedRef(ref)))].sort(compareText);
	if (refs.length > DECISION_ATTENTION_SELECTION_PROTOCOL.maxConflictRefs) {
		throw new Error("Decision attention selection has too many conflict refs.");
	}
	return Object.freeze(refs);
}

function boundedRef(value: unknown): string {
	if (
		typeof value !== "string" ||
		!value.trim() ||
		value.length > 1_024 ||
		/\p{Cc}/u.test(value)
	) {
		throw new Error("Decision attention selection conflict ref is invalid.");
	}
	return value.normalize("NFC").trim();
}

function compareText(...values: [string, string]): number {
	const [left, right] = values;
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	for (const child of Object.values(value)) deepFreeze(child);
	return Object.freeze(value);
}

function badRequest(message: string): DecisionAttentionSelectionError {
	return new DecisionAttentionSelectionError({code: "bad_request", message});
}

function conflict(message: string): DecisionAttentionSelectionError {
	return new DecisionAttentionSelectionError({code: "conflict", message});
}

function forbidden(message: string): DecisionAttentionSelectionError {
	return new DecisionAttentionSelectionError({code: "forbidden", message});
}
