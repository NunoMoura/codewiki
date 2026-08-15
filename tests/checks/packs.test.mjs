import test from "node:test";
import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {
	chmod,
	mkdtemp,
	mkdir,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {
	MAX_PACK_SKILL_FILE_BYTES,
	assertCheckPackSnapshot,
	assertPackSkillSetSnapshot,
	assertPackSkillSnapshot,
	assertUniquePackSkillNames,
	createCheckPack,
	createCheckPackSnapshot,
	createPackSkillSetSnapshot,
	createPackSkillSnapshot,
	createPackagedCheck,
	packagedChecks,
} from "../../src/checks/packs/contracts.ts";
import {
	CheckPackLoadError,
	loadCheckPackSnapshot,
	loadPackSkillSetSnapshot,
	loadProjectPackSkillSnapshots,
	loadProtectedCheckPackSnapshot,
	loadProtectedPackSkillSetSnapshot,
} from "../../src/checks/packs/loader.ts";
import {createGateReport} from "../../src/checks/results.ts";
import {checkDefinition, packagedCheck} from "../helpers/checks.mjs";
import {sha256Digest} from "../../src/utils/canonical-json.ts";

const execFileAsync = promisify(execFile);

test("Pack snapshot binds stage, Pack, Definition, and implementation bytes", () => {
	const check = packagedCheck();
	const pack = createCheckPack({id: "default", checks: [check]});
	const snapshot = createCheckPackSnapshot({stage: "decision", packs: [pack]});
	assert.equal(snapshot.checkCount, 1);
	assert.equal(packagedChecks(snapshot)[0].checkDigest, check.checkDigest);
	assert.doesNotThrow(() => assertCheckPackSnapshot(snapshot, "decision"));
	assert.throws(
		() => assertCheckPackSnapshot({...snapshot, checkCount: 2}, "decision"),
		/checkCount/,
	);
	assert.throws(
		() =>
			createPackagedCheck({
				stage: "decision",
				packId: "default",
				checkId: "other",
				definition: check.definition,
				implementationFileName: "CHECK.mjs",
				implementationContent: "export default () => true;",
			}),
		/does not match directory/,
	);
});

test("Model CHECK.md requires ordered non-empty Requirement, Pass, Fail, and Feedback", () => {
	assert.throws(
		() =>
			createPackagedCheck({
				stage: "review",
				packId: "default",
				checkId: "model-check",
				definition: checkDefinition({
					id: "model-check",
					implementation: {
						kind: "model",
						route: "model-route",
						profile: "review-model",
						maximumTokens: 1024,
					},
				}),
				implementationFileName: "CHECK.md",
				implementationContent: "# Requirement\nOnly one section.\n",
			}),
		/requires exactly one ordered Requirement, Pass, Fail, and Feedback/,
	);
});

test("Pack snapshots bound Pack and Check cardinality", () => {
	assert.throws(
		() =>
			createCheckPackSnapshot({
				stage: "review",
				packs: Array.from({length: 65}, (_, index) =>
					createCheckPack({
						stage: "review",
						id: `pack-${index}`,
						checks: [],
					}),
				),
			}),
		/exceeds 64 Packs/,
	);
	const checks = Array.from({length: 257}, (_, index) =>
		packagedCheck({
			stage: "review",
			packId: "default",
			definition: {id: `check-${index}`},
		}),
	);
	assert.throws(
		() =>
			createCheckPackSnapshot({
				stage: "review",
				packs: [createCheckPack({stage: "review", id: "default", checks})],
			}),
		/exceeds 256 Checks/,
	);
});

test("stage-first loader accepts empty Pack and exact Check directory", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-pack-test-"));
	try {
		await mkdir(join(root, ".codewiki/check-packs/decision/default"), {recursive: true});
		await mkdir(join(root, ".codewiki/check-packs/decision/team/check-one"), {recursive: true});
		await writeFile(
			join(root, ".codewiki/check-packs/decision/team/check-one/check.json"),
			JSON.stringify(checkDefinition()),
		);
		await writeFile(
			join(root, ".codewiki/check-packs/decision/team/check-one/CHECK.mjs"),
			"export default async function check() { return true; }\n",
		);
		const snapshot = await loadCheckPackSnapshot({repoRoot: root, stage: "decision"});
		assert.deepEqual(snapshot.packs.map((pack) => pack.id), ["default", "team"]);
		assert.equal(snapshot.packs[0].checks.length, 0);
		assert.equal(snapshot.checkCount, 1);
	} finally {
		await rm(root, {recursive: true, force: true});
	}
});

