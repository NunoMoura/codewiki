import type { TraceEvent } from "../../changes/trace/types.ts";
import type {
	ImplementationWorkerClaim,
	ImplementationWorkerClaimStatus,
} from "./types.ts";

const CLAIM_EVENTS = ["runtime.work_unit.claimed"];
const RELEASE_EVENTS = [
	"runtime.work_unit.claim.released",
	"runtime.work_unit.claim.expired",
	"runtime.work_unit.claim.cancelled",
];

export interface ImplementationWorkerClaimsOptions {
	at?: string;
}

export function implementationWorkerClaimsFromEvents(
	events: TraceEvent[] = [],
	options: ImplementationWorkerClaimsOptions = {},
): ImplementationWorkerClaim[] {
	const releases = events.filter(isReleaseEvent).map(releaseFromEvent);
	return events.filter(isClaimEvent).map((event) => {
		const claim = claimFromEvent(event);
		const status = claimStatus(claim, releases, options.at);
		return { ...claim, status };
	});
}

export function activeImplementationWorkerClaimsFromEvents(
	events: TraceEvent[] = [],
	options: ImplementationWorkerClaimsOptions = {},
): ImplementationWorkerClaim[] {
	return implementationWorkerClaimsFromEvents(events, options).filter(
		(claim) => claim.status === "active",
	);
}

interface ClaimRelease {
	claimId: string;
	refs: string[];
	createdAt: string;
}

function claimFromEvent(event: TraceEvent): ImplementationWorkerClaim {
	return {
		claimId: text(event.data?.claimId) || event.id,
		workerId: text(event.data?.workerId) || text(event.data?.worker),
		workUnitId: text(event.data?.workUnitId),
		planningRefs: planningRefs(event),
		refs: unique([...event.refs, event.id]),
		createdAt: event.createdAt,
		...(text(event.data?.expiresAt)
			? { expiresAt: text(event.data?.expiresAt) }
			: {}),
		status: "active",
	};
}

function releaseFromEvent(event: TraceEvent): ClaimRelease {
	return {
		claimId: text(event.data?.claimId) || event.id,
		refs: unique([...event.refs, event.id]),
		createdAt: event.createdAt,
	};
}

function claimStatus(
	claim: ImplementationWorkerClaim,
	releases: ClaimRelease[],
	at?: string,
): ImplementationWorkerClaimStatus {
	if (claimExpired(claim, at)) return "expired";
	if (claimReleased(claim, releases)) return "released";
	return "active";
}

function claimExpired(claim: ImplementationWorkerClaim, at?: string): boolean {
	if (!claim.expiresAt || !at) return false;
	return Date.parse(claim.expiresAt) <= Date.parse(at);
}

function claimReleased(
	claim: ImplementationWorkerClaim,
	releases: ClaimRelease[],
): boolean {
	return releases.some(
		(release) =>
			Date.parse(release.createdAt) >= Date.parse(claim.createdAt || "") &&
			(release.claimId === claim.claimId ||
				release.refs.some((ref) => claim.refs.includes(ref))),
	);
}

function planningRefs(event: TraceEvent): string[] {
	const refs = stringList(event.data?.planningRefs);
	return refs.length > 0 ? refs : event.refs.filter(isPlanningRef);
}

function isClaimEvent(event: TraceEvent): boolean {
	return CLAIM_EVENTS.includes(event.event);
}

function isReleaseEvent(event: TraceEvent): boolean {
	return RELEASE_EVENTS.includes(event.event);
}

function isPlanningRef(ref: string): boolean {
	return ref.includes(":planning:") || ref.startsWith("planning:");
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => text(value)).filter(Boolean)),
	);
}
