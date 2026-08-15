import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	assertResolvedRepairProfiles,
	defaultRepairProfiles,
	matchRepairProfiles,
	normalizeRepairProfileEntries,
	overlayResolvedRepairProfiles,
	repairProfileSetDigest,
	resolveRepairProfiles,
} from "../../../src/checks/repair/profiles.ts";

const failProfile = (objective = "Repair protocol binding.") => ({
	match: {outcome: "fail"},
	objective,
	target: "src/checks/protocol.ts",
	actions: ["Restore exact Invocation binding."],
	prohibitedShortcuts: ["Do not weaken admission."],
	requiredContext: ["Invocation", "Observation"],
	verification: ["Rerun protocol tests."],
	routeRecommendation: "repair_candidate",
});

const findingProfile = {
	match: {findingCode: "protocol.binding"},
	objective: "Repair exact protocol finding.",
	target: "src/checks/protocol.ts",
	actions: ["Bind Observation to admitted Invocation."],
	prohibitedShortcuts: ["Do not fabricate Runtime fields."],
	requiredContext: ["Structured finding location"],
	verification: ["Admit Observation again."],
};

describe("Repair Profile contracts", () => {
	it("normalizes bounded sparse entries and rejects ambiguous matches", () => {
		const entries = normalizeRepairProfileEntries([findingProfile, failProfile()]);
		assert.deepEqual(
			entries.map((entry) => Object.keys(entry.match)[0]),
			["findingCode", "outcome"],
		);
		assert.ok(Object.isFrozen(entries));
		assert.throws(
			() =>
				normalizeRepairProfileEntries([
					{...failProfile(), match: {outcome: "fail", findingCode: "protocol.binding"}},
				]),
			/exactly one of findingCode or outcome/,
		);
		assert.throws(
			() => normalizeRepairProfileEntries([failProfile(), failProfile("Duplicate")]),
			/duplicate match variants/,
		);
		assert.throws(
			() => normalizeRepairProfileEntries([{...failProfile(), actions: []}]),
			/between 1 and 16 items/,
		);
	});

	it("resolves project, Pack, and per-Check variants by deterministic precedence", () => {
		const profiles = resolveRepairProfiles([
			{layer: "project", ref: ".codewiki/config.json#checks.defaults", profiles: [failProfile("Project")]},
			{layer: "pack", ref: "pack:quality", profiles: [failProfile("Pack"), findingProfile]},
			{layer: "check", ref: "pack:quality/check:binding", profiles: [failProfile("Check")]},
		]);
		assert.equal(profiles.length, 2);
		assert.equal(profiles.find((profile) => profile.variantId === "outcome:fail").objective, "Check");
		assert.equal(profiles.find((profile) => profile.variantId === "outcome:fail").source.layer, "check");
		assert.equal(
			profiles.find((profile) => profile.variantId === "finding:protocol.binding").source.layer,
			"pack",
		);
		assertResolvedRepairProfiles(profiles, repairProfileSetDigest(profiles));
		assert.ok(Object.isFrozen(profiles[0].actions));
	});

	it("matches exact finding codes before outcome fallback", () => {
		const defaults = defaultRepairProfiles({
			checkId: "codewiki.protocol.binding",
			requirement: "Observation binds exact Invocation.",
			target: "source",
		});
		const exact = resolveRepairProfiles([
			{layer: "check", ref: "protocol-check", profiles: [findingProfile]},
		]);
		const profiles = overlayResolvedRepairProfiles(defaults, exact);
		const onlyExact = matchRepairProfiles({
			profiles,
			result: {status: "fail", findings: [{code: "protocol.binding"}]},
		});
		assert.deepEqual(onlyExact.map((profile) => profile.variantId), ["finding:protocol.binding"]);

		const exactAndFallback = matchRepairProfiles({
			profiles,
			result: {
				status: "fail",
				findings: [{code: "protocol.binding"}, {code: "protocol.other"}],
			},
		});
		assert.deepEqual(
			exactAndFallback.map((profile) => profile.variantId),
			["finding:protocol.binding", "outcome:fail"],
		);
		assert.deepEqual(
			matchRepairProfiles({profiles, result: {status: "pass", findings: []}}),
			[],
		);
	});

	it("detects guidance and provenance tampering", () => {
		const profiles = defaultRepairProfiles({
			checkId: "codewiki.protocol.binding",
			requirement: "Observation binds exact Invocation.",
			target: "source",
		});
		const tamperedGuidance = structuredClone(profiles);
		tamperedGuidance[0].actions = ["Skip verification."];
		assert.throws(
			() => assertResolvedRepairProfiles(tamperedGuidance),
			/sourceDigest does not match content/,
		);
		const tamperedSource = structuredClone(profiles);
		tamperedSource[0].source.ref = "other-check";
		assert.throws(
			() => assertResolvedRepairProfiles(tamperedSource),
			/profileDigest does not match content/,
		);
	});
});
