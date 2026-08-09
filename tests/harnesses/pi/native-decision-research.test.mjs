import assert from "node:assert/strict";
import test from "node:test";

import {createPiNativeDecisionResearchRuntimeConfig} from "../../../src/harnesses/pi/native-decision-research.ts";

const digest = (value) => `sha256:${value.repeat(64)}`;

function route() {
	return {
		id: "decision-research",
		provider: "test-provider",
		model: "test-model",
		thinking: "medium",
		tools: "none",
		timeoutMs: 30_000,
		maxResponseBytes: 32_768,
		configurationDigest: digest("4"),
	};
}

function collector() {
	return {
		id: "trusted-research-connector",
		version: "1.0.0",
		configurationDigest: digest("5"),
		async collect() {
			throw new Error("not invoked by configuration");
		},
	};
}

test("Pi native Decision research binds injected or default isolated claim transport", () => {
	const claimsTransport = {async execute() {}};
	const now = () => "2026-08-04T01:00:00.000Z";
	const injected = createPiNativeDecisionResearchRuntimeConfig({
		repoRoot: process.cwd(),
		research: {
			route: route(),
			sensitivity: "project",
			collector: collector(),
			claimsTransport,
		},
		semanticSession: undefined,
		now,
	});
	assert.equal(injected.transport, claimsTransport);
	assert.equal(typeof injected.collectEvidence, "function");
	assert.equal("now" in injected, false);
	assert.equal("collector" in injected, false);

	const defaultTransport = createPiNativeDecisionResearchRuntimeConfig({
		repoRoot: process.cwd(),
		research: {
			route: route(),
			sensitivity: "private",
			collector: collector(),
		},
		semanticSession: undefined,
		now: undefined,
	});
	assert.equal(typeof defaultTransport.transport.execute, "function");
	assert.equal(typeof defaultTransport.collectEvidence, "function");
	assert.equal("now" in defaultTransport, false);
	assert.equal("collector" in defaultTransport, false);
});
