export const ACCEPTED_BUILD_STATES = ["accepted", "applied", "validated", "consumed", "archived"] as const;

const ACCEPTED_BUILD_STATE_SET = new Set<string>(ACCEPTED_BUILD_STATES);

export function buildLifecycleState(data: any, fallback?: string): string {
	return String(data?.lifecycle?.state || data?.status || fallback || "").trim().toLowerCase();
}

export function isAcceptedBuildState(value: unknown): boolean {
	return ACCEPTED_BUILD_STATE_SET.has(String(value || "").trim().toLowerCase());
}

export function isAcceptedBuildData(data: any, fallback?: string): boolean {
	return isAcceptedBuildState(buildLifecycleState(data, fallback));
}
