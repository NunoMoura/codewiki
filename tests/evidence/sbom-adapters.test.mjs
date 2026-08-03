import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	CYCLONEDX_EVIDENCE_ADAPTER_PROTOCOL,
	ingestCycloneDx17JsonEvidence,
} from "../../src/evidence/adapters/cyclonedx.ts";
import {
	SPDX_EVIDENCE_ADAPTER_PROTOCOL,
	ingestSpdx23JsonEvidence,
} from "../../src/evidence/adapters/spdx.ts";
import {materializeEvidenceRecord} from "../../src/evidence/materialize.ts";

const sourceSnapshotDigest = digest("1");
const scopeDigest = digest("2");
const candidateDigest = digest("3");
const revisionDigest = digest("4");
const sourceTreeDigest = digest("5");

const execution = Object.freeze({
	adapterId: "codewiki.sbom.collector",
	adapterVersion: "1.0.0",
	requestDigest: digest("6"),
	invocationDigest: digest("7"),
	environmentDigest: digest("8"),
	configurationDigest: digest("9"),
	termination: "exited",
	exitCode: 0,
	durationMs: 42,
});

function input(document, overrides = {}) {
	return {
		artifact: {
			bytes: JSON.stringify(document),
			ref: "sbom-artifact:reports/current.json",
		},
		sourceSnapshotDigest,
		scopeDigest,
		sourcePaths: ["package.json", "src/index.ts"],
		requiredIdentityDigests: [],
		ownershipRefs: ["owner:platform"],
		tool: {name: "fixture-sbom", version: "1.0.0"},
		execution,
		provenanceRefs: ["sbom-run:fixture/current"],
		...overrides,
	};
}

function cyclonedx(overrides = {}) {
	return {
		bomFormat: "CycloneDX",
		specVersion: "1.7",
		serialNumber: "urn:uuid:00000000-0000-0000-0000-000000000001",
		version: 1,
		metadata: {
			component: {
				type: "application",
				name: "private-application",
				version: "1.0.0",
				"bom-ref": "root",
			},
		},
		components: [
			{
				type: "library",
				name: "private-library-a",
				version: "2.0.0",
				purl: "pkg:npm/private-a@2.0.0",
				"bom-ref": "a",
				licenses: [{license: {id: "MIT"}}],
				components: [
					{
						type: "library",
						name: "private-library-b",
						version: "3.0.0",
						"bom-ref": "b",
					},
				],
			},
		],
		services: [{name: "private-service", version: "1", "bom-ref": "svc"}],
		dependencies: [
			{ref: "root", dependsOn: ["a", "svc"]},
			{ref: "a", dependsOn: ["b"]},
		],
		vulnerabilities: [
			{id: "CVE-2099-0001", source: {name: "NVD"}, affects: [{ref: "a"}]},
		],
		compositions: [{aggregate: "complete", assemblies: ["root"]}],
		...overrides,
	};
}

function spdx(overrides = {}) {
	return {
		spdxVersion: "SPDX-2.3",
		dataLicense: "CC0-1.0",
		SPDXID: "SPDXRef-DOCUMENT",
		name: "private-project-sbom",
		documentNamespace: "https://example.invalid/spdx/private-project/1",
		creationInfo: {
			created: "2026-08-06T10:00:00Z",
			creators: ["Tool: fixture-sbom-1.0"],
		},
		packages: [
			{
				SPDXID: "SPDXRef-Package-A",
				name: "private-package-a",
				versionInfo: "1.0.0",
				downloadLocation: "NOASSERTION",
				filesAnalyzed: false,
				licenseConcluded: "NOASSERTION",
				externalRefs: [
					{
						referenceCategory: "PACKAGE-MANAGER",
						referenceType: "purl",
						referenceLocator: "pkg:npm/private-a@1.0.0",
					},
				],
			},
		],
		files: [
			{
				SPDXID: "SPDXRef-File-A",
				fileName: "./src/private.ts",
				checksums: [{algorithm: "SHA256", checksumValue: "a".repeat(64)}],
			},
		],
		snippets: [
			{
				SPDXID: "SPDXRef-Snippet-A",
				name: "private-snippet",
				snippetFromFile: "SPDXRef-File-A",
				ranges: [
					{
						startPointer: {reference: "SPDXRef-File-A", offset: 0},
						endPointer: {reference: "SPDXRef-File-A", offset: 12},
					},
				],
			},
		],
		documentDescribes: ["SPDXRef-Package-A"],
		relationships: [
			{
				spdxElementId: "SPDXRef-DOCUMENT",
				relationshipType: "DESCRIBES",
				relatedSpdxElement: "SPDXRef-Package-A",
			},
			{
				spdxElementId: "SPDXRef-Package-A",
				relationshipType: "CONTAINS",
				relatedSpdxElement: "SPDXRef-File-A",
			},
		],
		...overrides,
	};
}

