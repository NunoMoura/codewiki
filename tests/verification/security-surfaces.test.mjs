import assert from "node:assert/strict";
import test from "node:test";
import {
	SECURITY_SURFACE_CLASSIFIER,
	assertSecuritySurfaceClassification,
	classifySecuritySurfaces,
} from "../../src/verification/security-surfaces.ts";
import {canonicalJsonDigest} from "../../src/utils/canonical-json.ts";

const REVISION_DIGEST = canonicalJsonDigest({change: "security-surfaces"});

function classifierInput(overrides = {}) {
	return {
		changeId: "CHG-security-surfaces",
		revision: 3,
		revisionDigest: REVISION_DIGEST,
		kind: "improve",
		type: "architecture_change",
		scope: "system",
		risk: "medium",
		affectedLayers: [],
		targetRefs: [],
		knowledgeRefs: [],
		sourceRefs: [],
		signals: [],
		...overrides,
	};
}

test("security-surface classifier deterministically combines structured and semantic facts", () => {
	const input = classifierInput({
		type: "dependency_change",
		affectedLayers: ["API", "database"],
		targetRefs: ["package-lock.json"],
		signals: [
			{ref: "revision.safety.0", value: "Authorization invariants protect personal data."},
			{ref: "revision.intent.0", value: "Parse untrusted YAML without command execution."},
		],
	});
	const first = classifySecuritySurfaces(input);
	const second = classifySecuritySurfaces({
		...input,
		affectedLayers: [...input.affectedLayers].reverse(),
		targetRefs: [...input.targetRefs].reverse(),
		signals: [...input.signals].reverse(),
	});

	assert.deepEqual(first, second);
	assert.equal(first.classifierId, SECURITY_SURFACE_CLASSIFIER.id);
	assert.deepEqual(first.surfaces, [
		"authentication_authorization",
		"command_process_execution",
		"dependency_supply_chain",
		"network_public_api",
		"parsing_deserialization",
		"persistence_migration",
		"sensitive_data_privacy",
	]);
	assert.equal(first.coverage.knowledge, "refs_only");
	assert.doesNotThrow(() => assertSecuritySurfaceClassification(first));
});

test("security-surface classifier records unresolved generic security signals without inventing a surface", () => {
	const classification = classifySecuritySurfaces(
		classifierInput({type: "security_change"}),
	);
	assert.deepEqual(classification.surfaces, []);
	assert.deepEqual(classification.unresolvedSignals, [
		"security_change_without_specific_surface",
	]);
});

test("security-surface classifier does not treat ordinary source-file refs as filesystem authority", () => {
	const classification = classifySecuritySurfaces(
		classifierInput({
			targetRefs: ["src/runtime/service.ts"],
			signals: [
				{ref: "revision.intent.0", value: "Simplify service naming and documentation."},
			],
		}),
	);
	assert.deepEqual(classification.surfaces, []);
});

test("security-surface classifier rejects tampered classification bytes", () => {
	const classification = classifySecuritySurfaces(
		classifierInput({kind: "migrate"}),
	);
	assert.throws(
		() =>
			assertSecuritySurfaceClassification({
				...classification,
				surfaces: [],
			}),
		/Security-surface classification digest mismatch/,
	);
});
