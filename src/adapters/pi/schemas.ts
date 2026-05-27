import { Type } from "@sinclair/typebox";
import {
	AGENCY_MODE_VALUES,
	AGENCY_RISK_VALUES,
	AGENCY_SCOPE_KIND_VALUES,
	AGENCY_TRIGGER_VALUES,
	SUBAGENT_PROPOSAL_VALUES,
	SUBAGENT_ROLE_VALUES,
	SUBAGENT_VERDICT_VALUES,
} from "../../agency/types.ts";
import { AUDIT_PROFILE_VALUES } from "../../audit/types.ts";
import { CHANGE_TYPE_VALUES, TRACEABILITY_EXEMPTION_VALUES } from "../../change/types.ts";
import { GC_ACTION_VALUES, GC_INCLUDE_VALUES } from "../../gc/types.ts";
import {
	ROADMAP_PRIORITY_VALUES,
	SPRINT_STATUS_VALUES,
	TASK_EVIDENCE_RESULT_VALUES,
	TOOL_TASK_STATUS_VALUES,
} from "../../roadmap/types.ts";
import {
	ARTIFACT_STATUS_ACTION_VALUES,
	CHANGE_CLAIM_LAYER_VALUES,
	CHANGE_CLAIM_MODE_VALUES,
	CHANGE_CLAIM_ROLE_VALUES,
	WORKFLOW_LOOP_VALUES,
} from "../../session/types.ts";
import { CODEWIKI_STATE_SECTION_VALUES } from "../../domain/state/types.ts";
import { VALIDATION_FAILURE_CLASS_VALUES } from "../../validation/types.ts";

export const changeTypeSchema = Type.Union(
	CHANGE_TYPE_VALUES.map((value) => Type.Literal(value)),
);
export const traceabilityExemptionSchema = Type.Union(
	TRACEABILITY_EXEMPTION_VALUES.map((value) => Type.Literal(value)),
);
/** @deprecated Use change_type plus traceability.exemption. */
export const changeClassSchema = Type.Union([
	...CHANGE_TYPE_VALUES.map((value) => Type.Literal(value)),
	...TRACEABILITY_EXEMPTION_VALUES.map((value) => Type.Literal(value)),
	Type.Literal("code-bugfix"),
	Type.Literal("maintenance"),
	Type.Literal("audit"),
	Type.Literal("security"),
	Type.Literal("publication"),
]);

export const subagentRoleSchema = Type.Union(
	SUBAGENT_ROLE_VALUES.map((value) => Type.Literal(value)),
);
export const subagentVerdictSchema = Type.Union(
	SUBAGENT_VERDICT_VALUES.map((value) => Type.Literal(value)),
);
export const subagentProposalKindSchema = Type.Union(
	SUBAGENT_PROPOSAL_VALUES.map((value) => Type.Literal(value)),
);
export const subagentBriefSchema = Type.Object({
	role: subagentRoleSchema,
	taskId: Type.Optional(Type.String({ minLength: 1 })),
	question: Type.Optional(Type.String({ minLength: 1 })),
	intent: Type.Optional(Type.String({ minLength: 1 })),
	budget: Type.Optional(
		Type.Object({
			targetTokens: Type.Optional(Type.Number()),
			maxFiles: Type.Optional(Type.Number()),
		}),
	),
	inputs: Type.Object({
		views: Type.Optional(Type.Array(Type.String())),
		spec_paths: Type.Optional(Type.Array(Type.String())),
		code_paths: Type.Optional(Type.Array(Type.String())),
		evidence_paths: Type.Optional(Type.Array(Type.String())),
		checks: Type.Optional(Type.Array(Type.String())),
	}),
	constraints: Type.Optional(Type.Array(Type.String())),
});
export const subagentResultSchema = Type.Object({
	role: subagentRoleSchema,
	verdict: subagentVerdictSchema,
	taskId: Type.Optional(Type.String({ minLength: 1 })),
	checks: Type.Array(Type.String()),
	acceptance: Type.Optional(
		Type.Array(
			Type.Object({
				criterion: Type.String(),
				status: Type.Union([
					Type.Literal("pass"),
					Type.Literal("fail"),
					Type.Literal("unknown"),
				]),
				reason: Type.String(),
			}),
		),
	),
	findings: Type.Array(Type.String()),
	issues: Type.Array(
		Type.Object({
			severity: Type.Union([
				Type.Literal("high"),
				Type.Literal("medium"),
				Type.Literal("low"),
			]),
			summary: Type.String(),
			evidence: Type.Optional(Type.String()),
		}),
	),
	proposals: Type.Array(
		Type.Object({
			kind: subagentProposalKindSchema,
			summary: Type.String(),
			paths: Type.Optional(Type.Array(Type.String())),
		}),
	),
	rationale: Type.String(),
});

