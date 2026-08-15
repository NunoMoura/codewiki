import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		...options,
	});
	assert.equal(
		result.status,
		0,
		`${command} ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
	);
	return result;
}

const root = mkdtempSync(join(tmpdir(), "codewiki-pi-sdk-package-"));
try {
	const pack = run("npm", ["pack", "--pack-destination", root]);
	const tarball = pack.stdout.trim().split(/\r?\n/).at(-1);
	assert.match(tarball, /^nunomoura-codewiki-.*\.tgz$/);
	const installRoot = join(root, "install");
	run("npm", [
		"install",
		"--prefix",
		installRoot,
		"--no-audit",
		"--no-fund",
		join(root, tarball),
		"@earendil-works/pi-coding-agent@0.81.1",
	]);

	const smokeScript = join(installRoot, "pi-sdk-smoke.mjs");
	writeFileSync(
		smokeScript,
		`import assert from "node:assert/strict";
import {
  createPiModelCheckTransport,
  createPiSdkNativeDecisionCandidateProducer,
  createPiSdkRuntimeSemanticAdapters,
} from "@nunomoura/codewiki/pi-sdk";

assert.equal(typeof createPiModelCheckTransport, "function");
assert.equal(typeof createPiSdkNativeDecisionCandidateProducer, "function");
let sdkOptions;
const adapters = createPiSdkRuntimeSemanticAdapters({
  repoRoot: process.cwd(),
  createAgentSession: async (options) => {
    sdkOptions = options;
    return {
      session: {
        sessionId: "pi-sdk:packed-smoke",
        async prompt() {
          await sdkOptions.customTools[0].execute(
            "candidate-call",
            {
              candidate: {
                disposition: "approve",
                rationale: "Packed Pi SDK smoke candidate.",
              },
            },
            undefined,
            undefined,
            {},
          );
        },
        dispose() {},
      },
      extensionsResult: { extensions: [], errors: [], runtime: undefined },
    };
  },
});

const candidate = await adapters.decision({
  loop: "decision",
  observedWorkStateDigest: "sha256:work-state",
  change: {
    id: "CHG-packed-sdk",
    traceId: "TRACE-CHG-packed-sdk",
    revision: 1,
    digest: "sha256:change",
  },
});
assert.deepEqual(candidate, {
  disposition: "approve",
  rationale: "Packed Pi SDK smoke candidate.",
});
assert.deepEqual(sdkOptions.tools, [
  "read",
  "grep",
  "find",
  "ls",
  "codewiki_submit_decision_candidate",
]);
assert.equal(sdkOptions.customTools.length, 1);
`,
	);
	run(process.execPath, [smokeScript], { cwd: installRoot });
} finally {
	rmSync(root, { recursive: true, force: true });
}
