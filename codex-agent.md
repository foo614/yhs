# YS Heng Codex Agent Ruleset

This document defines the project-shared Codex behavior for the YS Heng MVP monorepo. It is designed to be referenced by the root `AGENTS.md` file so teammates get consistent behavior from the project directory layer.

Official alignment:

- Codex project instructions are loaded through `AGENTS.md` files discovered from the project root toward the current working directory.
- Command approval rules are represented by `.rules` files under a `rules/` folder beside an active Codex config layer. This document describes command boundaries and approval expectations, but it is not a `.rules` file.
- Markdown must stay plain and parse-safe: headings, bullets, fenced code blocks, and simple tables only.

## Outcome and simplest solution

- State the requested outcome, material constraints, and checkable completion criteria before non-trivial work. Skip formal planning for obvious fixes.
- Inspect the relevant source, nearby tests, and project instructions before editing. Preserve API/frontend contracts and unrelated user work.
- Challenge unclear or contradictory requirements when different interpretations change behavior, permissions, data, architecture, or acceptance criteria. Ask one focused question, explain the consequence, and recommend the simplest option. Continue independent work while awaiting a required answer.
- For minor details, state a reasonable assumption and proceed. Reuse decisions and approvals already given in the conversation.
- Prefer an existing component, flow, API client, or direct implementation. Introduce an abstraction, dependency, or configurable framework only when the requested behavior needs it; explain that need.
- Keep every changed line tied to the requested outcome. Avoid speculative features, unrelated cleanup, and broad rewrites.

## Repository map and skills

Use the skill catalog in `AGENTS.md`; load only the skills and reference sections needed for the task. The `.codex/skills/ysheng-*` files own domain guidance. Ecosystem skills under `.agents/skills/` are auxiliary and must preserve YS Heng architecture, contracts, and risk gates.

| Area | Path | Stack / domain skill |
| --- | --- | --- |
| Public app | `apps/frontoffice` | Next.js 16, React 19, TypeScript; `ysheng-frontoffice` |
| Operations portal | `apps/backoffice` | Vite, React 19, Ant Design/Pro Components, Vitest; `ysheng-backoffice` |
| API | `services/api` | .NET 10, EF Core, ASP.NET Identity, PostgreSQL; `ysheng-api` |
| Infrastructure | `infra` | Docker Compose, PowerShell verification/deployment; `ysheng-project` |
| References | `docs` | API, implementation, requirements, and runbooks; read relevant sections |

Local URLs and validation commands live in the domain skills. Project-shared behavior belongs in this file, `.codex/skills/`, `.codex/agents/`, and `docs/`, not personal global configuration.

## Repo-wide workflow routing

This is the shared model policy for all project and auxiliary workflows. Choose by scope and consequence; the primary session defaults to GPT-5.6 Sol at Medium when no explicit user selection overrides it. These shared defaults were verified against the installed CLI catalog. Desktop and CLI catalogs can differ; verify availability in the intended client before changing model IDs.

| Work | Model | Reasoning |
| --- | --- | --- |
| Bounded file discovery or straightforward documentation | `gpt-5.6-luna` | Low |
| Small implementation with clear behavior and existing patterns | `gpt-5.6-luna` | High |
| Features across several files or substantial debugging | `gpt-5.6-sol` | Medium |
| Independent correctness, UX, business-process, or security review | `gpt-5.6-sol` | High |
| Difficult architecture or an investigation blocked after focused attempts | `gpt-6-astra` when available; otherwise `gpt-5.6-sol` | Low for Astra; High for Sol; increase only when justified |

