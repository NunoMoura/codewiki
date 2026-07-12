export const WORKER_OBSERVATION_REF_PREFIX = "runtime-observation:";

export function isWorkerObservationRef(value: string): boolean {
	return value.startsWith(WORKER_OBSERVATION_REF_PREFIX);
}

export function hasAuthoritativeEvidenceRefs(refs: string[]): boolean {
	return refs.length > 0 && refs.every((ref) => !isWorkerObservationRef(ref));
}
