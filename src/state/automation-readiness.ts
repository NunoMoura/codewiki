import { assessRoadmapTaskBoundary } from "../roadmap/task-boundary.ts";
import type { RoadmapTaskRecord } from "../roadmap/types.ts";
import type {
	ArtifactStatusHolder,
	ArtifactStatusRecord,
} from "../session/types.ts";
import { unique } from "../shared/utils.ts";

export const AUTOMATION_READINESS_CONTRACT_VERSION = 1 as const;
export const AUTOMATION_READINESS_RUNNABLE_STATES = [
	"runnable",
	"retryable",
	"promotable",
] as const;

export type AutomationReadinessState =
	| "runnable"
	| "blocked"
	| "waiting"
	| "retryable"
	| "promotable"
	| "ambiguous"
	| "missing"
	| "stale";

export interface AutomationReadinessBlocker {
	kind: string;
	severity: "low" | "medium" | "high";
	summary: string;
	refs: string[];
	next_safe_action: string;
	lease_ids?: string[];
	branch_refs?: string[];
	validation_refs?: string[];
	publisher_refs?: string[];
	rebase_requirements?: string[];
	retryable?: boolean;
}

export interface AutomationReadinessNextAction {
	kind: string;
	loop: string;
	summary: string;
	command: string | null;
	refs: string[];
	safe_to_schedule: boolean;
}

export interface AutomationReadinessTaskRecord {
	version: 1;
	contract_version: typeof AUTOMATION_READINESS_CONTRACT_VERSION;
	kind: "task";
	task_id: string;
	title: string;
	status: string;
	state: AutomationReadinessState;
	runnable: boolean;
	retryable: boolean;
	promotable: boolean;
	safe_to_schedule: boolean;
	generated_at: string;
	expires_at: string;
	sprint_ids: string[];
	source_refs: string[];
	candidate_files: {
		spec_paths: string[];
		code_paths: string[];
		declared: boolean;
	};
	upstream: {
		accepted_planning_refs: string[];
		accepted_decision_refs: string[];
		approved_exemption_refs: string[];
	};
	gate_policy: {
		required_checks: string[];
		required_audits: string[];
		next_loop: string;
		risk: string;
		risk_approval_refs: string[];
	};
	lease_policy: {
		requires_scoped_write_lease: boolean;
		worktree_strategy: "role-worktree" | "shared-root-solo";
		active_lease_ids: string[];
		waiter_ids: string[];
	};
	context_boundary: {
		required: boolean;
		available: boolean;
		context_path: string;
		source_backed: boolean;
	};
	build_refs: {
		decision: string[];
		planning: string[];
		implementation: string[];
	};
	validation_refs: {
		pass: string[];
		fail: string[];
		block: string[];
	};
	model_policy: {
		risk: string;
		approval_refs: string[];
		notes: string[];
	};
	blockers: AutomationReadinessBlocker[];
	next_action: AutomationReadinessNextAction;
}

export interface AutomationReadinessSprintRecord {
	version: 1;
	contract_version: typeof AUTOMATION_READINESS_CONTRACT_VERSION;
	kind: "sprint";
	sprint_id: string;
	title: string;
	status: string;
	state: AutomationReadinessState;
	task_ids: string[];
	runnable_task_ids: string[];
	retryable_task_ids: string[];
	promotable_task_ids: string[];
	waiting_task_ids: string[];
	blocked_task_ids: string[];
	ambiguous_task_ids: string[];
	blockers: AutomationReadinessBlocker[];
	next_action: AutomationReadinessNextAction;
	source_refs: string[];
}

export interface AutomationReadinessIndex {
	version: 1;
	contract_version: typeof AUTOMATION_READINESS_CONTRACT_VERSION;
	generated_at: string;
	expires_at: string;
	state: AutomationReadinessState;
	tasks: Record<string, AutomationReadinessTaskRecord>;
	sprints: Record<string, AutomationReadinessSprintRecord>;
	runnable_task_ids: string[];
	retryable_task_ids: string[];
	promotable_task_ids: string[];
	waiting_task_ids: string[];
	blocked_task_ids: string[];
	ambiguous_task_ids: string[];
	selected_task_id: string | null;
	stop_reasons: string[];
	next_action: AutomationReadinessNextAction;
	source_refs: string[];
}

export interface AutomationReadinessBuildInput {
	path: string;
	kind?: string;
	status?: string;
	taskId?: string;
	data?: unknown;
}

export interface AutomationReadinessValidationInput {
	path: string;
	taskId?: string;
	verdict?: string;
	data?: unknown;
}