test("loader rejects extra files, symlinks, and implementation kind mismatch", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-pack-test-"));
	try {
		const checkRoot = join(root, ".codewiki/check-packs/review/default/check-one");
		await mkdir(checkRoot, {recursive: true});
		await writeFile(join(checkRoot, "check.json"), JSON.stringify(checkDefinition()));
		await writeFile(join(checkRoot, "CHECK.md"), "# Model rubric\n");
		await assert.rejects(
			() => loadCheckPackSnapshot({repoRoot: root, stage: "review"}),
			(error) => error instanceof CheckPackLoadError && error.code === "malformed_check",
		);
		await writeFile(join(checkRoot, "CHECK.mjs"), "export default () => true;\n");
		await assert.rejects(
			() => loadCheckPackSnapshot({repoRoot: root, stage: "review"}),
			/exactly one CHECK/,
		);
	} finally {
		await rm(root, {recursive: true, force: true});
	}
});

test("Pack Skill snapshots bind normalized metadata and complete ordered bytes", () => {
	const files = [
		packSkillFile("scripts/check.sh", "#!/bin/sh\nexit 0\n", true),
		packSkillFile("SKILL.md", packSkillMarkdown("review-guide")),
		packSkillFile("assets/example.bin", Buffer.from([0, 255, 17])),
	];
	const skill = createPackSkillSnapshot({
		stage: "review",
		packId: "team",
		name: "review-guide",
		description: "  Guide review work.  ",
		license: "MIT",
		compatibility: "Requires a POSIX shell.",
		metadata: {owner: "quality"},
		allowedTools: "Read   Bash",
		files,
	});
	assert.equal(skill.description, "Guide review work.");
	assert.equal(skill.allowedTools, "Read Bash");
	assert.deepEqual(skill.files.map((file) => file.path), [
		"SKILL.md",
		"assets/example.bin",
		"scripts/check.sh",
	]);
	assert.doesNotThrow(() => assertPackSkillSnapshot(skill, "review"));
	assert.throws(
		() => assertPackSkillSnapshot({...skill, fileCount: skill.fileCount + 1}),
		/file totals/,
	);

	const set = createPackSkillSetSnapshot({stage: "review", skills: [skill]});
	assert.equal(set.skillCount, 1);
	assert.doesNotThrow(() => assertPackSkillSetSnapshot(set, "review"));
	const duplicate = createPackSkillSetSnapshot({
		stage: "planning",
		skills: [
			createPackSkillSnapshot({
				stage: "planning",
				packId: "other",
				name: "review-guide",
				description: "Guide planning work.",
				files: [packSkillFile("SKILL.md", packSkillMarkdown("review-guide"))],
			}),
		],
	});
	assert.throws(
		() => assertUniquePackSkillNames([set, duplicate]),
		/not project-unique/,
	);
});

