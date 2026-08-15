import test from "node:test";
import assert from "node:assert/strict";
import {createCodeCheckExecutor} from "../../../src/execution/checks/code.ts";
import {
	assembleCheckInvocation,
	subjectInputSelection,
} from "../../../src/checks/protocol.ts";
import {
	checkOutput,
	checkSnapshot,
	checkSubject,
	digest,
	packagedCheck,
} from "../../helpers/checks.mjs";

function fixture() {
	const check = packagedCheck({
		definition: {id: "sandboxed-code"},
		implementationContent: "export default async function check(input) { return input; }\n",
	});
	const snapshot = checkSnapshot([check]);
	const subject = checkSubject();
	const invocation = assembleCheckInvocation({
		subject,
		snapshot,
		check,
		inputs: [subjectInputSelection(subject, check.definition.inputs[0])],
	});
	return {check, invocation};
}

test("Code Check executor requires admitted hermetic network-denied sandbox", () => {
	assert.throws(
		() =>
			createCodeCheckExecutor({
				executorId: "unsafe",
				executorVersion: "1.0.0",
				profile: "sandbox",
				configurationDigest: digest({unsafe: true}),
				sandbox: {
					admission: {
						hermetic: true,
						network: "allowed",
						credentials: "none",
						bounded: true,
					},
					execute() {},
				},
			}),
		/network-denied/,
	);
});

test("Code Check executor forwards only source, Invocation, bounds, and cancellation", async () => {
	const {check, invocation} = fixture();
	let received;
	const executor = createCodeCheckExecutor({
		executorId: "admitted-sandbox",
		executorVersion: "1.0.0",
		profile: "sandbox",
		configurationDigest: digest({sandbox: 1}),
		sandbox: {
			admission: {
				hermetic: true,
				network: "denied",
				credentials: "none",
				bounded: true,
			},
			execute(request) {
				received = request;
				return checkOutput(request.invocation);
			},
		},
	});
	const output = await executor.execute({
		check,
		invocation,
		implementation: check.implementation,
		signal: new AbortController().signal,
	});
	assert.equal(output.measurement.value, true);
	assert.equal(received.source, check.implementation.content);
	assert.equal(received.invocation.invocationDigest, invocation.invocationDigest);
	assert.equal(received.timeoutMs, check.definition.limits.timeoutMs);
	assert.equal("credentials" in received, false);
	assert.equal("network" in received, false);
	assert.equal("repoRoot" in received, false);
});
