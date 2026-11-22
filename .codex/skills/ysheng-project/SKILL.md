---
name: ysheng-project
description: Work in the YS Heng MVP monorepo. Use for repository orientation, local commands, repo layout, deployment shape, verification steps, Docker Compose, repository workflow, and cross-app changes.
---

# YS Heng Project

## Start here

- Treat the repository root as the workspace root.
- Read `AGENTS.md` and `codex-agent.md` before making project changes.
- Read only the relevant sections of `docs/IMPLEMENTATION.md` when implementation status, runtime setup, or deployment evidence is needed. Do not load its full history for routine edits.
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

## Task tracking

- Linear is not an active YS Heng workflow tool. Do not create, reopen, assign, comment on, label, or status-update Linear issues.
- Treat existing Linear keys and links as historical context. Preserve them in old plans, commits, branches, and review records unless the user asks for a migration.
- Routine work does not need a tracker ticket. Use the user request, pull request, optional GitHub issue, or a small repository document as durable context when needed.
- Use descriptive `codex/<purpose>` branches, commit messages that state the result, and pull requests that summarize scope and verification.

## Model and task routing

- Keep each branch focused on one coherent change or release scope. Related sequential work intended for the same release may share a suitable checkout and branch when it will be reviewed and reverted together.
- Inspect the working tree before switching branches. Reuse an appropriate existing checkout by default; create a separate worktree only when concurrent edits, mixed ownership, or release isolation make reuse unsafe. Do not duplicate dependency installations or build outputs without a task-specific reason.
- Run implementation tasks in parallel only when their scopes and owned files do not overlap and neither depends on the other's result. Keep work serial when tasks touch the same files, share a contract change, or use the same merge and production deployment chain.
- Follow the model, delegation, and verification policies in `codex-agent.md`. Keep model IDs and effort defaults in `.codex/config.toml` and `.codex/agents/*.toml` aligned with that single policy.
- Before opening a pull request, normally run a read-only Codex CLI review against the local branch diff. Resolve every merge-blocking finding and rerun the relevant checks before creating the pull request. This local review must not require the Codex GitHub App or permission to comment, push, or merge. An explicit user instruction to pause model review temporarily overrides this step; required repository CI and CodeQL remain mandatory.
- After the pull request opens, require its repository CI and CodeQL checks to pass before merging to `main`; a successful local review does not replace these protected checks.
- After a production deployment and its smoke checks succeed, create and push a date-based Git tag on the exact deployed `main` commit. Use the tag as the durable release and rollback reference, and never tag a branch commit, an unverified deployment, or a different revision from the one production is running.
- Merge and deploy each completed feature through the repository branching strategy. Parallel work does not authorize combining unrelated changes in one branch or deploying from a feature branch.

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
- Keep affected contracts and documentation current. Reuse existing verification; justify every new test case under the critical-coverage policy in `codex-agent.md`, including cases added to existing suites.