- Set both `model` and `model_reasoning_effort` in `.codex/agents/*.toml`; `.codex/config.toml` supplies primary and generic subagent defaults. Keep these settings aligned with this table.
- Respect the user's selected model. Markdown cannot switch an active session. Apply routing when selecting a supported session or subagent model; do not create extra chats or agents just to change models.
- Escalate only for a concrete reasoning limitation or consequential unresolved risk. Report the reason and any unavailable model/effort fallback. Do not default ordinary work to Max, XHigh, or Ultra.
- Evaluate efficiency by completed, verified work, including retries and coordination. More subagents can reduce elapsed time while increasing total tokens.
- Configuration semantics and supported settings: [official Codex subagent guidance](https://learn.chatgpt.com/docs/agent-configuration/subagents).

## Proportionate verification and token use

- Before adding any test case, including one in an existing file, identify a critical failure or serious regression that current coverage cannot detect. Critical examples include auth, permissions, money calculations, data integrity, public/private boundaries, and consequential workflow transitions. State the failure the test prevents.
- Prefer correcting or extending existing coverage. Create a new test file only when justified critical coverage cannot fit an existing suite. Preserve useful existing tests; test count alone is not a reason to remove them.
- Do not add tests that mirror implementation, assert prose or headings, or cover trivial copy, spacing, styling, or reversible presentation changes. Use existing checks and browser inspection for those changes.
- For bugs, reproduce the observable failure and verify the fix through the real behavior when practical. Use the narrowest relevant existing check first; run broader checks only for affected shared behavior, unresolved risk, or required CI/release gates.
- Once relevant checks pass, repeat or broaden them only after relevant changes, failures, or new evidence. Explain critical coverage gaps and verification that could not run.
- For documentation and skill edits, inspect instruction consistency, links, and the diff; validate changed configuration and skill metadata. Do not add tests for the wording.
- Read only relevant skills, sections, and source files. Use targeted searches and bounded output; reuse findings instead of repeating exploration. Keep plans and reports short.

Personal integrations such as external code search, web research, and hosted MCP services may be useful, but do not make required project behavior depend on teammate-specific API keys or global `~/.codex` configuration.

## Delegation and loop engineering

- Use the main agent alone for small tasks. For larger work, delegate only a bounded independent subtask or a justified independent review; normally use at most two concurrent subagents.
- Give each subagent a concrete question or deliverable, required context, scope or owned files, and a short result format. Prefer a small brief over copying the full conversation when it is sufficient.
- Reuse an existing subagent for related work. The main agent integrates its findings, resolves disagreements, verifies the result, and returns one combined response; do not repeat the same exploration or review without a reason.
- Subagents run in child agent threads. A separate thread does not isolate the filesystem: avoid overlapping edits, and tell workers to preserve others' changes. Independent feature work needs separate worktrees under the branching strategy.
- Create a standalone user-visible chat only when the user asks. Do not create one merely to delegate a subtask.

Use `docs/CODEX_LOOP_ENGINEERING.md` for automation prompts and durable loop state.

- Define the workflow in a project skill before scheduling it. Keep scheduled discovery read-only unless the user explicitly approves implementation.
- Run independent implementation loops in isolated worktrees. Keep maker/checker roles separate for non-trivial changes using one appropriate reviewer or `/review`; add a specialist only for distinct unresolved risk.
- Record durable decisions in repo-local docs or issue/PR systems, not personal global configuration.
- Loops retain every high-risk gate and the authorization requirements for staging, commits, pushes, pull requests, deployment, and destructive operations.

## Allowed actions

Codex may:

- Read project files needed to understand the requested task.
- Edit files under the repository when the user requests implementation.
- Update documentation and existing coverage when affected; add test cases only under the critical-coverage rule above.
- Run focused local verification needed for an authorized change. Preserve approval boundaries for commands that affect shared data, production, or destructive operations.
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

Ignore generated or installed directories unless needed for the task: `node_modules`, `.next`, `dist`, `bin`, and `obj`.

## High-risk review gates

Explain the risk and obtain explicit user approval before the following changes, unless the conversation already authorizes that specific scope:

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

## Domain implementation rules

- Backend: use `ysheng-api` for endpoint wiring, persistence, business invariants, and verification. Keep contracts aligned across TypeScript and C#; apply the critical-coverage rule when considering new xUnit cases.
- Back office: use `ysheng-backoffice` for API usage and Ant Design component choices. Always design mobile first, then adapt for useful tablet and desktop views. Preserve information, permitted actions, and validation across sizes; verify UX, spacing, and populated states.
- Keep the back office Ant Design-first. Introduce shadcn/ui only when the user explicitly requests a design-system migration. Check the installed Ant Design version before using documentation examples.
- Front office: use `ysheng-frontoffice` for Next.js App Router, public API routes, photos, and lead capture. Prioritize clear vehicle details, price, and practical sales copy while preserving public/private data boundaries.

## Infrastructure and deployment rules

Use `.codex/skills/ysheng-project/SKILL.md` for cross-stack and deployment tasks.

Follow `docs/BRANCHING_STRATEGY.md` for every branch, commit, pull request, merge, and production release. Work remaining only in a worktree or task branch is not complete and must be reported as unmerged and undeployed.

- Keep Docker Compose services aligned across PostgreSQL, API, worker, front office, and back office.
- Keep local default ports aligned with documented URLs unless the user requests alternate ports.
- Preserve healthcheck behavior for PostgreSQL, API readiness, front office, and back office.
- Keep production `.env` validation strict: no placeholder secrets, example domains, localhost public URLs, or trailing slashes for public URL values.
- Treat restore operations as destructive and require explicit confirmation.
- Report Docker Desktop or Linux engine failures as environment blockers when code-independent checks pass.

## Review, failures, and reporting

- Preserve subsystem style, domain types, enum spellings, API paths, validation shapes, and DTO fields. Use the existing API client rather than embedding fetch calls in UI components when it owns the flow.
- Review the final diff for requested behavior, repository conventions, unnecessary complexity, unrelated edits, and verification gaps. Keep docs aligned with changed public APIs, workflows, deployment, smoke behavior, and source requirements.
- Use domain skills for validation commands. When Docker is unavailable, use the relevant Docker-independent infra checks documented in `docs/IMPLEMENTATION.md` and report runtime proof separately.
- Read failures before retrying. Distinguish code, environment, dependency/network, permission, and missing-decision blockers. Retry only with new evidence or a changed approach; use scoped escalation only when the environment permits it.
- For implementation, report the outcome, changed files, checks actually run, material assumptions, and remaining limits. State clearly when checks were not run.
- For reviews, list actionable findings first by severity with file/line evidence. If none are found, say so and identify any residual verification gap.
- For blocked work, name the blocker and the next concrete action. Never claim a build, browser check, merge, or deployment passed without evidence from this run.
