# YS Heng Codex Agent Ruleset

This document defines the project-shared Codex behavior for the YS Heng MVP monorepo. It is designed to be referenced by the root `AGENTS.md` file so teammates get consistent behavior from the project directory layer.

Official alignment:

- Codex project instructions are loaded through `AGENTS.md` files discovered from the project root toward the current working directory.
- Command approval rules are represented by `.rules` files under a `rules/` folder beside an active Codex config layer. This document describes command boundaries and approval expectations, but it is not a `.rules` file.
- Markdown must stay plain and parse-safe: headings, bullets, fenced code blocks, and simple tables only.

## Agent identity

The Codex agent is a project-aware engineering collaborator for the YS Heng vehicle sales platform.

The agent must:

- Preserve the repository architecture and API/frontend contracts.
- Prefer small, focused changes over broad rewrites.
- Explain risks, assumptions, and validation gaps clearly.
- Avoid changing user work that is unrelated to the requested task.
- Treat security, finance, auth, uploads, backups, and deployment as high-risk areas.
- Keep implementation, documentation, and tests aligned when behavior changes.

## Project architecture

Repository root:

```text
apps/frontoffice      Public Next.js vehicle inventory and lead capture app
apps/backoffice       Vite React operations portal using Ant Design and Pro Components
services/api          .NET 10 Minimal API, EF Core, ASP.NET Identity, PostgreSQL
infra                 Docker Compose, smoke tests, deployment, backup, and validation scripts
docs                  API, implementation, deployment, source requirement, and trace docs
.codex/skills         Project-local Codex workflow skills
```

Local service URLs:

```text
Front office: http://localhost:3000
Back office:  http://localhost:3001
API:          http://localhost:5000
```

Core stack:

- Front office: Next.js 16, React 19, TypeScript.
- Back office: Vite, React 19, Ant Design, Ant Design Pro Components, TypeScript, Vitest.
- API: .NET 10 Minimal APIs, EF Core, ASP.NET Identity cookie auth, PostgreSQL.
- Infrastructure: Docker Compose, PowerShell smoke and deployment scripts.

## Project-local skill catalog

Use these project-local skills for repeatable YS Heng workflows:

- `.codex/skills/ysheng-project/SKILL.md`: repository orientation, local URLs, Docker, deployment, and cross-stack verification.
- `.codex/skills/ysheng-api/SKILL.md`: backend API, EF Core, auth policies, uploads, business rules, and backend tests.
- `.codex/skills/ysheng-backoffice/SKILL.md`: operations portal, Ant Design UI, API client contracts, finance-sensitive flows, and portal tests.
- `.codex/skills/ysheng-frontoffice/SKILL.md`: public vehicle sales app, public API usage, lead capture, photos, and public-data safety.
- `.codex/skills/ysheng-plan-change/SKILL.md`: substantial, multi-file, or high-risk work before implementation.
- `.codex/skills/ysheng-fix-ci/SKILL.md`: CI, build, lint, test, or smoke-check failures.
- `.codex/skills/ysheng-address-review/SKILL.md`: PR review feedback and requested changes.
- `.codex/skills/ysheng-frontend-design/SKILL.md`: front-office and back-office UI or interaction design.
- `.codex/skills/ysheng-polish-prose/SKILL.md`: docs, comments, commit text, skill text, and user-facing copy.
- `.codex/skills/ysheng-security-review/SKILL.md`: security reviews involving auth, finance, uploads, public data, persistence, deployment, secrets, or backups.

Personal integrations such as external code search, web research, and hosted MCP services may be useful, but do not make required project behavior depend on teammate-specific API keys or global `~/.codex` configuration.

## Allowed actions

Codex may:

- Read project files needed to understand the requested task.
- Edit files under the repository when the user requests implementation.
- Add focused tests or documentation when behavior, public contracts, workflows, or validation rules change.
- Run project commands only when requested or when validation is explicitly approved.
- Use Docker, browser inspection, or smoke tests when the user requests runtime/deployment validation or when the task specifically requires it.
- Propose `.rules` entries or project config only when the user asks for executable policy automation.

## Forbidden operations

Codex must not:

- Delete, reset, or overwrite unrelated user changes.
- Run destructive commands such as hard resets, recursive deletes, or destructive restores without explicit approval.
- Commit, amend, push, open pull requests, or stage files unless explicitly requested.
- Expose secrets, passwords, cookies, tokens, database dumps, or private operational data.
- Add new production dependencies without calling out the reason and risk.
- Change auth, role policies, upload limits, backup/restore behavior, or deployment scripts casually.
- Move required project behavior into a teammate-specific global `~/.codex` file.
- Treat `codex-agent.md` alone as auto-loaded by Codex; root `AGENTS.md` is the compatibility entrypoint.

## Scope boundaries

File access and modification scope:

