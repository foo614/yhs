# YS Heng Codex Loop Engineering

This document adapts loop engineering for the YS Heng repo. A loop is a repeatable Codex workflow that can discover work, isolate execution, verify results, and record state without depending on one long chat thread.

Use this as the project-shared operating guide for Codex automations, worktrees, subagents, and durable loop state.

## Principles

- Keep project behavior in repo-local files: `AGENTS.md`, `codex-agent.md`, `.codex/skills/`, `.codex/agents/`, and `docs/`.
- Define the method in a skill before scheduling it as an automation.
- Keep recurring loops read-only until a human approves a specific finding for implementation.
- Use a dedicated worktree for independent implementation. Child agent threads share the workspace unless explicitly isolated; separate chats alone do not prevent overlapping edits.
- Split maker and checker roles for non-trivial work.
- Keep high-risk gates from `codex-agent.md` active for every loop.
- Record durable decisions in repo docs, GitHub issues, pull requests, or Codex automation triage, not in teammate-specific global config.

## Loop Components

| Component | YS Heng implementation |
| --- | --- |
| Discovery | `.codex/skills/ysheng-loop-triage/SKILL.md` |
| Project knowledge | `AGENTS.md`, `codex-agent.md`, `.codex/skills/ysheng-*` |
| Isolation | Codex app worktrees for independent implementation; bounded ownership within a shared task |
| Review | One appropriate `.codex/agents/` reviewer or `/review`; a new standalone chat only when requested |
| Security review | `.codex/agents/ysheng-security-reviewer.toml` and `.codex/skills/ysheng-security-review/SKILL.md` |
| State | Codex Triage, GitHub issues/PRs, or a small repo doc when a loop needs shared state |
| Guardrails | `.codex/config.toml` hooks plus the high-risk gates in `codex-agent.md` |

## Reusable Project Team

Keep these role definitions in `.codex/agents/` and reuse their names. The primary agent owns scope, coordination, integration, release authorization, and the combined user-facing result; it can handle small tasks without delegation.

| Agent | Responsibility | Use when |
| --- | --- | --- |
| `ysheng_explorer` | Read-only file, contract, and evidence mapping | A bounded codebase question needs discovery |
| `ysheng_implementer` | Approved changes in explicitly owned files | A coherent implementation can be delegated independently |
| `ysheng_reviewer` | Independent correctness and regression review | A non-trivial diff needs a checker |
| `ysheng_uiux_reviewer` | Read-only task flow, layout, and interaction review | Frontend work needs design input or visual acceptance |
| `ysheng_security_reviewer` | Read-only trust-boundary review | The change has a distinct auth, finance, file, data, or deployment risk |
| `ysheng_admin_process_reviewer` | Read-only dealership workflow and handoff review | The requested scope changes operational process or module responsibilities |

All profiles use the project's selected GPT-6.1 Sol model. Reasoning defaults and escalation policy live in `codex-agent.md`; the primary and generic subagent defaults live in `.codex/config.toml`. Keep at most two child agents active at once. Choose only the roles that add independent value, and serialize work that overlaps files or contracts.

For each delegation:

1. Inspect the agents already available in the current task. Continue or resume an addressable agent for the same workstream through the client's supported controls before creating a replacement. Do not send simultaneous independent assignments to one running agent.
2. Give a concise handoff: objective and authority, owned files/worktree, current revision and decisions, existing evidence, unresolved question, acceptance, and verification gaps. Do not copy an entire old conversation or repeat completed discovery.
3. Create a fresh instance of the same project role when the previous instance is unavailable, the scope is unrelated, or independent review requires a different checker. Record the useful handoff in the issue/PR when it must survive across chats. A saved role is a reusable configuration, not a permanently running agent or automatic cross-chat memory.
4. Preserve maker/checker independence. Reuse a reviewer for related follow-up review, but do not ask the implementation author to approve its own changes. For frontend work, treat phone/tablet/desktop task completion and visible states as primary evidence alongside relevant code checks.
5. Return one short integrated result to the user. Create a separate user-visible chat only when requested, not merely to use a specialist role.

Custom profiles inherit the parent's permissions; read-only role instructions do not create a separate sandbox. Do not add permission overrides to agent files or use role reuse to expand the user's authorization. Configuration changes apply when a client loads them; they do not switch the model of an already-running agent. See the [official Codex subagent guidance](https://learn.chatgpt.com/docs/agent-configuration/subagents).

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
3. Accepted independent implementation gets its own worktree; bounded subtasks may use child agents with explicit ownership.
4. Codex uses the matching YS Heng skill to implement the smallest fix.
5. Codex runs focused existing verification and adds cases only under the critical-coverage policy in `codex-agent.md`.
6. A separate reviewer checks non-trivial changes for correctness, relevant security risks, and critical coverage gaps before merge or PR. Do not request tests merely because code changed.
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

Follow the model, delegation, and token-use policies in `codex-agent.md`; the TOML files hold executable model and concurrency defaults. Small tasks stay with the main agent. For larger tasks, delegate only bounded independent work or a justified reviewer pass, and return short results to the main chat. Do not duplicate exploration or launch every specialist for each change.

Two active implementation worktrees are usually enough for this repo because the API, back office, front office, and docs share contracts. Prefer finishing and reviewing one finding before starting another that touches the same module.
