import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { evaluateProductionQualityProfile } from "../../src/quality/production-profile.ts";
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
			{ criterion: "quality evidence exists", evidence: "checks passed" },
		],
		closure_brief: {
			user_intent: "quality test",
			implemented_changes: ["changed example"],
			acceptance_evidence: ["quality evidence exists"],
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

const passing = evaluateProductionQualityProfile({
	profile: "implementation",
	policyProfile: "production",
	build: baseBuild(),
	isolation,
});
assert.equal(passing.status, "pass", "complete implementation evidence should pass production profile");
assert.deepEqual(passing.missing, []);
assert.deepEqual(passing.required_audits.sort(), ["alignment", "changed"].sort());

const missing = evaluateProductionQualityProfile({
	profile: "implementation",
	policyProfile: "production",
	build: baseBuild({
		checks_run: [],
		acceptance_mapping: [],
		closure_brief: {
			user_intent: "quality test",
			implemented_changes: ["changed example"],
			acceptance_evidence: [],
			checks: [],
		},
	}),
	isolation: {},
});
assert.equal(missing.status, "block", "missing evidence should block production profile");
for (const requirement of [
	"evidence:acceptance-mapping",
	"check:typecheck",
	"check:tests",
	"check:review-tool",
	"proof:fresh-validation",
	"proof:content",
]) {
	assert.ok(missing.missing.includes(requirement), `missing ${requirement} should be reported`);
}

const packageBuild = baseBuild({
	code_files: ["package.json"],
	audit_refs: ["alignment", "changed", "package"],
});
const missingPackagePack = evaluateProductionQualityProfile({
	profile: "implementation",
	policyProfile: "production",
	build: packageBuild,
	isolation,
});
assert.equal(missingPackagePack.status, "block", "package changes require package pack evidence");
assert.ok(missingPackagePack.missing.includes("check:package-pack"));

const invalidWaiver = evaluateProductionQualityProfile({
	profile: "implementation",
	policyProfile: "production",
	build: {
		...packageBuild,
		quality: {
			waivers: [
				{ requirement: "check:package-pack", reason: "temporary package dry-run skip" },
			],
		},
	},
	isolation,
});
assert.equal(invalidWaiver.status, "block", "waiver without owner should not pass");
assert.ok(invalidWaiver.missing.includes("check:package-pack:waiver_invalid"));

const waivedPackagePack = evaluateProductionQualityProfile({
	profile: "implementation",
	policyProfile: "production",
	build: {
		...packageBuild,
		quality: {
			waivers: [
				{
					requirement: "check:package-pack",
					owner: "maintainer",
					reason: "package contents unchanged; pack dry-run covered by separate release gate",
				},
			],
		},
	},
	isolation,
});
assert.equal(waivedPackagePack.status, "pass", "explicit owner/rationale waiver should allow package pack gap");
assert.equal(waivedPackagePack.waived[0].requirement_id, "check:package-pack");

const packageReady = evaluateProductionQualityProfile({
	profile: "implementation",
	policyProfile: "production",
	build: {
		...packageBuild,
		checks_run: [...packageBuild.checks_run, "npm pack --dry-run: pass"],
	},
	isolation,
});
assert.equal(packageReady.status, "pass", "package pack evidence should satisfy package readiness");

async function writeBuild(root, build) {
	const rel = ".codewiki/builds/implementation/fixture.json";
	const abs = resolve(root, rel);
	await mkdir(resolve(root, ".codewiki/builds/implementation"), { recursive: true });
	await writeFile(abs, JSON.stringify(build, null, 2) + "\n", "utf8");
	return rel;
}

const root = await mkdtemp(resolve(tmpdir(), "codewiki-quality-"));
const project = { root, roadmapPath: ".codewiki/roadmap/queue.json", graphPath: ".codewiki/index_graph.json" };
const source = await writeBuild(
	root,
	baseBuild({
		checks_run: ["npm run test:smoke: pass", "pi-lens review: 0 blockers, 0 warnings"],
		closure_brief: {
			user_intent: "quality test",
			implemented_changes: ["changed example"],
			acceptance_evidence: ["quality evidence exists"],
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
assert.equal(blockedPreflight.status, "blocked", "gateway preflight should enforce production quality profile");
assert.ok(blockedPreflight.missing.production_quality.includes("production_quality:check:typecheck"));

const waivedSource = await writeBuild(
	root,
	baseBuild({
		checks_run: ["npm run test:smoke: pass", "pi-lens review: 0 blockers, 0 warnings"],
		closure_brief: {
			user_intent: "quality test",
			implemented_changes: ["changed example"],
			acceptance_evidence: ["quality evidence exists"],
			checks: ["npm run test:smoke"],
		},
		quality: {
			profile: "production",
			waivers: [
				{
					requirement: "check:typecheck",
					owner: "maintainer",
					reason: "fixture proves waiver integration; real task still runs typecheck",
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
assert.equal(waivedPreflight.status, "ready", "explicit waiver should satisfy production quality integration");
assert.equal(waivedPreflight.production_quality.status, "pass");
assert.equal(waivedPreflight.production_quality.waived[0].requirement_id, "check:typecheck");

console.log("✓ quality profile smoke passed");
