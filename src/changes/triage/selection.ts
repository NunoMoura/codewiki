import {
	authorityBindingSchema,
	type AuthorityBinding,
	type ChangeRevision,
} from "../../change-trace/contracts.ts";
import type {
	ChangeWorkState,
	ProjectWorkState,
} from "../../change-trace/state.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys, assertTypeboxSchema} from "../../utils/json.ts";
import {normalizeChangeIntakeMaterial} from "../intake/normalize.ts";
import type {BacklogTriageProjection} from "./contracts.ts";
import {assertBacklogTriageProjection} from "./query.ts";

export const DECISION_ATTENTION_SELECTION_PROTOCOL = Object.freeze({
	id: "codewiki.decision-attention-selection",
	version: "2.0.0",
	maxConflictRefs: 512,
} as const);

export interface DecisionAttentionSelectionCommand {
	readonly protocolId: typeof DECISION_ATTENTION_SELECTION_PROTOCOL.id;
	readonly protocolVersion: typeof DECISION_ATTENTION_SELECTION_PROTOCOL.version;
	readonly idempotencyKey: string;
	readonly changeId: string;
	readonly changeRevisionId: Sha256Digest;
	readonly expectedProjectionDigest: Sha256Digest;
}

export interface AuthenticatedDecisionSelectionAuthority
	extends AuthorityBinding {
	readonly authenticationEvidenceId: string;
}

export interface DecisionAttentionSelectionAuthorizationRequest {
	readonly action: "decision:start";
	readonly commandDigest: Sha256Digest;
	readonly authority: AuthenticatedDecisionSelectionAuthority;
	readonly changeId: string;
	readonly changeRevisionId: Sha256Digest;
	readonly projectionDigest: Sha256Digest;
}

export interface DecisionAttentionSelectionContext {
	readonly workState: ProjectWorkState;
	readonly projection: BacklogTriageProjection;
}

interface SelectedDecisionAttention {
	readonly change: ChangeWorkState;
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
				"expectedProjectionDigest",
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
		["expectedProjectionDigest", command.expectedProjectionDigest],
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

export function normalizeDecisionSelectionAuthority(
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

export function assertDecisionAttentionSelectionContext(
	context: DecisionAttentionSelectionContext,
): void {
	if (!context || typeof context !== "object") {
		throw conflict("Decision attention selection context is unavailable.");
	}
	const {workStateDigest, ...stateBody} = context.workState;
	if (canonicalJsonDigest(stateBody) !== workStateDigest) {
		throw conflict("Decision attention selection WorkState digest is invalid.");
	}
	try {
		assertBacklogTriageProjection(context.projection);
	} catch (error) {
		throw conflict(
			`Decision attention selection projection is invalid: ${errorMessage(error)}`,
		);
	}
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

export function selectDecisionAttention(input: {
	readonly context: DecisionAttentionSelectionContext;
	readonly command: DecisionAttentionSelectionCommand;
}): SelectedDecisionAttention {
	const {command, context} = input;
	if (context.projection.projectionDigest !== command.expectedProjectionDigest) {
		throw conflict("Decision attention selection projection is stale.");
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
	return Object.freeze({change});
}

export function decisionSelectionAuthorizationRequest(input: {
	readonly command: DecisionAttentionSelectionCommand;
	readonly authority: AuthenticatedDecisionSelectionAuthority;
}): DecisionAttentionSelectionAuthorizationRequest {
	return Object.freeze({
		action: "decision:start",
		commandDigest: canonicalJsonDigest(input.command),
		authority: input.authority,
		changeId: input.command.changeId,
		changeRevisionId: input.command.changeRevisionId,
		projectionDigest: input.command.expectedProjectionDigest,
	});
}

export function decisionSelectionIdempotencyDigest(input: {
	readonly command: DecisionAttentionSelectionCommand;
	readonly authority: AuthenticatedDecisionSelectionAuthority;
}): Sha256Digest {
	return canonicalJsonDigest({
		protocolId: DECISION_ATTENTION_SELECTION_PROTOCOL.id,
		protocolVersion: DECISION_ATTENTION_SELECTION_PROTOCOL.version,
		action: "decision:start",
		idempotencyKey: input.command.idempotencyKey,
		actorId: input.authority.actorId,
		principalRef: input.authority.principalRef,
	});
}

export function decisionSelectionConflictRefs(input: {
	readonly change: ChangeWorkState;
	readonly revision: ChangeRevision;
}): readonly string[] {
	return normalizeConflictRefs([
		`change:${input.change.changeId}`,
		...input.revision.content.knowledge.topicRefs.map(
			(ref) => `knowledge:${ref}`,
		),
		...input.revision.content.knowledge.propagationRefs.map(
			(ref) => `knowledge:${ref}`,
		),
		...input.revision.content.evidence.sourceRefs.map(
			(ref) => `source:${ref}`,
		),
		...input.revision.content.classification.targetRefs.map(
			(ref) => `source:${ref}`,
		),
		...selectionAffectedRefs({
			change: input.change,
			revisionId: input.revision.revisionId,
		}).map((ref) => `source:${ref}`),
		...(input.revision.content.defectProfile?.sourceLocations ?? []).map(
			(ref) => `source:${ref}`,
		),
		...(input.revision.content.defectProfile?.affectedComponents ?? []).map(
			(ref) => `component:${ref}`,
		),
	]);
}

function selectionAffectedRefs(input: {
	readonly change: ChangeWorkState;
	readonly revisionId: Sha256Digest;
}): readonly string[] {
	return input.change.operations.flatMap((operation) => {
		if (operation.body.kind === "change.proposed") {
			const payload = operation.body.payload as {
				readonly intakeMaterial?: {readonly artifact: unknown};
			};
			return payload.intakeMaterial
				? normalizeChangeIntakeMaterial(payload.intakeMaterial.artifact).content
						.affectedRefs
				: [];
		}
		if (operation.body.kind === "change.feedback_recorded") {
			const payload = operation.body.payload as {
				readonly revisionId: Sha256Digest;
				readonly intakeMaterial?: {readonly artifact: unknown};
			};
			return payload.revisionId === input.revisionId && payload.intakeMaterial
				? normalizeChangeIntakeMaterial(payload.intakeMaterial.artifact).content
						.affectedRefs
				: [];
		}
		return [];
	});
}

function normalizeConflictRefs(input: readonly string[]): readonly string[] {
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
