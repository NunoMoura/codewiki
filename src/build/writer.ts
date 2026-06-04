import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { normalizeDecisionTableUserAction } from "../change/types.ts";
import type { CodewikiDecisionTableV1 } from "../telemetry/types.ts";
import type {
	CodewikiBuildProducesInput,
	CodewikiBuildRefsInput,
	CodewikiBuildToolInput,
	CodewikiClosureBriefInput,
	CodewikiDecisionTableRowInput,
} from "./types.ts";
import {
	normalizeDecisionQuestionResolutions,
	normalizeDecisionRowResolutions,
} from "./decision-propagation.ts";
import type { WikiProject } from "../project/types.ts";
import type { RoadmapTaskRecord } from "../roadmap/types.ts";
import { nowIso, unique } from "../shared/utils.ts";
import { readRoadmapTask } from "../roadmap/store.ts";
import { maybeReadGraph } from "../state/artifacts.ts";
import { requiredAuditProfiles } from "../policy/gate-policy.ts";
import {
	buildArtifactDigests,
	buildBuildPath,
	buildLifecycle,
	buildSlug,
	buildTraceability,
	sha256Text,
	trimList,
} from "./shared.ts";

function trimRefGroups(input?: CodewikiBuildRefsInput): CodewikiBuildRefsInput {
	return {
		decision: trimList(input?.decision),
		planning: trimList(input?.planning),
		implementation: trimList(input?.implementation),
		roadmap: trimList(input?.roadmap),
		validation: trimList(input?.validation),
		source: trimList(input?.source),
	};
}

function trimProduces(
	input?: CodewikiBuildProducesInput,
): CodewikiBuildProducesInput {
	return {
		knowledge: trimList(input?.knowledge),
		roadmap: trimList(input?.roadmap),
		code: trimList(input?.code),
		tests: trimList(input?.tests),
		validation: trimList(input?.validation),
		publication: trimList(input?.publication),
		closure: trimList(input?.closure),
	};
}

function mergeProduces(
	base: CodewikiBuildProducesInput,
	overrides?: CodewikiBuildProducesInput,
): CodewikiBuildProducesInput {
	const extra = trimProduces(overrides);
	return {
		knowledge: unique([...(base.knowledge ?? []), ...(extra.knowledge ?? [])]),
		roadmap: unique([...(base.roadmap ?? []), ...(extra.roadmap ?? [])]),
		code: unique([...(base.code ?? []), ...(extra.code ?? [])]),
		tests: unique([...(base.tests ?? []), ...(extra.tests ?? [])]),
		validation: unique([
			...(base.validation ?? []),
			...(extra.validation ?? []),
		]),
		publication: unique([
			...(base.publication ?? []),
			...(extra.publication ?? []),
		]),
		closure: unique([...(base.closure ?? []), ...(extra.closure ?? [])]),
	};
}

function normalizeCycle(input: CodewikiBuildToolInput, loop: string) {
	return {
		loop,
		sequence: input.cycle?.sequence ?? 1,
		attempt: String(input.cycle?.attempt || "").trim() || undefined,
		supersedes: trimList(input.cycle?.supersedes),
		status: String(
			input.cycle?.status || input.lifecycle?.state || "accepted",
		).trim(),
	};
}

function isolationBoundary(
	required: boolean,
	mode: string,
	reason: string,
	evidence: string[],
	handoff: string,
	profiles: string[] = [],
) {
	return { required, mode, reason, evidence, handoff, profiles };
}

function defaultIsolationPolicy(loop: string) {
	const nextLoop =
		loop === "decision"
			? "planning"
			: loop === "planning"
				? "implementation"
				: "validation";
	const compilerBoundary = isolationBoundary(
		false,
		"agent-owned-new-session",
		"Compiler loops start from CodeWiki source refs; agents may refresh context when chat is noisy, stale, or token-heavy.",
		[
			"source build/task refs read",
			"new_session or context_refresh when useful",
		],
		`${loop}_loop context boundary`,
	);
	const semanticValidation = loop === "implementation";
	return {
		loop_start: compilerBoundary,
		validation: semanticValidation
			? isolationBoundary(
					true,
					"fresh-context-checked-content",
					"Implementation validation must not reuse builder thought context and must cite checked content proof.",
					[
						"fresh_context=true",
						"clean state recorded",
						"validated_sha/head_sha/published_sha/tree_sha or working_tree_digest",
					],
					"implementation_build -> validation gateway",
					["implementation"],
				)
			: isolationBoundary(
					false,
					"fresh-context-preferred",
					"Fresh validation is preferred; policy may require it for high-risk semantic gates.",
					["fresh_context=true when high-risk or policy-required"],
					`${loop}_build -> validation gateway`,
				),
		next_loop:
			loop === "implementation"
				? isolationBoundary(
						true,
						"fresh-context-checked-content",
						"The next gateway must independently validate implementation evidence and cite checked content proof.",
						[
							"fresh_context=true",
							"clean state recorded",
							"validated_sha/head_sha/published_sha/tree_sha or working_tree_digest",
						],
						"implementation_build -> validation gateway",
						["implementation"],
					)
				: isolationBoundary(
						false,
						"agent-owned-new-session",
						"The next compiler loop should start from CodeWiki source refs; the agent may refresh context when useful.",
						["source build ref", "new_session or context_refresh when useful"],
						`${loop}_build -> ${nextLoop}_loop`,
					),
	};
}

