import type {EvidenceRecord} from "../../evidence/contracts.ts";
import type {EvidenceObligationResolution} from "../../evidence/obligation-resolution.ts";
import {
	createLoopExitResultCache,
	type LoopExitResultCache,
} from "../../loop-exit/cache.ts";
import {createCheckCatalog} from "../../loop-exit/catalog.ts";
import type {ResolvedExitPolicy} from "../../loop-exit/contracts.ts";
import {resolveExitPolicy} from "../../loop-exit/resolve-policy.ts";
import {
	createLoopExitRunner,
	type LoopCheckExecutor,
	type LoopExitRunnerLimits,
} from "../../loop-exit/runner.ts";
import type {DecisionCandidate} from "./candidate.ts";
import {createDecisionCodeExecutors} from "./code-executors.ts";

interface CreateDecisionExitRuntimeInput {
	readonly additionalExecutors?: readonly LoopCheckExecutor[];
	readonly cache?: LoopExitResultCache;
	readonly limits?: LoopExitRunnerLimits;
}

interface RunDecisionExitInput {
	readonly candidate: DecisionCandidate;
	readonly changeRef: string;
	readonly evidenceResolutionsByCheck?: Readonly<
		Record<string, readonly EvidenceObligationResolution[]>
	>;
	readonly evidenceRecords?: readonly EvidenceRecord[];
	readonly signal?: AbortSignal;
}

interface DecisionExitRun {
	readonly policy: ResolvedExitPolicy;
	readonly result: Awaited<
		ReturnType<ReturnType<typeof createLoopExitRunner>["run"]>
	>;
}

export function createDecisionExitRuntime(
	input: CreateDecisionExitRuntimeInput = {},
): {
	readonly run: (runInput: RunDecisionExitInput) => Promise<DecisionExitRun>;
	readonly cache: LoopExitResultCache;
} {
	const catalog = createCheckCatalog();
	const cache = input.cache ?? createLoopExitResultCache();
	const runner = createLoopExitRunner({
		catalog,
		cache,
		limits: input.limits,
		executors: [
			...createDecisionCodeExecutors(catalog),
			...(input.additionalExecutors ?? []),
		],
	});
	return Object.freeze({
		cache,
		async run(runInput: RunDecisionExitInput): Promise<DecisionExitRun> {
			assertRunInput(runInput);
			const policy = decisionExitPolicy(runInput.candidate, runInput.changeRef);
			const result = await runner.run({
				candidate: runInput.candidate,
				policy,
				...(runInput.evidenceResolutionsByCheck
					? {
							evidenceResolutionsByCheck:
								runInput.evidenceResolutionsByCheck,
						}
					: {}),
				...(runInput.evidenceRecords
					? {evidenceRecords: runInput.evidenceRecords}
					: {}),
				...(runInput.signal ? {signal: runInput.signal} : {}),
			});
			return Object.freeze({policy, result});
		},
	});
}

function decisionExitPolicy(
	candidate: DecisionCandidate,
	changeRef: string,
): ResolvedExitPolicy {
	return resolveExitPolicy({
		loop: "decision",
		candidateDigest: candidate.digest,
		changes: [
			{
				changeId: changeRef.slice("change:".length),
				revision: candidate.content.revision.revision,
				digest: candidate.content.validation.revisionDigest,
				kind: candidate.content.revision.classification.kind,
				type: candidate.content.revision.classification.type,
				risk: candidate.content.revision.safety.risk,
				affectedLayers: [
					...candidate.content.revision.classification.affectedLayers,
				],
			},
		],
		projectTraits: [],
		technologies: [],
		paths: [...candidate.content.revision.classification.targetRefs],
	});
}

function assertRunInput(input: RunDecisionExitInput): void {
	if (input.candidate.loop !== "decision") {
		throw new Error("Decision exit runtime requires a Decision Candidate.");
	}
	if (!/^change:[A-Za-z0-9._-]+$/.test(input.changeRef)) {
		throw new Error("Decision exit runtime changeRef is invalid.");
	}
	if (!input.candidate.observedBase.canonicalRefs.includes(input.changeRef)) {
		throw new Error("Decision exit runtime changeRef is not bound by Candidate.");
	}
}
