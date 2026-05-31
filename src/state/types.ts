import type { WikiProject } from "../project/types.ts";
import type { RoadmapStatus, RoadmapTaskGoal } from "../roadmap/types.ts";
import type {
	ArtifactStatusRecord,
	ChangeClaimConflict,
	ChangeClaimRecord,
	ChangeClaimWaiterRecord,
	TaskSessionLinkRecord,
	WorkflowCursor,
} from "../session/types.ts";

export const CODEWIKI_STATE_SECTION_VALUES = [
	"repo",
	"health",
	"summary",
	"roadmap",
	"graph",
	"trace",
	"audit",
	"drift",
	"session",
	"task",
	"claims",
	"archive",
] as const;
export const STATUS_DOCK_DENSITY_VALUES = [
	"minimal",
	"standard",
	"full",
] as const;
export const STATUS_DOCK_MODE_VALUES = ["auto", "pin", "off"] as const;
export const STATUS_SCOPE_VALUES = [
	"repo",
	"task",
	"spec",
	"both",
	"docs",
	"code",
] as const;

export type CodewikiStateSection =
	(typeof CODEWIKI_STATE_SECTION_VALUES)[number];
export type StatusDockDensity = (typeof STATUS_DOCK_DENSITY_VALUES)[number];
export type StatusDockMode = (typeof STATUS_DOCK_MODE_VALUES)[number];
export type StatusScope = (typeof STATUS_SCOPE_VALUES)[number];

export interface RoadmapStateTaskSummary {
	id: string;
	title: string;
	status: RoadmapStatus;
	priority: string;
	kind?: string;
	change_type?: string;
	summary: string;
	updated: string;
	spec_paths?: string[];
	code_paths?: string[];
	labels?: string[];
	goal?: RoadmapTaskGoal;
	boundary?: {
		executable: boolean;
		container: boolean;
		reasons: string[];
	};
	context_path?: string;
	loop?: {
		updated_at: string;
		evidence?: {
			verdict: string;
			summary: string;
			checks_run?: string[];
			files_touched?: string[];
			issues?: string[];
			updated_at?: string;
		};
	};
}

export interface RoadmapStateHealth {
	color: "green" | "yellow" | "red";
	errors: number;
	warnings: number;
	total_issues: number;
}

export type JsonObject = Record<string, unknown>;

export interface RoadmapStateSprintSummary {
	id: string;
	title: string;
	status: string;
	outcome: string;
	task_ids: string[];
	scope?: {
		knowledge?: string[];
		code?: string[];
	};
	budget?: unknown;
	gates?: string[];
	created?: string;
	updated?: string;
}

export interface RoadmapStateFile {
	version: number;
	generated_at: string;
	health: RoadmapStateHealth;
	summary: {
		task_count: number;
		open_count: number;
		sprint_count?: number;
		active_sprint_count?: number;
		status_counts: Record<string, number>;
		priority_counts: Record<string, number>;
	};
	views: {
		ordered_task_ids: string[];
		open_task_ids: string[];
		executable_open_task_ids?: string[];
		container_task_ids?: string[];
		in_progress_task_ids: string[];
		executable_in_progress_task_ids?: string[];
		todo_task_ids: string[];
		executable_todo_task_ids?: string[];
		blocked_task_ids: string[];
		done_task_ids: string[];
		cancelled_task_ids: string[];
		recent_task_ids: string[];
		sprint_ids?: string[];
		active_sprint_ids?: string[];
		sprints?: RoadmapStateSprintSummary[];
	};
	tasks: Record<string, RoadmapStateTaskSummary>;
	source?: {
		task_context_root: string;
	};
}

export interface CodewikiResumeContextToolInput {
	repoPath?: string;
	refresh?: boolean;
	taskId?: string;
	followUpIntent?: string;
}

export interface CodewikiStateToolInput {
	repoPath?: string;
	refresh?: boolean;
	include?: CodewikiStateSection[];
	taskId?: string;
}

export interface GraphNode {
	id: string;
	kind: string;
	title?: string;
	path?: string;
	[key: string]: unknown;
}