export const roadmapPrioritySchema = Type.Union(
	ROADMAP_PRIORITY_VALUES.map((value) => Type.Literal(value)),
);
export const roadmapTaskGoalSchema = Type.Object({
	outcome: Type.Optional(
		Type.String({ description: "Clear outcome this task should achieve." }),
	),
	acceptance: Type.Optional(
		Type.Array(Type.String(), {
			description: "Concrete success signals proving the outcome was achieved.",
		}),
	),
	non_goals: Type.Optional(
		Type.Array(Type.String(), {
			description: "Explicitly out-of-scope work for this task.",
		}),
	),
	verification: Type.Optional(
		Type.Array(Type.String(), {
			description:
				"Checks, tests, or review steps required before closing the task.",
		}),
	),
});
export const codewikiTaskCreateSchema = Type.Object({
	title: Type.String({ minLength: 1, description: "Short task title." }),
	priority: roadmapPrioritySchema,
	kind: Type.String({
		minLength: 1,
		description:
			"Task kind like architecture, bug, migration, testing, docs, or agent-workflow.",
	}),
	summary: Type.String({
		minLength: 1,
		description: "One-sentence task summary.",
	}),
	spec_paths: Type.Optional(Type.Array(Type.String(), { default: [] })),
	code_paths: Type.Optional(Type.Array(Type.String(), { default: [] })),
	research_ids: Type.Optional(Type.Array(Type.String(), { default: [] })),
	labels: Type.Optional(Type.Array(Type.String(), { default: [] })),
	change_type: Type.Optional(changeTypeSchema),
	change_class: Type.Optional(changeClassSchema),
	goal: Type.Optional(roadmapTaskGoalSchema),
	delta: Type.Optional(
		Type.Object({
			desired: Type.Optional(Type.String()),
			current: Type.Optional(Type.String()),
			closure: Type.Optional(Type.String()),
		}),
	),
});
export const toolTaskStatusSchema = Type.Union(
	TOOL_TASK_STATUS_VALUES.map((value) => Type.Literal(value)),
);
export const taskEvidenceResultSchema = Type.Union(
	TASK_EVIDENCE_RESULT_VALUES.map((value) => Type.Literal(value)),
);
export const artifactStatusActionSchema = Type.Union(
	ARTIFACT_STATUS_ACTION_VALUES.map((value) => Type.Literal(value)),
);
export const changeClaimModeSchema = Type.Union(
	CHANGE_CLAIM_MODE_VALUES.map((value) => Type.Literal(value)),
);
export const changeClaimRoleSchema = Type.Union(
	CHANGE_CLAIM_ROLE_VALUES.map((value) => Type.Literal(value)),
);
export const worktreeIsolationSchema = Type.Object({
	worktree_path: Type.Optional(Type.String({ description: "Filesystem path for the session worktree." })),
	branch: Type.Optional(Type.String({ description: "Git branch or detached worktree label." })),
	base_sha: Type.Optional(Type.String({ description: "Git commit SHA where the session started." })),
	head_sha: Type.Optional(Type.String({ description: "Git commit SHA produced by the builder/publisher." })),
	validated_sha: Type.Optional(Type.String({ description: "Exact Git commit SHA checked by validation." })),
	published_sha: Type.Optional(Type.String({ description: "Exact Git commit SHA pushed or released." })),
	tree_sha: Type.Optional(Type.String({ description: "Exact Git tree SHA checked by validation." })),
	working_tree_digest: Type.Optional(Type.String({ description: "Deterministic digest of checked dirty working-tree content for pre-commit validation." })),
	worktree_digest: Type.Optional(Type.String({ description: "Alias for working_tree_digest." })),
	package_digest: Type.Optional(Type.String({ description: "Package tarball or publication artifact digest." })),
	archive_ref: Type.Optional(Type.String({ description: "Archive ledger or Git archive ref proving content." })),
	remote_ref: Type.Optional(Type.String({ description: "Remote ref proving published content." })),
	clean: Type.Optional(Type.Boolean({ description: "Whether the worktree was clean for the role action." })),
	fresh_context: Type.Optional(Type.Boolean({ description: "Whether validation used fresh context rather than builder chat context." })),
	session_id: Type.Optional(Type.String({ description: "Session id for this role, when known." })),
	claim_id: Type.Optional(Type.String({ description: "Claim id for this role, when known." })),
	builder_session_id: Type.Optional(Type.String({ description: "Builder session id intentionally separated from validation." })),
	builder_claim_id: Type.Optional(Type.String({ description: "Builder claim id intentionally separated from validation." })),
	related_claim_ids: Type.Optional(Type.Array(Type.String(), { description: "Related claim ids used to audit isolation." })),
	notes: Type.Optional(Type.String({ description: "Short isolation note." })),
});
export const validationIsolationSchema = Type.Intersect([
	worktreeIsolationSchema,
	Type.Object({
		role: Type.Optional(changeClaimRoleSchema),
	}),
]);
export const changeClaimLayerSchema = Type.Union(
	CHANGE_CLAIM_LAYER_VALUES.map((value) => Type.Literal(value)),
);
export const changeClaimScopeSchema = Type.Object({
	layer: changeClaimLayerSchema,
	path: Type.Optional(Type.String({ description: "Repo-relative path or glob-like prefix, e.g. .codewiki/kb/system/**." })),
	task_id: Type.Optional(Type.String({ description: "Roadmap task id when layer is roadmap or artifact status targets task state." })),
	ref: Type.Optional(Type.String({ description: "Build, validation, graph, branch, or other stable reference." })),
	description: Type.Optional(Type.String({ description: "Short human label when no path/task/ref fits." })),
});
export const codewikiStateSectionSchema = Type.Union(
	CODEWIKI_STATE_SECTION_VALUES.map((value) => Type.Literal(value)),
);
export const repoPathToolField = Type.Optional(
	Type.String({
		description:
			"Optional repo root, or any path inside the target repo, when the current cwd is outside that repo.",
	}),
);
export const agencyModeSchema = Type.Union(
	AGENCY_MODE_VALUES.map((value) => Type.Literal(value)),
);
export const agencyTriggerSchema = Type.Union(
	AGENCY_TRIGGER_VALUES.map((value) => Type.Literal(value)),
);
export const agencyRiskSchema = Type.Union(
	AGENCY_RISK_VALUES.map((value) => Type.Literal(value)),
);
export const agencyScopeKindSchema = Type.Union(
	AGENCY_SCOPE_KIND_VALUES.map((value) => Type.Literal(value)),
);
export const workflowLoopSchema = Type.Union(
	WORKFLOW_LOOP_VALUES.map((value) => Type.Literal(value)),
);
export const validationFailureClassSchema = Type.Union(
	VALIDATION_FAILURE_CLASS_VALUES.map((value) => Type.Literal(value)),
);
export const auditProfileSchema = Type.Union(
	AUDIT_PROFILE_VALUES.map((value) => Type.Literal(value)),
);
export const agencyScopeSchema = Type.Object({
	kind: agencyScopeKindSchema,
	id: Type.Optional(Type.String({ minLength: 1 })),
});
export const agencyBudgetSchema = Type.Object({
	maxCycles: Type.Optional(Type.Number()),
	maxWallSeconds: Type.Optional(Type.Number()),
	maxTokens: Type.Optional(Type.Number()),
	maxCostUsd: Type.Optional(Type.Number()),
	maxWrites: Type.Optional(Type.Number()),
	maxSessions: Type.Optional(Type.Number()),
	maxSubagents: Type.Optional(Type.Number()),
	risk: Type.Optional(agencyRiskSchema),
});
export const sprintStatusSchema = Type.Union(
	SPRINT_STATUS_VALUES.map((value) => Type.Literal(value)),
);
export const codewikiSprintSchema = Type.Object({
	id: Type.Optional(Type.String({ minLength: 1, description: "Existing or desired sprint id, e.g. SPRINT-004." })),
	title: Type.String({ minLength: 1, description: "Short sprint/cohort title." }),
	status: Type.Optional(sprintStatusSchema),
	outcome: Type.String({ minLength: 1, description: "Shared outcome for related executable tasks." }),
	task_ids: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	scope: Type.Optional(Type.Object({
		knowledge: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
		code: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	})),
	budget: Type.Optional(agencyBudgetSchema),
	gates: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
});
const codewikiIsolationRequirementSchema = Type.Object({
	required: Type.Optional(Type.Boolean()),
	mode: Type.Optional(Type.String({ minLength: 1 })),
	evidence: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	reason: Type.Optional(Type.String({ minLength: 1 })),
	profiles: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	handoff: Type.Optional(Type.String({ minLength: 1 })),
});
const codewikiBuildIsolationPolicySchema = Type.Object({
	loop_start: Type.Optional(codewikiIsolationRequirementSchema),
	validation: Type.Optional(codewikiIsolationRequirementSchema),
	next_loop: Type.Optional(codewikiIsolationRequirementSchema),
});
export const workflowCursorSchema = Type.Object({
	active_loop: workflowLoopSchema,
	reason: Type.Optional(Type.String({ minLength: 1 })),
	input_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	expected_output: Type.Optional(Type.String({ minLength: 1 })),
	exit_gate: Type.Optional(Type.String({ minLength: 1 })),
	scope: Type.Optional(agencyScopeSchema),
	isolation: Type.Optional(codewikiIsolationRequirementSchema),
	context_boundary: Type.Optional(Type.String({ minLength: 1 })),
	handoff_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
});
export const codewikiAgencyToolInputSchema = Type.Object({
	repoPath: repoPathToolField,
	mode: Type.Optional(agencyModeSchema),
	trigger: Type.Optional(agencyTriggerSchema),
	scope: Type.Optional(agencyScopeSchema),
	budget: Type.Optional(agencyBudgetSchema),
	dryRun: Type.Optional(Type.Boolean()),
});
export const codewikiGcToolInputSchema = Type.Object({
	repoPath: repoPathToolField,
	action: Type.Optional(Type.Union(GC_ACTION_VALUES.map((value) => Type.Literal(value)))),
	include: Type.Optional(Type.Array(Type.Union(GC_INCLUDE_VALUES.map((value) => Type.Literal(value))))),
	scopes: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	archive_sha: Type.Optional(Type.String({ minLength: 1 })),
	tree_sha: Type.Optional(Type.String({ minLength: 1 })),
	archive_ref: Type.Optional(Type.String({ minLength: 1 })),
	ledger_path: Type.Optional(Type.String({ minLength: 1 })),
	max_deletes: Type.Optional(Type.Number({ minimum: 1 })),
	refresh: Type.Optional(Type.Boolean({ default: true })),
});

