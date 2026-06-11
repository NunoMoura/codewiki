export function decisionTableFixture(rows, overrides = {}) {
	const normalizedRows = rows.map((row, index) => {
		const approvalStatus = String(
			row.approval?.status || row.user_action || row.status || "pending",
		)
			.trim()
			.toLowerCase()
			.replace(/^accept$/, "approved")
			.replace(/^approve$/, "approved")
			.replace(/^reject$/, "rejected");
		const current = String(
			row.state_delta?.current ||
				row.current_state ||
				row.current_project_state ||
				"Current state not specified.",
		).trim();
		const desired = String(
			row.state_delta?.desired ||
				row.desired_state ||
				row.expected_final_state ||
				row.agreed_change ||
				"Desired state not specified.",
		).trim();
		return {
			id: String(row.id || `DTR-${index + 1}`).trim(),
			question: String(
				row.question || row.id || `Decision row ${index + 1}`,
			).trim(),
			state_delta: { current, desired },
			proposed_change: String(
				row.proposed_change || row.agreed_change || desired,
			).trim(),
			rationale: String(row.rationale || "Decision row accepted.").trim(),
			impact: row.impact || { system: row.affected_layers || [] },
			risk:
				typeof row.risk === "object"
					? row.risk
					: {
							level: ["low", "medium", "high"].includes(String(row.risk))
								? String(row.risk)
								: "medium",
						},
			options:
				row.options ||
				(row.alternatives || []).map((label, optionIndex) => ({
					id: `ALT-${optionIndex + 1}`,
					label,
				})),
			approval: { status: approvalStatus },
			evidence_refs:
				row.evidence_refs || (row.proof_refs || []).map((ref) => ({ ref })),
			expected_outcome: String(
				row.expected_outcome || row.expected_final_state || desired,
			).trim(),
			validated_outcome: String(
				row.validated_outcome || row.validated_final_state || "",
			).trim(),
			follow_up_refs: row.follow_up_refs || [],
		};
	});
	return {
		schema_version: 1,
		id: overrides.id || "DT-FIXTURE",
		title: overrides.title || "Decision Table fixture",
		status:
			overrides.status ||
			(normalizedRows.some((row) => row.approval?.status === "approved")
				? "approved"
				: "pending"),
		rows: normalizedRows,
		...overrides,
	};
}
