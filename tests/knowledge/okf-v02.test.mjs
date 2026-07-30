import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	analyzeOkfV02Document,
	createCodeWikiOkfV02Frontmatter,
	okfV02RootIndexFrontmatter,
} from "../../src/knowledge/okf-v02.ts";
import {
	parseOkfDocument,
	serializeOkfDocument,
} from "../../src/knowledge/okf-frontmatter.ts";
import {validateOkfBundle} from "../../src/knowledge/okf-validation.ts";
import {canonicalJson} from "../../src/utils/canonical-json.ts";

const attestedConcept = `---
type: Attested Computation
title: Release readiness
status: stable
generated: { by: codewiki/0.3.0, at: 2026-07-30T12:00:00Z }
verified: { by: human:maintainer, at: 2026-07-30T13:00:00Z }
stale_after: '2026-08-01'
sources:
  - id: release-policy
    resource: /system/release-policy.md
    title: Release policy
    author: human:maintainer
    usage_count: 42
    last_modified: '2026-07-01'
    usage_window: { from: 2026-06-01, to: 2026-06-30 }
usage_window: { from: 2026-07-01, to: 2026-07-31 }
runtime: node
parameters:
  - { name: state_head, type: string, required: true }
executor:
  resource: references/run-release-check.md
  receipt: [state_head, result]
attester:
  resource: references/attest-release-check.mjs
codewiki_relationships:
  - type: verifies
    target: system/release-policy
    rationale: The computation verifies release-policy conformance.
producer_extension: retained
---
# Computation

\`\`\`js
export default ({state_head}) => state_head;
\`\`\`
`;

