# Branching and Release Strategy

This repository uses short-lived task branches and pull requests into `main`. A change is not complete merely because it exists in a worktree, local commit, or remote branch.

## Source of truth

- `origin/main` is the only integration and production-release source of truth.
- Never deploy a task branch or a dirty working tree to production.
- Keep every task branch focused on one coherent change or release scope. Related sequential changes may share a branch when they are reviewed, released, and reverted together; split unrelated work before review.
- A tracker ticket is optional. Do not create, reopen, or update Linear issues for routine work; existing Linear keys in historical branches and records remain historical context only.
- Use a descriptive `codex/<purpose>` branch name, for example `codex/finance-filter-spacing`. Include an existing issue key only when it helps identify historical context; it is never required for a branch, commit, or pull request.

## Required workflow

1. Before switching branches, inspect the checkout for uncommitted or unrelated work. Reuse an appropriate existing checkout when its branch and ownership fit the task; create a separate worktree only when concurrent edits, mixed changes, or release isolation make reuse unsafe.
2. Start new work from current `origin/main` and create a short-lived descriptive task branch when the checkout does not already have a suitable branch.
3. Make narrow commits whose messages describe the user-visible or operational result.
4. Run the focused tests for each behavior change, then the broader checks required by `codex-agent.md`.
5. Normally run a read-only Codex CLI review of the local branch diff without GitHub App, comment, push, merge, or deploy permissions. Resolve every merge-blocking finding and rerun affected checks. An explicit user instruction may temporarily pause model review to conserve usage; repository CI and security checks remain required.
6. Push the reviewed branch and open a pull request targeting `main`. Describe the outcome and verification in the pull request; link a GitHub issue, design note, incident, or other repository context when one exists, but do not require a tracker reference.
7. Resolve conflicts against the latest `origin/main`; rerun affected checks and, unless explicitly paused by the user, the local diff review after conflict resolution.
8. Obtain required review and wait for all required CI and security checks to pass. The local pre-PR review does not replace these protected checks.
9. Merge the pull request into `main`.
10. Verify the remote `main` contains the merged commit and the task branch has no intended commits left outside `main`.
11. Deploy only from the verified `main` revision using the documented production workflow.
12. Record separate evidence for merge, CI/security checks, deployment completion, public/readiness smoke checks, and protected-route behavior.
13. After merge and release evidence are complete, clean up task branches and worktrees only when ownership is clear and removal is safe and authorized. Never delete user-owned or unrelated files to reclaim space.

## Completion rule

A requested production change is complete only when all applicable items below are true:

- the intended files are committed;
- no requested change remains only in a dirty worktree;
- the task branch is pushed;
- the pull request is merged into `main`;
- required CI and security checks passed on the released code;
- production deployed the expected `main` revision;
- production smoke checks passed;
- remaining blockers or intentionally deferred work are recorded explicitly.

If the user requested implementation but did not request deployment, stop after a merge-ready pull request unless the task instructions say otherwise. Clearly report that the change is not yet in `main` or production.

## Dirty and shared worktrees

- Inspect `git status` before switching branches or reusing a checkout.
- Do not stage an entire dirty checkout with `git add -A`.
- Inspect `git status`, the staged diff, and the commit diff for every release.
- Stage only the files or hunks owned by the task.
- Preserve unrelated teammate and agent edits.
- Prefer reusing a suitable checkout for related or sequential changes, especially work intended for the same release.
- When a shared checkout contains mixed work that cannot be separated safely, create a clean worktree from current `origin/main` and transfer only the reviewed task changes.
- Avoid duplicate dependency installations, build outputs, browser downloads, and other generated artifacts across checkouts. Reuse existing safe caches and run only the verification the task needs.
- Exclude temporary captures, generated inspection artifacts, local environment files, credentials, and worktree folders from commits.

## Parallel work

- Give independent concurrent tasks separate branches. Use separate worktrees when their edits, ownership, or validation would conflict; otherwise reuse a suitable checkout for related sequential work.
- Do not let multiple tasks accumulate indefinitely on one long-lived branch.
- Merge independent pull requests separately so each can be reviewed, reverted, and deployed safely.
- After another pull request changes overlapping files, update the remaining branch from `origin/main` and rerun affected verification.

## Release recovery

If unmerged work has accumulated:

1. Inventory commits and uncommitted files against `origin/main`.
2. Group changes by coherent behavior and ownership.
3. Exclude temporary and unfinished artifacts.
4. Build clean release branches from current `origin/main`.
5. Transfer and verify one group at a time.
6. Merge and deploy only reviewed groups; record anything left behind.

Never describe a branch deployment, local build, or successful test as proof that a change is present in `main` or production.
