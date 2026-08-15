export function planningQualityFields(overrides = {}) {
	return {
		technicalRequirements: [
			"Implement the scoped change described by the decision ref.",
		],
		planningDepth: "standard",
		verification: ["tests/loops/planning/planning-iteration.test.mjs"],
		workerProfile: "implementation_worker",
		planningAssessment: {
			stance: "worker_ready",
			workUnitSize: "right_sized",
			rightSizing: "Small enough for one worker and not merely busywork.",
			independence:
				"Worker can execute using decision refs, path scopes, acceptance criteria, and verification.",
			implementationReadiness:
				"Technical requirements and acceptance evidence are explicit.",
			uncertainties: [],
			uncertaintyOwner: "none",
			uncertaintyResolution:
				"No unresolved planning, decision, or user-authority uncertainty remains.",
			rationale:
				"No hidden decision or planning dependency remains for this unit.",
		},
		...overrides,
	};
}
