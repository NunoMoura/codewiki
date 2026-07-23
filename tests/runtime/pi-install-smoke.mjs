import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

function packageJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

const root = mkdtempSync(join(tmpdir(), "codewiki-pi-install-smoke-"));
try {
	const packRoot = join(root, "pack");
	const projectRoot = join(root, "project");
	const installRoot = join(root, "npm-install");
	mkdirSync(packRoot);
	mkdirSync(projectRoot);
	mkdirSync(installRoot);

	const pack = run("npm", ["pack", "--pack-destination", packRoot]);
	const tarball = pack.stdout.trim().split(/\r?\n/).at(-1);
	assert.match(tarball, /^nunomoura-codewiki-.*\.tgz$/);

	run("npm", ["install", "--prefix", installRoot, join(packRoot, tarball)]);
	const packageRoot = join(
		installRoot,
		"node_modules",
		"@nunomoura",
		"codewiki",
	);
	const manifest = packageJson(join(packageRoot, "package.json"));
	assert.equal(manifest.bin, undefined);
	assert.deepEqual(Object.keys(manifest.exports).sort(), [
		".",
		"./coordinator",
		"./package.json",
		"./pi-sdk",
	]);
	assert.deepEqual(manifest.pi, { extensions: ["dist/pi/extension.js"] });

	const env = {
		...process.env,
		PI_CODING_AGENT_DIR: join(root, "agent"),
		PI_CODING_AGENT_SESSION_DIR: join(root, "sessions"),
		PI_OFFLINE: "1",
	};

	const install = run("pi", ["install", packageRoot], {
		cwd: projectRoot,
		env,
	});
	assert.match(install.stdout, /Installed/);
	assert.equal(existsSync(join(projectRoot, ".pi", "settings.json")), false);

	const list = run("pi", ["list"], { cwd: projectRoot, env });
	assert.match(list.stdout, /User packages:/);
	assert.match(list.stdout, /package/);

	const help = run("pi", ["--verbose", "--help"], { cwd: projectRoot, env });
	const helpOutput = `${help.stdout}\n${help.stderr}`;
	assert.match(helpOutput, /pi - AI coding assistant/);
	assert.doesNotMatch(
		helpOutput,
		/failed to load|cannot find module|error loading/i,
	);

	console.log(
		JSON.stringify(
			{
				ok: true,
				packageRoot,
			},
			null,
			2,
		),
	);
} finally {
	rmSync(root, { recursive: true, force: true });
}
