import type { ChangeValidationCard } from "../changes/validation-view.ts";

export function renderDashboardChangeValidationCard(
	card: ChangeValidationCard,
): string {
	return [
		`<article class="change-validation-card" data-change-id="${escapeAttribute(card.identity.changeId)}">`,
		'<header class="change-validation-card__header">',
		`<h3>${escapeHtml(card.identity.changeId)}</h3>`,
		`<p>${escapeHtml(identityLabel(card))}</p>`,
		`<code>${escapeHtml(card.identity.contentDigest)}</code>`,
		"</header>",
		section("Current state", [
			paragraph(card.sections.currentState.text),
			...optionalLabelledParagraph(
				"Current pain",
				card.sections.currentState.currentPain,
			),
		]),
		section("Proposed change", [
			paragraph(card.sections.proposedChange.text),
			labelledParagraph("Rationale", card.sections.proposedChange.rationale),
			...optionalLabelledParagraph(
				"Desired outcome",
				card.sections.proposedChange.desiredOutcome,
			),
			...list("Non-goals", card.sections.proposedChange.nonGoals),
		]),
		section("Agent opinion", [
			...assessmentMarkup(card),
			...recommendationMarkup(card),
			...list("Concerns", card.sections.agentOpinion.concerns),
		]),
		section("Validation", [
			labelledParagraph("Acceptance", acceptanceLabel(card)),
			...issueMarkup(card),
			...list("Redactions", card.redactions),
		]),
		"</article>",
	].join("");
}

function identityLabel(card: ChangeValidationCard): string {
	return `Revision ${card.identity.revision} · Record ${card.identity.recordRevision} · Status ${card.identity.status} · Validation ${card.identity.validationState}`;
}

function assessmentMarkup(card: ChangeValidationCard): string[] {
	if (!card.sections.agentOpinion.assessments.length) {
		return [paragraph("No agent assessment recorded.")];
	}
	return card.sections.agentOpinion.assessments.map((assessment) =>
		labelledParagraph(
			`${assessment.actor} · ${assessment.stance}`,
			assessment.rationale,
		),
	);
}

function recommendationMarkup(card: ChangeValidationCard): string[] {
	return card.sections.agentOpinion.recommendations.map((recommendation) =>
		labelledParagraph(
			`${recommendation.actor} recommends ${recommendation.value}`,
			recommendation.rationale,
		),
	);
}

function issueMarkup(card: ChangeValidationCard): string[] {
	if (!card.validation.issues.length) return [];
	return [
		"<h5>Issues</h5>",
		"<ul>",
		...card.validation.issues.map(
			(issue) =>
				`<li><strong>${escapeHtml(issue.severity)}</strong> ${escapeHtml(issue.code)}: ${escapeHtml(issue.message)}</li>`,
		),
		"</ul>",
	];
}

function acceptanceLabel(card: ChangeValidationCard): string {
	if (!card.acceptance) return "Not accepted; validation grants no authority.";
	return `Accepted by ${card.acceptance.acceptedBy} under ${card.acceptance.authority} (${card.acceptance.ref}).`;
}

function section(title: string, content: string[]): string {
	return `<section><h4>${escapeHtml(title)}</h4>${content.join("")}</section>`;
}

function optionalLabelledParagraph(
	label: string,
	value: string | undefined,
): string[] {
	return value ? [labelledParagraph(label, value)] : [];
}

function labelledParagraph(label: string, value: string): string {
	return `<p><strong>${escapeHtml(label)}:</strong> ${escapeMultiline(value)}</p>`;
}

function paragraph(value: string): string {
	return `<p>${escapeMultiline(value)}</p>`;
}

function list(label: string, values: string[]): string[] {
	if (!values.length) return [];
	return [
		`<h5>${escapeHtml(label)}</h5>`,
		"<ul>",
		...values.map((value) => `<li>${escapeMultiline(value)}</li>`),
		"</ul>",
	];
}

function escapeMultiline(value: string): string {
	return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function escapeAttribute(value: string): string {
	return escapeHtml(value).replace(/`/g, "&#96;");
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
