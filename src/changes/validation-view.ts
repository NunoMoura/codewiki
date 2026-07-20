import { changeContentDigest } from "./digest.ts";
import { parseChangeRecord, type ChangeRecord } from "./records.ts";
import type {
	ChangeAssessmentStance,
	ChangeRecommendationValue,
	ChangeStatus,
	ChangeValidationSeverity,
	ChangeValidationState,
} from "./types.ts";

const MAX_TEXT_LENGTH = 4_000;
const MAX_SHORT_TEXT_LENGTH = 512;
const MAX_LIST_ITEMS = 32;
const MAX_CARD_BYTES = 24_000;
const UNSAFE_CONTROL_CHARACTERS =
	/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export interface ChangeValidationCardIdentity {
	changeId: string;
	revision: number;
	recordRevision: number;
	contentDigest: string;
	status: ChangeStatus;
	validationState: ChangeValidationState;
}

export interface ChangeValidationCardAssessment {
	actor: string;
	stance: ChangeAssessmentStance;
	rationale: string;
	concerns: string[];
	evidenceRefs: string[];
}

export interface ChangeValidationCardRecommendation {
	actor: string;
	value: ChangeRecommendationValue;
	rationale: string;
	evidenceRefs: string[];
}

export interface ChangeValidationCardIssue {
	code: string;
	severity: ChangeValidationSeverity;
	message: string;
	refs: string[];
}

export interface ChangeValidationCard {
	identity: ChangeValidationCardIdentity;
	question: string;
	sections: {
		currentState: {
			text: string;
			currentPain?: string;
		};
		proposedChange: {
			text: string;
			rationale: string;
			desiredOutcome?: string;
			nonGoals: string[];
		};
		agentOpinion: {
			assessments: ChangeValidationCardAssessment[];
			recommendations: ChangeValidationCardRecommendation[];
			concerns: string[];
		};
	};
	validation: {
		issues: ChangeValidationCardIssue[];
		successSignal?: string;
		regressionPlan?: string;
		validatorVersion?: string;
		validatedRevision?: number;
		validatedDigest?: string;
	};
	acceptance?: {
		authority: string;
		ref: string;
		acceptedBy: string;
		acceptedAt: string;
	};
	redactions: string[];
}

interface ChangeValidationCardExpectations {
	expectedRevision?: number;
	expectedRecordRevision?: number;
	expectedDigest?: string;
}

interface ProjectionContext {
	redactions: Set<string>;
}

export function buildChangeValidationCard(
	input: unknown,
	expected: ChangeValidationCardExpectations = {},
): ChangeValidationCard {
	const record = parseChangeRecord(input);
	const digest = changeContentDigest(record.change);
	assertExpectedIdentity(record, digest, expected);
	const context: ProjectionContext = { redactions: new Set() };
	const assessments = limitedList(
		"validation assessments",
		record.change.validation.assessments,
	).map((assessment) => ({
		actor: boundedText(
			"assessment actor",
			assessment.actor,
			context,
			MAX_SHORT_TEXT_LENGTH,
		),
		stance: assessment.stance,
		rationale: boundedText(
			"assessment rationale",
			assessment.rationale,
			context,
		),
		concerns: boundedTextList(
			"assessment concerns",
			assessment.concerns,
			context,
		),
		evidenceRefs: boundedRefList(
			"assessment evidence refs",
			assessment.evidenceRefs,
			context,
		),
	}));
	const recommendations = limitedList(
		"validation recommendations",
		record.change.validation.recommendations,
	).map((recommendation) => ({
		actor: boundedText(
			"recommendation actor",
			recommendation.actor,
			context,
			MAX_SHORT_TEXT_LENGTH,
		),
		value: recommendation.value,
		rationale: boundedText(
			"recommendation rationale",
			recommendation.rationale,
			context,
		),
		evidenceRefs: boundedRefList(
			"recommendation evidence refs",
			recommendation.evidenceRefs,
			context,
		),
	}));
	const card: ChangeValidationCard = {
		identity: {
			changeId: boundedText("Change id", record.change.id, context, 160),
			revision: record.change.revision,
			recordRevision: record.recordRevision,
			contentDigest: digest,
			status: record.change.status,
			validationState: record.change.validation.state,
		},
		question: boundedText(
			"Change question",
			record.change.intent.question,
			context,
		),
		sections: {
			currentState: {
				text: boundedText(
					"Current state",
					record.change.intent.currentState,
					context,
				),
			},
			proposedChange: {
				text: boundedText(
					"Proposed change",
					record.change.intent.desiredState,
					context,
				),
				rationale: boundedText(
					"Change rationale",
					record.change.intent.rationale,
					context,
				),
				nonGoals: boundedTextList(
					"non-goals",
					record.change.intent.nonGoals,
					context,
				),
			},
			agentOpinion: {
				assessments,
				recommendations,
				concerns: unique(
					assessments.flatMap((assessment) => assessment.concerns),
				),
			},
		},
		validation: {
			issues: limitedList(
				"validation issues",
				record.change.validation.issues,
			).map((issue) => ({
				code: boundedText("validation issue code", issue.code, context, 160),
				severity: issue.severity,
				message: boundedText(
					"validation issue message",
					issue.message,
					context,
				),
				refs: boundedRefList("validation issue refs", issue.refs, context),
			})),
			successSignal: optionalBoundedText(
				"success signal",
				record.change.outcome.successSignals[0],
				context,
			),
			regressionPlan: optionalBoundedText(
				"regression plan",
				record.change.safety.regressionPlan,
				context,
			),
			validatorVersion: optionalBoundedText(
				"validator version",
				record.change.validation.validatorVersion,
				context,
				MAX_SHORT_TEXT_LENGTH,
			),
			validatedRevision: record.change.validation.validatedRevision,
			validatedDigest: optionalBoundedText(
				"validated digest",
				record.change.validation.validatedDigest,
				context,
				MAX_SHORT_TEXT_LENGTH,
			),
		},
		acceptance: acceptanceProjection(record, context),
		redactions: [],
	};
	card.redactions = [...context.redactions];
	if (Buffer.byteLength(JSON.stringify(card), "utf8") > MAX_CARD_BYTES) {
		throw new Error(`Change validation card exceeds ${MAX_CARD_BYTES} bytes.`);
	}
	return card;
}

