import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProject } from "../../src/project/context.ts";
import {
	buildControlRoomBoardModel,
	buildControlRoomGraphModel,
	buildControlRoomProductModel,
	buildControlRoomSettingsModel,
	buildControlRoomStateModel,
	buildControlRoomSystemModel,
	startControlRoomServer,
} from "../../src/ui/web/control-room.ts";
import {
	buildBrowserOpenCommand,
	formatControlRoomLaunchMessage,
	parseUiArgs,
} from "../../src/adapters/pi/commands/ui.ts";

const root = await mkdtemp(join(tmpdir(), "codewiki-control-room-"));
let server;
try {
	await mkdir(join(root, ".codewiki/kb/system/diagrams"), { recursive: true });
	await mkdir(join(root, ".codewiki/kb/product/users"), { recursive: true });
	await mkdir(join(root, ".codewiki/kb/product/stories"), { recursive: true });
	await mkdir(join(root, ".codewiki/kb/product/uis"), { recursive: true });
	await mkdir(join(root, ".codewiki/roadmap"), { recursive: true });
	await writeFile(join(root, ".codewiki/config.json"), JSON.stringify({
		project_name: "control-room-smoke",
		schema_version: 4,
		docs_root: ".codewiki/kb",
		roadmap_retention: { closed_task_limit: 0, archive_path: ".codewiki/roadmap/archive.jsonl" },
		lint: { word_count_warn: 1600 },
		codewiki: {
			gateway: { enabled: true, mode: "read-only", deny_paths: ["**/.env*"] },
			rebuild: { quiet: true },
			agency: { budgets: { default: { maxTokens: 1000 } }, parallelism: { max_sessions: 1 } },
			gc: { hot_days: 7 },
		},
	}, null, 2));
	await writeFile(join(root, ".codewiki/roadmap/queue.json"), JSON.stringify({
		version: 2,
		updated: "2026-05-11",
		order: ["TASK-001"],
		tasks: {
			"TASK-001": { id: "TASK-001", title: "Ship map", status: "todo", priority: "high", summary: "Map work", goal: { acceptance: ["Shows work"], verification: ["smoke"] }, spec_paths: [".codewiki/kb/system/api.md"], code_paths: ["src/ui/web/control-room.ts"] },
		},
	}, null, 2));
	await writeFile(join(root, ".codewiki/kb/system/architecture.mmd"), `flowchart TD
  User["User / agent intent"]
  API["CodeWiki API\\napi.md"]
  Graph["Graph state machine\\ngraph.md"]
  User --> API
  API --> Graph
  class API,Graph component;
  class User artifact;
`);
	await writeFile(join(root, ".codewiki/kb/system/api.md"), `---
title: CodeWiki API
summary: Stable semantic contract.
state: active
updated: "2026-05-11"
---

# CodeWiki API

## Responsibility

Owns semantic access.
`);
	await writeFile(join(root, ".codewiki/kb/system/graph.md"), `---
title: Graph state machine
summary: Generated state map.
state: active
updated: "2026-05-11"
---

# Graph

## Responsibility

Owns generated graph state.
`);
	await writeFile(join(root, ".codewiki/kb/product/users/maintainers.md"), `---
title: Maintainers
summary: Users who need high-signal project state.
state: active
updated: "2026-05-12"
---

# Maintainers

## Jobs

See status, work, and blockers.
`);
	await writeFile(join(root, ".codewiki/kb/product/stories/navigation.md"), `---
title: Navigation
summary: Move from status to source-backed detail.
state: active
updated: "2026-05-12"
---

# Navigation

## Story

Open a focused view and inspect source paths.
`);
	await writeFile(join(root, ".codewiki/kb/product/uis/control-room.md"), `---
title: CodeWiki UI
summary: Second-screen visual surface.
state: active
updated: "2026-05-12"
---

# CodeWiki UI

## Purpose

High-signal second screen.
`);
	await writeFile(join(root, ".codewiki/kb/system/diagrams/component-map.yaml"), `schema_version: 1
id: test.component-map
title: Test Component Map
kind: component_map
purpose: Render a component diagram from YAML.
source_docs:
  - .codewiki/kb/system/api.md
nodes:
  - id: api
    label: API
    kind: component
    source: .codewiki/kb/system/api.md
  - id: graph
    label: Graph
    kind: component
    source: .codewiki/kb/system/graph.md
edges:
  - from: api
    to: graph
    label: updates
`);
	await writeFile(join(root, ".codewiki/index_graph.json"), JSON.stringify({
		version: 1,
		generated_at: "2026-05-11T00:00:00Z",
		nodes: [
			{ id: "doc:.codewiki/kb/system/api.md", kind: "doc", path: ".codewiki/kb/system/api.md" },
			{ id: "task:TASK-001", kind: "roadmap_task", path: ".codewiki/roadmap/queue.json" },
		],
		edges: [{ from: "doc:.codewiki/kb/system/api.md", to: "task:TASK-001", kind: "doc_to_task" }],
		lenses: {
			lint: { counts: {}, issues: [], summary: { color: "green", errors: 0, warnings: 0, total_issues: 0 } },
			status: { health: { color: "green", errors: 0, warnings: 0, total: 0 }, roadmap: { open_task_count: 1, next_task_id: "TASK-001" }, next_action: { kind: "resume", summary: "Resume task", command: "/wiki-resume TASK-001" }, claims: { active_claim_count: 0, warning_count: 0, conflict_count: 0 } },
			roadmap: { open_task_count: 1, next_task_id: "TASK-001" },
		},
		views: {
			file_structure: {
				version: 1,
				source: "file-structure-map",
				map_path: ".codewiki/kb/system/diagrams/file-structure-map.yaml",
				available: true,
				categories: ["missing_expected_path", "approved_migration_delta"],
				counts: { missing_expected_path: 1, approved_migration_delta: 1 },
				intended_paths: [{ pattern: "src/ui/**", owner_id: "ui", owner_label: "UI", group: "source", status: "current", role: "current" }, { pattern: "src/surfaces/**", owner_id: "target", owner_label: "Target surface roots", group: "source", status: "accepted_target", role: "target", approved_delta: true }],
				current_paths: [{ pattern: "src/ui/**", owner_id: "ui", owner_label: "UI", group: "source", status: "current", role: "current" }],
				target_paths: [{ pattern: "src/surfaces/**", owner_id: "target", owner_label: "Target surface roots", group: "source", status: "accepted_target", role: "target", approved_delta: true }],
				approved_delta_edges: [{ from: "ui", to: "target", label: "approved migration delta" }],
				approved_migration_deltas: [{ category: "approved_migration_delta", severity: "info", path: "src/surfaces/**", message: "Target root is accepted but not migrated yet.", refs: [".codewiki/kb/system/diagrams/file-structure-map.yaml", ".codewiki/kb/system/file-structure.md"] }],
				actionable_entries: [{ category: "missing_expected_path", severity: "warning", path: "src/ui/web/control-room.ts", message: "Fixture actionable drift.", refs: [".codewiki/kb/system/diagrams/file-structure-map.yaml"] }],
				parse_issues: [],
			},
		},
	}, null, 2));

	const project = await loadProject(root);
	const state = await buildControlRoomStateModel(project);
	assert.equal(state.project.label, "control-room-smoke");
	assert.equal(state.health.color, "green");
	assert.equal(state.roadmap.next, "TASK-001");
	assert.equal(state.graph.nodes, 2);
	assert.equal(state.file_structure.counts.approved_migration_delta, 1);
	assert.equal(state.file_structure.approved_migration_deltas.length, 1);
	assert.equal(state.file_structure.actionable_entries.length, 1);
	assert.equal(state.file_structure.current_paths[0].refs.includes(".codewiki/kb/system/diagrams/file-structure-map.yaml"), true);
	assert.equal(state.file_structure.source_refs.includes(".codewiki/kb/system/file-structure.md"), true);

	const product = await buildControlRoomProductModel(project);
	assert.equal(product.categories.find((category) => category.id === "users")?.items[0]?.title, "Maintainers");
	assert.equal(product.categories.find((category) => category.id === "uis")?.items[0]?.title, "CodeWiki UI");

	const system = await buildControlRoomSystemModel(project);
	assert.equal(system.components.find((component) => component.id === "API")?.doc_path, ".codewiki/kb/system/api.md");
	assert.equal(system.components.find((component) => component.id === "API")?.summary, "Stable semantic contract.");
	assert.equal(system.edges.length, 2);
	assert.equal(system.diagram_catalog[0]?.kind, "component_map");
	assert.equal(system.diagrams[0]?.nodes.length, 2);

	const board = await buildControlRoomBoardModel(project);
	assert.equal(board.stats.open, 1);
	assert.equal(board.tasks[0]?.id, "TASK-001");

	const graph = await buildControlRoomGraphModel(project);
	assert.deepEqual(graph.node_kinds, ["doc", "roadmap_task"]);
	assert.equal(graph.stats.shown_edges, 1);

	const settings = await buildControlRoomSettingsModel(project);
	assert.equal(settings.source_path, ".codewiki/config.json");
	assert.ok(settings.groups.find((group) => group.id === "gateway")?.rows.some((row) => row.path === "codewiki.gateway.enabled"));
	assert.ok(settings.groups.find((group) => group.id === "agency")?.rows.some((row) => row.path === "codewiki.agency.budgets.default.maxTokens"));

	assert.deepEqual(parseUiArgs("3030 /tmp/repo"), { pathArg: "/tmp/repo", port: 3030 });
	assert.deepEqual(parseUiArgs("/tmp/repo"), { pathArg: "/tmp/repo", port: undefined });
	assert.deepEqual(buildBrowserOpenCommand("http://127.0.0.1:3000/", "darwin"), { command: "open", args: ["http://127.0.0.1:3000/"] });
	assert.deepEqual(buildBrowserOpenCommand("http://127.0.0.1:3000/", "linux"), { command: "xdg-open", args: ["http://127.0.0.1:3000/"] });
	assert.deepEqual(buildBrowserOpenCommand("http://127.0.0.1:3000/", "win32"), { command: "cmd", args: ["/c", "start", "", "http://127.0.0.1:3000/"] });
	assert.equal(buildBrowserOpenCommand("http://127.0.0.1:3000/", "aix"), null);
	assert.equal(
		formatControlRoomLaunchMessage("repo", "http://127.0.0.1:3000/", { opened: true }, { alreadyRunning: false }),
		"repo CodeWiki UI started; opened browser. URL: http://127.0.0.1:3000/",
	);
	assert.match(
		formatControlRoomLaunchMessage("repo", "http://127.0.0.1:3000/", { opened: false, error: "missing" }, { alreadyRunning: true }),
		/Open: http:\/\/127\.0\.0\.1:3000\//,
	);

	server = await startControlRoomServer(project, { port: 0 });
	assert.equal(server.host, "127.0.0.1");
	const html = await fetch(server.url).then((res) => res.text());
	assert.match(html, /<title>CodeWiki<\/title>/);
	assert.match(html, /<span class="title">CodeWiki<\/span>/);
	assert.doesNotMatch(html, /CodeWiki Control Room|Control Room sections|booting control room/);
	assert.match(html, /data-view="status"/);
	assert.match(html, /data-view="product"/);
	assert.match(html, /data-view="board"/);
	assert.match(html, /id="settingsButton"/);
	assert.doesNotMatch(html, /data-view="diff"|data-view="builds"|data-view="validation"|data-view="settings"|data-view="knowledge"/);
	assert.match(html, /\/assets\/vendor\/cytoscape\.min\.js/);
	const vendor = await fetch(new URL("/assets/vendor/cytoscape.min.js", server.url)).then((res) => res.text());
	assert.match(vendor, /cytoscape/i);
	const css = await fetch(new URL("/assets/control-room.css", server.url)).then((res) => res.text());
	assert.match(css, /--highlight: #f4f1e8/);
	assert.match(css, /--accent: #c7a35a/);
	assert.match(css, /\.graphmap/);
	assert.match(css, /\.kanban/);
	assert.match(css, /\.source-drawer/);
	assert.match(css, /\.structure-review/);
	assert.doesNotMatch(css, /42f5ff|--cyan/i);
	const js = await fetch(new URL("/assets/control-room.js", server.url)).then((res) => res.text());
	assert.match(js, /CodeWiki map/);
	assert.match(js, /Retro Kanban over roadmap truth/);
	assert.match(js, /Stories and UI surfaces first/);
	assert.match(js, /Source Markdown/);
	assert.match(js, /data-zoom="graph:in"/);
	assert.match(js, /data-zoom="system:fit"/);
	assert.match(js, /scope <select id="graphScope"/);
	assert.match(js, /window\.cytoscape/);
	assert.match(js, /state\.cy/);
	assert.match(js, /GRAPH_FIT_PADDING = 72/);
	assert.match(js, /GRAPH_LAYOUT_SPACING = 180/);
	assert.match(js, /minZoom: 0\.05/);
	assert.match(js, /nodeRepulsion: GRAPH_NODE_REPULSION/);
	assert.match(js, /fitGraph\(state\.cy\)/);
	assert.match(js, /toggleSettings/);
	assert.match(js, /\/api\/settings/);
	assert.match(js, /File-structure review/);
	assert.match(js, /Approved migration deltas/);
	assert.match(js, /Actionable drift/);
	const apiState = await fetch(new URL("/api/state", server.url)).then((res) => res.json());
	assert.equal(apiState.project.label, "control-room-smoke");
	assert.equal(apiState.file_structure.approved_migration_deltas[0].path, "src/surfaces/**");
	assert.equal(apiState.file_structure.actionable_entries[0].category, "missing_expected_path");
	const apiProduct = await fetch(new URL("/api/product", server.url)).then((res) => res.json());
	assert.equal(apiProduct.categories.length, 3);
	const apiBoard = await fetch(new URL("/api/board", server.url)).then((res) => res.json());
	assert.equal(apiBoard.tasks[0].id, "TASK-001");
	const apiSettings = await fetch(new URL("/api/settings", server.url)).then((res) => res.json());
	assert.equal(apiSettings.groups.find((group) => group.id === "project").rows[0].source_path, ".codewiki/config.json");
} finally {
	if (server) await server.close();
	await rm(root, { recursive: true, force: true });
}
