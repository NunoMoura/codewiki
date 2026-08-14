import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {createChangeRevision} from "../../src/changes/trace/identity.ts";
import {
	CHANGE_DEFECT_PROFILE_PROTOCOL,
	normalizeChangeDefectProfile,
} from "../../src/changes/defect-profile.ts";

function profile(overrides = {}) {
	return {
		protocolId: CHANGE_DEFECT_PROFILE_PROTOCOL.id,
		protocolVersion: CHANGE_DEFECT_PROFILE_PROTOCOL.version,
		category: "security",
		severity: "high",
		likelihood: "possible",
		exposure: "limited",
		confidence: "medium",
		reproducibility: "reported",
		regressionStatus: "suspected",
		affectedVersions: ["2.0.0", "1.9.0"],
		affectedTrees: ["b".repeat(40), "a".repeat(40)],
		affectedComponents: ["kb:system/runtime", "kb:product/automation"],
		observedBehavior: "Token validation accepts an unexpected issuer.\r\n",
		expectedBehavior: "Token validation accepts only configured issuers.",
		sourceLocations: ["tests/security/token.test.ts", "src/security/token.ts"],
		ruleRefs: ["scanner:jwt-issuer", "review:security:42"],
		security: {
			classification: "suspected_vulnerability",
			identifiers: [
				{
					scheme: "ghsa",
					value: "ghsa-2q3p-4r5v-6w7x",
					sourceRef: "trace:scanner:advisory:2",
				},
				{
					scheme: "cve",
					value: "cve-2026-12345",
					sourceRef: "trace:scanner:advisory:1",
				},
				{
					scheme: "cwe",
					value: "cwe-346",
					sourceRef: "trace:scanner:rule:346",
				},
				{
					scheme: "osv",
					value: "OSV-2026-Example",
					sourceRef: "trace:scanner:osv:1",
				},
			],
			cvss: [
				{
					version: "3.1",
					vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
					score: 9.8,
					sourceRef: "trace:scanner:cvss:1",
				},
			],
			sarif: [
				{
					version: "2.1.0",
					toolId: "security-scanner",
					ruleId: "jwt-issuer",
					resultRef: "trace:sarif:result:17",
				},
			],
			kev: [
				{
					cveId: "CVE-2026-12345",
					catalogRef: "trace:cisa-kev:2026-08-01",
				},
			],
		},
		provenance: {
			authority: "asserted",
			evidenceIds: ["EVD-security-source-2", "EVD-security-source-1"],
			sourceRefs: ["trace:scanner:run:2", "trace:scanner:run:1"],
		},
		...overrides,
	};
}

describe("Change defect and security profile", () => {
	it("normalizes independent dimensions and qualified external references", () => {
		const normalized = normalizeChangeDefectProfile(profile());
		assert.equal(Object.isFrozen(normalized), true);
		assert.equal(normalized.severity, "high");
		assert.equal(normalized.likelihood, "possible");
		assert.equal(normalized.exposure, "limited");
		assert.equal(normalized.confidence, "medium");
		assert.equal(normalized.observedBehavior.endsWith("\n"), false);
		assert.deepEqual(normalized.affectedVersions, ["1.9.0", "2.0.0"]);
		assert.deepEqual(normalized.affectedTrees, ["a".repeat(40), "b".repeat(40)]);
		assert.deepEqual(
			normalized.security.identifiers.map(({scheme, value}) => [scheme, value]),
			[
				["cve", "CVE-2026-12345"],
				["cwe", "CWE-346"],
				["ghsa", "GHSA-2q3p-4r5v-6w7x"],
				["osv", "OSV-2026-Example"],
			],
		);
		assert.deepEqual(normalized.provenance.evidenceIds, [
			"EVD-security-source-1",
			"EVD-security-source-2",
		]);
	});

	it("binds optional profile identity while keeping risk and priority outside it", () => {
		const normalized = normalizeChangeDefectProfile(profile());
		const content = {
			title: "Validate token issuer",
			intent: {
				currentState: "Issuer validation is incomplete.",
				desiredState: "Only configured issuers pass.",
				nonGoals: [],
				alternatives: [],
			},
			classification: {
				kind: "harden",
				type: "security_change",
				scope: "source",
				affectedLayers: ["security"],
				targetRefs: ["src/security/token.ts"],
			},
			impact: {},
			knowledge: {topicRefs: ["kb:system/runtime"], propagationRefs: []},
			outcome: {
				successSignals: ["Only configured issuers pass."],
				evidenceExpectations: [],
			},
			delivery: {constraints: [], planningQuestions: []},
			evidence: {sourceRefs: ["src/security/token.ts"], proofRefs: []},
			safety: {risk: "unknown", invariants: [], failureModes: []},
			acceptanceRequirements: [
				{id: "REQ-token-issuer", statement: "Reject unexpected issuers."},
			],
			defectProfile: normalized,
		};
		const revision = createChangeRevision(content);
		const {defectProfile: _defectProfile, ...contentWithoutProfile} = content;
		const withoutProfile = createChangeRevision(contentWithoutProfile);
		assert.equal(revision.content.safety.risk, "unknown");
		assert.equal("risk" in revision.content.defectProfile, false);
		assert.equal("priority" in revision.content.defectProfile, false);
		assert.notEqual(revision.revisionId, withoutProfile.revisionId);
	});

	it("rejects authority mixing and malformed qualified security metadata", () => {
		for (const [value, expected] of [
			[{...profile(), priority: "critical"}, /unsupported field priority/],
			[{...profile(), risk: "high"}, /unsupported field risk/],
			[{...profile(), category: "generic_issue"}, /category/],
			[
				{
					...profile(),
					provenance: {
						authority: "approved",
						evidenceIds: [],
						sourceRefs: ["trace:security:approval"],
					},
				},
				/approved defect profiles require Evidence ids/,
			],
			[
				{
					...profile(),
					security: {
						...profile().security,
						identifiers: [
							{
								scheme: "cve",
								value: "CVE-not-qualified",
								sourceRef: "trace:scanner:cve",
							},
						],
					},
				},
				/invalid for cve/,
			],
			[
				{
					...profile(),
					security: {
						...profile().security,
						cvss: [
							{
								version: "3.1",
								vector: "CVSS:4.0/AV:N",
								score: 9.81,
								sourceRef: "trace:scanner:cvss",
							},
						],
					},
				},
				/CVSS score must use at most one decimal place/,
			],
			[
				{
					...profile(),
					security: {
						...profile().security,
						kev: [
							{
								cveId: "GHSA-2q3p-4r5v-6w7x",
								catalogRef: "trace:cisa-kev:bad",
							},
						],
					},
				},
				/KEV cveId must be a qualified CVE identifier/,
			],
		]) {
			assert.throws(() => normalizeChangeDefectProfile(value), expected);
		}
	});
});
