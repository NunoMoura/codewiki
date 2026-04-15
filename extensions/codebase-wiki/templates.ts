import { basename } from "node:path";

export interface StarterTemplateInput {
  projectName: string;
  date: string;
}

export function starterDirectories(): string[] {
  return [
    ".docs/sources",
    "docs/specs/product",
    "docs/specs/architecture",
    "docs/specs/domains",
    "docs/specs/surfaces",
    "docs/decisions",
    "docs/plans",
    "docs/analysis/research",
    "docs/analysis/implementation",
    "docs/drift",
    "docs/archive",
    "scripts",
  ];
}

export function starterFiles(input: StarterTemplateInput): Record<string, string> {
  const projectName = input.projectName.trim() || basename(process.cwd());
  const date = input.date;

  return {
    ".docs/config.json": configJson(projectName),
    ".docs/events.jsonl": bootstrapEvent(projectName),
    ".docs/sources/.gitkeep": "",
    "scripts/rebuild_docs_meta.py": rebuildScript(),
    "docs/schema.md": schemaDoc(projectName, date),
    "docs/specs/product/prd.md": prdDoc(projectName, date),
    "docs/specs/architecture/system-overview.md": systemOverviewDoc(projectName, date),
    "docs/decisions/ADR-001-documentation-wiki-model.md": adrDoc(projectName, date),
    "docs/plans/roadmap.md": roadmapDoc(projectName, date),
    "docs/archive/README.md": archiveDoc(projectName, date),
  };
}

function configJson(projectName: string): string {
  return JSON.stringify(
    {
      version: 1,
      project_name: projectName,
      index_title: `${projectName} Docs Index`,
      docs_root: "docs",
      schema_path: "docs/schema.md",
      index_path: "docs/index.md",
      meta_root: ".docs",
      sources_root: ".docs/sources",
      generated_files: [
        "docs/index.md",
        ".docs/registry.json",
        ".docs/backlinks.json",
        ".docs/lint.json",
      ],
      doc_types: ["spec", "guide", "decision", "plan", "analysis", "drift"],
      archive_entrypoints: ["docs/archive/README.md"],
      lint: {
        repo_markdown: ["README.md", "src/**/README.md", "backend/**/README.md"],
        forbidden_headings: [
          "## Purpose",
          "## When To Read",
          "## Content",
          "## Summary",
          "## How To Use This Doc",
          "## Readiness Definition",
          "## Current Backend Readiness Snapshot",
        ],
        word_count_warn: 1200,
        word_count_exempt: [],
      },
      codebase_wiki: {
        name: `${projectName} codebase wiki`,
        rebuild_command: ["python", "scripts/rebuild_docs_meta.py"],
        self_drift_scope: {
          include: [
            "docs/index.md",
            "docs/schema.md",
            "docs/specs/**",
            "docs/decisions/**",
            "docs/plans/**",
            "docs/analysis/**",
            "docs/drift/**",
          ],
          exclude: ["docs/archive/**", "docs/_templates/**"],
        },
        code_drift_scope: {
          docs: [
            "docs/schema.md",
            "docs/specs/**",
            "docs/decisions/**",
            "docs/plans/**",
            "docs/analysis/**",
            "docs/drift/**",
          ],
          repo_docs: ["README.md", "src/**/README.md", "backend/**/README.md"],
          code: ["src/**", "app/**", "backend/**", "server/**"],
        },
      },
    },
    null,
    2,
  ) + "\n";
}

function bootstrapEvent(projectName: string): string {
  return JSON.stringify(
    {
      ts: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      kind: "bootstrap",
      title: "Bootstrapped codebase wiki",
      summary: `Created the starter repo-local wiki for ${projectName}.`,
    },
  ) + "\n";
}

