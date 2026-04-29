#!/usr/bin/env python3
from __future__ import annotations

import gzip
import hashlib
import json
import os
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

import yaml

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / ".wiki" / "config.json"

DEFAULT_FORBIDDEN_HEADINGS = {
    "## Purpose",
    "## When To Read",
    "## Content",
    "## Summary",
    "## How To Use This Doc",
}
DEFAULT_WORD_COUNT_WARN = 1600
DEFAULT_WORD_COUNT_EXEMPT = set()
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
BACKTICK_DOC_PATH_RE = re.compile(r"\`((?:\.\.?/)*(?:wiki|\.wiki/knowledge)/[^\`\s]+)\`")


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
DOCS_ROOT_VALUE = str(CONFIG.get("docs_root", ".wiki/knowledge")).strip().strip("/") or ".wiki/knowledge"
SPECS_ROOT_VALUE = str(CONFIG.get("specs_root", DOCS_ROOT_VALUE)).strip().strip("/") or DOCS_ROOT_VALUE
DOCS_ROOT = ROOT / DOCS_ROOT_VALUE
SPECS_ROOT = ROOT / SPECS_ROOT_VALUE
RESEARCH_ROOT = ROOT / str(CONFIG.get("evidence_root", CONFIG.get("research_root", ".wiki/evidence")))
ROADMAP_PATH = ROOT / str(CONFIG.get("roadmap_path", ".wiki/roadmap.json"))
ROADMAP_EVENTS_PATH = ROOT / str(CONFIG.get("roadmap_events_path", ".wiki/roadmap-events.jsonl"))
ROADMAP_RETENTION_CONFIG = maybe_dict(CONFIG.get("roadmap_retention")) or {}
CLOSED_TASK_RETENTION_LIMIT = max(0, int(ROADMAP_RETENTION_CONFIG.get("closed_task_limit", 50)))
ROADMAP_ARCHIVE_PATH = ROOT / str(ROADMAP_RETENTION_CONFIG.get("archive_path", ".wiki/roadmap-archive.jsonl"))
ROADMAP_ARCHIVE_COMPRESSED = bool(ROADMAP_RETENTION_CONFIG.get("compress_archive", False))
if ROADMAP_ARCHIVE_COMPRESSED and ROADMAP_ARCHIVE_PATH.suffix != ".gz":
    ROADMAP_ARCHIVE_PATH = ROADMAP_ARCHIVE_PATH.with_suffix(ROADMAP_ARCHIVE_PATH.suffix + ".gz")
META_ROOT = ROOT / str(CONFIG.get("meta_root", ".wiki"))
ROADMAP_STATE_PATH = META_ROOT / "roadmap-state.json"
STATUS_STATE_PATH = META_ROOT / "status-state.json"
ROADMAP_FOLDER_PATH = META_ROOT / "roadmap"
ROADMAP_TASKS_PATH = ROADMAP_FOLDER_PATH / "tasks"

def optional_output_path(config_key: str) -> Path | None:
    value = CONFIG.get(config_key)
    if not isinstance(value, str) or not value.strip():
        return None
    return ROOT / value.strip().strip("/")

ROADMAP_DOC_PATH = optional_output_path("roadmap_doc_path")
INDEX_PATH = optional_output_path("index_path")
DEFAULT_INDEX_TITLE = f"{PROJECT_NAME} Index" if PROJECT_NAME.lower().endswith("wiki") else f"{PROJECT_NAME} Wiki Index"
INDEX_TITLE = str(CONFIG.get("index_title", DEFAULT_INDEX_TITLE))
FORBIDDEN_HEADINGS = set(maybe_str_list(LINT_CONFIG.get("forbidden_headings")) or sorted(DEFAULT_FORBIDDEN_HEADINGS))
WORD_COUNT_WARN = int(LINT_CONFIG.get("word_count_warn", DEFAULT_WORD_COUNT_WARN))
WORD_COUNT_EXEMPT = set(maybe_str_list(LINT_CONFIG.get("word_count_exempt")) or sorted(DEFAULT_WORD_COUNT_EXEMPT))
REPO_MARKDOWN_PATTERNS = maybe_str_list(LINT_CONFIG.get("repo_markdown")) or DEFAULT_REPO_MARKDOWN_PATTERNS
PRODUCT_SPEC_PREFIX = f"{SPECS_ROOT_VALUE}/product/"
SYSTEM_SPEC_PREFIX = f"{SPECS_ROOT_VALUE}/system/"
CLIENTS_SPEC_PREFIXES = [prefix for prefix in [f"{SPECS_ROOT_VALUE}/clients/", f"{SPECS_ROOT_VALUE}/ux/"] if prefix]
PRIMARY_CLIENTS_SPEC_PREFIX = CLIENTS_SPEC_PREFIXES[0] if CLIENTS_SPEC_PREFIXES else f"{SPECS_ROOT_VALUE}/clients/"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def canonical_digest(value: Any) -> str:
    return sha256_text(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False))


def git_output(args: list[str]) -> str:
    try:
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ""


def git_head_commit() -> str:
    return git_output(["rev-parse", "HEAD"])


def git_path_commit(path: str) -> str:
    return git_output(["log", "-1", "--format=%H", "--", path])


def git_status_paths() -> list[str]:
    raw = git_output(["status", "--porcelain", "--untracked-files=no"])
    paths: list[str] = []
    for line in raw.splitlines():
        if len(line) < 4:
            continue
        path = line[3:].strip()
        if " -> " in path:
            path = path.rsplit(" -> ", 1)[-1].strip()
        if path:
            paths.append(path)
    return sorted(set(paths))


def git_anchor(paths: list[str] | None = None) -> dict[str, Any]:
    scoped_paths = sorted(set([str(path).strip() for path in paths or [] if str(path).strip()]))
    dirty_paths = git_status_paths()
    scoped_dirty = [path for path in dirty_paths if not scoped_paths or path in scoped_paths or any(path.startswith(f"{prefix.rstrip('/')}/") for prefix in scoped_paths)]
    commits = {path: git_path_commit(path) for path in scoped_paths if (ROOT / path).exists()}
    return {
        "head": git_head_commit(),
        "dirty": bool(scoped_dirty),
        "dirty_paths": scoped_dirty[:50],
        "paths": commits,
    }


def semantic_doc_revision(doc: dict[str, Any]) -> dict[str, Any]:
    frontmatter = dict(doc.get("frontmatter", {}) if isinstance(doc.get("frontmatter"), dict) else {})
    frontmatter.pop("updated", None)
    payload = {
        "frontmatter": frontmatter,
        "body": str(doc.get("body", "")).strip().replace("\r\n", "\n"),
    }
    return {
        "digest": canonical_digest(payload),
        "git": git_anchor([str(doc.get("path", "")).strip()]),
    }


def task_revision(task: dict[str, Any]) -> dict[str, Any]:
    payload = {
        key: task.get(key)
        for key in ["id", "title", "status", "priority", "kind", "summary", "labels", "goal", "spec_paths", "code_paths", "research_ids", "delta"]
    }
    return {"digest": canonical_digest(payload)}


def load_previous_status_state() -> dict[str, Any]:
    if not STATUS_STATE_PATH.exists():
        return {}
    try:
        data = json.loads(STATUS_STATE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}, text
    raw = text[4:end]
    body = text[end + 5 :]
    loaded = yaml.safe_load(raw) or {}
    data: dict[str, Any] = loaded if isinstance(loaded, dict) else {}
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
    if ROADMAP_DOC_PATH is not None and path == ROADMAP_DOC_PATH:
        return "roadmap"
    if path.is_relative_to(SPECS_ROOT):
        return "spec"
    return "doc"


def markdown_doc_files() -> list[Path]:
    generated_outputs = {path for path in [INDEX_PATH, ROADMAP_DOC_PATH] if path is not None}
    files: list[Path] = []
    if SPECS_ROOT.exists():
        for path in sorted(SPECS_ROOT.rglob("*.md")):
            if path in generated_outputs:
                continue
            if path.is_relative_to(SPECS_ROOT / "_templates"):
                continue
            files.append(path)
    if ROADMAP_DOC_PATH is not None and ROADMAP_DOC_PATH.exists():
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


def closed_task_sort_key(task_id: str, task: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(task.get("updated", "")),
        str(task.get("created", "")),
        task_id,
    )


def archive_existing_task_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    opener = gzip.open if path.suffix == ".gz" else open
    result: set[str] = set()
    with opener(path, "rt", encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            task = record.get("task") if isinstance(record, dict) else None
            task_id = task.get("id") if isinstance(task, dict) else None
            if isinstance(task_id, str) and task_id.strip():
                result.add(task_id.strip())
    return result


def append_archived_tasks(path: Path, records: list[dict[str, Any]]) -> None:
    if not records:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "at", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, separators=(",", ":"), sort_keys=False) + "\n")


