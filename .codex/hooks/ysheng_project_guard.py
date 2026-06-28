#!/usr/bin/env python3
"""Project-local Codex hooks for the YS Heng repository."""

from __future__ import annotations

import json
import re
import sys
from pathlib import PurePosixPath


GENERATED_PATH_PARTS = {
    "node_modules",
    ".next",
    "dist",
    "bin",
    "obj",
}

GENERATED_PATH_PREFIXES = (
    "test-results/",
    "artifacts/",
    "backups/",
    "apps/frontoffice/out/",
    ".codex/playwright/",
    ".codex/run-logs/",
    ".codex/screenshots/",
)

SECRET_PATTERNS = (
    re.compile(r"sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}"),
    re.compile(r"\bsk-[A-Za-z0-9]{32,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
)

DESTRUCTIVE_COMMAND_PATTERNS = (
    (re.compile(r"\bgit\s+reset\s+--hard\b", re.IGNORECASE), "git reset --hard would discard worktree changes."),
    (re.compile(r"\bgit\s+clean\b(?=.*\s-[A-Za-z]*f)", re.IGNORECASE), "git clean with force would delete untracked work."),
    (re.compile(r"\bgit\s+checkout\s+--\b", re.IGNORECASE), "git checkout -- would overwrite local file changes."),
    (re.compile(r"\bgit\s+restore\s+(?:\.|:/|\*)(?:\s|$)", re.IGNORECASE), "git restore on broad paths would overwrite local file changes."),
    (re.compile(r"\brm\s+(?:-[A-Za-z]*[rf][A-Za-z]*[rf][A-Za-z]*|-[A-Za-z]*r\b\s+-[A-Za-z]*f\b|-[A-Za-z]*f\b\s+-[A-Za-z]*r\b)", re.IGNORECASE), "rm -rf is a destructive recursive delete."),
    (re.compile(r"\bRemove-Item\b(?=.*\b-Recurse\b)(?=.*\b-Force\b)", re.IGNORECASE), "Remove-Item -Recurse -Force is a destructive recursive delete."),
    (re.compile(r"\b(?:rd|rmdir)\s+/s\b", re.IGNORECASE), "rd/rmdir /s is a destructive recursive delete."),
    (re.compile(r"\bdocker\s+compose\b(?=.*\bdown\b)(?=.*\s-v\b)", re.IGNORECASE), "docker compose down -v would remove database volumes."),
    (re.compile(r"\bdocker\s+volume\s+(?:rm|prune)\b", re.IGNORECASE), "docker volume removal can delete persisted PostgreSQL data."),
    (re.compile(r"\b(?:drop\s+database|dropdb)\b", re.IGNORECASE), "Dropping a database is destructive."),
    (re.compile(r"\brestore-postgres\.ps1\b", re.IGNORECASE), "PostgreSQL restore is destructive and must be run manually with explicit confirmation."),
)

SENSITIVE_COMMAND_PATTERNS = (
    re.compile(r"\bdeploy-vps\.ps1\b", re.IGNORECASE),
    re.compile(r"\bdocker\s+compose\b", re.IGNORECASE),
    re.compile(r"\bsmoke-test\.ps1\b", re.IGNORECASE),
    re.compile(r"\bbackup-postgres\.ps1\b", re.IGNORECASE),
)

SENSITIVE_PATH_PREFIXES = (
    "infra/",
    "services/api/",
    "docs/api.md",
    "docs/deployment_runbook.md",
    "codex-agent.md",
    "agents.md",
)


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    event = read_event()

    if mode == "session-start":
        return session_start()
    if mode == "user-prompt-submit":
        return user_prompt_submit(event)
    if mode == "pre-tool-use":
        return pre_tool_use(event)

    return 0


def read_event() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def session_start() -> int:
    emit(
        {
            "hookSpecificOutput": {
                "hookEventName": "SessionStart",
                "additionalContext": (
                    "YS Heng repository guardrails: read AGENTS.md and codex-agent.md before planning, "
                    "editing, reviewing, or running commands; keep durable team behavior in repo-local files; "
                    "avoid destructive git, filesystem, database, or deployment actions unless the user explicitly "
                    "approves them; run focused verification after behavior changes."
                ),
            }
        }
    )
    return 0


def user_prompt_submit(event: dict) -> int:
    prompt = str(event.get("prompt", ""))
    if contains_secret(prompt):
        emit({"decision": "block", "reason": "Prompt appears to contain a real secret or private key. Remove the secret and try again."})
    return 0


def pre_tool_use(event: dict) -> int:
    tool_name = str(event.get("tool_name", ""))
    tool_input = event.get("tool_input", {})
    command = extract_command(tool_input)

    if contains_secret(command):
        deny("Tool input appears to contain a real secret or private key. Remove the secret before continuing.")
        return 0

    if tool_name == "apply_patch":
        return check_patch(command)

    if tool_name == "Bash":
        return check_bash(command)

    return 0


def check_patch(command: str) -> int:
    paths = patch_paths(command)
    generated = [path for path in paths if is_generated_path(path)]
    if generated:
        deny("Hook blocked edits to generated or ignored paths: " + ", ".join(generated[:5]) + ". Change source files instead.")
        return 0

    sensitive = [path for path in paths if is_sensitive_path(path)]
    if sensitive:
        add_context(
            "This patch touches YS Heng policy, API, deployment, or documentation surfaces. Keep the change surgical and update related docs/tests when behavior changes."
        )
    return 0


def check_bash(command: str) -> int:
    for pattern, reason in DESTRUCTIVE_COMMAND_PATTERNS:
        if pattern.search(command):
            deny("Hook blocked command: " + reason)
            return 0

    if any(pattern.search(command) for pattern in SENSITIVE_COMMAND_PATTERNS):
        add_context(
            "This command touches deployment, Docker, smoke, or database operations. Treat environment failures as blockers, not code failures, unless the output proves otherwise."
        )
    return 0


def extract_command(tool_input: object) -> str:
    if isinstance(tool_input, dict):
        command = tool_input.get("command")
        if isinstance(command, str):
            return command
        return json.dumps(tool_input, sort_keys=True)
    return str(tool_input)


def contains_secret(text: str) -> bool:
    return any(pattern.search(text) for pattern in SECRET_PATTERNS)


def patch_paths(command: str) -> list[str]:
    paths: list[str] = []
    for line in command.splitlines():
        for marker in ("*** Add File: ", "*** Update File: ", "*** Delete File: ", "*** Move to: "):
            if line.startswith(marker):
                normalized = normalize_repo_path(line[len(marker) :].strip())
                if normalized:
                    paths.append(normalized)
    return paths


def normalize_repo_path(path: str) -> str:
    path = path.strip().strip('"').strip("'").replace("\\", "/")
    if not path:
        return ""
    posix = PurePosixPath(path)
    parts = [part for part in posix.parts if part not in ("", ".")]
    if any(part == ".." for part in parts):
        return "../"
    return "/".join(parts).lower()


def is_generated_path(path: str) -> bool:
    parts = PurePosixPath(path).parts
    return (
        path == "../"
        or any(part in GENERATED_PATH_PARTS for part in parts)
        or any(path == prefix.rstrip("/") or path.startswith(prefix) for prefix in GENERATED_PATH_PREFIXES)
    )


def is_sensitive_path(path: str) -> bool:
    return any(path == prefix.rstrip("/") or path.startswith(prefix) for prefix in SENSITIVE_PATH_PREFIXES)


def deny(reason: str) -> None:
    emit(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        }
    )


def add_context(message: str) -> None:
    emit(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "additionalContext": message,
            }
        }
    )


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")))


if __name__ == "__main__":
    raise SystemExit(main())
