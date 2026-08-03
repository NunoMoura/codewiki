import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {createCheckCatalog} from "../../src/loop-exit/catalog.ts";
import {
	VERIFICATION_CAPABILITY_MATRIX_PROTOCOL,
	buildVerificationCapabilityMatrix,
} from "../../src/loop-exit/verification-capabilities.ts";
import {canonicalJsonDigest} from "../../src/utils/canonical-json.ts";

describe("verification capability matrix", () => {
	it("projects every exact catalog Check and Loop into deterministic capability truth", () => {
		const catalog = createCheckCatalog();
		const matrix = buildVerificationCapabilityMatrix(catalog);
		assert.deepEqual(
			{...matrix.protocol},
			VERIFICATION_CAPABILITY_MATRIX_PROTOCOL,
		);
		assert.equal(matrix.checkCatalogVersion, catalog.version);
		assert.equal(matrix.checkCatalogDigest, catalog.digest);
		const expectedCount = ["decision", "planning", "implementation"].reduce(
			(count, loop) => count + catalog.list(loop).length,
			0,
		);
		assert.equal(matrix.capabilities.length, expectedCount);
		assert.equal(matrix.summary.checkCount, expectedCount);
		assert.equal(
			matrix.summary.nativeCount +
				matrix.summary.hostRequiredCount +
				matrix.summary.capabilityRequiredCount,
			expectedCount,
		);
		assert.equal(matrix.summary.standardAdapterCount, 9);
		assert.equal(matrix.summary.implementedStandardAdapterCount, 9);
		assert.deepEqual(
			buildVerificationCapabilityMatrix(catalog),
			matrix,
		);
		const {matrixDigest, ...matrixBody} = matrix;
		assert.equal(matrixDigest, canonicalJsonDigest(matrixBody));
		for (const capability of matrix.capabilities) {
			const {capabilityDigest, ...capabilityBody} = capability;
			assert.equal(capabilityDigest, canonicalJsonDigest(capabilityBody));
			assert.ok(
				catalog.get(capability.checkId, capability.loop),
				`missing ${capability.loop}:${capability.checkId}`,
			);
			assert.equal(
				capability.formats.every((format) => format.grantsResult === false),
				true,
			);
		}
	});

	it("distinguishes native reduction, host evidence, model, and measured capability gaps", () => {
		const matrix = buildVerificationCapabilityMatrix();
		const native = capability(matrix, "decision", "change_revision_ready");
		assert.equal(native.status, "native");
		assert.deepEqual(native.evidenceObligations, []);
		assert.deepEqual(native.formats, []);
		assert.deepEqual(native.gaps, []);

		const scanner = capability(
			matrix,
			"implementation",
			"security_scanners_valid",
		);
		assert.equal(scanner.status, "host_required");
		assert.deepEqual(
			scanner.evidenceObligations.map((entry) => entry.id),
			["scanner-command-execution", "scanner-source-observation"],
		);
		assert.equal(format(scanner, "codewiki_evidence_material").status, "native_admission");
		assert.equal(
			format(scanner, "codewiki_evidence_material").authorityCeiling,
			"observed",
		);
		assert.equal(format(scanner, "sarif_2_1_0").status, "implemented");
		assert.equal(format(scanner, "cyclonedx").status, "implemented");
		assert.equal(format(scanner, "spdx").status, "implemented");
		assert.equal(format(scanner, "pact").status, "implemented");
		assert.equal(format(scanner, "openapi").status, "implemented");
		assert.ok(scanner.gaps.includes("exact_evidence_collection_required"));

		const language = capability(
			matrix,
			"implementation",
			"typescript_verified",
		);
		assert.equal(language.status, "host_required");
		assert.equal(format(language, "junit_xml").status, "implemented");
		assert.equal(format(language, "lcov").status, "implemented");
		assert.equal(format(language, "cobertura_xml").status, "implemented");
		const providerReceipt = format(language, "provider_check_receipt");
		assert.equal(providerReceipt.status, "implemented");
		assert.deepEqual(providerReceipt.evidenceKinds, ["command_execution"]);
		assert.equal(providerReceipt.authorityCeiling, "verified");
		assert.equal(providerReceipt.grantsResult, false);

		const contentProof = capability(
			matrix,
			"implementation",
			"content_proof_recorded",
		);
		assert.equal(
			contentProof.formats.some(
				(entry) => entry.format === "provider_check_receipt",
			),
			false,
		);

		const assessed = capability(
			matrix,
			"decision",
			"research_claims_supported",
		);
		assert.equal(assessed.status, "host_required");
		assert.ok(assessed.gaps.includes("independent_model_executor_required"));
		assert.ok(assessed.gaps.includes("trusted_model_producer_required"));
	});
});

function capability(matrix, loop, checkId) {
	const result = matrix.capabilities.find(
		(entry) => entry.loop === loop && entry.checkId === checkId,
	);
	assert.ok(result, `missing ${loop}:${checkId}`);
	return result;
}

function format(capabilityEntry, name) {
	const result = capabilityEntry.formats.find((entry) => entry.format === name);
	assert.ok(result, `missing ${name} for ${capabilityEntry.checkId}`);
	return result;
}
