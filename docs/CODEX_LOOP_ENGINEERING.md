# YS Heng Codex Loop Engineering

This document adapts loop engineering for the YS Heng repo. A loop is a repeatable Codex workflow that can discover work, isolate execution, verify results, and record state without depending on one long chat thread.

Use this as the project-shared operating guide for Codex automations, worktrees, subagents, and durable loop state.

## Principles

- Keep project behavior in repo-local files: `AGENTS.md`, `codex-agent.md`, `.codex/skills/`, `.codex/agents/`, and `docs/`.
- Define the method in a skill before scheduling it as an automation.
- Keep recurring loops read-only until a human approves a specific finding for implementation.
- Use a dedicated worktree or thread for implementation so parallel agents do not modify the same checkout.
- Split maker and checker roles for non-trivial work.
- Keep high-risk gates from `codex-agent.md` active for every loop.
- Record durable decisions in repo docs, GitHub issues, pull requests, or Codex automation triage, not in teammate-specific global config.

## Loop Components

| Component | YS Heng implementation |
| --- | --- |
| Discovery | `.codex/skills/ysheng-loop-triage/SKILL.md` |
| Project knowledge | `AGENTS.md`, `codex-agent.md`, `.codex/skills/ysheng-*` |
| Isolation | Codex app worktrees or one thread per approved finding |
| Review | `.codex/agents/ysheng-reviewer.toml`, `/review`, or a fresh review thread |
| Security review | `.codex/agents/ysheng-security-reviewer.toml` and `.codex/skills/ysheng-security-review/SKILL.md` |
| State | Codex Triage, GitHub issues/PRs, or a small repo doc when a loop needs shared state |
| Guardrails | `.codex/config.toml` hooks plus the high-risk gates in `codex-agent.md` |

## Approved Loops

### Engineering Triage

Use this as the first scheduled loop.

- Skill: `$ysheng-loop-triage`
- Cadence: weekday morning or weekly
- Environment: dedicated worktree
- Default action: report findings only
- Allowed inputs: git status, recent commits, CI or PR metadata when available, repo docs, tests, and source files
- Disallowed actions: file edits, staging, commits, pushes, Docker, deployment, database restore, backups, smoke tests, production data access, and secret handling

Suggested automation prompt:

```text
Use $ysheng-loop-triage. Read AGENTS.md, codex-agent.md, and docs/CODEX_LOOP_ENGINEERING.md. Inspect YS Heng engineering signals for actionable findings: failing or stale verification, likely API/client/doc drift, repeated guidance gaps, risky unverified changes, and high-risk surfaces that need human review. Do not edit files. Do not stage, commit, push, deploy, run Docker, run smoke tests, touch databases, or handle secrets. Report only findings with evidence, severity, owner skill, and the smallest useful validation command.
```

### CI Failure Triage

Use when GitHub Actions or local validation fails.

- Skill: `$ysheng-fix-ci`
- Environment: worktree if edits are expected
- Default action: identify root cause and propose or implement a focused fix only after the user asks for implementation
- Verification: rerun the smallest failing command first

### PR Review Feedback

Use when review comments or requested changes arrive.

- Skill: `$ysheng-address-review`
- Optional helper: `.agents/skills/code-review-testing/SKILL.md`
- Default action: inspect unresolved feedback, classify actionable items, and make focused edits only for approved comments

### Linear Ticket Delegation

Use when YS Heng work starts from a Linear issue.

- Integration: Codex for Linear
- Trigger: assign the issue to Codex or mention `@Codex` in an issue comment
- Repo pin: include `YHS` or the repository name in the comment when the issue context is ambiguous
- Assignee: keep YS Heng Linear issues assigned to `me` unless the user names a different owner
- Default action: create a Codex cloud task, post progress back to Linear, and produce a result summary or pull-request-ready change
- Completion action: after implementation or triage deliverables are done, update the Linear issue to `Done` or the team's completed state, then re-read the issue to confirm completion before reporting success
- Risk gate: tickets touching auth, finance, uploads, public data, persistence, deployment, secrets, or backups must ask for approval before implementation

Recommended issue labels:

- `codex-ready`: clear enough for Codex to pick up.
- `codex-triage`: needs Codex to inspect and propose next steps only.
- `codex-done`: completed and verified locally or in Codex Cloud.
- `codex-blocked`: needs a human decision before Codex can continue.
- `codex-risk-review`: likely high-risk; review only unless a human explicitly approves implementation.

Recommended `@Codex` comment:

```text
@Codex implement this in the YS Heng repo.

Follow AGENTS.md, codex-agent.md, and docs/CODEX_LOOP_ENGINEERING.md.
Use the matching ysheng-* skill.
Keep the change focused and open a pull-request-ready branch.
Do not deploy, touch databases, handle secrets, or change auth, finance, uploads, public data, persistence, deployment, backups, or role policies without asking for approval first.
Done when the smallest relevant validation passes and the Linear issue has been updated to a completed state.
```

For triage-only tickets:

```text
@Codex triage this in the YS Heng repo.

Use $ysheng-loop-triage. Do not edit files. Report severity, evidence, owner skill, smallest validation, and whether this is safe for Codex implementation.
```

Linear triage-rule setup:

1. In Linear, open `Settings`.
2. Select the YS Heng team under `Your teams`.
3. Enable `Triage` if it is not already enabled.
4. Add a triage rule for selected incoming issues.
5. Choose `Delegate` > `Codex`.
6. Start with `codex-ready` only; expand automation after the first few runs are reviewed.

### Security-Sensitive Review

Use for auth, finance, uploads, public data, persistence, deployment, secrets, backups, or role-policy changes.

- Skill: `$ysheng-security-review`
- Agent: `ysheng_security_reviewer`
- Default action: review and report. Implementation needs an explicit user request.

## Finding Format

Loop findings should use this shape:

```text
Severity: P0/P1/P2/P3
Title: Short finding title
Evidence: file path, line, command output, CI check, or PR reference
Why it matters: Concrete YS Heng risk
Owner skill: ysheng-api, ysheng-backoffice, ysheng-frontoffice, ysheng-fix-ci, ysheng-security-review, or ysheng-plan-change
Smallest validation: One focused command or manual check
Recommended next action: fix, review, defer, or close
```

If there are no findings, say that and archive the automation run.

## Implementation Flow

1. Triage loop reports a finding.
2. Human accepts, rejects, or asks for more detail.
3. Accepted finding gets its own thread or worktree.
4. Codex uses the matching YS Heng skill to implement the smallest fix.
5. Codex runs focused verification when allowed by the repo rules.
6. A separate reviewer pass checks correctness, security, and missing tests before merge or PR.
7. Repeated mistakes become updates to `codex-agent.md` or the relevant `.codex/skills/ysheng-*` file.

## Risk Gates

Do not automate these actions without explicit user approval:

- Auth, authorization, ASP.NET Identity, cookie, CORS, or role-policy changes.
- Finance permissions, reconciliation, payment validation, or staff-role workflows.
- Database schema, seed data, migrations, backup, restore, or PostgreSQL blob storage.
- Upload limits, MIME validation, document ownership, thumbnails, or download endpoints.
- Public API exposure or public frontend data boundaries.
- Docker Compose service wiring, deployment scripts, production env validation, smoke tests, or VPS operations.
- Secret, token, cookie, password, or private operational data handling.
- Git staging, commits, pushes, pull requests, destructive restores, or broad filesystem cleanup.

## Review Bandwidth

Keep concurrent implementation loops low. Two active worktrees is usually enough for this repo because the API, back office, front office, and docs share contracts. Prefer finishing and reviewing one finding before starting another that touches the same module.