function mergeIsolationBoundary(
	base: ReturnType<typeof isolationBoundary>,
	override: any,
) {
	if (!override || typeof override !== "object") return base;
	return {
		required:
			typeof override.required === "boolean"
				? override.required
				: base.required,
		mode: String(override.mode || base.mode).trim(),
		reason: String(override.reason || base.reason).trim(),
		evidence: unique([...base.evidence, ...trimList(override.evidence)]),
		handoff: String(override.handoff || base.handoff).trim(),
		profiles: unique([...base.profiles, ...trimList(override.profiles)]),
	};
}

function normalizeIsolationPolicy(input: CodewikiBuildToolInput, loop: string) {
	const defaults = defaultIsolationPolicy(loop);
	const overrides = input.policy?.isolation;
	return {
		loop_start: mergeIsolationBoundary(
			defaults.loop_start,
			overrides?.loop_start,
		),
		validation: mergeIsolationBoundary(
			defaults.validation,
			overrides?.validation,
		),
		next_loop: mergeIsolationBoundary(defaults.next_loop, overrides?.next_loop),
	};
}

function normalizePolicy(
	input: CodewikiBuildToolInput,
	defaultProfile: string,
	loop: string,
) {
	const profile = String(input.policy?.profile || defaultProfile).trim();
	return {
		profile,
		exit_criteria: trimList(input.policy?.exit_criteria),
		required_audits: requiredAuditProfiles(
			profile,
			input.policy?.required_audits,
		),
		audit_refs: trimList(input.policy?.audit_refs),
		audit_reports: trimList(input.policy?.audit_reports),
		isolation: normalizeIsolationPolicy(input, loop),
	};
}

function normalizeRequirements(input: CodewikiBuildToolInput) {
	return (input.requirements ?? [])
		.map((requirement) => ({
			id: String(requirement.id || "").trim(),
			text: String(requirement.text || "").trim(),
			source_refs: trimList(requirement.source_refs),
			state: String(requirement.state || "accepted").trim(),
		}))
		.filter((requirement) => requirement.id && requirement.text);
}

function normalizeEvidenceMapping(input: CodewikiBuildToolInput) {
	return (input.evidence_mapping ?? [])
		.map((mapping) => ({
			criterion: String(mapping.criterion || "").trim(),
			evidence: String(mapping.evidence || "").trim(),
			requirement_ids: trimList(mapping.requirement_ids),
			source_refs: trimList(mapping.source_refs),
		}))
		.filter((mapping) => mapping.criterion && mapping.evidence);
}

function buildCycleFields(
	input: CodewikiBuildToolInput,
	loop: string,
	defaultPolicyProfile: string,
) {
	return {
		cycle: normalizeCycle(input, loop),
		policy: normalizePolicy(input, defaultPolicyProfile, loop),
		requirements: normalizeRequirements(input),
		evidence_mapping: normalizeEvidenceMapping(input),
		audit_refs: trimList(input.audit_refs),
		audit_reports: trimList(input.audit_reports),
		agent_assessment: String(input.agent_assessment || "").trim(),
	};
}

