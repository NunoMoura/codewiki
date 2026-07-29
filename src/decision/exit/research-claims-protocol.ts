import { Type } from "typebox";

const SHA256_DIGEST_PATTERN = "^sha256:[0-9a-f]{64}$";
const RESEARCH_CITATION_ID_PATTERN =
	"^evidence:research_citation:[0-9a-f]{64}$";

export const DECISION_RESEARCH_CLAIMS_PROTOCOL = Object.freeze({
	id: "codewiki.decision.research-claims",
	version: "1.1.0",
	instructions: Object.freeze([
		"Use only supplied claims and citations; do not use conversational memory or unstated sources.",
		"Assess every exact claim digest once and preserve every supplied citation stance, limitation, and contradiction.",
		"Return the exact citation Evidence ids considered for each claim.",
		"Use supported only when citations establish the claim without material overstatement.",
		"Use unsupported when evidence contradicts the claim or leaves a material claim unsupported.",
		"Use uncertain when source limitations or ambiguity prevent a determinate assessment.",
		"Do not grant approval, Loop exit, Integration, publication, release, or deployment.",
	]),
	inputLimits: Object.freeze({
		maxClaims: 32,
		maxCitations: 128,
		maxRequestBytes: 262_144,
	}),
	outputLimits: Object.freeze({
		maxFindings: 32,
		maxLimitations: 32,
		maxResponseBytes: 131_072,
	}),
});

const boundedText = Type.String({ minLength: 1, maxLength: 2_048 });

export const DecisionResearchClaimsResponseSchema = Type.Object(
	{
		claimAssessments: Type.Array(
			Type.Object(
				{
					claimDigest: Type.String({ pattern: SHA256_DIGEST_PATTERN }),
					evidenceIds: Type.Array(
						Type.String({ pattern: RESEARCH_CITATION_ID_PATTERN }),
						{ maxItems: DECISION_RESEARCH_CLAIMS_PROTOCOL.inputLimits.maxCitations },
					),
					conclusion: Type.Union([
						Type.Literal("supported"),
						Type.Literal("unsupported"),
						Type.Literal("uncertain"),
					]),
					findings: Type.Array(boundedText, {
						maxItems: DECISION_RESEARCH_CLAIMS_PROTOCOL.outputLimits.maxFindings,
					}),
					limitations: Type.Array(boundedText, {
						maxItems: DECISION_RESEARCH_CLAIMS_PROTOCOL.outputLimits.maxLimitations,
					}),
				},
				{ additionalProperties: false },
			),
			{
				maxItems: DECISION_RESEARCH_CLAIMS_PROTOCOL.inputLimits.maxClaims,
			},
		),
	},
	{ additionalProperties: false },
);