function runtime(coverage) {
	return {
		subject: {
			changeRefs: ["TRACE-CHG-sbom-adapters"],
			changeRevisionDigests: [revisionDigest],
			candidateDigest,
			acceptanceRequirementIds: [],
			sourceTreeDigest,
		},
		observedAt: "2026-08-06T10:01:00.000Z",
		producer: {kind: "external_service", id: "sbom-collector", version: "1.0.0"},
		authority: "observed",
		coverage,
		sensitivity: "project",
	};
}

describe("CycloneDX and SPDX Evidence adapters", () => {
	it("normalizes exact SBOM inventories without exposing private package identity", () => {
		const cyclone = ingestCycloneDx17JsonEvidence(input(cyclonedx()));
		const spdxResult = ingestSpdx23JsonEvidence(input(spdx()));

		assert.deepEqual({...cyclone.protocol}, CYCLONEDX_EVIDENCE_ADAPTER_PROTOCOL);
		assert.equal(cyclone.coverage, "complete");
		assert.equal(cyclone.grantsResult, false);
		assert.equal(cyclone.authorityCeiling, "observed");
		assert.equal(cyclone.summary.profile, "CycloneDX 1.7 JSON");
		assert.equal(cyclone.summary.componentCount, 3);
		assert.equal(cyclone.summary.serviceCount, 1);
		assert.equal(cyclone.summary.dependencyRelationshipCount, 3);
		assert.equal(cyclone.summary.vulnerabilityCount, 1);
		assert.equal(cyclone.summary.licenseEntryCount, 1);

		assert.deepEqual({...spdxResult.protocol}, SPDX_EVIDENCE_ADAPTER_PROTOCOL);
		assert.equal(spdxResult.coverage, "complete");
		assert.equal(spdxResult.summary.profile, "SPDX 2.3 JSON");
		assert.equal(spdxResult.summary.packageCount, 1);
		assert.equal(spdxResult.summary.fileCount, 1);
		assert.equal(spdxResult.summary.snippetCount, 1);
		assert.equal(spdxResult.summary.relationshipCount, 2);
		assert.equal(spdxResult.summary.packageWithoutFileAnalysisCount, 1);
		assert.equal(spdxResult.summary.noAssertionLicenseCount, 1);
		assert.equal(
			ingestCycloneDx17JsonEvidence(input(cyclonedx())).receiptDigest,
			cyclone.receiptDigest,
		);
		assert.equal(
			ingestSpdx23JsonEvidence(input(spdx())).receiptDigest,
			spdxResult.receiptDigest,
		);

		for (const result of [cyclone, spdxResult]) {
			assert.equal(result.commandExecution.kind, "command_execution");
			assert.equal(result.sourceObservation.kind, "source_observation");
			assert.equal(
				materializeEvidenceRecord(
					result.sourceObservation,
					runtime(result.coverage),
				).coverage,
				"complete",
			);
			const serialized = JSON.stringify(result);
			assert.equal(serialized.includes("private-library"), false);
			assert.equal(serialized.includes("private-package"), false);
			assert.equal(serialized.includes("private-project"), false);
			assert.equal("result" in result, false);
			assert.equal("verdict" in result, false);
		}
	});

	it("preserves missing, incomplete, external, truncated, and unavailable inventory", () => {
		const missing = ingestCycloneDx17JsonEvidence(
			input(cyclonedx(), {requiredIdentityDigests: [digest("f")]}),
		);
		assert.equal(missing.coverage, "partial");
		assert.equal(missing.summary.missingRequiredIdentityCount, 1);

		const incomplete = ingestCycloneDx17JsonEvidence(
			input(
				cyclonedx({
					dependencies: [{ref: "root", dependsOn: ["missing"]}],
					compositions: [{aggregate: "incomplete"}],
				}),
			),
		);
		assert.equal(incomplete.coverage, "partial");
		assert.equal(incomplete.summary.unresolvedReferenceCount, 1);
		assert.equal(incomplete.summary.declaredIncompleteCompositionCount, 1);

		const external = ingestSpdx23JsonEvidence(
			input(
				spdx({
					externalDocumentRefs: [
						{
							externalDocumentId: "DocumentRef-upstream",
							spdxDocument: "https://example.invalid/upstream",
							checksum: {algorithm: "SHA256", checksumValue: "b".repeat(64)},
						},
					],
				}),
			),
		);
		assert.equal(external.coverage, "partial");
		assert.equal(external.summary.externalDocumentReferenceCount, 1);

		const manyComponents = [...Array(8_193).keys()].map((index) => ({
			type: "library",
			name: `component-${index}`,
			"bom-ref": `component-${index}`,
		}));
		const truncated = ingestCycloneDx17JsonEvidence(
			input(cyclonedx({metadata: undefined, components: manyComponents})),
		);
		assert.equal(truncated.coverage, "partial");
		assert.equal(truncated.summary.componentCount, 8_192);
		assert.equal(truncated.summary.omittedComponentCount, 1);

		const unavailableExecution = {
			adapterId: execution.adapterId,
			adapterVersion: execution.adapterVersion,
			requestDigest: execution.requestDigest,
			invocationDigest: execution.invocationDigest,
			environmentDigest: execution.environmentDigest,
			configurationDigest: execution.configurationDigest,
			termination: "unavailable",
			durationMs: execution.durationMs,
		};
		const unavailable = ingestSpdx23JsonEvidence(
			input(spdx(), {execution: unavailableExecution}),
		);
		assert.equal(unavailable.coverage, "unknown");
	});

	it("rejects authority, malformed JSON, duplicate keys, unsafe context, and wrong profiles", () => {
		assert.throws(
			() => ingestCycloneDx17JsonEvidence({...input(cyclonedx()), authority: "observed"}),
			/CycloneDX ingestion received unsupported field authority/,
		);
		assert.throws(
			() => ingestSpdx23JsonEvidence(input(spdx(), {sourcePaths: ["../secret"]})),
			/SPDX sourcePaths\[0\] is unsafe/,
		);
		assert.throws(
			() =>
				ingestSpdx23JsonEvidence(
					input(spdx(), {sourcePaths: ["src/a.ts", "./src/a.ts"]}),
				),
			/sourcePaths must not contain duplicates/,
		);
		assert.throws(
			() => ingestCycloneDx17JsonEvidence(input(cyclonedx({specVersion: "1.6"}))),
			/specVersion must be 1.7/,
		);
		assert.throws(
			() => ingestSpdx23JsonEvidence(input(spdx({spdxVersion: "SPDX-3.0"}))),
			/spdxVersion must be SPDX-2.3/,
		);
		const duplicate = JSON.stringify(cyclonedx()).replace(
			'"bomFormat":"CycloneDX"',
			'"bomFormat":"CycloneDX","bomFormat":"CycloneDX"',
		);
		assert.throws(
			() =>
				ingestCycloneDx17JsonEvidence(
					input(cyclonedx(), {artifact: {bytes: duplicate, ref: "sbom-artifact:duplicate"}}),
				),
			/malformed or duplicate-key syntax/,
		);
		assert.throws(
			() =>
				ingestSpdx23JsonEvidence(
					input(spdx(), {
						artifact: {bytes: new Uint8Array([0xff]), ref: "sbom-artifact:utf8"},
					}),
				),
			/must be valid UTF-8/,
		);
		assert.throws(
			() =>
				ingestCycloneDx17JsonEvidence(
					input(cyclonedx(), {
						artifact: {bytes: "x".repeat(4 * 1024 * 1024 + 1), ref: "sbom-artifact:large"},
					}),
				),
			/must contain 1..4194304 UTF-8 bytes/,
		);
	});
});

function digest(character) {
	return `sha256:${character.repeat(64)}`;
}