function normalizeDecisionTableRows(rows?: CodewikiDecisionTableRowInput[]) {
	return (rows ?? [])
		.map((row, index) => {
			const currentState = String(
				row.current_state ||
					row.current_project_state ||
					"Current state not specified.",
			).trim();
			const desiredState = String(
				row.desired_state ||
					row.expected_final_state ||
					row.agreed_change ||
					"",
			).trim();
			const userAction = normalizeDecisionTableUserAction(row.user_action);
			const approvalStatus = normalizeDecisionTableUserAction(
				row.status,
				userAction,
			);
			const risk = String(row.risk || "medium").trim();
			return {
				id: String(
					row.id || `DTR-${String(index + 1).padStart(3, "0")}`,
				).trim(),
				question: String(
					(row as any).question || row.id || `Decision row ${index + 1}`,
				).trim(),
				state_delta: {
					current: currentState,
					desired: desiredState,
				},
				proposed_change: String(row.agreed_change || desiredState).trim(),
				rationale: String(row.rationale || "Decision row accepted.").trim(),
				impact: { system: trimList(row.affected_layers) },
				risk: ["low", "medium", "high"].includes(risk)
					? { level: risk as "low" | "medium" | "high" }
					: { level: "medium" as const, notes: risk },
				options: trimList(row.alternatives).map((alternative, optionIndex) => ({
					id: `ALT-${optionIndex + 1}`,
					label: alternative,
				})),
				approval: { status: approvalStatus as any },
				evidence_refs: trimList(row.proof_refs).map((ref) => ({ ref })),
				expected_outcome: String(
					row.expected_final_state || desiredState,
				).trim(),
				validated_outcome: String(row.validated_final_state || "").trim(),
			};
		})
		.filter((row) => row.state_delta.current && row.state_delta.desired);
}

function normalizeDecisionTable(
	input: CodewikiBuildToolInput,
	created: string,
): CodewikiDecisionTableV1 {
	const raw = input.decision_table as any;
	const rows = Array.isArray(raw)
		? normalizeDecisionTableRows(raw)
		: Array.isArray(raw?.rows)
			? raw.rows
			: [];
	return {
		schema_version: 1,
		id: String(
			raw?.id || buildSlug(input.slug || input.summary, "decision-table"),
		).toUpperCase(),
		title: String(raw?.title || input.summary).trim(),
		status: raw?.status ||
			(rows.some((row: any) => row.approval?.status === "approved")
				? "approved"
				: "pending"),
		rows,
		created_at: String(raw?.created_at || created),
		updated_at: String(raw?.updated_at || created),
	};
}

function approvedDecisionRows(
	table: CodewikiDecisionTableV1,
	approvedIds?: string[],
) {
	const explicitApproved = new Set(trimList(approvedIds));
	return table.rows.filter(
		(row) =>
			row.approval?.status === "approved" || explicitApproved.has(row.id),
	);
}

function normalizeDecisionKbMappings(input: CodewikiBuildToolInput) {
	return (input.row_to_kb_mappings ?? [])
		.map((mapping) => ({
			row_id: String(mapping.row_id || "").trim(),
			knowledge_refs: trimList(mapping.knowledge_refs),
			diagram_refs: trimList(mapping.diagram_refs),
			evidence: String(mapping.evidence || "").trim(),
			deferred: Boolean(mapping.deferred),
			deferred_reason:
				String(mapping.deferred_reason || "").trim() || undefined,
		}))
		.filter((mapping) => mapping.row_id && mapping.evidence);
}

function normalizeDecisionPropagation(input: CodewikiBuildToolInput) {
	const propagation = input.propagation || {};
	return {
		direction: String(propagation.direction || "").trim() || undefined,
		product_impact: trimList(propagation.product_impact),
		system_impact: trimList(propagation.system_impact),
		no_product_impact:
			String(propagation.no_product_impact || "").trim() || undefined,
		no_system_impact:
			String(propagation.no_system_impact || "").trim() || undefined,
		downstream_planning_questions: trimList(
			propagation.downstream_planning_questions,
		),
	};
}

function normalizeClosureBrief(
	input: CodewikiClosureBriefInput | undefined,
	task: RoadmapTaskRecord | null,
	checksRun: string[],
	acceptanceEvidence: string[],
	validationRefs: string[],
	risks: string[],
) {
	if (!input) return null;
	return {
		user_intent: String(input.user_intent || task?.goal?.outcome || "").trim(),
		implemented_changes: trimList(input.implemented_changes),
		layers_updated: {
			knowledge: trimList(input.layers_updated?.knowledge),
			roadmap: trimList(input.layers_updated?.roadmap),
			code: trimList(input.layers_updated?.code),
			tests: trimList(input.layers_updated?.tests),
			validation: unique([
				...trimList(input.layers_updated?.validation),
				...validationRefs,
			]),
		},
		acceptance_evidence: trimList(input.acceptance_evidence).length
			? trimList(input.acceptance_evidence)
			: acceptanceEvidence,
		checks: trimList(input.checks).length ? trimList(input.checks) : checksRun,
		non_goals_preserved: trimList(input.non_goals_preserved),
		remaining_risks: trimList(input.remaining_risks).length
			? trimList(input.remaining_risks)
			: risks,
	};
}

