import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
	parseSelfDogfoodBaselineManifest,
	SELF_DOGFOOD_BASELINE_SCHEMA,
} from "../src/project/self-dogfood-baseline.ts";

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: process.cwd(),
		encoding: "utf8",
		stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
	});
	if (result.status !== 0) {
		const detail = options.capture
			? `\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
			: "";
		throw new Error(`${command} ${args.join(" ")} failed.${detail}`);
	}
	return options.capture ? result.stdout.trim() : "";
}

function option(name) {
	const index = process.argv.indexOf(name);
	if (index < 0 || !process.argv[index + 1]) {
		throw new Error(`Missing required option ${name}.`);
	}
	return process.argv[index + 1];
}

function assertCleanCheckout() {
	const status = run(
		"git",
		["status", "--porcelain=v1", "--untracked-files=all"],
		{ capture: true },
	);
	if (status !== "") {
		throw new Error(
			"Self-dogfood baseline requires a clean checkout. Commit or remove every tracked and untracked change first.",
		);
	}
}

const reviewRef = option("--review-ref");
const approvedBy = option("--approved-by");
const approvedAt = process.argv.includes("--approved-at")
	? option("--approved-at")
	: new Date().toISOString();

assertCleanCheckout();
const commit = run("git", ["rev-parse", "HEAD"], { capture: true });
const tree = run("git", ["rev-parse", "HEAD^{tree}"], { capture: true });
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const outputDir = resolve(
	process.argv.includes("--output-dir")
		? option("--output-dir")
		: `.pi/npm/codewiki-baselines/${commit}`,
);

run("npm", ["run", "audit:codewiki"]);
run("npm", ["run", "lab:gate"]);
run("npm", ["run", "lab:pipeline", "--", "--gate"]);
assertCleanCheckout();

mkdirSync(outputDir, { recursive: true });
const temporaryPackDir = resolve(outputDir, ".pack");
rmSync(temporaryPackDir, { recursive: true, force: true });
mkdirSync(temporaryPackDir, { recursive: true });
const packOutput = run(
	"npm",
	["pack", "--json", "--pack-destination", temporaryPackDir],
	{ capture: true },
);
const packEntries = JSON.parse(packOutput);
if (!Array.isArray(packEntries) || packEntries.length !== 1) {
	throw new Error("npm pack did not return exactly one package artifact.");
}
const filename = packEntries[0]?.filename;
if (typeof filename !== "string" || !filename.endsWith(".tgz")) {
	throw new Error("npm pack returned an invalid package filename.");
}
const temporaryPackagePath = resolve(temporaryPackDir, filename);
const packagePath = resolve(outputDir, filename);
renameSync(temporaryPackagePath, packagePath);
rmSync(temporaryPackDir, { recursive: true, force: true });

const packageBytes = readFileSync(packagePath);
const manifest = parseSelfDogfoodBaselineManifest({
	schemaVersion: SELF_DOGFOOD_BASELINE_SCHEMA,
	createdAt: new Date().toISOString(),
	source: {
		commit,
		tree,
		contentProof: `git-tree:${tree}`,
	},
	package: {
		name: "@nunomoura/codewiki",
		version,
		file: filename,
		bytes: statSync(packagePath).size,
		sha256: createHash("sha256").update(packageBytes).digest("hex"),
	},
	approval: { reviewRef, approvedBy, approvedAt },
	gates: { audit: "passed", lab: "passed", pipeline: "passed" },
});
const manifestPath = resolve(outputDir, "baseline.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`, {
	mode: 0o600,
});

console.log(
	JSON.stringify(
		{
			ok: true,
			manifestPath,
			packagePath,
			commit,
			tree,
			sha256: manifest.package.sha256,
		},
		null,
		2,
	),
);
