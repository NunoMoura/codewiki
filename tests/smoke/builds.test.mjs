import "../setup-env.mjs";
/**
 * tests/smoke/builds.mjs
 *
 * Standalone smoke tests for codewiki_build (decision, planning, implementation)
 * and codewiki_validation. Bootstraps a fresh temp project, runs the tools, asserts.
 */
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import module from "node:module";
import assert from "node:assert";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");

async function run() {
	const tmp = mkdtempSync(resolve(tmpdir(), "codewiki-build-test-"));

	try {
		// Load the extension
		const piRoot = findPiRoot();
		extendNodePath(piRoot);
		const { DefaultResourceLoader, initTheme, getAgentDir } = await import(
			pathToFileURL(resolve(piRoot, "dist", "index.js")).href
		);
		initTheme("dark", false);

		mkdirSync(resolve(tmp, ".git"), { recursive: true });
		mkdirSync(resolve(tmp, ".pi"), { recursive: true });
		writeFileSync(
			resolve(tmp, ".pi", "settings.json"),
			JSON.stringify({ packages: [REPO_ROOT] }, null, 2),
		);
		const loader = new DefaultResourceLoader({
			cwd: tmp,
			agentDir: getAgentDir(),
		});
		await loader.reload();

		// Find the codewiki extension
		const extResult = loader.getExtensions();
		const extensions = extResult.extensions.filter((ext) =>
			ext.path.startsWith(REPO_ROOT),
		);
		assert.equal(extensions.length, 1, "Expected one codewiki extension");
		const extension = extensions[0];

		const projectDir = tmp;
		const ctx = {
			cwd: projectDir,
			sessionManager: {
				getSessionId: () => "build-test-session",
				getSessionFile: () =>
					resolve(projectDir, ".pi", "sessions", "build-test-session.jsonl"),
				getSessionName: () => "Build test session",
				getEntries: () => [],
				getBranch: () => [],
			},
			ui: {
				setStatus: () => {},
				setWidget: () => {},
				notify: () => {},
			},
		};

		// Bootstrap a wiki project
		const bootstrapTool = extension.tools.get("codewiki_bootstrap");
		assert.ok(bootstrapTool, "Bootstrap tool missing");
		const bootstrapResult = await bootstrapTool.definition.execute(
			"build-test-bootstrap",
			{ repoPath: projectDir, force: true },
			undefined,
			undefined,
			ctx,
		);
		assert.ok(bootstrapResult?.content, "Bootstrap failed");

		// codewiki_task: progressive refinement/reuse
		const taskTool = extension.tools.get("codewiki_task");
		assert.ok(taskTool, "Task tool missing");
		const firstTask = await taskTool.definition.execute(
			"task-create-initial",
			{
				repoPath: projectDir,
				action: "create",
				tasks: [
					{
						title: "Improve graph UI",
						priority: "medium",
						kind: "feature",
						summary: "Make graph navigation readable.",
						spec_paths: [".codewiki/kb/product/uis/control-room.md"],
						code_paths: ["src/ui/web/control-room.ts"],
						labels: ["graph", "ui"],
						goal: {
							outcome: "Graph navigation is readable.",
							acceptance: ["Graph renders nodes."],
							verification: ["Run UI smoke test."],
						},
					},
				],
				refresh: true,
			},
			undefined,
			undefined,
			ctx,
		);
		assert.equal(firstTask.details.created.length, 1);
		assert.equal(firstTask.details.reused.length, 0);
		const refinedTask = await taskTool.definition.execute(
			"task-create-refine",
			{
				repoPath: projectDir,
				action: "create",
				tasks: [
					{
						title: "Spread graph nodes",
						priority: "high",
						kind: "feature",
						summary: "Add graph spacing refinements.",
						spec_paths: [".codewiki/kb/product/uis/control-room.md"],
						code_paths: ["tests/smoke/control-room.test.mjs"],
						labels: ["graph", "readability"],
						goal: {
							outcome: "Graph nodes have readable spacing.",
							acceptance: ["Nodes have minimum spacing."],
							non_goals: ["No graph editing."],
							verification: ["Run npm test."],
						},
						delta: { desired: "Default graph spacing is readable." },
					},
				],
				refresh: true,
			},
			undefined,
			undefined,
			ctx,
		);
		assert.equal(refinedTask.details.created.length, 0);
		assert.equal(refinedTask.details.reused.length, 1);
		assert.equal(refinedTask.details.refined.length, 1);
		assert.equal(
			refinedTask.details.reused[0].id,
			firstTask.details.created[0].id,
		);
		const roadmapAfterRefine = JSON.parse(
			readFileSync(
				resolve(projectDir, ".codewiki", "roadmap", "queue.json"),
				"utf8",
			),
		);
		const taskOne = roadmapAfterRefine.tasks[firstTask.details.created[0].id];
		assert.equal(taskOne.priority, "high");
		assert.ok(taskOne.code_paths.includes("src/ui/web/control-room.ts"));
		assert.ok(taskOne.code_paths.includes("tests/smoke/control-room.test.mjs"));
		assert.ok(taskOne.labels.includes("readability"));
		assert.ok(taskOne.goal.acceptance.includes("Graph renders nodes."));
		assert.ok(taskOne.goal.acceptance.includes("Nodes have minimum spacing."));
		assert.match(taskOne.delta.desired, /Default graph spacing is readable/);
		const unrelatedTask = await taskTool.definition.execute(
			"task-create-unrelated",
			{
				repoPath: projectDir,
				action: "create",
				tasks: [
					{
						title: "Document API contracts",
						priority: "medium",
						kind: "docs",
						summary: "Improve API docs.",
						spec_paths: [".codewiki/kb/system/api.md"],
						labels: ["api"],
						goal: {
							outcome: "API docs are clearer.",
							acceptance: ["API docs mention contract."],
							verification: ["Review docs."],
						},
					},
				],
				refresh: true,
			},
			undefined,
			undefined,
			ctx,
		);
		assert.equal(unrelatedTask.details.created.length, 1);
		assert.equal(unrelatedTask.details.reused.length, 0);

		// codewiki_build: decision
		const buildTool = extension.tools.get("codewiki_build");
		assert.ok(buildTool, "Build tool missing");
		const valTool = extension.tools.get("codewiki_validation");
		assert.ok(valTool, "Validation tool missing");

		await assert.rejects(
			() =>
				buildTool.definition.execute(
					"build-decision-missing-diff",
					{
						repoPath: projectDir,
						kind: "decision",
						summary: "Missing diff rows.",
						decisions: ["Do X."],
						lifecycle: { ttl_days: 7 },
					},
					undefined,
					undefined,
					ctx,
				),
			/approved diff_table row|diff_table/,
		);

		const decisionResult = await buildTool.definition.execute(
			"build-decision",
			{
				repoPath: projectDir,
				kind: "decision",
				summary: "Smoke decision.",
				diff_table: [
					{
						id: "DTR-001",
						current_state: "X is undocumented.",
						desired_state: "Document and implement X.",
						rationale: "Smoke coverage needs accepted intent.",
						affected_layers: ["knowledge", "roadmap", "code"],
						risk: "low",
						user_action: "approved",
					},
				],
				knowledge_changes: [".codewiki/kb/system/overview.md"],
				roadmap_changes: ["TASK-001 created/updated"],
				row_to_kb_mappings: [
					{
						row_id: "DTR-001",
						knowledge_refs: [".codewiki/kb/system/overview.md"],
						diagram_refs: ["component-map:application"],
						evidence: "Overview captures accepted decision.",
					},
				],
				propagation: {
					direction: "system-first",
					product_impact: ["User-visible docs mention X."],
					downstream_planning_questions: ["Plan TASK-001 implementation."],
				},
				diagram_refs: ["component-map:application"],
				lifecycle: { ttl_days: 7 },
			},
			undefined,
			undefined,
			ctx,
		);
		assert.match(
			decisionResult.details.path,
			/\.codewiki\/builds\/decision\/.*\.json$/,
		);
		const decision = JSON.parse(
			readFileSync(resolve(projectDir, decisionResult.details.path), "utf8"),
		);
		assert.equal(decision.kind, "decision_build");
		assert.equal(decision.schema_version, 2);
		assert.equal(decision.diff_table[0].user_action, "approved");
		assert.deepEqual(decision.approved_diff_rows, ["DTR-001"]);
		assert.deepEqual(decision.produces.knowledge, [
			".codewiki/kb/system/overview.md",
		]);
		assert.deepEqual(decision.produces.roadmap, ["TASK-001 created/updated"]);
		assert.equal(decision.propagation.direction, "system-first");
		assert.deepEqual(decision.row_to_kb_mappings[0].diagram_refs, [
			"component-map:application",
		]);

		// codewiki_build: planning
		const planResult = await buildTool.definition.execute(
			"build-plan",
			{
				repoPath: projectDir,
				kind: "planning",
				summary: "Plan implementation.",
				source_decision_build: decisionResult.details.path,
				task_ids: ["TASK-001"],
				task_changes: ["TASK-001 refined for TDD"],
				decision_row_resolutions: [
					{
						row_id: "DTR-001",
						resolution: "roadmap-task",
						task_ids: ["TASK-001"],
						evidence: "TASK-001 carries accepted DTR-001 into implementation.",
						source_refs: [decisionResult.details.path, "TASK-001"],
					},
				],
				downstream_question_resolutions: [
					{
						question: "Plan TASK-001 implementation.",
						resolution: "roadmap-task",
						task_ids: ["TASK-001"],
						evidence: "TASK-001 answers the downstream planning question.",
						source_refs: [decisionResult.details.path, "TASK-001"],
					},
				],
				tdd_plan: ["Write or update failing test before code change."],
				candidate_test_files: ["test.js"],
				candidate_code_paths: ["src/index.ts"],
				requirements: [
					{
						id: "REQ-001",
						text: "Document and implement X.",
						source_refs: [decisionResult.details.path],
					},
				],
				evidence_mapping: [
					{
						criterion: "Task acceptance maps to requirement",
						evidence: "TASK-001 acceptance covers REQ-001.",
						requirement_ids: ["REQ-001"],
						source_refs: [decisionResult.details.path],
					},
				],
				lifecycle: { ttl_days: 14 },
			},
			undefined,
			undefined,
			ctx,
		);
		assert.match(
			planResult.details.path,
			/\.codewiki\/builds\/planning\/.*\.json$/,
		);
		const plan = JSON.parse(
			readFileSync(resolve(projectDir, planResult.details.path), "utf8"),
		);
		assert.equal(plan.kind, "planning_build");
		assert.deepEqual(plan.consumes.decision, [decisionResult.details.path]);
		assert.ok(plan.produces.roadmap.includes("TASK-001"));
		assert.equal(plan.source_decision_build, decisionResult.details.path);
		assert.equal(plan.cycle.loop, "planning");
		assert.equal(plan.policy.profile, "planning");
		assert.equal(plan.decision_row_resolutions[0].row_id, "DTR-001");
		assert.equal(
			plan.downstream_question_resolutions[0].question,
			"Plan TASK-001 implementation.",
		);

		await valTool.definition.execute(
			"val-decision-pass-for-plan",
			{
				repoPath: projectDir,
				profile: "decision",
				verdict: "pass",
				rationale: "Decision gateway passed for planning fixture.",
				source: decisionResult.details.path,
				audit_refs: [
					"audit:alignment",
					"audit:stale-reference",
					"approval:user",
				],
			},
			undefined,
			undefined,
			ctx,
		);
		await valTool.definition.execute(
			"val-planning-pass-for-impl",
			{
				repoPath: projectDir,
				profile: "planning",
				verdict: "pass",
				rationale: "Planning gateway passed for implementation fixture.",
				source: planResult.details.path,
				audit_refs: ["audit:alignment", "approval:user"],
			},
			undefined,
			undefined,
			ctx,
		);

		// codewiki_build: implementation
		await assert.rejects(
			() =>
				buildTool.definition.execute(
					"build-impl-missing-closure",
					{
						repoPath: projectDir,
						kind: "implementation",
						summary: "Impl missing closure.",
						task_id: "TASK-001",
						test_files: ["test.js"],
						code_files: ["src/index.ts"],
						checks_run: ["npm test"],
						acceptance_mapping: [{ criterion: "Works", evidence: "Pass" }],
						lifecycle: { ttl_days: 7 },
					},
					undefined,
					undefined,
					ctx,
				),
			/closure_brief/,
		);

		const implResult = await buildTool.definition.execute(
			"build-impl",
			{
				repoPath: projectDir,
				kind: "implementation",
				summary: "Impl done.",
				source_planning_build: planResult.details.path,
				task_id: "TASK-001",
				test_files: ["test.js"],
				code_files: ["src/index.ts"],
				checks_run: ["npm test"],
				acceptance_mapping: [{ criterion: "Works", evidence: "Pass" }],
				validation_refs: [".codewiki/validation/smoke-pass.json"],
				closure_brief: {
					user_intent: "Document and implement X.",
					implemented_changes: ["Updated tests and code for X."],
					layers_updated: {
						roadmap: ["TASK-001"],
						code: ["src/index.ts"],
						tests: ["test.js"],
						validation: [".codewiki/validation/smoke-pass.json"],
					},
					acceptance_evidence: ["Works: Pass"],
					checks: ["npm test"],
					non_goals_preserved: [],
					remaining_risks: [],
				},
				lifecycle: { ttl_days: 7 },
			},
			undefined,
			undefined,
			ctx,
		);
		assert.match(
			implResult.details.path,
			/\.codewiki\/builds\/implementation\/.*\.json$/,
		);
		const impl = JSON.parse(
			readFileSync(resolve(projectDir, implResult.details.path), "utf8"),
		);
		assert.equal(impl.kind, "implementation_build");
		assert.equal(impl.closure_brief.user_intent, "Document and implement X.");
		assert.deepEqual(impl.consumes.planning, [planResult.details.path]);
		assert.deepEqual(impl.produces.closure, ["TASK-001"]);
		assert.equal(
			impl.publication.git.strategy,
			"implementation_build_publication_payload",
		);
		assert.equal(
			impl.publication.git.archive_ref,
			"refs/codewiki/archive/task/TASK-001",
		);
		assert.equal(
			impl.publication.archive_ledger.restore_command,
			"/wiki-restore TASK-001",
		);
		assert.ok(
			impl.publication.commit.trailers.includes(
				`CodeWiki-Build: ${implResult.details.path}`,
			),
		);
		assert.ok(
			impl.publication.commit.trailers.some((trailer) =>
				String(trailer).startsWith("CodeWiki-Checks:"),
			),
		);
		assert.ok(
			impl.publication.commit.trailers.some((trailer) =>
				String(trailer).startsWith("CodeWiki-Validation:"),
			),
		);
		assert.ok(
			impl.publication.commit.trailers.some((trailer) =>
				String(trailer).startsWith("CodeWiki-Recover:"),
			),
		);
		assert.match(impl.publication.archive_ledger.digest, /^sha256:/);
		assert.ok(
			impl.publication.artifact_digests.files.some(
				(file) => file.path === planResult.details.path,
			),
		);
		assert.equal(impl.publication.push_readiness.safe_to_push, false);
		assert.ok(
			impl.publication.push_readiness.blocked_reasons.includes(
				"secret scan required",
			),
		);

		// codewiki_validation: task-close pass requires fresh isolation evidence
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
		];
		const closeWithoutValidation = await taskTool.definition
			.execute(
				"task-close-without-validation",
				{
					repoPath: projectDir,
					action: "close",
					taskId: "TASK-001",
					summary: "Should block without task-close validation.",
				},
				undefined,
				undefined,
				ctx,
			)
			.then(
				() => null,
				(error) => error,
			);
		assert.match(
			String(closeWithoutValidation?.message || closeWithoutValidation),
			/Task close blocked/,
		);

		const missingIsolationResult = await valTool.definition.execute(
			"val-pass-missing-isolation",
			{
				repoPath: projectDir,
				profile: "task-close",
				task_id: "TASK-001",
				verdict: "pass",
				rationale: "All good.",
				source: implResult.details.path,
			},
			undefined,
			undefined,
			ctx,
		);
		assert.match(
			missingIsolationResult.details.path,
			/\.codewiki\/validation\/.*task-close-block.*\.json$/,
		);
		assert.equal(missingIsolationResult.details.data.verdict, "block");
		assert.ok(
			missingIsolationResult.details.data.failed_criteria.includes(
				"validation_isolation",
			),
		);
		const validatorOnlyCloseResult = await valTool.definition.execute(
			"val-validator-only-task-close-block",
			{
				repoPath: projectDir,
				profile: "task-close",
				task_id: "TASK-001",
				verdict: "pass",
				rationale: "Validator proof alone lacks publisher result.",
				source: implResult.details.path,
				audit_refs: taskCloseAuditRefs,
				isolation: {
					role: "validator",
					fresh_context: true,
					clean: true,
					validated_sha: "abc1234",
					builder_session_id: "build-test-session",
				},
			},
			undefined,
			undefined,
			ctx,
		);
		assert.match(
			validatorOnlyCloseResult.details.path,
			/\.codewiki\/validation\/.*task-close-block.*\.json$/,
		);
		assert.equal(validatorOnlyCloseResult.details.data.verdict, "block");
		assert.ok(
			validatorOnlyCloseResult.details.data.failed_criteria.includes(
				"publisher_result_proof",
			),
		);
		const passResult = await valTool.definition.execute(
			"val-pass",
			{
				repoPath: projectDir,
				profile: "task-close",
				task_id: "TASK-001",
				verdict: "pass",
				rationale: "All good.",
				source: implResult.details.path,
				audit_refs: taskCloseAuditRefs,
				isolation: {
					role: "validator",
					fresh_context: true,
					clean: true,
					published_sha: "def5678",
					tree_sha: "abc1234",
					builder_session_id: "build-test-session",
				},
			},
			undefined,
			undefined,
			ctx,
		);
		assert.match(
			passResult.details.path,
			/\.codewiki\/validation\/.*task-close-pass.*\.json$/,
		);
		const dirtyPreCommitPass = await valTool.definition.execute(
			"val-dirty-precommit-pass",
			{
				repoPath: projectDir,
				profile: "implementation",
				task_id: "TASK-001",
				verdict: "pass",
				rationale: "Fresh validator checked dirty worktree digest.",
				source: implResult.details.path,
				audit_refs: implementationAuditRefs,
				isolation: {
					role: "validator",
					fresh_context: true,
					clean: false,
					working_tree_digest: "sha256:dirty-tree",
					base_sha: "abc1234",
					builder_session_id: "build-test-session",
				},
			},
			undefined,
			undefined,
			ctx,
		);
		assert.match(
			dirtyPreCommitPass.details.path,
			/\.codewiki\/validation\/.*implementation-pass.*\.json$/,
		);
		assert.equal(
			dirtyPreCommitPass.details.data.isolation.working_tree_digest,
			"sha256:dirty-tree",
		);
		const dirtyTaskCloseBlock = await valTool.definition.execute(
			"val-dirty-task-close-block",
			{
				repoPath: projectDir,
				profile: "task-close",
				task_id: "TASK-001",
				verdict: "pass",
				rationale: "Task close needs immutable recovery proof.",
				source: implResult.details.path,
				audit_refs: taskCloseAuditRefs,
				isolation: {
					role: "validator",
					fresh_context: true,
					clean: false,
					working_tree_digest: "sha256:dirty-tree",
				},
			},
			undefined,
			undefined,
			ctx,
		);
		assert.match(
			dirtyTaskCloseBlock.details.path,
			/\.codewiki\/validation\/.*task-close-block.*\.json$/,
		);
		assert.equal(dirtyTaskCloseBlock.details.data.verdict, "block");
		const dirtyPublicationBlock = await valTool.definition.execute(
			"val-dirty-publication-block",
			{
				repoPath: projectDir,
				profile: "publication",
				task_id: "TASK-001",
				verdict: "pass",
				rationale: "Publication cannot use dirty digest alone.",
				source: implResult.details.path,
				audit_refs: publicationAuditRefs,
				isolation: {
					role: "validator",
					fresh_context: true,
					clean: false,
					working_tree_digest: "sha256:dirty-tree",
				},
			},
			undefined,
			undefined,
			ctx,
		);
		assert.match(
			dirtyPublicationBlock.details.path,
			/\.codewiki\/validation\/.*publication-block.*\.json$/,
		);
		assert.equal(dirtyPublicationBlock.details.data.verdict, "block");

		// codewiki_validation: fail
		const failResult = await valTool.definition.execute(
			"val-fail",
			{
				repoPath: projectDir,
				profile: "decision",
				verdict: "fail",
				rationale: "Bad.",
				issues: [{ severity: "high", summary: "Missing spec." }],
			},
			undefined,
			undefined,
			ctx,
		);
		assert.match(
			failResult.details.path,
			/\.codewiki\/validation\/.*decision-fail.*\.json$/,
		);

		// codewiki_validation: block
		const blockResult = await valTool.definition.execute(
			"val-block",
			{
				repoPath: projectDir,
				profile: "implementation",
				verdict: "block",
				rationale: "Unsure.",
				issues: [{ severity: "high", summary: "Ambiguous intent." }],
			},
			undefined,
			undefined,
			ctx,
		);
		assert.match(
			blockResult.details.path,
			/\.codewiki\/validation\/.*implementation-block.*\.json$/,
		);

		const unconsumedDecisionResult = await buildTool.definition.execute(
			"build-unconsumed-decision",
			{
				repoPath: projectDir,
				kind: "decision",
				summary: "Needs planning.",
				diff_table: [
					{
						id: "DTR-002",
						current_state: "Y missing docs.",
						desired_state: "Document Y.",
						rationale: "Coverage for unconsumed decision.",
						affected_layers: ["knowledge"],
						risk: "low",
						user_action: "approved",
					},
				],
				knowledge_changes: [".codewiki/kb/system/api.md"],
				row_to_kb_mappings: [
					{
						row_id: "DTR-002",
						knowledge_refs: [".codewiki/kb/system/api.md"],
						evidence: "API doc captures Y.",
					},
				],
				propagation: {
					direction: "system-first",
					no_product_impact: "No user-visible behavior change.",
				},
				lifecycle: { ttl_days: 7 },
			},
			undefined,
			undefined,
			ctx,
		);
		const downstreamDecisionResult = await buildTool.definition.execute(
			"build-downstream-decision",
			{
				repoPath: projectDir,
				kind: "decision",
				summary: "Needs downstream work.",
				diff_table: [
					{
						id: "DTR-003",
						current_state: "Z not built.",
						desired_state: "Build Z.",
						rationale: "Coverage for downstream work.",
						affected_layers: ["knowledge", "roadmap", "code"],
						risk: "medium",
						user_action: "approved",
					},
				],
				knowledge_changes: [".codewiki/kb/system/api.md"],
				row_to_kb_mappings: [
					{
						row_id: "DTR-003",
						knowledge_refs: [".codewiki/kb/system/api.md"],
						evidence: "API doc captures Z.",
					},
				],
				propagation: {
					direction: "system-first",
					product_impact: ["User can trigger Z."],
				},
				lifecycle: { ttl_days: 7 },
			},
			undefined,
			undefined,
			ctx,
		);
		const supersededDecisionResult = await buildTool.definition.execute(
			"build-superseded-decision",
			{
				repoPath: projectDir,
				kind: "decision",
				summary: "Superseded intent.",
				diff_table: [
					{
						id: "DTR-004",
						current_state: "Old intent pending.",
						desired_state: "Old intent.",
						rationale: "Coverage for cycle supersedes.",
						affected_layers: ["knowledge"],
						risk: "low",
						user_action: "pending",
					},
				],
				decisions: ["Old intent."],
				lifecycle: { state: "proposed", ttl_days: 7 },
			},
			undefined,
			undefined,
			ctx,
		);
		const replacementDecisionResult = await buildTool.definition.execute(
			"build-replacement-decision",
			{
				repoPath: projectDir,
				kind: "decision",
				summary: "Replacement intent.",
				diff_table: [
					{
						id: "DTR-005",
						current_state: "Old intent pending.",
						desired_state: "Replacement intent.",
						rationale: "Coverage for superseding cycle.",
						affected_layers: ["knowledge"],
						risk: "low",
						user_action: "approved",
					},
				],
				knowledge_changes: [".codewiki/kb/system/api.md"],
				row_to_kb_mappings: [
					{
						row_id: "DTR-005",
						knowledge_refs: [".codewiki/kb/system/api.md"],
						evidence: "API doc captures replacement.",
					},
				],
				propagation: {
					direction: "system-first",
					no_product_impact: "No user-visible behavior change.",
				},
				cycle: {
					sequence: 2,
					supersedes: [supersededDecisionResult.details.path],
				},
				lifecycle: { ttl_days: 7 },
			},
			undefined,
			undefined,
			ctx,
		);

		// Graph reconciliation coverage
		const stateTool = extension.tools.get("codewiki_state");
		assert.ok(stateTool, "State tool missing");
		const stateResult = await stateTool.definition.execute(
			"state-graph",
			{ repoPath: projectDir, include: ["graph"], refresh: true },
			undefined,
			undefined,
			ctx,
		);
		const rec = stateResult.details?.graph?.reconciliation;
		assert.ok(rec, "Graph reconciliation view missing");
		assert.equal(rec.controller, "reconciliation_gateway");
		assert.ok(
			rec.counts_by_loop?.decision >= 0,
			"Reconciliation counts missing",
		);

		// Validation reconciliation items
		const graph = JSON.parse(
			readFileSync(
				resolve(projectDir, ".codewiki", "index_graph.json"),
				"utf8",
			),
		);
		const items = graph.views?.reconciliation?.items || [];
		assert.ok(
			!items.some(
				(i) =>
					i.source_id === `build:${decisionResult.details.path}` &&
					i.next_loop === "planning",
			),
			"Decision build with downstream planning should be consumed",
		);
		assert.ok(
			items.some(
				(i) =>
					i.source_id === `build:${unconsumedDecisionResult.details.path}` &&
					i.next_loop === "planning",
			),
			"Unconsumed decision build should route to planning",
		);
		assert.ok(
			!items.some(
				(i) =>
					i.source_id === `build:${implResult.details.path}` &&
					i.next_loop === "validation",
			),
			"Validated implementation build should not stay in reconciliation",
		);
		assert.ok(
			items.some(
				(i) =>
					i.source_id === `validation:${failResult.details.path}` &&
					i.next_loop === "decision",
			),
			"Fail validation not routing to decision",
		);
		assert.ok(
			!items.some(
				(i) => i.source_id === `build:${supersededDecisionResult.details.path}`,
			),
			"Superseded decision cycle should not route reconciliation",
		);
		assert.ok(
			graph.nodes
				.find(
					(node) =>
						node.id === `build:${supersededDecisionResult.details.path}`,
				)
				?.superseded_by?.includes(replacementDecisionResult.details.path),
			"Superseded build node should point at replacement cycle",
		);
		assert.ok(
			graph.views?.traceability?.rows?.some(
				(row) =>
					row.requirement_id === "DTR-003" &&
					row.gaps.includes("missing_planning_build"),
			),
			"Traceability should expose missing planning for unconsumed downstream decision",
		);
		const restoreEntry = graph.views?.archive?.restore_index?.find(
			(entry) => entry.id === "TASK-001",
		);
		assert.ok(
			restoreEntry,
			"Explicit archive view should expose compact restore index entry",
		);
		assert.equal(
			restoreEntry.archive_ref,
			"refs/codewiki/archive/task/TASK-001",
		);
		assert.equal(restoreEntry.restore_command, "/wiki-restore TASK-001");
		assert.equal(
			graph.views?.gc?.restore_index,
			undefined,
			"Default GC view must not expose restore index",
		);
		assert.equal(
			graph.views?.gc?.classes?.cold?.archive_refs,
			undefined,
			"Default GC view must not expose archive refs",
		);
		assert.ok(
			graph.views?.archive?.git_archive?.archive_refs?.includes(
				"refs/codewiki/archive/task/TASK-001",
			),
			"Explicit archive view should expose archive refs",
		);
		assert.ok(
			graph.views?.archive?.git_archive?.blocked_purge_build_paths?.includes(
				implResult.details.path,
			),
			"Unsafe publication should block purge despite archive metadata",
		);

		console.log("✓ build and validation smoke tests passed");
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

// ---- helpers (minimal copies from smoke-test.mjs) ----
function findPiRoot() {
	const candidates = [
		resolve(
			import.meta.dirname,
			"..",
			"..",
			"node_modules",
			"@earendil-works",
			"pi-coding-agent",
		),
		resolve(
			import.meta.dirname,
			"..",
			"..",
			"..",
			"@earendil-works",
			"pi-coding-agent",
		),
	];
	for (const c of candidates) {
		try {
			if (readFileSync(resolve(c, "dist", "index.js"))) return c;
		} catch {}
	}
	try {
		const globalRoot = execFileSync("npm", ["root", "-g"], {
			encoding: "utf8",
		}).trim();
		const candidate = resolve(globalRoot, "@earendil-works", "pi-coding-agent");
		try {
			if (readFileSync(resolve(candidate, "dist", "index.js")))
				return candidate;
		} catch {}
	} catch {}
	throw new Error("Cannot find pi-coding-agent");
}

function extendNodePath(piRoot) {
	const extras = resolve(piRoot, "node_modules");
	try {
		if (statSync(extras).isDirectory()) {
			for (const name of readdirSync(extras)) {
				if (name.startsWith("@")) {
					const scope = resolve(extras, name);
					for (const child of readdirSync(scope)) {
						process.env.NODE_PATH = `${process.env.NODE_PATH || ""}:${resolve(scope, child)}`;
					}
				} else {
					process.env.NODE_PATH = `${process.env.NODE_PATH || ""}:${resolve(extras, name)}`;
				}
			}
		}
	} catch {}
	module.Module._initPaths();
}

run().catch((err) => {
	console.error("✗ build and validation smoke tests failed");
	console.error(String(err?.stack || err));
	process.exit(1);
});
