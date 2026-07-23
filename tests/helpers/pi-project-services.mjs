import assert from "node:assert/strict";
import { RuntimeReactor } from "../../src/runtime/reactor.ts";
import { runtimeSemanticJobId } from "../../src/runtime/semantic-job-id.ts";
import { runRuntimeSelectedSemanticReaction } from "../../src/runtime/semantic-executor.ts";

export function testPiProjectServices() {
	const reactors = new Map();
	const reactorFor = (root) => {
		const current = reactors.get(root);
		if (current) return current;
		const reactor = new RuntimeReactor(root);
		reactors.set(root, reactor);
		return reactor;
	};
	return {
		async connect() {},
		inspect(root, _ctx, trigger) {
			return reactorFor(root).inspect(trigger);
		},
		async semanticExecution() {
			return "client_candidate";
		},
		async react() {
			throw new Error("autonomous semantic execution is not expected");
		},
		async submitCandidate(root, _ctx, trigger, loop, candidate, mode) {
			const reactor = reactorFor(root);
			const reaction = await reactor.inspect(trigger);
			assert.equal(reaction.selection?.loop, loop);
			const adapters =
				loop === "decision"
					? { decision: () => candidate }
					: loop === "planning"
						? { planning: () => candidate }
						: { implementation: () => candidate };
			const execution = await runRuntimeSelectedSemanticReaction({
				repoRoot: root,
				reaction,
				runtimeJobId: runtimeSemanticJobId(reaction, mode),
				adapters,
				mode,
				reactor,
			});
			return {
				receipt: {
					schemaVersion: 1,
					jobId: runtimeSemanticJobId(reaction, mode),
					loop,
					status: execution.status,
					evidence: executionEvidence(execution.outcome),
				},
				execution,
			};
		},
		async disconnect() {},
	};
}

function executionEvidence(outcome) {
	if (!outcome) return [];
	if (outcome.loop === "decision") {
		return outcome.result.append && outcome.result.event
			? [eventEvidence(outcome.result.event)]
			: [];
	}
	if (outcome.loop === "planning") {
		return outcome.result.append
			? Object.values(outcome.result.events).map(eventEvidence)
			: [];
	}
	return outcome.result.append
		? [eventEvidence(outcome.result.iterationEvent)]
		: [];
}

function eventEvidence(event) {
	return {
		traceId: event.traceId,
		eventId: event.id,
		sequence: event.sequence,
	};
}
