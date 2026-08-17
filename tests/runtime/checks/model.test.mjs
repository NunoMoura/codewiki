import test from "node:test";
import assert from "node:assert/strict";
import {
	MODEL_CHECK_REQUEST_PROTOCOL,
	createModelCheckExecutor,
	createModelCheckRequest,
} from "../../../src/runtime/checks/model.ts";
import {
	assembleCheckInvocation,
	subjectInputSelection,
} from "../../../src/checks/protocol.ts";
import {
	checkSnapshot,
	checkSubject,
	digest,
	packagedCheck,
} from "../../helpers/checks.mjs";

function fixture() {
	const check = packagedCheck({
		definition: {
			id: "model-check",
			implementation: {
				kind: "model",
				route: "independent-route",
				profile: "review-model",
				maximumTokens: 2048,
			},
		},
		implementationContent: [
			"# Requirement",
			"Assess exact subject.",
			"# Pass",
			"Subject satisfies requirement.",
			"# Fail",
			"Subject does not satisfy requirement.",
			"# Feedback",
			"State missing supplied fact.",
		].join("\n"),
	});
	const snapshot = checkSnapshot([check]);
	const subject = checkSubject();
	const invocation = assembleCheckInvocation({
		subject,
		snapshot,
		check,
		inputs: [subjectInputSelection(subject, check.definition.inputs[0])],
	});
	return {check, snapshot, subject, invocation};
}

test("Model Check request binds exact rubric, Invocation, route, budget, and fixed output protocol", () => {
	const {check, invocation} = fixture();
	const request = createModelCheckRequest({check, invocation});
	assert.equal(request.protocolId, MODEL_CHECK_REQUEST_PROTOCOL.id);
	assert.equal(request.route, "independent-route");
	assert.equal(request.maximumTokens, 2048);
	assert.match(request.rubric, /# Pass/);
	assert.equal(request.invocation.invocationDigest, invocation.invocationDigest);
	assert.deepEqual(request.outputProtocol.requiredFields, [
		"protocolId",
		"protocolVersion",
		"invocationDigest",
		"measurement",
		"summary",
		"details",
	]);
	assert.equal(request.requestDigest, digest((({requestDigest, ...body}) => body)(request)));
});

test("Model Check executor has independent route and receives no Worker context", async () => {
	const {check, invocation} = fixture();
	let received;
	const executor = createModelCheckExecutor({
		executorId: "model-executor",
		executorVersion: "1.0.0",
		route: "independent-route",
		profile: "review-model",
		configurationDigest: digest({configuration: 1}),
		transport(request, signal) {
			received = {request, signal};
			return {
				protocolId: "codewiki.check-output",
				protocolVersion: "1.0.0",
				invocationDigest: request.invocation.invocationDigest,
				measurement: {kind: "binary", value: true},
				summary: "Passed.",
				details: [],
			};
		},
	});
	assert.equal(executor.supports(check), true);
	const output = await executor.execute({
		check,
		invocation,
		implementation: check.implementation,
		signal: new AbortController().signal,
	});
	assert.equal(output.measurement.value, true);
	assert.equal(received.request.route, "independent-route");
	assert.equal("tools" in received.request, false);
	assert.equal("memory" in received.request, false);
	assert.equal("worker" in received.request, false);
});