export interface AutomationReadinessSprintInput {
	id: string;
	title?: string;
	status?: string;
	task_ids?: string[];
}

export interface BuildAutomationReadinessInput {
	tasks: RoadmapTaskRecord[];
	sprints?: AutomationReadinessSprintInput[];
	builds?: AutomationReadinessBuildInput[];
	validations?: AutomationReadinessValidationInput[];
	artifact_statuses?: ArtifactStatusRecord[];
	now?: string;
	next_task_id?: string | null;
	model_policy?: unknown;
}

export interface AutomationReadinessGateResult {
	ok: boolean;
	state: AutomationReadinessState;
	reason: string;
	blockers: AutomationReadinessBlocker[];
	next_action?: AutomationReadinessNextAction;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordField(value: unknown, key: string): JsonRecord {
	if (!isRecord(value)) return {};
	const next = value[key];
	return isRecord(next) ? next : {};
}

function stringList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map((item) => String(item || "").trim()).filter(Boolean);
	}
	const single = String(value || "").trim();
	return single ? [single] : [];
}

function normalizeRef(value: unknown): string {
	return String(value || "")
		.trim()
		.replace(/\\/g, "/");
}

function addHoursIso(value: string, hours: number): string {
	const base = Date.parse(value);
	const ms = Number.isFinite(base) ? base : Date.now();
	return new Date(ms + hours * 60 * 60 * 1000).toISOString();
}

function isAcceptedBuild(build: AutomationReadinessBuildInput): boolean {
	const data = isRecord(build.data) ? build.data : {};
	const lifecycle = recordField(data, "lifecycle");
	const status = String(build.status || data.status || lifecycle.state || "")
		.trim()
		.toLowerCase();
	return ["accepted", "validated", "pass", "passed", "current"].includes(
		status,
	);
}

function buildTaskIds(build: AutomationReadinessBuildInput): string[] {
	const data = isRecord(build.data) ? build.data : {};
	const consumes = recordField(data, "consumes");
	const produces = recordField(data, "produces");
	const task = recordField(data, "task");
	return unique(
		[
			...stringList(build.taskId),
			...stringList(data.task_id),
			...stringList(data.taskId),
			...stringList(task.id),
			...stringList(data.task_ids),
			...stringList(data.roadmap_work_items),
			...stringList(consumes.roadmap),
			...stringList(produces.roadmap),
		]
			.map((id) => id.trim())
			.filter((id) => /^TASK-\d+/.test(id)),
	);
}

function buildRefs(
	build: AutomationReadinessBuildInput,
	key: string,
): string[] {
	const data = isRecord(build.data) ? build.data : {};
	const consumes = recordField(data, "consumes");
	const traceability = recordField(data, "traceability");
	return unique(
		[
			...stringList(consumes[key]),
			...stringList(traceability.upstream_build_refs),
			...stringList(traceability.accepted_build_refs),
		]
			.map(normalizeRef)
			.filter(Boolean),
	);
}

function validationTaskIds(
	validation: AutomationReadinessValidationInput,
): string[] {
	const data = isRecord(validation.data) ? validation.data : {};
	return unique(
		[
			...stringList(validation.taskId),
			...stringList(data.task_id),
			...stringList(data.taskId),
		]
			.map((id) => id.trim())
			.filter((id) => /^TASK-\d+/.test(id)),
	);
}

function validationSourceRefs(
	validation: AutomationReadinessValidationInput,
): string[] {
	const data = isRecord(validation.data) ? validation.data : {};
	return unique(
		[
			...stringList(data.source),
			...stringList(data.sources),
			...stringList(data.source_ref),
			...stringList(data.source_refs),
		]
			.map(normalizeRef)
			.filter(Boolean),
	);
}

function taskBuilds(
	builds: AutomationReadinessBuildInput[],
	taskId: string,
	kind: string,
): AutomationReadinessBuildInput[] {
	return builds.filter(
		(build) =>
			String(build.kind || "").trim() === kind &&
			buildTaskIds(build).includes(taskId),
	);
}

function taskValidations(
	validations: AutomationReadinessValidationInput[],
	taskId: string,
	implementationRefs: string[],
): AutomationReadinessValidationInput[] {
	const implementationRefSet = new Set(implementationRefs.map(normalizeRef));
	return validations.filter((validation) => {
		const explicitTaskIds = validationTaskIds(validation);
		if (explicitTaskIds.length > 0) return explicitTaskIds.includes(taskId);
		return validationSourceRefs(validation).some((ref) =>
			implementationRefSet.has(normalizeRef(ref)),
		);
	});
}

