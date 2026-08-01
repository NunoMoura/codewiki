import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	requiredSecurityScannerTypes,
	runSecurityScannerSuite,
} from "../../src/loop-exit/security-scanners.ts";
import {canonicalJsonDigest} from "../../src/utils/canonical-json.ts";

const digest = (character) => `sha256:${character.repeat(64)}`;
const gitObject = (character) => character.repeat(40);
const observedAt = "2026-08-10T12:00:00.000Z";

function subject() {
	return {
		changeRefs: ["change:security-scanner"],
		changeRevisionDigests: [digest("1")],
		candidateDigest: digest("2"),
		acceptanceRequirementIds: [],
		sourceTreeDigest: digest("3"),
	};
}

function cleanObservation(request, overrides = {}) {
	return {
		requestDigest: request.requestDigest,
		runId: `run:${request.scannerType}:1`,
		startedAt: "2026-08-10T11:59:00.000Z",
		completedAt: "2026-08-10T11:59:01.000Z",
		termination: "exited",
		exitCode: 0,
		outcome: "clean",
		coverage: "complete",
		stdoutDigest: digest("4"),
		findings: [],
		limitations: [],
		...overrides,
	};
}

function adapter(scannerType, execute = async (request) => cleanObservation(request)) {
	return {
		scannerType,
		scannerId: `scanner.${scannerType}`,
		scannerVersion: "1.0.0",
		configurationDigest: canonicalJsonDigest({scannerType, configuration: "test"}),
		execute,
	};
}

function advisory(overrides = {}) {
	return {
		scannerType: "dependency_advisory",
		snapshotDigest: digest("5"),
		observedAt: "2026-08-09T12:00:00.000Z",
		validUntil: "2026-08-11T12:00:00.000Z",
		sourceRefs: ["advisory:osv:snapshot:2026-08-09"],
		...overrides,
	};
}

function suiteInput(overrides = {}) {
	return {
		subject: subject(),
		sourceSnapshotDigest: digest("6"),
		sourceTree: gitObject("a"),
		sourceTreeDigest: digest("3"),
		environmentDigest: digest("7"),
		surfaces: ["network_public_api"],
		sourceRefs: ["src/security/api.ts"],
		knowledgeRefs: ["kb:system/security"],
		ownershipRefs: ["kb:system/security#source"],
		observedAt,
		sensitivity: "project",
		adapters: [adapter("static_analysis")],
		advisorySnapshots: [],
		...overrides,
	};
}

function securityFinding() {
	return {
		findingId: "auth-bypass-1",
		content: {
			summary: "Authorization guard can be bypassed",
			observedBehavior: "A protected action reaches its handler without the required guard.",
			desiredBehavior: "Every protected action validates authorization before handler execution.",
			affectedRefs: ["src/security/api.ts"],
			sourceRefs: ["trace:scanner:sast:auth-bypass-1"],
			claimedCategory: "security",
			claimedSeverity: "critical",
			claimedConfidence: "high",
			claimedSecurity: {
				classification: "suspected_vulnerability",
				identifiers: [
					{
						scheme: "cwe",
						value: "CWE-862",
						sourceRef: "trace:scanner:sast:cwe-862",
					},
				],
				cvss: [],
				sarif: [
					{
						version: "2.1.0",
						toolId: "scanner-static-analysis",
						ruleId: "authorization-check",
						resultRef: "trace:scanner:sarif:result:1",
					},
				],
				kev: [],
			},
		},
	};
}

