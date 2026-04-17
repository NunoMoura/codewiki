import { basename, posix } from "node:path";

export interface StarterBoundary {
  codePath: string;
  slug: string;
  title: string;
}

export interface StarterBrownfieldHints {
  boundaries: StarterBoundary[];
  repoMarkdownGlobs: string[];
  codeGlobs: string[];
}

export interface StarterTemplateInput {
  projectName: string;
  date: string;
  brownfieldHints?: StarterBrownfieldHints;
}

export function starterDirectories(): string[] {
  return [
    ".docs/sources",
    "docs/specs/system",
    "docs/specs/shared",
    "docs/research",
    "scripts",
  ];
}

export function starterFiles(input: StarterTemplateInput): Record<string, string> {
  const projectName = input.projectName.trim() || basename(process.cwd());
  const date = input.date;
  const brownfieldHints = input.brownfieldHints ?? { boundaries: [], repoMarkdownGlobs: [], codeGlobs: [] };
  const files: Record<string, string> = {
    ".docs/config.json": configJson(projectName, brownfieldHints),
    ".docs/events.jsonl": bootstrapEvent(projectName),
    ".docs/sources/.gitkeep": "",
    "scripts/rebuild_docs_meta.py": rebuildScript(),
    "docs/specs/product.md": productSpecDoc(projectName, date),
    "docs/specs/system/overview.md": systemSpecDoc(projectName, date, brownfieldHints.boundaries),
    "docs/specs/shared/overview.md": sharedSpecDoc(projectName, date),
    "docs/research/inspiration.jsonl": researchJsonl(projectName, date),
    "docs/roadmap.json": roadmapJson(projectName, date),
  };

  for (const boundary of brownfieldHints.boundaries) {
    files[`docs/specs/${boundary.slug}/overview.md`] = boundarySpecDoc(projectName, date, boundary);
  }

  return files;
}

function configJson(projectName: string, brownfieldHints: StarterBrownfieldHints): string {
  const repoMarkdown = uniqueStrings(brownfieldHints.repoMarkdownGlobs.length ? brownfieldHints.repoMarkdownGlobs : ["README.md", "src/**/README.md", "backend/**/README.md"]);
  const codeGlobs = uniqueStrings(brownfieldHints.codeGlobs.length ? brownfieldHints.codeGlobs : ["src/**", "app/**", "backend/**", "server/**"]);

  return JSON.stringify(
    {
      version: 2,
      project_name: projectName,
      index_title: `${projectName} Docs Index`,
      docs_root: "docs",
      specs_root: "docs/specs",
      research_root: "docs/research",
      index_path: "docs/index.md",
      roadmap_path: "docs/roadmap.json",
      roadmap_doc_path: "docs/roadmap.md",
      roadmap_events_path: ".docs/roadmap-events.jsonl",
      meta_root: ".docs",
      sources_root: ".docs/sources",
      generated_files: [
        "docs/index.md",
        "docs/roadmap.md",
        ".docs/registry.json",
        ".docs/backlinks.json",
        ".docs/lint.json",
        ".docs/task-session-index.json",
        ".docs/roadmap-state.json",
      ],
      lint: {
        repo_markdown: repoMarkdown,
        forbidden_headings: [
          "## Purpose",
          "## When To Read",
          "## Content",
          "## Summary",
          "## How To Use This Doc",
        ],
        word_count_warn: 1600,
        word_count_exempt: ["docs/roadmap.md"],
      },
      codebase_wiki: {
        name: `${projectName} codebase wiki`,
        rebuild_command: ["python", "scripts/rebuild_docs_meta.py"],
        self_drift_scope: {
          include: [
            "docs/index.md",
            "docs/roadmap.json",
            "docs/roadmap.md",
            "docs/specs/**",
            "docs/research/**",
          ],
          exclude: ["docs/_templates/**"],
        },
        code_drift_scope: {
          docs: [
            "docs/roadmap.md",
            "docs/specs/**",
          ],
          repo_docs: repoMarkdown,
          code: codeGlobs,
        },
      },
    },
    null,
    2,
  ) + "\n";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].filter(Boolean);
}

function bootstrapEvent(projectName: string): string {
  return JSON.stringify(
    {
      ts: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      kind: "bootstrap",
      title: "Bootstrapped simplified codebase wiki",
      summary: `Created starter research/specs/roadmap contract for ${projectName}.`,
    },
  ) + "\n";
}

function productSpecDoc(projectName: string, date: string): string {
  return [
    "---",
    "id: spec.product",
    "title: Product",
    "state: active",
    `summary: Product intent, users, and boundaries for ${projectName}.`,
    "owners:",
    "- product",
    `updated: '${date}'`,
    "---",
    "",
    "# Product",
    "",
    `## Intent`,
    "",
    `Describe what ${projectName} exists to do and why docs should stay ahead of code.`,
    "",
    "## Users",
    "",
    "- primary users",
    "- operator or maintainer users",
    "- agent workflows that depend on this project",
    "",
    "## Success criteria",
    "",
    "- high-signal docs that stay close to implementation",
    "- predictable rebuild, lint, and audit workflows",
    "- roadmap always reflects freshest delta to close",
    "- Pi sessions can resume task work cleanly because sessions link back to roadmap tasks",
    "",
    "## Non-goals",
    "",
    "- duplicated narrative across many docs",
    "- stale historical buckets mixed with live design",
    "- prose plans that are not directly trackable",
    "",
    "## Related docs",
    "",
    "- [System Overview](system/overview.md)",
    "- [Shared Rules](shared/overview.md)",
    "- [Roadmap](../roadmap.md)",
    "",
  ].join("\n");
}