function labelText(task: RoadmapTaskRecord): string {
	return [
		task.kind,
		task.change_type,
		...(task.labels || []),
		String((task as unknown as JsonRecord).change_class || ""),
	]
		.join(" ")
		.toLowerCase();
}

function taskRisk(task: RoadmapTaskRecord): string {
	const text = labelText(task);
	if (
		/destructive|security|migration|ship-ready|publication|release|remote/.test(
			text,
		)
	)
		return "high";
	if (/system|runtime|agency|gateway|policy/.test(text)) return "medium";
	return "low";
}

function approvedExemptionRefs(task: RoadmapTaskRecord): string[] {
	const refs = (task.labels || [])
		.map((label) => String(label || "").trim())
		.filter((label) =>
			/approved.*exemption|exemption.*approved|automation-exempt/i.test(label),
		);
	if (String(task.change_type || "").trim() === "mechanical")
		refs.push("change_type:mechanical");
	return unique(refs);
}

function acceptedDecisionRefs(
	planningBuilds: AutomationReadinessBuildInput[],
): string[] {
	return unique(
		planningBuilds
			.flatMap((build) => [
				...buildRefs(build, "decision"),
				...stringList(
					recordField(build.data, "traceability").accepted_build_refs,
				),
			])
			.map(normalizeRef)
			.filter(Boolean),
	);
}

function requiredAudits(builds: AutomationReadinessBuildInput[]): string[] {
	return unique(
		builds.flatMap((build) =>
			stringList(recordField(build.data, "policy").required_audits),
		),
	);
}

function taskContextPath(taskId: string): string {
	return `.codewiki/roadmap/tasks/${taskId}/context.json`;
}

function holderRefs(holder: ArtifactStatusHolder): string[] {
	return unique(
		[
			holder.record_id,
			holder.worktree?.branch,
			holder.worktree?.head_sha,
			holder.worktree?.published_sha,
			holder.worktree?.tree_sha,
			holder.build_ref,
		]
			.map(normalizeRef)
			.filter(Boolean),
	);
}

function statusMatchesTask(
	status: ArtifactStatusRecord,
	task: RoadmapTaskRecord,
): boolean {
	const artifact = status.artifact;
	if (artifact.task_id === task.id) return true;
	const path = normalizeRef(artifact.path);
	if (!path) return false;
	const refs = [...(task.spec_paths || []), ...(task.code_paths || [])].map(
		normalizeRef,
	);
	return refs.some((ref) => {
		if (!ref) return false;
		if (path === ref || ref === path) return true;
		if (path.endsWith("/**")) return ref.startsWith(path.slice(0, -3));
		if (ref.endsWith("/**")) return path.startsWith(ref.slice(0, -3));
		return false;
	});
}

function leaseBlockers(
	task: RoadmapTaskRecord,
	statuses: ArtifactStatusRecord[],
): AutomationReadinessBlocker[] {
	const blockers: AutomationReadinessBlocker[] = [];
	for (const status of statuses.filter((item) =>
		statusMatchesTask(item, task),
	)) {
		const holders = (status.holders || []).filter(
			(holder) => holder.mode === "write",
		);
		if (!["conflict", "in-use"].includes(status.status) || holders.length === 0)
			continue;
		for (const holder of holders) {
			const refs = holderRefs(holder);
			blockers.push({
				kind: "active_lease",
				severity: "medium",
				summary: `Scoped lease ${holder.record_id} holds ${status.artifact.task_id || status.artifact.path || status.artifact.ref || status.artifact.description || status.artifact.layer}.`,
				refs,
				lease_ids: [holder.record_id],
				branch_refs: unique(
					[holder.worktree?.branch, holder.worktree?.head_sha].filter(
						Boolean,
					) as string[],
				),
				next_safe_action:
					holder.next_safe_action ||
					status.next_safe_action ||
					`Wait for ${holder.record_id} release, then re-read automation-readiness and mark scopes before writing.`,
				retryable: true,
			});
		}
	}
	return blockers;
}

function waitersForTask(
	task: RoadmapTaskRecord,
	statuses: ArtifactStatusRecord[],
): string[] {
	return unique(
		statuses
			.filter((status) => statusMatchesTask(status, task))
			.flatMap((status) =>
				(status.waiters || []).map((waiter) => waiter.record_id),
			),
	);
}

