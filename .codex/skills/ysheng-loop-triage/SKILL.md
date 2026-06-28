---
name: ysheng-loop-triage
description: "Use when Codex needs read-only loop-engineering triage for the YS Heng repo: scheduled automation discovery, CI or guidance-drift checks, recent-change review, likely contract drift, or recurring engineering findings. Do not use for implementing fixes."
---

# YS Heng Loop Triage

## Overview

Run a bounded, read-only discovery loop for YS Heng engineering work. The output is an actionable triage report, not a patch.

## Required Context

Read these first:

- `AGENTS.md`
- `codex-agent.md`
- `docs/CODEX_LOOP_ENGINEERING.md`
- `.codex/skills/ysheng-project/SKILL.md`

Read a domain skill only when the finding clearly belongs to that domain:

- `ysheng-api` for backend/API/persistence/auth/upload/business-rule findings.
- `ysheng-backoffice` for operations portal findings.
- `ysheng-frontoffice` for public inventory, detail, photos, and lead-capture findings.
- `ysheng-fix-ci` for failing CI, build, lint, test, or smoke-check findings.
- `ysheng-security-review` for auth, finance, upload, public-data, persistence, deployment, secret, or backup risk.

## Allowed Work

- Inspect files, docs, tests, recent commits, current git status, and command output already available in the thread.
- Use read-only commands such as `git status`, `git diff --stat`, `git log`, `rg`, and file reads.
- Use connected GitHub or CI metadata when available and relevant.
- Produce findings with evidence and recommended validation.

## Prohibited Work

Do not:

- Edit files.
- Stage, commit, push, open pull requests, or change branches.
- Run Docker, deployment, backup, restore, database, smoke-test, or production commands.
- Handle secrets, cookies, passwords, private data, database dumps, or live operational data.
- Run broad build/test suites unless the user explicitly approved validation for this run.
- Turn speculative observations into findings without concrete evidence.

## Triage Workflow

1. Confirm the loop scope: daily triage, CI triage, guidance drift, recent-change review, or security-sensitive scan.
2. Gather the smallest useful context. Prefer repo docs, local skill files, recent diffs, and exact failing checks over broad scanning.
3. Classify signals:
   - Failing or stale validation.
   - API/client/docs contract drift.
   - Repeated guidance gaps that belong in `codex-agent.md` or a YS Heng skill.
   - High-risk changes lacking explicit approval or focused verification.
   - Likely bugs with concrete evidence.
4. Discard weak signals that do not have file, command, CI, PR, or documented evidence.
5. Report findings in priority order.
6. If there are no findings, say there are no actionable findings and stop.

## Finding Format

Use this format for every finding:

```text
Severity: P0/P1/P2/P3
Title: Short title
Evidence: File path, line, command output, CI check, or PR reference
Why it matters: Concrete YS Heng risk
Owner skill: ysheng-api, ysheng-backoffice, ysheng-frontoffice, ysheng-fix-ci, ysheng-security-review, or ysheng-plan-change
Smallest validation: One focused command or manual check
Recommended next action: fix, review, defer, or close
```

## Severity Guide

- `P0`: Likely production data loss, secret exposure, auth bypass, public private-data leak, destructive deploy/database risk, or broken release path.
- `P1`: Failing CI, broken critical workflow, high-risk unverified auth/finance/upload/deployment change, or clear API/client contract break.
- `P2`: Important regression risk, stale docs for changed behavior, missing focused tests for shared contracts, or repeated guidance drift.
- `P3`: Cleanup, low-risk follow-up, small doc improvement, or optional validation.

## Output Rules

- Findings first, ordered by severity.
- Include exact file paths when available.
- Keep summaries brief.
- Name validation that should be run later; do not claim it passed unless it was actually run in the current loop.
- When the next step needs implementation, recommend the matching YS Heng skill and a separate worktree or thread.

## Linear-backed runs

When the triage run is tied to a Linear issue:

- If tracker writes are not explicitly allowed, include the recommended Linear state or label in the report instead of changing the issue.
- If tracker writes are allowed and the issue has no assignee, set the Linear assignee to `me` unless the user names a different owner.
- If tracker writes are allowed, post the triage result to Linear, update the issue state to `Done` only when the triage deliverable is complete, then re-read the issue and confirm the completed state before the final response.
- If the issue is ready for implementation rather than done, recommend `codex-ready` and leave the issue open.
- If the issue needs a human decision, recommend `codex-blocked` and state the missing decision.
