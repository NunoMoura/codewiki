import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	createCustomCheckDefinition,
	createUserStandardDefinition,
	createUserStandardSourceSnapshot,
	customCheckConfigurationDigest,
	normalizeUserStandardDefinitions,
} from "../../../src/verification/custom-checks/index.ts";

const OBSERVED_AT = "2026-08-01T12:00:00.000Z";

function standardProposal(overrides = {}) {
	const content = [
		"# API ownership",
		"Every changed public API must name its accountable owning team.",
		"Every public API must document one escalation owner.",
	].join("\n");
	const {source: sourceOverrides = {}, ...proposalOverrides} = overrides;
	const {contentDigest: _contentDigest, ...sourceMaterialOverrides} = sourceOverrides;
	return {
		name: "Company API policy",
		source: createUserStandardSourceSnapshot({
			kind: "inline",
			mediaType: "text/markdown",
			content,
			observedAt: OBSERVED_AT,
			...sourceMaterialOverrides,
		}),
		passages: [
			{ text: "Every changed public API must name its accountable owning team." },
		],
		...proposalOverrides,
	};
}

function checkProposal(standard, overrides = {}) {
	return {
		checkTypeId: "organization_policy",
		evaluator: "model",
		name: "Public API ownership",
		requirement: "Every changed public API must name its accountable owning team.",
		appliesWhen: {loops: ["decision"]},
		standardRefs: [
			{
				userStandardId: standard.userStandardId,
				standardDigest: standard.standardDigest,
				passageIds: [standard.passages[0].passageId],
			},
		],
		...overrides,
	};
}

describe("User Standard contracts", () => {
	it("materializes immutable normalized inline and URL source snapshots", () => {
		const inline = createUserStandardDefinition(
			standardProposal({
				name: "  Company API policy  ",
				source: {
					...standardProposal().source,
					content: standardProposal().source.content.replaceAll("\n", "\r\n"),
				},
			}),
		);
		const equivalent = createUserStandardDefinition(standardProposal());
		const url = createUserStandardDefinition({
			...standardProposal(),
			source: createUserStandardSourceSnapshot({
				kind: "url",
				mediaType: standardProposal().source.mediaType,
				content: standardProposal().source.content,
				observedAt: standardProposal().source.observedAt,
				uri: "https://example.com/company/api-policy",
			}),
		});

		assert.equal(inline.userStandardId, equivalent.userStandardId);
		assert.equal(inline.standardDigest, equivalent.standardDigest);
		assert.equal(inline.schemaVersion, "1.0.0");
		assert.match(inline.userStandardId, /^user-standard:[0-9a-f]{64}$/);
		assert.match(inline.standardDigest, /^sha256:[0-9a-f]{64}$/);
		assert.match(inline.source.contentDigest, /^sha256:[0-9a-f]{64}$/);
		assert.match(inline.passages[0].passageId, /^standard-passage:[0-9a-f]{64}$/);
		assert.equal(inline.source.content.includes("\r"), false);
		assert.equal(url.source.uri, "https://example.com/company/api-policy");
		assert.equal(Object.isFrozen(inline), true);
		assert.equal(Object.isFrozen(inline.source), true);
		assert.equal(Object.isFrozen(inline.passages), true);
	});

	it("rejects unsafe, unsupported, missing, oversized, and tampered sources", () => {
		assert.throws(
			() => createUserStandardDefinition({...standardProposal(), authority: "approved"}),
			/unsupported field authority/,
		);
		assert.throws(
			() =>
				createUserStandardDefinition({
					...standardProposal(),
					source: {
						...standardProposal().source,
						kind: "url",
						uri: "http://example.com/policy",
					},
				}),
			/HTTPS URI/,
		);
		assert.throws(
			() =>
				createUserStandardDefinition({
					...standardProposal(),
					source: {
						...standardProposal().source,
						kind: "url",
						uri: "https://user:secret@example.com/policy",
					},
				}),
			/cannot contain credentials/,
		);
		assert.throws(
			() =>
				createUserStandardDefinition({
					...standardProposal(),
					source: {
						...standardProposal().source,
						content: `${standardProposal().source.content}\napi_key=abcdefgh12345678`,
					},
				}),
			/credential-like private data/,
		);
		assert.throws(
			() =>
				createUserStandardDefinition({
					...standardProposal(),
					passages: [{text: "This passage is not present."}],
				}),
			/must occur in normalized source content/,
		);
		assert.throws(
			() =>
				createUserStandardDefinition({
					...standardProposal(),
					source: {...standardProposal().source, content: "x".repeat(32_769)},
				}),
			/cannot exceed 32768 Unicode code points/,
		);
		const standard = createUserStandardDefinition(standardProposal());
		assert.throws(
			() => normalizeUserStandardDefinitions([{...standard, name: "Tampered"}]),
			/standardDigest does not match definition/,
		);
		assert.throws(
			() => normalizeUserStandardDefinitions([{...standard, effect: "allow"}]),
			/unsupported field effect/,
		);
	});

	it("requires every Custom Check to bind exact accepted Standard passages", () => {
		const standard = createUserStandardDefinition(standardProposal());
		const definition = createCustomCheckDefinition(checkProposal(standard), [standard]);

		assert.equal(definition.schemaVersion, "4.0.0");
		assert.deepEqual(definition.standardRefs, [
			{
				userStandardId: standard.userStandardId,
				standardDigest: standard.standardDigest,
				passageIds: [standard.passages[0].passageId],
			},
		]);
		assert.throws(
			() => createCustomCheckDefinition(checkProposal(standard), []),
			/does not exist in accepted User Standards/,
		);
		assert.throws(
			() =>
				createCustomCheckDefinition(
					checkProposal(standard, {
						standardRefs: [{
							...checkProposal(standard).standardRefs[0],
							standardDigest: `sha256:${"0".repeat(64)}`,
						}],
					}),
					[standard],
				),
			/standardDigest does not match accepted User Standard/,
		);
		assert.throws(
			() =>
				createCustomCheckDefinition(
					checkProposal(standard, {
						standardRefs: [{
							...checkProposal(standard).standardRefs[0],
							passageIds: [`standard-passage:${"0".repeat(64)}`],
						}],
					}),
					[standard],
				),
			/unknown passage/,
		);
		const {standardRefs: _standardRefs, ...sourceUnbound} = checkProposal(standard);
		assert.throws(
			() => createCustomCheckDefinition(sourceUnbound, [standard]),
			/standardRefs must contain at least one accepted User Standard binding/,
		);
	});

	it("binds accepted Standard snapshots into Custom Check configuration identity", () => {
		const first = createUserStandardDefinition(standardProposal());
		const second = createUserStandardDefinition({
			...standardProposal(),
			name: "Updated company API policy",
			source: createUserStandardSourceSnapshot({
				kind: "inline",
				mediaType: standardProposal().source.mediaType,
				content: `${standardProposal().source.content}\nPublic API owners must review quarterly.`,
				observedAt: "2026-08-02T12:00:00.000Z",
			}),
		});
		const firstCheck = createCustomCheckDefinition(checkProposal(first), [first]);
		const secondCheck = createCustomCheckDefinition(checkProposal(second), [second]);

		assert.notEqual(
			customCheckConfigurationDigest({
				userStandards: [first],
				customChecks: [firstCheck],
			}),
			customCheckConfigurationDigest({
				userStandards: [second],
				customChecks: [secondCheck],
			}),
		);
	});
});