export const toolTaskIdField = Type.String({
	minLength: 1,
	description:
		"Existing task id. Use canonical TASK-### ids.",
});
export const codewikiTaskPatchSchema = Type.Object({
	title: Type.Optional(Type.String({ minLength: 1 })),
	priority: Type.Optional(roadmapPrioritySchema),
	kind: Type.Optional(Type.String({ minLength: 1 })),
	summary: Type.Optional(Type.String({ minLength: 1 })),
	status: Type.Optional(toolTaskStatusSchema),
	spec_paths: Type.Optional(Type.Array(Type.String())),
	code_paths: Type.Optional(Type.Array(Type.String())),
	research_ids: Type.Optional(Type.Array(Type.String())),
	labels: Type.Optional(Type.Array(Type.String())),
	change_type: Type.Optional(changeTypeSchema),
	change_class: Type.Optional(changeClassSchema),
	goal: Type.Optional(roadmapTaskGoalSchema),
	delta: Type.Optional(
		Type.Object({
			desired: Type.Optional(Type.String()),
			current: Type.Optional(Type.String()),
			closure: Type.Optional(Type.String()),
		}),
	),
});
export const codewikiTaskEvidenceSchema = Type.Object({
	summary: Type.String({
		minLength: 1,
		description: "Short evidence summary to append to task history.",
	}),
	result: Type.Optional(taskEvidenceResultSchema),
	checks_run: Type.Optional(Type.Array(Type.String(), { default: [] })),
	files_touched: Type.Optional(Type.Array(Type.String(), { default: [] })),
	issues: Type.Optional(Type.Array(Type.String(), { default: [] })),
});
export const codewikiAuditToolInputSchema = Type.Object({
	repoPath: repoPathToolField,
	profiles: Type.Optional(Type.Array(auditProfileSchema, { description: "Selected audit profiles. Omit for full audit." })),
	paths: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	layers: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: "Selected logical layers for scoped alignment audit.", default: [] })),
	task_id: Type.Optional(Type.String({ minLength: 1, description: "Roadmap task id for the task audit profile." })),
	changed: Type.Optional(Type.Boolean({ description: "Include the changed-files audit profile." })),
	full: Type.Optional(Type.Boolean({ description: "Run the full default audit profile set." })),
	include_fingerprints: Type.Optional(Type.Boolean({ description: "Include source/content fingerprints where available.", default: true })),
});