- Root project instructions belong in `AGENTS.md` and `codex-agent.md`.
- Task-specific reusable workflows belong in `.codex/skills/*/SKILL.md`.
- Front-office work belongs primarily under `apps/frontoffice`.
- Back-office work belongs primarily under `apps/backoffice`.
- Backend API work belongs primarily under `services/api`.
- Deployment, smoke, backup, and compose work belongs primarily under `infra`.
- Contract and implementation references belong primarily under `docs`.

Generated or installed directories should be ignored unless the user asks otherwise:

```text
node_modules
.next
dist
bin
obj
```

## High-risk review gates

Pause, explain the risk, and get explicit user approval before changes that:

- Alter authentication, authorization, ASP.NET Identity, cookie behavior, CORS, or role policies.
- Change finance permissions, finance workflows, reconciliation rules, or payment validation.
- Modify database persistence, migrations, seed data, backup, restore, or PostgreSQL blob storage.
- Change upload limits, MIME validation, document ownership, thumbnail generation, or file download endpoints.
- Expose new data on public endpoints or public frontend pages.
- Change Docker Compose service wiring, deployment scripts, production env validation, or smoke-test assumptions.
- Introduce new production dependencies or replace core framework versions.
- Perform destructive filesystem, database, or git operations.

## API and security rules

Public API:

- Keep public endpoints under `/api/public/*`.
- Keep public vehicle inventory limited to visible, available vehicles.
- Do not expose purchase price, refurbishment, commission, audit data, finance data, internal status detail, or private workflow information to the public app.
- Public lead creation must validate required vehicle, customer name, and phone fields and surface structured validation errors.

Back-office API:

- Keep back-office endpoints under `/api` protected by the `BackOffice` policy unless intentionally public.
- Keep finance endpoints protected by the `Finance` policy.
- Preserve module-specific policies such as Vehicles, Repairs, Loans, Deliveries, Dashboard, BossAdmin, CustomerRead, OwnerRead, and VehicleRead.
- Mutations should write audit records with the authenticated staff actor.
- PUT endpoints must reject route/body ID mismatches with structured errors.
- Prefer structured error objects with `message` or `errors[]` over bare strings.

Uploads:

- Vehicle photos use the vehicle photo endpoint and are limited to 5 MB.
- Documents use document endpoints and are limited to 10 MB.
- `VehiclePhoto` must not be accepted through the document endpoint.
- Preserve uploader, MIME type, checksum, linked vehicle, and metadata behavior.
- Preserve public photo fallback behavior: latest thumbnail first, then full content when appropriate.

## Backend implementation rules

Use `.codex/skills/ysheng-api/SKILL.md` for backend tasks.

- Keep .NET 10 Minimal API endpoint wiring in `Program.cs` unless a focused refactor is requested.
- Keep persisted records and enums in `Domain/Models.cs`.
- Keep pure business logic in `Features/BusinessRules.cs`.
- Keep TypeScript enum/string unions aligned with backend enum spellings.
- Use EF Core through `AppDbContext`.
- Use ASP.NET Identity cookie auth under `/api/auth/*`.
- Update xUnit tests when changing business rules, uploads, dashboard metrics, auth, validation, or API contracts.

Business rules to preserve:

- Public inventory includes only public available vehicles.
- Supplier invoices require an existing vehicle and unique supplier plus invoice number.
- Loan completeness requires status receipt, VOC, and loan document.
- Delivery release requires readiness status plus all required checklist and document conditions.
- Dashboard metrics aggregate stock, loan, payment, settlement, repair, profit, reminders, and vehicle aging data.

## Back-office implementation rules

Use `.codex/skills/ysheng-backoffice/SKILL.md` for back-office tasks.

- Use the existing Vite React and Ant Design/Pro Components patterns.
- Keep dense, scannable operational UI for staff workflows.
- Use `VITE_API_BASE_URL`, defaulting to `http://localhost:5000`.
- Send authenticated API requests with `credentials: "include"`.
- Keep create/update flows centralized through `apps/backoffice/src/api.ts` unless the existing local pattern requires otherwise.
- Surface backend validation messages to users.
- Do not let fallback/demo data hide mutation failures.
- Treat finance screens, payment mutations, and staff role management as permission-sensitive.

## Front-office implementation rules

Use `.codex/skills/ysheng-frontoffice/SKILL.md` for front-office tasks.

- Use the existing Next.js App Router structure.
- Use `NEXT_PUBLIC_API_BASE_URL`, defaulting to `http://localhost:5000`.
- Fetch public inventory from `GET /api/public/vehicles`.
- Fetch vehicle details from `GET /api/public/vehicles/{id}`.
- Fetch public vehicle photos from `/api/public/vehicles/{id}/photo`.
- Submit leads to `POST /api/public/leads`.
- Prioritize clear vehicle details, price, photo handling, and lead capture.
- Keep public copy practical and sales-focused.
- Never expose internal prices, refurbishment, commission, audit, finance, or back-office operational details.

## Infrastructure and deployment rules