describe("OKF v0.2 compatibility and Software Alignment Profile", () => {
	it("normalizes trust, lifecycle, provenance, relationships, and inert attestation", () => {
		const document = parseOkfDocument("computations/release-readiness.md", attestedConcept);
		const profile = analyzeOkfV02Document(document, {today: "2026-08-01"});
		assert.equal(profile.formatVersion, "0.2");
		assert.equal(profile.trustTier, "human-reviewed");
		assert.equal(profile.status, "stable");
		assert.equal(profile.stale, true);
		assert.equal(profile.sources[0].resource, "/system/release-policy.md");
		assert.equal(profile.sources[0].usage_count, 42);
		assert.equal(
			canonicalJson(profile.sources[0].usage_window),
			canonicalJson({from: "2026-06-01", to: "2026-06-30"}),
		);
		assert.equal(
			canonicalJson(profile.usageWindow),
			canonicalJson({from: "2026-07-01", to: "2026-07-31"}),
		);
		assert.equal(
			canonicalJson(profile.relationships),
			canonicalJson([
				{
					type: "verifies",
					target: "system/release-policy",
					rationale: "The computation verifies release-policy conformance.",
				},
			]),
		);
		assert.equal(profile.attestedComputation.runtime, "node");
		assert.equal(profile.attestedComputation.executable, false);
		assert.deepEqual(profile.issues, []);
		assert.equal(profile.frontmatter.producer_extension, "retained");
	});

	it("keeps a bounded v0.1 fallback without fabricating producer authority", () => {
		const document = parseOkfDocument(
			"legacy/concept.md",
			`---\ntype: Concept\ntitle: Legacy\ntimestamp: '2026-07-01T00:00:00Z'\nunknown_field: keep\n---\n# Legacy\n`,
		);
		const profile = analyzeOkfV02Document(document);
		assert.equal(profile.formatVersion, "0.1-fallback");
		assert.equal(profile.generated, null);
		assert.equal(profile.legacyTimestamp, "2026-07-01T00:00:00Z");
		assert.equal(profile.trustTier, "unverified");
		assert.equal(profile.frontmatter.unknown_field, "keep");
		const verifiedOnly = analyzeOkfV02Document(
			parseOkfDocument(
				"legacy/verified.md",
				"---\ntype: Concept\nverified: { by: process:check, at: 2026-07-01T00:00:00Z }\n---\n",
			),
		);
		assert.equal(verifiedOnly.formatVersion, "0.2");
	});

	it("emits one strict v0.2 frontmatter contract and rejects vague relationships", () => {
		const frontmatter = createCodeWikiOkfV02Frontmatter({
			type: "System Responsibility",
			title: "Remote state synchronization",
			description: "Verifies Git-backed state before mutation.",
			generated: {by: "codewiki/0.3.0", at: "2026-07-30T12:00:00Z"},
			sources: [
				{
					resource: "https://example.test/runtime",
					usage_count: 12,
					last_modified: "2026-07-01",
				},
			],
			usageWindow: {from: "2026-07-01", to: "2026-07-31"},
			status: "stable",
			relationships: [
				{
					type: "constrains",
					target: "system/runtime",
					rationale: "Runtime writes require fresh synchronization.",
				},
			],
			extensions: {codewiki_component: "remote_state_synchronization"},
		});
		assert.equal(frontmatter.timestamp, undefined);
		assert.equal(frontmatter.generated.by, "codewiki/0.3.0");
		assert.equal(frontmatter.codewiki_component, "remote_state_synchronization");
		const source = serializeOkfDocument({frontmatter, body: "# Synchronization\n"});
		const parsed = analyzeOkfV02Document(
			parseOkfDocument("system/synchronization.md", source),
		);
		assert.equal(parsed.relationships[0].type, "constrains");
		assert.equal(
			canonicalJson(parsed.usageWindow),
			canonicalJson({from: "2026-07-01", to: "2026-07-31"}),
		);
		const attestedFrontmatter = createCodeWikiOkfV02Frontmatter({
			type: "Attested Computation",
			generated: {by: "codewiki/0.3.0", at: "2026-07-30T12:00:00Z"},
			attestedComputation: {
				runtime: "node",
				parameters: [{name: "ref", type: "string", required: true}],
				executor: {resource: "references/run.md", receipt: ["commit"]},
				attester: {resource: "references/attest.mjs"},
			},
		});
		const attested = analyzeOkfV02Document(
			parseOkfDocument(
				"computations/commit.md",
				serializeOkfDocument({frontmatter: attestedFrontmatter, body: "# Computation\n"}),
			),
		);
		assert.equal(attested.attestedComputation.executable, false);
		assert.equal(attested.issues.length, 0);
		assert.throws(
			() =>
				createCodeWikiOkfV02Frontmatter({
					type: "Attested Computation",
					generated: {by: "codewiki/0.3.0", at: "2026-07-30T12:00:00Z"},
				}),
			/requires an inert computation contract/,
		);
		assert.throws(
			() =>
				createCodeWikiOkfV02Frontmatter({
					type: "Concept",
					generated: {by: "codewiki/0.3.0", at: "2026-07-30T12:00:00Z"},
					relationships: [
						{
							type: "related_to",
							target: "anything",
							rationale: "Vague relation.",
						},
					],
				}),
			/invalid or unsupported/,
		);
		assert.throws(
			() =>
				createCodeWikiOkfV02Frontmatter({
					type: "Concept",
					generated: {by: "codewiki/0.3.0", at: "2026-07-30T12:00:00Z"},
					extensions: {timestamp: "legacy"},
				}),
			/cannot replace standard field timestamp/,
		);
	});

	it("accepts a declared v0.2 root while retaining v0.1 bundle compatibility", () => {
		assert.deepEqual(okfV02RootIndexFrontmatter(), {okf_version: "0.2"});
		const result = validateOkfBundle([
			{
				path: "index.md",
				content: '---\nokf_version: "0.2"\n---\n# Knowledge\n',
			},
			{
				path: "concept.md",
				content: "---\ntype: Concept\n---\n# Concept\n",
			},
		]);
		assert.equal(result.version, "0.2");
		assert.deepEqual(result.issues, []);
	});

	it("surfaces malformed optional v0.2 families without executing or rejecting the concept", () => {
		const document = parseOkfDocument(
			"imports/untrusted.md",
			`---\ntype: Attested Computation\nsources: invalid\ngenerated: { by: unknown, at: never }\nverified: { by: bot, at: never }\nstatus: mystery
stale_after: tomorrow
usage_window: { from: tomorrow, to: yesterday }\nruntime: ''\ncodewiki_relationships:\n  - { type: related_to, target: x, rationale: vague }\n---\n# Imported\n`,
		);
		const profile = analyzeOkfV02Document(document);
		assert.equal(profile.attestedComputation.executable, false);
		assert.deepEqual(
			new Set(profile.issues.map((issue) => issue.code)),
			new Set([
				"invalid_sources",
				"invalid_generated",
				"invalid_verified",
				"invalid_status",
				"invalid_stale_after",
				"invalid_usage_window",
				"invalid_attested_computation",
				"invalid_authored_relationship",
			]),
		);
	});
});
