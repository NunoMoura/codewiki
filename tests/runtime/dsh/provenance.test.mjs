import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {describe, it} from "node:test";
import {fileURLToPath} from "node:url";

import {
	createDshRuntimeProvenance,
	DSH_PACKAGE_NAMES,
	DSH_REVIEWED_SOURCE,
	readDshRuntimeProvenance,
} from "../../../src/runtime/dsh/provenance.ts";
import {createRuntimeBuildManifest} from "../../../src/runtime/contracts.ts";
import {sha256Digest} from "../../../src/utils/canonical-json.ts";

const packageLockPath = fileURLToPath(
	new URL("../../../package-lock.json", import.meta.url),
);

describe("DSH Runtime Build provenance", () => {
	it("binds every exact rc.6 package integrity without claiming source equivalence", () => {
		const provenance = readDshRuntimeProvenance(packageLockPath);

		assert.equal(provenance.reviewedSource, DSH_REVIEWED_SOURCE);
		assert.equal(provenance.packageSourceRelationship, "unattested");
		assert.equal(provenance.packageSourceAttestation, null);
		assert.equal(provenance.dshPackages.length, DSH_PACKAGE_NAMES.length);
		assert.deepEqual(
			provenance.dshPackages.map(({name, version}) => ({name, version})),
			DSH_PACKAGE_NAMES.map((name) => ({name, version: "0.1.0-rc.6"})),
		);
		assert.equal(provenance.cordisPackage.version, "4.0.1");
		assert.deepEqual(
			provenance.cordisTransitivePackages.map(({name}) => name),
			["@deepseek-ai/cosmokit", "@standard-schema/spec"],
		);
		assert.ok(
			provenance.dshTransitivePackages.some(
				({name}) => name === "@deepseek-ai/schemastery",
			),
		);
		assert.ok(
			provenance.dshTransitivePackages.some(({name}) => name === "koffi"),
		);
		assert.ok(
			provenance.dshTransitivePackages.some(({name}) => name === "zod"),
		);
		assert.match(provenance.dshPackageClosureDigest, /^sha256:[0-9a-f]{64}$/);
		assert.match(provenance.cordisClosureDigest, /^sha256:[0-9a-f]{64}$/);

		const manifest = createRuntimeBuildManifest({
			schemaVersion: "1.0.0",
			runProtocolVersion: "1.0.0",
			nodeVersion: process.version.slice(1),
			dshSourceCommit: provenance.reviewedSource.commit,
			dshPackageClosureDigest: provenance.dshPackageClosureDigest,
			cordisClosureDigest: provenance.cordisClosureDigest,
			runtimePluginClosureDigest: digest("runtime-plugins"),
			modelAdapterClosureDigest: digest("replay-model-adapter"),
			delegateAdapterClosureDigest: digest("no-delegates"),
			runtimeArtifactDigest: digest("runtime-artifact"),
		});
		assert.equal(manifest.dshSourceCommit, DSH_REVIEWED_SOURCE.commit);
	});

	it("fails closed when npm resolves any DSH package past the exact pin", async () => {
		const lock = JSON.parse(await readFile(packageLockPath, "utf8"));
		lock.packages["node_modules/@deepseek-ai/dsh-agent-loop"].version =
			"0.1.0-rc.7";

		assert.match(
			captureError(() => createDshRuntimeProvenance(lock)).message,
			/@deepseek-ai\/dsh-agent-loop must be pinned to 0\.1\.0-rc\.6/,
		);
	});

	it("fails closed when package integrity is absent", async () => {
		const lock = JSON.parse(await readFile(packageLockPath, "utf8"));
		delete lock.packages["node_modules/@deepseek-ai/dsh-session"].integrity;

		assert.match(
			captureError(() => createDshRuntimeProvenance(lock)).message,
			/@deepseek-ai\/dsh-session must have sha512 package integrity/,
		);
	});
});

function digest(value) {
	return sha256Digest(value);
}

function captureError(action) {
	try {
		action();
	} catch (error) {
		if (error instanceof Error) return error;
		return new Error(String(error));
	}
	throw new Error("Expected action to fail.");
}
