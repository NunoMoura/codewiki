import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	writeDecisionBuild,
	writeImplementationBuild,
	writePlanningBuild,
} from "../../src/build/writer.ts";
import { writeValidationReport } from "../../src/validation/report.ts";
import { buildGraph } from "../../src/state/graph.ts";

const root = await mkdtemp(join(tmpdir(), "codewiki-loop-isolation-"));

const project = {
	root,
	label: "loop-isolation-smoke",
	config: {
		project_name: "loop-isolation-smoke",
		schema_version: 4,
		specs_root: ".codewiki/kb",
		generated_files: [".codewiki/index_graph.json"],
	},
	docsRoot: ".codewiki/kb",
	specsRoot: ".codewiki/kb",
	evidenceRoot: ".codewiki/evidence",
	researchRoot: ".codewiki/research",
	indexPath: ".codewiki/index.md",
	roadmapPath: ".codewiki/roadmap/queue.json",
	roadmapDocPath: ".codewiki/roadmap.md",
	roadmapEventsPath: "",
	metaRoot: ".codewiki",
	viewsRoot: ".codewiki/views",
	graphPath: ".codewiki/index_graph.json",
	lintPath: ".codewiki/index_graph.json",
	roadmapStatePath: ".codewiki/index_graph.json",
	statusStatePath: ".codewiki/index_graph.json",
	eventsPath: "",
	configPath: ".codewiki/config.json",
};

const fakeGitCache = { getDirtyPaths: () => [] };
const implementationAuditRefs = ["audit:alignment", "audit:changed"];
const taskCloseAuditRefs = [
	"audit:alignment",
	"audit:changed",
	"audit:task",
	"audit:generated-parity",
];
const publicationAuditRefs = [
	"audit:alignment",
	"audit:package",
	"audit:security",
	"approval:user",
];

