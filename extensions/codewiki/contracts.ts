import { Type } from "@sinclair/typebox";

export const ROADMAP_STATUS_VALUES = [
	"todo",
	"research",
	"implement",
	"verify",
	"done",
	"cancelled",
	"in_progress",
	"blocked",
] as const;
export const TASK_PHASE_VALUES = ["implement", "verify"] as const;
export const ROADMAP_PRIORITY_VALUES = [
	"critical",
	"high",
	"medium",
	"low",
] as const;
export const TASK_SESSION_ACTION_VALUES = [
	"focus",
	"progress",
	"blocked",
	"done",
	"spawn",
	"note",
	"clear",
] as const;
export const TOOL_TASK_STATUS_VALUES = [
	"todo",
	"in_progress",
	"blocked",
	"done",
	"cancelled",
] as const;
export const TASK_EVIDENCE_RESULT_VALUES = [
	"progress",
	"pass",
	"fail",
	"block",
	"done_candidate",
] as const;
export const CODEWIKI_STATE_SECTION_VALUES = [
	"summary",
	"roadmap",
	"graph",
	"drift",
	"session",
	"task",
] as const;
export const STATUS_SCOPE_VALUES = ["docs", "code", "both"] as const;
export const STATUS_DOCK_MODE_VALUES = ["auto", "pin", "off"] as const;
export const STATUS_DOCK_DENSITY_VALUES = [
	"minimal",
	"standard",
	"full",
] as const;

export interface ScopeConfig {
	include?: string[];
	exclude?: string[];
}

export interface CodeDriftScopeConfig {
	docs?: string[];
	repo_docs?: string[];
	code?: string[];
}

export interface CodewikiGatewayConfig {
	enabled?: boolean;
	mode?: "read-only" | "off";
	allow_paths?: string[];
	deny_paths?: string[];
	network?: boolean;
	max_stdout_bytes?: number;
	max_read_bytes?: number;
}

export interface CodewikiConfig {
	name?: string;
	rebuild_command?: string[];
	gateway?: CodewikiGatewayConfig;
	self_drift_scope?: ScopeConfig;
	code_drift_scope?: CodeDriftScopeConfig;
}

export interface RoadmapRetentionConfig {
	closed_task_limit?: number;
	archive_path?: string;
	compress_archive?: boolean;
}

export interface DocsConfig {
	project_name?: string;
	wiki_root?: string;
	docs_root?: string;
	specs_root?: string;
	evidence_root?: string;
	research_root?: string;
	index_path?: string;
	roadmap_path?: string;
	roadmap_doc_path?: string;
	roadmap_events_path?: string;
	roadmap_retention?: RoadmapRetentionConfig;
	meta_root?: string;
	codewiki?: CodewikiConfig;
}

export type RoadmapStatus = (typeof ROADMAP_STATUS_VALUES)[number];
export type TaskPhase = (typeof TASK_PHASE_VALUES)[number];
export type RoadmapPriority = (typeof ROADMAP_PRIORITY_VALUES)[number];
export type TaskSessionAction = (typeof TASK_SESSION_ACTION_VALUES)[number];
export type ToolTaskStatus = (typeof TOOL_TASK_STATUS_VALUES)[number];
export type TaskEvidenceResult = (typeof TASK_EVIDENCE_RESULT_VALUES)[number];
export type CodewikiStateSection =
	(typeof CODEWIKI_STATE_SECTION_VALUES)[number];
export type StatusScope = (typeof STATUS_SCOPE_VALUES)[number];

export interface LintIssue {
	severity: string;
	kind: string;
	path: string;
	message: string;
}

export interface LintReport {
	generated_at: string;
	counts: Record<string, number>;
	issues: LintIssue[];
}

export interface GraphNode {
	id: string;
	kind: string;
	path?: string;
	title?: string;
	doc_type?: string;
	group?: string;
}

export interface GraphEdge {
	kind: string;
	from: string;
	to: string;
}

