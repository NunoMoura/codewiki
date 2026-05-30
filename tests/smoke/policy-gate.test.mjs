import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { evaluateProductionPolicyProfile } from "../../src/policy/production-profile.ts";
import { buildGatewayPreflight } from "../../src/gateway/report.ts";

function baseBuild(overrides = {}) {
	return {
		kind: "implementation_build",
		status: "accepted",
		task_id: "TASK-123",
		change_type: "code",
		traceability: {
			exemption: "mechanical",
			semantic: false,
			requires_accepted_build: false,
		},
		code_files: ["src/example.ts"],
		test_files: ["tests/example.test.mjs"],
		checks_run: [
			"npm run typecheck: pass",
			"npm run test:smoke: pass",
			"pi-lens review: 0 blockers, 2 warnings",
		],
		audit_refs: ["alignment", "changed"],
		acceptance_mapping: [
			{ criterion: "policy evidence exists", evidence: "checks passed" },
		],
		closure_brief: {
			user_intent: "policy test",
			implemented_changes: ["changed example"],
			acceptance_evidence: ["policy evidence exists"],
			checks: ["npm run typecheck", "npm run test:smoke"],
		},
		...overrides,
	};
}

const isolation = {
	fresh_context: true,
	clean: false,
	working_tree_digest: "sha256-dirty",
};

const passing = evaluateProductionPolicyProfile({
	profile: "implementation",
	policyProfile: "production",
	build: baseBuild(),
	isolation,
});
assert.equal(
	passing.status,
	"satisfied",
	"complete implementation evidence should satisfy production profile",
);
assert.deepEqual(passing.missing, []);
assert.deepEqual(
	passing.required_audits.sort(),
	["alignment", "changed"].sort(),
);

const missing = evaluateProductionPolicyProfile({
	profile: "implementation",
	policyProfile: "production",
	build: baseBuild({
		checks_run: [],
		acceptance_mapping: [],
		closure_brief: {
			user_intent: "policy test",
			implemented_changes: ["changed example"],
			acceptance_evidence: [],
			checks: [],
		},
	}),
	isolation: {},
});
assert.equal(
	missing.status,
	"missing",
	"missing evidence should remain missing in production profile",
);
for (const requirement of [
	"evidence:acceptance-mapping",
	"check:typecheck",
	"check:tests",
	"check:review-tool",
	"proof:fresh-validation",
	"proof:content",
]) {
	assert.ok(
		missing.missing.includes(requirement),
		`missing ${requirement} should be reported`,
	);
}

const packageBuild = baseBuild({
	code_files: ["package.json"],
	audit_refs: ["alignment", "changed", "package"],
});
const missingPackagePack = evaluateProductionPolicyProfile({
	profile: "implementation",
	policyProfile: "production",
	build: packageBuild,
	isolation,
});
assert.equal(
	missingPackagePack.status,
	"missing",
	"package changes require package pack evidence",
);
assert.ok(missingPackagePack.missing.includes("check:package-pack"));

const invalidWaiver = evaluateProductionPolicyProfile({
	profile: "implementation",
	policyProfile: "production",
	build: {
		...packageBuild,
		policy: {
			waivers: [
				{
					requirement: "check:package-pack",
					reason: "temporary package dry-run skip",
				},
			],
		},
	},
	isolation,
});
assert.equal(
	invalidWaiver.status,
	"missing",
	"waiver without owner should not satisfy policy",
);
assert.ok(invalidWaiver.missing.includes("check:package-pack:waiver_invalid"));

const waivedPackagePack = evaluateProductionPolicyProfile({
	profile: "implementation",
	policyProfile: "production",
	build: {
		...packageBuild,
		policy: {
			waivers: [
				{
					requirement: "check:package-pack",
					owner: "maintainer",
					reason:
						"package contents unchanged; pack dry-run covered by separate release gate",
				},
			],
		},
	},
	isolation,
});
assert.equal(
	waivedPackagePack.status,
	"satisfied",
	"explicit owner/rationale waiver should allow package pack gap",
);
assert.equal(waivedPackagePack.waived[0].requirement_id, "check:package-pack");

const packageReady = evaluateProductionPolicyProfile({
	profile: "implementation",
	policyProfile: "production",
	build: {
		...packageBuild,
		checks_run: [...packageBuild.checks_run, "npm pack --dry-run: pass"],
	},
	isolation,
});
assert.equal(
	packageReady.status,
	"satisfied",
	"package pack evidence should satisfy package readiness",
);

async function writeBuild(root, build) {
	const rel = ".codewiki/builds/implementation/fixture.json";
	const abs = resolve(root, rel);
	await mkdir(resolve(root, ".codewiki/builds/implementation"), {
		recursive: true,
	});
	await writeFile(abs, JSON.stringify(build, null, 2) + "\n", "utf8");
	return rel;
}

const root = await mkdtemp(resolve(tmpdir(), "codewiki-policy-"));
const project = {
	root,
	roadmapPath: ".codewiki/roadmap/queue.json",
	graphPath: ".codewiki/index_graph.json",
};
const source = await writeBuild(
	root,
	baseBuild({
		checks_run: [
			"npm run test:smoke: pass",
			"pi-lens review: 0 blockers, 0 warnings",
		],
		closure_brief: {
			user_intent: "policy test",
			implemented_changes: ["changed example"],
			acceptance_evidence: ["policy evidence exists"],
			checks: ["npm run test:smoke"],
		},
	}),
);
const blockedPreflight = buildGatewayPreflight(project, {
	profile: "implementation",
	policy_profile: "production",
	verdict: "pass",
	rationale: "validate fixture",
	task_id: "TASK-123",
	source,
	audit_refs: ["alignment", "changed"],
	isolation,
});
assert.equal(
	blockedPreflight.status,
	"blocked",
	"gateway preflight should enforce production policy profile",
);
assert.ok(
	blockedPreflight.missing.production_policy.includes(
		"production_policy:check:typecheck",
	),
);

const waivedSource = await writeBuild(
	root,
	baseBuild({
		checks_run: [
			"npm run test:smoke: pass",
			"pi-lens review: 0 blockers, 0 warnings",
		],
		closure_brief: {
			user_intent: "policy test",
			implemented_changes: ["changed example"],
			acceptance_evidence: ["policy evidence exists"],
			checks: ["npm run test:smoke"],
		},
		policy: {
			profile: "production",
			waivers: [
				{
					requirement: "check:typecheck",
					owner: "maintainer",
					reason:
						"fixture proves waiver integration; real task still runs typecheck",
				},
			],
		},
	}),
);
const waivedPreflight = buildGatewayPreflight(project, {
	profile: "implementation",
	policy_profile: "production",
	verdict: "pass",
	rationale: "validate fixture",
	task_id: "TASK-123",
	source: waivedSource,
	audit_refs: ["alignment", "changed"],
	isolation,
});
assert.equal(
	waivedPreflight.status,
	"ready",
	"explicit waiver should satisfy production policy integration",
);
assert.equal(waivedPreflight.production_policy.status, "satisfied");
assert.equal(
	waivedPreflight.production_policy.waived[0].requirement_id,
	"check:typecheck",
);

for (const file of readdirSync(resolve("src/policy")).filter((name) =>
	name.endsWith(".ts"),
)) {
	const content = readFileSync(resolve("src/policy", file), "utf8");
	assert.ok(
		!content.includes("../gateway/"),
		`${file} must not import gateway`,
	);
	assert.ok(
		!content.includes("../checks/"),
		`${file} must not import checks executors`,
	);
}

console.log("✓ policy gate smoke passed");