function assertExpectedIdentity(
	record: ChangeRecord,
	digest: string,
	expected: ChangeValidationCardExpectations,
): void {
	if (
		expected.expectedRevision !== undefined &&
		expected.expectedRevision !== record.change.revision
	) {
		throw new Error("Cannot render stale Change revision.");
	}
	if (
		expected.expectedRecordRevision !== undefined &&
		expected.expectedRecordRevision !== record.recordRevision
	) {
		throw new Error("Cannot render stale Change record revision.");
	}
	if (
		expected.expectedDigest !== undefined &&
		expected.expectedDigest !== digest
	) {
		throw new Error("Cannot render stale Change content digest.");
	}
}

function acceptanceProjection(
	record: ChangeRecord,
	context: ProjectionContext,
): ChangeValidationCard["acceptance"] {
	const transition = record.change.lastStatusTransition;
	if (
		record.change.status !== "accepted" ||
		transition?.to !== "accepted" ||
		!transition.authority ||
		!transition.ref
	) {
		return undefined;
	}
	return {
		authority: boundedText(
			"acceptance authority",
			transition.authority,
			context,
			160,
		),
		ref: boundedText(
			"acceptance ref",
			transition.ref,
			context,
			MAX_SHORT_TEXT_LENGTH,
		),
		acceptedBy: boundedText("accepted by", transition.changedBy, context, 160),
		acceptedAt: boundedText("accepted at", transition.changedAt, context, 160),
	};
}

function boundedTextList(
	label: string,
	values: string[],
	context: ProjectionContext,
): string[] {
	return limitedList(label, values).map((value) =>
		boundedText(label, value, context, 1_000),
	);
}

function boundedRefList(
	label: string,
	values: string[],
	context: ProjectionContext,
): string[] {
	return limitedList(label, values).map((value) =>
		boundedText(label, value, context, MAX_SHORT_TEXT_LENGTH),
	);
}

function limitedList<T>(label: string, values: T[]): T[] {
	if (values.length > MAX_LIST_ITEMS) {
		throw new Error(`${label} exceeds ${MAX_LIST_ITEMS} items.`);
	}
	return values;
}

function optionalBoundedText(
	label: string,
	value: string | undefined,
	context: ProjectionContext,
	maxLength = MAX_TEXT_LENGTH,
): string | undefined {
	return value === undefined
		? undefined
		: boundedText(label, value, context, maxLength);
}

function boundedText(
	label: string,
	value: string,
	context: ProjectionContext,
	maxLength = MAX_TEXT_LENGTH,
): string {
	if (value.length > maxLength) {
		throw new Error(`${label} exceeds ${maxLength} characters.`);
	}
	if (UNSAFE_CONTROL_CHARACTERS.test(value)) {
		throw new Error(`${label} contains unsafe control characters.`);
	}
	return redactSecrets(value, context);
}

function redactSecrets(value: string, context: ProjectionContext): string {
	let redacted = value;
	redacted = replaceSecret(
		redacted,
		/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
		"[REDACTED PRIVATE KEY]",
		context,
	);
	redacted = replaceSecret(
		redacted,
		/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
		"Bearer [REDACTED]",
		context,
	);
	const beforeAssignment = redacted;
	redacted = redacted.replace(
		/\b(api[_-]?key|access[_-]?token|token|password|secret)\s*[:=]\s*["']?([^\s,"']{8,})["']?/gi,
		"$1=[REDACTED]",
	);
	if (redacted !== beforeAssignment)
		context.redactions.add("secret-like value");
	return redacted;
}

function replaceSecret(
	value: string,
	pattern: RegExp,
	replacement: string,
	context: ProjectionContext,
): string {
	const replaced = value.replace(pattern, replacement);
	if (replaced !== value) context.redactions.add("secret-like value");
	return replaced;
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}