export interface GraphEdge {
	from: string;
	to: string;
	kind: string;
	[key: string]: unknown;
}

export interface GraphRoadmapView {
	task_ids?: string[];
	open_task_ids?: string[];
	in_progress_task_ids?: string[];
	todo_task_ids?: string[];
	blocked_task_ids?: string[];
	done_task_ids?: string[];
	cancelled_task_ids?: string[];
	recent_task_ids?: string[];
	sprint_ids?: string[];
	active_sprint_ids?: string[];
	status_counts?: Record<string, number>;
	sprints?: RoadmapStateSprintSummary[];
}

export interface GraphGcClasses {
	hot?: JsonObject;
	warm?: JsonObject;
	cold?: JsonObject;
	purgeable?: JsonObject;
}

export interface GraphGcView {
	policy?: JsonObject;
	classes?: GraphGcClasses;
	[key: string]: unknown;
}

export interface GraphLensMap {
	default?: JsonObject;
	trace?: JsonObject;
	audit?: JsonObject;
	[key: string]: unknown;
}

export interface GraphViews {
	roadmap?: GraphRoadmapView;
	lenses?: GraphLensMap;
	reconciliation?: JsonObject;
	gc?: GraphGcView;
	claims?: unknown;
	scope_views?: unknown;
	workflow_cursor?: WorkflowCursor;
	file_structure?: unknown;
	archive?: JsonObject;
	alignment?: JsonObject;
	system_diagrams?: JsonObject;
	traceability?: JsonObject;
	semantic_execution_closure?: JsonObject;
	artifact_status?: JsonObject;
	validation?: JsonObject;
	code?: {
		paths?: string[];
		dirty_paths?: string[];
	};
	[key: string]: unknown;
}

export interface GraphFile {
	version: number;
	generated_at: string;
	nodes: GraphNode[];
	edges: GraphEdge[];
	views?: GraphViews;
}

export interface RoadmapTaskContextPacket {
	version: number;
	generated_at: string;
	context_path: string;
	task: JsonObject;
	budget?: JsonObject;
	revision?: JsonObject;
	code?: JsonObject;
	specs?: JsonObject;
	evidence?: JsonObject;
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
	revision: JsonObject;
	note: string;
}

export interface StatusStateBar {
	label: string;
	value: number;
	total: number;
	percent: number;
}

export interface StatusStateAgencyLane {
	id: string;
	title: string;
	cadence: string;
	freshness_basis: string;
	fallback_max_age_hours: number;
	interval_hours: number;
	triggers: string[];
	checked_at: string;
	revision: JsonObject;
	freshness: {
		status: "fresh" | "stale";
		basis: string;
		checked_at: string;
		reason: string;
		stale_state_guidance: string;
	};
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
	recommendation: {
		kind: string;
		command: string;
		reason: string;
	};
}

export interface StatusStateParallelSession {
	session_id: string;
	task_id: string;
	action: string;
	timestamp: string;
	title: string;
	summary: string;
	agent_name: string;
}

export interface StatusStateAgentRow {
	id: string;
	label: string;
	name: string;
	task_id: string;
	task_title: string;
	mode: string;
	status: string;
	last_action: string;
	constraint: string;
	session_id: string;
}