function systemSpecDoc(projectName: string, date: string, boundaries: StarterBoundary[]): string {
  const lines = [
    "---",
    "id: spec.system.overview",
    "title: System Overview",
    "state: active",
    `summary: Main runtime areas and ownership boundaries for ${projectName}.`,
    "owners:",
    "- architecture",
    `updated: '${date}'`,
    "---",
    "",
    "# System Overview",
    "",
    "## Main boundaries",
    "",
    `Map ${projectName} into meaningful ownership areas. Each area should get one canonical overview doc before any deeper split.`,
    "",
    "- product-facing boundary",
    "- runtime or service boundary",
    "- shared or package boundary",
    "",
  ];

  if (boundaries.length) {
    lines.push("## Inferred brownfield boundaries", "", "Setup detected these candidate ownership seams from repo structure. Refine, collapse, or rename them if the codebase uses different stable boundaries.", "");
    for (const boundary of boundaries) {
      const target = `docs/specs/${boundary.slug}/overview.md`;
      lines.push(`- [${boundary.title}](${posix.relative("docs/specs/system", target)}) — owns \`${boundary.codePath}\``);
    }
    lines.push("");
  }

  lines.push(
    "## Spec organization rule",
    "",
    "Specs mirror meaningful project hierarchy, not arbitrary doc categories.",
    "",
    "- one folder per real boundary when needed",
    "- one canonical `overview.md` per boundary",
    "- local decisions live inside owning spec, not in a global ADR bucket",
    "",
    "## Brownfield mapping rule",
    "",
    "For existing repos, setup should infer first-pass ownership specs from repo-relative boundaries before humans refine the language and invariants.",
    "",
    "## Related docs",
    "",
    "- [Product](../product.md)",
    "- [Shared Rules](../shared/overview.md)",
    "- [Roadmap](../../roadmap.md)",
    "",
  );

  return lines.join("\n");
}

function boundarySpecDoc(projectName: string, date: string, boundary: StarterBoundary): string {
  const docPath = `docs/specs/${boundary.slug}/overview.md`;
  const docDir = posix.dirname(docPath);
  const productLink = posix.relative(docDir, "docs/specs/product.md");
  const systemLink = posix.relative(docDir, "docs/specs/system/overview.md");
  const sharedLink = posix.relative(docDir, "docs/specs/shared/overview.md");
  const roadmapLink = posix.relative(docDir, "docs/roadmap.md");
  const boundaryId = boundary.slug.split("/").join(".");

  return [
    "---",
    `id: spec.${boundaryId}.overview`,
    `title: ${boundary.title}`,
    "state: active",
    `summary: Inferred first-pass ownership boundary for ${boundary.codePath} in ${projectName}.`,
    "owners:",
    "- engineering",
    `updated: '${date}'`,
    "code_paths:",
    `- ${boundary.codePath}`,
    "---",
    "",
    `# ${boundary.title}`,
    "",
    "## Boundary intent",
    "",
    `This overview was inferred during setup from the repo structure at \`${boundary.codePath}\`. Replace the starter language with the real responsibilities, invariants, and collaborators for this boundary.`,
    "",
    "## Refinement prompts",
    "",
    "- describe what this boundary owns",
    "- name the upstream and downstream collaborators",
    "- record invariants that should remain stable even as implementation details change",
    "- collapse or split this spec only when the codebase has a real ownership seam",
    "",
    "## Related docs",
    "",
    `- [Product](${productLink})`,
    `- [System Overview](${systemLink})`,
    `- [Shared Rules](${sharedLink})`,
    `- [Roadmap](${roadmapLink})`,
    "",
  ].join("\n");
}

function sharedSpecDoc(projectName: string, date: string): string {
  return [
    "---",
    "id: spec.shared.overview",
    "title: Shared Rules",
    "state: active",
    `summary: Shared documentation contract for maintaining ${projectName}'s simplified codebase wiki.`,
    "owners:",
    "- docs",
    `updated: '${date}'`,
    "---",
    "",
    "# Shared Rules",
    "",
    "## Canonical artifacts",
    "",
    "- `docs/specs/**.md`: intended system truth",
    "- `docs/research/*.jsonl`: compact evidence capture",
    "- `docs/roadmap.json`: canonical mutable roadmap state",
    "- `docs/roadmap.md`: generated human roadmap view",
    "- `docs/index.md`: generated navigation surface",
    "- `.docs/task-session-index.json`: derived task-to-session metadata",
    "- `.docs/roadmap-state.json`: derived roadmap/task/session UI read model",
    "- `.docs/`: generated metadata and events",
    "",
    "## Responsibilities",
    "",
    "### Research",
    "",
    "Research stores evidence, references, and short synthesized findings. It should stay compact and appendable.",
    "",
    "### Specs",
    "",
    "Specs define desired state. They should be readable by humans and specific enough for agents to compare against code.",
    "",
    "### Roadmap",
    "",
    "Roadmap is the top-level container for numbered tasks that close the delta between desired state and current implementation reality. Tasks are the atomic work units.",
    "",
    "### Sessions",
    "",
    "Pi sessions store execution history. This wiki should link tasks to sessions through Pi custom session entries and derive local metadata instead of replacing Pi session JSONL.",
    "",
    "## Writing rules",
    "",
    "- prefer edits to canonical specs over new overlapping docs",
    "- keep research structured and terse",
    "- keep roadmap tasks actionable, scoped, and fresh",
    "- treat generated docs as navigation, not source of truth",
    "",
    "## Related docs",
    "",
    "- [Product](../product.md)",
    "- [System Overview](../system/overview.md)",
    "- [Roadmap](../../roadmap.md)",
    "",
  ].join("\n");
}

function researchJsonl(projectName: string, date: string): string {
  return [
    JSON.stringify({
      id: "RES-001",
      title: `Initial documentation pattern note for ${projectName}`,
      summary: "Replace this seed with real external evidence or implementation findings.",
      web_link: "https://example.com",
      source_type: "bootstrap",
      tags: ["seed"],
      created: date,
      updated: date,
    }),
  ].join("\n") + "\n";
}

