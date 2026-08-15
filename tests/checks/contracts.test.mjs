import test from "node:test";
import assert from "node:assert/strict";
import {
	CHECK_DEFINITION_SCHEMA_VERSION,
	CHECK_OUTPUT_PROTOCOL_ID,
	CHECK_OUTPUT_PROTOCOL_VERSION,
	CheckInputSelectorSchema,
	CheckInvocationSchema,
	CheckResultSchema,
	GateReportSchema,
	GateStopReasonSchema,
	GateWarningSchema,
	checkDefinitionDigest,
	checkPassed,
	normalizeCheckDefinition,
	normalizeCheckOutput,
} from "../../src/checks/contracts.ts";
import {checkDefinition, digest} from "../helpers/checks.mjs";

test("published schemas cover selectors, Invocation, Result, warnings, stops, and Gate Report", () => {
	for (const schema of [
		CheckInputSelectorSchema,
		CheckInvocationSchema,
		CheckResultSchema,
		GateWarningSchema,
		GateStopReasonSchema,
		GateReportSchema,
	]) {
		assert.equal(typeof schema, "object");
	}
	assert.equal(JSON.stringify(CheckResultSchema).includes("indeterminate"), false);
	assert.equal(JSON.stringify(GateReportSchema).includes("stopped"), true);
});

test("Check Definition schema is strict, immutable, and deterministic", () => {
	const definition = normalizeCheckDefinition(
		checkDefinition({
			inputs: [
				{source: "evidence", refs: ["evidence/**"], required: false, maximumBytes: 1024},
				{source: "subject", refs: [], required: true, maximumBytes: 4096},
			],
		}),
	);
	assert.equal(definition.schemaVersion, CHECK_DEFINITION_SCHEMA_VERSION);
	assert.deepEqual(definition.inputs.map((input) => input.source), ["evidence", "subject"]);
	assert.equal(checkDefinitionDigest(definition), checkDefinitionDigest({...definition}));
	assert.equal(Object.isFrozen(definition), true);
	assert.throws(
		() => normalizeCheckDefinition({...definition, enforcement: "required"}),
		/unsupported field enforcement/,
	);
});

test("Check Definition requires one subject selector and bounded quantitative threshold", () => {
	assert.throws(
		() => normalizeCheckDefinition(checkDefinition({inputs: []})),
		/requires a subject input selector/,
	);
	assert.throws(
		() =>
			normalizeCheckDefinition(
				checkDefinition({measurement: {kind: "quantitative"}}),
			),
		/requires a minimum or maximum/,
	);
	assert.throws(
		() =>
			normalizeCheckDefinition(
				checkDefinition({
					measurement: {kind: "quantitative", minimum: 90, maximum: 50},
				}),
			),
		/maximum cannot be below minimum/,
	);
});

test("binary and quantitative measurements reduce to one pass or fail boundary", () => {
	assert.equal(checkPassed({kind: "binary"}, {kind: "binary", value: true}), true);
	assert.equal(checkPassed({kind: "binary"}, {kind: "binary", value: false}), false);
	assert.equal(
		checkPassed(
			{kind: "quantitative", minimum: 80},
			{kind: "quantitative", value: 80},
		),
		true,
	);
	assert.equal(
		checkPassed(
			{kind: "quantitative", maximum: 3},
			{kind: "quantitative", value: 4},
		),
		false,
	);
	assert.throws(
		() => checkPassed({kind: "binary"}, {kind: "quantitative", value: 1}),
		/does not match/,
	);
});

test("Check Output protocol admits only exact bounded structured output", () => {
	const invocationDigest = digest({invocation: 1});
	const output = normalizeCheckOutput(
		{
			protocolId: CHECK_OUTPUT_PROTOCOL_ID,
			protocolVersion: CHECK_OUTPUT_PROTOCOL_VERSION,
			invocationDigest,
			measurement: {kind: "binary", value: false},
			summary: "Requirement failed.",
			details: [{message: "Missing proof.", ref: "evidence:one", startLine: 2, endLine: 3}],
		},
		invocationDigest,
		4096,
	);
	assert.equal(output.measurement.value, false);
	assert.throws(
		() => normalizeCheckOutput({...output, conclusion: "indeterminate"}, invocationDigest, 4096),
		/unsupported field conclusion/,
	);
	assert.throws(
		() => normalizeCheckOutput({...output, invocationDigest: digest({other: 1})}, invocationDigest, 4096),
		/does not match/,
	);
	assert.throws(
		() => normalizeCheckOutput({...output, measurement: {kind: "quantitative", value: Number.NaN}}, invocationDigest, 4096),
		/invalid|finite/,
	);
});