export interface StatusStateChannelRow {
	id: string;
	label: string;
	kind: string;
	target: string;
	description: string;
	status: string;
	scope: string;
	last_delivery_at: string;
	error?: string;
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

export interface StatusStateFile {
	version: number;
	generated_at: string;
	project: {
		name: string;
		docs_root: string;
		roadmap_path: string;
	};
	health: {
		color: "green" | "yellow" | "red";
		errors: number;
		warnings: number;
		total_issues: number;
	};
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
		sprint_ids?: string[];
		active_sprint_ids?: string[];
	};
	next_step: {
		kind: string;
		command: string;
		reason: string;
		item_id?: string;
	};
	workflow_cursor?: WorkflowCursor;
	file_structure?: unknown;
	gc?: JsonObject;
	decision_propagation?: JsonObject;
	semantic_execution_closure?: JsonObject;
	direction: string[];
	specs: StatusStateSpecRow[];
	agency: {
		generated_at: string;
		summary: {
			lane_count: number;
			freshness_basis: string;
			level?: string;
			approval_cadence?: string;
			context_reset_auto_pickup?: boolean;
			high_cadence_lane_ids: string[];
			medium_cadence_lane_ids: string[];
			low_cadence_lane_ids: string[];
		};
		policy?: Record<string, unknown>;
		lanes: StatusStateAgencyLane[];
	};
	resume: {
		source: "task" | "agency" | "next_step";
		task_id: string;
		lane_id: string;
		heading: string;
		command: string;
		reason: string;
		status: string;
		verification: string;
		evidence: string;
		agency: string;
	};
	parallel: {
		generated_at: string;
		active_session_count: number;
		collision_task_ids: string[];
		sessions: StatusStateParallelSession[];
		active_claim_count?: number;
		claim_warning_count?: number;
		claim_conflict_count?: number;
		claim_pending_wait_count?: number;
		claim_ready_wait_count?: number;
		claims?: ChangeClaimRecord[];
		claim_waiters?: ChangeClaimWaiterRecord[];
		claim_conflicts?: ChangeClaimConflict[];
		artifact_statuses?: ArtifactStatusRecord[];
		artifact_status?: {
			in_use_count: number;
			warning_count: number;
			conflict_count: number;
			waiting_count: number;
			ready_waiter_count: number;
		};
	};
	wiki: {
		rows: StatusStateSpecRow[];
		sections: StatusStateWikiSection[];
	};
	roadmap: {
		focused_task_id: string;
		blocked_task_ids: string[];
		in_progress_task_ids: string[];
		next_task_id: string;
		sprint_ids?: string[];
		active_sprint_ids?: string[];
		sprints?: RoadmapStateSprintSummary[];
		columns: StatusStateRoadmapColumn[];
	};
	agents: {
		rows: StatusStateAgentRow[];
	};
	channels: {
		add_label: string;
		rows: StatusStateChannelRow[];
	};
}

export interface StatusDockPrefs {
	version: number;
	density: StatusDockDensity;
	mode: StatusDockMode;
	lastRepoPath?: string;
	pinnedRepoPath?: string;
}

export type StatusPanelSection =
	| "home"
	| "product"
	| "system"
	| "roadmap"
	| "graph"
	| "diff";

export interface StatusPanelAction {
	id: string;
	label: string;
	[key: string]: unknown;
}

export interface StatusPanelDetail {
	sections?: unknown[];
	actions?: StatusPanelAction[];
	kind?: string;
	selectedActionIndex?: number;
	taskId?: string;
	title?: string;
	lines?: string[];
	[key: string]: unknown;
}

export interface ActiveStatusPanel {
	project: ResolvedStatusDockProject;
	density: StatusDockDensity;
	section: StatusPanelSection;
	source: string;
	scope: StatusScope;
	requestRender?: () => void;
	close?: () => void;
	detail: StatusPanelDetail | null;
	activeLink: TaskSessionLinkRecord | null;
	sessionId: string;
	homeIssueIndex: number;
	wikiRowIndex: number;
	wikiColumnIndex: number;
	animationTick: number;
	roadmapColumnIndex: number;
	roadmapRowIndex: number;
	graphRowIndex?: number;
	diffRowIndex?: number;
	agentRowIndex: number;
	channelRowIndex: number;
	animationTimer?: ReturnType<typeof setInterval> | null;
}

export interface ActiveConfigPanel {
	requestRender?: () => void;
	close?: () => void;
	section: ConfigPanelSection;
	pinActionIndex: number;
}

export interface ArchitecturePanelComponent {
	id: string;
	label: string;
	path: string;
	summary: string;
}

export type ConfigPanelSection =
	| "summary"
	| "pinning"
	| "gateway"
	| "automation";

export interface HomeIssue {
	severity: "blocker" | "warning" | "info";
	title: string;
	impact: string;
	recommended: string;
	detail: string[];
}

export interface ResolvedStatusDockProject extends WikiProject {
	project: WikiProject;
	source: string;
	statusState?: StatusStateFile;
}