describe("closed security scanner suite", () => {
	it("selects deterministic scanner types from exact security surfaces", () => {
		assert.deepEqual(
			requiredSecurityScannerTypes([
				"persistence_migration",
				"credentials_secrets",
				"dependency_supply_chain",
				"authentication_authorization",
				"infrastructure_configuration",
			]),
			[
				"static_analysis",
				"dependency_advisory",
				"secret_detection",
				"configuration",
				"authorization_test",
				"migration_test",
			],
		);
		assert.deepEqual(requiredSecurityScannerTypes([]), ["static_analysis"]);
	});

	it("materializes complete clean scanner and advisory Evidence", async () => {
		const result = await runSecurityScannerSuite(
			suiteInput({
				surfaces: ["credentials_secrets", "dependency_supply_chain"],
				adapters: [
					adapter("static_analysis"),
					adapter("dependency_advisory"),
					adapter("secret_detection"),
				],
				advisorySnapshots: [advisory()],
			}),
		);
		assert.equal(result.status, "passed");
		assert.deepEqual(result.requiredScannerTypes, [
			"static_analysis",
			"dependency_advisory",
			"secret_detection",
		]);
		assert.equal(result.runs.length, 3);
		assert.equal(result.evidenceRecords.length, 6);
		assert.equal(result.intakeMaterials.length, 0);
		assert.equal(result.findings.length, 0);
		assert.ok(result.evidenceRecords.every((record) => record.authority === "observed"));
		assert.ok(
			result.evidenceRecords.every(
				(record) => record.subject.candidateDigest === digest("2"),
			),
		);
		assert.equal(
			result.evidenceRecords.filter((record) => record.kind === "source_observation")
				.length,
			3,
		);
		assert.ok(
			result.evidenceRecords.some((record) =>
				record.provenanceRefs.includes(`advisory-snapshot:${digest("5")}`),
			),
		);
		const {suiteDigest, ...body} = result;
		assert.equal(suiteDigest, canonicalJsonDigest(body));
	});

	it("fails on findings, preserves observed Evidence, and emits bounded intake", async () => {
		const result = await runSecurityScannerSuite(
			suiteInput({
				adapters: [
					adapter("static_analysis", async (request) =>
						cleanObservation(request, {
							exitCode: 1,
							outcome: "findings",
							findings: [securityFinding()],
						}),
					),
				],
			}),
		);
		assert.equal(result.status, "failed");
		assert.equal(result.runs[0].status, "failed");
		assert.equal(result.runs[0].findingCount, 1);
		assert.equal(result.evidenceRecords.length, 2);
		assert.equal(result.intakeMaterials.length, 1);
		assert.equal(result.intakeMaterials[0].materialType, "security_scanner_finding");
		assert.equal(result.intakeMaterials[0].content.claimedSeverity, "critical");
		assert.equal(result.intakeMaterials[0].content.claimedSecurity.identifiers[0].value, "CWE-862");
		assert.equal("authority" in result.intakeMaterials[0], false);
		assert.ok(result.evidenceRecords.every((record) => record.authority === "observed"));
		assert.ok(result.evidenceRecords.every((record) => record.authority !== "approved"));
	});

	it("returns indeterminate for missing scanners, stale advisory data, and malformed adapters", async () => {
		const missing = await runSecurityScannerSuite(
			suiteInput({
				surfaces: ["credentials_secrets"],
				adapters: [adapter("static_analysis")],
			}),
		);
		assert.equal(missing.status, "indeterminate");
		const unavailable = missing.runs.find(
			(run) => run.scannerType === "secret_detection",
		);
		assert.equal(unavailable.status, "indeterminate");
		const unavailableEvidence = missing.evidenceRecords.find(
			(record) => record.evidenceId === unavailable.evidenceIds[0],
		);
		assert.equal(unavailableEvidence.kind, "command_execution");
		assert.equal(unavailableEvidence.payload.termination, "unavailable");

		const stale = await runSecurityScannerSuite(
			suiteInput({
				surfaces: ["dependency_supply_chain"],
				adapters: [adapter("static_analysis"), adapter("dependency_advisory")],
				advisorySnapshots: [
					advisory({validUntil: "2026-08-10T11:00:00.000Z"}),
				],
			}),
		);
		assert.equal(stale.status, "indeterminate");
		assert.equal(
			stale.runs.find((run) => run.scannerType === "dependency_advisory")
				.staleAdvisory,
			true,
		);

		const missingAdvisory = await runSecurityScannerSuite(
			suiteInput({
				surfaces: ["dependency_supply_chain"],
				adapters: [adapter("static_analysis"), adapter("dependency_advisory")],
				advisorySnapshots: [],
			}),
		);
		assert.equal(missingAdvisory.status, "indeterminate");
		assert.ok(
			missingAdvisory.runs
				.find((run) => run.scannerType === "dependency_advisory")
				.limitations.some((limitation) =>
					/advisory snapshot is unavailable/u.test(limitation),
				),
		);

		const malformed = await runSecurityScannerSuite(
			suiteInput({
				adapters: [
					adapter("static_analysis", async (request) => ({
						...cleanObservation(request),
						rawOutput: "must not cross adapter boundary",
					})),
				],
			}),
		);
		assert.equal(malformed.status, "indeterminate");
		assert.match(malformed.runs[0].limitations[0], /malformed output/);
		assert.equal(malformed.evidenceRecords.length, 1);
		assert.equal(malformed.evidenceRecords[0].payload.termination, "unavailable");
	});

	it("rejects authority-bearing inputs, duplicate adapters, and missing exact bindings", async () => {
		await assert.rejects(
			() =>
				runSecurityScannerSuite(
					suiteInput({
						authority: "approved",
					}),
				),
			/Security scanner suite input received unsupported field authority/,
		);
		await assert.rejects(
			() =>
				runSecurityScannerSuite(
					suiteInput({
						adapters: [adapter("static_analysis"), adapter("static_analysis")],
					}),
				),
			/one adapter per scanner type/,
		);
		await assert.rejects(
			() =>
				runSecurityScannerSuite(
					suiteInput({
						adapters: [
							adapter("static_analysis"),
							{
								...adapter("dependency_advisory"),
								scannerId: "scanner.static_analysis",
							},
						],
					}),
				),
			/requires a distinct scannerId/,
		);
		await assert.rejects(
			() =>
				runSecurityScannerSuite(
					suiteInput({
						subject: {...subject(), sourceTreeDigest: digest("9")},
					}),
				),
			/subject sourceTreeDigest mismatch/,
		);
	});
});