def compact_roadmap_hot_set(roadmap: dict[str, Any]) -> bool:
    tasks_raw = roadmap.get("tasks")
    tasks: dict[str, Any] = tasks_raw if isinstance(tasks_raw, dict) else {}
    order_raw = roadmap.get("order")
    order_values = order_raw if isinstance(order_raw, list) else []
    order = [str(task_id) for task_id in order_values if str(task_id) in tasks]
    closed_ids = [task_id for task_id in order if is_closed_task_status(tasks[task_id].get("status"))]
    if len(closed_ids) <= CLOSED_TASK_RETENTION_LIMIT:
        return False
    keep_closed = set(sorted(closed_ids, key=lambda task_id: closed_task_sort_key(task_id, tasks[task_id]), reverse=True)[:CLOSED_TASK_RETENTION_LIMIT])
    archive_ids = [task_id for task_id in closed_ids if task_id not in keep_closed]
    existing_archive_ids = archive_existing_task_ids(ROADMAP_ARCHIVE_PATH)
    archived_at = now_iso()
    archive_records = [
        {
            "archived_at": archived_at,
            "reason": "closed_task_retention",
            "task": tasks[task_id],
        }
        for task_id in archive_ids
        if task_id not in existing_archive_ids
    ]
    append_archived_tasks(ROADMAP_ARCHIVE_PATH, archive_records)
    for task_id in archive_ids:
        tasks.pop(task_id, None)
    roadmap["order"] = [task_id for task_id in order if task_id not in set(archive_ids)]
    roadmap["tasks"] = tasks
    roadmap["updated"] = archived_at
    return True


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
    summary_raw = frontmatter.get("summary")
    summary = summary_raw if isinstance(summary_raw, str) else ""
    owners_raw = frontmatter.get("owners")
    owners = owners_raw if isinstance(owners_raw, list) else []
    tags_raw = frontmatter.get("tags")
    tags = tags_raw if isinstance(tags_raw, list) else []
    code_paths_raw = frontmatter.get("code_paths")
    code_paths = code_paths_raw if isinstance(code_paths_raw, list) else []
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
        "revision": semantic_doc_revision({"path": rel.as_posix(), "frontmatter": frontmatter, "body": body}),
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
                    "revision": {"digest": canonical_digest(entry), "git": git_anchor([path.relative_to(ROOT).as_posix()])},
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


