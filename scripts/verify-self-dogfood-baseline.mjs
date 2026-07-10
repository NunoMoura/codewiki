import { spawnSync } from "node:child_process";
import { verifySelfDogfoodBaselineArtifact } from "../src/project/self-dogfood-baseline.ts";

function manifestOption() {
	const index = process.argv.indexOf("--manifest");
	const value =
		index >= 0
			? process.argv[index + 1]
			: process.env.CODEWIKI_BASELINE_MANIFEST;
	if (!value) {
		throw new Error(
			"Pass --manifest or set CODEWIKI_BASELINE_MANIFEST to a pinned baseline manifest.",
		);
	}
	return value;
}

function git(args) {
	const result = spawnSync("git", args, {
		cwd: process.cwd(),
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0) {
		throw new Error(
			`git ${args.join(" ")} failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
		);
	}
	return result.stdout.trim();
}

if (process.argv.includes("--require-clean")) {
	const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
	if (status !== "") {
		throw new Error(
			"Self-dogfood readiness requires a clean candidate checkout.",
		);
	}
}

const verified = await verifySelfDogfoodBaselineArtifact(manifestOption());
git(["cat-file", "-e", `${verified.manifest.source.commit}^{commit}`]);
const tree = git(["rev-parse", `${verified.manifest.source.commit}^{tree}`]);
if (tree !== verified.manifest.source.tree) {
	throw new Error(
		`Baseline Git tree mismatch: expected ${verified.manifest.source.tree}, got ${tree}.`,
	);
}

console.log(
	JSON.stringify(
		{
			ok: true,
			manifestPath: verified.manifestPath,
			packagePath: verified.packagePath,
			commit: verified.manifest.source.commit,
			tree,
			sha256: verified.manifest.package.sha256,
			reviewRef: verified.manifest.approval.reviewRef,
		},
		null,
		2,
	),
);