function schemaDoc(projectName: string, date: string): string {
  return [
    "---",
    "id: guide.docs.schema",
    "title: Documentation Wiki Schema",
    "doc_type: guide",
    "state: active",
    `summary: Operating rules for maintaining ${projectName}'s repo-local codebase wiki.`,
    "owners:",
    "- docs",
    `updated: '${date}'`,
    "guide_kind: docs",
    "---",
    "",
    "# Documentation Wiki Schema",
    "",
    "## Core rules",
    "",
    "- docs are source of truth for intended design",
    "- code is implementation evidence",
    "- drift should be explicit",
    "- keep context high signal, low entropy",
    "- keep one live navigation surface",
    "- keep machine metadata hidden and generated",
    "",
    "## Layout",
    "",
    "- `docs/index.md`: only live index; generated from frontmatter",
    "- `docs/schema.md`: operating manual",
    "- `docs/specs/`: intended product, architecture, domain, surface truth",
    "- `docs/guides/`: conventions and contribution rules",
    "- `docs/decisions/`: ADR-style decisions",
    "- `docs/plans/`: active implementation and migration plans",
    "- `docs/analysis/`: research and implementation analysis",
    "- `docs/drift/`: explicit docs-vs-code mismatches",
    "- `docs/archive/`: historical material; exempt from one-index rule",
    "- `.docs/`: generated metadata and raw source capture manifests",
    "",
    "## Doc types",
    "",
    "- `spec`: intended system or product truth",
    "- `guide`: conventions, standards, operating instructions",
    "- `decision`: architectural or process decision",
    "- `plan`: active implementation or migration plan",
    "- `analysis`: research synthesis or implementation report",
    "- `drift`: explicit mismatch between docs and code",
    "",
    "## Frontmatter",
    "",
    "Every live doc should include:",
    "",
    "- `id`",
    "- `title`",
    "- `doc_type`",
    "- `state`",
    "- `summary`",
    "- `owners`",
    "- `updated`",
    "",
    "Extra fields:",
    "",
    "- decisions: `decision_date`",
    "- analysis: `analysis_kind`",
    "- drift: `severity`",
    "- guides may use `guide_kind`",
    "",
    "## Writing rules",
    "",
    "- use normal relative Markdown links",
    "- do not use Obsidian wikilinks in repo docs",
    "- end live docs with `## Related docs`",
    "- keep summaries to one sentence",
    "- avoid duplicated navigation prose across live docs",
    "- prefer edits to existing docs over creating new overlapping docs",
    "",
    "## Research capture",
    "",
    "- external sources live under `.docs/sources/`",
    "- manifest-first by default",
    "- add extracted text only when it materially improves future reasoning",
    "- vendor originals only when necessary; repo bloat matters",
    "- human-facing research synthesis belongs in `docs/analysis/research/`",
    "",
    "## Update flow",
    "",
    "1. update affected live doc",
    "2. regenerate `.docs/registry.json`, `.docs/backlinks.json`, `.docs/lint.json`, and `docs/index.md`",
    "3. append `.docs/events.jsonl` when change is substantial",
    "4. update code after docs when implementation follows",
    "",
    "## Pi integration",
    "",
    "If you install the `codebase-wiki` Pi package, you get:",
    "",
    "- `/wiki-rebuild`",
    "- `/wiki-lint [show]`",
    "- `/wiki-status`",
    "- `/wiki-self-drift`",
    "- `/wiki-code-drift`",
    "",
    "This starter can be created with the `codebase-wiki-bootstrap` Pi package via `/wiki-bootstrap`.",
    "",
    "## Index rule",
    "",
    "`docs/index.md` includes only:",
    "",
    "- specs",
    "- guides",
    "- decisions",
    "- active plans",
    "- analysis",
    "- open drift",
    "- archive entry points",
    "",
    "No other live index or README should exist under `docs/`.",
    "",
    "## Drift rule",
    "",
    "When docs and code disagree:",
    "",
    "- if docs are wrong, fix docs",
    "- if code is behind, create or update a file in `docs/drift/`",
    "- if mismatch is only historical, archive it",
    "",
    "## Related docs",
    "",
    "- [Docs Index](index.md)",
    "- [PRD](specs/product/prd.md)",
    "- [System Overview](specs/architecture/system-overview.md)",
    "- [ADR-001 documentation wiki model](decisions/ADR-001-documentation-wiki-model.md)",
    "- [Roadmap](plans/roadmap.md)",
    "",
  ].join("\n");
}