export const codewikiResumeContextToolInputSchema = Type.Object({
	repoPath: repoPathToolField,
	refresh: Type.Optional(
		Type.Boolean({
			default: true,
			description:
				"When true, rebuild derived graph/state files before composing resume context.",
		}),
	),
	taskId: Type.Optional(toolTaskIdField),
	followUpIntent: Type.Optional(Type.String({ minLength: 1, description: "Optional user follow-up intent to append to the resume packet." })),
});

export const codewikiStateToolInputSchema = Type.Object({
	repoPath: repoPathToolField,
	refresh: Type.Optional(
		Type.Boolean({
			default: false,
			description:
				"When true, rebuild derived graph/state files before reading.",
		}),
	),
	include: Type.Optional(
		Type.Array(codewikiStateSectionSchema, {
			uniqueItems: true,
			description:
				"Sections to include. Default: ['summary', 'roadmap', 'session'].",
		}),
	),
	taskId: Type.Optional(toolTaskIdField),
});
export const codewikiTaskToolInputSchema = Type.Object({
	repoPath: repoPathToolField,
	action: Type.Union([
		Type.Literal("create"),
		Type.Literal("update"),
		Type.Literal("close"),
		Type.Literal("cancel"),
		Type.Literal("clear-archive"),
		Type.Literal("checkpoint"),
		Type.Literal("sprint"),
	]),
	refresh: Type.Optional(
		Type.Boolean({
			default: true,
			description:
				"When true, rebuild generated view files after mutation.",
		}),
	),
	taskId: Type.Optional(toolTaskIdField),
	tasks: Type.Optional(Type.Array(codewikiTaskCreateSchema, { minItems: 1 })),
	sprint: Type.Optional(codewikiSprintSchema),
	patch: Type.Optional(codewikiTaskPatchSchema),
	evidence: Type.Optional(codewikiTaskEvidenceSchema),
	summary: Type.Optional(Type.String({ minLength: 1 })),
});
export const codewikiBuildLifecycleSchema = Type.Object({
	state: Type.Optional(Type.Union([
		Type.Literal("proposed"),
		Type.Literal("accepted"),
		Type.Literal("consumed"),
		Type.Literal("applied"),
		Type.Literal("validated"),
		Type.Literal("archived"),
	])),
	ttl_days: Type.Optional(Type.Number({ minimum: 1 })),
	archive_after: Type.Optional(Type.String()),
	purge_after: Type.Optional(Type.String()),
});
export const codewikiDiffTableRowSchema = Type.Object({
	id: Type.Optional(Type.String({ minLength: 1 })),
	current_state: Type.String({ minLength: 1 }),
	desired_state: Type.String({ minLength: 1 }),
	rationale: Type.String({ minLength: 1 }),
	affected_layers: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	risk: Type.Optional(Type.String({ minLength: 1 })),
	user_action: Type.Optional(Type.String({ minLength: 1 })),
	alternatives: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
});
const codewikiBuildRefsSchema = Type.Object({
	decision: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	planning: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	implementation: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	roadmap: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	validation: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	source: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
});
const codewikiBuildProducesSchema = Type.Object({
	knowledge: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	roadmap: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	code: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	tests: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	validation: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	publication: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	closure: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
});
const codewikiClosureBriefSchema = Type.Object({
	user_intent: Type.String({ minLength: 1 }),
	implemented_changes: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
	layers_updated: Type.Optional(Type.Object({
		knowledge: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
		roadmap: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
		code: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
		tests: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
		validation: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	})),
	acceptance_evidence: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
	checks: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
	non_goals_preserved: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	remaining_risks: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
});
const codewikiBuildCycleSchema = Type.Object({
	sequence: Type.Optional(Type.Number()),
	attempt: Type.Optional(Type.String({ minLength: 1 })),
	supersedes: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	status: Type.Optional(Type.String({ minLength: 1 })),
});
const codewikiBuildPolicySchema = Type.Object({
	profile: Type.Optional(Type.String({ minLength: 1 })),
	exit_criteria: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	required_audits: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	audit_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	audit_reports: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	isolation: Type.Optional(codewikiBuildIsolationPolicySchema),
});
const codewikiBuildRequirementSchema = Type.Object({
	id: Type.String({ minLength: 1 }),
	text: Type.String({ minLength: 1 }),
	source_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	state: Type.Optional(Type.String({ minLength: 1 })),
});
const codewikiEvidenceMappingSchema = Type.Object({
	criterion: Type.String({ minLength: 1 }),
	evidence: Type.String({ minLength: 1 }),
	requirement_ids: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	source_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
});
const codewikiDecisionPropagationResolutionSchema = Type.Object({
	row_id: Type.Optional(Type.String({ minLength: 1 })),
	question_id: Type.Optional(Type.String({ minLength: 1 })),
	question: Type.Optional(Type.String({ minLength: 1 })),
	resolution: Type.String({ minLength: 1 }),
	task_ids: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	sprint_ids: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	knowledge_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	source_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	owner: Type.Optional(Type.String({ minLength: 1 })),
	trigger: Type.Optional(Type.String({ minLength: 1 })),
	trigger_state: Type.Optional(Type.String({ minLength: 1 })),
	rationale: Type.Optional(Type.String({ minLength: 1 })),
	evidence: Type.String({ minLength: 1 }),
});
export const codewikiBuildToolInputSchema = Type.Object({
	repoPath: repoPathToolField,
	kind: Type.Union([
		Type.Literal("decision"),
		Type.Literal("planning"),
		Type.Literal("implementation"),
	], {
		description: "Build kind to create. decision: approved semantic intent + knowledge handoff. planning: roadmap alignment → implementation. implementation: roadmap → tests/code.",
	}),
	summary: Type.String({ minLength: 1 }),
	slug: Type.Optional(Type.String({ minLength: 1 })),
	source: Type.Optional(Type.String({ minLength: 1 })),
	schema_version: Type.Optional(Type.Number()),
	consumes: Type.Optional(codewikiBuildRefsSchema),
	produces: Type.Optional(codewikiBuildProducesSchema),
	change_type: Type.Optional(changeTypeSchema),
	change_class: Type.Optional(changeClassSchema),
	upstream_build_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	accepted_build_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	traceability: Type.Optional(Type.Object({
		change_type: Type.Optional(changeTypeSchema),
		change_class: Type.Optional(changeClassSchema),
		exemption: Type.Optional(traceabilityExemptionSchema),
		semantic: Type.Optional(Type.Boolean()),
		requires_accepted_build: Type.Optional(Type.Boolean()),
		upstream_build_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
		accepted_build_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	})),
	cycle: Type.Optional(codewikiBuildCycleSchema),
	policy: Type.Optional(codewikiBuildPolicySchema),
	requirements: Type.Optional(Type.Array(codewikiBuildRequirementSchema)),
	evidence_mapping: Type.Optional(Type.Array(codewikiEvidenceMappingSchema)),
	audit_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	audit_reports: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	agent_assessment: Type.Optional(Type.String()),
	lifecycle: Type.Optional(codewikiBuildLifecycleSchema),
	refresh: Type.Optional(Type.Boolean({ default: true })),
	// Decision-specific
	decision_mode: Type.Optional(Type.Union([Type.Literal("proposal"), Type.Literal("accepted")])),
	row_to_kb_mappings: Type.Optional(Type.Array(Type.Object({
		row_id: Type.String({ minLength: 1 }),
		knowledge_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
		diagram_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
		evidence: Type.String({ minLength: 1 }),
		deferred: Type.Optional(Type.Boolean()),
		deferred_reason: Type.Optional(Type.String({ minLength: 1 })),
	}))),
	propagation: Type.Optional(Type.Object({
		direction: Type.Optional(Type.String({ minLength: 1 })),
		product_impact: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
		system_impact: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
		no_product_impact: Type.Optional(Type.String({ minLength: 1 })),
		no_system_impact: Type.Optional(Type.String({ minLength: 1 })),
		downstream_planning_questions: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	})),
	diagram_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	downstream_planning_questions: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	// Decision row table
	diff_table: Type.Optional(Type.Array(codewikiDiffTableRowSchema)),
	approved_diff_rows: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	decisions: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	assumptions: Type.Optional(Type.Array(Type.String(), { default: [] })),
	open_questions: Type.Optional(Type.Array(Type.String(), { default: [] })),
	non_goals: Type.Optional(Type.Array(Type.String(), { default: [] })),
	knowledge_changes: Type.Optional(Type.Array(Type.String())),
	roadmap_changes: Type.Optional(Type.Array(Type.String())),
	// Planning-specific
	source_decision_build: Type.Optional(Type.String()),
	task_ids: Type.Optional(Type.Array(Type.String())),
	task_changes: Type.Optional(Type.Array(Type.String())),
	decision_row_resolutions: Type.Optional(Type.Array(codewikiDecisionPropagationResolutionSchema)),
	downstream_question_resolutions: Type.Optional(Type.Array(codewikiDecisionPropagationResolutionSchema)),
	tdd_plan: Type.Optional(Type.Array(Type.String())),
	candidate_test_files: Type.Optional(Type.Array(Type.String())),
	candidate_code_paths: Type.Optional(Type.Array(Type.String())),
	// Implementation-specific
	source_planning_build: Type.Optional(Type.String()),
	task_id: Type.Optional(Type.String()),
	test_files: Type.Optional(Type.Array(Type.String())),
	code_files: Type.Optional(Type.Array(Type.String())),
	checks_run: Type.Optional(Type.Array(Type.String())),
	acceptance_mapping: Type.Optional(Type.Array(Type.Object({
		criterion: Type.String(),
		evidence: Type.String(),
	}))),
	test_design_evidence: Type.Optional(Type.Array(Type.String())),
	code_change_evidence: Type.Optional(Type.Array(Type.String())),
	tester_notes: Type.Optional(Type.Array(Type.String())),
	builder_notes: Type.Optional(Type.Array(Type.String())),
	validation_refs: Type.Optional(Type.Array(Type.String())),
	risks: Type.Optional(Type.Array(Type.String())),
	closure_brief: Type.Optional(codewikiClosureBriefSchema),
	publication: Type.Optional(Type.Object({
		commit_title: Type.Optional(Type.String()),
		commit_body: Type.Optional(Type.String()),
		pr_title: Type.Optional(Type.String()),
		pr_body: Type.Optional(Type.String()),
		issue_update: Type.Optional(Type.String()),
		release_notes: Type.Optional(Type.String()),
		archive_ref: Type.Optional(Type.String()),
		commit_sha: Type.Optional(Type.String()),
		remote: Type.Optional(Type.String()),
		branch: Type.Optional(Type.String()),
		restore_command: Type.Optional(Type.String()),
		secret_scan: Type.Optional(Type.String()),
		remote_visibility: Type.Optional(Type.String()),
		private_evidence: Type.Optional(Type.String()),
		safe_to_push: Type.Optional(Type.Boolean()),
	})),
});
export const codewikiValidationReportSchema = Type.Object({
	repoPath: repoPathToolField,
	profile: Type.String({
		minLength: 1,
		description: "Validation profile: decision, planning, implementation, task-close, drift-audit, etc.",
	}),
	task_id: Type.Optional(Type.String()),
	verdict: Type.Union([
		Type.Literal("pass"),
		Type.Literal("fail"),
		Type.Literal("block"),
	]),
	rationale: Type.String({ minLength: 1 }),
	checks: Type.Optional(Type.Array(Type.String())),
	issues: Type.Optional(Type.Array(Type.Object({
		severity: Type.String(),
		summary: Type.String(),
	}))),
	source: Type.Optional(Type.String()),
	policy_profile: Type.Optional(Type.String({ minLength: 1 })),
	required_audits: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	audit_refs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	audit_reports: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
	failed_criteria: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	blocking_questions: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	failure_class: Type.Optional(validationFailureClassSchema),
	recommended_next_loop: Type.Optional(workflowLoopSchema),
	stop_reason: Type.Optional(Type.String({ minLength: 1 })),
	isolation: Type.Optional(validationIsolationSchema),
	preflight_only: Type.Optional(Type.Boolean({
		default: false,
		description: "Return gateway preflight without writing a validation report.",
	})),
	refresh: Type.Optional(Type.Boolean({ default: true })),
});
export const codewikiDiffTableToolInputSchema = Type.Object({
	repoPath: repoPathToolField,
	action: Type.Union([
		Type.Literal("propose"),
		Type.Literal("revise"),
		Type.Literal("accept"),
		Type.Literal("reject"),
		Type.Literal("defer"),
		Type.Literal("alternative"),
		Type.Literal("archive"),
		Type.Literal("list"),
	]),
	table_id: Type.Optional(Type.String({ minLength: 1 })),
	row_id: Type.Optional(Type.String({ minLength: 1 })),
	summary: Type.Optional(Type.String({ minLength: 1 })),
	source: Type.Optional(Type.String({ minLength: 1 })),
	scope: Type.Optional(agencyScopeSchema),
	rows: Type.Optional(Type.Array(codewikiDiffTableRowSchema)),
	alternative: Type.Optional(Type.String({ minLength: 1 })),
});

