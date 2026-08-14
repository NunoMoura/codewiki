import type {CanonicalJsonValue, Sha256Digest} from "../../utils/canonical-json.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
} from "../../utils/canonical-json.ts";
import type {ExitReport, SemanticLoop} from "../../verification/contracts.ts";
import type {LoopCandidate} from "../../verification/identity.ts";

export type RuntimeLoopRouteTarget =
	| "decision"
	| "planning"
	| "implementation"
	| "repair"
	| "waiting"
	| "escalation"
	| "complete"
	| "withdrawn";

export interface RuntimeLoopRouteSelection<
	TRoute extends RuntimeLoopRouteTarget = RuntimeLoopRouteTarget,
> {
	readonly route: TRoute;
	readonly reasonCode: string;
}

interface RuntimeLoopExitRouteBase<
	TRoute extends RuntimeLoopRouteTarget = RuntimeLoopRouteTarget,
> extends RuntimeLoopRouteSelection<TRoute> {
	readonly schemaVersion: "1.0.0";
	readonly candidateDigest: Sha256Digest;
	readonly exitReportDigest: Sha256Digest;
	readonly routeDigest: Sha256Digest;
}

export type RuntimeLoopExitRoute<
	TRoute extends RuntimeLoopRouteTarget = RuntimeLoopRouteTarget,
	TDetails extends Readonly<Record<string, CanonicalJsonValue>> = Readonly<
		Record<string, never>
	>,
> = Readonly<RuntimeLoopExitRouteBase<TRoute> & TDetails>;

export function routeRuntimeLoopExit<
	TLoop extends SemanticLoop,
	TContent extends CanonicalJsonValue,
	TRoute extends RuntimeLoopRouteTarget,
	TDetails extends Readonly<Record<string, CanonicalJsonValue>>,
>(input: {
	readonly candidate: LoopCandidate<TLoop, TContent>;
	readonly report: ExitReport;
	readonly passed: RuntimeLoopRouteSelection<TRoute>;
	readonly details: TDetails;
}): RuntimeLoopExitRoute<TRoute | "repair" | "waiting", TDetails> {
	if (
		input.report.loop !== input.candidate.loop ||
		input.report.candidateDigest !== input.candidate.digest
	) {
		throw new Error(
			"Runtime Loop Exit requires the exact Candidate Exit Report.",
		);
	}
	const selection = routeSelection(input);
	const body = {
		schemaVersion: "1.0.0" as const,
		candidateDigest: input.candidate.digest,
		exitReportDigest: input.report.reportDigest,
		...input.details,
		...selection,
	};
	return toCanonicalJsonValue({
		...body,
		routeDigest: canonicalJsonDigest(body),
	}) as unknown as RuntimeLoopExitRoute<
		TRoute | "repair" | "waiting",
		TDetails
	>;
}

function routeSelection<
	TLoop extends SemanticLoop,
	TContent extends CanonicalJsonValue,
	TRoute extends RuntimeLoopRouteTarget,
>(input: {
	readonly candidate: LoopCandidate<TLoop, TContent>;
	readonly report: ExitReport;
	readonly passed: RuntimeLoopRouteSelection<TRoute>;
}): RuntimeLoopRouteSelection<TRoute | "repair" | "waiting"> {
	if (input.report.status === "fail") {
		return {
			route: "repair",
			reasonCode: `${input.candidate.loop}-checks-failed`,
		};
	}
	if (input.report.status === "indeterminate") {
		return {
			route: "waiting",
			reasonCode: `${input.candidate.loop}-assurance-indeterminate`,
		};
	}
	return input.passed;
}