test("Skill loading stays separate from Check identity and admits full Skill trees", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-pack-skill-test-"));
	try {
		const checkRoot = join(
			root,
			".codewiki/check-packs/decision/team/check-one",
		);
		await mkdir(checkRoot, {recursive: true});
		await writeFile(join(checkRoot, "check.json"), JSON.stringify(checkDefinition()));
		await writeFile(
			join(checkRoot, "CHECK.mjs"),
			"export default async function check() { return true; }\n",
		);
		const skillRoot = await writePackSkill(root, {
			stage: "decision",
			packId: "team",
			name: "decision-guide",
		});
		const checksBefore = await loadCheckPackSnapshot({
			repoRoot: root,
			stage: "decision",
		});
		const skillsBefore = await loadPackSkillSetSnapshot({
			repoRoot: root,
			stage: "decision",
		});
		assert.equal(checksBefore.checkCount, 1);
		assert.equal(skillsBefore.skillCount, 1);
		assert.equal(skillsBefore.skills[0].metadata.owner, "quality");
		assert.equal(skillsBefore.skills[0].allowedTools, "Read Bash");
		assert.equal(
			skillsBefore.skills[0].files.find(
				(file) => file.path === "scripts/setup.sh",
			).executable,
			true,
		);
		assert.deepEqual(
			Buffer.from(
				skillsBefore.skills[0].files.find(
					(file) => file.path === "assets/example.bin",
				).contentBase64,
				"base64",
			),
			Buffer.from([0, 255, 17]),
		);

		await writeFile(
			join(skillRoot, "references/REFERENCE.md"),
			"# Changed guidance\n",
		);
		const checksAfter = await loadCheckPackSnapshot({
			repoRoot: root,
			stage: "decision",
		});
		const skillsAfter = await loadPackSkillSetSnapshot({
			repoRoot: root,
			stage: "decision",
		});
		assert.equal(checksAfter.checkPackDigest, checksBefore.checkPackDigest);
		assert.notEqual(skillsAfter.skillSetDigest, skillsBefore.skillSetDigest);
	} finally {
		await rm(root, {recursive: true, force: true});
	}
});

test("Skill loader rejects project name collisions, symbolic links, and oversized resources", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-pack-skill-invalid-"));
	try {
		const decisionSkill = await writePackSkill(root, {
			stage: "decision",
			packId: "decision-pack",
			name: "shared-guide",
		});
		await writePackSkill(root, {
			stage: "review",
			packId: "review-pack",
			name: "shared-guide",
		});
		await assert.rejects(
			() => loadProjectPackSkillSnapshots({repoRoot: root}),
			(error) =>
				error instanceof CheckPackLoadError &&
				error.code === "malformed_skill" &&
				error.message.includes("project-unique"),
		);

		const secondSkill = await writePackSkill(root, {
			stage: "decision",
			packId: "decision-pack",
			name: "second-guide",
		});
		await assert.rejects(
			() => loadPackSkillSetSnapshot({repoRoot: root, stage: "decision"}),
			/exactly one Skill directory/,
		);
		await rm(secondSkill, {recursive: true, force: true});
		await writeFile(
			join(decisionSkill, "SKILL.md"),
			packSkillMarkdown("wrong-parent-name"),
		);
		await assert.rejects(
			() => loadPackSkillSetSnapshot({repoRoot: root, stage: "decision"}),
			/must match parent directory/,
		);
		await writeFile(
			join(decisionSkill, "SKILL.md"),
			packSkillMarkdown("shared-guide"),
		);
		await writeFile(join(root, "outside.txt"), "outside\n");
		const link = join(decisionSkill, "references/link.txt");
		await symlink(join(root, "outside.txt"), link);
		await assert.rejects(
			() => loadPackSkillSetSnapshot({repoRoot: root, stage: "decision"}),
			(error) => error instanceof CheckPackLoadError && error.code === "unsafe_path",
		);
		await rm(link);
		await writeFile(
			join(decisionSkill, "assets/too-large.bin"),
			Buffer.alloc(MAX_PACK_SKILL_FILE_BYTES + 1),
		);
		await assert.rejects(
			() => loadPackSkillSetSnapshot({repoRoot: root, stage: "decision"}),
			(error) =>
				error instanceof CheckPackLoadError && error.code === "limit_exceeded",
		);
		const checks = await loadCheckPackSnapshot({
			repoRoot: root,
			stage: "decision",
		});
		assert.equal(checks.checkCount, 0);
		assert.deepEqual(checks.packs.map((pack) => pack.id), ["decision-pack"]);
	} finally {
		await rm(root, {recursive: true, force: true});
	}
});