export interface GraphViews {
	docs?: {
		all_paths?: string[];
		spec_paths?: string[];
		by_group?: Record<string, string[]>;
	};
	roadmap?: {
		task_ids?: string[];
		status_counts?: Record<string, number>;
	};
	research?: {
		collection_paths?: string[];
		entry_ids?: string[];
	};
	code?: {
		paths?: string[];
	};
}

export interface GraphFile {
	version: number;
	generated_at: string;
	nodes: GraphNode[];
	edges: GraphEdge[];
	views?: GraphViews;
}

export interface RoadmapTaskDelta {
	desired: string;
	current: string;
	closure: string;
}

export interface RoadmapTaskGoal {
	outcome: string;
	acceptance: string[];
	non_goals: string[];
	verification: string[];
}

export interface RoadmapTaskInput {
	title: string;
	status?: RoadmapStatus;
	priority: RoadmapPriority;
	kind: string;
	summary: string;
	spec_paths?: string[];
	code_paths?: string[];
	research_ids?: string[];
	labels?: string[];
	goal?: Partial<RoadmapTaskGoal>;
	delta?: Partial<RoadmapTaskDelta>;
}

export interface RoadmapTaskUpdateInput {
	taskId: string;
	title?: string;
	status?: RoadmapStatus;
	priority?: RoadmapPriority;
	kind?: string;
	summary?: string;
	spec_paths?: string[];
	code_paths?: string[];
	research_ids?: string[];
	labels?: string[];
	goal?: Partial<RoadmapTaskGoal>;
	delta?: Partial<RoadmapTaskDelta>;
}

export interface RoadmapTaskRecord {
	id: string;
	title: string;
	status: RoadmapStatus;
	priority: RoadmapPriority;
	kind: string;
	summary: string;
	spec_paths: string[];
	code_paths: string[];
	research_ids: string[];
	labels: string[];
	goal: RoadmapTaskGoal;
	delta: RoadmapTaskDelta;
	created: string;
	updated: string;
}

export interface RoadmapFile {
	version: number;
	updated: string;
	order: string[];
	tasks: Record<string, RoadmapTaskRecord>;
}

export interface TaskSessionLinkInput {
	taskId: string;
	action?: TaskSessionAction;
	summary?: string;
	filesTouched?: string[];
	spawnedTaskIds?: string[];
	setSessionName?: boolean;
}

export interface TaskSessionLinkRecord {
	taskId: string;
	action: TaskSessionAction;
	summary: string;
	filesTouched: string[];
	spawnedTaskIds: string[];
	timestamp: string;
}

export interface TaskLoopUpdateInput {
	taskId: string;
	action: "pass" | "fail" | "block";
	phase?: TaskPhase;
	summary?: string;
	checks_run?: string[];
	files_touched?: string[];
	issues?: string[];
}

export interface CodewikiTaskPatchInput {
	title?: string;
	priority?: RoadmapPriority;
	kind?: string;
	summary?: string;
	status?: ToolTaskStatus;
	phase?: TaskPhase | null;
	spec_paths?: string[];
	code_paths?: string[];
	research_ids?: string[];
	labels?: string[];
	goal?: Partial<RoadmapTaskGoal>;
	delta?: Partial<RoadmapTaskDelta>;
}

export interface CodewikiTaskEvidenceInput {
	summary: string;
	result?: TaskEvidenceResult;
	checks_run?: string[];
	files_touched?: string[];
	issues?: string[];
}

export interface CodewikiStateToolInput {
	repoPath?: string;
	refresh?: boolean;
	include?: CodewikiStateSection[];
	taskId?: string;
}

export interface CodewikiTaskToolInput {
	repoPath?: string;
	action: "create" | "update" | "close" | "cancel" | "clear-archive";
	refresh?: boolean;
	taskId?: string;
	tasks?: RoadmapTaskInput[];
	patch?: CodewikiTaskPatchInput;
	evidence?: CodewikiTaskEvidenceInput;
	summary?: string;
}

export interface CodewikiSessionToolInput {
	repoPath?: string;
	action: "focus" | "note" | "clear";
	taskId?: string;
	summary?: string;
	checks_run?: string[];
	files_touched?: string[];
	issues?: string[];
	setSessionName?: boolean;
}