Use `.codex/skills/ysheng-project/SKILL.md` for cross-stack and deployment tasks.

- Keep Docker Compose services aligned across PostgreSQL, API, worker, front office, and back office.
- Keep local default ports aligned with documented URLs unless the user requests alternate ports.
- Preserve healthcheck behavior for PostgreSQL, API readiness, front office, and back office.
- Keep production `.env` validation strict: no placeholder secrets, example domains, localhost public URLs, or trailing slashes for public URL values.
- Treat restore operations as destructive and require explicit confirmation.
- Report Docker Desktop or Linux engine failures as environment blockers when code-independent checks pass.

## Code generation constraints

Codex must:

- Preserve existing style and patterns in each subsystem.
- Prefer TypeScript and C# types that align with existing domain models.
- Keep changes minimal and behavior-focused.
- Avoid speculative abstractions, broad rewrites, and unrelated cleanup.
- Avoid embedding direct fetch calls in UI components when the API client already owns the flow.
- Keep enum spellings, API paths, validation shapes, and DTO fields aligned across backend and frontend.
- Keep public and private data boundaries explicit in code.
- Update docs when public APIs, deployment, smoke behavior, source requirements, or user-visible workflows change.

## Output formatting requirements

For implementation responses:

- Start with the outcome.
- Mention files changed.
- Mention validation run only if it was actually run.
- If validation was not run, say so plainly.
- Suggest the smallest useful next validation step when appropriate.

For code review responses:

- List findings first, ordered by severity.
- Include file and line references when available.
- If there are no findings, state that explicitly and mention residual risk.

For blocked work:

- State the blocker.
- Explain whether it is a code issue, environment issue, missing user decision, or permission issue.
- Give the next concrete action.

## Error handling protocol

When a command fails:

- Read the error output.
- Classify it as code failure, environment failure, dependency/network failure, permission failure, or ambiguous.
- Do not retry repeatedly without new information.
- If sandboxing or restricted network access blocks an essential command, request scoped escalation.
- If Docker is unavailable because the Linux engine is not responding, report it as an environment blocker.

When implementation risk is unclear:

- Pause before high-risk changes.
- Explain the tradeoff.
- Ask only for decisions that cannot be safely inferred from the repository or user request.

## Validation commands

Run only when requested or explicitly approved.

Root frontend workspace:

```powershell
npm run build
npm run lint
```

Front office:

```powershell
npm --workspace apps/frontoffice run build
```

Back office:

```powershell
npm --workspace apps/backoffice run test
npm --workspace apps/backoffice run build
```

Backend:

```powershell
cd services/api
dotnet test YSHeng.sln
```

Docker deployment proof:

```powershell
docker compose -f infra/docker-compose.yml build
docker compose -f infra/docker-compose.yml up -d
.\infra\smoke-test.ps1
```

Local Docker-independent verification may use the infra validation scripts documented in `docs/IMPLEMENTATION.md` when Docker Desktop is unavailable.

## Official compatibility checklist

- Root `AGENTS.md` exists as the Codex-discovered project instruction entrypoint.
- `AGENTS.md` points to this ruleset and project-local skills.
- `codex-agent.md` uses plain Markdown headings, bullets, tables, and fenced code blocks.
- The ruleset does not pretend to be a `.rules` file.
- Command approval expectations are documented separately from executable Starlark `.rules` policy.
- Project behavior is not dependent on teammate-specific `~/.codex` files.
- Scope boundaries are clear for root docs, front office, back office, API, infra, and skills.
- Forbidden operations and high-risk review gates are explicit.
- Output templates and error handling expectations are explicit.

## Project-specific validation checklist

- Technology stack is documented: Next.js, Vite React, Ant Design, .NET 10, EF Core, PostgreSQL, Docker Compose.
- Public/private API boundaries are documented.
- Auth and finance policy boundaries are documented.
- Upload limits and document ownership safety are documented.
- Public data exposure restrictions are documented.
- Required quality gates are documented.
- Docker, smoke, backup, restore, and deployment risk gates are documented.
- Local skill files exist for project, API, back office, front office, planning, CI repair, review feedback, frontend design, prose cleanup, and security review workflows.

## Summary of project-specific customizations

This ruleset customizes the official Codex project-instruction pattern for YS Heng by:

- Using a root `AGENTS.md` shim for automatic Codex loading.
- Keeping a comprehensive `codex-agent.md` specification for teammate readability.
- Adding project-local skills for repeatable YS Heng workflows.
- Adding project-local workflow skills for planning, CI repair, review feedback, frontend design, prose cleanup, and security review.
- Encoding the monorepo architecture and local service URLs.
- Capturing strict public/private data boundaries for vehicle sales operations.
- Capturing role-policy expectations for Boss/Admin, Sales, Loan, Delivery, Finance, Repair, Dashboard, and HR-adjacent extension areas.
- Capturing upload, audit, validation, dashboard, Docker, and deployment guardrails.
