import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
	calibrateSecurityRoutes,
	loadSecurityCalibrationBundle,
} from "../../lab/runner/security-calibration.ts";

const roots = [];
const scannerTypes = [
	"static_analysis",
	"dependency_advisory",
	"secret_detection",
	"infrastructure_configuration",
	"authorization_test",
	"migration_test",
];

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe("sealed security scanner/evaluator route calibration", () => {
	it("loads only off-repo bundles by default and binds exact protocols", () => {
		const loaded = loadSecurityCalibrationBundle({ filePath: writeBundle(bundle()) });

		assert.match(loaded.bundleDigest, /^sha256:[0-9a-f]{64}$/);
		assert.equal(loaded.suites[0].cases.length, 18);

		const repoFile = `.tmp-security-calibration-${process.pid}.json`;
		writeFileSync(repoFile, JSON.stringify(bundle()));
		try {
			assert.throws(
				() => loadSecurityCalibrationBundle({ filePath: repoFile }),
				/outside the repository/,
			);
		} finally {
			rmSync(repoFile, { force: true });
		}
	});

	it("reports false pass/failure, escaped critical, indeterminate, latency, and cost per route", () => {
		const loaded = loadSecurityCalibrationBundle({ filePath: writeBundle(bundle()) });
		const report = calibrateSecurityRoutes(loaded);

		assert.equal(report.status, "pass");
		assert.equal(report.routes.length, 2);
		assert.deepEqual(
			report.routes.map((route) => ({
				id: route.routeId,
				score: route.score,
				falsePasses: route.falsePasses,
				falseFailures: route.falseFailures,
				escapedCriticalDefects: route.escapedCriticalDefects,
				indeterminate: route.indeterminate,
				p95LatencyMs: route.p95LatencyMs,
				totalCostUsd: route.totalCostUsd,
			})),
			[
				{
					id: "focused",
					score: 100,
					falsePasses: 0,
					falseFailures: 0,
					escapedCriticalDefects: 0,
					indeterminate: 6,
					p95LatencyMs: 28,
					totalCostUsd: 0.018,
				},
				{
					id: "deterministic-shard",
					score: 100,
					falsePasses: 0,
					falseFailures: 0,
					escapedCriticalDefects: 0,
					indeterminate: 6,
					p95LatencyMs: 12,
					totalCostUsd: 0.009,
				},
			],
		);
	});

	it("measures false failures and blocks false passes or escaped critical defects", () => {
		const value = bundle();
		const critical = value.suites[0].cases.find(
			(testCase) => testCase.severity === "critical",
		);
		critical.observations.find((item) => item.routeId === "focused").observed =
			"pass";
		const passing = value.suites[0].cases.find(
			(testCase) => testCase.expected === "pass",
		);
		passing.observations.find((item) => item.routeId === "focused").observed =
			"fail";
		const report = calibrateSecurityRoutes(
			loadSecurityCalibrationBundle({ filePath: writeBundle(value) }),
		);
		const focused = report.routes.find((route) => route.routeId === "focused");

		assert.equal(report.status, "fail");
		assert.equal(focused.falsePasses, 1);
		assert.equal(focused.falseFailures, 1);
		assert.equal(focused.escapedCriticalDefects, 1);
		assert.match(focused.blockers.join("\n"), /escaped critical defect/);
	});

	it("rejects incomplete route matrices, scanner-family coverage, and protocol drift", () => {
		const missingRoute = bundle();
		missingRoute.suites[0].cases[0].observations.pop();
		assert.throws(
			() => loadSecurityCalibrationBundle({ filePath: writeBundle(missingRoute) }),
			/exactly one observation for every route/,
		);

		const missingFamily = bundle();
		missingFamily.suites[0].cases = missingFamily.suites[0].cases.filter(
			(testCase) => testCase.scannerType !== "migration_test",
		);
		assert.throws(
			() => loadSecurityCalibrationBundle({ filePath: writeBundle(missingFamily) }),
			/passing migration_test control/,
		);

		const drifted = bundle();
		drifted.scannerSuiteProtocol = "codewiki.security-scanner-suite@2.0.0";
		assert.throws(
			() => loadSecurityCalibrationBundle({ filePath: writeBundle(drifted) }),
			/scannerSuiteProtocol must be codewiki.security-scanner-suite@3.0.0/,
		);
	});
});

function bundle() {
	return {
		protocol: "codewiki.security-route-calibration",
		protocolVersion: "1.0.0",
		scannerSuiteProtocol: "codewiki.security-scanner-suite@3.0.0",
		atomicEvaluatorProtocol:
			"codewiki.atomic-security-scanner-check@2.0.0",
		routes: [
			{
				id: "focused",
				description: "One exact scanner/evaluator route per family.",
				evaluatorIdentity: "atomic-security-evaluator/focused@1",
				configurationDigest: digest("focused-evaluator-config"),
			},
			{
				id: "deterministic-shard",
				description: "Bounded deterministic family shards.",
				evaluatorIdentity: "atomic-security-evaluator/shard@1",
				configurationDigest: digest("shard-evaluator-config"),
			},
		],
		suites: [
			{
				id: "private-security-routes",
				description: "Human-labeled controls and defect traps.",
				cases: scannerTypes.flatMap((scannerType, familyIndex) => [
					calibrationCase(scannerType, "pass", "none", familyIndex * 3),
					calibrationCase(
						scannerType,
						"fail",
						familyIndex === 0 ? "critical" : "high",
						familyIndex * 3 + 1,
					),
					calibrationCase(
						scannerType,
						"indeterminate",
						"none",
						familyIndex * 3 + 2,
					),
				]),
			},
		],
	};
}

function calibrationCase(scannerType, expected, severity, index) {
	return {
		id: `${scannerType}-${expected}`,
		scannerType,
		expected,
		severity,
		...(expected === "fail" ? { failureClass: `${scannerType}_defect` } : {}),
		sourceSnapshotDigest: digest(`${scannerType}-${expected}-source`),
		observations: [
			observation("focused", expected, 11 + index, 0.001, scannerType),
			observation(
				"deterministic-shard",
				expected,
				4 + Math.floor(index / 2),
				0.0005,
				scannerType,
			),
		],
	};
}

function observation(routeId, observed, latencyMs, costUsd, scannerType) {
	return {
		routeId,
		observed,
		scannerIdentity: `${scannerType}/sealed-profile@1`,
		scannerRequestDigest: digest(`${routeId}-${scannerType}-request`),
		environmentDigest: digest(`${routeId}-environment`),
		configurationDigest: digest(`${scannerType}-configuration`),
		artifactDigest: digest(`${routeId}-${scannerType}-${observed}`),
		latencyMs,
		costUsd,
		evidenceRefs: [`sealed:${routeId}:${scannerType}:${observed}`],
		limitations: [],
	};
}

function digest(value) {
	return `sha256:${Buffer.from(value).toString("hex").padEnd(64, "0").slice(0, 64)}`;
}

function writeBundle(value) {
	const root = mkdtempSync(join(tmpdir(), "codewiki-security-calibration-"));
	roots.push(root);
	const filePath = join(root, `bundle-${roots.length}.json`);
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
	return filePath;
}
