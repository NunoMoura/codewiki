import { createHash } from "node:crypto";
import type { DecisionChange, SprintProposal } from "./types.ts";

export interface RenderSprintProposalMarkdownOptions {
	includeSourceRefs?: boolean;
	hardeningQuestions?: string[];
	acceptedChangeBundleDigest?: string;
}

export interface SprintProposalHardeningIssue {
	code: string;
	changeId?: string;
	message: string;
}

export function renderSprintProposalMarkdown(
	proposal: SprintProposal,
	options: RenderSprintProposalMarkdownOptions = {},
): string {
	const lines = [
		`# Sprint Proposal: ${escapeMarkdownText(proposal.id)}`,
		"",
		`Summary: ${escapeMarkdownText(proposal.summary || "Sprint proposal")}`,
		`Created: ${escapeMarkdownText(proposal.createdAt)}`,
		`Updated: ${escapeMarkdownText(proposal.updatedAt)}`,
	];
	if (options.acceptedChangeBundleDigest) {
		lines.push(
			`Accepted Change bundle: \`${escapeMarkdownText(options.acceptedChangeBundleDigest)}\``,
		);
	}
	if (options.includeSourceRefs !== false && proposal.sourceRefs.length) {
		lines.push("", "Source refs:");
		for (const ref of proposal.sourceRefs) {
			lines.push(`- ${escapeMarkdownText(ref)}`);
		}
	}
	lines.push("", "## Proposed Changes", "");
	if (proposal.changes.length === 0) {
		lines.push("No proposed changes.", "");
	} else {
		for (const change of proposal.changes) {
			lines.push(...renderDecisionChangeCard(change), "");
		}
	}
	const questions = options.hardeningQuestions || [];
	if (questions.length) {
		lines.push("## Questions to harden proposal", "");
		for (const question of questions) {
			lines.push(`- ${escapeMarkdownText(question)}`);
		}
		lines.push("");
	}
	return `${lines.join("\n").trimEnd()}\n`;
}

export function sprintProposalMarkdownDigest(markdown: string): string {
	return `sha256:${createHash("sha256").update(markdown).digest("hex")}`;
}

export function hardeningQuestionsFromIssues(
	issues: SprintProposalHardeningIssue[],
): string[] {
	const questions = issues
		.filter((issue) => issue.code !== "no_approved_changes")
		.map((issue) => hardeningQuestionFromIssue(issue));
	return [...new Set(questions)].filter(Boolean);
}

function renderDecisionChangeCard(change: DecisionChange): string[] {
	return [
		`### Proposed Change: ${escapeMarkdownText(change.id)}`,
		"",
		"**Current state**",
		"",
		paragraph(change.currentState),
		"",
		"**Proposed change**",
		"",
		paragraph(change.desiredState || change.desiredOutcome),
		"",
		"**Agent opinion**",
		"",
		paragraph(agentOpinion(change)),
	];
}

function agentOpinion(change: DecisionChange): string {
	const assessment = change.agentAssessment;
	return [
		assessment.stance ? `Stance: ${assessment.stance}.` : "",
		assessment.rationale || change.recommendationRationale,
		assessment.userAlignment ? `User fit: ${assessment.userAlignment}` : "",
		assessment.projectBenefit
			? `Project fit: ${assessment.projectBenefit}`
			: "",
		assessment.concerns.length
			? `Concerns: ${assessment.concerns.join("; ")}`
			: "",
	]
		.map((part) => part.trim())
		.filter(Boolean)
		.join(" ");
}

function hardeningQuestionFromIssue(
	issue: SprintProposalHardeningIssue,
): string {
	const prefix = issue.changeId ? `${issue.changeId}: ` : "";
	if (issue.code.startsWith("missing_")) {
		return `${prefix}What information should fill ${issue.code.replace(/^missing_/, "").replace(/_/g, " ")}?`;
	}
	if (issue.code.startsWith("invalid_")) {
		return `${prefix}What value should replace the invalid ${issue.code.replace(/^invalid_/, "").replace(/_/g, " ")}?`;
	}
	if (issue.code === "agent_assessment_not_aligned") {
		return `${prefix}What concern must be resolved before this proposed change can be approved?`;
	}
	if (issue.code === "recommendation_not_approve") {
		return `${prefix}Should this proposed change be revised, deferred, or rejected?`;
	}
	return `${prefix}${issue.message}`;
}

function paragraph(value: unknown): string {
	return escapeMarkdownText(String(value ?? "").trim() || "—");
}

function escapeMarkdownText(value: string): string {
	return value.replace(/\s+/g, " ").replace(/\|/g, "\\|");
}