function prdDoc(projectName: string, date: string): string {
  return [
    "---",
    "id: spec.product.prd",
    `title: ${projectName} PRD`,
    "doc_type: spec",
    "state: active",
    `summary: Product goals, constraints, and non-goals for ${projectName}.`,
    "owners:",
    "- product",
    `updated: '${date}'`,
    "---",
    "",
    `# ${projectName} PRD`,
    "",
    "## Problem",
    "",
    `Define the user problem ${projectName} solves and why this codebase exists.`,
    "",
    "## Goals",
    "",
    "- state the main user outcomes",
    "- state the operational constraints",
    "- state what success looks like",
    "",
    "## Non-goals",
    "",
    "- list what this product will not do",
    "- list adjacent work that belongs elsewhere",
    "",
    "## Constraints",
    "",
    "- note platform, compliance, cost, or integration limits",
    "- note architecture constraints that product decisions must respect",
    "",
    "## Related docs",
    "",
    "- [Documentation Wiki Schema](../../schema.md)",
    "- [System Overview](../architecture/system-overview.md)",
    "- [Roadmap](../../plans/roadmap.md)",
    "- [ADR-001 documentation wiki model](../../decisions/ADR-001-documentation-wiki-model.md)",
    "",
  ].join("\n");
}

function systemOverviewDoc(projectName: string, date: string): string {
  return [
    "---",
    "id: spec.architecture.system-overview",
    "title: System Overview",
    "doc_type: spec",
    "state: active",
    `summary: Target system shape and major implementation areas for ${projectName}.`,
    "owners:",
    "- architecture",
    `updated: '${date}'`,
    "---",
    "",
    "# System Overview",
    "",
    "## Target shape",
    "",
    `Describe the main runtime pieces of ${projectName} and how they interact.`,
    "",
    "## Major areas",
    "",
    "- entrypoints and surfaces",
    "- orchestration or application services",
    "- domain or core business rules",
    "- infrastructure, integrations, and persistence",
    "",
    "## Placement rules",
    "",
    "- keep product truth in docs first",
    "- make ownership boundaries explicit",
    "- prefer one canonical doc per concept",
    "",
    "## Related docs",
    "",
    "- [PRD](../product/prd.md)",
    "- [Documentation Wiki Schema](../../schema.md)",
    "- [ADR-001 documentation wiki model](../../decisions/ADR-001-documentation-wiki-model.md)",
    "- [Roadmap](../../plans/roadmap.md)",
    "",
  ].join("\n");
}

function adrDoc(projectName: string, date: string): string {
  return [
    "---",
    "id: decision.docs.wiki-model",
    "title: ADR-001 Documentation Wiki Model",
    "doc_type: decision",
    "state: accepted",
    `summary: Adopt a repo-local docs-first wiki model for ${projectName}.`,
    "owners:",
    "- docs",
    `updated: '${date}'`,
    `decision_date: '${date}'`,
    "---",
    "",
    "# ADR-001 Documentation Wiki Model",
    "",
    "## Decision",
    "",
    "Adopt a repo-local codebase wiki with one generated index, one schema/manual, and hidden machine metadata under `.docs/`.",
    "",
    "## Why",
    "",
    "- docs stay close to code",
    "- the repo keeps intended design and implementation evidence together",
    "- agents and humans get a stable navigation and lint contract",
    "",
    "## Consequences",
    "",
    "- `docs/index.md` is the only live index",
    "- `docs/schema.md` is the maintainer manual",
    "- `.docs/` stores generated metadata and source capture manifests",
    "- drift should be tracked explicitly instead of left implicit",
    "",
    "## Related docs",
    "",
    "- [Documentation Wiki Schema](../schema.md)",
    "- [PRD](../specs/product/prd.md)",
    "- [System Overview](../specs/architecture/system-overview.md)",
    "- [Roadmap](../plans/roadmap.md)",
    "",
  ].join("\n");
}

