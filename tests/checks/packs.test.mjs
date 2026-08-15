import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
	assertCheckPackSnapshot,
	createCheckPack,
	createCheckPackSnapshot,
	createPackagedCheck,
	packagedChecks,
} from "../../src/checks/packs/contracts.ts";
import {
	CheckPackLoadError,
	loadCheckPackSnapshot,
} from "../../src/checks/packs/loader.ts";
import {checkDefinition, packagedCheck} from "../helpers/checks.mjs";

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