function blocker(
	kind: string,
	severity: AutomationReadinessBlocker["severity"],
	summary: string,
	refs: string[],
	nextSafeAction: string,
	extra: Partial<AutomationReadinessBlocker> = {},
): AutomationReadinessBlocker {
	return {
		kind,
		severity,
		summary,
		refs: unique(refs.map(normalizeRef).filter(Boolean)),
		next_safe_action: nextSafeAction,
		...extra,
	};
}

function latestValidation(
	validations: AutomationReadinessValidationInput[],
): AutomationReadinessValidationInput | null {
	return (
		[...validations]
			.sort((a, b) => normalizeRef(a.path).localeCompare(normalizeRef(b.path)))
			.at(-1) ?? null
	);
}

function stateNextAction(
	state: AutomationReadinessState,
	taskId: string,
	blockers: AutomationReadinessBlocker[],
	validationRefs: string[],
): AutomationReadinessNextAction {
	const first = blockers[0];
	if (state === "waiting") {
		return {
			kind: "wait",
			loop: "runtime",
			summary:
				first?.summary ||
				`Wait for scoped lease release before scheduling ${taskId}.`,
			command: `wiki_artifact_status action=wait taskId=${taskId}`,
			refs: first?.refs || [],
			safe_to_schedule: false,
		};
	}
	if (state === "promotable") {
		return {
			kind: "promote",
			loop: "task-close",
			summary: `${taskId} has validation evidence and can be promoted through task-close gates.`,
			command: `wiki_gate profile=task-close task_id=${taskId}`,
			refs: validationRefs,
			safe_to_schedule: true,
		};
	}
	if (state === "retryable") {
		return {
			kind: "retry",
			loop: "implementation",
			summary: `${taskId} has retryable failure/block evidence; resume from validation refs and fix scoped issues.`,
			command: `wiki_resume_context taskId=${taskId}`,
			refs: validationRefs,
			safe_to_schedule: true,
		};
	}
	if (state === "runnable") {
		return {
			kind: "run",
			loop: "implementation",
			summary: `${taskId} is runnable from accepted source refs and scoped leases are available.`,
			command: `wiki_resume_context taskId=${taskId}`,
			refs: [taskContextPath(taskId)],
			safe_to_schedule: true,
		};
	}
	return {
		kind: state === "ambiguous" ? "route_to_decision" : "stop",
		loop: state === "ambiguous" ? "decision" : "planning",
		summary:
			first?.summary ||
			`Automation-readiness blocks ${taskId}; inspect source refs before scheduling.`,
		command: first?.next_safe_action || null,
		refs: first?.refs || [],
		safe_to_schedule: false,
	};
}

function modelPolicy(
	value: unknown,
	risk: string,
): AutomationReadinessTaskRecord["model_policy"] {
	const record = isRecord(value) ? value : {};
	return {
		risk: String(record.risk || risk || "medium"),
		approval_refs: stringList(record.approval_refs),
		notes: stringList(record.notes),
	};
}

