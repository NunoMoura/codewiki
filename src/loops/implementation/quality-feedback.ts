import type {
	ExitRemediationItem,
	LoopQualityDiagnostic,
	LoopQualityStandardResult,
} from "../../changes/trace/types.ts";

export function qualityDiagnosticsFromStandards(
	standards: LoopQualityStandardResult[],
	remediation: ExitRemediationItem[],
): LoopQualityDiagnostic[] {
	return standards
		.filter((standard) => standard.status !== "met")
		.map((standard) => {
			const repair = matchingRepair(standard, remediation);
			return {
				standardId: standard.id,
				severity: diagnosticSeverity(standard),
				method: standard.method,
				gate: standard.gate,
				message: standard.message || standard.description,
				refs: standard.refs || [],
				...(standard.score === undefined ? {} : { score: standard.score }),
				...(standard.scoreThreshold === undefined
					? {}
					: { scoreThreshold: standard.scoreThreshold }),
				repair:
					repair?.action || `Repair ${standard.id}: ${standard.description}`,
				repairTarget: standard.repairTarget,
				...(repair ? { route: repair.route } : {}),
			};
		})
		.sort(compareDiagnostics);
}

function matchingRepair(
	standard: LoopQualityStandardResult,
	remediation: ExitRemediationItem[],
): ExitRemediationItem | undefined {
	const refs = new Set(standard.refs || []);
	return (
		remediation.find((item) => item.refs.some((ref) => refs.has(ref))) ||
		remediation.find((item) => item.blocking === (standard.gate === "hard"))
	);
}

function diagnosticSeverity(
	standard: LoopQualityStandardResult,
): LoopQualityDiagnostic["severity"] {
	if (standard.status === "blocked" || standard.gate === "hard") {
		return "blocking";
	}
	return standard.status === "unmet" ? "warning" : "info";
}

function compareDiagnostics(
	left: LoopQualityDiagnostic,
	right: LoopQualityDiagnostic,
): number {
	return (
		severityRank(left.severity) - severityRank(right.severity) ||
		gateRank(left.gate) - gateRank(right.gate) ||
		left.standardId.localeCompare(right.standardId)
	);
}

function severityRank(severity: LoopQualityDiagnostic["severity"]): number {
	if (severity === "blocking") return 0;
	if (severity === "warning") return 1;
	return 2;
}

function gateRank(gate: LoopQualityDiagnostic["gate"]): number {
	return gate === "hard" ? 0 : gate === "soft" ? 1 : 2;
}