export interface RoadmapStateHealth {
	color: "green" | "yellow" | "red";
	errors: number;
	warnings: number;
	total_issues: number;
}

export interface RoadmapStateSummary {
	task_count: number;
	open_count: number;
	status_counts: Record<string, number>;
	priority_counts: Record<string, number>;
}

export interface RoadmapStateViews {
	ordered_task_ids: string[];
	open_task_ids: string[];
	in_progress_task_ids: string[];
	todo_task_ids: string[];
	blocked_task_ids: string[];
	done_task_ids: string[];
	cancelled_task_ids: string[];
	recent_task_ids: string[];
}

export interface RoadmapStateTaskEvidenceSummary {
	verdict: "pass" | "fail" | "blocked" | "waived" | string;
	summary: string;
	checks_run: string[];
	files_touched: string[];
	issues: string[];
	updated_at: string;
}

export interface RoadmapStateTaskLoop {
	phase: "todo" | TaskPhase | "done" | string;
	updated_at: string;
	evidence: RoadmapStateTaskEvidenceSummary | null;
}

export interface RoadmapTaskContextPacket {
	version: number;
	generated_at: string;
	context_path: string;
	budget?: { target_tokens?: number; policy?: string };
	task?: Record<string, unknown>;
	revision?: RevisionAnchor | Record<string, unknown>;
	specs?: Array<Record<string, unknown>>;
	code?: {
		paths?: string[];
		digest?: string;
		expand?: Array<Record<string, string>>;
	};
	evidence?: Record<string, unknown> | null;
	expansion?: Record<string, string>;
}

export interface RoadmapStateTaskSummary {
	id: string;
	title: string;
	status: RoadmapStatus;
	priority: RoadmapPriority;
	kind: string;
	summary: string;
	labels: string[];
	goal: RoadmapTaskGoal;
	spec_paths: string[];
	code_paths: string[];
	updated: string;
	revision?: RevisionAnchor;
	context_path?: string;
	loop?: RoadmapStateTaskLoop;
}

export interface RoadmapStateFile {
	version: number;
	generated_at: string;
	health: RoadmapStateHealth;
	summary: RoadmapStateSummary;
	views: RoadmapStateViews;
	tasks: Record<string, RoadmapStateTaskSummary>;
}

export interface StatusStateBar {
	label: string;
	value: number;
	total: number;
	percent: number;
}

export interface StatusStateSpecRow {
	path: string;
	title: string;
	summary: string;
	drift_status: "aligned" | "tracked" | "untracked" | "blocked" | "unmapped";
	code_paths: string[];
	code_area: string;
	issue_counts: { errors: number; warnings: number; total: number };
	related_task_ids: string[];
	primary_task: { id: string; status: string; title: string } | null;
	note: string;
}

export interface RevisionAnchor {
	digest?: string;
	git?: {
		head?: string;
		dirty?: boolean;
		dirty_paths?: string[];
		paths?: Record<string, string>;
	};
	spec_digest?: string;
	task_digest?: string;
	code_digest?: string;
	evidence_digest?: string;
}

export interface RevisionFreshness {
	status: "fresh" | "stale" | string;
	basis: "revision" | "work" | "time" | "unknown" | string;
	checked_at?: string;
	reason: string;
	stale_state_guidance?: string;
}

export interface StatusStateHeartbeatLane {
	id: string;
	title: string;
	cadence: "high" | "medium" | "low" | string;
	freshness_basis?: "work-first" | string;
	fallback_max_age_hours?: number;
	interval_hours: number;
	triggers?: string[];
	checked_at: string;
	revision?: RevisionAnchor;
	freshness?: RevisionFreshness;
	spec_paths: string[];
	code_paths: string[];
	code_area: string;
	open_task_ids: string[];
	risky_spec_paths: string[];
	stats: {
		total_specs: number;
		aligned_specs: number;
		tracked_specs: number;
		untracked_specs: number;
		blocked_specs: number;
		unmapped_specs: number;
	};
	recommendation: { kind: string; command: string; reason: string };
}