function taskSnapshot(task: RoadmapTaskRecord | null) {
	if (!task) return undefined;
	return {
		id: task.id,
		title: task.title,
		status: task.status,
		priority: task.priority,
		kind: task.kind,
		summary: task.summary,
		spec_paths: task.spec_paths,
		code_paths: task.code_paths,
		goal: task.goal,
	};
}

async function nextFocusTaskId(
	project: WikiProject,
	currentTaskId: string,
): Promise<string> {
	const graph = (await maybeReadGraph(project.graphPath)) as any;
	const openTaskIds = Array.isArray(
		graph?.lenses?.roadmap?.views?.open_task_ids,
	)
		? graph.lenses.roadmap.views.open_task_ids
				.map((id: unknown) => String(id).trim())
				.filter(Boolean)
		: [];
	return openTaskIds.find((id: string) => id !== currentTaskId) || "";
}

function publicationDefaults(
	input: CodewikiBuildToolInput,
	task: RoadmapTaskRecord | null,
	checksRun: string[],
	validationRefs: string[],
	buildPath: string,
	artifactDigests: ReturnType<typeof buildArtifactDigests>,
	payloadDigest: string,
) {
	const taskId = input.task_id?.trim() || task?.id || "implementation-work";
	const taskLabel = task ? `${task.id} ${task.title}` : taskId;
	const archiveRef =
		input.publication?.archive_ref?.trim() ||
		`refs/codewiki/archive/task/${taskId}`;
	const restoreCommand =
		input.publication?.restore_command?.trim() || `/wiki-restore ${taskId}`;
	const commitTitle =
		input.publication?.commit_title?.trim() ||
		`chore(codewiki): record ${taskLabel} implementation evidence`;
	const checksTrailerValue = checksRun.length
		? checksRun.join(", ")
		: "<missing-checks>";
	const validationTrailerValue = validationRefs.length
		? validationRefs.join(", ")
		: "<pending-validation>";
	const trailers = [
		`CodeWiki-Task: ${taskId}`,
		`CodeWiki-Build: ${buildPath}`,
		`CodeWiki-Checks: ${checksTrailerValue}`,
		`CodeWiki-Validation: ${validationTrailerValue}`,
		`CodeWiki-Recover: ${restoreCommand}`,
		`CodeWiki-Archive-Ref: ${archiveRef}`,
		`CodeWiki-Digest: ${payloadDigest}`,
		`CodeWiki-Restore: ${restoreCommand}`,
	];
	const commitBody =
		input.publication?.commit_body?.trim() ||
		[
			input.summary.trim(),
			"",
			checksRun.length
				? `Checks: ${checksRun.join(", ")}`
				: "Checks: not recorded in build input.",
			validationRefs.length
				? `Validation: ${validationRefs.join(", ")}`
				: "Validation: no durable validation refs recorded.",
			"Remote publication requires explicit approval; this build is recommendation-only.",
			"",
			...trailers,
		].join("\n");
	const secretScan = input.publication?.secret_scan?.trim() || "required";
	const remoteVisibility =
		input.publication?.remote_visibility?.trim() || "required";
	const privateEvidence =
		input.publication?.private_evidence?.trim() || "required";
	const safeToPush =
		input.publication?.safe_to_push === true &&
		secretScan === "pass" &&
		remoteVisibility === "pass" &&
		privateEvidence === "pass";
	const publisherQueue = {
		status: validationRefs.length
			? "ready_for_publisher"
			: "waiting_validation",
		task_id: taskId,
		source_build: buildPath,
		role: "publisher",
		inputs: {
			builder_refs: unique([
				...trimList(input.code_files),
				...trimList(input.test_files),
				...trimList(input.produces?.code),
				...trimList(input.produces?.tests),
			]),
			validation_refs: validationRefs,
			archive_ref: archiveRef,
			restore_command: restoreCommand,
		},
		required_steps: [
			"consume implementation_build from fresh publisher context",
			"refresh generated CodeWiki state",
			"verify validation refs and checks",
			"create clean publisher commit/tree or archive ref",
			"record immutable publisher result proof",
		],
		result: {
			state: "pending",
			required_proof: [
				"clean=true",
				"published_sha",
				"tree_sha",
				"archive_ref or remote_ref",
			],
		},
	};
	return {
		policy: {
			execution: "recommendation_only",
			approval_required: true,
			remote_updates: "blocked_until_explicit_approval",
			security_review_required: true,
		},
		commit: {
			title: commitTitle,
			body: commitBody,
			trailers,
			commit_ready: checksRun.length > 0,
			validation_ref_policy: validationRefs.length
				? "validation refs recorded"
				: "replace <pending-validation> with validation report ref before commit",
		},
		pr: {
			title: input.publication?.pr_title?.trim() || commitTitle,
			body: input.publication?.pr_body?.trim() || commitBody,
		},
		issue_update: input.publication?.issue_update?.trim() || "",
		release_notes: input.publication?.release_notes?.trim() || "",
		git: {
			strategy: "implementation_build_publication_payload",
			archive_ref: archiveRef,
			commit_sha: input.publication?.commit_sha?.trim() || "",
			remote: input.publication?.remote?.trim() || "origin",
			branch: input.publication?.branch?.trim() || "",
			atomic_push_refspecs: ["HEAD", archiveRef],
			restore: {
				command: restoreCommand,
				worktree: `git worktree add --detach <tmp> ${archiveRef}`,
				show_build: `git show ${archiveRef}:${buildPath}`,
				sparse_paths: unique([
					buildPath,
					...(task?.spec_paths ?? []),
					...(task?.code_paths ?? []),
				]),
				note: "Restored history is reference material until promoted into active knowledge or roadmap truth.",
			},
		},
		archive_ledger: {
			kind: "task",
			id: taskId,
			build_path: buildPath,
			archive_ref: archiveRef,
			commit_sha: input.publication?.commit_sha?.trim() || "",
			digest: payloadDigest,
			restore_command: restoreCommand,
		},
		artifact_digests: artifactDigests,
		publisher_queue: publisherQueue,
		push_readiness: {
			checks_recorded: checksRun,
			validation_refs: validationRefs,
			approval_required: true,
			allowed_by_default: false,
			safe_to_push: safeToPush,
			blocked_reasons: safeToPush
				? []
				: [
						input.publication?.safe_to_push === true
							? "publication safety prerequisites incomplete"
							: "explicit approval required",
						secretScan === "pass" ? "" : "secret scan required",
						remoteVisibility === "pass"
							? ""
							: "remote visibility review required",
						privateEvidence === "pass"
							? ""
							: "fail/block/private evidence policy required",
					].filter(Boolean),
			security: {
				secret_scan: secretScan,
				remote_visibility: remoteVisibility,
				private_evidence: privateEvidence,
				git_namespaces: "not_access_control",
			},
		},
	};
}