function buildTaskReadiness(
	input: BuildAutomationReadinessInput,
	task: RoadmapTaskRecord,
	sprintIds: string[],
	now: string,
	expiresAt: string,
): AutomationReadinessTaskRecord {
	const builds = input.builds || [];
	const validations = input.validations || [];
	const planningBuilds = taskBuilds(builds, task.id, "planning_build");
	const acceptedPlanningBuilds = planningBuilds.filter(isAcceptedBuild);
	const implementationBuilds = taskBuilds(
		builds,
		task.id,
		"implementation_build",
	);
	const acceptedImplementationBuilds =
		implementationBuilds.filter(isAcceptedBuild);
	const implementationRefs = implementationBuilds.map((build) =>
		normalizeRef(build.path),
	);
	const relatedValidations = taskValidations(
		validations,
		task.id,
		implementationRefs,
	);
	const passValidationRefs = relatedValidations
		.filter((validation) => String(validation.verdict || "") === "pass")
		.map((validation) => normalizeRef(validation.path));
	const failValidationRefs = relatedValidations
		.filter((validation) => String(validation.verdict || "") === "fail")
		.map((validation) => normalizeRef(validation.path));
	const blockValidationRefs = relatedValidations
		.filter((validation) => String(validation.verdict || "") === "block")
		.map((validation) => normalizeRef(validation.path));
	const latest = latestValidation(relatedValidations);
	const latestVerdict = String(latest?.verdict || "");
	const acceptedPlanningRefs = acceptedPlanningBuilds.map((build) =>
		normalizeRef(build.path),
	);
	const acceptedDecisionBuildRefs = acceptedDecisionRefs(
		acceptedPlanningBuilds,
	);
	const exemptionRefs = approvedExemptionRefs(task);
	const risk = taskRisk(task);
	const policyModel = modelPolicy(input.model_policy, risk);
	const blockers: AutomationReadinessBlocker[] = [];
	const boundary = assessRoadmapTaskBoundary(task);
	if (!boundary.executable) {
		blockers.push(
			blocker(
				"non_executable_boundary",
				"high",
				`Task is not self-contained executable work: ${boundary.reasons.join("; ")}`,
				[task.id, taskContextPath(task.id)],
				"Route grouping/container work to planning or sprint metadata before automation.",
			),
		);
	}
	if (!task.goal?.outcome || !task.goal?.acceptance?.length) {
		blockers.push(
			blocker(
				"ambiguous_goal",
				"high",
				"Task goal outcome or acceptance criteria are missing.",
				[task.id, ".codewiki/roadmap/queue.json"],
				"Route to planning to define an executable task boundary.",
			),
		);
	}
	const candidateDeclared = Boolean(
		(task.spec_paths || []).length || (task.code_paths || []).length,
	);
	if (!candidateDeclared) {
		blockers.push(
			blocker(
				"candidate_files_missing",
				"medium",
				"Task declares no spec_paths or code_paths for deterministic scoped scheduling.",
				[task.id, ".codewiki/roadmap/queue.json"],
				"Route to planning to declare candidate source refs before automation.",
			),
		);
	}
	if (acceptedPlanningRefs.length === 0 && exemptionRefs.length === 0) {
		blockers.push(
			blocker(
				"accepted_planning_missing",
				"high",
				"No accepted planning build or approved exemption maps this task to executable work.",
				[task.id, ".codewiki/builds/planning"],
				"Run the planning compiler or record an approved exemption before scheduling implementation.",
			),
		);
	}
	if (
		risk === "high" &&
		acceptedDecisionBuildRefs.length === 0 &&
		policyModel.approval_refs.length === 0
	) {
		blockers.push(
			blocker(
				"risk_approval_missing",
				"high",
				"High-risk automation requires accepted decision/model approval refs.",
				[task.id, ...acceptedPlanningRefs],
				"Route to decision for explicit high-risk approval before automation.",
			),
		);
	}
	const validationFailureRefs =
		latestVerdict === "fail" || latestVerdict === "block"
			? [normalizeRef(latest?.path)]
			: [];
	if (validationFailureRefs.length > 0) {
		blockers.push(
			blocker(
				"retryable_validation_failure",
				"medium",
				`Latest validation verdict is ${latestVerdict}; task can retry from exact validation evidence.`,
				validationFailureRefs,
				`Re-read ${validationFailureRefs[0]}, resume ${task.id}, and rerun implementation validation after scoped fixes.`,
				{ validation_refs: validationFailureRefs, retryable: true },
			),
		);
	}
	const activeLeaseBlockers = leaseBlockers(
		task,
		input.artifact_statuses || [],
	);
	blockers.push(...activeLeaseBlockers);
	if (task.status === "blocked" && validationFailureRefs.length === 0) {
		blockers.push(
			blocker(
				"roadmap_blocked",
				"medium",
				"Roadmap status is blocked and no retryable validation evidence is attached.",
				[task.id],
				"Inspect roadmap/task evidence and route to the recommended compiler before automation.",
			),
		);
	}
	if (!["todo", "in_progress", "blocked"].includes(String(task.status || ""))) {
		blockers.push(
			blocker(
				"not_open",
				"low",
				`Roadmap status ${task.status} is not open for automation scheduling.`,
				[task.id],
				"Select another open task or run closure/publication gates if appropriate.",
			),
		);
	}

	const blockingWithoutRetry = blockers.filter(
		(item) => item.kind !== "retryable_validation_failure",
	);
	let state: AutomationReadinessState;
	if (activeLeaseBlockers.length > 0) state = "waiting";
	else if (
		passValidationRefs.length > 0 &&
		acceptedImplementationBuilds.length > 0
	) {
		state = "promotable";
	} else if (
		validationFailureRefs.length > 0 &&
		blockingWithoutRetry.length === 0
	) {
		state = "retryable";
	} else if (
		blockingWithoutRetry.some((item) => item.kind === "ambiguous_goal")
	) {
		state = "ambiguous";
	} else if (blockingWithoutRetry.length > 0) state = "blocked";
	else state = "runnable";
	const safeToSchedule = AUTOMATION_READINESS_RUNNABLE_STATES.includes(
		state as (typeof AUTOMATION_READINESS_RUNNABLE_STATES)[number],
	);
	const validationRefs = unique([
		...passValidationRefs,
		...failValidationRefs,
		...blockValidationRefs,
	]);
	const pendingValidation =
		acceptedImplementationBuilds.length > 0 && validationRefs.length === 0;
	const nextAction = pendingValidation
		? {
				kind: "validate",
				loop: "implementation-validation",
				summary: `${task.id} has implementation build evidence and needs fresh implementation validation.`,
				command: `wiki_gate profile=implementation task_id=${task.id} source=${implementationRefs.at(-1) || taskContextPath(task.id)}`,
				refs: implementationRefs.slice(-1),
				safe_to_schedule: true,
			}
		: stateNextAction(state, task.id, blockers, validationRefs);
	return {
		version: 1,
		contract_version: AUTOMATION_READINESS_CONTRACT_VERSION,
		kind: "task",
		task_id: task.id,
		title: task.title,
		status: task.status,
		state,
		runnable: state === "runnable",
		retryable: state === "retryable",
		promotable: state === "promotable",
		safe_to_schedule: safeToSchedule,
		generated_at: now,
		expires_at: expiresAt,
		sprint_ids: sprintIds,
		source_refs: unique([
			".codewiki/roadmap/queue.json",
			taskContextPath(task.id),
			...task.spec_paths,
			...task.code_paths,
			...acceptedPlanningRefs,
			...acceptedDecisionBuildRefs,
			...implementationRefs,
			...validationRefs,
		]),
		candidate_files: {
			spec_paths: task.spec_paths || [],
			code_paths: task.code_paths || [],
			declared: candidateDeclared,
		},
		upstream: {
			accepted_planning_refs: acceptedPlanningRefs,
			accepted_decision_refs: acceptedDecisionBuildRefs,
			approved_exemption_refs: exemptionRefs,
		},
		gate_policy: {
			required_checks: task.goal?.verification || [],
			required_audits: requiredAudits(acceptedPlanningBuilds),
			next_loop: state === "promotable" ? "task-close" : "implementation",
			risk,
			risk_approval_refs: unique([
				...acceptedDecisionBuildRefs,
				...policyModel.approval_refs,
			]),
		},
		lease_policy: {
			requires_scoped_write_lease: true,
			worktree_strategy:
				sprintIds.length > 0 ? "role-worktree" : "shared-root-solo",
			active_lease_ids: unique(
				activeLeaseBlockers.flatMap((item) => item.lease_ids || []),
			),
			waiter_ids: waitersForTask(task, input.artifact_statuses || []),
		},
		context_boundary: {
			required: true,
			available: true,
			context_path: taskContextPath(task.id),
			source_backed: true,
		},
		build_refs: {
			decision: acceptedDecisionBuildRefs,
			planning: acceptedPlanningRefs,
			implementation: implementationRefs,
		},
		validation_refs: {
			pass: passValidationRefs,
			fail: failValidationRefs,
			block: blockValidationRefs,
		},
		model_policy: policyModel,
		blockers,
		next_action: nextAction,
	};
}