export interface StatusStateParallelSession {
	session_id: string;
	task_id: string;
	action: string;
	timestamp: string;
	title: string;
	summary: string;
}

export interface StatusStateWikiSection {
	id: string;
	label: string;
	rows: StatusStateSpecRow[];
}

export interface StatusStateRoadmapColumn {
	id: string;
	label: string;
	task_ids: string[];
}

export interface StatusStateAgentRow {
	id: string;
	label: string;
	name?: string;
	task_id: string;
	task_title: string;
	mode: "manual" | "autonomous" | "policy_driven" | string;
	status: "active" | "idle" | "blocked" | "waiting" | "done" | string;
	last_action: string;
	constraint: string;
	session_id?: string;
}

export interface StatusStateChannelRow {
	id: string;
	label: string;
	kind: string;
	target: string;
	status: string;
	scope: "repo" | "user" | string;
	description?: string;
	last_delivery_at?: string;
	error?: string;
}

export interface StatusStateFile {
	version: number;
	generated_at: string;
	project: { name: string; docs_root: string; roadmap_path: string };
	health: RoadmapStateHealth;
	summary: {
		total_specs: number;
		mapped_specs: number;
		aligned_specs: number;
		tracked_specs: number;
		untracked_specs: number;
		blocked_specs: number;
		unmapped_specs: number;
		task_count: number;
		open_task_count: number;
		done_task_count: number;
	};
	bars: {
		tracked_drift: StatusStateBar;
		roadmap_done: StatusStateBar;
		spec_mapping: StatusStateBar;
	};
	views: {
		risky_spec_paths: string[];
		top_risky_spec_paths: string[];
		open_task_ids: string[];
	};
	heartbeat?: {
		generated_at: string;
		summary: {
			lane_count: number;
			freshness_basis?: "work-first" | string;
			high_cadence_lane_ids: string[];
			medium_cadence_lane_ids: string[];
			low_cadence_lane_ids: string[];
		};
		lanes: StatusStateHeartbeatLane[];
	};
	parallel?: {
		generated_at: string;
		active_session_count: number;
		collision_task_ids: string[];
		sessions: StatusStateParallelSession[];
	};
	resume?: {
		source: "task" | "heartbeat" | "next_step" | string;
		task_id: string;
		lane_id: string;
		heading: string;
		command: string;
		reason: string;
		phase?: string;
		verification: string;
		evidence?: string;
		heartbeat: string;
	};
	specs: StatusStateSpecRow[];
	wiki?: {
		rows: StatusStateSpecRow[];
		sections?: StatusStateWikiSection[];
	};
	roadmap?: {
		focused_task_id: string;
		blocked_task_ids: string[];
		in_progress_task_ids: string[];
		next_task_id: string;
		columns?: StatusStateRoadmapColumn[];
	};
	agents?: { rows: StatusStateAgentRow[] };
	channels?: { add_label?: string; rows: StatusStateChannelRow[] };
	next_step: { kind: string; command: string; reason: string };
	direction: string[];
}

export type StatusDockMode = (typeof STATUS_DOCK_MODE_VALUES)[number];
export type StatusDockDensity = (typeof STATUS_DOCK_DENSITY_VALUES)[number];

export interface StatusDockPrefs {
	version: number;
	mode: StatusDockMode;
	density: StatusDockDensity;
	pinnedRepoPath?: string;
	lastRepoPath?: string;
}

export type StatusPanelSection =
	| "home"
	| "wiki"
	| "roadmap"
	| "agents"
	| "channels";

export interface StatusPanelDetail {
	kind: "home" | "wiki" | "roadmap" | "agent" | "channel-add" | "channel-edit";
	title: string;
	lines: string[];
	channelId?: string;
	taskId?: string;
	actions?: Array<{ id: string; label: string }>;
	selectedActionIndex?: number;
}