// ---------------------------------------------------------------------------
// Build writers
// ---------------------------------------------------------------------------

export async function writeDecisionBuild(
	project: WikiProject,
	input: CodewikiBuildToolInput,
) {
	if (!input.summary?.trim())
		throw new Error("Decision build requires summary.");

	const created = nowIso();
	const decisionTable = normalizeDecisionTable(input, created);
	const approvedRows = approvedDecisionRows(
		decisionTable,
		input.approved_decision_rows,
	);
	const decisions = trimList(input.decisions).length
		? trimList(input.decisions)
		: approvedRows.map((row) => row.proposed_change);
	const slug = buildSlug(input.slug || input.summary, "decision-build");
	const day = created.slice(0, 10);
	const absPath = buildBuildPath(project, "decision", slug, day);
	const lifecycle = buildLifecycle(input, created, 30);
	const mode = String(
		input.decision_mode ||
			(lifecycle.state === "proposed" ? "proposal" : "accepted"),
	).trim();
	if (!["proposal", "accepted"].includes(mode))
		throw new Error("Decision build mode must be proposal or accepted.");
	if (mode === "proposal") lifecycle.state = "proposed";
	if (mode === "accepted" && lifecycle.state === "proposed")
		throw new Error(
			"Accepted decision build cannot use proposed lifecycle state.",
		);

	const knowledgeChanges = trimList(input.knowledge_changes);
	const roadmapChanges = trimList(input.roadmap_changes);
	const rowToKbMappings = normalizeDecisionKbMappings(input);
	const propagation = normalizeDecisionPropagation(input);
	const diagramRefs = unique([
		...trimList(input.diagram_refs),
		...rowToKbMappings.flatMap((mapping) => mapping.diagram_refs),
	]);
	const downstreamPlanningQuestions = unique([
		...trimList(input.downstream_planning_questions),
		...propagation.downstream_planning_questions,
	]);
	const producedKnowledge = unique([
		...knowledgeChanges,
		...trimList(input.produces?.knowledge),
		...rowToKbMappings.flatMap((mapping) => mapping.knowledge_refs),
	]);

	if (mode === "proposal") {
		if (
			approvedRows.length > 0 ||
			knowledgeChanges.length > 0 ||
			rowToKbMappings.length > 0
		) {
			throw new Error(
				"Proposal decision build must not record approved rows or canonical KB changes.",
			);
		}
	} else {
		if (approvedRows.length === 0)
			throw new Error(
				"Accepted decision build requires at least one approved decision_table row.",
			);
		if (!decisions.length)
			throw new Error(
				"Decision build requires at least one accepted decision or approved decision_table row.",
			);
		if (rowToKbMappings.length === 0)
			throw new Error("Accepted decision build requires row_to_kb_mappings.");
		const mappedRows = new Set(
			rowToKbMappings.map((mapping) => mapping.row_id),
		);
		const missingRows = approvedRows
			.map((row) => row.id)
			.filter((rowId) => !mappedRows.has(rowId));
		if (missingRows.length)
			throw new Error(
				`Accepted decision build missing row_to_kb_mappings for ${missingRows.join(", ")} .`.replace(
					" .",
					".",
				),
			);
		if (!propagation.direction)
			throw new Error(
				"Accepted decision build requires propagation.direction.",
			);
		if (
			propagation.direction === "product-first" &&
			!propagation.system_impact.length &&
			!propagation.no_system_impact
		) {
			throw new Error(
				"Product-first decision build requires system_impact or no_system_impact evidence.",
			);
		}
		if (
			propagation.direction === "system-first" &&
			!propagation.product_impact.length &&
			!propagation.no_product_impact
		) {
			throw new Error(
				"System-first decision build requires product_impact or no_product_impact evidence.",
			);
		}
	}

	const consumes = trimRefGroups(input.consumes);
	const produces = mergeProduces(
		{
			knowledge: producedKnowledge,
			roadmap: roadmapChanges,
		},
		input.produces,
	);
	const traceability = buildTraceability("decision", input, consumes, produces);
	const data = {
		version: 1,
		schema_version: input.schema_version ?? 2,
		kind: "decision_build",
		created,
		source: input.source?.trim() || "wiki_build tool",
		status: lifecycle.state,
		lifecycle,
		...buildCycleFields(input, "decision", "decision"),
		summary: input.summary.trim(),
		decision_mode: mode,
		decision_table: decisionTable,
		approved_decision_rows: approvedRows.map((row) => row.id),
		approved_rows: approvedRows,
		accepted_decisions: decisions.map((summary, index) => ({
			id: `D${index + 1}`,
			summary,
		})),
		knowledge_changes: knowledgeChanges,
		roadmap_changes: roadmapChanges,
		row_to_kb_mappings: rowToKbMappings,
		propagation,
		diagram_refs: diagramRefs,
		downstream_planning_questions: downstreamPlanningQuestions,
		assumptions: trimList(input.assumptions),
		open_questions: trimList(input.open_questions),
		non_goals: trimList(input.non_goals),
		risks: trimList(input.risks),
		change_type: traceability.change_type,
		traceability,
		consumes,
		produces,
	};
	await mkdir(dirname(absPath), { recursive: true });
	await writeFile(absPath, JSON.stringify(data, null, 2) + "\n", "utf8");
	const relPath = `.codewiki/builds/decision/${day}-${slug}.json`;
	return { path: relPath, data };
}

