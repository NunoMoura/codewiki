#!/usr/bin/env node
import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadProject } from "../../src/application/project.ts";
import { executeCodewikiAudit } from "../../src/application/tools/audit.ts";

function writeJson(path, value) {
	writeFileSync(path, JSON.stringify(value, null, 2));
}

function write(path, content = "") {
	writeFileSync(path, content);
}

function mkdir(path) {
	mkdirSync(path, { recursive: true });
}

function assertIssue(report, kind) {
	assert.ok(report.issues.some((issue) => issue.kind === kind), `expected ${kind}, got ${report.issues.map((issue) => issue.kind).join(", ")}`);
}

function assertNoIssue(report, kind) {
	assert.ok(!report.issues.some((issue) => issue.kind === kind), `unexpected ${kind}: ${report.issues.map((issue) => `${issue.kind}:${issue.message}`).join(" | ")}`);
}

function createThinkCodeStylePackageFixture({ includeSkillsInFiles = true } = {}) {
	const root = mkdtempSync(resolve(tmpdir(), "codewiki-package-neutral-"));
	mkdir(resolve(root, ".codewiki"));
	mkdir(resolve(root, "src"));
	mkdir(resolve(root, "scripts"));
	mkdir(resolve(root, "skills", "think-code", "references"));
	writeJson(resolve(root, ".codewiki", "config.json"), { project_name: "package-neutral-fixture" });
	write(resolve(root, "src", "index.ts"), "export const extension = true;\n");
	write(resolve(root, "scripts", "check-architecture.mjs"), "console.log('ok');\n");
	write(resolve(root, "skills", "think-code", "SKILL.md"), "---\nname: think-code\ndescription: Fixture skill for package-neutral audit tests.\n---\n# Think Code\n");
	write(resolve(root, "skills", "think-code", "references", "usage.md"), "# Usage\n");
	write(resolve(root, "README.md"), "# Think Code Fixture\n");
	write(resolve(root, "LICENSE"), "MIT\n");
	writeJson(resolve(root, "package-lock.json"), {
		name: "think-code-audit-fixture",
		version: "0.0.0",
		lockfileVersion: 3,
		packages: { "": { name: "think-code-audit-fixture", version: "0.0.0" } },
	});
	writeJson(resolve(root, "package.json"), {
		name: "think-code-audit-fixture",
		version: "0.0.0",
		type: "module",
		files: ["src", ...(includeSkillsInFiles ? ["skills"] : []), "scripts", "README.md", "LICENSE", "package.json"],
		pi: { extensions: ["./src/index.ts"], skills: ["./skills"] },
		scripts: { "check:architecture": "node ./scripts/check-architecture.mjs" },
	});
	return root;
}

function createFixture() {
	const root = mkdtempSync(resolve(tmpdir(), "codewiki-audit-drift-"));
	mkdir(resolve(root, ".codewiki", "kb", "system"));
	mkdir(resolve(root, ".codewiki", "roadmap", "tasks", "TASK-001"));
	mkdir(resolve(root, "src", "core"));
	mkdir(resolve(root, "src", "domain", "bad"));
	mkdir(resolve(root, "src", "application", "bad"));
	mkdir(resolve(root, "src"));
	mkdir(resolve(root, "scripts"));
	mkdir(resolve(root, "skills", "codewiki"));
	writeJson(resolve(root, ".codewiki", "config.json"), { project_name: "audit-drift-fixture" });
	write(resolve(root, ".codewiki", "kb", "system", "overview.md"), "---\nid: spec.system.overview\ntitle: Overview\nstate: active\nsummary: Fixture\nowners: [tests]\nupdated: \"2026-05-16\"\n---\n\n# Overview\n");
	const task = {
		id: "TASK-001",
		title: "Canonical task",
		status: "todo",
		priority: "high",
		kind: "testing",
		summary: "Canonical task summary",
		spec_paths: [],
		code_paths: [],
	};
	writeJson(resolve(root, ".codewiki", "roadmap", "queue.json"), { version: 1, order: ["TASK-001"], tasks: { "TASK-001": task } });
	writeJson(resolve(root, ".codewiki", "roadmap", "tasks", "TASK-001", "task.json"), { ...task, title: "Stale generated task" });
	writeJson(resolve(root, ".codewiki", "roadmap", "tasks", "TASK-001", "context.json"), { version: 1, task: { ...task, summary: "Stale context summary" } });
	writeJson(resolve(root, ".codewiki", "index_graph.json"), { version: 1, generated_at: new Date().toISOString(), lenses: { status: { health: { errors: 0, warnings: 0 } } }, views: { decision_propagation: { version: 1, residual_count: 1, residuals: [{ decision_build: ".codewiki/builds/decision/file-structure.json", kind: "row", id: "FS-HUMAN-DRIVEN-SURFACE", gaps: ["row:FS-HUMAN-DRIVEN-SURFACE:missing_resolution"] }] } } });
	write(resolve(root, "README.md"), "This stale fixture still points at extensions/codewiki/src. It also says .codewiki/ stores package source and generated task views are canonical truth.\n");
	write(resolve(root, "src", "index.ts"), "export const ok = true;\n");
	write(resolve(root, "src", "core", "bad.ts"), "export const bad = true;\n");
	write(resolve(root, "src", "domain", "bad", "imports-application.ts"), "import { bad } from '../../application/bad/imports-adapter.ts';\nexport const domainBad = bad;\n");
	write(resolve(root, "src", "application", "bad", "imports-adapter.ts"), "import { adapterBad } from '../../adapters/pi/nope.ts';\nexport const bad = adapterBad;\n");
	write(resolve(root, "scripts", "check-architecture.mjs"), "import { executeCodewikiAudit } from '../src/application/tools/audit.ts';\nvoid executeCodewikiAudit;\n");
	write(resolve(root, "scripts", "rogue.mjs"), "const checks = ['audit'];\nconsole.log('.codewiki/roadmap/queue.json', checks);\n");
	write(resolve(root, "skills", "codewiki", "SKILL.md"), "---\nname: codewiki\ndescription: fixture\n---\n# Skill\n");
	writeJson(resolve(root, "package.json"), {
		name: "audit-drift-fixture",
		version: "0.0.0",
		type: "module",
		files: ["src", "skills", "scripts", "README.md", "package.json", "missing-path"],
		pi: { extensions: ["./src/missing.ts"], skills: ["./skills"] },
		scripts: { "check:architecture": "node ./scripts/check-architecture.mjs" },
	});
	return root;
}