function sprintNextAction(
	sprintId: string,
	state: AutomationReadinessState,
	taskIds: string[],
	blockers: AutomationReadinessBlocker[],
): AutomationReadinessNextAction {
	if (AUTOMATION_READINESS_RUNNABLE_STATES.includes(state as any)) {
		const taskId = taskIds[0];
		return {
			kind:
				state === "promotable"
					? "promote"
					: state === "retryable"
						? "retry"
						: "run",
			loop: state === "promotable" ? "task-close" : "implementation",
			summary: `Sprint ${sprintId} has automation-ready task ${taskId}.`,
			command: taskId ? `wiki_resume_context taskId=${taskId}` : null,
			refs: taskId ? [taskContextPath(taskId)] : [],
			safe_to_schedule: true,
		};
	}
	const first = blockers[0];
	return {
		kind: state === "waiting" ? "wait" : "stop",
		loop: "planning",
		summary:
			first?.summary || `Sprint ${sprintId} has no automation-ready tasks.`,
		command: first?.next_safe_action || null,
		refs: first?.refs || [],
		safe_to_schedule: false,
	};
}

function aggregateState(
	records: AutomationReadinessTaskRecord[],
): AutomationReadinessState {
	if (records.some((record) => record.state === "runnable")) return "runnable";
	if (records.some((record) => record.state === "retryable"))
		return "retryable";
	if (records.some((record) => record.state === "promotable"))
		return "promotable";
	if (records.some((record) => record.state === "waiting")) return "waiting";
	if (records.some((record) => record.state === "ambiguous"))
		return "ambiguous";
	return records.length > 0 ? "blocked" : "missing";
}