export async function writePlanningBuild(
	project: WikiProject,
	input: CodewikiBuildToolInput,
) {
	if (!input.summary?.trim())
		throw new Error("Planning build requires summary.");
	if (!input.source_decision_build?.trim())
		throw new Error("Planning build requires source_decision_build.");

	const created = nowIso();
	const slug = buildSlug(input.slug || input.summary, "planning-build");
	const day = created.slice(0, 10);
	const absPath = buildBuildPath(project, "planning", slug, day);
	const lifecycle = buildLifecycle(input, created, 14);
	const sourceDecisionBuild = input.source_decision_build.trim();
	const taskIds = trimList(input.task_ids);
	const taskChanges = trimList(input.task_changes).length
		? trimList(input.task_changes)
		: trimList(input.roadmap_changes);
	const tddPlan = trimList(input.tdd_plan);
	const candidateTestFiles = trimList(input.candidate_test_files);
	const candidateCodePaths = trimList(input.candidate_code_paths);
	const decisionRowResolutions = normalizeDecisionRowResolutions(input);
	const downstreamQuestionResolutions =
		normalizeDecisionQuestionResolutions(input);
	const consumes = trimRefGroups({
		...input.consumes,
		decision: unique([
			sourceDecisionBuild,
			...(input.consumes?.decision ?? []),
		]),
		roadmap: unique([...taskIds, ...(input.consumes?.roadmap ?? [])]),
	});
	const produces = mergeProduces(
		{
			roadmap: taskIds,
			tests: candidateTestFiles,
			code: candidateCodePaths,
		},
		input.produces,
	);
	const traceability = buildTraceability("planning", input, consumes, produces);
	const data = {
		version: 1,
		schema_version: input.schema_version ?? 2,
		kind: "planning_build",
		created,
		source: input.source?.trim() || "wiki_build tool",
		source_decision_build: sourceDecisionBuild,
		status: lifecycle.state,
		lifecycle,
		...buildCycleFields(input, "planning", "planning"),
		summary: input.summary.trim(),
		task_ids: taskIds,
		task_changes: taskChanges,
		roadmap_changes: taskChanges,
		tdd_plan: tddPlan,
		candidate_test_files: candidateTestFiles,
		candidate_code_paths: candidateCodePaths,
		decision_row_resolutions: decisionRowResolutions,
		downstream_question_resolutions: downstreamQuestionResolutions,
		acceptance_mapping: normalizeEvidenceMapping(input).length
			? normalizeEvidenceMapping(input)
			: (input.acceptance_mapping ?? []).filter(
					(m) => m.criterion.trim() && m.evidence.trim(),
				),
		assumptions: trimList(input.assumptions),
		open_questions: trimList(input.open_questions),
		non_goals: trimList(input.non_goals),
		risks: trimList(input.risks),
		change_type: traceability.change_type,
		traceability,
		consumes,
		produces,
	};
	await mkdir(dirname(absPath), { recursive: true });
	await writeFile(absPath, JSON.stringify(data, null, 2) + "\n", "utf8");
	const relPath = `.codewiki/builds/planning/${day}-${slug}.json`;
	return { path: relPath, data };
}

