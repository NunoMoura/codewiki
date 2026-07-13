import { changeContentDigest } from "./digest.ts";
import { normalizeChange } from "./normalize.ts";
import {
	CHANGE_ASSESSMENT_STANCE_VALUES,
	CHANGE_EFFORT_VALUES,
	CHANGE_KIND_VALUES,
	CHANGE_ORIGIN_VALUES,
	CHANGE_RECOMMENDATION_VALUES,
	CHANGE_RISK_VALUES,
	CHANGE_SCHEMA_VERSION,
	CHANGE_SCOPE_VALUES,
	CHANGE_STATUS_VALUES,
	CHANGE_TYPE_VALUES,
	CHANGE_VALIDATION_SEVERITY_VALUES,
	CHANGE_VALIDATION_STATE_VALUES,
	CHANGE_WORK_SCALE_VALUES,
	type Change,
} from "./types.ts";

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const CHANGE_ID_PATTERN = /^CHG-[A-Za-z0-9._-]+$/;

export function parseChange(value: unknown): Change {
	assertChangeShape(value);
	const change = normalizeChange(value as Change);
	assertChangeSemantics(change);
	return change;
}

export function assertValidChange(value: unknown): asserts value is Change {
	parseChange(value);
}

function assertChangeShape(value: unknown): void {
	const change = record(value, "change");
	keys(change, "change", [
		"schemaVersion",
		"id",
		"revision",
		"status",
		"lastStatusTransition",
		"intent",
		"classification",
		"impact",
		"evidence",
		"safety",
		"validation",
		"estimates",
		"provenance",
	]);
	integer(change.schemaVersion, "change.schemaVersion", 1);
	string(change.id, "change.id");
	integer(change.revision, "change.revision", 1);
	string(change.status, "change.status");

	const intent = record(change.intent, "change.intent");
	keys(intent, "change.intent", [
		"question",
		"currentState",
		"desiredState",
		"rationale",
		"currentPain",
		"desiredOutcome",
		"nonGoals",
	]);
	requiredStrings(intent, "change.intent", [
		"question",
		"currentState",
		"desiredState",
		"rationale",
	]);
	optionalStrings(intent, "change.intent", ["currentPain", "desiredOutcome"]);
	strings(intent.nonGoals, "change.intent.nonGoals");

	const classification = record(
		change.classification,
		"change.classification",
	);
	keys(classification, "change.classification", [
		"kind",
		"type",
		"scope",
		"affectedLayers",
		"targetRefs",
	]);
	requiredStrings(classification, "change.classification", [
		"kind",
		"type",
		"scope",
	]);
	strings(classification.affectedLayers, "change.classification.affectedLayers");
	strings(classification.targetRefs, "change.classification.targetRefs");

	const impact = record(change.impact, "change.impact");
	keys(impact, "change.impact", ["user", "maintainer", "compatibility"]);
	requiredStrings(impact, "change.impact", ["user", "maintainer"]);
	optionalStrings(impact, "change.impact", ["compatibility"]);

	const evidence = record(change.evidence, "change.evidence");
	keys(evidence, "change.evidence", [
		"sourceRefs",
		"proofRefs",
		"reproduction",
		"expectedBehavior",
		"sourceBehavior",
		"targetBehavior",
	]);
	strings(evidence.sourceRefs, "change.evidence.sourceRefs");
	strings(evidence.proofRefs, "change.evidence.proofRefs");
	optionalStrings(evidence, "change.evidence", [
		"reproduction",
		"expectedBehavior",
		"sourceBehavior",
		"targetBehavior",
	]);

	const safety = record(change.safety, "change.safety");
	keys(safety, "change.safety", [
		"risk",
		"invariant",
		"safetyBoundary",
		"failureModes",
		"rollbackPlan",
		"negativeTestPlan",
	]);
	string(safety.risk, "change.safety.risk");
	strings(safety.failureModes, "change.safety.failureModes");
	optionalStrings(safety, "change.safety", [
		"invariant",
		"safetyBoundary",
		"rollbackPlan",
		"negativeTestPlan",
	]);

	const validation = record(change.validation, "change.validation");
	keys(validation, "change.validation", [
		"state",
		"issues",
		"assessments",
		"recommendations",
		"successSignal",
		"regressionPlan",
		"validatorVersion",
		"validatedRevision",
		"validatedDigest",
	]);
	string(validation.state, "change.validation.state");
	array(validation.issues, "change.validation.issues").forEach((entry, index) =>
		assertIssue(entry, `change.validation.issues[${index}]`),
	);
	array(validation.assessments, "change.validation.assessments").forEach(
		(entry, index) =>
			assertAssessment(entry, `change.validation.assessments[${index}]`),
	);
	array(validation.recommendations, "change.validation.recommendations").forEach(
		(entry, index) =>
			assertRecommendation(entry, `change.validation.recommendations[${index}]`),
	);
	optionalStrings(validation, "change.validation", [
		"successSignal",
		"regressionPlan",
		"validatorVersion",
		"validatedDigest",
	]);
	if (validation.validatedRevision !== undefined) {
		integer(validation.validatedRevision, "change.validation.validatedRevision", 1);
	}

	const estimates = record(change.estimates, "change.estimates");
	keys(estimates, "change.estimates", ["effort", "workScale"]);
	optionalStrings(estimates, "change.estimates", ["effort", "workScale"]);

	const provenance = record(change.provenance, "change.provenance");
	keys(provenance, "change.provenance", [
		"origin",
		"createdBy",
		"createdAt",
		"updatedAt",
		"discoveredWhile",
	]);
	requiredStrings(provenance, "change.provenance", [
		"origin",
		"createdBy",
		"createdAt",
		"updatedAt",
	]);
	if (provenance.discoveredWhile !== undefined) {
		const context = record(
			provenance.discoveredWhile,
			"change.provenance.discoveredWhile",
		);
		keys(context, "change.provenance.discoveredWhile", ["traceId", "taskId"]);
		optionalStrings(context, "change.provenance.discoveredWhile", [
			"traceId",
			"taskId",
		]);
	}

	if (change.lastStatusTransition !== undefined) {
		assertTransition(change.lastStatusTransition);
	}
}