function buildSprintReadiness(
	sprint: AutomationReadinessSprintInput,
	tasks: Record<string, AutomationReadinessTaskRecord>,
): AutomationReadinessSprintRecord {
	const records = (sprint.task_ids || []).flatMap((taskId) =>
		tasks[taskId] ? [tasks[taskId]] : [],
	);
	const runnableTaskIds = records
		.filter((record) => record.state === "runnable")
		.map((record) => record.task_id);
	const retryableTaskIds = records
		.filter((record) => record.state === "retryable")
		.map((record) => record.task_id);
	const promotableTaskIds = records
		.filter((record) => record.state === "promotable")
		.map((record) => record.task_id);
	const waitingTaskIds = records
		.filter((record) => record.state === "waiting")
		.map((record) => record.task_id);
	const blockedTaskIds = records
		.filter((record) => record.state === "blocked")
		.map((record) => record.task_id);
	const ambiguousTaskIds = records
		.filter((record) => record.state === "ambiguous")
		.map((record) => record.task_id);
	const state = aggregateState(records);
	const selectedIds = [
		...runnableTaskIds,
		...retryableTaskIds,
		...promotableTaskIds,
	];
	return {
		version: 1,
		contract_version: AUTOMATION_READINESS_CONTRACT_VERSION,
		kind: "sprint",
		sprint_id: sprint.id,
		title: String(sprint.title || sprint.id),
		status: String(sprint.status || "active"),
		state,
		task_ids: sprint.task_ids || [],
		runnable_task_ids: runnableTaskIds,
		retryable_task_ids: retryableTaskIds,
		promotable_task_ids: promotableTaskIds,
		waiting_task_ids: waitingTaskIds,
		blocked_task_ids: blockedTaskIds,
		ambiguous_task_ids: ambiguousTaskIds,
		blockers: records.flatMap((record) => record.blockers).slice(0, 12),
		next_action: sprintNextAction(
			sprint.id,
			state,
			selectedIds,
			records.flatMap((record) => record.blockers),
		),
		source_refs: unique(records.flatMap((record) => record.source_refs)),
	};
}

function sprintIdsByTask(
	sprints: AutomationReadinessSprintInput[],
): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const sprint of sprints) {
		for (const taskId of sprint.task_ids || []) {
			const next = map.get(taskId) || [];
			next.push(sprint.id);
			map.set(taskId, unique(next).sort());
		}
	}
	return map;
}

export function buildAutomationReadinessIndex(
	input: BuildAutomationReadinessInput,
): AutomationReadinessIndex {
	const now = input.now || new Date().toISOString();
	const expiresAt = addHoursIso(now, 2);
	const sprints = input.sprints || [];
	const sprintMap = sprintIdsByTask(sprints);
	const tasks = Object.fromEntries(
		input.tasks.map((task) => [
			task.id,
			buildTaskReadiness(
				input,
				task,
				sprintMap.get(task.id) || [],
				now,
				expiresAt,
			),
		]),
	) as Record<string, AutomationReadinessTaskRecord>;
	const sprintRecords = Object.fromEntries(
		sprints.map((sprint) => [sprint.id, buildSprintReadiness(sprint, tasks)]),
	) as Record<string, AutomationReadinessSprintRecord>;
	const taskRecords = Object.values(tasks);
	const runnableTaskIds = taskRecords
		.filter((record) => record.state === "runnable")
		.map((record) => record.task_id);
	const retryableTaskIds = taskRecords
		.filter((record) => record.state === "retryable")
		.map((record) => record.task_id);
	const promotableTaskIds = taskRecords
		.filter((record) => record.state === "promotable")
		.map((record) => record.task_id);
	const waitingTaskIds = taskRecords
		.filter((record) => record.state === "waiting")
		.map((record) => record.task_id);
	const blockedTaskIds = taskRecords
		.filter((record) => record.state === "blocked")
		.map((record) => record.task_id);
	const ambiguousTaskIds = taskRecords
		.filter((record) => record.state === "ambiguous")
		.map((record) => record.task_id);
	const selectedTaskId =
		(input.next_task_id && tasks[input.next_task_id]?.safe_to_schedule
			? input.next_task_id
			: [...runnableTaskIds, ...retryableTaskIds, ...promotableTaskIds][0]) ||
		null;
	const state = aggregateState(taskRecords);
	const selected = selectedTaskId ? tasks[selectedTaskId] : null;
	return {
		version: 1,
		contract_version: AUTOMATION_READINESS_CONTRACT_VERSION,
		generated_at: now,
		expires_at: expiresAt,
		state,
		tasks,
		sprints: sprintRecords,
		runnable_task_ids: runnableTaskIds,
		retryable_task_ids: retryableTaskIds,
		promotable_task_ids: promotableTaskIds,
		waiting_task_ids: waitingTaskIds,
		blocked_task_ids: blockedTaskIds,
		ambiguous_task_ids: ambiguousTaskIds,
		selected_task_id: selectedTaskId,
		stop_reasons: unique(
			taskRecords
				.filter((record) => !record.safe_to_schedule)
				.flatMap((record) => record.blockers.map((item) => item.kind)),
		),
		next_action: selected
			? selected.next_action
			: {
					kind: "stop",
					loop: "planning",
					summary: "No automation-ready task is available.",
					command: null,
					refs: [],
					safe_to_schedule: false,
				},
		source_refs: unique(taskRecords.flatMap((record) => record.source_refs)),
	};
}

