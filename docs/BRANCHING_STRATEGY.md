# Branching and Release Strategy

This repository uses short-lived task branches and pull requests into `main`. A change is not complete merely because it exists in a worktree, local commit, or remote branch.

## Source of truth

- `origin/main` is the only integration and production-release source of truth.
- Never deploy a task branch or a dirty working tree to production.
- Keep every task branch focused on one coherent change. Split unrelated work before review.
- Use the `codex/` prefix for Codex-created branches, followed by the ticket or purpose, for example `codex/foo-123-finance-filter-spacing`.

## Required workflow

1. Start from a current `origin/main` in a clean, isolated worktree.
2. Create one short-lived task branch.
3. Make narrow commits whose messages describe the user-visible or operational result.
4. Run the focused tests for each behavior change, then the broader checks required by `codex-agent.md`.
5. Push the branch and open a pull request targeting `main`.
6. Resolve conflicts against the latest `origin/main`; rerun affected checks after conflict resolution.
7. Obtain required review and wait for all required CI and security checks to pass.
8. Merge the pull request into `main`.
9. Verify the remote `main` contains the merged commit and the task branch has no intended commits left outside `main`.
10. Deploy only from the verified `main` revision using the documented production workflow.
11. Record separate evidence for merge, CI/security checks, deployment completion, public/readiness smoke checks, and protected-route behavior.
12. Delete or archive the task branch and remove its worktree after the merge and release evidence are complete.

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
