import { RuntimeReactor } from "../../src/runtime/coordinator/reactor.ts";
import { runtimeSemanticJobId } from "../../src/runtime/coordinator/job-id.ts";
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
		async decisionAttention() {
			throw new Error("decision_attention_projection_unavailable");
		},
		async selectDecision() {
			throw new Error("decision_attention_selection_unavailable");
		},
		async react() {
			throw new Error("autonomous semantic execution is not expected");
		},
		events() {
			return new Promise(() => undefined);
		},
		async submitCandidate(root, _ctx, trigger, loop, candidate, mode) {
			const reactor = reactorFor(root);
			const reaction = await reactor.inspect(trigger);
			if (loop === "decision" && reaction.selection?.loop !== "decision") {
				throw new Error("decision_attention_selection_required");
			}
			if (reaction.selection?.loop !== loop) {
				throw new Error("runtime_reaction_mismatch");
			}
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
				context: {
					decision: {
						authority: {
							kind: "policy",
							actor: "runtime:test",
							ref: "policy:test-pi-project-services",
						},
						occurredAt: "2026-06-17T00:00:01.000Z",
					},
					planning: {
						actor: "runtime:test",
						createdAt: "2026-06-17T00:00:02.000Z",
					},
					implementation: {
						createdAt: "2026-06-17T00:00:04.000Z",
					},
				},
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
