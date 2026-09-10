---
name: ysheng-project
description: Work in the YS Heng MVP monorepo. Use for repository orientation, local commands, repo layout, deployment shape, verification steps, Docker Compose, Linear ticket execution, and cross-app changes.
---

# YS Heng Project

## Start here

- Treat the repository root as the workspace root.
- Read `AGENTS.md` and `codex-agent.md` before making project changes.
- Read `docs/IMPLEMENTATION.md` for the current implementation slice, local URLs, Docker notes, default admin, and deployment details.
- Ignore generated or installed directories unless the user asks otherwise: `node_modules`, `.next`, `dist`, `bin`, and `obj`.
- Do not rely on teammate-specific global `~/.codex` files for project behavior.

## Layout

- `apps/frontoffice`: public Next.js vehicle inventory and lead capture.
- `apps/backoffice`: Vite React operations portal using Ant Design and Pro Components.
- `services/api`: .NET 10 Minimal API, EF Core, PostgreSQL, ASP.NET Identity, uploads, audit log, worker, and business rules.
- `infra/docker-compose.yml`: local and VPS deployment shape for PostgreSQL, API, worker, front office, and back office.
- `docs`: API reference, implementation status, deployment runbook, requirements trace, and source requirement cross-checks.

## Local URLs

- Front office: `http://localhost:3000`
- Back office: `http://localhost:3001`
- API: `http://localhost:5000`

## Root commands

```powershell
npm install
npm run build
npm run lint
npm run dev:frontoffice
npm run dev:backoffice
```

## Linear tickets

When the user asks to get or implement a Linear ticket:

- Read the issue details before editing and prefer `codex-ready` issues for implementation.
- When creating or updating YS Heng Linear issues from Codex, set the assignee to `me` unless the user names a different owner.
- For implementation tickets, define done as local code/docs updated, focused validation run or explicitly blocked, Linear result comment posted, and the Linear issue state updated.
- Before the final response, use Linear issue update tooling to move completed work to `Done` or the team's completed equivalent, then re-read the issue and confirm the status is completed.
- If label updates are supported, replace `codex-ready` with `codex-done`; do not create missing labels unless the user asks.
- If the status update fails or a Linear permission prompt blocks it, report that blocker and the exact next action.

## Model and task routing

- Keep one implementation task, Linear ticket, branch, and worktree aligned. Use a user-visible Codex task when work is split into a separate feature so its progress remains easy to follow.
- Run implementation tasks in parallel only when their ticket scopes and owned files do not overlap and neither depends on the other's result. Keep work serial when tasks touch the same files, share a contract change, or use the same merge and production deployment chain.
- Use a lighter implementation model for focused UI changes, routine tests, and well-bounded fixes. Reserve Astra for complex cross-module design, finance or authorization behavior, difficult conflict resolution, and high-risk final review.
- Before opening a pull request, run a read-only Codex CLI review against the local branch diff. Resolve every merge-blocking finding and rerun the relevant checks before creating the pull request. This local review must not require the Codex GitHub App or permission to comment, push, or merge.
- After the pull request opens, require its repository CI and CodeQL checks to pass before merging to `main`; a successful local review does not replace these protected checks.
- After a production deployment and its smoke checks succeed, create and push a date-based Git tag on the exact deployed `main` commit. Use the tag as the durable release and rollback reference, and never tag a branch commit, an unverified deployment, or a different revision from the one production is running.
- Merge and deploy each completed feature through the repository branching strategy. Parallel work does not authorize combining unrelated tickets in one branch or deploying from a feature branch.

## Docker verification

Use from the workspace root when Docker Desktop is available with the Linux engine:

```powershell
docker compose -f infra/docker-compose.yml build
docker compose -f infra/docker-compose.yml up -d
.\infra\smoke-test.ps1
```

If Docker fails because the Linux engine is unavailable, report that as an environment blocker rather than a code failure.

## Cross-cutting rules

- Preserve the API/frontend contract when changing domain models, DTOs, API paths, validation shapes, or enum names.
- Keep public endpoints unauthenticated under `/api/public/*`.
- Keep back-office endpoints under `/api` protected by the `BackOffice` policy unless intentionally public.
- Keep finance/payment operations behind the `Finance` policy.
- Update tests and docs when changing business rules, upload limits, dashboard metrics, auth behavior, API contracts, deployment behavior, or smoke-test expectations.