function assertChangeSemantics(change: Change): void {
	assertIdentitySemantics(change);
	assertClassificationSemantics(change);
	assertEstimateSemantics(change);
	assertProvenanceSemantics(change);
	const contentDigest = changeContentDigest(change);
	assertValidationSemantics(change, contentDigest);
	assertStatusSemantics(change, contentDigest);
}

function assertIdentitySemantics(change: Change): void {
	if (change.schemaVersion !== CHANGE_SCHEMA_VERSION) {
		fail(`change.schemaVersion must be ${CHANGE_SCHEMA_VERSION}`);
	}
	if (!CHANGE_ID_PATTERN.test(change.id)) fail("change.id must use CHG- prefix");
	member(change.status, CHANGE_STATUS_VALUES, "change.status");
}

function assertClassificationSemantics(change: Change): void {
	member(
		change.classification.kind,
		CHANGE_KIND_VALUES,
		"change.classification.kind",
	);
	member(
		change.classification.type,
		CHANGE_TYPE_VALUES,
		"change.classification.type",
	);
	member(
		change.classification.scope,
		CHANGE_SCOPE_VALUES,
		"change.classification.scope",
	);
	member(change.safety.risk, CHANGE_RISK_VALUES, "change.safety.risk");
}

function assertEstimateSemantics(change: Change): void {
	if (change.estimates.effort !== undefined) {
		member(change.estimates.effort, CHANGE_EFFORT_VALUES, "change.estimates.effort");
	}
	if (change.estimates.workScale !== undefined) {
		member(
			change.estimates.workScale,
			CHANGE_WORK_SCALE_VALUES,
			"change.estimates.workScale",
		);
	}
}

function assertProvenanceSemantics(change: Change): void {
	member(change.provenance.origin, CHANGE_ORIGIN_VALUES, "change.provenance.origin");
	iso(change.provenance.createdAt, "change.provenance.createdAt");
	iso(change.provenance.updatedAt, "change.provenance.updatedAt");
}

function assertValidationSemantics(
	change: Change,
	contentDigest: string,
): void {
	member(
		change.validation.state,
		CHANGE_VALIDATION_STATE_VALUES,
		"change.validation.state",
	);
	if (change.validation.state === "valid") {
		if (change.validation.validatedRevision !== change.revision) {
			fail("valid Change must validate its current revision");
		}
		if (change.validation.validatedDigest !== contentDigest) {
			fail("valid Change must validate its current content digest");
		}
	}
	if (change.validation.validatedDigest !== undefined) {
		digest(change.validation.validatedDigest, "change.validation.validatedDigest");
	}
	for (const issue of change.validation.issues) {
		member(issue.severity, CHANGE_VALIDATION_SEVERITY_VALUES, "validation issue severity");
	}
	for (const assessment of change.validation.assessments) {
		member(assessment.stance, CHANGE_ASSESSMENT_STANCE_VALUES, "assessment stance");
	}
	for (const recommendation of change.validation.recommendations) {
		member(
			recommendation.value,
			CHANGE_RECOMMENDATION_VALUES,
			"recommendation value",
		);
	}
}