function roadmapDoc(projectName: string, date: string): string {
  return [
    "---",
    "id: plan.roadmap",
    "title: Roadmap",
    "doc_type: plan",
    "state: active",
    `summary: Sequenced implementation roadmap for ${projectName}.`,
    "owners:",
    "- engineering",
    `updated: '${date}'`,
    "---",
    "",
    "# Roadmap",
    "",
    "## Phase 1",
    "",
    "- document target product and system shape",
    "- align package and ownership boundaries",
    "- make the first core workflow explicit",
    "",
    "## Phase 2",
    "",
    "- implement the highest-value path",
    "- close the biggest docs-vs-code gaps",
    "- add tests around the core path",
    "",
    "## Phase 3",
    "",
    "- scale supporting workflows",
    "- harden operations and observability",
    "- keep drift explicit and archived when resolved",
    "",
    "## Related docs",
    "",
    "- [PRD](../specs/product/prd.md)",
    "- [System Overview](../specs/architecture/system-overview.md)",
    "- [Documentation Wiki Schema](../schema.md)",
    "- [ADR-001 documentation wiki model](../decisions/ADR-001-documentation-wiki-model.md)",
    "",
  ].join("\n");
}

function archiveDoc(projectName: string, date: string): string {
  return [
    "---",
    "id: guide.archive.entrypoint",
    "title: Archive",
    "doc_type: guide",
    "state: archived",
    `summary: Archive entry point for superseded and historical ${projectName} documentation.`,
    "owners:",
    "- docs",
    `updated: '${date}'`,
    "guide_kind: archive",
    "---",
    "",
    "# Archive",
    "",
    "Store historical or superseded docs here. Live docs should move here when they no longer describe the intended system.",
    "",
    "## Notes",
    "",
    "- archive docs are exempt from live-doc optimization rules",
    "- keep links intact where possible",
    "- do not use archive as an overflow area for active design work",
    "",
  ].join("\n");
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

DEFAULT_ARCHIVE_ENTRYPOINTS = {
    Path("docs/archive/README.md"),
}
DEFAULT_FORBIDDEN_HEADINGS = {
    "## Purpose",
    "## When To Read",
    "## Content",
    "## Summary",
    "## How To Use This Doc",
    "## Readiness Definition",
    "## Current Backend Readiness Snapshot",
}
DEFAULT_WORD_COUNT_WARN = 1200
DEFAULT_WORD_COUNT_EXEMPT = set()
DEFAULT_REPO_MARKDOWN_PATTERNS = [
    "README.md",
    "src/**/README.md",
    "backend/**/README.md",
]

DEFAULT_STATE_BY_TYPE = {
    "spec": "active",
    "guide": "active",
    "decision": "accepted",
    "plan": "active",
    "analysis": "active",
    "drift": "open",
}

REQUIRED_FIELDS = {
    "spec": ["id", "title", "doc_type", "state", "summary", "owners", "updated"],
    "guide": ["id", "title", "doc_type", "state", "summary", "owners", "updated"],
    "decision": ["id", "title", "doc_type", "state", "summary", "owners", "updated", "decision_date"],
    "plan": ["id", "title", "doc_type", "state", "summary", "owners", "updated"],
    "analysis": ["id", "title", "doc_type", "state", "summary", "owners", "updated", "analysis_kind"],
    "drift": ["id", "title", "doc_type", "state", "summary", "owners", "updated", "severity"],
}

LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
H1_RE = re.compile(r"^#\s+(.+)$", re.MULTILINE)
BACKTICK_DOC_PATH_RE = re.compile(r"\`((?:\.\.?/)*docs/[^\`\s]+?\.md)\`")


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
META_ROOT = ROOT / str(CONFIG.get("meta_root", ".docs"))
INDEX_PATH = ROOT / str(CONFIG.get("index_path", "docs/index.md"))
SCHEMA_PATH = ROOT / str(CONFIG.get("schema_path", "docs/schema.md"))
INDEX_TITLE = str(CONFIG.get("index_title", f"{PROJECT_NAME} Docs Index"))
ARCHIVE_ENTRYPOINTS = {
    Path(item) for item in (maybe_str_list(CONFIG.get("archive_entrypoints")) or [path.as_posix() for path in DEFAULT_ARCHIVE_ENTRYPOINTS])
}
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


def doc_files() -> list[Path]:
    files: list[Path] = []
    for path in sorted(DOCS_ROOT.rglob("*.md")):
        if path == INDEX_PATH:
            continue
        if path.is_relative_to(DOCS_ROOT / "_templates"):
            continue
        files.append(path)
    return files


def parse_doc(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    frontmatter, body = split_frontmatter(text)
    rel = path.relative_to(ROOT)
    title = extract_title(path, body, frontmatter)
    summary = frontmatter.get("summary") if isinstance(frontmatter.get("summary"), str) else ""
    owners = frontmatter.get("owners") if isinstance(frontmatter.get("owners"), list) else []
    tags = frontmatter.get("tags") if isinstance(frontmatter.get("tags"), list) else []
    code_paths = frontmatter.get("code_paths") if isinstance(frontmatter.get("code_paths"), list) else []
    source_ids = frontmatter.get("source_ids") if isinstance(frontmatter.get("source_ids"), list) else []
    return {
        "path": rel.as_posix(),
        "frontmatter": frontmatter,
        "body": body,
        "title": title,
        "id": str(frontmatter.get("id", rel.as_posix())),
        "doc_type": str(frontmatter.get("doc_type", "")),
        "state": str(frontmatter.get("state", "")),
        "summary": summary.strip(),
        "owners": [str(x) for x in owners],
        "tags": [str(x) for x in tags],
        "code_paths": [str(x) for x in code_paths],
        "source_ids": [str(x) for x in source_ids],
        "links": extract_links(body, rel),
        "word_count": len(re.findall(r"\S+", body)),
    }


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


def normalize_local_link(source_rel: Path, target: str) -> str | None:
    target_path = (ROOT / source_rel.parent / target).resolve()
    try:
        return target_path.relative_to(ROOT).as_posix()
    except ValueError:
        return None


def build_registry(docs: list[dict[str, Any]]) -> dict[str, Any]:
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
                "source_ids": doc["source_ids"],
                "links_out": doc["links"],
            }
            for doc in sorted(docs, key=lambda item: item["path"])
        ],
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


