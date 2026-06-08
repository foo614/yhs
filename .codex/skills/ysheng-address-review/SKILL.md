---
name: ysheng-address-review
description: Address YS Heng pull request review feedback. Use when the user asks to handle PR comments, requested changes, code review feedback, unresolved review threads, or inline comments for this repository.
---

# YS Heng Address Review

## Overview

Convert review feedback into scoped fixes while preserving the original change intent and unrelated user work.

## Workflow

1. Read `AGENTS.md`, `codex-agent.md`, and the relevant domain skill.
2. Collect the exact review comments, requested changes, files, and line context.
3. Separate actionable defects from preferences, questions, and stale comments.
4. Implement only the accepted or clearly actionable fixes.
5. Re-run the narrow validation connected to the changed area when requested or needed.
6. Summarize each addressed comment and any comments that need user judgment.

## Review Priorities

- Preserve API/frontend contracts and enum spellings.
- Treat auth, finance, uploads, database, deployment, and public data exposure as high-risk.
- Prefer tiny targeted patches over unrelated cleanup.
- Do not resolve comments or push changes unless the user explicitly asks.

## GitHub Help

When the GitHub plugin or `gh` is available, use it to inspect unresolved review threads and CI state. If not, work from pasted comments and say what could not be inspected live.