test("protected Skill loading preserves binary bytes and executable modes without affecting Checks", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-pack-skill-git-"));
	try {
		const skillRoot = await writePackSkill(root, {
			stage: "implementation",
			packId: "skill-only",
			name: "implementation-guide",
		});
		await git(root, ["init", "-q"]);
		await git(root, ["config", "user.name", "CodeWiki Tests"]);
		await git(root, ["config", "user.email", "tests@codewiki.invalid"]);
		await git(root, ["add", ".codewiki"]);
		await git(root, ["commit", "-qm", "fixture"]);
		const {stdout} = await git(root, ["rev-parse", "HEAD"]);
		const protectedSourceHead = stdout.trim();
		const checks = await loadProtectedCheckPackSnapshot({
			repoRoot: root,
			protectedSourceHead,
			stage: "implementation",
		});
		const skills = await loadProtectedPackSkillSetSnapshot({
			repoRoot: root,
			protectedSourceHead,
			stage: "implementation",
		});
		assert.deepEqual(checks.packs.map((pack) => pack.id), ["skill-only"]);
		assert.equal(checks.checkCount, 0);
		const report = createGateReport({
			snapshot: checks,
			subjectDigest: sha256Digest("subject"),
			results: [],
			executions: [],
		});
		assert.equal(report.status, "passed");
		assert.equal(report.selectedCheckCount, 0);
		assert.deepEqual(
			report.warnings.map((warning) => warning.code),
			["empty_pack", "no_checks_configured"],
		);
		assert.equal(skills.skillCount, 1);
		const snapshot = skills.skills[0];
		assert.equal(snapshot.name, "implementation-guide");
		assert.equal(
			snapshot.files.find((file) => file.path === "scripts/setup.sh").executable,
			true,
		);
		assert.deepEqual(
			Buffer.from(
				snapshot.files.find((file) => file.path === "assets/example.bin")
					.contentBase64,
				"base64",
			),
			await import("node:fs/promises").then(({readFile}) =>
				readFile(join(skillRoot, "assets/example.bin")),
			),
		);
	} finally {
		await rm(root, {recursive: true, force: true});
	}
});

function packSkillFile(path, content, executable = false) {
	const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
	return Object.freeze({
		path,
		executable,
		byteLength: bytes.byteLength,
		digest: sha256Digest(bytes),
		contentBase64: bytes.toString("base64"),
	});
}

function packSkillMarkdown(name) {
	return `---\nname: ${name}\ndescription: Guide stage work and explain when to use this Skill.\nlicense: MIT\ncompatibility: Requires a POSIX shell.\nmetadata:\n  owner: quality\nallowed-tools: Read Bash\n---\n\n# Instructions\n\nFollow project guidance.\n`;
}

async function writePackSkill(root, {stage, packId, name}) {
	const skillRoot = join(
		root,
		`.codewiki/check-packs/${stage}/${packId}/skill/${name}`,
	);
	await mkdir(join(skillRoot, "scripts"), {recursive: true});
	await mkdir(join(skillRoot, "references"), {recursive: true});
	await mkdir(join(skillRoot, "assets"), {recursive: true});
	await writeFile(join(skillRoot, "SKILL.md"), packSkillMarkdown(name));
	await writeFile(
		join(skillRoot, "scripts/setup.sh"),
		"#!/bin/sh\nprintf '%s\\n' ready\n",
	);
	await chmod(join(skillRoot, "scripts/setup.sh"), 0o755);
	await writeFile(
		join(skillRoot, "references/REFERENCE.md"),
		"# Reference\n",
	);
	await writeFile(join(skillRoot, "assets/example.bin"), Buffer.from([0, 255, 17]));
	return skillRoot;
}

function git(root, args) {
	return execFileAsync("git", args, {cwd: root, encoding: "utf8"});
}