export interface ActiveStatusPanel {
	project: WikiProject;
	source: "cwd" | "pinned";
	scope: StatusScope;
	density: StatusDockDensity;
	section: StatusPanelSection;
	activeLink: TaskSessionLinkRecord | null;
	sessionId: string | null;
	homeIssueIndex: number;
	wikiColumnIndex: number;
	wikiRowIndex: number;
	roadmapColumnIndex: number;
	roadmapRowIndex: number;
	agentRowIndex: number;
	channelRowIndex: number;
	detail: StatusPanelDetail | null;
	animationTick: number;
	animationTimer?: ReturnType<typeof setInterval> | null;
	requestRender?: () => void;
	close?: () => void;
}

export type ConfigPanelSection = "summary" | "pinning" | "gateway";

export interface ActiveConfigPanel {
	section: ConfigPanelSection;
	pinActionIndex: number;
	requestRender?: () => void;
	close?: () => void;
}

export interface ResolvedStatusDockProject {
	project: WikiProject;
	statusState: StatusStateFile | null;
	source: "cwd" | "pinned";
}

export interface WikiProject {
	root: string;
	label: string;
	config: DocsConfig;
	docsRoot: string;
	specsRoot: string;
	researchRoot: string;
	indexPath: string | null;
	roadmapPath: string;
	roadmapDocPath: string | null;
	metaRoot: string;
	configPath: string;
	lintPath: string;
	graphPath: string;
	eventsPath: string;
	roadmapEventsPath: string;
	roadmapStatePath: string;
	statusStatePath: string;
}

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
	goal: Type.Optional(roadmapTaskGoalSchema),
	delta: Type.Optional(
		Type.Object({
			desired: Type.Optional(Type.String()),
			current: Type.Optional(Type.String()),
			closure: Type.Optional(Type.String()),
		}),
	),
});
export const taskLoopPhaseSchema = Type.Union([
	Type.Literal("implement"),
	Type.Literal("verify"),
]);
export const toolTaskStatusSchema = Type.Union(
	TOOL_TASK_STATUS_VALUES.map((value) => Type.Literal(value)),
);
export const taskEvidenceResultSchema = Type.Union(
	TASK_EVIDENCE_RESULT_VALUES.map((value) => Type.Literal(value)),
);
export const codewikiStateSectionSchema = Type.Union(
	CODEWIKI_STATE_SECTION_VALUES.map((value) => Type.Literal(value)),
);
export const repoPathToolField = Type.Optional(
	Type.String({
		description:
			"Optional repo root, or any path inside the target repo, when the current cwd is outside that repo.",
	}),
);
export const toolTaskIdField = Type.String({
	minLength: 1,
	description:
		"Existing task id. Canonical ids use TASK-###; legacy ROADMAP-### is still accepted during migration.",
});
export const codewikiTaskPatchSchema = Type.Object({
	title: Type.Optional(Type.String({ minLength: 1 })),
	priority: Type.Optional(roadmapPrioritySchema),
	kind: Type.Optional(Type.String({ minLength: 1 })),
	summary: Type.Optional(Type.String({ minLength: 1 })),
	status: Type.Optional(toolTaskStatusSchema),
	phase: Type.Optional(Type.Union([taskLoopPhaseSchema, Type.Null()])),
	spec_paths: Type.Optional(Type.Array(Type.String())),
	code_paths: Type.Optional(Type.Array(Type.String())),
	research_ids: Type.Optional(Type.Array(Type.String())),
	labels: Type.Optional(Type.Array(Type.String())),
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
	]),
	refresh: Type.Optional(
		Type.Boolean({
			default: true,
			description: "Refresh derived state after mutation.",
		}),
	),
	taskId: Type.Optional(toolTaskIdField),
	tasks: Type.Optional(Type.Array(codewikiTaskCreateSchema, { minItems: 1 })),
	patch: Type.Optional(codewikiTaskPatchSchema),
	evidence: Type.Optional(codewikiTaskEvidenceSchema),
	summary: Type.Optional(Type.String({ minLength: 1 })),
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
	setSessionName: Type.Optional(
		Type.Boolean({
			default: false,
			description: "Rename current Pi session to TASK-### + title.",
		}),
	),
});