function roadmapJson(projectName: string, date: string): string {
  return JSON.stringify(
    {
      version: 1,
      updated: date,
      order: ["TASK-001", "TASK-002", "TASK-003"],
      tasks: {
        "TASK-001": {
          id: "TASK-001",
          title: "Lock product intent in specs",
          status: "todo",
          priority: "high",
          kind: "docs",
          summary: `Turn ${projectName} intent into explicit product and boundary specs.`,
          spec_paths: ["docs/specs/product.md", "docs/specs/system/overview.md"],
          code_paths: [],
          research_ids: [],
          labels: ["foundation", "specs"],
          delta: {
            desired: "Product intent and architecture boundaries are explicit and stable.",
            current: "Starter docs need project-specific content.",
            closure: "Replace placeholders with concrete intended behavior and ownership boundaries.",
          },
          created: date,
          updated: date,
        },
        "TASK-002": {
          id: "TASK-002",
          title: "Map code ownership into spec hierarchy",
          status: "todo",
          priority: "high",
          kind: "architecture",
          summary: "Refine the inferred boundary specs until docs/specs mirrors the repo's real ownership seams without creating doc sprawl.",
          spec_paths: ["docs/specs/system/overview.md"],
          code_paths: [],
          research_ids: [],
          labels: ["brownfield", "mapping"],
          delta: {
            desired: "Each meaningful layer or component has one canonical owning spec.",
            current: "Setup can infer first-pass boundaries, but humans still need to confirm or reshape them.",
            closure: "Add, remove, or rewrite inferred spec folders until they match real stable ownership seams.",
          },
          created: date,
          updated: date,
        },
        "TASK-003": {
          id: "TASK-003",
          title: "Keep roadmap as freshest delta log",
          status: "todo",
          priority: "medium",
          kind: "process",
          summary: "Move drift and plan tracking into structured roadmap tasks instead of separate prose buckets.",
          spec_paths: ["docs/specs/shared/overview.md"],
          code_paths: [],
          research_ids: [],
          labels: ["roadmap", "process"],
          delta: {
            desired: "Roadmap is single current queue for closing docs-to-code gaps.",
            current: "Teams often spread gaps across plans, drift notes, and chat.",
            closure: "Convert each active mismatch or sequence into a scoped roadmap task.",
          },
          created: date,
          updated: date,
        },
      },
    },
    null,
    2,
  ) + "\n";
}

