import type { ChangeValidationCard } from "../../../changes/validation-view.ts";
import { truncateToWidth } from "./width.ts";

interface PiChangeValidationCardRenderOptions {
	width?: number;
}

export function renderPiChangeValidationCard(
	card: ChangeValidationCard,
	options: PiChangeValidationCardRenderOptions = {},
): string[] {
	const lines = [
		`Change — ${card.identity.changeId}`,
		`Revision: ${card.identity.revision} · Record: ${card.identity.recordRevision} · Status: ${card.identity.status} · Validation: ${card.identity.validationState}`,
		`Digest: ${card.identity.contentDigest}`,
		"",
		"Current state",
		card.sections.currentState.text,
		...optionalSectionLine(
			"Current pain",
			card.sections.currentState.currentPain,
		),
		"",
		"Proposed change",
		card.sections.proposedChange.text,
		`Rationale: ${card.sections.proposedChange.rationale}`,
		...optionalSectionLine(
			"Desired outcome",
			card.sections.proposedChange.desiredOutcome,
		),
		...listLines("Non-goals", card.sections.proposedChange.nonGoals),
		"",
		"Agent opinion",
		...assessmentLines(card),
		...recommendationLines(card),
		...listLines("Concerns", card.sections.agentOpinion.concerns),
		"",
		`Acceptance: ${acceptanceLabel(card)}`,
		...validationIssueLines(card),
		...listLines("Redactions", card.redactions),
	];
	return lines.map((line) => truncateToWidth(line, options.width));
}

function assessmentLines(card: ChangeValidationCard): string[] {
	if (!card.sections.agentOpinion.assessments.length) {
		return ["No agent assessment recorded."];
	}
	return card.sections.agentOpinion.assessments.map(
		(assessment) =>
			`${assessment.actor} · ${assessment.stance}: ${assessment.rationale}`,
	);
}

function recommendationLines(card: ChangeValidationCard): string[] {
	return card.sections.agentOpinion.recommendations.map(
		(recommendation) =>
			`${recommendation.actor} recommends ${recommendation.value}: ${recommendation.rationale}`,
	);
}

function validationIssueLines(card: ChangeValidationCard): string[] {
	if (!card.validation.issues.length) return [];
	return [
		"",
		"Validation issues",
		...card.validation.issues.map(
			(issue) => `• [${issue.severity}] ${issue.code}: ${issue.message}`,
		),
	];
}

function acceptanceLabel(card: ChangeValidationCard): string {
	if (!card.acceptance) return "not accepted; validation grants no authority";
	return `accepted by ${card.acceptance.acceptedBy} under ${card.acceptance.authority} (${card.acceptance.ref})`;
}

function optionalSectionLine(
	label: string,
	value: string | undefined,
): string[] {
	return value ? [`${label}: ${value}`] : [];
}

function listLines(label: string, values: string[]): string[] {
	return values.length ? [label, ...values.map((value) => `• ${value}`)] : [];
}