def build_graph(docs: list[dict[str, Any]], research: list[dict[str, Any]], roadmap_entries: list[dict[str, Any]]) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    seen_nodes: set[str] = set()
    seen_edges: set[tuple[str, str, str]] = set()

    def add_node(node_id: str, **payload: Any) -> None:
        if not node_id or node_id in seen_nodes:
            return
        seen_nodes.add(node_id)
        node = {"id": node_id}
        node.update(payload)
        nodes.append(node)

    def add_edge(kind: str, source: str, target: str, **payload: Any) -> None:
        if not source or not target:
            return
        key = (kind, source, target)
        if key in seen_edges:
            return
        seen_edges.add(key)
        edge = {"kind": kind, "from": source, "to": target}
        edge.update(payload)
        edges.append(edge)

    code_paths: set[str] = set()
    research_entry_ids: list[str] = []

    for doc in sorted(docs, key=lambda item: item["path"]):
        doc_path = str(doc["path"])
        doc_id = f"doc:{doc_path}"
        group = spec_group(doc_path) if str(doc.get("doc_type", "")) == "spec" else ""
        add_node(
            doc_id,
            kind="doc",
            path=doc_path,
            title=str(doc.get("title", "")).strip(),
            doc_type=str(doc.get("doc_type", "doc")).strip(),
            state=str(doc.get("state", "")).strip(),
            group=group,
            summary=str(doc.get("summary", "")).strip(),
            owners=[str(value) for value in doc.get("owners", []) if str(value).strip()],
            tags=[str(value) for value in doc.get("tags", []) if str(value).strip()],
            revision=doc.get("revision", {}),
        )
        for target in [str(value) for value in doc.get("links", []) if str(value).strip()]:
            add_edge("doc_link", doc_id, f"doc:{target}")
        for code_path in [str(value) for value in doc.get("code_paths", []) if str(value).strip()]:
            code_paths.add(code_path)
            add_node(f"code:{code_path}", kind="code_path", path=code_path)
            add_edge("doc_code_path", doc_id, f"code:{code_path}")

    for collection in research:
        collection_path = str(collection.get("path", "")).strip()
        collection_id = f"research_collection:{collection_path}"
        add_node(
            collection_id,
            kind="research_collection",
            path=collection_path,
            entry_count=int(collection.get("entry_count", 0)),
        )
        for entry in collection.get("entries", []):
            entry_id = str(entry.get("id", "")).strip()
            if not entry_id:
                continue
            research_entry_ids.append(entry_id)
            entry_node_id = f"research_entry:{entry_id}"
            add_node(
                entry_node_id,
                kind="research_entry",
                research_id=entry_id,
                title=str(entry.get("title", "")).strip(),
                summary=str(entry.get("summary", "")).strip(),
                web_link=str(entry.get("web_link", "")).strip(),
                updated=str(entry.get("updated", "")).strip(),
                tags=[str(value) for value in entry.get("tags", []) if str(value).strip()],
                revision=entry.get("revision", {}),
            )
            add_edge("collection_contains_entry", collection_id, entry_node_id)

    status_counts = Counter(str(item.get("status", "todo")) for item in roadmap_entries)
    for task in roadmap_entries:
        task_id = str(task.get("id", "")).strip()
        if not task_id:
            continue
        task_node_id = f"task:{task_id}"
        add_node(
            task_node_id,
            kind="roadmap_task",
            task_id=task_id,
            title=str(task.get("title", "")).strip(),
            status=str(task.get("status", "todo")).strip(),
            priority=str(task.get("priority", "medium")).strip(),
            task_kind=str(task.get("kind", "task")).strip(),
            summary=str(task.get("summary", "")).strip(),
            updated=str(task.get("updated", "")).strip(),
            labels=[str(value) for value in task.get("labels", []) if str(value).strip()],
            revision=task_revision(task),
        )
        for spec_path in [str(value) for value in task.get("spec_paths", []) if str(value).strip()]:
            add_edge("task_spec", task_node_id, f"doc:{spec_path}")
        for code_path in [str(value) for value in task.get("code_paths", []) if str(value).strip()]:
            code_paths.add(code_path)
            add_node(f"code:{code_path}", kind="code_path", path=code_path)
            add_edge("task_code_path", task_node_id, f"code:{code_path}")
        for research_id in [str(value) for value in task.get("research_ids", []) if str(value).strip()]:
            add_edge("task_research", task_node_id, f"research_entry:{research_id}")

    doc_paths = sorted(str(doc["path"]) for doc in docs)
    spec_paths = sorted(str(doc["path"]) for doc in docs if str(doc.get("doc_type", "")) == "spec")
    grouped_spec_paths = {
        "product": [path for path in spec_paths if path.startswith(PRODUCT_SPEC_PREFIX)],
        "system": [path for path in spec_paths if path.startswith(SYSTEM_SPEC_PREFIX)],
        "clients": [path for path in spec_paths if path_starts_with_any(path, CLIENTS_SPEC_PREFIXES)],
    }

    revision = {
        "git": git_anchor(doc_paths + sorted(code_paths) + [ROADMAP_PATH.relative_to(ROOT).as_posix()]),
        "spec_digest": canonical_digest({path: (next((doc.get("revision", {}) for doc in docs if str(doc.get("path", "")) == path), {}) or {}).get("digest", "") for path in spec_paths}),
        "task_digest": canonical_digest({str(item.get("id", "")).strip(): task_revision(item).get("digest", "") for item in roadmap_entries if str(item.get("id", "")).strip()}),
        "evidence_digest": canonical_digest(research),
    }

    return {
        "version": 1,
        "generated_at": now_iso(),
        "revision": revision,
        "nodes": nodes,
        "edges": edges,
        "views": {
            "docs": {
                "all_paths": doc_paths,
                "spec_paths": spec_paths,
                "by_group": grouped_spec_paths,
                "by_type": {
                    "spec": spec_paths,
                    "roadmap": [path for path in doc_paths if ROADMAP_DOC_PATH is not None and path == ROADMAP_DOC_PATH.relative_to(ROOT).as_posix()],
                    "doc": [path for path in doc_paths if path not in spec_paths and (ROADMAP_DOC_PATH is None or path != ROADMAP_DOC_PATH.relative_to(ROOT).as_posix())],
                },
            },
            "roadmap": {
                "task_ids": [str(item.get("id", "")).strip() for item in roadmap_entries if str(item.get("id", "")).strip()],
                "open_task_ids": [str(item.get("id", "")).strip() for item in roadmap_entries if is_open_task_status(item.get("status", "todo")) and str(item.get("id", "")).strip()],
                "in_progress_task_ids": [str(item.get("id", "")).strip() for item in roadmap_entries if is_active_task_status(item.get("status", "todo")) and str(item.get("id", "")).strip()],
                "todo_task_ids": [str(item.get("id", "")).strip() for item in roadmap_entries if str(item.get("status", "todo")).strip() == "todo" and str(item.get("id", "")).strip()],
                "blocked_task_ids": [str(item.get("id", "")).strip() for item in roadmap_entries if str(item.get("status", "")).strip() == "blocked" and str(item.get("id", "")).strip()],
                "done_task_ids": [str(item.get("id", "")).strip() for item in roadmap_entries if str(item.get("status", "")).strip() == "done" and str(item.get("id", "")).strip()],
                "cancelled_task_ids": [str(item.get("id", "")).strip() for item in roadmap_entries if str(item.get("status", "")).strip() == "cancelled" and str(item.get("id", "")).strip()],
                "recent_task_ids": [str(item.get("id", "")).strip() for item in sorted(roadmap_entries, key=lambda item: (str(item.get("updated", "")), str(item.get("id", ""))), reverse=True) if str(item.get("id", "")).strip()],
                "status_counts": dict(status_counts),
            },
            "research": {
                "collection_paths": [str(collection.get("path", "")).strip() for collection in research if str(collection.get("path", "")).strip()],
                "entry_ids": sorted(set(research_entry_ids)),
            },
            "code": {
                "paths": sorted(code_paths),
            },
        },
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
    allowed_status = {"todo", "research", "implement", "verify", "done", "cancelled", "in_progress", "blocked"}
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
        goal_raw = entry.get("goal")
        goal: dict[str, Any] = cast(dict[str, Any], goal_raw) if isinstance(goal_raw, dict) else {}
        acceptance = [str(value).strip() for value in goal.get("acceptance", []) if str(value).strip()] if isinstance(goal.get("acceptance"), list) else []
        non_goals = [str(value).strip() for value in goal.get("non_goals", []) if str(value).strip()] if isinstance(goal.get("non_goals"), list) else []
        verification = [str(value).strip() for value in goal.get("verification", []) if str(value).strip()] if isinstance(goal.get("verification"), list) else []
        outcome = str(goal.get("outcome", "")).strip()

        if goal and not outcome and not acceptance and not non_goals and not verification:
            issues.append(issue("warning", "roadmap-empty-goal", source_path, f"{entry_id} includes a goal object with no meaningful content"))
        if goal and not verification:
            issues.append(issue("warning", "roadmap-missing-verification", source_path, f"{entry_id} goal should define at least one verification step"))

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
    issues_raw = lint_report.get("issues")
    issues = [item for item in issues_raw if isinstance(item, dict)] if isinstance(issues_raw, list) else []
    errors = sum(1 for item in issues if str(item.get("severity", "")) == "error")
    warnings = sum(1 for item in issues if str(item.get("severity", "")) == "warning")
    color = "red" if errors > 0 else "yellow" if warnings > 0 else "green"
    return {
        "color": color,
        "errors": errors,
        "warnings": warnings,
        "total_issues": len(issues),
    }


def normalize_task_phase(value: Any) -> str:
    phase = str(value or "").strip()
    if phase == "research":
        return "implement"
    return phase if phase in {"implement", "verify", "done"} else "implement"


def next_task_phase(phase: str) -> str:
    if phase == "implement":
        return "verify"
    if phase == "verify":
        return "done"
    return "done"


def default_task_phase(status: str) -> str:
    normalized = str(status or "todo").strip()
    if normalized == "research":
        return "implement"
    if normalized in {"implement", "verify", "done"}:
        return normalized
    if normalized == "todo":
        return "implement"
    if normalized in {"in_progress", "blocked"}:
        return "implement"
    return "implement"


def roadmap_task_stage(status: Any, loop_phase: Any = "") -> str:
    normalized = str(status or "todo").strip()
    if normalized == "research":
        return "research"
    if normalized in {"todo", "implement", "verify", "done"}:
        return normalized
    if normalized in {"in_progress", "blocked"}:
        return normalize_task_phase(loop_phase)
    return "todo"


def is_closed_task_status(status: Any) -> bool:
    return str(status or "").strip() in {"done", "cancelled"}


def is_open_task_status(status: Any) -> bool:
    return str(status or "").strip() in {"todo", "research", "implement", "verify", "in_progress", "blocked"}


def is_active_task_status(status: Any) -> bool:
    return str(status or "").strip() in {"research", "implement", "verify", "in_progress", "blocked"}


def build_task_loop_state(task_id: str, status: str, events: list[dict[str, Any]]) -> dict[str, Any]:
    phase = default_task_phase(status)
    updated_at = ""
    evidence: dict[str, Any] | None = None

    for event in events:
        if str(event.get("task_id", "")).strip() != task_id:
            continue
        kind = str(event.get("kind", "")).strip()
        timestamp = str(event.get("ts", "")).strip()
        if kind == "task_phase_started":
            phase = normalize_task_phase(event.get("phase"))
            updated_at = timestamp or updated_at
        elif kind == "task_phase_passed":
            phase = next_task_phase(normalize_task_phase(event.get("phase")))
            updated_at = timestamp or updated_at
        elif kind == "task_phase_failed":
            phase = "implement"
            updated_at = timestamp or updated_at
        elif kind == "task_phase_blocked":
            phase = normalize_task_phase(event.get("phase"))
            updated_at = timestamp or updated_at
        elif kind == "task_evidence_recorded":
            evidence = {
                "verdict": str(event.get("verdict", "pass")).strip() or "pass",
                "summary": str(event.get("summary", "")).strip(),
                "checks_run": [str(value).strip() for value in event.get("checks_run", []) if str(value).strip()] if isinstance(event.get("checks_run"), list) else [],
                "files_touched": [str(value).strip() for value in event.get("files_touched", []) if str(value).strip()] if isinstance(event.get("files_touched"), list) else [],
                "issues": [str(value).strip() for value in event.get("issues", []) if str(value).strip()] if isinstance(event.get("issues"), list) else [],
                "updated_at": timestamp,
            }
            updated_at = timestamp or updated_at

    return {
        "phase": phase,
        "updated_at": updated_at,
        "evidence": evidence,
    }


def build_roadmap_state(entries: list[dict[str, Any]], graph: dict[str, Any], lint_report: dict[str, Any], events: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    graph_views = graph.get("views", {}) if isinstance(graph.get("views"), dict) else {}
    graph_roadmap = graph_views.get("roadmap", {}) if isinstance(graph_views.get("roadmap"), dict) else {}
    ordered = [str(item.get("id", "")).strip() for item in entries if str(item.get("id", "")).strip()]
    status_counts = Counter(str(item.get("status", "todo")) for item in entries)
    priority_counts = Counter(str(item.get("priority", "medium")) for item in entries)
    tasks: dict[str, Any] = {}

    for item in entries:
        task_id = str(item.get("id", "")).strip()
        if not task_id:
            continue
        tasks[task_id] = {
            "id": task_id,
            "title": str(item.get("title", task_id)).strip(),
            "status": str(item.get("status", "todo")),
            "priority": str(item.get("priority", "medium")),
            "kind": str(item.get("kind", "task")).strip(),
            "summary": str(item.get("summary", "")).strip(),
            "labels": [str(value) for value in item.get("labels", []) if str(value).strip()],
            "goal": {
                "outcome": str(((item.get("goal") or {}).get("outcome", ""))).strip(),
                "acceptance": [str(value) for value in (((item.get("goal") or {}).get("acceptance")) or []) if str(value).strip()],
                "non_goals": [str(value) for value in (((item.get("goal") or {}).get("non_goals")) or []) if str(value).strip()],
                "verification": [str(value) for value in (((item.get("goal") or {}).get("verification")) or []) if str(value).strip()],
            },
            "spec_paths": [str(value) for value in item.get("spec_paths", []) if str(value).strip()],
            "code_paths": [str(value) for value in item.get("code_paths", []) if str(value).strip()],
            "updated": str(item.get("updated", "")).strip(),
            "revision": task_revision(item),
            "context_path": (ROADMAP_TASKS_PATH / task_id / "context.json").relative_to(ROOT).as_posix(),
            "loop": build_task_loop_state(task_id, str(item.get("status", "todo")), events or []),
        }

    sorted_entries = sorted(entries, key=roadmap_sort_key)
    recent_entries = sorted(entries, key=lambda item: (str(item.get("updated", "")), str(item.get("id", ""))), reverse=True)
    blocked_task_ids = [
        str(item.get("id", "")).strip()
        for item in sorted_entries
        if str(item.get("id", "")).strip()
        and (
            str(item.get("status", "todo")).strip() == "blocked"
            or str((((tasks.get(str(item.get("id", "")).strip(), {}) or {}).get("loop") or {}).get("evidence") or {}).get("verdict", "")).strip() == "blocked"
        )
    ]
    return {
        "version": 2,
        "generated_at": now_iso(),
        "health": lint_health(lint_report),
        "source": {
            "graph_version": int(graph.get("version", 0) or 0),
            "graph_generated_at": str(graph.get("generated_at", "")).strip(),
            "revision": graph.get("revision", {}),
            "roadmap_folder": ROADMAP_FOLDER_PATH.relative_to(ROOT).as_posix(),
            "task_context_root": ROADMAP_TASKS_PATH.relative_to(ROOT).as_posix(),
        },
        "summary": {
            "task_count": len(entries),
            "open_count": int(sum(1 for item in entries if is_open_task_status(item.get("status", "todo")))),
            "status_counts": dict(graph_roadmap.get("status_counts", {})) if isinstance(graph_roadmap.get("status_counts"), dict) and graph_roadmap.get("status_counts") else dict(status_counts),
            "priority_counts": dict(priority_counts),
        },
        "views": {
            "ordered_task_ids": [str(value).strip() for value in graph_roadmap.get("task_ids", []) if str(value).strip()] or ordered,
            "open_task_ids": [str(value).strip() for value in graph_roadmap.get("open_task_ids", []) if str(value).strip()] or [str(item.get("id", "")).strip() for item in sorted_entries if is_open_task_status(item.get("status", "todo")) and str(item.get("id", "")).strip()],
            "in_progress_task_ids": [str(value).strip() for value in graph_roadmap.get("in_progress_task_ids", []) if str(value).strip()] or [str(item.get("id", "")).strip() for item in sorted_entries if is_active_task_status(item.get("status", "todo")) and str(item.get("id", "")).strip()],
            "todo_task_ids": [str(value).strip() for value in graph_roadmap.get("todo_task_ids", []) if str(value).strip()] or [str(item.get("id", "")).strip() for item in sorted_entries if str(item.get("status", "todo")) == "todo" and str(item.get("id", "")).strip()],
            "blocked_task_ids": [str(value).strip() for value in graph_roadmap.get("blocked_task_ids", []) if str(value).strip()] or blocked_task_ids,
            "done_task_ids": [str(value).strip() for value in graph_roadmap.get("done_task_ids", []) if str(value).strip()] or [str(item.get("id", "")).strip() for item in sorted_entries if str(item.get("status", "todo")) == "done" and str(item.get("id", "")).strip()],
            "cancelled_task_ids": [str(value).strip() for value in graph_roadmap.get("cancelled_task_ids", []) if str(value).strip()] or [str(item.get("id", "")).strip() for item in sorted_entries if str(item.get("status", "todo")) == "cancelled" and str(item.get("id", "")).strip()],
            "recent_task_ids": [str(value).strip() for value in graph_roadmap.get("recent_task_ids", []) if str(value).strip()] or [str(item.get("id", "")).strip() for item in recent_entries if str(item.get("id", "")).strip()],
        },
        "tasks": tasks,
    }


def compact_code_area(code_paths: list[str]) -> str:
    cleaned = [str(value).strip() for value in code_paths if str(value).strip()]
    if not cleaned:
        return "—"
    if len(cleaned) == 1:
        return cleaned[0]
    areas: list[str] = []
    for path in cleaned:
        head = path.split("/", 1)[0]
        if head not in areas:
            areas.append(head)
    if len(areas) == 1:
        return f"{areas[0]} +{len(cleaned) - 1} more"
    visible = areas[:2]
    suffix = f" +{len(areas) - len(visible)} more" if len(areas) > len(visible) else ""
    return ", ".join(visible) + suffix


def path_starts_with_any(path: str, prefixes: list[str]) -> bool:
    return any(path.startswith(prefix) for prefix in prefixes)


def spec_group(path: str) -> str:
    if path.startswith(PRODUCT_SPEC_PREFIX):
        return "product"
    if path_starts_with_any(path, CLIENTS_SPEC_PREFIXES):
        return "clients"
    return "system"


def spec_requires_code_mapping(path: str) -> bool:
    if path.startswith(f"{SYSTEM_SPEC_PREFIX}runtime/"):
        return False
    return path.startswith(SYSTEM_SPEC_PREFIX)


def bar_state(label: str, value: int, total: int) -> dict[str, Any]:
    safe_total = total if total > 0 else 0
    percent = int(round((value / safe_total) * 100)) if safe_total > 0 else 100
    return {
        "label": label,
        "value": int(value),
        "total": int(total),
        "percent": percent,
    }


def unique(values: list[str]) -> list[str]:
    seen: list[str] = []
    for value in values:
        text = str(value).strip()
        if text and text not in seen:
            seen.append(text)
    return seen


def lane_stats(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts = Counter(str(row.get("drift_status", "aligned")) for row in rows)
    return {
        "total_specs": len(rows),
        "aligned_specs": counts.get("aligned", 0),
        "tracked_specs": counts.get("tracked", 0),
        "untracked_specs": counts.get("untracked", 0),
        "blocked_specs": counts.get("blocked", 0),
        "unmapped_specs": counts.get("unmapped", 0),
    }


def previous_heartbeat_lane(previous_status: dict[str, Any], lane_id: str) -> dict[str, Any] | None:
    heartbeat = previous_status.get("heartbeat") if isinstance(previous_status.get("heartbeat"), dict) else {}
    lanes = heartbeat.get("lanes", []) if isinstance(heartbeat, dict) else []
    for lane in lanes if isinstance(lanes, list) else []:
        if isinstance(lane, dict) and str(lane.get("id", "")).strip() == lane_id:
            return lane
    return None


def lane_revision_anchor(row_paths: list[str], code_paths: list[str], open_task_ids: list[str], spec_rows_by_path: dict[str, dict[str, Any]], roadmap_entries: list[dict[str, Any]]) -> dict[str, Any]:
    tasks_by_id = {str(task.get("id", "")).strip(): task for task in roadmap_entries if str(task.get("id", "")).strip()}
    spec_digests = {
        path: str(((spec_rows_by_path.get(path, {}) or {}).get("revision") or {}).get("digest", "")).strip()
        for path in row_paths
    }
    task_digests = {
        task_id: str(task_revision(tasks_by_id[task_id]).get("digest", "")).strip()
        for task_id in open_task_ids
        if task_id in tasks_by_id
    }
    code_digest = canonical_digest({path: sha256_text((ROOT / path).read_text(encoding="utf-8", errors="ignore")) for path in code_paths if (ROOT / path).is_file()})
    anchor = {
        "git": git_anchor(row_paths + code_paths + [ROADMAP_PATH.relative_to(ROOT).as_posix()]),
        "spec_digest": canonical_digest(spec_digests),
        "task_digest": canonical_digest(task_digests),
        "code_digest": code_digest,
    }
    anchor["digest"] = canonical_digest(anchor)
    return anchor


def lane_freshness(anchor: dict[str, Any], previous_lane: dict[str, Any] | None, checked_at: str) -> dict[str, Any]:
    if not previous_lane:
        return {
            "status": "fresh",
            "basis": "revision",
            "checked_at": checked_at,
            "reason": "no previous heartbeat anchor; current revision captured",
            "stale_state_guidance": "Resume normally; future spec, task, or mapped code revision changes will mark this lane stale.",
        }
    previous_revision = previous_lane.get("revision")
    previous_anchor: dict[str, Any] = cast(dict[str, Any], previous_revision) if isinstance(previous_revision, dict) else {}
    changed = []
    for key in ["spec_digest", "task_digest", "code_digest"]:
        if str(anchor.get(key, "")) != str(previous_anchor.get(key, "")):
            changed.append(key.replace("_digest", ""))
    if changed:
        return {
            "status": "stale",
            "basis": "revision",
            "checked_at": checked_at,
            "reason": f"revision changed: {', '.join(changed)}",
            "stale_state_guidance": "Re-run status or resume implementation before trusting prior drift analysis.",
        }
    return {
        "status": "fresh",
        "basis": "revision",
        "checked_at": checked_at,
        "reason": "revision anchors unchanged since previous heartbeat",
        "stale_state_guidance": "Prior drift analysis remains correlated with current spec, task, and mapped code revisions.",
    }


def build_heartbeat_lane(
    lane_id: str,
    title: str,
    cadence: str,
    fallback_max_age_hours: int,
    triggers: list[str],
    spec_paths: list[str],
    spec_rows_by_path: dict[str, dict[str, Any]],
    roadmap_entries: list[dict[str, Any]],
    recommendation: dict[str, str],
    previous_status: dict[str, Any],
) -> dict[str, Any]:
    rows = [spec_rows_by_path[path] for path in spec_paths if path in spec_rows_by_path]
    row_paths = [str(row.get("path", "")).strip() for row in rows if str(row.get("path", "")).strip()]
    code_paths = unique([
        str(code_path)
        for row in rows
        for code_path in row.get("code_paths", [])
        if str(code_path).strip()
    ])

    open_task_ids: list[str] = []
    for task in roadmap_entries:
        task_id = str(task.get("id", "")).strip()
        if not task_id:
            continue
        if not is_open_task_status(task.get("status", "todo")):
            continue
        task_spec_paths = [str(value) for value in task.get("spec_paths", []) if str(value).strip()]
        task_code_paths = [str(value) for value in task.get("code_paths", []) if str(value).strip()]
        if set(task_spec_paths) & set(row_paths) or set(task_code_paths) & set(code_paths):
            open_task_ids.append(task_id)

    checked_at = now_iso()
    normalized_open_task_ids = unique(open_task_ids)
    revision = lane_revision_anchor(row_paths, code_paths, normalized_open_task_ids, spec_rows_by_path, roadmap_entries)

    return {
        "id": lane_id,
        "title": title,
        "cadence": cadence,
        "freshness_basis": "work-first",
        "fallback_max_age_hours": fallback_max_age_hours,
        "interval_hours": fallback_max_age_hours,
        "triggers": triggers,
        "checked_at": checked_at,
        "revision": revision,
        "freshness": lane_freshness(revision, previous_heartbeat_lane(previous_status, lane_id), checked_at),
        "spec_paths": row_paths,
        "code_paths": code_paths,
        "code_area": compact_code_area(code_paths),
        "open_task_ids": normalized_open_task_ids,
        "risky_spec_paths": [path for path in row_paths if str(spec_rows_by_path.get(path, {}).get("drift_status", "aligned")) != "aligned"],
        "stats": lane_stats(rows),
        "recommendation": recommendation,
    }


def build_resume_state(
    roadmap_state: dict[str, Any],
    heartbeat_lanes: list[dict[str, Any]],
    next_step: dict[str, str],
) -> dict[str, Any]:
    views = roadmap_state.get("views", {}) if isinstance(roadmap_state.get("views"), dict) else {}
    tasks = roadmap_state.get("tasks", {}) if isinstance(roadmap_state.get("tasks"), dict) else {}
    in_progress_ids = [str(value).strip() for value in views.get("in_progress_task_ids", []) if str(value).strip()]
    todo_ids = [str(value).strip() for value in views.get("todo_task_ids", []) if str(value).strip()]
    open_task_id = (in_progress_ids + todo_ids + [""])[0]
    task = tasks.get(open_task_id) if open_task_id else None
    if isinstance(task, dict):
        goal = task.get("goal", {}) if isinstance(task.get("goal"), dict) else {}
        verification = [str(value).strip() for value in goal.get("verification", []) if str(value).strip()]
        loop = task.get("loop", {}) if isinstance(task.get("loop"), dict) else {}
        evidence = loop.get("evidence", {}) if isinstance(loop.get("evidence"), dict) else {}
        evidence_parts = [str(evidence.get("summary", "")).strip()]
        checks_run = [str(value).strip() for value in evidence.get("checks_run", []) if str(value).strip()] if isinstance(evidence.get("checks_run"), list) else []
        issues = [str(value).strip() for value in evidence.get("issues", []) if str(value).strip()] if isinstance(evidence.get("issues"), list) else []
        if checks_run:
            evidence_parts.append(f"{len(checks_run)} check(s)")
        if issues:
            evidence_parts.append(f"{len(issues)} issue(s)")
        evidence_text = " · ".join([part for part in evidence_parts if part]) or "No closure evidence recorded yet."
        phase = normalize_task_phase(loop.get("phase"))
        return {
            "source": "task",
            "task_id": open_task_id,
            "lane_id": "",
            "heading": f"{open_task_id} — {str(task.get('title', '')).strip()}".strip(" —"),
            "command": f"/wiki-resume {open_task_id}",
            "reason": f"Resume roadmap task ({str(task.get('status', 'todo')).strip() or 'todo'} · {phase}).",
            "phase": phase,
            "verification": verification[0] if verification else "No explicit verification step yet.",
            "evidence": evidence_text,
            "heartbeat": "Roadmap task should stay grounded in current heartbeat cues.",
        }

    stale_lane: dict[str, Any] | None = None
    for lane in heartbeat_lanes:
        freshness_raw = lane.get("freshness")
        freshness: dict[str, Any] = {}
        if isinstance(freshness_raw, dict):
            freshness = freshness_raw
        if freshness.get("status") == "stale" or (lane.get("risky_spec_paths") or lane.get("open_task_ids") or ((lane.get("stats") or {}).get("untracked_specs", 0)) or ((lane.get("stats") or {}).get("blocked_specs", 0))):
            stale_lane = lane
            break
    if stale_lane:
        return {
            "source": "heartbeat",
            "task_id": "",
            "lane_id": str(stale_lane.get("id", "")).strip(),
            "heading": str(stale_lane.get("title", "")).strip(),
            "command": str(((stale_lane.get("recommendation") or {}).get("command", "")).strip()),
            "reason": "Resume from stale heartbeat lane.",
            "phase": "implement",
            "verification": str(((stale_lane.get("recommendation") or {}).get("reason", "")).strip()),
            "evidence": "No closure evidence recorded yet.",
            "heartbeat": str(((stale_lane.get("freshness") or {}).get("stale_state_guidance", "")).strip()) or f"{len(stale_lane.get('risky_spec_paths', []))} risky spec(s) and {len(stale_lane.get('open_task_ids', []))} open task(s).",
        }

    return {
        "source": "next_step",
        "task_id": "",
        "lane_id": "",
        "heading": "Roadmap clear",
        "command": str(next_step.get("command", "")).strip(),
        "reason": str(next_step.get("reason", "")).strip(),
        "phase": "implement",
        "verification": "No urgent verification cue.",
        "evidence": "No closure evidence recorded yet.",
        "heartbeat": "All heartbeat lanes currently fresh.",
    }


AGENT_NAME_POOL = [
    "Otter", "Kestrel", "Marten", "Heron", "Fox", "Raven", "Panda", "Lynx",
    "Badger", "Cormorant", "Falcon", "Tern", "Wren", "Puma", "Seal", "Yak",
    "Ibis", "Manta", "Orca", "Puffin", "Sable", "Swift", "Wolf", "Quail",
    "Mole", "Bison", "Gecko", "Jaguar", "Koala", "Narwhal", "Robin", "Stoat",
]


def stable_agent_name(session_id: str) -> str:
    value = 0
    for ch in session_id:
        value = ((value * 33) + ord(ch)) & 0xFFFFFFFF
    return AGENT_NAME_POOL[value % len(AGENT_NAME_POOL)]


def assign_agent_names(session_ids: list[str]) -> dict[str, str]:
    used: dict[str, int] = {}
    assigned: dict[str, str] = {}
    for session_id in sorted(session_ids):
        base = stable_agent_name(session_id)
        count = used.get(base, 0) + 1
        used[base] = count
        assigned[session_id] = base if count == 1 else f"{base} {count}"
    return assigned


def build_parallel_session_state(events: list[dict[str, Any]], roadmap_state: dict[str, Any]) -> dict[str, Any]:
    latest_by_session: dict[str, dict[str, Any]] = {}
    for event in events:
        if str(event.get("kind", "")).strip() != "task_session_link":
            continue
        session_id = str(event.get("session_id", "")).strip()
        task_id = str(event.get("task_id", "")).strip()
        timestamp = str(event.get("ts", "")).strip()
        action = str(event.get("action", "focus")).strip() or "focus"
        if not session_id or not timestamp:
            continue
        if action == "clear":
            latest_by_session.pop(session_id, None)
            continue
        if not task_id:
            continue
        latest_by_session[session_id] = {
            "session_id": session_id,
            "task_id": task_id,
            "action": action,
            "timestamp": timestamp,
            "title": str(event.get("title", "")).strip(),
            "summary": str(event.get("summary", "")).strip(),
        }

    sessions = sorted(latest_by_session.values(), key=lambda item: (str(item.get("timestamp", "")), str(item.get("session_id", ""))), reverse=True)
    agent_names = assign_agent_names([str(item.get("session_id", "")).strip() for item in sessions if str(item.get("session_id", "")).strip()])
    for item in sessions:
        item["agent_name"] = agent_names.get(str(item.get("session_id", "")).strip(), "Agent")
    counts = Counter(str(item.get("task_id", "")).strip() for item in sessions if str(item.get("task_id", "")).strip())
    collision_task_ids = [task_id for task_id, count in counts.items() if count > 1]
    return {
        "generated_at": now_iso(),
        "active_session_count": len(sessions),
        "collision_task_ids": sorted(collision_task_ids),
        "sessions": sessions[:8],
    }


def build_status_state(docs: list[dict[str, Any]], graph: dict[str, Any], roadmap_entries: list[dict[str, Any]], lint_report: dict[str, Any], roadmap_state: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    previous_status = load_previous_status_state()
    health = lint_health(lint_report)
    doc_by_path = {str(doc.get("path", "")).strip(): doc for doc in docs if str(doc.get("path", "")).strip()}
    graph_doc_code_paths: dict[str, list[str]] = {}
    for edge in graph.get("edges", []) if isinstance(graph.get("edges"), list) else []:
        if str(edge.get("kind", "")).strip() != "doc_code_path":
            continue
        source = str(edge.get("from", "")).strip()
        target = str(edge.get("to", "")).strip()
        if not source.startswith("doc:") or not target.startswith("code:"):
            continue
        graph_doc_code_paths.setdefault(source.replace("doc:", "", 1), []).append(target.replace("code:", "", 1))
    graph_spec_docs = []
    for node in graph.get("nodes", []) if isinstance(graph.get("nodes"), list) else []:
        if str(node.get("kind", "")).strip() != "doc" or str(node.get("doc_type", "")).strip() != "spec":
            continue
        path = str(node.get("path", "")).strip()
        if not path:
            continue
        doc = doc_by_path.get(path, {})
        doc_code_paths = doc.get("code_paths", [])
        if not isinstance(doc_code_paths, list):
            doc_code_paths = []
        graph_spec_docs.append({
            **doc,
            "path": path,
            "title": str(node.get("title", doc.get("title", path))).strip(),
            "summary": str(doc.get("summary", node.get("summary", ""))).strip(),
            "doc_type": "spec",
            "code_paths": unique(graph_doc_code_paths.get(path, []) or [str(value) for value in doc_code_paths if str(value).strip()]),
            "revision": node.get("revision", doc.get("revision", {})),
        })
    spec_docs = sorted(graph_spec_docs or [doc for doc in docs if doc.get("doc_type") == "spec"], key=lambda doc: str(doc.get("path", "")))
    raw_issues_value = lint_report.get("issues")
    raw_issues: list[Any] = raw_issues_value if isinstance(raw_issues_value, list) else []
    issues: list[dict[str, Any]] = [issue for issue in raw_issues if isinstance(issue, dict)]
    open_tasks_by_spec: dict[str, list[dict[str, Any]]] = {}
    blocked_tasks_by_spec: dict[str, list[dict[str, Any]]] = {}
    done_tasks_by_spec: dict[str, list[dict[str, Any]]] = {}

    for task in roadmap_entries:
        spec_paths = [str(value) for value in task.get("spec_paths", []) if str(value).strip()]
        status = str(task.get("status", "todo"))
        for spec_path in spec_paths:
            if status == "blocked":
                blocked_tasks_by_spec.setdefault(spec_path, []).append(task)
            elif is_open_task_status(status):
                open_tasks_by_spec.setdefault(spec_path, []).append(task)
            elif status == "done":
                done_tasks_by_spec.setdefault(spec_path, []).append(task)

    spec_rows: list[dict[str, Any]] = []
    counts = Counter()
    risky_paths: list[str] = []

    for doc in spec_docs:
        path = str(doc.get("path", "")).strip()
        code_paths = [str(value) for value in doc.get("code_paths", []) if str(value).strip()]
        related_issues = [
            issue
            for issue in issues
            if str(issue.get("path", "")).strip() in {path, path.replace("wiki/", "docs/", 1)}
        ]
        issue_errors = sum(1 for issue in related_issues if str(issue.get("severity", "")) == "error")
        issue_warnings = sum(1 for issue in related_issues if str(issue.get("severity", "")) == "warning")
        open_tasks = sorted(open_tasks_by_spec.get(path, []), key=roadmap_sort_key)
        blocked_tasks = sorted(blocked_tasks_by_spec.get(path, []), key=roadmap_sort_key)
        done_tasks = sorted(done_tasks_by_spec.get(path, []), key=roadmap_sort_key)

        requires_mapping = spec_requires_code_mapping(path)

        if blocked_tasks and not open_tasks:
            drift_status = "blocked"
            primary_task = blocked_tasks[0]
            note = f"blocked by {primary_task.get('id', 'task')}"
        elif open_tasks:
            drift_status = "tracked"
            primary_task = open_tasks[0]
            note = f"tracked by {primary_task.get('id', 'task')}"
        elif not code_paths and requires_mapping:
            drift_status = "unmapped"
            primary_task = None
            note = "no mapped code area"
        elif related_issues:
            drift_status = "untracked"
            primary_task = None
            issue_total = issue_errors + issue_warnings
            note = f"{issue_total} deterministic issue{'s' if issue_total != 1 else ''} with no open roadmap task"
        else:
            drift_status = "aligned"
            primary_task = done_tasks[0] if done_tasks else None
            note = "no deterministic drift signals"

        counts[drift_status] += 1
        if drift_status != "aligned":
            risky_paths.append(path)
        spec_rows.append(
            {
                "path": path,
                "title": str(doc.get("title", path)).strip(),
                "summary": str(doc.get("summary", "")).strip(),
                "drift_status": drift_status,
                "code_paths": code_paths,
                "code_area": compact_code_area(code_paths),
                "issue_counts": {
                    "errors": issue_errors,
                    "warnings": issue_warnings,
                    "total": issue_errors + issue_warnings,
                },
                "related_task_ids": [str(item.get("id", "")).strip() for item in [*open_tasks, *blocked_tasks, *done_tasks] if str(item.get("id", "")).strip()],
                "primary_task": {
                    "id": str(primary_task.get("id", "")).strip(),
                    "status": str(primary_task.get("status", "")).strip(),
                    "title": str(primary_task.get("title", "")).strip(),
                } if isinstance(primary_task, dict) else None,
                "revision": doc.get("revision", {}),
                "note": note,
            }
        )

    status_order = {"untracked": 0, "blocked": 1, "tracked": 2, "unmapped": 3, "aligned": 4}
    risky_specs = sorted(spec_rows, key=lambda item: (status_order.get(str(item.get("drift_status", "aligned")), 99), str(item.get("path", ""))))
    spec_rows_by_path = {str(row.get("path", "")).strip(): row for row in spec_rows if str(row.get("path", "")).strip()}
    mapping_target_specs = [row for row in spec_rows if spec_requires_code_mapping(str(row.get("path", "")))]
    total_specs = len(mapping_target_specs)
    mapped_specs = len([row for row in mapping_target_specs if str(row.get("drift_status", "aligned")) != "unmapped"])
    drift_total = counts.get("tracked", 0) + counts.get("untracked", 0) + counts.get("blocked", 0)
    tracked_total = counts.get("tracked", 0) + counts.get("blocked", 0)
    task_summary = roadmap_state.get("summary", {}) if isinstance(roadmap_state.get("summary"), dict) else {}
    task_status_counts = task_summary.get("status_counts", {}) if isinstance(task_summary.get("status_counts"), dict) else {}

    product_spec_paths = [str(row.get("path", "")).strip() for row in spec_rows if str(row.get("path", "")).startswith(PRODUCT_SPEC_PREFIX)]
    system_spec_paths = [str(row.get("path", "")).strip() for row in spec_rows if str(row.get("path", "")).startswith(SYSTEM_SPEC_PREFIX)]
    ux_spec_paths = [str(row.get("path", "")).strip() for row in spec_rows if path_starts_with_any(str(row.get("path", "")).strip(), CLIENTS_SPEC_PREFIXES)]
    heartbeat_lanes = [
        build_heartbeat_lane(
            "product_system",
            "Product ↔ System",
            "low",
            24,
            [
                "spec_change:product",
                "spec_change:system",
                "task_close:architecture",
                "manual_review",
            ],
            unique(product_spec_paths + system_spec_paths),
            spec_rows_by_path,
            roadmap_entries,
            {
                "kind": "status",
                "command": "/wiki-status",
                "reason": "Strategic intent drift should first be inspected through the canonical status surface.",
            },
            previous_status,
        ),
        build_heartbeat_lane(
            "system_code",
            "System ↔ Code",
            "high",
            1,
            [
                "spec_change:system",
                "code_change:mapped",
                "task_progress",
                "rebuild_complete",
                "pre_close_check",
            ],
            unique(system_spec_paths),
            spec_rows_by_path,
            roadmap_entries,
            {
                "kind": "implement",
                "command": "/wiki-resume",
                "reason": "Implementation drift should be checked most frequently against owning system specs.",
            },
            previous_status,
        ),
        build_heartbeat_lane(
            "product_system_ux",
            "Product + System ↔ UX",
            "medium",
            6,
            [
                "spec_change:product",
                "spec_change:system",
                "spec_change:ux",
                "code_change:ux_surface",
                "manual_review",
            ],
            unique(product_spec_paths + system_spec_paths + ux_spec_paths),
            spec_rows_by_path,
            roadmap_entries,
            {
                "kind": "status",
                "command": "/wiki-status",
                "reason": "User-visible drift should first be inspected through the canonical status surface.",
            },
            previous_status,
        ),
    ]

    if counts.get("untracked", 0) > 0:
        next_step = {
            "kind": "status",
            "command": "/wiki-status",
            "reason": f"{counts.get('untracked', 0)} untracked spec drift needs inspection through the canonical status surface.",
        }
    elif counts.get("blocked", 0) > 0 or int(task_status_counts.get("blocked", 0)) > 0:
        next_step = {
            "kind": "status",
            "command": "/wiki-status",
            "reason": "Blocked drift exists; inspect constraints in status before resuming implementation.",
        }
    elif isinstance(roadmap_state.get("views"), dict) and roadmap_state["views"].get("in_progress_task_ids"):
        task_id = str(roadmap_state["views"]["in_progress_task_ids"][0])
        next_step = {
            "kind": "code",
            "command": f"/wiki-resume {task_id}",
            "reason": "Roadmap already covers current delta; continue in-progress implementation.",
        }
    elif isinstance(roadmap_state.get("views"), dict) and roadmap_state["views"].get("todo_task_ids"):
        task_id = str(roadmap_state["views"]["todo_task_ids"][0])
        next_step = {
            "kind": "code",
            "command": f"/wiki-resume {task_id}",
            "reason": "Roadmap is ready; continue with the next open task.",
        }
    else:
        next_step = {
            "kind": "observe",
            "command": "Observe — roadmap clear",
            "reason": "No open deterministic drift requires action right now.",
        }

    heartbeat_summary = {
        "lane_count": len(heartbeat_lanes),
        "freshness_basis": "work-first",
        "high_cadence_lane_ids": [str(item.get("id", "")) for item in heartbeat_lanes if str(item.get("cadence", "")) == "high" and str(item.get("id", "")).strip()],
        "medium_cadence_lane_ids": [str(item.get("id", "")) for item in heartbeat_lanes if str(item.get("cadence", "")) == "medium" and str(item.get("id", "")).strip()],
        "low_cadence_lane_ids": [str(item.get("id", "")) for item in heartbeat_lanes if str(item.get("cadence", "")) == "low" and str(item.get("id", "")).strip()],
    }
    parallel = build_parallel_session_state(events, roadmap_state)
    resume = build_resume_state(roadmap_state, heartbeat_lanes, next_step)

    wiki_sections = {
        "product": {"id": "product", "label": "Product", "rows": []},
        "system": {"id": "system", "label": "System", "rows": []},
        "clients": {"id": "clients", "label": "Clients", "rows": []},
    }
    for row in risky_specs:
        row_path = str(row.get("path", "")).strip()
        group = spec_group(row_path)
        wiki_sections[group]["rows"].append(row)

    roadmap_columns = [
        {"id": "todo", "label": "Todo", "task_ids": []},
        {"id": "research", "label": "Research", "task_ids": []},
        {"id": "implement", "label": "Implement", "task_ids": []},
        {"id": "verify", "label": "Verify", "task_ids": []},
        {"id": "done", "label": "Done", "task_ids": []},
    ]
    roadmap_tasks = roadmap_state.get("tasks") if isinstance(roadmap_state.get("tasks"), dict) else {}
    ordered_task_ids = (((roadmap_state.get("views") or {}).get("ordered_task_ids")) or []) if isinstance(roadmap_state.get("views"), dict) else []
    for task_id in ordered_task_ids if isinstance(ordered_task_ids, list) else []:
        task = roadmap_tasks.get(str(task_id)) if isinstance(roadmap_tasks, dict) else None
        if not isinstance(task, dict):
            continue
        if str(task.get("status", "")).strip() == "cancelled":
            continue
        stage = roadmap_task_stage(task.get("status", ""), ((task.get("loop") or {}).get("phase", "")))
        column = next((item for item in roadmap_columns if str(item.get("id", "")) == stage), roadmap_columns[0])
        column["task_ids"].append(str(task.get("id", task_id)).strip())

    direction = [
        next_step["reason"],
        f"Parallel sessions: {int(parallel['active_session_count'])} active, {len(parallel['collision_task_ids'])} collision task(s).",
        f"Heartbeat lanes: {heartbeat_summary['lane_count']} work-first (high={len(heartbeat_summary['high_cadence_lane_ids'])}, medium={len(heartbeat_summary['medium_cadence_lane_ids'])}, low={len(heartbeat_summary['low_cadence_lane_ids'])}).",
        f"Mapped specs: {mapped_specs}/{total_specs}.",
        f"Tracked drift coverage: {tracked_total}/{drift_total}." if drift_total > 0 else "No tracked spec drift is open.",
    ]

    return {
        "version": 1,
        "generated_at": now_iso(),
        "source": {
            "graph_version": int(graph.get("version", 0) or 0),
            "graph_generated_at": str(graph.get("generated_at", "")).strip(),
            "revision": graph.get("revision", {}),
        },
        "project": {
            "name": PROJECT_NAME,
            "docs_root": DOCS_ROOT.relative_to(ROOT).as_posix(),
            "roadmap_path": ROADMAP_PATH.relative_to(ROOT).as_posix(),
        },
        "health": health,
        "summary": {
            "total_specs": total_specs,
            "mapped_specs": mapped_specs,
            "aligned_specs": counts.get("aligned", 0),
            "tracked_specs": counts.get("tracked", 0),
            "untracked_specs": counts.get("untracked", 0),
            "blocked_specs": counts.get("blocked", 0),
            "unmapped_specs": counts.get("unmapped", 0),
            "task_count": int(task_summary.get("task_count", len(roadmap_entries))),
            "open_task_count": int(task_summary.get("open_count", 0)),
            "done_task_count": int(task_status_counts.get("done", 0)),
        },
        "bars": {
            "tracked_drift": bar_state("Tracked drift", tracked_total, drift_total),
            "roadmap_done": bar_state("Roadmap done", int(task_status_counts.get("done", 0)), int(task_summary.get("task_count", len(roadmap_entries)))),
            "spec_mapping": bar_state("Spec mapping", mapped_specs, total_specs),
        },
        "views": {
            "risky_spec_paths": [str(item.get("path", "")) for item in risky_specs if str(item.get("path", ""))],
            "top_risky_spec_paths": [str(item.get("path", "")) for item in risky_specs[:5] if str(item.get("path", ""))],
            "open_task_ids": [str(value) for value in (((roadmap_state.get("views") or {}).get("open_task_ids")) or []) if str(value).strip()],
        },
        "heartbeat": {
            "generated_at": now_iso(),
            "summary": heartbeat_summary,
            "lanes": heartbeat_lanes,
        },
        "parallel": parallel,
        "resume": resume,
        "wiki": {
            "rows": risky_specs,
            "sections": [section for section in [wiki_sections["product"], wiki_sections["system"], wiki_sections["clients"]] if section.get("rows")],
        },
        "roadmap": {
            "focused_task_id": str(resume.get("task_id", "")).strip() if str(resume.get("source", "")).strip() == "task" else "",
            "blocked_task_ids": [str(value).strip() for value in (((roadmap_state.get("views") or {}).get("blocked_task_ids")) or []) if str(value).strip()],
            "in_progress_task_ids": [str(value).strip() for value in (((roadmap_state.get("views") or {}).get("in_progress_task_ids")) or []) if str(value).strip()],
            "next_task_id": str((((roadmap_state.get("views") or {}).get("todo_task_ids")) or [""])[0]).strip(),
            "columns": roadmap_columns,
        },
        "agents": {
            "rows": [
                {
                    "id": f"session:{str(item.get('session_id', '')).strip()}",
                    "label": str(item.get("agent_name", "")).strip() or str(item.get("session_id", "")).strip(),
                    "name": str(item.get("agent_name", "")).strip() or str(item.get("session_id", "")).strip(),
                    "task_id": str(item.get("task_id", "")).strip(),
                    "task_title": str((((roadmap_state.get("tasks") or {}).get(str(item.get("task_id", "")).strip(), {}) or {}).get("title", ""))).strip(),
                    "mode": "manual",
                    "status": "blocked" if str(item.get("action", "")).strip() == "blocked" else "active",
                    "last_action": str(item.get("summary", "")).strip() or str(item.get("action", "")).strip(),
                    "constraint": "Pi session-linked execution",
                    "session_id": str(item.get("session_id", "")).strip(),
                }
                for item in parallel.get("sessions", [])
                if str(item.get("session_id", "")).strip()
            ],
        },
        "channels": {
            "add_label": "Add channel",
            "rows": [],
        },
        "specs": risky_specs,
        "next_step": next_step,
        "direction": direction,
    }


def docs_relative_link(root_relative_path: str) -> str:
    abs_path = ROOT / root_relative_path
    output_root = (ROADMAP_DOC_PATH or INDEX_PATH or META_ROOT).parent
    return os.path.relpath(abs_path, output_root).replace("\\", "/")


def roadmap_sort_key(item: dict[str, Any]) -> tuple[int, int, str]:
    status_order = {"implement": 0, "verify": 1, "in_progress": 0, "blocked": 1, "todo": 2, "research": 2, "done": 3, "cancelled": 4}
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    status = str(item.get("status", "todo"))
    priority = str(item.get("priority", "medium"))
    return (status_order.get(status, 99), priority_order.get(priority, 99), str(item.get("id", "")))


def render_roadmap(entries: list[dict[str, Any]]) -> str:
    generated_at = now_iso()
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
        "Roadmap is freshest representation of gap between desired state in authored docs and current implementation reality.",
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
            goal_raw = item.get("goal")
            goal: dict[str, Any] = {}
            if isinstance(goal_raw, dict):
                goal.update(goal_raw)
            delta_raw = item.get("delta")
            delta: dict[str, Any] = {}
            if isinstance(delta_raw, dict):
                delta.update(delta_raw)

            if spec_paths:
                lines.append("- Specs:")
                for spec_path in spec_paths:
                    lines.append(f"  - [{spec_path}]({docs_relative_link(spec_path)})")
            if code_paths:
                lines.append("- Code:")
                for code_path in code_paths:
                    lines.append(f"  - {code_path}")
            if research_ids:
                lines.append(f"- Evidence: {', '.join(research_ids)}")
            if labels:
                lines.append(f"- Labels: {', '.join(labels)}")
            goal_outcome = str(goal.get("outcome", "")).strip()
            goal_acceptance = [str(value) for value in goal.get("acceptance", []) if str(value).strip()] if isinstance(goal.get("acceptance"), list) else []
            goal_non_goals = [str(value) for value in goal.get("non_goals", []) if str(value).strip()] if isinstance(goal.get("non_goals"), list) else []
            goal_verification = [str(value) for value in goal.get("verification", []) if str(value).strip()] if isinstance(goal.get("verification"), list) else []
            if goal_outcome:
                lines.append(f"- Goal: {goal_outcome}")
            if goal_acceptance:
                lines.append("- Success signals:")
                for item_text in goal_acceptance:
                    lines.append(f"  - {item_text}")
            if goal_non_goals:
                lines.append("- Non-goals:")
                for item_text in goal_non_goals:
                    lines.append(f"  - {item_text}")
            if goal_verification:
                lines.append("- Verification:")
                for item_text in goal_verification:
                    lines.append(f"  - {item_text}")
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
        "- [Wiki Index](index.md)",
        f"- [Product]({docs_relative_link(f'{PRODUCT_SPEC_PREFIX}overview.md')})",
        f"- [Clients Overview]({docs_relative_link(f'{PRIMARY_CLIENTS_SPEC_PREFIX}overview.md')})",
        f"- [System Overview]({docs_relative_link(f'{SYSTEM_SPEC_PREFIX}overview.md')})",
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


def render_index(docs: list[dict[str, Any]], research_collections: list[dict[str, Any]], roadmap_entries: list[dict[str, Any]]) -> str:
    spec_docs = sorted([doc for doc in docs if doc["doc_type"] == "spec"], key=lambda item: item["path"])
    root_specs = [doc for doc in spec_docs if Path(doc["path"]).relative_to(SPECS_ROOT.relative_to(ROOT)).parts.__len__() == 1]
    grouped: dict[str, list[dict[str, Any]]] = {}
    for doc in spec_docs:
        rel = Path(doc["path"]).relative_to(SPECS_ROOT.relative_to(ROOT))
        if len(rel.parts) <= 1:
            continue
        grouped.setdefault(rel.parts[0], []).append(doc)

    roadmap_counts = Counter(str(item.get("status", "todo")) for item in roadmap_entries)
    roadmap_doc_rel = ROADMAP_DOC_PATH.relative_to(ROOT).as_posix() if ROADMAP_DOC_PATH is not None else ""
    lines = [
        f"# {INDEX_TITLE}",
        "",
        f"Generated: {now_iso()}",
        "",
        "## Roadmap",
        "",
        f"- [Roadmap]({docs_relative_link(roadmap_doc_rel)}) — {len(roadmap_entries)} task(s); " + ", ".join(f"{key}={value}" for key, value in sorted(roadmap_counts.items())) if roadmap_entries else f"- [Roadmap]({docs_relative_link(roadmap_doc_rel)}) — 0 tasks",
        "",
        "## Docs — Root",
        "",
    ]

    if root_specs:
        for doc in root_specs:
            lines.append(index_line(doc["path"], doc["title"], doc["summary"], doc["state"], doc["doc_type"]))
    else:
        lines.append("_None._")
    lines.append("")

    for group_name in sorted(grouped):
        lines.extend([f"## {group_name.replace('-', ' ').title()}", ""])
        for doc in grouped[group_name]:
            lines.append(index_line(doc["path"], doc["title"], doc["summary"], doc["state"], doc["doc_type"]))
        lines.append("")

    lines.extend(["## Evidence", ""])
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


def code_paths_digest(paths: list[str]) -> str:
    payload: dict[str, str] = {}
    for path in paths:
        candidate = ROOT / path
        if candidate.is_file():
            payload[path] = sha256_text(candidate.read_text(encoding="utf-8", errors="ignore"))
    return canonical_digest(payload)


def task_context_rel_path(task_id: str) -> str:
    return (ROADMAP_TASKS_PATH / task_id / "context.json").relative_to(ROOT).as_posix()


def compact_task_goal(task: dict[str, Any]) -> dict[str, Any]:
    goal_raw = task.get("goal")
    goal = goal_raw if isinstance(goal_raw, dict) else {}
    return {
        "outcome": str(goal.get("outcome", "")).strip(),
        "acceptance": [str(value).strip() for value in goal.get("acceptance", []) if str(value).strip()] if isinstance(goal.get("acceptance"), list) else [],
        "non_goals": [str(value).strip() for value in goal.get("non_goals", []) if str(value).strip()] if isinstance(goal.get("non_goals"), list) else [],
        "verification": [str(value).strip() for value in goal.get("verification", []) if str(value).strip()] if isinstance(goal.get("verification"), list) else [],
    }


def compact_revision_digest(revision: Any) -> dict[str, str]:
    if not isinstance(revision, dict):
        return {"digest": ""}
    return {"digest": str(revision.get("digest", "")).strip()}


def compact_git_anchor(paths: list[str]) -> dict[str, Any]:
    anchor = git_anchor(paths)
    raw_paths = anchor.get("paths", {}) if isinstance(anchor.get("paths"), dict) else {}
    return {
        "head": str(anchor.get("head", "")).strip(),
        "dirty": bool(anchor.get("dirty", False)),
        "dirty_paths": [str(path).strip() for path in anchor.get("dirty_paths", [])[:12] if str(path).strip()] if isinstance(anchor.get("dirty_paths"), list) else [],
        "paths": {str(path): str(commit)[:12] for path, commit in raw_paths.items()},
    }


def compact_graph_revision(graph: dict[str, Any]) -> dict[str, Any]:
    revision = graph.get("revision") if isinstance(graph.get("revision"), dict) else {}
    git = revision.get("git") if isinstance(revision.get("git"), dict) else {}
    return {
        "git": {
            "head": str(git.get("head", "")).strip(),
            "dirty": bool(git.get("dirty", False)),
        },
        "spec_digest": str(revision.get("spec_digest", "")).strip(),
        "task_digest": str(revision.get("task_digest", "")).strip(),
        "evidence_digest": str(revision.get("evidence_digest", "")).strip(),
    }


def compact_spec_contract(path: str, docs_by_path: dict[str, dict[str, Any]]) -> dict[str, Any]:
    doc = docs_by_path.get(path) or {}
    return {
        "path": path,
        "title": str(doc.get("title", Path(path).stem)).strip(),
        "summary": str(doc.get("summary", "")).strip(),
        "state": str(doc.get("state", "")).strip(),
        "owners": [str(value).strip() for value in doc.get("owners", []) if str(value).strip()] if isinstance(doc.get("owners"), list) else [],
        "code_paths": [str(value).strip() for value in doc.get("code_paths", []) if str(value).strip()] if isinstance(doc.get("code_paths"), list) else [],
        "revision": compact_revision_digest(doc.get("revision", {})),
        "expand": {"read": path},
    }


def build_task_context_packet(task: dict[str, Any], runtime_task: dict[str, Any], docs_by_path: dict[str, dict[str, Any]], graph: dict[str, Any]) -> dict[str, Any]:
    task_id = str(task.get("id", "")).strip()
    spec_paths = [str(value).strip() for value in task.get("spec_paths", []) if str(value).strip()] if isinstance(task.get("spec_paths"), list) else []
    code_paths = [str(value).strip() for value in task.get("code_paths", []) if str(value).strip()] if isinstance(task.get("code_paths"), list) else []
    spec_digests: dict[str, str] = {}
    for path in spec_paths:
        doc = docs_by_path.get(path)
        revision_raw = doc.get("revision") if isinstance(doc, dict) else {}
        revision_doc = revision_raw if isinstance(revision_raw, dict) else {}
        spec_digests[path] = str(revision_doc.get("digest", "")).strip()
    loop_raw = runtime_task.get("loop")
    loop: dict[str, Any] = loop_raw if isinstance(loop_raw, dict) else {}
    evidence_raw = loop.get("evidence")
    latest_evidence = evidence_raw if isinstance(evidence_raw, dict) else None
    phase = str(loop.get("phase", default_task_phase(task.get("status", "todo")))).strip()
    revision = {
        "task": task_revision(task),
        "git": compact_git_anchor(spec_paths + code_paths + [ROADMAP_PATH.relative_to(ROOT).as_posix()]),
        "spec_digest": canonical_digest(spec_digests),
        "code_digest": code_paths_digest(code_paths),
        "graph": compact_graph_revision(graph),
    }
    return {
        "version": 1,
        "generated_at": now_iso(),
        "context_path": task_context_rel_path(task_id),
        "budget": {
            "target_tokens": 6000,
            "policy": "Use this packet first. Expand only listed specs/code/evidence when phase or stale revision requires exact source.",
        },
        "task": {
            "id": task_id,
            "title": str(task.get("title", task_id)).strip(),
            "status": str(task.get("status", "todo")).strip(),
            "phase": phase,
            "priority": str(task.get("priority", "medium")).strip(),
            "kind": str(task.get("kind", "task")).strip(),
            "summary": str(task.get("summary", "")).strip(),
            "labels": [str(value).strip() for value in task.get("labels", []) if str(value).strip()] if isinstance(task.get("labels"), list) else [],
            "goal": compact_task_goal(task),
            "delta": task.get("delta", {}) if isinstance(task.get("delta"), dict) else {},
        },
        "revision": revision,
        "specs": [compact_spec_contract(path, docs_by_path) for path in spec_paths],
        "code": {
            "paths": code_paths,
            "digest": revision["code_digest"],
            "expand": [{"read": path} for path in code_paths],
        },
        "evidence": latest_evidence,
        "expansion": {
            "task_json": (ROADMAP_TASKS_PATH / task_id / "task.json").relative_to(ROOT).as_posix(),
            "roadmap_state": ROADMAP_STATE_PATH.relative_to(ROOT).as_posix(),
            "status_state": STATUS_STATE_PATH.relative_to(ROOT).as_posix(),
            "graph": (META_ROOT / "graph.json").relative_to(ROOT).as_posix(),
        },
    }


def write_roadmap_folder_view(roadmap_items: list[dict[str, Any]], roadmap_state: dict[str, Any], docs: list[dict[str, Any]], graph: dict[str, Any]) -> None:
    ROADMAP_FOLDER_PATH.mkdir(parents=True, exist_ok=True)
    docs_by_path = {str(doc.get("path", "")).strip(): doc for doc in docs if str(doc.get("path", "")).strip()}
    runtime_tasks = roadmap_state.get("tasks", {}) if isinstance(roadmap_state.get("tasks"), dict) else {}
    task_index: list[dict[str, Any]] = []
    for task in roadmap_items:
        task_id = str(task.get("id", "")).strip()
        if not task_id:
            continue
        task_dir = ROADMAP_TASKS_PATH / task_id
        runtime_task = runtime_tasks.get(task_id, {}) if isinstance(runtime_tasks.get(task_id), dict) else {}
        context = build_task_context_packet(task, runtime_task, docs_by_path, graph)
        write_json(task_dir / "task.json", task)
        write_json(task_dir / "context.json", context)
        task_index.append({
            "id": task_id,
            "title": str(task.get("title", task_id)).strip(),
            "status": str(task.get("status", "todo")).strip(),
            "context_path": task_context_rel_path(task_id),
        })
    write_json(ROADMAP_FOLDER_PATH / "index.json", {
        "version": 1,
        "generated_at": now_iso(),
        "source": ROADMAP_PATH.relative_to(ROOT).as_posix(),
        "state_path": (ROADMAP_FOLDER_PATH / "state.json").relative_to(ROOT).as_posix(),
        "events_path": (ROADMAP_FOLDER_PATH / "events.jsonl").relative_to(ROOT).as_posix(),
        "task_context_root": ROADMAP_TASKS_PATH.relative_to(ROOT).as_posix(),
        "tasks": task_index,
    })
    write_json(ROADMAP_FOLDER_PATH / "state.json", roadmap_state)
    events_text = ROADMAP_EVENTS_PATH.read_text(encoding="utf-8") if ROADMAP_EVENTS_PATH.exists() else ""
    (ROADMAP_FOLDER_PATH / "events.jsonl").write_text(events_text, encoding="utf-8")


def main() -> None:
    META_ROOT.mkdir(parents=True, exist_ok=True)
    roadmap = read_roadmap_file(ROADMAP_PATH)
    if compact_roadmap_hot_set(roadmap):
        write_json(ROADMAP_PATH, roadmap)
    roadmap_items = roadmap_entries(roadmap)
    if ROADMAP_DOC_PATH is not None:
        ROADMAP_DOC_PATH.parent.mkdir(parents=True, exist_ok=True)
        ROADMAP_DOC_PATH.write_text(render_roadmap(roadmap_items), encoding="utf-8")

    research_collections = load_research_collections()
    docs = [parse_doc(path) for path in markdown_doc_files()]
    graph = build_graph(docs, research_collections, roadmap_items)

    write_json(META_ROOT / "graph.json", graph)
    if not (META_ROOT / "events.jsonl").exists():
        (META_ROOT / "events.jsonl").write_text("", encoding="utf-8")
    if not ROADMAP_EVENTS_PATH.exists():
        ROADMAP_EVENTS_PATH.write_text("", encoding="utf-8")
    if INDEX_PATH is not None:
        INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
        INDEX_PATH.write_text(render_index(docs, research_collections, roadmap_items), encoding="utf-8")
    lint_report = lint(docs, roadmap_items, research_collections)
    write_json(META_ROOT / "lint.json", lint_report)
    roadmap_state = build_roadmap_state(roadmap_items, graph, lint_report, read_jsonl(META_ROOT / "events.jsonl"))
    write_json(ROADMAP_STATE_PATH, roadmap_state)
    write_roadmap_folder_view(roadmap_items, roadmap_state, docs, graph)
    events = read_jsonl(META_ROOT / "events.jsonl")
    write_json(STATUS_STATE_PATH, build_status_state(docs, graph, roadmap_items, lint_report, roadmap_state, events))


if __name__ == "__main__":
    main()