async function main() {
	const root = createFixture();
	try {
		const project = await loadProject(root);
		const alignment = await executeCodewikiAudit(project, { profiles: ["alignment"], include_fingerprints: false });
		assert.equal(alignment.status, "fail");
		assertIssue(alignment, "decision-propagation-unmapped");

		const fileStructure = await executeCodewikiAudit(project, { profiles: ["file-structure"], include_fingerprints: false });
		assert.equal(fileStructure.status, "fail");
		assertIssue(fileStructure, "transitional-layer-no-new-files");
		assertIssue(fileStructure, "domain-is-pure");
		assertIssue(fileStructure, "application-is-agent-agnostic");
		assertIssue(fileStructure, "script-owned-product-logic");

		const staleReference = await executeCodewikiAudit(project, { profiles: ["stale-reference"], include_fingerprints: false });
		assert.equal(staleReference.status, "fail");
		assertIssue(staleReference, "stale-reference");
		assertIssue(staleReference, "dogfood-as-package-source");
		assertIssue(staleReference, "generated-task-view-as-truth");

		const generatedParity = await executeCodewikiAudit(project, { profiles: ["generated-parity"], include_fingerprints: false });
		assert.equal(generatedParity.status, "fail");
		assertIssue(generatedParity, "roadmap-task-view-mismatch");
		assertIssue(generatedParity, "roadmap-task-context-mismatch");

		const packageAudit = await executeCodewikiAudit(project, { profiles: ["package"], include_fingerprints: false });
		assert.equal(packageAudit.status, "fail");
		assertIssue(packageAudit, "package-files-unreachable");
		assertIssue(packageAudit, "pi-extension-unreachable");
		assertIssue(packageAudit, "missing-lockfile");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}

	const neutralRoot = createThinkCodeStylePackageFixture();
	try {
		const neutralProject = await loadProject(neutralRoot);
		const neutralAudit = await executeCodewikiAudit(neutralProject, { profiles: ["package"], include_fingerprints: true });
		assert.equal(neutralAudit.status, "pass", `package-neutral fixture should pass: ${neutralAudit.issues.map((issue) => `${issue.kind}:${issue.message}`).join(" | ")}`);
		assertNoIssue(neutralAudit, "skill-asset-unreachable");
		assertNoIssue(neutralAudit, "package-dry-run-missing");
		assert.ok(neutralAudit.fingerprints.some((item) => item.path === "skills/think-code/SKILL.md"), "package audit should fingerprint discovered skill manifest");
		assert.ok(neutralAudit.fingerprints.some((item) => item.path === "skills/think-code/references/usage.md"), "package audit should fingerprint discovered skill asset files");
		assert.ok(!neutralAudit.issues.some((issue) => `${issue.path ?? ""} ${issue.message}`.includes("skills/codewiki")), "package audit must not require CodeWiki skill paths for other packages");
	} finally {
		rmSync(neutralRoot, { recursive: true, force: true });
	}

	const omittedSkillRoot = createThinkCodeStylePackageFixture({ includeSkillsInFiles: false });
	try {
		const omittedProject = await loadProject(omittedSkillRoot);
		const omittedAudit = await executeCodewikiAudit(omittedProject, { profiles: ["package"], include_fingerprints: false });
		assert.ok(omittedAudit.issues.some((issue) => issue.kind === "package-dry-run-missing" && issue.message.includes("skills/think-code/SKILL.md")), "package audit should require discovered package skill assets in npm pack output");
	} finally {
		rmSync(omittedSkillRoot, { recursive: true, force: true });
	}
}

main().then(() => console.log("✓ audit drift fixture passed"));