def lint(docs: list[dict[str, Any]]) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    ids = Counter(doc["id"] for doc in docs)

    for doc in docs:
        doc_type = doc["doc_type"]
        if not doc_type:
            issues.append(issue("error", "missing-doc-type", doc["path"], "Missing doc_type frontmatter."))
            continue
        for field in REQUIRED_FIELDS.get(doc_type, ["id", "title", "doc_type", "state", "summary", "owners", "updated"]):
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

        if is_live_doc(doc["path"]):
            for heading in FORBIDDEN_HEADINGS:
                if heading in doc["body"]:
                    issues.append(issue("warning", "forbidden-heading", doc["path"], f"Forbidden heading in live doc: {heading}"))
            if doc["path"] not in WORD_COUNT_EXEMPT and doc["word_count"] > WORD_COUNT_WARN:
                issues.append(
                    issue(
                        "warning",
                        "large-doc",
                        doc["path"],
                        f"Live doc has {doc['word_count']} words; consider split, merge, or cut.",
                    )
                )
            if doc["doc_type"] in {"spec", "guide", "decision", "plan", "analysis", "drift"} and "## Related docs" not in doc["body"]:
                issues.append(issue("warning", "missing-related-docs", doc["path"], "Live doc should end with '## Related docs'."))

    issues.extend(lint_repo_markdown_doc_links())

    return {
        "generated_at": now_iso(),
        "counts": Counter(item["kind"] for item in issues),
        "issues": issues,
    }


def issue(severity: str, kind: str, path: str, message: str) -> dict[str, Any]:
    return {
        "severity": severity,
        "kind": kind,
        "path": path,
        "message": message,
    }


def is_live_doc(path: str) -> bool:
    docs_root = DOCS_ROOT.relative_to(ROOT).as_posix().rstrip("/")
    archive_prefix = f"{docs_root}/archive/"
    templates_prefix = f"{docs_root}/_templates/"
    index_path = INDEX_PATH.relative_to(ROOT).as_posix()
    return path.startswith(f"{docs_root}/") and not path.startswith(archive_prefix) and not path.startswith(templates_prefix) and path != index_path


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


def extract_raw_link_targets(body: str) -> list[str]:
    return [match.group(1).strip() for match in LINK_RE.finditer(body)]


def index_line(path: str, title: str, summary: str, state: str, doc_type: str) -> str:
    rel = Path(path).relative_to(DOCS_ROOT.relative_to(ROOT)).as_posix()
    marker = ""
    default_state = DEFAULT_STATE_BY_TYPE.get(doc_type)
    if state and default_state and state != default_state:
        marker = f" _({state})_"
    summary_part = f" — {summary}" if summary else ""
    return f"- [{title}]({rel}){marker}{summary_part}"


