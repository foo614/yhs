# Branching and Release Strategy

This repository uses short-lived task branches and pull requests into `main`. A change is not complete merely because it exists in a worktree, local commit, or remote branch.

## Source of truth

- `origin/main` is the only integration and production-release source of truth.
- Never deploy a task branch or a dirty working tree to production.
- Keep every task branch focused on one coherent change. Split unrelated work before review.
- Every feature, fix, refactor, and operational change must have a real Linear ticket before implementation begins.
- Bind the branch to that ticket by using the `codex/<linear-ticket>-<purpose>` format, for example `codex/foo-123-finance-filter-spacing`. Use the ticket key exactly as Linear provides it, normalized to lowercase in the branch name.
- Documentation-only emergency corrections may omit a Linear ticket only when the user explicitly authorizes the exception; record the reason in the pull request.

## Required workflow

1. Start from a current `origin/main` in a clean, isolated worktree.
2. Confirm the Linear ticket and create one short-lived task branch whose name contains that ticket key.
3. Make narrow commits whose messages describe the user-visible or operational result.
4. Run the focused tests for each behavior change, then the broader checks required by `codex-agent.md`.
5. Normally run a read-only Codex CLI review of the local branch diff without GitHub App, comment, push, merge, or deploy permissions. Resolve every merge-blocking finding and rerun affected checks. An explicit user instruction may temporarily pause model review to conserve usage; repository CI and security checks remain required.
6. Push the reviewed branch and open a pull request targeting `main`. Put the Linear ticket key in the pull-request title or description so the branch, review, and delivery record are traceable.
7. Resolve conflicts against the latest `origin/main`; rerun affected checks and, unless explicitly paused by the user, the local diff review after conflict resolution.
8. Obtain required review and wait for all required CI and security checks to pass. The local pre-PR review does not replace these protected checks.
9. Merge the pull request into `main`.
10. Verify the remote `main` contains the merged commit and the task branch has no intended commits left outside `main`.
11. Deploy only from the verified `main` revision using the documented production workflow.
12. Record separate evidence for merge, CI/security checks, deployment completion, public/readiness smoke checks, and protected-route behavior.
13. Delete or archive the task branch and remove its worktree after the merge and release evidence are complete.

## Completion rule

A requested production change is complete only when all applicable items below are true:

- the intended files are committed;
- the branch and pull request are linked to the correct Linear ticket;
- no requested change remains only in a dirty worktree;
- the task branch is pushed;
- the pull request is merged into `main`;
- required CI and security checks passed on the released code;
- production deployed the expected `main` revision;
- production smoke checks passed;
- remaining blockers or intentionally deferred work are recorded explicitly.

If the user requested implementation but did not request deployment, stop after a merge-ready pull request unless the task instructions say otherwise. Clearly report that the change is not yet in `main` or production.

## Dirty and shared worktrees

- Do not stage an entire dirty checkout with `git add -A`.
- Inspect `git status`, the staged diff, and the commit diff for every release.
- Stage only the files or hunks owned by the task.
- Preserve unrelated teammate and agent edits.
- When a shared checkout contains mixed work, create a clean worktree from current `origin/main` and transfer only the reviewed task changes.
- Exclude temporary captures, generated inspection artifacts, local environment files, credentials, and worktree folders from commits.

## Parallel work

- Give each concurrent task its own branch and worktree.
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
