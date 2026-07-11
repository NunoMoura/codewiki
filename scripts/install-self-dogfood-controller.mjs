import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseSelfDogfoodControllerPin } from "../src/project/self-dogfood-controller.ts";

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? process.cwd(),
		encoding: "utf8",
		stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} failed.\nSTDOUT:\n${result.stdout ?? ""}\nSTDERR:\n${result.stderr ?? ""}`,
		);
	}
	return typeof result.stdout === "string" ? result.stdout.trim() : "";
}

function assertCleanCheckout() {
	const status = run("git", [
		"status",
		"--porcelain=v1",
		"--untracked-files=all",
	]);
	if (status !== "") {
		throw new Error(
			"Controller installation requires a clean candidate checkout.",
		);
	}
}

const pinPath = resolve(process.argv[2] ?? ".pi/codewiki-controller.json");
const pin = parseSelfDogfoodControllerPin(
	JSON.parse(readFileSync(pinPath, "utf8")),
);
assertCleanCheckout();
run("git", ["cat-file", "-e", `${pin.source.commit}^{commit}`]);
const tree = run("git", ["rev-parse", `${pin.source.commit}^{tree}`]);
assert.equal(tree, pin.source.tree, "Pinned controller Git tree mismatch.");
const taggedCommit = run("git", ["rev-list", "-n", "1", pin.tag]);
assert.equal(
	taggedCommit,
	pin.source.commit,
	"Pinned controller tag mismatch.",
);

const temporaryRoot = mkdtempSync(
	join(tmpdir(), "codewiki-controller-install-"),
);
const worktreeRoot = join(temporaryRoot, "worktree");
const packRoot = join(temporaryRoot, "pack");
let worktreeCreated = false;
try {
	run("git", ["worktree", "add", "--detach", worktreeRoot, pin.source.commit]);
	worktreeCreated = true;
	run("npm", ["ci", "--ignore-scripts"], { cwd: worktreeRoot, inherit: true });
	mkdirSync(packRoot, { recursive: true });
	run("npm", ["pack", "--pack-destination", packRoot], {
		cwd: worktreeRoot,
		inherit: true,
	});
	const artifacts = readdirSync(packRoot).filter((name) =>
		name.endsWith(".tgz"),
	);
	assert.deepEqual(artifacts, [pin.package.file]);
	const rebuiltPackagePath = join(packRoot, pin.package.file);
	const packageBytes = readFileSync(rebuiltPackagePath);
	assert.equal(statSync(rebuiltPackagePath).size, pin.package.bytes);
	assert.equal(
		createHash("sha256").update(packageBytes).digest("hex"),
		pin.package.sha256,
		"Rebuilt controller package SHA-256 mismatch.",
	);

	const npmRoot = resolve(".pi/npm");
	const controllerRoot = join(
		npmRoot,
		"codewiki-controller",
		pin.package.sha256,
	);
	mkdirSync(controllerRoot, { recursive: true });
	const pinnedPackagePath = join(controllerRoot, pin.package.file);
	copyFileSync(rebuiltPackagePath, pinnedPackagePath);
	run(
		"npm",
		[
			"install",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			"--save-exact",
			"--prefix",
			npmRoot,
			pinnedPackagePath,
		],
		{ inherit: true },
	);
	const installedPackagePath = join(npmRoot, "node_modules", "codewiki");
	const installedPackage = JSON.parse(
		readFileSync(join(installedPackagePath, "package.json"), "utf8"),
	);
	assert.equal(installedPackage.name, pin.package.name);
	assert.equal(installedPackage.version, pin.package.version);
	const receiptPath = join(controllerRoot, "receipt.json");
	writeFileSync(
		receiptPath,
		`${JSON.stringify(
			{
				schemaVersion: "codewiki.self-dogfood-controller-receipt.v1",
				installedAt: new Date().toISOString(),
				pinPath,
				commit: pin.source.commit,
				tree: pin.source.tree,
				packageSha256: pin.package.sha256,
				installedPackagePath,
			},
			null,
			"\t",
		)}\n`,
		{ mode: 0o600 },
	);
	console.log(
		JSON.stringify(
			{
				ok: true,
				pinPath,
				commit: pin.source.commit,
				tree: pin.source.tree,
				packageSha256: pin.package.sha256,
				installedPackagePath,
				receiptPath,
			},
			null,
			2,
		),
	);
} finally {
	if (worktreeCreated) {
		spawnSync("git", ["worktree", "remove", "--force", worktreeRoot], {
			cwd: process.cwd(),
			stdio: "ignore",
		});
	}
	rmSync(temporaryRoot, { recursive: true, force: true });
}
assertCleanCheckout();