function readinessRecord(value: unknown): AutomationReadinessTaskRecord | null {
	if (!isRecord(value)) return null;
	if (value.kind !== "task") return null;
	return value as unknown as AutomationReadinessTaskRecord;
}

export function automationReadinessTaskFromPlan(
	plan: unknown,
	taskId: string,
): AutomationReadinessTaskRecord | null {
	if (!isRecord(plan)) return null;
	const direct = readinessRecord(recordField(plan, "automation_readiness"));
	if (direct?.task_id === taskId) return direct;
	const automation = recordField(plan, "automation_readiness");
	const tasks = recordField(automation, "tasks");
	const indexed = readinessRecord(tasks[taskId]);
	if (indexed) return indexed;
	const cycles = Array.isArray(plan.cycles) ? plan.cycles : [];
	for (const cycle of cycles) {
		if (!isRecord(cycle)) continue;
		const cycleDirect = readinessRecord(
			recordField(cycle, "automation_readiness"),
		);
		if (cycleDirect?.task_id === taskId) return cycleDirect;
		const cycleAutomation = recordField(cycle, "automation_readiness");
		const cycleTasks = recordField(cycleAutomation, "tasks");
		const cycleIndexed = readinessRecord(cycleTasks[taskId]);
		if (cycleIndexed) return cycleIndexed;
	}
	return null;
}

export function automationReadinessRuntimeGate(
	readiness: AutomationReadinessTaskRecord | null,
	input: { taskId: string; now?: string },
): AutomationReadinessGateResult {
	if (!readiness) {
		return {
			ok: false,
			state: "missing",
			reason: `automation-readiness contract missing for ${input.taskId}`,
			blockers: [],
		};
	}
	if (readiness.task_id !== input.taskId) {
		return {
			ok: false,
			state: "ambiguous",
			reason: `automation-readiness task mismatch: expected ${input.taskId}, got ${readiness.task_id}`,
			blockers: readiness.blockers || [],
			next_action: readiness.next_action,
		};
	}
	if (readiness.contract_version !== AUTOMATION_READINESS_CONTRACT_VERSION) {
		return {
			ok: false,
			state: "stale",
			reason: `automation-readiness contract version ${readiness.contract_version} is unsupported`,
			blockers: readiness.blockers || [],
			next_action: readiness.next_action,
		};
	}
	const now = Date.parse(input.now || new Date().toISOString());
	const expiresAt = Date.parse(String(readiness.expires_at || ""));
	if (Number.isFinite(now) && Number.isFinite(expiresAt) && expiresAt <= now) {
		return {
			ok: false,
			state: "stale",
			reason: `automation-readiness contract expired for ${input.taskId}; refresh graph state before scheduling`,
			blockers: readiness.blockers || [],
			next_action: readiness.next_action,
		};
	}
	if (!readiness.safe_to_schedule) {
		return {
			ok: false,
			state: readiness.state,
			reason: `automation-readiness state=${readiness.state} for ${input.taskId}`,
			blockers: readiness.blockers || [],
			next_action: readiness.next_action,
		};
	}
	return {
		ok: true,
		state: readiness.state,
		reason: `automation-readiness state=${readiness.state}`,
		blockers: readiness.blockers || [],
		next_action: readiness.next_action,
	};
}