function rebuildScript(): string {
  return String.raw`#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / ".docs" / "config.json"

DEFAULT_FORBIDDEN_HEADINGS = {
    "## Purpose",
    "## When To Read",
    "## Content",
    "## Summary",
    "## How To Use This Doc",
}
DEFAULT_WORD_COUNT_WARN = 1600
DEFAULT_WORD_COUNT_EXEMPT = {"docs/roadmap.md"}
DEFAULT_REPO_MARKDOWN_PATTERNS = [
    "README.md",
    "src/**/README.md",
    "backend/**/README.md",
]
DEFAULT_REQUIRED_FIELDS = ["id", "title", "state", "summary", "owners", "updated"]
DEFAULT_STATE_BY_TYPE = {
    "spec": "active",
    "roadmap": "active",
}
LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
H1_RE = re.compile(r"^#\s+(.+)$", re.MULTILINE)
BACKTICK_DOC_PATH_RE = re.compile(r"\`((?:\.\.?/)*docs/[^\`\s]+)\`")


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return {}
    data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def maybe_str_list(value: Any) -> list[str] | None:
    if not isinstance(value, list):
        return None
    return [str(item) for item in value]


def maybe_dict(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


CONFIG = load_config()
LINT_CONFIG = maybe_dict(CONFIG.get("lint")) or {}
PROJECT_NAME = str(CONFIG.get("project_name", ROOT.name))
DOCS_ROOT = ROOT / str(CONFIG.get("docs_root", "docs"))
SPECS_ROOT = ROOT / str(CONFIG.get("specs_root", "docs/specs"))
RESEARCH_ROOT = ROOT / str(CONFIG.get("research_root", "docs/research"))
ROADMAP_PATH = ROOT / str(CONFIG.get("roadmap_path", "docs/roadmap.json"))
ROADMAP_DOC_PATH = ROOT / str(CONFIG.get("roadmap_doc_path", "docs/roadmap.md"))
ROADMAP_EVENTS_PATH = ROOT / str(CONFIG.get("roadmap_events_path", ".docs/roadmap-events.jsonl"))
META_ROOT = ROOT / str(CONFIG.get("meta_root", ".docs"))
TASK_SESSION_INDEX_PATH = META_ROOT / "task-session-index.json"
ROADMAP_STATE_PATH = META_ROOT / "roadmap-state.json"
INDEX_PATH = ROOT / str(CONFIG.get("index_path", "docs/index.md"))
INDEX_TITLE = str(CONFIG.get("index_title", f"{PROJECT_NAME} Docs Index"))
FORBIDDEN_HEADINGS = set(maybe_str_list(LINT_CONFIG.get("forbidden_headings")) or sorted(DEFAULT_FORBIDDEN_HEADINGS))
WORD_COUNT_WARN = int(LINT_CONFIG.get("word_count_warn", DEFAULT_WORD_COUNT_WARN))
WORD_COUNT_EXEMPT = set(maybe_str_list(LINT_CONFIG.get("word_count_exempt")) or sorted(DEFAULT_WORD_COUNT_EXEMPT))
REPO_MARKDOWN_PATTERNS = maybe_str_list(LINT_CONFIG.get("repo_markdown")) or DEFAULT_REPO_MARKDOWN_PATTERNS


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}, text
    raw = text[4:end]
    body = text[end + 5 :]
    data = yaml.safe_load(raw) or {}
    if not isinstance(data, dict):
        data = {}
    return data, body


def extract_title(path: Path, body: str, frontmatter: dict[str, Any]) -> str:
    if isinstance(frontmatter.get("title"), str) and frontmatter["title"].strip():
        return frontmatter["title"].strip()
    match = H1_RE.search(body)
    if match:
        return match.group(1).strip()
    stem = path.stem.replace("-", " ").replace("_", " ").strip()
    return stem.title() if stem else path.name


def classify_doc(path: Path) -> str:
    if path == ROADMAP_DOC_PATH:
        return "roadmap"
    if path.is_relative_to(SPECS_ROOT):
        return "spec"
    return "doc"


def markdown_doc_files() -> list[Path]:
    files: list[Path] = []
    if SPECS_ROOT.exists():
        for path in sorted(SPECS_ROOT.rglob("*.md")):
            if path.is_relative_to(SPECS_ROOT / "_templates"):
                continue
            files.append(path)
    if ROADMAP_DOC_PATH.exists():
        files.append(ROADMAP_DOC_PATH)
    return files


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    items: list[dict[str, Any]] = []
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path.relative_to(ROOT).as_posix()}:{line_number} invalid JSON: {exc}") from exc
        if not isinstance(data, dict):
            raise ValueError(f"{path.relative_to(ROOT).as_posix()}:{line_number} is not a JSON object")
        items.append(data)
    return items


def read_roadmap_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "updated": now_iso(), "order": [], "tasks": {}}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path.relative_to(ROOT).as_posix()} is not a JSON object")
    tasks = data.get("tasks") if isinstance(data.get("tasks"), dict) else {}
    order = [str(item) for item in data.get("order", []) if str(item).strip()] if isinstance(data.get("order"), list) else []
    return {
        "version": int(data.get("version", 1)),
        "updated": str(data.get("updated", now_iso())),
        "order": order,
        "tasks": tasks,
    }


def roadmap_entries(roadmap: dict[str, Any]) -> list[dict[str, Any]]:
    tasks = roadmap.get("tasks", {}) if isinstance(roadmap.get("tasks"), dict) else {}
    order = roadmap.get("order", []) if isinstance(roadmap.get("order"), list) else []
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for task_id in order:
        key = str(task_id)
        task = tasks.get(key)
        if isinstance(task, dict):
            result.append(task)
            seen.add(key)
    for key in sorted(tasks.keys()):
        if key in seen:
            continue
        task = tasks.get(key)
        if isinstance(task, dict):
            result.append(task)
    return result


def read_task_session_index(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "updated": now_iso(), "tasks": {}, "sessions": {}}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path.relative_to(ROOT).as_posix()} is not a JSON object")
    return {
        "version": int(data.get("version", 1)),
        "updated": str(data.get("updated", now_iso())),
        "tasks": data.get("tasks") if isinstance(data.get("tasks"), dict) else {},
        "sessions": data.get("sessions") if isinstance(data.get("sessions"), dict) else {},
    }


def normalize_local_link(source_rel: Path, target: str) -> str | None:
    target_path = (ROOT / source_rel.parent / target).resolve()
    try:
        return target_path.relative_to(ROOT).as_posix()
    except ValueError:
        return None


def extract_links(body: str, rel_path: Path) -> list[str]:
    links: list[str] = []
    for match in LINK_RE.finditer(body):
        target = match.group(1).strip()
        if not target or target.startswith("#"):
            continue
        if "://" in target or target.startswith("mailto:"):
            continue
        base = target.split("#", 1)[0]
        if not base:
            continue
        normalized = normalize_local_link(rel_path, base)
        if normalized:
            links.append(normalized)
    return sorted(set(links))


def parse_doc(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    frontmatter, body = split_frontmatter(text)
    rel = path.relative_to(ROOT)
    title = extract_title(path, body, frontmatter)
    summary = frontmatter.get("summary") if isinstance(frontmatter.get("summary"), str) else ""
    owners = frontmatter.get("owners") if isinstance(frontmatter.get("owners"), list) else []
    tags = frontmatter.get("tags") if isinstance(frontmatter.get("tags"), list) else []
    code_paths = frontmatter.get("code_paths") if isinstance(frontmatter.get("code_paths"), list) else []
    doc_type = classify_doc(path)
    return {
        "path": rel.as_posix(),
        "frontmatter": frontmatter,
        "body": body,
        "title": title,
        "id": str(frontmatter.get("id", rel.as_posix())),
        "doc_type": doc_type,
        "state": str(frontmatter.get("state", "")),
        "summary": summary.strip(),
        "owners": [str(x) for x in owners],
        "tags": [str(x) for x in tags],
        "code_paths": [str(x) for x in code_paths],
        "links": extract_links(body, rel),
        "word_count": len(re.findall(r"\S+", body)),
    }


def load_research_collections() -> list[dict[str, Any]]:
    collections: list[dict[str, Any]] = []
    if not RESEARCH_ROOT.exists():
        return collections
    for path in sorted(RESEARCH_ROOT.rglob("*.jsonl")):
        entries = read_jsonl(path)
        payload_entries = []
        for entry in entries:
            payload_entries.append(
                {
                    "id": str(entry.get("id", "")).strip(),
                    "title": str(entry.get("title", "")).strip(),
                    "summary": str(entry.get("summary", "")).strip(),
                    "web_link": str(entry.get("web_link", "")).strip(),
                    "updated": str(entry.get("updated", "")).strip(),
                    "tags": [str(value) for value in entry.get("tags", []) if str(value).strip()],
                }
            )
        collections.append(
            {
                "path": path.relative_to(ROOT).as_posix(),
                "entry_count": len(payload_entries),
                "entries": payload_entries,
            }
        )
    return collections


def build_registry(docs: list[dict[str, Any]], research: list[dict[str, Any]], roadmap_entries: list[dict[str, Any]]) -> dict[str, Any]:
    roadmap_counts = Counter(str(item.get("status", "todo")) for item in roadmap_entries)
    return {
        "generated_at": now_iso(),
        "docs": [
            {
                "id": doc["id"],
                "path": doc["path"],
                "title": doc["title"],
                "doc_type": doc["doc_type"],
                "state": doc["state"],
                "summary": doc["summary"],
                "owners": doc["owners"],
                "tags": doc["tags"],
                "code_paths": doc["code_paths"],
                "links_out": doc["links"],
            }
            for doc in sorted(docs, key=lambda item: item["path"])
        ],
        "research": [
            {
                "path": collection["path"],
                "entry_count": collection["entry_count"],
            }
            for collection in research
        ],
        "roadmap": {
            "entry_count": len(roadmap_entries),
            "counts": roadmap_counts,
        },
    }


def build_backlinks(docs: list[dict[str, Any]]) -> dict[str, Any]:
    known = {doc["path"] for doc in docs}
    by_path: dict[str, dict[str, list[str]]] = {
        doc["path"]: {"inbound": [], "outbound": []} for doc in docs
    }
    for doc in docs:
        outbound = [link for link in doc["links"] if link in known]
        by_path[doc["path"]]["outbound"] = sorted(set(outbound))
        for target in outbound:
            by_path[target]["inbound"].append(doc["path"])
    for payload in by_path.values():
        payload["inbound"] = sorted(set(payload["inbound"]))
    return {
        "generated_at": now_iso(),
        "by_path": by_path,
    }


def issue(severity: str, kind: str, path: str, message: str) -> dict[str, Any]:
    return {
        "severity": severity,
        "kind": kind,
        "path": path,
        "message": message,
    }


def extract_raw_link_targets(body: str) -> list[str]:
    return [match.group(1).strip() for match in LINK_RE.finditer(body)]


def lint_markdown_docs(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    ids = Counter(doc["id"] for doc in docs)

    for doc in docs:
        for field in DEFAULT_REQUIRED_FIELDS:
            value = doc["frontmatter"].get(field)
            if value in (None, "", []):
                issues.append(issue("error", "missing-field", doc["path"], f"Missing required frontmatter field: {field}"))
        if ids[doc["id"]] > 1:
            issues.append(issue("error", "duplicate-id", doc["path"], f"Duplicate id: {doc['id']}"))

        for raw_target in extract_raw_link_targets(doc["body"]):
            if raw_target.startswith("#") or "://" in raw_target or raw_target.startswith("mailto:"):
                continue
            base = raw_target.split("#", 1)[0]
            if not base:
                continue
            target_abs = (ROOT / Path(doc["path"]).parent / base).resolve()
            if not target_abs.exists():
                issues.append(issue("error", "broken-link", doc["path"], f"Broken link: {raw_target}"))

        for code_path in doc["code_paths"]:
            candidate = (ROOT / code_path).resolve()
            if not candidate.exists():
                issues.append(issue("warning", "missing-code-path", doc["path"], f"Referenced code path does not exist: {code_path}"))

        if doc["path"] not in WORD_COUNT_EXEMPT and doc["word_count"] > WORD_COUNT_WARN:
            issues.append(issue("warning", "large-doc", doc["path"], f"Live doc has {doc['word_count']} words; consider split or cut."))

        for heading in FORBIDDEN_HEADINGS:
            if heading in doc["body"]:
                issues.append(issue("warning", "forbidden-heading", doc["path"], f"Forbidden heading in live doc: {heading}"))

        if "## Related docs" not in doc["body"]:
            issues.append(issue("warning", "missing-related-docs", doc["path"], "Live doc should end with '## Related docs'."))

    return issues


def lint_research_collections(collections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for collection in collections:
        source_path = collection["path"]
        for index, entry in enumerate(collection["entries"], start=1):
            entry_id = entry.get("id", "")
            if not entry_id:
                issues.append(issue("error", "research-missing-id", source_path, f"Entry {index} missing id"))
                continue
            if entry_id in seen_ids:
                issues.append(issue("error", "research-duplicate-id", source_path, f"Duplicate research id: {entry_id}"))
            seen_ids.add(entry_id)
            for field in ["title", "summary", "web_link", "updated"]:
                if not str(entry.get(field, "")).strip():
                    issues.append(issue("error", f"research-missing-{field}", source_path, f"{entry_id} missing {field}"))
            web_link = str(entry.get("web_link", "")).strip()
            if web_link and not (web_link.startswith("http://") or web_link.startswith("https://")):
                issues.append(issue("warning", "research-bad-link", source_path, f"{entry_id} should use http/https web_link"))

    return issues


def lint_roadmap_entries(entries: list[dict[str, Any]], research_collections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    allowed_status = {"todo", "in_progress", "blocked", "done", "cancelled"}
    allowed_priority = {"critical", "high", "medium", "low"}
    source_path = ROADMAP_PATH.relative_to(ROOT).as_posix()
    research_ids = {
        entry["id"]
        for collection in research_collections
        for entry in collection["entries"]
        if entry.get("id")
    }

    for index, entry in enumerate(entries, start=1):
        entry_id = str(entry.get("id", "")).strip()
        if not entry_id:
            issues.append(issue("error", "roadmap-missing-id", source_path, f"Entry {index} missing task id"))
            continue
        if entry_id in seen_ids:
            issues.append(issue("error", "roadmap-duplicate-id", source_path, f"Duplicate roadmap task id: {entry_id}"))
        seen_ids.add(entry_id)

        for field in ["title", "status", "priority", "kind", "summary", "created", "updated"]:
            if not str(entry.get(field, "")).strip():
                issues.append(issue("error", f"roadmap-missing-{field}", source_path, f"{entry_id} missing {field}"))

        status = str(entry.get("status", "todo"))
        if status not in allowed_status:
            issues.append(issue("error", "roadmap-bad-status", source_path, f"{entry_id} has invalid status: {status}"))

        priority = str(entry.get("priority", "medium"))
        if priority not in allowed_priority:
            issues.append(issue("error", "roadmap-bad-priority", source_path, f"{entry_id} has invalid priority: {priority}"))

        spec_paths = [str(value) for value in entry.get("spec_paths", []) if str(value).strip()]
        code_paths = [str(value) for value in entry.get("code_paths", []) if str(value).strip()]
        research_refs = [str(value) for value in entry.get("research_ids", []) if str(value).strip()]

        if not spec_paths and not code_paths:
            issues.append(issue("warning", "roadmap-unscoped", source_path, f"{entry_id} should reference at least one spec_paths or code_paths entry"))

        for spec_path in spec_paths:
            if not (ROOT / spec_path).exists():
                issues.append(issue("error", "roadmap-missing-spec-path", source_path, f"{entry_id} references missing spec path: {spec_path}"))

        for code_path in code_paths:
            if not (ROOT / code_path).exists():
                issues.append(issue("warning", "roadmap-missing-code-path", source_path, f"{entry_id} references missing code path: {code_path}"))

        for research_id in research_refs:
            if research_id not in research_ids:
                issues.append(issue("warning", "roadmap-missing-research-id", source_path, f"{entry_id} references unknown research id: {research_id}"))

    return issues


def repo_markdown_files() -> list[Path]:
    files: set[Path] = set()
    for pattern in REPO_MARKDOWN_PATTERNS:
        for path in ROOT.glob(pattern):
            if path.is_file():
                files.add(path)
    return sorted(files)


def lint_repo_markdown_doc_links() -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    docs_prefix = DOCS_ROOT.relative_to(ROOT).as_posix().rstrip("/") + "/"
    meta_prefix = META_ROOT.relative_to(ROOT).as_posix().rstrip("/") + "/"
    for path in repo_markdown_files():
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(ROOT).as_posix()
        refs = list(extract_raw_link_targets(text)) + [match.group(1).strip() for match in BACKTICK_DOC_PATH_RE.finditer(text)]
        for raw_target in refs:
            if raw_target.startswith("#") or "://" in raw_target or raw_target.startswith("mailto:"):
                continue
            base = raw_target.split("#", 1)[0]
            if not base:
                continue
            target_abs = (path.parent / base).resolve()
            try:
                target_rel = target_abs.relative_to(ROOT).as_posix()
            except ValueError:
                continue
            if target_rel.startswith(docs_prefix) or target_rel.startswith(meta_prefix):
                if not target_abs.exists():
                    issues.append(issue("error", "repo-doc-link", rel, f"Broken docs link/path: {raw_target}"))
    return issues


def lint(docs: list[dict[str, Any]], roadmap_entries: list[dict[str, Any]], research_collections: list[dict[str, Any]]) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    issues.extend(lint_markdown_docs(docs))
    issues.extend(lint_research_collections(research_collections))
    issues.extend(lint_roadmap_entries(roadmap_entries, research_collections))
    issues.extend(lint_repo_markdown_doc_links())
    return {
        "generated_at": now_iso(),
        "counts": Counter(item["kind"] for item in issues),
        "issues": issues,
    }


def lint_health(lint_report: dict[str, Any]) -> dict[str, Any]:
    issues = lint_report.get("issues") if isinstance(lint_report.get("issues"), list) else []
    errors = sum(1 for item in issues if str(item.get("severity", "")) == "error")
    warnings = sum(1 for item in issues if str(item.get("severity", "")) == "warning")
    color = "red" if errors > 0 else "yellow" if warnings > 0 else "green"
    return {
        "color": color,
        "errors": errors,
        "warnings": warnings,
        "total_issues": len(issues),
    }


def build_roadmap_state(entries: list[dict[str, Any]], task_session_index: dict[str, Any], lint_report: dict[str, Any]) -> dict[str, Any]:
    ordered = [str(item.get("id", "")).strip() for item in entries if str(item.get("id", "")).strip()]
    task_sessions = task_session_index.get("tasks") if isinstance(task_session_index.get("tasks"), dict) else {}
    session_summaries = task_session_index.get("sessions") if isinstance(task_session_index.get("sessions"), dict) else {}
    status_counts = Counter(str(item.get("status", "todo")) for item in entries)
    priority_counts = Counter(str(item.get("priority", "medium")) for item in entries)
    tasks: dict[str, Any] = {}
    linked_task_count = 0

    for item in entries:
        task_id = str(item.get("id", "")).strip()
        if not task_id:
            continue
        session_meta = task_session_summary(task_sessions, task_id)
        if session_meta:
            linked_task_count += 1
        tasks[task_id] = {
            "id": task_id,
            "title": str(item.get("title", task_id)).strip(),
            "status": str(item.get("status", "todo")),
            "priority": str(item.get("priority", "medium")),
            "kind": str(item.get("kind", "task")).strip(),
            "summary": str(item.get("summary", "")).strip(),
            "labels": [str(value) for value in item.get("labels", []) if str(value).strip()],
            "spec_paths": [str(value) for value in item.get("spec_paths", []) if str(value).strip()],
            "code_paths": [str(value) for value in item.get("code_paths", []) if str(value).strip()],
            "updated": str(item.get("updated", "")).strip(),
            "session_count": int(session_meta.get("session_count", len(session_meta.get("session_ids", [])))) if session_meta else 0,
            "last_session_id": str(session_meta.get("last_session_id", "")).strip() if session_meta else "",
            "last_session_name": str(session_meta.get("last_session_name", "")).strip() if session_meta else "",
            "last_action": str(session_meta.get("last_action", "")).strip() if session_meta else "",
            "last_summary": str(session_meta.get("last_summary", "")).strip() if session_meta else "",
            "last_timestamp": str(session_meta.get("last_timestamp", "")).strip() if session_meta else "",
        }

    sorted_entries = sorted(entries, key=roadmap_sort_key)
    recent_entries = sorted(entries, key=lambda item: (str(item.get("updated", "")), str(item.get("id", ""))), reverse=True)
    return {
        "version": 1,
        "generated_at": now_iso(),
        "health": lint_health(lint_report),
        "summary": {
            "task_count": len(entries),
            "open_count": int(status_counts.get("todo", 0) + status_counts.get("in_progress", 0) + status_counts.get("blocked", 0)),
            "status_counts": dict(status_counts),
            "priority_counts": dict(priority_counts),
            "linked_task_count": linked_task_count,
            "linked_session_count": len(session_summaries),
        },
        "views": {
            "ordered_task_ids": ordered,
            "open_task_ids": [str(item.get("id", "")).strip() for item in sorted_entries if str(item.get("status", "todo")) in {"todo", "in_progress", "blocked"} and str(item.get("id", "")).strip()],
            "in_progress_task_ids": [str(item.get("id", "")).strip() for item in sorted_entries if str(item.get("status", "todo")) == "in_progress" and str(item.get("id", "")).strip()],
            "todo_task_ids": [str(item.get("id", "")).strip() for item in sorted_entries if str(item.get("status", "todo")) == "todo" and str(item.get("id", "")).strip()],
            "blocked_task_ids": [str(item.get("id", "")).strip() for item in sorted_entries if str(item.get("status", "todo")) == "blocked" and str(item.get("id", "")).strip()],
            "done_task_ids": [str(item.get("id", "")).strip() for item in sorted_entries if str(item.get("status", "todo")) == "done" and str(item.get("id", "")).strip()],
            "cancelled_task_ids": [str(item.get("id", "")).strip() for item in sorted_entries if str(item.get("status", "todo")) == "cancelled" and str(item.get("id", "")).strip()],
            "recent_task_ids": [str(item.get("id", "")).strip() for item in recent_entries if str(item.get("id", "")).strip()],
        },
        "tasks": tasks,
    }


def docs_relative_link(root_relative_path: str) -> str:
    abs_path = ROOT / root_relative_path
    try:
        return abs_path.relative_to(DOCS_ROOT).as_posix()
    except ValueError:
        return root_relative_path


def roadmap_sort_key(item: dict[str, Any]) -> tuple[int, int, str]:
    status_order = {"in_progress": 0, "todo": 1, "blocked": 2, "done": 3, "cancelled": 4}
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    status = str(item.get("status", "todo"))
    priority = str(item.get("priority", "medium"))
    return (status_order.get(status, 99), priority_order.get(priority, 99), str(item.get("id", "")))


def task_id_aliases(task_id: str) -> list[str]:
    stripped = str(task_id).strip()
    if not stripped:
        return []
    upper = stripped.upper()
    match = re.fullmatch(r"(TASK|ROADMAP)-(\d+)", upper)
    if not match:
        return list(dict.fromkeys([stripped, upper]))
    number = int(match.group(2))
    padded = f"{number:03d}"
    return list(dict.fromkeys([stripped, upper, f"TASK-{padded}", f"ROADMAP-{padded}"]))


def task_session_summary(task_sessions: dict[str, Any], task_id: str) -> dict[str, Any] | None:
    for candidate in task_id_aliases(task_id):
        value = task_sessions.get(candidate)
        if isinstance(value, dict):
            return value
    return None


def render_roadmap(entries: list[dict[str, Any]], task_session_index: dict[str, Any]) -> str:
    generated_at = now_iso()
    task_sessions = task_session_index.get("tasks") if isinstance(task_session_index.get("tasks"), dict) else {}
    lines = [
        "---",
        "id: roadmap.live",
        "title: Roadmap",
        "state: active",
        f"summary: Numbered, trackable delta tasks for {PROJECT_NAME}.",
        "owners:",
        "- engineering",
        f"updated: '{generated_at[:10]}'",
        "---",
        "",
        "# Roadmap",
        "",
        f"Generated: {generated_at}",
        "",
        f"Canonical source: [{ROADMAP_PATH.name}]({docs_relative_link(ROADMAP_PATH.relative_to(ROOT).as_posix())})",
        "",
        "Roadmap is freshest representation of gap between desired state in specs and current implementation reality.",
        "",
    ]

    buckets = [
        ("In progress", [item for item in entries if str(item.get("status", "")) == "in_progress"]),
        ("Todo", [item for item in entries if str(item.get("status", "todo")) == "todo"]),
        ("Blocked", [item for item in entries if str(item.get("status", "")) == "blocked"]),
        ("Done", [item for item in entries if str(item.get("status", "")) == "done"]),
    ]

    for title, bucket in buckets:
        lines.extend([f"## {title}", ""])
        if not bucket:
            lines.extend(["_None._", ""])
            continue
        for item in bucket:
            task_id = str(item.get("id", "UNKNOWN"))
            task_title = str(item.get("title", task_id))
            priority = str(item.get("priority", "medium"))
            kind = str(item.get("kind", "task"))
            summary = str(item.get("summary", "")).strip()
            lines.append(f"### {task_id} — {task_title}")
            lines.append("")
            lines.append(f"- Status: {str(item.get('status', 'todo'))}")
            lines.append(f"- Priority: {priority}")
            lines.append(f"- Kind: {kind}")
            if summary:
                lines.append(f"- Summary: {summary}")

            spec_paths = [str(value) for value in item.get("spec_paths", []) if str(value).strip()]
            code_paths = [str(value) for value in item.get("code_paths", []) if str(value).strip()]
            research_ids = [str(value) for value in item.get("research_ids", []) if str(value).strip()]
            labels = [str(value) for value in item.get("labels", []) if str(value).strip()]
            delta = item.get("delta") if isinstance(item.get("delta"), dict) else {}

            if spec_paths:
                lines.append("- Specs:")
                for spec_path in spec_paths:
                    lines.append(f"  - [{spec_path}]({docs_relative_link(spec_path)})")
            if code_paths:
                lines.append("- Code:")
                for code_path in code_paths:
                    lines.append(f"  - {code_path}")
            if research_ids:
                lines.append(f"- Research: {', '.join(research_ids)}")
            if labels:
                lines.append(f"- Labels: {', '.join(labels)}")
            session_meta = task_session_summary(task_sessions, task_id)
            if session_meta:
                session_count = int(session_meta.get("session_count", len(session_meta.get("session_ids", []))))
                lines.append(f"- Session links: {session_count}")
                last_session_name = str(session_meta.get("last_session_name", "")).strip()
                last_session_id = str(session_meta.get("last_session_id", "")).strip()
                last_action = str(session_meta.get("last_action", "")).strip()
                last_timestamp = str(session_meta.get("last_timestamp", "")).strip()
                last_label = last_session_name or last_session_id
                if last_label:
                    lines.append(f"- Last session: {last_label}{' | ' + last_action if last_action else ''}{' | ' + last_timestamp if last_timestamp else ''}")
                last_summary = str(session_meta.get("last_summary", "")).strip()
                if last_summary:
                    lines.append(f"- Last session note: {last_summary}")
            if delta:
                desired = str(delta.get("desired", "")).strip()
                current = str(delta.get("current", "")).strip()
                closure = str(delta.get("closure", "")).strip()
                if desired:
                    lines.append(f"- Desired: {desired}")
                if current:
                    lines.append(f"- Current: {current}")
                if closure:
                    lines.append(f"- Closure: {closure}")
            lines.append("")

    lines.extend([
        "## Related docs",
        "",
        "- [Docs Index](index.md)",
        "- [Product](specs/product.md)",
        "- [System Overview](specs/system/overview.md)",
        "- [Shared Rules](specs/shared/overview.md)",
        "",
    ])
    return "\n".join(lines).rstrip() + "\n"


def index_line(path: str, title: str, summary: str, state: str, doc_type: str) -> str:
    rel = docs_relative_link(path)
    marker = ""
    default_state = DEFAULT_STATE_BY_TYPE.get(doc_type)
    if state and default_state and state != default_state:
        marker = f" _({state})_"
    summary_part = f" — {summary}" if summary else ""
    return f"- [{title}]({rel}){marker}{summary_part}"


def render_index(registry: dict[str, Any], research_collections: list[dict[str, Any]], roadmap_entries: list[dict[str, Any]]) -> str:
    docs = registry["docs"]
    spec_docs = sorted([doc for doc in docs if doc["doc_type"] == "spec"], key=lambda item: item["path"])
    root_specs = [doc for doc in spec_docs if Path(doc["path"]).relative_to(SPECS_ROOT.relative_to(ROOT)).parts.__len__() == 1]
    grouped: dict[str, list[dict[str, Any]]] = {}
    for doc in spec_docs:
        rel = Path(doc["path"]).relative_to(SPECS_ROOT.relative_to(ROOT))
        if len(rel.parts) <= 1:
            continue
        grouped.setdefault(rel.parts[0], []).append(doc)

    roadmap_counts = Counter(str(item.get("status", "todo")) for item in roadmap_entries)
    lines = [
        f"# {INDEX_TITLE}",
        "",
        f"Generated: {registry['generated_at']}",
        "",
        "## Roadmap",
        "",
        f"- [Roadmap]({docs_relative_link(ROADMAP_DOC_PATH.relative_to(ROOT).as_posix())}) — {len(roadmap_entries)} task(s); " + ", ".join(f"{key}={value}" for key, value in sorted(roadmap_counts.items())) if roadmap_entries else f"- [Roadmap]({docs_relative_link(ROADMAP_DOC_PATH.relative_to(ROOT).as_posix())}) — 0 tasks",
        "",
        "## Specs — Root",
        "",
    ]

    if root_specs:
        for doc in root_specs:
            lines.append(index_line(doc["path"], doc["title"], doc["summary"], doc["state"], doc["doc_type"]))
    else:
        lines.append("_None._")
    lines.append("")

    for group_name in sorted(grouped):
        lines.extend([f"## Specs — {group_name.replace('-', ' ').title()}", ""])
        for doc in grouped[group_name]:
            lines.append(index_line(doc["path"], doc["title"], doc["summary"], doc["state"], doc["doc_type"]))
        lines.append("")

    lines.extend(["## Research", ""])
    if not research_collections:
        lines.extend(["_None._", ""])
    else:
        for collection in research_collections:
            lines.append(f"- [{Path(collection['path']).name}]({docs_relative_link(collection['path'])}) — {collection['entry_count']} entr{'y' if collection['entry_count'] == 1 else 'ies'}")
            for entry in collection["entries"][:5]:
                summary = entry.get("summary", "")
                lines.append(f"  - {entry.get('id', 'UNKNOWN')} — {entry.get('title', 'Untitled')}{' — ' + summary if summary else ''}")
            if collection["entry_count"] > 5:
                lines.append(f"  - ... {collection['entry_count'] - 5} more")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def main() -> None:
    META_ROOT.mkdir(parents=True, exist_ok=True)
    roadmap = read_roadmap_file(ROADMAP_PATH)
    roadmap_items = roadmap_entries(roadmap)
    task_session_index = read_task_session_index(TASK_SESSION_INDEX_PATH)
    ROADMAP_DOC_PATH.parent.mkdir(parents=True, exist_ok=True)
    ROADMAP_DOC_PATH.write_text(render_roadmap(roadmap_items, task_session_index), encoding="utf-8")

    research_collections = load_research_collections()
    docs = [parse_doc(path) for path in markdown_doc_files()]
    registry = build_registry(docs, research_collections, roadmap_items)
    backlinks = build_backlinks(docs)
    index_text = render_index(registry, research_collections, roadmap_items)

    write_json(META_ROOT / "registry.json", registry)
    write_json(META_ROOT / "backlinks.json", backlinks)
    if not (META_ROOT / "events.jsonl").exists():
        (META_ROOT / "events.jsonl").write_text("", encoding="utf-8")
    if not ROADMAP_EVENTS_PATH.exists():
        ROADMAP_EVENTS_PATH.write_text("", encoding="utf-8")
    if not TASK_SESSION_INDEX_PATH.exists():
        write_json(TASK_SESSION_INDEX_PATH, {"version": 1, "updated": now_iso(), "tasks": {}, "sessions": {}})
    INDEX_PATH.write_text(index_text, encoding="utf-8")
    lint_report = lint(docs, roadmap_items, research_collections)
    write_json(META_ROOT / "lint.json", lint_report)
    write_json(ROADMAP_STATE_PATH, build_roadmap_state(roadmap_items, task_session_index, lint_report))


if __name__ == "__main__":
    main()
`;
}
