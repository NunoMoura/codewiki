import type { EffectiveAgencyPolicy } from "../agency/types.ts";
import { nowIso } from "../shared/utils.ts";

export const CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE = "codewiki.resume-kickoff";

export interface CodewikiResumeKickoffMessage {
	customType: typeof CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE;
	content: string;
	display: true;
	details: Record<string, unknown>;
}

export function buildCodewikiResumeKickoff(input: {
	prompt: string;
	reason: string;
	generatedAt?: string;
	projectRoot?: string | null;
	taskId?: string | null;
	contextPath?: string | null;
	sourceRefs?: string[];
	graphLens?: string;
	expectedOutput?: string;
	constraints?: Record<string, unknown>;
	contentEvidenceRequirements?: string[];
	policy: EffectiveAgencyPolicy;
}): CodewikiResumeKickoffMessage {
	const generatedAt = input.generatedAt ?? nowIso();
	const sourceRefs = (input.sourceRefs || [])
		.map((ref) => String(ref || "").trim())
		.filter(Boolean);
	const resetAutoPickup =
		input.policy.context_reset.enabled &&
		input.policy.context_reset.auto_pickup;
	const header = [
		"## CodeWiki Auto-Pickup Kickoff",
		`Reason: ${input.reason}`,
		`Generated: ${generatedAt}`,
		`Task: ${input.taskId || "—"}`,
		`Context packet: ${input.contextPath || "—"}`,
		`Agency: level=${input.policy.level}; approval=${input.policy.approval_cadence}; reset_auto_pickup=${resetAutoPickup ? "on" : "off"}`,
		`Source refs: ${sourceRefs.slice(0, 8).join(", ") || "—"}`,
		...(input.graphLens ? [`Graph lens: ${input.graphLens}`] : []),
		...(input.expectedOutput
			? [`Expected output: ${input.expectedOutput}`]
			: []),
		"",
		"Proceed from this CodeWiki source-backed kickoff. Do not depend on pre-reset chat history.",
		"",
	];
	return {
		customType: CODEWIKI_RESUME_KICKOFF_CUSTOM_TYPE,
		display: true,
		content: [...header, input.prompt.trim()].join("\n"),
		details: {
			source: "codewiki",
			reason: input.reason,
			generatedAt,
			projectRoot: input.projectRoot ?? null,
			taskId: input.taskId ?? null,
			contextPath: input.contextPath ?? null,
			sourceRefs,
			graphLens: input.graphLens ?? null,
			expectedOutput: input.expectedOutput ?? null,
			constraints: input.constraints ?? {},
			contentEvidenceRequirements: input.contentEvidenceRequirements ?? [],
			agencyLevel: input.policy.level,
			approvalCadence: input.policy.approval_cadence,
			contextResetAutoPickup: resetAutoPickup,
		},
	};
}