export const codewikiSessionToolInputSchema = Type.Object({
	repoPath: repoPathToolField,
	action: Type.Union([
		Type.Literal("focus"),
		Type.Literal("note"),
		Type.Literal("clear"),
	]),
	taskId: Type.Optional(toolTaskIdField),
	summary: Type.Optional(Type.String({ minLength: 1 })),
	checks_run: Type.Optional(Type.Array(Type.String(), { default: [] })),
	files_touched: Type.Optional(Type.Array(Type.String(), { default: [] })),
	issues: Type.Optional(Type.Array(Type.String(), { default: [] })),
	cursor: Type.Optional(workflowCursorSchema),
	setSessionName: Type.Optional(
		Type.Boolean({
			default: false,
			description: "Rename current Pi session to TASK-### + title.",
		}),
	),
});
export const codewikiArtifactStatusToolInputSchema = Type.Object({
	repoPath: repoPathToolField,
	action: artifactStatusActionSchema,
	recordId: Type.Optional(Type.String({ minLength: 1, description: "Existing runtime artifact status record id for release/cancel or heartbeat." })),
	taskId: Type.Optional(toolTaskIdField),
	buildRef: Type.Optional(Type.String({ minLength: 1, description: "Optional compiler build path anchoring this artifact status." })),
	summary: Type.Optional(Type.String({ minLength: 1, description: "Short reason for marking or waiting on artifact status." })),
	mode: Type.Optional(changeClaimModeSchema),
	role: Type.Optional(changeClaimRoleSchema),
	worktree: Type.Optional(worktreeIsolationSchema),
	scopes: Type.Optional(Type.Array(changeClaimScopeSchema, { minItems: 1 })),
	ttl_minutes: Type.Optional(Type.Number({ minimum: 1, description: "Runtime artifact status TTL in minutes; default 120, max 1440." })),
	force: Type.Optional(Type.Boolean({ default: false, description: "Allow mark despite write/write artifact conflicts." })),
	refresh: Type.Optional(Type.Boolean({ default: true, description: "Rebuild generated graph/status after artifact status mutation." })),
});
