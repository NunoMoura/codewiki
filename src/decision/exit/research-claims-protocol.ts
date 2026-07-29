export const DECISION_RESEARCH_CLAIMS_PROTOCOL = Object.freeze({
	id: "codewiki.decision.research-claims",
	version: "1.0.0",
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
	}),
});