export async function writeImplementationBuild(
	project: WikiProject,
	input: CodewikiBuildToolInput,
) {
	if (!input.summary?.trim())
		throw new Error("Implementation build requires summary.");
	if (!input.task_id?.trim())
		throw new Error("Implementation build requires task_id.");

	const taskId = input.task_id.trim();
	const task = await readRoadmapTask(project, taskId);
	const created = nowIso();
	const slug = buildSlug(input.slug || input.summary, "implementation-build");
	const day = created.slice(0, 10);
	const absPath = buildBuildPath(project, "implementation", slug, day);
	const relPath = `.codewiki/builds/implementation/${day}-${slug}.json`;
	const lifecycle = buildLifecycle(input, created, 7);
	const testFiles = trimList(input.test_files);
	const codeFiles = trimList(input.code_files);
	const checksRun = trimList(input.checks_run);
	const testDesignEvidence = trimList(input.test_design_evidence);
	const codeChangeEvidence = trimList(input.code_change_evidence);
	const testerNotes = trimList(input.tester_notes);
	const builderNotes = trimList(input.builder_notes);
	const validationRefs = trimList(input.validation_refs);
	const risks = trimList(input.risks);
	const openQuestions = trimList(input.open_questions);
	const nextFocus = await nextFocusTaskId(project, taskId);
	const sourcePlanningBuild = (input.source_planning_build ?? "").trim();
	const acceptanceMapping = (input.acceptance_mapping ?? []).filter(
		(m) => m.criterion.trim() && m.evidence.trim(),
	);
	const acceptanceEvidence = acceptanceMapping.map(
		(mapping) => `${mapping.criterion}: ${mapping.evidence}`,
	);
	const closureBrief = normalizeClosureBrief(
		input.closure_brief,
		task,
		checksRun,
		acceptanceEvidence,
		validationRefs,
		risks,
	);
	if (lifecycle.state === "accepted" && !closureBrief) {
		throw new Error("Accepted implementation build requires closure_brief.");
	}
	if (
		closureBrief &&
		(!closureBrief.user_intent ||
			closureBrief.implemented_changes.length === 0 ||
			closureBrief.acceptance_evidence.length === 0 ||
			closureBrief.checks.length === 0)
	) {
		throw new Error(
			"closure_brief requires user_intent, implemented_changes, acceptance_evidence, and checks.",
		);
	}
	const compactContext = {
		source: "implementation_build",
		task_id: taskId,
		title: task?.title ?? taskId,
		summary: input.summary.trim(),
		spec_paths: task?.spec_paths ?? [],
		code_paths: unique([...(task?.code_paths ?? []), ...codeFiles]),
		acceptance: task?.goal?.acceptance ?? [],
		verification: task?.goal?.verification ?? [],
		source_planning_build: sourcePlanningBuild || "",
		checks_run: checksRun,
		test_design_evidence: testDesignEvidence,
		code_change_evidence: codeChangeEvidence,
		validation_refs: validationRefs,
	};
	const roleEvidence = {
		tester: {
			role: "tester",
			source_planning_build: sourcePlanningBuild || "",
			roadmap_task_id: taskId,
			test_files: testFiles,
			evidence: testDesignEvidence,
			notes: testerNotes,
			boundary:
				"derive tests or test-design evidence before code changes where practical",
		},
		builder: {
			role: "builder",
			source_planning_build: sourcePlanningBuild || "",
			roadmap_task_id: taskId,
			code_files: codeFiles,
			evidence: codeChangeEvidence,
			notes: builderNotes,
			boundary:
				"change code until tests, roadmap acceptance, and required checks pass",
		},
	};
	const consumes = trimRefGroups({
		...input.consumes,
		planning: unique([
			...(sourcePlanningBuild ? [sourcePlanningBuild] : []),
			...(input.consumes?.planning ?? []),
		]),
		roadmap: unique([taskId, ...(input.consumes?.roadmap ?? [])]),
	});
	const produces = mergeProduces(
		{
			code: codeFiles,
			tests: testFiles,
			validation: validationRefs,
			closure: [taskId],
		},
		input.produces,
	);
	const traceability = buildTraceability(
		"implementation",
		input,
		consumes,
		produces,
	);
	const artifactDigests = buildArtifactDigests(project, [
		...(sourcePlanningBuild
			? [{ path: sourcePlanningBuild, role: "source_planning_build" }]
			: []),
		...validationRefs.map((path) => ({ path, role: "validation_ref" })),
		...testFiles.map((path) => ({ path, role: "test_file" })),
		...codeFiles.map((path) => ({ path, role: "code_file" })),
	]);
	const payloadDigest = sha256Text(
		JSON.stringify({
			task_id: taskId,
			summary: input.summary.trim(),
			checks_run: checksRun,
			validation_refs: validationRefs,
			files_changed: unique([...testFiles, ...codeFiles]),
			closure_brief: closureBrief,
			artifact_digests: artifactDigests,
		}),
	);
	const publication = publicationDefaults(
		input,
		task,
		checksRun,
		validationRefs,
		relPath,
		artifactDigests,
		payloadDigest,
	);
	const data = {
		version: 1,
		schema_version: input.schema_version ?? 2,
		kind: "implementation_build",
		created,
		source: input.source?.trim() || "wiki_build tool",
		source_planning_build: sourcePlanningBuild || undefined,
		task_id: taskId,
		task: taskSnapshot(task),
		status: lifecycle.state,
		lifecycle,
		...buildCycleFields(input, "implementation", "implementation"),
		summary: input.summary.trim(),
		change_type: traceability.change_type,
		traceability,
		consumes,
		produces,
		linked_refs: {
			planning_build: sourcePlanningBuild || "",
			spec_paths: task?.spec_paths ?? [],
			code_paths: task?.code_paths ?? [],
		},
		test_files: testFiles,
		code_files: codeFiles,
		files_changed: unique([...testFiles, ...codeFiles]),
		checks_run: checksRun,
		role_evidence: roleEvidence,
		test_design_evidence: testDesignEvidence,
		code_change_evidence: codeChangeEvidence,
		acceptance_mapping: acceptanceMapping,
		validation_refs: validationRefs,
		closure_brief: closureBrief || undefined,
		risks,
		unresolved_issues: openQuestions,
		open_questions: openQuestions,
		handoff: {
			resume: {
				source: "implementation_build",
				command: `/wiki-resume ${taskId}`,
				task_id: taskId,
				next_focus_task_id: nextFocus,
				context: compactContext,
			},
			restore: publication.git.restore,
			fallback:
				"Use wiki_state refresh=true and this implementation_build; do not rely on chat transcript memory.",
		},
		publication,
	};
	await mkdir(dirname(absPath), { recursive: true });
	await writeFile(absPath, JSON.stringify(data, null, 2) + "\n", "utf8");
	return { path: relPath, data };
}

export async function writeBuild(
	project: WikiProject,
	input: CodewikiBuildToolInput,
) {
	switch (input.kind) {
		case "decision":
			return writeDecisionBuild(project, input);
		case "planning":
			return writePlanningBuild(project, input);
		case "implementation":
			return writeImplementationBuild(project, input);
		default:
			throw new Error(`Unsupported build kind: ${(input as any).kind}`);
	}
}
