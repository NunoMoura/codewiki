import test from "node:test";
import assert from "node:assert/strict";
import {
	createUserStandardDefinition,
	createUserStandardSourceSnapshot,
	normalizeUserStandardDefinitions,
	userStandardConfigurationDigest,
} from "../../src/changes/triage/standards.ts";

const OBSERVED_AT = "2026-08-01T12:00:00.000Z";

function standardProposal(overrides = {}) {
	const content = [
		"# Triage ownership",
		"Every urgent Change must name its accountable owning team.",
		"Every public API must document one escalation owner.",
	].join("\n");
	return {
		name: "Company triage policy",
		source: createUserStandardSourceSnapshot({
			kind: "inline",
			mediaType: "text/markdown",
			content,
			observedAt: OBSERVED_AT,
		}),
		passages: [
			{text: "Every urgent Change must name its accountable owning team."},
		],
		...overrides,
	};
}

test("Change Intake User Standard identity is deterministic and immutable", () => {
	const first = createUserStandardDefinition(standardProposal());
	const second = createUserStandardDefinition(standardProposal());
	assert.deepEqual(first, second);
	assert.match(first.userStandardId, /^user-standard:[a-f0-9]{64}$/);
	assert.equal(Object.isFrozen(first), true);
	assert.equal(
		userStandardConfigurationDigest([first]),
		userStandardConfigurationDigest([second]),
	);
});

test("User Standard passages must be exact bounded source excerpts", () => {
	assert.throws(
		() =>
			createUserStandardDefinition(
				standardProposal({passages: [{text: "Invented policy text."}]}),
			),
		/must occur in normalized source content/,
	);
});

test("User Standard normalization rejects duplicate identities and private material", () => {
	const standard = createUserStandardDefinition(standardProposal());
	assert.throws(
		() => normalizeUserStandardDefinitions([standard, standard]),
		/cannot contain duplicates/,
	);
	assert.throws(
		() =>
			createUserStandardSourceSnapshot({
				kind: "inline",
				mediaType: "text/plain",
				content: "api_key=secretvalue12345",
				observedAt: OBSERVED_AT,
			}),
		/private|credential|secret/i,
	);
});
