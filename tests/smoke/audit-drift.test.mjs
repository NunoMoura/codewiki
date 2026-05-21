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
	writeJson(resolve(root, ".codewiki", "index_graph.json"), { version: 1, generated_at: new Date().toISOString(), lenses: { status: { health: { errors: 0, warnings: 0 } } } });
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
}

main().then(() => console.log("✓ audit drift fixture passed"));