try {
	const decision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "Accept isolated implementation policy.",
		diff_table: [
			{
				id: "ISOLATION-POLICY",
				current_state: "Isolation policy is not covered.",
				desired_state:
					"Implementation validation has isolation policy coverage.",
				rationale: "Smoke test needs accepted semantic source.",
				affected_layers: ["system", "code"],
				user_action: "approved",
			},
		],
		row_to_kb_mappings: [
			{
				row_id: "ISOLATION-POLICY",
				knowledge_refs: [".codewiki/kb/system/validation-gateway.md"],
				evidence: "Validation gateway docs capture isolation policy.",
			},
		],
		propagation: {
			direction: "system-first",
			product_impact: ["Agents get validation isolation feedback."],
			downstream_planning_questions: [
				"Plan TASK-123 isolation implementation.",
			],
		},
		knowledge_changes: [".codewiki/kb/system/validation-gateway.md"],
	});
	await writeValidationReport(project, {
		profile: "decision",
		verdict: "pass",
		rationale: "Decision gateway pass for isolation fixture.",
		source: decision.path,
		audit_refs: ["audit:alignment", "audit:stale-reference", "approval:user"],
	});
	const planning = await writePlanningBuild(project, {
		kind: "planning",
		summary: "Plan isolated implementation.",
		source_decision_build: decision.path,
		task_ids: ["TASK-123"],
		task_changes: ["TASK-123 refined."],
		decision_row_resolutions: [
			{
				row_id: "ISOLATION-POLICY",
				resolution: "roadmap-task",
				task_ids: ["TASK-123"],
				evidence: "TASK-123 implements the accepted isolation policy.",
				source_refs: [decision.path, "TASK-123"],
			},
		],
		downstream_question_resolutions: [
			{
				question: "Plan TASK-123 isolation implementation.",
				resolution: "roadmap-task",
				task_ids: ["TASK-123"],
				evidence: "TASK-123 answers the downstream planning question.",
				source_refs: [decision.path, "TASK-123"],
			},
		],
		tdd_plan: ["Add isolation policy smoke coverage."],
		candidate_test_files: ["tests/smoke/loop-isolation-policy.test.mjs"],
		candidate_code_paths: ["src/build/writer.ts"],
	});
	await writeValidationReport(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Planning gateway pass for isolation fixture.",
		source: planning.path,
		audit_refs: ["audit:alignment", "approval:user"],
	});
	const planningData = JSON.parse(
		await readFile(join(root, planning.path), "utf8"),
	);
	assert.equal(planningData.policy.isolation.loop_start.required, false);
	assert.equal(
		planningData.policy.isolation.loop_start.mode,
		"agent-owned-new-session",
	);
	assert.equal(planningData.policy.isolation.next_loop.required, false);
	assert.equal(
		planningData.policy.isolation.next_loop.handoff,
		"planning_build -> implementation_loop",
	);
	assert.equal(planningData.policy.isolation.validation.required, false);

	const implementation = await writeImplementationBuild(project, {
		kind: "implementation",
		summary: "Implement isolated validation policy.",
		source_planning_build: planning.path,
		task_id: "TASK-123",
		test_files: ["tests/smoke/loop-isolation-policy.test.mjs"],
		code_files: ["src/build/writer.ts"],
		checks_run: ["npm test"],
		acceptance_mapping: [
			{ criterion: "Policy works", evidence: "Smoke test passes" },
		],
		closure_brief: {
			user_intent: "Validate isolation policy.",
			implemented_changes: ["Added policy enforcement."],
			acceptance_evidence: ["Smoke test passes"],
			checks: ["npm test"],
		},
		publication: {
			safe_to_push: true,
			secret_scan: "pass",
			remote_visibility: "pass",
			private_evidence: "pass",
		},
	});

	const badBuildPath = ".codewiki/builds/implementation/not-commit-ready.json";
	const implementationData = JSON.parse(
		await readFile(join(root, implementation.path), "utf8"),
	);
	assert.deepEqual(implementationData.policy.required_audits, [
		"alignment",
		"changed",
	]);
	assert.equal(implementationData.change_type, "code");
	assert.equal(implementationData.traceability.requires_accepted_build, true);
	assert.deepEqual(implementationData.traceability.accepted_build_refs, [
		planning.path,
	]);

	const legacyGenerated = await writeImplementationBuild(project, {
		kind: "implementation",
		summary: "Refresh generated graph.",
		task_id: "TASK-123",
		change_class: "generated",
		code_files: [".codewiki/index_graph.json"],
		checks_run: ["codewiki_state refresh=true"],
		acceptance_mapping: [
			{ criterion: "Graph refreshed", evidence: "Generated artifact updated" },
		],
		closure_brief: {
			user_intent: "Refresh generated graph.",
			implemented_changes: ["Regenerated graph output."],
			acceptance_evidence: ["Graph refresh completed"],
			checks: ["codewiki_state refresh=true"],
		},
	});
	const legacyGeneratedData = JSON.parse(
		await readFile(join(root, legacyGenerated.path), "utf8"),
	);
	assert.equal(legacyGeneratedData.change_type, "code");
	assert.equal(legacyGeneratedData.traceability.exemption, "generated");
	assert.equal(legacyGeneratedData.traceability.semantic, false);
	assert.equal(legacyGeneratedData.traceability.requires_accepted_build, false);

	const badBuild = JSON.parse(JSON.stringify(implementationData));
	badBuild.publication.commit.trailers =
		badBuild.publication.commit.trailers.filter(
			(trailer) => !String(trailer).startsWith("CodeWiki-Validation:"),
		);
	await mkdir(join(root, ".codewiki/builds/implementation"), {
		recursive: true,
	});
	await writeFile(
		join(root, badBuildPath),
		JSON.stringify(badBuild, null, 2) + "\n",
		"utf8",
	);
	const missingTraceabilityBuildPath =
		".codewiki/builds/implementation/missing-traceability.json";
	const missingTraceabilityBuild = JSON.parse(
		JSON.stringify(implementationData),
	);
	delete missingTraceabilityBuild.source_planning_build;
	missingTraceabilityBuild.consumes.planning = [];
	missingTraceabilityBuild.traceability.accepted_build_refs = [];
	missingTraceabilityBuild.traceability.upstream_build_refs = [];
	await writeFile(
		join(root, missingTraceabilityBuildPath),
		JSON.stringify(missingTraceabilityBuild, null, 2) + "\n",
		"utf8",
	);
	const traceabilityBlocked = await writeValidationReport(project, {
		profile: "implementation",
		task_id: "TASK-123",
		verdict: "pass",
		rationale:
			"Fresh validator cannot pass semantic work missing accepted planning build traceability.",
		source: missingTraceabilityBuildPath,
		audit_refs: implementationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:dirty-tree",
		},
	});
	assert.equal(traceabilityBlocked.data.verdict, "block");
	assert.ok(
		traceabilityBlocked.data.failed_criteria.includes(
			"semantic_build_traceability",
		),
	);
	assert.match(
		traceabilityBlocked.data.issues.map((issue) => issue.summary).join("\n"),
		/accepted_planning_build_ref|source_planning_build/,
	);

	const commitReadinessBlocked = await writeValidationReport(project, {
		profile: "implementation",
		task_id: "TASK-123",
		verdict: "pass",
		rationale:
			"Fresh validator cannot pass a build missing commit-readiness trailers.",
		source: badBuildPath,
		audit_refs: implementationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:dirty-tree",
		},
	});
	assert.equal(commitReadinessBlocked.data.verdict, "block");
	assert.ok(
		commitReadinessBlocked.data.failed_criteria.includes("commit_readiness"),
	);
	assert.match(
		commitReadinessBlocked.data.issues.at(-1).summary,
		/CodeWiki-Validation/,
	);

	const blocked = await writeValidationReport(project, {
		profile: "implementation",
		task_id: "TASK-123",
		verdict: "pass",
		rationale: "Would pass if isolated.",
		source: implementation.path,
	});
	assert.equal(blocked.data.verdict, "block");
	assert.equal(blocked.data.isolation_requirement.required, true);
	assert.ok(blocked.data.failed_criteria.includes("validation_isolation"));
	assert.match(blocked.data.issues[0].summary, /fresh_context=true/);

	const auditBlocked = await writeValidationReport(project, {
		profile: "implementation",
		task_id: "TASK-123",
		verdict: "pass",
		rationale: "Fresh validator lacks required audit evidence.",
		source: implementation.path,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			validated_sha: "abc1234",
		},
	});
	assert.equal(auditBlocked.data.verdict, "block");
	assert.ok(auditBlocked.data.failed_criteria.includes("audit_evidence"));
	assert.deepEqual(auditBlocked.data.audit_requirement.gaps, [
		"alignment",
		"changed",
	]);

	const passed = await writeValidationReport(project, {
		profile: "implementation",
		task_id: "TASK-123",
		verdict: "pass",
		rationale: "Fresh validator evidence present.",
		source: implementation.path,
		audit_refs: implementationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			validated_sha: "abc1234",
			builder_session_id: "builder-session",
		},
	});
	assert.equal(passed.data.verdict, "pass");
	assert.equal(
		passed.data.isolation_requirement.mode,
		"fresh-context-checked-content",
	);
	assert.deepEqual(passed.data.required_audits, ["alignment", "changed"]);
	assert.deepEqual(passed.data.content_proof_refs, ["abc1234"]);

	const dirtyPreCommitPassed = await writeValidationReport(project, {
		profile: "implementation",
		task_id: "TASK-123",
		verdict: "pass",
		rationale: "Fresh validator checked dirty pre-commit worktree digest.",
		source: implementation.path,
		audit_refs: implementationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:dirty-tree",
			base_sha: "abc1234",
			builder_session_id: "builder-session",
		},
	});
	assert.equal(dirtyPreCommitPassed.data.verdict, "pass");
	assert.equal(
		dirtyPreCommitPassed.data.isolation.working_tree_digest,
		"sha256:dirty-tree",
	);

	const taskCloseWithoutPublisherBlocked = await writeValidationReport(
		project,
		{
			profile: "task-close",
			task_id: "TASK-123",
			verdict: "pass",
			rationale:
				"Task close cannot pass with validator proof only; it needs publisher result proof.",
			source: implementation.path,
			audit_refs: taskCloseAuditRefs,
			isolation: {
				role: "validator",
				fresh_context: true,
				clean: true,
				validated_sha: "abc1234",
			},
		},
	);
	assert.equal(taskCloseWithoutPublisherBlocked.data.verdict, "block");
	assert.ok(
		taskCloseWithoutPublisherBlocked.data.failed_criteria.includes(
			"publisher_result_proof",
		),
	);
	assert.match(
		taskCloseWithoutPublisherBlocked.data.issues.at(-1).summary,
		/published_sha|tree_sha|archive_ref|remote_ref/,
	);

	const taskCloseTraceabilityBlocked = await writeValidationReport(project, {
		profile: "task-close",
		task_id: "TASK-123",
		verdict: "pass",
		rationale:
			"Task-close report has publisher proof but no source implementation build.",
		audit_refs: taskCloseAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			published_sha: "def5678",
			tree_sha: "abc1234",
		},
	});
	assert.equal(taskCloseTraceabilityBlocked.data.verdict, "block");
	assert.ok(
		taskCloseTraceabilityBlocked.data.failed_criteria.includes(
			"upstream_gateway",
		),
	);
	assert.ok(
		taskCloseTraceabilityBlocked.data.semantic_traceability_requirement.warnings.some(
			(item) => /source_implementation_build missing/.test(item),
		),
	);

	const dirtyTaskCloseBlocked = await writeValidationReport(project, {
		profile: "task-close",
		task_id: "TASK-123",
		verdict: "pass",
		rationale:
			"Task close needs immutable task recovery proof, not dirty digest alone.",
		source: implementation.path,
		audit_refs: taskCloseAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:dirty-tree",
		},
	});
	assert.equal(dirtyTaskCloseBlocked.data.verdict, "block");
	assert.equal(
		dirtyTaskCloseBlocked.data.isolation_requirement.mode,
		"fresh-context-clean-immutable-content",
	);
	assert.ok(
		dirtyTaskCloseBlocked.data.failed_criteria.includes("validation_isolation"),
	);

	const dirtyPublicationBlocked = await writeValidationReport(project, {
		profile: "publication",
		task_id: "TASK-123",
		verdict: "pass",
		rationale: "Publication cannot use dirty working tree digest alone.",
		source: implementation.path,
		audit_refs: publicationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: false,
			working_tree_digest: "sha256:dirty-tree",
		},
	});
	assert.equal(dirtyPublicationBlocked.data.verdict, "block");
	assert.ok(
		dirtyPublicationBlocked.data.failed_criteria.includes(
			"validation_isolation",
		),
	);
	assert.ok(
		dirtyPublicationBlocked.data.failed_criteria.includes(
			"publisher_result_proof",
		),
	);
	assert.ok(
		dirtyPublicationBlocked.data.issues.some((issue) =>
			/clean=true|immutable_content_proof/.test(issue.summary),
		),
	);
	assert.ok(
		dirtyPublicationBlocked.data.issues.some((issue) =>
			/published_sha|tree_sha|archive_ref|remote_ref/.test(issue.summary),
		),
	);

	const publicationPassed = await writeValidationReport(project, {
		profile: "publication",
		task_id: "TASK-123",
		verdict: "pass",
		rationale: "Publication has clean immutable proof.",
		source: implementation.path,
		audit_refs: publicationAuditRefs,
		isolation: {
			role: "validator",
			fresh_context: true,
			clean: true,
			published_sha: "def5678",
			package_digest: "sha256:package",
		},
	});
	assert.equal(publicationPassed.data.verdict, "pass");
	assert.equal(
		publicationPassed.data.isolation_requirement.mode,
		"fresh-context-clean-immutable-content",
	);

	const graph = buildGraph({
		project,
		docs: [],
		research: [],
		roadmapEntries: [],
		roadmapSprints: [],
		gitCache: fakeGitCache,
		builds: [
			{
				path: ".codewiki/builds/decision/decision.json",
				kind: "decision_build",
				status: "accepted",
				data: {
					kind: "decision_build",
					lifecycle: { state: "accepted" },
					diff_table: [
						{
							id: "DTR-001",
							desired_state: "Change builds.",
							user_action: "approved",
						},
					],
					approved_diff_rows: ["DTR-001"],
					knowledge_changes: [".codewiki/kb/system/builds.md"],
					row_to_kb_mappings: [
						{
							row_id: "DTR-001",
							knowledge_refs: [".codewiki/kb/system/builds.md"],
							evidence: "Builds doc captures decision.",
						},
					],
					propagation: {
						direction: "system-first",
						no_product_impact: "No product behavior change.",
					},
					produces: { code: ["src/build/writer.ts"] },
				},
			},
		],
		validations: [],
		testFiles: [],
		claims: { version: 1, claims: [] },
	});
	assert.equal(graph.views.reconciliation.next_action.loop, "planning");
	assert.equal(
		graph.views.reconciliation.next_action.isolation_required,
		false,
	);
	assert.equal(
		graph.views.reconciliation.next_action.isolation.mode,
		"agent-owned-new-session",
	);
	assert.equal(graph.views.workflow_cursor.context_boundary, "none");
	assert.ok(
		graph.views.workflow_cursor.handoff_refs.includes(
			"build:.codewiki/builds/decision/decision.json",
		),
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
