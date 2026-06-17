export function implementationQualityFields(overrides = {}) {
	return {
		implementationAssessment: {
			stance: "production_ready",
			maintainability:
				"Change is maintainable and localized to the planned scope.",
			simplicity: "Implementation avoids unnecessary abstraction.",
			projectStyle: "Code follows existing project style and user preferences.",
			errorHandling: "Error handling is appropriate for the changed behavior.",
			uncertainties: [],
			uncertaintyOwner: "none",
			uncertaintyResolution:
				"No unresolved implementation, planning, decision, or user-authority uncertainty remains.",
			rationale: "Evidence shows the change is production-ready.",
		},
		sensitiveSurfaceAssessment: {
			security: "No security-sensitive behavior changed.",
			privacy: "No private data handling changed.",
			accessibility: "No UI or page elements changed.",
			dependencyRisk: "No dependency surface changed.",
			rationale: "Sensitive-surface review completed for touched paths.",
		},
		...overrides,
	};
}