function assertStatusSemantics(change: Change, contentDigest: string): void {
	const transition = change.lastStatusTransition;
	if (transition) {
		if (transition.changeId !== change.id || transition.revision !== change.revision) {
			fail("status transition must target the current Change revision");
		}
		if (transition.contentDigest !== contentDigest) {
			fail("status transition must bind the current content digest");
		}
		if (transition.to !== change.status || transition.from === transition.to) {
			fail("status transition must end at the current distinct status");
		}
		iso(transition.changedAt, "change.lastStatusTransition.changedAt");
	}
	if (change.status !== "accepted") return;
	if (change.validation.state !== "valid") {
		fail("accepted Change must be valid");
	}
	if (!transition || !transition.authority || !transition.ref) {
		fail("accepted Change requires authoritative status transition");
	}
}

function assertTransition(value: unknown): void {
	const transition = record(value, "change.lastStatusTransition");
	keys(transition, "change.lastStatusTransition", [
		"changeId",
		"revision",
		"contentDigest",
		"from",
		"to",
		"changedBy",
		"changedAt",
		"reason",
		"authority",
		"ref",
	]);
	requiredStrings(transition, "change.lastStatusTransition", [
		"changeId",
		"contentDigest",
		"to",
		"changedBy",
		"changedAt",
	]);
	integer(transition.revision, "change.lastStatusTransition.revision", 1);
	const from = transition.from;
	const to = transition.to;
	if (from !== null) string(from, "change.lastStatusTransition.from");
	string(to, "change.lastStatusTransition.to");
	optionalStrings(transition, "change.lastStatusTransition", [
		"reason",
		"authority",
		"ref",
	]);
	digest(transition.contentDigest, "change.lastStatusTransition.contentDigest");
	if (from !== null) {
		member(from, CHANGE_STATUS_VALUES, "change.lastStatusTransition.from");
	}
	member(to, CHANGE_STATUS_VALUES, "change.lastStatusTransition.to");
}

function assertIssue(value: unknown, path: string): void {
	const issue = record(value, path);
	keys(issue, path, ["code", "severity", "message", "refs"]);
	requiredStrings(issue, path, ["code", "severity", "message"]);
	strings(issue.refs, `${path}.refs`);
}

function assertAssessment(value: unknown, path: string): void {
	const assessment = record(value, path);
	keys(assessment, path, ["actor", "stance", "rationale", "concerns", "evidenceRefs"]);
	requiredStrings(assessment, path, ["actor", "stance", "rationale"]);
	strings(assessment.concerns, `${path}.concerns`);
	strings(assessment.evidenceRefs, `${path}.evidenceRefs`);
}

function assertRecommendation(value: unknown, path: string): void {
	const recommendation = record(value, path);
	keys(recommendation, path, ["actor", "value", "rationale", "evidenceRefs"]);
	requiredStrings(recommendation, path, ["actor", "value", "rationale"]);
	strings(recommendation.evidenceRefs, `${path}.evidenceRefs`);
}

function record(value: unknown, path: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		fail(`${path} must be an object`);
	}
	return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
	if (!Array.isArray(value)) fail(`${path} must be an array`);
	return value;
}

function strings(value: unknown, path: string): void {
	array(value, path).forEach((entry, index) => string(entry, `${path}[${index}]`));
}

function requiredStrings(
	value: Record<string, unknown>,
	path: string,
	fields: string[],
): void {
	for (const field of fields) string(value[field], `${path}.${field}`);
}

function optionalStrings(
	value: Record<string, unknown>,
	path: string,
	fields: string[],
): void {
	for (const field of fields) {
		if (value[field] !== undefined) string(value[field], `${path}.${field}`);
	}
}

function string(value: unknown, path: string): asserts value is string {
	if (typeof value !== "string" || !value.trim()) fail(`${path} must be non-empty text`);
}

function integer(value: unknown, path: string, minimum: number): void {
	if (!Number.isInteger(value) || Number(value) < minimum) {
		fail(`${path} must be an integer >= ${minimum}`);
	}
}

function keys(value: Record<string, unknown>, path: string, allowed: string[]): void {
	const allowedSet = new Set(allowed);
	for (const key of Object.keys(value)) {
		if (!allowedSet.has(key)) fail(`${path} contains unknown field ${key}`);
	}
}

function member(value: string, allowed: readonly string[], path: string): void {
	if (!allowed.includes(value)) fail(`${path} has unsupported value ${value}`);
}

function digest(value: unknown, path: string): void {
	if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
		fail(`${path} must be a canonical sha256 digest`);
	}
}

function iso(value: string, path: string): void {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
		fail(`${path} must be an ISO UTC timestamp`);
	}
}

function fail(message: string): never {
	throw new Error(`Invalid Change: ${message}`);
}
