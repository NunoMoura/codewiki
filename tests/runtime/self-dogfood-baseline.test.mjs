import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	parseSelfDogfoodBaselineManifest,
	SELF_DOGFOOD_BASELINE_SCHEMA,
	verifySelfDogfoodBaselineArtifact,
} from "../../src/project/self-dogfood-baseline.ts";

function baselineManifest(packageBytes = Buffer.from("baseline package")) {
	const tree = "b".repeat(40);
	return {
		schemaVersion: SELF_DOGFOOD_BASELINE_SCHEMA,
		createdAt: "2026-07-10T12:00:00.000Z",
		source: {
			commit: "a".repeat(40),
			tree,
			contentProof: `git-tree:${tree}`,
		},
		package: {
			name: "codewiki",
			version: "0.3.0",
			file: "codewiki-0.3.0.tgz",
			bytes: packageBytes.length,
			sha256: createHash("sha256").update(packageBytes).digest("hex"),
		},
		approval: {
			reviewRef: "review:baseline-0.3.0",
			approvedBy: "release-reviewer",
			approvedAt: "2026-07-10T12:00:00.000Z",
		},
		gates: { audit: "passed", lab: "passed", pipeline: "passed" },
	};
}

describe("self-dogfood baseline manifest", () => {
	it("accepts a reviewed immutable package pin", () => {
		const manifest = parseSelfDogfoodBaselineManifest(baselineManifest());
		assert.equal(manifest.source.contentProof, `git-tree:${"b".repeat(40)}`);
		assert.equal(manifest.gates.audit, "passed");
	});

	it("rejects unknown keys and mismatched content proof", () => {
		assert.throws(
			() =>
				parseSelfDogfoodBaselineManifest({
					...baselineManifest(),
					candidateMayPromoteItself: true,
				}),
			/Unknown baseline key: baseline\.candidateMayPromoteItself/,
		);
		const mismatched = baselineManifest();
		mismatched.source.contentProof = `git-tree:${"c".repeat(40)}`;
		assert.throws(
			() => parseSelfDogfoodBaselineManifest(mismatched),
			/baseline\.source\.contentProof must equal/,
		);
	});

	it("rejects package paths outside the manifest directory", () => {
		const manifest = baselineManifest();
		manifest.package.file = "../codewiki.tgz";
		assert.throws(
			() => parseSelfDogfoodBaselineManifest(manifest),
			/local \.tgz filename/,
		);
	});

	it("verifies package bytes and rejects tampering", async () => {
		const root = mkdtempSync(join(tmpdir(), "codewiki-baseline-test-"));
		try {
			const packageBytes = Buffer.from("reviewed baseline package");
			const manifest = baselineManifest(packageBytes);
			const manifestPath = join(root, "baseline.json");
			const packagePath = join(root, manifest.package.file);
			writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
			writeFileSync(packagePath, packageBytes);

			const verified = await verifySelfDogfoodBaselineArtifact(manifestPath);
			assert.equal(verified.packagePath, packagePath);
			assert.equal(verified.manifest.package.sha256, manifest.package.sha256);

			writeFileSync(packagePath, Buffer.from("tampered baseline package"));
			await assert.rejects(
				() => verifySelfDogfoodBaselineArtifact(manifestPath),
				/Baseline package (byte|SHA-256) mismatch/,
			);
			assert.equal(readFileSync(manifestPath, "utf8").endsWith("\n"), true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
