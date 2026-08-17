import test from "node:test";
import assert from "node:assert/strict";
import {createPiNativeDecisionResearchCollector} from "../../../src/runtime/pi/native-decision-research.ts";
import {
	nativeDecisionCandidate,
	nativeDecisionRevision,
	nativeDecisionState,
} from "../../helpers/native-decision.mjs";
import {digest} from "../../helpers/checks.mjs";

function candidate() {
	const changeId = "CHG-research";
	const revision = nativeDecisionRevision({changeId});
	return nativeDecisionCandidate({
		state: nativeDecisionState([{changeId, revision}]),
		changeId,
	});
}

test("Pi native Decision research remains bounded Evidence collection only", async () => {
	let received;
	const collector = createPiNativeDecisionResearchCollector({
		research: {
			sensitivity: "project",
			collector: {
				id: "trusted-research-connector",
				version: "1.0.0",
				configurationDigest: digest({collector: 1}),
				async collect(input) {
					received = input;
					return {
						protocol: input.request.protocol,
						requestDigest: input.request.requestDigest,
						status: "unavailable",
						citations: [],
					};
				},
			},
		},
		now: () => "2026-08-04T01:00:00.000Z",
	});
	const value = candidate();
	const records = await collector.collect({
		candidate: value,
		changeRef: `change:${value.content.changeId}`,
		signal: new AbortController().signal,
	});
	assert.deepEqual(records, []);
	assert.equal(received.request.candidate.digest, value.digest);
	assert.equal("transport" in collector, false);
	assert.equal("route" in collector, false);
});