def render_index(registry: dict[str, Any]) -> str:
    docs = registry["docs"]
    docs_by_path = {doc["path"]: doc for doc in docs}
    docs_prefix = DOCS_ROOT.relative_to(ROOT).as_posix().rstrip("/")
    lines = [f"# {INDEX_TITLE}", "", f"Generated: {registry['generated_at']}", ""]

    def section(title: str, entries: list[dict[str, Any]]) -> None:
        lines.append(f"## {title}")
        lines.append("")
        if not entries:
            lines.append("_None._")
            lines.append("")
            return
        for doc in entries:
            lines.append(index_line(doc["path"], doc["title"], doc["summary"], doc["state"], doc["doc_type"]))
        lines.append("")

    def pick(prefix: str, *, state: str | None = None) -> list[dict[str, Any]]:
        items = [doc for doc in docs if doc["path"].startswith(prefix)]
        if state is not None:
            items = [doc for doc in items if doc["state"] == state]
        return sorted(items, key=lambda item: (item["title"].lower(), item["path"]))

    section("Specs — Product", pick(f"{docs_prefix}/specs/product/"))
    section("Specs — Architecture", pick(f"{docs_prefix}/specs/architecture/"))
    section("Specs — Domains", pick(f"{docs_prefix}/specs/domains/"))
    section("Specs — Surfaces", pick(f"{docs_prefix}/specs/surfaces/"))

    guides = sorted(
        [doc for doc in docs if doc["path"].startswith(f"{docs_prefix}/guides/") or doc["path"] == SCHEMA_PATH.relative_to(ROOT).as_posix()],
        key=lambda item: (item["title"].lower(), item["path"]),
    )
    section("Guides", guides)

    accepted = sorted(
        [doc for doc in docs if doc["path"].startswith(f"{docs_prefix}/decisions/") and doc["state"] == "accepted"],
        key=lambda item: item["path"],
    )
    proposed = sorted(
        [doc for doc in docs if doc["path"].startswith(f"{docs_prefix}/decisions/") and doc["state"] == "proposed"],
        key=lambda item: item["path"],
    )
    other_decisions = sorted(
        [doc for doc in docs if doc["path"].startswith(f"{docs_prefix}/decisions/") and doc["state"] not in {"accepted", "proposed"}],
        key=lambda item: item["path"],
    )
    section("Decisions — Accepted", accepted)
    section("Decisions — Proposed", proposed)
    section("Decisions — Other", other_decisions)

    section("Active plans", pick(f"{docs_prefix}/plans/", state="active"))
    section("Analysis — Research", pick(f"{docs_prefix}/analysis/research/"))
    section("Analysis — Implementation", pick(f"{docs_prefix}/analysis/implementation/"))
    drift_docs = sorted(
        [doc for doc in docs if doc["path"].startswith(f"{docs_prefix}/drift/") and doc["state"] in {"open", "in_progress"}],
        key=lambda item: (item["title"].lower(), item["path"]),
    )
    section("Open drift", drift_docs)

    archive_entries = [docs_by_path[path.as_posix()] for path in sorted(ARCHIVE_ENTRYPOINTS) if path.as_posix() in docs_by_path]
    section("Archive entry points", archive_entries)

    return "\n".join(lines).rstrip() + "\n"


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def main() -> None:
    META_ROOT.mkdir(parents=True, exist_ok=True)
    docs = [parse_doc(path) for path in doc_files()]
    registry = build_registry(docs)
    backlinks = build_backlinks(docs)
    index_text = render_index(registry)
    write_json(META_ROOT / "registry.json", registry)
    write_json(META_ROOT / "backlinks.json", backlinks)
    if not (META_ROOT / "events.jsonl").exists():
        (META_ROOT / "events.jsonl").write_text("", encoding="utf-8")
    INDEX_PATH.write_text(index_text, encoding="utf-8")
    lint_report = lint(docs)
    write_json(META_ROOT / "lint.json", lint_report)


if __name__ == "__main__":
    main()
`;
}
