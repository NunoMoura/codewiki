#!/usr/bin/env node
import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { executeCodewikiAudit } from "../../src/audit/tool.ts";
import { loadProject } from "../../src/project/context.ts";

function mkdir(path) {
	mkdirSync(path, { recursive: true });
}

function write(path, content = "") {
	writeFileSync(path, content);
}

function writeJson(path, value) {
	write(path, JSON.stringify(value, null, 2));
}

function createBaseFixture(name) {
	const root = mkdtempSync(resolve(tmpdir(), name));
	mkdir(resolve(root, ".codewiki", "kb", "system"));
	mkdir(resolve(root, ".codewiki", "roadmap"));
	mkdir(resolve(root, "src"));
	writeJson(resolve(root, ".codewiki", "config.json"), { project_name: name });
	writeJson(resolve(root, ".codewiki", "roadmap", "queue.json"), {
		version: 1,
		order: [],
		tasks: {},
		sprints: {},
	});
	writeJson(resolve(root, ".codewiki", "index_graph.json"), {
		version: 1,
		lenses: { status: { health: { errors: 0, warnings: 0 } } },
	});
	return root;
}

function issueKinds(report) {
	return report.issues.map((issue) => issue.kind).sort();
}

function assertIssue(report, kind) {
	assert.ok(
		report.issues.some((issue) => issue.kind === kind),
		`expected ${kind}, got ${issueKinds(report).join(", ")}`,
	);
}

async function runHorizontal(root) {
	const project = await loadProject(root);
	return executeCodewikiAudit(project, {
		profiles: ["horizontal-alignment"],
		include_fingerprints: false,
	});
}

async function main() {
	const passRoot = createBaseFixture("codewiki-horizontal-pass-");
	try {
		write(
			resolve(passRoot, "src", "util.ts"),
			"export const name = 'codewiki_roadmap';\n",
		);
		write(
			resolve(passRoot, "src", "index.ts"),
			"import { name } from './util.ts';\nexport const toolName = name;\n",
		);
		write(
			resolve(passRoot, ".codewiki", "kb", "system", "roadmap.md"),
			`---
id: spec.system.roadmap
title: Roadmap
state: active
summary: Fixture
owners: [tests]
updated: "2026-05-29"
code_paths:
  - src/index.ts
horizontal_claims:
  - id: roadmap.tool.name
    value: codewiki_roadmap
    refs:
      - src/index.ts
---

# Roadmap
`,
		);
		const report = await runHorizontal(passRoot);
		assert.equal(
			report.status,
			"pass",
			report.issues
				.map((issue) => `${issue.kind}:${issue.message}`)
				.join(" | "),
		);
		assert.equal(report.profile_results[0].profile, "horizontal-alignment");
		assert.ok(report.profile_results[0].details.kb_kb.claims >= 1);
		assert.ok(report.profile_results[0].details.kb_code.explicit_refs >= 1);
		assert.ok(
			report.profile_results[0].details.code_code.relative_imports >= 1,
		);
	} finally {
		rmSync(passRoot, { recursive: true, force: true });
	}

	const failRoot = createBaseFixture("codewiki-horizontal-fail-");
	try {
		write(
			resolve(failRoot, "src", "index.ts"),
			"import { missing } from './missing.ts';\nexport const value = missing;\n",
		);
		write(
			resolve(failRoot, ".codewiki", "kb", "system", "a.md"),
			`---
id: spec.system.a
title: A
state: active
summary: Fixture A
owners: [tests]
updated: "2026-05-29"
code_paths:
  - src/missing-doc-ref.ts
horizontal_claims:
  - id: shared.claim
    value: alpha
    refs:
      - src/index.ts
---

# A
`,
		);
		write(
			resolve(failRoot, ".codewiki", "kb", "system", "b.md"),
			`---
id: spec.system.b
title: B
state: active
summary: Fixture B
owners: [tests]
updated: "2026-05-29"
horizontal_claims:
  - id: shared.claim
    value: beta
    refs:
      - src/index.ts
---

# B
`,
		);
		write(
			resolve(failRoot, ".codewiki", "kb", "system", "c.md"),
			`---
id: spec.system.c
title: C
state: active
summary: Fixture C
owners: [tests]
updated: "2026-05-29"
horizontal_claims:
  - id: duplicate.claim
    value: same
    refs:
      - src/index.ts
---

# C
`,
		);
		write(
			resolve(failRoot, ".codewiki", "kb", "system", "d.md"),
			`---
id: spec.system.d
title: D
state: active
summary: Fixture D
owners: [tests]
updated: "2026-05-29"
horizontal_claims:
  - id: duplicate.claim
    value: same
    refs:
      - src/index.ts
---

# D
`,
		);
		const report = await runHorizontal(failRoot);
		assert.equal(report.status, "fail");
		assertIssue(report, "kb-claim-conflict");
		assertIssue(report, "kb-claim-duplicate");
		assertIssue(report, "kb-code-missing-source-ref");
		assertIssue(report, "code-import-target-missing");
	} finally {
		rmSync(failRoot, { recursive: true, force: true });
	}
}

main().then(() => console.log("✓ horizontal alignment audit smoke passed"));
